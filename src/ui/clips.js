// Ventana oculta que graba la pantalla (y el sonido) para los clips. No se ve ni hace nada sola: el proceso
// principal le dice cuándo empezar, parar o guardar lo que lleva. Ver clips.js en src/main.
//
// Cómo guarda "los últimos N segundos" sin llenar el disco: graba en pedacitos de unos 6 segundos, cada uno un
// video completo y reproducible; el proceso principal se queda solo con los últimos y, cuando se pide un clip,
// los une con ffmpeg. La pantalla se captura reducida (720p por defecto) y, si la placa de video lo permite, el
// motor de video de Chromium usa su codificador por hardware (H.264), así que casi no pesa mientras se juega.
const SEGUNDOS_POR_PEDAZO = 6;
const TAMANOS = { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440] };
const BITRATES = { '480p': 1.5e6, '720p': 3e6, '1080p': 6e6, '1440p': 10e6 };

let cfg = null;
let flujo = null; // lo que se graba: video + audio mezclado
let contexto = null;
let ganancias = { mic: null, sistema: null }; // para cambiar los volúmenes sin reiniciar la captura
let pedazo = null; // { grabador, inicio, partes }
let reloj = null;
let tipo = '';
let tieneAudio = false;
let manual = null; // grabación completa a pedido
let manualAparte = null; // si la grabación es de una ventana o un recuadro: su propia captura { cerrar }
let manualAudio = false;
let gananciasManual = { mic: null, sistema: null };
let generacion = 0;

const jarvis = window.jarvis;
const avisar = (canal, dato, binario) => jarvis.enviar(canal, dato, binario);
const falla = (mensaje) => avisar('clips:error', { mensaje });

function elegirFormato() {
  const candidatos = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return candidatos.find((c) => MediaRecorder.isTypeSupported(c)) || '';
}


const volumenDe = (v, porDefecto, tope) => (v === undefined || v === '' || v === null || !Number.isFinite(Number(v)) ? porDefecto : Math.max(0, Math.min(tope, Number(v))));

// En Ajustes el micrófono se guarda por su nombre (no por su id): hay que buscar el id acá, y solo se puede leer el nombre una vez que hay permiso.
async function abrirMicrofono(etiqueta) {
  const ajustes = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  let flujoMic = await navigator.mediaDevices.getUserMedia({ audio: ajustes });
  if (!etiqueta) return flujoMic;
  const lista = await navigator.mediaDevices.enumerateDevices();
  const d = lista.find((x) => x.kind === 'audioinput' && x.label === etiqueta) || lista.find((x) => x.kind === 'audioinput' && x.label.includes(etiqueta));
  const actual = (flujoMic.getAudioTracks()[0].getSettings() || {}).deviceId;
  if (!d || d.deviceId === actual) return flujoMic; // si no aparece (desconectado) queda el predeterminado
  try {
    const elegido = await navigator.mediaDevices.getUserMedia({ audio: { ...ajustes, deviceId: { exact: d.deviceId } } });
    flujoMic.getTracks().forEach((t) => t.stop());
    return elegido;
  } catch { return flujoMic; }
}
function mensajeDeMicrofono(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) return 'Windows no deja usar el micrófono a Jarvis: abrí Configuración → Privacidad y seguridad → Micrófono y prendé "Permitir que las aplicaciones de escritorio accedan al micrófono". Mientras tanto el clip sale sin tu voz.';
  if (e && e.name === 'NotFoundError') return 'No encuentro ningún micrófono conectado: el clip sale sin tu voz.';
  return `No pude usar el micrófono para los clips: ${e && e.message ? e.message : e}`;
}

