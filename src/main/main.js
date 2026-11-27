// Jarvis para Windows: proceso principal.
// Crea el notch (ventana transparente siempre encima), la bandeja, el atajo global,
// y conecta la interfaz con el cerebro de voz y las acciones.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, shell, session, nativeImage, Notification, desktopCapturer, dialog, powerSaveBlocker, clipboard } = require('electron');
const path = require('path');
const edicion = require('./edicion'); // antes que config: decide la carpeta de datos
const fs = require('fs');
const { spawn } = require('child_process');
const inicio = require('./inicio');
const { RAIZ, DATOS, panelDeModo, leerConfig, guardarConfig, leerJSON, guardarJSON, leerRutinas, guardarRutinas } = require('./config');
const servidor = require('./servidor');
const pc = require('./pc');
const cast = require('./cast');
const androidtv = require('./androidtv');
const calendario = require('./calendario');
const googleCal = require('./googlecal');
const clips = require('./clips');
const aprendido = require('./aprendido');
const ha = require('./homeassistant');
const whatsapp = require('./whatsapp');
const recordatorios = require('./recordatorios');
const notas = require('./notas');
const contexto = require('./contexto');
const musica = require('./musica');
const modelos = require('./modelos');
const oido = require('./oido');
const pensar = require('./pensar');
const notificaciones = require('./notificaciones');
const correo = require('./correo');
const conexion = require('./conexion');
const componentes = require('./componentes');
const actualizador = require('./actualizador');
const notasvoz = require('./notasvoz');
const vocesprop = require('./vocesprop');
const streaming = require('./streaming');
const historial = require('./historial');
const acciones = require('./acciones');
const cerebro = require('./cerebro');
const arranque = require('./arranque');
const celular = require('./celular');
const red = require('./red');
const camara = require('./camara');
const estadopc = require('./estadopc');
const disparadores = require('./disparadores');
const remoto = require('./remoto');
const descargas = require('./descargas');

const ANCHO = 380; // tamaño de la ventana del notch (la pastilla y el panel viven adentro)
const ALTO = 660;
const ALTO_PASTILLA = 40;
const PRUEBA = process.env.JARVIS_PRUEBA; // carpeta donde dejar capturas (solo para pruebas automáticas)

let urlBase = '';
let notch = null;
let ajustes = null;
let bandeja = null;
let relojFase = null;
const estado = { fase: 'reposo', texto: '', modo: 'normal', listo: false, orientacion: 'abajo', pegado: true };

// Un error inesperado no tiene que cerrar a Jarvis ni tapar la pantalla con un cartel: queda anotado
// en datos/errores.log (sirve para diagnosticar después) y la app sigue andando.
function anotarError(origen, error) {
  const texto = `${new Date().toISOString()} [${origen}] ${(error && (error.stack || error.message)) || error}\n`;
  console.error(texto.trim());
  try {
    const archivo = path.join(DATOS, 'errores.log');
    fs.mkdirSync(DATOS, { recursive: true });
    if (fs.existsSync(archivo) && fs.statSync(archivo).size > 500000) fs.renameSync(archivo, `${archivo}.viejo`);
    fs.appendFileSync(archivo, texto);
  } catch {}
}
process.on('uncaughtException', (e) => anotarError('principal', e));
process.on('unhandledRejection', (e) => anotarError('promesa', e));

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.env.JARVIS_MEDIOS_FALSOS) app.commandLine.appendSwitch('use-fake-device-for-media-stream'); // pruebas: cámara y micrófono de mentira
if (!app.requestSingleInstanceLock()) app.quit();

// ---------- Estado que ve el notch ----------
let habiaSesion = false; // para bajar la música mientras dura una conversación
// Mientras suena algo, Windows no apaga la pantalla por inactividad (sirve cuando una tele hace de segundo monitor y de parlante).
let bloqueoDePantalla = null;
function mantenerDespierta(sonando) {
  const quiere = !!sonando && (leerConfig().sistema || {}).mantenerPantalla !== false;
  if (quiere && bloqueoDePantalla === null) { try { bloqueoDePantalla = powerSaveBlocker.start('prevent-display-sleep'); } catch {} }
  else if (!quiere && bloqueoDePantalla !== null) { try { powerSaveBlocker.stop(bloqueoDePantalla); } catch {} bloqueoDePantalla = null; }
}
function publicarEstado() {
  const c = leerConfig();
  estado.modo = c.modo;
  estado.listo = cerebro.puedeEscuchar();
  estado.descarga = resumenDescarga();
  estado.avisos = notificaciones.resumen().slice(0, 12);
  estado.puntoDeAvisos = c.notificaciones.estilo !== 'burbuja';
  estado.musica = musica.estado();
  mantenerDespierta(estado.musica.sonando);
  oido.modoMusica(estado.musica.sonando); // con música sonando, "Hey Jarvis" se busca de otra manera
  estado.clips = clips.estado();
  estado.panel = panelDeModo((c.modos || []).find((m) => m.id === c.modo));
  estado.agenda = calendario.proximos(2);
  estado.conexion = conexion.estado();
  estado.sesion = cerebro.activa();
  if (estado.sesion !== habiaSesion) { habiaSesion = estado.sesion; musica.atenuar(estado.sesion); }
  if (notch && !notch.isDestroyed()) notch.webContents.send('estado', estado);
}

// ---------- Modelos de voz locales (se bajan una sola vez) ----------
// Lo mínimo para escuchar y contestar hablando: el detector de voz, el modelo de escucha y la voz elegida.
function esenciales() {
  const voz = modelos.idDeVoz(leerConfig().habla.voz);
  return ['vad', 'oido', ...(voz ? [voz] : [])];
}
function resumenDescarga() {
  const e = modelos.estado();
  const ids = esenciales();
  const faltan = ids.filter((id) => !e[id].instalado);
  const enCurso = ids.map((id) => e[id]).find((x) => x.bajando);
  return {
    faltan: faltan.length,
    mb: faltan.reduce((n, id) => n + e[id].mb, 0),
    bajando: enCurso ? { nombre: enCurso.nombre, fase: enCurso.bajando.fase, porcentaje: enCurso.bajando.total ? Math.floor((enCurso.bajando.hecho / enCurso.bajando.total) * 100) : 0 } : null,
    error: ids.map((id) => e[id].error).find(Boolean) || null,
  };
}
let bajandoEsenciales = null;
// Traer los datos de otro Jarvis (por ejemplo, el portable de antes): se copian a "datos-importar" y se ponen
// en su lugar al próximo arranque (ver edicion.js), así nada de lo que está abierto ahora los pisa al cerrar.
function importarDatos(origen) {
  let desde = path.resolve(String(origen || ''));
  if (fs.existsSync(path.join(desde, 'datos', 'config.json')) || fs.existsSync(path.join(desde, 'datos', 'rutinas.json'))) desde = path.join(desde, 'datos');
  if (!fs.existsSync(path.join(desde, 'config.json')) && !fs.existsSync(path.join(desde, 'rutinas.json'))) throw new Error('Esa carpeta no parece la de datos de Jarvis (no tiene config.json). Elegí la carpeta "datos" que está al lado del Jarvis.exe anterior.');
  if (path.resolve(desde) === path.resolve(DATOS)) throw new Error('Esa es la carpeta que ya está usando este Jarvis.');
  const destino = path.join(path.dirname(DATOS), 'datos-importar');
  fs.rmSync(destino, { recursive: true, force: true });
  let n = 0;
  fs.cpSync(desde, destino, { recursive: true, filter: (o) => { const b = path.basename(o); const ok = !/^(clips-buffer|datos-importar)$/.test(b) && !/\.(log|tmp|roto|parte|parte\.mp4)$/.test(b); if (ok) n++; return ok; } });
  return n;
}

function bajarEsenciales() {
  if (!bajandoEsenciales) {
    bajandoEsenciales = modelos.bajarVarios(esenciales())
      .then(() => cerebro.preparar())
      .then(() => { publicarEstado(); decir(`Listo, ya te puedo escuchar. Decí "${require('./nombre').actual()}" y pedime algo.`); })
      .catch((e) => anotarError('modelos', e))
      .finally(() => { bajandoEsenciales = null; publicarEstado(); });
  }
  return bajandoEsenciales;
}

// ---------- Notificaciones (WhatsApp entrante y mails) ----------
// Cómo se avisa cuando llega algo: burbuja (según el estilo elegido) y, si la regla lo pide, en voz alta.
function avisarNovedad(n, accion, sonido) {
  const titulo = n.origen === 'nota' ? `Recordatorio: ${n.texto}` : n.origen === 'calendario' ? `${n.de}: ${n.texto}` : n.origen === 'mail' ? `Mail de ${n.de}: ${n.asunto}` : `${n.grupo ? `${n.de} en ${n.grupo}` : n.de}: ${n.texto}`;
  if (n.origen !== 'nota' && leerConfig().notificaciones.estilo !== 'punto' && notch && !notch.isDestroyed()) notch.webContents.send('decir', { texto: titulo, voz: false }); // el recordatorio ya tiene su propia burbuja
  if (sonido && !enSilencio() && notch && !notch.isDestroyed()) notch.webContents.send('sonido', sonido);
  if (accion === 'decir' && !cerebro.activa()) {
    cerebro.hablar(n.origen === 'calendario' ? `${n.de}. ${n.texto}` : n.origen === 'mail' ? `Te llegó un mail de ${n.de}: ${n.asunto}` : `Mensaje de ${n.grupo ? `${n.de}, en ${n.grupo}` : n.de}: ${n.texto}`).catch(() => {});
  }
}

// Fases: reposo | escuchando | pensando | hablando | ok | error | alerta
// "ok" se queda al menos un instante a la vista aunque enseguida venga otro estado (hablando, escuchando…):
// el estado que sigue espera lo que falte. Los errores y las alertas no esperan.
const MS_OK = 950;
let okDesde = 0;
let relojEspera = null;
function fase(nueva, texto = '') {
  const falta = MS_OK - (Date.now() - okDesde);
  if (estado.fase === 'ok' && nueva !== 'ok' && nueva !== 'error' && nueva !== 'alerta' && falta > 0) {
    clearTimeout(relojEspera);
    relojEspera = setTimeout(() => fase(nueva, texto), falta);
    return;
  }
  clearTimeout(relojEspera);
  clearTimeout(relojFase);
  if (nueva === 'ok') okDesde = Date.now();
  estado.fase = nueva;
  estado.texto = texto;
  clips.jarvisHabla(nueva === 'hablando'); // la voz de Jarvis no sale en los clips
  publicarEstado();
  if (['ok', 'error', 'alerta'].includes(nueva)) {
    relojFase = setTimeout(() => fase(cerebro.activa() ? 'escuchando' : 'reposo'), nueva === 'ok' ? 2200 : 5000);
  }
}

// El modo actual se busca en config.modos (el usuario los edita en Ajustes); si no está, se asume normal.
function modoActual() {
  const c = leerConfig();
  return (c.modos || []).find((m) => m.id === c.modo) || { habla: true, visible: true };
}
const enSilencio = () => !modoActual().habla;
const escondido = () => !modoActual().visible;

function fijarModo(modo) {
  if (!acciones.idsDeModos().includes(modo)) return;
  guardarConfig({ ...leerConfig(), modo });
  if (enSilencio() && notch) notch.webContents.send('voz:cortar');
  aplicarVisibilidad();
  clips.sincronizar().then(publicarEstado);
  publicarEstado();
  armarBandeja();
}

function aplicarVisibilidad() {
  if (!notch || notch.isDestroyed()) return;
  if (escondido()) notch.hide();
  else if (!notch.isVisible()) { notch.showInactive(); notch.setAlwaysOnTop(true, 'screen-saver'); }
}

// Jarvis dice algo por su cuenta (rutinas por click, recordatorios): burbuja + voz.
function decir(texto) {
  if (notch && !notch.isDestroyed()) notch.webContents.send('decir', { texto, voz: false });
  cerebro.hablar(texto).catch((e) => console.error('[voz]', e.message));
}

// La voz de Windows suena en el notch; acá se espera a que termine de hablar (o a un tiempo prudente).
const vocesEnCurso = new Map();
let numeroDeVoz = 0;
function vozDeWindows(texto) {
  return new Promise((listo) => {
    if (!notch || notch.isDestroyed()) { listo(); return; }
    const id = ++numeroDeVoz;
    const reloj = setTimeout(() => { vocesEnCurso.delete(id); listo(); }, Math.min(60000, 2500 + texto.length * 110));
    vocesEnCurso.set(id, () => { clearTimeout(reloj); vocesEnCurso.delete(id); listo(); });
    notch.webContents.send('decir', { texto, voz: true, burbuja: false, id });
  });
}
ipcMain.on('voz:fin', (_e, id) => { const fin = vocesEnCurso.get(id); if (fin) fin(); });

// Los programas del menú Inicio (para "abrí tal cosa"): leerlos tarda, así que se guardan un rato.
let programasConocidos = { cuando: 0, nombres: [] };
function programas() {
  if (Date.now() - programasConocidos.cuando > 5 * 60000) {
    programasConocidos.cuando = Date.now();
    try { programasConocidos.nombres = pc.listarProgramas().map((p) => p.nombre); } catch { /* fuera de Windows no hay menú Inicio */ }
  }
  return programasConocidos.nombres;
}

// ---------- Pedidos al notch (foto de la webcam, grabar audio) ----------
const pedidos = new Map();
let numeroPedido = 0;
function pedirAlNotch(tipo, datos, espera = 20000) {
  return new Promise((ok, mal) => {
    if (!notch || notch.isDestroyed()) { mal(new Error('El notch no está disponible.')); return; }
    const id = ++numeroPedido;
    const reloj = setTimeout(() => { pedidos.delete(id); mal(new Error('El pedido tardó demasiado.')); }, espera);
    pedidos.set(id, { ok, mal, reloj });
    notch.webContents.send('pedido', { id, tipo, datos });
  });
}
ipcMain.on('respuesta', (_e, { id, dato, error }) => {
  const p = pedidos.get(id);
  if (!p) return;
  pedidos.delete(id);
  clearTimeout(p.reloj);
  if (error) p.mal(new Error(error)); else p.ok(dato);
});

// ---------- Ventana del notch ----------
function pantallaDe(punto) { return screen.getDisplayNearestPoint(punto); }

function anclaInicial() {
  const p = screen.getPrimaryDisplay().bounds;
  return { x: Math.round(p.x + p.width / 2), y: p.y };
}

