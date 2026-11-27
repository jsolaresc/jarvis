// Pruebas de la lógica que no necesita ventana: configuración, rutinas, servidor de medios,
// números de WhatsApp, recordatorios, comandos directos, la cadena de modelos gratuitos y la
// conversación completa (con un servidor de mentira en lugar de los modelos de la nube).
// Uso: npm run prueba
const os = require('os');
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');

process.env.JARVIS_DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-prueba-'));
process.env.JARVIS_MODELOS_URL = 'http://127.0.0.1:47960';
// Los servicios de internet (clima, búsqueda) también se reemplazan por uno de mentira.
process.env.JARVIS_URL_GEO = 'http://127.0.0.1:47963/geo';
process.env.JARVIS_URL_CLIMA = 'http://127.0.0.1:47963/clima';
process.env.JARVIS_URL_CLIMA_RESPALDO = 'http://127.0.0.1:47963/met';
process.env.JARVIS_DEMORA_REINTENTO = '10';
process.env.JARVIS_URL_TAVILY = 'http://127.0.0.1:47963/tavily';
process.env.JARVIS_URL_WIKIPEDIA = 'http://127.0.0.1:47963/wikipedia';
process.env.JARVIS_URL_TMDB = 'http://127.0.0.1:47964/tmdb';
process.env.JARVIS_URL_YOUTUBE = 'http://127.0.0.1:47964/youtube';
process.env.JARVIS_URL_YOUTUBE_DATOS = 'http://127.0.0.1:47964/datos';
process.env.JARVIS_URL_MICROSOFT = 'http://127.0.0.1:47965';
process.env.JARVIS_IMAP_GMAIL = '127.0.0.1:47966';
process.env.JARVIS_IMAP_OUTLOOK = '127.0.0.1:47967';
process.env.JARVIS_SMTP_GMAIL = '127.0.0.1:47968';
process.env.JARVIS_URL_GOOGLE_TOKEN = 'http://127.0.0.1:47969/token';
process.env.JARVIS_URL_GOOGLE_API = 'http://127.0.0.1:47969/calendar/v3';
const config = require('../src/main/config');
const servidor = require('../src/main/servidor');
const whatsapp = require('../src/main/whatsapp');
const recordatorios = require('../src/main/recordatorios');
const acciones = require('../src/main/acciones');
const comandos = require('../src/main/comandos');
const pensar = require('../src/main/pensar');
const modelos = require('../src/main/modelos');
const oido = require('../src/main/oido');
const cerebro = require('../src/main/cerebro');
const internet = require('../src/main/internet');
const notificaciones = require('../src/main/notificaciones');
const correo = require('../src/main/correo');
const streaming = require('../src/main/streaming');
const cast = require('../src/main/cast');
const historial = require('../src/main/historial');

// Un servidor que se hace pasar por Groq, Gemini u Ollama: responde lo que cada prueba le indique.
function servidorFalso(puerto, responder) {
  const pedidos = [];
  const s = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; });
    req.on('end', () => {
      let json = null;
      try { json = JSON.parse(cuerpo); } catch {}
      const pedido = { ruta: req.url, metodo: req.method, json, clave: (req.headers.authorization || '').replace('Bearer ', '') };
      pedidos.push(pedido);
      const r = responder(pedido, pedidos.length) || { estado: 404, cuerpo: {} };
      res.writeHead(r.estado || 200, { 'Content-Type': 'application/json', ...(r.cabeceras || {}) });
      res.end(JSON.stringify(r.cuerpo || {}));
    });
  });
  return new Promise((ok) => s.listen(puerto, '127.0.0.1', () => ok({ pedidos, cerrar: () => new Promise((r) => { s.closeAllConnections(); s.close(r); }) })));
}
const respuesta = (mensaje) => ({ cuerpo: { choices: [{ message: { role: 'assistant', ...mensaje } }] } });
const llamada = (nombre, args) => ({ content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: nombre, arguments: JSON.stringify(args) } }] });
// Deja la configuración de inteligencia apuntando a los servidores de mentira que se pidan.
function usarIA(ia) {
  pensar.olvidar();
  const base = { orden: ['groq', 'gemini', 'ollama'], groq: { clave: '', modelo: '' }, gemini: { clave: '', modelo: '' }, ollama: { url: 'http://127.0.0.1:9', modelo: '' } };
  config.guardarConfig({ ...config.leerConfig(), ia: { ...base, ...ia } });
}

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

prueba('la configuración se completa con los valores por defecto y se guarda', () => {
  const c = config.leerConfig();
  assert.strictEqual(c.modo, 'normal');
  assert.strictEqual(c.escucha.motor, 'local');
  assert.strictEqual(c.habla.voz, 'claude');
  assert.deepStrictEqual(c.ia.orden, ['groq', 'gemini', 'ollama']);
  config.guardarConfig({ ...c, habla: { voz: 'windows' }, teles: [{ nombre: 'Tele Comedor', cast: 'Living TV' }] });
  const guardada = JSON.parse(fs.readFileSync(path.join(process.env.JARVIS_DATOS, 'config.json'), 'utf8'));
  assert.strictEqual(guardada.habla.voz, 'windows');
  assert.strictEqual(guardada.habla.velocidad, 1, 'lo que falta se completa');
});

prueba('la clave de Gemini de la versión anterior se conserva para los modelos de texto', () => {
  const c = config.guardarConfig({ ...config.leerConfig(), gemini: { apiKey: 'clave-vieja', modelo: 'gemini-3.8-live', voz: 'Charon' } });
  assert.strictEqual(c.ia.gemini.clave, 'clave-vieja');
  assert.strictEqual(c.gemini, undefined, 'lo viejo de Gemini Live ya no queda dando vueltas');
  config.guardarConfig({ ...c, ia: { ...c.ia, gemini: { clave: '', modelo: '' } } });
});

prueba('los nombres dichos por voz se encuentran sin importar acentos ni mayúsculas', () => {
  const lista = [{ nombre: 'Tele Comedor' }, { nombre: 'Mamá' }, { nombre: 'Eva' }];
  assert.strictEqual(config.buscarPorNombre(lista, 'tele comedor').nombre, 'Tele Comedor');
  assert.strictEqual(config.buscarPorNombre(lista, 'MAMA').nombre, 'Mamá');
  assert.strictEqual(config.buscarPorNombre(lista, 'la tele del comedor').nombre, 'Tele Comedor');
  assert.strictEqual(config.buscarPorNombre(lista, 'comedor').nombre, 'Tele Comedor');
  assert.strictEqual(config.buscarPorNombre(lista, 'a Eva').nombre, 'Eva');
  assert.strictEqual(config.buscarPorNombre(lista, 'Evangelina'), null, 'no confunde nombres parecidos');
  assert.strictEqual(config.buscarPorNombre(lista, 'an'), null);
  assert.strictEqual(config.buscarPorNombre([...lista, { nombre: 'Tele Cuarto' }], 'tele'), null, 'si es ambiguo no adivina');
  assert.strictEqual(config.buscarPorNombre(lista, ''), null);
});

prueba('las rutinas por defecto existen y se pueden guardar', () => {
  const r = config.leerRutinas();
  assert.ok(r.find((x) => x.id === 'modo_juego'));
  assert.ok(fs.existsSync(path.join(process.env.JARVIS_DATOS, 'rutinas.json')));
});

prueba('una rutina sigue aunque un paso falle, y cuenta qué falló', async () => {
  const dichos = [];
  let modo = null;
  acciones.configurar({ decir: (t) => dichos.push(t), fijarModo: (m) => { modo = m; }, pedirAlNotch: async () => { throw new Error('sin notch'); } });
  config.guardarRutinas([{ id: 'p', nombre: 'Prueba', pasos: [
    { tipo: 'decir', texto: 'hola' }, { tipo: 'whatsapp', contacto: 'Eva', mensaje: 'x' },
    { tipo: 'modo', modo: 'silencio' }, { tipo: 'esperar', segundos: 0 }, { tipo: 'inventado' },
  ] }]);
  const r = await acciones.ejecutarRutina('prueba');
  assert.deepStrictEqual(dichos, ['hola']);
  assert.strictEqual(modo, 'silencio');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errores.length, 2, 'falla WhatsApp (sin conectar) y el paso inventado');
  assert.match(r.errores[0], /WhatsApp no está conectado/);
  const porVoz = await acciones.ejecutarPaso({ tipo: 'decir', texto: 'hola' }, { porVoz: true });
  assert.match(porVoz, /hola/);
  assert.strictEqual(dichos.length, 1, 'por voz no lo dice aparte: va en la respuesta de la conversación');
  await assert.rejects(() => acciones.ejecutarRutina('no existe'), /No existe la rutina/);
});

prueba('música en un grupo de Google Home: baja el audio, lo manda con el reproductor común y sigue la lista sola', async () => {
  const g = require('../src/main/grupocast');
  const { EventEmitter } = require('events');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grupo-'));
  const yt = path.join(dir, 'yt-dlp');
  fs.writeFileSync(yt, `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a.includes('--flat-playlist')) { console.log(JSON.stringify({ entries: [{ id: 'AAAAAAAAAAA', title: 'Uno', channel: 'Banda' }, { id: 'BBBBBBBBBBB', title: 'Dos', channel: 'Banda' }] })); process.exit(0); }
const o = a[a.indexOf('-o') + 1]; const id = a[a.length - 1].slice(-11);
require('fs').writeFileSync(o.replace('%(id)s', id).replace('%(ext)s', 'm4a'), 'audio');
`, { mode: 0o755 });
  const cargados = [];
  const rep = Object.assign(new EventEmitter(), {
    load: (m, o, cb) => { cargados.push(m); cb(null, {}); },
    pause: (cb) => cb(null), play: (cb) => cb(null), stop: (cb) => cb(null),
  });
  const cliente = Object.assign(new EventEmitter(), { launch: (_r, cb) => cb(null, rep), close: () => {} });
  const avisos = [];
  g.configurar({ ytdlp: async () => yt, conectar: async () => cliente, compartir: async (a) => ({ url: `http://pc/${path.basename(a)}` }), alCambiar: (x) => avisos.push(x) });
  const dicho = await g.tocar({ nombre: 'Toda la casa', host: '10.0.0.9' }, { videoId: 'AAAAAAAAAAA', titulo: 'Uno', canal: 'Banda' });
  assert.match(dicho, /Toda la casa.*1 temas más/);
  assert.strictEqual(cargados[0].contentId, 'http://pc/AAAAAAAAAAA.m4a');
  assert.strictEqual(cargados[0].contentType, 'audio/mp4');
  assert.strictEqual(cargados[0].metadata.title, 'Uno');
  // Termina el tema: sigue solo con el próximo de la lista.
  rep.emit('status', { playerState: 'IDLE', idleReason: 'FINISHED' });
  await new Promise((r) => setTimeout(r, 400));
  assert.strictEqual(cargados[1] && cargados[1].metadata.title, 'Dos');
  assert.strictEqual(await g.controlar('pausar'), 'Pausado.');
  assert.ok(avisos.some((x) => x.cancion === 'Dos' && x.sonando === false));
  assert.match(await g.controlar('siguiente'), /terminó la lista/);
  assert.ok(!g.activo());
});

prueba('rutinas que se hacen solas: hora y días, juego, programa, aparato de audio, llegar y prender', async () => {
  const d = require('../src/main/disparadores');
  d._reiniciar();
  const hechas = [];
  let procesos = ['C:/Windows/explorer.exe'];
  let salidas = [{ nombre: 'Parlantes (Realtek)' }];
  let ahora = new Date(2026, 10, 27, 8, 29); // viernes
  const rutinas = [
    { id: 'manana', nombre: 'Mañana', disparadores: [{ tipo: 'hora', hora: '08:30', dias: [1, 2, 3, 4, 5] }] },
    { id: 'finde', nombre: 'Finde', disparadores: [{ tipo: 'hora', hora: '08:30', dias: [0, 6] }] },
    { id: 'cs', nombre: 'Counter', disparadores: [{ tipo: 'juego', juego: 'Counter-Strike 2', carpeta: 'D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive' }] },
    { id: 'disc', nombre: 'Discord', disparadores: [{ tipo: 'programa', proceso: 'Discord.exe' }] },
    { id: 'auris', nombre: 'Auris', disparadores: [{ tipo: 'audio', salida: 'Auriculares' }] },
    { id: 'casa', nombre: 'Casa', disparadores: [{ tipo: 'llegar' }, { tipo: 'inicio' }] },
    { id: 'nada', nombre: 'Nada', pasos: [] },
  ];
  d.configurar({ rutinas: () => rutinas, procesos: async () => procesos, salidas: async () => salidas, ahora: () => ahora, correr: async (id, motivo) => { hechas.push(`${id}: ${motivo}`); } });
  await d.vuelta(); // primera vuelta: toma nota de lo que ya estaba abierto, no hace nada
  assert.deepStrictEqual(hechas, []);
  ahora = new Date(2026, 10, 27, 8, 30);
  procesos = [...procesos, 'D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe', 'C:/Users/x/AppData/Local/Discord/app-1.0/Discord.exe'];
  salidas = [...salidas, { nombre: 'Auriculares (WH-1000XM4)' }];
  await d.vuelta();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepStrictEqual(hechas.sort(), ['auris: conectaste Auriculares', 'cs: abriste Counter-Strike 2', 'disc: abriste Discord.exe', 'manana: son las 08:30'].sort());
  // La misma vuelta otra vez no repite.
  await d.vuelta(); await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(hechas.length, 4);
  assert.deepStrictEqual(await d.evento('llegar', 'llegaste'), ['Casa']);
  assert.deepStrictEqual(await d.evento('llegar', 'llegaste'), [], 'no dos veces seguidas');
  assert.deepStrictEqual(await d.evento('inicio', 'se prendió'), ['Casa']);
  assert.strictEqual(d.describir({ tipo: 'hora', hora: '08:30', dias: [1, 2, 3, 4, 5] }), 'de lunes a viernes a las 08:30');
  assert.strictEqual(d.describir({ tipo: 'juego', juego: 'CS2' }), 'al abrir CS2');
  // Estado de la PC: procesador y memoria siempre; placa de video solo con nvidia-smi.
  const epc = require('../src/main/estadopc');
  process.env.JARVIS_NVIDIA_SMI = '/no/existe';
  const e = await epc.leer();
  assert.ok(e.cpu.uso >= 0 && e.cpu.uso <= 100 && e.ram.totalMB > 0 && e.gpu === null, JSON.stringify(e));
  delete process.env.JARVIS_NVIDIA_SMI;
});

prueba('yt-dlp: sabe si está viejo y lo avisa (también si una descarga falla por eso)', async () => {
  const descargasM = require('../src/main/descargas');
  assert.ok(descargasM.masNueva('2026.11.20', '2026.10.31'));
  assert.ok(descargasM.masNueva('2026.11.20.1', '2026.11.20'));
  assert.ok(!descargasM.masNueva('2026.11.20', '2026.11.20'));
  assert.ok(!descargasM.masNueva('2026.01.02', '2026.11.20'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-ytdlp-'));
  const falso = path.join(dir, 'yt-dlp');
  fs.writeFileSync(falso, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 2026.01.01; fi\nexit 0\n', { mode: 0o755 });
  const antes = [process.env.JARVIS_YTDLP, process.env.JARVIS_YTDLP_ULTIMA];
  process.env.JARVIS_YTDLP = falso; process.env.JARVIS_YTDLP_ULTIMA = '2026.11.20';
  try {
    await descargasM.buscarYtdlp({ olvidar: true });
    let v = await descargasM.revisarVersion({ fuerza: true });
    assert.deepStrictEqual([v.version, v.ultima, v.desactualizado], ['2026.01.01', '2026.11.20', true]);
    process.env.JARVIS_YTDLP_ULTIMA = '2026.01.01'; // al día…
    v = await descargasM.revisarVersion({ fuerza: true });
    assert.strictEqual(v.desactualizado, false);
    process.env.JARVIS_YTDLP_ULTIMA = 'error'; // …GitHub no contesta, pero una descarga falló como cuando está viejo
    assert.match(descargasM.explicar('ERROR: [youtube] abc: Unable to extract nsig'), /desactualizado/);
    v = await descargasM.revisarVersion({ fuerza: true });
    assert.ok(v.desactualizado && v.fallo);
    process.env.JARVIS_YTDLP_ULTIMA = '2026.01.01'; // GitHub dice que ya es la última: el error era otra cosa, no se insiste
    v = await descargasM.revisarVersion({ fuerza: true });
    assert.strictEqual(v.desactualizado, false);
    // Una copia que no se actualiza con "-U" (fuera de Windows) explica qué hacer.
    process.env.JARVIS_YTDLP_ULTIMA = '2026.11.20';
    await assert.rejects(descargasM.actualizar(), /instalaste/);
  } finally {
    [process.env.JARVIS_YTDLP, process.env.JARVIS_YTDLP_ULTIMA] = antes;
    if (antes[0] === undefined) delete process.env.JARVIS_YTDLP;
    if (antes[1] === undefined) delete process.env.JARVIS_YTDLP_ULTIMA;
    await descargasM.buscarYtdlp({ olvidar: true });
  }
});

prueba('los números argentinos se prueban con y sin el 9', () => {
  assert.deepStrictEqual(whatsapp.variantes('+54 9 11 2345-6789'), ['5491123456789', '541123456789']);
  assert.deepStrictEqual(whatsapp.variantes('11 2345 6789'), ['5491123456789', '541123456789']);
  assert.deepStrictEqual(whatsapp.variantes('011 2345 6789'), ['5491123456789', '541123456789']);
  assert.deepStrictEqual(whatsapp.variantes('+1 415 555 0100'), ['14155550100']);
  assert.deepStrictEqual(whatsapp.variantes(''), []);
});

prueba('los recordatorios aceptan minutos u hora, y suenan cuando vencen', async () => {
  const texto = recordatorios.crear({ texto: 'sacar la pizza', minutos: 10 });
  assert.match(texto, /sacar la pizza/);
  recordatorios.crear({ texto: 'mañana', hora: '00:00' });
  assert.strictEqual(recordatorios.pendientes().length, 2);
  assert.ok(recordatorios.pendientes()[1].cuando > Date.now());
  assert.throws(() => recordatorios.crear({ texto: 'x' }), /minutos/);
  assert.throws(() => recordatorios.crear({ texto: 'x', hora: 'las cinco' }), /HH:MM/);
});

prueba('el servidor de medios entrega archivos por partes (lo que pide la tele)', async () => {
  const archivo = path.join(process.env.JARVIS_DATOS, 'video de prueba.mp4');
  fs.writeFileSync(archivo, Buffer.from('0123456789'));
  const { url, tipo } = await servidor.compartirArchivo(archivo, '127.0.0.1');
  assert.strictEqual(tipo, 'video/mp4');
  const local = url.replace(/\/\/[^:]+:/, '//127.0.0.1:');
  const parte = await fetch(local, { headers: { Range: 'bytes=2-5' } });
  assert.strictEqual(parte.status, 206);
  assert.strictEqual(parte.headers.get('content-range'), 'bytes 2-5/10');
  assert.strictEqual(await parte.text(), '2345');
  const cola = await fetch(local, { headers: { Range: 'bytes=-3' } });
  assert.strictEqual(await cola.text(), '789');
  const entero = await fetch(local);
  assert.strictEqual(await entero.text(), '0123456789');
  const ajeno = await fetch(local.replace(/\/m\/[0-9a-f]+\//, '/m/000000/'));
  assert.strictEqual(ajeno.status, 404, 'sin el token no se puede leer nada');
  await assert.rejects(() => servidor.compartirArchivo(path.join(process.env.JARVIS_DATOS, 'no-existe.mp4')), /No encuentro/);
});

prueba('la interfaz no deja salir de su carpeta', async () => {
  const { url, cerrar } = await servidor.iniciarInterfaz(47950);
  assert.strictEqual((await fetch(`${url}/notch.html`)).status, 200);
  assert.strictEqual((await fetch(`${url}/modelos/hey_jarvis_v0.1.onnx`, { method: 'HEAD' })).status, 200);
  assert.strictEqual((await fetch(`${url}/vendor/ort/ort.wasm.min.js`, { method: 'HEAD' })).status, 200);
  assert.strictEqual((await fetch(`${url}/..%2f..%2fpackage.json`)).status, 404);
  assert.strictEqual((await fetch(`${url}/%2e%2e/main/main.js`)).status, 404);
  cerrar();
});

prueba('los comandos de todos los días se entienden sin ningún modelo', () => {
  config.guardarRutinas([{ id: 'modo_juego', nombre: 'Modo juego', pasos: [] }, { id: 'modo_tele', nombre: 'Modo tele', pasos: [] }, { id: 'avisar', nombre: 'Avisar que juego', pasos: [] }]);
  config.guardarConfig({ ...config.leerConfig(), salidasAudio: [{ nombre: 'auriculares', dispositivo: 'x' }, { nombre: 'parlantes', dispositivo: 'y' }], teles: [{ nombre: 'Tele Comedor', cast: 'Living TV' }], programas: [{ nombre: 'MSI Afterburner', ruta: 'x' }] });
  const r = (t) => comandos.resolver(t, { programas: ['Discord', 'Steam'] });
  for (const t of ['Modo juego.', 'Hey Jarvis, modo juego', 'activá el modo juego por favor', 'Moto juego']) assert.strictEqual(r(t).rutina, 'modo_juego', t);
  assert.strictEqual(r('avisar que juego').rutina, 'avisar');
  assert.deepStrictEqual(r('Modo silencio.').pasos, [{ tipo: 'modo', modo: 'silencio' }]);
  assert.deepStrictEqual(r('ponete en oculto').pasos, [{ tipo: 'modo', modo: 'oculto' }]);
  assert.deepStrictEqual(r('Poné música').pasos, [{ tipo: 'musica', busqueda: '' }]);
  assert.deepStrictEqual(r('Poné la canción De música ligera de Soda Stereo').pasos, [{ tipo: 'musica', busqueda: 'De música ligera de Soda Stereo' }]);
  assert.strictEqual(r('Siguiente canción.').pasos[0].accion, 'siguiente');
  assert.strictEqual(r('Pausá la música').pasos[0].accion, 'pausar');
  assert.deepStrictEqual(r('Subí el volumen al cincuenta por ciento').pasos, [{ tipo: 'volumen', nivel: 50 }]);
  assert.deepStrictEqual(r('volumen al 35').pasos, [{ tipo: 'volumen', nivel: 35 }]);
  assert.deepStrictEqual(r('Cambiá a los auriculares').pasos, [{ tipo: 'salida_audio', salida: 'auriculares' }]);
  assert.deepStrictEqual(r('Cambia los auriculares').pasos, [{ tipo: 'salida_audio', salida: 'auriculares' }], 'aunque el oído se coma una palabra');
  assert.deepStrictEqual(r('Apagá la tele del comedor').pasos, [{ tipo: 'tele', tele: 'Tele Comedor', accion: 'apagar' }]);
  assert.deepStrictEqual(r('Abrí Discord').pasos, [{ tipo: 'abrir', programa: 'Discord' }]);
  assert.deepStrictEqual(r('abrí afterburner').pasos, [{ tipo: 'abrir', programa: 'MSI Afterburner' }]);
  assert.deepStrictEqual(r('Recordame en diez minutos sacar la pizza del horno').pasos, [{ tipo: 'recordatorio', texto: 'Sacar la pizza del horno', minutos: 10 }]);
  assert.deepStrictEqual(r('recordame sacar la basura en media hora').pasos, [{ tipo: 'recordatorio', texto: 'Sacar la basura', minutos: 30 }]);
  assert.deepStrictEqual(r('Recordame a las nueve y media de la noche llamar al médico').pasos, [{ tipo: 'recordatorio', texto: 'Llamar al médico', hora: '21:30' }]);
  // La webcam no necesita ningún modelo para sacar y mandar fotos, a uno mismo o a un contacto.
  config.guardarConfig({ ...config.leerConfig(), contactos: [{ nombre: 'Eva', numero: '1123456789' }] });
  for (const t of ['Mandame una foto', 'sacá una foto', 'Sacame una foto de la cámara y mandamela', 'enviale una foto a mí']) assert.deepStrictEqual(r(t).pasos, [{ tipo: 'foto_whatsapp', contacto: 'yo' }], t);
  for (const t of ['Mandale foto Eva', 'mandale una foto Eva', 'Mandale foto a Eva', 'mandale foto para Eva']) assert.deepStrictEqual(r(t).pasos, [{ tipo: 'foto_whatsapp', contacto: 'Eva' }], t);
  for (const t of ['Mandale una foto a Eva', 'sacá una foto y mandásela a Eva', 'mandá una foto de la webcam a Eva por WhatsApp']) assert.deepStrictEqual(r(t).pasos, [{ tipo: 'foto_whatsapp', contacto: 'Eva' }], t);
  // Foto con texto (el texto va como epígrafe), en la PC y desde el celular.
  assert.deepStrictEqual(r('Mandale una foto a Eva diciendo que estoy ocupado').pasos, [{ tipo: 'foto_whatsapp', contacto: 'Eva', epigrafe: 'Estoy ocupado' }]);
  assert.deepStrictEqual(r('mandale una foto a Eva diciéndole que ya llego').pasos, [{ tipo: 'foto_whatsapp', contacto: 'Eva', epigrafe: 'Ya llego' }]);
  assert.deepStrictEqual(r('mandá una foto a Eva con el mensaje mirá esto').pasos, [{ tipo: 'foto_whatsapp', contacto: 'Eva', epigrafe: 'Mirá esto' }]);
  assert.deepStrictEqual(r('Mandame una foto diciendo que llegué').pasos, [{ tipo: 'foto_whatsapp', contacto: 'yo', epigrafe: 'Llegué' }]);
  assert.match(r('Mandale una foto a Eva diciendo que estoy ocupado').respuesta, /la foto con el mensaje a Eva/);
  for (const t of ['mandale una foto a Pedro', '¿qué ves en la cámara?']) assert.strictEqual(r(t), null, t);
  assert.strictEqual(whatsapp.jidPropio('5491123456789:12@s.whatsapp.net'), '5491123456789@s.whatsapp.net');
  assert.deepStrictEqual(['yo', 'a mí', 'mi WhatsApp', 'Eva'].map(whatsapp.esParaMi), [true, true, true, false]);
  // Música: "poné música" es la mezcla personal y suena en la PC salvo que se nombre otro lugar.
  assert.deepStrictEqual(r('poné mi supermix').pasos, [{ tipo: 'musica', busqueda: '' }]);
  assert.deepStrictEqual(r('poné música en el living').pasos, [{ tipo: 'musica', busqueda: '', dispositivo: 'living' }]);
  // Clima y búsquedas explícitas.
  assert.deepStrictEqual(r('¿Cómo está el clima?').pasos, [{ tipo: 'clima', lugar: '', cuando: 'ahora' }]);
  assert.deepStrictEqual(r('¿Va a llover mañana?').pasos, [{ tipo: 'clima', lugar: '', cuando: 'manana' }]);
  assert.deepStrictEqual(r('¿Cómo va a estar el clima mañana en Mar del Plata?').pasos, [{ tipo: 'clima', lugar: 'Mar del Plata', cuando: 'manana' }]);
  assert.deepStrictEqual(r('pronóstico para pasado mañana en Bariloche').pasos, [{ tipo: 'clima', lugar: 'Bariloche', cuando: 'pasado' }]);
  assert.deepStrictEqual(r('Buscá en internet quién ganó ayer River').pasos, [{ tipo: 'buscar', consulta: 'quién ganó ayer River' }]);
  for (const t of ['cuánto tiempo falta', 'el tiempo es oro', 'buscá la canción despacito']) assert.strictEqual(r(t), null, t);
  // Novedades y streaming.
  assert.deepStrictEqual(r('¿Tengo mensajes?').pasos, [{ tipo: 'avisos', accion: 'contar', origen: 'whatsapp' }]);
  assert.deepStrictEqual(r('leeme los mails').pasos, [{ tipo: 'avisos', accion: 'leer', origen: 'mail' }]);
  assert.deepStrictEqual(r('qué me perdí').pasos, [{ tipo: 'avisos', accion: 'leer' }]);
  assert.deepStrictEqual(r('borrá las notificaciones').pasos, [{ tipo: 'avisos', accion: 'limpiar', origen: undefined }]);
  assert.deepStrictEqual(r('Poné la serie Loki').pasos, [{ tipo: 'ver', titulo: 'Loki' }]);
  assert.deepStrictEqual(r('quiero ver Emily en París').pasos, [{ tipo: 'ver', titulo: 'Emily en París' }], 'el "en" del título no se confunde con un lugar');
  assert.deepStrictEqual(r('quiero ver Emily en París en Netflix').pasos, [{ tipo: 'ver', titulo: 'Emily en París', servicio: 'netflix' }]);
  assert.deepStrictEqual(r('poné videos de gatos en la tele del comedor').pasos, [{ tipo: 'ver', titulo: 'gatos', dispositivo: 'la tele del comedor' }]);
  assert.strictEqual(r('poné música en la tele').pasos[0].tipo, 'musica', 'la música sigue siendo música');
  for (const t of ['tengo hambre', 'hay que comprar pan', 'quiero ver']) assert.strictEqual(r(t), null, t);
  assert.strictEqual(r('Nada, gracias.').terminar, true);
  assert.match(r('¿Qué hora es?').respuesta, /^Son las \d\d:\d\d\.$/);
  // Lo que necesita entender de verdad sigue de largo, para que lo piense un modelo.
  for (const t of ['Avisale a Eva que después le contesto', 'Abrí Discord y cambiá a auriculares', '¿Qué hora es en Tokio?', '¿Cuánto es 15 por 8?', 'abrí un programa que no existe', 'recordame mañana llamar a mamá']) assert.strictEqual(r(t), null, t);
  assert.strictEqual(comandos.numeroDe('treinta y cinco'), 35);
  assert.strictEqual(comandos.numeroDe('veintidós'), 22);
  assert.strictEqual(comandos.numeroDe('banana'), null);
});

prueba('las herramientas y las instrucciones para los modelos están bien armadas', () => {
  config.guardarConfig({ ...config.leerConfig(), contactos: [{ nombre: 'Eva', numero: '1123456789' }] });
  const h = cerebro.herramientas();
  const nombres = h.map((x) => x.function.name);
  assert.strictEqual(new Set(nombres).size, nombres.length);
  for (const f of h) {
    assert.strictEqual(f.type, 'function');
    assert.match(f.function.name, /^[a-z_]+$/);
    assert.ok(f.function.description.length > 10);
    assert.strictEqual(f.function.parameters.type, 'object');
    for (const r of f.function.parameters.required) assert.ok(f.function.parameters.properties[r], `${f.function.name}: falta ${r}`);
  }
  assert.ok(nombres.includes('enviar_whatsapp') && nombres.includes('controlar_tele'));
  assert.ok(!nombres.includes('controlar_casa'), 'sin dispositivos de casa cargados, esa herramienta no se manda');
  const texto = cerebro.instrucciones();
  assert.match(texto, /rioplatense/);
  assert.match(texto, /Modo juego/, 'incluye las rutinas cargadas');
  assert.ok(JSON.stringify(h).length + texto.length < 11900, `tiene que entrar holgado en los cupos gratuitos por minuto (${JSON.stringify(h).length + texto.length})`);
});

prueba('de los modelos de Gemini se eligen los de mayor cupo gratuito, sin nombres fijos', () => {
  const elegidos = pensar.elegirDeGemini(['models/gemini-3.8-flash', 'models/gemini-3.5-flash-lite', 'models/gemini-3.1-flash-lite', 'models/gemini-2.5-flash-lite',
    'models/gemini-3.8-live', 'models/gemini-embedding-2', 'models/gemma-4-27b-it', 'models/gemini-3.1-pro', 'models/gemini-3.8-flash-tts', 'models/gemini-3.1-flash-image']);
  assert.deepStrictEqual(elegidos, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-27b-it', 'gemini-3.8-flash']);
});

prueba('si un modelo gratuito se queda sin cupo, se pasa al siguiente sin que se note', async () => {
  const groq = await servidorFalso(47961, (p) => (p.json.model === 'openai/gpt-oss-120b'
    ? { estado: 429, cuerpo: { error: { message: 'Rate limit reached: tokens per day (TPD)' } } }
    : { estado: 429, cabeceras: { 'retry-after': '30' }, cuerpo: { error: { message: 'Rate limit reached: requests per minute' } } }));
  const gemini = await servidorFalso(47962, (p) => {
    if (p.ruta.endsWith('/models')) return { cuerpo: { data: [{ id: 'models/gemini-3.8-flash' }, { id: 'models/gemini-3.5-flash-lite' }, { id: 'models/gemini-3.8-live' }] } };
    return respuesta({ content: '<think>pienso</think>Hola, soy el respaldo.' });
  });
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' }, gemini: { clave: 'k', url: 'http://127.0.0.1:47962' } });
    const r = await pensar.preguntar([{ role: 'user', content: 'hola' }], cerebro.herramientas());
    assert.strictEqual(r.proveedor, 'gemini');
    assert.strictEqual(r.modelo, 'gemini-3.5-flash-lite', 'eligió solo el de mayor cupo');
    assert.strictEqual(r.texto, 'Hola, soy el respaldo.', 'sin el razonamiento interno del modelo');
    assert.strictEqual(groq.pedidos.length, 3, 'probó los tres modelos gratuitos de Groq antes de rendirse');
    assert.strictEqual(groq.pedidos[0].json.reasoning_effort, 'low');
    assert.strictEqual(gemini.pedidos[1].clave, 'k');
    assert.match(pensar.estado().groq.error, /cupo|pedidos/);
    // Mientras dure el enfriamiento no se insiste con Groq: el pedido siguiente va directo a Gemini.
    await pensar.preguntar([{ role: 'user', content: 'otra' }], null);
    assert.strictEqual(groq.pedidos.length, 3);
  } finally { await groq.cerrar(); await gemini.cerrar(); }
});

prueba('si un modelo no acepta un parámetro opcional, se reintenta sin él', async () => {
  const groq = await servidorFalso(47961, (p) => (p.json.reasoning_effort ? { estado: 400, cuerpo: { error: { message: 'unknown field reasoning_effort' } } } : respuesta({ content: 'listo' })));
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    const r = await pensar.probar('groq');
    assert.strictEqual(r.modelo, 'openai/gpt-oss-120b');
    assert.strictEqual(groq.pedidos.length, 2);
    await pensar.probar('groq');
    assert.strictEqual(groq.pedidos.length, 3, 'la segunda vez ya no manda ese parámetro');
  } finally { await groq.cerrar(); }
});

prueba('una clave inválida se informa clarito, y sin ningún modelo configurado también', async () => {
  const groq = await servidorFalso(47961, () => ({ estado: 401, cuerpo: { error: { message: 'Invalid API Key' } } }));
  try {
    usarIA({ groq: { clave: 'mala', url: 'http://127.0.0.1:47961' } });
    await assert.rejects(() => pensar.probar('groq'), /clave no es válida/);
    assert.strictEqual(groq.pedidos.length, 1, 'con la clave mal no tiene sentido probar los otros modelos');
    await assert.rejects(() => pensar.probar('gemini'), /Falta la clave/);
    await assert.rejects(() => pensar.probar('ollama'), /Ollama no está andando/);
    usarIA({});
    await assert.rejects(() => pensar.preguntar([{ role: 'user', content: 'hola' }]), (e) => e.sinModelos === true);
  } finally { await groq.cerrar(); }
});

prueba('un pedido libre: el modelo usa una herramienta, se ejecuta y contesta con el resultado', async () => {
  let modo = null;
  acciones.configurar({ decir() {}, fijarModo: (m) => { modo = m; }, pedirAlNotch: async () => { throw new Error('sin notch'); } });
  cerebro.configurar({ estado() {}, salida() {}, cortar() {}, texto() {}, modo: () => 'normal', vozDeWindows: async () => {}, programas: () => [] });
  const groq = await servidorFalso(47961, (p, n) => (n === 1 ? respuesta(llamada('cambiar_modo', { modo: 'silencio' })) : respuesta({ content: 'Listo, me callo.' })));
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    const s = { historial: [] };
    const r = await cerebro.decidir('che, no me hables por un rato', s);
    assert.strictEqual(modo, 'silencio');
    assert.strictEqual(r.texto, 'Listo, me callo.');
    const segundo = groq.pedidos[1].json.messages;
    assert.strictEqual(segundo[0].role, 'system');
    assert.deepStrictEqual(segundo.slice(-2).map((m) => m.role), ['assistant', 'tool'], 'el resultado de la herramienta vuelve al modelo');
    assert.match(segundo[segundo.length - 1].content, /Modo silencio/);
    assert.strictEqual(s.historial.length, 2, 'queda en la memoria de la conversación');
    // Si el modelo deja de responder después de actuar, igual se cuenta lo que se hizo.
    await groq.cerrar();
    const groq2 = await servidorFalso(47961, (p, n) => (n === 1 ? respuesta(llamada('crear_recordatorio', { texto: 'sacar la pizza', minutos: 10 })) : { estado: 500, cuerpo: {} }));
    try {
      pensar.olvidar();
      const r2 = await cerebro.decidir('en un ratito avisame de la pizza', { historial: [] });
      assert.match(r2.texto, /Recordatorio para .* sacar la pizza/);
    } finally { await groq2.cerrar(); }
  } finally { await groq.cerrar().catch(() => {}); }
});

prueba('para mirar por la webcam sirve cualquier proveedor: se usa su modelo que ve imágenes', async () => {
  const fotoFalsa = new Uint8Array([255, 216, 255, 217]).buffer;
  acciones.configurar({ decir() {}, fijarModo() {}, pedirAlNotch: async (tipo) => { assert.strictEqual(tipo, 'foto'); return fotoFalsa; } });
  // Solo Groq configurado (sin Gemini): el modelo de texto pide la foto y el que ve imágenes la describe.
  const groq = await servidorFalso(47961, (p) => {
    const ultimo = p.json.messages[p.json.messages.length - 1];
    if (Array.isArray(ultimo.content)) return p.json.model === 'qwen/qwen3.8-27b' ? respuesta({ content: 'Veo un escritorio con un teclado.' }) : { estado: 400, cuerpo: { error: { message: 'model does not support images' } } };
    return respuesta(llamada('mirar_camara', {}));
  });
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    const r = await cerebro.decidir('¿qué ves en la cámara?', { historial: [] });
    assert.strictEqual(r.texto, 'Veo un escritorio con un teclado.');
    assert.deepStrictEqual(groq.pedidos.map((p) => p.json.model), ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
    const conFoto = groq.pedidos[1].json.messages.pop().content;
    assert.strictEqual(conFoto[1].image_url.url, 'data:image/jpeg;base64,/9j/2Q==', 'la foto viaja adentro del pedido');
    // Con un modelo fijo que no ve imágenes: lo dice, y ese modelo sigue sirviendo para texto.
    await groq.cerrar();
    const sinVista = await servidorFalso(47961, (p) => (!p.json ? { cuerpo: { models: [{ name: 'modelito' }] } } : Array.isArray(p.json.messages[p.json.messages.length - 1].content) ? { estado: 400, cuerpo: { error: { message: 'no images' } } } : respuesta(p.json.messages.length > 2 ? { content: 'hola' } : llamada('mirar_camara', {}))));
    try {
      usarIA({ ollama: { url: 'http://127.0.0.1:47961', modelo: 'modelito' } });
      assert.match((await cerebro.decidir('¿qué ves?', { historial: [] })).texto, /Saqué la foto, pero ningún modelo pudo mirarla/);
      assert.strictEqual((await pensar.probar('ollama')).modelo, 'modelito', 'no quedó castigado por no ver imágenes');
    } finally { await sinVista.cerrar(); }
  } finally { await groq.cerrar().catch(() => {}); }
});

prueba('un comando directo no gasta ni un pedido a ningún modelo, y sin modelos se explica qué falta', async () => {
  let modo = null;
  acciones.configurar({ decir() {}, fijarModo: (m) => { modo = m; }, pedirAlNotch: async () => { throw new Error('sin notch'); } });
  const groq = await servidorFalso(47961, () => respuesta({ content: 'no debería llegar acá' }));
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    const r = await cerebro.decidir('Modo silencio', { historial: [] });
    assert.strictEqual(modo, 'silencio');
    assert.strictEqual(r.texto, 'Modo silencio.');
    assert.strictEqual(groq.pedidos.length, 0);
    config.guardarRutinas([{ id: 'p', nombre: 'Modo juego', pasos: [{ tipo: 'decir', texto: 'Modo juego activado.' }, { tipo: 'modo', modo: 'normal' }] }]);
    assert.strictEqual((await cerebro.decidir('modo juego', { historial: [] })).texto, 'Modo juego activado.', 'dice lo que la rutina mandaba a decir');
    assert.strictEqual((await cerebro.decidir('chau', { historial: [] })).terminar, true);
    usarIA({});
    assert.match((await cerebro.decidir('contame un chiste', { historial: [] })).texto, /configurar un modelo gratuito/);
  } finally { await groq.cerrar(); }
});

prueba('una conversación entera: escucha, entiende, hace y vuelve a escuchar', async () => {
  const fases = [];
  const textos = [];
  const dichas = [];
  let modo = 'normal';
  acciones.configurar({ decir() {}, fijarModo: (m) => { modo = m; }, pedirAlNotch: async () => { throw new Error('sin notch'); } });
  cerebro.configurar({ estado: (f, t) => fases.push(t ? `${f}: ${t}` : f), salida() {}, cortar() {}, texto: (q, t) => textos.push(`${q}: ${t}`), modo: () => modo, vozDeWindows: async (t) => { dichas.push(t); }, programas: () => [] });
  usarIA({});
  config.guardarConfig({ ...config.leerConfig(), habla: { voz: 'windows' }, escucha: { ...config.leerConfig().escucha, seguir: 'siempre' } });
  // Sin los modelos de voz bajados, avisa qué falta en vez de quedarse escuchando para nada.
  assert.strictEqual(await cerebro.activar(), false);
  assert.match(fases.pop(), /^error: Para escucharte falta bajar/);
  // Con los modelos "instalados" (acá, de mentira): el oído entrega una frase y Jarvis la atiende.
  const original = { instalado: modelos.instalado, preparar: oido.preparar, escuchar: oido.escuchar, transcribir: oido.transcribir };
  const frases = ['Modo silencio', '   ', 'nada, gracias'];
  let escuchas = 0;
  modelos.instalado = (id) => id === 'vad' || id === 'oido';
  oido.preparar = async () => ({ vad: true, oido: true });
  oido.escuchar = (activo) => { if (activo) escuchas++; };
  oido.transcribir = async () => frases.shift();
  try {
    fases.length = 0;
    assert.strictEqual(await cerebro.activar(), true);
    assert.ok(cerebro.activa());
    const hablar = async () => { cerebro.audio(new Int16Array(1280)); oido.alSegmentoDePrueba(new Int16Array(16000)); await new Promise((r) => setTimeout(r, 40)); };
    await hablar();
    assert.strictEqual(modo, 'silencio');
    assert.deepStrictEqual(textos, ['vos: Modo silencio', 'jarvis: Modo silencio.']);
    assert.deepStrictEqual(dichas, [], 'en modo silencio no habla: la respuesta queda escrita');
    assert.ok(cerebro.activa(), 'después de responder sigue escuchando por si querés seguir la charla');
    await hablar(); // un ruido que no dice nada: no se toma como pedido
    assert.strictEqual(textos.length, 2);
    await hablar(); // "nada, gracias" cierra la conversación
    assert.strictEqual(cerebro.activa(), false);
    assert.deepStrictEqual(fases, ['escuchando', 'escuchando', 'pensando', 'pensando', 'ok', 'escuchando', 'pensando', 'escuchando', 'pensando', 'pensando', 'reposo']);
    assert.strictEqual(escuchas, 3);
    // Lo normal (así viene configurado): después de hacer algo que no necesita respuesta, deja de escuchar.
    config.guardarConfig({ ...config.leerConfig(), escucha: { ...config.leerConfig().escucha, seguir: 'pregunta' } });
    frases.push('Modo normal');
    assert.strictEqual(await cerebro.activar(), true);
    await hablar();
    assert.strictEqual(modo, 'normal');
    assert.strictEqual(cerebro.activa(), false, 'hizo lo pedido y no se queda esperando otro comando');
    // Pero si Jarvis pregunta algo, espera la respuesta.
    const groq = await servidorFalso(47961, () => respuesta({ content: '¿A quién se lo mando?' }));
    try {
      usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
      frases.push('Mandá un mensaje diciendo que llego tarde', 'nada, gracias');
      assert.strictEqual(await cerebro.activar(), true);
      await hablar(); await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(textos[textos.length - 1], 'jarvis: ¿A quién se lo mando?');
      assert.ok(cerebro.activa(), 'preguntó: sigue escuchando');
      await hablar();
      assert.strictEqual(cerebro.activa(), false);
    } finally { await groq.cerrar(); usarIA({}); }
    dichas.length = 0;
    // Un pedido escrito en el panel funciona aunque no esté el modelo de escucha.
    modelos.instalado = () => false;
    modo = 'normal';
    await cerebro.texto('¿Qué hora es?');
    assert.match(dichas[0], /^Son las \d\d:\d\d\.$/);
    assert.strictEqual(cerebro.activa(), false);
  } finally {
    Object.assign(modelos, { instalado: original.instalado });
    Object.assign(oido, { preparar: original.preparar, escuchar: original.escuchar, transcribir: original.transcribir });
    cerebro.cancelar();
  }
});

prueba('los modelos de voz se bajan una sola vez, siguen donde quedaron si se corta, y se descomprimen bien', async () => {
  // Un .tar.bz2 chiquito de verdad (una carpeta con dos archivos), servido en pedazos.
  const paquete = Buffer.from('QlpoOTFBWSZTWQxoUFsAAPD9hMmQAkBAA/+AAwj2b95AAACAiDAA2AY0aNAMmQ0YjTQNMDGjRoBkyGjEaaBpgFVCYkajymnogMj1MRtDU0zg53sG1MouiQhG2EIENqm6SS4bi9SdxaNhEgSIZ8LIJmZI6HEpX8lGMLWoIcPrLLwDYY5aiZE+/MxErKlZpyI2+Ktr5oVhLI1lyUokkoj+34m85dXscu/M3lSpEzpro1HObTrPA7GHbkJXDyOJtOp3Kdtx6rDSJ0LNfvYvNDC8gf4u5IpwoSAY0KC2', 'base64');
  let cortar = true;
  const rangos = [];
  const s = http.createServer((req, res) => {
    const desde = Number((/bytes=(\d+)-/.exec(req.headers.range || '') || [])[1] || 0);
    rangos.push(desde);
    const resto = paquete.subarray(desde);
    res.writeHead(desde ? 206 : 200, { 'Content-Length': resto.length });
    if (cortar) { cortar = false; res.write(resto.subarray(0, 100)); setTimeout(() => res.destroy(), 30); } else res.end(resto);
  });
  await new Promise((ok) => s.listen(47960, '127.0.0.1', ok));
  const m = modelos.CATALOGO.oido;
  const guardado = { ...m };
  Object.assign(m, { carpeta: 'modelo-de-prueba', necesita: ['tokens.txt', 'sub/a.bin'] });
  try {
    assert.strictEqual(modelos.instalado('oido'), false);
    await assert.rejects(() => modelos.bajar('oido'), /No pude bajar/);
    assert.match(modelos.estado().oido.error, /No pude bajar/);
    await modelos.bajar('oido'); // el segundo intento retoma la descarga
    assert.deepStrictEqual(rangos, [0, 100], 'no vuelve a bajar lo que ya tenía');
    assert.strictEqual(modelos.instalado('oido'), true);
    assert.strictEqual(fs.readFileSync(path.join(modelos.CARPETA, 'modelo-de-prueba', 'sub', 'a.bin'), 'utf8'), 'datos\n');
    assert.strictEqual(modelos.estado().oido.error, null);
    assert.ok(!fs.existsSync(path.join(modelos.CARPETA, 'oido.descarga')), 'no deja el comprimido ocupando lugar');
    await modelos.bajar('oido');
    assert.strictEqual(rangos.length, 2, 'ya instalado, no baja nada');
  } finally {
    Object.assign(m, guardado);
    s.closeAllConnections(); await new Promise((r) => s.close(r));
  }
});

prueba('con la escucha en Groq se usa su Whisper gratuito, y si falla sigue con el modelo de esta PC', async () => {
  let fallar = false;
  const recibidos = [];
  const s = http.createServer((req, res) => {
    const trozos = [];
    req.on('data', (d) => trozos.push(d));
    req.on('end', () => {
      recibidos.push({ ruta: req.url, clave: req.headers.authorization, tipo: req.headers['content-type'], cuerpo: Buffer.concat(trozos) });
      res.writeHead(fallar ? 429 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fallar ? { error: { message: 'limite' } } : { text: ' Modo juego. ' }));
    });
  });
  await new Promise((ok) => s.listen(47961, '127.0.0.1', ok));
  const original = { instalado: modelos.instalado, transcribir: oido.transcribir };
  modelos.instalado = (id) => id === 'vad' || id === 'oido';
  oido.transcribir = async () => 'lo que entendió la PC';
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    config.guardarConfig({ ...config.leerConfig(), escucha: { motor: 'groq' } });
    assert.strictEqual(await cerebro.transcribir(new Int16Array(16000)), 'Modo juego.');
    assert.strictEqual(recibidos[0].ruta, '/audio/transcriptions');
    assert.strictEqual(recibidos[0].clave, 'Bearer g');
    assert.match(recibidos[0].tipo, /multipart\/form-data/);
    assert.ok(recibidos[0].cuerpo.includes('whisper-large-v3-turbo') && recibidos[0].cuerpo.includes('RIFF'), 'manda el audio como WAV y pide español');
    fallar = true;
    assert.strictEqual(await cerebro.transcribir(new Int16Array(16000)), 'lo que entendió la PC');
    config.guardarConfig({ ...config.leerConfig(), escucha: { motor: 'local' } });
    await cerebro.transcribir(new Int16Array(16000));
    assert.strictEqual(recibidos.length, 2, 'con la escucha local no sale nada de la PC');
  } finally {
    Object.assign(modelos, { instalado: original.instalado });
    Object.assign(oido, { transcribir: original.transcribir });
    s.closeAllConnections(); await new Promise((r) => s.close(r));
  }
});

