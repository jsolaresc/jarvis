// Junta el audio del micrófono en trozos de 80 ms (1280 muestras a 16 kHz, 16 bits),
// que es lo que esperan tanto la palabra clave como el modelo de escucha.
class Captura extends AudioWorkletProcessor {
  constructor() {
    super();
    this.trozo = new Int16Array(1280);
    this.usados = 0;
  }
  process(entradas) {
    const canal = entradas[0] && entradas[0][0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      const m = Math.max(-1, Math.min(1, canal[i]));
      this.trozo[this.usados++] = m < 0 ? m * 32768 : m * 32767;
      if (this.usados === 1280) {
        this.port.postMessage(this.trozo.slice());
        this.usados = 0;
      }
    }
    return true;
  }
}
registerProcessor('captura', Captura);