// El "ancla" es el centro del borde superior de la pastilla. La ventana se acomoda alrededor:
// si la pastilla está en la mitad de arriba de la pantalla el panel se abre hacia abajo; si no, hacia arriba.
function ubicarNotch(guardar = false) {
  if (!notch || notch.isDestroyed()) return;
  const c = leerConfig();
  const escala = Math.max(0.7, Math.min(1.6, Number(c.apariencia.escala) || 1));
  const ancho = Math.round(ANCHO * escala);
  const alto = Math.round(ALTO * escala);
  const altoPastilla = Math.round(ALTO_PASTILLA * escala);
  let ancla = c.ancla || anclaInicial();
  const limites = pantallaDe(ancla).bounds;
  // La pastilla sí puede llegar casi hasta el borde (solo un margen chico, estético).
  const margenBorde = Math.round(10 * escala);
  ancla = {
    x: Math.round(Math.max(limites.x + margenBorde, Math.min(limites.x + limites.width - margenBorde, ancla.x))),
    y: Math.round(Math.max(limites.y, Math.min(limites.y + limites.height - altoPastilla, ancla.y))),
  };
  estado.pegado = ancla.y <= limites.y + 2;
  estado.orientacion = ancla.y < limites.y + limites.height / 2 ? 'abajo' : 'arriba';
  const y = estado.orientacion === 'abajo' ? ancla.y : ancla.y + altoPastilla - alto;
  // La ventana (ancho completo, para que el panel pueda abrirse sin mover ni redimensionar nada)
  // se sigue centrando en el ancla cuando hay lugar, pero cerca de un borde se desliza para quedar
  // siempre entera adentro de la pantalla — ahí la pastilla deja de estar en el centro de la
  // ventana, así que le mandamos al notch dónde cae exactamente (en píxeles "de CSS", sin la
  // escala: la ventana usa zoom para la escala, así que esa es la unidad con la que trabaja).
  const ventanaXIdeal = Math.round(ancla.x - ancho / 2);
  const ventanaX = Math.max(limites.x, Math.min(limites.x + limites.width - ancho, ventanaXIdeal));
  notch.setBounds({ x: ventanaX, y, width: ancho, height: alto });
  estado.pastillaX = Math.round((ancla.x - ventanaX) / escala);
  if (guardar) guardarConfig({ ...c, ancla: estado.pegado && Math.abs(ancla.x - anclaInicial().x) < 12 ? null : ancla });
  publicarEstado();
  return ancla;
}

function crearNotch() {
  notch = new BrowserWindow({
    width: ANCHO, height: ALTO, show: false,
    frame: false, transparent: true, resizable: false, movable: false, hasShadow: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, maximizable: false, minimizable: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  notch.setAlwaysOnTop(true, 'screen-saver');
  notch.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notch.setIgnoreMouseEvents(true, { forward: true }); // lo transparente deja pasar los clicks
  protegerDeCapturas();
  notch.loadURL(`${urlBase}/notch.html`);
  notch.webContents.on('did-finish-load', () => {
    ubicarNotch();
    notch.webContents.send('config', configPublica());
    notch.webContents.send('rutinas', leerRutinas());
    aplicarVisibilidad();
    publicarEstado();
  });
  notch.on('closed', () => { notch = null; });
}

// La ventana ocupa más que la pastilla: solo captura el mouse cuando está sobre algo dibujado.
ipcMain.on('notch:raton', (_e, encima) => {
  if (notch && !notch.isDestroyed()) notch.setIgnoreMouseEvents(!encima, { forward: true });
});

let arrastre = null;
ipcMain.on('notch:arrastre', (_e, d) => {
  if (!notch) return;
  if (!arrastre) arrastre = leerConfig().ancla || anclaInicial();
  const c = leerConfig();
  c.ancla = { x: arrastre.x + d.dx, y: arrastre.y + d.dy };
  ubicarNotch();
  if (d.fin) { arrastre = null; ubicarNotch(true); }
});
ipcMain.on('notch:centrar', () => { guardarConfig({ ...leerConfig(), ancla: null }); ubicarNotch(); });

// Los ojos siguen al cursor: le avisamos al notch dónde está respecto de la pastilla.
function seguirCursor() {
  let ultimo = '';
  setInterval(() => {
    if (!notch || notch.isDestroyed() || !notch.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    const ancla = leerConfig().ancla || anclaInicial();
    const dx = cursor.x - ancla.x;
    const dy = cursor.y - (ancla.y + ALTO_PASTILLA / 2);
    const clave = `${dx >> 3},${dy >> 3}`;
    if (clave === ultimo) return;
    ultimo = clave;
    notch.webContents.send('cursor', { dx, dy });
  }, 90);
}

// ---------- Ventana de ajustes ----------
// El tamaño y la posición de la ventana de Ajustes se recuerdan (datos/ventana-ajustes.json) y se
// restauran al abrirla, siempre que todavía caigan dentro de alguna pantalla.
function limitesGuardados() {
  const g = leerJSON('ventana-ajustes.json', null);
  if (!g || !(g.width >= 560) || !(g.height >= 480)) return null;
  const visible = typeof g.x === 'number' && typeof g.y === 'number' && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return g.x + 120 < a.x + a.width && g.x + g.width - 120 > a.x && g.y + 40 < a.y + a.height && g.y > a.y - 40;
  });
  return { width: g.width, height: g.height, ...(visible ? { x: g.x, y: g.y } : {}), maximizada: !!g.maximizada };
}
function recordarVentanaAjustes() {
  if (!ajustes || ajustes.isDestroyed() || ajustes.isMinimized() || !ajustes.isVisible()) return;
  const maximizada = ajustes.isMaximized();
  const b = ajustes.getNormalBounds();
  try { guardarJSON('ventana-ajustes.json', { x: b.x, y: b.y, width: b.width, height: b.height, maximizada }); } catch {}
}
function abrirAjustes(seccion) {
  if (ajustes && !ajustes.isDestroyed()) {
    ajustes.show(); ajustes.focus();
    if (seccion) ajustes.loadURL(`${urlBase}/ajustes.html#${seccion}`); // ya abierta: solo cambia de pantalla
    return;
  }
  const guardados = limitesGuardados();
  ajustes = new BrowserWindow({
    width: 1000, height: 720, ...(guardados ? { width: guardados.width, height: guardados.height, ...(guardados.x !== undefined ? { x: guardados.x, y: guardados.y } : {}) } : {}),
    minWidth: 560, minHeight: 480, title: require('./nombre').actual(),
    autoHideMenuBar: true, backgroundColor: '#101114', icon: icono(),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  if (guardados && guardados.maximizada) ajustes.maximize();
  try { ajustes.setContentProtection(false); } catch {}
  // Si la página no carga o se cae, se anota en el historial (y la ventana se recarga una vez) en vez de quedar en negro sin explicación.
  let recargas = 0;
  ajustes.webContents.on('render-process-gone', (_e, d) => { historial.anotar(`Ajustes se cerró solo (${d.reason}).`, { error: true }); if (recargas++ < 1 && ajustes && !ajustes.isDestroyed()) ajustes.reload(); });
  ajustes.webContents.on('did-fail-load', (_e, codigo, texto, url) => { if (codigo !== -3) historial.anotar(`Ajustes no cargó (${texto}, ${url}).`, { error: true }); });
  ajustes.webContents.on('console-message', (e, nivel, mensaje) => { if ((e.level ? e.level === 'error' : nivel >= 3)) historial.anotar(`Error en Ajustes: ${e.message || mensaje}`, { error: true }); });
  ajustes.loadURL(`${urlBase}/ajustes.html${seccion ? `#${seccion}` : ''}`);
  ajustes.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // Minimizar la manda a la barra de tareas como cualquier programa; la X la cierra y Jarvis sigue en la bandeja.
  let relojTamano = null;
  const pronto = () => { clearTimeout(relojTamano); relojTamano = setTimeout(recordarVentanaAjustes, 400); };
  for (const evento of ['resize', 'move', 'maximize', 'unmaximize']) ajustes.on(evento, pronto);
  ajustes.on('close', () => { clearTimeout(relojTamano); recordarVentanaAjustes(); });
  ajustes.on('closed', () => { ajustes = null; });
}

// ---------- Bandeja, atajo e inicio con Windows ----------
let iconoCache = null;
function icono() {
  if (!iconoCache) iconoCache = nativeImage.createFromPath(path.join(RAIZ, 'src', 'ui', 'icono.png'));
  return iconoCache;
}

function armarBandeja() {
  if (!bandeja) {
    try { bandeja = new Tray(icono().resize({ width: 16, height: 16 })); } catch { return; }
    bandeja.setToolTip(require('./nombre').actual());
    bandeja.on('click', () => { if (escondido()) fijarModo('normal'); else hablar(); });
    bandeja.on('double-click', () => abrirAjustes());
  }
  const c = leerConfig();
  const modo = (m) => ({ label: m.nombre, type: 'radio', checked: c.modo === m.id, click: () => fijarModo(m.id) });
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: 'Hablar con Jarvis', accelerator: c.atajoHablar || undefined, click: hablar },
    { type: 'separator' },
    ...(c.modos || []).map(modo),
    { type: 'separator' },
    { label: 'Abrir Jarvis…', click: () => abrirAjustes() },
    { label: 'Notas', click: () => abrirAjustes('notas') },
    { label: 'Clips', click: () => abrirAjustes('clips') },
    { label: 'Modo sin conexión', type: 'checkbox', checked: conexion.manual(), click: (item) => { conexion.fijarManual(item.checked); armarBandeja(); } },
    { label: 'Volver el notch al centro', click: () => { guardarConfig({ ...leerConfig(), ancla: null }); ubicarNotch(); } },
    { label: 'Ocultar a Jarvis en clips y capturas', type: 'checkbox', checked: c.clips.sinJarvis !== false, click: (item) => { const x = leerConfig(); guardarConfig({ ...x, clips: { ...x.clips, sinJarvis: item.checked } }); protegerDeCapturas(); if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('config', configPublica()); } },
    { label: 'Iniciar con Windows', type: 'checkbox', checked: !!c.inicioConWindows, click: (item) => { guardarConfig({ ...leerConfig(), inicioConWindows: item.checked }); aplicarInicio(); } },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ]));
}

let atajoActual = '';
function aplicarAtajo() {
  const atajo = leerConfig().atajoHablar || '';
  if (atajo === atajoActual) return;
  if (atajoActual) { try { globalShortcut.unregister(atajoActual); } catch {} }
  atajoActual = '';
  if (!atajo) return;
  try { if (globalShortcut.register(atajo, hablar)) atajoActual = atajo; } catch {}
}

function aplicarInicio() {
  if (process.platform !== 'win32' || PRUEBA || edicion.B) return; // Jarvis B no se registra al iniciar Windows (no pisa al original)
  try {
    // Empaquetado como portable, process.execPath apunta a la copia temporal donde se
    // descomprime (dentro de %TEMP%), no al Jarvis.exe que el usuario ve y ejecuta: si se usara
    // ese para "Iniciar con Windows" quedaría atado a una copia vieja o inestable. El propio
    // lanzador portable deja la ruta real en esta variable de entorno antes de arrancar la app.
    const exePortable = process.env.PORTABLE_EXECUTABLE_FILE;
    const ruta = exePortable || process.execPath;
    // El argumento de carpeta solo tiene sentido en desarrollo (electron .). Va SIN comillas: Electron ya las
    // agrega, y con comillas de más Windows buscaba una carpeta llamada "\"F:\..." y fallaba al iniciar.
    const argumentos = exePortable ? [] : [RAIZ];
    // Primero se borran las entradas rotas que dejó una versión anterior (el error "Unable to find Electron app").
    inicio.limpiarEntradasRotas().catch(() => {}).then(() => {
      app.setLoginItemSettings({ openAtLogin: !!leerConfig().inicioConWindows, path: ruta, args: argumentos });
    });
  } catch (e) { console.error('[inicio]', e.message); }
}

// ---------- Abrir páginas (streaming) ----------
// Por defecto, el navegador predeterminado de Windows. Si en Ajustes se eligió Chrome (porque ahí
// están las sesiones iniciadas), se lo abre directamente aunque el predeterminado sea otro.
function rutaDeChrome() {
  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  return bases.map((b) => path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe')).find((r) => fs.existsSync(r)) || null;
}
async function abrirEnNavegador(url) {
  if (/^https?:\/\//i.test(url) && leerConfig().streaming.navegador === 'chrome') {
    const chrome = rutaDeChrome();
    if (chrome) {
      const hijo = spawn(chrome, [url], { detached: true, stdio: 'ignore' });
      hijo.on('error', () => shell.openExternal(url));
      hijo.unref();
      return;
    }
  }
  await shell.openExternal(url);
}

// ---------- Clips: la ventana oculta que captura la pantalla ----------
let ventanaClips = null;
let fuenteSiguiente = null; // id de la pantalla o ventana que la próxima captura (grabación aparte) tiene que usar
function ordenarClips(orden, config) {
  if (orden === 'grabar' && config && config.fuenteId) fuenteSiguiente = config.fuenteId;
  if (ventanaClips && !ventanaClips.isDestroyed()) ventanaClips.webContents.send('clips:orden', { orden, config });
}
async function abrirVentanaClips() {
  if (ventanaClips && !ventanaClips.isDestroyed()) return;
  const sesion = session.fromPartition('clips');
  const propio = (url) => typeof url === 'string' && url.startsWith(urlBase);
  const permitido = (p) => p === 'media' || p === 'display-capture';
  sesion.setPermissionRequestHandler((wc, permiso, responder) => responder(permitido(permiso) && propio(wc.getURL())));
  sesion.setPermissionCheckHandler((_wc, permiso, origen) => permitido(permiso) && propio(`${origen}/`));
  sesion.setDisplayMediaRequestHandler(async (_pedido, responder) => {
    try {
      const c = leerConfig().clips;
      if (fuenteSiguiente) {
        const id = fuenteSiguiente; fuenteSiguiente = null;
        const todas = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
        const f = todas.find((x) => x.id === id);
        if (!f) { responder({}); return; }
        responder(c.sistema && process.platform === 'win32' ? { video: f, audio: 'loopback' } : { video: f });
        return;
      }
      const fuentes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const pantallas = screen.getAllDisplays();
      const elegida = pantallas[c.pantalla] || screen.getPrimaryDisplay();
      const fuente = fuentes.find((f) => String(f.display_id) === String(elegida.id)) || fuentes[0];
      if (!fuente) { responder({}); return; }
      responder(c.sistema && process.platform === 'win32' ? { video: fuente, audio: 'loopback' } : { video: fuente }); // el sonido de Windows: solo ahí existe
    } catch { responder({}); }
  }, { useSystemPicker: false });
  ventanaClips = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { preload: path.join(__dirname, 'preload.js'), session: sesion, backgroundThrottling: false } });
  ventanaClips.on('closed', () => { ventanaClips = null; });
  const lista = new Promise((ok) => ipcMain.once('clips:lista', ok));
  await ventanaClips.loadURL(`${urlBase}/clips.html`);
  await Promise.race([lista, new Promise((ok) => setTimeout(ok, 5000))]);
}
ipcMain.on('clips:pedazo', (_e, meta, datos) => clips.recibirPedazo(meta, datos));
ipcMain.on('clips:trozo', (_e, meta, datos) => clips.recibirTrozo(meta, datos));
ipcMain.on('clips:trozo-fin', () => clips.finDeTrozos());
ipcMain.on('clips:captura', (_e, e) => { clips.recibirEstado(e); publicarEstado(); });
ipcMain.on('clips:error', (_e, { mensaje }) => { avisarClip(mensaje, 'error'); });
function avisarClip(texto, tipo) {
  if (notch && !notch.isDestroyed()) {
    notch.webContents.send('decir', { texto, voz: false });
    if (tipo === 'ok' && !enSilencio()) notch.webContents.send('sonido', 'ascendente');
  }
  publicarEstado();
}
ipcMain.on('clips:grabacion-fallo', (_e, { mensaje }) => { clips.cancelarGrabacion(); avisarClip(mensaje || 'No pude empezar a grabar.', 'error'); });
// Se cerró la ventana que se estaba grabando: se termina y se guarda lo grabado hasta ahí.
ipcMain.on('clips:grabacion-cortada', async () => {
  try { avisarClip(await acciones.ejecutarPaso({ tipo: 'clip', accion: 'parar' }, { porVoz: false }), 'ok'); } catch (e) { avisarClip(e.message, 'error'); }
});

