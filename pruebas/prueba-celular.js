// Pruebas del servidor del celular (src/main/celular.js): vincular, tokens, permisos, clips y Tailscale (de mentira).
// Uso: node pruebas/prueba-celular.js
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

process.env.JARVIS_DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-celular-'));
// Un "tailscale" de mentira: lee qué contestar de variables de entorno.
const falso = path.join(process.env.JARVIS_DATOS, 'tailscale-falso.js');
fs.writeFileSync(falso, `#!/usr/bin/env node
const a = process.argv.slice(2).join(' ');
const modo = require('fs').readFileSync(process.env.TS_MODO, 'utf8').trim();
const log = process.env.TS_LOG; require('fs').appendFileSync(log, a + '\\n');
if (modo === 'nosesion' && a.startsWith('status')) { console.log(JSON.stringify({ BackendState: 'NeedsLogin', Self: {} })); process.exit(0); }
if (a === 'status --json') { console.log(JSON.stringify({ BackendState: 'Running', Self: { DNSName: 'pc-casa.tail1234.ts.net.', TailscaleIPs: ['100.101.102.103'] } })); process.exit(0); }
if (a === 'serve status --json') { console.log(require('fs').existsSync(process.env.TS_PUBLICADO) ? JSON.stringify({ Web: { 'pc-casa.tail1234.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:' + process.env.TS_PUERTO } } } } }) : '{}'); process.exit(0); }
if (a.startsWith('serve --bg')) {
  if (modo === 'sinhttps') { console.log('Serve is not enabled on your tailnet.\\nTo enable, visit:\\n\\n         https://login.tailscale.com/f/serve?node=abc123\\n'); setTimeout(() => {}, 60000); return; }
  if (modo === 'denegado') { console.error('Access denied: serve config denied'); process.exit(1); }
  require('fs').writeFileSync(process.env.TS_PUBLICADO, '1'); console.log('Available within your tailnet:'); process.exit(0);
}
if (a === 'serve --https=443 off') { try { require('fs').unlinkSync(process.env.TS_PUBLICADO); } catch {} process.exit(0); }
process.exit(2);
`);
fs.chmodSync(falso, 0o755);
process.env.JARVIS_TAILSCALE = falso;
process.env.TS_MODO = path.join(process.env.JARVIS_DATOS, 'ts-modo');
process.env.TS_LOG = path.join(process.env.JARVIS_DATOS, 'ts-log');
process.env.TS_PUBLICADO = path.join(process.env.JARVIS_DATOS, 'ts-publicado');
const modoTs = (m) => fs.writeFileSync(process.env.TS_MODO, m);
modoTs('ok');

const celular = require('../src/main/celular');

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

// Lo que haría main.js, de mentira.
const hecho = [];
const clipFalso = path.join(process.env.JARVIS_DATOS, 'clip.mp4');
fs.writeFileSync(clipFalso, Buffer.alloc(5000, 7));
celular.configurar({
  texto: async (t, q) => { hecho.push(['texto', t, q.id]); return { texto: `Dijiste: ${t}`, espera: false }; },
  accion: async (b, q) => { hecho.push(['accion', b.tipo, q.id]); return `Hecho ${b.tipo}`; },
  estado: () => ({ pc: 'Jarvis', modo: 'normal', rutinas: [{ id: 'r1', nombre: 'Modo juego' }] }),
  clips: () => [{ archivo: clipFalso, nombre: 'clip.mp4', juego: 'Valheim', bytes: 5000, fecha: Date.now() }],
  miniatura: async () => `data:image/jpeg;base64,${Buffer.from('jpg-de-mentira').toString('base64')}`,
  enviarClip: async (a, c) => { hecho.push(['enviarClip', path.basename(a), c]); return `Mandado a ${c}`; },
});

let base = '';
const pedir = (ruta, { metodo = 'GET', cuerpo, token, host, headers = {} } = {}) => fetch(base + ruta, {
  method: metodo, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(host ? { Host: host } : {}), ...headers },
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
});
const jsonDe = async (r) => ({ status: r.status, dato: await r.json().catch(() => ({})) });
let token = '';

