// Música en varios aparatos a la vez: los grupos de Google Home ("Toda la casa") suenan sincronizados, pero no aceptan
// la app de YouTube. Para ellos, Jarvis baja el audio de cada tema con yt-dlp, lo sirve desde la PC y lo manda al grupo
// con el reproductor común de Cast. La lista la maneja Jarvis: sigue sola al terminar cada tema y responde a
// pausa, siguiente y anterior (del notch, del celular o por voz). Mientras suena un tema, ya baja el siguiente.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { DATOS } = require('./config');

const CARPETA = path.join(DATOS, 'musica-grupos');
let f = {
  ytdlp: async () => null, // ruta de yt-dlp
  conectar: async () => { throw new Error('Sin Cast.'); }, // (d) => cliente de castv2
  compartir: async () => { throw new Error('Sin servidor.'); }, // (archivo, ip) => { url, tipo }
  alCambiar: () => {}, // ({ cancion, artista, tapa, sonando }) para la tarjeta de música
};
function configurar(x = {}) { f = { ...f, ...x }; }
let s = null; // { d, cliente, reproductor, cola: [{ id, titulo, canal }], i, pausado, cargando }
const promesa = (fn) => new Promise((ok, mal) => fn((e, r) => (e ? mal(e) : ok(r))));
const tapaDe = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// La lista para seguir: la de la PC si había, o la "radio" del tema (lo que pondría YouTube después).
async function listaDe(videoId, listaId = '') {
  const yt = await f.ytdlp();
  if (!yt) throw new Error('Para mandar música a un grupo hace falta yt-dlp (Ajustes → Sistema → Componentes).');
  const url = `https://www.youtube.com/watch?v=${videoId}&list=${listaId || `RD${videoId}`}`;
  const salida = await new Promise((ok) => execFile(yt, ['--flat-playlist', '-J', '--playlist-end', '40', '--no-warnings', url], { windowsHide: true, timeout: 40000, maxBuffer: 20 * 1024 * 1024 }, (e, out) => ok(e ? '' : out)));
  let entradas = [];
  try { entradas = (JSON.parse(salida).entries || []).filter((x) => x && /^[\w-]{11}$/.test(x.id)).map((x) => ({ id: x.id, titulo: x.title || '', canal: x.channel || x.uploader || '' })); } catch {}
  if (!entradas.some((x) => x.id === videoId)) entradas.unshift({ id: videoId, titulo: '', canal: '' });
  return entradas;
}
const bajando = new Map();
function bajarAudio(v) {
  if (bajando.has(v.id)) return bajando.get(v.id);
  const tarea = (async () => {
    fs.mkdirSync(CARPETA, { recursive: true });
    const ya = fs.readdirSync(CARPETA).find((n) => n.startsWith(`${v.id}.`) && !/\.part$|\.ytdl$/.test(n));
    if (ya) return path.join(CARPETA, ya);
    const yt = await f.ytdlp();
    if (!yt) throw new Error('Falta yt-dlp.');
    await new Promise((ok, mal) => {
      const p = spawn(yt, ['-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '--no-warnings', '-o', path.join(CARPETA, '%(id)s.%(ext)s'), '--', `https://www.youtube.com/watch?v=${v.id}`], { windowsHide: true });
      let err = ''; p.stderr.on('data', (d) => { err += d; });
      const reloj = setTimeout(() => { try { p.kill(); } catch {} mal(new Error('Tardó demasiado en bajar el tema.')); }, 120000);
      p.on('error', (e) => { clearTimeout(reloj); mal(e); });
      p.on('close', (c) => { clearTimeout(reloj); if (c === 0) ok(); else mal(new Error((/ERROR:\s*(.+)/.exec(err) || [])[1] || 'yt-dlp no pudo bajar el tema.')); });
    });
    const n = fs.readdirSync(CARPETA).find((x) => x.startsWith(`${v.id}.`) && !/\.part$|\.ytdl$/.test(x));
    if (!n) throw new Error('No quedó el archivo del tema.');
    limpiar();
    return path.join(CARPETA, n);
  })().finally(() => bajando.delete(v.id));
  bajando.set(v.id, tarea);
  return tarea;
}
// Se guardan los últimos 12 temas (unos 50 MB).
function limpiar() {
  try {
    const l = fs.readdirSync(CARPETA).map((n) => ({ n, t: fs.statSync(path.join(CARPETA, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const x of l.slice(12)) fs.unlinkSync(path.join(CARPETA, x.n));
  } catch {}
}
const TIPOS = { '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.webm': 'audio/webm', '.opus': 'audio/ogg', '.mp3': 'audio/mpeg' };

function avisar() {
  if (!s) return;
  const v = s.cola[s.i] || {};
  f.alCambiar({ cancion: v.titulo || 'Música', artista: v.canal || '', tapa: v.id ? tapaDe(v.id) : '', sonando: !s.pausado, grupo: s.d.nombre });
}
async function cargar(i) {
  if (!s || i < 0 || i >= s.cola.length) return false;
  s.i = i; s.cargando = true; s.pausado = false;
  avisar();
  const v = s.cola[i];
  const archivo = await bajarAudio(v);
  const { url } = await f.compartir(archivo, s.d.host);
  const medio = {
    contentId: url, contentType: TIPOS[path.extname(archivo).toLowerCase()] || 'audio/mp4', streamType: 'BUFFERED',
    metadata: { type: 0, metadataType: 3, title: v.titulo || 'Jarvis', artist: v.canal || '', images: [{ url: tapaDe(v.id) }] },
  };
  await promesa((cb) => s.reproductor.load(medio, { autoplay: true }, cb));
  s.cargando = false;
  // Mientras suena, ya se baja el siguiente.
  const prox = s.cola[i + 1];
  if (prox) bajarAudio(prox).catch(() => {});
  return true;
}
async function tocar(d, { videoId, titulo = '', canal = '', listaId = '' }) {
  await detener();
  const cola = await listaDe(videoId, listaId);
  const primero = cola.find((x) => x.id === videoId);
  if (primero && titulo) { primero.titulo = titulo; primero.canal = canal || primero.canal; }
  const cliente = await f.conectar(d);
  const { DefaultMediaReceiver } = require('castv2-client');
  const reproductor = await promesa((cb) => cliente.launch(DefaultMediaReceiver, cb));
  s = { d, cliente, reproductor, cola, i: 0, pausado: false, cargando: false };
  const yo = s;
  reproductor.on('status', (st) => {
    if (s !== yo || !st) return;
    if (st.playerState === 'IDLE' && st.idleReason === 'FINISHED' && !yo.cargando) siguiente().catch(() => {});
    if (st.playerState === 'PAUSED' || st.playerState === 'PLAYING') { const p = st.playerState === 'PAUSED'; if (p !== yo.pausado) { yo.pausado = p; avisar(); } }
  });
  cliente.on('close', () => { if (s === yo) s = null; });
  cliente.on('error', () => { if (s === yo) s = null; });
  await cargar(cola.findIndex((x) => x.id === videoId));
  return `Sonando en ${d.nombre}${cola.length > 1 ? ` (y sigo con ${cola.length - 1} temas más)` : ''}.`;
}
async function siguiente() { if (!s) throw new Error('No hay música en un grupo.'); if (s.i + 1 >= s.cola.length) { await detener(); return 'Se terminó la lista.'; } await cargar(s.i + 1); return `Siguiente: ${s.cola[s.i].titulo || 'tema'}.`; }
async function anterior() { if (!s) throw new Error('No hay música en un grupo.'); await cargar(Math.max(0, s.i - 1)); return `Volví a: ${s.cola[s.i].titulo || 'tema'}.`; }
async function pausar() { if (!s) throw new Error('No hay música en un grupo.'); await promesa((cb) => s.reproductor.pause(cb)); s.pausado = true; avisar(); return 'Pausado.'; }
async function reanudar() { if (!s) throw new Error('No hay música en un grupo.'); await promesa((cb) => s.reproductor.play(cb)); s.pausado = false; avisar(); return 'Sigue.'; }
async function detener() {
  const viejo = s; s = null;
  if (!viejo) return 'Listo.';
  try { await promesa((cb) => viejo.reproductor.stop(cb)); } catch {}
  try { viejo.cliente.close(); } catch {}
  return 'Listo, paré la música en el grupo.';
}
async function controlar(accion) {
  if (accion === 'alternar') return s && s.pausado ? reanudar() : pausar();
  return ({ siguiente, anterior, pausar, reanudar, detener }[accion] || (() => { throw new Error('Acción desconocida.'); }))();
}
const activo = () => !!s;
module.exports = { configurar, tocar, controlar, detener, activo, _pruebas: { listaDe, bajarAudio, CARPETA } };
