// WhatsApp sin ventanas: Jarvis se vincula como un "dispositivo vinculado" más (igual que WhatsApp Web),
// pero corre escondido dentro de la app. No abre Chrome ni nada encima de lo que estés haciendo.
const fs = require('fs');
const path = require('path');
const { DATOS, leerConfig, guardarConfig, buscarPorNombre, normalizar, leerJSON, guardarJSON, nombrePrincipal } = require('./config');

const CARPETA_SESION = path.join(DATOS, 'whatsapp-sesion');
const estado = { fase: 'apagado', qr: null, numero: null, error: null }; // apagado | conectando | qr | conectado | error
let socket = null;
let avisar = () => {};
let reintento = null;
let detenido = true;
const jids = new Map(); // número -> jid verificado

function alCambiar(fn) { avisar = fn; }

// ---- Agenda: los contactos y grupos que WhatsApp le cuenta a Jarvis ----
// contactos: id -> { nombre (como está agendado en el teléfono), apodo (el nombre que se puso esa
// persona), lid, telefono }. grupos: id -> { nombre }. Se guarda en datos/whatsapp-agenda.json para
// no depender de que WhatsApp la vuelva a mandar (la manda entera solo al vincular).
let agenda = null;
let relojAgenda = null;
let avisarAgenda = () => {};
function alCambiarAgenda(fn) { avisarAgenda = fn; }
function leerAgenda() {
  if (!agenda) {
    const g = leerJSON('whatsapp-agenda.json', {});
    agenda = { contactos: (g && g.contactos) || {}, grupos: (g && g.grupos) || {} };
  }
  return agenda;
}
function guardarAgenda() {
  clearTimeout(relojAgenda);
  relojAgenda = setTimeout(() => {
    try { guardarJSON('whatsapp-agenda.json', agenda); } catch {}
    try { avisarAgenda(resumenDeAgenda()); } catch {}
  }, 800);
  if (relojAgenda.unref) relojAgenda.unref();
}
const soloNumero = (jid) => String(jid || '').split('@')[0].split(':')[0];
const esPersona = (jid) => /@(s\.whatsapp\.net|lid)$/.test(String(jid || ''));

function anotarContactos(lista) {
  const a = leerAgenda();
  let cambio = false;
  for (const c of lista || []) {
    if (!c || !esPersona(c.id)) continue;
    const previo = a.contactos[c.id] || {};
    const nuevo = {
      nombre: c.name || previo.nombre || '',
      apodo: c.notify || c.verifiedName || previo.apodo || '',
      lid: c.lid || previo.lid || (c.id.endsWith('@lid') ? c.id : ''),
      telefono: soloNumero(c.phoneNumber) || previo.telefono || (c.id.endsWith('@s.whatsapp.net') ? soloNumero(c.id) : ''),
    };
    if (JSON.stringify(nuevo) !== JSON.stringify(previo)) { a.contactos[c.id] = nuevo; cambio = true; }
  }
  if (cambio) guardarAgenda();
}
function anotarGrupos(lista) {
  const a = leerAgenda();
  let cambio = false;
  for (const g of lista || []) {
    if (!g || !g.id || !g.id.endsWith('@g.us') || !g.subject) continue;
    if (!a.grupos[g.id] || a.grupos[g.id].nombre !== g.subject) { a.grupos[g.id] = { nombre: g.subject }; cambio = true; }
  }
  if (cambio) guardarAgenda();
}
// WhatsApp a veces nombra a alguien con un id interno ("lid") y otras con su número: se anota la pareja.
function anotarPareja({ lid, pn } = {}) {
  if (!lid || !pn) return;
  const a = leerAgenda();
  const porNumero = a.contactos[pn] || {};
  const porLid = a.contactos[lid] || {};
  a.contactos[pn] = { nombre: porNumero.nombre || porLid.nombre || '', apodo: porNumero.apodo || porLid.apodo || '', lid, telefono: porNumero.telefono || soloNumero(pn) };
  if (a.contactos[lid] && lid !== pn) delete a.contactos[lid];
  guardarAgenda();
}