prueba('el clima sale de un servicio gratuito sin clave, y se dice en castellano', async () => {
  const s = await servidorFalso(47963, (p) => {
    if (p.ruta.startsWith('/geo')) return { cuerpo: /Atlantida/.test(p.ruta) ? {} : { results: [{ name: decodeURIComponent(/name=([^&]+)/.exec(p.ruta)[1]), latitude: -34.6, longitude: -58.4, country: 'Argentina' }] } };
    if (p.ruta.startsWith('/clima')) return { cuerpo: { current: { temperature_2m: 21.6, apparent_temperature: 24.2, precipitation: 0, weather_code: 2, wind_speed_10m: 11 },
      daily: { time: ['2026-11-10', '2026-11-11', '2026-11-12'], temperature_2m_max: [26.4, 19.1, 22], temperature_2m_min: [16.8, 12.2, 11], precipitation_probability_max: [10, 80, 0], weather_code: [2, 63, 0] } } };
    return null;
  });
  try {
    assert.strictEqual(await internet.clima('Buenos Aires'), 'En Buenos Aires hace 22 grados, con sensación de 24, algo nublado. Hoy: algo nublado, máxima de 26 grados y mínima de 17 grados, con 10 por ciento de probabilidad de lluvia.');
    assert.strictEqual(await internet.clima('Rosario', 'manana'), 'Mañana en Rosario: con lluvia, máxima de 19 grados y mínima de 12 grados, con 80 por ciento de probabilidad de lluvia.');
    assert.match(s.pedidos[1].ruta, /latitude=-34\.6&longitude=-58\.4.*timezone=auto/);
    await assert.rejects(() => internet.clima('Atlantida'), /No encontré ninguna ciudad/);
    config.guardarConfig({ ...config.leerConfig(), ciudad: '' });
    await assert.rejects(() => internet.clima(), /cargá tu ciudad en Ajustes/);
    // Por voz, con la ciudad cargada en Ajustes y sin ningún modelo configurado.
    usarIA({});
    config.guardarConfig({ ...config.leerConfig(), ciudad: 'Buenos Aires' });
    assert.match((await cerebro.decidir('¿Va a llover mañana?', { historial: [] })).texto, /^Mañana en Buenos Aires: con lluvia/);
  } finally { await s.cerrar(); }
});

prueba('si Open-Meteo falla, el clima reintenta una vez y después usa MET Norway; el motivo queda en el Historial', async () => {
  let modo = 'respaldo';
  const hora = (h, temp, simbolo) => ({ time: `2026-11-25T${String(h).padStart(2, '0')}:00:00Z`, data: { instant: { details: { air_temperature: temp } }, next_1_hours: { summary: { symbol_code: simbolo } } } });
  const s = await servidorFalso(47963, (p) => {
    if (p.ruta.startsWith('/geo')) return { cuerpo: { results: [{ name: 'Buenos Aires', latitude: -34.6, longitude: -58.4, timezone: 'America/Argentina/Buenos_Aires' }] } };
    if (p.ruta.startsWith('/clima')) return { estado: 503, cuerpo: { error: true, reason: 'Servicio saturado' } };
    if (p.ruta.startsWith('/met') && modo === 'respaldo') return { cuerpo: { properties: { timeseries: [hora(15, 28.4, 'partlycloudy_day'), hora(18, 30.2, 'rainshowers_day'), hora(21, 25, 'cloudy'), hora(23, 22.6, 'fair_night')] } } };
    return { estado: 500, cuerpo: {} };
  });
  try {
    const entrada = historial.empezar('¿Cómo está el clima?', 'prueba');
    assert.strictEqual(await internet.clima('Buenos Aires'), 'En Buenos Aires hace 28 grados, algo nublado. Hoy: con chaparrones, máxima de 30 grados y mínima de 23 grados.');
    assert.strictEqual(s.pedidos.filter((p) => p.ruta.startsWith('/clima')).length, 2, 'reintenta una sola vez');
    assert.match(s.pedidos.find((p) => p.ruta.startsWith('/met')).ruta, /lat=-34\.6000&lon=-58\.4000/);
    const pasos = JSON.stringify(entrada);
    assert.match(pasos, /Open-Meteo respondió 503 \(Servicio saturado\)/);
    assert.match(pasos, /respaldo \(MET Norway\)/);
    // El widget también usa el respaldo.
    const w = await internet.climaDatos('Buenos Aires');
    assert.deepStrictEqual([w.temp, w.codigo, w.dia, w.lluvia], [28, 2, true, null]);
    // Si los dos fallan: el mensaje de siempre, con el detalle de cada uno.
    modo = 'nada';
    const e = await internet.clima('Rosario').catch((x) => x);
    assert.strictEqual(e.message, 'El servicio del clima no respondió bien.');
    assert.match(e.detalle, /Open-Meteo respondió 503.*MET Norway: respondió 500/);
    historial.terminar(entrada, { ok: false });
  } finally { await s.cerrar(); }
});

prueba('buscar en internet prueba en cadena: Groq, después Tavily, y sin claves Wikipedia', async () => {
  let groqBusca = true;
  const groq = await servidorFalso(47961, (p) => {
    if ((p.json.tools || []).some((t) => t.type === 'browser_search')) return groqBusca ? respuesta({ content: 'Argentina ganó el Mundial 2022.' }) : { estado: 400, cuerpo: { error: { message: 'browser_search is not available on your plan' } } };
    // Un pedido común de conversación: el modelo decide buscar, y después contesta con lo encontrado.
    const ultimo = p.json.messages[p.json.messages.length - 1];
    return ultimo.role === 'tool' ? respuesta({ content: `Según encontré: ${ultimo.content}` }) : respuesta(llamada('buscar_en_internet', { consulta: 'último campeón del mundial' }));
  });
  const otros = await servidorFalso(47963, (p) => {
    if (p.ruta.startsWith('/tavily')) return p.clave === 'tvly-buena' ? { cuerpo: { answer: 'Argentina, en Qatar 2022.', results: [{ title: 'FIFA', url: 'x', content: 'Argentina venció a Francia por penales.' }] } } : { estado: 401, cuerpo: {} };
    if (p.ruta.startsWith('/wikipedia')) return { cuerpo: { query: { pages: { 123: { title: 'Copa Mundial de Fútbol de 2022', extract: 'La Copa Mundial de la FIFA Catar 2022 fue la vigésima segunda edición. Argentina se consagró campeona.' } } } } };
    return null;
  });
  const tavily = (clave) => config.guardarConfig({ ...config.leerConfig(), busqueda: { tavily: clave } });
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    tavily('tvly-buena');
    assert.strictEqual(await internet.buscar('quién ganó el mundial'), 'Argentina ganó el Mundial 2022.');
    assert.deepStrictEqual([groq.pedidos[0].json.model, groq.pedidos[0].json.tool_choice, groq.pedidos[0].json.tools], ['openai/gpt-oss-20b', 'required', [{ type: 'browser_search' }]]);
    assert.strictEqual(otros.pedidos.length, 0, 'si Groq contesta no se consulta a nadie más');
    // Dentro de una conversación: el modelo usa la herramienta y contesta con el resultado.
    assert.strictEqual((await cerebro.decidir('che, ¿quién salió campeón del mundo?', { historial: [] })).texto, 'Según encontré: Argentina ganó el Mundial 2022.');
    // Si la búsqueda de Groq no está disponible en el plan gratuito, sigue Tavily.
    groqBusca = false;
    assert.match(await internet.buscar('quién ganó el mundial'), /^Argentina, en Qatar 2022\.\n- FIFA: Argentina venció/);
    assert.strictEqual((await internet.probar()).fuente, 'Tavily');
    // Con la clave de Tavily mal (o sin ella), queda Wikipedia.
    tavily('tvly-mala');
    assert.match(await internet.buscar('mundial 2022'), /^Según Wikipedia \(Copa Mundial de Fútbol de 2022\): La Copa Mundial/);
    // Y sin ningún modelo ni clave: "buscá en internet…" igual responde, con lo de Wikipedia.
    usarIA({}); tavily('');
    const r = await cerebro.decidir('Buscá en internet quién ganó el mundial 2022', { historial: [] });
    assert.match(r.texto, /^Según Wikipedia .*Argentina se consagró campeona\.$/);
    assert.match(otros.pedidos[otros.pedidos.length - 1].ruta, /gsrsearch=qui%C3%A9n%20gan%C3%B3%20el%20mundial%202022/);
  } finally { await groq.cerrar(); await otros.cerrar(); }
});

prueba('las notificaciones respetan las reglas: quién, por dónde y en qué modo', () => {
  let modo = 'normal';
  const avisadas = [];
  notificaciones.configurar({ modo: () => modo, alAvisar: (n, accion) => avisadas.push(`${accion}:${n.de}`), alCambiar() {} });
  config.guardarConfig({ ...config.leerConfig(), notificaciones: { estilo: 'ambos', whatsapp: { modo: 'todo', grupos: false }, mail: { modo: 'todo' }, reglas: [
    { origen: 'todos', quien: '', accion: 'callar', modos: ['dormido'] },
    { origen: 'whatsapp', quien: 'eva', accion: 'decir', modos: [] },
    { origen: 'whatsapp', quien: 'familia', accion: 'avisar', modos: [] },
    { origen: 'mail', quien: 'oferta', accion: 'callar', modos: [] },
  ] } });
  notificaciones.limpiar();
  const llega = (dato) => notificaciones.agregar(dato);
  assert.strictEqual(llega({ origen: 'whatsapp', de: 'Eva', texto: 'Hola, ¿estás?', clave: 'eva@s' }), 'decir');
  assert.strictEqual(llega({ origen: 'whatsapp', de: 'Eva', texto: 'Llamame', clave: 'eva@s' }), 'decir');
  assert.strictEqual(llega({ origen: 'whatsapp', de: 'Pedro', texto: 'che', clave: 'pedro@s' }), 'avisar');
  assert.strictEqual(llega({ origen: 'whatsapp', de: 'Pedro', grupo: 'Fútbol 5', texto: 'jugamos?', clave: 'g1' }), 'callar', 'los grupos no avisan…');
  assert.strictEqual(llega({ origen: 'whatsapp', de: 'Mamá', grupo: 'Familia', texto: 'asado el domingo', clave: 'g2' }), 'avisar', '…salvo los que una regla deja pasar');
  assert.strictEqual(llega({ origen: 'mail', de: 'Tienda', asunto: 'Súper OFERTA de hoy', clave: 'gmail:9' }), 'callar');
  assert.strictEqual(llega({ origen: 'mail', de: 'Martín', asunto: 'Reunión mañana', clave: 'gmail:10' }), 'avisar');
  modo = 'dormido';
  assert.strictEqual(llega({ origen: 'whatsapp', de: 'Eva', texto: '¿dormís?', clave: 'eva@s' }), 'callar', 'en modo dormido no avisa nadie');
  modo = 'normal';
  assert.deepStrictEqual(avisadas, ['decir:Eva', 'decir:Eva', 'avisar:Pedro', 'avisar:Mamá', 'avisar:Martín']);
  const r = notificaciones.resumen();
  assert.deepStrictEqual(r.map((g) => [g.origen, g.de, g.cantidad]), [['mail', 'Martín', 1], ['whatsapp', 'Familia', 1], ['whatsapp', 'Pedro', 1], ['whatsapp', 'Eva', 2]]);
  assert.strictEqual(r[1].texto, 'Mamá: asado el domingo');
  assert.strictEqual(notificaciones.contar(), 'Tenés un mail de Martín, un mensaje de Familia, un mensaje de Pedro y 2 mensajes de Eva.');
  assert.strictEqual(notificaciones.contar('mail'), 'Tenés un mail de Martín.');
  // Contestaste el chat de Eva desde el celular: sus notificaciones se van solas.
  assert.strictEqual(notificaciones.quitar((n) => n.clave === 'eva@s'), 2);
  assert.strictEqual(notificaciones.leerEnVozAlta('whatsapp'), 'Pedro: che. Mamá, en Familia: asado el domingo.');
  assert.strictEqual(notificaciones.contar('whatsapp'), 'No tenés mensajes nuevos.', 'lo que se leyó en voz alta deja de estar pendiente');
  assert.strictEqual(notificaciones.leerEnVozAlta(), 'Mail de Martín: Reunión mañana.');
  // Quedan guardadas aunque se cierre Jarvis.
  llega({ origen: 'mail', de: 'Banco', asunto: 'Resumen', clave: 'gmail:11' });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(process.env.JARVIS_DATOS, 'notificaciones.json'), 'utf8')).length, 1);
  notificaciones.limpiar();
});

prueba('de los mensajes de WhatsApp que llegan se saca quién escribe y qué dice', () => {
  config.guardarConfig({ ...config.leerConfig(), contactos: [{ nombre: 'Eva', numero: '11 2345 6789' }] });
  whatsapp._pruebas.vaciarAgenda();
  const m = (clave, mensaje, nombre) => { const r = whatsapp.entrante({ key: { fromMe: false, ...clave }, pushName: nombre, message: mensaje }); return r && { jid: r.jid, esGrupo: r.esGrupo, texto: r.texto, de: r.de }; };
  assert.deepStrictEqual(m({ remoteJid: '5491123456789@s.whatsapp.net' }, { conversation: 'Hola' }, 'Anita'), { jid: '5491123456789@s.whatsapp.net', esGrupo: false, texto: 'Hola', de: 'Eva' });
  assert.strictEqual(m({ remoteJid: '777@lid', remoteJidAlt: '5491123456789@s.whatsapp.net' }, { extendedTextMessage: { text: 'che' } }, 'Anita').de, 'Eva', 'aunque WhatsApp use su identificador interno');
  assert.deepStrictEqual(m({ remoteJid: '120363@g.us', participant: '5491199998888@s.whatsapp.net' }, { imageMessage: { caption: 'mirá' } }, 'Pedro'), { jid: '120363@g.us', esGrupo: true, texto: '[foto] mirá', de: 'Pedro' });
  assert.strictEqual(m({ remoteJid: '5491155554444@s.whatsapp.net' }, { audioMessage: {} }).de, '+5491155554444');
  assert.strictEqual(m({ remoteJid: 'status@broadcast' }, { conversation: 'estado' }), null);
  assert.strictEqual(m({ remoteJid: '5491123456789@s.whatsapp.net', fromMe: true }, { conversation: 'lo mandé yo' }), null);
  assert.strictEqual(m({ remoteJid: '5491123456789@s.whatsapp.net' }, { reactionMessage: { text: '👍' } }), null);
  // Alguien que no cargaste pero está agendado en el teléfono: aparece con el nombre de la agenda, no con el que se puso.
  whatsapp._pruebas.anotarContactos([{ id: '5491166667777@s.whatsapp.net', name: 'Martín Pérez', lid: '888@lid' }]);
  assert.strictEqual(m({ remoteJid: '5491166667777@s.whatsapp.net' }, { conversation: 'che' }, 'Marti 🔥').de, 'Martín Pérez');
  assert.strictEqual(m({ remoteJid: '888@lid' }, { conversation: 'che' }, 'Marti 🔥').de, 'Martín Pérez', 'también cuando llega con su identificador interno');
});

prueba('la agenda de WhatsApp: contactos y grupos se encuentran por su nombre, y los apodos mandan', async () => {
  whatsapp._pruebas.vaciarAgenda();
  whatsapp._pruebas.anotarContactos([
    { id: '5491166667777@s.whatsapp.net', name: 'Martín Pérez', lid: '888@lid' },
    { id: '5491122223333@s.whatsapp.net', name: 'Evangelina López' },
    { id: '5491144445555@s.whatsapp.net', notify: 'Solo Apodo' }, // nunca lo agendaste: solo se sabe cómo se puso
    { id: '120363111@g.us', name: 'esto no es una persona' },
  ]);
  whatsapp._pruebas.anotarGrupos([{ id: '120363111@g.us', subject: 'Casa' }, { id: '120363222@g.us', subject: 'Fulbito' }]);
  const a = whatsapp.resumenDeAgenda();
  assert.deepStrictEqual([a.contactos, a.grupos], [2, 2]);
  assert.deepStrictEqual(a.lista.map((x) => x.nombre), ['Casa', 'Fulbito', 'Evangelina López', 'Martín Pérez', 'Solo Apodo']);
  // Por el nombre con el que están agendados, sin cargar nada en Ajustes.
  config.guardarConfig({ ...config.leerConfig(), contactos: [] });
  assert.deepStrictEqual(whatsapp.buscarDestino('martin'), { nombre: 'Martín Pérez', jid: '5491166667777@s.whatsapp.net', numero: '5491166667777', grupo: false });
  assert.strictEqual(whatsapp.buscarDestino('casa').grupo, true);
  assert.strictEqual(whatsapp.buscarDestino('eva'), null, '"Eva" no es "Evangelina"');
  assert.strictEqual(whatsapp.buscarDestino('nadie'), null);
  // Con un apodo propio: "el Tano" es Martín; y un grupo con otro nombre.
  config.guardarConfig({ ...config.leerConfig(), contactos: [{ nombre: 'el Tano', jid: '5491166667777@s.whatsapp.net' }, { nombre: 'la familia', jid: '120363111@g.us' }, { nombre: 'Eva', numero: '11 2345 6789' }] });
  assert.strictEqual(whatsapp.buscarDestino('tano').jid, '5491166667777@s.whatsapp.net');
  assert.deepStrictEqual([whatsapp.buscarDestino('la familia').jid, whatsapp.buscarDestino('la familia').grupo], ['120363111@g.us', true]);
  // Quien escribe aparece con el apodo, también dentro de un grupo y aunque llegue con su id interno.
  const e = whatsapp.entrante({ key: { fromMe: false, remoteJid: '120363222@g.us', participant: '888@lid' }, pushName: 'Marti', message: { conversation: 'jugamos?' } });
  assert.strictEqual(e.de, 'el Tano');
  // Mandar: la marca de Jarvis va adelante de todo; a un grupo sale por el id del grupo.
  const enviados = [];
  whatsapp._pruebas.ponerSocket({ user: { id: '5491100001111:5@s.whatsapp.net' }, sendMessage: async (jid, contenido) => { enviados.push([jid, contenido.text ?? contenido.caption]); }, onWhatsApp: async (...n) => [{ exists: true, jid: `${n[0]}@s.whatsapp.net` }] });
  try {
    assert.strictEqual(await whatsapp.enviarTexto('la familia', 'llego en diez'), 'Mensaje enviado al grupo la familia.');
    assert.strictEqual(await whatsapp.enviarTexto('Fulbito', '🤖 ya tenía la marca'), 'Mensaje enviado al grupo Fulbito.');
    assert.strictEqual(await whatsapp.enviarTexto('Evangelina', 'hola'), 'Mensaje enviado a Evangelina López.');
    assert.strictEqual(await whatsapp.enviarTexto('Eva', 'hola'), 'Mensaje enviado a Eva.');
    assert.strictEqual(await whatsapp.enviarFoto('yo', Buffer.from('jpeg')), 'Foto enviada a tu propio WhatsApp.');
    assert.strictEqual(await whatsapp.enviarFoto('casa', Buffer.from('jpeg'), 'mirá'), 'Foto enviada al grupo Casa.', 'por su nombre real también se lo encuentra');
    assert.strictEqual(await whatsapp.responder('5491122223333@s.whatsapp.net', 'después te llamo'), '🤖 después te llamo');
    assert.deepStrictEqual(enviados, [
      ['120363111@g.us', '🤖 llego en diez'], ['120363222@g.us', '🤖 ya tenía la marca'], ['5491122223333@s.whatsapp.net', '🤖 hola'],
      ['5491123456789@s.whatsapp.net', '🤖 hola'], ['5491100001111@s.whatsapp.net', '🤖'], ['120363111@g.us', '🤖 mirá'], ['5491122223333@s.whatsapp.net', '🤖 después te llamo'],
    ]);
    await assert.rejects(() => whatsapp.enviarTexto('Fulano', 'hola'), /No encontré a "Fulano" entre tus contactos ni tus grupos/);
    // Sin marca, si se la borra en Ajustes.
    config.guardarConfig({ ...config.leerConfig(), firma: { whatsapp: '', mail: '' } });
    await whatsapp.enviarTexto('Evangelina', 'hola');
    assert.deepStrictEqual(enviados.pop(), ['5491122223333@s.whatsapp.net', 'hola']);
    // Y por voz, sin ningún modelo: una foto a un grupo.
    config.guardarConfig({ ...config.leerConfig(), firma: { whatsapp: '🤖', mail: 'pie' } });
    assert.deepStrictEqual(comandos.resolver('mandá una foto al grupo Casa').pasos, [{ tipo: 'foto_whatsapp', contacto: 'Casa' }]);
    assert.deepStrictEqual(comandos.resolver('mandale una foto a la familia').pasos, [{ tipo: 'foto_whatsapp', contacto: 'la familia' }]);
    assert.deepStrictEqual(comandos.resolver('mandale una foto a Evangelina').pasos, [{ tipo: 'foto_whatsapp', contacto: 'Evangelina López' }]);
  } finally { whatsapp._pruebas.ponerSocket(null, 'apagado'); whatsapp._pruebas.vaciarAgenda(); config.guardarConfig({ ...config.leerConfig(), contactos: [] }); }
});

