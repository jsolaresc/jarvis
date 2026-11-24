// Recordatorios: ahora son notas con hora (ver notas.js). Este módulo mantiene la interfaz de siempre.
const notas = require('./notas');

const iniciar = notas.iniciar;

// Se le pasa "en cuántos minutos" o una hora "HH:MM" (de hoy; si ya pasó, de mañana).
function crear({ texto, minutos, hora }) {
  const r = notas.crearSimple({ texto, minutos, hora });
  const f = new Date(r.cuando);
  const hoy = f.toDateString() === new Date().toDateString();
  return `Recordatorio para ${hoy ? 'hoy' : 'mañana'} a las ${f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}: ${r.texto}`;
}

const pendientes = () => notas.pendientes();
const borrar = (id) => notas.borrar(id);

module.exports = { iniciar, crear, pendientes, borrar };
