// Chromecast / Google TV / parlantes Nest directo desde la PC, sin intermediarios.
const path = require('path');
const { leerConfig, buscarPorNombre, normalizar } = require('./config');
const { compartirArchivo, tipoDe } = require('./servidor');
const ha = require('./homeassistant');

const encontrados = new Map(); // nombre -> { nombre, host, puerto, modelo }
let buscador = null;

function descubrir() {
  if (buscador) return;
  try {
    require('castv2-client'); // se carga ya: tarda un instante en quedar lista y conviene que no sea justo al usarla
    const { Bonjour } = require('bonjour-service');
    const bonjour = new Bonjour();
    buscador = bonjour.find({ type: 'googlecast' });
    buscador.on('up', (s) => {
      const nombre = (s.txt && s.txt.fn) || s.name;
      const host = (s.addresses || []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || (s.referer && s.referer.address) || s.host;
      if (nombre && host) encontrados.set(nombre, { nombre, host, puerto: s.port || 8009, modelo: (s.txt && s.txt.md) || '' });
    });
    buscador.on('down', (s) => encontrados.delete((s.txt && s.txt.fn) || s.name));
  } catch (e) {
    console.error('[cast] No pude iniciar la búsqueda de dispositivos:', e.message);
  }
}

function refrescar() { try { buscador && buscador.update(); } catch {} }
const dispositivos = () => [...encontrados.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// De "tele comedor" (como le digo yo) al dispositivo Cast real.
async function resolver(pedido) {
  descubrir();
  const alias = buscarPorNombre(leerConfig().teles, pedido);
  const buscado = alias && alias.cast ? alias.cast : pedido;
  for (let intento = 0; intento < 8; intento++) {
    const lista = dispositivos();
    const d = lista.find((x) => x.nombre === buscado) || buscarPorNombre(lista, buscado);
    if (d) return { ...d, alias };
    if (intento === 0) refrescar();
    await esperar(500);
  }
  const vistos = dispositivos().map((d) => d.nombre).join(', ') || 'ninguno';
  throw new Error(`No encuentro "${pedido}" en la red. Dispositivos que veo: ${vistos}.`);
}

function conectar(d) {
  const { Client } = require('castv2-client');
  return new Promise((ok, mal) => {
    const cliente = new Client();
    const reloj = setTimeout(() => { cliente.close(); mal(new Error(`${d.nombre} no responde.`)); }, 7000);
    cliente.on('error', (e) => { clearTimeout(reloj); try { cliente.close(); } catch {} mal(new Error(`Error hablando con ${d.nombre}: ${e.message}`)); });
    cliente.connect({ host: d.host, port: d.puerto }, () => { clearTimeout(reloj); ok(cliente); });
  });
}

const promesa = (fn) => new Promise((ok, mal) => fn((e, r) => (e ? mal(e) : ok(r))));

async function conCliente(d, tarea) {
  const cliente = await conectar(d);
  try { return await tarea(cliente); } finally { setTimeout(() => { try { cliente.close(); } catch {} }, 300); }
}

// Se "engancha" a lo que esté sonando en el dispositivo para pausar o reanudar.
async function reproductorActual(cliente) {
  const { DefaultMediaReceiver } = require('castv2-client');
  const sesiones = await promesa((cb) => cliente.getSessions(cb));
  const sesion = (sesiones || []).find((s) => !s.isIdleScreen);
  if (!sesion) return { sesion: null, reproductor: null };
  const reproductor = await promesa((cb) => cliente.join(sesion, DefaultMediaReceiver, cb));
  const estado = await promesa((cb) => reproductor.getStatus(cb)).catch(() => null);
  return { sesion, reproductor: estado ? reproductor : null };
}

// origen: una URL (http...) o la ruta de un archivo de esta PC.
async function reproducir(pedido, origen, titulo) {
  if (!origen) throw new Error('Falta decir qué reproducir.');
  const d = await resolver(pedido);
  let url = String(origen).trim().replace(/^"|"$/g, '');
  let tipo;
  if (/^https?:\/\//i.test(url)) {
    tipo = tipoDe(new URL(url).pathname);
    if (tipo === 'application/octet-stream') tipo = 'video/mp4';
  } else {
    const compartido = await compartirArchivo(url, d.host);
    titulo = titulo || path.basename(url);
    url = compartido.url; tipo = compartido.tipo;
  }
  const { DefaultMediaReceiver } = require('castv2-client');
  await conCliente(d, async (cliente) => {
    const reproductor = await promesa((cb) => cliente.launch(DefaultMediaReceiver, cb));
    const medio = {
      contentId: url, contentType: tipo, streamType: 'BUFFERED',
      metadata: { type: 0, metadataType: 0, title: titulo || 'Jarvis' },
    };
    await promesa((cb) => reproductor.load(medio, { autoplay: true }, cb));
  });
  return `Reproduciendo en ${d.nombre}.`;
}

// accion: prender | apagar | pausar | reanudar | detener | volumen | silenciar | sonido
async function controlar(pedido, accion, valor) {
  const alias = buscarPorNombre(leerConfig().teles, pedido);
  // Prender y apagar de verdad solo se puede por Home Assistant; Cast no tiene "apagar".
  if ((accion === 'prender' || accion === 'apagar') && alias && alias.entidadHA && ha.configurado()) {
    await ha.servicio('media_player', accion === 'prender' ? 'turn_on' : 'turn_off', { entity_id: alias.entidadHA });
    return `${alias.nombre}: ${accion === 'prender' ? 'prendida' : 'apagada'}.`;
  }
  const d = await resolver(pedido);
  const { DefaultMediaReceiver } = require('castv2-client');
  return conCliente(d, async (cliente) => {
    switch (accion) {
      case 'prender':
        await promesa((cb) => cliente.launch(DefaultMediaReceiver, cb));
        return `Desperté ${d.nombre}.`;
      case 'apagar': {
        const sesiones = await promesa((cb) => cliente.getSessions(cb));
        for (const s of sesiones || []) await promesa((cb) => cliente.receiver.stop(s.sessionId, cb)).catch(() => {});
        return `Corté lo que se estaba viendo en ${d.nombre}, pero por Cast no la puedo apagar del todo. Para apagarla de verdad hay que vincularla con Home Assistant en Ajustes.`;
      }
      case 'detener': {
        const sesiones = await promesa((cb) => cliente.getSessions(cb));
        for (const s of sesiones || []) await promesa((cb) => cliente.receiver.stop(s.sessionId, cb)).catch(() => {});
        return `Detuve la reproducción en ${d.nombre}.`;
      }
      case 'pausar':
      case 'reanudar': {
        const { reproductor } = await reproductorActual(cliente);
        if (!reproductor) throw new Error(`No hay nada reproduciéndose en ${d.nombre} que pueda controlar.`);
        await promesa((cb) => (accion === 'pausar' ? reproductor.pause(cb) : reproductor.play(cb)));
        return accion === 'pausar' ? `Pausé ${d.nombre}.` : `Reanudé ${d.nombre}.`;
      }
      case 'volumen': {
        let nivel;
        const pedidoVol = normalizar(valor);
        if (/^(subir|mas|\+)/.test(pedidoVol) || /^(bajar|menos)/.test(pedidoVol) || /^[+-]/.test(String(valor).trim())) {
          const actual = await promesa((cb) => cliente.getVolume(cb));
          const paso = /^[+-]\d+/.test(String(valor).trim()) ? Number(valor) / 100 : (/^(bajar|menos)/.test(pedidoVol) ? -0.1 : 0.1);
          nivel = (actual.level || 0) + paso;
        } else {
          nivel = Number(valor) / 100;
        }
        if (!Number.isFinite(nivel)) throw new Error('El volumen tiene que ser un número de 0 a 100, o "subir" / "bajar".');
        nivel = Math.max(0, Math.min(1, nivel));
        await promesa((cb) => cliente.setVolume({ level: nivel }, cb));
        return `Volumen de ${d.nombre} en ${Math.round(nivel * 100)}.`;
      }
      case 'silenciar': await promesa((cb) => cliente.setVolume({ muted: true }, cb)); return `Silencié ${d.nombre}.`;
      case 'sonido': await promesa((cb) => cliente.setVolume({ muted: false }, cb)); return `${d.nombre} con sonido.`;
      default: throw new Error(`No sé hacer "${accion}" en una tele.`);
    }
  });
}

// ---- YouTube en la tele ----
// Google no ofrece una forma oficial de que otra app le elija un video a la app de YouTube de la tele.
// Esto usa el mismo camino que la app de YouTube del celular (y que proyectos abiertos como catt y
// pychromecast): se abre YouTube en la tele, se le pide su "pantalla" y se le manda el video por el
// servicio de control remoto de YouTube. Puede dejar de andar si Google cambia algo de su lado.
const YOUTUBE = (process.env.JARVIS_URL_YOUTUBE || 'https://www.youtube.com').replace(/\/+$/, '');
const APP_YOUTUBE = '233637DE';
const CANAL_YOUTUBE = 'urn:x-cast:com.google.youtube.mdx';

function aplicacionYoutube() {
  const util = require('util');
  const { Application, JsonController } = require('castv2-client');
  function Pantalla(cliente, origen, destino) { JsonController.call(this, cliente, origen, destino, CANAL_YOUTUBE); }
  util.inherits(Pantalla, JsonController);
  function YouTube() { Application.apply(this, arguments); this.pantalla = this.createController(Pantalla); }
  util.inherits(YouTube, Application);
  YouTube.APP_ID = APP_YOUTUBE;
  return YouTube;
}

// Abre YouTube en el dispositivo y devuelve el identificador de su "pantalla".
function pantallaDeYoutube(cliente, nombre) {
  return new Promise((ok, mal) => {
    const reloj = setTimeout(() => mal(new Error(`YouTube no respondió en ${nombre}.`)), 20000);
    cliente.launch(aplicacionYoutube(), (error, app) => {
      if (error) { clearTimeout(reloj); mal(new Error(`No pude abrir YouTube en ${nombre}: ${error.message}`)); return; }
      const pedir = () => { try { app.pantalla.send({ type: 'getMdxSessionStatus' }); } catch {} };
      app.pantalla.on('message', (m) => {
        const id = m && m.type === 'mdxSessionStatus' && m.data && m.data.screenId;
        if (id) { clearTimeout(reloj); clearInterval(insistir); ok(id); }
      });
      const insistir = setInterval(pedir, 2500); // recién abierta, la app a veces tarda en contestar
      pedir();
      setTimeout(() => clearInterval(insistir), 20000);
    });
  });
}

// Todo lo que se hace con YouTube queda anotado en el historial (paso, estado y un trozo de la respuesta): si algo no suena, ahí se ve dónde se cortó.
const anotar = (texto, error = false) => { try { require('./historial').anotar(`Cast/YouTube: ${texto}`, error ? { error: true } : undefined); } catch {} };
const recorte = (t) => String(t || '').replace(/\s+/g, ' ').slice(0, 160);

async function formularioYoutube(ruta, parametros, campos, token, { paso = ruta } = {}) {
  const url = `${YOUTUBE}${ruta}${parametros ? `?${new URLSearchParams(parametros)}` : ''}`;
  const pedido = () => fetch(url, {
    method: 'POST', body: new URLSearchParams(campos).toString(), signal: AbortSignal.timeout(12000),
    headers: { Origin: 'https://www.youtube.com/', 'Content-Type': 'application/x-www-form-urlencoded', ...(token ? { 'X-YouTube-LoungeId-Token': token } : {}) },
  });
  const r = await pedido().catch(() => pedido()).catch(() => { throw new Error('No hay conexión con YouTube.'); }); // un corte suelto merece un segundo intento
  const texto = await r.text();
  anotar(`${paso} → ${r.status} ${recorte(texto)}`, !r.ok);
  if (!r.ok) throw new Error(`YouTube respondió ${r.status} al mandar el video.`);
  return texto;
}

// Se queda escuchando lo que la pantalla le cuenta al control remoto: cuando arranca, avisa ("nowPlaying" / "onStateChange").
// Devuelve true si vio que empezó (o que ya está en eso), false si no se enteró en el plazo.
async function esperarQueArranque(sesion, ficha, videoId, lista, ms = 8000) {
  const params = new URLSearchParams({ VER: 8, CVER: 1, RID: 'rpc', SID: sesion.sid, gsessionid: sesion.gsession, AID: 0, CI: 0, TYPE: 'xmlhttp', zx: Math.random().toString(36).slice(2, 12) });
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ms);
  let vistos = '';
  try {
    const r = await fetch(`${YOUTUBE}/api/lounge/bc/bind?${params}`, { headers: { Origin: 'https://www.youtube.com/', 'X-YouTube-LoungeId-Token': ficha }, signal: corte.signal });
    if (!r.ok || !r.body) { anotar(`escucha de la pantalla → ${r.status}`, true); return false; }
    const lector = r.body.getReader();
    const deco = new TextDecoder();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      vistos += deco.decode(value, { stream: true });
      // Arrancó de verdad: la pantalla cuenta que está reproduciendo o cargando (state 1 o 3) ese video.
      if (/"(nowPlaying|onStateChange)",\{[^\]]*"state":"(1|3)"/.test(vistos) || (videoId && new RegExp(`"nowPlaying",\\{[^\\]]*"videoId":"${videoId}"`).test(vistos))) { anotar(`la pantalla confirmó: ${recorte(vistos.slice(-120))}`); return true; }
    }
  } catch (e) { if (e.name !== 'AbortError') anotar(`escucha de la pantalla falló: ${e.message}`, true); } finally { clearTimeout(reloj); try { corte.abort(); } catch {} }
  anotar(`la pantalla no confirmó en ${Math.round(ms / 1000)} s${vistos ? ` (llegó: ${recorte(vistos)})` : ''}`, true);
  return false;
}

