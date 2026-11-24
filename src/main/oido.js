// Maneja el proceso que escucha y habla (oido-proceso.js): lo lanza cuando hace falta, le carga
// los modelos que estén instalados, y lo vuelve a levantar si se cae.
const path = require('path');
const os = require('os');
const { leerConfig } = require('./config');
const modelos = require('./modelos');

let hijo = null;
let mandar = null;
let cargado = null; // { vad, oido } cuando el proceso ya tiene los modelos en memoria
let cargando = null; // promesa de la carga en curso
let ultimoError = '';
let numero = 0;
const pendientes = new Map(); // id -> { ok, mal, alTrozo, reloj }
const registro = []; // últimas líneas que escribió el proceso (para diagnosticar)
const oyentes = { habla: () => {}, nada: () => {}, segmento: () => {}, vigilia: () => {} };

function alHabla(fn) { oyentes.habla = fn; }
function alNada(fn) { oyentes.nada = fn; }
function alSegmento(fn) { oyentes.segmento = fn; }
function alVigilia(fn) { oyentes.vigilia = fn; } // (texto, segundos): algo que se dijo fuera de una conversación

function anotar(texto) {
  for (const linea of String(texto).split(/\r?\n/)) {
    if (!linea.trim()) continue;
    registro.push(linea.slice(0, 300));
    if (registro.length > 40) registro.shift();
  }
}

function recibir(m) {
  if (!m || !m.tipo) return;
  const p = m.id ? pendientes.get(m.id) : null;
  switch (m.tipo) {
    case 'habla': oyentes.habla(); break;
    case 'nada': oyentes.nada(); break;
    case 'segmento': oyentes.segmento(m.pcm, m.segundos); break;
    case 'vigilia': oyentes.vigilia(m.texto, m.segundos); break;
    case 'voz': if (p && p.alTrozo) p.alTrozo(m.pcm, m.hz); break;
    case 'transcripto': if (p) { terminar(m.id); p.ok(m.texto); } break;
    case 'dicho': if (p) { terminar(m.id); p.ok(!m.cortado); } break;
    case 'fallo': if (p) { terminar(m.id); p.mal(new Error(m.mensaje)); } break;
    case 'error':
      ultimoError = m.mensaje;
      anotar(`[error en ${m.donde}] ${m.mensaje}`);
      if (p) { terminar(m.id); p.mal(new Error(m.mensaje)); }
      break;
    default: break;
  }
}
function terminar(id) {
  const p = pendientes.get(id);
  if (p) clearTimeout(p.reloj);
  pendientes.delete(id);
}

function alSalir(codigo) {
  hijo = null; mandar = null; cargado = null; cargando = null;
  if (codigo) { ultimoError = `El proceso de voz se cerró solo (código ${codigo}).`; anotar(ultimoError); }
  for (const [id, p] of pendientes) { clearTimeout(p.reloj); p.mal(new Error('El proceso de voz se cerró.')); pendientes.delete(id); }
}

function lanzar() {
  if (hijo) return;
  const guion = path.join(__dirname, 'oido-proceso.js');
  let electron = null;
  try { electron = require('electron'); } catch {}
  if (electron && electron.utilityProcess) {
    const proceso = electron.utilityProcess.fork(guion, [], { serviceName: 'Jarvis: voz', stdio: 'pipe' });
    proceso.on('message', recibir);
    proceso.on('exit', (codigo) => { if (hijo === proceso) alSalir(codigo); });
    mandar = (m) => proceso.postMessage(m);
    hijo = proceso;
  } else {
    // Fuera de Electron (pruebas con Node): un proceso hijo común hace lo mismo.
    const proceso = require('child_process').fork(guion, [], { serialization: 'advanced', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    proceso.on('message', recibir);
    proceso.on('exit', (codigo) => { if (hijo === proceso) alSalir(codigo); });
    proceso.on('error', (e) => { ultimoError = e.message; });
    mandar = (m) => proceso.send(m);
    hijo = proceso;
  }
  if (hijo.stdout) hijo.stdout.on('data', anotar);
  if (hijo.stderr) hijo.stderr.on('data', anotar);
}

const hilos = () => Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2)));

// Mientras los modelos se leen del disco y se cargan, el proceso de voz va con prioridad baja: así Windows le da
// el paso a lo que el usuario está haciendo (el mouse, las ventanas) y la carga solo usa lo que sobra.
function prioridad(proceso, baja) {
  const poner = () => {
    try {
      if (proceso.pid) os.setPriority(proceso.pid, baja ? os.constants.priority.PRIORITY_BELOW_NORMAL : os.constants.priority.PRIORITY_NORMAL);
    } catch {}
  };
  if (proceso.pid) poner();
  else if (baja && proceso.once) proceso.once('spawn', poner);
}

