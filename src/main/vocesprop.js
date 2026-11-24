// Voces propias: juntar audios (grabados leyendo un guion, o subidos: MP3, m4a, WhatsApp…), dejarlos listos para entrenar un
// modelo de voz Piper en la placa de video de esta PC, y después cargar la voz entrenada para que Jarvis hable con ella.
//
// Cada proyecto vive en datos/entrenar-voz/<id>/:
//   proyecto.json   nombre, voz de espeak, contador
//   clips.json      cada frase: { id, archivo, texto, segundos, origen: 'guion'|'subido', fuente, guion (n° de frase), revisar }
//   clips/NNNN.wav  audio de cada frase (22.050 Hz, mono, 16 bits: lo que pide Piper)
//   entrenamiento/  lo que arma "Armar el set": audio/, metadata.csv, entrenar.sh, entrenar.bat, LEEME.txt (y resultado/ al terminar)
const fs = require('fs');
const path = require('path');
const { DATOS } = require('./config');
const clips = require('./clips');
const modelos = require('./modelos');
const zip = require('./zip');

const RAIZ = process.env.JARVIS_VOCES_PROPIAS || path.join(DATOS, 'entrenar-voz');
const HZ = 22050;
const ESPEAK = 'es-419'; // el español de América (el mismo de las voces Piper en castellano de Jarvis)
// Commit del entrenador oficial de Piper contra el que se escribieron los comandos del script (se leyó su código y su guía).
const COMMIT_PIPER = '46c3c71f9155c4f5bfb887845f524433fd02febc';
const BASE_CKPT = 'https://huggingface.co/datasets/rhasspy/piper-checkpoints/resolve/main/es/es_MX/ald/medium/epoch%3D9999-step%3D1753600.ckpt';
const MIN_FRASE = 1.0; const MAX_FRASE = 15.0; // segundos que acepta el entrenamiento por frase

// Cuánto audio hace falta (referencias para el cartel de avance). Con el modelo base de Piper no se entrena de cero: se "afina".
const NIVELES = [
  { id: 'prueba', nombre: 'Para probar', minutos: 10, frases: 120, texto: 'Suena parecido, con errores y pronunciación torpe.' },
  { id: 'bueno', nombre: 'Recomendado', minutos: 30, frases: 350, texto: 'Se reconoce bien la voz y se entiende casi todo.' },
  { id: 'muybueno', nombre: 'Muy bueno', minutos: 60, frases: 700, texto: 'Natural, con buena entonación en frases nuevas.' },
  { id: 'excelente', nombre: 'Excelente', minutos: 120, frases: 1400, texto: 'Lo mejor que da este método en una PC.' },
];
const nivelDe = (segundos) => { let n = null; for (const x of NIVELES) if (segundos >= x.minutos * 60) n = x; return n; };

const trabajoActual = { id: '', fase: '', hecho: 0, total: 0, mensaje: '', error: '', activo: false };
let avisar = () => {};
let transcriptor = null; // (Int16Array a 16 kHz) => Promise<string>; en las pruebas se reemplaza
function configurar(f = {}) { if (f.avisar) avisar = f.avisar; if (f.transcribir) transcriptor = f.transcribir; }
function publicar() { try { avisar({ ...trabajoActual }); } catch {} }
function trabajo(cambios) { Object.assign(trabajoActual, cambios); publicar(); }

