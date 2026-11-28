// Las caras de Jarvis: qué expresión ponen los ojos según lo que dice (frase por frase) y cómo baila cada canción.
// Lo que dice se lee con reglas (sin modelo, al instante): "está soleado" alegra, "mañana llueve" entristece,
// "¿te referís a…?" pone cara de duda. El estilo de una canción (alegre, triste, tranquila…) se le pregunta una vez
// a la inteligencia por su nombre y artista, y queda guardado.
const { leerJSON, guardarJSON, normalizar } = require('./config');

const CARAS = ['feliz', 'contento', 'triste', 'sorprendido', 'esceptico', 'preocupado', 'concentrado', 'guino', 'sueno', 'asombro'];
const ESTILOS = ['alegre', 'triste', 'tranquila', 'fuerza', 'drop', 'dembow'];

// De la más específica a la más general: la primera que coincide gana.
const REGLAS = [
  ['esceptico', (t, crudo) => /\?\s*$/.test(crudo) && /\b(te referis|te refieres|quisiste decir|queres decir|cual de|a cual|a quien|lo hago|lo mando|lo mandamos|es asi|entendi bien|seguro|confirmas|era eso)\b/.test(t)],
  ['sorprendido', (t) => /\b(aprendi|ya se que|ahora se|la proxima (vez )?(ya )?(lo hago|se)|lo guardo|lo anoto como|lo agendo como|me lo guardo|que bueno saberlo|no sabia)\b/.test(t)],
  ['asombro', (t) => /\b(guau|wow|increible|impresionante|record|tremend[oa]|espectacular)\b/.test(t)],
  ['sueno', (t) => /\b(buenas noches|a dormir|que descanses|hasta manana|me voy a dormir)\b/.test(t)],
  ['contento', (t) => /\b(de nada|cuando quieras|para eso estoy|me alegra|que lindo|jaja\w*|un gusto|gracias a vos)\b/.test(t)],
  ['preocupado', (t) => /\b(desconectad[oa]|sin internet|sin conexion|no responde|no contesta|cuidado|ojo con|bateria baja|se corto|a medias|ocupad[oa])\b/.test(t)],
  ['triste', (t) => /\b(llueve|lluvia|lloviendo|llovizna|tormenta|chaparron|granizo|nieve|frio polar|no pude|no encontre|no hay (nada|ningun)|no tengo|lamentablemente|perdon|lo siento|perdio|perdimos|se cancelo|malas noticias|no se pudo|no anda)\b/.test(t)],
  ['concentrado', (t) => /\b(un (segundo|momento|toque)|dame un|estoy (bajando|buscando|haciendo|grabando|armando)|lo estoy|ya lo (busco|hago)|bajando)\b/.test(t)],
  ['feliz', (t) => /\b(soleado|despejado|sol|lindo dia|linda (tarde|noche)|calido|agradable|genial|buenisimo|excelente|perfecto|listo|hecho|mandado|enviado|gano|ganamos|felicitaciones|feliz cumple|que bueno|buenas noticias|todo bien|anda bien)\b/.test(t)],
];

function caraDe(frase) {
  const crudo = String(frase || '').trim();
  if (!crudo) return '';
  const t = normalizar(crudo);
  for (const [cara, prueba] of REGLAS) if (prueba(t, crudo)) return cara;
  return '';
}

// Partir en frases para cambiar de cara a medida que habla (sin cortar números como "3,5" ni "Sr.").
function frases(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const partes = t.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [t];
  const out = [];
  for (const p of partes.map((x) => x.trim()).filter(Boolean)) {
    if (out.length && (p.length < 12 || /^[a-záéíóúñ0-9]/.test(p))) out[out.length - 1] += ` ${p}`; else out.push(p);
  }
  return out;
}

// ---------- Estilo de una canción (para bailar) ----------
let cache = null;
const leer = () => { if (!cache) { cache = leerJSON('estilos-canciones.json', {}); if (!cache || typeof cache !== 'object') cache = {}; } return cache; };
const claveCancion = (cancion, artista) => normalizar(`${artista || ''} - ${cancion || ''}`).slice(0, 160);
const pidiendo = new Map();

function estiloGuardado(cancion, artista) {
  if (!cancion) return '';
  return leer()[claveCancion(cancion, artista)] || '';
}
// preguntar: (mensajes) → { texto }; se usa el modelo que haya (si no hay ninguno, no pasa nada: baila por el sonido).
async function estiloDeCancion(cancion, artista, preguntar) {
  if (!cancion) return '';
  const k = claveCancion(cancion, artista);
  if (leer()[k]) return leer()[k];
  if (pidiendo.has(k)) return pidiendo.get(k);
  const p = (async () => {
    try {
      const r = await preguntar([
        { role: 'system', content: 'Clasificás canciones por su carácter para una animación. Respondé solo una palabra de esta lista: alegre, triste, tranquila, fuerza, electronica, urbana. (fuerza = rock, metal, trap o algo intenso; electronica = EDM, house, techno con drops; urbana = reggaetón, cumbia, dembow, dancehall; tranquila = balada suave, lo-fi, acústico calmo; triste = melancólica o desamor lenta; alegre = pop o algo arriba y feliz.)' },
        { role: 'user', content: `"${String(cancion).slice(0, 120)}"${artista ? ` de ${String(artista).slice(0, 80)}` : ''}` },
      ]);
      const w = normalizar(String((r && r.texto) || '')).match(/alegre|triste|tranquila|fuerza|electronica|urbana/);
      const estilo = w ? ({ electronica: 'drop', urbana: 'dembow' })[w[0]] || w[0] : '';
      if (estilo) {
        const c = leer(); c[k] = estilo;
        const claves = Object.keys(c); if (claves.length > 2000) for (const x of claves.slice(0, claves.length - 2000)) delete c[x];
        try { guardarJSON('estilos-canciones.json', c); } catch {}
      }
      return estilo;
    } catch { return ''; } finally { pidiendo.delete(k); }
  })();
  pidiendo.set(k, p);
  return p;
}

module.exports = { CARAS, ESTILOS, caraDe, frases, estiloDeCancion, estiloGuardado };