prueba('avisos por contacto: "avisar siempre", "no avisar" y "solo los de mi lista"', () => {
  const base = config.leerConfig();
  const con = (wa) => config.guardarConfig({ ...config.leerConfig(), notificaciones: { estilo: 'ambos', whatsapp: { modo: 'todo', grupos: false, elegidos: [], silenciados: [], ...wa }, mail: { modo: 'todo' }, reglas: [{ origen: 'todos', quien: '', accion: 'callar', modos: ['dormido'] }] } });
  let modo = 'normal';
  notificaciones.configurar({ modo: () => modo, alAvisar() {}, alCambiar() {} });
  const que = (dato) => notificaciones.decidir({ origen: 'whatsapp', de: 'X', texto: 'hola', ...dato });
  try {
    con({});
    assert.strictEqual(que({}), 'avisar');
    assert.strictEqual(que({ avisar: 'nunca', enLista: true }), 'callar');
    assert.strictEqual(que({ grupo: 'Casa' }), 'callar', 'los grupos, por defecto, no');
    assert.strictEqual(que({ grupo: 'Casa', avisar: 'siempre', enLista: true }), 'avisar', 'salvo el que elegiste');
    con({ modo: 'elegidos', elegidos: ['eva', 'Familia'] });
    assert.strictEqual(que({}), 'callar', 'con "solo lo que elijas", un desconocido no avisa');
    assert.strictEqual(que({ de: 'Eva López' }), 'avisar', 'alcanza con parte del nombre');
    assert.strictEqual(que({ de: 'Mamá', grupo: 'Familia' }), 'avisar', 'un grupo elegido avisa (se mira el grupo, no quién escribió)');
    assert.strictEqual(que({ de: 'Eva López', grupo: 'Fútbol 5' }), 'callar', 'un grupo no avisa porque una persona elegida escriba ahí');
    assert.strictEqual(que({ avisar: 'siempre', enLista: true }), 'avisar', '"Avisar siempre" de Ajustes → WhatsApp también cuenta como elegido');
    assert.strictEqual(notificaciones.evaluar({ origen: 'whatsapp', de: 'Beto', texto: 'x' }).motivo, 'no-elegido');
    con({ modo: 'elegidos', elegidos: ['eva'], silenciados: ['eva lopez'] });
    assert.strictEqual(que({ de: 'Eva López' }), 'callar', 'lo silenciado gana sobre lo elegido');
    con({ modo: 'nada', elegidos: ['eva'] });
    assert.strictEqual(que({ de: 'Eva López' }), 'callar', '"Nada" calla todo');
    assert.strictEqual(que({ de: 'Eva López', avisar: 'siempre' }), 'callar', '…incluso al que marcaste "Avisar siempre"');
    con({ modo: 'todo', grupos: true, silenciados: ['Spam'] });
    assert.strictEqual(que({ grupo: 'Casa' }), 'avisar', 'con "incluir grupos" avisan');
    assert.strictEqual(que({ de: 'Spam Bot' }), 'callar', 'en "Todo" se calla lo silenciado');
    con({});
    modo = 'dormido';
    assert.strictEqual(que({ avisar: 'siempre', enLista: true }), 'callar', 'el modo dormido calla a todos igual');
    modo = 'normal';
    // Lo que se guarda no arrastra los datos que solo servían para decidir.
    notificaciones.limpiar();
    notificaciones.agregar({ origen: 'whatsapp', de: 'Eva', texto: 'hola', clave: 'eva@s', avisar: 'siempre', enLista: true });
    assert.deepStrictEqual(Object.keys(notificaciones.pendientes()[0]).sort(), ['clave', 'cuando', 'de', 'id', 'origen', 'texto']);
    assert.strictEqual(notificaciones.deGrupo('whatsapp|Eva').length, 1);
    notificaciones.limpiar();
  } finally { config.guardarConfig({ ...config.leerConfig(), notificaciones: base.notificaciones }); }
});

prueba('la palabra clave por texto: "Jarvis" dicho como salga, con o sin el pedido pegado', () => {
  const d = (t) => { const r = comandos.despertar(t); return r ? r.resto : null; };
  assert.strictEqual(d('Jarvis'), '');
  assert.strictEqual(d('Che, Jarvis.'), '');
  assert.strictEqual(d('Hey Yarvis, poné música'), 'poné música');
  assert.strictEqual(d('Yarbis qué hora es'), 'qué hora es');
  assert.strictEqual(d('A ver, Jarbis, ¿va a llover mañana?'), 'va a llover mañana');
  assert.strictEqual(d('Yar vis poné los Simpson'), 'poné los Simpson', 'cuando el oído lo parte en dos');
  assert.strictEqual(d('Poné música, Jarvis'), null, 'al final no: solo lo llama quien empieza con su nombre');
  assert.strictEqual(d('Hola, grupo. Este es mi nuevo asistente, le puedo decir Che Jarvis'), null, 'nombrarlo hablando con otros no lo despierta');
  assert.strictEqual(d('Charvis'), '');
  assert.strictEqual(d('Key Jarvis pone los Simpson'), 'pone los Simpson', 'una palabrita mal oída adelante se perdona');
  assert.strictEqual(d('Cheyarvis Modo Silencio'), 'Modo Silencio', 'el saludo pegado al nombre');
  // Formas que el usuario le enseñó ("así escribe el oído mi Jarvis").
  assert.strictEqual(comandos.despertar('Che Harris, poné música'), null);
  assert.strictEqual(comandos.despertar('Che Harris, poné música', { extras: ['harris'] }).resto, 'poné música');
  assert.strictEqual(comandos.formaNueva('Che Harris.'), 'harris');
  assert.strictEqual(comandos.formaNueva('Jarvis'), null, 'si ya la reconoce no hay nada que anotar');
  assert.strictEqual(comandos.formaNueva('hola qué tal cómo va'), null, 'una frase no es una forma de decir Jarvis');
  // Algo que solo suena parecido ("Tardis", "Hey Garris") no alcanza… salvo que el detector clásico también haya notado algo.
  assert.strictEqual(cerebro.loLlaman('Hey Garris, ¿qué hora es?', 1.5), null);
  cerebro.pista(0.09);
  assert.strictEqual(cerebro.loLlaman('Hey Garris, ¿qué hora es?', 1.5).resto, 'qué hora es');
  assert.strictEqual(cerebro.loLlaman('Buenas tardes, ¿cómo va?', 1.5), null, 'ni con pista: no suena a Jarvis');
  cerebro.pista(0);
  // Lo que NO lo despierta: charla común, o nombrarlo en medio de una frase.
  for (const no of ['Hola, ¿cómo andás?', 'Ayer le dije a Jarvis que pusiera música y no anduvo bien', 'Harris dijo que venía', 'ya vi esa serie', 'jarra de agua', '']) assert.strictEqual(d(no), null, no);
});

prueba('mails: avisa solo de lo nuevo sin leer, no toca nada, y explica bien cuando la clave está mal', async () => {
  let hoodiecrow;
  try { hoodiecrow = require('hoodiecrow-imap'); } catch { console.log('      (salteada: falta el servidor de correo de prueba; corré "npm install")'); return; }
  const mail = (de, asunto) => `From: ${de}\r\nTo: yo@gmail.com\r\nSubject: ${asunto}\r\nDate: Tue, 10 Nov 2026 12:00:00 -0300\r\nMessage-ID: <${Math.random()}@x>\r\n\r\nHola!`;
  const gmail = hoodiecrow({ plugins: ['X-GM-EXT-1', 'SASL-IR'], users: { 'yo@gmail.com': { password: 'abcdabcdabcdabcd' } }, storage: { INBOX: { messages: [{ raw: mail('viejo@x.com', 'Mail viejo'), flags: [] }] } } });
  await new Promise((ok) => gmail.listen(47966, ok));
  const cuentas = (gm, out = { usuario: '', idAplicacion: '', token: '' }) => config.guardarConfig({ ...config.leerConfig(), correo: { cadaSegundos: 90, gmail: gm, outlook: out } });
  try {
    cuentas({ usuario: 'yo@gmail.com', clave: 'abcd abcd abcd abcd', soloPrincipal: true });
    assert.strictEqual(await correo.probar('gmail'), 'Conectado: 1 sin leer de 1 en la bandeja de entrada.');
    assert.deepStrictEqual(await correo.revisar('gmail'), [], 'la primera vez no avisa de lo que ya estaba');
    gmail.appendMessage('INBOX', [], new Date(), Buffer.from(mail('"Martín Pérez" <martin@x.com>', '=?UTF-8?B?UmV1bmnDs24gbWHDsWFuYQ==?=')));
    gmail.appendMessage('INBOX', ['\\Seen'], new Date(), Buffer.from(mail('leido@x.com', 'Ya leído en el celular')));
    gmail.appendMessage('INBOX', [], new Date(), Buffer.from(mail('ofertas@tienda.com', '50% OFF')));
    const nuevos = await correo.revisar('gmail');
    assert.deepStrictEqual(nuevos.map(({ mensajeId, ...resto }) => resto), [
      { via: '', cuenta: 'gmail', uid: 2, de: 'Martín Pérez', direccion: 'martin@x.com', asunto: 'Reunión mañana', responderA: 'martin@x.com' },
      { via: '', cuenta: 'gmail', uid: 4, de: 'ofertas@tienda.com', direccion: 'ofertas@tienda.com', asunto: '50% OFF', responderA: 'ofertas@tienda.com' },
    ]);
    assert.match(nuevos[0].mensajeId, /^<.+@x>$/, 'se guarda el identificador del mail, para poder contestarlo en el mismo hilo');
    assert.deepStrictEqual(await correo.revisar('gmail'), [], 'no repite');
    // Lo que Hotmail reenvía a Gmail se reconoce por llegar "para" la dirección de Hotmail, y su click abre Outlook.
    cuentas({ usuario: 'yo@gmail.com', clave: 'abcd abcd abcd abcd', soloPrincipal: true }, { usuario: 'Yo@Hotmail.com', idAplicacion: '', token: '' });
    gmail.appendMessage('INBOX', [], new Date(), Buffer.from(mail('banco@x.com', 'Resumen').replace('To: yo@gmail.com', 'To: yo@hotmail.com')));
    const reenviado = await correo.revisar('gmail');
    assert.strictEqual(reenviado.length, 1);
    assert.strictEqual(reenviado[0].via, 'outlook');
    assert.strictEqual(correo.enlaceDe(reenviado[0]), 'https://outlook.live.com/mail/0/inbox');
    cuentas({ usuario: 'yo@gmail.com', clave: 'abcd abcd abcd abcd', soloPrincipal: true });
    assert.strictEqual(await correo.probar('gmail'), 'Conectado: 4 sin leer de 5 en la bandeja de entrada.', 'revisar no marca nada como leído');
    cuentas({ usuario: 'yo@gmail.com', clave: 'equivocada', soloPrincipal: true });
    await assert.rejects(() => correo.revisar('gmail'), /Gmail: no aceptó el usuario o la clave/);
    assert.match(correo.leerEstado().gmail.error, /no aceptó/);
    cuentas({ usuario: '', clave: '', soloPrincipal: true });
    assert.deepStrictEqual(await correo.revisar('gmail'), [], 'sin cuenta cargada no hace nada');
  } finally { await new Promise((r) => gmail.close(r)); }
});

prueba('contestar un mail: sale por Gmail, en el mismo hilo y con el pie de Jarvis', async () => {
  let SMTPServer;
  try { ({ SMTPServer } = require('smtp-server')); } catch { console.log('      (salteada: falta el servidor de salida de prueba; corré "npm install")'); return; }
  const recibidos = [];
  const salida = new SMTPServer({
    authOptional: false, disabledCommands: ['STARTTLS'], allowInsecureAuth: true, logger: false,
    onAuth: (a, _s, listo) => (a.username === 'yo@gmail.com' && a.password === 'abcdabcdabcdabcd' ? listo(null, { user: a.username }) : listo(new Error('Invalid login: 535'))),
    onData: (flujo, sesion, listo) => { let t = ''; flujo.on('data', (d) => { t += d; }); flujo.on('end', () => { recibidos.push({ de: sesion.envelope.mailFrom.address, para: sesion.envelope.rcptTo.map((r) => r.address), crudo: t }); listo(); }); },
  });
  await new Promise((ok) => salida.listen(47968, '127.0.0.1', ok));
  const base = config.leerConfig();
  try {
    config.guardarConfig({ ...base, usuario: 'Sofía', firma: { whatsapp: '🤖', mail: '🤖 Mail enviado con mi bot asistente Jarvis' }, correo: { ...base.correo, gmail: { usuario: 'yo@gmail.com', clave: 'abcd abcd abcd abcd', soloPrincipal: true } } });
    const mail = { cuenta: 'gmail', de: 'Martín Pérez', direccion: 'martin@x.com', responderA: 'martin@x.com', asunto: 'Reunión mañana', mensajeId: '<abc123@x>' };
    assert.strictEqual(await correo.responder(mail, 'Dale, nos vemos a las diez.'), 'Mail enviado a Martín Pérez.');
    assert.deepStrictEqual([recibidos[0].de, recibidos[0].para], ['yo@gmail.com', ['martin@x.com']]);
    const crudo = recibidos[0].crudo;
    assert.match(crudo, /^Subject: =\?UTF-8\?Q\?Re=3A_Reuni=C3=B3n_ma=C3=B1ana\?=/m);
    assert.match(crudo, /^In-Reply-To: <abc123@x>/m);
    assert.match(crudo, /^References: <abc123@x>/m);
    const cuerpo = Buffer.from(crudo.split(/\r?\n\r?\n/).slice(1).join('\n\n').replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
    assert.match(cuerpo, /Dale, nos vemos a las diez\.\s+🤖 Mail enviado con mi bot asistente Jarvis/);
    // Un mail que ya era respuesta no acumula "Re: Re:".
    await correo.responder({ ...mail, asunto: 'RE: Presupuesto' }, 'Perfecto.');
    assert.match(recibidos[1].crudo, /^Subject: RE: Presupuesto/m);
    // Un mail nuevo (aviso del calendario): sin destinatario va a mi propio Gmail; con uno, a esa dirección.
    assert.match(await correo.enviar({ asunto: 'Recordatorio: Examen', texto: 'Empieza en 1 h' }), /Mail enviado a yo@gmail\.com/);
    await correo.enviar({ para: 'otra@x.com', asunto: 'Hola', texto: 'Texto' });
    assert.deepStrictEqual([recibidos[2].para, recibidos[3].para], [['yo@gmail.com'], ['otra@x.com']]);
    await assert.rejects(() => correo.enviar({ para: 'no-es-mail', texto: 'x' }), /no parece una dirección/);
    recibidos.splice(2, 2);
    // Lo que no se puede: sin texto, de una cuenta que no es Gmail, o con la clave mal.
    await assert.rejects(() => correo.responder(mail, '   '), /está vacía/);
    await assert.rejects(() => correo.responder({ ...mail, cuenta: 'outlook' }, 'hola'), /solo puedo contestar los mails que llegan a Gmail/);
    config.guardarConfig({ ...config.leerConfig(), correo: { ...base.correo, gmail: { usuario: 'yo@gmail.com', clave: 'mala', soloPrincipal: true } } });
    await assert.rejects(() => correo.responder(mail, 'hola'), /No pude enviar el mail: Gmail no aceptó la contraseña de aplicación/);
    assert.strictEqual(recibidos.length, 2);
  } finally { config.guardarConfig({ ...config.leerConfig(), correo: base.correo }); await new Promise((r) => salida.close(r)); }
});

prueba('Hotmail/Outlook: el permiso se da con un código en la página de Microsoft, y con eso se lee la casilla', async () => {
  let hoodiecrow;
  try { hoodiecrow = require('hoodiecrow-imap'); } catch { console.log('      (salteada: falta el servidor de correo de prueba)'); return; }
  let autorizo = false;
  const microsoft = [];
  const s = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; });
    req.on('end', () => {
      const campos = Object.fromEntries(new URLSearchParams(cuerpo));
      microsoft.push({ ruta: req.url, ...campos });
      let r = { estado: 400, json: { error: 'invalid_request' } };
      if (req.url === '/devicecode') r = { estado: 200, json: { device_code: 'interno', user_code: 'ABCD-1234', verification_uri: 'https://microsoft.com/link', interval: 1, expires_in: 900 } };
      else if (campos.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') r = autorizo ? { estado: 200, json: { access_token: 'acceso-1', refresh_token: 'renovable-1', expires_in: 3600 } } : { estado: 400, json: { error: 'authorization_pending' } };
      else if (campos.grant_type === 'refresh_token') r = campos.refresh_token === 'renovable-1' ? { estado: 200, json: { access_token: 'acceso-1', refresh_token: 'renovable-2', expires_in: 3600 } } : { estado: 400, json: { error: 'invalid_grant' } };
      res.writeHead(r.estado, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.json));
    });
  });
  await new Promise((ok) => s.listen(47965, '127.0.0.1', ok));
  const outlook = hoodiecrow({ plugins: ['XOAUTH2', 'SASL-IR'], users: { 'yo@hotmail.com': { password: 'x', xoauth2: { accessToken: 'acceso-1', sessionTimeout: 3600000 } } }, storage: { INBOX: { messages: [] } } });
  await new Promise((ok) => outlook.listen(47967, ok));
  try {
    config.guardarConfig({ ...config.leerConfig(), correo: { cadaSegundos: 90, gmail: { usuario: '', clave: '', soloPrincipal: true }, outlook: { usuario: 'yo@hotmail.com', idAplicacion: '', token: '' } } });
    await assert.rejects(() => correo.conectarOutlook(), /Falta el "Id de aplicación"/);
    config.leerConfig().correo.outlook.idAplicacion = 'mi-app';
    const { codigo, url, espera } = await correo.conectarOutlook();
    assert.deepStrictEqual([codigo, url], ['ABCD-1234', 'https://microsoft.com/link']);
    assert.strictEqual(microsoft[0].client_id, 'mi-app');
    assert.match(microsoft[0].scope, /IMAP\.AccessAsUser\.All offline_access/);
    await new Promise((r) => setTimeout(r, 120));
    assert.strictEqual(correo.configurada('outlook'), false, 'mientras no autorices, sigue esperando');
    autorizo = true;
    assert.strictEqual(await espera, true);
    assert.strictEqual(config.leerConfig().correo.outlook.token, 'renovable-1', 'se guarda el permiso, nunca una contraseña');
    assert.strictEqual(await correo.probar('outlook'), 'Conectado: 0 sin leer de 0 en la bandeja de entrada.');
    assert.deepStrictEqual(await correo.revisar('outlook'), []);
    outlook.appendMessage('INBOX', [], new Date(), Buffer.from('From: "Banco" <avisos@banco.com>\r\nSubject: Tu resumen\r\n\r\nHola'));
    assert.deepStrictEqual(await correo.revisar('outlook'), [{ via: '', cuenta: 'outlook', uid: 1, de: 'Banco', direccion: 'avisos@banco.com', asunto: 'Tu resumen', responderA: 'avisos@banco.com', mensajeId: '' }]);
  } finally { s.closeAllConnections(); await new Promise((r) => s.close(r)); await new Promise((r) => outlook.close(r)); }
});

prueba('streaming: abre el título en el servicio donde está, y si no está en ninguno propio, en Stremio', async () => {
  const abiertos = [];
  const enTele = [];
  streaming.configurar({ abrir: async (url) => { abiertos.push(url); }, youtubeEnTele: async (tele, video) => { enTele.push([tele, video]); return 'ok'; }, appEnTele: async (tele, enlace) => { enTele.push([tele, enlace]); } });
  const catalogo = { Loki: { id: 1, media_type: 'tv', name: 'Loki', en: ['Disney Plus'], imdb: 'tt9140554' }, Dark: { id: 2, media_type: 'tv', name: 'Dark', en: ['Netflix', 'Netflix basic with Ads'], imdb: 'tt5753856' }, Matrix: { id: 3, media_type: 'movie', title: 'Matrix', en: ['Max'], imdb: 'tt0133093' }, Rara: { id: 4, media_type: 'movie', title: 'Película rara', en: [], imdb: 'tt0000001' } };
  const s = await servidorFalso(47964, (p) => {
    const u = new URL(p.ruta, 'http://x');
    if (u.searchParams.get('api_key') !== 'clave-tmdb' && u.pathname.startsWith('/tmdb')) return { estado: 401, cuerpo: {} };
    if (u.pathname === '/tmdb/search/multi') { const o = catalogo[u.searchParams.get('query')]; return { cuerpo: { results: [{ id: 99, media_type: 'person', name: 'Alguien' }, ...(o ? [o] : [])] } }; }
    const obra = Object.values(catalogo).find((o) => u.pathname.includes(`/${o.media_type}/${o.id}/`));
    if (obra && u.pathname.endsWith('/watch/providers')) return { cuerpo: { results: { AR: { flatrate: obra.en.map((n) => ({ provider_name: n })) }, US: { flatrate: [{ provider_name: 'Hulu' }] } } } };
    if (obra && u.pathname.endsWith('/external_ids')) return { cuerpo: { imdb_id: obra.imdb } };
    if (u.pathname === '/datos/search') return { cuerpo: { items: [{ id: { videoId: 'VIDEO123' }, snippet: { title: 'Gatitos graciosos' } }] } };
    return null;
  });
  const st = (cambios) => config.guardarConfig({ ...config.leerConfig(), streaming: { ...config.leerConfig().streaming, ...cambios } });
  try {
    st({ tmdb: 'clave-tmdb', pais: 'AR' });
    assert.strictEqual(await streaming.ver({ titulo: 'Loki' }), '"Loki" está en Disney+: te lo abrí ahí.');
    assert.strictEqual(abiertos.pop(), 'https://www.disneyplus.com/search?q=Loki');
    assert.strictEqual(await streaming.ver({ titulo: 'Matrix' }), '"Matrix" está en HBO Max: te lo abrí ahí.', 'reconoce a HBO Max aunque el catálogo lo llame "Max"');
    assert.strictEqual(abiertos.pop(), 'https://play.hbomax.com/search?q=Matrix');
    // Netflix no está tildado entre los servicios propios: va a Stremio, directo a la ficha.
    assert.strictEqual(await streaming.ver({ titulo: 'Dark' }), '"Dark" no está en tus servicios (está en Netflix, Netflix basic with Ads): te lo abrí en Stremio.');
    assert.strictEqual(abiertos.pop(), 'stremio:///detail/series/tt5753856');
    assert.match(await streaming.ver({ titulo: 'Rara' }), /no está en tus servicios: te lo abrí en Stremio/);
    assert.strictEqual(abiertos.pop(), 'stremio:///detail/movie/tt0000001/tt0000001');
    // Nombrando el servicio no hace falta averiguar nada.
    assert.strictEqual(await streaming.ver({ titulo: 'Emily en París', servicio: 'netflix' }), 'Abrí Netflix con "Emily en París".');
    assert.strictEqual(abiertos.pop(), 'https://www.netflix.com/search?q=Emily%20en%20Par%C3%ADs');
    await assert.rejects(() => streaming.ver({ titulo: 'Loki', servicio: 'blockbuster' }), /No conozco el servicio/);
    // Sin clave de TMDB (o con una mala): Stremio, avisando por qué.
    st({ tmdb: '' });
    assert.match(await streaming.ver({ titulo: 'Loki' }), /^Te abrí "Loki" en Stremio\. Con una clave gratuita de TMDB/);
    assert.strictEqual(abiertos.pop(), 'stremio:///search?search=Loki');
    st({ tmdb: 'mala' });
    assert.match(await streaming.ver({ titulo: 'Loki' }), /No pude consultar dónde está: la clave de TMDB no es válida/);
    abiertos.length = 0;
    // En la tele: solo YouTube.
    config.guardarConfig({ ...config.leerConfig(), teles: [{ nombre: 'Tele Comedor', cast: 'Living TV' }], musica: { apiKeyYoutube: 'clave-yt', porDefecto: '' } });
    assert.strictEqual(await streaming.ver({ titulo: 'gatos', dispositivo: 'la tele' }), 'Poniendo "Gatitos graciosos" de YouTube en Tele Comedor.');
    assert.deepStrictEqual(enTele.pop(), ['Tele Comedor', 'VIDEO123']);
    // Un servicio con app: se abre la app en la tele con el control remoto de Google TV.
    assert.strictEqual(await streaming.ver({ titulo: 'Loki', servicio: 'disney', dispositivo: 'la tele' }), '"Loki" está en Disney+: te abrí la app en Tele Comedor. El título elegilo vos con el control.');
    assert.deepStrictEqual(enTele.pop(), ['Tele Comedor', 'https://www.disneyplus.com']);
    assert.strictEqual(abiertos.length, 0);
    // Y por voz, sin ningún modelo.
    usarIA({});
    st({ tmdb: 'clave-tmdb' });
    acciones.configurar({ decir() {}, fijarModo() {}, pedirAlNotch: async () => { throw new Error('sin notch'); } });
    assert.strictEqual((await cerebro.decidir('Poné la serie Loki', { historial: [] })).texto, '"Loki" está en Disney+: te lo abrí ahí.');
  } finally { await s.cerrar(); }
});

prueba('"poné tal cosa": si es una serie conocida es para ver; si no, es música. Y "poné a Racing" averigua el canal', async () => {
  const abiertos = [];
  streaming.configurar({ abrir: async (url) => { abiertos.push(url); }, youtubeEnTele: async () => 'ok' });
  const catalogo = {
    'los Simpson': { id: 1, media_type: 'tv', name: 'Los Simpson', original_name: 'The Simpsons', vote_count: 9800, en: ['Disney Plus'] },
    'Soda Stereo': { id: 2, media_type: 'movie', title: 'Soda Stereo', vote_count: 4, en: [] }, // un documental perdido que se llama igual que la banda
    'algo de Charly': { id: 3, media_type: 'movie', title: 'Charly: días de sangre', vote_count: 900, en: ['Netflix'] }, // conocido, pero no es lo que se pidió
  };
  const s = await servidorFalso(47964, (p) => {
    const u = new URL(p.ruta, 'http://x');
    if (u.pathname === '/tmdb/search/multi') { const o = catalogo[u.searchParams.get('query')]; return { cuerpo: { results: o ? [o] : [] } }; }
    const obra = Object.values(catalogo).find((o) => u.pathname.includes(`/${o.media_type}/${o.id}/`));
    if (obra && u.pathname.endsWith('/watch/providers')) return { cuerpo: { results: { AR: { flatrate: obra.en.map((n) => ({ provider_name: n })) } } } };
    if (obra && u.pathname.endsWith('/external_ids')) return { cuerpo: { imdb_id: 'tt1' } };
    return null;
  });
  const otros = await servidorFalso(47963, (p) => (p.ruta.startsWith('/tavily') ? { cuerpo: { answer: p.json.query.includes('Racing') ? 'Racing juega hoy a las 21:15 contra Lanús. Transmite ESPN Premium, también por la app de ESPN.' : 'No encontré información sobre ese partido.', results: [] } } : null));
  const base = config.leerConfig();
  const tomado = async (titulo) => { const e = historial.empezar(titulo, 'voz'); let r; try { r = await streaming.poner({ titulo }); } catch (er) { r = `ERROR ${er.message}`; } historial.terminar(e, { respuesta: r }); return [r, e.detalle.map((d) => d.texto).join(' | ')]; };
  try {
    usarIA({});
    config.guardarConfig({ ...config.leerConfig(), streaming: { ...base.streaming, tmdb: 'clave-tmdb', pais: 'AR', navegador: 'predeterminado', equipos: 'Deportivo Riestra' }, busqueda: { tavily: 'tvly-buena' }, musica: { apiKeyYoutube: '', porDefecto: '' } });
    // El caso que falló: "poné los Simpson" contestaba que no podía reproducir la canción.
    assert.deepStrictEqual(comandos.resolver('Poné los Simpson').pasos, [{ tipo: 'poner', titulo: 'los Simpson' }]);
    const [r1, d1] = await tomado('los Simpson');
    assert.match(r1, /^"Los Simpson" está en Disney\+: te lo abrí ahí\. Si querías la canción, decime "poné la canción los Simpson"\.$/);
    assert.strictEqual(abiertos.pop(), 'https://www.disneyplus.com/search?q=Los%20Simpson');
    assert.match(d1, /TMDB: "Los Simpson" \(serie, 9800 votos\) — en AR: Disney Plus/);
    // Un título desconocido que se llama igual que una banda, o uno conocido que no es lo pedido: música.
    for (const titulo of ['Soda Stereo', 'algo de Charly', 'Persiana Americana']) {
      const [, detalle] = await tomado(titulo);
      assert.match(detalle, /Lo tomé como música\./, titulo);
    }
    assert.strictEqual(abiertos.length, 0, 'no abrió ningún servicio de streaming para la música');
    // Sin clave de TMDB no hay forma de saber: música, y queda dicho por qué.
    config.guardarConfig({ ...config.leerConfig(), streaming: { ...config.leerConfig().streaming, tmdb: '' } });
    assert.match((await tomado('los Simpson'))[1], /Sin clave de TMDB/);
    // Lo que sigue yendo por su regla de siempre.
    assert.strictEqual(comandos.resolver('poné música').pasos[0].tipo, 'musica');
    assert.strictEqual(comandos.resolver('poné la canción Persiana Americana').pasos[0].tipo, 'musica');
    assert.strictEqual(comandos.resolver('poné la serie Dark').pasos[0].tipo, 'ver');
    assert.strictEqual(comandos.resolver('poné el volumen en 30').pasos[0].tipo, 'volumen');
    assert.strictEqual(comandos.resolver('poné un recordatorio en diez minutos de sacar la pizza').pasos[0].tipo, 'recordatorio');
    assert.deepStrictEqual(comandos.resolver('Poné a Charly García').pasos, [{ tipo: 'poner', titulo: 'Charly García' }], '"poné a" + alguien que no es un equipo: se decide entre ver y escuchar');
    // Fútbol.
    assert.deepStrictEqual(comandos.resolver('Poné a Racing').pasos, [{ tipo: 'partido', equipo: 'racing' }]);
    assert.deepStrictEqual(comandos.resolver('quiero ver el partido de Boca').pasos, [{ tipo: 'partido', equipo: 'boca' }]);
    assert.deepStrictEqual(comandos.resolver('poné a Deportivo Riestra').pasos, [{ tipo: 'partido', equipo: 'deportivo riestra' }], 'un equipo cargado en Ajustes');
    assert.strictEqual(streaming.canalEn('Va por ESPN Premium y también por ESPN.'), 'ESPN Premium');
    assert.strictEqual(streaming.canalEn('Lo pasa TNT Sports; el otro partido, ESPN 2.'), 'TNT Sports');
    assert.strictEqual(streaming.canalEn('No hay partido hoy.'), null);
    // Flow viene cargado en la lista de servicios: se abre y se dice dónde buscar el canal.
    abiertos.length = 0;
    assert.strictEqual(await streaming.partido({ equipo: 'Racing' }), 'Racing va por ESPN Premium. Te abrí Flow: buscá ESPN Premium en la guía.');
    assert.deepStrictEqual(abiertos, ['https://web.flow.com.ar/']);
    assert.match(await streaming.partido({ equipo: 'Boca' }), /^No pude confirmar por qué canal va Boca\. Igual te abrí Flow\. Esto es lo que encontré: No encontré información/);
  } finally {
    config.guardarConfig({ ...config.leerConfig(), streaming: base.streaming, busqueda: base.busqueda, musica: base.musica });
    await s.cerrar(); await otros.cerrar();
  }
});

prueba('el historial guarda qué se pidió, qué se contestó y con qué se resolvió', async () => {
  historial.limpiar();
  let modo = 'normal';
  acciones.configurar({ decir() {}, fijarModo: (m) => { modo = m; }, pedirAlNotch: async () => { throw new Error('sin notch'); } });
  cerebro.configurar({ estado() {}, salida() {}, cortar() {}, texto() {}, modo: () => modo, vozDeWindows: async () => {}, programas: () => [] });
  usarIA({});
  const original = modelos.instalado;
  modelos.instalado = () => false;
  try {
    await cerebro.texto('Modo silencio');
    await cerebro.texto('Mandale una foto a Fulano de Tal');
    cerebro.cancelar();
    const [ultimo, primero] = historial.recientes();
    assert.deepStrictEqual([primero.dicho, primero.respuesta, primero.origen, primero.ok], ['Modo silencio', 'Modo silencio.', 'texto', true]);
    assert.match(primero.detalle.map((d) => d.texto).join(' | '), /^Regla directa, sin modelo: modo \| Acción modo \(modo: silencio\) → Modo silencio\. \(\d+ ms\)$/);
    assert.strictEqual(ultimo.ok, false, 'un pedido que no se pudo resolver queda marcado');
    assert.match(ultimo.detalle[0].texto, /Ninguna regla directa lo cubre/);
    assert.strictEqual(typeof ultimo.ms, 'number');
    // Lo que Jarvis hace con un click también queda, con el error si lo hubo.
    await assert.rejects(() => historial.registrar('Responder el WhatsApp de Eva: hola', 'click', async () => { throw new Error('WhatsApp no está conectado'); }));
    assert.deepStrictEqual([historial.recientes()[0].ok, historial.recientes()[0].respuesta, historial.recientes()[0].origen], [false, 'WhatsApp no está conectado', 'click']);
    // Se guarda en disco, se puede borrar de a uno o todo.
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(process.env.JARVIS_DATOS, 'historial.json'), 'utf8')).length, 3);
    historial.borrar(ultimo.id);
    assert.strictEqual(historial.recientes().length, 2);
    historial.limpiar();
    assert.deepStrictEqual(historial.recientes(), []);
  } finally { modelos.instalado = original; modo = 'normal'; }
});