// ---------- Guion ----------
let guionCache = null;
function guion() {
  if (!guionCache) guionCache = fs.readFileSync(path.join(__dirname, 'guion-voz.txt'), 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return guionCache;
}
// El guion para mandarle a otra persona: partes de unas 60 frases, con indicaciones para grabar.
function guionParaEnviar({ nombre = '', porParte = 60 } = {}) {
  const frases = guion();
  const partes = Math.ceil(frases.length / porParte);
  const l = [];
  l.push(`Guion para grabar una voz${nombre ? ` (${nombre})` : ''}`);
  l.push('');
  l.push('Cómo grabar (importa mucho para que salga bien):');
  l.push('  1. Buscá un lugar silencioso, sin eco, sin ventilador ni música de fondo. Un placard con ropa o un cuarto con alfombra suena mejor que una cocina.');
  l.push('  2. Poné el celular o el micrófono a unos 20 centímetros de la boca y no lo muevas.');
  l.push('  3. Leé cada frase con tu voz natural, como si le hablaras a alguien. Ni muy rápido ni actuando.');
  l.push('  4. Hacé una pausa de un par de segundos entre frase y frase (se usa para cortar los audios solo).');
  l.push('  5. Si te equivocás, quedate callado un segundo y repetí la frase completa: se descarta lo malo.');
  l.push('  6. Grabá cada PARTE como un solo audio (de unos 5 minutos). Sirve MP3, M4A, WAV o el audio de WhatsApp.');
  l.push('  7. Mandá los audios de todas las partes. Cuantas más partes, mejor sale la voz.');
  l.push('');
  l.push(`Son ${frases.length} frases en ${partes} partes.`);
  for (let p = 0; p < partes; p++) {
    l.push('');
    l.push(`=== PARTE ${p + 1} de ${partes} ===`);
    frases.slice(p * porParte, (p + 1) * porParte).forEach((f, i) => l.push(`${p * porParte + i + 1}. ${f}`));
  }
  l.push('');
  return l.join('\r\n');
}

// ---------- Proyectos ----------
const dirDe = (id) => path.join(RAIZ, id);
const archivoProyecto = (id) => path.join(dirDe(id), 'proyecto.json');
const archivoClips = (id) => path.join(dirDe(id), 'clips.json');
const leer = (f, defecto) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return defecto; } };
const escribir = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp`; fs.writeFileSync(t, JSON.stringify(d, null, 1)); fs.renameSync(t, f); };
const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

function existe(id) { return /^[a-z0-9-]+$/.test(String(id || '')) && fs.existsSync(archivoProyecto(id)); }
function exigir(id) { if (!existe(id)) throw new Error('Esa voz no existe.'); return leer(archivoProyecto(id), {}); }

function resumen(id) {
  const p = leer(archivoProyecto(id), null);
  if (!p) return null;
  const cs = leer(archivoClips(id), []);
  const segundos = cs.reduce((n, c) => n + (c.segundos || 0), 0);
  const delGuion = new Set(cs.filter((c) => Number.isInteger(c.guion)).map((c) => c.guion));
  const nivel = nivelDe(segundos);
  const sig = NIVELES.find((n) => segundos < n.minutos * 60) || null;
  return { id, nombre: p.nombre, creado: p.creado, clips: cs.length, segundos: Math.round(segundos), frasesDelGuion: delGuion.size, nivel: nivel ? nivel.id : '', siguiente: sig ? { nombre: sig.nombre, falta: Math.max(0, Math.ceil(sig.minutos * 60 - segundos)) } : null, voz: p.voz || '' };
}
function listar() {
  fs.mkdirSync(RAIZ, { recursive: true });
  return fs.readdirSync(RAIZ).filter((id) => existe(id)).map(resumen).filter(Boolean).sort((a, b) => b.creado - a.creado);
}
const ESPEAKS = ['es-419', 'es']; // es-419 = español de América (incluye el rioplatense); es = español de España (con ce/ci/z como /θ/)
function crear(nombre, { espeak = ESPEAK } = {}) {
  if (!ESPEAKS.includes(espeak)) throw new Error('Esa pronunciación no la conozco.');
  const limpio = String(nombre || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!limpio) throw new Error('Ponele un nombre a la voz.');
  let id = slug(limpio) || 'voz'; let n = 1; const base = id;
  while (fs.existsSync(dirDe(id))) id = `${base}-${++n}`;
  fs.mkdirSync(path.join(dirDe(id), 'clips'), { recursive: true });
  escribir(archivoProyecto(id), { id, nombre: limpio, creado: Date.now(), espeak, siguiente: 1 });
  escribir(archivoClips(id), []);
  return resumen(id);
}
function borrar(id) { exigir(id); fs.rmSync(dirDe(id), { recursive: true, force: true }); }
function renombrar(id, nombre) {
  const p = exigir(id); const limpio = String(nombre || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!limpio) throw new Error('Ponele un nombre a la voz.');
  p.nombre = limpio; escribir(archivoProyecto(id), p); return resumen(id);
}
function proyecto(id) {
  const p = exigir(id);
  const cs = leer(archivoClips(id), []);
  const hechas = new Map(cs.filter((c) => Number.isInteger(c.guion)).map((c) => [c.guion, c.id]));
  const frases = guion().map((texto, i) => ({ n: i, texto, clip: hechas.get(i) || 0 }));
  return { ...resumen(id), espeak: p.espeak, carpeta: dirDe(id), clipsLista: cs.map((c) => ({ ...c })), guion: frases, niveles: NIVELES, trabajo: { ...trabajoActual }, armado: fs.existsSync(path.join(dirDe(id), 'entrenamiento', 'metadata.csv')), resultado: fs.existsSync(path.join(dirDe(id), 'entrenamiento', 'resultado', 'voz.onnx')) };
}

// ---------- Audio ----------
const filtroFrase = 'highpass=f=70,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2,loudnorm=I=-22:TP=-2:LRA=8,aresample=22050';
async function ffmpeg() { return clips.asegurarFfmpeg(); }
function correr(ruta, args, espera = 10 * 60 * 1000) { return clips.correrFfmpeg(ruta, args, { espera }); }

function segundosDeWav(archivo) {
  try { const st = fs.statSync(archivo); return Math.max(0, (st.size - 44) / (HZ * 2)); } catch { return 0; }
}
function nuevoClip(id, { texto, origen, fuente = '', guion: g = null, revisar = false }, wavOrigen) {
  const p = leer(archivoProyecto(id), {});
  const cs = leer(archivoClips(id), []);
  const n = p.siguiente || cs.length + 1;
  const archivo = `${String(n).padStart(4, '0')}.wav`;
  fs.mkdirSync(path.join(dirDe(id), 'clips'), { recursive: true });
  fs.renameSync(wavOrigen, path.join(dirDe(id), 'clips', archivo));
  const clip = { id: n, archivo, texto: String(texto || '').trim(), segundos: Math.round(segundosDeWav(path.join(dirDe(id), 'clips', archivo)) * 100) / 100, origen, fuente, guion: g, revisar, creado: Date.now() };
  cs.push(clip);
  p.siguiente = n + 1;
  escribir(archivoProyecto(id), p); escribir(archivoClips(id), cs);
  return clip;
}

// Una frase grabada leyendo el guion (bytes: el WAV que graba la ventana). Si esa frase ya estaba, la reemplaza.
async function agregarGrabacion(id, bytes, { texto, guion: g = null } = {}) {
  exigir(id);
  const buf = Buffer.from(bytes);
  const textoFinal = String(texto || (Number.isInteger(g) ? guion()[g] : '') || '').trim();
  if (!textoFinal) throw new Error('Falta el texto de la frase.');
  if (buf.length < 2000) throw new Error('No se grabó nada.');
  const ff = await ffmpeg();
  const tmp = path.join(dirDe(id), `entrada-${Date.now()}.wav`);
  const salida = path.join(dirDe(id), `salida-${Date.now()}.wav`);
  fs.writeFileSync(tmp, buf);
  try {
    await correr(ff, ['-y', '-v', 'error', '-i', tmp, '-ac', '1', '-ar', String(HZ), '-af', filtroFrase, '-c:a', 'pcm_s16le', salida], 120000);
    const seg = segundosDeWav(salida);
    if (seg < 0.6) throw new Error('No se oyó nada en la grabación (revisá el micrófono).');
    if (seg > 30) throw new Error('La grabación es demasiado larga para una frase.');
    if (Number.isInteger(g)) { const viejo = leer(archivoClips(id), []).find((c) => c.guion === g); if (viejo) quitarClip(id, viejo.id); }
    return nuevoClip(id, { texto: textoFinal, origen: 'guion', guion: g }, salida);
  } finally { fs.rmSync(tmp, { force: true }); fs.rmSync(salida, { force: true }); }
}

// ---------- Cortar un audio largo en frases ----------
// Salida de ffmpeg con silencedetect -> [{ inicio, fin }] (silencios, en segundos).
function parsearSilencios(texto, duracion = 0) {
  const lista = []; let ini = null;
  for (const l of String(texto).split(/\r?\n/)) {
    let m = /silence_start: (-?[\d.]+)/.exec(l); if (m) { ini = Math.max(0, parseFloat(m[1])); continue; }
    m = /silence_end: ([\d.]+)/.exec(l); if (m && ini !== null) { lista.push({ inicio: ini, fin: parseFloat(m[1]) }); ini = null; }
  }
  if (ini !== null && duracion > ini) lista.push({ inicio: ini, fin: duracion });
  return lista;
}
// De los silencios a los tramos hablados, y de ahí a frases de entre `min` y `max` segundos (juntando los tramos cortos).
function trozosDe(silencios, duracion, { min = 2.5, ideal = 5, max = 14, relleno = 0.2, minimoHablado = 0.7 } = {}) {
  const hablados = []; let cursor = 0;
  for (const s of silencios) { if (s.inicio - cursor >= minimoHablado) hablados.push({ ini: cursor, fin: s.inicio }); cursor = Math.max(cursor, s.fin); }
  if (duracion - cursor >= minimoHablado) hablados.push({ ini: cursor, fin: duracion });
  const frases = [];
  for (let i = 0; i < hablados.length; i++) {
    let actual = { ...hablados[i] };
    while (i + 1 < hablados.length && (actual.fin - actual.ini < ideal || actual.fin - actual.ini < min) && hablados[i + 1].fin - actual.ini <= max) { actual.fin = hablados[i + 1].fin; i++; }
    frases.push(actual);
  }
  return frases.map((f) => ({ inicio: Math.max(0, f.ini - relleno), fin: Math.min(duracion, f.fin + relleno), largo: f.fin - f.ini }));
}

// --- Parecido entre lo que se entendió y las frases del guion (para ponerles el texto exacto) ---
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
function distancia(a, b) {
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const parecido = (a, b) => { const x = normalizar(a); const y = normalizar(b); const largo = Math.max(x.length, y.length); return largo ? 1 - distancia(x, y) / largo : 0; };
// Devuelve { n, texto, similitud } de la frase del guion que más se parece, o null.
function buscarEnGuion(texto, { umbral = 0.8, ya = new Set() } = {}) {
  let mejor = null;
  guion().forEach((f, n) => { const s = parecido(texto, f); if (s >= umbral && (!mejor || s > mejor.similitud + (ya.has(n) ? -0.05 : 0))) mejor = { n, texto: f, similitud: s }; });
  return mejor;
}

async function transcribirTramo(ff, wav, inicio, fin) {
  const dur = Math.max(0.2, fin - inicio);
  const pcm = await new Promise((ok, mal) => {
    const { spawn } = require('child_process');
    const h = spawn(ff, ['-v', 'error', '-ss', String(inicio), '-t', String(dur), '-i', wav, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], { windowsHide: true });
    const trozos = []; h.stdout.on('data', (d) => trozos.push(d)); h.on('error', mal); h.on('close', () => ok(Buffer.concat(trozos)));
  });
  const enteros = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length - (pcm.length % 2)));
  if (!transcriptor) throw new Error('No hay cómo pasar el audio a texto.');
  return String(await transcriptor(enteros) || '').trim();
}

// Sube audios (MP3, m4a, wav, ogg, WhatsApp…): cada uno se corta en frases por los silencios y se pasa a texto en esta PC.
// Si se parecen a una frase del guion, se les pone el texto exacto del guion. Trabaja de fondo; se sigue por `trabajoActual`.
async function importarAudios(id, rutas, { modo = 'auto' } = {}) {
  exigir(id);
  if (trabajoActual.activo) throw new Error('Ya estoy procesando audios; esperá a que termine.');
  const lista = (rutas || []).map(String).filter((r) => fs.existsSync(r));
  if (!lista.length) throw new Error('No encontré los archivos de audio.');
  trabajo({ id, activo: true, fase: 'Preparando…', hecho: 0, total: lista.length, mensaje: '', error: '' });
  const resultado = { archivos: 0, frases: 0, delGuion: 0, descartadas: 0, errores: [] };
  try {
    const ff = await ffmpeg();
    const tmpDir = path.join(dirDe(id), 'tmp'); fs.mkdirSync(tmpDir, { recursive: true });
    const usadas = new Set(leer(archivoClips(id), []).filter((c) => Number.isInteger(c.guion)).map((c) => c.guion));
    for (let i = 0; i < lista.length; i++) {
      const origen = lista[i]; const nombre = path.basename(origen);
      trabajo({ fase: `Cortando ${nombre}`, hecho: i, mensaje: '' });
      const completo = path.join(tmpDir, `completo-${i}.wav`);
      try {
        await correr(ff, ['-y', '-v', 'error', '-i', origen, '-vn', '-ac', '1', '-ar', String(HZ), '-af', 'highpass=f=70', '-c:a', 'pcm_s16le', completo], 15 * 60 * 1000);
        const duracion = segundosDeWav(completo);
        if (duracion < 1) throw new Error('el audio está vacío o no se pudo leer');
        let tramos = [];
        for (const umbral of ['-38dB', '-32dB', '-45dB']) { // si con un umbral no se corta bien, se prueba otro
          const salida = await correr(ff, ['-v', 'info', '-i', completo, '-af', `silencedetect=noise=${umbral}:d=0.35`, '-f', 'null', '-'], 10 * 60 * 1000).catch((e) => e.salida || '');
          tramos = trozosDe(parsearSilencios(salida, duracion), duracion);
          if (tramos.length >= Math.max(2, duracion / 20)) break;
        }
        resultado.archivos++;
        for (let k = 0; k < tramos.length; k++) {
          const t = tramos[k];
          trabajo({ fase: `Frase ${k + 1} de ${tramos.length} · ${nombre}`, mensaje: '' });
          if (t.largo > MAX_FRASE + 3 || t.largo < MIN_FRASE) { resultado.descartadas++; continue; }
          let texto = '';
          try { texto = await transcribirTramo(ff, completo, t.inicio, t.fin); } catch (e) { throw new Error(`no pude pasar el audio a texto: ${e.message}`); }
          if (normalizar(texto).length < 4) { resultado.descartadas++; continue; }
          const coincide = modo === 'libre' ? null : buscarEnGuion(texto, { ya: usadas });
          const final = coincide ? coincide.texto : texto;
          const wav = path.join(tmpDir, `frase-${i}-${k}.wav`);
          await correr(ff, ['-y', '-v', 'error', '-ss', String(t.inicio), '-t', String(t.fin - t.inicio), '-i', completo, '-ac', '1', '-ar', String(HZ), '-af', filtroFrase, '-c:a', 'pcm_s16le', wav], 60000);
          if (segundosDeWav(wav) < MIN_FRASE) { fs.rmSync(wav, { force: true }); resultado.descartadas++; continue; }
          if (coincide) usadas.add(coincide.n);
          nuevoClip(id, { texto: final, origen: 'subido', fuente: nombre, guion: coincide ? coincide.n : null, revisar: !coincide }, wav);
          resultado.frases++; if (coincide) resultado.delGuion++;
          publicar();
        }
      } catch (e) { resultado.errores.push(`${nombre}: ${e.message}`); } finally { fs.rmSync(completo, { force: true }); }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const partes = [`${resultado.frases} frases nuevas de ${resultado.archivos} audio${resultado.archivos === 1 ? '' : 's'}`];
    if (resultado.delGuion) partes.push(`${resultado.delGuion} coinciden con el guion`);
    if (resultado.frases - resultado.delGuion > 0) partes.push(`${resultado.frases - resultado.delGuion} con el texto entendido por Jarvis: revisalas`);
    if (resultado.descartadas) partes.push(`${resultado.descartadas} tramos descartados (muy cortos, muy largos o sin voz)`);
    trabajo({ activo: false, fase: 'Listo', hecho: lista.length, mensaje: partes.join(' · '), error: resultado.errores.join(' | ') });
  } catch (e) {
    trabajo({ activo: false, fase: 'Error', error: e.message });
    throw e;
  }
  return resultado;
}

// ---------- Frases ----------
function cambiarTexto(id, clipId, texto) {
  exigir(id);
  const cs = leer(archivoClips(id), []); const c = cs.find((x) => x.id === Number(clipId));
  if (!c) throw new Error('Esa frase ya no está.');
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!t) throw new Error('El texto no puede quedar vacío.');
  c.texto = t; c.revisar = false; escribir(archivoClips(id), cs); return c;
}
function quitarClip(id, clipId) {
  exigir(id);
  const cs = leer(archivoClips(id), []); const i = cs.findIndex((x) => x.id === Number(clipId));
  if (i < 0) return;
  fs.rmSync(path.join(dirDe(id), 'clips', cs[i].archivo), { force: true });
  cs.splice(i, 1); escribir(archivoClips(id), cs);
}
function archivoDeClip(id, clipId) {
  exigir(id);
  const c = leer(archivoClips(id), []).find((x) => x.id === Number(clipId));
  if (!c) throw new Error('Esa frase ya no está.');
  return path.join(dirDe(id), 'clips', c.archivo);
}

// ---------- Armar el set de entrenamiento ----------
const EPOCAS = { rapido: 600, normal: 1200, completo: 2000 };
const limpiarCsv = (t) => String(t).replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

function armar(id, { calidad = 'normal' } = {}) {
  const p = exigir(id);
  const cs = leer(archivoClips(id), []);
  const buenos = cs.filter((c) => c.texto && c.segundos >= MIN_FRASE && c.segundos <= MAX_FRASE && fs.existsSync(path.join(dirDe(id), 'clips', c.archivo)));
  const sinTexto = cs.length - buenos.length;
  if (buenos.length < 20) throw new Error(`Hacen falta al menos 20 frases buenas (hoy hay ${buenos.length}). Con 120 ya se puede probar y con unas 350 sale bien.`);
  const salida = path.join(dirDe(id), 'entrenamiento');
  fs.rmSync(path.join(salida, 'audio'), { recursive: true, force: true });
  fs.mkdirSync(path.join(salida, 'audio'), { recursive: true });
  for (const c of buenos) fs.copyFileSync(path.join(dirDe(id), 'clips', c.archivo), path.join(salida, 'audio', c.archivo));
  fs.writeFileSync(path.join(salida, 'metadata.csv'), `${buenos.map((c) => `${c.archivo}|${limpiarCsv(c.texto)}`).join('\n')}\n`, 'utf8');
  const segundos = buenos.reduce((n, c) => n + c.segundos, 0);
  const epocas = EPOCAS[calidad] || EPOCAS.normal;
  const nombreVoz = slug(p.nombre) || 'voz';
  const datos = { id, nombre: p.nombre, nombreVoz, epocas, batch: 16, espeak: p.espeak || ESPEAK, clips: buenos.length, segundos };
  fs.writeFileSync(path.join(salida, 'entrenar.sh'), scriptSh(datos), { encoding: 'utf8' });
  fs.writeFileSync(path.join(salida, 'entrenar.bat'), scriptBat(datos).replace(/\r?\n/g, '\r\n'), { encoding: 'utf8' });
  fs.writeFileSync(path.join(salida, 'LEEME.txt'), leeme(datos).replace(/\r?\n/g, '\r\n'), { encoding: 'utf8' });
  const aviso = [];
  if (buenos.length < 120) aviso.push(`Son pocas frases (${buenos.length}): sirve para probar, pero la voz va a sonar torpe.`);
  if (sinTexto) aviso.push(`${sinTexto} frase(s) se dejaron afuera (sin texto o de menos de 1 s / más de 15 s).`);
  const sinRevisar = cs.filter((c) => c.revisar).length;
  if (sinRevisar) aviso.push(`${sinRevisar} frase(s) tienen el texto sin revisar: un texto mal escrito arruina la voz, escuchalas y corregilas.`);
  return { carpeta: salida, frases: buenos.length, minutos: Math.round(segundos / 6) / 10, epocas, advertencias: aviso };
}

function scriptSh(d) {
  return `#!/usr/bin/env bash
