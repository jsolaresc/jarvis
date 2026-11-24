// Notas de Jarvis: texto suelto, con o sin aviso, y opcionalmente con el contexto del momento en que se anotaron
// (la página o el programa que tenías abierto, el link y una captura de la pantalla). Un recordatorio es una nota con hora.
// Todo vive en datos/notas.json y datos/notas-capturas/ (las capturas nunca salen de la PC). Las notas con aviso suenan
// a su hora y se quedan guardadas (marcadas como avisadas) hasta que las borres.
const fs = require('fs');
const path = require('path');
const { DATOS, leerJSON, guardarJSON, leerConfig } = require('./config');
const contexto = require('./contexto');

let lista = null;
let alSonar = () => {};
let reloj = null;
const CAPTURAS = () => path.join(DATOS, 'notas-capturas');

const nuevoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function leer() {
  if (lista) return lista;
  lista = leerJSON('notas.json', []);
  if (!Array.isArray(lista)) lista = [];
  // Los recordatorios de antes (datos/recordatorios.json) pasan a ser notas con hora, una sola vez.
  const viejos = leerJSON('recordatorios.json', []);
  if (Array.isArray(viejos) && viejos.length) {
    for (const r of viejos) if (r && r.texto && r.cuando) lista.push({ id: r.id || nuevoId(), texto: String(r.texto), creada: Date.now(), cuando: r.cuando, avisada: false, tipo: 'recordatorio', enlace: '', app: '', titulo: '', captura: '' });
    guardarJSON('recordatorios.json', []);
    guardar();
  }
  return lista;
}
let avisarCambio = () => {};
function guardar() { guardarJSON('notas.json', lista); try { avisarCambio(); } catch {} }

