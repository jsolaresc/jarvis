// Música por voz: YouTube Music (music.youtube.com), nunca YouTube "a secas" — así se reproduce
// solo audio, sin gastar nada de más en renderizar un video que no se va a ver.
//
// La reproducción vive en una BrowserWindow oculta con su propia sesión persistente ("persist:musica",
// separada del resto de Jarvis). Para poner una canción puntual no hace falta leer ni adivinar nada
// del DOM de la página: alcanza con navegar directo a la URL de esa canción
// (music.youtube.com/watch?v=<id>), que es el mismo link estable que usa cualquier botón "Compartir"
// del sitio. Para encontrar el video id de una canción pedida por nombre se usa la YouTube Data API
// si hay una clave cargada; si no, se abre la búsqueda común de YouTube en una ventana oculta y se
// toma el primer resultado (sin clave ni cuota). "Poné música" a secas pone Mi Supermix y solo
// necesita que la sesión de YouTube Music esté iniciada.
//
// IMPORTANTE — nada de esto se pudo probar contra el sitio real todavía: este entorno no tiene
// salida de red hacia music.youtube.com, y la PC del usuario no estaba conectada al escribir esto.
// Lo que sí está probado (con una página de mentira que imita la estructura) es la mecánica:
// detectar la sesión, encontrar la mezcla por su nombre, abrirla y hacer que arranque.
const { BrowserWindow, session } = require('electron');
const { leerConfig, normalizar } = require('./config');

const SITIO = process.env.JARVIS_URL_MUSICA || 'https://music.youtube.com'; // (las variables son solo para las pruebas)
const YOUTUBE = (process.env.JARVIS_URL_YOUTUBE || 'https://www.youtube.com').replace(/\/+$/, '');
const YOUTUBE_DATOS = (process.env.JARVIS_URL_YOUTUBE_DATOS || 'https://www.googleapis.com/youtube/v3').replace(/\/+$/, '');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let ventana = null; // reproductor oculto (se crea recién cuando hace falta)
let sesionVisible = null; // ventana de login, solo mientras el usuario inicia sesión a mano
let sonando = false; // lo avisa el propio reproductor de la página (para el botón Play/Pausa del notch)
let avisar = () => {};
function alCambiar(fn) { avisar = fn; }
function fijarSonando(valor) { if (valor !== sonando) { sonando = valor; ritmo(); try { avisar(estado()); } catch {} } }

