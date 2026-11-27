// Rutinas que se hacen solas: a una hora (y en qué días), al abrir un juego o un programa, al conectar un aparato
// de audio (auriculares, parlante Bluetooth), al llegar a casa con el celular y al prender la PC (cuando arranca Jarvis).
// Cada rutina guarda sus disparadores en rutina.disparadores = [{ tipo, ... }].
//   hora:      { hora: 'HH:MM', dias: [0..6] }  (0 = domingo; vacío = todos los días)
//   juego:     { juego: nombre, carpeta }        (cualquier .exe dentro de la carpeta del juego de Steam)
//   programa:  { proceso: 'Discord.exe' }
//   audio:     { salida: nombre del aparato }    (cuando aparece en la lista de salidas de Windows)
//   llegar:    {}                                (el celular vinculado vuelve a la Wi-Fi de casa)
//   inicio:    {}                                (al abrir Jarvis, o sea, al prender la PC si arranca con Windows)
const path = require('path');

let f = {
  rutinas: () => [],
  correr: async () => {}, // (id, motivo)
  procesos: async () => [], // rutas de los .exe abiertos
  salidas: async () => [], // [{ nombre }]
  ahora: () => new Date(),
};
const ultimaVez = new Map(); // id de rutina + disparador → cuándo se hizo (para no repetir)
let abiertos = null; // Set de rutas, la vuelta anterior
let aparatos = null; // Set de nombres de salidas de audio
let reloj = null;
let girando = false;

function configurar(x = {}) { f = { ...f, ...x }; }
const clave = (r, d, i) => `${r.id}#${i}#${d.tipo}`;
const conDisparador = (tipo) => f.rutinas().filter((r) => Array.isArray(r.disparadores) && r.disparadores.some((d) => d && d.tipo === tipo));

async function hacer(r, d, i, motivo, espera = 120000) {
  const k = clave(r, d, i);
  if (Date.now() - (ultimaVez.get(k) || 0) < espera) return false;
  ultimaVez.set(k, Date.now());
  try { await f.correr(r.id, motivo); } catch {}
  return true;
}
const normal = (x) => String(x || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');

async function vuelta() {
  if (girando) return;
  girando = true;
  try {
    const ahora = f.ahora();
    const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    for (const r of conDisparador('hora')) {
      r.disparadores.forEach((d, i) => {
        if (d.tipo !== 'hora' || d.hora !== hhmm) return;
        if (Array.isArray(d.dias) && d.dias.length && !d.dias.includes(ahora.getDay())) return;
        hacer(r, d, i, `son las ${d.hora}`, 90000);
      });
    }
    const porProceso = [...conDisparador('juego'), ...conDisparador('programa')];
    if (porProceso.length) {
      const lista = (await f.procesos()).map(normal);
      const ahoraSet = new Set(lista);
      if (abiertos) {
        const nuevos = lista.filter((p) => !abiertos.has(p));
        if (nuevos.length) {
          for (const r of porProceso) {
            r.disparadores.forEach((d, i) => {
              let motivo = '';
              if (d.tipo === 'juego' && d.carpeta && nuevos.some((p) => p.startsWith(`${normal(d.carpeta)}/`))) motivo = `abriste ${d.juego || 'el juego'}`;
              if (d.tipo === 'programa' && d.proceso && nuevos.some((p) => path.posix.basename(p) === normal(d.proceso) || path.posix.basename(p) === `${normal(d.proceso)}.exe`)) motivo = `abriste ${d.proceso}`;
              // Un juego abre varios .exe seguidos (launcher, juego): con 10 minutos de margen se hace una sola vez.
              if (motivo) hacer(r, d, i, motivo, 10 * 60000);
            });
          }
        }
      }
      abiertos = ahoraSet;
    } else abiertos = null;
    const porAudio = conDisparador('audio');
    if (porAudio.length) {
      let lista = [];
      try { lista = (await f.salidas()).map((x) => normal(x.nombre || x)); } catch {}
      if (aparatos) {
        const nuevos = lista.filter((n) => !aparatos.has(n));
        for (const r of porAudio) {
          r.disparadores.forEach((d, i) => {
            if (d.tipo === 'audio' && d.salida && nuevos.some((n) => n.includes(normal(d.salida)))) hacer(r, d, i, `conectaste ${d.salida}`, 5 * 60000);
          });
        }
      }
      aparatos = new Set(lista);
    } else aparatos = null;
  } finally { girando = false; }
}

// Llamadas desde afuera: el celular avisa que llegó a casa; Jarvis acaba de arrancar.
async function evento(tipo, motivo) {
  const hechas = [];
  for (const r of conDisparador(tipo)) {
    for (const [i, d] of r.disparadores.entries()) {
      if (d.tipo === tipo && await hacer(r, d, i, motivo, tipo === 'llegar' ? 30 * 60000 : 120000)) hechas.push(r.nombre);
    }
  }
  return hechas;
}

function iniciar(cada = 20000) {
  detener();
  vuelta();
  reloj = setInterval(vuelta, cada);
  if (reloj.unref) reloj.unref();
}
function detener() { clearInterval(reloj); reloj = null; }
const _reiniciar = () => { ultimaVez.clear(); abiertos = null; aparatos = null; };

// Texto para mostrar ("Se hace sola: lunes a viernes a las 08:30 · al abrir CS2").
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function describir(d) {
  switch (d && d.tipo) {
    case 'hora': {
      const dias = Array.isArray(d.dias) && d.dias.length && d.dias.length < 7 ? (d.dias.join() === '1,2,3,4,5' ? 'de lunes a viernes ' : d.dias.join() === '0,6' ? 'los fines de semana ' : `${d.dias.map((x) => DIAS[x]).join(', ')} `) : 'todos los días ';
      return `${dias}a las ${d.hora || '--:--'}`;
    }
    case 'juego': return `al abrir ${d.juego || 'un juego'}`;
    case 'programa': return `al abrir ${d.proceso || 'un programa'}`;
    case 'audio': return `al conectar ${d.salida || 'un aparato de audio'}`;
    case 'llegar': return 'al llegar a casa (con el celular)';
    case 'inicio': return 'al prender la PC';
    default: return '';
  }
}

module.exports = { configurar, iniciar, detener, vuelta, evento, describir, _reiniciar };
