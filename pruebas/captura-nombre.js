// Prueba dentro de Electron del nombre elegido y de las pantallas de Sistema (Componentes y Actualizaciones).
// Uso (Linux con xvfb): JARVIS_PRUEBA=<carpeta> JARVIS_PRUEBA_GUION=<ruta a este archivo> JARVIS_DATOS=<carpeta vacía> npx electron .
// Antes de abrir, deja un instalacion.txt como el del instalador (nombre "Viernes").
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function correr({ notch, abrirAjustes, ajustes, carpeta }) {
  const resultado = { errores: [], pantallas: {} };
  try {
    await esperar(2500);
    const n = notch();
    n.webContents.on('console-message', (_e, ...a) => { const t = a.map(String).join(' '); if (/error/i.test(t)) resultado.errores.push(`notch: ${t}`); });
    resultado.notch = await n.webContents.executeJavaScript(`({
      placeholder: (document.querySelector('input, textarea') || {}).placeholder || '',
      aria: (document.querySelector('[aria-label^="Hablar con"]') || {}).ariaLabel || '',
    })`);
    for (const hoja of ['general', 'escucha', 'componentes', 'actualizaciones']) {
      abrirAjustes(hoja);
      await esperar(1800);
      const v = ajustes();
      if (!resultado.escuchandoConsola) { v.webContents.on('console-message', (_e, ...a) => { const t = a.map(String).join(' '); if (/error|uncaught/i.test(t)) resultado.errores.push(`ajustes: ${t}`); }); resultado.escuchandoConsola = true; }
      const dato = await v.webContents.executeJavaScript(`({
        marca: document.querySelector('.marca strong').textContent,
        titulo: document.title,
        jarvisVisibles: (document.body.innerText.match(/\\bJarvis\\b/g) || []).length,
        excepcion: [...document.querySelectorAll('[data-sin-nombre]')].map((x) => x.textContent.slice(0, 80)),
        viernes: (document.body.innerText.match(/\\bViernes\\b/g) || []).length,
        h1: (document.querySelector('main h1') || {}).textContent,
        componentes: [...document.querySelectorAll('.tarjeta-componente strong')].map((x) => x.textContent),
      })`);
      resultado.pantallas[hoja] = dato;
      const img = await v.webContents.capturePage();
      fs.writeFileSync(path.join(carpeta, `nombre-${hoja}.png`), img.toPNG());
    }
    const img = await n.webContents.capturePage();
    fs.writeFileSync(path.join(carpeta, 'nombre-notch.png'), img.toPNG());
  } catch (e) { resultado.errores.push(String(e && e.stack || e)); }
  delete resultado.escuchandoConsola;
  fs.writeFileSync(path.join(carpeta, 'resultado-nombre.json'), JSON.stringify(resultado, null, 2));
  console.log('NOMBRE-UI', JSON.stringify(resultado));
  app.exit(0);
}

module.exports = { correr };