// ---------- El ritmo (para que los ojos del notch bailen) ----------
// En la página del reproductor se instala un analizador (ritmo.js) que mira el espectro del audio cada ~23 ms:
// detecta los golpes (con su hora exacta), el tempo y la fuerza de graves, medios y agudos. Acá se lo consulta
// cada 100 ms y se le pasa al notch, que arma el baile con eso. El analizador va en paralelo a la salida: no
// toca el audio. Si la página no deja medir, se avisa { ok: false } y el notch baila a un compás propio.
// Lo que se manda: { parar: true } | { ok: false } | { ok: true, bpm, conf, n, hace, graves, medios, agudos, energia, subida }.
let alRitmo = () => {};
let relojRitmo = null;
function alRitmoDe(fn) { alRitmo = fn; }
const { crearAnalizador } = require('./ritmo');
const MEDIR = `(() => {
  const v = document.querySelector('video, audio');
  if (!v) return { sin: 'medio' };
  if (v.paused) return { pausado: true };
  let j = window.__jr;
  if (j && j.el !== v) { try { clearInterval(j.t); } catch (e) {} j = window.__jr = null; } // la página cambió de reproductor
  if (!j) {
    try {
      const C = window.AudioContext || window.webkitAudioContext; const c = new C();
      const src = c.createMediaElementSource(v); const an = c.createAnalyser();
      an.fftSize = 1024; an.smoothingTimeConstant = 0; src.connect(an); an.connect(c.destination);
      const crear = (${crearAnalizador.toString()});
      j = window.__jr = { el: v, c, an, d: new Uint8Array(an.frequencyBinCount), A: crear(), t: 0 };
      j.t = setInterval(() => { if (v.paused || performance.now() - (window.__jrVisto || 0) > 1500) return; j.an.getByteFrequencyData(j.d); j.A.paso(j.d, performance.now()); }, 23);
    } catch (e) { window.__jr = { fallo: true }; }
  }
  j = window.__jr;
  window.__jrVisto = performance.now(); // el analizador solo trabaja mientras alguien lo consulta
  if (!j || j.fallo) return { fallo: true };
  if (j.c.state === 'suspended') j.c.resume();
  return j.A.estado(performance.now());
})()`;
let midiendo = false;
function bailaAhora() {
  try {
    const c = leerConfig();
    if (c.apariencia && c.apariencia.ojosBailan === false) return false;
    const modo = (c.modos || []).find((m) => m && m.id === c.modo);
    return !(modo && modo.visible === false);
  } catch { return true; }
}
function ritmo() {
  clearInterval(relojRitmo); relojRitmo = null;
  if (!sonando) { try { alRitmo({ parar: true }); } catch {} return; }
  let ocupado = false;
  relojRitmo = setInterval(async () => {
    if (ocupado || !ventana || ventana.isDestroyed()) return;
    // [Consumo] Si los ojos no van a bailar (baile apagado o modo con el notch oculto), no se mide nada:
    // ni la consulta a la página cada 100 ms ni el analizador de espectro cada 23 ms dentro de ella.
    if (!bailaAhora()) { if (midiendo) { midiendo = false; try { alRitmo({ parar: true }); } catch {} } return; }
    midiendo = true;
    ocupado = true;
    try {
      const r = await ventana.webContents.executeJavaScript(MEDIR);
      if (!r || r.sin || r.pausado) alRitmo({ parar: true });
      else if (r.fallo) alRitmo({ ok: false });
      else alRitmo({ ok: true, ...r });
    } catch { alRitmo({ ok: false }); } finally { ocupado = false; }
  }, 100);
}
// [D28] Qué está sonando: el título de la pestaña de YouTube Music ("Canción - Artista - YouTube Music").
function tituloActual() {
  if (!ventana || ventana.isDestroyed()) return '';
  const t = String(ventana.webContents.getTitle() || '').replace(/\s*[-–|]\s*YouTube( Music)?\s*$/i, '').trim();
  return /^(YouTube( Music)?|music\.youtube\.com)$/i.test(t) ? '' : t;
}
// Lo que suena: YouTube Music le cuenta al navegador (mediaSession) la canción, el artista y la tapa. Si no hay, queda el título de la pestaña.
const LEER_INFO = `(() => {
  const m = navigator.mediaSession && navigator.mediaSession.metadata;
  if (!m) return null;
  const a = (m.artwork || []).slice().sort((x, y) => (parseInt(String(y.sizes).split('x')[0], 10) || 0) - (parseInt(String(x.sizes).split('x')[0], 10) || 0))[0];
  return { cancion: String(m.title || ''), artista: String(m.artist || ''), tapa: a && a.src && /^https?:/i.test(a.src) ? a.src : '' };
})()`;
let infoActual = { cancion: '', artista: '', tapa: '' };
async function leerInfo() {
  let nueva = { cancion: '', artista: '', tapa: '' };
  if (ventana && !ventana.isDestroyed()) {
    try { const r = await ventana.webContents.executeJavaScript(LEER_INFO); if (r) nueva = { cancion: r.cancion, artista: r.artista, tapa: r.tapa }; } catch {}
  }
  if (JSON.stringify(nueva) !== JSON.stringify(infoActual)) { infoActual = nueva; try { avisar(estado()); } catch {} }
}
let relojInfo = null;
function vigilarInfo() {
  clearInterval(relojInfo); relojInfo = null;
  if (!ventana || ventana.isDestroyed()) { infoActual = { cancion: '', artista: '', tapa: '' }; return; }
  relojInfo = setInterval(leerInfo, 4000);
  setTimeout(leerInfo, 600);
}
// Cuando la música se mandó a otro aparato (Nest, Chromecast…), la tarjeta muestra y controla eso, no el reproductor de la PC.
let destino = null; // { nombre, cancion, artista, tapa, sonando }
const estado = () => {
  if (destino) {
    const { nombre, cancion, artista, tapa, sonando: suena } = destino;
    return { hay: true, sonando: suena, titulo: artista ? `${cancion} - ${artista}` : cancion, cancion, artista, tapa, destino: nombre };
  }
  const hay = !!(ventana && !ventana.isDestroyed());
  const { cancion, artista, tapa } = hay ? infoActual : { cancion: '', artista: '', tapa: '' };
  const titulo = cancion ? (artista ? `${cancion} - ${artista}` : cancion) : (sonando || hay ? tituloActual() : '');
  return { hay, sonando, titulo, cancion, artista, tapa };
};