// Abre una sesión de control remoto con la pantalla de YouTube (la misma que usa el celular).
async function abrirSesion(pantalla) {
  const fichas = JSON.parse(await formularioYoutube('/api/lounge/pairing/get_lounge_token_batch', null, { screen_ids: pantalla }, null, { paso: 'ficha de la pantalla' }));
  const token = fichas && fichas.screens && fichas.screens[0] && fichas.screens[0].loungeToken;
  if (!token) throw new Error('YouTube no dio permiso para controlar esa pantalla.');
  const enlace = await formularioYoutube('/api/lounge/bc/bind', { RID: 0, VER: 8, CVER: 1 },
    { device: 'REMOTE_CONTROL', id: 'jarvisjarvisjarvisjarvisja', name: 'Jarvis', 'mdx-version': 3, pairing_type: 'cast', app: 'android-phone-13.14.55', loungeIdToken: token }, token, { paso: 'abrir sesión de control' });
  const sid = /"c","(.*?)","/.exec(enlace);
  const gsession = /"S","(.*?)"]/.exec(enlace);
  if (!sid || !gsession) throw new Error('YouTube no abrió la sesión de control.');
  return { pantalla, token, sid: sid[1], gsession: gsession[1], rid: 1 };
}
// Manda una orden por la sesión abierta (setPlaylist, next, previous, pause, play, setVolume…).
const ordenar = (sesion, campos, paso) => formularioYoutube('/api/lounge/bc/bind', { SID: sesion.sid, gsessionid: sesion.gsession, RID: sesion.rid++, VER: 8, CVER: 1 }, { ...campos, count: 1, ofs: 0 }, sesion.token, { paso });

