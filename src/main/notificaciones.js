// Notificaciones: lo que llega mientras no estás mirando (mensajes de WhatsApp, mails). Cada una
// pasa por las reglas de Ajustes (quién, por dónde, en qué modo) y, según el resultado, se avisa
// (punto de color y/o burbuja), se dice en voz alta, o se descarta. Las pendientes se ven en el
// panel del notch y se pueden pedir por voz ("¿tengo mensajes?", "leeme los mails").
const { leerConfig, leerJSON, guardarJSON, normalizar } = require('./config');

const MAXIMO = 60;
let lista = null;
let descartadas = null; // claves de mails que ya viste o borraste: no se vuelven a avisar (ni aunque la casilla los muestre de nuevo)
let alCambiar = () => {}; // (resumen) => ...
let alAvisar = () => {}; // (notificacion, accion) => ...
let modoActual = () => leerConfig().modo;

function configurar(funciones) {
  if (funciones.alCambiar) alCambiar = funciones.alCambiar;
  if (funciones.alAvisar) alAvisar = funciones.alAvisar;
  if (funciones.modo) modoActual = funciones.modo;
}

function leer() {
  if (!lista) {
    lista = leerJSON('notificaciones.json', []);
    if (!Array.isArray(lista)) lista = [];
    const limite = Date.now() - 48 * 3600 * 1000; // lo de hace más de dos días ya no es novedad
    lista = lista.filter((n) => n && n.cuando > limite);
  }
  return lista;
}
const ARCHIVO_DESCARTADAS = 'notificaciones-descartadas.json';
function leerDescartadas() {
  if (!descartadas) {
    const g = leerJSON(ARCHIVO_DESCARTADAS, []);
    descartadas = new Set(Array.isArray(g) ? g : []);
  }
  return descartadas;
}
function descartar(n) {
  if (!n || n.origen !== 'mail' || !n.clave) return; // los chats de WhatsApp vuelven a avisar con cada mensaje nuevo; los mails son siempre uno por uno
  leerDescartadas().add(n.clave);
  guardarJSON(ARCHIVO_DESCARTADAS, [...descartadas].slice(-1500));
}
function guardar() { guardarJSON('notificaciones.json', lista); try { alCambiar(resumen()); } catch {} }

// La regla de Ajustes que le toca a una notificación (la primera que coincide), o null.
function reglaPara(n) {
  const c = leerConfig().notificaciones;
  const modo = modoActual();
  const donde = normalizar(`${n.de || ''} ${n.grupo || ''} ${n.asunto || ''} ${n.direccion || ''} ${n.cuenta || ''} ${n.app || ''}`);
  for (const r of c.reglas || []) {
    if (r.origen && r.origen !== 'todos' && r.origen !== n.origen) continue;
    if (Array.isArray(r.modos) && r.modos.length && !r.modos.includes(modo)) continue;
    const quien = normalizar(r.quien);
    if (quien && !donde.includes(quien)) continue;
    return r;
  }
  return null;
}

// ---- Qué avisa: un modo por fuente ----
// 'nada' (no avisa), 'elegidos' (solo lo que elegiste) o 'todo' (todo, salvo lo silenciado). Los mails además pueden tener un modo por cuenta.
const MODOS = ['nada', 'elegidos', 'todo'];
// Una lista de la config: acepta un arreglo o texto separado por coma / renglón.
const etiquetas = (t) => (Array.isArray(t) ? t : String(t || '').split(/[,\n;]+/)).map((x) => String(x).trim()).filter(Boolean);
const cuentaDe = (n) => (n.via === 'outlook' ? 'outlook' : n.cuenta || '');
function modoDe(n) {
  const c = leerConfig().notificaciones || {};
  const o = c[n.origen];
  if (!o) return 'nada';
  let modo = MODOS.includes(o.modo) ? o.modo : (o.activo === false ? 'nada' : 'todo');
  if (n.origen === 'mail') { const propio = (o.cuentas || {})[cuentaDe(n)]; if (MODOS.includes(propio)) modo = propio; } // esa cuenta se porta distinto al resto
  return modo;
}
// ¿El nombre, el grupo o la dirección coincide con alguna de la lista? (alcanza con una parte: "eva" sirve para "Eva López"; "@promos.com" para un dominio)
function coincide(lista, n) {
  const donde = normalizar(n.origen === 'whatsapp' ? (n.grupo || n.de || '') : `${n.de || ''} ${n.direccion || ''}`);
  return etiquetas(lista).some((x) => { const t = normalizar(x); return t && donde.includes(t); });
}
// Qué hacer con una notificación y por qué: { accion: 'avisar' | 'decir' | 'callar', motivo }.
// n.avisar: lo que se eligió para ese contacto o grupo en Ajustes → WhatsApp ('siempre' | 'nunca' | '').
// motivo 'no-elegido': no avisó porque no está entre lo elegido (sirve para mostrarlo en "Llegaron y no te avisé").
function evaluar(n) {
  const c = leerConfig().notificaciones;
  const o = c[n.origen];
  const modo = modoDe(n);
  if (modo === 'nada') return { accion: 'callar', motivo: 'apagado' };
  if (n.avisar === 'nunca') return { accion: 'callar', motivo: 'silenciado' };
  const dePersona = n.origen === 'whatsapp' || n.origen === 'mail';
  if (dePersona && coincide(o.silenciados !== undefined ? o.silenciados : o.ignorar, n)) return { accion: 'callar', motivo: 'silenciado' }; // lo silenciado gana sobre todo
  const r = reglaPara(n);
  if (r) return { accion: ['avisar', 'decir', 'callar'].includes(r.accion) ? r.accion : 'avisar', motivo: 'regla' };
  if (dePersona) {
    const elegido = n.avisar === 'siempre' || coincide(o.elegidos !== undefined ? o.elegidos : o.lista, n);
    if (modo === 'elegidos' && !elegido) return { accion: 'callar', motivo: 'no-elegido' };
    if (modo === 'todo' && !elegido && n.origen === 'whatsapp' && n.grupo && o.grupos === false) return { accion: 'callar', motivo: 'grupo' };
  }
  return { accion: 'avisar', motivo: modo };
}
const decidir = (n) => evaluar(n).accion;