function asegurarVentana() {
  if (ventana && !ventana.isDestroyed()) return ventana;
  ventana = new BrowserWindow({
    show: false, width: 1100, height: 800,
    webPreferences: { partition: 'persist:musica', backgroundThrottling: false },
  });
  const v = ventana;
  v.webContents.on('media-started-playing', () => { if (ventana === v) fijarSonando(true); });
  v.webContents.on('media-paused', () => { if (ventana === v) fijarSonando(false); });
  v.webContents.on('page-title-updated', () => { if (ventana === v) { try { avisar(estado()); } catch {} setTimeout(leerInfo, 400); } });
  vigilarInfo();
  v.on('closed', () => { if (ventana === v) { ventana = null; vigilarInfo(); fijarSonando(false); } });
  return ventana;
}

// Se muestra una sola vez (o cuando haga falta volver a iniciar sesión): usa la misma sesión
// ("persist:musica") que después usa el reproductor oculto, así que lo que el usuario loguee acá
// queda disponible para poner música. Jarvis nunca escribe ni guarda la contraseña: la pantalla
// de Google la completa él mismo, como con cualquier inicio de sesión normal.
function iniciarSesion() {
  if (sesionVisible && !sesionVisible.isDestroyed()) { sesionVisible.show(); sesionVisible.focus(); return; }
  sesionVisible = new BrowserWindow({
    width: 480, height: 720, title: 'Jarvis · Iniciar sesión en YouTube Music',
    webPreferences: { partition: 'persist:musica' },
  });
  sesionVisible.loadURL(SITIO);
  sesionVisible.on('closed', () => { sesionVisible = null; });
}

// Con la sesión de Google iniciada, YouTube deja esta cookie; sin sesión no está.
async function conSesion() {
  try {
    const galletas = await session.fromPartition('persist:musica').cookies.get({ url: SITIO });
    return galletas.some((g) => g.name === 'SAPISID' || g.name === '__Secure-3PAPISID');
  } catch { return false; }
}

// Con clave: la API oficial. videoCategoryId 10 = Música (para no traer cualquier video).
// Para ver algo ("poné No Se Pudo en YouTube") conviene la transmisión en vivo si el canal está en vivo ahora: se la reconoce porque
// el título o el canal tienen todas las palabras de lo pedido (si no, cualquier vivo cualquiera que se parezca sería el elegido).
const plano = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const nombraLoPedido = (consulta, ...textos) => { const dicho = plano(textos.join(' ')); return plano(consulta).split(' ').filter(Boolean).every((w) => dicho.includes(w)); };

async function buscarConClave(consulta, clave, soloMusica, enVivo = false) {
  const pedir = async (extra) => {
    const url = `${YOUTUBE_DATOS}/search?part=snippet&type=video${soloMusica ? '&videoCategoryId=10' : ''}${extra}&q=${encodeURIComponent(consulta)}&key=${clave}`;
    let r, d;
    try {
      r = await fetch(url);
      d = await r.json();
    } catch (e) {
      throw new Error(`No pude conectarme a la API de YouTube: ${e.message}`);
    }
    if (!r.ok) {
      const razon = d?.error?.errors?.[0]?.reason || d?.error?.status || '';
      if (/quota/i.test(razon)) throw new Error('Se agotó la cuota gratuita de la API de YouTube por hoy.');
      throw new Error(d?.error?.message || 'No pude buscar en YouTube.');
    }
    return d?.items || [];
  };
  if (enVivo) {
    try {
      const vivo = (await pedir('&eventType=live&maxResults=5')).find((x) => x.id && x.id.videoId && nombraLoPedido(consulta, x.snippet && x.snippet.title, x.snippet && x.snippet.channelTitle));
      if (vivo) return { id: vivo.id.videoId, titulo: (vivo.snippet && vivo.snippet.title) || consulta, enVivo: true };
    } catch (e) { if (/cuota/i.test(e.message)) throw e; }
  }
  const video = (await pedir('&maxResults=1'))[0];
  if (!video || !video.id || !video.id.videoId) return null;
  return { id: video.id.videoId, titulo: (video.snippet && video.snippet.title) || consulta };
}

