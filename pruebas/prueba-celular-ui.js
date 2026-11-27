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
fs.writeFileSync(path.join(DATOS, 'config.json'), JSON.stringify({
  nombre: 'Jarvis', usuario: 'Sofía', celular: { activo: true, puerto: PUERTO, https: 443, hablarEnPC: false },
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
    cwd: raiz, env: { ...process.env, JARVIS_DATOS: DATOS, JARVIS_TAILSCALE: ts, JARVIS_YTDLP: YTDLP, JARVIS_YTDLP_ULTIMA: '2026.11.20', JARVIS_RED: RED, JARVIS_FFMPEG: '/usr/local/bin/ffmpeg' }, stdio: ['ignore', 'pipe', 'pipe'],
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
    await notch.evaluate(() => window.jarvis.pedir('ajustes:abrir', 'celular'));
    const ajustes = await hasta(() => ctxPC.pages().find((p) => p.url().includes('ajustes.html')), 15000, 'Ajustes');
    ajustes.on('console', (m) => { if (m.type() === 'error') errores.push(`ajustes: ${m.text()}`); });
    ajustes.on('pageerror', (e) => errores.push(`ajustes: ${e.message}`));
    await ajustes.setViewportSize({ width: 1100, height: 900 }).catch(() => {});
    await hasta(() => ajustes.locator('text=Listo para usar desde el celular').count(), 15000, 'estado de Tailscale en Ajustes');
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

    // Inicio: rutinas y modos son widgets.
    await p.click('#abajo button[data-hoja="inicio"]');
    await hasta(() => p.locator('.w-rutinas .rutina').count(), 5000, 'rutinas');
    await p.click('.wt-modos .fichas button:has-text("Normal")');
    await hasta(async () => (await p.locator('.widget .fichas button.on').textContent()) === 'Normal', 8000, 'modo normal');
    // Editar Inicio: sumar un atajo de voz, achicar y quitar un widget; queda guardado.
    const antes = await p.locator('#widgets .widget').count();
    await p.click('#editar-inicio');
    await p.click('#sumar-widget');
    p.once('dialog', (d) => d.accept('qué hora es'));
    await p.click('#catalogo button:has-text("Atajo de voz")').catch(() => {});
    await esperar(300);
    // (la segunda pregunta, el nombre del botón)
    await hasta(() => p.locator('#widgets .widget').count().then((n) => n === antes + 1), 5000, 'atajo sumado');
    await p.locator('#widgets .widget').first().locator('button[aria-label^="Quitar"]').click();
    await p.click('#editar-inicio');
    assert.strictEqual(await p.locator('#widgets .widget').count(), antes, 'uno más y uno menos');
    assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('jarvis.inicio'))).length, antes);
    await p.screenshot({ path: path.join(SALIDA, '6-celular-inicio-editado.png'), fullPage: true });

    // Descargar: una para este celular (la PC la baja y el celular se la lleva) y un audio para la PC.
    await p.click('#abajo button[data-hoja="mas"]');
    await p.screenshot({ path: path.join(SALIDA, '6b-celular-mas.png') });
    await p.click('.mas-item:has-text("Descargar")');
    await p.fill('#d-url', 'Mirá esto https://youtu.be/abc123 jaja');
    assert.strictEqual(await p.inputValue('#d-url'), 'https://youtu.be/abc123', 'deja solo el link');
    await p.click('.segmentado[data-campo="calidad"] [data-valor="720"]');
    await p.screenshot({ path: path.join(SALIDA, '7a-celular-descargar.png') });
    await p.click('#form-descarga button[type="submit"]');
    await hasta(() => p.locator('#lista-descargas li').count(), 8000, 'descarga en la lista');
    await esperar(500);
    await p.screenshot({ path: path.join(SALIDA, '7b-celular-descargando.png') });
    await hasta(async () => /quedó en el celular/.test(await p.textContent('#aviso')), 20000, 'el video llegó al celular');
    await p.fill('#d-url', 'https://youtu.be/abc123');
    await p.click('.segmentado[data-campo="modo"] [data-valor="audio"]');
    assert.strictEqual(await p.isHidden('#d-calidad-fila'), true, 'sin calidad para audio');
    await p.click('.segmentado[data-campo="para"] [data-valor="pc"]');
    await p.click('#form-descarga button[type="submit"]');
    await hasta(async () => /quedó en la PC/.test(await p.textContent('#lista-descargas')), 20000, 'audio listo en la PC');
    await p.screenshot({ path: path.join(SALIDA, '7c-celular-descargas-listas.png') });
    // La PC borró lo temporal del celular.
    const temporal = path.join(DATOS, 'celular-temporal');
    await hasta(() => !fs.existsSync(temporal) || fs.readdirSync(temporal).length === 0, 5000, 'temporal borrado');
    assert.ok(fs.existsSync(path.join(CLIPS, 'Descargas', 'Audio', 'Tema de prueba [abc123].mp3')), 'el audio quedó en Descargas\\Audio');

    // Archivos: en la PC (clip, descarga de audio) y en el celular (el video recién bajado).
    await p.click('#abajo button[data-hoja="archivos"]');
    await p.click('[data-donde="pc"]');
    await hasta(async () => (await p.locator('#lista-archivos li .abrir').count()) >= 2, 8000, 'archivos de la PC');
    const nombresPC = await p.locator('#lista-archivos li .datos b').allTextContents();
    assert.ok(nombresPC.includes('Jefe final') && nombresPC.includes('Tema de prueba'), nombresPC.join(', '));
    await hasta(() => p.locator('#lista-archivos .mini img').count(), 8000, 'miniatura del clip');
    await esperar(800);
    await p.screenshot({ path: path.join(SALIDA, '7d-celular-archivos-pc.png') });
    await p.click('[data-filtro="audio"]');
    assert.deepStrictEqual(await p.locator('#lista-archivos li .datos b').allTextContents(), ['Tema de prueba']);
    await p.click('[data-filtro="todo"]');
    // Abrir el clip y pasarlo al celular.
    await p.locator('#lista-archivos li .abrir', { hasText: 'Jefe final' }).click();
    await hasta(() => p.locator('#hoja-archivo[open] video').count(), 5000, 'hoja del archivo');
    await hasta(() => p.evaluate(() => document.querySelector('#ha-medio video').readyState >= 1), 8000, 'el video carga');
    await p.screenshot({ path: path.join(SALIDA, '7e-celular-hoja-pc.png') });
    await p.getByRole('button', { name: 'Pasar al celular' }).click();
    await hasta(async () => /quedó en este celular/.test(await p.textContent('#aviso')), 15000, 'clip pasado al celular');
    await p.click('#ha-cerrar');
    await p.click('[data-donde="celular"]');
    const enCel = await p.locator('#lista-archivos li .datos b').allTextContents();
    assert.deepStrictEqual(enCel, ['Jefe final', 'Video de prueba']);
    assert.strictEqual(await p.locator('#lista-archivos .mini img').count(), 2, 'miniaturas hechas en el celular');
    await p.screenshot({ path: path.join(SALIDA, '7f-celular-archivos-celular.png') });
    // Se reproduce desde el celular aunque la PC no conteste.
    await p.locator('#lista-archivos li .abrir', { hasText: 'Video de prueba' }).click();
    await hasta(() => p.evaluate(() => { const v = document.querySelector('#ha-medio video'); return v && v.readyState >= 1 && v.src.startsWith('blob:'); }), 8000, 'video local');
    await p.screenshot({ path: path.join(SALIDA, '7g-celular-hoja-local.png') });
    // Pasarlo a la PC.
    await p.getByRole('button', { name: 'Pasar a la PC' }).click();
    await hasta(async () => /quedó en la PC/.test(await p.textContent('#aviso')), 15000, 'pasado a la PC');
    assert.ok(fs.existsSync(path.join(CLIPS, 'Descargas', 'Del celular', 'Video de prueba [abc123].mp4')), 'quedó en Descargas\\Del celular');
    // Mandarlo por WhatsApp sin WhatsApp conectado: tiene que explicar el problema (y no dejar nada temporal).
    await p.fill('#ha-para', 'Tomi');
    await p.click('#ha-mandar');
    await hasta(async () => /WhatsApp/.test(await p.textContent('#aviso')), 15000, 'aviso de WhatsApp al mandar');
    assert.deepStrictEqual(fs.readdirSync(path.join(DATOS, 'celular-subidas')), []);
    // Borrar del celular.
    p.once('dialog', (d) => d.accept());
    await p.getByRole('button', { name: 'Borrar del celular' }).click();
    await hasta(async () => (await p.locator('#lista-archivos li .datos b').allTextContents()).length === 1, 5000, 'borrado del celular');
    // "Compartir" desde otra app: abre Descargar con el link.
    const p3 = await cel.newPage();
    await p3.goto(`http://127.0.0.1:${PUERTO}/?titulo=Un%20video&texto=${encodeURIComponent('Mirá https://youtube.com/watch?v=zzz')}`);
    await hasta(() => p3.locator('#s-descargar:not([hidden])').count(), 8000, 'abre en Descargar');
    assert.strictEqual(await p3.inputValue('#d-url'), 'https://youtube.com/watch?v=zzz');
    assert.strictEqual(new URL(p3.url()).search, '', 'limpia la dirección');
    await p3.close();
    await p.click('#abajo button[data-hoja="mensaje"]');
    await p.fill('#wa-para', 'Tomi');
    await p.fill('#wa-texto', 'Ya salgo');
    await p.click('#form-wa button[type="submit"]');
    await hasta(() => p.locator('#aviso.mal:not([hidden])').count(), 10000, 'aviso de WhatsApp desconectado');
    const avisoWa = await p.textContent('#aviso');
    assert.match(avisoWa, /WhatsApp/);
    await p.screenshot({ path: path.join(SALIDA, '8-celular-mensaje.png') });

    // ----- Más: notas, calendario, rutinas e historial, igual que en Ajustes de la PC -----
    const pcPide = async (canal, ...a) => (await notch.evaluate(([c, x]) => window.jarvis.pedir(c, ...x), [canal, a])).dato;
    await p.click('#abajo button[data-hoja="mas"]');
    await p.click('.mas-item:has-text("Notas")');
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

    await p.click('#abajo button[data-hoja="mas"]');
    await p.click('.mas-item:has-text("Calendario")');
    await p.click('#c-nuevo');
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
    await pA.click('[data-donde="pc"]');
    await hasta(() => pA.locator('#lista-archivos li:has-text("Jefe final")').count(), 8000, 'android: archivos de la PC');
    // Miniaturas y video pasan por la app (/pc/…): se ven.
    await hasta(() => pA.evaluate(() => [...document.querySelectorAll('#lista-archivos img')].some((i) => i.complete && i.naturalWidth > 0 && i.src.includes('/pc/api/'))), 8000, 'android: miniatura');
    await pA.locator('#lista-archivos li:has-text("Jefe final") button').first().click();
    // El video de la PC se trae entero al tocar Reproducir (por /pc/) y se ve desde el celular.
    await pA.click('#ha-medio .ha-play');
    await hasta(() => pA.evaluate(() => { const v = document.querySelector('#ha-medio video'); return v && v.src.startsWith('blob:') && v.readyState >= 1; }), 10000, 'android: el video carga');
    // Recortar en la PC desde el celular: queda un clip nuevo.
    if (await pA.locator('#ha-acciones button:has-text("Recortar")').count()) {
      await pA.click('#ha-acciones button:has-text("Recortar")');
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
    await pA.getByRole('button', { name: 'Pasar al celular' }).click();
    await hasta(() => pA.locator('#aviso:has-text("quedó en este celular")').count(), 15000, 'android: pasado al celular');
    await pA.keyboard.press('Escape');
    await pA.click('[data-donde="celular"]');
    await pA.locator('#lista-archivos li:has-text("Jefe final") button').first().click();
    await pA.getByRole('button', { name: 'Guardar en Descargas del celular' }).click();
    await hasta(() => pA.locator('#aviso:has-text("Descargas")').count(), 8000, 'android: guardado en Descargas');
    const guardadosA = await pA.evaluate(() => window.androidFalso.archivos);
    assert.strictEqual(guardadosA.length, 1);
    assert.match(guardadosA[0].nombre, /^Jefe final( \(recorte\))?\.mp4$/);
    assert.deepStrictEqual([guardadosA[0].destino, guardadosA[0].bytes > 1000], ['descargas', true]);
    await pA.keyboard.press('Escape');
    await pA.screenshot({ path: path.join(SALIDA, '14-android-archivos.png') });
    // "Compartir" desde YouTube con la app abierta.
    await pA.evaluate(() => window.compartirDesdeOtraApp('Mirá esto https://youtu.be/abc123'));
    await hasta(() => pA.locator('#s-descargar:not([hidden])').count(), 5000, 'android: abre Descargar');
    assert.strictEqual(await pA.inputValue('#d-url'), 'https://youtu.be/abc123');
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
    let pedidosPublica = 0;
    await ctxA.route('https://jarvis-pc.tail1234.ts.net/**', async (r) => { pedidosPublica++; const u = new URL(r.request().url()); const q = r.request(); const cuerpo = q.postDataBuffer();
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
    await ajustes.click('.editor-cabeza button:has-text("Clips")');

    // Inicio de Ajustes: el aviso de yt-dlp viejo, con su botón; y en Sistema → Componentes, "Actualizar".
    await ajustes.click('#menu button[data-grupo="resumen"]');
    await hasta(() => ajustes.locator('.aviso-sistema', { hasText: 'yt-dlp está desactualizado' }).count(), 10000, 'aviso de yt-dlp en Inicio');
    assert.ok(await ajustes.locator('.aviso-sistema button', { hasText: 'Actualizar yt-dlp' }).count());
    assert.ok(!(await ajustes.locator('#menu button[data-grupo="sistema"] .punto-menu').isHidden()), 'punto en Sistema');
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
