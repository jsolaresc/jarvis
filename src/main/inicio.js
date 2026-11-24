// "Iniciar con Windows": limpieza de entradas viejas o rotas en el registro (HKCU\...\Run).
// Una versión anterior registró el arranque con la carpeta del proyecto entre comillas de más
// (electron.exe ""F:\...\Jarvis""), y Windows mostraba "Unable to find Electron app" al iniciar.
const { execFile } = require('child_process');

const CLAVE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

// Lee la salida de `reg query` y devuelve las entradas {nombre, dato}.
function leerEntradas(salida) {
  const entradas = [];
  for (const linea of String(salida).split(/\r?\n/)) {
    const m = linea.match(/^\s+(.+?)\s{2,}REG_(?:EXPAND_)?SZ\s{2,}(.*?)\s*$/);
    if (m) entradas.push({ nombre: m[1], dato: m[2] });
  }
  return entradas;
}

// Las que lanzan electron.exe (el motor de desarrollo, no el Jarvis.exe empaquetado) apuntando a algo de Jarvis,
// o con comillas dobles pegadas ("" o \") en el argumento: son las que fallan al arrancar Windows.
function entradasRotas(entradas) {
  return entradas.filter(({ dato }) => /jarvis/i.test(dato) && (/(^|[\\/"])electron\.exe/i.test(dato) || /""|\\"/.test(dato)));
}

function correr(args) {
  return new Promise((ok) => execFile('reg', args, { windowsHide: true, timeout: 8000 }, (e, salida) => ok(e ? '' : String(salida))));
}

async function limpiarEntradasRotas() {
  if (process.platform !== 'win32') return [];
  const rotas = entradasRotas(leerEntradas(await correr(['query', CLAVE])));
  for (const { nombre } of rotas) {
    await correr(['delete', CLAVE, '/v', nombre, '/f']);
    // Windows recuerda además si el usuario la había habilitado o no (Administrador de tareas → Inicio).
    await correr(['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', '/v', nombre, '/f']);
  }
  return rotas.map((r) => r.nombre);
}

module.exports = { leerEntradas, entradasRotas, limpiarEntradasRotas };