# Generado por Jarvis para entrenar la voz "${d.nombre}". Se corre dentro de WSL (Ubuntu) con entrenar.bat.
# Afina un modelo Piper (VITS) ya entrenado en español con TUS audios, usando la placa de video NVIDIA.
# Sigue la guía oficial de https://github.com/OHF-Voice/piper1-gpl (docs/TRAINING.md).
set -euo pipefail

NOMBRE="${d.nombreVoz}"
EPOCAS=\${EPOCAS:-${d.epocas}}      # cuánto se entrena: 600 rápido, 1200 normal, 2000 completo
BATCH=\${BATCH:-${d.batch}}        # si la placa se queda sin memoria, bajalo a 8
ESPEAK="${d.espeak}"
COMMIT="${COMMIT_PIPER}"
BASE_URL="${BASE_CKPT}"

AQUI="$(cd "$(dirname "$0")" && pwd)"
TRABAJO="$HOME/jarvis-voz/$NOMBRE"
mkdir -p "$TRABAJO" "$HOME/jarvis-voz"

echo "== 1/6  Revisando la placa de video"
if ! command -v nvidia-smi >/dev/null 2>&1 || ! nvidia-smi >/dev/null 2>&1; then
  echo "No veo la placa NVIDIA desde WSL. Actualizá el driver de NVIDIA en Windows (con soporte WSL/CUDA) y probá de nuevo."
  echo "Sin placa se puede entrenar, pero tarda días: no lo recomiendo. Para seguir igual: SIN_GPU=1 bash entrenar.sh"
  [ "\${SIN_GPU:-0}" = "1" ] || exit 1
