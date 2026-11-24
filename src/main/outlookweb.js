// Hotmail/Outlook por el navegador de Jarvis (experimental).
// Microsoft no deja que una app lea una cuenta personal con contraseña ni sin registrar una aplicación en Azure, así que acá se hace lo mismo
// que harías vos: una ventana de Chromium (la de Jarvis, separada de tu Chrome) entra a outlook.live.com con TU sesión y mira la bandeja.
//  - Vos iniciás sesión una sola vez, a mano, en una ventana visible: Jarvis no ve ni guarda tu contraseña (solo queda la sesión del navegador, en datos/).
//  - Para revisar, abre la bandeja en una ventana OCULTA cada unos minutos, lee la lista de mensajes y la cierra (así no gasta memoria).
//  - Es lectura de pantalla: si Microsoft cambia el diseño de la página, puede dejar de encontrar los mensajes (el botón "Probar" lo dice y guarda un diagnóstico).
const { leerConfig, guardarConfig, leerJSON, guardarJSON } = require('./config');

const URL_BANDEJA = process.env.JARVIS_URL_OUTLOOK_WEB || 'https://outlook.live.com/mail/0/inbox';
const PARTICION = 'persist:outlook';
const ENTRE_REVISIONES = process.env.JARVIS_URL_OUTLOOK_WEB ? 0 : 150 * 1000; // la página es pesada: no se abre más seguido que esto
let ultimaRevision = 0;
let sesionAbierta = null; // la ventana visible de inicio de sesión

// Lo que corre DENTRO de la página: junta las filas de la lista de mensajes.
const LEER_BANDEJA = `(() => {
  const host = location.hostname;
  const enLogin = /login\\.live\\.com|login\\.microsoftonline\\.com|account\\.microsoft\\.com|login\\.microsoft\\.com/.test(host)
    || !!document.querySelector('input[type="password"], input[name="loginfmt"]');
  const nodos = [...document.querySelectorAll('[role="listbox"] [role="option"], div[data-convid]')];
  const vistos = new Set(); const filas = [];
  for (const f of nodos) {
    const lineas = (f.innerText || '').split(/\\n+/).map((x) => x.trim()).filter(Boolean);
    if (!lineas.length) continue;
    if (lineas.length > 2 && lineas[0].length <= 2) lineas.shift(); // el círculo con la inicial del remitente no es el remitente
    const convid = f.getAttribute('data-convid') || f.getAttribute('data-item-id') || '';
    const etiqueta = f.getAttribute('aria-label') || '';
    let negrita = false;
    try { const t = f.querySelector('span, div'); negrita = !!t && parseInt(getComputedStyle(t).fontWeight, 10) >= 600; } catch (e) {}
    const sinLeer = /^(unread|no le[ií]do|sin leer|n[aã]o lida)/i.test(etiqueta) || /unread/i.test(f.className || '') || !!f.querySelector('[class*="unread" i], [aria-label*="unread" i], [aria-label*="no leído" i]') || negrita;
    const clave = [convid, lineas[0], lineas[1] || '', lineas[2] || ''].join('|');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    filas.push({ id: clave, de: lineas[0], asunto: lineas[1] || '', vista: lineas[2] || '', sinLeer });
  }
  const primera = nodos[0];
  return { url: location.href, titulo: document.title, enLogin, listas: document.querySelectorAll('[role="listbox"]').length, filas: filas.slice(0, 40),
    muestra: primera ? { aria: (primera.getAttribute('aria-label') || '').slice(0, 300), html: primera.outerHTML.slice(0, 600) } : null };
})()`;

// ---------- La ventana (Electron; las pruebas ponen una de mentira) ----------
function ventanaReal({ visible }) {
  const { BrowserWindow } = require('electron');
  const v = new BrowserWindow({
    show: !!visible, width: 1000, height: 760, autoHideMenuBar: true, title: 'Jarvis · Iniciar sesión en Outlook',
    webPreferences: { partition: PARTICION, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  v.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) v.loadURL(url); return { action: 'deny' }; });
  return v;
}
let crearVentana = ventanaReal;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function leer(ventana) {
  try { return await ventana.webContents.executeJavaScript(LEER_BANDEJA, true); } catch { return null; }
}
// Espera a que aparezca la lista de mensajes (o la pantalla de inicio de sesión).
async function esperarBandeja(ventana, limiteMs = 45000) {
  const hasta = Date.now() + limiteMs;
  let ultimo = null;
  while (Date.now() < hasta) {
    if (ventana.isDestroyed()) throw new Error('Se cerró la ventana.');
    ultimo = await leer(ventana);
    if (ultimo && (ultimo.enLogin || ultimo.filas.length)) {
      if (ultimo.filas.length) { await esperar(process.env.JARVIS_URL_OUTLOOK_WEB ? 50 : 1200); return (await leer(ventana)) || ultimo; } // un momento más: que termine de cargar la lista
      return ultimo;
    }
    await esperar(process.env.JARVIS_URL_OUTLOOK_WEB ? 80 : 1500);
  }
  return ultimo || { url: '', titulo: '', enLogin: false, listas: 0, filas: [], muestra: null };
}

const conectada = () => !!(leerConfig().correo.outlook || {}).web;
function marcarConectada(valor) {
  const c = leerConfig();
  guardarConfig({ ...c, correo: { ...c.correo, outlook: { ...c.correo.outlook, web: !!valor } } });
}