prueba('dictar la respuesta a un aviso: se escucha una frase y se devuelve el texto, sin tratarla como un pedido', async () => {
  const fases = [];
  const textos = [];
  cerebro.configurar({ estado: (f) => fases.push(f), salida() {}, cortar() {}, texto: (q, t) => textos.push(t), modo: () => 'normal', vozDeWindows: async () => {}, programas: () => [] });
  const original = { instalado: modelos.instalado, preparar: oido.preparar, escuchar: oido.escuchar, transcribir: oido.transcribir };
  modelos.instalado = (id) => id === 'vad' || id === 'oido';
  oido.preparar = async () => ({ vad: true, oido: true });
  oido.escuchar = () => {};
  oido.transcribir = async () => ' Modo silencio ';
  try {
    const espera = cerebro.dictar();
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(cerebro.activa());
    oido.alSegmentoDePrueba(new Int16Array(16000));
    assert.strictEqual(await espera, 'Modo silencio', 'aunque suene a un comando, es solo el texto dictado');
    assert.strictEqual(cerebro.activa(), false);
    assert.deepStrictEqual(textos, [], 'no se muestra ni se ejecuta como pedido');
    // Si se cancela (o no se dice nada), devuelve vacío.
    const otra = cerebro.dictar();
    await new Promise((r) => setTimeout(r, 20));
    cerebro.cancelar();
    assert.strictEqual(await otra, '');
  } finally {
    Object.assign(modelos, { instalado: original.instalado });
    Object.assign(oido, { preparar: original.preparar, escuchar: original.escuchar, transcribir: original.transcribir });
    cerebro.cancelar();
  }
});

prueba('YouTube en la tele: se le manda el video por el control remoto de YouTube, paso por paso', async () => {
  const pasos = [];
  let pantallaConfirma = false;
  const yt = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      pasos.push({ metodo: req.method, ruta: u.pathname, consulta: Object.fromEntries(u.searchParams), campos: Object.fromEntries(new URLSearchParams(cuerpo)), token: req.headers['x-youtube-loungeid-token'], origen: req.headers.origin });
      if (u.pathname.endsWith('/get_lounge_token_batch')) { res.end(JSON.stringify({ screens: [{ screenId: 'pantalla-1', loungeToken: 'ficha-1' }] })); return; }
      if (!u.searchParams.get('SID')) { res.end('168\n[[0,["c","SID-abc","",8]]\n,[1,["S","GS-xyz"]]\n]\n'); return; }
      if (req.method === 'GET' && pantallaConfirma) { res.end('[[3,["nowPlaying",{"videoId":"VIDEO123","state":"1"}]]]'); return; }
      res.end('ok');
    });
  });
  await new Promise((ok) => yt.listen(47964, '127.0.0.1', ok));
  try {
    const confirmado = await cast.mandarAYoutube('pantalla-1', 'VIDEO123');
    assert.strictEqual(confirmado, false, 'sin que la pantalla confirme, no se dice que arrancó');
    const posts = pasos.filter((p) => p.metodo === 'POST');
    assert.ok(pasos.some((p) => p.metodo === 'GET' && p.consulta.TYPE === 'xmlhttp' && p.consulta.SID === 'SID-abc'), 'se queda escuchando lo que cuenta la pantalla');
    pasos.splice(0, pasos.length, ...posts.slice(0, 3));
    assert.deepStrictEqual(pasos.map((p) => p.ruta), ['/youtube/api/lounge/pairing/get_lounge_token_batch', '/youtube/api/lounge/bc/bind', '/youtube/api/lounge/bc/bind']);
    assert.strictEqual(pasos[0].campos.screen_ids, 'pantalla-1');
    assert.deepStrictEqual([pasos[1].token, pasos[1].consulta.RID, pasos[1].campos.device, pasos[1].campos.pairing_type], ['ficha-1', '0', 'REMOTE_CONTROL', 'cast']);
    assert.deepStrictEqual(pasos[2].consulta, { SID: 'SID-abc', gsessionid: 'GS-xyz', RID: '1', VER: '8', CVER: '1' });
    assert.deepStrictEqual(pasos[2].campos, { req0_listId: '', req0__sc: 'setPlaylist', req0_currentTime: '0', req0_currentIndex: '-1', req0_audioOnly: 'false', req0_videoId: 'VIDEO123', count: '1', ofs: '0' });
    assert.strictEqual(pasos[2].origen, 'https://www.youtube.com/');
    pantallaConfirma = true;
    assert.strictEqual(await cast.mandarAYoutube('pantalla-1', 'VIDEO123'), true, 'si la pantalla cuenta que está reproduciendo, se confirma');
  } finally { yt.closeAllConnections(); await new Promise((r) => yt.close(r)); }
});

prueba('el audio que se manda a transcribir afuera es un WAV válido', () => {
  const w = cerebro.wav(new Int16Array([0, 1000, -1000, 32767]), 16000);
  assert.strictEqual(w.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(w.readUInt32LE(24), 16000);
  assert.strictEqual(w.readUInt32LE(40), 8);
  assert.strictEqual(w.readInt16LE(44 + 6), 32767);
});

prueba('Iniciar con Windows: se detectan y borran las entradas rotas de una versión anterior, no las buenas', () => {
  const inicio = require('../src/main/inicio');
  const salida = [
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    '    Jarvis    REG_SZ    C:\\Jarvis\\node_modules\\electron\\dist\\electron.exe ""D:\\Apps\\Jarvis""',
    '    electron.app.Jarvis    REG_SZ    "C:\\x\\electron.exe" \\"D:\\Apps\\Jarvis\\"',
    '    JarvisBueno    REG_SZ    D:\\Apps\\Jarvis\\Jarvis.exe',
    '    OneDrive    REG_SZ    "C:\\Users\\x\\OneDrive.exe" /background',
    ''
  ].join('\r\n');
  const rotas = inicio.entradasRotas(inicio.leerEntradas(salida)).map((e) => e.nombre);
  assert.deepStrictEqual(rotas, ['Jarvis', 'electron.app.Jarvis']);
});

prueba('los pedidos se entienden dicho de muchas maneras (sin ningún modelo)', () => {
  const antes = config.leerConfig();
  config.guardarConfig({ ...antes, contactos: [{ nombre: 'Tomi', numero: '5491155550000' }] });
  try {
    for (const t of ['mandale foto a Tomi', 'mandale foto Tomi', 'mandale una foto a Tomi', 'enviale una foto a Tomi', 'pasale una fotito a Tomi', 'me podés mandar una foto a Tomi', 'quiero que le mandes una foto a Tomi', 'sacale una selfie a Tomi por wasap', 'mandá una foto para Tomi']) {
      assert.deepStrictEqual((comandos.resolver(t) || {}).pasos, [{ tipo: 'foto_whatsapp', contacto: 'Tomi' }], t);
    }
  } finally { config.guardarConfig(antes); }
});

prueba('las rutinas se activan con otras frases: sinónimos, activadores propios, y si hay duda se pregunta', async () => {
  const antes = config.leerRutinas();
  config.guardarRutinas([
    { id: 'avisar_juego', nombre: 'Avisar que juego', icono: 'estrella', pasos: [{ tipo: 'decir', texto: 'Le avisé a Eva.' }], activadores: ['me voy a jugar'] },
    { id: 'modo_cine', nombre: 'Modo cine', icono: 'estrella', pasos: [{ tipo: 'decir', texto: 'Cine.' }] },
  ]);
  try {
    for (const t of ['avisá que juego', 'avisale que juego', 'decile que juego', 'contale que juego', 'me voy a jugar']) assert.deepStrictEqual(comandos.resolver(t), { rutina: 'avisar_juego', pasos: [] }, t);
    assert.strictEqual(comandos.resolver('modo cine').rutina, 'modo_cine');
    // Parecida pero no igual: pregunta.
    const duda = comandos.resolver('avisale que juego un rato');
    assert.strictEqual(duda.rutina, 'avisar_juego');
    assert.strictEqual(duda.confirmar, 'Entendí la rutina "Avisar que juego". ¿La hago?');
    assert.strictEqual(comandos.resolver('avisale a Eva que llego tarde'), null, 'otra cosa: no se la fuerza');
    // Y por la conversación: "sí" la hace, "no" la cancela, otra cosa es un pedido nuevo.
    acciones.configurar({ decir() {}, fijarModo() {}, pedirAlNotch: async () => { throw new Error('sin notch'); } });
    cerebro.configurar({ estado() {}, salida() {}, cortar() {}, texto() {}, modo: () => 'normal', vozDeWindows: async () => {}, programas: () => [] });
    const s = { historial: [] };
    assert.strictEqual((await cerebro.decidir('avisale que juego un rato', s)).texto, 'Entendí la rutina "Avisar que juego". ¿La hago?');
    assert.strictEqual((await cerebro.decidir('sí, dale', s)).texto, 'Le avisé a Eva.');
    await cerebro.decidir('avisale que juego un rato', s);
    const no = await cerebro.decidir('no', s);
    assert.deepStrictEqual([no.texto, no.terminar], ['Listo, no hago nada.', true]);
  } finally { config.guardarRutinas(antes); }
});

prueba('si un modelo interpretó un envío, pregunta "¿lo hago?"; con "sí" lo hace y aprende la frase', async () => {
  const original = acciones.ejecutarPaso;
  const hechos = [];
  acciones.ejecutarPaso = async (paso) => { hechos.push(paso); return `Listo, le mandé a ${paso.contacto}.`; };
  cerebro.configurar({ estado() {}, salida() {}, cortar() {}, texto() {}, modo: () => 'normal', vozDeWindows: async () => {}, programas: () => [] });
  const groq = await servidorFalso(47961, (p, n) => (n === 1 ? respuesta(llamada('enviar_whatsapp', { contacto: 'Eva', mensaje: 'Estoy jugando, después te llamo' })) : respuesta({ content: 'Hecho.' })));
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    const s = { historial: [] };
    const r = await cerebro.decidir('hacele saber a Eva que estoy en el partido', s);
    assert.strictEqual(r.texto, 'Entendí: mandarle a Eva este mensaje por WhatsApp: "Estoy jugando, después te llamo". ¿Lo hago?');
    assert.strictEqual(hechos.length, 0, 'todavía no mandó nada');
    const r2 = await cerebro.decidir('sí', s);
    assert.strictEqual(r2.texto, 'Listo, le mandé a Eva.');
    assert.deepStrictEqual(hechos.map((h) => [h.tipo, h.contacto]), [['whatsapp', 'Eva']]);
    // La frase quedó aprendida: la próxima vez, sin modelo (el servidor falso ya no está) y sin preguntar.
    await groq.cerrar();
    pensar.olvidar();
    const r3 = await cerebro.decidir('hacele saber a Eva que estoy en el partido', { historial: [] });
    assert.strictEqual(r3.texto, 'Listo, le mandé a Eva.');
    assert.strictEqual(hechos.length, 2);
    assert.strictEqual(require('../src/main/aprendido').todas().length, 1);
    // Con "confirmar: nunca" lo hace directo.
    config.guardarConfig({ ...config.leerConfig(), escucha: { ...config.leerConfig().escucha, confirmar: 'nunca' } });
    const groq2 = await servidorFalso(47961, (p, n) => (n === 1 ? respuesta(llamada('enviar_whatsapp', { contacto: 'Beto', mensaje: 'Hola' })) : respuesta({ content: 'Listo.' })));
    try { usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } }); await cerebro.decidir('escribile a Beto hola', { historial: [] }); } finally { await groq2.cerrar(); }
    assert.strictEqual(hechos.length, 3);
  } finally {
    acciones.ejecutarPaso = original;
    config.guardarConfig({ ...config.leerConfig(), escucha: { ...config.leerConfig().escucha, confirmar: 'dudas' } });
    require('../src/main/aprendido').olvidarTodo();
    await groq.cerrar().catch(() => {});
  }
});

prueba('un mensaje por WhatsApp a un contacto agendado en Jarvis sale directo; a uno que no está cargado, se pregunta', async () => {
  const original = acciones.ejecutarPaso;
  const hechos = [];
  acciones.ejecutarPaso = async (paso) => { hechos.push(paso); return `Listo, le mandé a ${paso.contacto}.`; };
  cerebro.configurar({ estado() {}, salida() {}, cortar() {}, texto() {}, modo: () => 'normal', vozDeWindows: async () => {}, programas: () => [] });
  const antes = config.leerConfig();
  let servidor = null;
  const con = async (contacto) => {
    servidor = await servidorFalso(47961, (p, n) => (n === 1 ? respuesta(llamada('enviar_whatsapp', { contacto, mensaje: 'Llego tarde' })) : respuesta({ content: 'Hecho.' })));
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    try { return await cerebro.decidir(`hacele saber a ${contacto} que llego tarde`, { historial: [] }); } finally { await servidor.cerrar(); pensar.olvidar(); }
  };
  try {
    config.guardarConfig({ ...antes, contactos: [{ nombre: 'Eva, mi hermana', numero: '5491100000000', avisar: '' }] });
    let r = await con('Eva');
    assert.strictEqual(r.texto, 'Hecho.', 'Eva está agendada: se manda directo, sin repetir lo que entendió');
    assert.deepStrictEqual(hechos.map((h) => h.contacto), ['Eva']);
    r = await con('Laura');
    assert.match(r.texto, /Entendí: mandarle a Laura/, 'Laura no está cargada: se sigue preguntando');
    assert.strictEqual(hechos.length, 1);
    r = await con('mi hermana');
    assert.strictEqual(hechos.length, 2, 'por un apodo también');
    config.guardarConfig({ ...config.leerConfig(), escucha: { ...config.leerConfig().escucha, confirmarAgendados: true } });
    r = await con('Eva');
    assert.match(r.texto, /Entendí: mandarle a Eva/, 'si se prende "preguntar también a los agendados", pregunta');
    assert.strictEqual(hechos.length, 2);
  } finally {
    acciones.ejecutarPaso = original;
    config.guardarConfig(antes);
    require('../src/main/aprendido').olvidarTodo();
    if (servidor) await servidor.cerrar().catch(() => {});
  }
});

prueba('notificaciones: cada regla puede dar su propio sonido y leerlo en voz alta (persona, remitente, casilla, calendario)', () => {
  const antes = config.leerConfig();
  config.guardarConfig({ ...antes, notificaciones: { ...antes.notificaciones, sonido: 'campanita', reglas: [
    { origen: 'whatsapp', quien: 'Eva', accion: 'decir', sonido: 'doble', modos: [] },
    { origen: 'mail', quien: 'jefe@empresa.com', accion: 'avisar', sonido: 'alerta', modos: [] },
    { origen: 'mail', quien: 'micuenta@gmail.com', accion: 'avisar', sonido: 'ninguno', modos: [] },
    { origen: 'calendario', quien: '', accion: 'decir', sonido: 'ascendente', modos: [] },
  ] } });
  try {
    const wa = (de) => ({ origen: 'whatsapp', de, texto: 'hola' });
    assert.strictEqual(notificaciones.sonidoPara(wa('Eva López')), 'doble');
    assert.strictEqual(notificaciones.decidir(wa('Eva López')), 'decir');
    assert.strictEqual(notificaciones.sonidoPara(wa('Beto')), 'campanita', 'sin regla: el general');
    assert.strictEqual(notificaciones.sonidoPara({ origen: 'mail', de: 'Jefe', direccion: 'jefe@empresa.com', asunto: 'x' }), 'alerta');
    assert.strictEqual(notificaciones.sonidoPara({ origen: 'mail', de: 'Otro', direccion: 'otro@x.com', cuenta: 'micuenta@gmail.com', asunto: 'x' }), '', '"ninguno" apaga el sonido');
    const evento = { origen: 'calendario', de: 'Reunión', texto: 'Empieza en 10 min' };
    assert.deepStrictEqual([notificaciones.sonidoPara(evento), notificaciones.decidir(evento)], ['ascendente', 'decir']);
  } finally { config.guardarConfig(antes); }
});

prueba('Google Calendar: se lee el enlace iCal, se cuenta la agenda y se avisa antes de cada evento, una sola vez', async () => {
  const calendario = require('../src/main/calendario');
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ahora = new Date();
  const en = (min) => new Date(ahora.getTime() + min * 60000);
  const manana = new Date(ahora.getTime() + 24 * 3600 * 1000);
  const diaManana = f(manana).slice(0, 8);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//prueba//ES',
    'BEGIN:VEVENT', 'UID:uno@prueba', `DTSTART:${f(en(8))}`, `DTEND:${f(en(68))}`, 'SUMMARY:Reunión con Eva', 'LOCATION:Oficina', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:dos@prueba', `DTSTART:${f(new Date(ahora.getTime() - 21 * 24 * 3600 * 1000 + 120 * 60000))}`, `DTEND:${f(new Date(ahora.getTime() - 21 * 24 * 3600 * 1000 + 150 * 60000))}`, 'RRULE:FREQ=WEEKLY', 'SUMMARY:Clase de inglés', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:tres@prueba', `DTSTART;VALUE=DATE:${diaManana}`, 'SUMMARY:Cumple de Tomi', 'END:VEVENT',
    'END:VCALENDAR', ''].join('\r\n');
  const servidorIcs = http.createServer((q, r) => { if (q.url === '/mal') { r.statusCode = 404; r.end(); } else { r.setHeader('Content-Type', 'text/calendar'); r.end(ics); } });
  await new Promise((ok) => servidorIcs.listen(47965, '127.0.0.1', ok));
  const antes = config.leerConfig();
  try {
    const prueba1 = await calendario.probar('http://127.0.0.1:47965/cal.ics');
    assert.ok(prueba1.cantidad >= 3, `eventos en 7 días: ${prueba1.cantidad}`);
    await assert.rejects(() => calendario.probar('http://127.0.0.1:47965/mal'), /no reconoce ese enlace/);
    config.guardarConfig({ ...antes, calendario: { activo: true, enlace: 'http://127.0.0.1:47965/cal.ics', minutosAntes: [10, 0] } });
    await calendario.actualizar();
    const hoy = calendario.agenda('hoy');
    assert.match(hoy, /Reunión con Eva a las \d\d:\d\d/);
    assert.match(calendario.agenda('manana'), /Cumple de Tomi \(todo el día\)/);
    assert.match(calendario.agenda('proximo'), /^Lo próximo es Reunión con Eva, hoy a las /);
    // Avisos: el de 10 minutos (faltan 8) sale una vez; el del comienzo todavía no.
    const recibidos = [];
    calendario.configurar({ alAvisar: (a) => recibidos.push(a) });
    const primeros = calendario.revisar(ahora.getTime());
    assert.strictEqual(primeros.length, 1);
    assert.deepStrictEqual([primeros[0].origen, primeros[0].de], ['calendario', 'Reunión con Eva']);
    assert.match(primeros[0].texto, /^Empieza en 8 min \(\d\d:\d\d\) · Oficina$/);
    assert.strictEqual(calendario.revisar(ahora.getTime() + 60000).length, 0, 'no se repite');
    assert.strictEqual(calendario.revisar(en(8).getTime() + 30000).length, 1, 'y al empezar, el aviso de "ahora"');
    assert.strictEqual(recibidos.length, 2);
    // Sin conectar: explica qué falta.
    config.guardarConfig({ ...antes, calendario: { activo: false, enlace: '', minutosAntes: [10] } });
    assert.match(calendario.agenda('hoy'), /conectalo en Ajustes/);
    assert.deepStrictEqual(comandos.resolver('¿Qué tengo hoy?').pasos, [{ tipo: 'agenda', cuando: 'hoy' }]);
    assert.deepStrictEqual(comandos.resolver('qué tengo mañana').pasos, [{ tipo: 'agenda', cuando: 'manana' }]);
    assert.deepStrictEqual(comandos.resolver('¿cuál es mi próximo evento?').pasos, [{ tipo: 'agenda', cuando: 'proximo' }]);
  } finally { config.guardarConfig(antes); servidorIcs.closeAllConnections(); await new Promise((r) => servidorIcs.close(r)); }
});

prueba('el ritmo de la música se mide: tempo, golpes con su hora, y silencio sin inventar', () => {
  const { crearAnalizador } = require('../src/main/ritmo');
  // Música sintética: bombo (graves) en cada tiempo, caja (medios) en 2 y 4, hi-hat (agudos) entre tiempos.
  function tocar(bpm, segundos, { desde = 0, ruido = 4 } = {}) {
    const a = crearAnalizador();
    const t0 = 5000;
    const golpes = []; // hora real de cada bombo
    const pasoMs = 23.2;
    let semilla = 7;
    const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    const tiempo = 60000 / bpm;
    let ultimoEstado = null;
    for (let t = 0; t < segundos * 1000; t += pasoMs + (azar() - 0.5) * 6) {
      const e = new Uint8Array(512);
      for (let i = 0; i < 512; i++) e[i] = 40 + azar() * ruido;
      const k = Math.floor(t / tiempo); const desdeTiempo = t - k * tiempo;
      if (t >= desde) {
        const bombo = 170 * Math.exp(-desdeTiempo / 90);
        for (let i = 1; i <= 6; i++) e[i] = Math.min(255, e[i] + bombo);
        if (k % 2 === 1) for (let i = 8; i < 40; i++) e[i] = Math.min(255, e[i] + 120 * Math.exp(-desdeTiempo / 70));
        const medio = ((t % tiempo) - tiempo / 2 + tiempo) % tiempo;
        for (let i = 150; i < 300; i++) e[i] = Math.min(255, e[i] + 70 * Math.exp(-Math.abs(medio) / 25));
        if (desdeTiempo < pasoMs && !golpes.includes(t0 + k * tiempo)) golpes.push(t0 + k * tiempo);
      }
      a.paso(e, t0 + t);
      ultimoEstado = a.estado(t0 + t);
    }
    return { estado: ultimoEstado, golpes };
  }
  for (const bpm of [96, 120, 128, 150]) {
    const { estado, golpes } = tocar(bpm, 14);
    assert.ok(Math.abs(estado.bpm - bpm) <= 3, `a ${bpm} BPM midió ${estado.bpm}`);
    assert.ok(estado.conf >= 0.4, `a ${bpm} BPM la confianza fue ${estado.conf}`);
    const esperados = golpes.length;
    assert.ok(estado.n >= esperados * 0.8 && estado.n <= esperados * 1.6, `a ${bpm} BPM contó ${estado.n} golpes de ${esperados}`);
  }
  // La hora del último golpe es la real (con un cuadro de tolerancia).
  const a = crearAnalizador();
  const e = (grave) => { const x = new Uint8Array(512).fill(40); if (grave) for (let i = 1; i <= 6; i++) x[i] = 230; return x; };
  let t = 1000;
  for (let i = 0; i < 40; i++) { a.paso(e(false), t); t += 23; }
  a.paso(e(true), t); const tBombo = t; t += 23;
  a.paso(e(false), t); t += 23;
  a.paso(e(false), t);
  const h = a.estado(t).hace;
  assert.ok(Math.abs(h - (t - tBombo)) <= 25, `hace ${h} ms, debía rondar ${t - tBombo}`);
  // Cambio de tempo: sigue a la canción.
  // Silencio o ruido plano: ni golpes ni tempo inventado.
  const mudo = crearAnalizador();
  for (let tt = 0; tt < 10000; tt += 23) mudo.paso(new Uint8Array(512).fill(30 + (tt % 7)), 1000 + tt);
  const em = mudo.estado(11000);
  assert.ok(em.n <= 2 && em.conf < 0.3, `en silencio: ${JSON.stringify(em)}`);
});

prueba('"cancelar" y el ruido cierran la conversación sin contestar, aunque el nombre salga mal escrito', () => {
  const cierran = ['Cancelar a Harvis.', 'cancelar', 'Cancelar Jarvis', 'cancelalo', 'no era nada', 'me equivoqué', 'fue sin querer', 'perdón, me equivoqué', 'no te llamé', 'olvidalo Harvey', 'nada', 'no', 'ya está', 'eso es todo', 'falsa alarma', 'no hablaba con vos', 'chau Jarvis', 'See?', 'You can have.', 'Oh yeah, thank you.'];
  for (const f of cierran) {
    const r = comandos.resolver(f);
    assert.ok(r && r.terminar && r.respuesta === '', `"${f}" debía cerrar y dio ${JSON.stringify(r)}`);
  }
  // Lo que NO es cancelar ni ruido sigue su camino.
  for (const f of ['cancelar la rutina modo cine', 'poné música', 'para', 'pausá', 'apagá la luz', 'play the song']) {
    const r = comandos.resolver(f);
    assert.ok(!(r && r.terminar && r.respuesta === '' && !(r.pasos || []).length), `"${f}" no debía cerrarse solo`);
  }
  assert.strictEqual(comandos.esCancelacion('cancelar a harvis'), true);
  assert.strictEqual(comandos.esRuido('hola me escuchas'), false);
});

prueba('música a un Nest/Home Mini: la canción y el aparato se separan; por Cast va siempre un video para empezar (con su lista) y audioOnly en false', async () => {
  const r = comandos.resolver('poné la canción Bohemian Rhapsody en el Nest Hub');
  assert.deepStrictEqual(r.pasos[0], { tipo: 'musica', busqueda: 'Bohemian Rhapsody', dispositivo: 'nest hub' });
  const r2 = comandos.resolver('poné música en el home mini');
  assert.deepStrictEqual(r2.pasos[0], { tipo: 'musica', busqueda: '', dispositivo: 'home mini' });
  const musica = require('../src/main/musica');
  await assert.rejects(() => musica.reproducir('', 'home mini'), /No encuentro "home mini"/, 'primero se busca el aparato; ya no se rechaza el Supermix');
  // El pedido a YouTube lleva el video con el que empieza y la lista; audioOnly en false (en true los aparatos no arrancan).
  const cast = require('../src/main/cast');
  const cuerpos = [];
  const fetchViejo = global.fetch;
  global.fetch = async (url, op) => {
    cuerpos.push(String(op && op.body || ''));
    const texto = /get_lounge_token_batch/.test(url) ? JSON.stringify({ screens: [{ loungeToken: 'tok' }] }) : (/SID=/.test(url) ? '' : '[[0,["c","sid1","",8]],[1,["S","gs1"]]]');
    return { ok: true, status: 200, text: async () => texto };
  };
  try {
    await cast.mandarAYoutube('pantalla1', 'dQw4w9WgXcQ', { lista: 'RDTMAK5uy_kset8DisdE7LSD4TNjEVvrKRTmG7a56sY' });
    const ultimo = cuerpos[cuerpos.length - 1];
    assert.match(ultimo, /req0_listId=RDTMAK5uy_kset8DisdE7LSD4TNjEVvrKRTmG7a56sY/);
    assert.match(ultimo, /req0_videoId=dQw4w9WgXcQ/);
    assert.match(ultimo, /req0_audioOnly=false/);
    assert.match(ultimo, /req0__sc=setPlaylist/);
  } finally { global.fetch = fetchViejo; }
  // Sin video no se manda nada (la app de YouTube del aparato no arrancaría).
  await assert.rejects(() => cast.youtube('Comedor', '', { lista: 'RDTMAK5uy_x' }), /Falta el video/);
  // Los nombres que el oído junta: "telecomedor" es "Tele Comedor", aunque "Comedor" también exista.
  const { buscarPorNombre } = require('../src/main/config');
  const teles = [{ nombre: 'Tele Comedor' }, { nombre: 'Comedor' }, { nombre: 'Cuarto' }, { nombre: 'Tele cuarto' }];
  assert.strictEqual(buscarPorNombre(teles, 'telecomedor').nombre, 'Tele Comedor');
  assert.strictEqual(buscarPorNombre(teles, 'tele comedor').nombre, 'Tele Comedor');
  assert.strictEqual(buscarPorNombre(teles, 'comedor').nombre, 'Comedor');
  assert.strictEqual(buscarPorNombre(teles, 'telecuarto').nombre, 'Tele cuarto');
  assert.strictEqual(buscarPorNombre([{ nombre: 'Tele Comedor, la grande' }], 'la grande').nombre, 'Tele Comedor', 'sinónimos separados por coma');
  const tv = require('../src/main/androidtv');
  assert.strictEqual(tv.esSoloCast('Google Nest Hub'), true);
  assert.strictEqual(tv.esSoloCast('Google Home Mini'), true);
  assert.strictEqual(tv.esSoloCast('Chromecast'), false);
  assert.strictEqual(tv.esSoloCast('Chromecast with Google TV'), false);
});

prueba('"abrí Disney Plus en la tele": si no se puede, se dice por qué y qué hacer (no solo "no pude")', async () => {
  const tv = require('../src/main/androidtv');
  const cerebro = require('../src/main/cerebro');
  tv.configurar({ resolver: async (n) => ({ nombre: n, host: '192.168.0.50', modelo: 'Chromecast with Google TV' }) });
  await assert.rejects(() => tv.abrir('Tele Comedor__sinvincular', 'https://www.disneyplus.com'), /Falta vincular el control de Tele Comedor__sinvincular.*Vincular control/);
  tv.configurar({ resolver: async (n) => ({ nombre: n, host: '192.168.0.51', modelo: 'Google Nest Hub' }) });
  await assert.rejects(() => tv.abrir('Nest__sinvincular', 'https://www.disneyplus.com'), /solo Cast.*YouTube/);
  // El modelo contestó "No pude abrir…" sin motivo: se agrega el motivo de la herramienta.
  assert.strictEqual(cerebro._conMotivo('No pude abrir Disney Plus en Tele Comedor.', 'Falta vincular el control de Tele Comedor para abrirle apps.'), 'No pude abrir Disney Plus en Tele Comedor. Falta vincular el control de Tele Comedor para abrirle apps.');
  // Si ya lo dijo, no se repite; si no hubo fallo, no se toca.
  const dicho = 'Falta vincular el control de Tele Comedor para abrirle apps: andá a Ajustes.';
  assert.strictEqual(cerebro._conMotivo(dicho, 'Falta vincular el control de Tele Comedor para abrirle apps.'), dicho);
  assert.strictEqual(cerebro._conMotivo('Listo.', ''), 'Listo.');
});

prueba('crear eventos: se entienden fecha, hora y duración dichas de varias maneras, y se arma el enlace de Google Calendar', async () => {
  const fechas = require('../src/main/fechas');
  const calendario = require('../src/main/calendario');
  const ahora = new Date(2026, 10, 12, 10, 0); // jueves 12/11/2026, 10:00
  const caso = (t) => { const r = fechas.analizar(t, ahora, comandos.numeroDe); return r && { i: fechas.aISOLocal(r.inicio), todo: r.todoElDia, d: r.duracionMin, resto: r.resto }; };
  assert.deepStrictEqual(caso('reunion con juan manana a las 15 por una hora'), { i: '2026-11-13T15:00', todo: false, d: 60, resto: 'reunion con juan' });
  assert.deepStrictEqual(caso('cumpleanos de tomi el viernes a las 8 y media de la noche'), { i: '2026-11-13T20:30', todo: false, d: null, resto: 'cumpleanos de tomi' });
  assert.deepStrictEqual(caso('turno del dentista el 20 de noviembre a las diez'), { i: '2026-11-20T10:00', todo: false, d: null, resto: 'turno del dentista' });
  assert.deepStrictEqual(caso('almuerzo con mama el domingo'), { i: '2026-11-15T00:00', todo: true, d: null, resto: 'almuerzo con mama' });
  assert.strictEqual(caso('reunion a las 9').i, '2026-11-13T09:00', 'las 9 de hoy ya pasaron: es mañana');
  assert.strictEqual(caso('asado el 5 a las 3 de la tarde en lo de juan').i, '2026-12-05T15:00');
  assert.strictEqual(caso('llamar a pedro en dos horas').i, '2026-11-12T12:00');
  assert.strictEqual(caso('cena en lo de eva a la oficina'), null, 'sin fecha ni hora no hay evento');
  // Por voz, sin modelo.
  const r = comandos.resolver('Agendá reunión con Juan mañana a las 15 por una hora');
  assert.strictEqual(r.pasos[0].tipo, 'evento');
  assert.strictEqual(r.pasos[0].titulo, 'Reunión con Juan');
  assert.strictEqual(r.pasos[0].duracionMin, 60);
  assert.match(r.pasos[0].inicio, /T15:00$/);
  const r2 = comandos.resolver('creá un evento cumpleaños de Tomi el viernes a las 21 en el calendario');
  assert.strictEqual(r2.pasos[0].titulo, 'Cumpleaños de Tomi');
  assert.match(r2.pasos[0].inicio, /T21:00$/);
  assert.strictEqual(comandos.resolver('anotá en el calendario dentista el 3 de diciembre').pasos[0].todoElDia, true);
  assert.strictEqual(comandos.resolver('agenda de hoy').pasos[0].tipo, 'agenda', 'consultar la agenda sigue siendo consultar');
  assert.notStrictEqual((comandos.resolver('recordame mañana a las 15 llamar a Juan') || {}).pasos?.[0]?.tipo, 'evento', 'un recordatorio no es un evento');
  assert.notStrictEqual((comandos.resolver('agendá un evento') || { pasos: [{}] }).pasos[0].tipo, 'evento', 'sin fecha no se inventa nada');
  // El enlace.
  let abierta = '';
  calendario.configurar({ abrir: async (u) => { abierta = u; } });
  const dicho = await calendario.crearEvento({ titulo: 'Reunión con Juan', inicio: '2026-11-13T15:00', duracionMin: 90, lugar: 'Oficina' }, ahora);
  const u = new URL(abierta);
  assert.strictEqual(u.origin + u.pathname, 'https://calendar.google.com/calendar/render');
  assert.strictEqual(u.searchParams.get('action'), 'TEMPLATE');
  assert.strictEqual(u.searchParams.get('text'), 'Reunión con Juan');
  assert.strictEqual(u.searchParams.get('dates'), '20261113T150000/20261113T163000');
  assert.strictEqual(u.searchParams.get('location'), 'Oficina');
  assert.match(dicho, /mañana a las 15:00.*Guardar/);
  await calendario.crearEvento({ titulo: 'Feriado', inicio: '2026-11-20', todoElDia: true }, ahora);
  assert.strictEqual(new URL(abierta).searchParams.get('dates'), '20261120/20261121');
  await assert.rejects(() => calendario.crearEvento({ titulo: '', inicio: '2026-11-20T10:00' }, ahora), /cómo se llama/);
});

