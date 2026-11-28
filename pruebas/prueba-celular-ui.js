// Prueba de punta a punta de Jarvis en el celular: Jarvis real (Electron) + la app en un Chromium con tamaño de celular.
// Ajustes → Celular genera el código, el "celular" se vincula, le escribe, corre una rutina, cambia de modo, y después
// se lo desvincula desde la PC. Deja capturas en la carpeta que se pase (por defecto /tmp/capturas-celular).
// Uso: NODE_PATH=<carpeta con playwright> node pruebas/prueba-celular-ui.js [carpeta]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const SALIDA = process.argv[2] || '/tmp/capturas-celular';
fs.mkdirSync(SALIDA, { recursive: true });
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-celui-'));
const PUERTO = 47830;
const CLIPS = path.join(DATOS, 'Videos');
fs.mkdirSync(path.join(CLIPS, 'Valheim'), { recursive: true });
// Un clip de verdad (2 s) para que haya miniatura y se pueda reproducir.
require('child_process').execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(CLIPS, 'Valheim', 'Jefe final.mp4')]);
// Un clip en HEVC, como los de la app de NVIDIA: el visor de Jarvis no lo lee y tiene que armar la vista previa.
fs.mkdirSync(path.join(CLIPS, '7 Days to Die'), { recursive: true });
require('child_process').execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '4', '-c:v', 'libx265', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(CLIPS, '7 Days to Die', '7 Days to Die 2025.05.17 - 19.45.26.04.DVR.mp4')]);
// yt-dlp de mentira: escribe en la carpeta pedida un video (o un mp3 con -x) y avisa como el de verdad.
const YTDLP = path.join(DATOS, 'yt-dlp-falso.js');
fs.writeFileSync(YTDLP, `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('2026.11.01'); process.exit(0); }
const fs = require('fs'); const path = require('path');
const plantilla = a[a.indexOf('-o') + 1];
const audio = a.includes('-x');
const destino = plantilla.replace('%(title).150B', audio ? 'Tema de prueba' : 'Video de prueba').replace('%(id)s', 'abc123').replace('%(ext)s', audio ? 'mp3' : 'mp4');
fs.mkdirSync(path.dirname(destino), { recursive: true });
let i = 0;
const t = setInterval(() => {
  i += 25; console.log('[download]  ' + i + '.0% of 1.00MiB');
  if (i >= 100) { clearInterval(t); fs.copyFileSync(${JSON.stringify(path.join(CLIPS, 'Valheim', 'Jefe final.mp4'))}, destino); console.log('JARVIS-ARCHIVO:' + destino); process.exit(0); }
}, 150);
`);
fs.chmodSync(YTDLP, 0o755);
// jarvis-red de mentira (Tailscale integrado): pide iniciar sesión y al segundo queda conectado.
const RED = path.join(DATOS, 'jarvis-red-falso.js');
fs.writeFileSync(RED, `#!/usr/bin/env node
console.log(JSON.stringify({ estado: 'NeedsLogin', url: 'https://login.tailscale.com/a/prueba' }));
setTimeout(() => console.log(JSON.stringify({ estado: 'Running', ip: '100.101.102.103', nombre: 'jarvis-pc.tail1234.ts.net', funnel: 'falta', funnelUrl: 'https://login.tailscale.com/f/funnel?node=prueba' })), 1000);
setTimeout(() => console.log(JSON.stringify({ estado: 'Running', ip: '100.101.102.103', nombre: 'jarvis-pc.tail1234.ts.net', funnel: 'listo', publica: 'https://jarvis-pc.tail1234.ts.net' })), 2500);
process.stdin.on('end', () => process.exit(0)); process.stdin.resume();
`);
fs.chmodSync(RED, 0o755);
const COMPARTIDA = path.join(DATOS, 'Compartida');
fs.mkdirSync(path.join(COMPARTIDA, 'Fotos'), { recursive: true });
fs.writeFileSync(path.join(COMPARTIDA, 'presupuesto.pdf'), Buffer.alloc(3000, 5));
require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=640x360', '-frames:v', '1', path.join(COMPARTIDA, 'captura.png')]);
require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x240:d=2', '-pix_fmt', 'yuv420p', path.join(COMPARTIDA, 'jugada.mp4')]);
const REMOTO_LOG = path.join(DATOS, 'remoto.log');
fs.writeFileSync(path.join(DATOS, 'config.json'), JSON.stringify({
  nombre: 'Jarvis', usuario: 'Sofía', celular: { activo: true, puerto: PUERTO, https: 443, hablarEnPC: false, escritorio: true, carpetas: [{ id: 'comp', nombre: 'Compartida', ruta: COMPARTIDA }] },
  clips: { carpeta: CLIPS },
  contactos: [{ nombre: 'Tomi', numero: '5491100000000' }, { nombre: 'Mamá', numero: '5491100000001' }],
}));
// Tailscale de mentira: conectado y con Jarvis ya publicado.
const ts = path.join(DATOS, 'ts.js');
fs.writeFileSync(ts, `#!/usr/bin/env node
const a = process.argv.slice(2).join(' ');
if (a === 'status --json') console.log(JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'pc-casa.tail1234.ts.net.', TailscaleIPs: ['100.101.102.103'] } }));
else if (a === 'serve status --json') console.log(JSON.stringify({ Web: { 'pc-casa.tail1234.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:${PUERTO}' } } } } }));
`);
fs.chmodSync(ts, 0o755);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 20000, que = '') {
  const fin = Date.now() + ms;
  for (;;) { try { const r = await fn(); if (r) return r; } catch {} if (Date.now() > fin) throw new Error(`No pasó a tiempo: ${que}`); await esperar(250); }
}

