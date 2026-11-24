// Prueba de punta a punta con los modelos de voz DE VERDAD (los mismos que usa Jarvis):
// una voz dice un pedido, eso entra como si fuera el micrófono, el oído lo pasa a texto,
// Jarvis lo resuelve y contesta hablando. No usa internet ni ninguna clave.
// Necesita los modelos ya bajados (se bajan desde el notch la primera vez). Uso: npm run prueba-voz
const assert = require('assert');
const config = require('../src/main/config');
const modelos = require('../src/main/modelos');
const oido = require('../src/main/oido');
const acciones = require('../src/main/acciones');
const cerebro = require('../src/main/cerebro');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// De los Hz de la voz a los 16 kHz del micrófono (interpolación simple: alcanza para la prueba).
function a16k(pcm, hz) {
  const salida = new Int16Array(Math.floor((pcm.length * 16000) / hz));
  for (let i = 0; i < salida.length; i++) {
    const x = (i * hz) / 16000; const a = Math.floor(x); const b = Math.min(pcm.length - 1, a + 1);
    salida[i] = pcm[a] + (pcm[b] - pcm[a]) * (x - a);
  }
  return salida;
}

async function grabarFrase(texto, voz) {
  const trozos = []; let hz = 22050;
  await oido.decir(texto, voz, 1, (pcm, h) => { trozos.push(Int16Array.from(pcm)); hz = h; });
  const total = new Int16Array(trozos.reduce((n, t) => n + t.length, 0));
  let pos = 0; for (const t of trozos) { total.set(t, pos); pos += t.length; }
  return a16k(total, hz);
}

// Manda audio como lo manda el notch: trozos de 80 ms, con un poco de ruido de fondo y silencio alrededor.
async function porElMicrofono(frase, { antes = 0.6, despues = 1.6 } = {}) {
  const total = new Int16Array(Math.round(16000 * antes) + frase.length + Math.round(16000 * despues));
  for (let i = 0; i < total.length; i++) total[i] = (Math.random() - 0.5) * 80;
  for (let i = 0; i < frase.length; i++) total[Math.round(16000 * antes) + i] += frase[i] * 0.8;
  for (let i = 0; i + 1280 <= total.length; i += 1280) { cerebro.audio(total.slice(i, i + 1280)); await esperar(20); }
}