prueba('clips: se eligen los pedazos de los últimos segundos, se unen en un mp4 en la carpeta del juego, y se achica para WhatsApp', async () => {
  const { spawnSync } = require('child_process');
  const clips = require('../src/main/clips');
  const t = clips._pruebas;
  // El nombre del juego: lo del usuario, el producto del ejecutable, el título corto o el proceso; sin contar Jarvis ni el escritorio.
  assert.strictEqual(t.nombreDeJuego({ proceso: 'cs2', producto: 'Counter-Strike 2', titulo: '' }), 'Counter-Strike 2');
  assert.strictEqual(t.nombreDeJuego({ proceso: 'cs2', producto: 'Counter-Strike 2', titulo: '' }, { cs2: 'CS2' }), 'CS2');
  assert.strictEqual(t.nombreDeJuego({ proceso: 'VALORANT-Win64-Shipping', producto: '', titulo: 'VALORANT - Cliente' }), 'VALORANT');
  assert.strictEqual(t.nombreDeJuego({ proceso: 'javaw', producto: 'OpenJDK Platform binary', titulo: 'Minecraft 1.20 - Singleplayer' }), 'Javaw');
  assert.strictEqual(t.limpiarNombre('Mi: juego? <1>.'), 'Mi juego 1');
  const ahora = Date.now();
  const lista = [
    { t: ahora - 9000, proceso: 'explorer', producto: 'Microsoft Windows', titulo: '' },
    { t: ahora - 8000, proceso: 'Jarvis', producto: 'Jarvis', titulo: '' },
    ...[7, 6, 5, 4, 3].map((n) => ({ t: ahora - n * 1000, proceso: 'cs2', producto: 'Counter-Strike 2', titulo: '' })),
    { t: ahora - 1000, proceso: 'chrome', producto: 'Google Chrome', titulo: 'Algo' },
  ];
  assert.strictEqual(t.elegirJuego(ahora - 10000, ahora, lista, {}), 'Counter-Strike 2');
  assert.strictEqual(t.elegirJuego(ahora - 10000, ahora, [], {}), '');
  assert.deepStrictEqual(t.lineaAMuestra('cs2|Counter-Strike 2|Counter-Strike 2', 5), { t: 5, proceso: 'cs2', producto: 'Counter-Strike 2', titulo: 'Counter-Strike 2' });
  assert.strictEqual(t.lineaAMuestra('|'), null);
  assert.match(t.nombreDeArchivo('Counter-Strike 2', new Date(2026, 10, 12, 21, 5, 9)), /^Counter-Strike 2 2026\.11\.12 - 21\.05\.09\.mp4$/);

  const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
  if (!hayFfmpeg) { console.log('      (sin ffmpeg en esta máquina: se omite la parte de video)'); return; }
  process.env.JARVIS_FFMPEG = 'ffmpeg';
  process.env.JARVIS_SIN_NVENC = '1';
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-'));
  const guardado = config.leerConfig();
  config.guardarConfig({ ...guardado, clips: { ...guardado.clips, activo: true, carpeta, porJuego: true, segundos: 90 } });
  // Pedazos de mentira: 4 de 6 segundos (video con un contador y un tono), como los entrega la ventana de captura.
  const pedazo = (i, conAudio = true) => {
    const f = path.join(carpeta, `origen-${i}.webm`);
    const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30', ...(conAudio ? ['-f', 'lavfi', '-i', `sine=frequency=${300 + i * 100}:sample_rate=48000`] : []), '-t', '6', '-c:v', 'libvpx', '-b:v', '1M', ...(conAudio ? ['-c:a', 'libopus'] : []), f]);
    assert.strictEqual(r.status, 0, String(r.stderr).slice(-300));
    return fs.readFileSync(f);
  };
  clips.configurar({ ordenar: (orden) => { if (orden === 'girar') clips.recibirPedazo({ vacio: true, inicio: Date.now(), fin: Date.now() }); } });
  t.setActiva(true);
  t.setOrdenar((orden) => { if (orden === 'girar') clips.recibirPedazo({ vacio: true, inicio: Date.now(), fin: Date.now() }); });
  const generados = [0, 1, 2, 3].map((i) => pedazo(i));
  const fin = Date.now();
  for (let i = 0; i < 4; i++) {
    const datos = generados[i];
    clips.recibirPedazo({ inicio: fin - (4 - i) * 6000, fin: fin - (3 - i) * 6000, audio: true }, datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength));
  }
  assert.strictEqual(t.pedazos().length, 4);
  t.setMuestras([{ t: fin - 10000, proceso: 'cs2', producto: 'Counter-Strike 2', titulo: '' }]);
  const largoDe = (archivo) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-i', archivo]); return { seg: t.duracionDe(String(r.stderr)), audio: /Audio: aac/.test(String(r.stderr)), video: /Video: h264/.test(String(r.stderr)), alto: +(/, (\d+)x(\d+)/.exec(String(r.stderr)) || [])[2] }; };
  const c = await clips.guardar({ segundos: 15 });
  assert.strictEqual(c.juego, 'Counter-Strike 2');
  assert.ok(c.archivo.startsWith(path.join(carpeta, 'Counter-Strike 2')), c.archivo);
  const info = largoDe(c.archivo);
  assert.ok(Math.abs(info.seg - 15) < 1.2, `dura ${info.seg} s, tenía que durar ~15`);
  assert.ok(info.audio && info.video && info.alto === 720, JSON.stringify(info));
  // La lista de clips guardados (para verlos y mandarlos desde Ajustes): del más nuevo al más viejo, con miniatura, y solo dentro de la carpeta de clips.
  const guardados = clips.listar();
  assert.ok(guardados.length >= 1 && guardados[0].archivo === c.archivo && guardados[0].juego === 'Counter-Strike 2' && guardados[0].bytes > 1000, JSON.stringify(guardados[0]));
  assert.match(await clips.miniatura(c.archivo), /^data:image\/jpeg;base64,/);
  assert.strictEqual(await clips.miniatura(path.join(os.tmpdir(), 'afuera.mp4')), '');
  assert.ok(clips.dentroDeCarpeta(c.archivo) && !clips.dentroDeCarpeta(path.join(os.tmpdir(), 'afuera.mp4')) && !clips.dentroDeCarpeta(path.join(carpeta, '..', 'x.mp4')));
  const mandados = [];
  assert.strictEqual(await clips.enviarGuardado(c.archivo, 'Tomi', async (quien, mp4) => { mandados.push([quien, mp4.length]); return 'Video enviado a Tomi.'; }), 'Video enviado a Tomi.');
  assert.strictEqual(mandados[0][0], 'Tomi');
  await assert.rejects(() => clips.enviarGuardado(path.join(os.tmpdir(), 'afuera.mp4'), 'Tomi', async () => ''), /no está en la carpeta/);
  // Pide más de lo que hay: arma lo que hay (24 s).
  const largo = await clips.guardar({ segundos: 90 });
  assert.ok(Math.abs(largoDe(largo.archivo).seg - 24) < 1.5);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(largo.archivo)).filter((n) => /\.parte/.test(n)), [], 'no quedan videos a medias en la carpeta');
  // Pantalla casi quieta: pedazos con un solo cuadro de video (y marcas de tiempo corridas) no tienen que alargar ni colgar la unión.
  const quieto = (i) => {
    const v = path.join(carpeta, `v-${i}.webm`); const a = path.join(carpeta, `a-${i}.webm`); const f = path.join(carpeta, `quieto-${i}.webm`);
    const ok = spawnSync('ffmpeg', ['-y', '-hide_banner', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=1', '-vf', 'select=eq(n\\,0),setpts=PTS+2000/TB', '-c:v', 'libvpx', '-b:v', '500k', '-deadline', 'realtime', v]).status === 0
      && spawnSync('ffmpeg', ['-y', '-hide_banner', '-f', 'lavfi', '-i', `sine=frequency=${400 + i * 50}:duration=6`, '-c:a', 'libopus', a]).status === 0
      && spawnSync('ffmpeg', ['-y', '-hide_banner', '-i', v, '-i', a, '-c', 'copy', f]).status === 0;
    assert.ok(ok, 'no se pudo armar el pedazo quieto');
    return f;
  };
  const quietos = [0, 1, 2].map((i) => ({ archivo: quieto(i), inicio: i * 6000, fin: (i + 1) * 6000, audio: true }));
  const salidaQuieta = path.join(carpeta, 'quieta.mp4');
  const r = spawnSync('ffmpeg', t.argumentosDeUnion(quietos, 0, salidaQuieta, 'libx264', 18), { timeout: 60000 });
  assert.strictEqual(r.status, 0, String(r.stderr).slice(-300));
  assert.ok(Math.abs(largoDe(salidaQuieta).seg - 18) < 1.2, `con pantalla quieta dura ${largoDe(salidaQuieta).seg} s, tenía que durar ~18`);
  // Un clip chico se manda tal cual; uno de más de 15 MB se achica.
  const chico = await clips.prepararParaEnviar(c.archivo);
  assert.deepStrictEqual([chico.archivo, chico.temporal], [c.archivo, false]);
  const pesado = path.join(carpeta, 'pesado.mp4');
  assert.strictEqual(spawnSync('ffmpeg', ['-y', '-hide_banner', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=500', '-t', '10', '-c:v', 'mpeg4', '-b:v', '30M', '-c:a', 'aac', pesado]).status, 0);
  assert.ok(fs.statSync(pesado).size > 15.5 * 1024 * 1024, 'el clip de prueba tenía que pesar más de 15,5 MB');
  const liviano = await clips.prepararParaEnviar(pesado);
  assert.ok(liviano.temporal && fs.statSync(liviano.archivo).size < 15.5 * 1024 * 1024, `quedó en ${fs.statSync(liviano.archivo).size}`);
  assert.ok(Math.abs(largoDe(liviano.archivo).seg - 10) < 1);
  // Sin sistema de clips prendido, avisa cómo prenderlo.
  t.setActiva(false);
  await assert.rejects(() => clips.guardar({}), /Ajustes/);
  config.guardarConfig(guardado);
});

prueba('el panel es una lista de widgets: se migra de los casilleros viejos y se normaliza lo que viene mal', async () => {
  const lista = config.widgetsDeBanderas({ texto: true, avisos: false, acciones: false, musica: true, clips: true });
  assert.deepStrictEqual(lista.map((w) => `${w.tipo}:${w.tam}`), ['texto:4', 'musica:4', 'clip-grabar:2', 'clip-guardar:2', 'modos:4'], 'grilla de 4: música ancha, grabar y clip a la mitad');
  const migrada = config.leerConfig();
  for (const m of migrada.modos) assert.ok(Array.isArray(m.panel.widgets) && m.panel.widgets.length, `el modo ${m.id} tiene widgets`);
  // Un diseño guardado con la grilla vieja (6 columnas: chico 2, mitad 3, ancho 6) se convierte una sola vez a la de 4 (1, 2, 4).
  const antes = config.leerConfig();
  const viejo = { ...antes, modos: [{ id: 'normal', nombre: 'Normal', panel: { clips: true, widgets: [{ id: 'a', tipo: 'novedades', tam: 6 }, { id: 'b', tipo: 'musica', tam: 3 }, { id: 'c', tipo: 'clip-guardar', tam: 2 }] } }, { id: 'x', nombre: 'X', panel: { clips: false, grilla: 4, widgets: [{ id: 'd', tipo: 'musica', tam: 2 }] } }] };
  try {
    const g = config.guardarConfig(viejo);
    assert.deepStrictEqual(g.modos[0].panel.widgets.map((w) => w.tam), [4, 2, 1], 'ancho 6→4, mitad 3→2, chico 2→1');
    assert.strictEqual(g.modos[1].panel.widgets[0].tam, 2, 'uno que ya estaba en la grilla nueva no se toca');
    assert.deepStrictEqual(config.guardarConfig(g).modos[0].panel.widgets.map((w) => w.tam), [4, 2, 1], 'convertir dos veces no cambia nada');
  } finally { config.guardarConfig(antes); }
  const propios = [{ id: 'a', tipo: 'musica', tam: 2 }];
  assert.deepStrictEqual(config.panelDeModo({ panel: { widgets: propios } }).widgets, propios, 'los widgets propios no se pisan');
  assert.deepStrictEqual(config.panelDeModo({ panel: { widgets: [] } }).widgets, [], 'un panel vacío es válido');
  const W = await import('../src/ui/widgets.js');
  assert.deepStrictEqual([W.NOMBRE_DE_TAM[1], W.NOMBRE_DE_TAM[2], W.NOMBRE_DE_TAM[4]], ['Chico', 'Mitad', 'Ancho']);
  assert.strictEqual(W.COLUMNAS, 4);
  assert.strictEqual(W.tamPorDefecto('musica'), 4);
  assert.strictEqual(W.tamPorDefecto('clip-grabar'), 2);
  const n = W.normalizarLista([{ tipo: 'inventado' }, { tipo: 'musica', tam: 2 }, { tipo: 'frase', tam: 99, texto: 'qué veo' }, null, { tipo: 'clip-grabar' }]);
  assert.deepStrictEqual(n.map((w) => w.tipo), ['musica', 'frase', 'clip-grabar']);
  assert.ok(W.TIPOS.musica.tams.includes(n[0].tam), 'el tamaño de música es uno permitido');
  assert.ok(W.TIPOS.frase.tams.includes(n[1].tam), 'un tamaño inválido pasa al por defecto');
  assert.ok(n.every((w) => w.id), 'todos tienen id');
});

prueba('los modos eligen qué se muestra al pasar el mouse, y los clips solo corren en los modos que los tienen', () => {
  const base = config.panelDeModo({ id: 'x' });
  assert.deepStrictEqual({ ...base, widgets: undefined }, { texto: true, avisos: true, acciones: true, musica: true, clips: false, widgets: undefined });
  assert.deepStrictEqual(base.widgets.map((w) => w.tipo), ['texto', 'novedades', 'rutinas', 'musica', 'clip-grabar', 'clip-guardar', 'modos'], 'sin widgets guardados salen los de los casilleros viejos');
  assert.strictEqual(config.panelDeModo({ panel: { clips: true, avisos: false } }).clips, true);
  assert.strictEqual(config.panelDeModo({ panel: { clips: true, avisos: false } }).avisos, false);
  const juego = config.defaultConfig ? config.defaultConfig().modos : config.leerConfig().modos;
  assert.ok(juego.find((m) => m.id === 'juego' && config.panelDeModo(m).clips), 'existe el modo Juego con los clips habilitados');
  assert.strictEqual(config.panelDeModo(juego.find((m) => m.id === 'normal')).clips, false, 'el modo normal no usa clips');
  const clips = require('../src/main/clips');
  const guardado = config.leerConfig();
  config.guardarConfig({ ...guardado, modo: 'normal', clips: { ...guardado.clips, activo: true } });
  assert.strictEqual(clips.permitidoAhora(), false);
  config.guardarConfig({ ...guardado, modo: 'juego', clips: { ...guardado.clips, activo: true } });
  assert.strictEqual(clips.permitidoAhora(), true);
  config.guardarConfig({ ...guardado, modo: 'juego', clips: { ...guardado.clips, activo: false } });
  assert.strictEqual(clips.permitidoAhora(), false, 'con los clips apagados no corre en ningún modo');
  config.guardarConfig(guardado);
  // Por voz.
  const paso = (t) => (comandos.resolver(t) || {}).pasos?.[0];
  assert.deepStrictEqual(paso('guardá el último minuto'), { tipo: 'clip', accion: 'guardar', segundos: 60 });
  assert.deepStrictEqual(paso('guardá el último minuto y medio'), { tipo: 'clip', accion: 'guardar', segundos: 90 });
  assert.deepStrictEqual(paso('clipeá'), { tipo: 'clip', accion: 'guardar' });
  assert.deepStrictEqual(paso('enviá el último minuto a Tomi'), { tipo: 'clip', accion: 'enviar', contacto: 'Tomi', segundos: 60 });
  assert.deepStrictEqual(paso('mandale a Tomi el último clip'), { tipo: 'clip', accion: 'enviar', contacto: 'Tomi', ultimo: true }, 'solo "el último clip" manda el ya guardado');
  assert.deepStrictEqual(paso('enviale el clip a Tomi'), { tipo: 'clip', accion: 'enviar', contacto: 'Tomi' }, '"el clip" arma uno nuevo');
  assert.deepStrictEqual(paso('hacé un clip'), { tipo: 'clip', accion: 'guardar' });
  assert.deepStrictEqual(paso('haceme un clip de los últimos 30 segundos'), { tipo: 'clip', accion: 'guardar', segundos: 30 });
  assert.deepStrictEqual(paso('creá un clip'), { tipo: 'clip', accion: 'guardar' });
  assert.notStrictEqual((paso('hacé un recordatorio para mañana') || {}).tipo, 'clip', 'no se confunde con otros pedidos');
  assert.deepStrictEqual(paso('mandame los últimos 30 segundos'), { tipo: 'clip', accion: 'enviar', contacto: 'yo', segundos: 30 });
  assert.strictEqual(paso('empezá a grabar').accion, 'grabar');
  assert.strictEqual(paso('parar de grabar').accion, 'parar');
  assert.strictEqual(paso('desactivá los clips').accion, 'desactivar');
  assert.notStrictEqual((paso('mandale una foto a Tomi') || {}).tipo, 'clip');
  assert.notStrictEqual((paso('mandale el último mensaje a Tomi') || {}).tipo, 'clip');
  assert.strictEqual((paso('grabá un audio para Tomi') || {}).tipo === 'clip', false);
});

prueba('audios de WhatsApp con tu voz: graba hasta que dejes de hablar, lo escuchás y confirmás antes de mandarlo', async () => {
  const enviados = [];
  const original = whatsapp.enviarAudio;
  whatsapp.enviarAudio = async (quien, ogg, segundos) => { enviados.push([quien, ogg.byteLength, Math.round(segundos)]); return `Audio enviado a ${quien}.`; };
  let pedido = null;
  let respuesta = { ogg: new ArrayBuffer(1234), segundos: 7.4 };
  acciones.configurar({ decir() {}, fijarModo() {}, pedirAlNotch: async (tipo, datos) => { pedido = [tipo, datos]; return respuesta; } });
  cerebro.configurar({ estado() {}, salida() {}, cortar() {}, texto() {}, modo: () => 'normal', vozDeWindows: async () => {}, programas: () => [] });
  try {
    const s = { historial: [] };
    const r = await cerebro.decidir('mandale un audio a Tomi', s);
    assert.deepStrictEqual(pedido, ['audio', { segundos: 0, max: 60, vistaPrevia: true }], 'sin duración: graba hasta que se calle, y lo reproduce');
    assert.match(r.texto, /Grabé 7 segundos\. ¿Lo mando a Tomi\?/);
    assert.strictEqual(enviados.length, 0, 'todavía no se manda');
    assert.strictEqual((await cerebro.decidir('sí, mandalo', s)).texto, 'Audio enviado a Tomi.');
    assert.deepStrictEqual(enviados, [['Tomi', 1234, 7]]);
    // Si dice que no, se descarta.
    await cerebro.decidir('mandale un audio de 20 segundos a Eva', s);
    assert.strictEqual(pedido[1].segundos, 20);
    const no = await cerebro.decidir('no', s);
    assert.deepStrictEqual([no.texto, no.terminar, enviados.length], ['Listo, no lo mando.', true, 1]);
    // Si no se oyó nada, avisa.
    respuesta = { vacio: true };
    assert.match((await cerebro.decidir('mandale un audio a Tomi', s)).texto, /No te escuché nada/);
    // Con la revisión apagada sale directo.
    respuesta = { ogg: new ArrayBuffer(10), segundos: 3 };
    const previo = config.leerConfig();
    config.guardarConfig({ ...previo, audios: { revisar: false } });
    assert.strictEqual((await cerebro.decidir('mandale un audio a Tomi', s)).texto, 'Audio enviado a Tomi.');
    assert.strictEqual(enviados.length, 2);
    config.guardarConfig(previo);
  } finally { whatsapp.enviarAudio = original; }
});

prueba('click en un mail: se abre en Gmail en ese mensaje (o la bandeja de Outlook)', () => {
  const correo = require('../src/main/correo');
  const previo = config.leerConfig();
  config.guardarConfig({ ...previo, correo: { ...previo.correo, gmail: { ...previo.correo.gmail, usuario: 'yo@gmail.com' } } });
  assert.strictEqual(correo.enlaceDe({ cuenta: 'gmail', mensajeId: '<abc123@mail.gmail.com>' }), 'https://mail.google.com/mail/?authuser=yo%40gmail.com#search/rfc822msgid%3Aabc123%40mail.gmail.com');
  assert.strictEqual(correo.enlaceDe({ cuenta: 'gmail' }), 'https://mail.google.com/mail/?authuser=yo%40gmail.com#inbox');
  assert.strictEqual(correo.enlaceDe({ cuenta: 'outlook' }), 'https://outlook.live.com/mail/0/inbox');
  config.guardarConfig(previo);
});


prueba('almacenamiento: cuenta lo que ocupa cada cosa, libera lo que se puede y manda los videos a la Papelera', async () => {
  const almacenamiento = require('../src/main/almacenamiento');
  const previo = config.leerConfig();
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-clips-'));
  config.guardarConfig({ ...previo, clips: { ...previo.clips, carpeta } });
  fs.mkdirSync(path.join(carpeta, 'Valheim'), { recursive: true });
  fs.writeFileSync(path.join(carpeta, 'Valheim', 'a.mp4'), Buffer.alloc(3000));
  fs.writeFileSync(path.join(carpeta, 'Valheim', 'b.mp4'), Buffer.alloc(2000));
  fs.mkdirSync(path.join(config.DATOS, 'clips-temporal'), { recursive: true });
  fs.writeFileSync(path.join(config.DATOS, 'clips-temporal', 'envio-1.mp4'), Buffer.alloc(4000));
  // una voz "instalada" de mentira
  const m = modelos.CATALOGO['voz-davefx'];
  const dirVoz = path.join(modelos.CARPETA, m.carpeta);
  fs.mkdirSync(path.join(dirVoz, 'espeak-ng-data'), { recursive: true });
  for (const f of m.necesita) if (f !== 'espeak-ng-data') fs.writeFileSync(path.join(dirVoz, f), Buffer.alloc(5000));
  fs.writeFileSync(path.join(modelos.CARPETA, 'voz-davefx.listo'), 'x');
  try {
    const r = await almacenamiento.resumen();
    const g = (id) => r.grupos.find((x) => x.id === id);
    assert.strictEqual(g('clips').items.length, 1);
    assert.strictEqual(g('clips').items[0].bytes, 5000);
    assert.strictEqual(g('clips').items[0].cantidad, 2);
    assert.ok(g('temporales').items.find((i) => i.id === 'temporal').bytes >= 4000);
    const dave = g('voces').items.find((i) => i.id === 'voz-davefx');
    assert.ok(dave.instalado && dave.bytes >= 10000, 'cuenta la voz instalada');
    assert.ok(g('fotos').items[0].soloInfo, 'las fotos de WhatsApp no se guardan: solo se explica');
    assert.ok(r.total > 0 && r.disco && r.disco.libre > 0);
    // Los videos van a la Papelera, no se borran de verdad.
    const enviados = [];
    await almacenamiento.liberar('clips:Valheim', { papelera: async (ruta) => { enviados.push(ruta); } });
    assert.deepStrictEqual(enviados, [path.join(carpeta, 'Valheim')]);
    await assert.rejects(() => almacenamiento.liberar('clips:..', { papelera: async () => {} }), /inválida/);
    await almacenamiento.liberar('temporal');
    assert.ok(!fs.existsSync(path.join(config.DATOS, 'clips-temporal')));
    await almacenamiento.liberar('voz-davefx');
    assert.ok(!modelos.instalado('voz-davefx'), 'la voz borrada queda como no instalada');
  } finally {
    config.guardarConfig(previo);
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

prueba('Google Calendar con la cuenta: junta todos los calendarios (incluido el compartido), respeta los tildados y arma los avisos', async () => {
  const calendario = require('../src/main/calendario');
  const google = require('../src/main/googlecal');
  const ahora = new Date();
  const en = (min) => new Date(ahora.getTime() + min * 60000).toISOString();
  const hoyLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const manana = new Date(ahora.getTime() + 24 * 3600 * 1000);
  const eventosDe = {
    'usuario@gmail.com': [
      { id: 'a1', summary: 'Reunión con Eva', location: 'Oficina', start: { dateTime: en(8) }, end: { dateTime: en(68) } },
      { id: 'a2', summary: 'Rechazado', start: { dateTime: en(20) }, end: { dateTime: en(50) }, attendees: [{ self: true, responseStatus: 'declined' }] },
      { id: 'a3', summary: 'Casa', eventType: 'workingLocation', start: { date: hoyLocal(ahora) }, end: { date: hoyLocal(manana) } },
      { id: 'a4', summary: 'Cancelado', status: 'cancelled', start: { dateTime: en(30) }, end: { dateTime: en(40) } },
      { id: 'a5', summary: 'Cumple de Tomi', start: { date: hoyLocal(manana) }, end: { date: hoyLocal(new Date(manana.getTime() + 86400000)) } },
    ],
    'trabajo@empresa.com': [{ id: 's1', start: { dateTime: en(120) }, end: { dateTime: en(150) } }],
    'festivos@group.v.calendar.google.com': [{ id: 'f1', summary: 'Feriado largo', start: { dateTime: en(300) }, end: { dateTime: en(330) } }],
  };
  const pedidos = [];
  const falso = await servidorFalso(47969, (p) => {
    pedidos.push(p);
    if (p.ruta === '/token') return { cuerpo: { access_token: 'AT', expires_in: 3600 } };
    if (p.ruta.startsWith('/calendar/v3/users/me/calendarList')) return { cuerpo: { items: [
      { id: 'usuario@gmail.com', summary: 'Usuario de Prueba', primary: true, selected: true, accessRole: 'owner', backgroundColor: '#3f51b5' },
      { id: 'trabajo@empresa.com', summary: 'trabajo@empresa.com', selected: true, accessRole: 'freeBusyReader' },
      { id: 'festivos@group.v.calendar.google.com', summary: 'Festivos en Argentina', selected: false, accessRole: 'reader' },
    ] } };
    const m = /^\/calendar\/v3\/calendars\/([^/]+)\/events/.exec(p.ruta);
    if (m) return { cuerpo: { items: eventosDe[decodeURIComponent(m[1])] || [] } };
    return { estado: 404, cuerpo: {} };
  });
  const antes = config.leerConfig();
  try {
    google._pruebas.reiniciar();
    config.guardarConfig({ ...antes, calendario: { activo: true, enlace: '', enlaces: [], minutosAntes: [10, 180], google: { clientId: 'id', clientSecret: 'sec', token: 'refresco', cuenta: '', elegidos: null } } });
    assert.ok(google.conectada());
    const lista = await calendario.calendariosDeGoogle();
    assert.deepStrictEqual(lista.map((c) => [c.id, c.tildado]), [['usuario@gmail.com', true], ['trabajo@empresa.com', true], ['festivos@group.v.calendar.google.com', false]]);
    assert.strictEqual(config.leerConfig().calendario.google.cuenta, 'usuario@gmail.com', 'recuerda la cuenta principal');
    assert.ok(pedidos.find((p) => p.ruta === '/token').clave === '' , 'el pedido de token no lleva Authorization');
    await calendario.actualizar();
    const est = calendario.estado();
    assert.strictEqual(est.error, '');
    const titulos = calendario._pruebas.titulos();
    assert.deepStrictEqual(titulos.sort(), ['Cumple de Tomi', 'Ocupado', 'Reunión con Eva'].sort(), 'sin rechazados, cancelados ni "trabajo desde"; el compartido solo-ocupado se llama Ocupado; el destildado no entra');
    assert.match(calendario.agenda('hoy'), /Reunión con Eva a las \d\d:\d\d/);
    assert.match(calendario.agenda('manana'), /Cumple de Tomi \(todo el día\)/);
    // Dos avisos: el de 10 min (faltan 8) y el de 3 horas (faltan 2 h para el compartido... y 8 min para la reunión)
    const dados = calendario.revisar(ahora.getTime());
    assert.ok(dados.some((a) => /^Empieza en 8 min/.test(a.texto)));
    assert.ok(dados.some((a) => a.de === 'Ocupado' && /^Empieza en 2 h \(\d\d:\d\d\)( · .+)?$/.test(a.texto)), dados.map((a) => a.texto).join(' | '));
    // Elegir a mano: solo los feriados.
    config.guardarConfig({ ...config.leerConfig(), calendario: { ...config.leerConfig().calendario, google: { ...config.leerConfig().calendario.google, elegidos: ['festivos@group.v.calendar.google.com'] } } });
    await calendario.actualizar();
    assert.deepStrictEqual(calendario._pruebas.titulos(), ['Feriado largo']);
    // Un calendario quitado de la lista no se usa, aunque esté elegido o tildado en Google.
    config.guardarConfig({ ...config.leerConfig(), calendario: { ...config.leerConfig().calendario, google: { ...config.leerConfig().calendario.google, ocultos: ['festivos@group.v.calendar.google.com', 'trabajo@empresa.com'], elegidos: null } } });
    await calendario.actualizar();
    assert.deepStrictEqual(calendario._pruebas.titulos().sort(), ['Cumple de Tomi', 'Reunión con Eva']);
    config.guardarConfig({ ...config.leerConfig(), calendario: { ...config.leerConfig().calendario, google: { ...config.leerConfig().calendario.google, ocultos: [], elegidos: ['festivos@group.v.calendar.google.com'] } } });
    await calendario.actualizar();
    // Google + un enlace iCal: se juntan y no se repite lo igual.
    const f = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//p//ES', 'BEGIN:VEVENT', 'UID:x@p', `DTSTART:${f(en(300))}`, `DTEND:${f(en(330))}`, 'SUMMARY:Feriado largo', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:y@p', `DTSTART:${f(en(400))}`, `DTEND:${f(en(430))}`, 'SUMMARY:Del enlace', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
    const serv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/calendar'); r.end(ics); });
    await new Promise((ok) => serv.listen(47970, '127.0.0.1', ok));
    try {
      config.guardarConfig({ ...config.leerConfig(), calendario: { ...config.leerConfig().calendario, enlaces: [{ nombre: 'Familia', enlace: 'http://127.0.0.1:47970/c.ics' }] } });
      await calendario.actualizar();
      assert.deepStrictEqual(calendario._pruebas.titulos(), ['Feriado largo', 'Del enlace']);
    } finally { serv.closeAllConnections(); await new Promise((r) => serv.close(r)); }
    // Si Google ya no acepta la llave, lo dice y pide conectar de nuevo.
    google._pruebas.reiniciar();
    await falso.cerrar();
    const caido = await servidorFalso(47969, () => ({ estado: 400, cuerpo: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }));
    try {
      await assert.rejects(() => google.calendarios(), /conectá la cuenta de nuevo/);
    } finally { await caido.cerrar(); }
  } finally { config.guardarConfig(antes); google._pruebas.reiniciar(); try { await falso.cerrar(); } catch {} }
});

prueba('Google Calendar: conectar la cuenta (navegador, PKCE y llave guardada) y desconectar', async () => {
  const google = require('../src/main/googlecal');
  const crypto = require('crypto');
  let desafio = '';
  const falso = await servidorFalso(47969, (p) => {
    if (p.ruta === '/token') return { cuerpo: { access_token: 'AT', refresh_token: 'LLAVE', expires_in: 3600 } };
    return { estado: 404, cuerpo: {} };
  });
  const antes = config.leerConfig();
  try {
    google._pruebas.reiniciar();
    config.guardarConfig({ ...antes, calendario: { ...antes.calendario, google: { clientId: '', clientSecret: '', token: '', cuenta: '', elegidos: null } } });
    await assert.rejects(() => google.conectar(async () => {}), /Primero pegá el ID de cliente/);
    config.guardarConfig({ ...config.leerConfig(), calendario: { ...config.leerConfig().calendario, google: { clientId: 'ID', clientSecret: 'SEC', token: '', cuenta: '', elegidos: null } } });
    const r = await google.conectar(async (url) => {
      const u = new URL(url);
      assert.strictEqual(u.hostname, 'accounts.google.com');
      assert.strictEqual(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.readonly', 'solo lectura');
      assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
      assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(u.searchParams.get('redirect_uri')));
      desafio = u.searchParams.get('code_challenge');
      // Un estado que no es el nuestro no vale...
      await new Promise((ok) => http.get(`${u.searchParams.get('redirect_uri')}/?code=x&state=otro`, (res) => { res.resume(); res.on('end', ok); }));
      // ...y el verdadero, sí.
      setTimeout(() => http.get(`${u.searchParams.get('redirect_uri')}/?code=CODIGO&state=${u.searchParams.get('state')}`, (res) => res.resume()), 30);
    });
    assert.deepStrictEqual(r, { ok: true });
    assert.strictEqual(config.leerConfig().calendario.google.token, 'LLAVE');
    assert.ok(desafio.length > 30);
    // Cancelar a mitad de camino.
    const cancelada = google.conectar(async () => { setTimeout(() => google.cancelarConexion(), 30); });
    await assert.rejects(() => cancelada, /Se canceló/);
    google.desconectar();
    assert.strictEqual(config.leerConfig().calendario.google.token, '');
    assert.ok(!google.conectada());
  } finally { config.guardarConfig(antes); await falso.cerrar(); }
});

prueba('"abrí Valheim": si el modelo lo pide como programa y no está en el menú Inicio, se abre como juego de Steam', async () => {
  const steam = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-'));
  fs.mkdirSync(path.join(steam, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(steam, 'steamapps', 'appmanifest_892970.acf'), '"AppState"\n{\n\t"appid"\t\t"892970"\n\t"name"\t\t"Valheim"\n}\n');
  const plataforma = Object.getOwnPropertyDescriptor(process, 'platform');
  const ruta = require.resolve('../src/main/pc');
  const original = require.cache[ruta];
  delete require.cache[ruta];
  Object.defineProperty(process, 'platform', { value: 'win32' });
  process.env.JARVIS_STEAM = steam;
  const abiertos = [];
  try {
    const pcWin = require('../src/main/pc');
    pcWin.configurar({ abrirEnlace: async (u) => { abiertos.push(u); } });
    assert.match(await pcWin.abrirPrograma('Valheim'), /Valheim/);
    assert.match(await pcWin.abrirPrograma('abrime valheim'), /Valheim/, 'también con palabras de más');
    assert.deepStrictEqual(abiertos, ['steam://rungameid/892970', 'steam://rungameid/892970']);
    await assert.rejects(() => pcWin.abrirPrograma('Programa Que No Existe'), /ni juego de Steam/);
  } finally {
    Object.defineProperty(process, 'platform', plataforma);
    delete process.env.JARVIS_STEAM; if (original) require.cache[ruta] = original; else delete require.cache[ruta]; fs.rmSync(steam, { recursive: true, force: true });
  }
});

prueba('clips por voz: el clip termina antes de tu pedido ("grabá los últimos 30 segundos") y no lo incluye', () => {
  const clips = require('../src/main/clips');
  const t0 = 1_000_000_000_000;
  // Pedazos de 6 s seguidos: de t0 a t0+120 s.
  const lista = Array.from({ length: 20 }, (_, i) => ({ archivo: `p${i}`, inicio: t0 + i * 6000, fin: t0 + (i + 1) * 6000, audio: true }));
  const ahora = t0 + 120_000;
  const normal = clips.elegirPedazos(lista, 30, 0, ahora);
  assert.ok(Math.abs(normal.largo - 30) < 1e-9 && normal.desde >= 0, 'sin recorte: los últimos 30 s');
  assert.strictEqual(normal.elegidos[normal.elegidos.length - 1].fin, ahora);
  // El usuario empezó a hablar 5 s antes de ahora; el clip termina 2 s antes de eso: en t0+113 s.
  const hasta = ahora - 5000 - 2000;
  const r = clips.elegirPedazos(lista, 30, hasta, ahora);
  assert.ok(Math.abs(r.largo - 30) < 1e-9, 'sigue durando lo pedido');
  const total = r.elegidos.reduce((s, p) => s + (p.fin - p.inicio), 0) / 1000;
  const sobra = (r.elegidos[r.elegidos.length - 1].fin - hasta) / 1000;
  assert.ok(Math.abs((total - sobra - r.desde) - 30) < 1e-9, 'el final del clip cae justo en "hasta"');
  assert.ok(r.elegidos[r.elegidos.length - 1].inicio < hasta, 'no incluye pedazos posteriores');
  // Si el buffer es muy corto para recortar, se arma como siempre.
  const corto = lista.slice(-1);
  assert.strictEqual(clips.elegirPedazos(corto, 30, hasta, ahora).elegidos.length, 1);
  assert.strictEqual(clips.elegirPedazos([], 30, hasta, ahora), null);
  // La marca de voz: se usa una sola vez, caduca y se puede apagar con 0.
  const cfgAntes = config.leerConfig();
  try {
    config.guardarConfig({ ...cfgAntes, clips: { ...cfgAntes.clips, recorteDeVoz: 2 } });
    clips.marcarPedidoDeVoz(0);
    clips.marcarPedidoDeVoz(Date.now() - 4000);
    const fin1 = clips.finDelPedido();
    assert.ok(Math.abs(fin1 - (Date.now() - 4000 - 2200)) < 150, 'con 2 s corta 2 s antes de que habló');
    assert.strictEqual(clips.finDelPedido(), 0, 'la marca se usa una sola vez');
    clips.marcarPedidoDeVoz(0);
    assert.strictEqual(clips.finDelPedido(), 0, 'un pedido escrito no recorta');
    config.guardarConfig({ ...cfgAntes, clips: { ...cfgAntes.clips, recorteDeVoz: 0 } });
    clips.marcarPedidoDeVoz(Date.now() - 4000);
    assert.ok(Math.abs(clips.finDelPedido() - (Date.now() - 4200)) < 150, 'con 0 (lo normal) el clip termina justo cuando empezaste a hablar');
    config.guardarConfig({ ...cfgAntes, clips: { ...cfgAntes.clips, recorteDeVoz: 5 } });
    clips.marcarPedidoDeVoz(Date.now() - 4000);
    assert.ok(Math.abs(clips.finDelPedido() - (Date.now() - 9200)) < 150, 'con 5 s corta 5 s antes');
  } finally { config.guardarConfig(cfgAntes); clips.marcarPedidoDeVoz(0); }
});

prueba('clips sin Jarvis: se silencian en el clip tu voz hablándole y la voz de Jarvis, con tiempos de la línea unida', () => {
  const clips = require('../src/main/clips');
  clips._reiniciarJarvis();
  const t0 = 1_000_000_000_000;
  const el = [{ archivo: 'a.webm', inicio: t0, fin: t0 + 6000, audio: true }, { archivo: 'b.webm', inicio: t0 + 6000, fin: t0 + 12000, audio: true }];
  // Habló el usuario de t0+4 s a t0+6,5 s y Jarvis contestó de t0+7 s a t0+9 s.
  clips.silenciarJarvis(t0 + 4000, t0 + 6500);
  clips.silenciarJarvis(t0 + 7000, t0 + 9000);
  const m = clips.mudosEnLinea(el, [{ desde: t0 + 4000, hasta: t0 + 6500 }, { desde: t0 + 7000, hasta: t0 + 9000 }], t0 + 20000);
  assert.deepStrictEqual(m.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]), [[3.85, 6.65], [6.85, 9.15]]);
  const args = clips.argumentosDeUnion(el, 0, 'salida.mp4', 'libx264', 12, m).join(' ');
  assert.match(args, /volume=0:enable='between\(t,3\.85,6\.65\)\+between\(t,6\.85,9\.15\)',alimiter/);
  assert.doesNotMatch(clips.argumentosDeUnion(el, 0, 'salida.mp4', 'libx264', 12, []).join(' '), /volume=0/, 'sin tramos no se toca el audio');
  // Mientras Jarvis habla, el tramo sigue abierto hasta "ahora".
  clips.jarvisHabla(true);
  const ya = Date.now();
  const abierto = clips.mudosEnLinea([{ archivo: 'c.webm', inicio: ya - 1000, fin: ya + 3000, audio: true }], [], ya + 3000);
  assert.ok(abierto.length === 1 && abierto[0][1] - abierto[0][0] > 2.8, 'la voz de Jarvis que está sonando también se silencia');
  clips.jarvisHabla(false);
  clips._reiniciarJarvis();
});

prueba('calendario: el aviso dice de qué calendario es el evento y si se repite, y la lista lo muestra para encontrarlo', () => {
  const calendario = require('../src/main/calendario');
  const antes = config.leerConfig();
  const ahora = Date.now();
  const avisos = [];
  try {
    config.guardarConfig({ ...antes, calendario: { ...antes.calendario, activo: true, minutosAntes: [10] } });
    calendario.configurar({ alAvisar: (a) => avisos.push(a) });
    calendario._poner([{ id: 'g|pastilla|1', titulo: 'PASTILLA', inicio: new Date(ahora + 5 * 60000), fin: new Date(ahora + 20 * 60000), todoElDia: false, lugar: '', calendario: 'Salud (compartido)', enlace: 'https://www.google.com/calendar/event?eid=x', repite: true }]);
    const r = calendario.revisar(ahora);
    assert.strictEqual(r.length, 1);
    assert.match(avisos[0].texto, /Salud \(compartido\)/);
    assert.match(avisos[0].texto, /se repite/);
    const l = calendario.lista();
    assert.deepStrictEqual([l[0].titulo, l[0].calendario, l[0].repite, !!l[0].enlace], ['PASTILLA', 'Salud (compartido)', true, true]);
  } finally { config.guardarConfig(antes); calendario._poner([]); }
});

prueba('abrir un juego de Steam: lee los juegos instalados de todas las bibliotecas y abre steam://rungameid', async () => {
  const pc = require('../src/main/pc');
  const steam = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-'));
  const otra = fs.mkdtempSync(path.join(os.tmpdir(), 'biblioteca-'));
  fs.mkdirSync(path.join(steam, 'steamapps'), { recursive: true });
  fs.mkdirSync(path.join(otra, 'steamapps'), { recursive: true });
  const acf = (id, nombre) => `"AppState"\n{\n\t"appid"\t\t"${id}"\n\t"name"\t\t"${nombre}"\n}\n`;
  fs.writeFileSync(path.join(steam, 'steamapps', 'appmanifest_730.acf'), acf(730, 'Counter-Strike 2'));
  fs.writeFileSync(path.join(steam, 'steamapps', 'appmanifest_228980.acf'), acf(228980, 'Steamworks Common Redistributables'));
  fs.writeFileSync(path.join(otra, 'steamapps', 'appmanifest_1086940.acf'), acf(1086940, "Baldur's Gate 3"));
  fs.writeFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${steam.replace(/\\/g, '\\\\')}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${otra.replace(/\\/g, '\\\\')}"\n\t}\n}\n`);
  process.env.JARVIS_STEAM = steam;
  const abiertos = [];
  pc.configurar({ abrirEnlace: async (u) => { abiertos.push(u); } });
  try {
    const lista = pc.listarJuegosSteam({ forzar: true });
    assert.deepStrictEqual(lista.map((j) => [j.id, j.nombre]), [[1086940, "Baldur's Gate 3"], [730, 'Counter-Strike 2']], 'sin las herramientas de Steam');
    assert.match(await pc.abrirJuego({ juego: 'counter strike 2' }), /Counter-Strike 2/);
    await pc.abrirJuego({ juego: 'baldurs gate' });
    await pc.abrirJuego({ juego: 'cs2' });          // por el apodo conocido
    await pc.abrirJuego({ juego: 'lo que sea', appid: 730 });
    assert.deepStrictEqual(abiertos, ['steam://rungameid/730', 'steam://rungameid/1086940', 'steam://rungameid/730', 'steam://rungameid/730']);
    await assert.rejects(() => pc.abrirJuego({ juego: 'Juego Inexistente' }), /No encontré "Juego Inexistente" entre tus juegos de Steam/);
    await assert.rejects(() => pc.abrirJuego({}), /Falta decir qué juego/);
    // Dentro de una rutina.
    const r = await acciones.ejecutarPaso({ tipo: 'juego', juego: 'Counter-Strike 2', appid: 730 });
    assert.match(r, /Steam/);
    assert.strictEqual(abiertos[abiertos.length - 1], 'steam://rungameid/730');
  } finally { delete process.env.JARVIS_STEAM; fs.rmSync(steam, { recursive: true, force: true }); fs.rmSync(otra, { recursive: true, force: true }); pc.listarJuegosSteam({ forzar: true }); }
});

prueba('clips: el filtro de unión limita el audio y la configuración trae el volumen del sonido de Windows', () => {
  const clips = require('../src/main/clips');
  const args = clips._pruebas.argumentosDeUnion([{ archivo: 'a.webm', inicio: 0, fin: 6000, audio: true }, { archivo: 'b.webm', inicio: 6000, fin: 12000, audio: true }], 0, 'o.mp4', 'libx264', 12);
  const filtro = args[args.indexOf('-filter_complex') + 1];
  assert.match(filtro, /concat=n=2:v=1:a=1\[v\]\[ac\];\[ac\]alimiter=limit=0\.89[^\[]*\[a\]/);
  assert.strictEqual(config.leerConfig().clips.volumenSistema, 0.8);
});

prueba('clips: renombrar y recortar un clip guardado (clip nuevo, reemplazo y solo para enviar)', async () => {
  const { spawnSync } = require('child_process');
  const clips = require('../src/main/clips');
  const t = clips._pruebas;
  assert.strictEqual(t.nombreSeguro('  Mi: clip? "genial" / 1.  '), 'Mi clip genial 1');
  assert.throws(() => clips.renombrar('/tmp/afuera.mp4', 'x'), /no está en la carpeta de clips/);
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('      (sin ffmpeg: se omite la parte de video)'); return; }
  process.env.JARVIS_FFMPEG = 'ffmpeg';
  process.env.JARVIS_SIN_NVENC = '1';
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'editar-'));
  const previo = config.leerConfig();
  config.guardarConfig({ ...previo, clips: { ...previo.clips, carpeta } });
  const largo = (f) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-i', f]); const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(r.stderr)); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0; };
  try {
    const origen = path.join(carpeta, 'Counter-Strike 2 2026.11.12 - 21.05.09.mp4');
    const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '10', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', origen]);
    assert.strictEqual(r.status, 0, String(r.stderr).slice(-300));
    // Renombrar: sin extensión, caracteres prohibidos fuera, no pisa a otro.
    const otro = path.join(carpeta, 'Otro.mp4'); fs.copyFileSync(origen, otro);
    const nuevo1 = clips.renombrar(origen, 'Ace en Mirage: 1v4?');
    assert.strictEqual(path.basename(nuevo1), 'Ace en Mirage 1v4.mp4');
    assert.ok(fs.existsSync(nuevo1) && !fs.existsSync(origen));
    assert.throws(() => clips.renombrar(nuevo1, 'Otro'), /Ya hay un clip que se llama "Otro"/);
    assert.throws(() => clips.renombrar(nuevo1, '   '), /Escribí un nombre/);
    assert.throws(() => clips.renombrar(nuevo1, 'CON'), /no permite/);
    assert.strictEqual(path.basename(clips.renombrar(nuevo1, 'Ace en Mirage 1v4.mp4')), 'Ace en Mirage 1v4.mp4', 'si se escribe la extensión no se duplica');
    // Recortar a un clip nuevo (3 a 7 s = 4 s); el original queda.
    await assert.rejects(() => clips.recortar(nuevo1, { desde: 5, hasta: 5.2 }), /al menos medio segundo/);
    const rec = await clips.recortar(nuevo1, { desde: 3, hasta: 7 });
    assert.strictEqual(path.basename(rec.archivo), 'Ace en Mirage 1v4 (recorte).mp4');
    assert.ok(Math.abs(largo(rec.archivo) - 4) < 0.4, `dura ${largo(rec.archivo)}`);
    assert.ok(Math.abs(largo(nuevo1) - 10) < 0.4, 'el original sigue entero');
    const rec2 = await clips.recortar(nuevo1, { desde: 0, hasta: 2 });
    assert.strictEqual(path.basename(rec2.archivo), 'Ace en Mirage 1v4 (recorte 2).mp4', 'no pisa el recorte anterior');
    // Reemplazar el original.
    const rem = await clips.recortar(rec2.archivo, { desde: 0.5, hasta: 1.5, reemplazar: true });
    assert.strictEqual(rem.archivo, rec2.archivo);
    assert.ok(Math.abs(largo(rem.archivo) - 1) < 0.4);
    assert.ok(!fs.readdirSync(carpeta).some((n) => /editando|parte/.test(n)), 'no quedan archivos a medias');
    // "Guardar" se puede deshacer: el original quedó apartado (la lista no lo ve) y vuelve tal cual.
    assert.ok(rem.deshacer && clips.listar(Infinity).every((x) => !/original/.test(x.nombre)), 'el original apartado no aparece en la lista');
    const vuelto = await clips.deshacerRecorte(rem.deshacer);
    assert.strictEqual(vuelto.archivo, rec2.archivo);
    assert.ok(Math.abs(largo(rec2.archivo) - 2) < 0.4, 'volvió el de 2 s');
    await assert.rejects(() => clips.deshacerRecorte(rem.deshacer), /Ya no se puede deshacer/);
    // Pasado el plazo, el original va a la Papelera con un nombre que se entiende.
    let alaPapelera = null;
    const rem2 = await clips.recortar(rec2.archivo, { desde: 0, hasta: 1, reemplazar: true, plazo: 50, mandar: async (r) => { alaPapelera = path.basename(r); fs.unlinkSync(r); } });
    await new Promise((r) => setTimeout(r, 300));
    assert.strictEqual(alaPapelera, 'Ace en Mirage 1v4 (recorte 2) (original).mp4');
    assert.ok(!fs.readdirSync(carpeta).some((n) => n.endsWith(clips.SUFIJO_DESHACER)));
    await assert.rejects(() => clips.deshacerRecorte(rem2.deshacer), /Ya no se puede/);
    // Editar de verdad: sacar un pedazo del medio, vertical 9:16 y al doble de velocidad → (8 - 2) / 2 = 3 s, 202x360.
    assert.deepStrictEqual(clips._pruebas.partesQueQuedan(0, 8, [[2, 4], [6, 6.1]]), [[0, 2], [4, 6], [6.1, 8]]);
    const ed9 = await clips.recortar(nuevo1, { desde: 0, hasta: 8, edicion: { quitar: [[2, 4]], formato: 'vertical', encuadre: 0.5, velocidad: 2 } });
    assert.ok(Math.abs(largo(ed9.archivo) - 3) < 0.4, `dura ${largo(ed9.archivo)}`);
    assert.match(String(spawnSync('ffmpeg', ['-hide_banner', '-i', ed9.archivo]).stderr), /202x360/);
    assert.strictEqual(path.basename(ed9.archivo), 'Ace en Mirage 1v4 (vertical).mp4');
    // Con la PC bloqueada, la repetición instantánea queda en pausa (y vuelve al desbloquear).
    await clips.pausarPorBloqueo(true);
    assert.deepStrictEqual([clips.estado().enPausa, clips.estado().permitido], [true, false]);
    await clips.pausarPorBloqueo(false);
    assert.strictEqual(clips.estado().enPausa, false);
    // Montaje: pedazos de dos clips (uno repetido, uno al doble y otro sin sonido), vertical, un texto y fundido.
    // nuevo1 [1–3] a 2x = 1 s; rec.archivo [0–1] mudo = 1 s; nuevo1 [1–3] de nuevo a 2x = 1 s → 3 s en total.
    const pngDatos = `data:image/png;base64,${spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red@0.5:s=202x360,format=rgba', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']).stdout.toString('base64')}`;
    const mont = await clips.recortar(nuevo1, { desde: 0, hasta: 3, edicion: { tramos: [{ fuente: nuevo1, desde: 1, hasta: 3, velocidad: 2 }, { fuente: rec.archivo, desde: 0, hasta: 1, mudo: true }, { fuente: nuevo1, desde: 1, hasta: 3, velocidad: 2 }], formato: 'vertical', capas: [{ png: pngDatos, desde: 0.5, hasta: 2 }], fundido: true } });
    assert.ok(Math.abs(largo(mont.archivo) - 3) < 0.4, `montaje dura ${largo(mont.archivo)}`);
    assert.match(String(spawnSync('ffmpeg', ['-hide_banner', '-i', mont.archivo]).stderr), /202x360/);
    await assert.rejects(() => clips.recortar(nuevo1, { desde: 0, hasta: 3, edicion: { tramos: [{ fuente: '/etc/passwd', desde: 0, hasta: 1 }] } }), /ya no está en la carpeta/);
    await assert.rejects(() => clips.recortar(nuevo1, { desde: 0, hasta: 3, edicion: { tramos: [] } }), /sin pedazos/);
    assert.ok(!fs.readdirSync(require('os').tmpdir()).some((n) => n.startsWith('jarvis-capas-')), 'no quedan capas temporales');
    fs.unlinkSync(mont.archivo);
    // Favoritos: se marcan, aparecen en la lista y siguen al renombrar.
    clips.marcarFavorito(ed9.archivo, true);
    assert.ok(clips.listar(Infinity).find((x) => x.archivo === ed9.archivo).favorito);
    const ren9 = clips.renombrar(ed9.archivo, 'Vertical favorito');
    assert.ok(clips.listar(Infinity).find((x) => x.archivo === ren9).favorito, 'el favorito sigue al renombrar');
    fs.unlinkSync(ren9);
    // Convertir para editar (H.264 + AAC, cuadros fijos), comprimir, MP3 y GIF: copias al lado, con avance.
    const avances = [];
    const ed = await clips.transformar(nuevo1, 'editable', {}, (p) => avances.push(p));
    assert.strictEqual(ed.nombre, 'Ace en Mirage 1v4 (para editar).mp4');
    assert.ok(avances.includes(100) && avances.length > 1, `avance: ${avances}`);
    const info = String(spawnSync('ffmpeg', ['-hide_banner', '-i', ed.archivo]).stderr);
    assert.match(info, /Video: h264/); assert.match(info, /Audio: aac/);
    // Un video de prueba ya muy comprimido: con "Un poco" no achica, y se dice en vez de dejar una copia más pesada.
    await assert.rejects(() => clips.transformar(nuevo1, 'comprimir', { nivel: 'poco' }), /ya estaba bien comprimido/);
    assert.ok(!fs.readdirSync(carpeta).some((n) => /comprimido/.test(n)));
    const pesado = path.join(carpeta, 'Pesado.mp4');
    assert.strictEqual(spawnSync('ffmpeg', ['-y', '-hide_banner', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'anoisesrc=d=5', '-t', '5', '-vf', 'noise=alls=30:allf=t', '-c:v', 'libx264', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p', pesado]).status, 0);
    const comp = await clips.transformar(pesado, 'comprimir', { nivel: 'mucho' });
    assert.ok(comp.bytes < comp.antes, `comprimido ${comp.bytes} < ${comp.antes}`);
    assert.match(String(spawnSync('ffmpeg', ['-hide_banner', '-i', comp.archivo]).stderr), /x480/);
    assert.strictEqual(comp.nombre, 'Pesado (comprimido).mp4');
    const porPeso = await clips.transformar(pesado, 'comprimir', { mb: 0.5 });
    assert.ok(porPeso.bytes < 0.6 * 1024 * 1024, `pesa ${porPeso.bytes}`);
    assert.strictEqual(porPeso.nombre, 'Pesado (comprimido 2).mp4');
    const mp3 = await clips.transformar(nuevo1, 'mp3');
    assert.ok(mp3.nombre.endsWith('(audio).mp3') && !mp3.esVideo);
    const gif = await clips.transformar(nuevo1, 'gif');
    assert.ok(gif.nombre.endsWith('(gif).gif') && gif.bytes > 1000);
    await assert.rejects(() => clips.transformar('/tmp/afuera.mp4', 'mp3'), /no está en la carpeta/);
    // Vista previa liviana (para lo que el visor no lee, como HEVC): se arma una vez y se reusa.
    const v1 = await clips.vistaPrevia(nuevo1);
    assert.ok(fs.existsSync(v1) && /vista-/.test(v1));
    assert.strictEqual(await clips.vistaPrevia(nuevo1), v1);
    for (const x of [ed, comp, porPeso, mp3, gif]) fs.unlinkSync(x.archivo);
    fs.unlinkSync(pesado);
    // Mandar solo el trozo: llega un mp4 de ~2 s y no queda nada guardado de más.
    const antes = fs.readdirSync(carpeta).sort();
    let recibido = null;
    const dicho = await clips.enviarRecorte(nuevo1, { desde: 1, hasta: 3 }, 'Tomi', async (c, mp4) => { recibido = { c, mp4 }; return 'Enviado.'; });
    assert.strictEqual(dicho, 'Enviado.');
    assert.strictEqual(recibido.c, 'Tomi');
    const f = path.join(carpeta, 'recibido.tmp'); fs.writeFileSync(f, recibido.mp4);
    assert.ok(Math.abs(largo(f) - 2) < 0.4); fs.unlinkSync(f);
    assert.deepStrictEqual(fs.readdirSync(carpeta).sort(), antes);
    await assert.rejects(() => clips.enviarRecorte(nuevo1, { desde: 1, hasta: 3 }, '', async () => {}), /a quién/);
    // La vista previa: el servidor local entrega el video solo con el código.
    const servidor2 = require('../src/main/servidor');
    const web = await servidor2.iniciarInterfaz(48900);
    try {
      const url = servidor2.compartirLocal(nuevo1);
      const cuerpo = await new Promise((ok, mal) => http.get(url, { headers: { Range: 'bytes=0-99' } }, (res) => { const b = []; res.on('data', (d) => b.push(d)); res.on('end', () => ok({ estado: res.statusCode, n: Buffer.concat(b).length })); }).on('error', mal));
      assert.deepStrictEqual(cuerpo, { estado: 206, n: 100 });
      const mal = await new Promise((ok) => http.get(`${web.url}/v/codigo-falso/x.mp4`, (res) => { res.resume(); ok(res.statusCode); }));
      assert.strictEqual(mal, 404);
    } finally { web.cerrar(); }
  } finally { config.guardarConfig(previo); fs.rmSync(carpeta, { recursive: true, force: true }); }
});

prueba('los modos se pueden sacar de la barra del notch y siguen existiendo', () => {
  const previo = config.leerConfig();
  const modos = previo.modos.map((m) => (m.id === 'oculto' ? { ...m, enBarra: false } : m));
  config.guardarConfig({ ...previo, modos });
  const guardado = config.leerConfig().modos.find((m) => m.id === 'oculto');
  assert.strictEqual(guardado.enBarra, false);
  assert.ok(config.leerConfig().modos.some((m) => m.id === 'oculto'));
  config.guardarConfig(previo);
});

prueba('mirar la pantalla y clips de jugada: las frases se entienden sin confundirse con la webcam ni con otros clips', () => {
  const ve = (t) => comandos.pedidoDePantalla(t);
  for (const t of ['¿Qué estoy viendo?', 'Jarvis, mirá mi pantalla', '¿Cómo avanzo en este juego?', 'Traducime lo que dice la pantalla', 'Mirá lo que tengo en pantalla y decime qué hago']) assert.ok(ve(t), t);
  for (const t of ['¿Qué ves en la cámara?', '¿Qué ves?', 'Sacame una captura de pantalla', 'Grabá la pantalla', 'Poné música', '¿Qué hora es?']) assert.ok(!ve(t), t);
  const paso = (t) => (comandos.resolver(t) || { pasos: [{}] }).pasos[0];
  assert.deepStrictEqual(paso('Grabá la última kill'), { tipo: 'clip', accion: 'guardar', evento: 'kill' });
  assert.deepStrictEqual(paso('Hacé un clip de cómo morí recién'), { tipo: 'clip', accion: 'guardar', evento: 'muerte' });
  assert.deepStrictEqual(paso('Clipeame la jugada'), { tipo: 'clip', accion: 'guardar', evento: 'jugada' });
  assert.deepStrictEqual(paso('Guardá la última kill de los últimos 45 segundos'), { tipo: 'clip', accion: 'guardar', evento: 'kill', segundos: 45 });
  assert.deepStrictEqual(paso('Guardá el último minuto'), { tipo: 'clip', accion: 'guardar', segundos: 60 }, 'sin jugada, es un clip común');
  assert.strictEqual(paso('Hacé una jugada de ajedrez').tipo, undefined, 'sin pedir un clip no es un clip');
});

prueba('acciones: un clip de jugada dura lo que dice Ajustes, se rotula y avisa que no detecta la jugada', async () => {
  const clips = require('../src/main/clips');
  const previo = config.leerConfig();
  const original = clips.guardarYAvisar;
  const pedidos = [];
  clips.guardarYAvisar = async (o) => { pedidos.push(o); return { archivo: 'x.mp4', juego: 'Counter-Strike 2', segundos: o.segundos || 90 }; };
  try {
    config.guardarConfig({ ...previo, clips: { ...previo.clips, segundosJugada: 25 } });
    const r = await acciones.ejecutarPaso({ tipo: 'clip', accion: 'guardar', evento: 'muerte' });
    assert.deepStrictEqual(pedidos[0], { segundos: 25, etiqueta: 'Muerte', hasta: 0 });
    assert.match(r, /últimos 25 segundos como "Muerte" de Counter-Strike 2/);
    await acciones.ejecutarPaso({ tipo: 'clip', accion: 'guardar', evento: 'kill', segundos: 40 });
    assert.deepStrictEqual(pedidos[1], { segundos: 40, etiqueta: 'Kill', hasta: 0 }, 'si pide un tiempo, manda el pedido');
    await acciones.ejecutarPaso({ tipo: 'clip', accion: 'guardar' });
    assert.deepStrictEqual(pedidos[2], { segundos: undefined, etiqueta: '', hasta: 0 }, 'un clip común no se rotula');
  } finally { clips.guardarYAvisar = original; config.guardarConfig(previo); }
});

prueba('contexto: el link se lee de la barra del navegador y el título se limpia', async () => {
  const contexto = require('../src/main/contexto');
  assert.strictEqual(contexto.limpiarTitulo('Mi video - YouTube - Google Chrome'), 'Mi video - YouTube');
  assert.strictEqual(contexto.limpiarTitulo('Receta – Microsoft​ Edge'), 'Receta');
  assert.strictEqual(contexto.normalizarEnlace('youtube.com/watch?v=abc'), 'https://youtube.com/watch?v=abc');
  assert.strictEqual(contexto.normalizarEnlace('https://a.com/x'), 'https://a.com/x');
  assert.strictEqual(contexto.normalizarEnlace('cómo hacer pan'), '', 'una búsqueda no es un link');
  assert.strictEqual(contexto.normalizarEnlace('chrome://settings'), '', 'solo páginas web');
  process.env.JARVIS_CONTEXTO_FALSO = JSON.stringify({ proceso: 'chrome', titulo: 'Gol de Racing - YouTube - Google Chrome', url: 'www.youtube.com/watch?v=xyz' });
  try {
    const v = await contexto.ventanaActiva();
    assert.deepStrictEqual({ n: v.navegador, t: v.titulo, u: v.url }, { n: true, t: 'Gol de Racing - YouTube', u: 'https://www.youtube.com/watch?v=xyz' });
    assert.strictEqual(contexto.describir(v), 'Chrome: Gol de Racing - YouTube');
    process.env.JARVIS_CONTEXTO_FALSO = JSON.stringify({ proceso: 'cs2', producto: 'Counter-Strike 2', titulo: 'Counter-Strike 2', url: 'https://no.va' });
    const j = await contexto.ventanaActiva();
    assert.strictEqual(j.url, '', 'solo los navegadores tienen link');
    assert.strictEqual(contexto.describir(j), 'Counter-Strike 2');
  } finally { delete process.env.JARVIS_CONTEXTO_FALSO; }
});

prueba('notas: con aviso y con contexto (link y captura), se editan, suenan y se borran con su captura', async () => {
  const notas = require('../src/main/notas');
  const previo = config.leerConfig();
  const jpg = path.join(process.env.JARVIS_DATOS, 'falsa.jpg');
  fs.writeFileSync(jpg, Buffer.from([255, 216, 255, 217]));
  process.env.JARVIS_CAPTURA_FALSA = jpg;
  process.env.JARVIS_CONTEXTO_FALSO = JSON.stringify({ proceso: 'msedge', titulo: 'Tutorial de Blender - YouTube - Microsoft Edge', url: 'youtube.com/watch?v=blend' });
  try {
    // Los recordatorios de la versión anterior pasan a ser notas, una sola vez.
    fs.writeFileSync(path.join(process.env.JARVIS_DATOS, 'recordatorios.json'), JSON.stringify([{ id: 'viejo', texto: 'regar las plantas', cuando: Date.now() + 3600000 }]));
    notas._reiniciar();
    assert.ok(notas.listar().some((n) => n.id === 'viejo' && n.tipo === 'recordatorio'));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(process.env.JARVIS_DATOS, 'recordatorios.json'), 'utf8')), []);

    const hora = new Date(Date.now() + 2 * 3600000);
    const r = await notas.crear({ texto: 'Ver este video', hora: `${hora.getHours()}:${String(hora.getMinutes()).padStart(2, '0')}`, conContexto: true });
    const n = r.nota;
    assert.strictEqual(n.enlace, 'https://youtube.com/watch?v=blend');
    assert.strictEqual(n.titulo, 'Tutorial de Blender - YouTube');
    assert.ok(n.captura && notas.rutaDeCaptura(n.id), 'la captura quedó guardada con el nombre de la nota');
    assert.match(r.mensaje, /Anotado para (hoy|mañana) a las .*Guardé el link y una captura/);
    assert.ok(n.cuando > Date.now() && !n.avisada);

    // Sin pedir contexto no se mira nada; "capturar" apagado guarda el link sin captura.
    const suelta = (await notas.crear({ texto: 'Comprar leche' })).nota;
    assert.deepStrictEqual({ e: suelta.enlace, c: suelta.captura, w: suelta.cuando }, { e: '', c: '', w: null });
    config.guardarConfig({ ...previo, notas: { capturar: false } });
    const sinFoto = (await notas.crear({ texto: '', conContexto: true })).nota;
    assert.strictEqual(sinFoto.texto, 'Tutorial de Blender - YouTube', 'sin texto usa el título de la página');
    assert.strictEqual(sinFoto.captura, '');
    config.guardarConfig(previo);

    // Editar: texto, aviso (y quitarlo) y validar.
    assert.strictEqual(notas.actualizar(n.id, { texto: 'Ver el tutorial' }).texto, 'Ver el tutorial');
    assert.throws(() => notas.actualizar(n.id, { texto: '  ' }), /vacía/);
    assert.throws(() => notas.actualizar(n.id, { enlace: 'javascript:alert(1)' }), /http/);
    assert.strictEqual(notas.actualizar(n.id, { cuando: null }).cuando, null);
    const nuevaHora = Date.now() + 5 * 3600000;
    assert.strictEqual(notas.actualizar(n.id, { cuando: nuevaHora }).cuando, nuevaHora);

    // A la hora: suena una vez, la nota con link se queda, el recordatorio simple se va.
    const sonaron = [];
    notas.iniciar((x, tarde) => sonaron.push([x.texto, tarde]));
    notas.actualizar(n.id, { cuando: Date.now() + 1 });
    const simple = notas.crearSimple({ texto: 'sacar la pizza', minutos: 10 });
    notas.actualizar(simple.id, { cuando: Date.now() + 1 });
    await new Promise((ok) => setTimeout(ok, 20));
    notas.revisar(); notas.revisar();
    assert.deepStrictEqual(sonaron.map((x) => x[0]).sort(), ['Ver el tutorial', 'sacar la pizza']);
    const despues = notas.listar();
    assert.ok(despues.find((x) => x.id === n.id && x.avisada), 'la nota con link queda guardada, ya avisada');
    assert.ok(despues.find((x) => x.id === simple.id && x.avisada), 'el recordatorio simple también queda guardado, ya avisado (no se borra solo)');
    assert.match(notas.resumenDicho(), /Tenés \d+ notas\./);

    // Borrar saca también la captura.
    const archivo = notas.rutaDeCaptura(n.id);
    assert.ok(notas.borrar(n.id));
    assert.ok(!fs.existsSync(archivo));
    assert.strictEqual(notas.borrar(n.id), false);
    assert.strictEqual(notas.borrarVarias((x) => x.cuando && x.avisada), 1, 'la que ya avisó (el recordatorio simple) sigue ahí hasta que se borre');
    notas.actualizar('viejo', { cuando: Date.now() - 1000 }); // una fecha que ya pasó cuenta como avisada
    assert.strictEqual(notas.borrarVarias((x) => x.cuando && x.avisada), 1);
  } finally {
    delete process.env.JARVIS_CAPTURA_FALSA; delete process.env.JARVIS_CONTEXTO_FALSO;
    config.guardarConfig(previo);
    notas._reiniciar(); fs.rmSync(path.join(process.env.JARVIS_DATOS, 'notas.json'), { force: true });
  }
});

prueba('notas por voz: anotar, guardar lo que se ve y recordar con link; las consultas no abren nada raro', () => {
  const paso = (t) => (comandos.resolver(t) || { pasos: [{}] }).pasos[0];
  assert.deepStrictEqual(paso('Anotá comprar leche'), { tipo: 'nota', accion: 'crear', texto: 'Comprar leche', contexto: false });
  assert.deepStrictEqual(paso('Tomá nota de llamar al médico'), { tipo: 'nota', accion: 'crear', texto: 'Llamar al médico', contexto: false });
  assert.deepStrictEqual(paso('Guardame esto para después'), { tipo: 'nota', accion: 'crear', texto: '', contexto: true });
  assert.deepStrictEqual(paso('Guardá este video'), { tipo: 'nota', accion: 'crear', texto: '', contexto: true });
  assert.deepStrictEqual(paso('Recordame ver este video a las 6'), { tipo: 'nota', texto: 'Ver este video', hora: paso('Recordame ver este video a las 6').hora, contexto: true });
  assert.match(paso('Recordame ver este video a las 6').hora, /^\d\d:00$/);
  assert.strictEqual(paso('Recordame sacar la pizza en diez minutos').tipo, 'recordatorio', 'sin "esto" es un recordatorio común');
  assert.deepStrictEqual(paso('¿Qué notas tengo?'), { tipo: 'nota', accion: 'resumen' });
  assert.deepStrictEqual(paso('Abrí las notas'), { tipo: 'nota', accion: 'abrir' });
  assert.notStrictEqual(paso('Grabá una nota de voz').tipo, 'nota', 'una nota de voz es un audio, no una nota');
  assert.strictEqual(paso('Guardá este clip').tipo, 'clip', 'un clip sigue siendo un clip');
});

prueba('ver la pantalla: se manda la captura al modelo solo si está permitido, y se dice qué falta', async () => {
  const previo = config.leerConfig();
  const jpg = path.join(process.env.JARVIS_DATOS, 'pantalla.jpg');
  fs.writeFileSync(jpg, Buffer.from([255, 216, 255, 217]));
  process.env.JARVIS_CAPTURA_FALSA = jpg;
  process.env.JARVIS_CONTEXTO_FALSO = JSON.stringify({ proceso: 'cs2', producto: 'Counter-Strike 2', titulo: 'Counter-Strike 2' });
  const groq = await servidorFalso(47961, (p) => {
    if (!p.json) return { cuerpo: {} };
    const ultimo = p.json.messages[p.json.messages.length - 1];
    return Array.isArray(ultimo.content) ? respuesta({ content: 'Estás en la tienda de armas; comprá el rifle.' }) : respuesta({ content: 'nada' });
  });
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    // Apagado (por defecto): no se saca ninguna captura ni se manda nada.
    config.guardarConfig({ ...config.leerConfig(), contexto: { verPantalla: false, anchoCaptura: 1280 } });
    let r = await cerebro.decidir('¿Qué estoy viendo?', { historial: [] });
    assert.match(r.texto, /apagado: se prende en Ajustes → Contexto/);
    assert.strictEqual(groq.pedidos.length, 0);
    // Prendido: la captura viaja en el primer pedido, con el nombre del programa que está al frente.
    config.guardarConfig({ ...config.leerConfig(), contexto: { verPantalla: true, anchoCaptura: 1280 } });
    r = await cerebro.decidir('¿Cómo avanzo en este juego?', { historial: [] });
    assert.strictEqual(r.texto, 'Estás en la tienda de armas; comprá el rifle.');
    const conImagen = groq.pedidos.map((p) => p.json.messages[p.json.messages.length - 1]).find((m) => Array.isArray(m.content));
    assert.strictEqual(conImagen.content[1].image_url.url, 'data:image/jpeg;base64,/9j/2Q==');
    assert.match(conImagen.content[0].text, /captura de la pantalla.*Counter-Strike 2/);
    assert.match(conImagen.content[0].text, /cómo avanzo en este juego/i, 'la pregunta viaja con la captura');
  } finally {
    delete process.env.JARVIS_CAPTURA_FALSA; delete process.env.JARVIS_CONTEXTO_FALSO;
    config.guardarConfig(previo); await groq.cerrar();
  }
});

prueba('"poné No Se Pudo en YouTube en Telecomedor": el oído junta las palabras, se encuentra la tele y se prefiere la transmisión en vivo', async () => {
  const previo = config.leerConfig();
  const enTele = [];
  streaming.configurar({ abrir: async () => {}, youtubeEnTele: async (tele, id) => { enTele.push([tele, id]); return 'ok'; } });
  const s = await servidorFalso(47964, (p) => {
    if (!/\/search/.test(p.ruta)) return { cuerpo: {} };
    const vivo = /eventType=live/.test(p.ruta);
    return { cuerpo: { items: vivo
      ? [{ id: { videoId: 'RADIO' }, snippet: { title: 'Radio rock en vivo', channelTitle: 'Rock FM' } }, { id: { videoId: 'VIVO1' }, snippet: { title: 'EN VIVO | Programa de hoy', channelTitle: 'No Se Pudo' } }]
      : [{ id: { videoId: 'VOD1' }, snippet: { title: 'No Se Pudo - capítulo 12', channelTitle: 'No Se Pudo' } }] } };
  });
  try {
    config.guardarConfig({ ...previo, teles: [{ nombre: 'Tele Comedor', cast: 'Living TV' }], musica: { apiKeyYoutube: 'clave-yt', porDefecto: '' } });
    assert.strictEqual(config.buscarPorNombre(config.leerConfig().teles, 'telecomedor').nombre, 'Tele Comedor');
    assert.strictEqual(config.buscarPorNombre(config.leerConfig().teles, 'tele del comedor').nombre, 'Tele Comedor');
    assert.strictEqual(config.buscarPorNombre([{ nombre: 'Eva' }, { nombre: 'Evangelina' }], 'eva').nombre, 'Eva', 'sigue sin confundir nombres parecidos');
    const dicho = comandos.resolver('Poné No Se Pudo en YouTube en Telecomedor');
    assert.deepStrictEqual(dicho.pasos, [{ tipo: 'ver', titulo: 'No Se Pudo', servicio: 'youtube', dispositivo: 'telecomedor' }]);
    const r = await acciones.ejecutarPaso(dicho.pasos[0]);
    assert.strictEqual(r, 'Poniendo la transmisión en vivo "EN VIVO | Programa de hoy" de YouTube en Tele Comedor.');
    assert.deepStrictEqual(enTele.pop(), ['Tele Comedor', 'VIVO1'], 'va a la tele de Ajustes y es el vivo del canal, no cualquier vivo');
    // Si el canal no está en vivo, se pone el primer resultado de siempre.
    const s2 = s.pedidos.length;
    config.guardarConfig({ ...config.leerConfig() });
    assert.strictEqual(await streaming.ver({ titulo: 'gatos', dispositivo: 'la tele' }), 'Poniendo "No Se Pudo - capítulo 12" de YouTube en Tele Comedor.');
    assert.ok(s.pedidos.length > s2);
  } finally { await s.cerrar(); config.guardarConfig(previo); }
});

prueba('"cuánto va Estudiantes" es el marcador del partido (no un precio ni los alumnos); y no se confunde con otros temas', async () => {
  const q = (t) => { const r = comandos.resolver(t); return r && r.pasos && r.pasos[0]; };
  for (const frase of ['¿Cuánto va Estudiantes?', 'cuánto va estudiantes', 'Cómo salió Racing', 'cómo le fue a Boca', 'qué resultado tuvo River', 'cuánto van Estudiantes Independiente Rivadavia', 'resultado del partido de Independiente Rivadavia']) {
    const p = q(frase);
    assert.ok(p && p.tipo === 'buscar', `"${frase}" tiene que ser una búsqueda directa`);
    assert.match(p.consulta, /Fútbol argentino/);
    assert.ok(comandos.resolver(frase).deporte, `"${frase}" va por el camino de deportes`);
    assert.ok(!comandos.resolver(frase).resumir);
  }
  assert.match(q('cuánto va estudiantes').consulta, /Estudiantes de La Plata/);
  assert.match(q('cuánto va Estudiantes Independiente Rivadavia').consulta, /Estudiantes Independiente Rivadavia/);
  assert.match(q('cuándo juega Racing').consulta, /próximo partido de Racing/);
  assert.match(q('a qué hora juega Boca').consulta, /próximo partido de Boca/);
  // Lo que NO es fútbol sigue su camino.
  for (const frase of ['cuánto va el dólar', 'cómo está la economía de Argentina', 'cuánto va a salir el pasaje', 'cuánto salen los estudiantes universitarios']) {
    const r = comandos.resolver(frase);
    assert.ok(!(r && r.deporte), `"${frase}" no es un resultado de fútbol`);
  }
  // Lo que se dice en voz alta no lleva negritas ni marcas de cita.
  const t = require('../src/main/internet');
  assert.strictEqual(typeof t.buscar, 'function');
});

prueba('editar un clip: el servidor suelta el video cuando el reproductor corta, y reemplazar reintenta si Windows dice "ocupado"', async () => {
  const servidor = require('../src/main/servidor');
  const http = require('http');
  const os = require('os');
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jv-')), 'clip.mp4');
  fs.writeFileSync(archivo, Buffer.alloc(40 * 1024 * 1024, 7));
  const { url } = await servidor.compartirArchivo(archivo, '127.0.0.1');
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  // El reproductor pide un tramo y corta a la mitad (lo hace todo el tiempo al saltar en la línea de tiempo).
  await new Promise((ok) => {
    const pedido = http.get(url.replace(/^http:\/\/[^:]+/, 'http://127.0.0.1'), { headers: { Range: 'bytes=0-' } }, (res) => { res.once('data', () => { pedido.destroy(); ok(); }); });
    pedido.on('error', () => {});
  });
  await esperar(300);
  assert.strictEqual(servidor._lecturasAbiertas(), 0, 'cortar el pedido cierra la lectura del archivo');
  // soltar() cierra a la fuerza lo que siga abierto.
  const pedido2 = http.get(url.replace(/^http:\/\/[^:]+/, 'http://127.0.0.1'), (res) => { res.pause(); });
  pedido2.on('error', () => {});
  await esperar(300);
  assert.ok(servidor._lecturasAbiertas() >= 1, 'hay una lectura abierta');
  assert.ok(servidor.soltar(archivo) >= 1);
  assert.strictEqual(servidor._lecturasAbiertas(), 0);
  pedido2.destroy();
  fs.rmSync(path.dirname(archivo), { recursive: true, force: true });
});

prueba('apodos con coma: se entiende cualquiera ("Tarc, Tark") y siempre se dice el primero', () => {
  const lista = [{ nombre: 'Tarc, Tark', jid: 'g1@g.us' }, { nombre: 'Eva, mi hermana, mi prima, Evi', jid: 'a@s.whatsapp.net' }, { nombre: 'Evangelina' }, { nombre: 'PI Y PO, Pipo Po, pi y po' }];
  for (const dicho of ['Tarc', 'tark', 'Tark']) assert.strictEqual(config.buscarPorNombre(lista, dicho).nombre, 'Tarc', dicho);
  for (const dicho of ['Eva', 'mi hermana', 'mi prima', 'Evi']) {
    const r = config.buscarPorNombre(lista, dicho);
    assert.ok(r && r.nombre === 'Eva' && r.jid === 'a@s.whatsapp.net', `"${dicho}" es Eva`);
  }
  assert.strictEqual(config.buscarPorNombre(lista, 'pipo po').nombre, 'PI Y PO');
  assert.strictEqual(config.buscarPorNombre(lista, 'Evangelina').nombre, 'Evangelina', 'Evangelina no es Eva');
  assert.strictEqual(config.buscarPorNombre(lista, 'Pedro'), null);
  // Dos sinónimos del mismo contacto no cuentan como dos candidatos; dos contactos distintos con el mismo sinónimo, sí.
  assert.strictEqual(config.buscarPorNombre([{ nombre: 'Eva, Evi' }], 'evi').nombre, 'Eva');
  assert.strictEqual(config.nombrePrincipal('Eva, mi hermana'), 'Eva');
  assert.strictEqual(config.conSinonimos('Tarc, Tark'), 'Tarc (también se pide como: Tark)');
  assert.strictEqual(config.conSinonimos('Eva'), 'Eva');
});

prueba('el nombre mal escrito por el oído ("Harvis") se corrige a "Jarvis" dentro del pedido, sin tocar otras palabras', () => {
  assert.strictEqual(comandos.corregirNombre('mandale a Tomi que dice Harvis que sí, es re legal'), 'mandale a Tomi que dice Jarvis que sí, es re legal');
  assert.strictEqual(comandos.corregirNombre('Yarvis, decile que Charvis anda bárbaro'), 'Jarvis, decile que Jarvis anda bárbaro');
  assert.strictEqual(comandos.corregirNombre('decile a Harry que la harina está lista, el marvel y el arvi'), 'decile a Harry que la harina está lista, el marvel y el arvi');
  assert.strictEqual(comandos.corregirNombre('mandale a Eva que Zarvis ya vino', ['zarvis']), 'mandale a Eva que Jarvis ya vino');
});

prueba('con música: "Hey Jarvis" a mitad de lo que se oye despierta solo con saludo claro y nombre seguro', () => {
  const dm = (t) => comandos.despertarEnMedio(t);
  assert.deepStrictEqual(dm('y yo te sigo cantando la luna hey Jarvis poné pausa'), { resto: 'poné pausa', como: 'jarvis' });
  assert.strictEqual(dm('la noche che Harvis siguiente').resto, 'siguiente');
  assert.strictEqual(dm('oye Jarvis').resto, '');
  assert.strictEqual(dm('cantando a Jarvis en la luna'), null, 'sin saludo no despierta');
  assert.strictEqual(dm('hey amor poné pausa'), null);
  assert.strictEqual(dm('Jarvis pausa'), null, 'al principio lo resuelve despertar()');
});

prueba('capturas de pantalla: sacar, mandar la última o una nueva; "capturá los últimos 30 segundos" sigue siendo un clip', () => {
  const p = (t) => { const r = comandos.resolver(t); return r && r.pasos && r.pasos[0]; };
  for (const f of ['sacá una captura de pantalla', 'screenshot', 'hacé un screenshot', 'tomá un print screen', 'sacame una captura', 'pantallazo']) assert.deepStrictEqual(p(f), { tipo: 'clip', accion: 'captura' }, f);
  assert.deepStrictEqual(p('mandame una captura'), { tipo: 'clip', accion: 'captura-enviar', contacto: 'yo' });
  assert.deepStrictEqual(p('mandame la última captura de pantalla'), { tipo: 'clip', accion: 'captura-enviar', contacto: 'yo', ultimo: true });
  assert.deepStrictEqual(p('mandale un screenshot a Tomi'), { tipo: 'clip', accion: 'captura-enviar', contacto: 'Tomi' });
  assert.deepStrictEqual(p('enviale la captura a Tarc'), { tipo: 'clip', accion: 'captura-enviar', contacto: 'Tarc' });
  assert.strictEqual(p('capturá los últimos 30 segundos').accion, 'guardar');
  assert.strictEqual(p('guardá un clip').accion, 'guardar');
  assert.strictEqual(p('mandale el último clip a Tomi').accion, 'enviar');
});

prueba('mails: lo que ya viste o borraste no vuelve a avisar, y se puede elegir de quién se avisa', () => {
  const antes = config.leerConfig();
  try {
    notificaciones.limpiar();
    const avisos = [];
    notificaciones.configurar({ alAvisar: (n, a) => avisos.push([n.clave, a]) });
    const mail = (clave, de = 'Eva', direccion = 'eva@casa.com') => ({ origen: 'mail', clave, de, direccion, asunto: 'Hola', texto: 'Hola' });
    assert.strictEqual(notificaciones.agregar(mail('c1')), 'avisar');
    assert.strictEqual(notificaciones.agregar(mail('c1')), 'callar', 'ya está en la lista: no se repite');
    notificaciones.limpiar('mail'); // la borró
    assert.strictEqual(notificaciones.agregar(mail('c1')), 'callar', 'borrada: no vuelve ni al reabrir Jarvis');
    assert.strictEqual(notificaciones.agregar(mail('c2')), 'avisar', 'otro mail sí');
    // filtro de remitentes
    config.guardarConfig({ ...antes, notificaciones: { ...antes.notificaciones, mail: { modo: 'todo', elegidos: [], silenciados: ['spam@', 'promos'] } } });
    assert.strictEqual(notificaciones.decidir(mail('c3', 'Promos Tienda', 'ofertas@tienda.com')), 'callar');
    assert.strictEqual(notificaciones.decidir(mail('c4', 'Eva', 'eva@casa.com')), 'avisar');
    config.guardarConfig({ ...antes, notificaciones: { ...antes.notificaciones, mail: { modo: 'elegidos', elegidos: ['eva@casa.com', 'Tomi'], silenciados: [] } } });
    assert.strictEqual(notificaciones.decidir(mail('c5', 'Eva', 'eva@casa.com')), 'avisar');
    assert.strictEqual(notificaciones.decidir(mail('c6', 'Banco', 'aviso@banco.com')), 'callar', 'con "solo lo que elijas" el resto se calla');
  } finally { config.guardarConfig(antes); notificaciones.limpiar(); }
});

prueba('avisos por fuente: nada / solo lo elegido / todo, por cuenta de mail, con lo que llegó sin avisar y "no avisarme más"', () => {
  const antes = config.leerConfig();
  try {
    notificaciones.limpiar(); notificaciones.olvidarOmitidas();
    const avisos = [];
    notificaciones.configurar({ alAvisar: (n, a) => avisos.push(`${n.origen}:${n.de}:${a}`), modo: () => 'normal' });
    const poner = (parcial) => config.guardarConfig({ ...antes, notificaciones: { ...antes.notificaciones, reglas: [], ...parcial } });
    const mail = (clave, de, direccion, cuenta = 'gmail', via = '') => ({ origen: 'mail', clave, de, direccion, cuenta, via, asunto: `Hola de ${de}`, texto: 'x' });
    poner({ whatsapp: { modo: 'elegidos', elegidos: ['Tomi'], silenciados: [], grupos: true }, mail: { modo: 'elegidos', elegidos: ['jefe@empresa.com'], silenciados: [], cuentas: {} } });
    assert.strictEqual(notificaciones.agregar({ origen: 'whatsapp', de: 'Tomi', texto: 'che', clave: 'n@s' }), 'avisar');
    assert.strictEqual(notificaciones.agregar({ origen: 'whatsapp', de: 'Laura', texto: '¿venís a cenar?', clave: 'l@s' }), 'callar');
    assert.strictEqual(notificaciones.agregar({ origen: 'whatsapp', de: 'Laura', texto: 'respondeme', clave: 'l@s' }), 'callar');
    assert.strictEqual(notificaciones.agregar(mail('g1', 'Jefe', 'jefe@empresa.com')), 'avisar');
    assert.strictEqual(notificaciones.agregar(mail('g2', 'Tienda', 'ofertas@tienda.com')), 'callar');
    // Lo que no avisó queda anotado (uno por persona) para elegirlo después.
    const om = notificaciones.omitidas();
    assert.deepStrictEqual(om.map((o) => [o.origen, o.nombre, o.cantidad]).sort(), [['mail', 'Tienda', 1], ['whatsapp', 'Laura', 2]]);
    assert.strictEqual(om.find((o) => o.nombre === 'Laura').texto, 'respondeme', 'el último mensaje');
    notificaciones.olvidarOmitidas(om.find((o) => o.nombre === 'Laura').clave);
    assert.strictEqual(notificaciones.omitidas().length, 1);
    notificaciones.olvidarOmitidas();
    assert.strictEqual(notificaciones.omitidas().length, 0);
    // Cada cuenta de mail puede portarse distinto al resto.
    poner({ mail: { modo: 'elegidos', elegidos: ['jefe@empresa.com'], silenciados: ['promos'], cuentas: { outlook: 'todo', gmail: '' } } });
    assert.strictEqual(notificaciones.decidir(mail('h1', 'Cualquiera', 'x@y.com', 'gmail')), 'callar', 'Gmail sigue el modo de Mail');
    assert.strictEqual(notificaciones.decidir(mail('h2', 'Cualquiera', 'x@y.com', 'gmail', 'outlook')), 'avisar', 'lo de Hotmail (reenviado) va por su cuenta: Todo');
    assert.strictEqual(notificaciones.decidir(mail('h3', 'Promos Hotmail', 'p@promos.com', 'outlook')), 'callar', 'lo silenciado gana en cualquier cuenta');
    poner({ mail: { modo: 'todo', elegidos: [], silenciados: [], cuentas: { gmail: 'nada' } } });
    assert.strictEqual(notificaciones.decidir(mail('h4', 'Alguien', 'a@b.com', 'gmail')), 'callar', 'una cuenta en "Nada"');
    assert.strictEqual(notificaciones.decidir(mail('h5', 'Alguien', 'a@b.com', 'outlook')), 'avisar');
    // Recordatorios y calendario: "Nada" los calla.
    poner({ calendario: { modo: 'nada' }, nota: { modo: 'nada' } });
    assert.strictEqual(notificaciones.decidir({ origen: 'calendario', de: 'Reunión', texto: 'x' }), 'callar');
    assert.strictEqual(notificaciones.decidir({ origen: 'nota', de: 'Recordatorio', texto: 'x' }), 'callar');
    poner({ calendario: { modo: 'todo' }, nota: { modo: 'todo' } });
    assert.strictEqual(notificaciones.decidir({ origen: 'calendario', de: 'Reunión', texto: 'x' }), 'avisar');
    // "No avisarme más de…" desde la novedad: lo saca de lo elegido, o lo silencia si seguiría avisando.
    poner({ whatsapp: { modo: 'elegidos', elegidos: ['Tomi', 'Eva'], silenciados: [], grupos: true } });
    notificaciones.limpiar();
    notificaciones.agregar({ origen: 'whatsapp', de: 'Tomi', texto: 'hola', clave: 'n@s' });
    assert.strictEqual(notificaciones.dejarDeAvisar('whatsapp|Tomi'), 'Tomi');
    let c = config.leerConfig().notificaciones.whatsapp;
    assert.deepStrictEqual(c.elegidos, ['Eva']);
    assert.ok(c.silenciados.includes('Tomi'));
    assert.strictEqual(notificaciones.pendientes().length, 0, 'y la novedad se va');
    assert.strictEqual(notificaciones.decidir({ origen: 'whatsapp', de: 'Tomi', texto: 'x' }), 'callar');
  } finally { config.guardarConfig(antes); notificaciones.limpiar(); notificaciones.olvidarOmitidas(); }
});

prueba('calendario: en "solo lo elegido" avisan los calendarios marcados y los eventos con avisos propios; "nada" apaga las alertas de Jarvis', async () => {
  const calendario = require('../src/main/calendario');
  const antes = config.leerConfig();
  const t0 = Date.now();
  try {
    const mk = (id, titulo, cal, extra = {}) => ({ id, titulo, calendario: cal, inicio: new Date(t0 + 8 * 60000), fin: new Date(t0 + 68 * 60000), todoElDia: false, ...extra });
    const con = (modoCal, calendarios = {}) => config.guardarConfig({ ...antes, calendario: { ...antes.calendario, activo: true, minutosAntes: [10], calendarios }, notificaciones: { ...antes.notificaciones, calendario: { modo: modoCal } } });
    const probar = (modoCal, calendarios, evento) => {
      con(modoCal, calendarios);
      require('fs').rmSync(path.join(process.env.JARVIS_DATOS, 'calendario-avisados.json'), { force: true });
      calendario._poner([evento]);
      return calendario.revisar(t0, { desde: t0 - 60000 }).map((a) => a.de);
    };
    assert.deepStrictEqual(probar('todo', {}, mk('a1', 'Reunión', 'Trabajo')), ['Reunión'], '"Todo": los avisos de siempre');
    assert.deepStrictEqual(probar('elegidos', {}, mk('a2', 'Reunión', 'Trabajo')), [], '"Solo lo elegido": un calendario sin marcar no avisa');
    assert.deepStrictEqual(probar('elegidos', { Trabajo: { avisar: true } }, mk('a3', 'Reunión', 'Trabajo')), ['Reunión'], '…y el marcado "Avisar" sí');
    assert.deepStrictEqual(probar('elegidos', { Trabajo: { avisos: [{ antes: 10, canal: 'jarvis' }] } }, mk('a4', 'Reunión', 'Trabajo')), ['Reunión'], 'con avisos propios también');
    assert.deepStrictEqual(probar('elegidos', { Trabajo: { avisar: true, silenciar: true } }, mk('a5', 'Reunión', 'Trabajo')), [], 'silenciado gana');
    assert.deepStrictEqual(probar('nada', { Trabajo: { avisos: [{ antes: 10, canal: 'jarvis' }] } }, mk('a6', 'Reunión', 'Trabajo')), [], '"Nada": ni una alerta en Jarvis');
  } finally { config.guardarConfig(antes); }
});

prueba('clips: "a la papelera" se puede deshacer dentro del plazo; pasado el plazo se manda a la Papelera de Windows', async () => {
  const clips = require('../src/main/clips');
  const antes = config.leerConfig();
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-papelera-'));
  try {
    config.guardarConfig({ ...antes, clips: { ...antes.clips, carpeta } });
    const video = path.join(carpeta, 'prueba.mp4');
    fs.writeFileSync(video, 'x');
    const r = await clips.aLaPapelera(video, async () => {}, 60000);
    assert.ok(!fs.existsSync(video), 'se aparta enseguida');
    assert.ok(fs.existsSync(video + clips.SUFIJO_BORRANDO));
    assert.match(await clips.deshacerBorrado(r.id), /recuper/);
    assert.ok(fs.existsSync(video), 'vuelve a su lugar');
    await assert.rejects(() => clips.deshacerBorrado(r.id), /Ya pasó el tiempo/);
    const mandados = [];
    const r2 = await clips.aLaPapelera(video, async (a) => { mandados.push(a); fs.unlinkSync(a); }, 20);
    await new Promise((ok) => setTimeout(ok, 120));
    assert.strictEqual(mandados.length, 1, 'cumplido el plazo se manda a la papelera una sola vez');
    await assert.rejects(() => clips.deshacerBorrado(r2.id), /Ya pasó el tiempo/);
    await assert.rejects(() => clips.aLaPapelera('C:\\otro\\lado.mp4', async () => {}), /carpeta de clips/);
  } finally { config.guardarConfig(antes); }
});

prueba('notas: un mensaje de WhatsApp se programa para una hora, y las notas avisadas no se borran', () => {
  const notas = require('../src/main/notas');
  const antes = notas.listar ? notas.listar().length : 0;
  assert.throws(() => notas.programarMensaje({ contacto: 'Tomi', mensaje: '' }), /Necesito a quién/);
  assert.throws(() => notas.programarMensaje({ contacto: 'Tomi', mensaje: 'Hola' }), /minutos|hora/);
  const r = notas.programarMensaje({ contacto: 'Tomi', mensaje: 'Entrá al Counter', hora: '17:00' });
  assert.match(r.mensaje, /le mando a Tomi: Entrá al Counter/);
  assert.deepStrictEqual(r.nota.enviar, { contacto: 'Tomi', mensaje: 'Entrá al Counter' });
  assert.strictEqual(r.nota.tipo, 'mensaje');
  if (notas.listar) assert.strictEqual(notas.listar().length, antes + 1);
});

prueba('calendario: eventos propios, cambios solo en Jarvis (sin tocar el original) y avisos por evento', async () => {
  const calendario = require('../src/main/calendario');
  const antes = config.leerConfig();
  const ahora = Date.now();
  try {
    config.guardarConfig({ ...antes, calendario: { activo: false, enlace: '', minutosAntes: [10] } });
    const e = await calendario.guardarLocal({ titulo: 'Partido con Tomi', inicio: ahora + 3 * 3600000, avisos: [30, 5], whatsapp: true });
    let l = calendario.lista().find((x) => x.id === e.id);
    assert.ok(l && l.local && l.whatsapp);
    assert.deepStrictEqual(l.avisos.filter((a) => a.canal === 'jarvis').map((a) => a.antes), [30, 5]);
    assert.deepStrictEqual(l.avisos.filter((a) => a.canal === 'whatsapp').map((a) => a.antes), [30, 5], 'el casillero viejo de WhatsApp se convierte en avisos por WhatsApp');
    assert.match(calendario.agenda('proximo'), /Partido con Tomi/, 'con solo eventos propios ya se cuenta la agenda');
    await assert.rejects(() => calendario.guardarLocal({ titulo: '', inicio: ahora }), /nombre/);
    await calendario.guardarLocal({ id: e.id, titulo: 'Partido en lo de Tomi', inicio: ahora + 3 * 3600000 });
    l = calendario.lista().find((x) => x.id === e.id);
    assert.strictEqual(l.titulo, 'Partido en lo de Tomi');
    // de afuera: se cambia el título y se silencia, y se puede volver al original
    calendario._poner([{ id: 'g1', titulo: 'Reunión', inicio: new Date(ahora + 2 * 3600000), fin: new Date(ahora + 3 * 3600000), lugar: '', todoElDia: false, calendario: 'Trabajo' }]);
    await calendario.cambiar('g1', { titulo: 'Reunión con Eva', silenciar: true });
    await calendario.borrarLocal(e.id);
    assert.ok(!calendario.lista().some((x) => x.id === e.id), 'el propio se borró');
  } finally {
    await calendario.cambiar('g1', null);
    config.guardarConfig(antes);
  }
});

prueba('grabar pantalla: recuadro como fracciones de la pantalla (par para ffmpeg), y las órdenes de voz eligen el modo', () => {
  const clips = require('../src/main/clips');
  assert.strictEqual(clips._pruebas.filtroDeRecorte(null), null);
  const f = clips._pruebas.filtroDeRecorte({ x: 0.25, y: 0.1, w: 0.5, h: 0.4 });
  assert.match(f, /^crop=trunc\(iw\*0\.50000\/2\)\*2:trunc\(ih\*0\.40000\/2\)\*2:trunc\(iw\*0\.25000\/2\)\*2:trunc\(ih\*0\.10000\/2\)\*2$/);
  const p = (t) => comandos.resolver(t).pasos[0];
  assert.deepStrictEqual(p('grabá una ventana'), { tipo: 'clip', accion: 'grabar', modo: 'ventana' });
  assert.deepStrictEqual(p('empezá a grabar un recuadro'), { tipo: 'clip', accion: 'grabar', modo: 'recuadro' });
  assert.deepStrictEqual(p('grabá la pantalla completa'), { tipo: 'clip', accion: 'grabar', modo: 'pantalla' });
  assert.deepStrictEqual(p('empezá a grabar'), { tipo: 'clip', accion: 'grabar' }, 'sin modo graba como siempre');
});

prueba('clips por voz: "video de los últimos 10 segundos a Youtubers", "enviar un screenshot a Youtubers", "un screenshot de pantalla"', () => {
  const p = (t) => comandos.resolver(t).pasos[0];
  assert.deepStrictEqual(p('Manda un video de los últimos 10 segundos a Youtubers'), { tipo: 'clip', accion: 'enviar', contacto: 'Youtubers', segundos: 10 });
  assert.deepStrictEqual(p('Enviar un screenshot a Youtubers'), { tipo: 'clip', accion: 'captura-enviar', contacto: 'Youtubers' });
  assert.deepStrictEqual(p('Un screenshot de pantalla'), { tipo: 'clip', accion: 'captura' });
});

prueba('widgets: la grilla respeta la posición elegida, deja espacios vacíos y recoloca lo que no entra', async () => {
  const { empaquetar } = await import('../src/ui/widgets.js');
  const w = (id, tam, extra = {}) => ({ id, tipo: 'reloj', tam, alto: 1, ...extra });
  let r = empaquetar([w('a', 2, { col: 3, fila: 2 }), w('b', 2)]);
  assert.deepStrictEqual([r[0].col, r[0].fila], [3, 2], 'queda donde se puso (hay un hueco vacío arriba)');
  assert.deepStrictEqual([r[1].col, r[1].fila], [1, 1], 'el sin posición se acomoda desde el principio');
  r = empaquetar([w('a', 2, { col: 1, fila: 1 }), w('b', 2, { col: 2, fila: 1 })]);
  assert.notDeepStrictEqual([r[1].col, r[1].fila], [2, 1], 'si se pisan, el segundo se recoloca');
  assert.ok(r.every((x) => x.col >= 1 && x.col + x.tam - 1 <= 4));
});

prueba('recordatorios: la nota avisa con sonido por defecto, cada una puede cambiarlo o mutearlo, y queda como aviso hasta sacarla', async () => {
  const antes = config.leerConfig();
  config.guardarConfig({ ...antes, notificaciones: { ...antes.notificaciones, reglas: [], sonido: '', sonidos: { nota: 'campanita', calendario: 'gota' } } });
  try {
    const nota = { origen: 'nota', de: 'Recordatorio', texto: 'Llamar al médico', clave: 'nota:1' };
    assert.strictEqual(notificaciones.sonidoPara(nota), 'campanita', 'por defecto suena');
    assert.strictEqual(notificaciones.sonidoPara({ ...nota, sonido: 'alerta' }), 'alerta', 'el de la nota manda');
    assert.strictEqual(notificaciones.sonidoPara({ ...nota, sonido: 'ninguno' }), '', '"ninguno" la mutea');
    assert.strictEqual(notificaciones.sonidoPara({ origen: 'calendario', de: 'Reunión', texto: 'x' }), 'gota', 'los eventos tienen su propio sonido por defecto');
    assert.strictEqual(notificaciones.sonidoPara({ origen: 'calendario', de: 'Reunión', texto: 'x', sonido: 'ninguno' }), '');
    notificaciones.agregar(nota);
    const hay = notificaciones.resumen().find((g) => g.origen === 'nota');
    assert.ok(hay, 'queda en la lista de avisos pendientes (los ojos se quedan en estado de aviso)');
  } finally { config.guardarConfig(antes); }
  const notas = require('../src/main/notas');
  notas._reiniciar();
  const { nota: n } = await notas.crear({ texto: 'Con sonido', minutos: 30, sonido: 'alerta' });
  assert.strictEqual(n.sonido, 'alerta');
  assert.strictEqual(notas.actualizar(n.id, { sonido: 'ninguno' }).sonido, 'ninguno');
  assert.strictEqual(notas.actualizar(n.id, { sonido: '' }).sonido, undefined, 'vacío = vuelve al de siempre');
  notas.borrar(n.id);
});

prueba('calendario: se pueden pedir los eventos de cualquier rango de fechas (con eventos propios y su sonido)', async () => {
  const calendario = require('../src/main/calendario');
  const antes = config.leerConfig();
  config.guardarConfig({ ...antes, calendario: { ...antes.calendario, enlace: '', enlaces: [] } });
  const dia = 24 * 3600 * 1000;
  const en = Date.now() + 40 * dia;
  const e = await calendario.guardarLocal({ titulo: 'Examen', inicio: en, fin: en + 3600000, sonido: 'ninguno' });
  try {
    const r = await calendario.rango(en - dia, en + dia);
    assert.ok(r.eventos.some((x) => x.titulo === 'Examen' && x.sonido === 'ninguno'), 'aparece dentro de su rango, con el sonido elegido');
    assert.strictEqual((await calendario.rango(en + 5 * dia, en + 9 * dia)).eventos.some((x) => x.titulo === 'Examen'), false, 'fuera del rango no');
    await assert.rejects(() => calendario.rango(en, en - 1), /rango/);
    await assert.rejects(() => calendario.rango(0, 1000 * dia), /más corto/);
  } finally { await calendario.borrarLocal(e.id).catch(() => {}); config.guardarConfig(antes); }
});

prueba('calendario: varios avisos por evento (Jarvis, WhatsApp y mail, a mí o a otros, con texto propio), con salida tardía si Jarvis estaba cerrado', async () => {
  const calendario = require('../src/main/calendario');
  const antes = config.leerConfig();
  const T0 = Date.now(); const dia = 24 * 3600 * 1000;
  const inicio = T0 + 8 * dia;
  const jarvis = []; const wa = []; const mails = [];
  let waConectado = false;
  try {
    config.guardarConfig({ ...antes, calendario: { ...antes.calendario, activo: false, enlace: '', enlaces: [], minutosAntes: [10], calendarios: { Trabajo: { color: '#ff0000', avisos: [{ antes: 60, canal: 'whatsapp', para: 'Tomi' }] }, Silencio: { silenciar: true } } } });
    calendario.configurar({ alAvisar: (a) => jarvis.push(a), enviarWhatsapp: async (para, texto) => { if (!waConectado) throw new Error('WhatsApp todavía no conectó'); wa.push({ para, texto }); }, enviarMail: async (m) => { mails.push(m); } });
    await calendario.cambiar('g1', { avisos: [
      { antes: 10080, canal: 'mail', para: 'yo@x.com', asunto: 'En una semana: {titulo}', texto: 'Acordate de {titulo} ({fecha} {hora}) en {lugar}' },
      { antes: 4320, canal: 'whatsapp', para: '', texto: 'Faltan 3 días para {titulo}' },
      { antes: 60, canal: 'whatsapp', para: '+54 9 11 5555-0000' },
      { antes: 10, canal: 'jarvis', sonido: 'alerta' },
    ] });
    const ev = (extra = {}) => ({ id: 'g1', titulo: 'Examen', inicio: new Date(inicio), fin: new Date(inicio + 3600000), lugar: 'Aula 4', todoElDia: false, calendario: 'Principal', ...extra });
    calendario._poner([ev()]);
    // Jarvis abierto: a la semana justa sale el mail; no se repite.
    assert.deepStrictEqual(calendario.revisar(T0 + dia + 60000, { desde: T0 }), []);
    assert.strictEqual(await calendario.procesar(T0 + dia + 60000), 1);
    assert.deepStrictEqual([mails[0].para, mails[0].asunto], ['yo@x.com', 'En una semana: Examen']);
    assert.match(mails[0].texto, /^Acordate de Examen \(.* \d\d:\d\d\) en Aula 4/);
    calendario.revisar(T0 + dia + 90000, { desde: T0 + dia + 60000 });
    assert.strictEqual(await calendario.procesar(T0 + dia + 90000), 0);
    assert.strictEqual(mails.length, 1, 'una sola vez');
    // Jarvis cerrado entre el día 2 y el 7: al abrir, WhatsApp todavía no conectó → queda en cola y sale apenas conecta.
    calendario.revisar(T0 + 7 * dia, { desde: T0 + 2 * dia });
    assert.strictEqual(await calendario.procesar(T0 + 7 * dia), 0, 'sin WhatsApp no sale, pero no se pierde');
    waConectado = true;
    assert.strictEqual(await calendario.procesar(T0 + 7 * dia + 30000), 1);
    assert.strictEqual(wa[0].para, 'yo');
    assert.match(wa[0].texto, /Jarvis estaba cerrado.*Faltan 3 días para Examen/);
    // A una hora del evento: WhatsApp a otro número; 10 min antes: alerta en Jarvis con su sonido.
    calendario.revisar(inicio - 59 * 60000, { desde: inicio - 61 * 60000 });
    await calendario.procesar(inicio - 59 * 60000);
    assert.strictEqual(wa[1].para, '+54 9 11 5555-0000');
    assert.match(wa[1].texto, /^Evento: Examen\nEmpieza en/);
    const j = calendario.revisar(inicio - 5 * 60000, { desde: inicio - 6 * 60000 });
    assert.deepStrictEqual([j.length, jarvis[0].sonido], [1, 'alerta']);
    // Avisos propios de un calendario (Trabajo) y calendario silenciado.
    calendario._poner([ev({ id: 'g2', titulo: 'Daily', calendario: 'Trabajo' }), ev({ id: 'g3', titulo: 'Yoga', calendario: 'Silencio' })]);
    calendario.revisar(inicio - 59 * 60000, { desde: inicio - 61 * 60000 });
    await calendario.procesar(inicio - 59 * 60000);
    assert.ok(wa.some((x) => x.para === 'Tomi' && /Daily/.test(x.texto)), 'usa los avisos del calendario');
    assert.ok(!jarvis.some((a) => a.de === 'Yoga'), 'un calendario silenciado no avisa');
    // Colores: el del calendario, y el del evento si lo cambió.
    await calendario.cambiar('g2', { color: '#00ff00' });
    calendario._poner([ev({ id: 'g2', titulo: 'Daily', calendario: 'Trabajo', color: '#00ff00' })]);
    const fila = calendario.lista(10, T0)[0];
    assert.deepStrictEqual([fila.colorCalendario, fila.color], ['#ff0000', '#00ff00']);
    assert.deepStrictEqual(calendario.normalizarAvisos([15, { antes: 5, canal: 'mail', para: ' a@b.com ' }, { antes: -1 }, { antes: 99999999 }]).map((a) => [a.antes, a.canal, a.para]), [[15, 'jarvis', undefined], [5, 'mail', 'a@b.com']]);
  } finally {
    await calendario.cambiar('g1', null); await calendario.cambiar('g2', null);
    for (const f of ['calendario-pendientes.json', 'calendario-avisados.json', 'calendario-latido.json']) { try { fs.unlinkSync(path.join(process.env.JARVIS_DATOS || '', f)); } catch {} }
    config.guardarConfig(antes); calendario._poner([]);
  }
});

prueba('Cast: lo que se mandó a un aparato se puede pausar, seguir, pasar de canción y cambiar de volumen desde Jarvis', async () => {
  const pasos = [];
  let vencida = false;
  const yt = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const campos = Object.fromEntries(new URLSearchParams(cuerpo));
      pasos.push({ metodo: req.method, ruta: u.pathname, sid: u.searchParams.get('SID'), campos });
      if (u.pathname.endsWith('/get_lounge_token_batch')) { res.end(JSON.stringify({ screens: [{ screenId: 'p-1', loungeToken: 'ficha-1' }] })); return; }
      if (!u.searchParams.get('SID')) { res.end('168\n[[0,["c","SID-' + pasos.length + '","",8]]\n,[1,["S","GS-xyz"]]\n]\n'); return; }
      if (req.method === 'GET') { res.end('[[3,["nowPlaying",{"videoId":"V1","state":"1"}]]]'); return; }
      if (vencida && campos.req0__sc === 'next' && u.searchParams.get('SID') === 'SID-3') { res.statusCode = 400; res.end('Unknown SID'); return; }
      res.end('ok');
    });
  });
  await new Promise((ok) => yt.listen(47964, '127.0.0.1', ok));
  try {
    assert.strictEqual(cast.tieneSesion('Nest Sala'), false);
    await assert.rejects(() => cast.controlarYoutube('Nest Sala', 'siguiente'), /No mandé música/);
    await cast.mandarAYoutube('p-1', 'V1', { audioOnly: true, nombre: 'Nest Sala' });
    assert.strictEqual(cast.tieneSesion('nest sala'), true);
    pasos.length = 0;
    for (const a of ['pausar', 'reanudar', 'siguiente', 'anterior']) await cast.controlarYoutube('Nest Sala', a);
    await cast.controlarYoutube('Nest Sala', 'volumen', 35);
    const ordenes = pasos.filter((p) => p.metodo === 'POST').map((p) => p.campos.req0__sc);
    assert.deepStrictEqual(ordenes, ['pause', 'play', 'next', 'previous', 'setVolume']);
    assert.strictEqual(pasos.filter((p) => p.campos.req0__sc === 'setVolume')[0].campos.req0_volume, '35');
    // sesión vencida: abre otra y repite la orden
    vencida = true; pasos.length = 0;
    await cast.controlarYoutube('Nest Sala', 'siguiente');
    assert.ok(pasos.filter((p) => p.metodo === 'POST' && p.campos.req0__sc === 'next').length >= 1, 'la orden llega aunque haya que abrir otra sesión');
    cast.olvidarSesion('Nest Sala');
    await assert.rejects(() => cast.controlarYoutube('Nest Sala', 'pausar'), /No mandé música/);
  } finally { yt.closeAllConnections(); await new Promise((r) => yt.close(r)); }
});