// Cuándo es: dentro de "minutos", a una hora "HH:MM" (de hoy; si ya pasó, de mañana) o un momento exacto (milisegundos).
function cuandoDe({ minutos, hora, cuando } = {}) {
  if (Number(cuando) > 0) return Number(cuando);
  if (Number(minutos) > 0) return Date.now() + Number(minutos) * 60000;
  if (/^\d{1,2}:\d{2}$/.test(String(hora || '').trim())) {
    const [h, m] = hora.trim().split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return null;
}
const hhmm = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
function cuandoDicho(ms) {
  const f = new Date(ms); const hoy = new Date();
  const manana = new Date(hoy.getTime() + 86400000);
  const dia = f.toDateString() === hoy.toDateString() ? 'hoy' : f.toDateString() === manana.toDateString() ? 'mañana' : `el ${f.getDate()}/${f.getMonth() + 1}`;
  return `${dia} a las ${hhmm(ms)}`;
}

function revisar() {
  const ahora = Date.now();
  const vencidas = leer().filter((n) => n.cuando && !n.avisada && n.cuando <= ahora);
  if (!vencidas.length) return;
  for (const n of vencidas) n.avisada = true; // quedan guardadas: las borrás vos
  guardar();
  for (const n of vencidas) { try { alSonar(n, ahora - n.cuando > 5 * 60 * 1000); } catch {} } // el 2º dato: llegó tarde (la PC estaba apagada)
}
function iniciar(fn) {
  alSonar = fn;
  clearInterval(reloj);
  reloj = setInterval(revisar, 15000);
  setTimeout(revisar, 4000);
}

// Un recordatorio sin contexto, al instante (es lo que usan las rutinas viejas y las pruebas).
function crearSimple({ texto, minutos, hora, cuando, tipo = 'recordatorio' }) {
  const t = String(texto || '').trim();
  if (!t) throw new Error('Falta el texto del recordatorio.');
  const c = cuandoDe({ minutos, hora, cuando });
  if (!c && tipo === 'recordatorio') throw new Error('Necesito "minutos" o una "hora" con formato HH:MM.');
  const n = { id: nuevoId(), texto: t, creada: Date.now(), cuando: c, avisada: false, tipo: c ? tipo : 'nota', enlace: '', app: '', titulo: '', captura: '' };
  leer().push(n);
  guardar();
  return n;
}

// Un WhatsApp programado: "a las 5 decile a Tomi que entre al Counter". Es una nota con hora que, al sonar, manda el mensaje.
function programarMensaje({ contacto, mensaje, minutos, hora, cuando } = {}) {
  const para = String(contacto || '').trim();
  const texto = String(mensaje || '').trim();
  if (!para || !texto) throw new Error('Necesito a quién se lo mando y qué decir.');
  const c = cuandoDe({ minutos, hora, cuando });
  if (!c) throw new Error('Necesito "minutos" o una "hora" con formato HH:MM para programarlo.');
  const n = { id: nuevoId(), texto: `Mandarle a ${para}: ${texto}`, creada: Date.now(), cuando: c, avisada: false, tipo: 'mensaje', enviar: { contacto: para, mensaje: texto }, enlace: '', app: '', titulo: '', captura: '' };
  leer().push(n);
  guardar();
  return { nota: n, mensaje: `Listo, ${cuandoDicho(c)} le mando a ${para}: ${texto}` };
}

// Una nota o recordatorio que, si se pide, se lleva el contexto: ventana al frente, link y captura de la pantalla.
async function crear({ texto, minutos, hora, cuando, conContexto = false, enlace = '', sonido = '' } = {}) {
  const c = cuandoDe({ minutos, hora, cuando });
  if ((minutos || hora) && !c) throw new Error('Necesito "minutos" o una "hora" con formato HH:MM.');
  let ventana = null;
  let captura = '';
  const avisos = [];
  if (conContexto) {
    ventana = await contexto.ventanaActiva().catch(() => null);
    const cfg = leerConfig().notas || {};
    if (cfg.capturar !== false) {
      try { captura = await guardarCaptura(); } catch (e) { avisos.push(`no pude sacar la captura (${e.message})`); }
    }
  }
  let t = String(texto || '').trim();
  if (!t && ventana && ventana.titulo) t = ventana.titulo;
  if (!t) throw new Error('¿Qué anoto? No me quedó claro el texto de la nota.');
  const n = {
    id: nuevoId(), texto: t, creada: Date.now(), cuando: c, avisada: false, tipo: c && !conContexto ? 'recordatorio' : 'nota',
    enlace: String(enlace || (ventana && ventana.url) || ''), app: ventana ? contexto.describir({ ...ventana, titulo: '' }) : '', titulo: ventana ? ventana.titulo : '', captura: '',
  };
  if (sonido) n.sonido = String(sonido);
  if (captura) { // la captura se llama como la nota
    const destino = path.join(CAPTURAS(), `${n.id}.jpg`);
    try { fs.renameSync(captura, destino); n.captura = `${n.id}.jpg`; } catch { n.captura = path.basename(captura); }
  }
  if (conContexto && !n.enlace && ventana && ventana.navegador) avisos.push('no pude leer el link de la página');
  leer().push(n);
  guardar();
  const partes = [`Anotado${c ? ` para ${cuandoDicho(c)}` : ''}: ${n.texto}.`];
  if (n.enlace) partes.push('Guardé el link');
  if (n.captura) partes.push(n.enlace ? 'y una captura de la pantalla.' : 'Guardé una captura de la pantalla.');
  else if (n.enlace) partes[partes.length - 1] += '.';
  if (conContexto && !n.enlace && !n.captura && n.app) partes.push(`Guardé que estabas en ${n.app}.`);
  if (avisos.length) partes.push(`Ojo: ${avisos.join(' y ')}.`);
  return { nota: n, mensaje: partes.join(' ') };
}

// Saca la captura y la deja en la carpeta de capturas con un nombre provisorio; devuelve la ruta.
async function guardarCaptura() {
  const { jpeg } = await contexto.capturarPantalla({ ancho: 1280, calidad: 70 });
  fs.mkdirSync(CAPTURAS(), { recursive: true });
  const ruta = path.join(CAPTURAS(), `tmp-${Date.now().toString(36)}.jpg`);
  fs.writeFileSync(ruta, jpeg);
  return ruta;
}

const ordenadas = () => leer().slice().sort((a, b) => (b.creada || 0) - (a.creada || 0));
const listar = () => ordenadas().map((n) => ({ ...n }));
// Las que tienen aviso pendiente, la más próxima primero.
const pendientes = () => leer().filter((n) => n.cuando && !n.avisada).sort((a, b) => a.cuando - b.cuando).map((n) => ({ ...n }));
const buscar = (id) => leer().find((n) => n.id === id);

// Cambia el texto, el link o el aviso de una nota. cuando: milisegundos, o null/0 para sacarle el aviso.
function actualizar(id, cambios = {}) {
  const n = buscar(id);
  if (!n) throw new Error('Esa nota ya no está.');
  if (cambios.texto !== undefined) {
    const t = String(cambios.texto).trim();
    if (!t) throw new Error('La nota no puede quedar vacía.');
    n.texto = t.slice(0, 2000);
  }
  if (cambios.enlace !== undefined) {
    const e = String(cambios.enlace).trim();
    if (e && !/^https?:\/\//i.test(e)) throw new Error('El link tiene que empezar con http:// o https://');
    n.enlace = e;
  }
  if (cambios.sonido !== undefined) { const so = String(cambios.sonido || ''); if (so) n.sonido = so; else delete n.sonido; } // '' = el de siempre, 'ninguno' = mudo, o un sonido de la lista
  if (cambios.cuando !== undefined) {
    if (!cambios.cuando) { n.cuando = null; n.avisada = false; if (n.tipo === 'recordatorio') n.tipo = 'nota'; } else {
      const ms = Number(cambios.cuando);
      if (!Number.isFinite(ms) || ms <= 0) throw new Error('Esa fecha no es válida.');
      n.cuando = ms; n.avisada = ms <= Date.now();
    }
  }
  guardar();
  return { ...n };
}

function borrar(id) {
  const n = buscar(id);
  if (!n) return false;
  if (n.captura) { try { fs.unlinkSync(path.join(CAPTURAS(), path.basename(n.captura))); } catch {} }
  lista = leer().filter((x) => x.id !== id);
  guardar();
  return true;
}
// Borra de a muchas (por ejemplo, todas las que ya avisaron).
const borrarVarias = (condicion) => leer().filter(condicion).map((n) => n.id).filter((id) => borrar(id)).length;

// Ruta de la captura de una nota (solo dentro de la carpeta de capturas), o null.
function rutaDeCaptura(id) {
  const n = buscar(id);
  if (!n || !n.captura) return null;
  const ruta = path.join(CAPTURAS(), path.basename(n.captura));
  return fs.existsSync(ruta) ? ruta : null;
}

// "Tenés 3 notas; la próxima con aviso es «llamar al médico», hoy a las 18:00."
function resumenDicho() {
  const todas = leer();
  if (!todas.length) return 'No tenés notas guardadas.';
  const p = pendientes();
  const base = todas.length === 1 ? 'Tenés una nota.' : `Tenés ${todas.length} notas.`;
  return p.length ? `${base} La próxima con aviso es «${p[0].texto}», ${cuandoDicho(p[0].cuando)}.` : base;
}

module.exports = { alCambiar: (fn) => { avisarCambio = fn; }, iniciar, revisar, crear, crearSimple, programarMensaje, listar, pendientes, actualizar, borrar, borrarVarias, rutaDeCaptura, resumenDicho, cuandoDe, cuandoDicho, _reiniciar: () => { lista = null; } };
