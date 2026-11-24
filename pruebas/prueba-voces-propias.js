// Prueba del módulo de voces propias (juntar audios, armar el set, cargar la voz) y de las notas de voz.
// Hace falta ffmpeg en el PATH (o JARVIS_FFMPEG). Para la parte del .onnx se usa python con el paquete "onnx" si está instalado.
// Uso: node pruebas/prueba-voces-propias.js [carpeta-de-una-voz-piper-con-.onnx,.onnx.json,tokens.txt,espeak-ng-data]
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-voces-'));
process.env.JARVIS_DATOS = path.join(base, 'datos');
process.env.JARVIS_FFMPEG = process.env.JARVIS_FFMPEG || 'ffmpeg';
const voz = require('../src/main/vocesprop');
const notas = require('../src/main/notasvoz');
const config = require('../src/main/config');
const modelos = require('../src/main/modelos');
const comandos = require('../src/main/comandos');
const T = voz._pruebas;

let n = 0;
const ok = (nombre) => { n++; console.log(`  ok  ${nombre}`); };

// WAV de prueba: ráfagas de tono separadas por silencios (como una persona leyendo frases).
function wavDe(archivo, ráfagas, hz = 24000) {
  const trozos = [];
  for (const { seg, silencioDespues } of ráfagas) {
    const a = new Int16Array(Math.round(seg * hz));
    for (let i = 0; i < a.length; i++) a[i] = Math.round(9000 * Math.sin((2 * Math.PI * (180 + (i / hz) * 40) * i) / hz) * (0.6 + 0.4 * Math.sin(i / 900)));
    trozos.push(a, new Int16Array(Math.round(silencioDespues * hz)));
  }
  const total = trozos.reduce((s, t) => s + t.length, 0);
  const b = Buffer.alloc(44 + total * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + total * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(hz, 24); b.writeUInt32LE(hz * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(total * 2, 40);
  let p = 44; for (const t of trozos) for (const x of t) { b.writeInt16LE(x, p); p += 2; }
  fs.writeFileSync(archivo, b);
  return b;
}

(async () => {
  // ---------- guion y niveles ----------
  const g = voz.guion();
  assert.ok(g.length >= 300 && g.length <= 400, `el guion tiene ${g.length} frases`);
  assert.ok(g.every((f) => f.length > 15 && f.length < 260), 'frases de largo razonable');
  assert.strictEqual(new Set(g).size, g.length, 'no hay frases repetidas');
  ok(`guion de ${g.length} frases`);
  assert.strictEqual(T.nivelDe(5 * 60), null);
  assert.strictEqual(T.nivelDe(31 * 60).id, 'bueno');
  assert.strictEqual(T.nivelDe(130 * 60).id, 'excelente');
  ok('niveles según los minutos');
  const envio = voz.guionParaEnviar({ nombre: 'Eva' });
  assert.ok(/Eva/.test(envio) && envio.includes(g[0]) && envio.includes(g[g.length - 1]), 'el texto para enviar trae el nombre y todas las frases');
  ok('guion para enviar');

  // ---------- cortes por silencio ----------
  const sil = T.parsearSilencios('[silencedetect @ x] silence_start: 5.0\n[silencedetect @ x] silence_end: 6.2 | silence_duration: 1.2\n[silencedetect] silence_start: 11.5', 20);
  assert.deepStrictEqual(sil.map((s) => [s.inicio, s.fin]), [[5, 6.2], [11.5, 20]]);
  const tr = T.trozosDe([{ inicio: 4, fin: 5 }, { inicio: 9, fin: 10 }, { inicio: 15, fin: 16 }], 20);
  assert.ok(tr.length >= 2 && tr.every((t) => t.fin > t.inicio && t.largo <= 14.01), JSON.stringify(tr));
  ok('parseo de silencios y armado de tramos');

  // ---------- parecido y coincidencias con el guion ----------
  assert.ok(T.parecido('Hola, ¿cómo estás?', 'hola como estas') > 0.95);
  const m = T.buscarEnGuion(g[10].replace(/[,.;]/g, '').toLowerCase());
  assert.ok(m && m.n === 10, 'encuentra la frase aunque falten signos y mayúsculas');
  const cerca = g[20].split(' '); cerca[2] = 'xyz';
  assert.ok(T.buscarEnGuion(cerca.join(' ')), 'tolera una palabra mal entendida');
  assert.strictEqual(T.buscarEnGuion('el perro de mi vecino ladra todas las madrugadas sin parar'), null);
  ok('coincidencias con el guion');

  // ---------- proyecto: crear, grabar, borrar ----------
  assert.throws(() => voz.crear('   '), /nombre/i);
  const p = voz.crear('Mi voz de prueba');
  assert.strictEqual(p.id, 'mi-voz-de-prueba');
  assert.strictEqual(voz.crear('Mi voz de prueba').id, 'mi-voz-de-prueba-2');
  voz.borrar('mi-voz-de-prueba-2');
  assert.throws(() => voz.crear('Rara', { espeak: 'fr' }), /pronunciaci/i);
  const esp = voz.crear('Amigo gallego', { espeak: 'es' });
  assert.strictEqual(voz.proyecto(esp.id).espeak, 'es');
  assert.strictEqual(voz.proyecto('mi-voz-de-prueba').espeak, 'es-419');
  assert.strictEqual(voz.listar().length, 2);
  ok('crear / listar / borrar voces');

  const id = p.id;
  const unaFrase = wavDe(path.join(base, 'una.wav'), [{ seg: 0.4, silencioDespues: 0 }, { seg: 3.2, silencioDespues: 0.5 }]);
  const r1 = await voz.agregarGrabacion(id, unaFrase, { guion: 0 });
  assert.ok(r1 && fs.existsSync(path.join(voz.dirDe(id), 'clips')), 'grabó');
  let pr = voz.proyecto(id);
  assert.strictEqual(pr.clips, 1);
  assert.strictEqual(pr.guion[0].clip > 0, true, 'la frase 1 figura grabada');
  assert.strictEqual(pr.clipsLista[0].texto, g[0]);
  assert.ok(pr.clipsLista[0].segundos > 2 && pr.clipsLista[0].segundos < 4.5, `duración ${pr.clipsLista[0].segundos}`);
  const wavClip = fs.readFileSync(voz.archivoDeClip(id, pr.clipsLista[0].id));
  assert.strictEqual(wavClip.readUInt32LE(24), 22050, 'el clip queda a 22.050 Hz');
  assert.strictEqual(wavClip.readUInt16LE(22), 1, 'mono');
  // volver a grabar la misma frase la reemplaza
  await voz.agregarGrabacion(id, unaFrase, { guion: 0 });
  assert.strictEqual(voz.proyecto(id).clips, 1, 'regrabar no duplica');
  await assert.rejects(() => voz.agregarGrabacion(id, Buffer.alloc(10), { guion: 1 }), /No se grabó/);
  await assert.rejects(() => voz.agregarGrabacion(id, unaFrase, {}), /texto/i);
  ok('grabar una frase (22.050 Hz mono, reemplaza si se repite)');

  // ---------- subir audios (con transcriptor de mentira) ----------
  const frasesLeidas = [g[3], g[4], 'una frase libre que no está en el guion de ninguna manera posible'];
  let k = 0;
  const avisos = [];
  voz.configurar({ transcribir: async (pcm) => { assert.ok(pcm instanceof Int16Array && pcm.length > 16000, 'recibe PCM de 16 kHz'); return frasesLeidas[k++ % frasesLeidas.length]; }, avisar: (t) => avisos.push(t) });
  const largo = path.join(base, 'conversacion.wav');
  wavDe(largo, [{ seg: 6, silencioDespues: 0.9 }, { seg: 7, silencioDespues: 0.9 }, { seg: 6.5, silencioDespues: 1 }]);
  const mp3 = path.join(base, 'conversacion.mp3');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', largo, '-b:a', '64k', mp3]);
  const res = await voz.importarAudios(id, [mp3, path.join(base, 'no-existe.mp3')], { modo: 'auto' });
  assert.strictEqual(res.frases, 3, JSON.stringify(res));
  assert.strictEqual(res.delGuion, 2);
  pr = voz.proyecto(id);
  assert.strictEqual(pr.clips, 4);
  assert.strictEqual(pr.clipsLista.filter((c) => c.revisar).length, 1, 'la que no está en el guion queda para revisar');
  assert.ok(pr.guion[3].clip && pr.guion[4].clip, 'las del guion quedan marcadas');
  assert.ok(avisos.some((a) => a.activo) && avisos[avisos.length - 1].activo === false && /3 frases nuevas/.test(avisos[avisos.length - 1].mensaje), 'avisa el avance y el final');
  assert.strictEqual(pr.trabajo.activo, false);
  ok('subir un MP3: se corta en frases y se asigna el texto del guion');

  const revisar = pr.clipsLista.find((c) => c.revisar);
  voz.cambiarTexto(id, revisar.id, '  Texto corregido a mano.  ');
  const corregido = voz.proyecto(id).clipsLista.find((c) => c.id === revisar.id);
  assert.strictEqual(corregido.texto, 'Texto corregido a mano.');
  assert.strictEqual(corregido.revisar, false, 'corregir el texto saca la marca de revisar');
  const sacar = pr.clipsLista[0].id;
  voz.quitarClip(id, sacar);
  assert.strictEqual(voz.proyecto(id).clips, 3);
  assert.throws(() => voz.archivoDeClip(id, sacar), /ya no está/);
  ok('corregir texto y quitar frases');

  // modo libre: no mira el guion
  k = 0; voz.configurar({ transcribir: async () => g[7] });
  const libre = await voz.importarAudios(id, [largo], { modo: 'libre' });
  assert.strictEqual(libre.delGuion, 0);
  ok('modo libre: todo queda para revisar');

  // ---------- armar el set ----------
  assert.throws(() => voz.armar(id, {}), /al menos 20/);
  for (let i = 10; i < 35; i++) await voz.agregarGrabacion(id, unaFrase, { guion: i });
  const set = voz.armar(id, { calidad: 'rapido' });
  assert.strictEqual(set.epocas, 600);
  assert.ok(set.frases >= 25);
  assert.ok(set.advertencias.some((a) => /pocas/.test(a)) && set.advertencias.some((a) => /sin revisar/.test(a)), set.advertencias.join('|'));
  const dir = set.carpeta;
  const csv = fs.readFileSync(path.join(dir, 'metadata.csv'), 'utf8').trim().split('\n');
  assert.strictEqual(csv.length, set.frases);
  assert.ok(csv.every((l) => /^\d+\.wav\|[^|]+$/.test(l) && fs.existsSync(path.join(dir, 'audio', l.split('|')[0]))), 'metadata.csv coincide con audio/');
  const sh = fs.readFileSync(path.join(dir, 'entrenar.sh'), 'utf8');
  const bat = fs.readFileSync(path.join(dir, 'entrenar.bat'), 'utf8');
  assert.ok(!sh.includes('\r'), 'entrenar.sh con saltos de línea de Linux');
  assert.ok(bat.includes('\r\n') && !/[^\r]\n/.test(bat), 'entrenar.bat con saltos de línea de Windows');
  assert.ok(sh.includes('piper.train fit') && sh.includes('EPOCAS:-600}') && sh.includes('--trainer.max_epochs "$EPOCAS"') && sh.includes('es-419') && sh.includes('last.ckpt') && sh.includes('piper.train.export_onnx'), 'el script trae los comandos de Piper');
  assert.ok(/wsl/i.test(bat) && bat.includes('entrenar.sh'), 'el .bat llama a WSL');
  assert.ok(fs.readFileSync(path.join(dir, 'LEEME.txt'), 'utf8').includes('\r\n'));
  assert.strictEqual(voz.proyecto(id).armado, true);
  execFileSync('bash', ['-n', path.join(dir, 'entrenar.sh')]); // sintaxis de bash válida
  ok('armar el set: audio, metadata.csv, entrenar.sh (bash válido), entrenar.bat, LEEME');

  // ---------- tokens y metadatos con una voz Piper real ----------
  const piper = process.argv[2] || ['/tmp/jmod/vits-piper-es_AR-daniela-high'].find((d) => fs.existsSync(d));
  if (piper) {
    const onnx = fs.readdirSync(piper).find((f) => f.endsWith('.onnx'));
    const cfg = JSON.parse(fs.readFileSync(path.join(piper, `${onnx}.json`), 'utf8'));
    assert.strictEqual(T.tokensDe(cfg), fs.readFileSync(path.join(piper, 'tokens.txt'), 'utf8'), 'tokens.txt igual al que trae la voz original');
    ok('tokens.txt generado igual al de Daniela');
    // instalar: copia el .onnx de Daniela como si fuera "la voz entrenada"
    const sal = path.join(dir, 'resultado'); fs.mkdirSync(sal, { recursive: true });
    fs.copyFileSync(path.join(piper, onnx), path.join(sal, 'voz.onnx'));
    fs.copyFileSync(path.join(piper, `${onnx}.json`), path.join(sal, 'voz.onnx.json'));
    assert.strictEqual(voz.proyecto(id).resultado, true);
    const antes = voz.instalarVoz(id, { onnx: path.join(sal, 'voz.onnx') });
    assert.strictEqual(antes.voz, 'propia-mi-voz-de-prueba');
    assert.ok(/Daniela|voz Piper/.test(antes.falta), 'avisa que falta una voz Piper con los datos de espeak');
    const carpetaVoz = path.join(modelos.CARPETA, 'voces-propias', antes.id);
    assert.ok(['model.onnx', 'tokens.txt', 'model.onnx.json', 'voz.json'].every((f) => fs.existsSync(path.join(carpetaVoz, f))));
    assert.strictEqual(modelos.instalado(`voz-propia-${antes.id}`), false, 'sin datos de espeak no está lista');
    assert.ok(modelos.voces().some((v) => v.id === `propia-${antes.id}`), 'aparece en la lista de voces');
    // con los datos de espeak de una voz instalada, queda lista
    const daniela = modelos.CATALOGO['voz-daniela'];
    assert.ok(daniela, 'existe voz-daniela en el catálogo');
    fs.cpSync(piper, path.join(modelos.CARPETA, daniela.carpeta || daniela.archivo), { recursive: true });
    fs.writeFileSync(path.join(modelos.CARPETA, 'voz-daniela.listo'), 'x');
    assert.strictEqual(modelos.instalado('voz-daniela'), true);
    assert.strictEqual(modelos.instalado(`voz-propia-${antes.id}`), true);
    const rr = modelos.rutas(`voz-propia-${antes.id}`);
    assert.ok(rr && fs.existsSync(rr.modelo) && fs.existsSync(rr.tokens) && fs.existsSync(rr.datos), 'rutas listas para el sintetizador');
    ok('voz cargada: aparece en la lista y queda lista con los datos de espeak');
    // renombrar, exportar e importar la voz como paquete (para compartirla)
    const ren = voz.renombrarVoz(antes.id, '  Sofía   en serio ');
    assert.strictEqual(ren.nombre, 'Sofía en serio');
    assert.ok(modelos.voces().some((v) => v.id === `propia-${antes.id}` && /Sofía en serio/.test(v.nombre)), 'el nombre nuevo se ve en la lista de voces');
    assert.throws(() => voz.renombrarVoz(antes.id, '  '), /nombre/i);
    assert.throws(() => voz.renombrarVoz('no-existe', 'x'), /no existe/i);
    const paquete = path.join(base, 'Voz Sofía.zip');
    const ex = voz.exportarVoz(antes.id, paquete, { personalidad: 'Hablá como porteño, con lunfardo.' });
    assert.strictEqual(ex.archivos, 4);
    const zipPy = execFileSync('python3', ['-c', 'import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps(sorted(z.namelist())))', paquete], { encoding: 'utf8' });
    assert.deepStrictEqual(JSON.parse(zipPy), ['jarvis-voz.json', 'voz/model.onnx', 'voz/model.onnx.json', 'voz/tokens.txt'], 'python lee el zip');
    const imp = voz.importarPaquete(paquete);
    assert.strictEqual(imp.tipo, 'voz'); assert.strictEqual(imp.nombre, 'Sofía en serio'); assert.strictEqual(imp.personalidad, 'Hablá como porteño, con lunfardo.');
    assert.notStrictEqual(imp.id, antes.id, 'no pisa la voz que ya había');
    assert.ok(fs.readFileSync(path.join(modelos.CARPETA, 'voces-propias', imp.id, 'model.onnx')).equals(fs.readFileSync(path.join(carpetaVoz, 'model.onnx'))), 'el modelo llega igual');
    assert.ok(modelos.voces().some((v) => v.id === imp.voz));
    voz.quitarVoz(imp.id);
    assert.throws(() => voz.importarPaquete(path.join(base, 'una.wav')), /zip/i);
    const sinManifiesto = path.join(base, 'sin.zip'); require('../src/main/zip').escribirZip(sinManifiesto, [{ nombre: 'x.txt', datos: Buffer.from('hola') }]);
    assert.throws(() => voz.importarPaquete(sinManifiesto), /no es de una voz de Jarvis/);
    ok('renombrar una voz y pasarla a otra PC en un zip (modelo idéntico, personalidad incluida)');
    // metadatos protobuf: los lee python con "onnx" si está
    try {
      const salidaPy = execFileSync('python3', ['-c', 'import onnx,sys,json; m=onnx.load(sys.argv[1]); print(json.dumps({p.key:p.value for p in m.metadata_props}))', path.join(carpetaVoz, 'model.onnx')], { encoding: 'utf8' });
      const meta = JSON.parse(salidaPy);
      assert.strictEqual(meta.model_type, 'vits'); assert.strictEqual(meta.comment, 'piper'); assert.strictEqual(meta.language, 'Spanish');
      assert.strictEqual(meta.voice, 'es-419'); assert.strictEqual(meta.has_espeak, '1'); assert.strictEqual(meta.n_speakers, '1'); assert.strictEqual(meta.sample_rate, '22050');
      ok('metadatos de sherpa-onnx agregados al .onnx (leídos con python onnx)');
    } catch (e) { if (e.name === 'AssertionError') throw e; console.log(`  (no se pudo leer el .onnx con python: ${String(e.message).split('\n')[0]})`); }
    // quitar
    voz.quitarVoz(antes.id);
    assert.ok(!fs.existsSync(carpetaVoz));
    assert.strictEqual(voz.proyecto(id).voz, '');
    assert.ok(!modelos.voces().some((v) => v.id === `propia-${antes.id}`));
    ok('quitar la voz');
  } else console.log('  (sin voz Piper de ejemplo: se salteó la prueba del .onnx)');

  // ---------- respaldo de grabaciones ----------
  const respaldo = path.join(base, 'respaldo.zip');
  const antesPr = voz.proyecto(id);
  const exp = voz.exportarProyecto(id, respaldo, { personalidad: 'algo' });
  assert.ok(exp.archivos >= antesPr.clips + 3);
  const rec = voz.importarPaquete(respaldo);
  assert.strictEqual(rec.tipo, 'proyecto'); assert.notStrictEqual(rec.id, id); assert.strictEqual(rec.frases, antesPr.clips);
  const prRec = voz.proyecto(rec.id);
  assert.strictEqual(prRec.clips, antesPr.clips); assert.strictEqual(prRec.espeak, 'es-419');
  assert.deepStrictEqual(prRec.clipsLista.map((c) => [c.texto, c.guion, c.revisar]), antesPr.clipsLista.map((c) => [c.texto, c.guion, c.revisar]));
  assert.ok(fs.readFileSync(voz.archivoDeClip(rec.id, prRec.clipsLista[0].id)).equals(fs.readFileSync(voz.archivoDeClip(id, antesPr.clipsLista[0].id))), 'el audio llega igual');
  assert.strictEqual(prRec.resultado, true, 'trae también la voz entrenada si había');
  await voz.agregarGrabacion(rec.id, unaFrase, { guion: 200 });
  assert.strictEqual(voz.proyecto(rec.id).clips, antesPr.clips + 1, 'se puede seguir grabando sin pisar nada');
  // un respaldo armado a mano con nombres peligrosos no escribe afuera
  const malo = path.join(base, 'malo.zip');
  require('../src/main/zip').escribirZip(malo, [
    { nombre: 'jarvis-voz.json', datos: Buffer.from(JSON.stringify({ formato: 1, tipo: 'proyecto', nombre: 'Malo' })) },
    { nombre: 'proyecto.json', datos: Buffer.from('{"espeak":"../../x"}') },
    { nombre: 'clips.json', datos: Buffer.from(JSON.stringify([{ id: 1, archivo: '../../../afuera.wav', texto: 'x' }, { id: 2, archivo: '0002.wav', texto: 'bien' }])) },
    { nombre: 'clips/../../../afuera.wav', datos: Buffer.from('mal') }, { nombre: 'clips/0002.wav', datos: unaFrase },
  ]);
  const im2 = voz.importarPaquete(malo);
  assert.strictEqual(im2.frases, 1); assert.strictEqual(voz.proyecto(im2.id).espeak, 'es-419');
  assert.ok(!fs.existsSync(path.join(base, 'afuera.wav')) && !fs.existsSync(path.join(path.dirname(voz.RAIZ), 'afuera.wav')));
  ok('respaldo de grabaciones: va y vuelve igual, se puede seguir y no confía en nombres raros');

  // ---------- personalidad en las instrucciones de Jarvis ----------
  const cerebro = require('../src/main/cerebro');
  let c0 = config.leerConfig();
  assert.ok(!/Personalidad de la voz/.test(cerebro.instrucciones()), 'sin personalidad no agrega nada');
  config.guardarConfig({ ...c0, habla: { ...c0.habla, voz: 'propia-amigo', personalidades: { 'propia-amigo': 'Hablá como gallego, con "carallo" y "pois".', claude: 'Otra cosa.' } } });
  let ins = cerebro.instrucciones();
  assert.ok(ins.includes('Personalidad de la voz') && ins.includes('carallo') && !ins.includes('Otra cosa.'), 'usa solo la de la voz elegida');
  config.guardarConfig({ ...config.leerConfig(), habla: { ...config.leerConfig().habla, voz: 'claude' } });
  ins = cerebro.instrucciones();
  assert.ok(ins.includes('Otra cosa.') && !ins.includes('carallo'), 'cambia con la voz');
  config.guardarConfig({ ...config.leerConfig(), habla: { ...config.leerConfig().habla, personalidades: { claude: 'x'.repeat(5000) } } });
  assert.ok(cerebro.instrucciones().length < 12000, 'la personalidad se recorta');
  config.guardarConfig({ ...config.leerConfig(), habla: { ...config.leerConfig().habla, voz: 'claude', personalidades: {} } });
  ok('personalidad por voz: se suma a las instrucciones solo para la voz elegida');

  // ---------- notas de voz ----------
  config.guardarConfig({ ...config.leerConfig(), clips: { ...(config.leerConfig().clips || {}), carpeta: path.join(base, 'Captures') } });
  assert.strictEqual(notas.carpeta(), path.join(base, 'Captures', 'Notas de voz'));
  assert.ok(/^Nota de voz \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}$/.test(notas.nombreNuevo()));
  const nota = await notas.guardar(wavDe(path.join(base, 'nota.wav'), [{ seg: 2, silencioDespues: 0.2 }]), { segundos: 2.2 });
  assert.ok(fs.existsSync(nota.archivo) && nota.archivo.startsWith(notas.carpeta()));
  assert.strictEqual(path.extname(nota.archivo), nota.convertido ? '.m4a' : '.wav');
  await assert.rejects(() => notas.guardar(Buffer.alloc(5)), /No se grabó/);
  let lista = notas.listar();
  assert.strictEqual(lista.length, 1); assert.strictEqual(lista[0].segundos, 2.2);
  const nuevo = notas.renombrar(nota.archivo, 'Idea para el sábado');
  assert.ok(path.basename(nuevo).startsWith('Idea para el sábado') && fs.existsSync(nuevo));
  assert.throws(() => notas.renombrar(nuevo, 'con'), /nombre/);
  assert.throws(() => notas.renombrar(path.join(base, 'otra', 'x.wav'), 'a'), /carpeta/);
  assert.strictEqual(notas.dentroDeCarpeta(path.join(notas.carpeta(), '..', 'afuera.wav')), false);
  let enPapelera = null;
  await notas.aLaPapelera(nuevo, async (f) => { enPapelera = f; fs.rmSync(f); });
  assert.strictEqual(enPapelera, nuevo); assert.strictEqual(notas.listar().length, 0);
  ok('notas de voz: guardar, listar, renombrar, papelera, límites de carpeta');

  // ---------- comandos de voz ----------
  const frasesNota = ['grabame una nota de voz', 'grabá una nota de voz', 'nueva nota de voz', 'quiero una nota de voz', 'haceme una nota de voz'];
  for (const f of frasesNota) {
    const c = comandos.resolver(f);
    assert.deepStrictEqual(c && c.pasos, [{ tipo: 'notavoz', accion: 'grabar' }], `"${f}" -> ${JSON.stringify(c)}`);
  }
  for (const f of ['parar la nota de voz', 'terminá la nota de voz', 'guardá la nota']) {
    const c = comandos.resolver(f);
    assert.deepStrictEqual(c && c.pasos, [{ tipo: 'notavoz', accion: 'parar' }], `"${f}" -> ${JSON.stringify(c)}`);
  }
  ok('comandos de voz para grabar una nota');

  console.log(`\n${n} grupos de pruebas pasaron`);
  fs.rmSync(base, { recursive: true, force: true });
})().catch((e) => { console.error('\nFALLÓ:', e); process.exit(1); });
