// Proceso aparte que escucha y habla con modelos locales (sherpa-onnx): detecta cuándo empieza y
// termina una frase, la pasa a texto, y convierte texto en voz. Corre separado del proceso principal
// para que el notch nunca se trabe mientras piensa, y para que un problema acá no cierre Jarvis.
// Se habla con oido.js por mensajes; sirve igual lanzado por Electron (utilityProcess) o por Node.
const puerto = process.parentPort || null; // Electron
const enviar = (mensaje) => { try { if (puerto) puerto.postMessage(mensaje); else process.send(mensaje); } catch {} };
const HZ = 16000;

let sherpa = null;
let vad = null;
let reconocedor = null;
let hilos = 2;

// ---- Escucha ----
let escuchando = false;
let hablando = false; // el detector ya notó voz en esta frase
let previo = []; // lo último que entró antes de que empiece a hablar (para no comerse la primera sílaba)
let frase = []; // todo lo que entró desde que empezó a hablar

function aFlotante(pcm) {
  const enteros = pcm instanceof Int16Array ? pcm : new Int16Array(pcm.buffer || pcm, pcm.byteOffset || 0, (pcm.byteLength || 0) >> 1);
  const salida = new Float32Array(enteros.length);
  for (let i = 0; i < enteros.length; i++) salida[i] = enteros[i] / 32768;
  return salida;
}
function aEnteros(flotantes) {
  const salida = new Int16Array(flotantes.length);
  for (let i = 0; i < flotantes.length; i++) {
    const m = Math.max(-1, Math.min(1, flotantes[i]));
    salida[i] = m < 0 ? m * 32768 : m * 32767;
  }
  return salida;
}

// ---- Vigilia: fuera de una conversación, oír si alguien nombra a Jarvis ----
// Un segundo detector de voz, aparte del de la conversación, va cortando lo que se dice en frases;
// cada frase corta se pasa a texto y se le manda al proceso principal, que mira si lo nombra.
let vadVigilia = null;
let vigiliaOcupada = false;

let oidoCargado = ''; // ruta del modelo de escucha que ya está en memoria (para no recargarlo de gusto)

function cargar({ rutaVad, rutaOido, silencioMs, numHilos }) {
  if (!sherpa) sherpa = require('sherpa-onnx-node');
  hilos = Math.max(1, Number(numHilos) || 2);
  fijarEscucha(false);
  vad = rutaVad ? new sherpa.Vad({
    sileroVad: {
      model: rutaVad.modelo, threshold: 0.5, windowSize: 512,
      minSpeechDuration: 0.2, minSilenceDuration: Math.max(0.3, (Number(silencioMs) || 700) / 1000), maxSpeechDuration: 30,
    },
    sampleRate: HZ, numThreads: 1, debug: false,
  }, 60) : null;
  vadVigilia = rutaVad ? new sherpa.Vad({
    sileroVad: { model: rutaVad.modelo, threshold: 0.5, windowSize: 512, minSpeechDuration: 0.25, minSilenceDuration: 0.45, maxSpeechDuration: 12 },
    sampleRate: HZ, numThreads: 1, debug: false,
  }, 30) : null;
  const listo = () => enviar({ tipo: 'cargado', vad: !!vad, oido: !!reconocedor, version: sherpa.version });
  if (!rutaOido) { reconocedor = null; oidoCargado = ''; listo(); return; }
  if (reconocedor && oidoCargado === rutaOido.encoder) { listo(); return; }
  sherpa.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: HZ, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: rutaOido.encoder, decoder: rutaOido.decoder, joiner: rutaOido.joiner },
      tokens: rutaOido.tokens, modelType: 'nemo_transducer', numThreads: hilos, debug: false,
    },
  }).then((r) => { reconocedor = r; oidoCargado = rutaOido.encoder; listo(); }, (e) => enviar({ tipo: 'error', donde: 'cargar', mensaje: e.message }));
}

function fijarEscucha(activo) {
  if (activo && vadVigilia) vadVigilia.reset(); // empieza una conversación: la vigilia descansa
  escuchando = !!activo && !!vad;
  hablando = false;
  previo = []; frase = [];
  if (vad) vad.reset();
}

const largo = (trozos) => trozos.reduce((n, t) => n + t.length, 0);

function entraAudio(pcm) {
  if (!escuchando) return;
  const muestras = aFlotante(pcm);
  vad.acceptWaveform(muestras);
  const detectado = vad.isDetected();
  if (hablando) {
    frase.push(muestras);
  } else {
    previo.push(muestras);
    while (largo(previo) - previo[0].length > HZ * 0.5) previo.shift();
    if (detectado) { hablando = true; frase = previo; previo = []; enviar({ tipo: 'habla' }); }
  }
  const termino = !vad.isEmpty();
  if (termino || (hablando && largo(frase) > HZ * 25)) {
    // Hubo silencio suficiente después de hablar: la frase está completa.
    while (!vad.isEmpty()) vad.pop();
    const total = new Float32Array(largo(frase));
    let pos = 0;
    for (const t of frase) { total.set(t, pos); pos += t.length; }
    fijarEscucha(false);
    enviar({ tipo: 'segmento', pcm: aEnteros(total), segundos: total.length / HZ });
  } else if (hablando && !detectado) {
    // Fue un ruido corto, no una frase: seguimos esperando.
    hablando = false; previo = frase.slice(-6); frase = [];
    enviar({ tipo: 'nada' });
  }
}

