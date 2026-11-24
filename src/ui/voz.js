// Audio del notch: micrófono siempre atento a la palabra clave, envío del audio al proceso principal
// cuando hay conversación (ahí se pasa a texto, en esta misma PC), y reproducción de la voz de Jarvis.
import { PalabraClave } from './palabra-clave.js';
import { Puerta } from './puerta.js';
import { idDeDispositivo } from './medios.js';
import { tocar } from './sonidos.js';

export class Voz {
  // eventos: { alDespertar(), alNivel(0..1, 'mic'|'voz'), alError(texto) }
  constructor(eventos) {
    this.eventos = eventos;
    this.config = { palabraClave: true, umbral: 0.5, porTranscripcion: true, microfono: '' };
    this.transmitir = false; // hay conversación abierta: el audio va al proceso principal
    this.despiertaHasta = 0; // margen entre que detecta la palabra y el cerebro confirma
    this.ignorarHasta = 0;
    this.grabacion = null;
    this.fuentes = new Set();
    this.proximo = 0;
    this.cadena = Promise.resolve();
    this.atraso = 0;
    this.palabra = new PalabraClave('');
    this.puerta = new Puerta();
  }

  async iniciar(config) {
    this.config = { ...this.config, ...config };
    this.salida = new AudioContext({ sampleRate: 24000 });
    this.analizador = this.salida.createAnalyser();
    this.analizador.fftSize = 256;
    this.ganancia = this.salida.createGain(); // volumen de la voz de Jarvis, independiente del resto de la PC
    this.analizador.connect(this.ganancia);
    this.ganancia.connect(this.salida.destination);
    this.medirVoz();
    // El detector "Hey Jarvis" se carga unos segundos después de abrir, para no sumarse a la carga de los modelos de voz.
    setTimeout(() => this.palabra.cargar().catch((e) => this.eventos.alError(`No pude cargar la palabra clave: ${e.message}`)), this.config.cargaPalabraMs ?? 10000);
    await this.abrirMicrofono();
  }

  async reconfigurar(config) {
    const cambioMic = config.microfono !== this.config.microfono;
    this.config = { ...this.config, ...config };
    if (cambioMic) await this.abrirMicrofono();
  }

  // 1 = normal; no afecta al resto de la PC, solo a lo que suena por acá.
  fijarVolumen(v) {
    if (this.ganancia) this.ganancia.gain.value = Math.max(0, Number(v) || 1);
  }

