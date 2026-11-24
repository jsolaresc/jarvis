// Dos servidores locales:
//  - el de la interfaz (solo 127.0.0.1): sirve el notch, los ajustes, onnxruntime y los modelos;
//  - el de medios (red local, solo cuando se usa): sirve a la tele los archivos que se le mandan.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { RAIZ } = require('./config');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
};
const tipoDe = (archivo) => TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream';

const CARPETAS = [
  ['/vendor/ort/', path.join(RAIZ, 'node_modules', 'onnxruntime-web', 'dist')],
  ['/modelos/', path.join(RAIZ, 'modelos')],
  ['/', path.join(RAIZ, 'src', 'ui')],
];

// Lecturas abiertas por archivo: en Windows un archivo con una lectura abierta no se puede reemplazar ni renombrar.
const lecturas = new Set(); // { archivo, flujo }
function leer(res, archivo, opciones) {
  const flujo = fs.createReadStream(archivo, opciones);
  const marca = { archivo: path.resolve(archivo).toLowerCase(), flujo };
  lecturas.add(marca);
  const cerrar = () => { lecturas.delete(marca); flujo.destroy(); };
  flujo.on('close', () => lecturas.delete(marca));
  flujo.on('error', () => { cerrar(); res.destroy(); });
  res.on('close', cerrar); // el reproductor corta pedidos todo el tiempo: sin esto la lectura quedaba abierta
  flujo.pipe(res);
}
// Cierra todas las lecturas de un archivo (antes de reemplazarlo o renombrarlo).
function soltar(archivo) {
  const clave = path.resolve(archivo).toLowerCase();
  let n = 0;
  for (const m of [...lecturas]) if (m.archivo === clave) { m.flujo.destroy(); lecturas.delete(m); n++; }
  return n;
}

function servirArchivo(req, res, archivo) {
  fs.stat(archivo, (error, info) => {
    if (error || !info.isFile()) { res.writeHead(404); res.end('No encontrado'); return; }
    const cabeceras = { 'Content-Type': tipoDe(archivo), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
    const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (rango && (rango[1] || rango[2])) {
      let inicio = rango[1] ? parseInt(rango[1], 10) : info.size - parseInt(rango[2], 10);
      let fin = rango[1] && rango[2] ? parseInt(rango[2], 10) : info.size - 1;
      inicio = Math.max(0, inicio); fin = Math.min(fin, info.size - 1);
      if (inicio > fin) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
      res.writeHead(206, { ...cabeceras, 'Content-Range': `bytes ${inicio}-${fin}/${info.size}`, 'Content-Length': fin - inicio + 1 });
      if (req.method === 'HEAD') { res.end(); return; }
      leer(res, archivo, { start: inicio, end: fin });
    } else {
      res.writeHead(200, { ...cabeceras, 'Content-Length': info.size });
      if (req.method === 'HEAD') { res.end(); return; }
      leer(res, archivo);
    }
  });
}

function escucharEn(servidor, puerto, anfitrion, intentos = 20) {
  return new Promise((resolver, rechazar) => {
    const probar = (p, quedan) => {
      servidor.once('error', (e) => {
        if (e.code === 'EADDRINUSE' && quedan > 0) probar(p + 1, quedan - 1); else rechazar(e);
      });
      servidor.listen(p, anfitrion, () => { servidor.removeAllListeners('error'); resolver(servidor.address().port); });
    };
    probar(puerto, intentos);
  });
}

// Videos que la ventana de Ajustes puede reproducir (el editor de clips): solo por la interfaz local (127.0.0.1) y con un código al azar.
const locales = new Map(); // código -> ruta de archivo
let urlInterfaz = '';
function compartirLocal(archivo) {
  if (!urlInterfaz) throw new Error('El servidor local todavía no arrancó.');
  const codigo = crypto.randomBytes(12).toString('hex');
  locales.set(codigo, archivo);
  if (locales.size > 20) locales.delete(locales.keys().next().value);
  return `${urlInterfaz}/v/${codigo}/${encodeURIComponent(path.basename(archivo))}`;
}

async function iniciarInterfaz(puerto = 47800) {
  const servidor = http.createServer((req, res) => {
    let ruta;
    try { ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
    if (ruta.startsWith('/v/')) { const a = locales.get(ruta.split('/')[2]); if (!a) { res.writeHead(404); res.end(); return; } servirArchivo(req, res, a); return; }
    if (ruta === '/') ruta = '/notch.html';
    for (const [prefijo, carpeta] of CARPETAS) {
      if (!ruta.startsWith(prefijo)) continue;
      const archivo = path.join(carpeta, ruta.slice(prefijo.length));
      if (!archivo.startsWith(carpeta)) break; // nada de salir de la carpeta con ../
      servirArchivo(req, res, archivo);
      return;
    }
    res.writeHead(404); res.end('No encontrado');
  });
  const real = await escucharEn(servidor, puerto, '127.0.0.1');
  urlInterfaz = `http://127.0.0.1:${real}`;
  return { url: urlInterfaz, cerrar: () => servidor.close() };
}

// ---- Medios para la tele ----
const compartidos = new Map(); // token -> ruta de archivo
let servidorMedios = null;
let puertoMedios = 0;

async function asegurarMedios() {
  if (servidorMedios) return puertoMedios;
  servidorMedios = http.createServer((req, res) => {
    const partes = new URL(req.url, 'http://x').pathname.split('/'); // /m/<token>/<nombre>
    const archivo = partes[1] === 'm' ? compartidos.get(partes[2]) : null;
    if (!archivo) { res.writeHead(404); res.end(); return; }
    servirArchivo(req, res, archivo);
  });
  puertoMedios = await escucharEn(servidorMedios, 47810, '0.0.0.0');
  return puertoMedios;
}

// La IP de esta PC que está en la misma red que la tele.
function ipLocalPara(ipDestino) {
  const candidatas = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) candidatas.push(i);
  }
  const aNumero = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
  if (ipDestino && /^\d+\.\d+\.\d+\.\d+$/.test(ipDestino)) {
    const misma = candidatas.find((i) => {
      const mascara = aNumero(i.netmask);
      return (aNumero(i.address) & mascara) === (aNumero(ipDestino) & mascara);
    });
    if (misma) return misma.address;
  }
  return candidatas[0] ? candidatas[0].address : '127.0.0.1';
}

// Devuelve una URL que la tele puede abrir para leer un archivo de esta PC.
async function compartirArchivo(archivo, ipTele) {
  if (!fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) throw new Error(`No encuentro el archivo: ${archivo}`);
  const puerto = await asegurarMedios();
  const token = crypto.randomBytes(12).toString('hex');
  compartidos.set(token, archivo);
  if (compartidos.size > 30) compartidos.delete(compartidos.keys().next().value);
  const nombre = encodeURIComponent(path.basename(archivo));
  return { url: `http://${ipLocalPara(ipTele)}:${puerto}/m/${token}/${nombre}`, tipo: tipoDe(archivo) };
}

module.exports = { soltar, _lecturasAbiertas: () => lecturas.size, iniciarInterfaz, compartirLocal, compartirArchivo, tipoDe, ipLocalPara };