// Lo que llegó y no avisó por no estar elegido (los últimos, uno por remitente): la lista para ir eligiendo.
const ARCHIVO_OMITIDAS = 'notificaciones-omitidas.json';
const MAX_OMITIDAS = 40;
function leerOmitidas() {
  const l = leerJSON(ARCHIVO_OMITIDAS, []);
  const limite = Date.now() - 7 * 24 * 3600 * 1000;
  return (Array.isArray(l) ? l : []).filter((x) => x && x.cuando > limite);
}
function anotarOmitida(n) {
  const nombre = n.origen === 'whatsapp' ? (n.grupo || n.de) : (n.de || n.direccion);
  if (!nombre) return;
  const clave = `${n.origen}|${normalizar(n.origen === 'mail' ? (n.direccion || nombre) : nombre)}`;
  const l = leerOmitidas();
  const previa = l.find((x) => x.clave === clave);
  const dato = { clave, origen: n.origen, nombre, direccion: n.direccion || '', esGrupo: !!n.grupo, cuenta: cuentaDe(n), texto: String(n.origen === 'mail' ? n.asunto : n.texto || '').replace(/\s+/g, ' ').trim().slice(0, 90), cantidad: (previa ? previa.cantidad : 0) + 1, cuando: Date.now() };
  guardarJSON(ARCHIVO_OMITIDAS, [dato, ...l.filter((x) => x.clave !== clave)].slice(0, MAX_OMITIDAS));
}
const omitidas = () => leerOmitidas();
function olvidarOmitidas(clave) { guardarJSON(ARCHIVO_OMITIDAS, clave ? leerOmitidas().filter((x) => x.clave !== clave) : []); }

// Quita a quien mandó esta novedad de lo elegido y, si de todas formas seguiría avisando (modo "todo"), lo suma a lo silenciado.
// Devuelve a quién dejó de avisar (o '' si no encontró la novedad).
function dejarDeAvisar(clave) {
  const n = leer().find((x) => claveDeGrupo(x) === clave);
  if (!n || (n.origen !== 'whatsapp' && n.origen !== 'mail')) return '';
  const cfg = leerConfig();
  const o = cfg.notificaciones[n.origen];
  const nombre = n.origen === 'whatsapp' ? (n.grupo || n.de) : (n.direccion || n.de);
  const t = normalizar(nombre);
  o.elegidos = etiquetas(o.elegidos).filter((x) => !(normalizar(x) && t.includes(normalizar(x))));
  o.silenciados = etiquetas(o.silenciados);
  if (!coincide(o.silenciados, n)) o.silenciados.push(nombre);
  require('./config').guardarConfig(cfg);
  quitar((x) => x.origen === n.origen && coincide([nombre], x));
  return nombre;
}

// Qué sonido le toca: el de la regla que coincide (si tiene uno propio) o el general. '' = ninguno.
function sonidoPara(n) {
  const c = leerConfig().notificaciones;
  const elegido = (x) => (x === 'ninguno' ? '' : x);
  if (n.sonido) return elegido(n.sonido); // el que se eligió para esa nota o evento ('ninguno' = mudo)
  const r = reglaPara(n);
  if (r && r.sonido !== undefined && r.sonido !== '') return elegido(r.sonido);
  const porTipo = (c.sonidos || {})[n.origen];
  if (porTipo) return elegido(porTipo);
  return c.sonido || '';
}