// La agenda como lista para buscar y mostrar: primero los grupos, después la gente con nombre.
function listaDeAgenda() {
  const a = leerAgenda();
  const grupos = Object.entries(a.grupos).map(([jid, g]) => ({ jid, nombre: g.nombre, grupo: true }));
  const gente = Object.entries(a.contactos).filter(([, c]) => c.nombre || c.apodo)
    .map(([jid, c]) => ({ jid, nombre: c.nombre || c.apodo, agendado: !!c.nombre, telefono: c.telefono || '', lid: c.lid || '' }));
  const orden = (x, y) => x.nombre.localeCompare(y.nombre, 'es');
  return [...grupos.sort(orden), ...gente.sort(orden)];
}
const resumenDeAgenda = () => { const l = listaDeAgenda(); return { grupos: l.filter((x) => x.grupo).length, contactos: l.filter((x) => !x.grupo && x.agendado).length, lista: l }; };

// Vuelve a pedirle a WhatsApp los grupos y la libreta de contactos. Los grupos se piden directo; los
// contactos son parte de lo que WhatsApp sincroniza al vincular, así que se le pide esa parte de nuevo.
async function releerAgenda() {
  if (!socket || estado.fase !== 'conectado') throw new Error('WhatsApp no está conectado.');
  const s = socket;
  let aviso = '';
  try { anotarGrupos(Object.values(await s.groupFetchAllParticipating())); } catch (e) { aviso = `No pude leer los grupos (${e.message}). `; }
  try {
    await s.authState.keys.set({ 'app-state-sync-version': { critical_unblock_low: null } });
    await s.resyncAppState(['critical_unblock_low'], true);
  } catch (e) {
    aviso += `No pude releer los contactos (${e.message}). Si la lista queda vacía, desvinculá y volvé a vincular: al vincular, WhatsApp manda la agenda entera.`;
  }
  await new Promise((r) => setTimeout(r, 1200)); // los contactos llegan como eventos, un instante después
  const r = resumenDeAgenda();
  return { ...r, aviso: aviso.trim() };
}

// ---- A quién: los nombres que carga el usuario (config.contactos) y, si no, la agenda ----
// Un contacto cargado puede apuntar a alguien de la agenda o a un grupo (jid), o tener un número a mano.
const cargados = () => (leerConfig().contactos || []).filter((c) => c && c.nombre);
function buscarDestino(pedido) {
  const propio = buscarPorNombre(cargados(), pedido);
  if (propio) return { nombre: propio.nombre, jid: propio.jid || '', numero: propio.numero || '', grupo: /@g\.us$/.test(propio.jid || ''), cargado: propio };
  const lista = listaDeAgenda();
  const deAgenda = buscarPorNombre(lista.filter((x) => x.grupo || x.agendado), pedido) || buscarPorNombre(lista, pedido);
  return deAgenda ? { nombre: deAgenda.nombre, jid: deAgenda.jid, numero: deAgenda.telefono || '', grupo: !!deAgenda.grupo } : null;
}

// El contacto cargado que corresponde a un chat (para saber su apodo y si hay que avisar de él).
function cargadoPara(jid, candidatos = []) {
  const a = leerAgenda();
  const ids = new Set([jid, ...candidatos.map((n) => `${n}@s.whatsapp.net`)]);
  const numeros = new Set(candidatos);
  for (const id of [...ids]) { const c = a.contactos[id]; if (c) { if (c.lid) ids.add(c.lid); if (c.telefono) numeros.add(c.telefono); } }
  for (const [id, c] of Object.entries(a.contactos)) if (c.lid && ids.has(c.lid)) { ids.add(id); if (c.telefono) numeros.add(c.telefono); }
  return cargados().find((c) => (c.jid && ids.has(c.jid)) || (c.numero && variantes(c.numero).some((v) => numeros.has(v)))) || null;
}
function nombreEnAgenda(jid, candidatos = []) {
  const a = leerAgenda();
  const directo = [jid, ...candidatos.map((n) => `${n}@s.whatsapp.net`)].map((id) => a.contactos[id]).find((c) => c && c.nombre);
  if (directo) return directo.nombre;
  const porLid = Object.values(a.contactos).find((c) => c.nombre && c.lid && c.lid === jid);
  return porLid ? porLid.nombre : '';
}

