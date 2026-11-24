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
fs.writeFileSync(path.join(DATOS, 'config.json'), JSON.stringify({
  nombre: 'Jarvis', usuario: 'Sofía', celular: { activo: true, puerto: PUERTO, https: 443, hablarEnPC: false },
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
    cwd: raiz, env: { ...process.env, JARVIS_DATOS: DATOS, JARVIS_TAILSCALE: ts }, stdio: ['ignore', 'pipe', 'pipe'],
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

    // Clips y mensaje (sin WhatsApp conectado: tiene que explicar el problema).
    await p.click('#abajo button[data-hoja="clips"]');
    await hasta(() => p.locator('#lista-clips li').count(), 8000, 'lista de clips');
    await p.screenshot({ path: path.join(SALIDA, '7-celular-clips.png') });
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
