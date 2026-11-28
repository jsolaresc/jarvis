// Quién está entrando a la PC desde afuera de ella (el celular): mirando la pantalla, mirando la cámara,
// manejando el mouse y el teclado, o con los archivos. No cuenta estar conectado: solo lo que te ve o toca tus cosas.
// Lo usa el notch para que los ojos lo muestren claro mientras pasa (y un ratito después de lo que es instantáneo).
const activos = new Map(); // clave → { tipo, quien }
const pulsos = new Map(); // `${tipo}|${quien}` → reloj
let alCambiar = () => {};
let reloj = null;

function configurar(o = {}) { if (typeof o.alCambiar === 'function') alCambiar = o.alCambiar; }
function avisar() { clearTimeout(reloj); reloj = setTimeout(() => { try { alCambiar(resumen()); } catch {} }, 40); }

// Algo que dura (ver la pantalla, la cámara, bajar un archivo): devuelve con qué cerrarlo.
function abrir(tipo, quien = 'El celular') {
  const clave = Symbol(tipo);
  activos.set(clave, { tipo, quien: quien || 'El celular' });
  avisar();
  let cerrado = false;
  return () => { if (cerrado) return; cerrado = true; activos.delete(clave); avisar(); };
}
// Algo instantáneo (un clic, abrir una carpeta): queda marcado unos segundos, y cada vez que se repite se estira.
function pulso(tipo, quien = 'El celular', ms = 8000) {
  const k = `${tipo}|${quien || 'El celular'}`;
  if (pulsos.has(k)) clearTimeout(pulsos.get(k));
  else { activos.set(k, { tipo, quien: quien || 'El celular' }); avisar(); }
  pulsos.set(k, setTimeout(() => { pulsos.delete(k); activos.delete(k); avisar(); }, ms));
}

// { pantalla: ['Moto g84'], camara: [...], control: [...], archivos: [...] } solo con lo que está pasando ahora.
function resumen() {
  const r = {};
  for (const a of activos.values()) (r[a.tipo] = r[a.tipo] || new Set()).add(a.quien);
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v]]));
}

module.exports = { configurar, abrir, pulso, resumen };
