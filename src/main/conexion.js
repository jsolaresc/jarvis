// Conexión: ¿hay internet?, ¿anda cada servicio? y el "modo sin conexión".
// - Sin conexión se activa solo cuando se corta internet (se vuelve a salir solo cuando regresa) o a mano (config.conexion.manual).
// - Mientras está activo, Jarvis no consulta modelos en la nube, ni revisa mail/calendario por internet, ni manda mensajes: lo de la PC
//   (clips, recordatorios, avisos del calendario ya cargado, rutinas, voz y oído locales, Cast por la red de casa) sigue andando.
// - Si hay internet pero un servicio falla (Groq, Gemini, WhatsApp, mail, calendario) avisa UNA vez cuando cae y otra cuando vuelve.
// - Los WhatsApp de texto que se piden sin conexión pueden quedar en cola y salen solos al volver.
const net = require('net');
const { leerConfig, guardarConfig, leerJSON, guardarJSON } = require('./config');

const NOMBRES = { internet: 'Internet', groq: 'Groq', gemini: 'Gemini', whatsapp: 'WhatsApp', mail: 'Mail', calendario: 'Calendario' };
const COLA = 'cola-sin-conexion.json';
const CADA_CON_RED = 20000; // cada cuánto se mira si hay internet
const CADA_SIN_RED = 6000; // y cada cuánto cuando no hay (para volver rápido)
const MAXIMO_EN_COLA = 6 * 3600 * 1000; // lo que lleva más de 6 horas en la cola ya no se manda: perdió sentido

let internet = true;
let fallosSeguidos = 0;
let reloj = null;
let enviando = false;
const servicios = new Map(); // id -> { estado: 'ok'|'caido'|'cupo', desde, detalle, fallos, avisado, porInternet }
let enCambio = () => {};
let alertar = () => {};
let enVolver = () => {};
let enviadores = {};
let sonda = sondearRed;

function configurar(f = {}) {
  if (f.alCambiar) enCambio = f.alCambiar;
  if (f.alertar) alertar = f.alertar;
  if (f.alVolver) enVolver = f.alVolver;
  if (f.enviadores) enviadores = f.enviadores;
  if (f.sonda) sonda = f.sonda;
}

const manual = () => !!(leerConfig().conexion || {}).manual;
const sinConexion = () => manual() || !internet;
const hayInternet = () => internet;

