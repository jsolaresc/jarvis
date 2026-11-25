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
const PUERTO = 47821;
const CLIPS = path.join(DATOS, 'Videos');
fs.mkdirSync(path.join(CLIPS, 'Valheim'), { recursive: true });
// Un clip de verdad (2 s) para que haya miniatura y se pueda reproducir.
require('child_process').execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(CLIPS, 'Valheim', 'Jefe final.mp4')]);
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
    cwd: raiz, env: { ...process.env, JARVIS_DATOS: DATOS, JARVIS_TAILSCALE: ts, JARVIS_YTDLP: YTDLP, JARVIS_FFMPEG: '/usr/local/bin/ffmpeg' }, stdio: ['ignore', 'pipe', 'pipe'],
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
    await p.goto(`http://127.0.0.1:${PUERTO}/#v=${codigo}`);
    await hasta(() => p.locator('#vincular:not([hidden])').count(), 5000, 'pantalla de vincular');
    assert.strictEqual((await p.inputValue('#codigo')).replace(/\D/g, ''), codigo, 'el QR trae el código');
    assert.strictEqual(await p.inputValue('#nombre-cel'), 'moto g84 5G', 'propone el nombre del celular');
    await p.screenshot({ path: path.join(SALIDA, '3-celular-vincular.png') });
    await p.getByRole('button', { name: 'Vincular' }).click();
    await hasta(() => p.locator('#app:not([hidden])').count(), 8000, 'app después de vincular');
    await hasta(async () => (await p.textContent('#estado-pc')).startsWith('Modo'), 8000, 'estado de la PC');
    await p.screenshot({ path: path.join(SALIDA, '4-celular-charla-vacia.png') });
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

    // Rutinas y modos.
    await p.click('#abajo button[data-hoja="rutinas"]');
    await hasta(() => p.locator('#lista-rutinas .rutina').count(), 5000, 'rutinas');
    await p.click('#lista-modos button:has-text("Normal")');
    await hasta(async () => (await p.locator('#lista-modos button.on').textContent()) === 'Normal', 8000, 'modo normal');
    await p.screenshot({ path: path.join(SALIDA, '6-celular-rutinas.png'), fullPage: true });

    // Descargar: una para este celular (la PC la baja y el celular se la lleva) y un audio para la PC.
    await p.click('#abajo button[data-hoja="descargar"]');
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

    // Historial de la PC: quedó "desde el celular".
    const hist = await notch.evaluate(() => window.jarvis.pedir('historial:leer'));
    assert.ok(hist.dato.some((x) => x.origen === 'celular' && x.dicho === 'modo silencio'), 'historial con origen celular');

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

    // El 401 es esperado (el pedido después de desvincular) y el 422 también (WhatsApp sin conectar en el sandbox).
    const inesperados = errores.filter((x) => !/status of (401|422)/.test(x));
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
