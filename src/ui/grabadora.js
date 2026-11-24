// Grabadora de audio de buena calidad (24 kHz, mono) para las notas de voz y para juntar audios que entrenan una voz.
// Es aparte del micrófono de "escuchar" (que va a 16 kHz y solo sirve para entender): acá se guarda todo el audio y sale en WAV,
// que se escucha en cualquier lado y es lo que mejor sirve para entrenar.
import { idDeDispositivo } from './medios.js';

export const HZ = 24000;

// Une trozos Int16 en un WAV (cabecera de 44 bytes + datos). Devuelve un ArrayBuffer.
export function aWav(trozos, hz = HZ) {
  const muestras = trozos.reduce((n, t) => n + t.length, 0);
  const salida = new ArrayBuffer(44 + muestras * 2);
  const v = new DataView(salida);
  const texto = (pos, s) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); };
  texto(0, 'RIFF'); v.setUint32(4, 36 + muestras * 2, true); texto(8, 'WAVE');
  texto(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, hz, true); v.setUint32(28, hz * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  texto(36, 'data'); v.setUint32(40, muestras * 2, true);
  let pos = 44;
  for (const t of trozos) { for (let i = 0; i < t.length; i++, pos += 2) v.setInt16(pos, t[i], true); }
  return salida;
}

export class Grabadora {
  constructor() {
    this.flujo = null; this.contexto = null; this.trozos = []; this.muestras = 0; this.desde = 0; this.nivel = 0; this.alNivel = null;
  }

  get grabando() { return !!this.contexto; }
  get segundos() { return this.contexto ? this.muestras / HZ : 0; }

  // microfono: el nombre que se eligió en Ajustes ('' = el predeterminado).
  async iniciar({ microfono = '', alNivel = null } = {}) {
    if (this.contexto) return;
    this.trozos = []; this.muestras = 0; this.alNivel = alNivel; this.nivel = 0;
    const deviceId = await idDeDispositivo('audioinput', microfono).catch(() => null);
    try {
      // Sin cancelación de eco ni "mejoras": para una nota o para entrenar, mejor el sonido tal cual lo capta el micrófono.
      this.flujo = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      throw new Error(e.name === 'NotAllowedError' ? 'Windows no le da permiso al micrófono (Configuración > Privacidad > Micrófono).' : e.name === 'NotFoundError' ? 'No encuentro ningún micrófono.' : e.message);
    }
    this.contexto = new AudioContext({ sampleRate: HZ });
    await this.contexto.audioWorklet.addModule('grabadora-worklet.js');
    const fuente = this.contexto.createMediaStreamSource(this.flujo);
    const nodo = new AudioWorkletNode(this.contexto, 'grabadora', { numberOfOutputs: 1 });
    const mudo = this.contexto.createGain(); mudo.gain.value = 0;
    fuente.connect(nodo).connect(mudo).connect(this.contexto.destination);
    nodo.port.onmessage = (e) => {
      const t = e.data;
      this.trozos.push(t); this.muestras += t.length;
      let suma = 0;
      for (let i = 0; i < t.length; i += 4) suma += t[i] * t[i];
      this.nivel = Math.min(1, Math.sqrt(suma / (t.length / 4)) / 9000);
      if (this.alNivel) this.alNivel(this.nivel, this.segundos);
    };
    this.desde = Date.now();
  }

  // Corta y devuelve { wav: ArrayBuffer, segundos, pico } (pico: lo más fuerte que se grabó, de 0 a 1; casi 0 = no se oyó nada).
  async detener() {
    const trozos = this.trozos; const segundos = this.muestras / HZ;
    await this.liberar();
    let pico = 0;
    for (const t of trozos) for (let i = 0; i < t.length; i += 7) pico = Math.max(pico, Math.abs(t[i]));
    return { wav: aWav(trozos, HZ), segundos, pico: pico / 32768 };
  }

  async cancelar() { this.trozos = []; await this.liberar(); }

  async liberar() {
    try { if (this.flujo) this.flujo.getTracks().forEach((t) => t.stop()); } catch {}
    try { if (this.contexto) await this.contexto.close(); } catch {}
    this.flujo = null; this.contexto = null; this.muestras = 0; this.alNivel = null;
  }
}

// Le saca los últimos `segundos` a un WAV de esta grabadora (cuando se paró hablando, para que no quede "parar la nota" al final).
export function recortarFinal(wav, segundos, hz = HZ) {
  const quitar = Math.round(segundos * hz) * 2;
  const datos = wav.byteLength - 44;
  if (quitar <= 0 || quitar >= datos) return wav;
  const nuevo = wav.slice(0, wav.byteLength - quitar);
  const v = new DataView(nuevo);
  v.setUint32(4, nuevo.byteLength - 8, true);
  v.setUint32(40, nuevo.byteLength - 44, true);
  return nuevo;
}