// ---------- Modo sin conexión ----------
prueba('la conexión: se corta tras dos fallos, avisa una vez al caer y una al volver', async () => {
  const conexion = require('../src/main/conexion');
  let red = true;
  const avisos = [];
  conexion.configurar({ sonda: async () => red, alertar: (t, o) => avisos.push({ t, ...o }), alCambiar: () => {}, alVolver: () => avisos.push({ t: 'volver' }) });
  await conexion.revisar();
  assert.strictEqual(conexion.sinConexion(), false);
  red = false;
  await conexion.revisar();
  assert.strictEqual(conexion.sinConexion(), false, 'un fallo suelto no alcanza');
  await conexion.revisar();
  assert.strictEqual(conexion.sinConexion(), true);
  await conexion.revisar();
  assert.strictEqual(avisos.filter((a) => a.tipo === 'internet' && !a.bien).length, 1, 'avisa una sola vez');
  assert.strictEqual(conexion.estado().internet, false);
  assert.match(conexion.motivo(), /No tengo internet/);
  red = true;
  await conexion.revisar();
  assert.strictEqual(conexion.sinConexion(), false);
  assert.ok(avisos.some((a) => a.bien && /Volvió la conexión/.test(a.t)));
  assert.ok(avisos.some((a) => a.t === 'volver'));
});