// Suma una notificación. Devuelve qué se hizo con ella.
function agregar(dato) {
  const n = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, cuando: Date.now(), ...dato, texto: String(dato.texto || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
  if (n.origen === 'mail' && n.clave && (leerDescartadas().has(n.clave) || leer().some((x) => x.clave === n.clave))) return 'callar'; // ya lo viste, lo borraste o ya está en la lista
  const { accion, motivo } = evaluar(n);
  if (accion === 'callar') { if (motivo === 'no-elegido') { try { anotarOmitida(n); } catch {} } return accion; }
  delete n.avisar; delete n.enLista; // solo servían para decidir
  leer().push(n);
  if (lista.length > MAXIMO) lista = lista.slice(-MAXIMO);
  guardar();
  try { alAvisar(n, accion, sonidoPara(n)); } catch {}
  return accion;
}

// Quita las que cumplan la condición (por ejemplo, las de un chat que ya se leyó en el celular).
function quitar(condicion) {
  const antes = leer().length;
  lista.filter((n) => condicion(n)).forEach(descartar);
  lista = lista.filter((n) => !condicion(n));
  if (lista.length !== antes) guardar();
  return antes - lista.length;
}
const limpiar = (origen) => quitar((n) => !origen || n.origen === origen);
const pendientes = (origen) => leer().filter((n) => !origen || n.origen === origen);
const claveDeGrupo = (n) => (n.origen === 'nota' ? `nota|${n.clave || n.id}` : `${n.origen}|${n.grupo || n.de}`); // cada recordatorio es un renglón propio
// Las de un renglón del panel (un remitente o un grupo), de la más vieja a la más nueva.
const deGrupo = (clave) => leer().filter((n) => claveDeGrupo(n) === clave);

// Agrupadas por remitente, lo más nuevo primero: lo que muestra el panel del notch.
function resumen() {
  const grupos = new Map();
  leer().forEach((n, puesto) => { // la lista está en orden de llegada: lo último que llegó manda
    const clave = claveDeGrupo(n);
    const g = grupos.get(clave) || { clave, origen: n.origen, de: n.grupo || n.de, cantidad: 0 };
    g.cantidad++;
    g.puesto = puesto;
    g.cuando = n.cuando;
    g.cuenta = n.cuenta || '';
    g.texto = n.origen === 'mail' ? n.asunto : (n.grupo ? `${n.de}: ${n.texto}` : n.texto);
    grupos.set(clave, g);
  });
  return [...grupos.values()].sort((a, b) => b.puesto - a.puesto);
}

const plural = (n, uno, varios) => (n === 1 ? `un ${uno}` : `${n} ${varios}`);

// "Tenés 2 mensajes de Eva y un mail de Martín."
function contar(origen) {
  const grupos = resumen().filter((g) => !origen || g.origen === origen);
  if (!grupos.length) return origen === 'mail' ? 'No tenés mails nuevos.' : origen === 'whatsapp' ? 'No tenés mensajes nuevos.' : 'No tenés nada nuevo.';
  const partes = grupos.slice(0, 6).map((g) => (g.origen === 'calendario' ? `un aviso de ${g.de}` : g.origen === 'nota' ? `un recordatorio: ${g.texto}` : `${g.origen === 'mail' ? plural(g.cantidad, 'mail', 'mails') : plural(g.cantidad, 'mensaje', 'mensajes')} de ${g.de}`));
  const lista2 = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0];
  return `Tenés ${lista2}${grupos.length > 6 ? ', y algunos más' : ''}.`;
}

// Lo mismo pero con el contenido, para decirlo en voz alta. Lo que se lee deja de estar pendiente.
function leerEnVozAlta(origen) {
  const mias = pendientes(origen);
  if (!mias.length) return contar(origen);
  const frases = mias.slice(-8).map((n) => (n.origen === 'calendario' ? `${n.de}: ${n.texto}.` : n.origen === 'nota' ? `Recordatorio: ${n.texto}.`
    : n.origen === 'mail'
    ? `Mail de ${n.de}: ${n.asunto}.`
    : `${n.grupo ? `${n.de}, en ${n.grupo}` : n.de}: ${n.texto || 'mandó algo sin texto'}.`));
  const sobran = mias.length - frases.length;
  limpiar(origen);
  return `${sobran > 0 ? `Los últimos de ${mias.length}. ` : ''}${frases.join(' ')}`;
}

module.exports = { configurar, reglaPara, sonidoPara, agregar, quitar, limpiar, pendientes, deGrupo, claveDeGrupo, resumen, contar, leerEnVozAlta, decidir, evaluar, coincide, etiquetas, omitidas, olvidarOmitidas, dejarDeAvisar, MODOS };
