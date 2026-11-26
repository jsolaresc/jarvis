// Jarvis en el celular: un servidor aparte del de la interfaz, solo para aparatos vinculados.
//
// - Escucha SOLO en 127.0.0.1 (puerto 47820 por defecto). Desde el celular se llega por Tailscale:
//   "tailscale serve" pone el HTTPS (*.ts.net, certificado renovado solo) y le pasa los pedidos a este puerto.
//   Nada queda abierto a la red de casa ni a internet.
// - Modo casa (opcional, para la app de Android): un segundo servidor en la red local (puerto 47821) que atiende
//   SOLO /api, solo a direcciones privadas de la casa (192.168.x, 10.x, 172.16-31.x) y solo si el pedido apunta a
//   la IP de la PC (corta el "DNS rebinding"). Con CORS para la app (https://localhost). El token viaja por la Wi-Fi
//   de la casa sin HTTPS: lo protege la clave de la Wi-Fi.
// - Vincular: Ajustes muestra un código de 6 cifras (dura 5 minutos, 5 intentos). El celular lo manda una sola vez
//   y recibe un token propio; en la PC se guarda solo su hash (datos/celular.json). Se revoca desde Ajustes.
// - La página (src/movil) se sirve sin token: es solo la cáscara. Todo lo que hace algo pasa por /api con
//   "Authorization: Bearer <token>" (sin cookies, así no hay pedidos cruzados desde otras páginas).
// - Solo existe mientras está prendido en Ajustes → Celular; en reposo no gasta nada (un socket esperando).
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { RAIZ, DATOS } = require('./config');

const CARPETA_APP = path.join(RAIZ, 'src', 'movil');
const ICONO = path.join(RAIZ, 'src', 'ui', 'icono.png');
const ARCHIVO = () => path.join(DATOS, 'celular.json');
const PUERTO = 47820;
const PUERTO_CASA = 47821;
const MAX_CUERPO = 64 * 1024;
const MAX_CUERPO_PC = 512 * 1024; // /api/pc: las rutinas enteras pueden pesar más que un pedido común
const VIDA_CODIGO = 5 * 60000;
const MAX_SUBIDA = 2 * 1024 * 1024 * 1024; // lo que acepta WhatsApp como documento
// Lo que se baja para el celular y lo que el celular sube quedan aparte (en datos/) y se borran solos: al llevárselo,
// al terminar de mandarlo, o pasadas 24 h.
const TEMP_DESCARGAS = () => path.join(DATOS, 'celular-temporal');
const TEMP_SUBIDAS = () => path.join(DATOS, 'celular-subidas');
const VIDA_TEMPORAL = 24 * 3600000;
const INTENTOS = 5;
const VERSION = (() => { try { return require('../../package.json').version; } catch { return ''; } })();

// Lo que hace de verdad cada pedido lo pone main.js (así este módulo se prueba solo, con funciones de mentira).
const puente = {
  texto: async () => ({ texto: '' }), // (texto, { id }) -> { texto, espera }
  accion: async () => 'Listo.', // (pedido, { id }) -> texto
  estado: () => ({}), // lo que la app muestra arriba (modo, rutinas, clips, contactos…)
  clips: () => [], // [{ archivo, nombre, juego, bytes, fecha }]
  miniatura: async () => '', // archivo -> 'data:image/jpeg;base64,…' ('' si no hay)
  enviarClip: async () => 'Listo.', // (archivo, contacto)
  archivos: () => [], // [{ archivo, nombre, tipo: 'clip'|'video'|'audio', carpeta, bytes, fecha }] (clips y descargas de la PC)
  enviarArchivo: async () => 'Listo.', // (archivo, contacto) por WhatsApp desde la PC
  recortar: async () => 'Listo.', // (archivo, { desde, hasta }) un clip nuevo con ese tramo
  descargar: async () => ({ id: 0, texto: '' }), // ({ url, modo, calidad, para, carpeta }) con yt-dlp
  descarga: () => null, // id -> { estado, pct, nombre, archivo, error, … }
  guardarSubida: async () => 'Listo.', // (ruta, nombre) lo que mandó el celular, a la carpeta de Descargas de la PC
  pc: async () => { throw conCodigo(403, 'No disponible.'); }, // (canal, args, quien) lo mismo que Ajustes de la PC: notas, calendario, rutinas, historial
  inicio: async () => ({}), // datos de los widgets de Inicio: { clima, agenda, notas }
  avisos: () => [], // lo que el celular tiene que avisar: [{ id, cuando, titulo, texto, tipo }] (si el usuario lo quiere ahí)
  anotar: () => {}, // (texto, { error }) al Historial
  cambio: () => {}, // avisa a Ajustes que cambió la lista de aparatos o el código
};
function configurar(funciones) { Object.assign(puente, funciones); }