prueba('la conexión: los servicios avisan una vez al caer y una al volver, y sin internet no avisan por separado', async () => {
  const conexion = require('../src/main/conexion');
  let red = true;
  const avisos = [];
  conexion.configurar({ sonda: async () => red, alertar: (t, o) => avisos.push({ t, ...o }), alCambiar: () => {}, alVolver: () => {} });
  await conexion.revisar();
  conexion.reportar('groq', false, { detalle: 'falló (503)' });
  assert.strictEqual(avisos.length, 0, 'una falla suelta no es una caída');
  conexion.reportar('groq', false, { detalle: 'falló (503)' });
  conexion.reportar('groq', false, { detalle: 'falló (503)' });
  assert.strictEqual(avisos.length, 1);
  assert.match(avisos[0].t, /Groq no responde/);
  assert.deepStrictEqual(conexion.estado().problemas.map((x) => x.id), ['groq']);
  conexion.reportar('groq', true);
  assert.strictEqual(avisos.length, 2);
  assert.match(avisos[1].t, /Groq volvió/);
  conexion.reportar('gemini', false, { cupo: true });
  assert.match(avisos[2].t, /sin cupo/);
  conexion.reportar('gemini', true);
  avisos.length = 0;
  red = false;
  await conexion.revisar(); await conexion.revisar();
  conexion.reportar('mail', false); conexion.reportar('mail', false); conexion.reportar('mail', false);
  assert.strictEqual(avisos.filter((a) => /Mail/.test(a.t)).length, 0, 'con internet cortado no se avisa de cada servicio');
  red = true;
  await conexion.revisar();
  assert.strictEqual(conexion.estado().problemas.length, 0, 'al volver internet se limpia lo que había caído por eso');
});

