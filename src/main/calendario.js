// Google Calendar, de dos maneras que se pueden combinar (todos los eventos se juntan en una sola agenda):
//  1) Tu cuenta de Google (googlecal.js): trae TODOS tus calendarios, también los que otros comparten con vos.
//  2) "Enlaces secretos en formato iCal": uno por calendario (Configuración del calendario → Integrar calendario). No piden
//     contraseña ni permiso, solo sirven para LEER. Quien tenga el enlace puede ver el calendario: se guardan solo en esta PC.
// Con eso: avisa los eventos antes de que empiecen (como una notificación más, con sus reglas y sonidos)
// y contesta "¿qué tengo hoy?".
const http = require('http');
const https = require('https');
const conexion = require('./conexion');
const { leerConfig, leerJSON, guardarJSON, normalizar } = require('./config');
const google = require('./googlecal');

let eventos = []; // { id, titulo, inicio: Date, fin: Date, lugar, todoElDia }
let ultima = { cuando: 0, error: '', cantidad: 0 };
let datosFrescos = true; // false si la última lectura de los calendarios falló del todo (no se da por revisado el rato que pasó)
let relojes = [];
let alAvisar = () => {}; // (notificacion) => ...
let enviarWhatsapp = async () => { throw new Error('WhatsApp no está disponible.'); }; // (para, texto) => Promise
let enviarMail = async () => { throw new Error('El mail no está disponible.'); }; // ({ para, asunto, texto }) => Promise
let abrirPagina = async () => { throw new Error('No sé abrir el navegador.'); };
const AVISADOS = 'calendario-avisados.json';
// Lo que se hace en Jarvis y no viaja a Google: eventos propios (calendario-local.json) y cambios sobre los que ya trae el calendario (calendario-cambios.json:
// título, hora, lugar, avisos propios, silenciarlo u ocultarlo). Si Google cambia el evento, lo tuyo en Jarvis manda.
const LOCALES = 'calendario-local.json';
const CAMBIOS = 'calendario-cambios.json';
const leerLocales = () => { const l = leerJSON(LOCALES, []); return Array.isArray(l) ? l : []; };
const leerCambios = () => { const c = leerJSON(CAMBIOS, {}); return c && typeof c === 'object' && !Array.isArray(c) ? c : {}; };
const nuevoIdLocal = () => `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
// ---- Avisos ----
// Un aviso es { antes (minutos), canal: 'jarvis' | 'whatsapp' | 'mail', para ('' = yo), texto (opcional), asunto (mail, opcional), sonido (jarvis, opcional) }.
// Los viejos eran solo números de minutos (y un casillero "por WhatsApp"): se entienden igual.
const CANALES = ['jarvis', 'whatsapp', 'mail'];
const MAX_ANTES = 30 * 24 * 60; // hasta 30 días
function normalizarAvisos(lista, { whatsappViejo = false } = {}) {
  if (!Array.isArray(lista)) return null;
  const salida = [];
  for (const a of lista) {
    const o = typeof a === 'number' || typeof a === 'string' ? { antes: Number(a), canal: 'jarvis' } : a;
    if (!o || typeof o !== 'object') continue;
    const antes = Number(o.antes);
    if (!Number.isFinite(antes) || antes < 0 || antes > MAX_ANTES) continue;
    const canal = CANALES.includes(o.canal) ? o.canal : 'jarvis';
    const r = { antes: Math.round(antes), canal };
    if (canal !== 'jarvis') r.para = String(o.para || '').trim().slice(0, 200);
    if (canal === 'mail' && o.asunto && String(o.asunto).trim()) r.asunto = String(o.asunto).trim().slice(0, 200);
    if (o.texto && String(o.texto).trim()) r.texto = String(o.texto).trim().slice(0, 1500);
    if (canal === 'jarvis' && o.sonido) r.sonido = String(o.sonido);
    salida.push(r);
  }
  if (whatsappViejo) for (const a of salida.filter((x) => x.canal === 'jarvis')) salida.push({ antes: a.antes, canal: 'whatsapp', para: '' });
  const vistos = new Set();
  return salida.filter((a) => { const k = `${a.canal}|${a.para || ''}|${a.antes}|${a.texto || ''}|${a.asunto || ''}`; if (vistos.has(k)) return false; vistos.add(k); return true; }).sort((x, y) => y.antes - x.antes);
}
const avisosValidos = normalizarAvisos;

// ---- Calendarios: color y avisos propios de cada uno (config.calendario.calendarios[nombre] = { color, avisos, silenciar }) ----
const PALETA = ['#4F9DF7', '#F2994A', '#6FCF97', '#BB6BD9', '#EB5757', '#F2C94C', '#56CCF2', '#27AE60', '#E0709A', '#A0A7B4'];
let coloresDeGoogle = new Map(); // nombre del calendario -> color que tiene en Google
const ajustesDeCalendario = (nombre) => { const c = (leerConfig().calendario || {}).calendarios || {}; return (c && c[nombre || 'Principal']) || {}; };
function colorBase(nombre) {
  const n = nombre || 'Principal';
  if (n === 'Jarvis') return '#8BE9FF';
  if (coloresDeGoogle.has(n)) return coloresDeGoogle.get(n);
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
const colorDeCalendario = (nombre) => ajustesDeCalendario(nombre).color || colorBase(nombre);
const colorValido = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : '');

// Los eventos propios, como los de afuera: { id, titulo, inicio: Date, fin: Date, lugar, todoElDia, calendario, local: true }.
function eventosLocales() {
  return leerLocales().map((e) => ({
    id: e.id, titulo: e.titulo, inicio: new Date(e.inicio), fin: new Date(e.fin || e.inicio + 3600000), lugar: e.lugar || '', todoElDia: !!e.todoElDia,
    calendario: 'Jarvis', detalle: e.detalle || '', local: true, color: colorValido(e.color),
  }));
}
// Aplica los cambios hechos en Jarvis sobre un evento que vino de afuera (o uno propio con avisos).
function conCambios(e, cambios) {
  const c = cambios[e.id];
  if (!c) return e;
  if (c.oculto) return null;
  const r = { ...e };
  if (c.titulo) r.titulo = c.titulo;
  if (c.lugar !== undefined) r.lugar = c.lugar;
  if (Number(c.inicio) > 0) { r.inicio = new Date(c.inicio); r.fin = new Date(Number(c.fin) > Number(c.inicio) ? c.fin : Number(c.inicio) + Math.max(0, e.fin - e.inicio)); r.todoElDia = !!c.todoElDia; }
  if (colorValido(c.color)) r.color = colorValido(c.color);
  r.cambiado = true;
  return r;
}

function configurar(f) { if (f.alAvisar) alAvisar = f.alAvisar; if (f.abrir) abrirPagina = f.abrir; if (f.enviarWhatsapp) enviarWhatsapp = f.enviarWhatsapp; if (f.enviarMail) enviarMail = f.enviarMail; }

function descargar(url, saltos = 0) {
  return new Promise((ok, mal) => {
    let u;
    try { u = new URL(url); } catch { return mal(new Error('El enlace no es una dirección válida.')); }
    if (!/^https?:$/.test(u.protocol)) return mal(new Error('El enlace tiene que empezar con https://'));
    const modulo = u.protocol === 'http:' ? http : https;
    const pedido = modulo.get(u, { timeout: 15000, headers: { 'User-Agent': 'Jarvis', Accept: 'text/calendar, */*' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && saltos < 4) { r.resume(); return ok(descargar(new URL(r.headers.location, u).toString(), saltos + 1)); }
      if (r.statusCode !== 200) { r.resume(); return mal(new Error(r.statusCode === 404 || r.statusCode === 403 ? 'Google no reconoce ese enlace (¿lo regeneraste?).' : `El calendario contestó ${r.statusCode}.`)); }
      let total = 0; const trozos = [];
      r.on('data', (t) => { total += t.length; if (total > 15 * 1024 * 1024) { pedido.destroy(new Error('El calendario es demasiado grande.')); } else trozos.push(t); });
      r.on('end', () => ok(Buffer.concat(trozos).toString('utf8')));
      r.on('error', mal);
    });
    pedido.on('timeout', () => pedido.destroy(new Error('El calendario tardó demasiado en contestar.')));
    pedido.on('error', mal);
  });
}

// Del texto .ics a los eventos que caen entre dos fechas (con los que se repiten ya expandidos).
function leerEventos(texto, desde, hasta) {
  const ical = require('node-ical');
  const todo = ical.sync.parseICS(texto);
  const salida = [];
  for (const e of Object.values(todo)) {
    if (!e || e.type !== 'VEVENT' || !e.start) continue;
    if (String(e.status || '').toUpperCase() === 'CANCELLED') continue;
    const base = { titulo: String(e.summary && e.summary.val ? e.summary.val : e.summary || 'Sin título'), lugar: String(e.location && e.location.val ? e.location.val : e.location || '') };
    if (e.rrule) {
      let instancias = [];
      try { instancias = ical.expandRecurringEvent(e, { from: desde, to: hasta, expandOngoing: true }); } catch { instancias = []; }
      for (const i of instancias) salida.push({ ...base, titulo: String(i.summary && i.summary.val ? i.summary.val : i.summary || base.titulo), id: `${e.uid}|${new Date(i.start).toISOString()}`, inicio: new Date(i.start), fin: new Date(i.end || i.start), todoElDia: !!i.isFullDay });
    } else {
      const fin = e.end ? new Date(e.end) : new Date(e.start);
      if (fin >= desde && new Date(e.start) <= hasta) salida.push({ ...base, id: `${e.uid}|${new Date(e.start).toISOString()}`, inicio: new Date(e.start), fin, todoElDia: !!(e.datetype === 'date' || e.start.dateOnly) });
    }
  }
  return salida.sort((a, b) => a.inicio - b.inicio);
}

// Todos los enlaces iCal cargados: el de siempre ("enlace") más los de la lista ("enlaces": [{ nombre, enlace }]).
function enlacesDe(c) {
  const lista = [];
  if ((c.enlace || '').trim()) lista.push({ nombre: 'Principal', enlace: c.enlace.trim() });
  for (const e of Array.isArray(c.enlaces) ? c.enlaces : []) if (e && (e.enlace || '').trim() && e.activo !== false) lista.push({ nombre: e.nombre || 'Calendario', enlace: e.enlace.trim() });
  return lista;
}
const hayFuentes = (c) => !!(c && c.activo && (enlacesDe(c).length || google.conectada()));
const claveDe = (e) => `${String(e.titulo).toLowerCase()}|${Math.floor(e.inicio.getTime() / 60000)}|${Math.floor(e.fin.getTime() / 60000)}`; // al minuto: un mismo evento viene con distinta precisión según la fuente

// Los de afuera con los cambios hechos en Jarvis, más los eventos propios, en orden.
function juntarConLocales(remotos) {
  const cambios = leerCambios();
  return [...remotos.map((e) => conCambios(e, cambios)).filter(Boolean), ...eventosLocales().map((e) => conCambios(e, cambios)).filter(Boolean)].sort((a, b) => a.inicio - b.inicio);
}
async function actualizar() {
  cacheDeRango.clear(); cacheDeTexto.clear(); // se vuelve a pedir todo
  const c = leerConfig().calendario;
  if (!hayFuentes(c)) { eventos = juntarConLocales([]); ultima = { cuando: Date.now(), error: '', cantidad: eventos.length, fuentes: [] }; return ultima; }
  if (conexion.sinConexion()) return ultima || { cuando: Date.now(), error: '', cantidad: eventos.length, fuentes: [] }; // sin conexión no se baja nada: se siguen usando los eventos ya cargados
  const ahora = Date.now();
  const desde = new Date(ahora - 24 * 3600 * 1000);
  const hasta = new Date(ahora + 35 * 24 * 3600 * 1000); // para poder avisar con hasta 30 días de anticipación
  const trabajos = [];
  if (google.conectada()) google.calendarios().then((l) => { coloresDeGoogle = new Map(l.filter((x) => x.color).map((x) => [x.nombre, x.color])); }).catch(() => {});
  if (google.conectada()) trabajos.push(['Cuenta de Google', google.eventos(desde, hasta).then((r) => r.eventos)]);
  for (const e of enlacesDe(c)) trabajos.push([e.nombre, descargar(e.enlace).then((t) => leerEventos(t, desde, hasta).map((x) => ({ ...x, calendario: e.nombre })))]);
  const resultados = await Promise.allSettled(trabajos.map((t) => t[1]));
  const fuentes = resultados.map((r, i) => ({ nombre: trabajos[i][0], ok: r.status === 'fulfilled', error: r.status === 'rejected' ? r.reason.message : '' }));
  const buenos = resultados.filter((r) => r.status === 'fulfilled');
  if (buenos.length) {
    const vistos = new Set();
    eventos = juntarConLocales(buenos.flatMap((r) => r.value).filter((e) => { const k = claveDe(e); if (vistos.has(k)) return false; vistos.add(k); return true; }));
  }
  datosFrescos = buenos.length > 0;
  const fallo = fuentes.find((f) => !f.ok);
  if (trabajos.length) conexion.reportar('calendario', buenos.length > 0, { detalle: fallo ? fallo.error : '' });
  ultima = { cuando: ahora, error: fallo ? (fuentes.length > 1 ? `${fallo.nombre}: ${fallo.error}` : fallo.error) : '', cantidad: eventos.length, fuentes };
  return ultima;
}

// Prueba un enlace sin guardarlo: cuántos eventos hay en los próximos días.
async function probar(enlace) {
  const texto = await descargar(String(enlace || '').trim());
  const ahora = Date.now();
  const proximos = leerEventos(texto, new Date(ahora), new Date(ahora + 7 * 24 * 3600 * 1000));
  return { cantidad: proximos.length, siguiente: proximos[0] ? `${proximos[0].titulo} (${cuando(proximos[0])})` : '' };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const mismaFecha = (a, b) => a.toDateString() === b.toDateString();
const hora = (d) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
function cuando(e, ahora = new Date()) {
  const manana = new Date(ahora.getTime() + 24 * 3600 * 1000);
  const dia = mismaFecha(e.inicio, ahora) ? 'hoy' : mismaFecha(e.inicio, manana) ? 'mañana' : DIAS[e.inicio.getDay()];
  return e.todoElDia ? `${dia}, todo el día` : `${dia} a las ${hora(e.inicio)}`;
}

// "¿Qué tengo hoy?": cuando = 'hoy' | 'manana' | 'proximo'.
function agenda(cuandoPide = 'hoy', ahora = new Date()) {
  const c = leerConfig().calendario;
  if (!hayFuentes(c) && !eventosLocales().length) return 'Todavía no conecté tu calendario: conectalo en Ajustes, en Calendario.';
  if (ultima.error && !eventos.length) return `No pude leer tu calendario: ${ultima.error}`;
  const manana = new Date(ahora.getTime() + 24 * 3600 * 1000);
  if (cuandoPide === 'proximo') {
    const sig = eventos.find((e) => e.inicio > ahora && !e.todoElDia) || eventos.find((e) => e.inicio > ahora);
    return sig ? `Lo próximo es ${sig.titulo}, ${cuando(sig, ahora)}${sig.lugar ? `, en ${sig.lugar}` : ''}.` : 'No tenés nada más en los próximos días.';
  }
  const dia = cuandoPide === 'manana' ? manana : ahora;
  const delDia = eventos.filter((e) => mismaFecha(e.inicio, dia) && (cuandoPide === 'manana' || e.todoElDia || e.fin > ahora));
  const nombre = cuandoPide === 'manana' ? 'mañana' : 'hoy';
  if (!delDia.length) return `No tenés nada ${nombre}.`;
  const partes = delDia.slice(0, 6).map((e) => (e.todoElDia ? `${e.titulo} (todo el día)` : `${e.titulo} a las ${hora(e.inicio)}`));
  return `${nombre === 'hoy' ? 'Hoy' : 'Mañana'} tenés ${delDia.length === 1 ? 'un evento' : `${delDia.length} eventos`}: ${partes.join(', ')}${delDia.length > 6 ? ' y algunos más' : ''}.`;
}

// "en 10 min (15:30)", "en 2 horas (15:30)", "mañana a las 15:30"…
function enCuanto(minutos, inicio) {
  if (minutos < 60) return `en ${minutos} min (${hora(inicio)})`;
  if (minutos < 6 * 60) { const h = Math.floor(minutos / 60); const r = minutos % 60; return `en ${h} h${r ? ` ${r} min` : ''} (${hora(inicio)})`; }
  return cuando({ inicio, todoElDia: false });
}

const LATIDO = 'calendario-latido.json';
const PENDIENTES = 'calendario-pendientes.json';
const leerPendientes = () => { const p = leerJSON(PENDIENTES, {}); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; };

// Los avisos que tiene un evento: los suyos; si no, los de su calendario; si no, los de siempre (Cuentas y avisos → Calendario).
function avisosDe(e, { cambios, locales, minutosDeSiempre, modo = 'todo' }) {
  const propio = cambios[e.id] || {};
  const local = e.local ? (locales.get(e.id) || {}) : {};
  if (propio.silenciar) return { lista: [], origen: 'evento' };
  const whatsappViejo = !!(propio.whatsapp || local.whatsapp);
  const suyos = normalizarAvisos(propio.avisos !== undefined ? propio.avisos : local.avisos, { whatsappViejo });
  if (suyos && suyos.length) return { lista: suyos, origen: 'evento' };
  const cal = ajustesDeCalendario(e.calendario);
  if (cal.silenciar) return { lista: [], origen: 'calendario' };
  const delCalendario = normalizarAvisos(cal.avisos, { whatsappViejo });
  if (delCalendario && delCalendario.length) return { lista: delCalendario, origen: 'calendario' };
  if (e.todoElDia) return { lista: [], origen: 'siempre' }; // los de todo el día no avisan solos: hay que pedirlo
  if (modo === 'elegidos' && !cal.avisar) return { lista: [], origen: 'siempre' }; // "solo lo elegido": los avisos de siempre valen solo para los calendarios marcados "Avisar"
  return { lista: normalizarAvisos(minutosDeSiempre, { whatsappViejo }) || [], origen: 'siempre' };
}

// Rellena {titulo} {cuando} {hora} {fecha} {lugar} {calendario} en el texto que escribió el usuario.
function llenar(plantilla, e, cuandoDice) {
  const datos = { titulo: e.titulo, cuando: cuandoDice, hora: e.todoElDia ? 'todo el día' : hora(e.inicio), fecha: `${DIAS[e.inicio.getDay()]} ${e.inicio.getDate()}/${e.inicio.getMonth() + 1}`, lugar: e.lugar || '', calendario: e.calendario || '' };
  return String(plantilla).replace(/\{(titulo|cuando|hora|fecha|lugar|calendario)\}/gi, (_, k) => datos[k.toLowerCase()] || '').replace(/[ \t]+\n/g, '\n').trim();
}

// Cada ~30 segundos: ¿le toca avisar a algún aviso (en Jarvis, por WhatsApp o por mail)? Una sola vez por aviso.
// En Jarvis: cuando falta ese tiempo o menos y el evento no empezó. Por WhatsApp o mail (y los de un día o más): cuando pasa la hora de avisar, aunque Jarvis estuviera cerrado
// (se manda apenas se abre); si esa hora ya había pasado con Jarvis abierto (el aviso se agregó tarde) no se manda a destiempo.
function revisar(ahora = Date.now(), { desde } = {}) {
  const c = leerConfig().calendario;
  if (!c) return [];
  const minutosDeSiempre = (Array.isArray(c.minutosAntes) ? c.minutosAntes : [10]).map(Number).filter((m) => m >= 0 && m <= MAX_ANTES);
  const cfgAvisos = leerConfig().notificaciones || {};
  const modoAvisos = ['nada', 'elegidos', 'todo'].includes((cfgAvisos.calendario || {}).modo) ? cfgAvisos.calendario.modo : 'todo';
  const cambios = leerCambios();
  const locales = new Map(leerLocales().map((l) => [l.id, l]));
  const hechos = leerJSON(AVISADOS, {});
  const latido = Number.isFinite(desde) ? desde : (Number(leerJSON(LATIDO, {}).t) || ahora - 60000);
  const limite = ahora - 40 * 24 * 3600 * 1000;
  for (const k of Object.keys(hechos)) if (hechos[k] < limite) delete hechos[k];
  const avisos = []; let pendientes = null;
  for (const e of eventos) {
    const { lista: todos } = avisosDe(e, { cambios, locales, minutosDeSiempre, modo: modoAvisos });
    const lista = modoAvisos === 'nada' ? todos.filter((a) => a.canal !== 'jarvis') : todos; // "Nada": ni una alerta en Jarvis (los WhatsApp y mails que pediste para un evento siguen)
    if (!lista.length) continue;
    const propio = cambios[e.id] || {};
    const sonidoDelEvento = propio.sonido || (e.local ? (locales.get(e.id) || {}).sonido : '') || '';
    const ref = e.todoElDia ? e.inicio.getTime() + 9 * 3600000 : e.inicio.getTime(); // los de todo el día cuentan desde las 9
    if (e.fin.getTime() <= ahora && ref <= ahora) continue; // ya terminó
    for (const a of lista) {
      const fire = ref - a.antes * 60000;
      const falta = ref - ahora;
      const enElHueco = fire > latido && fire <= ahora; // pasó la hora de avisar desde la última revisión
      const dentro = a.canal === 'jarvis' && a.antes < 1440 ? (a.antes === 0 ? (falta <= 0 && falta > -2 * 60000) : (falta > 0 && falta <= a.antes * 60000)) : enElHueco;
      const clave = `${e.id}|${Math.floor(ref / 60000)}|${a.canal}|${a.para || ''}|${a.antes}|${a.texto || ''}`;
      if (hechos[clave] || !dentro) continue;
      hechos[clave] = ahora;
      const faltan = Math.max(1, Math.round(falta / 60000));
      const cuandoDice = falta <= 0 ? (e.todoElDia ? 'hoy' : `empezó a las ${hora(e.inicio)}`) : enCuanto(faltan, e.inicio);
      const origen = `${e.calendario && e.calendario !== 'Principal' ? ` · ${e.calendario}` : ''}${e.repite ? ' · se repite' : ''}`;
      if (a.canal === 'jarvis') {
        const sonido = a.sonido || sonidoDelEvento;
        const base = a.texto ? llenar(a.texto, e, cuandoDice) : `${a.antes === 0 ? 'Empieza ahora' : `Empieza ${cuandoDice}`}${e.lugar ? ` · ${e.lugar}` : ''}${origen}`;
        avisos.push({ origen: 'calendario', de: e.titulo, texto: base, clave: e.id, ...(sonido ? { sonido } : {}) });
      } else {
        pendientes = pendientes || leerPendientes();
        const tarde = ahora - fire > 5 * 60000 ? ' (Jarvis estaba cerrado a esa hora)' : '';
        const cuerpoBase = a.texto ? llenar(a.texto, e, cuandoDice) : `Evento: ${e.titulo}\n${a.antes === 0 ? 'Empieza ahora' : `Empieza ${cuandoDice}`}${e.todoElDia ? '' : ` · ${DIAS[e.inicio.getDay()]} ${e.inicio.getDate()}/${e.inicio.getMonth() + 1}`}${e.lugar ? ` · ${e.lugar}` : ''}${origen}`;
        pendientes[clave] = { canal: a.canal, para: a.para || '', asunto: a.asunto ? llenar(a.asunto, e, cuandoDice) : `Recordatorio: ${e.titulo}`, texto: cuerpoBase, tarde: !!tarde, evento: e.titulo, expira: Math.max(e.fin.getTime(), ref) + 60 * 60000 };
      }
    }
  }
  if (avisos.length || pendientes) guardarJSON(AVISADOS, hechos);
  if (pendientes) guardarJSON(PENDIENTES, pendientes);
  if (datosFrescos) guardarJSON(LATIDO, { t: ahora });
  for (const a of avisos) { try { alAvisar(a); } catch {} }
  return avisos;
}

// Manda lo que está en cola (WhatsApp y mail). Si no se puede ahora (WhatsApp todavía conectando, sin internet), se reintenta en la próxima vuelta hasta una hora después del evento.
const enCurso = new Set();
const falloAnotado = new Set();
const anotar = (texto, error) => { try { require('./historial').anotar(texto, error ? { error: true } : undefined); } catch {} };
async function procesar(ahora = Date.now()) {
  const pend = leerPendientes();
  const claves = Object.keys(pend);
  if (!claves.length) return 0;
  let enviados = 0;
  for (const k of claves) {
    const p = pend[k];
    if (enCurso.has(k)) continue;
    if (p.expira < ahora) { delete pend[k]; anotar(`No llegué a mandar el aviso de "${p.evento}" por ${p.canal === 'mail' ? 'mail' : 'WhatsApp'}${p.para ? ` a ${p.para}` : ''}.`, true); continue; }
    enCurso.add(k);
    try {
      if (p.canal === 'whatsapp') await enviarWhatsapp(p.para || 'yo', `${p.tarde ? '(Jarvis estaba cerrado a la hora del aviso) ' : ''}${p.texto}`);
      else await enviarMail({ para: p.para, asunto: p.asunto, texto: `${p.texto}${p.tarde ? '\n\n(Este aviso salió tarde: Jarvis estaba cerrado a la hora programada.)' : ''}` });
      delete pend[k]; enviados++;
      anotar(`Aviso de "${p.evento}" mandado por ${p.canal === 'mail' ? 'mail' : 'WhatsApp'}${p.para ? ` a ${p.para}` : ''}.`);
    } catch (e) {
      if (!falloAnotado.has(k)) { falloAnotado.add(k); anotar(`El aviso de "${p.evento}" por ${p.canal === 'mail' ? 'mail' : 'WhatsApp'} no salió todavía (${e.message}). Lo sigo intentando.`, true); }
    } finally { enCurso.delete(k); }
  }
  guardarJSON(PENDIENTES, pend);
  return enviados;
}

function iniciar() {
  detener();
  actualizar().then(() => { revisar(); return procesar(); }).catch(() => {});
  relojes.push(setInterval(() => actualizar().catch(() => {}), 10 * 60 * 1000));
  relojes.push(setInterval(() => { revisar(); procesar().catch(() => {}); }, 30 * 1000));
}
function detener() { relojes.forEach(clearInterval); relojes = []; }
// Cuando se cambia algo en Ajustes se vuelve a leer enseguida.
const recargar = () => { actualizar().then(() => { revisar(); return procesar(); }).catch(() => {}); };
const estado = () => ({ ...ultima, proximos: eventos.filter((e) => e.fin > new Date()).slice(0, 5).map((e) => ({ titulo: e.titulo, cuando: cuando(e) })) });

// Crear un evento: Google no deja escribir en un calendario sin un permiso (OAuth) que habría que configurar a mano,
// así que Jarvis arma el evento completo y abre Google Calendar con todo cargado: se toca "Guardar" y listo.
// (No guarda ni pide ninguna contraseña; se crea en la cuenta con la que esté abierto el navegador.)
function enlaceDeEvento({ titulo, inicio, duracionMin, todoElDia, lugar, detalle }) {
  const { deISOLocal } = require('./fechas');
  const desde = deISOLocal(inicio);
  if (!desde) throw new Error('No entendí la fecha del evento.');
  if (!String(titulo || '').trim()) throw new Error('Falta decir cómo se llama el evento.');
  const dos = (n) => String(n).padStart(2, '0');
  const dia = (d) => `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}`;
  const momento = (d) => `${dia(d)}T${dos(d.getHours())}${dos(d.getMinutes())}00`;
  let fechas;
  if (todoElDia) { const sig = new Date(desde); sig.setDate(sig.getDate() + 1); fechas = `${dia(desde)}/${dia(sig)}`; }
  else fechas = `${momento(desde)}/${momento(new Date(desde.getTime() + (Number(duracionMin) > 0 ? Number(duracionMin) : 60) * 60000))}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: String(titulo).trim(), dates: fechas });
  if (!todoElDia) { try { q.set('ctz', Intl.DateTimeFormat().resolvedOptions().timeZone); } catch {} }
  if (lugar) q.set('location', String(lugar));
  if (detalle) q.set('details', String(detalle));
  return { url: `https://calendar.google.com/calendar/render?${q}`, desde, todoElDia: !!todoElDia };
}