prueba('escucha solo en 127.0.0.1 y sirve la app con cabeceras de seguridad', async () => {
  const p = await celular.iniciar(0);
  base = `http://127.0.0.1:${p}`;
  process.env.TS_PUERTO = String(p);
  assert.strictEqual(await celular.iniciar(0), p, 'iniciar dos veces no abre otro');
  const r = await pedir('/');
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Vinculá este celular/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
  for (const a of ['/app.js', '/app.css', '/sw.js', '/manifest.webmanifest', '/icono-192.png', '/icono.png']) assert.strictEqual((await pedir(a)).status, 200, a);
  assert.strictEqual((await pedir('/manifest.webmanifest')).headers.get('content-type'), 'application/manifest+json');
  assert.strictEqual((await pedir('/..%2f..%2fpackage.json')).status, 404);
  assert.strictEqual((await pedir('/%2e%2e/main/celular.js')).status, 404);
  assert.strictEqual((await pedir('/', { metodo: 'POST' })).status, 405);
  // ¿escucha solo en esta PC? En otra IP de la máquina no tiene que contestar.
  const otra = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  if (otra) await assert.rejects(() => fetch(`http://${otra.address}:${p}/api/hola`, { signal: AbortSignal.timeout(1500) }));
});

prueba('rechaza nombres que no son esta PC ni Tailscale (DNS rebinding)', async () => {
  const conHost = (host) => new Promise((ok, mal) => { const u = new URL(base); require('http').get({ hostname: u.hostname, port: u.port, path: '/api/hola', headers: { Host: host } }, (r) => { r.resume(); ok(r.statusCode); }).on('error', mal); });
  assert.strictEqual(await conHost('malo.com'), 421);
  assert.strictEqual(await conHost('pc-casa.tail1234.ts.net'), 200);
  assert.strictEqual(await conHost('localhost:47820'), 200);
  assert.strictEqual(celular._anfitrionValido('100.101.102.103:443'), true);
  assert.strictEqual(celular._anfitrionValido('100.200.1.1'), false, 'fuera del rango de Tailscale');
  assert.strictEqual(celular._anfitrionValido('192.168.0.10'), false);
  assert.strictEqual(celular._anfitrionValido('ts.net.malo.com'), false);
});

prueba('sin token no se puede hacer nada', async () => {
  const h = await jsonDe(await pedir('/api/hola'));
  assert.deepStrictEqual([h.status, h.dato.jarvis, h.dato.vinculado], [200, true, false]);
  for (const [ruta, metodo] of [['/api/estado', 'GET'], ['/api/texto', 'POST'], ['/api/accion', 'POST'], ['/api/clips', 'GET'], ['/api/desvincular', 'POST']]) {
    assert.strictEqual((await pedir(ruta, { metodo, cuerpo: metodo === 'POST' ? { texto: 'x', tipo: 'rutina' } : undefined })).status, 401, ruta);
  }
  assert.strictEqual((await pedir('/api/estado', { token: 'a'.repeat(43) })).status, 401);
  assert.deepStrictEqual(hecho, []);
});

prueba('vincular: código de 6 cifras, de un solo uso, con intentos limitados', async () => {
  let r = await jsonDe(await pedir('/api/vincular', { metodo: 'POST', cuerpo: { codigo: '123456' } }));
  assert.strictEqual(r.status, 410, 'sin código vigente');
  const { codigo } = celular.nuevoCodigo();
  assert.match(codigo, /^\d{6}$/);
  const malo = codigo === '000000' ? '000001' : '000000';
  r = await jsonDe(await pedir('/api/vincular', { metodo: 'POST', cuerpo: { codigo: malo } }));
  assert.deepStrictEqual([r.status, /Te quedan 4/.test(r.dato.error)], [403, true]);
  r = await jsonDe(await pedir('/api/vincular', { metodo: 'POST', cuerpo: { codigo: `${codigo.slice(0, 3)} ${codigo.slice(3)}`, nombre: 'Moto <b>G</b>' } }));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.dato.nombre, 'Moto bG/b', 'el nombre se limpia');
  token = r.dato.token;
  assert.ok(token.length >= 40);
  // El token no queda escrito en la PC: solo su hash.
  const guardado = fs.readFileSync(path.join(process.env.JARVIS_DATOS, 'celular.json'), 'utf8');
  assert.ok(!guardado.includes(token));
  assert.ok(guardado.includes(celular._hashDe(token)));
  // El mismo código no sirve dos veces.
  r = await jsonDe(await pedir('/api/vincular', { metodo: 'POST', cuerpo: { codigo } }));
  assert.strictEqual(r.status, 410);
  // Cinco errores anulan el código.
  const otro = celular.nuevoCodigo().codigo;
  const mal = otro === '999999' ? '999998' : '999999';
  for (let i = 0; i < 4; i++) assert.strictEqual((await pedir('/api/vincular', { metodo: 'POST', cuerpo: { codigo: mal } })).status, 403);
  assert.strictEqual((await pedir('/api/vincular', { metodo: 'POST', cuerpo: { codigo: mal } })).status, 410);
  assert.strictEqual((await pedir('/api/vincular', { metodo: 'POST', cuerpo: { codigo: otro } })).status, 410, 'ni siquiera el bueno, después de anularse');
  assert.strictEqual(celular.codigoVigente(), null);
});