fi

echo "== 2/6  Paquetes del sistema (te puede pedir la contraseña de Ubuntu)"
if ! command -v cmake >/dev/null 2>&1 || ! command -v ninja >/dev/null 2>&1 || ! command -v gcc >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1 || ! python3 -c 'import venv, ensurepip' >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y build-essential cmake ninja-build git curl python3-venv python3-dev
fi

echo "== 3/6  Entrenador de Piper (la primera vez baja e instala varios GB: es normal que tarde)"
cd "$HOME/jarvis-voz"
if [ ! -d piper1-gpl ]; then git clone https://github.com/OHF-Voice/piper1-gpl.git; fi
cd piper1-gpl
git checkout "$COMMIT" >/dev/null 2>&1 || echo "(aviso: no pude fijar la versión probada; sigo con la que hay)"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
if [ ! -f .jarvis-listo ]; then
  python3 -m pip install -U pip
  python3 -m pip install -e '.[train]'
  ./build_monotonic_align.sh
  touch .jarvis-listo
fi

echo "== 4/6  Modelo base en español (una sola vez, ~850 MB)"
BASE="$HOME/jarvis-voz/base-es_MX-ald-medium.ckpt"
if [ ! -s "$BASE" ]; then curl -L --fail -o "$BASE.parte" "$BASE_URL" && mv "$BASE.parte" "$BASE"; fi