// Sin clave: se abre la búsqueda de YouTube en una ventana que no se ve (igual que si la abrieras vos
// en el navegador) y se toma el primer video de la lista.
async function buscarSinClave(consulta, enVivo = false) {
  if (!BrowserWindow) throw new Error('La búsqueda sin clave solo funciona dentro de Jarvis.');
  const v = new BrowserWindow({ show: false, width: 1100, height: 900, webPreferences: { partition: 'persist:musica' } });
  v.webContents.setAudioMuted(true);
  try {
    await v.loadURL(`${YOUTUBE}/results?search_query=${encodeURIComponent(consulta)}`);
    for (let intento = 0; intento < 14; intento++) {
      const video = await v.webContents.executeJavaScript(`(() => {
        const plano = (t) => String(t || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\\s+/g, ' ').trim();
        const palabras = plano(${JSON.stringify(consulta)}).split(' ').filter(Boolean);
        const todas = [];
        for (const bloque of document.querySelectorAll('ytd-video-renderer')) {
          const a = bloque.querySelector('a[href*="/watch?v="]');
          const m = a && /[?&]v=([\\w-]{11})/.exec(a.href);
          const titulo = ((a && (a.getAttribute('title') || a.textContent)) || '').trim();
          if (!m || !titulo) continue;
          const canal = ((bloque.querySelector('ytd-channel-name') || {}).textContent || '').trim();
          const vivo = !!bloque.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"], .badge-style-type-live-now-alternate, .badge-style-type-live-now') || /(^|\\n)\\s*(EN VIVO|EN DIRECTO|LIVE)\\s*($|\\n)/i.test(bloque.innerText || '');
          todas.push({ id: m[1], titulo, vivo, nombra: palabras.every((w) => plano(titulo + ' ' + canal).includes(w)) });
        }
        if (${enVivo ? 'true' : 'false'}) { const v = todas.find((x) => x.vivo && x.nombra); if (v) return { id: v.id, titulo: v.titulo, enVivo: true }; }
        if (todas[0]) return { id: todas[0].id, titulo: todas[0].titulo };
        for (const a of document.querySelectorAll('a[href*="/watch?v="]')) {
          const m = /[?&]v=([\\w-]{11})/.exec(a.href);
          const titulo = (a.getAttribute('title') || a.textContent || '').trim();
          if (m && titulo) return { id: m[1], titulo };
        }
        return null;
      })()`).catch(() => null);
      if (video) return video;
      await esperar(500);
    }
    return null;
  } catch (e) {
    throw new Error(`No pude abrir la búsqueda de YouTube: ${e.message}`);
  } finally {
    if (!v.isDestroyed()) v.destroy();
  }
}

// El primer video de YouTube para una búsqueda: { id, titulo }.
async function buscarVideo(consulta, { soloMusica = false, enVivo = false } = {}) {
  const clave = ((leerConfig().musica || {}).apiKeyYoutube || '').trim();
  let video = null;
  let falla = null;
  if (clave) { try { video = await buscarConClave(consulta, clave, soloMusica, enVivo); } catch (e) { falla = e; } }
  if (!video) { try { video = await buscarSinClave(consulta, enVivo); } catch (e) { falla = falla || e; } }
  if (!video) throw falla || new Error(`No encontré "${consulta}" en YouTube.`);
  return video;
}

// ---- "Poné música" a secas: Mi Supermix (la mezcla que YouTube Music arma con los gustos de la cuenta) ----
// Es una lista automática con un identificador que, según varias referencias, es el mismo para todas
// las cuentas (cada una ve su propia mezcla). Por si eso cambia, primero se la busca por su nombre en
// la página de inicio de YouTube Music, y recién si no aparece se usa el identificador conocido.
const SUPERMIX_CONOCIDO = 'RDTMAK5uy_kset8DisdE7LSD4TNjEVvrKRTmG7a56sY';

const idDeLista = (texto) => { const m = /[?&]list=([\w-]+)/.exec(String(texto || '')); return m ? m[1] : (/^[\w-]{13,}$/.test(String(texto || '').trim()) ? String(texto).trim() : null); };

async function buscarSupermix(v) {
  await v.loadURL(SITIO);
  for (let intento = 0; intento < 12; intento++) {
    const enlace = await v.webContents.executeJavaScript(`(() => {
      const es = (t) => /super\\s*mix/i.test(t || '');
      const a = [...document.querySelectorAll('a[href*="list="]')].find((x) => es(x.textContent) || es(x.title) || es(x.getAttribute('aria-label')));
      window.scrollBy(0, 1500); // las mezclas a veces están más abajo y la página carga de a poco
      return a ? a.href : null;
    })()`).catch(() => null);
    if (idDeLista(enlace)) return idDeLista(enlace);
    await esperar(700);
  }
  return null;
}