// Todo lo que manda Jarvis lleva una marca adelante (por defecto 🤖) para que se note que no lo tipeaste vos.
const marca = () => String((leerConfig().firma || {}).whatsapp ?? '').trim();
function conMarca(texto) {
  const m = marca();
  const t = String(texto || '').trim();
  if (!m || t.startsWith(m)) return t;
  return t ? `${m} ${t}` : m;
}

// ---- Mensajes que llegan (para las notificaciones) ----
let alMensaje = () => {}; // ({ jid, de, grupo, texto, avisar, enLista })
let alLeido = () => {}; // (jid): ese chat ya se vio o se contestó desde otro lado
function alRecibir(fn, leido) { alMensaje = fn; if (leido) alLeido = leido; }

// El texto de un mensaje, o una etiqueta si no es texto. null = no es algo para avisar (reacciones, avisos internos).
function textoDe(mensaje) {
  let m = (mensaje && mensaje.message) || null;
  if (!m) return null;
  m = (m.ephemeralMessage && m.ephemeralMessage.message) || (m.viewOnceMessage && m.viewOnceMessage.message) || (m.viewOnceMessageV2 && m.viewOnceMessageV2.message) || m;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage && m.extendedTextMessage.text) return m.extendedTextMessage.text;
  if (m.imageMessage) return m.imageMessage.caption ? `[foto] ${m.imageMessage.caption}` : '[foto]';
  if (m.videoMessage) return m.videoMessage.caption ? `[video] ${m.videoMessage.caption}` : '[video]';
  if (m.audioMessage) return '[audio]';
  if (m.stickerMessage) return '[sticker]';
  if (m.documentMessage || m.documentWithCaptionMessage) return '[documento]';
  if (m.contactMessage || m.contactsArrayMessage) return '[contacto]';
  if (m.locationMessage || m.liveLocationMessage) return '[ubicación]';
  if (m.pollCreationMessage || m.pollCreationMessageV3) return '[encuesta]';
  return null;
}

// De un mensaje crudo de WhatsApp a { jid, de, esGrupo, texto, cargado }, o null si no corresponde avisar.
// "cargado" es el contacto de Ajustes que corresponde a quien escribió (si está), con su apodo.
function entrante(mensaje) {
  const clave = mensaje && mensaje.key;
  if (!clave || clave.fromMe || !clave.remoteJid) return null;
  const jid = clave.remoteJid;
  if (jid === 'status@broadcast' || /@(newsletter|broadcast)$/.test(jid)) return null;
  const texto = textoDe(mensaje);
  if (texto === null) return null;
  const esGrupo = jid.endsWith('@g.us');
  // WhatsApp a veces identifica a la gente con un id interno en vez del número: se prueban los dos.
  const crudos = (esGrupo ? [clave.participantAlt, clave.participantPn, clave.participant] : [clave.remoteJidAlt, clave.senderPn, jid]).filter(Boolean).map(String);
  const candidatos = crudos.map(soloNumero);
  const quien = crudos.find((x) => x.endsWith('@lid')) || crudos[0] || jid;
  const cargado = cargadoPara(esGrupo ? quien : jid, candidatos);
  const numero = candidatos.find((x) => /^\d{8,15}$/.test(x));
  if (mensaje.pushName && esPersona(quien)) anotarContactos([{ id: quien, notify: mensaje.pushName }]);
  const de = (cargado && nombrePrincipal(cargado.nombre)) || nombreEnAgenda(quien, candidatos) || mensaje.pushName || (numero ? `+${numero}` : 'Alguien');
  return { jid, esGrupo, texto, de, cargado };
}

async function nombreDeGrupo(s, jid) {
  const a = leerAgenda();
  if (a.grupos[jid]) return a.grupos[jid].nombre;
  let nombre = 'un grupo';
  try { const meta = await s.groupMetadata(jid); if (meta && meta.subject) { nombre = meta.subject; anotarGrupos([meta]); } } catch {}
  return nombre;
}