async function crearEvento(paso, ahora = new Date()) {
  const { url, desde, todoElDia } = enlaceDeEvento(paso);
  await abrirPagina(url);
  const manana = new Date(ahora.getTime() + 24 * 3600 * 1000);
  const dia = mismaFecha(desde, ahora) ? 'hoy' : mismaFecha(desde, manana) ? 'mañana' : `el ${DIAS[desde.getDay()]} ${desde.getDate()}/${desde.getMonth() + 1}`;
  const cuandoDice = todoElDia ? `${dia}, todo el día` : `${dia} a las ${hora(desde)}`;
  return `Armé "${String(paso.titulo).trim()}" para ${cuandoDice}. Te abrí Google Calendar con todo cargado: tocá Guardar para crearlo.`;
}

const calendariosDeGoogle = async () => { google.olvidarLista(); return google.calendarios(); };
// Lo próximo que viene (para el widget del panel del notch): { titulo, inicio, fin, todoElDia, lugar }, con las fechas en milisegundos.
function proximos(cuantos = 2, ahora = Date.now()) {
  return eventos.filter((e) => e.fin > ahora && e.inicio < ahora + 36 * 3600 * 1000 && !(e.todoElDia && e.inicio < ahora - 1))
    .sort((a, b) => a.inicio - b.inicio).slice(0, cuantos)
    .map((e) => ({ titulo: e.titulo, inicio: +e.inicio, fin: +e.fin, todoElDia: !!e.todoElDia, lugar: e.lugar || '' }));
}
// Lo que Jarvis tiene cargado de tu agenda (los próximos días), para revisarlo en Ajustes: de qué calendario es cada evento, si se repite y su enlace.
function filaDe(e, cambios, locales) {
  const propio = cambios[e.id] || {};
  const local = e.local ? (locales.get(e.id) || {}) : {};
  const mios = normalizarAvisos(propio.avisos !== undefined ? propio.avisos : local.avisos, { whatsappViejo: !!(propio.whatsapp || local.whatsapp) });
  const propios = mios && mios.length ? mios : null; // null = los de su calendario o los de siempre
  return {
    id: e.id, titulo: e.titulo, inicio: +e.inicio, fin: +e.fin, todoElDia: !!e.todoElDia, lugar: e.lugar || '', calendario: e.calendario || '', enlace: e.enlace || '', repite: !!e.repite,
    local: !!e.local, cambiado: !!e.cambiado, detalle: e.detalle || '',
    avisos: propios,
    sonido: propio.sonido || local.sonido || '', silenciado: !!propio.silenciar, whatsapp: !!(propios && propios.some((a) => a.canal === 'whatsapp')),
    color: e.color || '', colorCalendario: colorDeCalendario(e.calendario),
  };
}
function lista(cuantos = 200, ahora = Date.now()) {
  const cambios = leerCambios();
  const locales = new Map(leerLocales().map((l) => [l.id, l]));
  return eventos.filter((e) => e.fin > ahora).sort((a, b) => a.inicio - b.inicio).slice(0, cuantos).map((e) => filaDe(e, cambios, locales));
}