// Con música sonando por los parlantes el detector de voz ve "voz" todo el tiempo (la letra de la canción): las frases
// salen largas y encimadas. Por eso, mientras hay música, (1) se aceptan frases más largas y (2) si el modelo está ocupado
// con una, la más nueva espera su turno (en vez de tirarse), porque lo último que se dijo suele ser tu "Hey Jarvis".
let conMusica = false;
let vigiliaPendiente = null;
function transcribirVigilia(muestras) {
  vigiliaOcupada = true;
  // Medio segundo de silencio adelante: al modelo le cuesta la primera sílaba si arranca en seco.
  const conAire = new Float32Array(muestras.length + HZ * 0.3);
  conAire.set(muestras, HZ * 0.3);
  const flujo = reconocedor.createStream();
  flujo.acceptWaveform({ samples: conAire, sampleRate: HZ });
  reconocedor.decodeAsync(flujo)
    .then((r) => { const texto = String(r.text || '').trim(); if (texto) enviar({ tipo: 'vigilia', texto, segundos: muestras.length / HZ }); })
    .catch(() => {})
    .finally(() => {
      vigiliaOcupada = false;
      const siguiente = vigiliaPendiente; vigiliaPendiente = null;
      if (siguiente && conMusica && !escuchando) transcribirVigilia(siguiente);
    });
}
function entraVigilia(pcm) {
  if (!vadVigilia || !reconocedor || escuchando) return;
  vadVigilia.acceptWaveform(aFlotante(pcm));
  while (!vadVigilia.isEmpty()) {
    const tramo = vadVigilia.front(false); // false: sin "buffers externos", que Electron no admite
    vadVigilia.pop();
    const muestras = tramo && tramo.samples;
    // Muy corto es un ruido; muy largo es una charla, no alguien llamando (con música, el corte del detector ya limita el largo).
    if (!muestras || muestras.length < HZ * 0.3 || (!conMusica && muestras.length > HZ * 11)) continue;
    if (vigiliaOcupada) { if (conMusica) vigiliaPendiente = muestras; continue; }
    transcribirVigilia(muestras);
  }
}

async function transcribir({ id, pcm }) {
  try {
    if (!reconocedor) throw new Error('El modelo de escucha no está cargado.');
    const inicio = Date.now();
    const flujo = reconocedor.createStream();
    flujo.acceptWaveform({ samples: aFlotante(pcm), sampleRate: HZ });
    const resultado = await reconocedor.decodeAsync(flujo);
    enviar({ tipo: 'transcripto', id, texto: String(resultado.text || '').trim(), ms: Date.now() - inicio });
  } catch (e) {
    enviar({ tipo: 'fallo', id, mensaje: e.message });
  }
}

// ---- Habla ----
const voces = new Map(); // ruta del modelo -> OfflineTts
let diciendo = 0; // id de lo que se está diciendo ahora (0 = nada); cambiarlo corta la generación

async function decir({ id, texto, voz, velocidad }) {
  diciendo = id;
  try {
    if (!sherpa) sherpa = require('sherpa-onnx-node');
    let tts = voces.get(voz.modelo);
    if (!tts) {
      // Piper (VITS) o Kokoro: el segundo trae varias voces en un solo modelo, que se eligen con "sid".
      const motor = voz.motor === 'kokoro'
        ? { kokoro: { model: voz.modelo, voices: voz.voces, tokens: voz.tokens, dataDir: voz.datos, lexicon: '', lang: voz.lang || 'es' } }
        : { vits: { model: voz.modelo, tokens: voz.tokens, dataDir: voz.datos } };
      tts = await sherpa.OfflineTts.createAsync({
        model: { ...motor, numThreads: hilos, debug: false },
        maxNumSentences: 1,
      });
      voces.clear(); // una sola voz cargada a la vez
      voces.set(voz.modelo, tts);
    }
    await tts.generateAsync({
      text: texto, sid: voz.sid || 0, speed: Math.max(0.6, Math.min(1.6, Number(velocidad) || 1)),
      // Dentro de Electron no se pueden usar "buffers externos" (lo prohíbe su motor de JavaScript):
      // sin esto, la voz falla con "TTS settlement failed" aunque el audio se haya generado bien.
      enableExternalBuffer: false,
      // Llega un pedazo por oración: se manda apenas está, así empieza a sonar antes de terminar todo.
      onProgress: (info) => {
        if (diciendo !== id) return 0;
        enviar({ tipo: 'voz', id, pcm: aEnteros(info.samples), hz: tts.sampleRate });
        return 1;
      },
    });
    enviar({ tipo: 'dicho', id, cortado: diciendo !== id });
  } catch (e) {
    enviar({ tipo: 'fallo', id, mensaje: e.message });
  } finally {
    if (diciendo === id) diciendo = 0;
  }
}

function recibir(m) {
  try {
    switch (m.tipo) {
      case 'cargar': cargar(m); break;
      case 'escuchar': fijarEscucha(m.activo); break;
      case 'audio': entraAudio(m.pcm); break;
      case 'vigilar': entraVigilia(m.pcm); break;
      case 'musica': conMusica = !!m.activo; if (!conMusica) vigiliaPendiente = null; break;
      case 'transcribir': transcribir(m); break;
      case 'decir': decir(m); break;
      case 'callar': diciendo = 0; break;
      case 'salir': process.exit(0); break;
      default: break;
    }
  } catch (e) {
    enviar({ tipo: 'error', donde: m && m.tipo, id: m && m.id, mensaje: e.message });
  }
}

if (puerto) puerto.on('message', (evento) => recibir(evento.data));
else process.on('message', recibir);
process.on('uncaughtException', (e) => enviar({ tipo: 'error', donde: 'proceso', mensaje: e.message }));
enviar({ tipo: 'vivo' });