// Deja el proceso andando con lo que haya instalado. Devuelve { vad, oido } (qué quedó cargado).
function preparar() {
  const rutaVad = modelos.rutas('vad');
  const rutaOido = modelos.rutas('oido');
  const silencioMs = Number(leerConfig().escucha.silencioMs) || 700;
  const firma = JSON.stringify([!!rutaVad, !!rutaOido, silencioMs]);
  if (hijo && cargado && cargado.firma === firma) return Promise.resolve(cargado);
  if (cargando) return cargando;
  cargando = new Promise((ok, mal) => {
    try { lanzar(); } catch (e) { ultimoError = e.message; cargando = null; mal(e); return; }
    const proceso = hijo;
    prioridad(proceso, true);
    const reloj = setTimeout(() => fin(new Error('Los modelos de voz tardaron demasiado en cargar.')), 120000);
    const escucha = (m) => {
      if (m.tipo === 'cargado') { fin(null, { vad: m.vad, oido: m.oido, firma }); if (musicaSonando) mandar({ tipo: 'musica', activo: true }); }
      else if (m.tipo === 'error' && m.donde === 'cargar') fin(new Error(m.mensaje));
    };
    const alMorir = () => fin(new Error(ultimoError || 'El proceso de voz no pudo arrancar.'));
    function fin(error, dato) {
      clearTimeout(reloj);
      proceso.off('message', escucha); proceso.off('exit', alMorir);
      prioridad(proceso, false);
      cargando = null;
      if (error) { ultimoError = error.message; mal(error); } else { cargado = dato; ultimoError = ''; ok(dato); }
    }
    proceso.on('message', escucha);
    proceso.on('exit', alMorir);
    mandar({ tipo: 'cargar', rutaVad, rutaOido, silencioMs, numHilos: hilos() });
  });
  return cargando;
}

function pedir(mensaje, espera, alTrozo) {
  return new Promise((ok, mal) => {
    if (!hijo) { mal(new Error('El proceso de voz no está andando.')); return; }
    const id = ++numero;
    const reloj = setTimeout(() => { pendientes.delete(id); mal(new Error('El proceso de voz tardó demasiado.')); }, espera);
    pendientes.set(id, { ok, mal, alTrozo, reloj });
    mandar({ ...mensaje, id });
  });
}

// Avisa si hay música sonando por los parlantes: el oído de vigilia se adapta (ver oido-proceso.js).
let musicaSonando = false;
function modoMusica(activo) { musicaSonando = !!activo; if (hijo && cargado) mandar({ tipo: 'musica', activo: musicaSonando }); }
function escuchar(activo) { if (hijo && cargado) mandar({ tipo: 'escuchar', activo: !!activo }); }
function audio(pcm) { if (hijo && cargado) mandar({ tipo: 'audio', pcm }); }
// Audio de cuando nadie llamó a Jarvis todavía: solo sirve si están cargados el detector y el modelo.
function vigilar(pcm) { if (hijo && cargado && cargado.vad && cargado.oido) mandar({ tipo: 'vigilar', pcm }); }

async function transcribir(pcm) {
  const c = await preparar();
  if (!c.oido) throw new Error('Falta bajar el modelo de escucha.');
  return pedir({ tipo: 'transcribir', pcm }, 60000);
}

// Convierte texto en voz; alTrozo(pcm16, hz) va recibiendo el audio de a oraciones.
// Devuelve false si se cortó antes de terminar.
async function decir(texto, voz, velocidad, alTrozo) {
  const rutas = modelos.rutas(modelos.idDeVoz(voz) || '');
  if (!rutas) throw new Error('Esa voz no está instalada.');
  if (!hijo) lanzar();
  return pedir({ tipo: 'decir', texto, voz: rutas, velocidad }, 90000, alTrozo);
}
function callar() { if (hijo) mandar({ tipo: 'callar' }); }

function apagar() {
  const proceso = hijo;
  alSalir(0);
  try { if (proceso) proceso.kill(); } catch {}
}

// Solo para las pruebas automáticas: simula que el proceso de voz entregó una frase.
const alSegmentoDePrueba = (pcm) => oyentes.segmento(pcm, pcm.length / 16000);

const diagnostico = () => ({ andando: !!hijo, cargado, error: ultimoError, registro: registro.slice(-12) });

module.exports = { modoMusica, preparar, escuchar, audio, vigilar, alVigilia, transcribir, decir, callar, apagar, alHabla, alNada, alSegmento, alSegmentoDePrueba, diagnostico };