// Abre una lista o una canción. Si a los pocos segundos no está sonando, toca el botón de reproducir de la página.
const ponerLista = (v, lista) => ponerEnlace(v, `${SITIO}/watch?list=${lista}`);
async function ponerEnlace(v, enlace) {
  await v.loadURL(enlace);
  for (let intento = 0; intento < 10; intento++) {
    await esperar(800);
    const estado = await v.webContents.executeJavaScript(`(() => {
      const medio = document.querySelector('video, audio');
      if (medio && !medio.paused && medio.currentTime > 0) return 'sonando';
      if (medio && medio.paused && medio.readyState >= 2) { medio.play().catch(() => {}); return 'empujado'; }
      const boton = [...document.querySelectorAll('button, [role="button"], tp-yt-paper-icon-button')].find((b) => /aleatori|shuffle|reproducir|^play/i.test(b.getAttribute('aria-label') || b.title || ''));
      if (!medio && boton) { boton.click(); return 'click'; }
      return 'esperando';
    })()`).catch(() => 'esperando');
    if (estado === 'sonando') return true;
  }
  return false;
}

async function ponerMusicaPorDefecto() {
  soltarDestino();
  if (!(await conSesion())) throw new Error('Para poner tu Supermix primero tenés que iniciar sesión en YouTube Music: Ajustes, Música, "Iniciar sesión".');
  const v = asegurarVentana();
  const elegida = idDeLista((leerConfig().musica || {}).porDefecto);
  const lista = elegida || (await buscarSupermix(v)) || SUPERMIX_CONOCIDO;
  const suena = await ponerLista(v, lista);
  const nombre = elegida ? 'tu lista' : 'tu Supermix';
  return suena ? `Poniendo ${nombre}.` : `Abrí ${nombre}, pero no pude confirmar que esté sonando.`;
}

// Dónde suena: si no se dice nada (o se dice "en la PC"), es acá; si se nombra otro aparato, va por Cast.
const ES_ACA = /^(|aca|pc|la pc|esta pc|compu|la compu|computadora|la computadora|los parlantes|parlantes|auriculares|los auriculares)$/;