// Los eventos de cualquier rango de fechas (para navegar el calendario por día, semana o mes). Lo de afuera se guarda 5 minutos para no volver a pedirlo en cada clic.
const cacheDeRango = new Map(); // 'desde|hasta' → { cuando, remotos, fuentes }
const cacheDeTexto = new Map(); // enlace → { cuando, texto }
async function textoDe(enlace) {
  const g = cacheDeTexto.get(enlace);
  if (g && Date.now() - g.cuando < 5 * 60000) return g.texto;
  const texto = await descargar(enlace);
  cacheDeTexto.set(enlace, { cuando: Date.now(), texto });
  return texto;
}
async function rango(desdeMs, hastaMs) {
  const desde = new Date(Number(desdeMs)); const hasta = new Date(Number(hastaMs));
  if (!Number.isFinite(+desde) || !Number.isFinite(+hasta) || hasta <= desde) throw new Error('Ese rango de fechas no es válido.');
  if (hasta - desde > 400 * 24 * 3600 * 1000) throw new Error('Pedí un rango más corto (hasta un año).');
  const c = leerConfig().calendario;
  let remotos = []; let error = '';
  if (google.conectada() && !coloresDeGoogle.size) await google.calendarios().then((l) => { coloresDeGoogle = new Map(l.filter((x) => x.color).map((x) => [x.nombre, x.color])); }).catch(() => {});
  if (hayFuentes(c)) {
    const clave = `${+desde}|${+hasta}`;
    const g = cacheDeRango.get(clave);
    if (g && Date.now() - g.cuando < 5 * 60000) { remotos = g.remotos; error = g.error; } else {
      const trabajos = [];
      if (google.conectada()) trabajos.push(['Cuenta de Google', google.eventos(desde, hasta).then((r) => r.eventos)]);
      for (const e of enlacesDe(c)) trabajos.push([e.nombre, textoDe(e.enlace).then((t) => leerEventos(t, desde, hasta).map((x) => ({ ...x, calendario: e.nombre })))]);
      const rs = await Promise.allSettled(trabajos.map((t) => t[1]));
      const vistos = new Set();
      remotos = rs.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value).filter((e) => { const k = claveDe(e); if (vistos.has(k)) return false; vistos.add(k); return true; });
      const mal = rs.findIndex((r) => r.status === 'rejected');
      error = mal >= 0 ? `${trabajos[mal][0]}: ${rs[mal].reason.message}` : '';
      cacheDeRango.set(clave, { cuando: Date.now(), remotos, error });
      if (cacheDeRango.size > 40) cacheDeRango.delete(cacheDeRango.keys().next().value);
    }
  }
  const cambios = leerCambios();
  const locales = new Map(leerLocales().map((l) => [l.id, l]));
  const todos = juntarConLocales(remotos).filter((e) => e.fin >= desde && e.inicio <= hasta);
  return { eventos: todos.map((e) => filaDe(e, cambios, locales)), error };
}

