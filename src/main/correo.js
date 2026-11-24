// Mails: Jarvis mira cada tanto si llegó algo nuevo a la bandeja de entrada y avisa (según las reglas
// de Notificaciones). Leer es siempre en modo solo lectura: no marca nada como leído ni borra. Enviar,
// solo cuando el usuario contesta un aviso desde el notch (y solo con Gmail).
//   - Gmail: por IMAP con una "contraseña de aplicación" que genera el usuario en su cuenta de Google.
//   - Hotmail/Outlook: Microsoft ya no acepta contraseñas; se entra con un permiso (OAuth) que el
//     usuario otorga en la página de Microsoft con un código — Jarvis nunca ve la contraseña.
const conexion = require('./conexion');
const { leerConfig, guardarConfig, leerJSON, guardarJSON } = require('./config');

const SERVIDORES = {
  gmail: aDonde(process.env.JARVIS_IMAP_GMAIL, 'imap.gmail.com'),
  outlook: aDonde(process.env.JARVIS_IMAP_OUTLOOK, 'outlook.office365.com'),
};
// (Las variables de entorno son para las pruebas, que usan un servidor de correo de mentira.)
function aDonde(prueba, real) {
  if (!prueba) return { host: real, port: 993, secure: true };
  const [host, puerto] = prueba.split(':');
  return { host, port: Number(puerto), secure: false };
}
// Para contestar: el servidor de salida de Gmail acepta la misma "contraseña de aplicación".
const SALIDA_GMAIL = process.env.JARVIS_SMTP_GMAIL
  ? { host: process.env.JARVIS_SMTP_GMAIL.split(':')[0], port: Number(process.env.JARVIS_SMTP_GMAIL.split(':')[1]), secure: false, ignoreTLS: true }
  : { host: 'smtp.gmail.com', port: 465, secure: true };
const MICROSOFT = (process.env.JARVIS_URL_MICROSOFT || 'https://login.microsoftonline.com/consumers/oauth2/v2.0').replace(/\/+$/, '');
const PERMISO = 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access';

const NOMBRES = { gmail: 'Gmail', outlook: 'Hotmail/Outlook' };
const estado = { gmail: { ok: null, error: null, cuando: 0 }, outlook: { ok: null, error: null, cuando: 0 } };
let alLlegar = () => {}; // (mail) => ...
let reloj = null;
let revisando = false;

// Las direcciones de Hotmail/Outlook del usuario: los mails que reenvía a Gmail se reconocen por llegar "para" una de ellas.
const direccionesOutlook = () => String((leerConfig().correo.outlook || {}).usuario || '').toLowerCase().split(/[\s,;]+/).filter((d) => d.includes('@'));
const guardados = () => { const g = leerJSON('correo.json', {}); return g && typeof g === 'object' && !Array.isArray(g) ? g : {}; };

// ---------- Microsoft: permiso con código de dispositivo ----------
async function formulario(url, campos) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(campos).toString() });
  let json = {};
  try { json = await r.json(); } catch {}
  return { ok: r.ok, json };
}

let conexionEnCurso = null; // para poder cancelar si se pide otro código