echo "== 5/6  Entrenando (podés cortar con Ctrl+C y seguir otro día corriendo este mismo archivo)"
rm -rf "$TRABAJO/audio"; mkdir -p "$TRABAJO/audio"
cp "$AQUI"/audio/*.wav "$TRABAJO/audio/"
cp "$AQUI/metadata.csv" "$TRABAJO/metadata.csv"
cd "$TRABAJO"
ULTIMO=""
if [ -d "$TRABAJO/lightning_logs" ]; then ULTIMO="$(ls -t "$TRABAJO"/lightning_logs/*/checkpoints/last.ckpt 2>/dev/null | head -1 || true)"; fi
if [ -n "$ULTIMO" ]; then
  echo "Sigo desde el punto donde quedó: $ULTIMO"
  EXTRA=(--ckpt_path "$ULTIMO")
else
  EXTRA=(--model.warmstart_ckpt "$BASE")
fi
python3 -m piper.train fit \\
  --data.voice_name "$NOMBRE" \\
  --data.csv_path "$TRABAJO/metadata.csv" \\
  --data.audio_dir "$TRABAJO/audio" \\
  --model.sample_rate 22050 \\
  --data.espeak_voice "$ESPEAK" \\
  --data.cache_dir "$TRABAJO/cache" \\
  --data.config_path "$TRABAJO/$NOMBRE.onnx.json" \\
  --data.batch_size "$BATCH" \\
  --model.mos_metric none \\
  --trainer.max_epochs "$EPOCAS" \\
  "\${EXTRA[@]}"

echo "== 6/6  Exportando la voz"
FINAL="$(ls -t "$TRABAJO"/lightning_logs/*/checkpoints/last.ckpt 2>/dev/null | head -1)"
[ -n "$FINAL" ] || { echo "No encuentro el punto de control final."; exit 1; }
python3 -m piper.train.export_onnx --checkpoint "$FINAL" --output-file "$TRABAJO/$NOMBRE.onnx"
mkdir -p "$AQUI/resultado"
cp "$TRABAJO/$NOMBRE.onnx" "$AQUI/resultado/voz.onnx"
cp "$TRABAJO/$NOMBRE.onnx.json" "$AQUI/resultado/voz.onnx.json"
echo
echo "LISTO. La voz quedó en: $AQUI/resultado"
echo "Volvé a Jarvis (Ajustes > Asistente > Voz) y tocá \\"Cargar la voz entrenada\\"."
`;
}

function scriptBat(d) {
  return `@echo off
