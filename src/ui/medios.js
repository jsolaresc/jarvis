// Webcam y audio: sacar una foto, y convertir una grabación del micrófono en nota de voz (Ogg/Opus).

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Los dispositivos se guardan por nombre (los ids cambian); acá se traduce nombre -> id.
export async function idDeDispositivo(tipo, etiqueta) {
  if (!etiqueta) return undefined;
  const lista = await navigator.mediaDevices.enumerateDevices();
  const d = lista.find((x) => x.kind === tipo && x.label === etiqueta) || lista.find((x) => x.kind === tipo && x.label.includes(etiqueta));
  return d ? d.deviceId : undefined;
}

// Devuelve un JPEG (ArrayBuffer) de la webcam. La cámara se prende solo para la foto.
export async function sacarFoto(etiqueta) {
  const deviceId = await idDeDispositivo('videoinput', etiqueta);
  const flujo = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = flujo;
    await video.play();
    await esperar(900); // la cámara necesita un momento para ajustar la exposición
    const lienzo = document.createElement('canvas');
    lienzo.width = video.videoWidth || 1280;
    lienzo.height = video.videoHeight || 720;
    lienzo.getContext('2d').drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.9));
    return await blob.arrayBuffer();
  } finally {
    flujo.getTracks().forEach((t) => t.stop());
  }
}

// ---- Ogg/Opus ----
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    t[i] = r >>> 0;
  }
  return t;
})();
function crcOgg(bytes) {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ TABLA_CRC[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  return crc;
}

function paginaOgg(paquetes, { tipo, granulo, serie, secuencia }) {
  const segmentos = [];
  for (const p of paquetes) {
    let resto = p.length;
    while (resto >= 255) { segmentos.push(255); resto -= 255; }
    segmentos.push(resto);
  }
  const largoDatos = paquetes.reduce((n, p) => n + p.length, 0);
  const pagina = new Uint8Array(27 + segmentos.length + largoDatos);
  const vista = new DataView(pagina.buffer);
  pagina.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  pagina[5] = tipo;
  vista.setBigUint64(6, BigInt(granulo), true);
  vista.setUint32(14, serie, true);
  vista.setUint32(18, secuencia, true);
  pagina[26] = segmentos.length;
  pagina.set(segmentos, 27);
  let pos = 27 + segmentos.length;
  for (const p of paquetes) { pagina.set(p, pos); pos += p.length; }
  vista.setUint32(22, crcOgg(pagina), true);
  return pagina;
}

function armarOgg(paquetes, frecuencia, preSalto) {
  const texto = (s) => new TextEncoder().encode(s);
  const cabecera = new Uint8Array(19);
  cabecera.set(texto('OpusHead'), 0);
  const vc = new DataView(cabecera.buffer);
  cabecera[8] = 1; cabecera[9] = 1; // versión, canales
  vc.setUint16(10, preSalto, true);
  vc.setUint32(12, frecuencia, true);
  const marca = texto('Jarvis');
  const etiquetas = new Uint8Array(8 + 4 + marca.length + 4);
  etiquetas.set(texto('OpusTags'), 0);
  new DataView(etiquetas.buffer).setUint32(8, marca.length, true);
  etiquetas.set(marca, 12);

  const serie = (Math.random() * 0xffffffff) >>> 0;
  const paginas = [
    paginaOgg([cabecera], { tipo: 2, granulo: 0, serie, secuencia: 0 }),
    paginaOgg([etiquetas], { tipo: 0, granulo: 0, serie, secuencia: 1 }),
  ];
  let granulo = preSalto;
  let secuencia = 2;
  const POR_PAGINA = 25; // medio segundo de audio por página
  for (let i = 0; i < paquetes.length; i += POR_PAGINA) {
    const grupo = paquetes.slice(i, i + POR_PAGINA);
    for (const p of grupo) granulo += p.muestras48;
    const ultima = i + POR_PAGINA >= paquetes.length;
    paginas.push(paginaOgg(grupo.map((p) => p.datos), { tipo: ultima ? 4 : 0, granulo, serie, secuencia: secuencia++ }));
  }
  const total = paginas.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const p of paginas) { salida.set(p, pos); pos += p.length; }
  return salida.buffer;
}

// Convierte PCM mono de 16 bits en un archivo Ogg/Opus, el formato de las notas de voz de WhatsApp.
export async function pcmAOgg(muestras, frecuencia = 16000) {
  const paquetes = [];
  let fallo = null;
  const codificador = new AudioEncoder({
    output: (trozo) => {
      const datos = new Uint8Array(trozo.byteLength);
      trozo.copyTo(datos);
      paquetes.push({ datos, muestras48: Math.round(((trozo.duration || 20000) * 48) / 1000) });
    },
    error: (e) => { fallo = e; },
  });
  codificador.configure({ codec: 'opus', sampleRate: frecuencia, numberOfChannels: 1, bitrate: 32000 });
  const PASO = frecuencia / 50; // de a 20 ms
  for (let i = 0; i < muestras.length; i += PASO) {
    const parte = new Int16Array(PASO); // el último tramo se completa con silencio
    parte.set(muestras.subarray(i, Math.min(i + PASO, muestras.length)));
    codificador.encode(new AudioData({
      format: 's16', sampleRate: frecuencia, numberOfFrames: PASO, numberOfChannels: 1,
      timestamp: Math.round((i / frecuencia) * 1e6), data: parte,
    }));
  }
  await codificador.flush();
  codificador.close();
  if (fallo) throw fallo;
  if (!paquetes.length) throw new Error('No se pudo codificar el audio.');
  return armarOgg(paquetes, frecuencia, 312);
}