// ---------- Aparatos vinculados ----------
const hashDe = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
function leer() {
  try { const d = JSON.parse(fs.readFileSync(ARCHIVO(), 'utf8')); return { ...(d.pc ? { pc: d.pc } : {}), dispositivos: Array.isArray(d.dispositivos) ? d.dispositivos : [] }; } catch { return { dispositivos: [] }; }
}
// Identidad de esta PC para la app de Android: así la reconoce aunque el router le cambie la IP.
function idPC() {
  const d = leer();
  if (!d.pc) { d.pc = crypto.randomBytes(8).toString('hex'); guardar(d); }
  return d.pc;
}
// Las IP de esta PC en la red de casa (sin Tailscale, sin adaptadores internos).
function ipsCasa() {
  const ips = [];
  for (const [nombre, lista] of Object.entries(os.networkInterfaces() || {})) {
    if (/tailscale|vethernet|virtualbox|vmware|loopback|wsl|docker/i.test(nombre)) continue;
    for (const x of lista || []) if ((x.family === 'IPv4' || x.family === 4) && !x.internal && esPrivada(x.address)) ips.push(x.address);
  }
  return [...new Set(ips)];
}
// Direcciones de una red de casa (no internet, no Tailscale).
function esPrivada(ip) {
  const v = String(ip || '').replace(/^::ffff:/, '');
  return /^10\.\d+\.\d+\.\d+$/.test(v) || /^192\.168\.\d+\.\d+$/.test(v) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(v);
}
function guardar(d) {
  fs.mkdirSync(DATOS, { recursive: true });
  const tmp = `${ARCHIVO()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, ARCHIVO());
}
// Lo que ve Ajustes (nunca el hash).
const publicos = () => leer().dispositivos.map(({ id, nombre, creado, ultimo }) => ({ id, nombre, creado, ultimo }));

function quien(token) {
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const h = Buffer.from(hashDe(token), 'hex');
  for (const d of leer().dispositivos) {
    const otro = Buffer.from(String(d.hash || ''), 'hex');
    if (otro.length === h.length && crypto.timingSafeEqual(otro, h)) return d;
  }
  return null;
}
// La hora de último uso se guarda como mucho una vez por minuto (no escribir el disco en cada pedido).
function marcarUso(id) {
  const d = leer();
  const x = d.dispositivos.find((y) => y.id === id);
  if (!x || Date.now() - (x.ultimo || 0) < 60000) return;
  x.ultimo = Date.now();
  guardar(d);
}
function revocar(id) {
  const d = leer();
  const antes = d.dispositivos.length;
  d.dispositivos = d.dispositivos.filter((x) => x.id !== id);
  if (d.dispositivos.length === antes) throw new Error('Ese celular ya no estaba vinculado.');
  guardar(d);
  puente.cambio();
  return publicos();
}
function renombrar(id, nombre) {
  const d = leer();
  const x = d.dispositivos.find((y) => y.id === id);
  if (!x) throw new Error('Ese celular ya no estaba vinculado.');
  x.nombre = limpiarNombre(nombre) || x.nombre;
  guardar(d);
  puente.cambio();
  return publicos();
}
const limpiarNombre = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);

// ---------- Código para vincular ----------
let codigo = null; // { valor, vence, intentos }
function nuevoCodigo() {
  codigo = { valor: String(crypto.randomInt(0, 1000000)).padStart(6, '0'), vence: Date.now() + VIDA_CODIGO, intentos: 0 };
  puente.cambio();
  return { codigo: codigo.valor, vence: codigo.vence };
}
function cancelarCodigo() { codigo = null; puente.cambio(); }
const codigoVigente = () => (codigo && Date.now() < codigo.vence ? { codigo: codigo.valor, vence: codigo.vence } : null);

function vincular(valor, nombre) {
  if (!codigo || Date.now() >= codigo.vence) { codigo = null; throw conCodigo(410, 'No hay ningún código vigente. Pedí uno nuevo en Jarvis (Ajustes → Celular).'); }
  const dado = String(valor || '').replace(/\D/g, '');
  const ok = dado.length === 6 && crypto.timingSafeEqual(Buffer.from(dado), Buffer.from(codigo.valor));
  if (!ok) {
    codigo.intentos++;
    if (codigo.intentos >= INTENTOS) { codigo = null; puente.cambio(); puente.anotar('Celular: código para vincular anulado tras 5 intentos fallidos.', { error: true }); throw conCodigo(410, 'Código incorrecto. Se anuló por seguridad: pedí uno nuevo en la PC.'); }
    throw conCodigo(403, `Código incorrecto. Te quedan ${INTENTOS - codigo.intentos} intento${INTENTOS - codigo.intentos === 1 ? '' : 's'}.`);
  }
  codigo = null; // un código sirve una sola vez
  const token = crypto.randomBytes(32).toString('base64url');
  const d = leer();
  const disp = { id: crypto.randomBytes(6).toString('hex'), nombre: limpiarNombre(nombre) || 'Celular', hash: hashDe(token), creado: Date.now(), ultimo: Date.now() };
  d.dispositivos.push(disp);
  guardar(d);
  puente.anotar(`Celular: se vinculó "${disp.nombre}".`);
  puente.cambio();
  return { token, id: disp.id, nombre: disp.nombre };
}
const conCodigo = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// ---------- Novedades para la app (espera larga: la app pregunta y la respuesta llega cuando hay algo) ----------
let numero = 0;
const eventos = []; // { n, tipo, dato, cuando }
const esperando = new Set();
function publicar(tipo, dato) {
  eventos.push({ n: ++numero, tipo, dato, cuando: Date.now() });
  while (eventos.length > 50) eventos.shift();
  for (const listo of [...esperando]) listo();
}
function novedadesDesde(n) { return eventos.filter((e) => e.n > n); }

// ---------- Archivos que la app puede ver (clips): enlaces de un solo dueño y con vencimiento ----------
const enlaces = new Map(); // código -> { archivo, id, vence }
function enlazar(archivo, id) {
  const c = crypto.randomBytes(12).toString('hex');
  enlaces.set(c, { archivo, id, vence: Date.now() + 3 * 3600000 });
  while (enlaces.size > 200) enlaces.delete(enlaces.keys().next().value);
  return c;
}
function enlace(c) {
  const e = enlaces.get(String(c || ''));
  if (!e || Date.now() > e.vence) { enlaces.delete(c); return null; }
  return e;
}

// ---------- HTTP ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/ogg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac' };
const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
};
function json(res, status, dato) {
  const cuerpo = JSON.stringify(dato);
  res.writeHead(status, { ...SEGURIDAD, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(cuerpo) });
  res.end(cuerpo);
}
function leerCuerpo(req, max = MAX_CUERPO) {
  return new Promise((ok, mal) => {
    if (Number(req.headers['content-length']) > max) { req.resume(); mal(conCodigo(413, 'Pedido demasiado grande.')); return; }
    let n = 0; const partes = [];
    req.on('data', (c) => { n += c.length; if (n > max) { mal(conCodigo(413, 'Pedido demasiado grande.')); req.destroy(); return; } partes.push(c); });
    req.on('end', () => { try { ok(n ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch { mal(conCodigo(400, 'Pedido mal armado.')); } });
    req.on('error', mal);
  });
}
function servirArchivo(req, res, archivo, extra = {}) {
  fs.stat(archivo, (error, info) => {
    if (error || !info.isFile()) { res.writeHead(404, SEGURIDAD); res.end(); return; }
    const cab = { ...SEGURIDAD, 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', ...extra };
    const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let inicio = 0; let fin = info.size - 1; let status = 200;
    if (rango && (rango[1] || rango[2])) {
      inicio = rango[1] ? parseInt(rango[1], 10) : Math.max(0, info.size - parseInt(rango[2], 10));
      fin = rango[1] && rango[2] ? Math.min(parseInt(rango[2], 10), info.size - 1) : info.size - 1;
      if (inicio > fin) { res.writeHead(416, { ...cab, 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
      status = 206; cab['Content-Range'] = `bytes ${inicio}-${fin}/${info.size}`;
    }
    res.writeHead(status, { ...cab, 'Content-Length': fin - inicio + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    const flujo = fs.createReadStream(archivo, { start: inicio, end: fin });
    flujo.on('error', () => res.destroy());
    res.on('close', () => flujo.destroy()); // en Windows una lectura abierta no deja reemplazar ni borrar el clip
    flujo.pipe(res);
  });
}

// Solo nombres que llegan por esta PC (127.0.0.1) o por Tailscale (*.ts.net, 100.x): corta el "DNS rebinding"
// (una página cualquiera abierta en esta PC no puede hacerse pasar por Jarvis).
function anfitrionValido(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h.endsWith('.ts.net') || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(h) || /^fd7a:115c:a1e0:/.test(h);
}

const deCasa = (ip) => esPrivada(ip) || /^(::ffff:)?127\./.test(String(ip)) || ip === '::1';
// Modo casa: el pedido tiene que apuntar a una IP privada (nunca a un nombre: eso corta el "DNS rebinding")
// y venir de un aparato de la red de casa.
function anfitrionCasa(host) { return esPrivada(String(host || '').replace(/:\d+$/, '')); }
const ORIGENES_APP = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost']);
function cors(req) {
  const o = req.headers.origin;
  return ORIGENES_APP.has(o) ? {
    'Access-Control-Allow-Origin': o, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS', 'Access-Control-Expose-Headers': 'Content-Length, Content-Type, Content-Range', 'Access-Control-Max-Age': '600',
  } : {};
}

// Ataques de fuerza bruta: tope de pedidos sin token válido por minuto (en total: todo llega desde 127.0.0.1).
let fallidos = { desde: 0, n: 0 };
function frenar() {
  if (Date.now() - fallidos.desde > 60000) fallidos = { desde: Date.now(), n: 0 };
  return ++fallidos.n > 30;
}

const ACCIONES = new Set(['rutina', 'clip', 'whatsapp', 'foto', 'modo', 'musica', 'volumen', 'nota']);

// ---------- Archivos temporales del celular ----------
const misDescargas = new Map(); // id de la descarga -> { dispositivo, para, carpeta }
const dentroDe = (base, ruta) => { const b = path.resolve(base) + path.sep; return path.resolve(String(ruta || '')).startsWith(b); };
function borrarCarpetaTemporal(carpeta) {
  if (!carpeta || !(dentroDe(TEMP_DESCARGAS(), carpeta) || dentroDe(TEMP_SUBIDAS(), carpeta))) return;
  try { fs.rmSync(carpeta, { recursive: true, force: true }); } catch {}
}
function limpiarTemporales(ahora = Date.now()) {
  for (const base of [TEMP_DESCARGAS(), TEMP_SUBIDAS()]) {
    let lista = [];
    try { lista = fs.readdirSync(base); } catch { continue; }
    for (const n of lista) {
      const r = path.join(base, n);
      try { if (ahora - fs.statSync(r).mtimeMs > VIDA_TEMPORAL) fs.rmSync(r, { recursive: true, force: true }); } catch {}
    }
  }
}
// Nombre de archivo que llega del celular: sin carpetas, sin caracteres que Windows no acepta, con un largo razonable.
function nombreSubido(n) {
  const limpio = path.basename(String(n || '').replace(/\\/g, '/')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 150);
  return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(limpio) || !limpio ? `archivo-${Date.now()}` : limpio;
}
function recibirArchivo(req, carpeta, nombre) {
  return new Promise((ok, mal) => {
    const largo = Number(req.headers['content-length']);
    if (largo > MAX_SUBIDA) { req.resume(); mal(conCodigo(413, 'Pesa más de 2 GB.')); return; }
    fs.mkdirSync(carpeta, { recursive: true });
    const ruta = path.join(carpeta, nombre);
    const f = fs.createWriteStream(ruta);
    let n = 0; let fallo = null;
    req.on('data', (c) => { n += c.length; if (n > MAX_SUBIDA && !fallo) { fallo = conCodigo(413, 'Pesa más de 2 GB.'); req.unpipe(f); f.destroy(); req.resume(); } });
    req.on('aborted', () => { fallo = fallo || conCodigo(400, 'Se cortó la subida.'); f.destroy(); });
    f.on('error', (e) => { fallo = fallo || e; });
    f.on('close', () => {
      if (fallo || !n || (largo && n !== largo)) { borrarCarpetaTemporal(carpeta); mal(fallo || conCodigo(400, n ? 'Se cortó la subida.' : 'No llegó nada.')); return; }
      ok({ ruta, bytes: n });
    });
    req.pipe(f);
  });
}
const LISTA_ARCHIVOS = (yo) => (puente.archivos() || []).slice(0, 120).map((c) => {
  const k = enlazar(c.archivo, yo.id);
  return { id: k, nombre: c.nombre, tipo: c.tipo || 'clip', carpeta: c.carpeta || c.juego || '', juego: c.juego || c.carpeta || '', bytes: c.bytes, fecha: c.fecha, ver: `/api/archivo/${k}/${encodeURIComponent(c.nombre)}`, miniatura: c.tipo === 'audio' ? '' : `/api/miniatura/${k}` };
});

async function atender(req, res, { casa = false } = {}) {
  if (casa) {
    if (!anfitrionCasa(req.headers.host) || !deCasa(req.socket.remoteAddress)) { res.writeHead(421, SEGURIDAD); res.end(); return; }
  } else if (!anfitrionValido(req.headers.host)) { res.writeHead(421, SEGURIDAD); res.end(); return; }
  // La app de Android (https://localhost) llega por el modo casa o, desde afuera, por Tailscale integrado:
  // todas las respuestas llevan los permisos para ella (solo para ese origen; todo lo que hace algo sigue pidiendo token).
  const extra = cors(req);
  if (extra['Access-Control-Allow-Origin']) {
    const original = res.writeHead.bind(res);
    res.writeHead = (status, a, b) => {
      const cab = typeof a === 'object' && a ? a : (b || {});
      const unidas = { ...extra, ...cab };
      return typeof a === 'string' ? original(status, a, unidas) : original(status, unidas);
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, SEGURIDAD); res.end(); return; }
  }
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400, SEGURIDAD); res.end(); return; }
  const ruta = url.pathname;

  if (!ruta.startsWith('/api/')) {
    if (casa) { res.writeHead(404, SEGURIDAD); res.end(); return; } // la app de Android trae su propia cáscara
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SEGURIDAD); res.end(); return; }
    if (ruta === '/icono.png') { servirArchivo(req, res, ICONO, { 'Cache-Control': 'max-age=86400' }); return; }
    let rel;
    try { rel = decodeURIComponent(ruta === '/' ? '/index.html' : ruta); } catch { res.writeHead(400, SEGURIDAD); res.end(); return; }
    const archivo = path.join(CARPETA_APP, rel);
    if (!archivo.startsWith(CARPETA_APP + path.sep)) { res.writeHead(404, SEGURIDAD); res.end(); return; }
    // La cáscara se revisa siempre (no-cache): así el celular toma la versión nueva apenas se actualiza Jarvis.
    servirArchivo(req, res, archivo, { 'Cache-Control': 'no-cache' });
    return;
  }

  const metodo = req.method;
  try {
    if (ruta === '/api/hola' && metodo === 'GET') {
      const yo = quien(tokenDe(req));
      json(res, 200, { jarvis: true, vinculado: !!yo, nombre: yo ? yo.nombre : undefined, pc: { id: idPC(), nombre: os.hostname() }, version: VERSION });
      return;
    }
    if (ruta === '/api/vincular' && metodo === 'POST') {
      if (frenar()) throw conCodigo(429, 'Demasiados intentos. Esperá un minuto.');
      const b = await leerCuerpo(req);
      json(res, 200, vincular(b.codigo, b.nombre));
      return;
    }
    // Ver un clip o su miniatura: el enlace (al azar, vence en 3 h) lo da /api/clips a un aparato vinculado.
    const m = /^\/api\/(archivo|miniatura)\/([a-f0-9]{24})(?:\/[^/]*)?$/.exec(ruta);
    if (m && (metodo === 'GET' || metodo === 'HEAD')) {
      const e = enlace(m[2]);
      if (!e || !leer().dispositivos.some((d) => d.id === e.id)) { if (frenar()) { res.writeHead(429, SEGURIDAD); res.end(); return; } res.writeHead(404, SEGURIDAD); res.end(); return; }
      if (m[1] === 'archivo') { servirArchivo(req, res, e.archivo, { 'Cache-Control': 'private, max-age=3600' }); return; }
      const dato = String(await puente.miniatura(e.archivo) || '');
      const b64 = /^data:image\/jpeg;base64,(.+)$/.exec(dato);
      if (!b64) { res.writeHead(404, SEGURIDAD); res.end(); return; }
      const jpg = Buffer.from(b64[1], 'base64');
      res.writeHead(200, { ...SEGURIDAD, 'Content-Type': 'image/jpeg', 'Content-Length': jpg.length, 'Cache-Control': 'private, max-age=86400' });
      res.end(req.method === 'HEAD' ? undefined : jpg);
      return;
    }

    const yo = quien(tokenDe(req));
    if (!yo) { if (frenar()) throw conCodigo(429, 'Demasiados intentos. Esperá un minuto.'); throw conCodigo(401, 'Este celular no está vinculado (o lo desvinculaste desde la PC).'); }
    marcarUso(yo.id);

    if (ruta === '/api/estado' && metodo === 'GET') { json(res, 200, { ...puente.estado(), yo: { id: yo.id, nombre: yo.nombre }, novedad: numero }); return; }
    if (ruta === '/api/novedades' && metodo === 'GET') {
      const desde = Number(url.searchParams.get('desde')) || 0;
      const ya = novedadesDesde(desde);
      if (ya.length || desde > numero) { json(res, 200, { hasta: numero, eventos: ya }); return; }
      await new Promise((listo) => {
        const fin = () => { esperando.delete(fin); clearTimeout(reloj); listo(); };
        const reloj = setTimeout(fin, 25000);
        esperando.add(fin);
        req.on('close', fin);
      });
      if (!res.writableEnded && !res.destroyed) json(res, 200, { hasta: numero, eventos: novedadesDesde(desde) });
      return;
    }
    if (ruta === '/api/texto' && metodo === 'POST') {
      const b = await leerCuerpo(req);
      const texto = String(b.texto || '').trim().slice(0, 2000);
      if (!texto) throw conCodigo(400, 'Escribí algo.');
      json(res, 200, await puente.texto(texto, { id: yo.id, nombre: yo.nombre }));
      return;
    }
    if (ruta === '/api/accion' && metodo === 'POST') {
      const b = await leerCuerpo(req);
      if (!ACCIONES.has(b.tipo)) throw conCodigo(400, 'Acción desconocida.');
      json(res, 200, { texto: String(await puente.accion(b, { id: yo.id, nombre: yo.nombre }) || 'Listo.') });
      return;
    }
    // Notas, calendario, rutinas e historial: los mismos pedidos que usa Ajustes en la PC (la lista de permitidos vive en main.js).
    if (ruta === '/api/pc' && metodo === 'POST') {
      const b = await leerCuerpo(req, MAX_CUERPO_PC);
      const canal = String(b.canal || '');
      if (!/^[a-z-]+:[a-z-]+$/.test(canal)) throw conCodigo(400, 'Pedido desconocido.');
      const dato = await puente.pc(canal, Array.isArray(b.args) ? b.args : [], { id: yo.id, nombre: yo.nombre });
      json(res, 200, { dato: dato === undefined ? null : dato });
      return;
    }
    if (ruta === '/api/inicio' && metodo === 'GET') { json(res, 200, await puente.inicio(yo)); return; }
    if (ruta === '/api/avisos' && metodo === 'GET') { json(res, 200, { avisos: puente.avisos(yo) || [], ahora: Date.now() }); return; }
    if (ruta === '/api/clips' && metodo === 'GET') { json(res, 200, { clips: LISTA_ARCHIVOS(yo).filter((a) => a.tipo === 'clip').slice(0, 30) }); return; }
    if (ruta === '/api/archivos' && metodo === 'GET') { json(res, 200, { archivos: LISTA_ARCHIVOS(yo) }); return; }
    if ((ruta === '/api/clips/enviar' || ruta === '/api/archivos/enviar') && metodo === 'POST') {
      const b = await leerCuerpo(req);
      const e = enlace(b.id);
      if (!e || e.id !== yo.id) throw conCodigo(404, 'Ese archivo ya no está en la lista: actualizala.');
      const contacto = String(b.contacto || '').trim().slice(0, 80);
      if (!contacto) throw conCodigo(400, 'Elegí a quién mandárselo.');
      json(res, 200, { texto: String(await puente.enviarArchivo(e.archivo, contacto) || 'Listo.') });
      return;
    }
    // Recortar un clip de la PC (lo hace la PC con ffmpeg; queda como un clip nuevo al lado del original).
    if (ruta === '/api/archivos/recortar' && metodo === 'POST') {
      const b = await leerCuerpo(req);
      const e = enlace(b.id);
      if (!e || e.id !== yo.id) throw conCodigo(404, 'Ese archivo ya no está en la lista: actualizala.');
      const desde = Number(b.desde); const hasta = Number(b.hasta);
      if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta - desde < 0.5) throw conCodigo(400, 'Elegí un tramo de al menos medio segundo.');
      json(res, 200, { texto: String(await puente.recortar(e.archivo, { desde, hasta }) || 'Listo.') });
      return;
    }
    // Descargar con yt-dlp en la PC: para dejarlo en la PC o para que el celular se lo lleve.
    if (ruta === '/api/descargas' && metodo === 'POST') {
      const b = await leerCuerpo(req);
      const url = String(b.url || '').trim().slice(0, 2000);
      if (!url) throw conCodigo(400, 'Pegá el link del video.');
      const para = b.para === 'celular' ? 'celular' : 'pc';
      const carpeta = para === 'celular' ? path.join(TEMP_DESCARGAS(), `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`) : '';
      const r = await puente.descargar({ url, modo: b.modo === 'audio' ? 'audio' : 'video', calidad: String(b.calidad || ''), para, carpeta }, { id: yo.id, nombre: yo.nombre });
      misDescargas.set(r.id, { dispositivo: yo.id, para, carpeta });
      json(res, 200, r);
      return;
    }
    if (ruta === '/api/descargas' && metodo === 'GET') {
      const lista = [];
      for (const [id, m] of misDescargas) {
        if (m.dispositivo !== yo.id) continue;
        const d = puente.descarga(id);
        if (!d) continue;
        const listo = d.estado === 'listo' && d.archivo && fs.existsSync(d.archivo);
        const x = { id, estado: d.estado, pct: d.pct || 0, nombre: d.nombre || '', modo: d.modo, para: m.para, error: d.error || '' };
        if (listo) {
          x.bytes = fs.statSync(d.archivo).size;
          x.archivo = path.basename(d.archivo);
          if (m.para === 'celular') x.bajar = `/api/archivo/${enlazar(d.archivo, yo.id)}/${encodeURIComponent(x.archivo)}`;
        }
        lista.push(x);
      }
      json(res, 200, { descargas: lista.sort((a, b) => b.id - a.id) });
      return;
    }
    if (ruta === '/api/descargas/recibido' && metodo === 'POST') {
      const b = await leerCuerpo(req);
      const m = misDescargas.get(Number(b.id));
      if (!m || m.dispositivo !== yo.id) throw conCodigo(404, 'Esa descarga no es de este celular.');
      if (m.para === 'celular') borrarCarpetaTemporal(m.carpeta);
      misDescargas.delete(Number(b.id));
      json(res, 200, { ok: true });
      return;
    }
    // El celular sube un archivo suyo: para guardarlo en la PC o para que la PC lo mande por WhatsApp.
    if (ruta === '/api/subir' && metodo === 'POST') {
      const destino = url.searchParams.get('destino') === 'pc' ? 'pc' : 'enviar';
      const contacto = String(url.searchParams.get('contacto') || '').trim().slice(0, 80);
      if (destino === 'enviar' && !contacto) { req.resume(); throw conCodigo(400, 'Elegí a quién mandárselo.'); }
      const nombre = nombreSubido(url.searchParams.get('nombre'));
      const carpeta = path.join(TEMP_SUBIDAS(), `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
      const { ruta: subido } = await recibirArchivo(req, carpeta, nombre);
      try {
        const texto = destino === 'pc' ? await puente.guardarSubida(subido, nombre) : await puente.enviarArchivo(subido, contacto);
        json(res, 200, { texto: String(texto || 'Listo.') });
      } finally { borrarCarpetaTemporal(carpeta); }
      return;
    }
    if (ruta === '/api/desvincular' && metodo === 'POST') { revocar(yo.id); json(res, 200, { ok: true }); return; }
    throw conCodigo(404, 'No existe.');
  } catch (e) {
    // Lo que no se pudo hacer (WhatsApp desconectado, sin clips…) no es una falla del servidor: ya queda en el Historial.
    const status = e.status || 422;
    if (!res.headersSent) json(res, status, { error: e.message || 'Algo falló.' });
    else res.end();
  }
}
function tokenDe(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  return m ? m[1] : '';
}