// Las sesiones abiertas con cada aparato (por nombre): sirven para seguir controlando lo que se mandó (pausa, siguiente, anterior).
const sesiones = new Map();

// Le manda un video (por su id) a la app de YouTube de esa pantalla. Devuelve true si la pantalla confirmó que arrancó.
// lista: el id de una lista de reproducción o mezcla (con o sin videoId); audioOnly: para parlantes sin pantalla.
async function mandarAYoutube(pantalla, videoId, { lista = '', audioOnly = false, nombre = '' } = {}) {
  const sesion = await abrirSesion(pantalla);
  if (nombre) sesiones.set(normalizar(nombre), sesion);
  // audioOnly va siempre en "false" (como la app de YouTube del celular): en "true" los Nest y Chromecast reciben el pedido pero no arrancan.
  const mandar = () => ordenar(sesion, { req0_listId: lista || '', req0__sc: 'setPlaylist', req0_currentTime: '0', req0_currentIndex: -1, req0_audioOnly: 'false', req0_videoId: videoId }, 'mandar el video');
  const escucha = esperarQueArranque(sesion, sesion.token, videoId, lista);
  await mandar();
  if (await escucha) return true;
  // No se enteró: la app recién abierta a veces no está lista para recibir; se vuelve a mandar una vez.
  await esperar(1500);
  const otra = esperarQueArranque(sesion, sesion.token, videoId, lista, 7000);
  await mandar();
  return otra;
}