(async () => {
  const faltan = ['vad', 'oido'].filter((id) => !modelos.instalado(id));
  const voz = modelos.voces().map((v) => v.id).find((id) => modelos.instalado(`voz-${id}`));
  if (faltan.length || !voz) {
    console.log(`Todavía no están bajados los modelos de voz (${[...faltan, ...(voz ? [] : ['una voz'])].join(', ')}) en ${modelos.CARPETA}.\nAbrí Jarvis, pasá el mouse por el notch y tocá "Bajar"; después repetí esta prueba.`);
    process.exit(0);
  }
  const fases = []; const textos = []; let modo = 'normal'; let audioDeRespuesta = 0;
  // Solo en memoria: esta prueba no toca la configuración guardada.
  Object.assign(config.leerConfig().habla, { voz, velocidad: 1 });
  Object.assign(config.leerConfig().escucha, { motor: 'local', segundosExtra: 7 });
  acciones.configurar({ decir() {}, fijarModo: (m) => { modo = m; }, pedirAlNotch: async () => { throw new Error('sin notch'); } });
  cerebro.configurar({
    estado: (f, t) => fases.push(t ? `${f}: ${t}` : f), cortar() {}, texto: (q, t) => textos.push(`${q}: ${t}`), modo: () => 'normal',
    salida: (pcm, hz) => { audioDeRespuesta += pcm.length / 2 / hz; }, vozDeWindows: async () => {}, programas: () => [],
  });

  let t = Date.now();
  const cargado = await cerebro.preparar();
  console.log(`  ok  los modelos cargan (${Date.now() - t} ms)`, JSON.stringify({ vad: cargado.vad, oido: cargado.oido }));
  assert.ok(cargado.vad && cargado.oido);

  // 1) Lo que se dice se entiende.
  const pedidos = [
    ['Modo silencio.', /modo silencio/i],
    ['Recordame en diez minutos sacar la pizza del horno.', /(diez|10) minutos sacar la pizza/i],
    ['Apagá la tele del comedor.', /la tele del comedor/i],
  ];
  const grabados = [];
  for (const [frase, esperado] of pedidos) {
    const audio = await grabarFrase(frase, voz);
    grabados.push(audio);
    t = Date.now();
    const entendido = await cerebro.transcribir(audio);
    console.log(`  ok  entendió "${entendido}" en ${Date.now() - t} ms (se dijo: "${frase}")`);
    assert.match(entendido, esperado);
  }

  // 2) Conversación completa: se activa, escucha la frase, cambia el modo y contesta hablando.
  assert.strictEqual(await cerebro.activar(), true);
  t = Date.now();
  await porElMicrofono(grabados[0]);
  for (let i = 0; i < 200 && modo !== 'silencio'; i++) await esperar(50);
  assert.strictEqual(modo, 'silencio', `tenía que pasar a modo silencio; fases: ${fases.join(' > ')}; textos: ${textos.join(' | ')}`);
  for (let i = 0; i < 200 && cerebro.activa(); i++) await esperar(50);
  console.log(`  ok  conversación: ${textos.join(' | ')} (respuesta hablada: ${audioDeRespuesta.toFixed(1)} s de audio)`);
  assert.ok(audioDeRespuesta > 0.4, 'la respuesta se tiene que decir en voz alta');
  assert.deepStrictEqual(fases.slice(0, 7), ['escuchando', 'escuchando', 'pensando', 'pensando', 'ok', 'hablando', 'reposo']);
  assert.strictEqual(cerebro.activa(), false, 'hizo lo pedido, no preguntó nada: deja de escuchar');

  // 2a) Voces Kokoro (Dora y Alex): si el modelo está instalado, hablan en español y el oído las entiende.
  for (const id of ['dora', 'alex']) {
    if (!modelos.instalado(`voz-${id}`)) { console.log(`  --  voz ${id} no instalada: se omite`); continue; }
    const frase = 'Mañana tenés una reunión a las diez y media en la oficina.';
    const pcm = await grabarFrase(frase, id);
    const oido16 = await cerebro.transcribir(pcm);
    assert.match(String(oido16).toLowerCase(), /ma[ñn]eva.*reuni[oó]n.*media.*oficina/, `la voz ${id} no se entendió: "${oido16}"`);
    console.log(`  ok  voz ${id} (Kokoro): se entiende → "${oido16}"`);
  }

  // 2b) Sin conversación abierta: alcanza con nombrarlo, y si la frase ya trae el pedido, lo hace de una.
  const vozClara = ['davefx', 'claude'].find((id) => modelos.instalado(`voz-${id}`)) || voz;
  const porVigilia = async (frase) => {
    const total = new Int16Array(12000 + frase.length + 24000);
    for (let i = 0; i < total.length; i++) total[i] = (Math.random() - 0.5) * 80;
    for (let i = 0; i < frase.length; i++) total[12000 + i] += frase[i] * 0.8;
    for (let i = 0; i + 1280 <= total.length; i += 1280) { cerebro.vigilia(total.slice(i, i + 1280)); await esperar(15); }
  };
  modo = 'silencio'; textos.length = 0;
  await esperar(1500); // (que termine de "sonar" la respuesta anterior: mientras habla no se escucha a sí mismo)
  await porVigilia(await grabarFrase('Hola, ¿cómo andás? Todo bien por acá.', vozClara));
  await esperar(800);
  assert.strictEqual(textos.length, 0, 'una charla cualquiera no lo despierta');
  await porVigilia(await grabarFrase('Yarvis, modo normal.', vozClara));
  for (let i = 0; i < 200 && modo !== 'normal'; i++) await esperar(50);
  assert.strictEqual(modo, 'normal', `con "Jarvis, modo normal" tenía que despertarse y hacerlo; textos: ${textos.join(' | ')}`);
  console.log(`  ok  se despierta al oír su nombre y hace el pedido de la misma frase: ${textos.join(' | ')}`);
  for (let i = 0; i < 200 && cerebro.activa(); i++) await esperar(50);

  // 3) Silencio: si nadie dice nada más, la conversación se cierra sola.
  config.leerConfig().escucha.segundosExtra = 1;
  cerebro.cancelar();
  assert.strictEqual(await cerebro.activar(), true);
  await porElMicrofono(new Int16Array(0), { antes: 0, despues: 1.5 });
  await esperar(1300);
  assert.strictEqual(cerebro.activa(), false);
  console.log('  ok  sin voz, deja de escuchar sola');

  oido.apagar();
  console.log('\nvoz: todo bien');
  process.exit(0);
})().catch((e) => { console.log(`FALLA ${e.message}`); try { oido.apagar(); } catch {} process.exit(1); });
