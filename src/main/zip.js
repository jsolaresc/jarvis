// Zip mínimo (sin dependencias): sirve para pasar una voz o un respaldo de grabaciones de una PC a otra.
// Escribe con deflate (zlib) y lee lo que escribe (y cualquier .zip común sin cifrar ni Zip64).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX = 0xFFFFFFFF; // sin Zip64: cada archivo y el total tienen que entrar en 4 GB

function crc32(buf) { return zlib.crc32 ? zlib.crc32(buf) >>> 0 : tabla(buf); }
let TABLA = null;
function tabla(buf) {
  if (!TABLA) { TABLA = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLA[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function fechaDos(d = new Date()) {
  return { hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

// archivos: [{ nombre: 'carpeta/archivo.ext', ruta?: '/ruta/en/disco', datos?: Buffer }]. Devuelve { archivos, bytes }.
function escribirZip(destino, archivos) {
  const tmp = `${destino}.parte`;
  const fd = fs.openSync(tmp, 'w');
  const central = []; let pos = 0; const { hora, dia } = fechaDos();
  const escribir = (b) => { fs.writeSync(fd, b); pos += b.length; };
  try {
    for (const a of archivos) {
      const nombre = Buffer.from(String(a.nombre).replace(/\\/g, '/').replace(/^\/+/, ''), 'utf8');
      const datos = a.datos || fs.readFileSync(a.ruta);
      if (datos.length > MAX) throw new Error(`"${a.nombre}" es demasiado grande para un zip (más de 4 GB).`);
      const crc = crc32(datos);
      const yaComprimido = /\.(mp3|m4a|ogg|opus|zip|webm)$/i.test(a.nombre);
      const comp = yaComprimido || datos.length < 64 ? null : zlib.deflateRawSync(datos, { level: 6 });
      const usar = comp && comp.length < datos.length ? comp : datos; const metodo = usar === datos ? 0 : 8;
      const cab = Buffer.alloc(30);
      cab.writeUInt32LE(0x04034b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(0x0800, 6); cab.writeUInt16LE(metodo, 8);
      cab.writeUInt16LE(hora, 10); cab.writeUInt16LE(dia, 12); cab.writeUInt32LE(crc, 14); cab.writeUInt32LE(usar.length, 18); cab.writeUInt32LE(datos.length, 22);
      cab.writeUInt16LE(nombre.length, 26); cab.writeUInt16LE(0, 28);
      const inicio = pos;
      escribir(cab); escribir(nombre); escribir(usar);
      central.push({ nombre, crc, metodo, comprimido: usar.length, tam: datos.length, inicio });
    }
    const iniCentral = pos;
    for (const c of central) {
      const e = Buffer.alloc(46);
      e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt16LE(0x0800, 8); e.writeUInt16LE(c.metodo, 10);
      e.writeUInt16LE(hora, 12); e.writeUInt16LE(dia, 14); e.writeUInt32LE(c.crc, 16); e.writeUInt32LE(c.comprimido, 20); e.writeUInt32LE(c.tam, 24);
      e.writeUInt16LE(c.nombre.length, 28); e.writeUInt32LE(c.inicio, 42);
      escribir(e); escribir(c.nombre);
    }
    const tamCentral = pos - iniCentral;
    if (central.length > 0xFFFF || pos > MAX) throw new Error('Son demasiados archivos o pesan más de 4 GB: no entran en un solo zip.');
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(central.length, 8); fin.writeUInt16LE(central.length, 10); fin.writeUInt32LE(tamCentral, 12); fin.writeUInt32LE(iniCentral, 16);
    escribir(fin);
    fs.closeSync(fd);
    fs.renameSync(tmp, destino);
    return { archivos: central.length, bytes: pos };
  } catch (e) { try { fs.closeSync(fd); } catch {} try { fs.rmSync(tmp, { force: true }); } catch {} throw e; }
}

// Lista las entradas: [{ nombre, tam, metodo, comprimido, inicio, crc }]
function leerZip(ruta) {
  const fd = fs.openSync(ruta, 'r');
  try {
    const total = fs.fstatSync(fd).size;
    const lee = (pos, largo) => { const b = Buffer.alloc(largo); fs.readSync(fd, b, 0, largo, pos); return b; };
    const cola = lee(Math.max(0, total - 66000), Math.min(total, 66000));
    let i = cola.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (i < 0) throw new Error('Ese archivo no parece un zip.');
    const n = cola.readUInt16LE(i + 10); const tamCentral = cola.readUInt32LE(i + 12); const iniCentral = cola.readUInt32LE(i + 16);
    if (n === 0xFFFF || iniCentral === 0xFFFFFFFF) throw new Error('Ese zip es demasiado grande (Zip64).');
    const c = lee(iniCentral, tamCentral); const entradas = []; let p = 0;
    for (let k = 0; k < n; k++) {
      if (c.readUInt32LE(p) !== 0x02014b50) throw new Error('El zip está dañado.');
      const flags = c.readUInt16LE(p + 8); const largoN = c.readUInt16LE(p + 28); const extra = c.readUInt16LE(p + 30); const coment = c.readUInt16LE(p + 32);
      if (flags & 1) throw new Error('El zip tiene contraseña: no lo puedo abrir.');
      entradas.push({ nombre: c.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + largoN), metodo: c.readUInt16LE(p + 10), crc: c.readUInt32LE(p + 16), comprimido: c.readUInt32LE(p + 20), tam: c.readUInt32LE(p + 24), inicio: c.readUInt32LE(p + 42) });
      p += 46 + largoN + extra + coment;
    }
    return { entradas, leer: (e) => datosDe(fd, e) };
  } catch (e) { fs.closeSync(fd); throw e; }
}
function datosDe(fd, e) {
  const cab = Buffer.alloc(30); fs.readSync(fd, cab, 0, 30, e.inicio);
  if (cab.readUInt32LE(0) !== 0x04034b50) throw new Error('El zip está dañado.');
  const ini = e.inicio + 30 + cab.readUInt16LE(26) + cab.readUInt16LE(28);
  const crudo = Buffer.alloc(e.comprimido); fs.readSync(fd, crudo, 0, e.comprimido, ini);
  const datos = e.metodo === 0 ? crudo : e.metodo === 8 ? zlib.inflateRawSync(crudo) : null;
  if (!datos) throw new Error('El zip usa una compresión que no conozco.');
  if (datos.length !== e.tam || crc32(datos) !== e.crc) throw new Error(`"${e.nombre}" está dañado dentro del zip.`);
  return datos;
}
// Abre el zip, llama a `fn(zip)` y lo cierra siempre. zip = { entradas, leer(entrada) -> Buffer }.
function conZip(ruta, fn) {
  const z = leerZip(ruta); const fd = fs.openSync(ruta, 'r');
  try { return fn({ entradas: z.entradas, leer: (e) => datosDe(fd, e) }); } finally { fs.closeSync(fd); }
}
// Nombre seguro para extraer dentro de `base` (sin salir de la carpeta). Devuelve la ruta o null.
function rutaSegura(base, nombre) {
  const n = String(nombre).replace(/\\/g, '/');
  if (!n || n.endsWith('/') || n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n.split('/').some((x) => x === '..' || x === '')) return null;
  const r = path.resolve(base, n);
  return r.startsWith(path.resolve(base) + path.sep) ? r : null;
}

module.exports = { escribirZip, conZip, rutaSegura, crc32 };
