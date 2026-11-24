// Dónde viven los datos de Jarvis, según cómo se lo abrió. Se carga ANTES que config.js.
//  - Instalado (instalador de Windows): en %APPDATA%\Jarvis\datos. Así las actualizaciones reemplazan
//    el programa sin tocar tu configuración, tus voces ni tu sesión de WhatsApp.
//  - Portable (Jarvis.exe suelto): en "datos", al lado del exe, como siempre.
//  - Desde el código (npm start): en "datos", al lado del código.
//  - JARVIS_DATOS (variable de entorno) manda sobre todo lo anterior (pruebas, varias copias).
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const NOMBRE = 'Jarvis';
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR;
const INSTALADO = !!(app && app.isPackaged && !PORTABLE);

function carpetaDeDatos() {
  if (process.env.JARVIS_DATOS) return process.env.JARVIS_DATOS;
  if (PORTABLE) return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'datos');
  if (INSTALADO) {
    // Un archivo "portable.txt" al lado del exe instalado fuerza los datos junto al programa (para quien lo prefiera).
    const junto = path.join(path.dirname(process.execPath), 'portable.txt');
    if (fs.existsSync(junto)) return path.join(path.dirname(process.execPath), 'datos');
    return path.join(app.getPath('appData'), NOMBRE, 'datos');
  }
  return path.join(__dirname, '..', '..', 'datos');
}

process.env.JARVIS_DATOS = carpetaDeDatos();

// Datos traídos de otro Jarvis (Ajustes → Sistema → Componentes → "Traer datos"): se ponen en su lugar antes de leer nada.
// Lo que había queda guardado aparte por las dudas ("datos-antes-de-importar-<fecha>").
(function ponerImportados() {
  const datos = process.env.JARVIS_DATOS;
  const nuevos = path.join(path.dirname(datos), 'datos-importar');
  if (!fs.existsSync(nuevos)) return;
  try {
    if (fs.existsSync(datos)) fs.renameSync(datos, `${datos}-antes-de-importar-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);
    fs.renameSync(nuevos, datos);
  } catch (e) { console.error('[importar]', e.message); }
})();

module.exports = { B: false, NOMBRE, PORTABLE, INSTALADO, copiado: false, compartidos: false, datos: process.env.JARVIS_DATOS };