// ---------- Prender / apagar ----------
let servidor = null;
let puertoReal = 0;
async function iniciar(puerto = PUERTO) {
  if (servidor) return puertoReal;
  const s = http.createServer((req, res) => { atender(req, res).catch(() => { try { res.destroy(); } catch {} }); });
  s.keepAliveTimeout = 30000;
  s.requestTimeout = 0; // las esperas largas (/api/novedades, un pedido que piensa) las corta cada ruta
  await new Promise((ok, mal) => { s.once('error', mal); s.listen(puerto, '127.0.0.1', () => { s.removeListener('error', mal); ok(); }); });
  servidor = s;
  puertoReal = s.address().port;
  limpiarTemporales();
  return puertoReal;
}
// Modo casa: el mismo servidor, en la red local. Se prende y apaga aparte (Ajustes → Celular → En casa).
let servidorCasa = null;
let puertoCasaReal = 0;
async function iniciarCasa(puerto = PUERTO_CASA, anfitrion = '0.0.0.0') {
  if (servidorCasa) return puertoCasaReal;
  const s = http.createServer((req, res) => { atender(req, res, { casa: true }).catch(() => { try { res.destroy(); } catch {} }); });
  s.keepAliveTimeout = 30000;
  s.requestTimeout = 0;
  await new Promise((ok, mal) => { s.once('error', mal); s.listen(puerto, anfitrion, () => { s.removeListener('error', mal); ok(); }); });
  servidorCasa = s;
  puertoCasaReal = s.address().port;
  idPC();
  return puertoCasaReal;
}
async function detenerCasa() {
  if (!servidorCasa) return;
  const s = servidorCasa; servidorCasa = null; puertoCasaReal = 0;
  await new Promise((ok) => { s.close(() => ok()); if (s.closeAllConnections) s.closeAllConnections(); });
}
const puertoCasa = () => puertoCasaReal;