// ---------- Iniciar sesión (ventana visible; la contraseña la escribís vos) ----------
// alTerminar({ ok, error }) se llama cuando entraste (o cerraste la ventana).
function iniciarSesion(alTerminar = () => {}) {
  if (sesionAbierta && !sesionAbierta.isDestroyed()) { sesionAbierta.show(); sesionAbierta.focus(); return { yaAbierta: true }; }
  const v = crearVentana({ visible: true });
  sesionAbierta = v;
  let terminado = false;
  const terminar = (dato) => { if (terminado) return; terminado = true; clearInterval(reloj); sesionAbierta = null; try { if (!v.isDestroyed()) v.close(); } catch {} alTerminar(dato); };
  v.on('closed', () => terminar({ ok: false, error: 'Cerraste la ventana antes de terminar de entrar a Outlook.' }));
  v.loadURL(URL_BANDEJA).catch(() => {});
  const reloj = setInterval(async () => {
    if (v.isDestroyed()) return;
    const r = await leer(v);
    if (r && !r.enLogin && r.filas.length) { marcarConectada(true); terminar({ ok: true }); }
  }, 2000);
  return { yaAbierta: false };
}

function desconectar() {
  marcarConectada(false);
  const m = leerJSON('correo.json', {}) || {};
  delete m.outlookweb;
  guardarJSON('correo.json', m);
  try { return require('electron').session.fromPartition(PARTICION).clearStorageData(); } catch { return Promise.resolve(); }
}

// ---------- Revisar ----------
async function abrirYLeer() {
  const v = crearVentana({ visible: false });
  try {
    v.loadURL(URL_BANDEJA).catch(() => {});
    return await esperarBandeja(v);
  } finally { try { if (!v.isDestroyed()) v.destroy(); } catch {} }
}
function guardarDiagnostico(lectura) {
  try { guardarJSON('outlook-diagnostico.json', { cuando: new Date().toISOString(), url: lectura.url, titulo: lectura.titulo, listas: lectura.listas, filas: lectura.filas.length, muestra: lectura.muestra, primeras: lectura.filas.slice(0, 5) }); } catch {}
}
class SesionVencida extends Error { constructor() { super('la sesión de Outlook venció: iniciá sesión de nuevo (Ajustes → Cuentas → Mail)'); this.permiso = true; } }

// La identidad de un mail tiene que ser la misma siempre: el id de conversación de Outlook. Antes se usaba también el texto de la fila,
// y según cómo se dibujara la lista (con la inicial del remitente adelante o no) el mismo mail parecía nuevo cada vez que se abría Jarvis.
const ID_DE_OUTLOOK = /^[A-Za-z0-9+\/=_-]{20,}$/;
function estable(id) {
  const partes = String(id || '').split('|');
  if (ID_DE_OUTLOOK.test(partes[0])) return partes[0];
  const sinInicial = partes.length > 2 && partes[0].length <= 2 ? partes.slice(1) : partes; // "T|Temu|asunto" = "Temu|asunto"
  return sinInicial.slice(0, 2).join('|').toLowerCase();
}

// Devuelve los mails nuevos desde la última vez (la primera vez solo toma nota, como con Gmail).
async function revisar({ forzar = false } = {}) {
  if (!conectada()) return [];
  if (!forzar && Date.now() - ultimaRevision < ENTRE_REVISIONES) return [];
  ultimaRevision = Date.now();
  const lectura = await abrirYLeer();
  if (lectura.enLogin) { marcarConectada(false); throw new SesionVencida(); }
  if (!lectura.filas.length) { guardarDiagnostico(lectura); throw new Error('no encontré la lista de mensajes en la página (Microsoft pudo cambiar su diseño; guardé un diagnóstico en datos/outlook-diagnostico.json)'); }
  const memoria = leerJSON('correo.json', {}) || {};
  const previo = memoria.outlookweb;
  const ids = lectura.filas.map((f) => estable(f.id));
  memoria.outlookweb = { vistos: [...new Set([...(previo ? previo.vistos.map(estable) : []), ...ids])].slice(-600) };
  guardarJSON('correo.json', memoria);
  if (!previo) return []; // la primera vez no avisa de lo que ya estaba
  const sabeLeidos = lectura.filas.some((f) => f.sinLeer);
  const conocidos = new Set(previo.vistos.map(estable));
  return lectura.filas
    .filter((f) => !conocidos.has(estable(f.id)) && (f.sinLeer || !sabeLeidos))
    .reverse()
    .map((f) => ({ via: '', cuenta: 'outlook', uid: estable(f.id), de: f.de, direccion: '', asunto: f.asunto || '(sin asunto)', responderA: '', mensajeId: '' }));
}

async function probar() {
  if (!conectada()) throw new Error('Falta iniciar sesión en Outlook.');
  const lectura = await abrirYLeer();
  if (lectura.enLogin) { marcarConectada(false); throw new SesionVencida(); }
  guardarDiagnostico(lectura);
  if (!lectura.filas.length) throw new Error('entré a Outlook pero no encontré la lista de mensajes (guardé un diagnóstico en datos/outlook-diagnostico.json)');
  const sin = lectura.filas.filter((f) => f.sinLeer).length;
  return `Conectado: veo ${lectura.filas.length} mensajes en la bandeja${sin ? `, ${sin} sin leer` : ''}.`;
}

module.exports = { iniciarSesion, desconectar, revisar, probar, conectada, _pruebas: { ponerVentana: (f) => { crearVentana = f || ventanaReal; }, LEER_BANDEJA, reiniciar: () => { ultimaRevision = 0; } } };