// Paso 1: pide un código. Devuelve { codigo, url } para mostrarle al usuario, y "espera", una promesa
// que termina cuando el usuario autorizó en la página de Microsoft (o falla si venció o lo rechazó).
async function conectarOutlook() {
  const c = leerConfig().correo.outlook;
  if (!c.idAplicacion) throw new Error('Falta el "Id de aplicación" de Microsoft.');
  const inicio = await formulario(`${MICROSOFT}/devicecode`, { client_id: c.idAplicacion, scope: PERMISO });
  if (!inicio.ok || !inicio.json.device_code) throw new Error(`Microsoft no aceptó el pedido: ${inicio.json.error_description || inicio.json.error || 'sin detalle'}`.split('\r\n')[0]);
  const { device_code: codigoInterno, user_code: codigo, verification_uri: url } = inicio.json;
  const intervalo = Math.max(1, Number(inicio.json.interval) || 5) * 1000;
  const vence = Date.now() + (Number(inicio.json.expires_in) || 900) * 1000;
  const marca = {};
  conexionEnCurso = marca;
  const espera = (async () => {
    while (Date.now() < vence) {
      await new Promise((r) => setTimeout(r, process.env.JARVIS_URL_MICROSOFT ? 30 : intervalo));
      if (conexionEnCurso !== marca) throw new Error('Se pidió otro código.');
      const r = await formulario(`${MICROSOFT}/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: c.idAplicacion, device_code: codigoInterno });
      if (r.ok && r.json.refresh_token) {
        const actual = leerConfig();
        guardarConfig({ ...actual, correo: { ...actual.correo, outlook: { ...actual.correo.outlook, token: r.json.refresh_token } } });
        accesos.outlook = { token: r.json.access_token, vence: Date.now() + (Number(r.json.expires_in) || 3000) * 1000 - 60000 };
        return true;
      }
      if (r.json.error && r.json.error !== 'authorization_pending' && r.json.error !== 'slow_down') {
        throw new Error(r.json.error === 'authorization_declined' ? 'Rechazaste el permiso.' : r.json.error === 'expired_token' ? 'El código venció.' : `Microsoft respondió: ${r.json.error}`);
      }
    }
    throw new Error('El código venció.');
  })();
  espera.catch(() => {});
  return { codigo, url, espera };
}

const accesos = {}; // id -> { token, vence }
async function accesoOutlook() {
  if (accesos.outlook && Date.now() < accesos.outlook.vence) return accesos.outlook.token;
  const c = leerConfig().correo.outlook;
  const r = await formulario(`${MICROSOFT}/token`, { grant_type: 'refresh_token', client_id: c.idAplicacion, refresh_token: c.token, scope: PERMISO });
  if (!r.ok || !r.json.access_token) throw Object.assign(new Error('el permiso de Microsoft venció o fue revocado: hay que conectar de nuevo'), { permiso: true });
  if (r.json.refresh_token && r.json.refresh_token !== c.token) {
    const actual = leerConfig();
    guardarConfig({ ...actual, correo: { ...actual.correo, outlook: { ...actual.correo.outlook, token: r.json.refresh_token } } });
  }
  accesos.outlook = { token: r.json.access_token, vence: Date.now() + (Number(r.json.expires_in) || 3000) * 1000 - 60000 };
  return accesos.outlook.token;
}

// ---------- Revisar una casilla ----------
function configurada(id) {
  const c = leerConfig().correo[id];
  return id === 'gmail' ? !!(c.usuario && c.clave) : !!(c.web || (c.usuario && c.idAplicacion && c.token));
}

async function abrir(id) {
  const { ImapFlow } = require('imapflow');
  const c = leerConfig().correo[id];
  const auth = id === 'gmail' ? { user: c.usuario, pass: c.clave.replace(/\s+/g, '') } : { user: c.usuario, accessToken: await accesoOutlook() };
  const cliente = new ImapFlow({ ...SERVIDORES[id], auth, logger: false, disableAutoIdle: true, socketTimeout: 30000, greetingTimeout: 15000 });
  cliente.on('error', () => {}); // los cortes se manejan donde se usa
  await cliente.connect();
  return cliente;
}

const explicar = (e) => {
  const texto = `${e.message} ${e.responseText || ''} ${e.code || ''}`;
  if (e.permiso) return e.message;
  if (e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(texto)) return 'no aceptó el usuario o la clave';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|timeout/i.test(texto)) return 'no hay conexión';
  return e.message;
};

// Devuelve los mails nuevos sin leer desde la última vez (la primera vez no avisa de lo viejo:
// solo toma nota de por dónde va la casilla).
async function revisar(id) {
  if (!configurada(id)) return [];
  if (id === 'outlook' && leerConfig().correo.outlook.web) return revisarPorNavegador();
  const c = leerConfig().correo[id];
  const memoria = guardados();
  const clave = `${id}:${c.usuario}`;
  let cliente = null;
  try {
    cliente = await abrir(id);
    const candado = await cliente.getMailboxLock('INBOX', { readOnly: true });
    const nuevos = [];
    try {
      const siguiente = Number(cliente.mailbox.uidNext) || 1;
      const validez = String(cliente.mailbox.uidValidity || '');
      const previo = memoria[clave];
      if (!previo || previo.validez !== validez) {
        memoria[clave] = { validez, desde: siguiente };
      } else if (siguiente > previo.desde) {
        const rango = { uid: `${previo.desde}:*`, seen: false };
        let uids = null;
        if (id === 'gmail' && c.soloPrincipal) {
          // Gmail deja filtrar por pestaña: así las promociones y las redes sociales ni se consideran.
          // (Lo que viene reenviado de Hotmail entra aunque Gmail lo haya puesto en otra pestaña.)
          const propias = direccionesOutlook().map((d) => `to:${d}`);
          const consulta = propias.length ? `(category:primary OR ${propias.join(' OR ')})` : 'category:primary';
          try { uids = await cliente.search({ ...rango, gmraw: consulta }, { uid: true }); } catch { uids = null; }
        }
        if (!uids) uids = await cliente.search(rango, { uid: true });
        uids = (uids || []).filter((u) => u >= previo.desde).slice(-20);
        if (uids.length) {
          for await (const m of cliente.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
            const de = (m.envelope && m.envelope.from && m.envelope.from[0]) || {};
            const vuelta = (m.envelope && m.envelope.replyTo && m.envelope.replyTo[0]) || de;
            const paraMi = [...((m.envelope && m.envelope.to) || []), ...((m.envelope && m.envelope.cc) || [])].map((a) => String(a.address || '').toLowerCase());
            const viaOutlook = id === 'gmail' && direccionesOutlook().some((d) => paraMi.includes(d));
            nuevos.push({
              via: viaOutlook ? 'outlook' : '', cuenta: id, uid: m.uid, de: de.name || de.address || 'alguien', direccion: de.address || '',
              asunto: (m.envelope && m.envelope.subject) || '(sin asunto)',
              responderA: vuelta.address || de.address || '', mensajeId: (m.envelope && m.envelope.messageId) || '',
            });
          }
        }
        memoria[clave] = { validez, desde: siguiente };
      }
    } finally {
      candado.release();
    }
    guardarJSON('correo.json', memoria);
    estado[id] = { ok: true, error: null, cuando: Date.now() };
    return nuevos;
  } catch (e) {
    estado[id] = { ok: false, error: `${NOMBRES[id]}: ${explicar(e)}`, cuando: Date.now() };
    throw new Error(estado[id].error);
  } finally {
    if (cliente) { try { await cliente.logout(); } catch { try { cliente.close(); } catch {} } }
  }
}

// Hotmail/Outlook por la ventana de navegador de Jarvis (ver outlookweb.js).
const outlookWeb = () => require('./outlookweb');
async function revisarPorNavegador() {
  try {
    const nuevos = await outlookWeb().revisar();
    estado.outlook = { ok: true, error: null, cuando: Date.now() };
    return nuevos;
  } catch (e) {
    estado.outlook = { ok: false, error: `${NOMBRES.outlook}: ${explicar(e)}`, cuando: Date.now() };
    throw new Error(estado.outlook.error);
  }
}
async function probarPorNavegador() {
  try {
    const dicho = await outlookWeb().probar();
    estado.outlook = { ok: true, error: null, cuando: Date.now() };
    return dicho;
  } catch (e) {
    estado.outlook = { ok: false, error: `${NOMBRES.outlook}: ${explicar(e)}`, cuando: Date.now() };
    throw new Error(estado.outlook.error);
  }
}
const iniciarSesionWeb = (alTerminar) => outlookWeb().iniciarSesion(alTerminar);
const desconectarWeb = () => outlookWeb().desconectar();

async function revisarTodo() {
  if (revisando) return;
  if (conexion.sinConexion()) return; // sin conexión (cortada o a mano) no se revisa nada: al volver se retoma solo
  revisando = true;
  try {
    let hubo = false; let falla = '';
    for (const id of Object.keys(SERVIDORES)) {
      if (!configurada(id)) continue;
      hubo = true;
      try { for (const mail of await revisar(id)) alLlegar(mail); } catch (e) { falla = falla || e.message; /* el error queda en el estado de la cuenta */ }
    }
    if (hubo) conexion.reportar('mail', !falla, { detalle: falla.replace(/^[^:]+: /, '') });
  } finally {
    revisando = false;
  }
}

// Arranca (o ajusta) la revisión periódica. Sin ninguna cuenta configurada no hace nada.
function iniciar(fn) {
  if (fn) alLlegar = fn;
  clearInterval(reloj);
  reloj = null;
  if (!Object.keys(SERVIDORES).some(configurada)) return;
  const cada = Math.max(30, Number(leerConfig().correo.cadaSegundos) || 90) * 1000;
  reloj = setInterval(() => revisarTodo(), cada);
  if (reloj.unref) reloj.unref();
  setTimeout(() => revisarTodo(), 3000);
}
function detener() { clearInterval(reloj); reloj = null; }

// Para el botón "Probar" de Ajustes: se conecta y cuenta cuántos mails sin leer hay.
async function probar(id) {
  if (id === 'outlook' && leerConfig().correo.outlook.web) return probarPorNavegador();
  if (!configurada(id)) throw new Error(id === 'gmail' ? 'Falta el usuario o la contraseña de aplicación.' : 'Falta conectar la cuenta de Microsoft.');
  let cliente = null;
  try {
    cliente = await abrir(id);
    const s = await cliente.status('INBOX', { unseen: true, messages: true });
    estado[id] = { ok: true, error: null, cuando: Date.now() };
    return `Conectado: ${s.unseen} sin leer de ${s.messages} en la bandeja de entrada.`;
  } catch (e) {
    estado[id] = { ok: false, error: `${NOMBRES[id]}: ${explicar(e)}`, cuando: Date.now() };
    throw new Error(estado[id].error);
  } finally {
    if (cliente) { try { await cliente.logout(); } catch {} }
  }
}

// Contesta un mail del que se avisó. mail: { cuenta, responderA | direccion, asunto, mensajeId }.
// Al final del texto va el pie configurado, para que quien lo reciba sepa que lo mandó el asistente.
async function responder(mail, texto) {
  if (conexion.sinConexion()) throw new Error(`${conexion.motivo()}: el mail no se mandó.`);
  const cuerpo = String(texto || '').trim();
  if (!cuerpo) throw new Error('La respuesta está vacía.');
  if (!mail || mail.cuenta !== 'gmail') throw new Error('Por ahora solo puedo contestar los mails que llegan a Gmail.');
  const c = leerConfig();
  if (!configurada('gmail')) throw new Error('Falta configurar Gmail en Ajustes, en Mail.');
  const para = mail.responderA || mail.direccion;
  if (!para) throw new Error('Ese mail no tiene una dirección a la que contestar.');
  const pie = String((c.firma || {}).mail || '').trim();
  const asunto = /^re:/i.test(mail.asunto || '') ? mail.asunto : `Re: ${mail.asunto || ''}`.trim();
  const transporte = require('nodemailer').createTransport({
    ...SALIDA_GMAIL, auth: { user: c.correo.gmail.usuario, pass: c.correo.gmail.clave.replace(/\s+/g, '') },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  try {
    await transporte.sendMail({
      from: c.usuario ? { name: c.usuario, address: c.correo.gmail.usuario } : c.correo.gmail.usuario,
      to: para, subject: asunto, text: pie ? `${cuerpo}\n\n${pie}` : cuerpo,
      ...(mail.mensajeId ? { inReplyTo: mail.mensajeId, references: [mail.mensajeId] } : {}),
    });
  } catch (e) {
    throw new Error(`No pude enviar el mail: ${/Invalid login|535|auth/i.test(e.message) ? 'Gmail no aceptó la contraseña de aplicación' : explicar(e)}`);
  } finally {
    try { transporte.close(); } catch {}
  }
  return `Mail enviado a ${mail.de || para}.`;
}

// Un mail nuevo (no una respuesta), desde mi Gmail. para: '' = a mí mismo. Lo usan los avisos del calendario.
async function enviar({ para = '', asunto = '', texto = '' } = {}) {
  if (conexion.sinConexion()) throw new Error(`${conexion.motivo()}: el mail no se mandó.`);
  const cuerpo = String(texto || '').trim();
  if (!cuerpo) throw new Error('El mail está vacío.');
  const c = leerConfig();
  if (!configurada('gmail')) throw new Error('Falta configurar Gmail en Ajustes, en Mail (para mandar mails hace falta la contraseña de aplicación).');
  const destino = String(para || '').trim() || c.correo.gmail.usuario;
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(destino)) throw new Error(`"${destino}" no parece una dirección de mail.`);
  const pie = String((c.firma || {}).mail || '').trim();
  const transporte = require('nodemailer').createTransport({
    ...SALIDA_GMAIL, auth: { user: c.correo.gmail.usuario, pass: c.correo.gmail.clave.replace(/\s+/g, '') },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  try {
    await transporte.sendMail({ from: c.usuario ? { name: c.usuario, address: c.correo.gmail.usuario } : c.correo.gmail.usuario, to: destino, subject: String(asunto || 'Aviso de Jarvis').slice(0, 200), text: pie ? `${cuerpo}\n\n${pie}` : cuerpo });
  } catch (e) {
    throw new Error(`no pude enviar el mail: ${/Invalid login|535|auth/i.test(e.message) ? 'Gmail no aceptó la contraseña de aplicación' : explicar(e)}`);
  } finally { try { transporte.close(); } catch {} }
  return `Mail enviado a ${destino}.`;
}

const leerEstado = () => ({ gmail: { ...estado.gmail, configurada: configurada('gmail') }, outlook: { ...estado.outlook, configurada: configurada('outlook') } });

// A dónde lleva el click en el aviso de un mail: Gmail abre ese mismo mensaje (por su Message-ID), en la cuenta
// de la que llegó; Hotmail/Outlook abre la bandeja de entrada.
function enlaceDe(n) {
  if (n.cuenta === 'outlook' || n.via === 'outlook') return 'https://outlook.live.com/mail/0/inbox';
  const usuario = (leerConfig().correo.gmail || {}).usuario || '';
  const cuenta = usuario ? `?authuser=${encodeURIComponent(usuario)}` : '';
  const id = String(n.mensajeId || '').replace(/^<|>$/g, '');
  return `https://mail.google.com/mail/${cuenta}#${id ? `search/${encodeURIComponent(`rfc822msgid:${id}`)}` : 'inbox'}`;
}

module.exports = { iniciarSesionWeb, desconectarWeb, enlaceDe, iniciar, detener, revisar, revisarTodo, probar, responder, enviar, conectarOutlook, leerEstado, configurada, NOMBRES };