// `aparte` = una grabación de ventana o recuadro: captura propia (a tamaño real, sin tocar la de los clips) y su propio audio.
// Devuelve { flujo, audio, cerrar }.
async function armarFlujo(c, aparte) {
  const [ancho, alto] = TAMANOS[c.calidad] || TAMANOS['720p'];
  const limites = aparte ? { frameRate: { ideal: c.fps, max: c.fps } } : { width: { max: ancho }, height: { max: alto }, frameRate: { ideal: c.fps, max: c.fps } };
  const pantalla = await navigator.mediaDevices.getDisplayMedia({
    video: limites,
    audio: c.sistema ? { suppressLocalAudioPlayback: false, restrictOwnAudio: true } : false,
  });
  const pistasAudio = [];
  const gan = { mic: null, sistema: null };
  const ctx = new AudioContext({ sampleRate: 48000 });
  if (!aparte) { ganancias = gan; contexto = ctx; }
  const destino = ctx.createMediaStreamDestination();
  // Todo pasa por un limitador antes de codificarse: sumar el juego y el micrófono puede pasar de 0 dB y el codificador lo "recorta" (suena saturado).
  const limitador = ctx.createDynamicsCompressor();
  limitador.threshold.value = -4; limitador.knee.value = 0; limitador.ratio.value = 20; limitador.attack.value = 0.002; limitador.release.value = 0.12;
  const general = ctx.createGain();
  general.gain.value = 0.92;
  general.connect(limitador).connect(destino);
  let fuentes = 0;
  if (pantalla.getAudioTracks().length) {
    const g = ctx.createGain();
    gan.sistema = g;
    g.gain.value = volumenDe(c.volumenSistema, 0.8, 2);
    ctx.createMediaStreamSource(new MediaStream([pantalla.getAudioTracks()[0]])).connect(g).connect(general);
    fuentes++;
  }
  if (c.microfono) {
    try {
      const mic = await abrirMicrofono(c.dispositivoMic);
      const g = ctx.createGain();
      gan.mic = g;
      g.gain.value = volumenDe(c.volumenMic, 1, 3);
      ctx.createMediaStreamSource(mic).connect(g).connect(general);
      fuentes++;
    } catch (e) { falla(mensajeDeMicrofono(e)); }
  }
  if (fuentes) pistasAudio.push(...destino.stream.getAudioTracks());
  const hayAudio = pistasAudio.length > 0;
  const video = pantalla.getVideoTracks()[0];
  const config = video.getSettings();
  const flujoNuevo = new MediaStream([video, ...pistasAudio]);
  if (aparte) {
    gananciasManual = gan;
    video.addEventListener('ended', () => { if (manual) avisar('clips:grabacion-cortada', {}); });
    return { flujo: flujoNuevo, audio: hayAudio, cerrar: async () => { for (const t of flujoNuevo.getTracks()) { try { t.stop(); } catch {} } try { await ctx.close(); } catch {} } };
  }
  tieneAudio = hayAudio;
  video.addEventListener('ended', () => { if (flujo) { falla('Se cortó la captura de pantalla.'); detener(); } });
  avisar('clips:captura', { captura: `${config.width}x${config.height}@${Math.round(config.frameRate || 0)}`, audio: tieneAudio, formato: tipo });
  return { flujo: flujoNuevo, audio: hayAudio };
}

function nuevoPedazo(mia) {
  if (mia !== generacion || !flujo) return null;
  const opciones = { videoBitsPerSecond: (BITRATES[cfg.calidad] || 3e6) * (cfg.fps > 30 ? 1.5 : 1), audioBitsPerSecond: (Number(cfg.audioKbps) || 128) * 1000 };
  if (tipo) opciones.mimeType = tipo;
  const grabador = new MediaRecorder(flujo, opciones);
  const p = { grabador, inicio: Date.now(), partes: [] };
  grabador.ondataavailable = (e) => { if (e.data && e.data.size) p.partes.push(e.data); };
  grabador.onstop = async () => {
    try {
      const blob = new Blob(p.partes, { type: grabador.mimeType || 'video/webm' });
      if (blob.size) avisar('clips:pedazo', { inicio: p.inicio, fin: Date.now(), audio: tieneAudio, tipo: grabador.mimeType }, await blob.arrayBuffer());
      else avisar('clips:pedazo', { inicio: p.inicio, fin: Date.now(), vacio: true });
    } catch (e) { falla(e.message); }
  };
  grabador.start();
  pedazo = p;
  return p;
}

// Corta el pedazo actual (se guarda) y sigue con uno nuevo, sin dejar hueco entre los dos.
function girar() {
  const mia = generacion;
  const vieja = pedazo;
  nuevoPedazo(mia);
  if (vieja && vieja.grabador.state !== 'inactive') vieja.grabador.stop();
  clearTimeout(reloj);
  reloj = setTimeout(girar, SEGUNDOS_POR_PEDAZO * 1000);
}