prueba('con token: estado, escribirle a Jarvis y acciones permitidas', async () => {
  const e = await jsonDe(await pedir('/api/estado', { token }));
  assert.strictEqual(e.status, 200);
  assert.strictEqual(e.dato.pc, 'Jarvis');
  assert.strictEqual(e.dato.yo.nombre, 'Moto bG/b');
  assert.ok(!JSON.stringify(e.dato).includes('hash'));
  const h = await jsonDe(await pedir('/api/hola', { token }));
  assert.strictEqual(h.dato.vinculado, true);
  const t = await jsonDe(await pedir('/api/texto', { metodo: 'POST', token, cuerpo: { texto: '  poné música  ' } }));
  assert.deepStrictEqual([t.status, t.dato.texto], [200, 'Dijiste: poné música']);
  assert.strictEqual((await pedir('/api/texto', { metodo: 'POST', token, cuerpo: { texto: '   ' } })).status, 400);
  const a = await jsonDe(await pedir('/api/accion', { metodo: 'POST', token, cuerpo: { tipo: 'rutina', id: 'r1' } }));
  assert.deepStrictEqual([a.status, a.dato.texto], [200, 'Hecho rutina']);
  for (const tipo of ['abrir', 'cerrar', 'casa', 'decir', '__proto__', undefined]) assert.strictEqual((await pedir('/api/accion', { metodo: 'POST', token, cuerpo: { tipo } })).status, 400, `no se puede: ${tipo}`);
  assert.strictEqual((await pedir('/api/accion', { metodo: 'POST', token, cuerpo: { tipo: 'x', relleno: 'a'.repeat(70000) } })).status, 413);
  const malArmado = await fetch(`${base}/api/texto`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{no es json' });
  assert.strictEqual(malArmado.status, 400);
  assert.ok(hecho.some((x) => x[0] === 'texto' && x[1] === 'poné música'));
});

prueba('clips: lista con enlaces propios, video por partes y miniatura', async () => {
  const { dato } = await jsonDe(await pedir('/api/clips', { token }));
  const c = dato.clips[0];
  assert.strictEqual(c.nombre, 'clip.mp4');
  assert.ok(!JSON.stringify(dato).includes(process.env.JARVIS_DATOS), 'no muestra rutas de la PC');
  const v = await fetch(base + c.ver, { headers: { Range: 'bytes=100-199' } });
  assert.deepStrictEqual([v.status, v.headers.get('content-range'), (await v.arrayBuffer()).byteLength], [206, 'bytes 100-199/5000', 100]);
  const m = await fetch(base + c.miniatura);
  assert.deepStrictEqual([m.status, m.headers.get('content-type'), Buffer.from(await m.arrayBuffer()).toString()], [200, 'image/jpeg', 'jpg-de-mentira']);
  assert.strictEqual((await fetch(`${base}/api/archivo/${'a'.repeat(24)}/x.mp4`)).status, 404, 'un enlace inventado no anda');
  const env = await jsonDe(await pedir('/api/clips/enviar', { metodo: 'POST', token, cuerpo: { id: c.id, contacto: 'Tomi' } }));
  assert.deepStrictEqual([env.status, env.dato.texto], [200, 'Mandado a Tomi']);
  assert.strictEqual((await pedir('/api/clips/enviar', { metodo: 'POST', token, cuerpo: { id: 'nada', contacto: 'Tomi' } })).status, 404);
  base.clipVer = c.ver;
  pruebas.verClip = c.ver;
});

prueba('novedades: la app espera y recibe lo nuevo al instante', async () => {
  const { dato: e } = await jsonDe(await pedir('/api/estado', { token }));
  const t0 = Date.now();
  const espera = jsonDe(await Promise.all([pedir(`/api/novedades?desde=${e.novedad}`, { token }), new Promise((r) => setTimeout(() => { celular.publicar('aviso', { texto: 'hola' }); r(); }, 300))]).then((x) => x[0]));
  const r = await espera;
  assert.ok(Date.now() - t0 < 3000);
  assert.deepStrictEqual([r.dato.eventos.length, r.dato.eventos[0].tipo, r.dato.eventos[0].dato.texto], [1, 'aviso', 'hola']);
});

prueba('desvincular desde la PC corta el acceso al instante (también a los clips)', async () => {
  const [d] = celular.dispositivos();
  assert.ok(d && d.id && !('hash' in d));
  celular.renombrar(d.id, 'Celu de prueba');
  assert.strictEqual(celular.dispositivos()[0].nombre, 'Celu de prueba');
  celular.revocar(d.id);
  assert.strictEqual((await pedir('/api/estado', { token })).status, 401);
  assert.strictEqual((await fetch(base + pruebas.verClip)).status, 404, 'el enlace del clip muere con el aparato');
  assert.throws(() => celular.revocar(d.id), /ya no estaba vinculado/);
});

prueba('el celular se puede desvincular solo', async () => {
  celular.nuevoCodigo();
  const { codigo } = celular.codigoVigente();
  const { dato } = await jsonDe(await pedir('/api/vincular', { metodo: 'POST', cuerpo: { codigo, nombre: 'Otro' } }));
  assert.strictEqual((await pedir('/api/desvincular', { metodo: 'POST', token: dato.token })).status, 200);
  assert.strictEqual((await pedir('/api/estado', { token: dato.token })).status, 401);
  assert.deepStrictEqual(celular.dispositivos(), []);
});

prueba('demasiados intentos sin token se frenan', async () => {
  let ultimo = 0;
  for (let i = 0; i < 40; i++) ultimo = (await pedir('/api/estado', { token: `x${'y'.repeat(30)}${i}` })).status;
  assert.strictEqual(ultimo, 429);
});

prueba('Tailscale: detecta la PC, publica Jarvis y explica los problemas', async () => {
  let e = await celular.estadoTailscale();
  assert.deepStrictEqual([e.instalado, e.conectado, e.nombre, e.url, e.publicado], [true, true, 'pc-casa.tail1234.ts.net', 'https://pc-casa.tail1234.ts.net', false]);
  modoTs('sinhttps');
  let r = await celular.publicarEnTailscale();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.habilitar, 'https://login.tailscale.com/f/serve?node=abc123');
  modoTs('denegado');
  r = await celular.publicarEnTailscale();
  assert.strictEqual(r.ok, false);
  assert.match(r.texto, /terminal de administrador/);
  assert.strictEqual(r.comando, `tailscale serve --bg --https=443 http://127.0.0.1:${process.env.TS_PUERTO}`);
  modoTs('ok');
  r = await celular.publicarEnTailscale();
  assert.strictEqual(r.ok, true, r.texto);
  assert.match(fs.readFileSync(process.env.TS_LOG, 'utf8'), new RegExp(`serve --bg --yes --https=443 http://127.0.0.1:${process.env.TS_PUERTO}`));
  e = await celular.estadoTailscale();
  assert.strictEqual(e.publicado, true);
  r = await celular.despublicarDeTailscale();
  assert.strictEqual(r.ok, true);
  assert.strictEqual((await celular.estadoTailscale()).publicado, false);
  modoTs('nosesion');
  e = await celular.estadoTailscale();
  assert.deepStrictEqual([e.instalado, e.conectado], [true, false]);
  assert.match(e.texto, /no iniciaste sesión/);
  process.env.JARVIS_TAILSCALE = '/no/existe/tailscale';
  e = await celular.estadoTailscale();
  assert.strictEqual(e.instalado, false);
  process.env.JARVIS_TAILSCALE = falso;
});

prueba('apagado no escucha', async () => {
  await celular.detener();
  assert.strictEqual(celular.puerto(), 0);
  await assert.rejects(() => fetch(`${base}/api/hola`, { signal: AbortSignal.timeout(1500) }));
});

(async () => {
  let fallas = 0;
  for (const [nombre, fn] of pruebas) {
    try { await fn(); console.log(`  ok  ${nombre}`); } catch (e) { fallas++; console.log(`FALLA ${nombre}\n      ${e.stack}`); }
  }
  console.log(fallas ? `\n${fallas} prueba(s) con fallas` : `\n${pruebas.length} pruebas bien`);
  await celular.detener();
  process.exit(fallas ? 1 : 0);
})();
