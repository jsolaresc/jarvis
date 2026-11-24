// Google Calendar con TU cuenta de Google (solo lectura): trae TODOS los calendarios que ves en calendar.google.com,
// incluidos los que otra persona o empresa comparte con tu cuenta (esos no tienen "enlace secreto", por eso hace falta esto).
//  - Se conecta una vez: Jarvis abre la página de Google en tu navegador, entrás VOS (Jarvis no ve tu contraseña) y aceptás
//    el permiso de solo lectura. Google le devuelve a Jarvis una llave que se guarda solo en esta PC (datos/config.json).
//  - Hace falta un "ID de cliente" propio (gratis, se crea en console.cloud.google.com en unos minutos; Ajustes explica cómo):
//    es lo que Google pide a cualquier programa que quiera leer un calendario. No hay forma de saltearlo sin pasar por Google.
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { leerConfig, guardarConfig } = require('./config');

const ALCANCE = 'https://www.googleapis.com/auth/calendar.readonly';
const URL_AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const HOST_TOKEN = process.env.JARVIS_URL_GOOGLE_TOKEN || 'https://oauth2.googleapis.com/token';
const API = process.env.JARVIS_URL_GOOGLE_API || 'https://www.googleapis.com/calendar/v3';

const base64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function pedirJSON(metodo, url, { cabeceras = {}, cuerpo } = {}) {
  return new Promise((ok, mal) => {
    const u = new URL(url);
    const modulo = u.protocol === 'http:' ? http : https;
    const datos = cuerpo === undefined ? null : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    const r = modulo.request(u, { method: metodo, timeout: 20000, headers: { 'User-Agent': 'Jarvis', Accept: 'application/json', ...(datos ? { 'Content-Length': Buffer.byteLength(datos) } : {}), ...cabeceras } }, (res) => {
      const trozos = [];
      res.on('data', (t) => trozos.push(t));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}'); } catch { json = null; }
        if (res.statusCode >= 200 && res.statusCode < 300) return ok(json || {});
        const e = new Error((json && (json.error_description || (json.error && (json.error.message || json.error)))) || `Google contestó ${res.statusCode}.`);
        e.estado = res.statusCode; e.codigo = json && json.error && (json.error.status || json.error);
        mal(e);
      });
    });
    r.on('timeout', () => r.destroy(new Error('Google tardó demasiado en contestar.')));
    r.on('error', mal);
    if (datos) r.write(datos);
    r.end();
  });
}
const formulario = (o) => new URLSearchParams(o).toString();

const cfg = () => (leerConfig().calendario || {}).google || {};
function guardarGoogle(cambios) {
  const c = leerConfig();
  guardarConfig({ ...c, calendario: { ...c.calendario, google: { ...(c.calendario.google || {}), ...cambios } } });
}
const conectada = () => !!cfg().token;
const faltanDatos = () => !String(cfg().clientId || '').trim() || !String(cfg().clientSecret || '').trim();

// ---------- Conectar (la contraseña la escribís vos, en Google) ----------
let esperando = null; // { servidor, reloj, cancelar }
function cancelarConexion() { if (esperando) esperando.cancelar(new Error('Se canceló la conexión.')); }

