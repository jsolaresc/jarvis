// Escritorio remoto: el celular ve la pantalla de la PC (con su sonido) y la maneja tocando, como AnyDesk pero solo entre tu
// celular vinculado y tu PC. Va por WebRTC directo entre los dos (en casa, por la Wi-Fi; desde afuera, si las redes lo permiten),
// así que la imagen no pasa por ningún servidor. Se prende en Ajustes → Celular y mientras alguien mira, el notch lo muestra.
// La señalización (oferta/respuesta, sin "trickle") pasa por la API del celular: un solo pedido.
const { BrowserWindow, ipcMain, session, desktopCapturer, screen } = require('electron');
const path = require('path');

let ventana = null;
let lista = null;
let urlBase = '';
let ajustesDe = () => ({}); // () => { permitido, audio }
let avisar = () => {}; // (texto, cuantos) cuando alguien empieza o deja de mirar
let hacerRemoto = async () => {}; // (orden) mouse y teclado
let actual = null; // { id, quien, desde, pantalla, reloj, cursor }
const esperando = new Map(); // id → { ok, mal, reloj }

function configurar(f = {}) {
  if (f.urlBase) urlBase = f.urlBase;
  if (f.ajustes) ajustesDe = f.ajustes;
  if (f.avisar) avisar = f.avisar;
  if (f.remoto) hacerRemoto = f.remoto;
}

const pantallas = () => screen.getAllDisplays().map((d, i) => ({ n: i, id: d.id, principal: d.id === screen.getPrimaryDisplay().id, ancho: Math.round(d.bounds.width * d.scaleFactor), alto: Math.round(d.bounds.height * d.scaleFactor), nombre: `Pantalla ${i + 1}${d.id === screen.getPrimaryDisplay().id ? ' (principal)' : ''}` }));
const pantallaElegida = () => { const ds = screen.getAllDisplays(); return ds[actual && actual.pantalla] || screen.getPrimaryDisplay(); };

async function asegurarVentana() {
  if (ventana && !ventana.isDestroyed()) return lista;
  const sesion = session.fromPartition('escritorio');
  const propio = (url) => typeof url === 'string' && url.startsWith(urlBase);
  sesion.setPermissionRequestHandler((wc, permiso, responder) => responder((permiso === 'media' || permiso === 'display-capture') && propio(wc.getURL())));
  sesion.setPermissionCheckHandler((_wc, permiso, origen) => (permiso === 'media' || permiso === 'display-capture') && propio(`${origen}/`));
  sesion.setDisplayMediaRequestHandler(async (_pedido, responder) => {
    try {
      const d = pantallaElegida();
      const fuentes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const f = fuentes.find((x) => String(x.display_id) === String(d.id)) || fuentes[screen.getAllDisplays().findIndex((x) => x.id === d.id)] || fuentes[0];
      if (!f) { responder({}); return; }
      // El sonido de la PC (lo que suena en los parlantes) solo se puede tomar en Windows.
      responder(ajustesDe().audio !== false && process.platform === 'win32' ? { video: f, audio: 'loopback' } : { video: f });
    } catch { responder({}); }
  }, { useSystemPicker: false });
  ventana = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { preload: path.join(__dirname, 'preload.js'), session: sesion, backgroundThrottling: false } });
  ventana.on('closed', () => { ventana = null; lista = null; if (actual) terminar('se cerró la ventana'); });
  lista = new Promise((ok) => { ipcMain.once('escritorio:hola', ok); setTimeout(ok, 6000); });
  await ventana.loadURL(`${urlBase}/escritorio.html`);
  return lista;
}

// El celular manda su oferta; se devuelve la respuesta de la PC. Uno a la vez: si ya había alguien, se lo corta.
async function conectar({ sdp, pantalla = null, calidad = 'auto', afuera = false } = {}, quien = {}) {
  const a = ajustesDe();
  if (!a.permitido) throw Object.assign(new Error('El escritorio remoto está apagado en la PC: se prende en Ajustes → Dispositivos → Celular.'), { status: 403 });
  if (typeof sdp !== 'string' || !sdp.startsWith('v=') || sdp.length > 200000) throw Object.assign(new Error('Pedido inválido.'), { status: 400 });
  if (actual) terminar('entró otra conexión');
  const id = `e${Date.now().toString(36)}`;
  const ds = screen.getAllDisplays();
  actual = { id, quien: quien.nombre || 'El celular', desde: Date.now(), pantalla: Number.isInteger(pantalla) && ds[pantalla] ? pantalla : ds.indexOf(ds.find((d) => d.id === screen.getPrimaryDisplay().id)), empezo: false };
  await asegurarVentana();
  const respuesta = new Promise((ok, mal) => {
    const reloj = setTimeout(() => { esperando.delete(id); mal(Object.assign(new Error('La PC no pudo empezar a compartir la pantalla.'), { status: 504 })); }, 20000);
    esperando.set(id, { ok, mal, reloj });
  });
  ventana.webContents.send('escritorio:oferta', { id, sdp, calidad, afuera, audio: a.audio !== false && process.platform === 'win32' });
  try {
    const r = await respuesta;
    return { sdp: r.sdp, pantallas: pantallas(), pantalla: actual ? actual.pantalla : 0 };
  } catch (e) { if (actual && actual.id === id) terminar(''); throw e; }
}

