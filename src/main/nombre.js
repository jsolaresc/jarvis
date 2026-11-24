// El nombre del asistente. Por defecto "Jarvis", pero cada uno lo llama como quiere (se elige al
// instalar y se cambia en Ajustes → Asistente → Básico). De acá sale:
//   - cómo se lo despierta por voz ("che <nombre>", "hey <nombre>, poné música"),
//   - las formas parecidas que el oído puede escribir al transcribir ese nombre,
//   - y si sirve el detector clásico "Hey Jarvis" (que solo conoce esa palabra, en inglés).
const { leerConfig, normalizar } = require('./config');

const POR_DEFECTO = 'Jarvis';

function actual() {
  try { return String(leerConfig().nombre || '').trim() || POR_DEFECTO; } catch { return POR_DEFECTO; }
}
const plano = (n) => normalizar(n).replace(/ /g, '');
// ¿El nombre elegido es "Jarvis"? (entonces vale todo lo afinado para esa palabra, y el detector clásico)
const esJarvis = (n = actual()) => { const p = plano(n); return !p || p === 'jarvis'; };
// Cuántas palabras tiene el nombre ("Señor Robot" = 2).
const palabras = (n = actual()) => Math.max(1, normalizar(n).split(' ').filter(Boolean).length);

// Formas en que un modelo de voz a texto suele escribir un nombre que suena igual en castellano:
// j/y/ll/h/g al principio, b/v, s/z, c/k/qu, la h muda, letras dobles y la "s" final que se come.
const REGLAS = [
  [/^j/, ['y', 'll', 'h', 'g', 'ch', 'dj']], [/^y/, ['j', 'll', 'i']], [/^ll/, ['y', 'j']], [/^h/, ['', 'j']], [/^g(?=[ei])/, ['j', 'y']],
  [/v/g, ['b']], [/b/g, ['v']], [/z/g, ['s']], [/s/g, ['z']], [/c(?=[ei])/g, ['s', 'z']], [/k/g, ['c', 'qu']], [/qu/g, ['k']],
  [/c(?=[aou])/g, ['k']], [/w/g, ['u', 'gu']], [/x/g, ['ks', 's']], [/y$/g, ['i']], [/i$/g, ['y']], [/ph/g, ['f']], [/th/g, ['t']],
  [/(.)\1/g, ['$1']], [/s$/, ['']], [/h/g, ['']], [/ee/g, ['i']], [/oo/g, ['u']],
];
function variantes(base) {
  const salida = new Set([base]);
  const aplicar = (t) => {
    const nuevas = [];
    for (const [re, reemplazos] of REGLAS) {
      if (!new RegExp(re.source).test(t)) continue;
      for (const r of reemplazos) { const v = t.replace(re, r); if (v && v !== t && v.length >= 2) nuevas.push(v); }
    }
    return nuevas;
  };
  const primera = aplicar(base);
  primera.forEach((v) => salida.add(v));
  for (const v of primera) for (const w of aplicar(v)) { if (salida.size > 160) break; salida.add(w); }
  return [...salida];
}

let cache = { nombre: null, formas: null };
// Las formas seguras del nombre elegido (sin espacios, aplanadas). Para "Jarvis" devuelve null: comandos.js
// ya tiene su lista afinada a mano.
function formas(n = actual()) {
  if (esJarvis(n)) return null;
  if (cache.nombre !== n) cache = { nombre: n, formas: variantes(plano(n)) };
  return cache.formas;
}

// Para sacar "hey <nombre>" del principio de un texto ya aplanado (normalizar()).
const SALUDO = '(?:(?:hey|ey|oye|che|hola|ok|okey) )?';
function quitarNombre(textoPlano) {
  const t = String(textoPlano || '');
  const jarvis = new RegExp(`^${SALUDO}(?:jarvis|yarvis|yarbis|jarbis|charvis)\\b ?`);
  if (esJarvis()) return t.replace(jarvis, '');
  const n = normalizar(actual());
  const escapar = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const conEspacios = new RegExp(`^${SALUDO}${escapar(n)}\\b ?`);
  if (conEspacios.test(t)) return t.replace(conEspacios, '');
  // También una forma parecida, como palabra suelta al principio.
  const m = new RegExp(`^${SALUDO}(\\S+) ?`).exec(t);
  if (m && (formas() || []).includes(m[1])) return t.slice(m[0].length);
  return t;
}

module.exports = { POR_DEFECTO, actual, esJarvis, palabras, formas, variantes, quitarNombre, plano };
