// Prueba de la puerta de audio del detector "Hey Jarvis": con la puerta tiene que detectar lo mismo que sin ella y procesar muchísimos menos trozos.
// Uso: node pruebas/prueba-puerta.js <carpeta con f0.pcm ... f4.pcm (22,05 kHz, 16 bits, voz en inglés)>
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const servidor = require('../src/main/servidor');

const carpeta = process.argv[2] || '/tmp/en-tts';
const remuestrear = (pcm, de, a) => {
  const x = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
  const n = Math.floor(x.length * a / de);
  const y = new Int16Array(n);
  for (let i = 0; i < n; i++) { const p = i * de / a; const i0 = Math.floor(p); const f = p - i0; y[i] = (x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f; }
  return y;
};
let semilla = 7;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
const ruido = (n, sd) => { const r = new Int16Array(n); for (let i = 0; i < n; i++) r[i] = Math.round((azar() + azar() + azar() + azar() - 2) * sd * 1.73); return r; };

// Línea de tiempo: [tipo, voz]. tipo 'r' = ruido (segundos), 'v' = frase.
function armar(sd) {
  const voces = [0, 1, 3, 4].map((i) => remuestrear(fs.readFileSync(path.join(carpeta, `f${i}.pcm`)), 22050, 16000));
  const partes = []; const marcas = [];
  let largo = 0;
  const poner = (a) => { partes.push(a); largo += a.length; };
  const silencio = (s) => poner(ruido(Math.round(s * 16000), sd));
  const frase = (i, esHey) => { const v = voces[i]; const mezcla = new Int16Array(v.length); const r = ruido(v.length, sd); for (let k = 0; k < v.length; k++) mezcla[k] = v[k] + r[k]; marcas.push({ desde: largo / 1280, hasta: (largo + v.length) / 1280 + 18, esHey }); poner(mezcla); };
  silencio(8); frase(0, true); silencio(9); frase(1, true); silencio(7); frase(2, false); silencio(8); frase(3, true); silencio(8);
  const todo = new Int16Array(largo); let o = 0; for (const p of partes) { todo.set(p, o); o += p.length; }
  return { todo, marcas };
}

(async () => {
  const { url, cerrar } = await servidor.iniciarInterfaz(47901);
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  pagina.on('console', (m) => { if (m.type() === 'error') console.log('[consola]', m.text()); });
  await pagina.goto(`${url}/iconos.js`);
  await pagina.addScriptTag({ url: `${url}/vendor/ort/ort.wasm.min.js` });
  await pagina.waitForFunction(() => !!globalThis.ort);
  let mal = 0;
  for (const [nombre, sd] of [['cuarto silencioso', 25], ['cuarto con ruido', 250]]) {
    const { todo, marcas } = armar(sd);
    const r = await pagina.evaluate(async ({ url, base64, marcas }) => {
      const { PalabraClave } = await import(`${url}/palabra-clave.js`);
      const { Puerta } = await import(`${url}/puerta.js`);
      const b = atob(base64); const datos = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) datos[i] = b.charCodeAt(i);
      const m = new Int16Array(datos.buffer, 0, datos.length >> 1);
      const trozos = []; for (let i = 0; i + 1280 <= m.length; i += 1280) trozos.push(m.slice(i, i + 1280));
      const maximos = (puntajes) => marcas.map((x) => Math.max(0, ...puntajes.slice(Math.floor(x.desde), Math.ceil(x.hasta))));
      // Sin puerta (como antes)
      const a = new PalabraClave(url); await a.cargar();
      const t0 = performance.now(); const pa = []; for (const t of trozos) pa.push(await a.procesar(t)); const msA = performance.now() - t0;
      // Con puerta, igual que en voz.js
      const c = new PalabraClave(url); await c.cargar();
      const puerta = new Puerta(); const pc = new Array(trozos.length).fill(0); let procesados = 0; const t1 = performance.now();
      for (let i = 0; i < trozos.length; i++) {
        const paso = puerta.entrar(trozos[i], i * 80);
        if (!paso.trozos.length) continue;
        if (paso.reiniciar) c.reiniciar();
        let ult = 0; for (const t of paso.trozos) { ult = await c.procesar(t); procesados++; }
        pc[i] = ult;
      }
      const msC = performance.now() - t1;
      return { total: trozos.length, procesados, sin: maximos(pa), con: maximos(pc), msA, msC };
    }, { url, base64: Buffer.from(todo.buffer).toString('base64'), marcas });
    console.log(`\n== ${nombre} (ruido de fondo ${sd}) ==`);
    console.log(`trozos: ${r.total} | procesados con puerta: ${r.procesados} (${(100 * r.procesados / r.total).toFixed(0)} %) | CPU: ${(r.msC / r.msA * 100).toFixed(0)} % de la de antes`);
    marcas.forEach((x, i) => {
      const bien = x.esHey ? (r.con[i] >= 0.5) === (r.sin[i] >= 0.5) : r.con[i] < 0.5;
      console.log(`frase ${i + 1} (${x.esHey ? 'Hey Jarvis' : 'otra cosa'}): sin puerta ${r.sin[i].toFixed(3)} | con puerta ${r.con[i].toFixed(3)} ${bien ? 'ok' : 'DIFIERE'}`);
      if (!bien) mal++;
    });
    if (r.procesados / r.total > 0.6 && sd < 100) { console.log('la puerta casi no ahorra'); mal++; }
  }
  await navegador.close(); cerrar();
  console.log(mal ? `\n${mal} problema(s)` : '\ntodo bien');
  process.exit(mal ? 1 : 0);
})();