// ¿Se puede abrir una conexión a internet? Se prueba un puerto 443 de tres servicios públicos (sin DNS, sin mandar nada): alcanza con que uno conteste.
function sondearRed() {
  const intentar = (host) => new Promise((ok) => {
    const s = net.connect({ host, port: 443 });
    const fin = (v) => { s.destroy(); ok(v); };
    s.setTimeout(3000, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
  return Promise.all(['1.1.1.1', '8.8.8.8', '9.9.9.9'].map(intentar)).then((r) => r.some(Boolean));
}

function publicar() { try { enCambio(estado()); } catch {} }

// Una vuelta del chequeo. Hacen falta dos fallos seguidos para dar por cortado internet (un tropiezo suelto no cuenta) y un acierto para darlo por vuelto.
async function revisar() {
  let ok = false;
  try { ok = await sonda(); } catch { ok = false; }
  if (ok) {
    fallosSeguidos = 0;
    if (!internet) {
      internet = true;
      for (const s of servicios.values()) if (s.porInternet) { s.estado = 'ok'; s.fallos = 0; s.porInternet = false; }
      if (!manual()) { try { alertar('Volvió la conexión a internet.', { tipo: 'internet', bien: true }); } catch {} }
      publicar();
      if (!manual()) { try { enVolver(); } catch {} }
    }
  } else {
    fallosSeguidos++;
    if (internet && fallosSeguidos >= 2) {
      internet = false;
      for (const [id, s] of servicios) if (s.estado !== 'ok') { s.porInternet = true; s.avisado = true; } // lo que ya estaba caído no se vuelve a avisar: la causa es internet
      try { alertar('Sin conexión a internet: paso a modo sin conexión. Siguen andando los clips, los recordatorios y lo de esta PC.', { tipo: 'internet' }); } catch {}
      publicar();
    }
  }
  if (!sinConexion()) vaciarCola().catch(() => {});
  return internet;
}

function iniciar(f) {
  if (f) configurar(f);
  detener();
  const vuelta = async () => { await revisar().catch(() => {}); reloj = setTimeout(vuelta, internet ? CADA_CON_RED : CADA_SIN_RED); if (reloj.unref) reloj.unref(); };
  reloj = setTimeout(vuelta, 3000); if (reloj.unref) reloj.unref();
}
function detener() { if (reloj) clearTimeout(reloj); reloj = null; }

// Prender o apagar el modo sin conexión a mano.
function fijarManual(valor) {
  const c = leerConfig();
  const nuevo = !!valor;
  if (!!(c.conexion || {}).manual === nuevo) return nuevo;
  guardarConfig({ ...c, conexion: { ...(c.conexion || {}), manual: nuevo } });
  try { alertar(nuevo ? 'Modo sin conexión activado: Jarvis no usa internet hasta que lo apagues.' : 'Modo sin conexión apagado.', { tipo: 'manual', bien: !nuevo }); } catch {}
  publicar();
  if (!nuevo && internet) { try { enVolver(); } catch {} vaciarCola().catch(() => {}); }
  return nuevo;
}

// Un servicio contó cómo le fue. ok: true/false; cupo: se quedó sin cupo gratuito (no es una caída); detalle: el motivo.
// Se avisa una sola vez al caer (a la segunda falla seguida) y otra al volver. Si no hay internet no se avisa de cada servicio: ya se avisó de internet.
function reportar(id, ok, { detalle = '', cupo = false } = {}) {
  if (!NOMBRES[id] || id === 'internet') return;
  const s = servicios.get(id) || { estado: 'ok', desde: Date.now(), detalle: '', fallos: 0, avisado: false, porInternet: false };
  servicios.set(id, s);
  const antes = s.estado;
  if (ok) {
    s.fallos = 0;
    if (antes !== 'ok') {
      s.estado = 'ok'; s.desde = Date.now(); s.detalle = '';
      if (s.avisado && !s.porInternet) { try { alertar(`${NOMBRES[id]} volvió a funcionar.`, { tipo: id, bien: true }); } catch {} }
      s.avisado = false; s.porInternet = false;
      publicar();
    }
    return;
  }
  s.fallos++;
  s.detalle = String(detalle || '').slice(0, 160);
  const nuevo = cupo ? 'cupo' : 'caido';
  if (antes === nuevo) return;
  if (!cupo && s.fallos < 2) return; // un tropiezo suelto no es una caída
  s.estado = nuevo; s.desde = Date.now();
  if (sinConexion()) { s.porInternet = true; s.avisado = true; publicar(); return; }
  s.avisado = true; s.porInternet = false;
  try { alertar(cupo ? `${NOMBRES[id]} se quedó sin cupo gratuito por ahora: uso el siguiente.` : `${NOMBRES[id]} no responde${s.detalle ? ` (${s.detalle})` : ''}. Te aviso cuando vuelva.`, { tipo: id }); } catch {}
  publicar();
}

function estado() {
  const todos = [{ id: 'internet', nombre: NOMBRES.internet, estado: internet ? 'ok' : 'caido', detalle: internet ? '' : 'sin conexión', desde: 0 },
    ...[...servicios].map(([id, s]) => ({ id, nombre: NOMBRES[id], estado: s.estado, detalle: s.detalle, desde: s.desde }))];
  return { sin: sinConexion(), manual: manual(), internet, enCola: cola().length, problemas: todos.filter((x) => x.estado !== 'ok'), todos };
}

// ---- Cola de mensajes pedidos sin conexión ----
const cola = () => { const c = leerJSON(COLA, []); return Array.isArray(c) ? c : []; };
function encolar(item) {
  const c = cola();
  c.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, creado: Date.now(), ...item });
  guardarJSON(COLA, c);
  publicar();
}
function descartarCola() { guardarJSON(COLA, []); publicar(); }
// Manda lo que quedó en cola (uno por uno, en orden). Lo que falla se reintenta en la próxima vuelta; lo viejo se descarta con un aviso.
async function vaciarCola() {
  if (enviando || sinConexion()) return { enviados: 0 };
  const pendientes = cola();
  if (!pendientes.length) return { enviados: 0 };
  enviando = true;
  let enviados = 0;
  try {
    const quedan = [];
    for (const it of pendientes) {
      if (Date.now() - it.creado > MAXIMO_EN_COLA) { try { alertar(`No mandé el mensaje para ${it.contacto || 'alguien'}: llevaba demasiado en cola.`, { tipo: 'cola' }); } catch {} continue; }
      const enviar = enviadores[it.tipo];
      try { if (!enviar) throw new Error('sin cómo enviarlo'); await enviar(it); enviados++; } catch { quedan.push(it); }
    }
    guardarJSON(COLA, quedan);
  } finally { enviando = false; }
  if (enviados) { try { alertar(enviados === 1 ? 'Mandé el mensaje que había quedado en cola.' : `Mandé los ${enviados} mensajes que habían quedado en cola.`, { tipo: 'cola', bien: true }); } catch {} }
  publicar();
  return { enviados };
}

// Qué pasos de una rutina o pedido necesitan internet: null = anda sin conexión.
// 'cola': un texto de WhatsApp se puede dejar para después; 'no': no tiene sentido mandarlo tarde (una foto de ahora, un audio) o no hay cómo.
const NECESITAN = {
  whatsapp: 'cola', foto_whatsapp: 'no', audio_whatsapp: 'no', musica: 'no', ver: 'no', partido: 'no', clima: 'no', buscar: 'no', evento: 'no',
};
function queHacerSinConexion(paso) {
  if (!paso || !sinConexion()) return null;
  if (paso.tipo === 'clip' && /enviar/.test(String(paso.accion || ''))) return 'no';
  if (paso.tipo === 'reproducir' && !paso.tele) return null;
  return NECESITAN[paso.tipo] || null;
}
const motivo = () => (manual() ? 'Estoy en modo sin conexión' : 'No tengo internet ahora');

module.exports = { configurar, iniciar, detener, revisar, sinConexion, hayInternet, manual, fijarManual, reportar, estado, encolar, cola, descartarCola, vaciarCola, queHacerSinConexion, motivo, NOMBRES };