// Los calendarios que Jarvis conoce (para elegirles color y avisos propios): el propio, los enlaces iCal y los de la cuenta de Google.
async function conocidos() {
  const c = leerConfig().calendario || {};
  const nombres = [];
  const sumar = (nombre, origen, colorGoogle) => { if (nombre && !nombres.some((x) => x.nombre === nombre)) nombres.push({ nombre, origen, colorBase: colorGoogle || colorBase(nombre) }); };
  sumar('Jarvis', 'Eventos que armás en Jarvis');
  for (const e of enlacesDe(c)) sumar(e.nombre, 'Enlace iCal');
  if (google.conectada()) {
    try { const l = await google.calendarios(); coloresDeGoogle = new Map(l.filter((x) => x.color).map((x) => [x.nombre, x.color])); for (const x of l) sumar(x.nombre, 'Cuenta de Google', x.color); } catch {}
  }
  return nombres;
}

// Un evento propio de Jarvis (no se crea en Google). datos: { id?, titulo, inicio (ms), fin (ms)?, todoElDia, lugar, detalle, avisos: [minutos], whatsapp }.
async function guardarLocal(datos = {}) {
  const titulo = String(datos.titulo || '').trim();
  if (!titulo) throw new Error('Falta el nombre del evento.');
  const inicio = Number(datos.inicio);
  if (!Number.isFinite(inicio) || inicio <= 0) throw new Error('Falta la fecha y hora del evento.');
  const fin = Number(datos.fin) > inicio ? Number(datos.fin) : inicio + 3600000;
  const todos = leerLocales();
  const previo = datos.id ? todos.find((x) => x.id === datos.id) : null;
  const e = { id: previo ? previo.id : nuevoIdLocal(), titulo: titulo.slice(0, 200), inicio, fin, todoElDia: !!datos.todoElDia, lugar: String(datos.lugar || '').slice(0, 200), detalle: String(datos.detalle || '').slice(0, 1000), avisos: normalizarAvisos(datos.avisos, { whatsappViejo: !!datos.whatsapp }), sonido: String(datos.sonido || ''), color: colorValido(datos.color) };
  if (previo) Object.assign(previo, e); else todos.push(e);
  guardarJSON(LOCALES, todos);
  await actualizar().catch(() => {});
  revisar();
  return e;
}
async function borrarLocal(id) {
  guardarJSON(LOCALES, leerLocales().filter((x) => x.id !== id));
  await actualizar().catch(() => {});
  return true;
}
// Cambios sobre un evento que viene de Google / iCal (solo en Jarvis). cambios: { titulo, lugar, inicio, fin, todoElDia, avisos, silenciar, whatsapp, oculto } o null para volver al original.
async function cambiar(id, cambios) {
  const todos = leerCambios();
  if (!cambios) delete todos[id];
  else {
    const c = { ...(todos[id] || {}) };
    for (const k of ['titulo', 'lugar']) if (cambios[k] !== undefined) c[k] = String(cambios[k]).trim().slice(0, 200);
    if (!c.titulo) delete c.titulo;
    if (cambios.inicio !== undefined) { if (Number(cambios.inicio) > 0) { c.inicio = Number(cambios.inicio); c.fin = Number(cambios.fin) > c.inicio ? Number(cambios.fin) : c.inicio + 3600000; c.todoElDia = !!cambios.todoElDia; } else { delete c.inicio; delete c.fin; delete c.todoElDia; } }
    if (cambios.avisos !== undefined) { const a = normalizarAvisos(cambios.avisos, { whatsappViejo: !!cambios.whatsapp }); if (a && a.length) c.avisos = a; else delete c.avisos; delete c.whatsapp; }
    if (cambios.color !== undefined) { if (colorValido(cambios.color)) c.color = colorValido(cambios.color); else delete c.color; }
    if (cambios.sonido !== undefined) { if (cambios.sonido) c.sonido = String(cambios.sonido); else delete c.sonido; }
    for (const k of ['silenciar', 'oculto']) if (cambios[k] !== undefined) { if (cambios[k]) c[k] = true; else delete c[k]; }
    if (Object.keys(c).length) todos[id] = c; else delete todos[id];
  }
  guardarJSON(CAMBIOS, todos);
  await actualizar().catch(() => {});
  return true;
}
module.exports = { conocidos, procesar, normalizarAvisos, colorDeCalendario, rango, guardarLocal, borrarLocal, cambiar, lista, proximos, calendariosDeGoogle, enlacesDe, enlaceDeEvento, crearEvento, configurar, iniciar, detener, recargar, actualizar, probar, agenda, revisar, estado, leerEventos, _poner: (x) => { eventos = x; datosFrescos = true; }, _pruebas: { titulos: () => eventos.map((e) => e.titulo) } };
