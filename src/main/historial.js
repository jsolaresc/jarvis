// Historial: qué se le pidió a Jarvis, qué contestó y —en un detalle que se abre aparte— con qué
// lo resolvió (regla directa, qué modelo, qué servicio, cuánto tardó, qué falló). Sirve para entender
// después por qué algo no anduvo. Vive en datos/historial.json, solo en esta PC.
const { leerJSON, guardarJSON } = require('./config');

const MAXIMO = 300;
let lista = null;
let actual = null; // el pedido que se está atendiendo ahora (Jarvis atiende de a uno)
let alCambiar = () => {};

function configurar(funciones) { if (funciones.alCambiar) alCambiar = funciones.alCambiar; }

function leer() {
  if (!lista) {
    lista = leerJSON('historial.json', []);
    if (!Array.isArray(lista)) lista = [];
  }
  return lista;
}
function guardar() {
  try { guardarJSON('historial.json', lista); } catch { /* sin disco no hay historial, pero Jarvis sigue */ }
  try { alCambiar(); } catch {}
}

// origen: 'voz' | 'texto' | 'click' | 'aviso' (lo que hizo Jarvis por su cuenta)
function empezar(dicho, origen = 'voz') {
  actual = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, cuando: Date.now(), origen, dicho: String(dicho || '').slice(0, 500), respuesta: '', ok: true, detalle: [] };
  return actual;
}

// Suma una línea al detalle del pedido en curso (o del que se pase). error: marca el pedido como fallido.
function anotar(texto, { error = false, entrada = actual } = {}) {
  if (!entrada) return;
  entrada.detalle.push({ t: Date.now() - entrada.cuando, texto: String(texto).replace(/\s+/g, ' ').slice(0, 500), ...(error ? { error: true } : {}) });
  if (entrada.detalle.length > 60) entrada.detalle.splice(0, entrada.detalle.length - 60);
}

function terminar(entrada, { respuesta = '', ok } = {}) {
  if (!entrada || entrada.cerrada) return;
  entrada.cerrada = true;
  entrada.respuesta = String(respuesta || '').slice(0, 800);
  entrada.ms = Date.now() - entrada.cuando;
  if (ok === false) entrada.ok = false;
  if (actual === entrada) actual = null;
  const { cerrada, ...limpia } = entrada;
  leer().push(limpia);
  if (lista.length > MAXIMO) lista = lista.slice(-MAXIMO);
  guardar();
}

// Envuelve algo que Jarvis hace fuera de una conversación (un click en una rutina, responder un aviso).
async function registrar(dicho, origen, fn) {
  const entrada = empezar(dicho, origen);
  try {
    const r = await fn();
    terminar(entrada, { respuesta: typeof r === 'string' ? r : '' });
    return r;
  } catch (e) {
    anotar(e.message, { error: true, entrada });
    terminar(entrada, { respuesta: e.message, ok: false });
    throw e;
  }
}

const recientes = (cuantos = 150) => leer().slice(-cuantos).reverse();
function borrar(id) { const antes = leer().length; lista = lista.filter((e) => e.id !== id); if (lista.length !== antes) guardar(); }
function limpiar() { lista = []; guardar(); }

module.exports = { configurar, empezar, anotar, terminar, registrar, recientes, borrar, limpiar };