chcp 65001 >nul
title Entrenar la voz "${d.nombre}"
cd /d "%~dp0"
echo.
echo  Entrenamiento de la voz "${d.nombre}"
echo  (${d.clips} frases, ${Math.round(d.segundos / 60)} minutos de audio)
echo.
wsl.exe --status >nul 2>&1
if errorlevel 1 (
  echo  Esta PC no tiene WSL ^(Linux dentro de Windows^). Hace falta una sola vez:
  echo    1. Abri PowerShell como administrador y escribi:  wsl --install -d Ubuntu
  echo    2. Reinicia la PC, abri "Ubuntu" una vez y crea un usuario y una contrasena.
  echo    3. Volve a abrir este archivo.
  echo.
  pause
  exit /b 1
)
wsl.exe -e bash ./entrenar.sh
echo.
pause
`;
}

function leeme(d) {
  const horas = (d.segundos / 3600);
  const porEpoca = Math.max(8, Math.round(25 * horas * 1.5 + 6)); // segundos por época, estimación gruesa para una RTX 3070 Ti
  return `ENTRENAMIENTO DE LA VOZ "${d.nombre}"
==================================================

Qué hay en esta carpeta
  audio\\          las ${d.clips} frases (WAV de 22.050 Hz, mono)
  metadata.csv    una línea por frase:  archivo|texto
  entrenar.bat    el que se abre (doble clic) para entrenar
  entrenar.sh     lo que hace entrenar.bat adentro de WSL (Ubuntu)
  resultado\\      aparece cuando termina: voz.onnx y voz.onnx.json

Qué hace
  Toma un modelo de voz de Piper ya entrenado en español (es_MX "ald", calidad medium) y lo "afina" con tus frases
  (opción --model.warmstart_ckpt del entrenador oficial de Piper). No se entrena de cero: por eso alcanzan decenas
  de minutos de audio y no cientos de horas.

Antes de empezar (una sola vez)
  1. Placa NVIDIA con el driver al día (el de Windows ya trae soporte para WSL).
  2. WSL con Ubuntu:  en PowerShell como administrador,  wsl --install -d Ubuntu  (y reiniciar).
  3. ~15 GB libres en el disco donde está Windows (el entrenador y el modelo base se bajan una vez).

Cómo se usa
  1. Doble clic en entrenar.bat. La primera vez baja e instala todo (puede tardar 20-40 minutos) y te pide la
     contraseña de Ubuntu una vez.
  2. Después entrena ${d.epocas} épocas. Estimación muy gruesa en una RTX 3070 Ti con ${d.clips} frases: ~${porEpoca} s por época,
     o sea unas ${Math.round(d.epocas * porEpoca / 3600 * 10) / 10} horas. Se puede dejar de noche. Si lo cortás (Ctrl+C o cerrás la
     ventana), al abrirlo de nuevo SIGUE desde donde quedó.
  3. Al terminar exporta la voz a la carpeta resultado\\.
  4. En Jarvis: Ajustes > Asistente > Voz > "Cargar la voz entrenada". Aparece en la lista de voces de esa misma pantalla.

Variantes (en la línea de comandos de Ubuntu, dentro de esta carpeta)
  EPOCAS=600 bash entrenar.sh     más rápido y menos fino
  EPOCAS=2000 bash entrenar.sh    el máximo recomendado para sets chicos
  BATCH=8 bash entrenar.sh        si dice que la placa se quedó sin memoria

Notas honestas
  - Jarvis no pudo probar el entrenamiento en esta PC (se armó sin acceso a tu placa): los comandos siguen la guía oficial
    de Piper (versión ${COMMIT_PIPER.slice(0, 7)}). Si algo falla, el mensaje de la ventana dice dónde; guardalo.
  - El resultado depende mucho de la calidad de los audios (sin ruido ni eco) y de que el texto coincida con lo dicho.
  - Usá solo voces propias o de personas que lo autorizaron. Una voz entrenada se puede usar para imitar a alguien.
