// Modelos de voz que corren en esta PC (escuchar y hablar sin depender de ningún servicio).
// No vienen adentro de Jarvis.exe porque pesan mucho: se bajan una sola vez a datos/modelos-voz
// y de ahí en más funcionan sin internet, sin clave y sin cuota.
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { DATOS } = require('./config');

const CARPETA = process.env.JARVIS_MODELOS || path.join(DATOS, 'modelos-voz');
// Publicados por el proyecto sherpa-onnx (los mismos archivos que usa su documentación).
const ORIGEN = process.env.JARVIS_MODELOS_URL || 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

const CATALOGO = {
  vad: {
    nombre: 'Detector de voz', mb: 1, url: `${ORIGEN}/asr-models/silero_vad.onnx`, archivo: 'silero_vad.onnx',
  },
  oido: {
    nombre: 'Modelo de escucha', mb: 465, url: `${ORIGEN}/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
    carpeta: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', necesita: ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'],
  },
  'voz-claude': {
    nombre: 'Claude (hombre, neutro)', mb: 64, url: `${ORIGEN}/tts-models/vits-piper-es_MX-claude-high.tar.bz2`,
    carpeta: 'vits-piper-es_MX-claude-high', onnx: 'es_MX-claude-high.onnx', necesita: ['es_MX-claude-high.onnx', 'tokens.txt', 'espeak-ng-data'],
  },
  'voz-daniela': {
    nombre: 'Daniela (mujer, argentina)', mb: 110, url: `${ORIGEN}/tts-models/vits-piper-es_AR-daniela-high.tar.bz2`,
    carpeta: 'vits-piper-es_AR-daniela-high', onnx: 'es_AR-daniela-high.onnx', necesita: ['es_AR-daniela-high.onnx', 'tokens.txt', 'espeak-ng-data'],
  },
  'voz-davefx': {
    nombre: 'Dave (hombre, español)', mb: 64, url: `${ORIGEN}/tts-models/vits-piper-es_ES-davefx-medium.tar.bz2`,
    carpeta: 'vits-piper-es_ES-davefx-medium', onnx: 'es_ES-davefx-medium.onnx', necesita: ['es_ES-davefx-medium.onnx', 'tokens.txt', 'espeak-ng-data'],
  },
};

// Kokoro: el modelo de voz abierto (Apache 2.0) más natural que corre en sherpa-onnx. Un solo archivo trae varias
// voces (Dora y Alex en español): "comparte" hace que bajar una sea tener la otra. Acento neutro/español, no rioplatense.
CATALOGO['voz-dora'] = {
  nombre: 'Dora (mujer, Kokoro: más natural)', mb: 365, url: `${ORIGEN}/tts-models/kokoro-multi-lang-v1_0.tar.bz2`,
  carpeta: 'kokoro-multi-lang-v1_0', motor: 'kokoro', sid: 28, necesita: ['model.onnx', 'voices.bin', 'tokens.txt', 'espeak-ng-data'],
};
CATALOGO['voz-alex'] = { ...CATALOGO['voz-dora'], nombre: 'Alex (hombre, Kokoro: más natural)', sid: 29, comparte: 'voz-dora' };

const raiz = (id) => (CATALOGO[id] && CATALOGO[id].comparte) || id;
// ffmpeg (para armar los clips de video): se baja una sola vez, solo si se usan los clips.
CATALOGO.ffmpeg = {
  nombre: 'Herramienta de video (ffmpeg)', mb: 81, archivo: 'ffmpeg.exe', gz: true,
  url: process.env.JARVIS_URL_FFMPEG || 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64.gz',
};

// Voces propias (entrenadas con Ajustes > Asistente > Voz): viven en datos/modelos-voz/voces-propias/<id>/ (model.onnx, tokens.txt, voz.json).
// No están en el catálogo (no se bajan de ningún lado). Para convertir texto en sonidos usan los datos de "espeak" de una voz Piper instalada.
const PROPIAS = new Map(); // id -> { nombre }
const dirPropia = (vid) => path.join(CARPETA, 'voces-propias', vid);
const esPropia = (id) => typeof id === 'string' && id.startsWith('voz-propia-') && PROPIAS.has(id.slice('voz-propia-'.length));
function cargarPropias() {
  PROPIAS.clear();
  try {
    for (const vid of fs.readdirSync(path.join(CARPETA, 'voces-propias'))) {
      try { const j = JSON.parse(fs.readFileSync(path.join(dirPropia(vid), 'voz.json'), 'utf8')); PROPIAS.set(vid, { nombre: j.nombre || vid }); } catch {}
    }
  } catch {}
}
function datosEspeak() {
  for (const id of ['voz-daniela', 'voz-claude', 'voz-davefx']) {
    if (instalado(id)) return path.join(lugar(id), 'espeak-ng-data');
  }
  return null;
}
function registrarVozPropia(vid, nombre) { PROPIAS.set(vid, { nombre: nombre || vid }); publicar(true); }
function olvidarVozPropia(vid) { PROPIAS.delete(vid); publicar(true); }

const enCurso = new Map(); // id -> { fase, hecho, total, promesa }
const errores = new Map(); // id -> texto del último error
let avisar = () => {};
let ultimoAviso = 0;
function alCambiar(fn) { avisar = fn; }
function publicar(forzar = false) {
  if (!forzar && Date.now() - ultimoAviso < 250) return;
  ultimoAviso = Date.now();
  try { avisar(estado()); } catch {}
}

const lugar = (id) => path.join(CARPETA, CATALOGO[id].carpeta || CATALOGO[id].archivo);
const marca = (id) => path.join(CARPETA, `${raiz(id)}.listo`);

function instalado(id) {
  if (esPropia(id)) { const d = dirPropia(id.slice('voz-propia-'.length)); return fs.existsSync(path.join(d, 'model.onnx')) && fs.existsSync(path.join(d, 'tokens.txt')) && !!datosEspeak(); }
  const m = CATALOGO[id];
  if (!m || !fs.existsSync(marca(id))) return false;
  if (m.archivo) return fs.existsSync(lugar(id));
  return m.necesita.every((f) => fs.existsSync(path.join(lugar(id), f)));
}

function estado() {
  const salida = {};
  for (const [id, m] of Object.entries(CATALOGO)) {
    const c = enCurso.get(raiz(id));
    salida[id] = {
      nombre: m.nombre, mb: m.mb, instalado: instalado(id),
      bajando: c ? { fase: c.fase, hecho: c.hecho, total: c.total } : null,
      error: errores.get(raiz(id)) || null,
    };
  }
  for (const [vid, v] of PROPIAS) salida[`voz-propia-${vid}`] = { nombre: v.nombre, mb: 0, instalado: instalado(`voz-propia-${vid}`), bajando: null, error: null };
  return salida;
}

// Rutas que necesita el proceso que escucha y habla.
function rutas(id) {
  if (esPropia(id)) { if (!instalado(id)) return null; const d = dirPropia(id.slice('voz-propia-'.length)); return { modelo: path.join(d, 'model.onnx'), tokens: path.join(d, 'tokens.txt'), datos: datosEspeak() }; }
  const m = CATALOGO[id];
  if (!m || !instalado(id)) return null;
  const base = lugar(id);
  if (id === 'vad' || id === 'ffmpeg') return { modelo: base };
  if (id === 'oido') return { encoder: path.join(base, 'encoder.int8.onnx'), decoder: path.join(base, 'decoder.int8.onnx'), joiner: path.join(base, 'joiner.int8.onnx'), tokens: path.join(base, 'tokens.txt') };
  if (m.motor === 'kokoro') return { motor: 'kokoro', modelo: path.join(base, 'model.onnx'), voces: path.join(base, 'voices.bin'), tokens: path.join(base, 'tokens.txt'), datos: path.join(base, 'espeak-ng-data'), sid: m.sid, lang: 'es' };
  return { modelo: path.join(base, m.onnx), tokens: path.join(base, 'tokens.txt'), datos: path.join(base, 'espeak-ng-data') };
}

// Abre la descarga siguiendo las redirecciones (GitHub manda a otro servidor para el archivo en sí).
// Se usa el cliente clásico de Node y no fetch: con archivos grandes es el que mejor se lleva con
// escribir a disco de a poco.
function abrir(url, cabeceras, saltos = 0) {
  return new Promise((ok, mal) => {
    const cliente = url.startsWith('https:') ? require('https') : require('http');
    const pedido = cliente.get(url, { headers: { 'User-Agent': 'Jarvis', ...cabeceras } }, (respuesta) => {
      if ([301, 302, 303, 307, 308].includes(respuesta.statusCode) && respuesta.headers.location) {
        respuesta.resume();
        if (saltos >= 6) { mal(new Error('demasiadas redirecciones')); return; }
        abrir(new URL(respuesta.headers.location, url).toString(), cabeceras, saltos + 1).then(ok, mal);
        return;
      }
      ok(respuesta);
    });
    pedido.setTimeout(30000, () => pedido.destroy(Object.assign(new Error('el servidor dejó de responder'), { code: 'ETIMEDOUT' })));
    pedido.on('error', mal);
  });
}

// Baja a un archivo temporal; si quedó a medias de un intento anterior, sigue desde donde estaba.
async function descargar(id, destino, progreso) {
  let desde = 0;
  try { desde = fs.statSync(destino).size; } catch {}
  let respuesta = await abrir(CATALOGO[id].url, desde ? { Range: `bytes=${desde}-` } : {});
  if (respuesta.statusCode === 416) { respuesta.resume(); fs.rmSync(destino, { force: true }); desde = 0; respuesta = await abrir(CATALOGO[id].url, {}); }
  if (respuesta.statusCode !== 200 && respuesta.statusCode !== 206) { respuesta.resume(); throw new Error(`el servidor respondió ${respuesta.statusCode}`); }
  if (respuesta.statusCode !== 206) desde = 0; // no aceptó continuar: empieza de cero
  const falta = Number(respuesta.headers['content-length']) || 0;
  const total = desde + falta;
  let hecho = desde;
  progreso(hecho, total);
  respuesta.on('data', (trozo) => { hecho += trozo.length; progreso(hecho, total); });
  respuesta.on('aborted', () => respuesta.destroy(new Error('la descarga se cortó antes de terminar')));
  await pipeline(respuesta, fs.createWriteStream(destino, { flags: desde ? 'a' : 'w' }));
  if (total && hecho < total) throw new Error('la descarga se cortó antes de terminar');
}

// Descomprime un .tar.bz2 con JavaScript puro (no depende de que Windows tenga tar ni 7-Zip).
async function descomprimir(archivo, carpetaDestino, progreso) {
  const bz2 = require('unbzip2-stream');
  const tar = require('tar-stream');
  const total = fs.statSync(archivo).size;
  let leido = 0;
  const extractor = tar.extract();
  extractor.on('entry', (cabecera, contenido, seguir) => {
    const destino = path.join(carpetaDestino, cabecera.name);
    const saltear = () => { contenido.resume(); contenido.on('end', seguir); };
    if (!destino.startsWith(carpetaDestino + path.sep)) { saltear(); return; } // nada de escribir fuera de la carpeta
    if (cabecera.type === 'directory') { fs.mkdirSync(destino, { recursive: true }); saltear(); return; }
    if (cabecera.type !== 'file') { saltear(); return; }
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const salida = fs.createWriteStream(destino);
    salida.on('error', (e) => extractor.destroy(e));
    salida.on('finish', seguir);
    contenido.pipe(salida);
  });
  const lector = fs.createReadStream(archivo);
  lector.on('data', (trozo) => { leido += trozo.length; progreso(leido, total); });
  await pipeline(lector, bz2(), extractor);
}

// En Windows, mover una carpeta recién escrita a veces falla un instante (el antivirus la está mirando).
async function mover(origen, destino) {
  for (let intento = 1; ; intento++) {
    try { fs.renameSync(origen, destino); return; } catch (e) {
      if (intento >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 400 * intento));
    }
  }
}

async function instalar(id, c) {
  const m = CATALOGO[id];
  fs.mkdirSync(CARPETA, { recursive: true });
  fs.rmSync(marca(id), { force: true });
  const temporal = path.join(CARPETA, `${id}.descarga`);
  const progreso = (hecho, total) => { c.hecho = hecho; c.total = total; publicar(); };
  c.fase = 'bajando';
  await descargar(id, temporal, progreso);
  if (m.archivo) {
    if (m.gz) {
      // El archivo bajado está comprimido con gzip: se descomprime a un temporal y se mueve a su lugar.
      c.fase = 'descomprimiendo'; c.hecho = 0; publicar(true);
      const plano = path.join(CARPETA, `${id}.plano`);
      try { await pipeline(fs.createReadStream(temporal), require('zlib').createGunzip(), fs.createWriteStream(plano)); }
      catch (e) { fs.rmSync(temporal, { force: true }); fs.rmSync(plano, { force: true }); throw new Error(`el archivo llegó dañado (${e.message})`); }
      fs.rmSync(temporal, { force: true });
      await mover(plano, lugar(id));
    } else await mover(temporal, lugar(id));
  } else {
    c.fase = 'descomprimiendo'; c.hecho = 0; publicar(true);
    const provisoria = path.join(CARPETA, `${id}.tmp`);
    fs.rmSync(provisoria, { recursive: true, force: true });
    fs.mkdirSync(provisoria, { recursive: true });
    try {
      await descomprimir(temporal, provisoria, progreso);
    } catch (e) {
      // Un archivo corrupto no se arregla continuando la descarga: la próxima vez empieza de cero.
      fs.rmSync(temporal, { force: true });
      throw new Error(`el archivo llegó dañado (${e.message})`);
    }
    fs.rmSync(lugar(id), { recursive: true, force: true });
    await mover(path.join(provisoria, m.carpeta), lugar(id));
    fs.rmSync(provisoria, { recursive: true, force: true });
    fs.rmSync(temporal, { force: true });
  }
  fs.writeFileSync(marca(id), new Date().toISOString());
  if (!instalado(id)) throw new Error('quedó incompleto después de descomprimir');
}

// Baja e instala un modelo. Si ya se está bajando, devuelve la misma promesa.
function bajar(id) {
  if (esPropia(id)) return bajar('voz-daniela'); // lo único que le falta a una voz propia es la parte que pasa texto a sonidos
  if (!CATALOGO[id]) return Promise.reject(new Error(`Modelo desconocido: ${id}`));
  id = raiz(id);
  if (instalado(id)) return Promise.resolve();
  if (enCurso.has(id)) return enCurso.get(id).promesa;
  const c = { fase: 'bajando', hecho: 0, total: 0 };
  errores.delete(id);
  c.promesa = instalar(id, c).then(
    () => { enCurso.delete(id); publicar(true); },
    (e) => {
      enCurso.delete(id);
      const motivo = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH/i.test(`${e.code} ${e.message}`) ? 'no hay conexión a internet (o se cortó)' : e.message;
      errores.set(id, `No pude bajar "${CATALOGO[id].nombre}": ${motivo}.`);
      publicar(true);
      throw new Error(errores.get(id));
    },
  );
  enCurso.set(id, c);
  publicar(true);
  return c.promesa;
}

// Lo mínimo para escuchar y contestar hablando: de a uno, primero lo más liviano.
async function bajarVarios(ids) {
  for (const id of ids) await bajar(id);
}

const idDeVoz = (voz) => (voz && voz !== 'windows' && (CATALOGO[`voz-${voz}`] || esPropia(`voz-${voz}`)) ? `voz-${voz}` : null);
const voces = () => [
  ...Object.entries(CATALOGO).filter(([id]) => id.startsWith('voz-')).map(([id, m]) => ({ id: id.slice(4), nombre: m.nombre, mb: m.mb })),
  ...[...PROPIAS].map(([vid, v]) => ({ id: `propia-${vid}`, nombre: `${v.nombre} (voz propia)`, mb: 0 })),
];
cargarPropias();

module.exports = { CARPETA, CATALOGO, alCambiar, estado, instalado, rutas, bajar, bajarVarios, idDeVoz, voces, registrarVozPropia, olvidarVozPropia, cargarPropias, datosEspeak, esPropia };
