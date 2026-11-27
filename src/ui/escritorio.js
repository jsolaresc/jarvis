// Ventana oculta del escritorio remoto: captura la pantalla (y el sonido de la PC en Windows) y la manda al celular por WebRTC.
// Lo que el celular toca vuelve por el canal de datos y se le pasa a Jarvis (mouse y teclado).
const jarvis = window.jarvis;
let conexion = null; // { id, pc, flujo, canal }

// Servidores STUN públicos: solo sirven para que cada lado sepa su dirección pública (desde afuera de casa). La imagen va directo.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

async function capturar(o) {
  const alto = o.calidad === 'baja' ? 720 : 1080;
  return navigator.mediaDevices.getDisplayMedia({
    video: { height: { ideal: alto, max: alto }, frameRate: { ideal: 30, max: 30 }, cursor: 'always' },
    audio: o.audio ? { suppressLocalAudioPlayback: false } : false,
  });
}

function cortar(motivo) {
  const c = conexion; conexion = null;
  if (!c) return;
  try { c.flujo.getTracks().forEach((t) => t.stop()); } catch {}
  try { c.pc.close(); } catch {}
  jarvis.enviar('escritorio:fin', c.id, motivo || '');
}

// Más bits = texto más nítido. En casa sobra; desde afuera se cuida (WebRTC igual baja solo si la red no da).
async function ajustarCalidad(pc, o) {
  for (const s of pc.getSenders()) {
    if (!s.track || s.track.kind !== 'video') continue;
    const p = s.getParameters();
    p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
    p.encodings[0].maxBitrate = o.afuera || o.calidad === 'baja' ? 2500000 : 8000000;
    p.encodings[0].maxFramerate = 30;
    p.degradationPreference = 'maintain-resolution';
    try { await s.setParameters(p); } catch {}
  }
}

jarvis.escuchar('escritorio:oferta', async (o) => {
  if (conexion) cortar('entró otra conexión');
  let flujo;
  try { flujo = await capturar(o); } catch (e) {
    jarvis.enviar('escritorio:respuesta', o.id, { error: e.name === 'NotAllowedError' ? 'Windows no dejó capturar la pantalla.' : `No pude capturar la pantalla (${e.message}).` });
    return;
  }
  const pc = new RTCPeerConnection({ iceServers: ICE });
  conexion = { id: o.id, pc, flujo, canal: null, o };
  flujo.getVideoTracks().forEach((t) => { t.contentHint = 'detail'; pc.addTrack(t, flujo); });
  flujo.getAudioTracks().forEach((t) => pc.addTrack(t, flujo));
  flujo.getVideoTracks()[0].addEventListener('ended', () => cortar('se dejó de compartir la pantalla'));
  pc.ondatachannel = (e) => {
    const canal = e.channel;
    if (!conexion || conexion.pc !== pc) return;
    conexion.canal = canal;
    canal.onmessage = (m) => { let d; try { d = JSON.parse(m.data); } catch { return; } if (conexion && conexion.pc === pc) jarvis.enviar('escritorio:control', o.id, d); };
    canal.onopen = () => jarvis.enviar('escritorio:conectado', o.id);
    canal.onclose = () => { if (conexion && conexion.pc === pc) cortar('se cerró la conexión'); };
  };
  pc.onconnectionstatechange = () => {
    if (!conexion || conexion.pc !== pc) return;
    if (pc.connectionState === 'failed') cortar('no se pudo conectar');
    if (pc.connectionState === 'closed') cortar('');
  };
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    // Sin "trickle": se espera a tener todos los caminos posibles (o 3 s) y se manda la respuesta completa.
    await new Promise((ok) => { if (pc.iceGatheringState === 'complete') ok(); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') ok(); }); setTimeout(ok, 3000); });
    await ajustarCalidad(pc, o);
    jarvis.enviar('escritorio:respuesta', o.id, { sdp: pc.localDescription.sdp });
  } catch (e) {
    jarvis.enviar('escritorio:respuesta', o.id, { error: `No pude conectar con el celular (${e.message}).` });
    cortar('');
  }
});
jarvis.escuchar('escritorio:cortar', (id) => { if (conexion && conexion.id === id) { const c = conexion; try { if (c.canal && c.canal.readyState === 'open') c.canal.send(JSON.stringify({ t: 'fin' })); } catch {} setTimeout(() => cortar(''), 200); } });
jarvis.escuchar('escritorio:cursor', (p) => { const c = conexion; if (c && c.canal && c.canal.readyState === 'open') { try { c.canal.send(JSON.stringify({ t: 'cursor', x: p.x, y: p.y })); } catch {} } });
// Otra pantalla: se captura de nuevo y se cambia la pista sin cortar la conexión.
jarvis.escuchar('escritorio:pantalla', async ({ n, pantallas }) => {
  const c = conexion; if (!c) return;
  try {
    const nuevo = await capturar(c.o);
    const pista = nuevo.getVideoTracks()[0]; pista.contentHint = 'detail';
    const envia = c.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (envia) await envia.replaceTrack(pista);
    c.flujo.getVideoTracks().forEach((t) => t.stop());
    nuevo.getAudioTracks().forEach((t) => t.stop());
    c.flujo = new MediaStream([pista, ...c.flujo.getAudioTracks()]);
    if (c.canal && c.canal.readyState === 'open') c.canal.send(JSON.stringify({ t: 'pantalla', n, pantallas }));
  } catch {}
});
jarvis.enviar('escritorio:hola');