`;
}

// ---------- Cargar la voz entrenada en Jarvis ----------
const CARPETA_VOCES = () => path.join(modelos.CARPETA, 'voces-propias');

// Agrega a un archivo .onnx los metadatos que pide sherpa-onnx para una voz Piper (el formato protobuf permite sumar campos al final).
function varint(n) { const b = []; while (n > 127) { b.push((n & 127) | 128); n = Math.floor(n / 128); } b.push(n); return Buffer.from(b); }
function entradaMeta(clave, valor) {
  const k = Buffer.from(String(clave), 'utf8'); const v = Buffer.from(String(valor), 'utf8');
  const cuerpo = Buffer.concat([Buffer.from([0x0a]), varint(k.length), k, Buffer.from([0x12]), varint(v.length), v]);
  return Buffer.concat([Buffer.from([0x72]), varint(cuerpo.length), cuerpo]); // ModelProto.metadata_props = campo 14
}
function metadatosPiper(config) {
  return { model_type: 'vits', comment: 'piper', language: 'Spanish', voice: (config.espeak && config.espeak.voice) || ESPEAK, has_espeak: '1', n_speakers: String(config.num_speakers || 1), sample_rate: String((config.audio && config.audio.sample_rate) || HZ) };
}
function tokensDe(config) {
  const mapa = config.phoneme_id_map || {};
  return `${Object.entries(mapa).filter(([, ids]) => ids && ids.length).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([s, ids]) => `${s} ${ids[0]}`).join('\n')}\n`;
}

const carpetaDeEspeak = () => modelos.datosEspeak();

// onnx: ruta del .onnx; json: ruta del .onnx.json (por defecto al lado). Devuelve { id (de la voz), nombre }.
function instalarVoz(id, { onnx, json, nombre }) {
  const p = id ? exigir(id) : {};
  if (!onnx || !fs.existsSync(onnx)) throw new Error('No encuentro el archivo .onnx de la voz.');
  const rutaJson = json || `${onnx}.json`;
  if (!fs.existsSync(rutaJson)) throw new Error('Falta el archivo de configuración (.onnx.json) junto al .onnx.');
  const config = JSON.parse(fs.readFileSync(rutaJson, 'utf8'));
  if (!config.phoneme_id_map) throw new Error('El .onnx.json no parece de una voz Piper (no tiene phoneme_id_map).');
  if ((config.num_speakers || 1) > 1) throw new Error('Por ahora Jarvis solo carga voces de un solo hablante.');
  const nombreVoz = String(nombre || p.nombre || path.basename(onnx, '.onnx')).trim();
  const base = slug(nombreVoz) || 'voz';
  fs.mkdirSync(CARPETA_VOCES(), { recursive: true });
  let vid = base; let n = 1;
  const existente = fs.existsSync(path.join(CARPETA_VOCES(), base, 'voz.json')) ? leer(path.join(CARPETA_VOCES(), base, 'voz.json'), {}) : null;
  if (existente && existente.proyecto !== (id || '')) { while (fs.existsSync(path.join(CARPETA_VOCES(), vid))) vid = `${base}-${++n}`; }
  const destino = path.join(CARPETA_VOCES(), vid);
  fs.mkdirSync(destino, { recursive: true });
  const modelo = fs.readFileSync(onnx);
  const extra = Buffer.concat(Object.entries(metadatosPiper(config)).map(([k, v]) => entradaMeta(k, v)));
  fs.writeFileSync(path.join(destino, 'model.onnx'), Buffer.concat([modelo, extra]));
  fs.writeFileSync(path.join(destino, 'tokens.txt'), tokensDe(config), 'utf8');
  fs.copyFileSync(rutaJson, path.join(destino, 'model.onnx.json'));
  fs.writeFileSync(path.join(destino, 'voz.json'), JSON.stringify({ nombre: nombreVoz, proyecto: id || '', creada: Date.now() }, null, 1));
  modelos.registrarVozPropia(vid, nombreVoz);
  if (id) { p.voz = vid; escribir(archivoProyecto(id), p); }
  return { id: vid, nombre: nombreVoz, voz: `propia-${vid}`, falta: carpetaDeEspeak() ? '' : 'Para que suene hace falta tener instalada alguna voz Piper de Jarvis (Daniela, Claude o Dave): ahí vive la parte que convierte el texto en sonidos.' };
}
function quitarVoz(vid) {
  const destino = path.join(CARPETA_VOCES(), String(vid).replace(/[^a-z0-9-]/g, ''));
  if (!vid || !fs.existsSync(path.join(destino, 'voz.json'))) throw new Error('Esa voz no existe.');
  fs.rmSync(destino, { recursive: true, force: true });
  modelos.olvidarVozPropia(vid);
  for (const id of listar().map((x) => x.id)) { const p = leer(archivoProyecto(id), {}); if (p.voz === vid) { delete p.voz; escribir(archivoProyecto(id), p); } }
}


// ---------- Renombrar una voz ya cargada ----------
const idSeguro = (vid) => String(vid || '').replace(/[^a-z0-9-]/g, '');
function renombrarVoz(vid, nombre) {
  const d = path.join(CARPETA_VOCES(), idSeguro(vid));
  const limpio = String(nombre || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!vid || !fs.existsSync(path.join(d, 'voz.json'))) throw new Error('Esa voz no existe.');
  if (!limpio) throw new Error('Ponele un nombre a la voz.');
  const j = leer(path.join(d, 'voz.json'), {}); j.nombre = limpio;
  fs.writeFileSync(path.join(d, 'voz.json'), JSON.stringify(j, null, 1));
  modelos.registrarVozPropia(idSeguro(vid), limpio);
  return { id: idSeguro(vid), nombre: limpio, voz: `propia-${idSeguro(vid)}` };
}

// ---------- Paquetes: pasar una voz (o las grabaciones) a otra PC, o dejarlas guardadas ----------
// Voz lista para usar: un .zip con el modelo, sus tokens, su configuración y su personalidad.
// Respaldo de grabaciones: un .zip con todas las frases (audio + texto) y, si existe, la voz ya entrenada.
const MANIFIESTO = 'jarvis-voz.json';
const FORMATO = 1;
const MAX_MODELO = 700 * 1024 * 1024;
function exportarVoz(vid, destino, { personalidad = '' } = {}) {
  const d = path.join(CARPETA_VOCES(), idSeguro(vid));
  const v = leer(path.join(d, 'voz.json'), null);
  if (!vid || !v) throw new Error('Esa voz no existe.');
  const archivos = ['model.onnx', 'tokens.txt', 'model.onnx.json'].map((f) => ({ nombre: `voz/${f}`, ruta: path.join(d, f) }));
  for (const a of archivos) if (!fs.existsSync(a.ruta)) throw new Error(`A la voz le falta ${path.basename(a.ruta)}.`);
  const manifiesto = { formato: FORMATO, tipo: 'voz', nombre: v.nombre, personalidad: String(personalidad || '').slice(0, 2000), creada: v.creada || Date.now(), exportada: Date.now() };
  return { ...zip.escribirZip(destino, [{ nombre: MANIFIESTO, datos: Buffer.from(JSON.stringify(manifiesto, null, 1)) }, ...archivos]), nombre: v.nombre };
}
function exportarProyecto(id, destino, { personalidad = '' } = {}) {
  const p = exigir(id); const cs = leer(archivoClips(id), []);
  const archivos = [{ nombre: 'proyecto.json', datos: Buffer.from(JSON.stringify({ nombre: p.nombre, espeak: p.espeak || ESPEAK, creado: p.creado }, null, 1)) }, { nombre: 'clips.json', datos: Buffer.from(JSON.stringify(cs, null, 1)) }];
  for (const c of cs) { const r = path.join(dirDe(id), 'clips', c.archivo); if (fs.existsSync(r)) archivos.push({ nombre: `clips/${c.archivo}`, ruta: r }); }
  for (const f of ['voz.onnx', 'voz.onnx.json']) { const r = path.join(dirDe(id), 'entrenamiento', 'resultado', f); if (fs.existsSync(r)) archivos.push({ nombre: `resultado/${f}`, ruta: r }); }
  const manifiesto = { formato: FORMATO, tipo: 'proyecto', nombre: p.nombre, personalidad: String(personalidad || '').slice(0, 2000), frases: cs.length, exportada: Date.now() };
  return { ...zip.escribirZip(destino, [{ nombre: MANIFIESTO, datos: Buffer.from(JSON.stringify(manifiesto, null, 1)) }, ...archivos]), nombre: p.nombre };
}
// Abre un paquete de otra persona (o un respaldo propio). Devuelve { tipo: 'voz'|'proyecto', ... } y siempre trae `personalidad`.
function importarPaquete(ruta) {
  return zip.conZip(ruta, (z) => {
    const porNombre = new Map(z.entradas.map((e) => [e.nombre.replace(/\\/g, '/'), e]));
    const m = porNombre.get(MANIFIESTO);
    if (!m) throw new Error('Ese zip no es de una voz de Jarvis (falta jarvis-voz.json).');
    let man; try { man = JSON.parse(z.leer(m).toString('utf8')); } catch { throw new Error('El zip está dañado (no se lee jarvis-voz.json).'); }
    if (!man || man.formato !== FORMATO) throw new Error('Ese paquete es de una versión de Jarvis que no conozco.');
    const nombre = String(man.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Voz importada';
    const personalidad = String(man.personalidad || '').slice(0, 2000);
    if (man.tipo === 'voz') {
      const f = {}; for (const n of ['model.onnx', 'tokens.txt', 'model.onnx.json']) { f[n] = porNombre.get(`voz/${n}`); if (!f[n]) throw new Error(`Al paquete le falta voz/${n}.`); }
      if (f['model.onnx'].tam > MAX_MODELO) throw new Error('El modelo es demasiado grande para ser una voz Piper.');
      let cfg; try { cfg = JSON.parse(z.leer(f['model.onnx.json']).toString('utf8')); } catch { throw new Error('La configuración de la voz está dañada.'); }
      if (!cfg || !cfg.phoneme_id_map) throw new Error('La configuración no es de una voz Piper.');
      fs.mkdirSync(CARPETA_VOCES(), { recursive: true });
      const base = slug(nombre) || 'voz'; let vid = base; let n = 1;
      while (fs.existsSync(path.join(CARPETA_VOCES(), vid))) vid = `${base}-${++n}`;
      const destino = path.join(CARPETA_VOCES(), vid); fs.mkdirSync(destino, { recursive: true });
      try {
        for (const [n2, e] of Object.entries(f)) fs.writeFileSync(path.join(destino, n2), z.leer(e));
        fs.writeFileSync(path.join(destino, 'voz.json'), JSON.stringify({ nombre, proyecto: '', creada: Date.now(), importada: true }, null, 1));
      } catch (e) { fs.rmSync(destino, { recursive: true, force: true }); throw e; }
      modelos.registrarVozPropia(vid, nombre);
      return { tipo: 'voz', id: vid, nombre, voz: `propia-${vid}`, personalidad, falta: carpetaDeEspeak() ? '' : 'Para que suene hace falta tener instalada alguna voz Piper de Jarvis (Daniela, Claude o Dave): ahí vive la parte que convierte el texto en sonidos.' };
    }
    if (man.tipo === 'proyecto') {
      const pj = porNombre.get('proyecto.json'); const cj = porNombre.get('clips.json');
      if (!pj || !cj) throw new Error('Al respaldo le falta proyecto.json o clips.json.');
      let proy; let cs;
      try { proy = JSON.parse(z.leer(pj).toString('utf8')); cs = JSON.parse(z.leer(cj).toString('utf8')); } catch { throw new Error('El respaldo está dañado.'); }
      if (!Array.isArray(cs)) throw new Error('El respaldo está dañado (clips.json).');
      const limpios = cs.filter((c) => c && /^\d+\.wav$/.test(String(c.archivo)) && porNombre.has(`clips/${c.archivo}`)).map((c) => ({ id: Number(c.id) || 0, archivo: String(c.archivo), texto: String(c.texto || '').slice(0, 600), segundos: Number(c.segundos) || 0, origen: c.origen === 'subido' ? 'subido' : 'guion', fuente: String(c.fuente || '').slice(0, 200), guion: Number.isInteger(c.guion) ? c.guion : null, revisar: !!c.revisar }));
      const espeak = ESPEAKS.includes(proy.espeak) ? proy.espeak : ESPEAK;
      let id = slug(nombre) || 'voz'; let n = 1; const base = id;
      while (fs.existsSync(dirDe(id))) id = `${base}-${++n}`;
      fs.mkdirSync(path.join(dirDe(id), 'clips'), { recursive: true });
      try {
        for (const c of limpios) fs.writeFileSync(path.join(dirDe(id), 'clips', c.archivo), z.leer(porNombre.get(`clips/${c.archivo}`)));
        const maximo = limpios.reduce((a, c) => Math.max(a, c.id, parseInt(c.archivo, 10) || 0), 0);
        escribir(archivoProyecto(id), { id, nombre, creado: Date.now(), espeak, siguiente: maximo + 1 });
        escribir(archivoClips(id), limpios);
        for (const f of ['voz.onnx', 'voz.onnx.json']) { const e = porNombre.get(`resultado/${f}`); if (e && e.tam <= MAX_MODELO) { fs.mkdirSync(path.join(dirDe(id), 'entrenamiento', 'resultado'), { recursive: true }); fs.writeFileSync(path.join(dirDe(id), 'entrenamiento', 'resultado', f), z.leer(e)); } }
      } catch (e) { fs.rmSync(dirDe(id), { recursive: true, force: true }); throw e; }
      return { tipo: 'proyecto', id, nombre, frases: limpios.length, personalidad };
    }
    throw new Error('No sé qué tipo de paquete es.');
  });
}

module.exports = {
  RAIZ, NIVELES, ESPEAK, configurar, trabajoActual,
  guion, guionParaEnviar, listar, crear, borrar, renombrar, proyecto, resumen,
  agregarGrabacion, importarAudios, cambiarTexto, quitarClip, archivoDeClip, armar,
  instalarVoz, quitarVoz, renombrarVoz, exportarVoz, exportarProyecto, importarPaquete, carpetaDeEspeak, dirDe, ESPEAKS,
  _pruebas: { parsearSilencios, trozosDe, buscarEnGuion, parecido, normalizar, tokensDe, entradaMeta, metadatosPiper, scriptSh, scriptBat, nivelDe },
};
