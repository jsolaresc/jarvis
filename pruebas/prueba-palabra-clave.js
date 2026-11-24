// Compara la palabra clave en JavaScript contra la referencia de openWakeWord en Python.
// Uso: node pruebas/prueba-palabra-clave.js prueba.wav ref.json
const fs = require('fs');
const { chromium } = require('playwright');
const servidor = require('../src/main/servidor');

(async () => {
  const [wav, refJson] = process.argv.slice(2);
  const bytes = fs.readFileSync(wav);
  const pcm = bytes.subarray(44); // cabecera WAV estándar
  const ref = JSON.parse(fs.readFileSync(refJson, 'utf8'));
  const { url, cerrar } = await servidor.iniciarInterfaz(47900);
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  pagina.on('console', (m) => { if (m.type() === 'error') console.log('[consola]', m.text()); });
  await pagina.goto(`${url}/iconos.js`);
  await pagina.addScriptTag({ url: `${url}/vendor/ort/ort.wasm.min.js` });
  await pagina.waitForFunction(() => !!globalThis.ort);
  const resultado = await pagina.evaluate(async ({ url, base64 }) => {
    const { PalabraClave } = await import(`${url}/palabra-clave.js`);
    const binario = atob(base64);
    const datos = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) datos[i] = binario.charCodeAt(i);
    const muestras = new Int16Array(datos.buffer, 0, datos.length >> 1);
    const pc = new PalabraClave(url);
    await pc.cargar();
    const puntajes = [];
    const t0 = performance.now();
    for (let i = 0; i + 1280 <= muestras.length; i += 1280) puntajes.push(await pc.procesar(muestras.subarray(i, i + 1280)));
    return { puntajes, msPorTrozo: (performance.now() - t0) / puntajes.length };
  }, { url, base64: pcm.toString('base64') });
  await navegador.close(); cerrar();
  let peor = 0;
  for (let i = 25; i < ref.length; i++) peor = Math.max(peor, Math.abs(ref[i] - resultado.puntajes[i]));
  const detecciones = (lista) => lista.map((p, i) => (p > 0.5 ? i : -1)).filter((i) => i >= 0);
  console.log('trozos:', resultado.puntajes.length, '| ms por trozo de 80 ms:', resultado.msPorTrozo.toFixed(2));
  console.log('máximo JS:', Math.max(...resultado.puntajes).toFixed(4), '| máximo Python:', Math.max(...ref).toFixed(4));
  console.log('mayor diferencia JS vs Python:', peor.toExponential(2));
  console.log('trozos con detección JS:', detecciones(resultado.puntajes).join(','));
  console.log('trozos con detección Py:', detecciones(ref).join(','));
  process.exit(peor < 0.02 ? 0 : 1);
})();