prueba('modo sin conexión manual: se prende y apaga, avisa y se guarda', () => {
  const conexion = require('../src/main/conexion');
  const avisos = [];
  conexion.configurar({ alertar: (t, o) => avisos.push({ t, ...o }), alCambiar: () => {}, alVolver: () => {} });
  assert.strictEqual(conexion.sinConexion(), false);
  conexion.fijarManual(true);
  assert.strictEqual(conexion.sinConexion(), true);
  assert.strictEqual(config.leerConfig().conexion.manual, true);
  assert.strictEqual(conexion.estado().manual, true);
  assert.match(conexion.motivo(), /modo sin conexión/);
  conexion.fijarManual(true);
  assert.strictEqual(avisos.length, 1, 'no repite el aviso si ya estaba');
  conexion.fijarManual(false);
  assert.strictEqual(conexion.sinConexion(), false);
  assert.strictEqual(avisos.length, 2);
});

prueba('sin conexión: la cola de WhatsApp guarda, manda al volver y descarta lo viejo', async () => {
  const conexion = require('../src/main/conexion');
  const mandados = [];
  const avisos = [];
  let falla = true;
  conexion.configurar({ alertar: (t, o) => avisos.push({ t, ...o }), alCambiar: () => {}, alVolver: () => {}, enviadores: { whatsapp: async (it) => { if (falla) throw new Error('no'); mandados.push(`${it.contacto}:${it.mensaje}`); } } });
  conexion.descartarCola();
  conexion.fijarManual(true);
  conexion.encolar({ tipo: 'whatsapp', contacto: 'Tomi', mensaje: 'llego tarde' });
  conexion.encolar({ tipo: 'whatsapp', contacto: 'Eva', mensaje: 'hola' });
  assert.strictEqual(conexion.estado().enCola, 2);
  assert.deepStrictEqual(await conexion.vaciarCola(), { enviados: 0 }, 'sin conexión no sale nada');
  conexion.fijarManual(false); // al apagarlo ya intenta vaciar la cola (y falla): se espera a que termine ese intento
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(conexion.cola().length, 2, 'si falla, queda para reintentar');
  falla = false;
  await conexion.vaciarCola();
  assert.deepStrictEqual(mandados, ['Tomi:llego tarde', 'Eva:hola']);
  assert.strictEqual(conexion.cola().length, 0);
  assert.ok(avisos.some((a) => /Mandé los 2 mensajes/.test(a.t)));
  // lo que lleva más de 6 horas ya no se manda
  config.guardarJSON('cola-sin-conexion.json', [{ id: 'x', creado: Date.now() - 7 * 3600 * 1000, tipo: 'whatsapp', contacto: 'Viejo', mensaje: 'tarde' }]);
  await conexion.vaciarCola();
  assert.ok(!mandados.some((m) => /Viejo/.test(m)));
  assert.ok(avisos.some((a) => /demasiado en cola/.test(a.t)));
  assert.strictEqual(conexion.cola().length, 0);
});

prueba('sin conexión: los pedidos online se rechazan clarito y el WhatsApp pregunta si lo deja en cola', async () => {
  const conexion = require('../src/main/conexion');
  conexion.configurar({ alertar: () => {}, alCambiar: () => {}, alVolver: () => {}, enviadores: {} });
  conexion.descartarCola();
  conexion.fijarManual(true);
  try {
    await assert.rejects(() => acciones.ejecutarPaso({ tipo: 'clima', lugar: 'Rosario' }), /modo sin conexión: no puedo consultar el clima/);
    await assert.rejects(() => acciones.ejecutarPaso({ tipo: 'buscar', consulta: 'algo' }), /no puedo buscar en internet/);
    await assert.rejects(() => acciones.ejecutarPaso({ tipo: 'foto_whatsapp', contacto: 'yo' }), /no puedo mandar fotos/);
    let pend = null;
    const ctx = { porVoz: true, pedirConfirmacion: (p) => { pend = p; } };
    const q = await acciones.ejecutarPaso({ tipo: 'whatsapp', contacto: 'Tomi', mensaje: 'llego tarde' }, ctx);
    assert.match(q, /\?$/);
    assert.match(q, /cola/);
    assert.strictEqual(conexion.cola().length, 0, 'todavía no quedó en cola');
    assert.match(await pend.descartar(), /no lo mando/);
    assert.strictEqual(conexion.cola().length, 0);
    assert.match(await pend.accion(), /lo dejé en cola/);
    assert.deepStrictEqual(conexion.cola().map((x) => [x.contacto, x.mensaje]), [['Tomi', 'llego tarde']]);
    conexion.descartarCola();
    assert.match(await acciones.ejecutarPaso({ tipo: 'whatsapp', contacto: 'Eva', mensaje: 'hola' }, { porVoz: false }), /lo dejé en cola/);
    assert.strictEqual(conexion.cola().length, 1);
    assert.strictEqual(conexion.queHacerSinConexion({ tipo: 'volumen', nivel: 30 }), null);
    assert.strictEqual(conexion.queHacerSinConexion({ tipo: 'decir', texto: 'hola' }), null);
    assert.strictEqual(conexion.queHacerSinConexion({ tipo: 'clip', accion: 'enviar' }), 'no');
    assert.strictEqual(conexion.queHacerSinConexion({ tipo: 'clip', accion: 'grabar' }), null);
    conexion.fijarManual(false);
    assert.strictEqual(conexion.queHacerSinConexion({ tipo: 'clima' }), null);
  } finally { conexion.fijarManual(false); conexion.descartarCola(); }
});

prueba('sin conexión: los modelos de la nube no se consultan y el error lo dice', async () => {
  const conexion = require('../src/main/conexion');
  conexion.configurar({ alertar: () => {}, alCambiar: () => {}, alVolver: () => {} });
  const groq = await servidorFalso(47961, () => respuesta({ content: 'no debería llegar' }));
  try {
    usarIA({ groq: { clave: 'g', url: 'http://127.0.0.1:47961' } });
    conexion.fijarManual(true);
    await assert.rejects(() => pensar.preguntar([{ role: 'user', content: 'hola' }], null), (e) => e.sinConexion === true);
    assert.strictEqual(groq.pedidos.length, 0, 'no se pidió nada a internet');
  } finally { conexion.fijarManual(false); await groq.cerrar(); }
});

prueba('comandos de voz para el modo sin conexión', () => {
  const r = (t) => (comandos.resolver(t, { programas: [] }) || {}).pasos;
  for (const f of ['modo sin conexión', 'sin internet', 'ponete en modo sin conexión', 'activá el modo sin conexión', 'modo offline']) assert.deepStrictEqual(r(f), [{ tipo: 'conexion', accion: 'sin' }], f);
  for (const f of ['volvé a conectarte', 'salí del modo sin conexión', 'desactivá el modo sin conexión', 'reconectate', 'con internet']) assert.deepStrictEqual(r(f), [{ tipo: 'conexion', accion: 'con' }], f);
});

prueba('sin conexión: mail no revisa y el calendario usa lo guardado', async () => {
  const conexion = require('../src/main/conexion');
  const calendario = require('../src/main/calendario');
  conexion.configurar({ alertar: () => {}, alCambiar: () => {}, alVolver: () => {} });
  conexion.fijarManual(true);
  try {
    await correo.revisarTodo();
    const antes = calendario.proximos(5);
    await calendario.actualizar();
    assert.deepStrictEqual(calendario.proximos(5), antes, 'el calendario no cambia ni falla');
  } finally { conexion.fijarManual(false); }
});

prueba('la puerta del detector "Hey Jarvis" duerme en silencio y guarda el principio de la frase', async () => {
  const { Puerta } = await import(require('url').pathToFileURL(require('path').join(__dirname, '..', 'src', 'ui', 'puerta.js')).href);
  const trozo = (nivel) => Int16Array.from({ length: 1280 }, (_, i) => (i % 2 ? nivel : -nivel));
  const p = new Puerta({ preroll: 5, colaMs: 1000 });
  let t = 0;
  for (let i = 0; i < 30; i++) assert.strictEqual(p.entrar(trozo(20), t += 80).trozos.length, 0, 'en silencio no deja pasar nada');
  const abre = p.entrar(trozo(3000), t += 80);
  assert.strictEqual(abre.reiniciar, true, 'al abrirse el detector empieza de cero');
  assert.strictEqual(abre.trozos.length, 6, 'entrega los 5 trozos guardados más el que la abrió');
  const sigue = p.entrar(trozo(30), t += 80);
  assert.strictEqual(sigue.trozos.length, 1, 'abierta sigue dejando pasar');
  assert.strictEqual(sigue.reiniciar, false);
  for (let i = 0; i < 20; i++) p.entrar(trozo(30), t += 80);
  assert.strictEqual(p.entrar(trozo(20), t += 80).trozos.length, 0, 'se cierra pasado el tiempo sin ruido');
  // un cuarto con más ruido de fondo aprende su nivel y no se queda abierta
  const q = new Puerta({ preroll: 5, colaMs: 500 });
  t = 0;
  for (let i = 0; i < 60; i++) q.entrar(trozo(400), t += 80);
  assert.strictEqual(q.entrar(trozo(400), t += 80).trozos.length, 0, 'ruido parejo = silencio para la puerta');
  assert.strictEqual(q.entrar(trozo(4000), t += 80).trozos.length > 0, true, 'una voz fuerte la abre');
});


prueba('"descargá este video" y "descargá el audio" se entienden; bajar el volumen no es una descarga', () => {
  const d = (t) => (comandos.resolver(t, { programas: [] }) || {}).pasos || [];
  const tipo = (t) => (d(t)[0] || {}).tipo;
  assert.strictEqual(tipo('descargá este video'), 'descargar');
  assert.strictEqual(d('descargá este video')[0].modo, 'video');
  assert.strictEqual(d('descargá el audio de este video')[0].modo, 'audio');
  assert.strictEqual(d('bajame el mp3 de esto')[0].modo, 'audio');
  assert.strictEqual(d('descargá este video en 720')[0].calidad, '720');
  assert.strictEqual(d('bajame el video en 1080p')[0].calidad, '1080');
  assert.strictEqual(d('descargá este video en la mejor calidad')[0].calidad, 'mejor');
  assert.strictEqual(d('cancelá la descarga')[0].modo, 'cancelar');
  for (const no of ['bajá el volumen', 'bajá la luz', 'bajá el brillo', 'poné música']) assert.notStrictEqual(tipo(no), 'descargar', no);
});

prueba('los errores de yt-dlp se explican en criollo', () => {
  const descargas = require('../src/main/descargas');
  assert.match(descargas.explicar('ERROR: Unsupported URL: https://x.com'), /no lo soporta/);
  assert.match(descargas.explicar('ERROR: Sign in to confirm your age'), /iniciar sesión/);
  assert.match(descargas.explicar('ERROR: Video unavailable'), /no está disponible/);
  assert.match(descargas.explicar('ERROR: Unable to extract nsig'), /desactualizado/);
  assert.match(descargas.explicar(''), /sin decir por qué/);
});

prueba('yt-dlp: el link va después de "--" y los audios a su subcarpeta', () => {
  const descargas = require('../src/main/descargas');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jdl-'));
  const a = descargas.argumentos({ modo: 'audio', url: '--exec=malo', calidad: '1080' }, dir, null);
  assert.strictEqual(a[a.length - 2], '--');
  assert.strictEqual(a[a.length - 1], '--exec=malo');
  assert.ok(a.includes('-x') && a.includes('mp3'));
  assert.ok(fs.existsSync(path.join(dir, 'Audio')));
  const v = descargas.argumentos({ modo: 'video', url: 'https://a.b/c', calidad: '720' }, dir, '/x/ffmpeg');
  assert.ok(!v.includes('-x') && v.includes('--ffmpeg-location'));
});

prueba('descarga para el celular: queda en su carpeta propia y se la sigue por número', async () => {
  const descargas = require('../src/main/descargas');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jdl-cel-'));
  const falso = path.join(dir, 'yt-dlp.js');
  fs.writeFileSync(falso, `#!/usr/bin/env node
const a = process.argv.slice(2); if (a[0] === '--version') { console.log('1'); process.exit(0); }
const o = a[a.indexOf('-o') + 1].replace('%(title).150B', 'Tema').replace('%(id)s', 'x').replace('%(ext)s', a.includes('-x') ? 'mp3' : 'mp4');
require('fs').mkdirSync(require('path').dirname(o), { recursive: true }); require('fs').writeFileSync(o, 'abc');
console.log('[download]  50.0%'); console.log('JARVIS-ARCHIVO:' + o);`);
  fs.chmodSync(falso, 0o755);
  const antes = process.env.JARVIS_YTDLP;
  process.env.JARVIS_YTDLP = falso;
  const avisos = [];
  descargas.configurar({ avisar: (t) => avisos.push(t), ffmpeg: async () => null });
  try {
    await descargas.buscarYtdlp({ olvidar: true });
    const carpeta = path.join(dir, 'temporal');
    const r = await descargas.encolar({ url: 'https://youtu.be/x', modo: 'audio', carpeta, para: 'celular' });
    assert.ok(r.id > 0 && /empiezo a descargar el audio/.test(r.texto));
    assert.strictEqual(descargas.buscar(r.id).para, 'celular');
    for (let i = 0; i < 40 && descargas.buscar(r.id).estado !== 'listo'; i++) await new Promise((ok) => setTimeout(ok, 100));
    const d = descargas.buscar(r.id);
    assert.strictEqual(d.estado, 'listo', d.error);
    assert.strictEqual(d.archivo, path.join(carpeta, 'Audio', 'Tema [x].mp3'), 'en la carpeta pedida, no en Descargas');
    assert.match(avisos.at(-1), /Se lo paso al celular/);
    assert.strictEqual(typeof await descargas.iniciar({ url: 'https://youtu.be/y', carpeta }), 'string', 'iniciar sigue devolviendo el texto');
    // Un título con acentos que yt-dlp informa con otra codificación (pasaba en Windows con X/Twitter): igual se encuentra por el [id].
    fs.writeFileSync(falso, `#!/usr/bin/env node
const a = process.argv.slice(2); if (a[0] === '--version') { console.log('1'); process.exit(0); }
const o = a[a.indexOf('-o') + 1].replace('%(title).150B', 'Golazo ⚽ de Ñandú').replace('%(id)s', '2126300256094793755').replace('%(ext)s', 'mp4');
require('fs').mkdirSync(require('path').dirname(o), { recursive: true }); require('fs').writeFileSync(o, 'abc');
console.log('JARVIS-ARCHIVO:' + o.replace('⚽', '?').replace('Ñ', 'Ã\u0091')); console.log('JARVIS-ID:2126300256094793755');`);
    const r2 = await descargas.encolar({ url: 'https://x.com/a/status/2126300256094793755', modo: 'video', calidad: '720', carpeta: path.join(dir, 'x'), para: 'celular' });
    for (let i = 0; i < 40 && !['listo', 'error'].includes(descargas.buscar(r2.id).estado); i++) await new Promise((ok) => setTimeout(ok, 100));
    assert.strictEqual(descargas.buscar(r2.id).estado, 'listo', descargas.buscar(r2.id).error);
    assert.strictEqual(descargas.buscar(r2.id).archivo, path.join(dir, 'x', 'Golazo ⚽ de Ñandú [2126300256094793755].mp4'));
    assert.strictEqual(descargas.buscar(99999), null);
  } finally { process.env.JARVIS_YTDLP = antes || ''; if (!antes) delete process.env.JARVIS_YTDLP; await descargas.buscarYtdlp({ olvidar: true }); }
});

prueba('WhatsApp manda cada archivo como corresponde: video, audio o documento', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwa-'));
  const mp4 = path.join(dir, 'chico.mp4'); fs.writeFileSync(mp4, Buffer.alloc(1000));
  const mp3 = path.join(dir, 'tema.mp3'); fs.writeFileSync(mp3, Buffer.alloc(1000));
  const mkv = path.join(dir, 'peli.mkv'); fs.writeFileSync(mkv, Buffer.alloc(1000));
  const grande = path.join(dir, 'largo.mp4'); fs.writeFileSync(grande, ''); fs.truncateSync(grande, 17 * 1024 * 1024);
  const enviados = [];
  whatsapp._pruebas.ponerSocket({ user: { id: '5491100001111:5@s.whatsapp.net' }, sendMessage: async (jid, c) => { enviados.push(c); } });
  try {
    assert.match(await whatsapp.enviarArchivo('yo', mp4, 'chico.mp4'), /^Video enviado/);
    assert.deepStrictEqual(enviados.at(-1), { video: { url: mp4 }, mimetype: 'video/mp4' });
    assert.match(await whatsapp.enviarArchivo('yo', mp3, 'tema.mp3'), /^Audio enviado/);
    assert.strictEqual(enviados.at(-1).mimetype, 'audio/mpeg');
    assert.match(await whatsapp.enviarArchivo('yo', mkv, 'peli.mkv'), /^Archivo enviado/);
    assert.strictEqual(enviados.at(-1).fileName, 'peli.mkv');
    await whatsapp.enviarArchivo('yo', grande, 'largo.mp4');
    assert.ok(enviados.at(-1).document, 'lo pesado va como documento (sin perder calidad)');
  } finally { whatsapp._pruebas.ponerSocket(null, 'apagado'); }
});

prueba('si no se puede leer la pestaña, el aviso dice qué vio Jarvis y se usa el link copiado', async () => {
  const descargas = require('../src/main/descargas');
  let copiado = '';
  descargas.configurar({ enlace: async () => ({ url: '', nota: 'Lo que tenías al frente era Jarvis, no un navegador.' }), portapapeles: () => copiado });
  await assert.rejects(descargas.enlaceDeLoQueMira(''), /al frente era Jarvis.*portapapeles está vacío.*Copialo/s);
  copiado = 'https://youtu.be/abc123';
  assert.strictEqual(await descargas.enlaceDeLoQueMira(''), 'https://youtu.be/abc123');
  copiado = 'mirá esto https://www.youtube.com/watch?v=Zgdufz). gracias';
  assert.strictEqual(await descargas.enlaceDeLoQueMira(''), 'https://www.youtube.com/watch?v=Zgdufz');
  assert.strictEqual(descargas.enlaceDeTexto('youtube.com/watch?v=Zgdufz'), 'https://youtube.com/watch?v=Zgdufz');
  assert.strictEqual(descargas.enlaceDeTexto('hola que tal'), '');
  copiado = 'nada';
  descargas.configurar({ enlace: async () => ({ url: '', titulo: '(273) Bill Haley & His Comets - Rock Around The Clock (1955) HD - YouTube', nota: 'x' }) });
  assert.strictEqual(await descargas.enlaceDeLoQueMira(''), 'ytsearch1:Bill Haley & His Comets - Rock Around The Clock (1955) HD');
  descargas.configurar({ enlace: async () => 'https://www.youtube.com/watch?v=x1' });
  assert.strictEqual(await descargas.enlaceDeLoQueMira(''), 'https://www.youtube.com/watch?v=x1');
});

prueba('el asistente se puede llamar como quieras: despierta con su nombre y con cómo lo escribe el oído', () => {
  const antes = config.leerConfig();
  const nombre = require('../src/main/nombre');
  try {
    config.guardarConfig({ ...antes, nombre: 'Viernes' });
    assert.strictEqual(nombre.esJarvis(), false);
    const d = (t) => { const r = comandos.despertar(t); return r ? r.resto : null; };
    assert.strictEqual(d('Viernes, poné música'), 'poné música');
    assert.strictEqual(d('che Biernes poné música'), 'poné música', 'b por v');
    assert.strictEqual(d('hey viernez'), '', 'z por s');
    assert.strictEqual(d('Jarvis, poné música'), null, 'con otro nombre, "Jarvis" ya no lo despierta');
    assert.strictEqual(d('el viernes vamos al cine'), null, 'nombrarlo a mitad de la frase no lo despierta');
    assert.strictEqual(comandos.limpiar('che viernes poné música'), 'pone musica');
    assert.strictEqual(comandos.corregirNombre('decile que dice Biernes que sí'), 'decile que dice Viernes que sí');
    // Lo que se le enseña (Ajustes → "Enseñarle") también vale.
    assert.strictEqual(comandos.despertar('Fiernes poné música', { extras: ['fiernes'] }).resto, 'poné música');
    // Un nombre corto necesita un saludo adelante: "luz" es una palabra común.
    config.guardarConfig({ ...antes, nombre: 'Luz' });
    assert.strictEqual(d('luz del baño'), null);
    assert.strictEqual(d('che luz, poné música'), 'poné música');
    // Un nombre de dos palabras, aunque el oído lo junte o lo separe.
    config.guardarConfig({ ...antes, nombre: 'Señor Robot' });
    assert.strictEqual(d('hey señor robot apagá la tele'), 'apagá la tele');
    assert.strictEqual(d('señorrobot apagá la tele'), 'apagá la tele');
    // Volver a "Jarvis" deja todo como siempre.
    config.guardarConfig({ ...antes, nombre: 'Jarvis' });
    assert.strictEqual(nombre.esJarvis(), true);
    assert.strictEqual(d('che Yarvis poné música'), 'poné música');
  } finally { config.guardarConfig(antes); }
});

prueba('lo elegido en el instalador (nombre, componentes, inicio) se aplica una sola vez', () => {
  const componentes = require('../src/main/componentes');
  const antes = config.leerConfig();
  const archivo = path.join(process.env.JARVIS_DATOS, 'instalacion.txt');
  try {
    config.guardarConfig({ ...antes, voz: { ...antes.voz, tambien: 'yarbiz' } });
    // El instalador escribe UTF-16 con BOM, como lo hace NSIS.
    const texto = 'nombre=Señor Ñandú\r\nvoz=1\r\nvoz_daniela=0\r\nvoz_kokoro=0\r\nffmpeg=1\r\nytdlp=1\r\ninicio=0\r\n';
    fs.writeFileSync(archivo, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(texto, 'utf16le')]));
    const r = componentes.aplicarInstalacion();
    assert.strictEqual(r.nombre, 'Señor Ñandú');
    assert.deepStrictEqual(r.componentes.sort(), ['ffmpeg', 'voz', 'ytdlp']);
    const c = config.leerConfig();
    assert.strictEqual(c.nombre, 'Señor Ñandú');
    assert.strictEqual(c.inicioConWindows, false);
    assert.strictEqual(c.voz.tambien, '', 'lo enseñado para el nombre anterior se olvida');
    assert.ok(!fs.existsSync(archivo) && fs.existsSync(`${archivo}.aplicado`), 'no se vuelve a aplicar');
    assert.strictEqual(componentes.aplicarInstalacion(), null);
    assert.strictEqual(comandos.despertar('hey señor ñandú poné música').resto, 'poné música');
  } finally { config.guardarConfig(antes); try { fs.rmSync(`${archivo}.aplicado`, { force: true }); } catch {} }
});

prueba('Información: versión, fecha del release y tamaño en disco', async () => {
  const informacion = require('../src/main/informacion');
  const i = informacion.leer();
  assert.strictEqual(i.version, require('../package.json').version);
  assert.ok(!Number.isNaN(Date.parse(i.fecha)), 'tiene fecha de release');
  assert.strictEqual(i.copia, 'codigo');
  assert.ok(i.electron === '' || /^\d+\./.test(i.electron));
  fs.writeFileSync(path.join(process.env.JARVIS_DATOS, 'peso-de-prueba.bin'), Buffer.alloc(5000));
  const t = await informacion.tamanos();
  assert.ok(t.datos >= 5000, 'cuenta los datos');
  assert.strictEqual(t.programaSinDato, true, 'desde el código no inventa el tamaño del programa');
  assert.strictEqual(t.total, t.programa + t.datos);
  fs.rmSync(path.join(process.env.JARVIS_DATOS, 'peso-de-prueba.bin'), { force: true });
});

(async () => {
  let fallas = 0;
  for (const [nombre, fn] of pruebas) {
    try { await fn(); console.log(`  ok  ${nombre}`); } catch (e) { fallas++; console.log(`FALLA ${nombre}\n      ${e.message}`); }
  }
  console.log(fallas ? `\n${fallas} prueba(s) con fallas` : `\n${pruebas.length} pruebas bien`);
  process.exit(fallas ? 1 : 0);
})();