(async () => {
  const raiz = path.join(__dirname, '..');
  const electron = spawn('xvfb-run', ['-a', path.join(raiz, 'node_modules', '.bin', 'electron'), '.', '--no-sandbox', '--remote-debugging-port=9333'], {
    cwd: raiz, env: { ...process.env, JARVIS_DATOS: DATOS, JARVIS_TAILSCALE: ts, JARVIS_YTDLP: YTDLP, JARVIS_YTDLP_ULTIMA: '2026.11.20', JARVIS_MEDIOS_FALSOS: '1', JARVIS_RED: RED, JARVIS_FFMPEG: '/usr/local/bin/ffmpeg', JARVIS_REMOTO_LOG: REMOTO_LOG }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  electron.stdout.on('data', (d) => { log += d; });
  electron.stderr.on('data', (d) => { log += d; });
  const errores = [];
  let pc; let navegador;
  try {
    pc = await hasta(() => chromium.connectOverCDP('http://127.0.0.1:9333'), 40000, 'Electron con depuración');
    const ctxPC = pc.contexts()[0];
    const notch = await hasta(() => ctxPC.pages().find((p) => p.url().includes('notch.html')), 20000, 'notch');
    await hasta(() => fetch(`http://127.0.0.1:${PUERTO}/api/hola`).then((r) => r.ok), 20000, 'servidor del celular');
    // Caras: los mismos ojos cambian de tamaño según lo que dice (cada una distinta de la neutra), y al escuchar se inclinan.
    const medir = () => notch.evaluate(() => [...document.querySelectorAll('#notch .ojo')].map((o) => { const r = o.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }).join(' '));
    const neutra = await medir();
    for (const cara of ['feliz', 'triste', 'sorprendido', 'esceptico', 'concentrado', 'guino', 'asombro']) {
      await notch.evaluate((c) => { document.getElementById('notch').dataset.cara = c; }, cara);
      await new Promise((r) => setTimeout(r, 400));
      if (cara !== 'feliz' && cara !== 'triste') assert.notStrictEqual(await medir(), neutra, `cara ${cara}`);
      await notch.screenshot({ path: path.join(SALIDA, `0-cara-${cara}.png`) });
    }
    await notch.evaluate(() => { delete document.getElementById('notch').dataset.cara; });
    await notch.evaluate(() => { document.getElementById('notch').dataset.fase = 'escuchando'; });
    await new Promise((r) => setTimeout(r, 450));
    const [izq, der] = (await medir()).split(' ').map((x) => Number(x.split('x')[1]));
    assert.ok(der > izq + 3, `escuchando: un ojo más abierto (${izq} / ${der})`);
    await notch.screenshot({ path: path.join(SALIDA, '0-escuchando.png') });
    await notch.evaluate(() => { document.getElementById('notch').dataset.fase = 'reposo'; });
    await notch.evaluate(() => window.jarvis.pedir('ajustes:abrir', 'celular'));
    const ajustes = await hasta(() => ctxPC.pages().find((p) => p.url().includes('ajustes.html')), 15000, 'Ajustes');
    ajustes.on('console', (m) => { if (m.type() === 'error') errores.push(`ajustes: ${m.text()}`); });
    ajustes.on('pageerror', (e) => errores.push(`ajustes: ${e.message}`));
    await ajustes.setViewportSize({ width: 1100, height: 900 }).catch(() => {});
    await hasta(() => ajustes.locator('text=Listo para usar desde el celular').count(), 15000, 'estado de Tailscale en Ajustes').catch(async (e) => {
      await ajustes.screenshot({ path: path.join(SALIDA, '0-ajustes-falla.png') }).catch(() => {});
      throw new Error(`${e.message} — ${(await ajustes.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => ''))}`);
    });
    await ajustes.screenshot({ path: path.join(SALIDA, '1-ajustes-celular.png') });
    await ajustes.getByRole('button', { name: 'Vincular un celular' }).click();
    const codigo = (await hasta(() => ajustes.locator('.cel-numero').textContent(), 10000, 'código')).replace(/\D/g, '');
    assert.match(codigo, /^\d{6}$/);
    assert.ok(await ajustes.locator('img.cel-qr').count(), 'muestra el QR');
    await ajustes.screenshot({ path: path.join(SALIDA, '2-ajustes-codigo.png') });

    // ----- El "celular" -----
    navegador = await chromium.launch();
    const cel = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-AR',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; moto g84 5G Build/U1TC34) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' });
    const p = await cel.newPage();
    await p.emulateMedia({ reducedMotion: "reduce" }); // sin el "temblor" de editar: Playwright espera que los botones estén quietos
    p.on('console', (m) => { if (m.type() === 'error') errores.push(`celular: ${m.text()}`); });
    p.on('pageerror', (e) => errores.push(`celular: ${e.message}`));
    p.on('response', async (r) => { if (r.url().endsWith('/api/pc') && r.status() >= 400) errores.push(`celular /api/pc ${r.status()}: ${r.request().postData()} → ${await r.text().catch(() => '')}`); });
    await p.goto(`http://127.0.0.1:${PUERTO}/#v=${codigo}`);
    await hasta(() => p.locator('#vincular:not([hidden])').count(), 5000, 'pantalla de vincular');
    assert.strictEqual((await p.inputValue('#codigo')).replace(/\D/g, ''), codigo, 'el QR trae el código');
    assert.strictEqual(await p.inputValue('#nombre-cel'), 'moto g84 5G', 'propone el nombre del celular');
    await p.screenshot({ path: path.join(SALIDA, '3-celular-vincular.png') });
    await p.getByRole('button', { name: 'Vincular' }).click();
    await hasta(() => p.locator('#app:not([hidden])').count(), 8000, 'app después de vincular');
    await hasta(async () => (await p.textContent('#estado-pc')).startsWith('Modo'), 8000, 'estado de la PC');
    // Arranca en Inicio, con los widgets de siempre.
    await hasta(() => p.locator('#s-inicio:not([hidden]) .widget').count(), 5000, 'Inicio con widgets');
    assert.ok(await p.locator('.w-reloj').count(), 'reloj');
    await hasta(() => p.locator('.w-clima, .w-clima-error, .w-info').count(), 8000, 'clima');
    await p.screenshot({ path: path.join(SALIDA, '4-celular-inicio.png'), fullPage: true });
    await p.click('#abajo button[data-hoja="charla"]');
    // Ajustes se enteró solo: el aparato aparece en la lista y el código ya no está.
    await hasta(() => ajustes.locator('.cel-disp input').count(), 8000, 'aparato en la lista de Ajustes');
    assert.strictEqual(await ajustes.locator('.cel-numero').count(), 0);

    // Escribirle: una regla directa (sin modelos) que cambia el modo.
    await p.fill('#texto', 'modo silencio');
    await p.click('#enviar');
    await hasta(() => p.locator('#mensajes li.jarvis:not(.pensando)').count(), 15000, 'respuesta de Jarvis');
    assert.strictEqual(await p.locator('#mensajes li.jarvis:not(.pensando)').last().textContent(), 'Modo silencio.');
    await hasta(async () => /silencio/.test(await p.textContent('#estado-pc')), 10000, 'modo en el encabezado');
    await p.fill('#texto', '¿qué hora es?');
    await p.click('#enviar');
    await hasta(() => p.locator('#mensajes li.jarvis:not(.pensando)').nth(1).count(), 15000, 'segunda respuesta');
    await p.screenshot({ path: path.join(SALIDA, '5-celular-charla.png') });
    const enPC = await notch.evaluate(() => window.jarvis.pedir('cfg:leer'));
    assert.strictEqual(enPC.dato.modo, 'silencio', 'el modo cambió en la PC');

    // Inicio: estado de la PC, atajos (con las rutinas) y "Para hoy".
    await p.click('#abajo button[data-hoja="inicio"]');
    await hasta(() => p.locator('.w-atajos button').count(), 5000, 'atajos');
    assert.ok(await p.locator('.wt-hoy').count(), 'para hoy');
    // El modo se cambia desde la pestaña PC.
    await p.click('#abajo button[data-hoja="pc"]');
    await hasta(() => p.locator('.mosaico').count(), 5000, 'pestaña PC');
    await p.screenshot({ path: path.join(SALIDA, '4b-celular-pc.png'), fullPage: true });
    await p.click('.pc-cabeza button:has-text("Modo")');
    await p.click('#catalogo button:has-text("Normal")');
    await hasta(async () => /normal/i.test(await p.textContent('#estado-pc')), 8000, 'modo normal');
    await p.click('#abajo button[data-hoja="inicio"]');
    // Editar Inicio: sumar un atajo de voz, achicar y quitar un widget; queda guardado.
    const antes = await p.locator('#widgets .widget').count();
    await p.click('#editar-inicio');
    await p.click('#sumar-widget');
    p.once('dialog', (d) => d.accept('qué hora es'));
    await p.click('#catalogo button:has-text("Atajo de voz")').catch(() => {});
    await esperar(300);
    // (la segunda pregunta, el nombre del botón)
    await hasta(() => p.locator('#widgets .widget').count().then((n) => n === antes + 1), 5000, 'atajo sumado');
    await p.locator('#widgets .widget').last().locator('button[aria-label^="Sacar"]').click();
    assert.strictEqual(await p.locator('#widgets .widget').count(), antes, 'uno más y uno menos');
    // Deshacer lo saca de vuelta, y la cruz otra vez.
    await p.click('#aviso button:has-text("Deshacer")');
    assert.strictEqual(await p.locator('#widgets .widget').count(), antes + 1, 'deshacer');
    await p.locator('#widgets .widget').last().locator('button[aria-label^="Sacar"]').click();
    await p.screenshot({ path: path.join(SALIDA, '6a-celular-inicio-editando.png'), fullPage: true });
    // Tocar un widget (editando): tamaño y color.
    await p.locator('#widgets .wt-reloj').click();
    await hasta(() => p.locator('#hoja-widgets[open] .wa-tam').count(), 3000, 'ajustes del widget');
    await p.screenshot({ path: path.join(SALIDA, '6c-celular-widget-ajustes.png') });
    await p.click('#hoja-widgets .wa-tam:has-text("Grande")');
    assert.ok(await p.locator('#widgets .wt-reloj.tam-2.alto-2').count(), 'reloj grande');
    await p.click('#hoja-widgets .wa-tam:has-text("Chico")');
    await p.click('#hw-cerrar');
    // Agrandar desde la esquina: el reloj (chico) pasa a ancho.
    const asa = await p.locator('#widgets .wt-reloj .w-asa').boundingBox();
    const grilla = await p.locator('#widgets').boundingBox();
    await p.mouse.move(asa.x + asa.width / 2, asa.y + asa.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(asa.x + ((grilla.x + grilla.width - 10) - asa.x) * (i / 8), asa.y + asa.height / 2);
    await p.mouse.up();
    await hasta(() => p.locator('#widgets .wt-reloj.tam-2').count(), 3000, 'reloj ancho por la esquina');
    // Arrastrar: el reloj va al final.
    const orden = async () => JSON.parse(await p.evaluate(() => localStorage.getItem('jarvis.inicio'))).map((w) => w.tipo);
    const r1 = await p.locator('#widgets .wt-reloj').boundingBox();
    const ult = await p.locator('#widgets .widget').last().boundingBox();
    const c0 = { x: r1.x + r1.width / 2, y: r1.y + r1.height / 2 };
    await p.mouse.move(c0.x, c0.y);
    await p.mouse.down();
    await esperar(350);
    // Hasta abajo de la pantalla: desplaza sola mientras se mantiene ahí.
    for (let i = 1; i <= 10; i++) await p.mouse.move(c0.x, c0.y + (800 - c0.y) * (i / 10));
    await esperar(2500);
    const ult2 = await p.locator('#widgets .widget:not(.agarrado)').last().boundingBox();
    for (let i = 1; i <= 10; i++) await p.mouse.move(c0.x + (ult2.x + ult2.width - 20 - c0.x) * (i / 10), 800 + (ult2.y + ult2.height - 10 - 800) * (i / 10));
    void ult;
    await p.screenshot({ path: path.join(SALIDA, '6d-celular-arrastrando.png') });
    await p.mouse.up();
    await hasta(async () => (await orden()).slice(-1)[0] === 'reloj', 3000, `reloj al final (${(await orden()).join(',')})`);
    await p.click('#editar-inicio');
    assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('jarvis.inicio'))).length, antes);
    // Mantener apretado fuera de edición entra a editar.
    const cl = await p.locator('#widgets .wt-clima').boundingBox();
    await p.mouse.move(cl.x + 20, cl.y + 20); await p.mouse.down(); await esperar(600); await p.mouse.up();
    assert.ok(await p.locator('#widgets.editando').count(), 'mantener apretado → editar');
    await p.click('#editar-inicio');
    // Hablale a Jarvis desde el widget (escrito).
    await p.fill('.wt-hablar input', '¿qué hora es?');
    await p.press('.wt-hablar input', 'Enter');
    await hasta(async () => /\d/.test(await p.textContent('#aviso').catch(() => '')), 15000, 'respuesta en el widget');
    await p.screenshot({ path: path.join(SALIDA, '6-celular-inicio-editado.png'), fullPage: true });

    // Descargar desde la Charla: pegar un link ofrece cómo bajarlo (al celular, solo audio o en la PC).
    await p.click('#abajo button[data-hoja="mas"]');
    await p.screenshot({ path: path.join(SALIDA, '6b-celular-mas.png') });
    await p.click('#abajo button[data-hoja="charla"]');
    await p.fill('#texto', 'Mirá esto https://youtu.be/abc123 jaja');
    await p.click('#enviar');
    await hasta(() => p.locator('#mensajes .oferta button').count(), 5000, 'oferta de descarga');
    await p.screenshot({ path: path.join(SALIDA, '7a-celular-descargar.png') });
    await p.click('#mensajes .oferta button:has-text("Video al celular")');
    await hasta(async () => /está en el celular/.test(await p.textContent('#aviso')), 20000, 'el video llegó al celular');
    await p.fill('#texto', 'https://youtu.be/abc123');
    await p.click('#enviar');
    await p.click('#mensajes .oferta button:has-text("En la PC")');
    await p.click('#abajo button[data-hoja="archivos"]');
    await hasta(async () => /quedó en la PC/.test(await p.textContent('#lista-descargas')), 20000, 'video listo en la PC');
    await p.screenshot({ path: path.join(SALIDA, '7c-celular-descargas-listas.png') });
    // La PC borró lo temporal del celular.
    const temporal = path.join(DATOS, 'celular-temporal');
    await hasta(() => !fs.existsSync(temporal) || fs.readdirSync(temporal).length === 0, 5000, 'temporal borrado');


    // Archivos: en la PC (clip, descarga de audio) y en el celular (el video recién bajado).
    await hasta(() => p.locator('#recientes .reciente').count(), 8000, 'recientes');
    await p.screenshot({ path: path.join(SALIDA, '7c2-celular-archivos-raiz.png'), fullPage: true });
    await p.click('#ubicaciones .mas-item:has-text("Jarvis")');
    await hasta(async () => (await p.locator('#lista-archivos li .abrir').count()) >= 2, 8000, 'archivos de la PC');
    const nombresPC = await p.locator('#lista-archivos li .datos b').allTextContents();
    assert.ok(nombresPC.includes('Jefe final') && nombresPC.includes('Video de prueba'), nombresPC.join(', '));
    await hasta(() => p.locator('#lista-archivos .mini img').count(), 8000, 'miniatura del clip');
    await esperar(800);
    await p.screenshot({ path: path.join(SALIDA, '7d-celular-archivos-pc.png') });
    await p.click('#filtros [data-filtro="video"]');
    assert.deepStrictEqual(await p.locator('#lista-archivos li .datos b').allTextContents(), ['Video de prueba']);
    await p.click('#filtros [data-filtro="todo"]');
    // Abrir el clip y pasarlo al celular.
    await p.locator('#lista-archivos li .abrir', { hasText: 'Jefe final' }).click();
    await hasta(() => p.locator('#hoja-archivo[open] video').count(), 5000, 'hoja del archivo');
    await hasta(() => p.evaluate(() => document.querySelector('#ha-medio video').readyState >= 1), 8000, 'el video carga');
    await p.screenshot({ path: path.join(SALIDA, '7e-celular-hoja-pc.png') });
    await p.click('#ha-principales .acc:has-text("Al celular")');
    await hasta(async () => /quedó en este celular/.test(await p.textContent('#aviso')), 15000, 'clip pasado al celular');
    await p.keyboard.press('Escape');
    await p.click('#arch-volver');
    await p.click('#ubicaciones .mas-item:has-text("Este celular")');
    const enCel = await p.locator('#lista-archivos li .datos b').allTextContents();
    assert.deepStrictEqual(enCel, ['Jefe final', 'Video de prueba']);
    assert.strictEqual(await p.locator('#lista-archivos .mini img').count(), 2, 'miniaturas hechas en el celular');
    await p.screenshot({ path: path.join(SALIDA, '7f-celular-archivos-celular.png') });
    // Se reproduce desde el celular aunque la PC no conteste.
    await p.locator('#lista-archivos li .abrir', { hasText: 'Video de prueba' }).click();
    await hasta(() => p.evaluate(() => { const v = document.querySelector('#ha-medio video'); return v && v.readyState >= 1 && v.src.startsWith('blob:'); }), 8000, 'video local');
    await p.screenshot({ path: path.join(SALIDA, '7g-celular-hoja-local.png') });
    // Pasarlo a la PC.
    await p.click('#ha-principales .acc:has-text("A la PC")');
    await hasta(async () => /quedó en la PC/.test(await p.textContent('#aviso')), 15000, 'pasado a la PC');
    assert.ok(fs.existsSync(path.join(CLIPS, 'Descargas', 'Del celular', 'Video de prueba [abc123].mp4')), 'quedó en Descargas\\Del celular');
    // Mandarlo por WhatsApp sin WhatsApp conectado: tiene que explicar el problema (y no dejar nada temporal).
    await p.click('#ha-principales .acc:has-text("WhatsApp")');
    await p.fill('#ha-para', 'Tomi');
    await p.click('#ha-mandar');
    await hasta(async () => /WhatsApp/.test(await p.textContent('#aviso')), 15000, 'aviso de WhatsApp al mandar');
    assert.deepStrictEqual(fs.readdirSync(path.join(DATOS, 'celular-subidas')), []);
    // Borrar del celular.
    p.once('dialog', (d) => d.accept());
    await p.getByRole('button', { name: 'Borrar del celular' }).click();
    await hasta(async () => (await p.locator('#lista-archivos li .datos b').allTextContents()).length === 1, 5000, 'borrado del celular');
    // "Compartir" desde otra app: la Charla ofrece bajar el link.
    const p3 = await cel.newPage();
    await p3.goto(`http://127.0.0.1:${PUERTO}/?titulo=Un%20video&texto=${encodeURIComponent('Mirá https://youtube.com/watch?v=zzz')}`);
    await hasta(() => p3.locator('#s-charla:not([hidden]) .oferta').count(), 8000, 'ofrece bajarlo en la Charla');
    assert.strictEqual(new URL(p3.url()).search, '', 'limpia la dirección');
    await p3.close();
    // WhatsApp desde el "+" de la Charla.
    await p.click('#abajo button[data-hoja="charla"]');
    await p.click('#adjuntar');
    await p.click('#catalogo button:has-text("WhatsApp")');
    await p.fill('#ed-cuerpo input[aria-label="Para"]', 'Tomi');
    await p.fill('#ed-cuerpo textarea[aria-label="Mensaje"]', 'Ya salgo');
    await p.screenshot({ path: path.join(SALIDA, '8-celular-mensaje.png') });
    await p.click('#ed-botones button:has-text("Mandar")');
    await hasta(() => p.locator('#aviso.mal:not([hidden])').count(), 10000, 'aviso de WhatsApp desconectado');
    const avisoWa = await p.textContent('#aviso');
    assert.match(avisoWa, /WhatsApp/);

    // ----- Cámara de seguridad: apagada en la PC → lo dice; prendida → video en vivo -----
    await p.click('#abajo button[data-hoja="pc"]');
    await p.click('.mosaico:has-text("Cámara")');
    let txtCam = '';
    await hasta(async () => /apagada/i.test(txtCam = await p.textContent('#cam-estado')), 10000, 'cámara apagada').catch((e) => { throw new Error(e.message + ': ' + txtCam); });
    await p.click('#cam-cerrar');
    const cfgCam = (await notch.evaluate(() => window.jarvis.pedir('cfg:leer'))).dato;
    cfgCam.celular.camara = true;
    await notch.evaluate((c) => window.jarvis.pedir('cfg:guardar', c), cfgCam);
    await p.click('.mosaico:has-text("Cámara")');
    await hasta(() => p.locator('#cam-estado.vivo').count(), 25000, `cámara en vivo (${await p.textContent('#cam-estado')})`);
    await hasta(() => p.evaluate(() => { const v = document.querySelector('#cam-video-el'); return v.buffered.length && v.buffered.end(0) > 1 && v.videoWidth > 0; }), 15000, 'llegan cuadros de video');
    await p.screenshot({ path: path.join(SALIDA, '8c-celular-camara.png') });
    // En la PC, los ojos del notch se ponen rojos y queda el cartel mientras alguien mira la cámara.
    await hasta(() => notch.evaluate(() => { const n = document.getElementById('notch'); return n.hasAttribute('data-vigilado') && /Cámara activa/.test(document.getElementById('acceso-texto').textContent); }), 5000, 'notch: cámara activa');
    await notch.screenshot({ path: path.join(SALIDA, '8d-pc-notch-camara.png') });
    const histCam = (await notch.evaluate(() => window.jarvis.pedir('historial:leer'))).dato;
    assert.ok(histCam.some((x) => /mirando la cámara de seguridad/.test(`${x.dicho} ${x.respuesta}`)), 'queda en el Historial de la PC');
    await p.click('#cam-cerrar');

    // ----- Más: notas, calendario, rutinas e historial, igual que en Ajustes de la PC -----
    const pcPide = async (canal, ...a) => (await notch.evaluate(([c, x]) => window.jarvis.pedir(c, ...x), [canal, a])).dato;
    await p.click('#abajo button[data-hoja="mas"]');
    await p.click('.mas-item:has-text("Agenda")');
    await p.click('#ag-vistas [data-vista="notas"]');
    await p.fill('#n-texto', 'Llamar al plomero');
    const enUnaHora = new Date(Date.now() + 3600000); const d2 = (x) => String(x).padStart(2, '0');
    await p.fill('#n-cuando', `${enUnaHora.getFullYear()}-${d2(enUnaHora.getMonth() + 1)}-${d2(enUnaHora.getDate())}T${d2(enUnaHora.getHours())}:${d2(enUnaHora.getMinutes())}`);
    await p.click('#form-nota button[type="submit"]');
    await hasta(() => p.locator('#lista-notas li .datos b', { hasText: 'Llamar al plomero' }).count(), 8000, 'nota en la lista');
    assert.ok((await pcPide('notas:leer')).some((n) => n.texto === 'Llamar al plomero' && n.cuando), 'la nota con aviso quedó en la PC');
    await p.locator('#lista-notas li .abrir', { hasText: 'Llamar al plomero' }).click();
    await hasta(() => p.locator('#hoja-ed[open]').count(), 3000, 'editor de nota');
    await p.fill('#ed-cuerpo textarea', 'Llamar al plomero mañana');
    await p.screenshot({ path: path.join(SALIDA, '9a-celular-nota-editar.png') });
    await p.click('#ed-botones button:has-text("Guardar")');
    await hasta(async () => (await pcPide('notas:leer')).some((n) => n.texto === 'Llamar al plomero mañana'), 8000, 'nota cambiada en la PC');
    await p.screenshot({ path: path.join(SALIDA, '9b-celular-notas.png'), fullPage: true });

    await p.click('#ag-vistas [data-vista="proximo"]');
    await p.click('#ag-nuevo');
    await p.click('#catalogo button:has-text("Evento")');
    await p.fill('#ed-cuerpo input[aria-label="Nombre"]', 'Turno dentista');
    await p.selectOption('#ed-cuerpo select', '30');
    await p.screenshot({ path: path.join(SALIDA, '9c-celular-evento-nuevo.png') });
    await p.click('#ed-botones button:has-text("Guardar")');
    await hasta(() => p.locator('#agenda-cel .datos b', { hasText: 'Turno dentista' }).count(), 10000, 'evento en el calendario del celular');
    const evs = (await pcPide('calendario:rango', { desde: Date.now() - 86400000, hasta: Date.now() + 3 * 86400000 })).eventos;
    const ev = evs.find((x) => x.titulo === 'Turno dentista');
    assert.ok(ev && ev.local && ev.avisos && ev.avisos[0].antes === 30, `evento en la PC: ${JSON.stringify(ev)}`);
    assert.ok(await p.locator('#agenda-cel .datos b', { hasText: 'Llamar al plomero mañana' }).count(), 'el recordatorio también se ve en el calendario');
    await p.screenshot({ path: path.join(SALIDA, '9d-celular-calendario.png'), fullPage: true });
    await p.locator('#agenda-cel .abrir', { hasText: 'Turno dentista' }).click();
    p.once('dialog', (d) => d.accept());
    await p.click('#ed-botones button:has-text("Borrar")');
    await hasta(async () => !(await pcPide('calendario:rango', { desde: Date.now() - 86400000, hasta: Date.now() + 3 * 86400000 })).eventos.some((x) => x.titulo === 'Turno dentista'), 8000, 'evento borrado');

    await p.click('#abajo button[data-hoja="mas"]');
    await p.click('.mas-item:has-text("Rutinas")');
    await hasta(() => p.locator('#lista-rutinas li .abrir').count(), 8000, 'rutinas en el celular');
    const cuantasAntes = (await pcPide('rutinas:leer')).length;
    await p.click('#r-nueva');
    await hasta(() => p.locator('#hoja-ed[open]').count(), 5000, 'editor de rutina');
    await p.fill('#ed-cuerpo input[aria-label="Nombre"]', 'Llegué a casa');
    await p.click('#ed-cuerpo button:has-text("Agregar paso")');
    await p.selectOption('.paso-r select[aria-label^="Qué hace"]', 'decir');
    await p.fill('.paso-r input[aria-label="Modo juego activado."]', 'Bienvenida a casa');
    await p.click('#ed-cuerpo button:has-text("Agregar paso")');
    await p.locator('.paso-r').nth(1).locator('select[aria-label^="Qué hace"]').selectOption('esperar');
    await p.locator('.paso-r').nth(1).locator('input').fill('1');
    await p.screenshot({ path: path.join(SALIDA, '9e-celular-rutina-editar.png'), fullPage: true });
    await p.click('#ed-botones button:has-text("Guardar")');
    await hasta(async () => (await pcPide('rutinas:leer')).length === cuantasAntes + 1, 8000, 'rutina nueva en la PC');
    const nuevaR = (await pcPide('rutinas:leer')).find((r) => r.nombre === 'Llegué a casa');
    assert.deepStrictEqual(nuevaR.pasos, [{ tipo: 'decir', texto: 'Bienvenida a casa' }, { tipo: 'esperar', segundos: 1 }]);
    await p.screenshot({ path: path.join(SALIDA, '9f-celular-rutinas.png'), fullPage: true });
    // Un canal que no está permitido para el celular se rechaza.
    const prohibido = await p.evaluate(async () => { const r = await fetch('/api/pc', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('jarvis.token')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ canal: 'cfg:leer', args: [] }) }); return r.status; });
    assert.strictEqual(prohibido, 403, 'cfg:leer no se puede desde el celular');

    await p.click('#abajo button[data-hoja="mas"]');
    await p.click('.mas-item:has-text("Historial")');
    await hasta(() => p.locator('#lista-historial > li').count(), 8000, 'historial en el celular');
    await p.click('#h-filtros [data-filtro="celular"]');
    assert.ok(await p.locator('#lista-historial > li .datos b', { hasText: 'modo silencio' }).count(), 'muestra lo hecho desde el celular');
    await p.screenshot({ path: path.join(SALIDA, '9g-celular-historial.png'), fullPage: true });

    // Historial de la PC: quedó "desde el celular".
    const hist = await notch.evaluate(() => window.jarvis.pedir('historial:leer'));
    assert.ok(hist.dato.some((x) => x.origen === 'celular' && x.dicho === 'modo silencio'), 'historial con origen celular');

    // ----- La app de Android: la misma app con un Capacitor de mentira. Busca la PC en la Wi-Fi (modo casa) y se vincula -----
    // La red de casa se simula: lo que va a 192.168.77.x:47821 lo atiende el modo casa de Jarvis (que escucha en 0.0.0.0:47821),
    // con el Host de la red; solo 192.168.77.10 contesta. La app se sirve como en el celular (desde "localhost").
    await hasta(async () => (await ajustes.locator('text=Esperando a la app en tu Wi-Fi').count()) > 0, 10000, 'modo casa en Ajustes');
    await ajustes.screenshot({ path: path.join(SALIDA, '12-ajustes-modo-casa.png') });
    require('child_process').execFileSync(process.execPath, [path.join(raiz, 'android-app', 'preparar.js')]);
    const WWW = path.join(raiz, 'android-app', 'www');
    const IP_PC = '192.168.77.10';
    const reenviar = (q, u) => new Promise((ok, mal) => {
      const cuerpo = q.postDataBuffer();
      const r = require('http').request({ hostname: '127.0.0.1', port: 47821, path: u.pathname + u.search, method: q.method(), headers: { ...q.headers(), host: `${IP_PC}:47821` } }, (res) => {
        const partes = []; res.on('data', (c) => partes.push(c)); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(partes) }));
      });
      r.on('error', mal); r.end(cuerpo || undefined);
    });
    const ctxA = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-AR',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36' });
    await ctxA.route('http://localhost/**', (r) => { const f = path.join(WWW, decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/$/, '/index.html')); return fs.existsSync(f) ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: '' }); });
    await ctxA.route('http://localhost/pc/api/**', async (r) => { const u = new URL(r.request().url()); return r.fulfill(await reenviar(r.request(), new URL(`http://${IP_PC}:47821${u.pathname.slice(3)}${u.search}`))); }); // lo que hace JarvisWebViewClient (va después: la última ruta manda)
    let enCasa = true;
    await ctxA.route(/^http:\/\/192\.168\.77\.\d+:47821\//, async (r) => { const u = new URL(r.request().url()); if (u.hostname !== IP_PC || !enCasa) return r.abort('connectionrefused'); return r.fulfill(await reenviar(r.request(), u)); });
    await ctxA.route('https://api.github.com/**', (r) => r.fulfill({ json: { tag_name: 'v9.9.9', assets: [{ name: 'Jarvis-9.9.9.apk', browser_download_url: 'https://github.com/jsolaresc/jarvis/releases/download/v9.9.9/Jarvis-9.9.9.apk' }] } }));
    // CapacitorHttp (los pedidos que hace Android, no el WebView): los hace Node.
    await ctxA.exposeBinding('httpNativo', async (_x, o) => new Promise((ok) => {
      const u = new URL(o.url); const datos = o.data ? JSON.stringify(o.data) : '';
      const q = require('http').request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: o.method || 'GET', headers: { ...(o.headers || {}), ...(datos ? { 'Content-Length': Buffer.byteLength(datos) } : {}) } }, (r) => {
        let t = ''; r.on('data', (c) => { t += c; }); r.on('end', () => { let data = t; try { data = JSON.parse(t); } catch {} ok({ status: r.statusCode, headers: r.headers, data }); });
      });
      q.on('error', () => ok({ status: 0, headers: {}, data: {} })); q.end(datos || undefined);
    }));
    await ctxA.addInitScript(() => {
      const oyentes = {};
      window.androidFalso = { archivos: [], abiertos: {}, abierto: '', avisos: null, pc: null, salio: 0 };
      const A = window.androidFalso;
      const plugin = {
        red: async () => ({ ip: '192.168.77.5', prefijo: 24 }),
        info: async () => ({ version: '1.0.0' }),
        abrir: async (o) => { A.abierto = o.url; },
        compartidoPendiente: async () => ({ texto: '' }),
        addListener: (n, f) => { oyentes[n] = f; return Object.assign(Promise.resolve({ remove() {} }), { remove() {} }); },
        archivoAbrir: async (o) => { const id = String(Math.random()); A.abiertos[id] = { ...o, bytes: 0 }; return { id }; },
        archivoEscribir: async ({ id, datos }) => { A.abiertos[id].bytes += atob(datos).length; },
        archivoCerrar: async ({ id }) => { A.archivos.push(A.abiertos[id]); return { donde: 'Descargas/Jarvis' }; },
        archivoCancelar: async () => {},
        configurarPC: async (o) => { A.pc = o; },
        actualizar: async (o) => { A.actualizado = o.url; (oyentes.actualizacion || (() => {}))({ pct: 50 }); return { permiso: true }; },
        programarAvisos: async (o) => { A.avisos = o.avisos; return { programados: o.avisos.length }; },
        pedirPermisoAvisos: async () => {},
        salir: async () => { A.salio++; },
        despertar: async (o) => { A.despertado = o; },
        huella: async () => { A.huellas = (A.huellas || 0) + 1; return { ok: true }; },
        avisosAlInstante: async (o) => { A.alInstante = o; },
        atajoPendiente: async () => ({}),
        subirArchivo: async () => {},
      };
      window.atrasFalso = () => oyentes.atras && oyentes.atras();
      Object.assign(plugin, {
        afueraIniciar: async () => { A.tsIniciado = true; },
        afueraEstado: async () => ({ estado: 'Running', ip: '100.64.0.9' }),
        afueraProxy: async ({ destino }) => { A.tsDestino = destino; return { puerto: window.PUERTO_PROXY_TS }; },
        afueraSalir: async () => {},
      });
      window.compartirDesdeOtraApp = (t) => oyentes.compartido && oyentes.compartido({ texto: t });
      window.Capacitor = { isNativePlatform: () => true, registerPlugin: () => plugin, Plugins: { CapacitorHttp: { request: async (o) => { const r = await window.httpNativo(o); if (!r.status) throw new Error('sin conexión'); return r; } } } };
    });
    const pA = await ctxA.newPage();
    pA.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|ERR_FAILED|status of 404/.test(m.text())) errores.push(`android: ${m.text()}`); });
    pA.on('pageerror', (e) => errores.push(`android: ${e.message}`));
    await pA.goto('http://localhost/index.html');
    await hasta(() => pA.locator('#vincular:not([hidden])').count(), 5000, 'android: pantalla de vincular');
    await hasta(() => pA.locator(`#lista-pcs button:has-text("${IP_PC}")`).count(), 20000, 'android: encuentra la PC en la Wi-Fi');
    assert.strictEqual(await pA.locator('#lista-pcs button').count(), 1, 'una sola PC');
    assert.strictEqual(await pA.getAttribute('#lista-pcs button', 'aria-checked'), 'true', 'la elige sola');
    // Aviso de versión nueva de la app.
    await hasta(() => pA.locator('#aviso:has-text("versión nueva")').count(), 8000, 'android: aviso de versión nueva');
    // "Actualizar": la baja la app y abre el instalador de Android (sin pasar por el navegador).
    await pA.click('#aviso button:has-text("Actualizar")');
    await hasta(() => pA.locator('#aviso:has-text("Instalar")').count(), 5000, 'android: actualización bajada');
    assert.match(await pA.evaluate(() => window.androidFalso.actualizado), /Jarvis-9\.9\.9\.apk$/);
    await pA.screenshot({ path: path.join(SALIDA, '13-android-vincular.png') });
    await ajustes.getByRole('button', { name: 'Vincular un celular' }).click();
    const codigoA = (await hasta(() => ajustes.locator('.cel-numero').textContent(), 10000, 'código para android')).replace(/\D/g, '');
    await pA.fill('#codigo', codigoA);
    await pA.fill('#nombre-cel', 'App de prueba');
    await pA.getByRole('button', { name: 'Vincular', exact: true }).click();
    await hasta(() => pA.locator('#app:not([hidden])').count(), 8000, 'android: app después de vincular');
    await hasta(async () => (await pA.textContent('#estado-pc')).startsWith('Modo'), 8000, 'android: estado de la PC');
    assert.strictEqual(JSON.parse(await pA.evaluate(() => localStorage.getItem('jarvis.pc'))).base, `http://${IP_PC}:47821`);
    // Avisos: la PC le pasa los recordatorios y el celular los programa.
    await hasta(() => pA.evaluate(() => window.androidFalso.pc && window.androidFalso.pc.base), 8000, 'android: PC configurada para avisos');
    await pA.click('#abajo button[data-hoja="charla"]');
    await pA.fill('#texto', 'recordame comprar pan en 30 minutos');
    await pA.click('#enviar');
    await hasta(() => pA.evaluate(() => (window.androidFalso.avisos || []).some((a) => /comprar pan/i.test(a.texto))), 15000, 'android: recordatorio programado en el celular');
    const avisoPan = (await pA.evaluate(() => window.androidFalso.avisos)).find((a) => /comprar pan/i.test(a.texto));
    assert.ok(Math.abs(avisoPan.cuando - (Date.now() + 30 * 60000)) < 3 * 60000, 'a su hora');
    // Si en la PC se elige "no avisar en el celular", el celular ya no lo programa.
    const cfgPC = (await notch.evaluate(() => window.jarvis.pedir('cfg:leer'))).dato;
    await notch.evaluate((c) => window.jarvis.pedir('cfg:guardar', c), { ...cfgPC, avisos: { ...cfgPC.avisos, recordatorios: { pc: true, celular: false } } });
    const sinAvisos = await pA.evaluate(async () => { const t = localStorage.getItem('jarvis.token'); const pc = JSON.parse(localStorage.getItem('jarvis.pc')); return (await (await fetch(pc.base + '/api/avisos', { headers: { Authorization: `Bearer ${t}` } })).json()).avisos; });
    assert.ok(!sinAvisos.some((a) => /comprar pan/i.test(a.texto)), 'apagado en el celular');
    await notch.evaluate((c) => window.jarvis.pedir('cfg:guardar', c), cfgPC);
    // "Atrás": desde otra hoja vuelve a Inicio; en Inicio, sale.
    await pA.evaluate(() => window.atrasFalso());
    await hasta(() => pA.locator('#s-inicio:not([hidden])').count(), 3000, 'android: atrás vuelve a Inicio');
    await pA.evaluate(() => window.atrasFalso());
    assert.strictEqual(await pA.evaluate(() => window.androidFalso.salio), 1, 'en Inicio, atrás sale');
    // Archivos de la PC, pasar uno al celular y guardarlo en Descargas con Android.
    await pA.click('#abajo button[data-hoja="archivos"]');
    await pA.click('#ubicaciones .mas-item:has-text("Jarvis")');
    await hasta(() => pA.locator('#lista-archivos li:has-text("Jefe final")').count(), 8000, 'android: archivos de la PC');
    // Miniaturas y video pasan por la app (/pc/…): se ven.
    await hasta(() => pA.evaluate(() => [...document.querySelectorAll('#lista-archivos img')].some((i) => i.complete && i.naturalWidth > 0 && i.src.includes('/pc/api/'))), 8000, 'android: miniatura');
    await pA.locator('#lista-archivos li:has-text("Jefe final") button').first().click();
    // El video de la PC se trae entero al tocar Reproducir (por /pc/) y se ve desde el celular.
    await pA.click('#ha-medio .ha-play');
    await hasta(() => pA.evaluate(() => { const v = document.querySelector('#ha-medio video'); return v && v.src.startsWith('blob:') && v.readyState >= 1; }), 10000, 'android: el video carga');
    // Recortar en la PC desde el celular: queda un clip nuevo.
    if (await pA.locator('#ha-principales button:has-text("Recortar")').count()) {
      await pA.click('#ha-principales button:has-text("Recortar")');
      await hasta(() => pA.locator('.recorte input[aria-label="Hasta"]').count(), 5000, 'android: recorte abierto');
      await pA.locator('.recorte input[aria-label="Hasta"]').fill('1');
      await pA.locator('.recorte input[aria-label="Hasta"]').dispatchEvent('input');
      await pA.screenshot({ path: path.join(SALIDA, '14b-android-recortar.png') });
      await pA.click('.recorte button:has-text("Guardar recorte")');
      await hasta(() => pA.locator('#aviso:has-text("recorte")').count(), 60000, 'android: recorte hecho en la PC');
      await hasta(() => pA.locator('#lista-archivos li:has-text("Jefe final")').count(), 8000, 'android: archivos de la PC otra vez');
      await pA.locator('#lista-archivos li:has-text("Jefe final") button').first().click();
      await pA.click('#ha-medio .ha-play');
      await hasta(() => pA.evaluate(() => { const v = document.querySelector('#ha-medio video'); return v && v.src.startsWith('blob:'); }), 10000, 'android: el video carga otra vez');
    }
    await pA.click('#ha-principales .acc:has-text("Al celular")');
    await hasta(() => pA.locator('#aviso:has-text("quedó en este celular")').count(), 15000, 'android: pasado al celular');
    await pA.keyboard.press('Escape');
    await pA.evaluate(() => window.atrasFalso()); // "atrás" vuelve a Ubicaciones
    await pA.click('#ubicaciones .mas-item:has-text("Este celular")');
    await pA.locator('#lista-archivos li:has-text("Jefe final") button').first().click();
    await pA.screenshot({ path: path.join(SALIDA, '14a-android-hoja-archivo.png') });
    await pA.click('#ha-principales .acc:has-text("Descargas")');
    await hasta(() => pA.locator('#aviso:has-text("Descargas")').count(), 8000, 'android: guardado en Descargas');
    const guardadosA = await pA.evaluate(() => window.androidFalso.archivos);
    assert.strictEqual(guardadosA.length, 1);
    assert.match(guardadosA[0].nombre, /^Jefe final( \(recorte\))?\.mp4$/);
    assert.deepStrictEqual([guardadosA[0].destino, guardadosA[0].bytes > 1000], ['descargas', true]);
    await pA.keyboard.press('Escape');
    await pA.screenshot({ path: path.join(SALIDA, '14-android-archivos.png') });
    // "Compartir" desde YouTube con la app abierta.
    await pA.evaluate(() => window.compartirDesdeOtraApp('Mirá esto https://youtu.be/abc123'));
    await hasta(() => pA.locator('#s-charla:not([hidden]) .oferta').count(), 5000, 'android: ofrece bajarlo');
    // El router le cambió la IP a la PC: la app la vuelve a encontrar sola (por su identificador).
    await pA.evaluate(() => { const pc = JSON.parse(localStorage.getItem('jarvis.pc')); pc.base = 'http://192.168.77.99:47821'; localStorage.setItem('jarvis.pc', JSON.stringify(pc)); });
    await pA.reload();
    await hasta(async () => (await pA.textContent('#estado-pc')).startsWith('Modo'), 30000, 'android: reencuentra la PC');
    assert.strictEqual(JSON.parse(await pA.evaluate(() => localStorage.getItem('jarvis.pc'))).base, `http://${IP_PC}:47821`, 'guarda la IP nueva');
    await pA.screenshot({ path: path.join(SALIDA, '15-android-charla.png') });
    // ----- Desde afuera (Tailscale integrado) -----
    // En la PC se prende "Usar Jarvis desde afuera": jarvis-red (de mentira) pide sesión y queda conectado.
    const cfgAntes = (await notch.evaluate(() => window.jarvis.pedir('cfg:leer'))).dato;
    await ajustes.getByLabel('Usar Jarvis desde afuera (app de Android)').check({ force: true });
    await hasta(() => ajustes.locator('text=Listo para usar desde afuera').count(), 15000, 'Tailscale integrado conectado en Ajustes');
    await ajustes.screenshot({ path: path.join(SALIDA, '16-ajustes-desde-afuera.png') });
    // El celular aprende la dirección pública de la PC mientras está en casa.
    await pA.evaluate(() => { localStorage.setItem('jarvis.revisado', String(Date.now())); });
    await hasta(async () => { await pA.click('#abajo button[data-hoja="inicio"]'); return (JSON.parse(await pA.evaluate(() => localStorage.getItem('jarvis.pc'))) || {}).publica === 'https://jarvis-pc.tail1234.ts.net'; }, 20000, 'android: dirección pública de la PC');
    // La dirección pública (Funnel) llega al servidor del celular de Jarvis, como hace jarvis-red.
    let pedidosPublica = 0; let publicaCaida = false;
    await ctxA.route('https://jarvis-pc.tail1234.ts.net/**', async (r) => { if (publicaCaida) return r.abort('connectionrefused'); pedidosPublica++; const u = new URL(r.request().url()); const q = r.request(); const cuerpo = q.postDataBuffer();
      const res = await new Promise((ok, mal) => { const x = require('http').request({ hostname: '127.0.0.1', port: PUERTO, path: u.pathname + u.search, method: q.method(), headers: { ...q.headers(), host: 'jarvis-pc.tail1234.ts.net' } }, (y) => { const p = []; y.on('data', (c) => p.push(c)); y.on('end', () => ok({ status: y.statusCode, headers: y.headers, body: Buffer.concat(p) })); }); x.on('error', mal); x.end(cuerpo || undefined); });
      return r.fulfill(res); });
    // Me voy de casa: la Wi-Fi de casa no contesta más. La app sigue por Tailscale.
    enCasa = false;
    await pA.click('#abajo button[data-hoja="charla"]');
    await pA.fill('#texto', 'modo juego');
    await pA.click('#enviar');
    await hasta(async () => /^Modo juego/.test(await pA.locator('#mensajes li.jarvis:not(.pensando)').last().textContent()), 30000, 'android: respuesta desde afuera');
    assert.ok(pedidosPublica > 0, 'fue por la dirección pública');
    await hasta(async () => /desde afuera/.test(await pA.textContent('#estado-pc')), 15000, 'android: dice "desde afuera"');
    await pA.screenshot({ path: path.join(SALIDA, '17-android-desde-afuera.png') });
    enCasa = true;
    await notch.evaluate((c) => window.jarvis.pedir('cfg:guardar', c), { ...cfgAntes, celular: { ...cfgAntes.celular, afuera: false }, modo: 'normal' });
    // Con la PC sin dirección pública por un rato (Tailscale conectando, recién actualizada), el celular no se olvida de la que sabía.
    await pA.evaluate(() => window.dispatchEvent(new Event('online')));
    await pA.click('#abajo button[data-hoja="inicio"]');
    await esperar(3000);
    assert.strictEqual((JSON.parse(await pA.evaluate(() => localStorage.getItem('jarvis.pc'))) || {}).publica, 'https://jarvis-pc.tail1234.ts.net', 'el celular se acuerda de la dirección de afuera');

    // Ajustes del celular (en Más): avisos al instante y huella opcional.
    await pA.click('#abajo button[data-hoja="mas"]');
    await pA.click('.mas-item:has-text("Ajustes")');
    await hasta(() => pA.locator('#s-ajustes:not([hidden]) .grupo-ajustes').count(), 5000, 'android: Ajustes');
    assert.ok(await pA.locator('.grupo-ajustes h3:text-is("Seguridad")').count(), 'sección Seguridad');
    assert.ok(await pA.locator('.ajuste-fila:has-text("Desde afuera"):has-text("jarvis-pc.tail1234.ts.net")').count(), 'Ajustes muestra la dirección de afuera');
    await pA.locator('.ajuste label:has-text("Avisos al instante") input').check();
    await hasta(() => pA.evaluate(() => window.androidFalso.alInstante && window.androidFalso.alInstante.activo), 3000, 'android: avisos al instante');
    await pA.locator('.ajuste label:has-text("Pedir la huella") input').check();
    await hasta(() => pA.evaluate(() => localStorage.getItem('jarvis.huella') === 'true'), 3000, 'android: huella prendida');
    await pA.screenshot({ path: path.join(SALIDA, '24-android-ajustes.png'), fullPage: true });
    await pA.locator('.ajuste label:has-text("Pedir la huella") input').uncheck();
    // Mouse y teclado (desde la pestaña PC): tocar el touchpad hace clic y el teclado escribe; Bloquear, en la pestaña PC.
    await pA.click('#abajo button[data-hoja="pc"]');
    await pA.click('.mosaico:has-text("Mouse y teclado")');
    await hasta(() => pA.locator('#s-control:not([hidden]) #tp').count(), 3000, 'android: mouse y teclado');
    const caja = await pA.locator('#tp').boundingBox();
    await pA.mouse.move(caja.x + 60, caja.y + 60); await pA.mouse.down(); await pA.mouse.move(caja.x + 140, caja.y + 90, { steps: 6 }); await pA.mouse.up();
    await pA.mouse.click(caja.x + 100, caja.y + 100);
    await pA.click('#ctl-barra .ctl:has-text("Teclas")');
    await pA.screenshot({ path: path.join(SALIDA, '25-android-control.png'), fullPage: true });
    await pA.fill('#ctl-entrada', 'hola');
    // El ⋮ cambia la configuración de botones y deja editarla (como los widgets).
    await pA.click('#ctl-opciones');
    await pA.click('#catalogo button:has-text("Música")');
    await pA.click('#ctl-barra .ctl:has-text("Vol. +")');
    await pA.click('#ctl-opciones');
    await pA.click('#catalogo button:has-text("Editar botones")');
    await pA.click('.eb-agregar button[aria-label="Agregar Bloquear"]');
    await pA.screenshot({ path: path.join(SALIDA, '25c-android-editar-botones.png') });
    await pA.click('#ed-botones button:has-text("Guardar")');
    await hasta(() => pA.locator('#ctl-barra .ctl:has-text("Bloquear")').count(), 3000, 'android: botón agregado a la configuración');
    assert.strictEqual(JSON.parse(await pA.evaluate(() => localStorage.getItem('jarvis.botones.perfil'))), 'musica');
    await pA.screenshot({ path: path.join(SALIDA, '25d-android-botones-musica.png'), fullPage: true });
    await pA.click('#ctl-opciones');
    await pA.click('#catalogo button:has-text("Normal")');
    await pA.evaluate(() => window.atrasFalso()); // atrás vuelve a la pestaña PC
    await hasta(() => pA.locator('#s-pc:not([hidden])').count(), 3000, 'android: atrás vuelve a PC');
    await pA.click('.tarj button:has-text("Bloquear")');
    await hasta(() => { const l = fs.existsSync(REMOTO_LOG) ? fs.readFileSync(REMOTO_LOG, 'utf8') : ''; return /mouse_event\(1, \d+, \d+/.test(l) && /mouse_event\(2, 0/.test(l) && /LockWorkStation/.test(l) && /SendWait\('hola'\)/.test(l) && /Tecla\(175\)/.test(l); }, 8000, 'la PC recibió mover, clic, bloquear y escribir');
    // Con la PC sin contestar, la pestaña PC ofrece prenderla (Wake-on-LAN).
    // (La PC de prueba no está en una red privada: se le da al celular lo que habría aprendido en casa.)
    await pA.evaluate(() => localStorage.setItem('jarvis.despertar', JSON.stringify({ mac: '02:fc:00:00:00:01', broadcast: '192.168.77.255' })));
    enCasa = false;
    publicaCaida = true;
    await pA.click('#abajo button[data-hoja="inicio"]');
    await pA.click('#abajo button[data-hoja="pc"]');
    await hasta(() => pA.locator('.pc-apagada button:has-text("Prender la PC")').count(), 40000, 'android: PC apagada con Prender');
    await pA.screenshot({ path: path.join(SALIDA, '25a-android-pc-apagada.png') });
    await pA.click('.pc-apagada button:has-text("Prender la PC")');
    await hasta(() => pA.evaluate(() => window.androidFalso.despertado && window.androidFalso.despertado.mac), 3000, 'android: Wake-on-LAN con la MAC de la PC');
    enCasa = true;
    publicaCaida = false;
    await pA.click('.pc-apagada button:has-text("Reintentar")');
    await hasta(() => pA.locator('.mosaico').count(), 30000, 'android: la PC vuelve');
    // Escritorio remoto: se ve la pantalla de la PC (WebRTC) y tocar hace clic; en modo "Tocar", el mouse va al punto.
    fs.writeFileSync(REMOTO_LOG, '');
    await pA.click('.mosaico:has-text("Escritorio")');
    await hasta(() => pA.evaluate(() => { const v = document.querySelector('#esc-video'); return v && v.videoWidth > 0 && !v.paused; }), 30000, 'android: se ve la pantalla de la PC');
    await esperar(800);
    await pA.screenshot({ path: path.join(SALIDA, '25b-android-escritorio.png') });
    await hasta(() => notch.evaluate(() => document.getElementById('notch').hasAttribute('data-vigilado') && /pantalla/.test(document.getElementById('acceso-lista').textContent)), 5000, 'notch: ven tu pantalla');
    const lienzo = await pA.locator('#esc-lienzo').boundingBox();
    await pA.mouse.click(lienzo.x + lienzo.width / 2, lienzo.y + lienzo.height / 2);
    await hasta(() => /mouse_event\(2, 0/.test(fs.readFileSync(REMOTO_LOG, 'utf8')), 5000, 'clic desde el escritorio remoto');
    await pA.click('#esc-barra .ctl:has-text("Touchpad")');
    await pA.mouse.click(lienzo.x + lienzo.width * 0.25, lienzo.y + lienzo.height / 2);
    await hasta(() => /mouse_event\(0xC001, \d+, \d+/.test(fs.readFileSync(REMOTO_LOG, 'utf8')), 5000, 'ir al punto tocado');
    await pA.click('#esc-barra .ctl:has-text("Tocar")');
    await pA.click('#esc-cerrar');
    await esperar(500);
    // Archivos de la PC: entrar a la carpeta, subir un archivo y bajar otro.
    await pA.click('#abajo button[data-hoja="pc"]');
    await pA.click('.mosaico:has-text("Archivos")');
    await hasta(() => pA.locator('#lista-pcc button:has-text("Compartida")').count(), 8000, 'android: carpetas compartidas');
    await pA.click('#lista-pcc button:has-text("Compartida")');
    await hasta(() => pA.locator('#lista-pcc button:has-text("presupuesto.pdf")').count(), 8000, 'android: archivos de la carpeta');
    assert.strictEqual(await pA.locator('#lista-pcc li').first().textContent().then((t) => /Fotos/.test(t)), true, 'carpetas primero');
    await pA.setInputFiles('#pcc-archivo', { name: 'foto del celu.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5000, 1) });
    await hasta(() => fs.existsSync(path.join(COMPARTIDA, 'foto del celu.jpg')) && fs.statSync(path.join(COMPARTIDA, 'foto del celu.jpg')).size === 5000, 10000, 'subido a la PC');
    // Miniaturas, filtros, búsqueda, cuadrícula y elegir varios.
    await hasta(() => pA.locator('#lista-pcc li.t-foto .ic.mini img').count(), 15000, 'miniatura de la foto');
    await hasta(() => pA.locator('#lista-pcc li.t-video .ic.mini img').count(), 15000, 'miniatura del video');
    // ⋮ → Mostrar: Fotos (queda como ficha arriba, se saca con ✕).
    await pA.click('#pcc-opciones');
    await pA.click('.opciones-lista button:has-text("Fotos")');
    assert.deepStrictEqual((await pA.locator('#lista-pcc li .datos b').allTextContents()).sort(), ['captura.png', 'foto del celu.jpg'], 'filtro Fotos');
    await pA.click('#pcc-activos .ficha-activa:has-text("Fotos")');
    assert.ok(await notch.evaluate(() => /archivos/i.test(document.getElementById('acceso-lista').textContent)), 'notch: con tus archivos');
    await pA.click('#pcc-lupa');
    await pA.fill('#pcc-buscar', 'presu');
    assert.deepStrictEqual(await pA.locator('#lista-pcc li .datos b').allTextContents(), ['presupuesto.pdf'], 'búsqueda');
    await pA.click('#pcc-lupa');
    await pA.click('#pcc-opciones');
    await pA.click('.opciones-lista button:has-text("Nombre")');
    assert.strictEqual((await pA.locator('#lista-pcc li .datos b').allTextContents()).slice(1).join(), 'captura.png,foto del celu.jpg,jugada.mp4,presupuesto.pdf', 'orden por nombre (carpetas primero)');
    await pA.click('#pcc-opciones');
    await pA.click('.opciones-lista button:has-text("Cuadrícula")');
    assert.ok(await pA.locator('#lista-pcc.cuadricula').count(), 'cuadrícula');
    await pA.screenshot({ path: path.join(SALIDA, '26b-android-archivos-cuadricula.png') });
    // Mantener apretado un archivo empieza a elegir varios.
    const cap = pA.locator('#lista-pcc button[aria-label="Opciones de captura.png"]');
    const cb = await cap.boundingBox();
    await pA.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await pA.mouse.down(); await esperar(700); await pA.mouse.up();
    await hasta(async () => (await pA.textContent('#pcc-cuantos')) === '1 elegido', 3000, 'mantener apretado elige');
    await pA.click('#lista-pcc button[aria-label="Elegir jugada.mp4"]');
    assert.strictEqual(await pA.textContent('#pcc-cuantos'), '2 elegidos');
    await pA.screenshot({ path: path.join(SALIDA, '26c-android-archivos-elegidos.png') });
    await pA.click('#pcc-b-bajar');
    await hasta(() => pA.evaluate(() => ['captura.png', 'jugada.mp4'].every((n) => window.androidFalso.archivos.some((a) => a.nombre === n))), 10000, 'android: bajados los dos');
    await pA.click('#pcc-opciones');
    await pA.click('.opciones-lista button:has-text("Lista")');
    await pA.click('#lista-pcc button:has-text("presupuesto.pdf")');
    await pA.click('#ha-principales .acc:has-text("Al celular")');
    await hasta(() => pA.evaluate(() => window.androidFalso.archivos.some((a) => a.nombre === 'presupuesto.pdf' && a.bytes === 3000)), 10000, 'android: bajado de la PC');
    await pA.screenshot({ path: path.join(SALIDA, '26-android-archivos-pc.png'), fullPage: true });
    // Rutina con "Cuándo se hace sola" en el celular.
    await pA.click('#abajo button[data-hoja="mas"]');
    await pA.click('.mas-item:has-text("Rutinas")');
    await pA.click('#r-nueva');
    await pA.selectOption('.disparadores select', 'hora');
    assert.ok(await pA.locator('.disparador .dias button').count() === 7, 'días de la semana');
    await pA.screenshot({ path: path.join(SALIDA, '27-android-rutina-disparador.png'), fullPage: true });
    await pA.click('#ed-botones button:has-text("Cerrar")');

    // Se lo desvincula desde la PC (así queda un solo celular para lo que sigue).
    const estCel = await notch.evaluate(() => window.jarvis.pedir('celular:estado', false));
    const idA = estCel.dato.dispositivos.find((d) => d.nombre === 'App de prueba').id;
    await notch.evaluate((id) => window.jarvis.pedir('celular:revocar', id), idA);
    await ctxA.close();

    // La PC lo desvincula: el celular vuelve a pedir código.
    await ajustes.screenshot({ path: path.join(SALIDA, '9-ajustes-vinculado.png') });
    await ajustes.getByRole('button', { name: 'Desvincular' }).click();
    await ajustes.locator('dialog button:has-text("Desvincular")').click();
    await hasta(async () => (await ajustes.locator('.cel-disp').count()) === 0, 8000, 'lista vacía en Ajustes');
    await p.click('#abajo button[data-hoja="charla"]');
    await p.fill('#texto', 'hola');
    await p.click('#enviar');
    await hasta(() => p.locator('#vincular:not([hidden])').count(), 8000, 'vuelve a vincular');
    await esperar(300);
    assert.strictEqual(await p.inputValue('#codigo'), '', 'no queda el código viejo');
    assert.strictEqual(await p.isHidden('#aviso'), true, 'no queda el aviso anterior');
    assert.notStrictEqual(await p.getAttribute('#pastilla', 'data-fase'), 'error');
    await p.screenshot({ path: path.join(SALIDA, '10-celular-desvinculado.png') });

    // Con la PC "apagada" (servidor cerrado) la app abre igual desde lo guardado y lo avisa.
    const ctx2 = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p2 = await ctx2.newPage();
    await p2.goto(`http://127.0.0.1:${PUERTO}/`);
    await hasta(() => p2.evaluate(() => navigator.serviceWorker.ready.then(() => true)), 8000, 'service worker');
    await p2.evaluate(() => { localStorage.setItem('jarvis.token', 'x'.repeat(43)); });
    await p2.route('**/api/**', (r) => r.abort('connectionrefused'));
    await p2.reload();
    await hasta(() => p2.locator('#aviso.mal:not([hidden])').count(), 12000, 'aviso de PC que no responde');
    assert.match(await p2.textContent('#aviso'), /no responde/);
    await esperar(400);
    assert.strictEqual(await p2.getAttribute('#pastilla', 'data-fase'), 'dormido', 'los ojos se duermen sin PC');
    await p2.screenshot({ path: path.join(SALIDA, '11-celular-sin-pc.png') });

    // Clips en la PC: todos, con filtro por carpeta, orden y páginas.
    const erroresAjustes = [];
    ajustes.on('pageerror', (e) => erroresAjustes.push(e.message));
    // Ajustes se abrió en Celular (Ajustes): "Volver" lleva a la barra de uso, donde están los Clips.
    await ajustes.click('#menu [data-accion="volver"]');
    await ajustes.locator('button[data-grupo="clips"]').first().click();
    await hasta(() => ajustes.locator('.clips-filtros select').count(), 8000, 'clips: filtros');
    await ajustes.locator('.clips-filtros select[aria-label="Ordenar por"]').selectOption('nombre');
    await hasta(() => ajustes.locator('.clip-fila').count(), 5000, 'clips: lista');
    const nombresClips = await ajustes.locator('.nombre-clip').allTextContents();
    assert.deepStrictEqual(nombresClips, [...nombresClips].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })), 'ordenados por nombre');
    await ajustes.screenshot({ path: path.join(SALIDA, '18-pc-clips-filtros.png') });
    assert.deepStrictEqual(erroresAjustes, []);
    // ⋯ de una tarjeta: abrir afuera, convertir, comprimir, papelera.
    await ajustes.locator('.clip-fila .kebab').first().click();
    await hasta(() => ajustes.locator('.clip-fila .menu-desplegable:not([hidden])').count(), 3000, 'menú ⋯ de la tarjeta');
    assert.ok(await ajustes.locator('.clip-fila .menu-desplegable:not([hidden]) button', { hasText: 'Convertir para editar' }).count());
    await ajustes.screenshot({ path: path.join(SALIDA, '18a-pc-clips-menu.png') });
    await ajustes.keyboard.press('Escape');
    let ultimoVista = '';
    process.on('exit', () => { if (ultimoVista) console.log('VISTA:', ultimoVista); });
    // El clip HEVC (NVIDIA): el editor arma una vista previa y se puede recortar igual.
    await ajustes.locator('.clip-fila', { hasText: 'DVR' }).locator('.cuadro').click();
    await hasta(() => ajustes.locator('.editor-clip').count(), 8000, 'editor de clip');
    // (En Windows el error del visor la dispara sola; acá Electron sí lee HEVC, así que se pide desde ⋯.)
    await hasta(() => ajustes.evaluate(() => document.querySelector('.editor-video').duration > 0), 15000, 'clip cargado');
    await ajustes.click('.editor-cabeza .kebab');
    await ajustes.locator('.editor-cabeza .menu-desplegable button', { hasText: 'No se ve bien' }).click();
    await hasta(() => ajustes.evaluate(() => { const v = document.querySelector('.editor-video'); return v && v.duration > 3 && /\/v\/.+vista-/.test(decodeURIComponent(v.currentSrc)) ? true : `${v && v.currentSrc} ${v && v.duration} ${v && v.error && v.error.code} ${(document.querySelector('.editor-mensaje') || {}).textContent}`; }).then((x) => { if (x !== true) ultimoVista = x; return x === true; }), 60000, 'vista previa del clip HEVC');
    assert.ok(await ajustes.locator('.editor-pie button', { hasText: 'Guardar' }).first().isDisabled(), 'sin recorte, Guardar está apagado');
    // Pantalla completa propia (botón y Esc).
    await ajustes.click('.boton-cine');
    assert.ok(await ajustes.locator('.video-caja.cine').isVisible(), 'pantalla completa');
    await ajustes.screenshot({ path: path.join(SALIDA, '18b-pc-clip-pantalla-completa.png') });
    await ajustes.keyboard.press('Escape');
    assert.strictEqual(await ajustes.locator('.video-caja.cine').count(), 0, 'Esc sale de pantalla completa');
    // Recortar y Guardar (reemplaza) → Deshacer.
    await ajustes.fill('.fila-recorte input[aria-label="Inicio (segundos)"]', '1');
    await ajustes.locator('.fila-recorte input[aria-label="Inicio (segundos)"]').dispatchEvent('change');
    const guardarB = ajustes.locator('.editor-pie .boton-dividido > button').first();
    await hasta(async () => !(await guardarB.isDisabled()), 3000, 'Guardar se prende con un recorte');
    await ajustes.click('.editor-pie .dividido-flecha');
    await hasta(() => ajustes.locator('.boton-dividido .menu-desplegable:not([hidden]) button', { hasText: 'Guardar una copia' }).count(), 3000, 'Guardar una copia');
    await ajustes.screenshot({ path: path.join(SALIDA, '18c-pc-clip-guardar.png') });
    await ajustes.keyboard.press('Escape');
    const dvr = path.join(CLIPS, '7 Days to Die', '7 Days to Die 2025.05.17 - 19.45.26.04.DVR.mp4');
    const largoDe = (f) => { const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-i', f]).stderr)); return m ? +m[3] + +m[2] * 60 : 0; };
    await guardarB.click();
    await hasta(() => ajustes.locator('#cartel button', { hasText: 'Deshacer' }).count(), 60000, 'aviso con Deshacer');
    assert.ok(Math.abs(largoDe(dvr) - 3) < 0.5, `recortado: ${largoDe(dvr)}`);
    await ajustes.screenshot({ path: path.join(SALIDA, '18e-pc-clip-deshacer.png') });
    await ajustes.locator('#cartel button', { hasText: 'Deshacer' }).click();
    await hasta(async () => Math.abs(largoDe(dvr) - 4) < 0.5, 15000, 'deshacer devuelve el original');
    // ⋯ del editor → Comprimir…
    await ajustes.click('.editor-cabeza .kebab');
    await ajustes.locator('.editor-cabeza .menu-desplegable button', { hasText: 'Comprimir' }).click();
    assert.ok(await ajustes.locator('.panel-comprimir').isVisible());
    await ajustes.screenshot({ path: path.join(SALIDA, '18d-pc-clip-comprimir.png'), fullPage: true });
    await ajustes.locator('.panel-comprimir button', { hasText: 'Cancelar' }).click();
    // Edición: vertical 9:16, 1,5x, cortar en dos, copiar y pegar un pedazo, un texto y un recuadro; se guarda una copia.
    assert.ok(await ajustes.locator('.panel-edicion[open]').count(), 'Edición abierta de entrada');
    await ajustes.click('.panel-edicion button:has-text("Vertical 9:16")');
    assert.ok(await ajustes.locator('.mascara-formato:not([hidden])').count(), 'recuadro 9:16 sobre el video');
    await ajustes.click('.panel-edicion button:has-text("1,5x")');
    await ajustes.evaluate(() => { const v = document.querySelector('.editor-video'); v.currentTime = v.duration / 2; });
    await esperar(400);
    await ajustes.click('.fila-recorte button:has-text("Cortar acá")');
    await hasta(async () => (await ajustes.locator('.tiras .tira').count()) === 2, 3000, 'dos pedazos');
    await ajustes.click('.panel-edicion button:has-text("Copiar")');
    await ajustes.click('.panel-edicion button:has-text("Pegar")');
    await hasta(async () => (await ajustes.locator('.tiras .tira').count()) === 3, 3000, 'tres pedazos (uno repetido)');
    const largos = await ajustes.locator('.tiras .tira span').allTextContents();
    assert.strictEqual(largos[1], largos[2], `el pegado es igual al copiado: ${largos}`);
    assert.notStrictEqual(largos[0], '0:02.7 · 1,5x', 'cortar no deja el clip entero en un pedazo');
    await ajustes.click('.panel-edicion button:has-text("+ Texto")');
    await ajustes.fill('.capa-editor input[aria-label="Texto"]', 'QUE JUGADA');
    await ajustes.click('.panel-edicion button:has-text("+ Recuadro")');
    await hasta(() => ajustes.locator('.capas-video .capa-texto:has-text("QUE JUGADA")').count(), 3000, 'texto sobre el video');
    assert.ok(await ajustes.locator('.capas-video .capa-cuadro').count(), 'recuadro sobre el video');
    // Arrastrar el recuadro lo mueve; Ctrl+Z lo devuelve.
    await ajustes.locator('.video-caja').scrollIntoViewIfNeeded();
    const cuadro = ajustes.locator('.capas-video .capa-cuadro');
    const antesCuadro = await cuadro.boundingBox();
    await ajustes.mouse.move(antesCuadro.x + antesCuadro.width / 2, antesCuadro.y + antesCuadro.height / 2);
    await ajustes.mouse.down();
    await ajustes.mouse.move(antesCuadro.x + antesCuadro.width / 2 + 60, antesCuadro.y + antesCuadro.height / 2 + 30, { steps: 8 });
    await ajustes.mouse.up();
    const despuesCuadro = await cuadro.boundingBox();
    assert.ok(Math.abs(despuesCuadro.x - antesCuadro.x - 60) < 4 && Math.abs(despuesCuadro.y - antesCuadro.y - 30) < 4, `el recuadro se movió: ${JSON.stringify([antesCuadro, despuesCuadro])}`);
    // La esquina lo agranda.
    await ajustes.mouse.move(despuesCuadro.x + despuesCuadro.width + 1, despuesCuadro.y + despuesCuadro.height + 1);
    await ajustes.mouse.down();
    await ajustes.mouse.move(despuesCuadro.x + despuesCuadro.width + 41, despuesCuadro.y + despuesCuadro.height + 21, { steps: 6 });
    await ajustes.mouse.up();
    const grande = await cuadro.boundingBox();
    assert.ok(grande.width - despuesCuadro.width > 15 && grande.height - despuesCuadro.height > 15, `el recuadro se agrandó: ${despuesCuadro.width} → ${grande.width}`);
    await ajustes.click('.panel-edicion button:has-text("Relleno (tapar)")');
    await ajustes.keyboard.press('Control+z');
    await ajustes.keyboard.press('Control+z');
    const deshecho = await cuadro.boundingBox();
    assert.ok(Math.abs(deshecho.width - despuesCuadro.width) < 3, 'Ctrl+Z deshace el tamaño');
    assert.ok(!(await ajustes.locator('.editor-pie .boton-dividido > button').first().isDisabled()), 'con edición, Guardar se prende');
    await ajustes.screenshot({ path: path.join(SALIDA, '18f-pc-clip-mas-edicion.png'), fullPage: true });
    await ajustes.locator('.video-caja').scrollIntoViewIfNeeded();
    await ajustes.screenshot({ path: path.join(SALIDA, '18g-pc-clip-capas.png') });
    await ajustes.click('.editor-pie .dividido-flecha');
    await ajustes.locator('.boton-dividido .menu-desplegable:not([hidden]) button', { hasText: 'Guardar una copia' }).click();
    await hasta(() => fs.readdirSync(path.join(CLIPS, '7 Days to Die')).some((n) => /\(vertical\)\.mp4$/.test(n)), 90000, 'copia editada guardada');
    const editada = path.join(CLIPS, '7 Days to Die', fs.readdirSync(path.join(CLIPS, '7 Days to Die')).find((n) => /\(vertical\)\.mp4$/.test(n)));
    assert.match(String(require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-i', editada]).stderr), /Video: h264.* \d+x\d+/);
    await ajustes.click('.editor-cabeza .estrella');
    await ajustes.click('.editor-cabeza button:has-text("Clips")');

    // Almacenamiento: elegir con Shift un rango de videos (ordenados por tamaño) y ver la barra de acciones.
    await ajustes.click('#menu [data-accion="ajustes"]');
    await ajustes.click('#menu button[data-grupo="sistema"]');
    await ajustes.click('.pestanas button:has-text("Almacenamiento")').catch(() => ajustes.click('button:has-text("Almacenamiento")'));
    await hasta(() => ajustes.locator('.tabla-lote .fila-lote:not(.cabeza)').count(), 15000, 'videos en Almacenamiento');
    const filasLote = ajustes.locator('.tabla-lote .fila-lote:not(.cabeza)');
    const nLote = await filasLote.count();
    await filasLote.nth(0).click();
    await filasLote.nth(nLote - 1).click({ modifiers: ['Shift'] });
    await hasta(async () => /(\d+) elegidos/.test(await ajustes.textContent('.lote-barra').catch(() => '')) && Number(/(\d+) elegidos/.exec(await ajustes.textContent('.lote-barra'))[1]) === nLote, 3000, 'shift elige todos los del medio');
    await ajustes.screenshot({ path: path.join(SALIDA, '21-pc-almacenamiento-lote.png') });
    await ajustes.click('.lote-barra button:has-text("Ninguno")');
    // Estado de la PC.
    await ajustes.click('.pestanas button:has-text("Estado de la PC")').catch(() => ajustes.click('button:has-text("Estado de la PC")'));
    await hasta(() => ajustes.locator('.tarjeta-pc').count(), 8000, 'estado de la PC');
    await hasta(() => ajustes.locator('.fila-pc:not(.cabeza)').count(), 8000, 'procesos de Jarvis');
    await esperar(2500);
    await ajustes.screenshot({ path: path.join(SALIDA, '22-pc-estado.png'), fullPage: true });
    // Rutinas: que se haga sola a una hora, de lunes a viernes.
    await ajustes.click('#menu [data-accion="volver"]');
    await ajustes.click('#menu button[data-grupo="rutinas"]');
    await ajustes.selectOption('.disparadores select', 'hora');
    for (const d of ['L', 'M', 'X', 'J', 'V']) await ajustes.click(`.disparador .dia:text-is("${d}")`);
    await esperar(900);
    const rutPc = (await notch.evaluate(() => window.jarvis.pedir('rutinas:leer'))).dato;
    assert.ok(rutPc.some((r) => (r.disparadores || []).some((d) => d.tipo === 'hora' && d.dias.join() === '1,2,3,4,5')), 'disparador guardado');
    await ajustes.screenshot({ path: path.join(SALIDA, '23-pc-rutina-disparador.png'), fullPage: true });
    // Ayuda a pedido: el "i" abre el globo con la explicación.
    await ajustes.locator('.boton-info').first().click();
    assert.ok(await ajustes.locator('.globo:not([hidden])').count(), 'globo de ayuda');
    await ajustes.keyboard.press('Escape');
    // Historial: "Hacer rutina" con un pedido.
    await ajustes.click('#menu button[data-grupo="historial"]');
    await hasta(() => ajustes.locator('.registro button:has-text("Hacer rutina")').count(), 8000, 'historial con botones');
    await ajustes.click('.hist-barra .ficha:has-text("Celular")');
    assert.ok(await ajustes.locator('.hist-linea .registro.o-celular').count(), 'filtro Celular');
    assert.strictEqual(await ajustes.locator('.hist-linea .registro:not(.o-celular)').count(), 0, 'solo lo del celular');
    await ajustes.screenshot({ path: path.join(SALIDA, '23b-pc-historial.png') });
    await ajustes.click('.hist-barra .ficha:has-text("Todo")');
    const antesR = rutPc.length;
    await ajustes.locator('.registro button:has-text("Hacer rutina")').first().click();
    await hasta(async () => (await notch.evaluate(() => window.jarvis.pedir('rutinas:leer'))).dato.length === antesR + 1, 5000, 'rutina armada desde el historial');

    // Inicio de Ajustes: el aviso de yt-dlp viejo, con su botón; y en Sistema → Componentes, "Actualizar".
    await ajustes.click('#menu button[data-grupo="resumen"]');
    await hasta(() => ajustes.locator('.aviso-sistema', { hasText: 'yt-dlp está desactualizado' }).count(), 10000, 'aviso de yt-dlp en Inicio');
    assert.ok(await ajustes.locator('.aviso-sistema button', { hasText: 'Actualizar yt-dlp' }).count());
    assert.ok(!(await ajustes.locator('#menu .menu-engranaje .punto-menu').isHidden()), 'punto en Ajustes');
    assert.ok(await ajustes.locator('.tarjeta-inicio h2:text-is("Para hoy")').count() && await ajustes.locator('.tarjeta-inicio h2:text-is("Lo último que pediste")').count(), 'Inicio con el día');
    await ajustes.screenshot({ path: path.join(SALIDA, '19-pc-inicio-avisos.png') });
    await ajustes.locator('.aviso-sistema button', { hasText: 'Ver' }).first().click();
    await hasta(() => ajustes.locator('.tarjeta-componente', { hasText: 'Desactualizado · 2026.11.01' }).count(), 10000, 'yt-dlp desactualizado en Componentes');
    assert.ok(await ajustes.locator('.tarjeta-componente', { hasText: 'yt-dlp' }).getByRole('button', { name: 'Actualizar' }).count());
    await ajustes.screenshot({ path: path.join(SALIDA, '20-pc-componentes-ytdlp.png') });

    // El 401 es esperado (el pedido después de desvincular), el 422 también (WhatsApp sin conectar en el sandbox) y el 403 (cfg:leer desde el celular).
    const inesperados = errores.filter((x) => !/status of (401|422|403)/.test(x));
    assert.deepStrictEqual(inesperados, [], `errores de consola:\n${errores.join('\n')}`);
    console.log('TODO BIEN. Capturas en', SALIDA);
  } catch (e) {
    console.log('FALLA:', e.stack);
    console.log('--- log de Jarvis ---\n', log.slice(-3000));
    console.log('errores de consola:', errores);
    process.exitCode = 1;
  } finally {
    if (navegador) await navegador.close().catch(() => {});
    if (pc) await pc.close().catch(() => {});
    electron.kill('SIGTERM');
    spawn('pkill', ['-f', `remote-debugging-port=9333`]);
  }
})();