function escucharMensajes(s) {
  s.ev.on('messages.upsert', async ({ messages, type }) => {
    if (socket !== s) return;
    for (const mensaje of messages || []) {
      try {
        // Si contestaste vos (desde el celular u otro lado), ese chat ya no tiene nada pendiente.
        if (mensaje.key && mensaje.key.fromMe && mensaje.key.remoteJid) { alLeido(mensaje.key.remoteJid); continue; }
        if (type !== 'notify') continue; // historial viejo que se sincroniza al conectar: no es novedad
        const e = entrante(mensaje);
        if (!e) continue;
        // En un grupo, lo que decide si se avisa es el grupo (si está cargado en Ajustes), no quién escribió.
        const delGrupo = e.esGrupo ? cargados().find((c) => c.jid === e.jid) || null : null;
        const quienDecide = e.esGrupo ? delGrupo : e.cargado;
        alMensaje({
          jid: e.jid, de: e.de, texto: e.texto,
          grupo: e.esGrupo ? (delGrupo && nombrePrincipal(delGrupo.nombre)) || await nombreDeGrupo(s, e.jid) : null,
          avisar: (quienDecide && quienDecide.avisar) || '', enLista: !!quienDecide,
        });
      } catch (error) { console.error('[whatsapp]', error.message); }
    }
  });
  s.ev.on('chats.update', (chats) => {
    for (const chat of chats || []) if (chat && chat.id && chat.unreadCount === 0) alLeido(chat.id);
  });
  // La agenda: llega entera al vincular, y después de a pedacitos cuando algo cambia.
  s.ev.on('contacts.upsert', (lista) => anotarContactos(lista));
  s.ev.on('contacts.update', (lista) => anotarContactos(lista));
  s.ev.on('messaging-history.set', (h) => anotarContactos(h && h.contacts));
  s.ev.on('lid-mapping.update', (pareja) => anotarPareja(pareja));
  s.ev.on('groups.upsert', (lista) => anotarGrupos(lista));
  s.ev.on('groups.update', (lista) => anotarGrupos(lista));
}
function publicar(cambios) { Object.assign(estado, cambios); avisar({ ...estado }); }
const leerEstado = () => ({ ...estado });

async function conectar() {
  detenido = false;
  clearTimeout(reintento);
  if (socket) return;
  publicar({ fase: 'conectando', error: null });
  try {
    const baileys = await import('baileys');
    const pino = require('pino');
    const QR = require('qrcode');
    const { state, saveCreds } = await baileys.useMultiFileAuthState(CARPETA_SESION);
    // Hay que avisarle a WhatsApp qué versión de "WhatsApp Web" habla Jarvis; si se usa una
    // vieja (la que viene de fábrica en la librería), el teléfono muestra "iniciando sesión"
    // y a los pocos segundos corta sola. Preguntando la versión actual se evita eso.
    const { version } = await baileys.fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const s = baileys.makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'silent' }),
      browser: baileys.Browsers.windows('Desktop'),
      markOnlineOnConnect: false, // así el celular sigue recibiendo las notificaciones
      syncFullHistory: false,
    });
    socket = s;
    s.ev.on('creds.update', saveCreds);
    escucharMensajes(s);
    s.ev.on('connection.update', async (u) => {
      if (socket !== s) return;
      if (u.qr) publicar({ fase: 'qr', qr: await QR.toDataURL(u.qr, { margin: 1, width: 320 }) });
      if (u.connection === 'open') {
        const numero = (s.user?.id || '').split(/[:@]/)[0] || null;
        publicar({ fase: 'conectado', qr: null, numero, error: null });
        // Los grupos se piden siempre (es barato). La libreta de contactos solo si nunca llegó: las
        // sesiones vinculadas antes de que Jarvis guardara la agenda no la tienen.
        setTimeout(() => {
          if (socket !== s) return;
          const hayGente = Object.values(leerAgenda().contactos).some((c) => c.nombre);
          if (hayGente) s.groupFetchAllParticipating().then((g) => anotarGrupos(Object.values(g))).catch(() => {});
          else releerAgenda().catch(() => {});
        }, 6000).unref();
      }
      if (u.connection === 'close') {
        socket = null;
        const codigo = u.lastDisconnect?.error?.output?.statusCode;
        if (codigo === baileys.DisconnectReason.loggedOut) {
          // Se desvinculó desde el celular: borramos la sesión y hay que escanear de nuevo.
          fs.rmSync(CARPETA_SESION, { recursive: true, force: true });
          publicar({ fase: 'apagado', qr: null, numero: null, error: 'La sesión se cerró desde el celular. Hay que vincular de nuevo.' });
          apagarEnConfig();
        } else if (codigo === baileys.DisconnectReason.restartRequired) {
          // WhatsApp pide reiniciar la conexión: pasa SIEMPRE justo después de escanear el QR
          // (todavía no llegó a avisar "open"), así que acá la fase sigue siendo "qr" aunque el
          // código haya salido bien. Si no se distingue este caso, se confunde con que nadie
          // escaneó a tiempo y se corta la vinculación justo cuando estaba funcionando.
          if (!detenido) { publicar({ fase: 'conectando', qr: null }); reintento = setTimeout(() => conectar().catch(() => {}), 300); }
        } else if (estado.fase === 'qr') {
          // Nadie escaneó el código a tiempo: no insistimos solos.
          detenido = true;
          publicar({ fase: 'apagado', qr: null, error: 'El código venció sin que lo escanearan. Tocá "Vincular" para generar otro.' });
          apagarEnConfig();
        } else if (!detenido) {
          publicar({ fase: 'conectando', qr: null });
          reintento = setTimeout(() => conectar().catch(() => {}), 5000);
        }
      }
    });
  } catch (e) {
    socket = null;
    publicar({ fase: 'error', error: `No pude iniciar WhatsApp: ${e.message}` });
  }
}