function terminar(motivo = '') {
  const a = actual;
  actual = null;
  if (!a) return;
  if (a.cerrarAcceso) a.cerrarAcceso();
  clearInterval(a.cursor);
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send('escritorio:cortar', a.id);
  if (a.empezo) avisar(`${a.quien} dejó de ver tu pantalla${motivo ? ` (${motivo})` : ''}.`, 0);
  setTimeout(() => { if (!actual && ventana && !ventana.isDestroyed()) ventana.destroy(); }, 15000);
}

// Dónde está el mouse, en la pantalla que se comparte (de 0 a 1): el celular lo usa para seguirlo con el zoom.
function seguirCursor(a) {
  clearInterval(a.cursor);
  let ultimo = '';
  a.cursor = setInterval(() => {
    if (!actual || actual !== a || !ventana || ventana.isDestroyed()) { clearInterval(a.cursor); return; }
    const p = screen.getCursorScreenPoint(); const b = pantallaElegida().bounds;
    const x = (p.x - b.x) / b.width; const y = (p.y - b.y) / b.height;
    const texto = `${x.toFixed(4)},${y.toFixed(4)}`;
    if (texto !== ultimo) { ultimo = texto; ventana.webContents.send('escritorio:cursor', { x, y }); }
  }, 80);
}

// Lo que llega del celular por el canal de datos: mouse (en coordenadas de la pantalla compartida, de 0 a 1) y teclado.
function control(o = {}) {
  if (!actual || !o || typeof o.t !== 'string') return;
  const d = pantallaElegida();
  const todas = screen.getAllDisplays().map((x) => x.bounds);
  const v = { x: Math.min(...todas.map((b) => b.x)), y: Math.min(...todas.map((b) => b.y)) };
  v.ancho = Math.max(...todas.map((b) => b.x + b.width)) - v.x; v.alto = Math.max(...todas.map((b) => b.y + b.height)) - v.y;
  const absoluto = (x, y) => ({ nx: ((d.bounds.x + Math.max(0, Math.min(1, x)) * (d.bounds.width - 1) - v.x) / Math.max(1, v.ancho - 1)) * 65535, ny: ((d.bounds.y + Math.max(0, Math.min(1, y)) * (d.bounds.height - 1) - v.y) / Math.max(1, v.alto - 1)) * 65535 });
  const ordenes = {
    ir: () => ({ tipo: 'ir', ...absoluto(o.x, o.y) }),
    mover: () => ({ tipo: 'mover', dx: o.dx, dy: o.dy }),
    clic: () => ({ tipo: 'clic', boton: o.boton, doble: !!o.doble }),
    apretar: () => ({ tipo: 'apretar', soltar: !!o.soltar }),
    rueda: () => ({ tipo: 'rueda', cuanto: o.cuanto }),
    escribir: () => ({ tipo: 'escribir', texto: o.texto }),
    tecla: () => ({ tipo: 'tecla', tecla: o.tecla }),
    multimedia: () => ({ tipo: 'multimedia', tecla: o.tecla }),
  };
  if (o.t === 'pantalla') { cambiarPantalla(o.n); return; }
  const f = ordenes[o.t];
  if (f) { require('./acceso').pulso('control', actual.quien, 6000); hacerRemoto(f()).catch(() => {}); }
}

// Cambiar de pantalla sin cortar: se vuelve a pedir la captura y se reemplaza la pista de video.
function cambiarPantalla(n) {
  if (!actual) return;
  const ds = screen.getAllDisplays();
  if (!Number.isInteger(n) || !ds[n] || n === actual.pantalla) return;
  actual.pantalla = n;
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send('escritorio:pantalla', { n, pantallas: pantallas() });
}

ipcMain.on('escritorio:respuesta', (_e, id, r) => { const w = esperando.get(id); if (!w) return; esperando.delete(id); clearTimeout(w.reloj); if (r && r.error) w.mal(Object.assign(new Error(r.error), { status: 503 })); else w.ok(r); });
ipcMain.on('escritorio:conectado', (_e, id) => {
  if (!actual || actual.id !== id) return;
  actual.empezo = true;
  actual.cerrarAcceso = require('./acceso').abrir('pantalla', actual.quien);
  seguirCursor(actual);
  avisar(`${actual.quien} está viendo tu pantalla.`, 1);
});
ipcMain.on('escritorio:fin', (_e, id, motivo) => { if (actual && actual.id === id) terminar(motivo || ''); });
ipcMain.on('escritorio:control', (_e, id, o) => { if (actual && actual.id === id) control(o); });

const estado = () => ({ mirando: actual && actual.empezo ? { quien: actual.quien, desde: actual.desde } : null, pantallas: pantallas() });
function cortar() { terminar('cortado desde la PC'); }

module.exports = { configurar, conectar, terminar, cortar, estado, control, _actual: () => actual };
