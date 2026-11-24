// Palabra clave "Hey Jarvis" con openWakeWord, corriendo 100% local (onnxruntime en WebAssembly).
// Es el mismo proceso que la versión en Python: audio -> espectrograma mel -> "embeddings" -> clasificador.
const TROZO = 1280; // 80 ms a 16 kHz
const SOLAPE = 480; // muestras anteriores que necesita el espectrograma para no perder cuadros
const CUADROS = 76; // cuadros mel que mira cada embedding
const VENTANA = 16; // embeddings que mira el clasificador (~1,3 s)

export class PalabraClave {
  constructor(base = '') {
    this.base = base;
    this.lista = false;
  }

  async cargar() {
    const ort = globalThis.ort;
    if (!ort) throw new Error('No se cargó onnxruntime.');
    ort.env.wasm.wasmPaths = `${this.base}/vendor/ort/`;
    ort.env.wasm.numThreads = 1;
    const abrir = (nombre) => ort.InferenceSession.create(`${this.base}/modelos/${nombre}`, { executionProviders: ['wasm'] });
    [this.mel, this.embedding, this.clasificador] = await Promise.all([
      abrir('melspectrogram.onnx'), abrir('embedding_model.onnx'), abrir('hey_jarvis_v0.1.onnx'),
    ]);
    this.ort = ort;
    this.reiniciar();
    this.lista = true;
  }

  reiniciar() {
    this.cola = null; // últimas 480 muestras del trozo anterior
    this.cuadros = []; // espectrograma: un Float32Array(32) por cuadro
    for (let i = 0; i < CUADROS; i++) this.cuadros.push(new Float32Array(32).fill(1));
    this.rasgos = []; // embeddings: Float32Array(96)
    this.vistos = 0;
  }

  // Recibe un Int16Array de 1280 muestras y devuelve la confianza (0 a 1) de que se dijo "Hey Jarvis".
  async procesar(trozo) {
    const ort = this.ort;
    // 1) Espectrograma del trozo nuevo (más el solape con el anterior).
    const n = this.cola ? SOLAPE + TROZO : TROZO;
    const audio = new Float32Array(n);
    if (this.cola) audio.set(this.cola, 0);
    for (let i = 0; i < TROZO; i++) audio[n - TROZO + i] = trozo[i];
    this.cola = audio.slice(n - SOLAPE);
    const salidaMel = await this.mel.run({ [this.mel.inputNames[0]]: new ort.Tensor('float32', audio, [1, n]) });
    const mel = salidaMel[this.mel.outputNames[0]].data;
    for (let i = 0; i + 32 <= mel.length; i += 32) {
      const cuadro = new Float32Array(32);
      for (let j = 0; j < 32; j++) cuadro[j] = mel[i + j] / 10 + 2;
      this.cuadros.push(cuadro);
    }
    if (this.cuadros.length > 400) this.cuadros.splice(0, this.cuadros.length - 400);

    // 2) Embedding de los últimos 76 cuadros.
    const entrada = new Float32Array(CUADROS * 32);
    const desde = this.cuadros.length - CUADROS;
    for (let i = 0; i < CUADROS; i++) entrada.set(this.cuadros[desde + i], i * 32);
    const salidaEmb = await this.embedding.run({ [this.embedding.inputNames[0]]: new ort.Tensor('float32', entrada, [1, CUADROS, 32, 1]) });
    this.rasgos.push(Float32Array.from(salidaEmb[this.embedding.outputNames[0]].data));
    if (this.rasgos.length > VENTANA) this.rasgos.shift();
    this.vistos++;

    // 3) Clasificador sobre los últimos 16 embeddings. Hasta llenar la ventana no opina.
    if (this.rasgos.length < VENTANA || this.vistos < VENTANA + 5) return 0;
    const ventana = new Float32Array(VENTANA * 96);
    for (let i = 0; i < VENTANA; i++) ventana.set(this.rasgos[i], i * 96);
    const salida = await this.clasificador.run({ [this.clasificador.inputNames[0]]: new ort.Tensor('float32', ventana, [1, VENTANA, 96]) });
    return salida[this.clasificador.outputNames[0]].data[0];
  }
}