async function detener() {
  if (!servidor) return;
  const s = servidor; servidor = null; puertoReal = 0;
  for (const listo of [...esperando]) listo();
  await new Promise((ok) => { s.close(() => ok()); if (s.closeAllConnections) s.closeAllConnections(); });
  await detenerCasa();
}
const puerto = () => puertoReal;

// ---------- Tailscale ----------
// Solo se usa el programa de Tailscale de la PC (gratis). Se busca en el PATH y en su carpeta de siempre.
function exeTailscale() {
  if (process.env.JARVIS_TAILSCALE) return process.env.JARVIS_TAILSCALE;
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files']) {
      if (!base) continue;
      const r = path.join(base, 'Tailscale', 'tailscale.exe');
      if (fs.existsSync(r)) return r;
    }
  }
  return 'tailscale';
}
function correrTailscale(args, espera = 8000) {
  return new Promise((ok) => {
    execFile(exeTailscale(), args, { timeout: espera, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, salida, err) => {
      ok({ error, salida: String(salida || ''), err: String(err || ''), codigo: error ? (error.code === 'ENOENT' ? 'ENOENT' : error.killed ? 'TIEMPO' : error.code) : 0 });
    });
  });
}
const BASE_URL = (nombre, https) => `https://${nombre}${Number(https) && Number(https) !== 443 ? `:${https}` : ''}`;
// ¿Está instalado y conectado? ¿Cómo se llama esta PC en la red de Tailscale? ¿Ya está publicado Jarvis?
async function estadoTailscale(httpsPuerto = 443) {
  const st = await correrTailscale(['status', '--json']);
  if (st.codigo === 'ENOENT') return { instalado: false, conectado: false, texto: 'Tailscale no está instalado en esta PC.' };
  let j = null;
  try { j = JSON.parse(st.salida); } catch {}
  if (!j) return { instalado: true, conectado: false, texto: (st.err || st.salida || 'Tailscale no contestó.').trim().slice(0, 200) };
  const self = j.Self || {};
  const nombre = String(self.DNSName || '').replace(/\.$/, '');
  const conectado = j.BackendState === 'Running' && !!nombre;
  const out = { instalado: true, conectado, nombre, ip: (self.TailscaleIPs || [])[0] || '', estado: j.BackendState || '', url: nombre ? BASE_URL(nombre, httpsPuerto) : '', publicado: false };
  if (!conectado) { out.texto = j.BackendState === 'NeedsLogin' ? 'Tailscale está instalado pero no iniciaste sesión.' : `Tailscale no está conectado (${j.BackendState || 'sin estado'}).`; return out; }
  const sv = await correrTailscale(['serve', 'status', '--json']);
  try {
    const cfgServe = JSON.parse(sv.salida || '{}');
    const web = (cfgServe.Web || {})[`${nombre}:${httpsPuerto}`];
    const proxy = web && web.Handlers && web.Handlers['/'] && web.Handlers['/'].Proxy;
    out.publicado = !!proxy && /(127\.0\.0\.1|localhost):\d+/.test(proxy) && proxy.endsWith(`:${puertoReal || PUERTO}`);
    out.proxy = proxy || '';
  } catch {}
  return out;
}
// "tailscale serve --bg --https=443 http://127.0.0.1:47820": queda andando aunque se reinicie la PC.
// Si el HTTPS no está habilitado en la cuenta de Tailscale, el programa devuelve un enlace para habilitarlo.
async function publicarEnTailscale(httpsPuerto = 443) {
  const p = puertoReal || PUERTO;
  const args = ['serve', '--bg', '--yes', `--https=${httpsPuerto}`, `http://127.0.0.1:${p}`];
  let r = await correrTailscale(args, 25000);
  if (/flag provided but not defined: -yes/.test(`${r.salida}${r.err}`)) r = await correrTailscale(args.filter((x) => x !== '--yes'), 25000); // versiones viejas
  const todo = `${r.salida}\n${r.err}`;
  const enlaceHabilitar = (/(https:\/\/login\.tailscale\.com\/\S+)/.exec(todo) || [])[1];
  if (r.codigo === 'ENOENT') return { ok: false, texto: 'Tailscale no está instalado en esta PC.' };
  if (enlaceHabilitar) return { ok: false, habilitar: enlaceHabilitar.replace(/[.)]+$/, ''), texto: 'Falta habilitar HTTPS en tu cuenta de Tailscale (una sola vez). Abrí el enlace, tocá "Enable" y volvé a probar.' };
  if (r.codigo) {
    const acceso = /access denied|permission|operator|Access is denied/i.test(todo);
    return { ok: false, comando: comandoServe(httpsPuerto), texto: acceso ? 'Windows no dejó que Jarvis configure Tailscale. Pegá el comando en una terminal de administrador (una sola vez).' : `Tailscale contestó: ${todo.trim().slice(0, 240) || 'error sin detalle'}` };
  }
  const e = await estadoTailscale(httpsPuerto);
  return { ok: !!e.publicado, texto: e.publicado ? `Listo: Jarvis se abre en ${e.url}` : 'Tailscale aceptó el pedido pero no veo la publicación todavía. Probá "Revisar" en unos segundos.', estado: e, comando: e.publicado ? undefined : comandoServe(httpsPuerto) };
}
const comandoServe = (httpsPuerto = 443) => `tailscale serve --bg --https=${httpsPuerto} http://127.0.0.1:${puertoReal || PUERTO}`;
async function despublicarDeTailscale(httpsPuerto = 443) {
  const r = await correrTailscale(['serve', `--https=${httpsPuerto}`, 'off'], 15000);
  return { ok: !r.codigo, texto: r.codigo ? (r.err || r.salida || 'No pude.').trim().slice(0, 200) : 'Listo, Jarvis ya no se publica por Tailscale.' };
}

module.exports = {
  configurar, iniciar, detener, puerto, publicar, iniciarCasa, detenerCasa, puertoCasa, ipsCasa, idPC, PUERTO_CASA,
  nuevoCodigo, cancelarCodigo, codigoVigente, vincular, revocar, renombrar, dispositivos: publicos,
  estadoTailscale, publicarEnTailscale, despublicarDeTailscale, comandoServe,
  limpiarTemporales, TEMP_DESCARGAS, TEMP_SUBIDAS, _nombreSubido: nombreSubido, _anfitrionValido: anfitrionValido, _anfitrionCasa: anfitrionCasa, _esPrivada: esPrivada, _hashDe: hashDe, PUERTO,
};