// Controla lo que se mandó antes a ese aparato: pausar | reanudar | siguiente | anterior | volumen (0-100).
// Si la sesión se venció, se abre otra: la pantalla mantiene su lista y obedece igual.
const ORDENES = { pausar: 'pause', reanudar: 'play', siguiente: 'next', anterior: 'previous' };
async function controlarYoutube(nombre, accion, valor) {
  const clave = normalizar(nombre);
  let sesion = sesiones.get(clave);
  if (!sesion) throw new Error(`No mandé música a ${nombre} desde Jarvis, así que no tengo con qué controlarla.`);
  const campos = accion === 'volumen' ? { req0__sc: 'setVolume', req0_volume: Math.max(0, Math.min(100, Math.round(Number(valor) || 0))) } : { req0__sc: ORDENES[accion] };
  if (!campos.req0__sc) throw new Error(`No sé hacer "${accion}" en ${nombre}.`);
  try { await ordenar(sesion, campos, `orden ${accion}`); }
  catch {
    sesion = await abrirSesion(sesion.pantalla);
    sesiones.set(clave, sesion);
    await ordenar(sesion, campos, `orden ${accion} (sesión nueva)`);
  }
  return { pausar: 'Pausado.', reanudar: 'Sigo.', siguiente: 'Siguiente.', anterior: 'Anterior.', volumen: 'Listo.' }[accion];
}
const tieneSesion = (nombre) => sesiones.has(normalizar(nombre));
const olvidarSesion = (nombre) => sesiones.delete(normalizar(nombre));

