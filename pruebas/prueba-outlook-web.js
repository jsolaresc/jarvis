// Prueba del mecanismo de "Hotmail por el navegador de Jarvis" con una página de Outlook de mentira (no entra a ninguna cuenta real).
// Uso: JARVIS_DATOS=/tmp/ow xvfb-run -a npx electron pruebas/prueba-outlook-web.js --no-sandbox
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { app } = require('electron');

process.env.JARVIS_DATOS = process.env.JARVIS_DATOS || fs.mkdtempSync(path.join(os.tmpdir(), 'ow-'));
let filas = [
  { c: 'AAA1', de: 'Banco', asunto: 'Tu resumen', vista: 'Ya está disponible', sin: false },
  { c: 'AAA2', de: 'Tomi', asunto: 'Che, viste?', vista: 'Mirá esto', sin: true },
];
let enLogin = false;
const pagina = () => enLogin
  ? '<html><body><input type="password" name="passwd"></body></html>'
  : `<html><head><title>Correo - Outlook</title></head><body><div role="listbox">${filas.map((f) => `<div role="option" data-convid="${f.c}" aria-label="${f.sin ? 'Unread ' : ''}${f.de}" style="font-weight:${f.sin ? 700 : 400}"><span>${f.de}</span><div>${f.asunto}</div><div>${f.vista}</div><div>10:15</div></div>`).join('')}</div></body></html>`;
const servidor = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(pagina()); });

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
  await new Promise((r) => servidor.listen(47993, '127.0.0.1', r));
  process.env.JARVIS_URL_OUTLOOK_WEB = 'http://127.0.0.1:47993/mail';
  const config = require('../src/main/config');
  const correo = require('../src/main/correo');
  const ow = require('../src/main/outlookweb');
    // Sin sesión: no hace nada.
    assert.deepStrictEqual(await ow.revisar(), []);
    // Inicio de sesión: la ventana "visible" llega a la bandeja y queda conectada.
    const fin = await new Promise((ok) => ow.iniciarSesion(ok));
    assert.deepStrictEqual(fin, { ok: true });
    assert.strictEqual(config.leerConfig().correo.outlook.web, true);
    assert.ok(correo.configurada('outlook'));
    // La primera revisión solo toma nota.
    assert.deepStrictEqual(await correo.revisar('outlook'), []);
    // Llega un mail nuevo (y uno viejo se corre): se avisa solo del nuevo.
    filas = [{ c: 'AAA3', de: 'Eva Pérez', asunto: 'Reunión mañana', vista: 'Te espero', sin: true }, ...filas];
    ow._pruebas.reiniciar();
    const nuevos = await correo.revisar('outlook');
    assert.deepStrictEqual(nuevos.map((m) => [m.cuenta, m.de, m.asunto]), [['outlook', 'Eva Pérez', 'Reunión mañana']]);
    assert.deepStrictEqual(await correo.revisar('outlook'), [], 'no repite');
    ow._pruebas.reiniciar();
    assert.match(await correo.probar('outlook'), /Conectado: veo 3 mensajes en la bandeja, 2 sin leer/);
    // La sesión vence: pide iniciar de nuevo.
    enLogin = true;
    ow._pruebas.reiniciar();
    await assert.rejects(() => correo.revisar('outlook'), /iniciá sesión de nuevo/);
    assert.strictEqual(config.leerConfig().correo.outlook.web, false);
    console.log('prueba-outlook-web: todo bien');
    app.exit(0);
  } catch (e) { console.log('prueba-outlook-web: FALLA', e.stack || e.message); app.exit(1); }
});