// Música en otro aparato de la red (Nest Hub, Home Mini, Chromecast…): se manda el video a la app de YouTube
// de ese aparato, igual que hace "Enviar a un dispositivo" desde el celu. Suena solo ahí (la PC no suena).
function fijarDestino(nombre, datos) {
  // Lo que suena en la PC se pausa: la música va a un solo lugar a la vez.
  if (ventana && !ventana.isDestroyed()) ventana.webContents.executeJavaScript("document.querySelectorAll('video,audio').forEach((m) => m.pause())").catch(() => {});
  destino = { nombre, sonando: true, ...datos };
  try { avisar(estado()); } catch {}
}
// Vuelve la tarjeta al reproductor de la PC.
function soltarDestino() { if (!destino) return; if (destino.grupo) grupo().detener().catch(() => {}); destino = null; try { avisar(estado()); } catch {} }
// El video (y la lista) que está sonando en la PC, de la dirección de YouTube Music.
function videoEnPC() {
  if (!ventana || ventana.isDestroyed()) return null;
  const url = String(ventana.webContents.getURL() || '');
  const v = /[?&]v=([\w-]{11})/.exec(url);
  return v ? { id: v[1], lista: idDeLista(url) || '' } : null;
}
// Grupos de Google Home: no aceptan YouTube; va el audio con el reproductor común (ver grupocast.js).
let grupoListo = false;
function grupo() {
  const g = require('./grupocast');
  if (!grupoListo) {
    grupoListo = true;
    const cast = require('./cast');
    g.configurar({
      ytdlp: () => require('./descargas').buscarYtdlp(),
      conectar: (d) => cast.conectar(d),
      compartir: (archivo, ip) => require('./servidor').compartirArchivo(archivo, ip),
      alCambiar: (x) => { if (destino && destino.grupo) { Object.assign(destino, x, { grupo: true }); try { avisar(estado()); } catch {} } },
    });
  }
  return g;
}
async function aGrupo(d, v) {
  const r = await grupo().tocar(d, v);
  fijarDestino(d.nombre, { cancion: v.titulo || 'Música', artista: v.canal || '', tapa: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`, grupo: true });
  return r;
}
async function reproducirEnCast(pedido, dispositivo, { delPC = null } = {}) {
  const cast = require('./cast');
  const d = await cast.resolver(dispositivo);
  const esGrupo = cast.esGrupo(d);
  if (!delPC && (!pedido || /^(mi |el |tu )?super\s*mix$/i.test(pedido))) {
    // El Supermix es una lista automática (cada cuenta tiene la suya) y la app de YouTube del aparato no arranca una lista sin un
    // video: se la pone un instante en la PC (con tu sesión de YouTube Music) para saber con qué canción empieza, y se manda eso.
    if (!(await conSesion())) throw new Error('Para mandar tu Supermix a otro aparato primero iniciá sesión en YouTube Music en la PC: Ajustes → Multimedia → Música → "Iniciar sesión".');
    const v = asegurarVentana();
    const elegida = idDeLista((leerConfig().musica || {}).porDefecto);
    const lista = elegida || (await buscarSupermix(v).catch(() => null)) || SUPERMIX_CONOCIDO;
    await ponerLista(v, lista);
    const arranque = videoEnPC();
    if (!arranque) throw new Error('No pude saber con qué canción empieza tu Supermix. Probá de nuevo en un rato.');
    return reproducirEnCast('', dispositivo, { delPC: { ...arranque, lista: arranque.lista || lista, cancion: elegida ? 'Tu lista' : 'Tu Supermix' } });
  }
  if (delPC && esGrupo) return aGrupo(d, { videoId: delPC.id, listaId: delPC.lista || '', titulo: delPC.cancion || '', canal: delPC.artista || '' });
  if (delPC) {
    const r = await cast.youtube(d.nombre, delPC.id, { lista: delPC.lista });
    fijarDestino(d.nombre, { cancion: delPC.cancion || 'Música', artista: delPC.artista || '', tapa: delPC.tapa || `https://i.ytimg.com/vi/${delPC.id}/mqdefault.jpg` });
    return r.confirmado ? `${delPC.cancion || 'La música'} en ${d.nombre}.` : cast.dichoDeYoutube(r, delPC.cancion ? `"${delPC.cancion}"` : 'la música');
  }
  const video = await buscarVideo(pedido, { soloMusica: true });
  if (esGrupo) return aGrupo(d, { videoId: video.id, titulo: video.titulo, canal: video.canal || '' });
  const r = await cast.youtube(d.nombre, video.id);
  fijarDestino(d.nombre, { cancion: video.titulo, artista: video.canal || '', tapa: video.tapa || (video.id ? `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg` : '') });
  const nombre = video.titulo.length > 70 ? pedido : video.titulo;
  return r.confirmado ? `Poniendo "${nombre}" en ${d.nombre}.` : cast.dichoDeYoutube(r, `"${nombre}"`);
}

// busqueda vacía = "poné música" a secas (Supermix, o la lista elegida en Ajustes). Con algo = esa canción/artista.
// Manda a otro aparato lo que está sonando acá (o el Supermix, si no suena nada).
async function enviarActualA(dispositivo) {
  const e = estado();
  // Lo que suena en la PC se manda tal cual (mismo video y misma lista), sin buscarlo de nuevo por el nombre.
  const actual = !destino && e && e.hay ? videoEnPC() : null;
  if (actual) return reproducirEnCast('', String(dispositivo || '').trim(), { delPC: { ...actual, cancion: e.cancion, artista: e.artista, tapa: e.tapa } });
  const que = e && e.hay ? [e.cancion, e.artista].filter(Boolean).join(' ') : '';
  return reproducirEnCast(que, String(dispositivo || '').trim());
}

async function reproducir(busqueda, dispositivo) {
  const pedido = (busqueda || '').trim();
  if (!ES_ACA.test(normalizar(dispositivo))) return reproducirEnCast(pedido, String(dispositivo).trim());
  soltarDestino();
  if (!pedido || /^(mi |el |tu )?super\s*mix$/i.test(pedido)) return ponerMusicaPorDefecto();
  const video = await buscarVideo(pedido, { soloMusica: true });
  const suena = await ponerEnlace(asegurarVentana(), `${SITIO}/watch?v=${video.id}`);
  const nombre = video.titulo.length > 70 ? pedido : video.titulo;
  return suena ? `Poniendo "${nombre}".` : `Abrí "${nombre}", pero no pude confirmar que esté sonando.`;
}

// Controles. Pausar y seguir se hacen directo sobre el reproductor de la página (así "pausá" nunca
// arranca la música por error, y "seguí" nunca la pausa). Siguiente/anterior tocan los botones de la
// barra de YouTube Music; si no se encuentran, se prueba con la tecla de medios del teclado.
const TECLAS = { siguiente: 'MediaNextTrack', anterior: 'MediaPreviousTrack' };
async function controlar(accion) {
  if (!['pausar', 'reanudar', 'alternar', 'siguiente', 'anterior'].includes(accion)) throw new Error(`Acción de música desconocida: ${accion}`);
  if (destino && destino.grupo) {
    const que = accion === 'alternar' ? (destino.sonando ? 'pausar' : 'reanudar') : accion;
    return grupo().controlar(que);
  }
  if (destino) {
    const cast = require('./cast');
    const que = accion === 'alternar' ? (destino.sonando ? 'pausar' : 'reanudar') : accion;
    const dicho = await cast.controlarYoutube(destino.nombre, que);
    if (que === 'pausar' || que === 'reanudar') { destino.sonando = que === 'reanudar'; try { avisar(estado()); } catch {} }
    else if (que === 'siguiente' || que === 'anterior') { destino.sonando = true; destino.cancion = `Sonando en ${destino.nombre}`; destino.artista = ''; destino.tapa = ''; try { avisar(estado()); } catch {} }
    return dicho;
  }
  // Play sin nada puesto: arranca la música de siempre (Supermix o la lista elegida).
  if ((!ventana || ventana.isDestroyed()) && (accion === 'alternar' || accion === 'reanudar')) return ponerMusicaPorDefecto();
  if (!ventana || ventana.isDestroyed()) throw new Error('No hay música puesta.');
  const resultado = await ventana.webContents.executeJavaScript(`(() => {
    const accion = ${JSON.stringify(accion)};
    const medio = document.querySelector('video, audio');
    if (accion === 'pausar' || accion === 'reanudar' || accion === 'alternar') {
      if (!medio) return 'sin-reproductor';
      const pausar = accion === 'pausar' || (accion === 'alternar' && !medio.paused);
      if (pausar) medio.pause(); else medio.play().catch(() => {});
      return pausar ? 'pausado' : 'sonando';
    }
    const patron = accion === 'siguiente' ? /siguiente|next/i : /anterior|previous/i;
    const boton = document.querySelector('ytmusic-player-bar .' + (accion === 'siguiente' ? 'next-button' : 'previous-button'))
      || [...document.querySelectorAll('ytmusic-player-bar [aria-label], ytmusic-player-bar [title]')].find((b) => patron.test(b.getAttribute('aria-label') || b.title || ''));
    if (!boton) return 'sin-boton';
    boton.click();
    return 'click';
  })()`).catch(() => 'sin-reproductor');
  if (resultado === 'sin-reproductor') throw new Error('No hay música puesta.');
  if (resultado === 'sin-boton') {
    ventana.webContents.sendInputEvent({ type: 'keyDown', keyCode: TECLAS[accion] });
    ventana.webContents.sendInputEvent({ type: 'keyUp', keyCode: TECLAS[accion] });
  }
  return { pausado: 'Pausado.', sonando: 'Sigo.' }[resultado] || (accion === 'siguiente' ? 'Siguiente.' : 'Anterior.');
}

// Mientras Jarvis escucha o habla, la música baja (y después vuelve a como estaba): así se entiende mejor el pedido.
function atenuar(bajar) {
  if (!ventana || ventana.isDestroyed()) return;
  ventana.webContents.executeJavaScript(`(() => {
    const medio = document.querySelector('video, audio');
    if (!medio) return;
    if (${bajar ? 'true' : 'false'}) { if (window.volumenAntesDeJarvis === undefined) window.volumenAntesDeJarvis = medio.volume; medio.volume = Math.min(medio.volume, 0.12); }
    else if (window.volumenAntesDeJarvis !== undefined) { medio.volume = window.volumenAntesDeJarvis; delete window.volumenAntesDeJarvis; }
  })()`).catch(() => {});
}

module.exports = { soltarDestino, enviarActualA, iniciarSesion, reproducir, controlar, conSesion, idDeLista, atenuar, buscarVideo, estado, alCambiar, alRitmoDe };