// Los grupos de Google Home ("Toda la casa") no abren apps: YouTube responde NOT_ALLOWED.
const esGrupo = (d) => /cast group|grupo/i.test(String((d && d.modelo) || ''));
async function youtube(pedido, videoId, { lista = '' } = {}) {
  if (!videoId) throw new Error('Falta el video con el que empezar.'); // la app de YouTube del aparato no arranca una lista sin un video
  const d = await resolver(pedido);
  anotar(`${d.nombre} (${d.modelo || 'modelo desconocido'}) en ${d.host}`);
  if (esGrupo(d)) throw new Error(`${d.nombre} es un grupo de Google Home, y los grupos no aceptan YouTube (es una limitación de Google). Pedímelo en un aparato, por ejemplo "${dispositivos().filter((x) => !esGrupo(x))[0]?.nombre || 'Comedor'}".`);
  // Primero por Cast (la pantalla confirma si arrancó). Si no confirma y la tele tiene el control de Google TV vinculado, se abre el link con el control.
  let confirmado = false;
  try {
    const pantalla = await conCliente(d, (cliente) => pantallaDeYoutube(cliente, d.nombre));
    anotar(`pantalla de YouTube: ${pantalla}`);
    confirmado = await mandarAYoutube(pantalla, videoId, { lista, nombre: d.nombre });
  } catch (e) { anotar(`por Cast falló: ${e.message}`, true); if (!require('./androidtv').vinculada(d.nombre)) throw e; }
  if (!confirmado) {
    const tv = require('./androidtv');
    if (tv.vinculada(d.nombre)) {
      try {
        await tv.abrir(d.nombre, `https://www.youtube.com/watch?v=${videoId}${lista ? `&list=${lista}` : ''}`);
        anotar(`abierto en ${d.nombre} por el control de Google TV`);
        return { dispositivo: d.nombre, confirmado: true };
      } catch (e) { anotar(`el control de Google TV falló: ${e.message}`, true); }
    }
  }
  return { dispositivo: d.nombre, confirmado };
}

// La frase que se dice según haya o no confirmación de que arrancó.
const dichoDeYoutube = (r, que) => (r.confirmado ? `${que} en ${r.dispositivo}.` : `Le mandé ${que} a ${r.dispositivo}, pero no arrancó (no confirmó que esté sonando). El detalle quedó en el Historial.`);

module.exports = { esGrupo, conectar, dichoDeYoutube, descubrir, refrescar, dispositivos, resolver, reproducir, controlar, youtube, mandarAYoutube, pantallaDeYoutube, controlarYoutube, tieneSesion, olvidarSesion };
