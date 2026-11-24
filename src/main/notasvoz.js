// Notas de voz: la grabadora del panel del notch las manda acá (WAV) y se guardan en "Notas de voz", dentro de la carpeta de clips.
// Si ffmpeg ya está instalado (lo bajan los clips) se pasan a .m4a, que pesa 20 veces menos; si no, quedan en .wav (suena en cualquier lado).
const fs = require('fs');
const path = require('path');
const { leerConfig, leerJSON, guardarJSON } = require('./config');
const clips = require('./clips');

const INDICE = 'notas-voz.json'; // { 'nombre.m4a': segundos }
const EXTENSIONES = new Set(['.wav', '.m4a', '.mp3', '.ogg', '.opus', '.webm']);

function carpeta() {
  const c = leerConfig();
  const propia = String((c.notasVoz || {}).carpeta || '').trim();
  return propia || path.join((c.clips || {}).carpeta || path.join(require('os').homedir(), 'Captures'), 'Notas de voz');
}
const dentroDeCarpeta = (archivo) => {
  const raiz = path.resolve(carpeta()) + path.sep;
  const ruta = path.resolve(String(archivo || ''));
  return ruta.startsWith(raiz) && EXTENSIONES.has(path.extname(ruta).toLowerCase());
};
const dos = (n) => String(n).padStart(2, '0');
function nombreNuevo(fecha = new Date()) {
  return `Nota de voz ${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())} ${dos(fecha.getHours())}.${dos(fecha.getMinutes())}.${dos(fecha.getSeconds())}`;
}
function sinChocar(dir, base, ext) {
  let n = 0; let nombre = `${base}${ext}`;
  while (fs.existsSync(path.join(dir, nombre))) nombre = `${base} (${++n})${ext}`;
  return nombre;
}
function anotar(nombre, segundos) {
  const i = leerJSON(INDICE, {});
  i[nombre] = Math.round(segundos * 10) / 10;
  guardarJSON(INDICE, i);
}

// bytes: el WAV que grabó el notch. Devuelve { archivo, nombre, segundos, convertido }.
async function guardar(bytes, { segundos = 0 } = {}) {
  const buf = Buffer.from(bytes);
  if (buf.length < 100) throw new Error('No se grabó nada.');
  const dir = carpeta();
  fs.mkdirSync(dir, { recursive: true });
  const base = nombreNuevo();
  const wav = path.join(dir, sinChocar(dir, base, '.wav'));
  fs.writeFileSync(wav, buf);
  let archivo = wav; let convertido = false;
  const quiereM4a = String((leerConfig().notasVoz || {}).formato || 'm4a') === 'm4a';
  const ffmpeg = quiereM4a ? clips.rutaFfmpeg() : null;
  if (ffmpeg) {
    const salida = path.join(dir, sinChocar(dir, base, '.m4a'));
    try {
      await clips.correrFfmpeg(ffmpeg, ['-y', '-v', 'error', '-i', wav, '-vn', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', salida], { espera: 120000 });
      if (fs.existsSync(salida) && fs.statSync(salida).size > 200) { fs.rmSync(wav, { force: true }); archivo = salida; convertido = true; } else fs.rmSync(salida, { force: true });
    } catch { try { fs.rmSync(salida, { force: true }); } catch {} } // si falla la conversión queda el WAV: no se pierde la nota
  }
  const nombre = path.basename(archivo);
  const seg = segundos || Math.max(0, (buf.length - 44) / (24000 * 2));
  anotar(nombre, seg);
  return { archivo, nombre, segundos: Math.round(seg * 10) / 10, convertido };
}

function listar() {
  const dir = carpeta();
  let nombres = [];
  try { nombres = fs.readdirSync(dir); } catch { return []; }
  const indice = leerJSON(INDICE, {});
  return nombres.filter((n) => EXTENSIONES.has(path.extname(n).toLowerCase())).map((n) => {
    const ruta = path.join(dir, n);
    let st; try { st = fs.statSync(ruta); } catch { return null; }
    return { archivo: ruta, nombre: n, bytes: st.size, fecha: st.mtimeMs, segundos: indice[n] || (path.extname(n).toLowerCase() === '.wav' ? Math.max(0, (st.size - 44) / 48000) : 0) };
  }).filter(Boolean).sort((a, b) => b.fecha - a.fecha);
}

async function aLaPapelera(archivo, papelera) {
  if (!dentroDeCarpeta(archivo)) throw new Error('Esa nota no está en la carpeta de notas de voz.');
  await papelera(archivo);
  const i = leerJSON(INDICE, {}); delete i[path.basename(archivo)]; guardarJSON(INDICE, i);
}

function renombrar(archivo, nuevo) {
  if (!dentroDeCarpeta(archivo)) throw new Error('Esa nota no está en la carpeta de notas de voz.');
  const ext = path.extname(archivo);
  const limpio = String(nuevo || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!limpio || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(limpio)) throw new Error('Ese nombre no sirve.');
  const dir = path.dirname(archivo);
  const destino = path.join(dir, `${limpio}${ext}`);
  if (path.resolve(destino) === path.resolve(archivo)) return destino;
  if (fs.existsSync(destino)) throw new Error('Ya hay una nota con ese nombre.');
  fs.renameSync(archivo, destino);
  const i = leerJSON(INDICE, {});
  if (i[path.basename(archivo)] !== undefined) { i[path.basename(destino)] = i[path.basename(archivo)]; delete i[path.basename(archivo)]; guardarJSON(INDICE, i); }
  return destino;
}

module.exports = { carpeta, guardar, listar, aLaPapelera, renombrar, dentroDeCarpeta, nombreNuevo };