// abrirNavegador(url) lo pone main.js (abre tu navegador). Devuelve cuando Google le dio el permiso (o falló / pasaron 5 minutos).
async function conectar(abrirNavegador) {
  if (faltanDatos()) throw new Error('Primero pegá el ID de cliente y el secreto (los creás en console.cloud.google.com, más abajo está explicado).');
  cancelarConexion();
  const { clientId, clientSecret } = cfg();
  const verificador = base64url(crypto.randomBytes(48));
  const estado = base64url(crypto.randomBytes(16));
  const servidor = http.createServer();
  await new Promise((ok, mal) => { servidor.once('error', mal); servidor.listen(0, '127.0.0.1', ok); });
  const redireccion = `http://127.0.0.1:${servidor.address().port}`;
  let terminar;
  const resultado = new Promise((ok, mal) => { terminar = { ok, mal }; });
  const reloj = setTimeout(() => terminar.mal(new Error('Pasaron 5 minutos sin que aceptaras el permiso en Google.')), 5 * 60 * 1000);
  esperando = { cancelar: (e) => terminar.mal(e) };
  servidor.on('request', (req, res) => {
    const u = new URL(req.url, redireccion);
    if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
    const error = u.searchParams.get('error');
    const codigo = u.searchParams.get('code');
    const pagina = (titulo, texto) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset="utf-8"><title>Jarvis</title><body style="font-family:system-ui;background:#101114;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${titulo}</h2><p>${texto}</p></div>`); };
    if (u.searchParams.get('state') !== estado) { pagina('Algo no coincide', 'Volvé a Jarvis e intentá de nuevo.'); return; }
    if (error || !codigo) { pagina('No se dio el permiso', 'Podés cerrar esta pestaña y volver a Jarvis.'); terminar.mal(new Error(error === 'access_denied' ? 'No aceptaste el permiso en Google.' : `Google respondió: ${error || 'sin código'}.`)); return; }
    pagina('Listo, ya está conectado', 'Podés cerrar esta pestaña y volver a Jarvis.');
    terminar.ok(codigo);
  });
  try {
    const q = new URLSearchParams({ client_id: clientId.trim(), redirect_uri: redireccion, response_type: 'code', scope: ALCANCE, access_type: 'offline', prompt: 'consent', state: estado, code_challenge: base64url(crypto.createHash('sha256').update(verificador).digest()), code_challenge_method: 'S256' });
    await abrirNavegador(`${URL_AUTORIZAR}?${q}`);
    const codigo = await resultado;
    const t = await pedirJSON('POST', HOST_TOKEN, { cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded' }, cuerpo: formulario({ code: codigo, client_id: clientId.trim(), client_secret: clientSecret.trim(), redirect_uri: redireccion, grant_type: 'authorization_code', code_verifier: verificador }) });
    if (!t.refresh_token) throw new Error('Google no entregó el permiso permanente. Sacá a Jarvis de myaccount.google.com/permissions y conectá de nuevo.');
    acceso = { token: t.access_token, vence: Date.now() + (t.expires_in || 3600) * 1000 - 60000 };
    guardarGoogle({ token: t.refresh_token });
    return { ok: true };
  } finally { clearTimeout(reloj); esperando = null; try { servidor.close(); servidor.closeAllConnections && servidor.closeAllConnections(); } catch {} }
}

function desconectar() {
  acceso = null;
  guardarGoogle({ token: '', cuenta: '', calendarios: [] });
}

// ---------- Llamadas a la API ----------
let acceso = null;
async function tokenDeAcceso() {
  if (acceso && acceso.vence > Date.now()) return acceso.token;
  const g = cfg();
  if (!g.token) throw new Error('Falta conectar tu cuenta de Google (Ajustes → Cuentas → Calendario).');
  try {
    const t = await pedirJSON('POST', HOST_TOKEN, { cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded' }, cuerpo: formulario({ client_id: String(g.clientId || '').trim(), client_secret: String(g.clientSecret || '').trim(), refresh_token: g.token, grant_type: 'refresh_token' }) });
    acceso = { token: t.access_token, vence: Date.now() + (t.expires_in || 3600) * 1000 - 60000 };
    return acceso.token;
  } catch (e) {
    if (e.estado === 400 || e.estado === 401) { const x = new Error('Google ya no acepta el permiso (venció o lo sacaste): conectá la cuenta de nuevo en Ajustes → Cuentas → Calendario.'); x.permiso = true; throw x; }
    throw e;
  }
}
async function api(ruta, parametros = {}) {
  const token = await tokenDeAcceso();
  const q = new URLSearchParams(parametros).toString();
  try { return await pedirJSON('GET', `${API}${ruta}${q ? `?${q}` : ''}`, { cabeceras: { Authorization: `Bearer ${token}` } }); } catch (e) {
    if (e.estado === 403 && /has not been used|disabled|accessNotConfigured/i.test(e.message)) throw new Error('Falta activar "Google Calendar API" en tu proyecto de console.cloud.google.com (APIs y servicios → Biblioteca).');
    if (e.estado === 401) { acceso = null; }
    throw e;
  }
}

// Todos los calendarios de la cuenta: { id, nombre, color, rol, principal, tildado } (tildado = el casillero de la lista de la izquierda en Google Calendar).
async function calendarios() {
  const salida = [];
  let pagina = '';
  do {
    const r = await api('/users/me/calendarList', { maxResults: '250', ...(pagina ? { pageToken: pagina } : {}) });
    for (const i of r.items || []) salida.push({ id: i.id, nombre: i.summaryOverride || i.summary || i.id, color: i.backgroundColor || '', rol: i.accessRole || '', principal: !!i.primary, tildado: !!i.selected });
    pagina = r.nextPageToken || '';
  } while (pagina);
  const principal = salida.find((c) => c.principal);
  if (principal && !cfg().cuenta) guardarGoogle({ cuenta: principal.id });
  return salida;
}

// Los eventos de un calendario entre dos fechas, ya con los repetidos expandidos (singleEvents) y en el formato de calendario.js.
async function eventosDe(cal, desde, hasta) {
  const salida = [];
  let pagina = '';
  do {
    const r = await api(`/calendars/${encodeURIComponent(cal.id)}/events`, { singleEvents: 'true', orderBy: 'startTime', timeMin: desde.toISOString(), timeMax: hasta.toISOString(), maxResults: '250', ...(pagina ? { pageToken: pagina } : {}) });
    for (const e of r.items || []) {
      if (e.status === 'cancelled' || !e.start) continue;
      if (e.eventType === 'workingLocation') continue; // "Trabajo desde casa" no es un evento
      const yo = (e.attendees || []).find((a) => a.self);
      if (yo && yo.responseStatus === 'declined') continue; // los que rechazaste no avisan
      const todoElDia = !!e.start.date && !e.start.dateTime;
      // Las fechas "de día entero" vienen como YYYY-MM-DD: se toman en hora local (no en UTC) para que no caigan el día anterior.
      const aFecha = (x) => (x.dateTime ? new Date(x.dateTime) : new Date(`${x.date}T00:00:00`));
      const inicio = aFecha(e.start);
      salida.push({ id: `g|${cal.id}|${e.id}|${inicio.toISOString()}`, titulo: String(e.summary || (/freeBusy/i.test(cal.rol) ? 'Ocupado' : 'Sin título')), lugar: String(e.location || ''), inicio, fin: e.end ? aFecha(e.end) : inicio, todoElDia, calendario: cal.nombre, enlace: String(e.htmlLink || ''), repite: !!e.recurringEventId });
    }
    pagina = r.nextPageToken || '';
  } while (pagina);
  return salida;
}

// Los calendarios que se usan: los elegidos en Ajustes o, si no se eligió nada, los que tenés tildados en Google Calendar.
function elegidosDe(lista) {
  const quitados = Array.isArray(cfg().ocultos) ? cfg().ocultos : []; // los que se quitaron de la lista en Ajustes no se usan nunca
  lista = lista.filter((c) => !quitados.includes(c.id));
  const guardados = cfg().elegidos;
  if (Array.isArray(guardados)) return lista.filter((c) => guardados.includes(c.id));
  return lista.filter((c) => c.tildado);
}
let listaCache = { cuando: 0, lista: [] };
async function eventos(desde, hasta) {
  if (!listaCache.lista.length || Date.now() - listaCache.cuando > 30 * 60 * 1000) listaCache = { cuando: Date.now(), lista: await calendarios() };
  const usar = elegidosDe(listaCache.lista);
  const grupos = await Promise.allSettled(usar.map((c) => eventosDe(c, desde, hasta)));
  const todos = grupos.flatMap((g) => (g.status === 'fulfilled' ? g.value : []));
  const caidos = grupos.filter((g) => g.status === 'rejected');
  if (caidos.length && caidos.length === grupos.length) throw caidos[0].reason; // si fallaron todos, es un error de verdad
  return { eventos: todos, calendarios: usar.length, fallaron: caidos.length };
}
const olvidarLista = () => { listaCache = { cuando: 0, lista: [] }; };

module.exports = { conectar, cancelarConexion, desconectar, conectada, calendarios, eventos, olvidarLista, elegidosDe, _pruebas: { pedirJSON, reiniciar: () => { acceso = null; listaCache = { cuando: 0, lista: [] }; } } };
