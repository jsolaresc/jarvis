// Cámara de seguridad: ventana oculta que prende la webcam y el micrófono solo mientras alguien mira desde el celular.
// Cada persona que mira tiene su propio grabador (WebM, VP8 + Opus) sobre el mismo flujo; los pedazos van al proceso
// principal, que los manda por la conexión del celular. Cuando no queda nadie mirando, se apagan la cámara y el micrófono.
import { idDeDispositivo } from './medios.js';

const grabadores = new Map(); // id -> MediaRecorder
let flujo = null; // { stream, video, audio }

async function conseguirFlujo({ video, audio, camara, microfono }) {
  if (flujo && (!video || flujo.video) && (!audio || flujo.audio)) return flujo.stream;
  const quiereVideo = video || (flujo && flujo.video);
  const quiereAudio = audio || (flujo && flujo.audio);
  const nuevo = await navigator.mediaDevices.getUserMedia({
    video: quiereVideo ? { deviceId: (await idDeDispositivo('videoinput', camara)) ? { exact: await idDeDispositivo('videoinput', camara) } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 20, max: 25 } } : false,
    audio: quiereAudio ? { deviceId: (await idDeDispositivo('audioinput', microfono)) ? { exact: await idDeDispositivo('audioinput', microfono) } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: true } : false,
  });
  if (flujo) flujo.stream.getTracks().forEach((t) => t.stop());
  flujo = { stream: nuevo, video: !!quiereVideo, audio: !!quiereAudio };
  return nuevo;
}
function apagarSiNadie() {
  if (grabadores.size || vigilia || !flujo) return;
  flujo.stream.getTracks().forEach((t) => t.stop());
  flujo = null;
}

