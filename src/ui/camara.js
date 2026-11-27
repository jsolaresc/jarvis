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
  if (grabadores.size || !flujo) return;
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
window.jarvis.enviar('camara:hola');