function apagarEnConfig() {
  const c = leerConfig();
  if (c.whatsapp.activo) guardarConfig({ ...c, whatsapp: { ...c.whatsapp, activo: false } });
}

// Cierra la conexión pero deja la sesión guardada (al abrir Jarvis de nuevo se reconecta sola).
function detener() {
  detenido = true;
  clearTimeout(reintento);
  const s = socket; socket = null;
  try { s && s.end(undefined); } catch {}
  publicar({ fase: 'apagado', qr: null });
}

// Desvincula del todo: el dispositivo desaparece de la lista del celular.
async function desvincular() {
  detenido = true;
  clearTimeout(reintento);
  const s = socket; socket = null;
  try { s && await s.logout(); } catch {}
  fs.rmSync(CARPETA_SESION, { recursive: true, force: true });
  jids.clear();
  publicar({ fase: 'apagado', qr: null, numero: null, error: null });
}

// Acepta "+54 9 11 2345-6789", "11 2345 6789", etc. y prueba las variantes argentinas.
function variantes(numero) {
  let n = String(numero || '').replace(/\D/g, '').replace(/^00/, '');
  if (!n) return [];
  if (n.startsWith('0')) n = n.slice(1);
  if (n.length <= 10) n = '54' + n; // sin código de país: asumimos Argentina
  const lista = [n];
  if (n.startsWith('549')) lista.push('54' + n.slice(3));
  else if (n.startsWith('54')) lista.unshift('549' + n.slice(2));
  return lista;
}

// "yo", "a mí", "mi WhatsApp"...: el propio número vinculado (el chat "Mensajes para mí" de WhatsApp).
const esParaMi = (pedido) => /^(a )?(yo|mi|mi mismo|mi misma|mi whatsapp|mi numero|mi celular|mi telefono|me)$/.test(normalizar(pedido));
// "5491123456789:12@s.whatsapp.net" (este dispositivo vinculado) -> "5491123456789@s.whatsapp.net" (la cuenta).
const jidPropio = (id) => { const numero = String(id || '').split(/[:@]/)[0]; return numero ? `${numero}@s.whatsapp.net` : null; };