window.jarvis.escuchar('camara:empezar', async (o) => {
  try {
    const stream = await conseguirFlujo(o);
    const pistas = [...(o.video ? stream.getVideoTracks() : []), ...(o.audio ? stream.getAudioTracks() : [])];
    if (!pistas.length) throw new Error(o.video ? 'No encontré la cámara.' : 'No encontré el micrófono.');
    const tipo = o.video ? (o.audio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8') : 'audio/webm;codecs=opus';
    const g = new MediaRecorder(new MediaStream(pistas), { mimeType: tipo, videoBitsPerSecond: o.calidad === 'alta' ? 1800000 : 700000, audioBitsPerSecond: 64000 });
    grabadores.set(o.id, g);
    g.ondataavailable = async (e) => { if (e.data && e.data.size) window.jarvis.enviar('camara:trozo', o.id, await e.data.arrayBuffer()); };
    g.onstop = () => { grabadores.delete(o.id); window.jarvis.enviar('camara:fin', o.id); apagarSiNadie(); };
    g.start(250);
    window.jarvis.enviar('camara:lista', o.id, { tipo, ancho: (stream.getVideoTracks()[0] && stream.getVideoTracks()[0].getSettings().width) || 0 });
  } catch (e) {
    window.jarvis.enviar('camara:error', o.id, e.name === 'NotAllowedError' ? 'Windows no deja usar la cámara o el micrófono (Configuración → Privacidad).' : e.name === 'NotReadableError' ? 'La cámara está ocupada por otro programa.' : e.message);
    apagarSiNadie();
  }
});
window.jarvis.escuchar('camara:parar', (id) => {
  const g = grabadores.get(id);
  if (g && g.state !== 'inactive') g.stop(); else { grabadores.delete(id); apagarSiNadie(); }
});
// ---------- Vigilar: comparar cuadros chiquitos de la webcam; si cambia bastante, avisar y grabar ----------
let vigilia = null; // { reloj, video, lienzo, anterior, grabador, quieto, ... }
const UMBRAL = { baja: 0.09, media: 0.045, alta: 0.02 }; // parte de la imagen que tiene que cambiar
async function empezarVigilia(o) {
  pararVigilia();
  const stream = await conseguirFlujo({ video: true, audio: true, camara: o.camara, microfono: o.microfono }).catch(() => conseguirFlujo({ video: true, audio: false, camara: o.camara }));
  const video = document.createElement('video');
  video.muted = true; video.srcObject = new MediaStream(stream.getVideoTracks()); await video.play().catch(() => {});
  const lienzo = document.createElement('canvas'); lienzo.width = 64; lienzo.height = 36;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  const v = { video, lienzo, anterior: null, seguidas: 0, grabador: null, ultimoMovimiento: 0, empezoGrabacion: 0, o };
  vigilia = v;
  v.reloj = setInterval(() => {
    if (vigilia !== v || video.readyState < 2) return;
    ctx.drawImage(video, 0, 0, 64, 36);
    const px = ctx.getImageData(0, 0, 64, 36).data;
    const gris = new Uint8Array(64 * 36);
    for (let i = 0; i < gris.length; i++) gris[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
    if (v.anterior) {
      let cambian = 0;
      for (let i = 0; i < gris.length; i++) if (Math.abs(gris[i] - v.anterior[i]) > 28) cambian++;
      const parte = cambian / gris.length;
      // Un cambio enorme de golpe (se prendió o apagó la luz) no cuenta: tiene que ser algo que se mueve.
      const hay = parte > UMBRAL[o.sensibilidad || 'media'] && parte < 0.85;
      v.seguidas = hay ? v.seguidas + 1 : 0;
      if (v.seguidas >= 2) {
        const nuevo = Date.now() - v.ultimoMovimiento > 15000;
        v.ultimoMovimiento = Date.now();
        if (nuevo) window.jarvis.enviar('camara:movimiento', { cuando: Date.now(), parte: Math.round(parte * 100) });
        if (o.grabar && !v.grabador) grabarVigilia(v, stream);
      }
    }
    v.anterior = gris;
    // Grabando: corta cuando hace 8 s que no se mueve nada (o al minuto).
    if (v.grabador && v.grabador.state === 'recording' && (Date.now() - v.ultimoMovimiento > 8000 || Date.now() - v.empezoGrabacion > 60000)) v.grabador.stop();
  }, 400);
}
function grabarVigilia(v, stream) {
  const tipo = stream.getAudioTracks().length ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8';
  const pedazos = [];
  const g = new MediaRecorder(stream, { mimeType: tipo, videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000 });
  v.grabador = g; v.empezoGrabacion = Date.now();
  g.ondataavailable = (e) => { if (e.data && e.data.size) pedazos.push(e.data); };
  g.onstop = async () => {
    if (v.grabador === g) v.grabador = null;
    const blob = new Blob(pedazos, { type: 'video/webm' });
    if (blob.size) window.jarvis.enviar('camara:grabado', await blob.arrayBuffer(), { desde: v.empezoGrabacion, segundos: Math.round((Date.now() - v.empezoGrabacion) / 1000) });
  };
  g.start(1000);
}
function pararVigilia() {
  if (!vigilia) return;
  const v = vigilia; vigilia = null;
  clearInterval(v.reloj);
  try { if (v.grabador && v.grabador.state !== 'inactive') v.grabador.stop(); } catch {}
  try { v.video.srcObject = null; } catch {}
  apagarSiNadie();
}
window.jarvis.escuchar('camara:vigilar', async (o) => {
  if (!o || !o.activo) { pararVigilia(); return; }
  try { await empezarVigilia(o); } catch (e) { window.jarvis.enviar('camara:vigilancia', { error: e.name === 'NotAllowedError' ? 'Windows no deja usar la cámara (Configuración → Privacidad).' : e.name === 'NotReadableError' ? 'La cámara está ocupada por otro programa.' : e.message }); }
});
// Lo que dicen desde el celular, por los parlantes de la PC.
window.jarvis.escuchar('camara:sonar', (datos, tipo) => {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo || 'audio/webm' }));
  const a = new Audio(url); a.volume = 1;
  a.onended = () => URL.revokeObjectURL(url);
  a.play().catch(() => URL.revokeObjectURL(url));
});
window.jarvis.enviar('camara:hola');