  async abrirMicrofono() {
    try {
      if (this.flujo) this.flujo.getTracks().forEach((t) => t.stop());
      if (this.entrada) await this.entrada.close().catch(() => {});
      const deviceId = await idDeDispositivo('audioinput', this.config.microfono);
      this.flujo = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        },
      });
      this.entrada = new AudioContext({ sampleRate: 16000 });
      await this.entrada.audioWorklet.addModule('mic-worklet.js');
      const fuente = this.entrada.createMediaStreamSource(this.flujo);
      const captura = new AudioWorkletNode(this.entrada, 'captura', { numberOfOutputs: 1 });
      const mudo = this.entrada.createGain();
      mudo.gain.value = 0;
      fuente.connect(captura).connect(mudo).connect(this.entrada.destination);
      captura.port.onmessage = (e) => this.alTrozo(e.data);
      this.microfonoListo = true;
    } catch (e) {
      this.microfonoListo = false;
      const motivo = e.name === 'NotAllowedError' ? 'Windows no le da permiso (Configuración > Privacidad > Micrófono)'
        : e.name === 'NotFoundError' ? 'no encuentro ningún micrófono' : e.message;
      this.eventos.alError(`No puedo usar el micrófono: ${motivo}.`);
    }
  }

  alTrozo(trozo) {
    if (this.grabacion) this.grabacion.push(trozo);
    const enviando = this.transmitir || Date.now() < this.despiertaHasta;
    if (enviando) {
      let suma = 0;
      for (let i = 0; i < trozo.length; i += 8) suma += trozo[i] * trozo[i];
      this.eventos.alNivel(Math.min(1, Math.sqrt(suma / (trozo.length / 8)) / 6000), 'mic');
      window.jarvis.enviar('voz:audio', trozo.buffer);
      return;
    }
    // Para entender "Jarvis" con cualquier acento: el audio va al proceso principal, que lo pasa a
    // texto en esta misma PC y mira si lo nombran. (Es aparte del detector clásico de "Hey Jarvis".)
    if (this.config.porTranscripcion && !this.grabacion && Date.now() > this.ignorarHasta) window.jarvis.enviar('voz:vigilia', trozo.buffer);
    // El detector clásico corre siempre que haga falta: para despertar por sí solo (si está tildado) o
    // para darle una pista a la detección por texto (ver cerebro.js).
    // Con otro nombre que no sea "Jarvis" (pista === false) el detector clásico no sirve ni como pista: no se corre.
    if ((!this.config.palabraClave && !(this.config.porTranscripcion && this.config.pista !== false)) || !this.palabra.lista || this.grabacion || this.atraso > 12) return;
    // En silencio el detector duerme (ver puerta.js); apenas suena algo, procesa lo guardado de los últimos ~2 s y sigue en vivo.
    // Con "ahorro" apagado (Ajustes → Escucha) corre siempre, como antes.
    const paso = this.config.ahorro === false ? { trozos: [trozo], reiniciar: false } : this.puerta.entrar(trozo);
    if (!paso.trozos.length) return;
    // Las inferencias van en fila para no mezclar el orden del audio.
    this.atraso++;
    this.cadena = this.cadena.then(async () => {
      try {
        if (paso.reiniciar) this.palabra.reiniciar();
        for (const t of paso.trozos) {
          const confianza = await this.palabra.procesar(t);
          if (this.config.porTranscripcion && confianza >= 0.012 && !this.transmitir) window.jarvis.enviar('voz:pista', confianza);
          if (this.config.palabraClave && confianza >= this.config.umbral && Date.now() > this.ignorarHasta && !this.transmitir) {
            this.ignorarHasta = Date.now() + 2500;
            this.despiertaHasta = Date.now() + 4000;
            this.eventos.alDespertar();
          }
        }
      } catch (e) { console.error(e); } finally { this.atraso--; }
    });
  }

  // El cerebro avisa si hay conversación abierta.
  fijarConversacion(activa) {
    if (this.transmitir && !activa) { this.ignorarHasta = Date.now() + 1500; this.despiertaHasta = 0; }
    this.transmitir = activa;
  }

  // ---- Salida ----
  // hz: a cuántas muestras por segundo viene el audio (cada voz tiene la suya; el navegador lo adapta).
  reproducir(pcm, hz = 24000) {
    const bytes = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
    const muestras = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + (bytes.byteLength & ~1)));
    if (!muestras.length) return;
    const bufer = this.salida.createBuffer(1, muestras.length, hz);
    const canal = bufer.getChannelData(0);
    for (let i = 0; i < muestras.length; i++) canal[i] = muestras[i] / 32768;
    const fuente = this.salida.createBufferSource();
    fuente.buffer = bufer;
    fuente.connect(this.analizador);
    this.proximo = Math.max(this.proximo, this.salida.currentTime + 0.06);
    fuente.start(this.proximo);
    this.proximo += bufer.duration;
    this.fuentes.add(fuente);
    fuente.onended = () => this.fuentes.delete(fuente);
    if (this.salida.state === 'suspended') this.salida.resume();
  }

  cortar() {
    for (const f of this.fuentes) { try { f.stop(); } catch {} }
    this.fuentes.clear();
    this.proximo = 0;
  }

  // Dos notitas para avisar que empezó a escuchar (o, al revés, que terminó de grabar).
  campanita(bajando = false) {
    const ahora = this.salida.currentTime;
    const notas = bajando ? [880, 660] : [660, 880];
    notas.forEach((frecuencia, i) => {
      const o = this.salida.createOscillator();
      const g = this.salida.createGain();
      o.type = 'sine';
      o.frequency.value = frecuencia;
      const t = ahora + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g).connect(this.salida.destination);
      o.start(t);
      o.stop(t + 0.18);
    });
    if (this.salida.state === 'suspended') this.salida.resume();
  }

  // Un sonido de notificación elegido en Ajustes (ver sonidos.js).
  sonido(id) { tocar(this.salida, id); }

  medirVoz() {
    const datos = new Uint8Array(this.analizador.fftSize);
    const medir = () => {
      if (this.fuentes.size) {
        this.analizador.getByteTimeDomainData(datos);
        let pico = 0;
        for (let i = 0; i < datos.length; i++) pico = Math.max(pico, Math.abs(datos[i] - 128));
        this.eventos.alNivel(Math.min(1, pico / 70), 'voz');
      }
      setTimeout(medir, 50);
    };
    medir();
  }

  // Graba del micrófono durante unos segundos y devuelve el PCM (16 kHz, 16 bits).
  async grabar(segundos) {
    if (!this.microfonoListo) throw new Error('El micrófono no está disponible.');
    this.grabacion = [];
    await new Promise((r) => setTimeout(r, segundos * 1000));
    const trozos = this.grabacion;
    this.grabacion = null;
    const total = new Int16Array(trozos.reduce((n, t) => n + t.length, 0));
    let pos = 0;
    for (const t of trozos) { total.set(t, pos); pos += t.length; }
    return total;
  }

  // Graba hasta que dejes de hablar (para una nota de voz): espera a que empieces (hasta `espera` ms), y corta cuando hay
  // `silencio` ms de calma después de hablar o al llegar al máximo. Devuelve { pcm, hablo }.
  async grabarHastaCallar({ max = 60, silencio = 1500, espera = 7000 } = {}) {
    if (!this.microfonoListo) throw new Error('El micrófono no está disponible.');
    this.grabacion = [];
    const t0 = Date.now();
    let visto = 0; let piso = 0; let muestrasPiso = 0; let hablo = false; let ultimaVoz = 0;
    const rms = (t) => { let a = 0; for (let i = 0; i < t.length; i++) a += t[i] * t[i]; return Math.sqrt(a / Math.max(1, t.length)); };
    for (;;) {
      await new Promise((r) => setTimeout(r, 80));
      const ahora = Date.now();
      const trozos = this.grabacion || [];
      for (; visto < trozos.length; visto++) {
        const nivel = rms(trozos[visto]);
        if (ahora - t0 < 450) { piso = Math.max(piso, nivel); muestrasPiso++; continue; } // el ruido de fondo del principio
        if (nivel > Math.max(piso * 2.5, 450)) { hablo = true; ultimaVoz = ahora; }
      }
      if (hablo && ahora - ultimaVoz > silencio) break;
      if (!hablo && ahora - t0 > espera) break;
      if (ahora - t0 > max * 1000) break;
    }
    const trozos = this.grabacion || [];
    this.grabacion = null;
    const pcm = new Int16Array(trozos.reduce((n, t) => n + t.length, 0));
    let pos = 0;
    for (const t of trozos) { pcm.set(t, pos); pos += t.length; }
    return { pcm, hablo };
  }
}
