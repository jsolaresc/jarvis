// Información de la copia de Jarvis que está corriendo: versión, fecha del release, cómo está instalada y cuánto ocupa.
// Se muestra en Ajustes → Sistema → Información (junto con el botón para actualizar).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron'); // (en las pruebas sin ventana esto no existe: se usa package.json)
const edicion = require('./edicion');

// La fecha y el commit los escribe la publicación automática (.github/workflows/publicar.yml) en version.json antes de armar el instalador.
// Sin ese archivo (copia armada a mano) se usa la fecha del programa.
function release() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8'));
    if (v && v.fecha && !Number.isNaN(Date.parse(v.fecha))) return { fecha: new Date(v.fecha).toISOString(), commit: String(v.commit || '').slice(0, 7) };
  } catch {}
  try { return { fecha: fs.statSync(path.join(__dirname, '..', '..', 'package.json')).mtime.toISOString(), commit: '' }; } catch {}
  return { fecha: '', commit: '' };
}

const tipoDeCopia = () => (edicion.PORTABLE ? 'portable' : edicion.INSTALADO ? 'instalada' : 'codigo');

// Dónde está el programa: la carpeta de la instalación, el exe portable o la carpeta del código.
function programaEn() {
  if (edicion.PORTABLE) return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  if (edicion.INSTALADO) return path.dirname(process.execPath);
  return path.join(__dirname, '..', '..');
}

function leer() {
  const r = release();
  return {
    version: app && app.getVersion ? app.getVersion() : require('../../package.json').version, fecha: r.fecha, commit: r.commit, copia: tipoDeCopia(), programa: programaEn(),
    electron: process.versions.electron || '', chromium: process.versions.chrome || '', node: process.versions.node || '',
    sistema: `${os.type() === 'Windows_NT' ? 'Windows' : os.type()} ${os.release()} (${os.arch()})`,
  };
}

// Cuánto ocupa: el programa y los datos (configuración, voces y modelos). Los clips y las descargas están aparte, en tu carpeta de videos.
async function tamanos() {
  const { pesoDe } = require('./almacenamiento');
  const { DATOS } = require('./config');
  let programa = { bytes: 0, completo: true, sinDato: false };
  if (edicion.PORTABLE) { try { programa = { bytes: fs.statSync(process.env.PORTABLE_EXECUTABLE_FILE).size, completo: true, sinDato: false }; } catch { programa.sinDato = true; } }
  else if (edicion.INSTALADO) programa = { ...(await pesoDe(path.dirname(process.execPath), 15000)), sinDato: false };
  else programa.sinDato = true; // corriendo desde el código: node_modules y compañía no son "Jarvis"
  const datos = await pesoDe(DATOS, 15000);
  let libre = null;
  try { const s = await fs.promises.statfs(DATOS); libre = Number(s.bavail) * Number(s.bsize); } catch {}
  return { programa: programa.bytes, programaSinDato: programa.sinDato, datos: datos.bytes, total: programa.bytes + datos.bytes, completo: programa.completo !== false && datos.completo !== false, libre, carpetaDatos: DATOS };
}

module.exports = { leer, tamanos, release };