// ---------- Elegir qué grabar: pantalla, ventana o recuadro ----------
let seleccion = null; // { resolver, datos }
ipcMain.on('selector:elegir', (e, r) => { if (seleccion) seleccion.resolver({ ...(r || { cancelar: true }), origen: e.sender.id }); });
function esperarSeleccion(ventanas, datos) {
  return new Promise((ok) => {
    let listo = false;
    const terminar = (r) => { if (listo) return; listo = true; seleccion = null; for (const v of ventanas) { try { if (!v.isDestroyed()) v.destroy(); } catch {} } ok(r); };
    seleccion = { resolver: terminar, datos };
    for (const v of ventanas) v.on('closed', () => terminar({ cancelar: true }));
  });
}
const numeroDePantalla = (d) => screen.getAllDisplays().findIndex((x) => x.id === d.id) + 1;
async function fuenteDePantalla(display) {
  const fuentes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  return fuentes.find((f) => String(f.display_id) === String(display.id)) || fuentes[numeroDePantalla(display) - 1] || fuentes[0];
}
// La pantalla que ya está capturando la repetición instantánea (Ajustes → Clips → "Pantalla de los clips").
function esLaDeLosClips(display) {
  const todas = screen.getAllDisplays();
  const delBuffer = todas[leerConfig().clips.pantalla] || screen.getPrimaryDisplay();
  return delBuffer.id === display.id;
}
async function elegirFuenteDeGrabacion(modo) {
  if (seleccion) throw new Error('Ya estoy esperando que elijas qué grabar.');
  const pantallas = screen.getAllDisplays();
  const sinAnillo = { frame: true, autoHideMenuBar: true, alwaysOnTop: true, minimizable: false, backgroundColor: '#14171d', webPreferences: { preload: path.join(__dirname, 'preload.js') } };
  if (modo === 'recuadro') {
    const capas = pantallas.map((d) => {
      const v = new BrowserWindow({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, frame: false, transparent: true, backgroundColor: '#00000000', skipTaskbar: true, alwaysOnTop: true, resizable: false, movable: false, hasShadow: false, show: false, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
      v.setAlwaysOnTop(true, 'screen-saver');
      v.loadURL(`${urlBase}/selector.html?recuadro=1`);
      v.once('ready-to-show', () => { v.show(); v.focus(); });
      v.display = d; v.idContenido = v.webContents.id;
      return v;
    });
    const espera = esperarSeleccion(capas, { titulo: '', items: [] });
    // La respuesta trae el id de la capa donde se arrastró: de ahí sale la pantalla.
    const r = await espera;
    if (r.cancelar || !r.recorte) return null;
    const origen = capas.find((v) => v.idContenido === r.origen);
    const d = (origen && origen.display) || screen.getPrimaryDisplay();
    await new Promise((ok) => setTimeout(ok, 250)); // que la capa oscura ya no esté cuando empieza la captura
    const f = await fuenteDePantalla(d);
    if (!f) throw new Error('No pude capturar esa pantalla.');
    return { fuenteId: f.id, recorte: r.recorte, nombre: 'el recuadro' };
  }
  let items;
  let titulo;
  if (modo === 'pantalla') {
    if (pantallas.length < 2) return { clips: true, nombre: 'la pantalla' };
    // Con varias pantallas: la que se eligió en Ajustes → Clips ("Pantalla que graba el botón"), o se pregunta cada vez.
    const pref = leerConfig().clips.grabarPantalla;
    if (pref !== 'preguntar') {
      const n = Number(pref);
      const d = Number.isInteger(n) && n >= 1 && pantallas[n - 1] ? pantallas[n - 1] : screen.getPrimaryDisplay();
      const nombre = d.id === screen.getPrimaryDisplay().id ? 'la pantalla principal' : `la pantalla ${numeroDePantalla(d)}`;
      // Si es la misma pantalla que ya capturan los clips, se graba esa captura (no se abre una segunda: gasta mucho menos).
      if (esLaDeLosClips(d)) return { clips: true, nombre };
      const f = await fuenteDePantalla(d);
      if (!f) throw new Error('No pude capturar esa pantalla.');
      return { fuenteId: f.id, nombre };
    }
    const fuentes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 180 } });
    items = pantallas.map((d, i) => {
      const f = fuentes.find((x) => String(x.display_id) === String(d.id)) || fuentes[i];
      return f ? { id: f.id, displayId: d.id, nombre: `Pantalla ${i + 1}${d.id === screen.getPrimaryDisplay().id ? ' (principal)' : ''} · ${Math.round(d.size.width * d.scaleFactor)}×${Math.round(d.size.height * d.scaleFactor)}`, miniatura: f.thumbnail.toDataURL() } : null;
    }).filter(Boolean);
    titulo = 'Elegí la pantalla que querés grabar';
  } else {
    const fuentes = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 320, height: 180 } });
    items = fuentes.filter((f) => f.name && f.name.trim() && !/^jarvis\b/i.test(f.name) && f.name !== 'Program Manager')
      .map((f) => ({ id: f.id, nombre: f.name, miniatura: f.thumbnail.isEmpty() ? '' : f.thumbnail.toDataURL() }));
    titulo = 'Elegí la ventana que querés grabar';
  }
  if (!items.length) throw new Error(modo === 'ventana' ? 'No encuentro ventanas para grabar.' : 'No encuentro pantallas para grabar.');
  const ventana = new BrowserWindow({ ...sinAnillo, width: 760, height: 540, minWidth: 420, minHeight: 360, title: 'Jarvis · elegir qué grabar', icon: icono(), parent: undefined, show: false });
  ventana.setMenu(null);
  ventana.loadURL(`${urlBase}/selector.html`);
  ventana.once('ready-to-show', () => { ventana.show(); ventana.focus(); });
  const r = await esperarSeleccion([ventana], { titulo, items });
  if (r.cancelar || !r.id) return null;
  const elegido = items.find((i) => i.id === r.id);
  if (modo === 'pantalla' && elegido && elegido.displayId !== undefined) {
    const d = pantallas.find((x) => x.id === elegido.displayId);
    if (d && esLaDeLosClips(d)) return { clips: true, nombre: elegido.nombre.split(' · ')[0].toLowerCase() };
  }
  await new Promise((ok) => setTimeout(ok, 250));
  return { fuenteId: r.id, nombre: modo === 'ventana' ? `"${(elegido && elegido.nombre || 'la ventana').slice(0, 60)}"` : (elegido ? elegido.nombre.split(' · ')[0].toLowerCase() : 'la pantalla') };
}
clips.configurar({ abrirVentana: abrirVentanaClips, ordenar: ordenarClips, avisar: avisarClip, elegirFuente: elegirFuenteDeGrabacion });
clips.usarAtajos({
  poner: (atajo, fn) => { try { return globalShortcut.register(atajo, fn); } catch { return false; } },
  quitar: (atajo) => { try { globalShortcut.unregister(atajo); } catch {} },
});

// ---------- Voz ----------
async function hablar() {
  if (cerebro.activa()) { cerebro.cancelar(); return; } // segundo toque: cortar
  if (notch) notch.webContents.send('voz:activada');
  await cerebro.activar();
}

ipcMain.on('voz:despertar', () => { if (!cerebro.activa()) cerebro.activar({ porPalabraClave: true }); });
ipcMain.on('voz:audio', (_e, pcm) => cerebro.audio(pcm));
ipcMain.on('voz:vigilia', (_e, pcm) => cerebro.vigilia(pcm)); // audio de cuando nadie lo llamó: para oír su nombre
ipcMain.on('voz:pista', (_e, valor) => cerebro.pista(valor)); // el detector clásico notó algo, sin llegar a despertarse
ipcMain.on('voz:alternar', hablar);
ipcMain.handle('voz:texto', (_e, texto) => cerebro.texto(String(texto || '').slice(0, 2000)));

// ---------- Config para las ventanas ----------
function configPublica() {
  const c = leerConfig();
  return { nombre: c.nombre, apariencia: c.apariencia, voz: { ...c.voz, palabraClave: !!c.voz.palabraClave && require('./nombre').esJarvis(c.nombre), pista: require('./nombre').esJarvis(c.nombre) }, camara: c.camara, modo: c.modo, modos: c.modos, volumen: c.volumen, clips: { enviarA: c.clips.enviarA }, teles: (c.teles || []).map((t) => ({ nombre: t.nombre })) };
}

// Con "Que Jarvis no salga en los clips", el notch no aparece en ninguna captura de pantalla (clips, grabaciones, capturas de Windows).
function protegerDeCapturas() {
  const proteger = leerConfig().clips.sinJarvis !== false;
  // Solo el notch (transparente): en Ajustes, que es una ventana común, la protección la dejaba en negro en algunas PCs.
  try { if (notch && !notch.isDestroyed()) notch.setContentProtection(proteger); } catch {}
}
function aplicarConfig() {
  protegerDeCapturas();
  aplicarAtajo();
  aplicarInicio();
  ubicarNotch();
  aplicarVisibilidad();
  armarBandeja();
  if (notch) notch.webContents.send('config', configPublica());
  const c = leerConfig();
  if (c.whatsapp.activo && whatsapp.leerEstado().fase === 'apagado') whatsapp.conectar();
  if (!c.whatsapp.activo && whatsapp.leerEstado().fase !== 'apagado') whatsapp.detener();
  correo.iniciar(); // por si se cargó o cambió una cuenta de mail
  clips.sincronizar().then(publicarEstado);
  sincronizarCelular();
  cerebro.preparar().catch(() => {}); // por si cambió algo de la escucha (no hace nada si está igual)
  publicarEstado();
}

// Cada canal queda anotado también acá, para que el celular pueda usar los mismos (solo los de PARA_CELULAR).
const canales = new Map();
const manejar = (canal, fn) => { canales.set(canal, fn); ipcMain.handle(canal, async (_e, ...datos) => {
  try { return { ok: true, dato: await fn(...datos) }; } catch (e) { return { ok: false, error: e.message }; }
}); };

manejar('selector:datos', () => (seleccion ? seleccion.datos : { titulo: '', items: [] }));
// Desde los botones del notch y de Ajustes: la misma acción que por voz.
manejar('clips:accion', async (paso) => {
  const r = await acciones.ejecutarPaso({ tipo: 'clip', ...paso }, { porVoz: false });
  publicarEstado();
  return r;
});
// Las pantallas conectadas, para elegir cuál graba (Ajustes → Clips).
function listaDePantallas() {
  const principal = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({ n: i + 1, principal: d.id === principal, nombre: `Pantalla ${i + 1}${d.id === principal ? ' (principal)' : ''} · ${Math.round(d.size.width * d.scaleFactor)}×${Math.round(d.size.height * d.scaleFactor)}` }));
}
manejar('clips:estado', () => ({ ...clips.estado(), pantallas: listaDePantallas() }));

