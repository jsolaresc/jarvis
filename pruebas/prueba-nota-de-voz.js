// Verifica que el codificador de notas de voz (PCM -> Ogg/Opus) genere un archivo válido.
// Uso: node pruebas/prueba-nota-de-voz.js entrada.wav salida.ogg
const fs = require('fs');
const { chromium } = require('playwright');
const servidor = require('../src/main/servidor');

(async () => {
  const [wav, salida] = process.argv.slice(2);
  const pcm = fs.readFileSync(wav).subarray(44);
  const { url, cerrar } = await servidor.iniciarInterfaz(47901);
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  await pagina.goto(`${url}/iconos.js`);
  const base64 = await pagina.evaluate(async ({ url, base64 }) => {
    const { pcmAOgg } = await import(`${url}/medios.js`);
    const binario = atob(base64);
    const datos = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) datos[i] = binario.charCodeAt(i);
    const ogg = new Uint8Array(await pcmAOgg(new Int16Array(datos.buffer, 0, datos.length >> 1), 16000));
    let texto = '';
    for (let i = 0; i < ogg.length; i += 8192) texto += String.fromCharCode(...ogg.subarray(i, i + 8192));
    return btoa(texto);
  }, { url, base64: pcm.toString('base64') });
  fs.writeFileSync(salida, Buffer.from(base64, 'base64'));
  await navegador.close(); cerrar();
  console.log('ogg generado:', fs.statSync(salida).size, 'bytes desde', pcm.length, 'bytes de PCM');
})().catch((e) => { console.error(e); process.exit(1); });
