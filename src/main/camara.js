// Cámara de seguridad para el celular: webcam y micrófono de la PC en vivo (WebM), solo para celulares vinculados
// y solo si está permitido en Ajustes → Celular. Mientras alguien mira, la PC lo muestra en el notch.
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let ventana = null;
let lista = null;
let urlBase = '';
let avisar = () => {}; // (texto) cuando alguien empieza o deja de mirar
let ajustesDe = () => ({}); // () => { permitido, camara, microfono }
const mirando = new Map(); // id -> { res, quien, desde, empezo }
const MAX = 3;

function configurar(f = {}) {
  if (f.urlBase) urlBase = f.urlBase;
  if (f.avisar) avisar = f.avisar;
  if (f.ajustes) ajustesDe = f.ajustes;
}
async function asegurarVentana() {
  if (ventana && !ventana.isDestroyed()) return lista;
  ventana = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false } });
  ventana.on('closed', () => { ventana = null; lista = null; for (const id of [...mirando.keys()]) terminar(id); });
  lista = new Promise((ok) => { ipcMain.once('camara:hola', ok); setTimeout(ok, 6000); });
  await ventana.loadURL(`${urlBase}/camara.html`);
  return lista;
}
function terminar(id, error) {
  const m = mirando.get(id);
  if (!m) return;
  mirando.delete(id);
  clearTimeout(m.reloj);
  try { if (error && !m.res.headersSent) { m.res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }); m.res.end(JSON.stringify({ error })); } else m.res.end(); } catch {}
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send('camara:parar', id);
  if (m.empezo) avisar(mirando.size ? null : `Dejaron de mirar la cámara de seguridad (${m.quien}).`, mirando.size);
  if (!mirando.size && ventana && !ventana.isDestroyed()) setTimeout(() => { if (!mirando.size && ventana && !ventana.isDestroyed()) ventana.destroy(); }, 20000);
}
ipcMain.on('camara:trozo', (_e, id, datos) => {
  const m = mirando.get(id);
  if (!m) return;
  try { m.res.write(Buffer.from(datos)); } catch { terminar(id); }
});
ipcMain.on('camara:lista', (_e, id, info) => {
  const m = mirando.get(id);
  if (!m) return;
  clearTimeout(m.reloj);
  m.empezo = true;
  m.res.writeHead(200, { 'Content-Type': info.tipo.split(';')[0], 'X-Jarvis-Codec': info.tipo, 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  m.res.flushHeaders && m.res.flushHeaders();
  avisar(`${m.quien} está mirando la cámara de seguridad${m.audio ? ' (con micrófono)' : ''}.`, mirando.size);
});
ipcMain.on('camara:error', (_e, id, texto) => terminar(id, texto));
ipcMain.on('camara:fin', (_e, id) => terminar(id));

// Un celular empieza a mirar: res queda abierta mientras dure.
async function mirar(res, { video = true, audio = true, calidad = 'normal' } = {}, quien = 'Un celular') {
  const a = ajustesDe();
  if (!a.permitido) throw Object.assign(new Error('La cámara de seguridad está apagada. Prendela en la PC: Ajustes → Dispositivos → Celular → Cámara de seguridad.'), { status: 403 });
  if (!video && !audio) throw Object.assign(new Error('Elegí ver, escuchar o las dos.'), { status: 400 });
  if (mirando.size >= MAX) throw Object.assign(new Error('Ya hay demasiados mirando la cámara.'), { status: 429 });
  await asegurarVentana();
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const m = { res, quien, desde: Date.now(), empezo: false, audio };
  m.reloj = setTimeout(() => terminar(id, 'La cámara no arrancó a tiempo.'), 15000);
  mirando.set(id, m);
  res.on('close', () => terminar(id));
  ventana.webContents.send('camara:empezar', { id, video, audio, calidad, camara: a.camara, microfono: a.microfono });
}
const estado = () => ({ mirando: [...mirando.values()].filter((m) => m.empezo).map((m) => ({ quien: m.quien, desde: m.desde, audio: m.audio })) });
function cortarTodo() { for (const id of [...mirando.keys()]) terminar(id); }

module.exports = { configurar, mirar, estado, cortarTodo };