// ---------- Descargas con yt-dlp ----------
descargas.configurar({
  alViejo: () => setTimeout(() => avisarSistema(), 200),
  avisar: (texto, tipo) => avisarClip(texto, tipo),
  alCambiar: (e) => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('descargas', e); },
  ffmpeg: () => clips.asegurarFfmpeg(),
  enlace: async () => {
    const v = await contexto.ventanaActiva({ espera: 15000, soloNavegador: true });
    if (v && v.navegador && v.url) return v.url;
    return { url: '', titulo: v && v.navegador ? v.titulo : '', nota: !v ? 'No pude consultar qué ventana tenías al frente.' : v.navegador ? `Vi tu ${v.proceso}, pero no pude leer la barra de direcciones.` : `Lo que tenías al frente era ${v.proceso}, no un navegador.` };
  },
  portapapeles: () => clipboard.readText(),
});
manejar('descargas:estado', async () => ({ ...descargas.estado(), ytdlp: await descargas.buscarYtdlp(), version: await descargas.version() }));
manejar('descargas:iniciar', (p) => descargas.iniciar({ modo: p && p.modo, calidad: p && p.calidad, url: p && p.url }));
manejar('descargas:cancelar', () => descargas.cancelar());
manejar('descargas:buscar', async () => ({ ytdlp: await descargas.buscarYtdlp({ olvidar: true }), version: await descargas.version() }));
manejar('descargas:bajarYtdlp', async () => { if (process.platform !== 'win32') throw new Error('Solo en Windows.'); await descargas.bajarYtdlp(); return { ytdlp: await descargas.buscarYtdlp({ olvidar: true }), version: await descargas.version() }; });
manejar('descargas:actualizar', () => descargas.actualizar());
manejar('descargas:carpeta', async () => { const r = await shell.openPath(descargas.carpetaDestino()); if (r) throw new Error(r); return true; });
manejar('descargas:abrir', async (ruta) => { if (!descargas.dentroDeCarpeta(ruta)) throw new Error('Ese archivo no está en Descargas.'); const r = await shell.openPath(ruta); if (r) throw new Error(r); return true; });
manejar('descargas:mostrar', (ruta) => { if (!descargas.dentroDeCarpeta(ruta)) throw new Error('Ese archivo no está en Descargas.'); shell.showItemInFolder(ruta); return true; });
manejar('clips:lista', () => clips.listar(Infinity)); // todos: la pantalla de Clips los muestra de a páginas
manejar('clips:miniatura', (archivo) => clips.miniatura(archivo));
manejar('clips:abrir', async (archivo) => {
  if (!clips.dentroDeCarpeta(archivo)) throw new Error('Ese video no está en la carpeta de clips.');
  const error = await shell.openPath(archivo);
  if (error) throw new Error(`No pude abrirlo: ${error}`);
});
manejar('clips:mostrar', (archivo) => { if (!clips.dentroDeCarpeta(archivo)) throw new Error('Ese video no está en la carpeta de clips.'); shell.showItemInFolder(archivo); });
manejar('clips:enviar', ({ archivo, contacto }) => clips.enviarGuardado(archivo, contacto || leerConfig().clips.enviarA, (c, mp4) => whatsapp.enviarVideo(c, mp4)));
// Editor de clips: el video para la vista previa, renombrar, recortar (guardar o reemplazar) y mandar solo el trozo.
manejar('clips:vista', (archivo) => { if (!clips.dentroDeCarpeta(archivo)) throw new Error('Ese video no está en la carpeta de clips.'); return servidor.compartirLocal(archivo); });
manejar('clips:renombrar', ({ archivo, nombre }) => clips.renombrar(archivo, nombre));
manejar('clips:recortar', ({ archivo, desde, hasta, reemplazar, edicion }) => clips.recortar(archivo, { desde, hasta, reemplazar: !!reemplazar, edicion: edicion || {}, mandar: (ruta) => shell.trashItem(ruta) }));
manejar('clips:favorito', ({ archivo, si }) => clips.marcarFavorito(archivo, !!si));
// Pantalla completa de Ajustes (el editor de clips la usa para ver el video grande).
manejar('ventana:pantallaCompleta', (si) => { if (ajustes && !ajustes.isDestroyed()) ajustes.setFullScreen(!!si); return true; });
manejar('clips:deshacerRecorte', (id) => clips.deshacerRecorte(String(id)));
// Convertir (para editores, MP3, GIF) y comprimir: tardan, así que el avance llega a Ajustes por "clips-trabajo".
const avisarTrabajo = (dato) => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('clips-trabajo', dato); };
manejar('clips:transformar', async ({ archivo, tipo, opciones }) => {
  avisarTrabajo({ archivo, tipo, porcentaje: 0 });
  try {
    const o = { ...(opciones || {}) };
    if (o.reemplazar) o.mandar = (ruta) => shell.trashItem(ruta);
    const r = await clips.transformar(archivo, String(tipo), o, (porcentaje) => avisarTrabajo({ archivo, tipo, porcentaje }));
    historial.anotar(`${clips.TRANSFORMACIONES[tipo].titulo}: ${r.nombre}`);
    return r;
  } finally { avisarTrabajo({ archivo, tipo, fin: true }); }
});
// Varios a la Papelera de una (desde Almacenamiento): sin plazo de "Deshacer", se recuperan desde la Papelera de Windows.
manejar('clips:papeleraVarios', async (archivos) => {
  let n = 0; let bytes = 0; const fallos = [];
  for (const a of (Array.isArray(archivos) ? archivos : []).slice(0, 2000)) {
    if (!clips.dentroDeCarpeta(a)) continue;
    try { const t = require('fs').statSync(a).size; await shell.trashItem(a); n++; bytes += t; } catch (e) { fallos.push(require('path').basename(a)); }
  }
  historial.terminar(historial.empezar(`Mandé ${n} videos a la Papelera`, 'click'), { respuesta: fallos.length ? `No pude con ${fallos.length}: ${fallos.slice(0, 3).join(', ')}` : 'Listo.' });
  return { n, bytes, fallos };
});
manejar('clips:mostrarArchivo', (ruta) => { if (!clips.enCarpeta(ruta)) throw new Error('Ese archivo no está en la carpeta de clips.'); shell.showItemInFolder(ruta); return true; });
manejar('clips:vistaPrevia', async (archivo) => servidor.compartirLocal(await clips.vistaPrevia(archivo, (porcentaje) => avisarTrabajo({ archivo, tipo: 'vista', porcentaje }))));
manejar('clips:enviarRecorte', ({ archivo, desde, hasta, contacto, edicion }) => clips.enviarRecorte(archivo, { desde, hasta, edicion: edicion || {} }, contacto || leerConfig().clips.enviarA, (c, mp4) => whatsapp.enviarVideo(c, mp4)));
// El clip se aparta 10 segundos (con "Deshacer") y después pasa a la Papelera de Windows.
manejar('clips:papelera', async (archivo) => { const r = await clips.aLaPapelera(archivo, (ruta) => shell.trashItem(ruta)); return { texto: 'Mandé el clip a la Papelera.', id: r.id, plazo: r.plazo }; });
manejar('musica:aDispositivo', (aparato) => musica.enviarActualA(String(aparato)));
manejar('musica:aLaPC', () => { musica.soltarDestino(); return 'Listo, la música vuelve a esta PC.'; });
manejar('clips:deshacer', (id) => clips.deshacerBorrado(String(id)));
manejar('clips:carpeta', async (actual) => {
  const r = await dialog.showOpenDialog(ajustes && !ajustes.isDestroyed() ? ajustes : undefined, { title: 'Carpeta de los clips', defaultPath: actual || undefined, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});
manejar('clips:abrir-carpeta', async (carpeta) => {
  if (!carpeta) throw new Error('Todavía no elegiste una carpeta.');
  require('fs').mkdirSync(carpeta, { recursive: true });
  const fallo = await shell.openPath(carpeta);
  if (fallo) throw new Error(fallo);
});

manejar('cfg:leer', () => leerConfig());
manejar('cfg:guardar', (nueva) => {
  // La posición del notch, el modo y el vínculo de WhatsApp los maneja este proceso: no se pisan desde Ajustes.
  const actual = leerConfig();
  // Tampoco el permiso de Microsoft, que se obtiene (y se renueva) acá y no en la ventana de Ajustes.
  const correoNuevo = { ...nueva.correo, outlook: { ...(nueva.correo || {}).outlook, token: actual.correo.outlook.token, web: !!actual.correo.outlook.web } };
  // Igual con la llave de Google Calendar: la entrega Google al conectar, no se edita en Ajustes.
  const calNuevo = { ...nueva.calendario, google: { ...((nueva.calendario || {}).google || {}), token: actual.calendario.google.token, cuenta: actual.calendario.google.cuenta } };
  // Si cambió el nombre del asistente, lo que se le enseñó para el nombre anterior ya no sirve.
  if (String(nueva.nombre || '').trim() !== String(actual.nombre || '').trim() && nueva.voz) nueva = { ...nueva, voz: { ...nueva.voz, tambien: '' } };
  guardarConfig({ ...nueva, ancla: actual.ancla, modo: actual.modo, whatsapp: actual.whatsapp, correo: correoNuevo, calendario: calNuevo, conexion: { ...(nueva.conexion || {}), manual: !!(actual.conexion || {}).manual } }); // el modo sin conexión se prende por conexion:manual
  aplicarConfig();
  calendario.recargar();
  return leerConfig();
});
manejar('rutinas:leer', () => leerRutinas());
manejar('rutinas:guardar', (nuevas) => { guardarRutinas(nuevas); if (notch) notch.webContents.send('rutinas', leerRutinas()); return leerRutinas(); });
manejar('rutina:ejecutar', (id) => correrRutina(id, 'click'));
// Lo que hace falta para armar una rutina en el celular (solo nombres: nada de claves ni rutas).
manejar('rutinas:opciones', async () => {
  const c = leerConfig();
  const { nombrePrincipal } = require('./config');
  const nombresDe = (l) => [...new Set((l || []).map((x) => nombrePrincipal(x.nombre)).filter(Boolean))];
  const [salidas, juegos] = await Promise.all([pc.listarSalidas().catch(() => []), Promise.resolve().then(() => pc.listarJuegosSteam()).catch(() => [])]);
  let programas = []; try { programas = pc.listarProgramas().map((p) => p.nombre); } catch {}
  return {
    programas: programas.slice(0, 400), juegos: (juegos || []).map((j) => ({ id: j.id, nombre: j.nombre, carpeta: j.carpeta || '' })).slice(0, 400),
    salidas: [...new Set([...nombresDe(c.salidasAudio), ...(salidas || []).map((x) => x.nombre)])],
    teles: nombresDe(c.teles), casa: nombresDe(c.casa), contactos: nombresDe(c.contactos),
    modos: (c.modos || []).map((m) => ({ id: m.id, nombre: m.nombre })),
    servicios: ((c.streaming || {}).servicios || []).map((x) => ({ id: x.id, nombre: x.nombre })),
  };
});
async function correrRutina(id, origen = 'click', motivo = '') {
  fase('pensando');
  const rutina = leerRutinas().find((x) => x.id === id);
  if (!rutina) { fase('reposo'); throw new Error('Esa rutina ya no existe.'); }
  const entrada = historial.empezar(`Rutina "${rutina.nombre}" (${origen === 'celular' ? 'desde el celular' : origen === 'aviso' ? `sola: ${motivo}` : 'click'})`, origen);
  try {
    const r = await acciones.ejecutarRutina(id);
    historial.terminar(entrada, { respuesta: r.ok ? 'Salió todo bien.' : r.errores.join(' · '), ok: r.ok });
    if (r.ok) fase('ok', r.rutina); else fase('error', r.errores[0]);
    return r;
  } catch (e) { historial.terminar(entrada, { respuesta: e.message, ok: false }); fase('error', e.message); throw e; }
}
manejar('paso:probar', (paso) => acciones.ejecutarPaso(paso));
manejar('modo:cambiar', (modo) => { fijarModo(modo); return leerConfig().modo; });
manejar('ajustes:abrir', (seccion) => { abrirAjustes(seccion); });
manejar('pc:salidas', () => pc.listarSalidas());
manejar('pc:programas', () => pc.listarProgramas().map((p) => p.nombre));
manejar('pc:juegos', () => pc.listarJuegosSteam({ forzar: true }));
manejar('cast:lista', () => { cast.refrescar(); return cast.dispositivos(); });
manejar('aprendido:lista', () => aprendido.todas());
manejar('aprendido:olvidar', (k) => { if (k) aprendido.olvidar(k); else aprendido.olvidarTodo(); return aprendido.todas(); });
manejar('calendario:probar', (enlace) => calendario.probar(enlace));
manejar('calendario:estado', () => calendario.estado());
manejar('calendario:lista', () => calendario.lista());
manejar('calendario:conocidos', () => calendario.conocidos());
manejar('calendario:rango', ({ desde, hasta }) => calendario.rango(desde, hasta));
manejar('calendario:guardar-local', (datos) => calendario.guardarLocal(datos));
manejar('calendario:borrar-local', (id) => calendario.borrarLocal(String(id)));
manejar('calendario:cambiar', ({ id, cambios }) => calendario.cambiar(String(id), cambios || null));
manejar('calendario:actualizar', async () => { await calendario.actualizar(); return calendario.estado(); });
// Cuenta de Google: se abre la página de Google en el navegador y Ajustes se entera cuando terminó (bien o mal).
manejar('calendario:google:conectar', (datos) => {
  const c = leerConfig();
  // Si en Ajustes se acaba de pegar el ID y el secreto y todavía no se guardó (se guarda con una pausa), se toma de acá.
  if (datos && (datos.clientId !== undefined || datos.clientSecret !== undefined)) guardarConfig({ ...c, calendario: { ...c.calendario, google: { ...c.calendario.google, clientId: String(datos.clientId || '').trim(), clientSecret: String(datos.clientSecret || '').trim() } } });
  const avisarA = (dato) => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('calendario', dato); };
  googleCal.conectar((url) => shell.openExternal(url)).then(() => { calendario.recargar(); avisarA({ ok: true }); }, (e) => avisarA({ ok: false, error: e.message }));
  return { iniciada: true };
});
manejar('calendario:google:cancelar', () => { googleCal.cancelarConexion(); });
manejar('calendario:google:desconectar', () => { googleCal.desconectar(); calendario.recargar(); return leerConfig().calendario.google; });
manejar('calendario:calendarios', async () => ({ lista: await calendario.calendariosDeGoogle(), cuenta: leerConfig().calendario.google.cuenta }));
manejar('tele:vinculadas', () => androidtv.vinculadas());
manejar('tele:vincular', (nombre) => androidtv.iniciarVinculo(nombre));
manejar('tele:codigo', ({ nombre, codigo }) => androidtv.enviarCodigo(nombre, codigo));
manejar('ha:probar', () => ha.probar());
manejar('ha:entidades', () => ha.entidades());
manejar('wa:estado', () => whatsapp.leerEstado());
manejar('wa:vincular', () => { guardarConfig({ ...leerConfig(), whatsapp: { activo: true } }); return whatsapp.conectar(); });
manejar('wa:agenda', () => whatsapp.resumenDeAgenda());
manejar('wa:releer', () => whatsapp.releerAgenda());
manejar('wa:desvincular', async () => { guardarConfig({ ...leerConfig(), whatsapp: { activo: false } }); await whatsapp.desvincular(); });
manejar('recordatorios:leer', () => recordatorios.pendientes());
manejar('recordatorios:borrar', (id) => recordatorios.borrar(id));
// ---- Notas ----
const conCaptura = (n) => ({ ...n, tieneCaptura: !!notas.rutaDeCaptura(n.id) });
manejar('notas:leer', () => notas.listar().map(conCaptura));
manejar('notas:crear', async ({ texto, cuando, conContexto }) => { const r = await notas.crear({ texto, cuando: cuando || undefined, conContexto: !!conContexto }); return conCaptura(r.nota); });
manejar('notas:guardar', ({ id, cambios }) => conCaptura(notas.actualizar(id, cambios || {})));
manejar('notas:borrar', (id) => notas.borrar(id));
manejar('notas:borrar-avisadas', () => notas.borrarVarias((n) => n.cuando && n.avisada));
manejar('notas:captura', (id) => { const r = notas.rutaDeCaptura(id); return r ? `data:image/jpeg;base64,${fs.readFileSync(r).toString('base64')}` : null; });
manejar('notas:abrir-enlace', async (id) => { const n = notas.listar().find((x) => x.id === id); if (!n || !/^https?:\/\//i.test(n.enlace || '')) throw new Error('Esa nota no tiene un link.'); await abrirEnNavegador(n.enlace); });
// "Agregar a Google Calendar": se abre la página de Google con el evento cargado y se toca Guardar (Jarvis solo lee el calendario).
manejar('notas:calendar', async (id) => {
  const n = notas.listar().find((x) => x.id === id);
  if (!n) throw new Error('Esa nota ya no está.');
  const base = n.cuando || (Math.ceil(Date.now() / 3600000) + 1) * 3600000;
  const d = new Date(base); const dos = (x) => String(x).padStart(2, '0');
  const inicio = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const { url } = calendario.enlaceDeEvento({ titulo: n.texto.slice(0, 120), inicio, duracionMin: 30, detalle: [n.enlace, n.titulo].filter(Boolean).join('\n') });
  await abrirEnNavegador(url);
});
// Pantalla: qué vería Jarvis ahora mismo (para probar el permiso de Ajustes → Contexto).
manejar('contexto:probar', async () => {
  const c = leerConfig().contexto || {};
  const [captura, ventana] = await Promise.all([contexto.capturarPantalla({ ancho: c.anchoCaptura || 1280 }), contexto.ventanaActiva().catch(() => null)]);
  return { imagen: `data:image/jpeg;base64,${captura.jpeg.toString('base64')}`, kb: Math.round(captura.jpeg.length / 1024), ventana: ventana ? contexto.describir(ventana) : '', enlace: ventana ? ventana.url : '' };
});
manejar('abrir:enlace', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
// Widgets del panel: el clima (con caché de 15 min) y el volumen general de Windows.
manejar('widget:clima', (ciudad) => require('./internet').climaDatos(ciudad).catch((e) => ({ error: e.message })));
manejar('widget:volumen', (nivel) => require('./pc').volumen(nivel));
manejar('widget:silenciar', (si) => require('./pc').silenciar(!!si));
manejar('voz:probar', async (voz) => { const { pcm, hz } = await cerebro.probarVoz(voz); return { pcm: new Uint8Array(pcm), hz }; });
manejar('voz:callar', () => cerebro.callar());
manejar('almacenamiento:resumen', () => require('./almacenamiento').resumen());
manejar('almacenamiento:liberar', async (id) => {
  const dicho = await require('./almacenamiento').liberar(String(id), { papelera: (ruta) => shell.trashItem(ruta) });
  publicarEstado();
  return dicho;
});
manejar('componentes:estado', () => componentes.estado());
manejar('componentes:instalar', (id) => { componentes.instalar(id).catch(() => {}).finally(() => publicarEstado()); return true; });
manejar('componentes:actualizar', async (id) => { try { return await componentes.actualizar(id); } finally { avisarSistema(); } });
manejar('avisos:sistema', () => avisosDelSistema());
// Estado de la PC (procesador, memoria, placa de video) y cuánto gasta cada parte de Jarvis.
estadopc.configurar({
  ventanas: () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => ({ pid: w.webContents.getOSProcessId(), nombre: w === notch ? 'Notch' : w === ajustes ? 'Ajustes' : (w.getTitle() || 'Ventana').replace(/^Jarvis · /, '').replace(/^./, (x) => x.toUpperCase()) })),
});
// Historial: repetir un pedido tal cual, o guardarlo como rutina (un botón que lo vuelve a pedir).
manejar('historial:repetir', async (id) => {
  const r = historial.recientes(300).find((x) => x.id === id);
  if (!r || !r.dicho) throw new Error('Ese pedido ya no está en el historial.');
  return (await cerebro.textoRemoto(r.dicho, { id: 'historial', origen: r.origen === 'celular' ? 'celular' : 'texto' })).texto || 'Listo.';
});
manejar('historial:aRutina', (id) => {
  const r = historial.recientes(300).find((x) => x.id === id);
  if (!r || !r.dicho) throw new Error('Ese pedido ya no está en el historial.');
  const nombre = r.dicho.replace(/^(che |hey |oye )?jarvis[,:]?\s*/i, '').replace(/[.?!¿¡]+$/g, '').trim().slice(0, 60);
  const lista = leerRutinas();
  const nueva = { id: `rutina_${Date.now().toString(36)}`, nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), icono: 'estrella', rapida: true, pasos: [{ tipo: 'pedido', texto: r.dicho }] };
  guardarRutinas([...lista, nueva]);
  if (notch && !notch.isDestroyed()) notch.webContents.send('rutinas', leerRutinas());
  if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('rutinas-celular', leerRutinas());
  return { id: nueva.id, nombre: nueva.nombre };
});
manejar('pc:estado', (opciones) => estadopc.leer({ detalle: !!(opciones && opciones.detalle) }));
// ---------- Avisos del sistema (Ajustes → Inicio): versión nueva de Jarvis, yt-dlp viejo, componentes con error ----------
async function avisosDelSistema({ fuerza = false } = {}) {
  const lista = [];
  const a = actualizador.estado();
  if (a.fase === 'lista') lista.push({ id: 'jarvis', tono: 'aviso', titulo: `Jarvis ${a.nueva} está listo para instalar`, texto: 'Se reinicia y queda actualizado en unos segundos. Tus datos no se tocan.', accion: { texto: `Reiniciar y actualizar`, canal: 'actualizacion:instalar' }, hoja: 'actualizaciones' });
  else if (a.fase === 'bajando') lista.push({ id: 'jarvis', tono: 'info', titulo: `Bajando Jarvis ${a.nueva || 'nuevo'}… ${a.progreso || 0} %`, texto: 'Cuando termine, te aparece acá para instalarlo.', hoja: 'actualizaciones' });
  let comps = [];
  try { if (fuerza) await descargas.revisarVersion({ fuerza: true }); comps = await componentes.estado(); } catch {}
  for (const c of comps) {
    if (c.id === 'ytdlp' && c.listo && c.desactualizado && !c.actualizando) {
      lista.push({ id: 'ytdlp', tono: 'aviso', titulo: 'yt-dlp está desactualizado', texto: c.ultima && c.version && c.ultima !== c.version ? `Tenés la ${c.version} y salió la ${c.ultima}. Sin actualizarlo, algunos videos no se pueden descargar.` : 'Una descarga falló como cuando está viejo. Actualizarlo suele arreglarlo.', accion: { texto: 'Actualizar yt-dlp', canal: 'componentes:actualizar', args: ['ytdlp'] }, hoja: 'componentes' });
    } else if (c.id === 'ytdlp' && c.actualizando) lista.push({ id: 'ytdlp', tono: 'info', titulo: 'Actualizando yt-dlp…', texto: 'Tarda unos segundos.', hoja: 'componentes' });
    else if (c.error && !c.bajando) lista.push({ id: `comp-${c.id}`, tono: 'mal', titulo: `${c.nombre}: no se pudo`, texto: c.error, hoja: 'componentes' });
  }
  return lista;
}
let ultimosAvisos = '';
async function avisarSistema(opciones) {
  const lista = await avisosDelSistema(opciones).catch(() => null);
  if (!lista) return;
  const firma = JSON.stringify(lista);
  if (firma === ultimosAvisos) return;
  ultimosAvisos = firma;
  if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('avisos-sistema', lista);
}
manejar('actualizacion:estado', () => actualizador.estado());
manejar('actualizacion:buscar', () => actualizador.buscar());
manejar('actualizacion:instalar', () => actualizador.instalarAhora());
manejar('datos:carpeta', async () => { const r = await shell.openPath(DATOS); if (r) throw new Error(r); return true; });
manejar('datos:importar', async () => {
  const r = await dialog.showOpenDialog(ajustes || undefined, { title: 'Elegí la carpeta "datos" del Jarvis anterior', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { cancelado: true };
  const copiados = importarDatos(r.filePaths[0]);
  setTimeout(() => { app.relaunch(); app.exit(0); }, 1500);
  return { copiados };
});
manejar('modelos:estado', () => ({ modelos: modelos.estado(), voces: modelos.voces(), voz: oido.diagnostico() }));
manejar('modelos:bajar', (id) => {
  const tarea = id === 'esenciales' ? bajarEsenciales() : modelos.bajar(id).then(() => cerebro.preparar()).finally(() => publicarEstado());
  tarea.catch(() => {}); // el error queda en el estado del modelo y se muestra ahí
  return true;
});
manejar('ia:estado', () => pensar.estado());
manejar('ia:probar', (id) => pensar.probar(id));
manejar('buscar:probar', () => require('./internet').probar());
// Click en un mail: se abre en Chrome (en el navegador de siempre si no hay Chrome) y deja de estar pendiente.
manejar('avisos:abrir', async (clave) => {
  const n = notificaciones.deGrupo(clave).slice(-1)[0];
  if (!n || n.origen !== 'mail') throw new Error('Ese aviso ya no está.');
  await abrirEnNavegador(correo.enlaceDe(n));
  notificaciones.quitar((x) => notificaciones.claveDeGrupo(x) === clave);
});
manejar('avisos:limpiar', (clave) => { notificaciones.quitar((n) => !clave || notificaciones.claveDeGrupo(n) === clave); });
// "No avisarme más de esta persona / este remitente" desde la novedad del notch; Ajustes se entera para no pisarlo con datos viejos.
manejar('avisos:silenciar', (clave) => {
  const quien = notificaciones.dejarDeAvisar(clave);
  if (quien && ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('avisos-config', leerConfig().notificaciones);
  return quien;
});
// Lo que llegó sin avisar por no estar entre lo elegido (para elegir desde Ajustes).
manejar('avisos:omitidas', () => notificaciones.omitidas());
manejar('avisos:olvidar', (clave) => { notificaciones.olvidarOmitidas(clave); });
// Contestar una novedad desde el notch: se dicta (o se escribe) el texto y sale por donde llegó.
manejar('avisos:dictar', () => cerebro.dictar());
manejar('avisos:cancelar', () => { if (cerebro.activa()) cerebro.cancelar(); });
manejar('avisos:responder', (clave, texto) => {
  const pendientes = notificaciones.deGrupo(clave);
  const ultimo = pendientes[pendientes.length - 1];
  if (!ultimo) throw new Error('Esa novedad ya no está.');
  const aQuien = ultimo.grupo || ultimo.de;
  return historial.registrar(`Responder ${ultimo.origen === 'mail' ? 'el mail de' : 'el WhatsApp de'} ${aQuien}: ${texto}`, 'click', async () => {
    const r = ultimo.origen === 'mail'
      ? await correo.responder(ultimo, texto)
      : `Enviado a ${aQuien}: ${await whatsapp.responder(ultimo.clave, texto)}`;
    notificaciones.quitar((n) => notificaciones.claveDeGrupo(n) === clave); // contestado: deja de estar pendiente
    return r;
  });
});
// Notas de voz (la grabadora vive en el notch; acá se guardan, se listan y se manejan los archivos).
manejar('notasvoz:accion', async (accion) => acciones.ejecutarPaso({ tipo: 'notavoz', accion: accion === 'parar' ? 'parar' : 'grabar' }, { porVoz: false }));
manejar('notasvoz:guardar', async (bytes, segundos) => {
  const r = await notasvoz.guardar(bytes, { segundos: Number(segundos) || 0 });
  historial.anotar(`Nota de voz guardada: ${r.nombre} (${Math.round(r.segundos)} s)`);
  return r;
});
manejar('notasvoz:lista', () => ({ carpeta: notasvoz.carpeta(), notas: notasvoz.listar() }));
manejar('notasvoz:vista', (archivo) => { if (!notasvoz.dentroDeCarpeta(archivo)) throw new Error('Esa nota no está en la carpeta de notas de voz.'); return servidor.compartirLocal(archivo); });
manejar('notasvoz:abrir', async (archivo) => { if (!notasvoz.dentroDeCarpeta(archivo)) throw new Error('Esa nota no está en la carpeta de notas de voz.'); const e = await shell.openPath(archivo); if (e) throw new Error(`No pude abrirla: ${e}`); });
manejar('notasvoz:mostrar', (archivo) => { if (!notasvoz.dentroDeCarpeta(archivo)) throw new Error('Esa nota no está en la carpeta de notas de voz.'); shell.showItemInFolder(archivo); });
manejar('notasvoz:carpeta', async () => { const dir = notasvoz.carpeta(); fs.mkdirSync(dir, { recursive: true }); const e = await shell.openPath(dir); if (e) throw new Error(`No pude abrir la carpeta: ${e}`); });
manejar('notasvoz:papelera', async (archivo) => { servidor.soltar(archivo); await notasvoz.aLaPapelera(archivo, (ruta) => shell.trashItem(ruta)); return 'Mandé la nota a la Papelera.'; });
manejar('notasvoz:renombrar', ({ archivo, nombre }) => { servidor.soltar(archivo); return notasvoz.renombrar(archivo, nombre); });
// Voces propias: juntar audios (grabados o subidos), armar el set de entrenamiento y cargar la voz entrenada.
vocesprop.configurar({
  avisar: (t) => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('voces-trabajo', t); },
  transcribir: (pcm) => oido.transcribir(pcm),
});
const dentroDeVoces = (ruta) => { const r = path.resolve(vocesprop.RAIZ) + path.sep; return path.resolve(String(ruta || '')).startsWith(r); };
manejar('voces:lista', () => vocesprop.listar());
manejar('voces:crear', ({ nombre, espeak } = {}) => vocesprop.crear(nombre, { espeak: espeak || undefined }));
manejar('voces:renombrar', ({ id, nombre }) => vocesprop.renombrar(id, nombre));
manejar('voces:borrar', (id) => { vocesprop.borrar(id); return true; });
manejar('voces:proyecto', (id) => vocesprop.proyecto(id));
manejar('voces:grabar', ({ id, wav, guion, texto }) => vocesprop.agregarGrabacion(id, wav, { guion: Number.isInteger(guion) ? guion : null, texto }));
manejar('voces:elegirAudios', async () => {
  const r = await dialog.showOpenDialog(ajustes && !ajustes.isDestroyed() ? ajustes : undefined, { title: 'Elegí los audios (MP3, M4A, WAV, OGG, audios de WhatsApp…)', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'opus', 'aac', 'flac', 'wma', 'webm', 'mp4', 'amr'] }, { name: 'Todos los archivos', extensions: ['*'] }] });
  return r.canceled ? [] : r.filePaths;
});
manejar('voces:importar', ({ id, rutas, modo }) => { vocesprop.importarAudios(id, rutas, { modo }).catch((e) => historial.anotar(`Voces propias: ${e.message}`, { error: true })); return true; });
manejar('voces:clip:texto', ({ id, clip, texto }) => vocesprop.cambiarTexto(id, clip, texto));
manejar('voces:clip:quitar', ({ id, clip }) => { vocesprop.quitarClip(id, clip); return true; });
manejar('voces:clip:vista', ({ id, clip }) => servidor.compartirLocal(vocesprop.archivoDeClip(id, clip)));
manejar('voces:guionTexto', (nombre) => vocesprop.guionParaEnviar({ nombre }));
manejar('voces:guardarGuion', async (id) => {
  const p = vocesprop.proyecto(id);
  const destino = path.join(vocesprop.dirDe(id), 'guion para enviar.txt');
  fs.writeFileSync(destino, vocesprop.guionParaEnviar({ nombre: p.nombre }), 'utf8');
  shell.showItemInFolder(destino);
  return destino;
});
manejar('voces:armar', (id, opciones) => vocesprop.armar(id, opciones || {}));
manejar('voces:abrirCarpeta', async (id) => { const d = path.join(vocesprop.dirDe(id), 'entrenamiento'); fs.mkdirSync(d, { recursive: true }); const e = await shell.openPath(d); if (e) throw new Error(`No pude abrir la carpeta: ${e}`); });
manejar('voces:cargarVoz', async (id) => {
  const resultado = path.join(vocesprop.dirDe(id), 'entrenamiento', 'resultado', 'voz.onnx');
  let onnx = fs.existsSync(resultado) ? resultado : null;
  if (!onnx) {
    const r = await dialog.showOpenDialog(ajustes && !ajustes.isDestroyed() ? ajustes : undefined, { title: 'Elegí el archivo .onnx de la voz entrenada', properties: ['openFile'], filters: [{ name: 'Voz Piper', extensions: ['onnx'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    onnx = r.filePaths[0];
  }
  const v = vocesprop.instalarVoz(id, { onnx });
  if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('modelos', { modelos: modelos.estado(), voces: modelos.voces(), voz: oido.diagnostico() });
  return v;
});
manejar('voces:quitarVoz', (vid) => { vocesprop.quitarVoz(vid); const c = leerConfig(); const pers = { ...(c.habla.personalidades || {}) }; delete pers[`propia-${vid}`]; guardarConfig({ ...c, habla: { ...c.habla, personalidades: pers, ...(c.habla.voz === `propia-${vid}` ? { voz: 'claude' } : {}) } }); return true; });
manejar('voces:renombrarVoz', ({ vid, nombre }) => { const r = vocesprop.renombrarVoz(vid, nombre); if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('modelos', { modelos: modelos.estado(), voces: modelos.voces(), voz: oido.diagnostico() }); return r; });
const nombreDeArchivo = (t) => String(t || 'voz').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() || 'voz';
const guardarComo = async (titulo, nombre) => {
  const r = await dialog.showSaveDialog(ajustes && !ajustes.isDestroyed() ? ajustes : undefined, { title: titulo, defaultPath: path.join(app.getPath('documents'), nombre), filters: [{ name: 'Paquete de voz de Jarvis (zip)', extensions: ['zip'] }] });
  return r.canceled || !r.filePath ? null : r.filePath;
};
manejar('voces:exportarVoz', async (vid) => {
  const c = leerConfig(); const nombre = (modelos.voces().find((v) => v.id === `propia-${vid}`) || {}).nombre || vid;
  const destino = await guardarComo('Guardar la voz para compartirla', `Voz ${nombreDeArchivo(nombre.replace(/ \(voz propia\)$/, ''))}.zip`);
  if (!destino) return null;
  const r = vocesprop.exportarVoz(vid, destino, { personalidad: ((c.habla || {}).personalidades || {})[`propia-${vid}`] || '' });
  shell.showItemInFolder(destino);
  return { ...r, destino };
});
manejar('voces:exportarProyecto', async (id) => {
  const p = vocesprop.proyecto(id); const c = leerConfig();
  const destino = await guardarComo('Guardar el respaldo de las grabaciones', `Grabaciones ${nombreDeArchivo(p.nombre)}.zip`);
  if (!destino) return null;
  const r = vocesprop.exportarProyecto(id, destino, { personalidad: p.voz ? ((c.habla || {}).personalidades || {})[`propia-${p.voz}`] || '' : '' });
  shell.showItemInFolder(destino);
  return { ...r, destino };
});
manejar('voces:importarPaquete', async () => {
  const o = await dialog.showOpenDialog(ajustes && !ajustes.isDestroyed() ? ajustes : undefined, { title: 'Elegí el paquete de voz (zip) que te pasaron o que guardaste', properties: ['openFile'], filters: [{ name: 'Paquete de voz de Jarvis (zip)', extensions: ['zip'] }] });
  if (o.canceled || !o.filePaths[0]) return null;
  const r = vocesprop.importarPaquete(o.filePaths[0]);
  if (r.tipo === 'voz' && r.personalidad) { const c = leerConfig(); guardarConfig({ ...c, habla: { ...c.habla, personalidades: { ...(c.habla.personalidades || {}), [r.voz]: r.personalidad } } }); }
  if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('modelos', { modelos: modelos.estado(), voces: modelos.voces(), voz: oido.diagnostico() });
  return r;
});
manejar('voces:abrirCarpetaProyecto', async (id) => { vocesprop.proyecto(id); const e = await shell.openPath(vocesprop.dirDe(id)); if (e) throw new Error(`No pude abrir la carpeta: ${e}`); });
manejar('conexion:estado', () => conexion.estado());
manejar('conexion:manual', (valor) => { conexion.fijarManual(valor); return conexion.estado(); });
manejar('conexion:revisar', async () => { await conexion.revisar(); return conexion.estado(); });
manejar('conexion:descartarCola', () => { conexion.descartarCola(); return conexion.estado(); });
manejar('historial:leer', () => historial.recientes());
manejar('historial:borrar', (id) => { historial.borrar(id); });
manejar('historial:limpiar', () => { historial.limpiar(); });
manejar('correo:estado', () => correo.leerEstado());
manejar('correo:probar', (id) => correo.probar(id));
// Hotmail/Outlook: se pide un código, se abre la página de Microsoft en el navegador del usuario y se
// espera a que autorice ahí. Jarvis nunca ve la contraseña.
manejar('correo:conectarOutlook', async () => {
  const { codigo, url, espera } = await correo.conectarOutlook();
  shell.openExternal(url);
  const avisarA = (dato) => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('correo', dato); };
  espera.then(() => { correo.iniciar(); avisarA({ ok: true }); }, (e) => avisarA({ ok: false, error: e.message }));
  return { codigo, url };
});
// Hotmail/Outlook por la ventana de navegador de Jarvis: se inicia sesión a mano, una sola vez.
manejar('correo:outlookWeb', () => correo.iniciarSesionWeb((dato) => {
  if (dato.ok) correo.iniciar();
  if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('correo', dato);
}));
manejar('correo:desconectarOutlookWeb', async () => { await correo.desconectarWeb(); correo.iniciar(); });
manejar('correo:desconectarOutlook', () => {
  const c = leerConfig();
  guardarConfig({ ...c, correo: { ...c.correo, outlook: { ...c.correo.outlook, token: '' } } });
  correo.iniciar();
});
manejar('streaming:probar', () => streaming.probar());
manejar('streaming:ver', (pedido) => streaming.ver(pedido));
manejar('clima:probar', () => require('./internet').clima());
manejar('musica:sesionIniciada', () => musica.conSesion());
manejar('ia:ollama', () => pensar.listarOllama(leerConfig().ia.ollama.url.replace(/\/+$/, '')).catch(() => []));
// Graba unos segundos del micrófono y devuelve lo que entendió (para probar la escucha desde Ajustes).
manejar('oido:probar', async (segundos = 4) => {
  const pcm = await pedirAlNotch('pcm', { segundos }, (segundos + 15) * 1000);
  const inicio = Date.now();
  const texto = await cerebro.transcribir(pcm);
  return { texto, ms: Date.now() - inicio };
});
// "Enseñarle cómo decís Jarvis": graba unos segundos, y devuelve qué entendió y qué forma conviene recordar.
manejar('oido:aprender', async () => {
  const pcm = await pedirAlNotch('pcm', { segundos: 3 }, 20000);
  return cerebro.aprenderNombre(await cerebro.transcribir(pcm));
});
manejar('musica:sesion', () => musica.iniciarSesion());
manejar('musica:reproducir', (busqueda) => musica.reproducir(busqueda));
manejar('musica:controlar', (accion) => musica.controlar(accion));
manejar('windows:mezclador', () => { if (process.platform === 'win32') shell.openExternal('ms-settings:apps-volume'); });
manejar('app:cerrar', () => { app.quit(); });
manejar('app:tamanos', () => require('./informacion').tamanos());
manejar('app:info', () => ({ ...require('./informacion').leer(), edicion: edicion.B ? 'B' : '', nombre: require('./nombre').actual(), version: app.getVersion(), instalado: edicion.INSTALADO, portable: edicion.PORTABLE, datos: DATOS, copiado: edicion.copiado, compartidos: edicion.compartidos }));

// ---------- Arranque ----------
app.on('second-instance', () => { if (escondido()) fijarModo('normal'); else abrirAjustes(); });
app.on('window-all-closed', () => {}); // Jarvis sigue vivo en la bandeja aunque no haya ventanas
// ---------- Celular (Ajustes → Celular) ----------
// Lo que el celular puede pedir: lo mismo que la voz o los botones, por las mismas funciones. Queda en el Historial como "celular".
const MODOS_CLIP = new Set(['guardar', 'grabar', 'parar', 'pausar', 'seguir', 'enviar', 'captura', 'captura-enviar']);
const MUSICA_CEL = new Set(['alternar', 'pausar', 'reanudar', 'siguiente', 'anterior']);
// "Le mandé el mensaje a Ana" / "Te mandé el mensaje a tu WhatsApp" (nunca "a Yo").
const mandeA = (que, contacto) => (whatsapp.esParaMi(contacto) ? `Listo, te mandé ${que} a tu WhatsApp.` : `Listo, le mandé ${que} a ${contacto}.`);
async function accionDelCelular(b, quien) {
  const etiqueta = (t) => `${t} (desde ${quien.nombre || 'el celular'})`;
  const conHistorial = async (texto, fn) => {
    const entrada = historial.empezar(etiqueta(texto), 'celular');
    try { const r = await fn(); const dicho = typeof r === 'string' ? r : 'Listo.'; historial.terminar(entrada, { respuesta: dicho, ok: true }); publicarEstado(); return dicho; }
    catch (e) { historial.terminar(entrada, { respuesta: e.message, ok: false }); throw e; }
  };
  const contacto = String(b.contacto || '').trim().slice(0, 80);
  switch (b.tipo) {
    case 'rutina': {
      const r = await correrRutina(String(b.id || ''), 'celular');
      return r.ok ? `Listo: ${r.rutina || 'rutina hecha'}.` : `Hubo un problema: ${r.errores.join(' · ')}`;
    }
    case 'clip': {
      const accion = String(b.accion || '');
      if (!MODOS_CLIP.has(accion)) throw Object.assign(new Error('Acción de clips desconocida.'), { status: 400 });
      if ((accion === 'enviar' || accion === 'captura-enviar') && !contacto && !leerConfig().clips.enviarA) throw Object.assign(new Error('Elegí a quién mandárselo.'), { status: 400 });
      return conHistorial(`Clips: ${accion}${contacto ? ` a ${contacto}` : ''}`, () => acciones.ejecutarPaso({ tipo: 'clip', accion, ...(contacto ? { contacto } : {}), ...(b.ultimo ? { ultimo: true } : {}), ...(b.modo ? { modo: String(b.modo) } : {}) }, { porVoz: false }));
    }
    case 'whatsapp': {
      const mensaje = String(b.mensaje || '').trim().slice(0, 4000);
      if (!contacto || !mensaje) throw Object.assign(new Error('Falta a quién o el mensaje.'), { status: 400 });
      return conHistorial(`WhatsApp a ${contacto}: ${mensaje.slice(0, 80)}`, async () => { await acciones.ejecutarPaso({ tipo: 'whatsapp', contacto, mensaje }, { porVoz: false }); return mandeA('el mensaje', contacto); });
    }
    case 'foto': {
      if (!contacto) throw Object.assign(new Error('Elegí a quién mandarle la foto.'), { status: 400 });
      // Con el texto del mensaje (si hay) como epígrafe de la foto.
      const epigrafe = String(b.mensaje || '').trim().slice(0, 1000);
      return conHistorial(`Foto de la webcam a ${contacto}${epigrafe ? ` con el texto: ${epigrafe.slice(0, 60)}` : ''}`, async () => { await acciones.ejecutarPaso({ tipo: 'foto_whatsapp', contacto, ...(epigrafe ? { epigrafe } : {}) }, { porVoz: false }); return mandeA(epigrafe ? 'la foto con el mensaje' : 'la foto', contacto); });
    }
    case 'volumen': {
      if (b.mudo !== undefined) return conHistorial(b.mudo ? 'Silenciar la PC' : 'Sacar el silencio de la PC', () => require('./pc').silenciar(!!b.mudo));
      return conHistorial(`Volumen de la PC en ${Math.round(Number(b.nivel))}`, () => require('./pc').volumen(b.nivel));
    }
    case 'nota': {
      const texto = String(b.texto || '').trim().slice(0, 2000);
      if (!texto) throw Object.assign(new Error('Escribí la nota.'), { status: 400 });
      return conHistorial(`Nota: ${texto.slice(0, 60)}`, async () => { await notas.crear({ texto }); return 'Listo, quedó en tus notas.'; });
    }
    case 'modo': {
      const modo = String(b.modo || '');
      if (!acciones.idsDeModos().includes(modo)) throw Object.assign(new Error('Ese modo no existe.'), { status: 400 });
      return conHistorial(`Modo ${modo}`, async () => { fijarModo(modo); const m = (leerConfig().modos || []).find((x) => x.id === modo); return `Listo, modo ${m ? m.nombre : modo}.`; });
    }
    case 'musica': {
      if (b.accion === 'poner') return conHistorial(`Música: ${b.busqueda || 'la de siempre'}`, () => acciones.ejecutarPaso({ tipo: 'musica', busqueda: String(b.busqueda || '').slice(0, 200) }, { porVoz: false }));
      if (b.accion === 'aLaPC') { musica.soltarDestino(); publicarEstado(); return 'La música vuelve a la PC.'; }
      if (b.accion === 'enviar') {
        const aparato = String(b.dispositivo || '').trim().slice(0, 80);
        if (!aparato) throw Object.assign(new Error('Elegí a qué aparato mandarla.'), { status: 400 });
        return conHistorial(`Música a ${aparato}`, async () => { const r = await musica.enviarActualA(aparato); publicarEstado(); return r; });
      }
      if (!MUSICA_CEL.has(b.accion)) throw Object.assign(new Error('Acción de música desconocida.'), { status: 400 });
      return conHistorial(`Música: ${b.accion}`, () => acciones.ejecutarPaso({ tipo: 'musica_control', accion: b.accion }, { porVoz: false }));
    }
    default: throw Object.assign(new Error('Acción desconocida.'), { status: 400 });
  }
}
// Archivos de la PC que el celular puede ver y mandar: clips, videos y audios descargados (más nuevos primero).
const EXT_VIDEO = /\.(mp4|mkv|webm|mov)$/i;
const EXT_AUDIO = /\.(mp3|m4a|opus|ogg|wav|flac|aac)$/i;
function archivosParaCelular() {
  const vistos = new Set();
  const salida = [];
  let base = '';
  try { base = descargas.carpetaDestino(); } catch {}
  const sumar = (x) => { const k = path.resolve(x.archivo).toLowerCase(); if (vistos.has(k)) return; vistos.add(k); salida.push(x); };
  for (const c of clips.listar(200)) {
    const esDescarga = base && descargas.dentroDeCarpeta(c.archivo);
    if (!esDescarga) sumar({ ...c, tipo: 'clip', carpeta: c.juego || '' });
  }
  const mirar = (dir, nivel) => {
    let entradas = [];
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) { if (nivel < 2) mirar(ruta, nivel + 1); continue; }
      const tipo = EXT_VIDEO.test(e.name) ? 'video' : EXT_AUDIO.test(e.name) ? 'audio' : '';
      if (!tipo || /\.(part|parte|ytdl)$/i.test(e.name)) continue;
      try { const st = fs.statSync(ruta); sumar({ archivo: ruta, nombre: e.name, tipo, carpeta: path.relative(base, dir), bytes: st.size, fecha: st.mtimeMs }); } catch {}
    }
  };
  if (base) mirar(base, 0);
  return salida.sort((a, b) => b.fecha - a.fecha);
}
// Lo que la app del celular muestra: nada de claves ni tokens, solo nombres y estados.
function estadoParaCelular() {
  const c = leerConfig();
  const { nombrePrincipal } = require('./config');
  const rutinas = leerRutinas().map((r) => ({ id: r.id, nombre: nombrePrincipal(r.nombre) || r.nombre, icono: r.icono || '', rapida: !!r.rapida }));
  const contactos = [...new Set((c.contactos || []).map((x) => nombrePrincipal(x.nombre)).filter(Boolean))];
  const ce = clips.estado();
  const mu = musica.estado();
  return {
    pc: c.nombre || 'Jarvis', usuario: c.usuario || '',
    modo: c.modo, modos: (c.modos || []).map((m) => ({ id: m.id, nombre: m.nombre })),
    rutinas, contactos, enviarA: c.clips.enviarA || '',
    clips: { activo: !!ce.activo, permitido: !!ce.permitido, corriendo: !!ce.corriendo, grabando: !!ce.grabando, pausado: !!ce.pausado, segundos: ce.segundos, ultimo: ce.ultimo, error: ce.error || '' },
    whatsapp: whatsapp.leerEstado().fase,
    musica: { sonando: !!mu.sonando, cancion: mu.cancion || '', artista: mu.artista || '', tapa: /^https:\/\//.test(mu.tapa || '') ? mu.tapa : '', destino: mu.destino ? (mu.destino.nombre || String(mu.destino)) : '' },
    // A dónde se puede mandar la música (los nombres de Ajustes → Dispositivos → Teles y parlantes).
    aparatos: [...new Set((c.teles || []).map((t) => nombrePrincipal(t.nombre)).filter(Boolean))],
    conexion: { sin: !!conexion.estado().sin },
    // Para que la app de Android sepa cómo llegar a esta PC desde afuera (por la red de Tailscale).
    afuera: red.publica() ? { publica: red.publica() } : null,
    camara: { permitida: !!c.celular.camara, mirando: camara.estado().mirando.length },
    despertar: datosParaDespertar(), // para prender la PC por la red estando en casa
  };
}
// Inicio del celular: lo que muestran los widgets que necesitan datos de la PC.
async function inicioParaCelular() {
  const c = leerConfig();
  const clima = c.ciudad ? await require('./internet').climaDatos(c.ciudad).catch((e) => ({ error: e.message })) : { sinCiudad: true };
  const lista = notas.listar().slice().sort((a, b) => (Number(!!(b.cuando && !b.avisada)) - Number(!!(a.cuando && !a.avisada))) || (b.creada - a.creada)).slice(0, 6)
    .map((n) => ({ id: n.id, texto: n.texto, cuando: n.cuando || null, avisada: !!n.avisada }));
  return { clima, agenda: calendario.proximos(3), notas: lista };
}
// Lo que el celular avisa como notificación (si en Ajustes → Celular se eligió avisar ahí): recordatorios y eventos de las próximas 48 h.
function avisosParaCelular() {
  const av = leerConfig().avisos || {};
  const ahora = Date.now(); const hasta = ahora + 48 * 3600000;
  const salida = [];
  if ((av.recordatorios || {}).celular !== false) {
    for (const n of notas.pendientes()) if (!n.enviar && n.cuando > ahora && n.cuando <= hasta) salida.push({ id: `nota|${n.id}|${n.cuando}`, cuando: n.cuando, titulo: 'Recordatorio', texto: n.texto, tipo: 'recordatorio' });
  }
  if ((av.calendario || {}).celular !== false) salida.push(...calendario.proximosAvisos(ahora, hasta));
  return salida.sort((a, b) => a.cuando - b.cuando).slice(0, 60);
}
red.configurar({
  alCambiar: () => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('celular'); },
  anotar: (t) => historial.anotar(t),
});
// Lo mismo que se ve en Ajustes de la PC (notas, calendario, rutinas, historial), para el celular vinculado.
// Nada de cuentas, claves ni ajustes de la PC: eso queda en la PC.
const PARA_CELULAR = new Set([
  'notas:leer', 'notas:crear', 'notas:guardar', 'notas:borrar', 'notas:borrar-avisadas', 'notas:captura',
  'recordatorios:leer', 'recordatorios:borrar',
  'calendario:estado', 'calendario:conocidos', 'calendario:rango', 'calendario:guardar-local', 'calendario:borrar-local', 'calendario:cambiar', 'calendario:actualizar',
  'rutinas:leer', 'rutinas:guardar', 'rutinas:opciones', 'rutina:ejecutar',
  'historial:leer', 'historial:borrar', 'historial:limpiar', 'historial:repetir', 'historial:aRutina',
  'pc:estado',
]);
async function pcParaCelular(canal, args, quien) {
  if (!PARA_CELULAR.has(canal) || !canales.has(canal)) throw Object.assign(new Error('Eso no se puede hacer desde el celular.'), { status: 403 });
  const datos = Array.isArray(args) ? args.slice(0, 4) : [];
  if (canal === 'rutinas:guardar') {
    const l = datos[0];
    if (!Array.isArray(l) || l.length > 200 || !l.every((r) => r && typeof r === 'object' && typeof r.id === 'string' && Array.isArray(r.pasos) && r.pasos.length <= 60 && r.pasos.every((p) => p && typeof p === 'object' && typeof p.tipo === 'string')))
      throw Object.assign(new Error('Esas rutinas no tienen el formato esperado.'), { status: 400 });
  }
  if (canal === 'rutina:ejecutar') return correrRutina(String(datos[0] || ''), 'celular');
  const r = await canales.get(canal)(...datos);
  const abierto = ajustes && !ajustes.isDestroyed();
  if (canal === 'rutinas:guardar' && abierto) ajustes.webContents.send('rutinas-celular', leerRutinas());
  if (/^calendario:(guardar-local|borrar-local|cambiar)$/.test(canal) && abierto) ajustes.webContents.send('agenda-celular');
  const HECHO = { 'notas:crear': 'Anotó una nota', 'notas:guardar': 'Cambió una nota', 'notas:borrar': 'Borró una nota', 'notas:borrar-avisadas': 'Borró las notas avisadas', 'calendario:guardar-local': 'Guardó un evento', 'calendario:borrar-local': 'Borró un evento', 'calendario:cambiar': 'Cambió el aviso de un evento', 'rutinas:guardar': 'Cambió las rutinas' };
  if (HECHO[canal]) historial.terminar(historial.empezar(`${HECHO[canal]} (desde ${quien && quien.nombre ? quien.nombre : 'el celular'})`, 'celular'), { respuesta: 'Listo.' });
  return r;
}
// Cámara de seguridad: el notch avisa mientras alguien mira desde el celular.
camara.configurar({
  ajustes: () => { const c = leerConfig(); return { permitido: !!(c.celular && c.celular.camara), camara: (c.camara || {}).dispositivo || '', microfono: (c.voz || {}).microfono || '' }; },
  avisar: (texto) => { if (!texto) return; historial.terminar(historial.empezar('Cámara de seguridad', 'celular'), { respuesta: texto }); if (notch && !notch.isDestroyed()) notch.webContents.send('decir', { texto, voz: false }); },
});
const presencia = new Map(); // celular → { enCasa, cuando }
// Carpetas de la PC que el celular puede ver (Ajustes → Celular). Sin elegir: Descargas, Escritorio, Documentos, Imágenes y los clips.
function carpetasCompartidas() {
  const c = leerConfig();
  const elegidas = Array.isArray(c.celular.carpetas) ? c.celular.carpetas : null;
  const porDefecto = () => {
    const l = [];
    const sumar = (id, nombre, fn) => { try { const r = fn(); if (r && require('fs').existsSync(r)) l.push({ id, nombre, ruta: r }); } catch {} };
    sumar('descargas', 'Descargas', () => app.getPath('downloads'));
    sumar('escritorio', 'Escritorio', () => app.getPath('desktop'));
    sumar('documentos', 'Documentos', () => app.getPath('documents'));
    sumar('imagenes', 'Imágenes', () => app.getPath('pictures'));
    sumar('clips', 'Clips', () => c.clips.carpeta);
    return l;
  };
  return (elegidas || porDefecto()).filter((x) => x && x.ruta).map((x, i) => ({ id: x.id || `c${i}`, nombre: x.nombre || require('path').basename(x.ruta), ruta: x.ruta }));
}
manejar('celular:carpetas', () => carpetasCompartidas());
manejar('celular:elegirCarpeta', async () => {
  const r = await dialog.showOpenDialog(ajustes && !ajustes.isDestroyed() ? ajustes : undefined, { properties: ['openDirectory'], title: 'Carpeta para ver desde el celular' });
  return r.canceled ? null : r.filePaths[0];
});
// Prender la PC desde el celular (Wake-on-LAN): la placa de red de casa y la dirección de difusión de esa red.
function datosParaDespertar() {
  const os = require('os');
  for (const [nombre, l] of Object.entries(os.networkInterfaces())) {
    for (const x of l || []) {
      if (x.family !== 'IPv4' || x.internal || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address) || !x.mac || /^00:00:00/.test(x.mac)) continue;
      const ip = x.address.split('.').map(Number); const m = x.netmask.split('.').map(Number);
      return { mac: x.mac, ip: x.address, broadcast: ip.map((b, i) => (b & m[i]) | (~m[i] & 255)).join('.'), placa: nombre };
    }
  }
  return null;
}
celular.configurar({
  carpetas: carpetasCompartidas,
  abrirEnPC: async (ruta) => { const e = await shell.openPath(ruta); if (e) throw new Error(e); return 'Lo abrí en la PC.'; },
  guardadoEnPC: (ruta, quien) => { const texto = `${quien.nombre || 'El celular'} dejó "${require('path').basename(ruta)}" en la PC.`; historial.terminar(historial.empezar('Archivo desde el celular', 'celular'), { respuesta: texto }); if (notch && !notch.isDestroyed()) notch.webContents.send('decir', { texto, voz: false }); },
  remoto: async (o, quien) => {
    const r = await remoto.hacer(o);
    if (r) historial.terminar(historial.empezar(`Control de la PC: ${o.tipo}`, 'celular'), { respuesta: `${r} (${quien.nombre || 'celular'})` });
    return r;
  },
  despertarPC: datosParaDespertar,
  presencia: async ({ enCasa }, quien) => {
    const antes = presencia.get(quien.id);
    presencia.set(quien.id, { enCasa: !!enCasa, cuando: Date.now() });
    // Llegó: antes estaba afuera, o hace más de 2 horas que no se sabía de él.
    if (enCasa && (!antes || !antes.enCasa || Date.now() - antes.cuando > 2 * 3600000)) return { hechas: await disparadores.evento('llegar', `llegaste a casa (${quien.nombre || 'celular'})`) };
    return { hechas: [] };
  },
  camara: (res, opciones, quien) => camara.mirar(res, opciones, quien && quien.nombre ? `"${quien.nombre}"` : 'Un celular'),
  pc: pcParaCelular,
  inicio: inicioParaCelular,
  avisos: avisosParaCelular,
  texto: (texto, quien) => cerebro.textoRemoto(texto, { id: `cel:${quien.id}`, enVoz: !!leerConfig().celular.hablarEnPC, origen: 'celular' }),
  accion: accionDelCelular,
  estado: estadoParaCelular,
  clips: () => clips.listar(30),
  miniatura: (archivo) => clips.miniatura(archivo),
  enviarClip: async (archivo, contacto) => {
    const para = contacto || leerConfig().clips.enviarA;
    const entrada = historial.empezar(`Mandar el clip ${path.basename(archivo)} a ${para || '?'} (desde el celular)`, 'celular');
    try { const r = await clips.enviarGuardado(archivo, para, (x, mp4) => whatsapp.enviarVideo(x, mp4)); historial.terminar(entrada, { respuesta: 'Enviado.', ok: true }); return typeof r === 'string' ? r : `Listo, se lo mandé a ${para}.`; }
    catch (e) { historial.terminar(entrada, { respuesta: e.message, ok: false }); throw e; }
  },
  archivos: archivosParaCelular,
  recortar: async (archivo, t) => {
    const entrada = historial.empezar(`Recortar ${path.basename(archivo)} (desde el celular)`, 'celular');
    try {
      const r = await clips.recortar(archivo, { desde: t.desde, hasta: t.hasta, reemplazar: false });
      const dicho = `Listo: el recorte (${Math.round(r.segundos)} s) quedó en la PC como "${path.basename(r.archivo)}".`;
      historial.terminar(entrada, { respuesta: dicho, ok: true });
      return dicho;
    } catch (e) { historial.terminar(entrada, { respuesta: e.message, ok: false }); throw e; }
  },
  enviarArchivo: async (archivo, contacto) => {
    const entrada = historial.empezar(`Mandar ${path.basename(archivo)} a ${contacto} (desde el celular)`, 'celular');
    try {
      // Los clips siguen como siempre (se achican para que viajen como video); lo demás va tal cual (video, audio o documento).
      const r = clips.dentroDeCarpeta(archivo) && !descargas.dentroDeCarpeta(archivo) && /\.(mp4|mkv|webm|mov)$/i.test(archivo)
        ? await clips.enviarGuardado(archivo, contacto, (x, mp4) => whatsapp.enviarVideo(x, mp4))
        : await whatsapp.enviarArchivo(contacto, archivo, path.basename(archivo));
      const dicho = typeof r === 'string' ? r : `Listo, se lo mandé a ${contacto}.`;
      historial.terminar(entrada, { respuesta: dicho, ok: true });
      return dicho;
    } catch (e) { historial.terminar(entrada, { respuesta: e.message, ok: false }); throw e; }
  },
  descargar: async (pedido, quien) => {
    const entrada = historial.empezar(`Descargar ${pedido.modo === 'audio' ? 'el audio' : 'el video'} de ${pedido.url.slice(0, 90)} ${pedido.para === 'celular' ? 'para el celular' : 'en la PC'} (desde ${quien.nombre || 'el celular'})`, 'celular');
    try { const r = await descargas.encolar(pedido); historial.terminar(entrada, { respuesta: r.texto, ok: true }); return r; }
    catch (e) { historial.terminar(entrada, { respuesta: e.message, ok: false }); throw e; }
  },
  descarga: (id) => descargas.buscar(id),
  // Lo que el celular pasa a la PC queda en Descargas\Del celular (sin pisar nada).
  guardarSubida: async (ruta, nombre) => {
    const carpeta = path.join(descargas.carpetaDestino(), 'Del celular');
    fs.mkdirSync(carpeta, { recursive: true });
    const ext = path.extname(nombre); const base = path.basename(nombre, ext);
    let destino = path.join(carpeta, nombre);
    for (let i = 2; fs.existsSync(destino); i++) destino = path.join(carpeta, `${base} (${i})${ext}`);
    try { fs.renameSync(ruta, destino); } catch { fs.copyFileSync(ruta, destino); }
    const entrada = historial.empezar(`Guardar ${path.basename(destino)} del celular en la PC`, 'celular');
    historial.terminar(entrada, { respuesta: `En ${carpeta}`, ok: true });
    return `Listo, quedó en la PC: Descargas\\Del celular\\${path.basename(destino)}.`;
  },
  anotar: (texto, o = {}) => { const e = historial.empezar(texto, 'celular'); historial.terminar(e, { respuesta: o.error ? 'Ojo.' : 'Hecho.', ok: !o.error }); },
  cambio: () => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('celular'); },
});
let celularPrendiendo = Promise.resolve();
function sincronizarCelular() {
  const c = leerConfig().celular || {};
  celularPrendiendo = celularPrendiendo.then(async () => {
    if (c.activo && celular.puerto() && celular.puerto() !== (Number(c.puerto) || celular.PUERTO)) await celular.detener();
    if (c.activo && !celular.puerto()) { try { await celular.iniciar(Number(c.puerto) || celular.PUERTO); } catch (e) { anotarError('celular', e); historial.anotar(`Celular: no pude abrir el puerto ${c.puerto}: ${e.message}`, { error: true }); } }
    if (!c.activo && celular.puerto()) await celular.detener();
    // Modo casa (app de Android en la misma Wi-Fi).
    const casa = c.activo && c.casa !== false;
    const pc = Number(c.puertoCasa) || celular.PUERTO_CASA;
    if (casa && celular.puertoCasa() && celular.puertoCasa() !== pc) await celular.detenerCasa();
    if (casa && !celular.puertoCasa()) { try { await celular.iniciarCasa(pc); } catch (e) { anotarError('celular', e); historial.anotar(`Celular: no pude abrir el modo casa en el puerto ${pc}: ${e.message}`, { error: true }); } }
    if (!casa && celular.puertoCasa()) await celular.detenerCasa();
    // Desde afuera: Tailscale integrado (jarvis-red), apuntando al servidor del celular.
    if (c.activo && c.afuera && celular.puerto()) red.iniciar(celular.puerto()); else red.detener();
  }).catch(() => {});
  return celularPrendiendo;
}
async function estadoCelularParaAjustes(conTailscale = true) {
  await celularPrendiendo;
  const c = leerConfig().celular || {};
  const ts = conTailscale ? await celular.estadoTailscale(Number(c.https) || 443) : null;
  return { activo: !!c.activo, red: red.estado(), casa: { activo: !!celular.puertoCasa(), puerto: celular.puertoCasa(), ips: celular.ipsCasa() }, puerto: celular.puerto(), local: celular.puerto() ? `http://127.0.0.1:${celular.puerto()}` : '', dispositivos: celular.dispositivos(), codigo: celular.codigoVigente(), tailscale: ts, comando: celular.comandoServe(Number(c.https) || 443) };
}
manejar('celular:estado', (conTailscale) => estadoCelularParaAjustes(conTailscale !== false));
manejar('celular:codigo', async () => {
  await sincronizarCelular();
  if (!celular.puerto()) throw new Error('Primero prendé "Usar Jarvis desde el celular".');
  const c = leerConfig().celular || {};
  const cod = celular.nuevoCodigo();
  const ts = await celular.estadoTailscale(Number(c.https) || 443);
  const base = ts && ts.publicado ? ts.url : '';
  const url = base ? `${base}/#v=${cod.codigo}` : '';
  const qr = url ? await require('qrcode').toDataURL(url, { margin: 1, width: 280, color: { dark: '#000000', light: '#ffffff' } }) : '';
  return { ...cod, url, qr, base, tailscale: ts };
});
manejar('celular:redSalir', async () => { await red.salir(); const c = leerConfig(); guardarConfig({ ...c, celular: { ...c.celular, afuera: false } }); await sincronizarCelular(); return red.estado(); });
manejar('celular:cancelarCodigo', () => { celular.cancelarCodigo(); });
manejar('celular:revocar', (id) => { cerebro.olvidarRemota(`cel:${id}`); return celular.revocar(String(id)); });
manejar('celular:renombrar', ({ id, nombre }) => celular.renombrar(String(id), nombre));
manejar('celular:publicar', async () => { await sincronizarCelular(); if (!celular.puerto()) throw new Error('Primero prendé "Usar Jarvis desde el celular".'); return celular.publicarEnTailscale(Number((leerConfig().celular || {}).https) || 443); });
manejar('celular:despublicar', () => celular.despublicarDeTailscale(Number((leerConfig().celular || {}).https) || 443));

app.on('will-quit', () => { remoto.cerrar(); camara.cortarTodo(); clips.terminarRecortesPendientes().catch(() => {}); red.detener(); celular.detener().catch(() => {}); globalShortcut.unregisterAll(); oido.apagar(); clips.apagar(); clips.matarFfmpeg(); });

app.whenReady().then(async () => {
  arranque.iniciar(DATOS);
  arranque.marca('Electron listo');
  const interfaz = await servidor.iniciarInterfaz();
  urlBase = interfaz.url;
  camara.configurar({ urlBase });

  // Micrófono y cámara: solo para las páginas de Jarvis.
  const propio = (url) => typeof url === 'string' && url.startsWith(urlBase);
  session.defaultSession.setPermissionRequestHandler((wc, permiso, responder) => responder(permiso === 'media' && propio(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((_wc, permiso, origen) => permiso === 'media' && propio(origen + '/'));

  pc.configurar({ abrirRuta: (ruta) => shell.openPath(ruta), abrirEnlace: (url) => (/^steam:\/\/rungameid\/\d+$/.test(url) ? shell.openExternal(url) : Promise.reject(new Error('Dirección no permitida.'))) });
  acciones.configurar({ pedirAlNotch, fijarModo, decir, abrirAjustes, pedido: async (texto) => (await cerebro.textoRemoto(texto, { id: 'rutina', origen: 'click' })).texto });
  cerebro.configurar({
    estado: fase,
    salida: (pcm, hz) => { if (notch && !enSilencio()) notch.webContents.send('voz:salida', pcm, hz); },
    cortar: () => { if (notch) notch.webContents.send('voz:cortar'); },
    texto: (quien, texto) => { if (notch) notch.webContents.send('texto', { quien, texto }); },
    modo: () => leerConfig().modo,
    vozDeWindows,
    programas,
  });
  modelos.alCambiar((e) => {
    publicarEstado();
    if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('modelos', { modelos: e, voces: modelos.voces(), voz: oido.diagnostico() });
  });
  whatsapp.alCambiar((e) => {
    if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('wa', e);
    if (e && e.fase === 'conectado') conexion.reportar('whatsapp', true);
    else if (e && e.fase === 'error') conexion.reportar('whatsapp', false, { detalle: e.error || '' });
  });
  notificaciones.configurar({ alCambiar: () => publicarEstado(), alAvisar: avisarNovedad, modo: () => leerConfig().modo });
  // Conexión: internet, salud de cada servicio, modo sin conexión y la cola de mensajes pedidos sin red.
  conexion.configurar({
    alCambiar: (e) => { publicarEstado(); if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('conexion', e); armarBandeja(); },
    alertar: (texto, o = {}) => {
      historial.anotar(`Conexión: ${texto}`, { error: !o.bien });
      const estilo = (leerConfig().conexion || {}).alertas || 'burbuja';
      if (estilo === 'icono') return;
      if (notch && !notch.isDestroyed()) notch.webContents.send('decir', { texto, voz: false });
      if (estilo === 'voz' && !enSilencio()) cerebro.hablar(texto).catch((e) => console.error('[voz]', e.message));
    },
    alVolver: () => { calendario.actualizar().catch(() => {}); correo.iniciar(); },
    enviadores: { whatsapp: (it) => whatsapp.enviarTexto(it.contacto, it.mensaje) },
    ...(process.env.JARVIS_PRUEBA ? { sonda: async () => true } : {}), // en las pruebas con ventanas siempre "hay internet" (se prende a mano)
  });
  conexion.iniciar();
  whatsapp.alCambiarAgenda((a) => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('agenda', a); });
  historial.configurar({ alCambiar: () => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('historial'); } });
  musica.alCambiar(() => publicarEstado());
  musica.alRitmoDe((v) => { if (notch && !notch.isDestroyed() && leerConfig().apariencia.ojosBailan !== false) notch.webContents.send('ritmo', v); });
  whatsapp.alRecibir(
    (m) => notificaciones.agregar({ origen: 'whatsapp', de: m.de, grupo: m.grupo, texto: m.texto, clave: m.jid, avisar: m.avisar, enLista: m.enLista }),
    (jid) => notificaciones.quitar((n) => n.origen === 'whatsapp' && n.clave === jid), // lo leíste o contestaste desde el celular
  );
  const alLlegarMail = (mail) => notificaciones.agregar({
    origen: 'mail', de: mail.de, direccion: mail.direccion, asunto: mail.asunto, texto: mail.asunto, cuenta: mail.cuenta, via: mail.via,
    responderA: mail.responderA, mensajeId: mail.mensajeId, clave: `${mail.cuenta}:${mail.uid}`,
  });
  calendario.configurar({
    alAvisar: (a) => { if (((leerConfig().avisos || {}).calendario || {}).pc !== false) notificaciones.agregar(a); },
    // Los avisos por WhatsApp y por mail de cada evento (a mí o a otra persona): salen a su hora, o apenas se abre Jarvis si estaba cerrado (calendario.procesar reintenta hasta que salen).
    enviarWhatsapp: (para, texto) => whatsapp.enviarTexto(para, texto),
    enviarMail: (datos) => correo.enviar(datos),
    abrir: abrirEnNavegador,
  });
  androidtv.configurar({ resolver: (n) => cast.resolver(n) });
  streaming.configurar({ abrir: abrirEnNavegador, youtubeEnTele: (tele, video) => cast.youtube(tele, video), appEnTele: (tele, enlace) => androidtv.abrir(tele, enlace) });
  notas.alCambiar(() => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('notas'); });
  // Una nota con aviso suena a su hora: voz, burbuja y notificación de Windows (con la captura de la pantalla si la hay; al tocarla abre el link o las notas).
  recordatorios.iniciar((r, tarde) => {
    // Un WhatsApp programado ("a las 5 decile a Tomi..."): a su hora se manda. Si la PC estuvo apagada mucho rato, no se manda a destiempo: se avisa.
    if (r.enviar) {
      const muyTarde = tarde && Date.now() - r.cuando > 30 * 60 * 1000;
      const sinRed = !muyTarde && conexion.sinConexion();
      if (sinRed) { conexion.encolar({ tipo: 'whatsapp', contacto: r.enviar.contacto, mensaje: r.enviar.mensaje }); decir(`${conexion.motivo()}: dejé en cola el mensaje para ${r.enviar.contacto}; sale apenas vuelva internet.`); historial.anotar(`WhatsApp programado a ${r.enviar.contacto}: sin conexión, quedó en cola.`); return; }
      const listo = muyTarde ? Promise.reject(new Error('la PC estuvo apagada y ya pasó mucho tiempo')) : whatsapp.enviarTexto(r.enviar.contacto, r.enviar.mensaje);
      listo.then(() => { decir(whatsapp.esParaMi(r.enviar.contacto) ? `Te mandé a tu WhatsApp: ${r.enviar.mensaje}` : `Le mandé a ${r.enviar.contacto}: ${r.enviar.mensaje}`); historial.anotar(`WhatsApp programado enviado a ${r.enviar.contacto}.`); })
        .catch((e) => { fase('error', e.message); decir(`No pude mandar el mensaje programado a ${r.enviar.contacto}: ${e.message}`); historial.anotar(`WhatsApp programado a ${r.enviar.contacto} falló: ${e.message}`, { error: true }); });
      return;
    }
    // Además del aviso en Jarvis, un WhatsApp a tu propio chat (para cuando no estás frente a la PC).
    if ((leerConfig().notas || {}).porWhatsapp !== false && whatsapp.leerEstado().fase === 'conectado') {
      whatsapp.enviarTexto('yo', `Recordatorio: ${r.texto}${r.enlace ? `\n${r.enlace}` : ''}`).catch((e) => historial.anotar(`No pude mandarme el recordatorio por WhatsApp: ${e.message}`, { error: true }));
    }
    if (((leerConfig().avisos || {}).recordatorios || {}).pc === false) return; // avisa solo en el celular
    const conLink = !!r.enlace;
    const mudo = r.sonido === 'ninguno';
    // Queda en la lista de novedades (con su sonido y los ojos pidiendo atención) hasta que lo saques con el tacho.
    notificaciones.agregar({ origen: 'nota', de: 'Recordatorio', texto: r.texto, clave: `nota:${r.id}`, notaId: r.id, ...(r.sonido ? { sonido: r.sonido } : {}) });
    const texto = `${tarde ? `Mientras no estaba, se venció un recordatorio: ${r.texto}` : `Recordatorio: ${r.texto}`}${conLink ? '. Te dejé el link en la notificación y en tus notas.' : ''}`;
    fase('alerta', r.texto);
    if (notch && !notch.isDestroyed()) notch.webContents.send('decir', { texto: `Recordatorio: ${r.texto}`, voz: false });
    if (!mudo && !enSilencio()) setTimeout(() => cerebro.hablar(texto).catch((e) => console.error('[voz]', e.message)), 900); // primero suena el aviso, después lo dice
    if (Notification.isSupported()) {
      const ruta = notas.rutaDeCaptura(r.id);
      let imagen = icono();
      if (ruta) { try { imagen = nativeImage.createFromPath(ruta); } catch {} }
      const aviso = new Notification({ title: 'Jarvis · Recordatorio', body: conLink ? `${r.texto}\n${r.enlace}` : r.texto, icon: imagen, silent: mudo });
      aviso.on('click', () => { if (conLink) abrirEnNavegador(r.enlace).catch(() => {}); else abrirAjustes('notas'); });
      aviso.show();
    }
  });

  // Lo que se eligió en el instalador (nombre, componentes, arranque con Windows): se aplica una sola vez.
  let instalacion = null;
  try { instalacion = componentes.aplicarInstalacion(); } catch (e) { anotarError('instalacion', e); }
  componentes.configurar({ esenciales: bajarEsenciales, preparar: () => cerebro.preparar().then(() => publicarEstado()), descargas });
  leerRutinas();
  crearNotch();
  arranque.marca('notch creado');
  // Arranque en tandas: primero lo que se ve (notch, bandeja, atajo), después lo pesado repartido en el tiempo.
  // Todo junto trababa el mouse unos segundos (cargar los modelos de voz, leer mail, calendario, WhatsApp, buscar teles, capturar pantalla...).
  const D = (ms) => (PRUEBA ? Math.min(ms, 800) : ms);
  if (process.env.JARVIS_PRUEBA_CLIPS) { // solo para la prueba automática: espera, guarda un clip, cuenta lo que pasó y sale
    setTimeout(async () => {
      try { console.log('CLIP-ESTADO', JSON.stringify(clips.estado())); const c = await clips.guardar({ segundos: 10 }); console.log('CLIP-OK', JSON.stringify(c)); await clips.empezarGrabacion(); await new Promise((r) => setTimeout(r, 7000)); console.log('GRABACION-OK', JSON.stringify(await clips.terminarGrabacion())); } catch (e) { console.log('CLIP-ERROR', e.message); }
      app.exit(0);
    }, Number(process.env.JARVIS_PRUEBA_CLIPS) * 1000);
  }
  armarBandeja();
  aplicarAtajo();
  seguirCursor();
  setInterval(() => publicarEstado(), 60 * 1000); // el widget de agenda y el de clips se mantienen al día
  arranque.marca('interfaz lista');
  // Carga los modelos de voz en memoria (si ya están bajados) para que el primer pedido no espere. Va con prioridad baja (ver oido.js).
  arranque.tarea('modelos de voz', D(2500), () => cerebro.preparar().then(() => publicarEstado()).catch((e) => {
    anotarError('voz', e);
    if (notch && !PRUEBA) notch.webContents.send('decir', { texto: `No pude iniciar la escucha en esta PC: ${e.message}`, voz: false });
  }));
  arranque.tarea('celular', D(3000), () => sincronizarCelular());
  arranque.tarea('inicio con Windows', D(8000), () => aplicarInicio());
  arranque.tarea('calendario', D(12000), () => calendario.iniciar());
  arranque.tarea('correo', D(16000), () => correo.iniciar(alLlegarMail));
  arranque.tarea('WhatsApp', D(20000), () => { if (leerConfig().whatsapp.activo && whatsapp.haySesionGuardada()) return whatsapp.conectar(); });
  arranque.tarea('buscar teles', D(24000), () => cast.descubrir());
  if (!PRUEBA || process.env.JARVIS_PRUEBA_CLIPS) arranque.tarea('clips', PRUEBA ? 4000 : 18000, () => clips.sincronizar().then(publicarEstado)); // los clips arrancan si el modo de siempre los tiene prendidos
  if (!PRUEBA) arranque.tarea('borrados de clips', 40000, () => clips.finalizarBorrados((ruta) => shell.trashItem(ruta)).catch(() => {})); // clips que se mandaron a la Papelera justo antes de cerrar Jarvis
  // Los componentes tildados al instalar se bajan solos, de a uno, después de que la PC terminó de arrancar Jarvis.
  const pedidosAlInstalar = (instalacion && instalacion.componentes) || [];
  if (pedidosAlInstalar.length) arranque.tarea('componentes elegidos al instalar', D(6000), () => componentes.instalarVarios(pedidosAlInstalar));
  // Actualizaciones: solo en la versión instalada (se bajan de GitHub y se instalan al cerrar Jarvis).
  if (!PRUEBA) arranque.tarea('buscar actualizaciones', D(30000), () => actualizador.iniciar({ avisar: (texto) => { if (notch && !notch.isDestroyed()) notch.webContents.send('decir', { texto, voz: false }); historial.anotar(texto); }, alCambiar: (e) => { if (ajustes && !ajustes.isDestroyed()) ajustes.webContents.send('actualizacion', e); avisarSistema(); } }));
  // Rutinas que se hacen solas (hora, juego, programa, aparato de audio, llegar a casa, prender la PC).
  disparadores.configurar({
    rutinas: () => leerRutinas(),
    procesos: () => pc.listarProcesos(),
    salidas: () => pc.listarSalidas(),
    correr: async (id, motivo) => {
      const r = leerRutinas().find((x) => x.id === id);
      if (notch && !notch.isDestroyed() && r) notch.webContents.send('decir', { texto: `Hago "${require('./config').nombrePrincipal(r.nombre)}": ${motivo}.`, voz: false });
      return correrRutina(id, 'aviso', motivo);
    },
  });
  if (!PRUEBA || process.env.JARVIS_DISPARADORES) arranque.tarea('rutinas que se hacen solas', D(20000), () => { disparadores.iniciar(); setTimeout(() => disparadores.evento('inicio', 'se prendió la PC'), 25000); });
  // yt-dlp: se fija si salió una versión nueva al rato de arrancar y después dos veces por día.
  if (!PRUEBA) arranque.tarea('revisar yt-dlp', D(90000), () => { avisarSistema({ fuerza: true }); setInterval(() => avisarSistema({ fuerza: true }), 12 * 3600000).unref(); });
  // La primera vez faltan los modelos de voz: se avisa (una burbuja) dónde tocar para bajarlos.
  if (!cerebro.puedeEscuchar() && !PRUEBA && !pedidosAlInstalar.includes('voz')) {
    setTimeout(() => { if (notch && !cerebro.puedeEscuchar() && !resumenDescarga().bajando) notch.webContents.send('decir', { texto: 'Para escucharte tengo que bajar mis modelos de voz (una sola vez). Pasá el mouse por acá arriba y tocá "Bajar".', voz: false }); }, 4000);
  }
  screen.on('display-metrics-changed', () => ubicarNotch());
  screen.on('display-removed', () => ubicarNotch());

  if (PRUEBA) require(process.env.JARVIS_PRUEBA_GUION || '../../pruebas/captura').correr({ notch: () => notch, abrirAjustes, ajustes: () => ajustes, fase, carpeta: PRUEBA });
});
