// Frases que Jarvis aprendió: cuando un pedido no lo cubría ninguna regla, lo resolvió un modelo y el usuario
// confirmó "sí, eso era", la frase queda guardada con la acción que se hizo. La próxima vez que se diga igual
// se hace al instante, sin modelo y sin preguntar. Se ven y se borran en Ajustes → General.
const { leerJSON, guardarJSON, normalizar } = require('./config');
const MAXIMO = 200;
let lista = null;

// La frase sin saludos ni muletillas, para compararla igual aunque se diga con o sin "por favor" o "che".
const clave = (dicho) => require('./nombre').quitarNombre(normalizar(dicho))
  .replace(/\b(por favor|porfa|porfi)\b/g, ' ').replace(/\s+/g, ' ').trim();

function leer() {
  if (!lista) { lista = leerJSON('aprendido.json', []); if (!Array.isArray(lista)) lista = []; }
  return lista;
}
const guardar = () => { try { guardarJSON('aprendido.json', lista); } catch {} };

function buscar(dicho) {
  const k = clave(dicho);
  if (!k) return null;
  return leer().find((x) => x.clave === k) || null;
}

// Solo se aprenden herramientas de ejecución fija (a quién, qué): el mismo pedido, la misma acción.
function aprender(dicho, nombre, args) {
  const k = clave(dicho);
  if (!k || k.length < 4) return null;
  leer();
  lista = lista.filter((x) => x.clave !== k);
  lista.push({ clave: k, dicho: String(dicho).slice(0, 200), nombre, args: args || {}, cuando: Date.now() });
  if (lista.length > MAXIMO) lista = lista.slice(-MAXIMO);
  guardar();
  return k;
}

const todas = () => leer().slice().reverse();
function olvidar(k) { leer(); const antes = lista.length; lista = lista.filter((x) => x.clave !== k); if (lista.length !== antes) guardar(); }
function olvidarTodo() { lista = []; guardar(); }

module.exports = { clave, buscar, aprender, todas, olvidar, olvidarTodo };
