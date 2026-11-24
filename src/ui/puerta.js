// Puerta de audio para el detector "Hey Jarvis": en silencio no hace falta correr los modelos (gastaban ~8 % de un núcleo
// las 24 horas). La puerta mide el volumen de cada trozo de 80 ms contra el ruido de fondo de la habitación (que va
// aprendiendo sola); si sube, se abre y deja pasar el audio. Para no perder el principio de la frase guarda los últimos
// ~2 s y los entrega junto con el trozo que la abrió; y una vez abierta sigue abierta un rato después del último ruido.
const SALTEAR = 4; // para medir el volumen alcanza con mirar una de cada 4 muestras

export class Puerta {
  constructor({ preroll = 24, colaMs = 2500, minimo = 100, factor = 2.2 } = {}) {
    this.preroll = preroll; // cuántos trozos (80 ms cada uno) guarda de antes de que suene algo
    this.colaMs = colaMs; // cuánto sigue abierta después del último ruido
    this.minimo = minimo; // volumen mínimo para abrir (en escala de 16 bits)
    this.factor = factor; // cuántas veces el ruido de fondo hace falta para abrir
    this.piso = null; // ruido de fondo medido
    this.abierta = false;
    this.hasta = 0;
    this.guardados = [];
    this.pasaron = 0; // trozos que dejó pasar (para medir cuánto ahorra)
    this.vistos = 0;
  }

  volumen(trozo) {
    let suma = 0;
    let n = 0;
    for (let i = 0; i < trozo.length; i += SALTEAR) { suma += trozo[i] * trozo[i]; n++; }
    return n ? Math.sqrt(suma / n) : 0;
  }

  // Devuelve { trozos: [...a procesar, en orden], reiniciar: true si el detector tiene que empezar de cero }.
  entrar(trozo, ahora = Date.now()) {
    this.vistos++;
    const v = this.volumen(trozo);
    if (this.piso === null) this.piso = v;
    const umbral = Math.max(this.minimo, this.piso * this.factor);
    if (v > umbral) {
      this.hasta = ahora + this.colaMs;
      if (!this.abierta) {
        this.abierta = true;
        const trozos = [...this.guardados, trozo];
        this.guardados = [];
        this.pasaron += trozos.length;
        return { trozos, reiniciar: true };
      }
    }
    if (this.abierta) {
      if (ahora <= this.hasta) { this.pasaron++; return { trozos: [trozo], reiniciar: false }; }
      this.abierta = false; // se calló hace rato: se cierra
    }
    // Cerrada: aprende el ruido de fondo (despacio, y sin dejar que un ruido fuerte lo suba de golpe) y guarda el trozo por si empieza una frase.
    this.piso = this.piso * 0.97 + Math.min(v, this.piso * 1.5 + 5) * 0.03;
    this.guardados.push(trozo.slice());
    if (this.guardados.length > this.preroll) this.guardados.shift();
    return { trozos: [], reiniciar: false };
  }
}