async function jidDe(pedido) {
  if (!socket || estado.fase !== 'conectado') throw new Error('WhatsApp no está conectado (Ajustes > WhatsApp).');
  if (esParaMi(pedido)) {
    const jid = jidPropio(socket.user && socket.user.id);
    if (!jid) throw new Error('No pude averiguar tu propio número de WhatsApp.');
    return { jid, contacto: { nombre: 'tu propio WhatsApp' } };
  }
  // Un número suelto (con o sin +, espacios o guiones): se le escribe directo, sin que esté en la agenda.
  const soloNumero = String(pedido || '').replace(/[\s+()-]/g, '');
  const destino = /^\d{8,15}$/.test(soloNumero) ? { nombre: String(pedido).trim(), jid: '', numero: soloNumero, grupo: false } : buscarDestino(pedido);
  if (!destino) {
    const nombres = cargados().map((c) => nombrePrincipal(c.nombre)).join(', ');
    const a = resumenDeAgenda();
    throw new Error(`No encontré a "${pedido}" entre tus contactos ni tus grupos de WhatsApp.${nombres ? ` Cargados en Ajustes: ${nombres}.` : ''}${a.contactos || a.grupos ? '' : ' Todavía no leí tu agenda: Ajustes > WhatsApp > "Leer mis contactos".'}`);
  }
  const contacto = { nombre: destino.grupo ? `el grupo ${destino.nombre}` : destino.nombre };
  if (destino.jid) return { jid: destino.jid, contacto };
  if (jids.has(destino.numero)) return { jid: jids.get(destino.numero), contacto };
  const opciones = variantes(destino.numero);
  if (!opciones.length) throw new Error(`El contacto ${destino.nombre} no tiene número cargado.`);
  const resultados = await socket.onWhatsApp(...opciones);
  const valido = (resultados || []).find((r) => r.exists);
  if (!valido) throw new Error(`El número de ${destino.nombre} (${destino.numero}) no aparece en WhatsApp.`);
  jids.set(destino.numero, valido.jid);
  return { jid: valido.jid, contacto };
}

const aQuien = (contacto) => (contacto.nombre.startsWith('el grupo ') ? `al grupo ${contacto.nombre.slice(9)}` : `a ${contacto.nombre}`);

async function enviarTexto(pedido, mensaje) {
  if (!mensaje || !String(mensaje).trim()) throw new Error('El mensaje está vacío.');
  const { jid, contacto } = await jidDe(pedido);
  await socket.sendMessage(jid, { text: conMarca(mensaje) });
  return `Mensaje enviado ${aQuien(contacto)}.`;
}

// Para contestar una notificación: se le escribe directo al chat de donde vino.
async function responder(jid, mensaje) {
  if (!socket || estado.fase !== 'conectado') throw new Error('WhatsApp no está conectado (Ajustes > WhatsApp).');
  if (!jid || !String(mensaje || '').trim()) throw new Error('El mensaje está vacío.');
  const texto = conMarca(mensaje);
  await socket.sendMessage(jid, { text: texto });
  return texto;
}

async function enviarFoto(pedido, jpeg, epigrafe) {
  const { jid, contacto } = await jidDe(pedido);
  await socket.sendMessage(jid, { image: Buffer.from(jpeg), caption: conMarca(epigrafe) || undefined });
  return `Foto enviada ${aQuien(contacto)}.`;
}

async function enviarAudio(pedido, ogg, segundos) {
  const { jid, contacto } = await jidDe(pedido);
  await socket.sendMessage(jid, { audio: Buffer.from(ogg), mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: Math.round(segundos) || undefined });
  return `Audio enviado ${aQuien(contacto)}.`;
}

async function enviarVideo(pedido, mp4, epigrafe) {
  const { jid, contacto } = await jidDe(pedido);
  await socket.sendMessage(jid, { video: Buffer.from(mp4), mimetype: 'video/mp4', caption: conMarca(epigrafe) || undefined });
  return `Video enviado ${aQuien(contacto)}.`;
}

const haySesionGuardada = () => fs.existsSync(path.join(CARPETA_SESION, 'creds.json'));

// Solo para las pruebas automáticas.
const _pruebas = { anotarContactos, anotarGrupos, anotarPareja, vaciarAgenda: () => { agenda = { contactos: {}, grupos: {} }; }, ponerSocket: (s, fase = 'conectado') => { socket = s; estado.fase = fase; } };

module.exports = {
  alCambiar, leerEstado, conectar, detener, desvincular, enviarTexto, enviarFoto, enviarAudio, enviarVideo, responder, haySesionGuardada,
  variantes, esParaMi, jidPropio, alRecibir, entrante, textoDe, conMarca,
  buscarDestino, listaDeAgenda, resumenDeAgenda, releerAgenda, alCambiarAgenda, _pruebas,
};