async function iniciar(c) {
  await detener();
  cfg = c;
  const mia = ++generacion;
  try {
    tipo = elegirFormato();
    flujo = (await armarFlujo(c, false)).flujo;
  } catch (e) {
    flujo = null;
    falla(e.name === 'NotAllowedError' ? 'Windows no dejó capturar la pantalla.' : `No pude empezar a capturar la pantalla: ${e.message}`);
    avisar('clips:captura', { activo: false });
    return;
  }
  if (mia !== generacion) return;
  nuevoPedazo(mia);
  reloj = setTimeout(girar, SEGUNDOS_POR_PEDAZO * 1000);
  avisar('clips:captura', { activo: true, formato: tipo });
}

async function detener() {
  generacion++;
  clearTimeout(reloj);
  if (manual) await pararManual(true);
  const p = pedazo; pedazo = null;
  if (p && p.grabador.state !== 'inactive') { p.grabador.onstop = null; try { p.grabador.stop(); } catch {} }
  if (flujo) for (const t of flujo.getTracks()) { try { t.stop(); } catch {} }
  flujo = null;
  if (contexto) { try { await contexto.close(); } catch {} contexto = null; }
  avisar('clips:captura', { activo: false });
}

// ---- Grabación completa a pedido ("empezá a grabar") ----
// Sin `aparte` graba lo mismo que los clips (la pantalla elegida en Ajustes); con `aparte` (ventana o recuadro) abre una captura propia
// de lo que el proceso principal ya dejó elegido.
async function iniciarManual(c, aparte) {
  if (manual) return;
  let fuente = flujo;
  manualAudio = tieneAudio;
  if (aparte) {
    try {
      const r = await armarFlujo(c || cfg, true);
      manualAparte = r; fuente = r.flujo; manualAudio = r.audio;
    } catch (e) { avisar('clips:grabacion-fallo', { mensaje: e.name === 'NotAllowedError' ? 'Windows no dejó capturar eso.' : `No pude empezar a grabar: ${e.message}` }); return; }
  }
  if (!fuente) { avisar('clips:grabacion-fallo', { mensaje: 'No hay captura activa.' }); return; }
  const base = aparte ? Math.max(8e6, (BITRATES[(c || cfg).calidad] || 3e6)) : (BITRATES[cfg.calidad] || 3e6);
  const opciones = { videoBitsPerSecond: base * (cfg.fps > 30 ? 1.5 : 1), audioBitsPerSecond: (Number(cfg.audioKbps) || 128) * 1000 };
  if (tipo) opciones.mimeType = tipo;
  const g = new MediaRecorder(fuente, opciones);
  manual = g;
  // Los trozos tienen que llegar en orden y el último antes del aviso de fin: se encadenan.
  let cadena = Promise.resolve();
  g.cadena = () => cadena;
  g.ondataavailable = (e) => { if (e.data && e.data.size) cadena = cadena.then(async () => avisar('clips:trozo', { audio: manualAudio, tipo: g.mimeType }, await e.data.arrayBuffer())); };
  g.start(2000);
}
function pararManual(sinAviso) {
  return new Promise((ok) => {
    const g = manual; manual = null;
    const aparte = manualAparte; manualAparte = null;
    const cerrar = () => { if (aparte) aparte.cerrar().finally(ok); else ok(); };
    if (!g || g.state === 'inactive') { cerrar(); return; }
    g.onstop = () => { g.cadena().then(() => { if (!sinAviso) avisar('clips:trozo-fin', {}); cerrar(); }); };
    g.stop();
  });
}

jarvis.escuchar('clips:orden', async ({ orden, config }) => {
  try {
    if (orden === 'iniciar') await iniciar(config);
    else if (orden === 'detener') await detener();
    else if (orden === 'volumenes') { for (const g of [ganancias, gananciasManual]) { if (g.mic) g.mic.gain.value = volumenDe(config.volumenMic, 1, 3); if (g.sistema) g.sistema.gain.value = volumenDe(config.volumenSistema, 0.8, 2); } }
    else if (orden === 'girar') { if (flujo) girar(); else avisar('clips:pedazo', { vacio: true, fin: Date.now(), inicio: Date.now() }); }
    else if (orden === 'grabar') await iniciarManual(config && config.captura, !!(config && config.aparte));
    else if (orden === 'pausar') { if (manual && manual.state === 'recording') manual.pause(); }
    else if (orden === 'seguir') { if (manual && manual.state === 'paused') manual.resume(); }
    else if (orden === 'parar') await pararManual(false);
  } catch (e) { falla(e.message); }
});
avisar('clips:lista', {});
