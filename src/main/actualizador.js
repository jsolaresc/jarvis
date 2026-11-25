// Actualizaciones automáticas (solo en la versión instalada con el instalador de Windows).
// Jarvis mira en GitHub (Releases de este repositorio) si hay una versión nueva; si la hay, la baja en
// segundo plano y la instala cuando se cierra Jarvis (o al tocar "Reiniciar y actualizar" en Ajustes).
// Tus datos no se tocan: viven en %APPDATA%\Jarvis\datos, fuera de la carpeta del programa.
const { app } = require('electron');
const edicion = require('./edicion');

const CADA = 6 * 60 * 60 * 1000; // cada 6 horas
let actualizador = null;
let ganchos = { avisar: () => {}, alCambiar: () => {} };
let e = { fase: 'quieto', actual: '', nueva: '', nuevaFecha: '', progreso: 0, error: '', posible: false, motivo: '', revisado: 0 };

function cambiar(nuevo) { e = { ...e, ...nuevo }; try { ganchos.alCambiar(estado()); } catch {} }
function estado() { return { ...e, actual: app.getVersion() }; }

function iniciar(g = {}) {
  ganchos = { ...ganchos, ...g };
  if (!edicion.INSTALADO) {
    cambiar({ posible: false, motivo: edicion.PORTABLE ? 'Esta copia es portable: para actualizarla, bajá la versión nueva de la página de descargas (o instalá Jarvis con el instalador, que se actualiza solo).' : 'Corriendo desde el código: actualizá con git pull y npm install.' });
    return;
  }
  try {
    ({ autoUpdater: actualizador } = require('electron-updater'));
  } catch (err) {
    cambiar({ posible: false, motivo: `No se pudo cargar el actualizador: ${err.message}` });
    return;
  }
  actualizador.autoDownload = true;
  actualizador.autoInstallOnAppQuit = true;
  actualizador.allowPrerelease = false;
  actualizador.logger = null;
  actualizador.on('checking-for-update', () => cambiar({ fase: 'buscando', error: '' }));
  actualizador.on('update-not-available', () => cambiar({ fase: 'al-dia', nueva: '', nuevaFecha: '', revisado: Date.now() }));
  actualizador.on('update-available', (i) => cambiar({ fase: 'bajando', nueva: (i && i.version) || '', nuevaFecha: (i && i.releaseDate) || '', progreso: 0, revisado: Date.now() }));
  actualizador.on('download-progress', (p) => cambiar({ fase: 'bajando', progreso: Math.round((p && p.percent) || 0) }));
  actualizador.on('update-downloaded', (i) => {
    cambiar({ fase: 'lista', nueva: (i && i.version) || e.nueva, nuevaFecha: (i && i.releaseDate) || e.nuevaFecha, progreso: 100 });
    ganchos.avisar(`Hay una versión nueva de Jarvis (${e.nueva}). Se instala sola cuando me cierres, o ahora desde Ajustes → Sistema → Información.`);
  });
  actualizador.on('error', (err) => cambiar({ fase: 'error', error: explicar(err) }));
  cambiar({ posible: true, motivo: '' });
  buscar().catch(() => {});
  const reloj = setInterval(() => { buscar().catch(() => {}); }, CADA);
  if (reloj.unref) reloj.unref();
}

function explicar(err) {
  const m = String((err && err.message) || err || '');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|net::/i.test(m)) return 'No hay conexión a internet (o GitHub no contestó). Se vuelve a probar más tarde.';
  if (/404|latest\.yml/i.test(m)) return 'Todavía no hay versiones publicadas para actualizar.';
  return m.split('\n')[0].slice(0, 200);
}

async function buscar() {
  if (!actualizador) return estado();
  if (e.fase === 'bajando' || e.fase === 'lista') return estado();
  try { await actualizador.checkForUpdates(); } catch (err) { cambiar({ fase: 'error', error: explicar(err) }); }
  return estado();
}

function instalarAhora() {
  if (!actualizador || e.fase !== 'lista') throw new Error('Todavía no hay una actualización lista para instalar.');
  setImmediate(() => actualizador.quitAndInstall(true, true)); // en silencio, y vuelve a abrir Jarvis al terminar
  return true;
}

module.exports = { iniciar, estado, buscar, instalarAhora };
