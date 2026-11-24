// Arranque liviano: Jarvis no hace todo junto al abrirse. Lo que se ve (notch, bandeja) sale primero y lo pesado
// (modelos de voz, mail, calendario, WhatsApp, clips, búsqueda de teles) se reparte en el tiempo, para que la PC
// no se trabe los primeros segundos. Además deja un registro (datos/arranque.log) con cuánto tardó cada cosa y
// cuánto se "congeló" el proceso principal, para poder ver qué molesta si el problema persiste.
const fs = require('fs');
const path = require('path');

const t0 = Date.now();
let archivo = null;
let lineas = [];
let peorLag = 0;
let reloj = null;

const seg = () => ((Date.now() - t0) / 1000).toFixed(1);

function escribir() {
  if (!archivo) return;
  try { fs.writeFileSync(archivo, lineas.join('\n') + '\n'); } catch {}
}

// Se llama una vez, apenas se sabe dónde guardar los datos.
function iniciar(carpetaDatos) {
  try { archivo = path.join(carpetaDatos, 'arranque.log'); } catch { archivo = null; }
  lineas = [`Arranque de Jarvis ${new Date().toISOString()}`];
  // Mide cuánto se atrasa el reloj del proceso principal: si un ciclo de 100 ms tarda 600, estuvo "congelado" 500.
  let previo = Date.now();
  reloj = setInterval(() => {
    const ahora = Date.now();
    const lag = ahora - previo - 100;
    previo = ahora;
    if (lag > peorLag) peorLag = lag;
    if (lag > 250) lineas.push(`  [${seg()} s] el proceso principal se congeló ${lag} ms`);
  }, 100);
  if (reloj.unref) reloj.unref();
  // Pasados 60 s ya no hace falta vigilar.
  const corte = setTimeout(() => { clearInterval(reloj); lineas.push(`Peor congelamiento del proceso principal en el arranque: ${peorLag} ms`); escribir(); }, 60000);
  if (corte.unref) corte.unref();
}

function marca(nombre) {
  lineas.push(`[${seg()} s] ${nombre}`);
  if (lineas.length < 60) escribir();
}

// Programa una tarea para más tarde. Si falla, no tira abajo el arranque.
function tarea(nombre, ms, fn) {
  const t = setTimeout(() => {
    marca(`empieza: ${nombre}`);
    try {
      const r = fn();
      if (r && typeof r.then === 'function') r.then(() => marca(`listo: ${nombre}`), (e) => marca(`falló: ${nombre} (${e && e.message})`));
    } catch (e) { marca(`falló: ${nombre} (${e && e.message})`); }
  }, ms);
  return t;
}

module.exports = { iniciar, marca, tarea };
