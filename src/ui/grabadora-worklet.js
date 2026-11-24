// Junta el audio del micrófono en trozos de ~85 ms (2048 muestras, 16 bits) para la grabadora de notas de voz.
class Grabadora extends AudioWorkletProcessor {
  constructor() {
    super();
    this.trozo = new Int16Array(2048);
    this.usados = 0;
  }
  process(entradas) {
    const canal = entradas[0] && entradas[0][0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      const m = Math.max(-1, Math.min(1, canal[i]));
      this.trozo[this.usados++] = m < 0 ? m * 32768 : m * 32767;
      if (this.usados === 2048) {
        this.port.postMessage(this.trozo.slice());
        this.usados = 0;
      }
    }
    return true;
  }
}
registerProcessor('grabadora', Grabadora);
