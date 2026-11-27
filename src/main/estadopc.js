// Estado de la PC: procesador, memoria, placa de video (temperatura y uso con nvidia-smi, si hay NVIDIA) y cuánto
// gasta cada parte de Jarvis. Sirve para el widget del notch, el del celular y Ajustes → Sistema → Estado de la PC
// (de ahí salen los números para optimizar Jarvis con datos reales).
const os = require('os');
const { execFile } = require('child_process');

let previo = tomarCpu();
let ultimoCpu = { cuando: 0, uso: 0 };
function tomarCpu() {
  const cs = os.cpus();
  let total = 0; let libre = 0;
  for (const c of cs) { for (const v of Object.values(c.times)) total += v; libre += c.times.idle; }
  return { total, libre };
}
function usoCpu() {
  if (Date.now() - ultimoCpu.cuando < 900) return ultimoCpu.uso;
  const ahora = tomarCpu();
  const dt = ahora.total - previo.total; const dl = ahora.libre - previo.libre;
  previo = ahora;
  const uso = dt > 0 ? Math.max(0, Math.min(100, Math.round((1 - dl / dt) * 100))) : 0;
  ultimoCpu = { cuando: Date.now(), uso };
  return uso;
}

// nvidia-smi viene con el driver de NVIDIA. Si no está, no se vuelve a probar en 10 minutos.
let gpu = { cuando: 0, dato: null, falla: 0 };
function leerGpu() {
  if (Date.now() - gpu.cuando < 4000 || Date.now() - gpu.falla < 600000) return Promise.resolve(gpu.dato);
  const exe = process.env.JARVIS_NVIDIA_SMI || 'nvidia-smi';
  return new Promise((ok) => {
    execFile(exe, ['--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,fan.speed,power.draw', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 4000 }, (e, salida) => {
      if (e || !salida) { gpu = { cuando: Date.now(), dato: null, falla: Date.now() }; ok(null); return; }
      const [nombre, temp, uso, memUsada, memTotal, ventilador, consumo] = String(salida).split(/\r?\n/)[0].split(',').map((x) => x.trim());
      const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
      gpu = { cuando: Date.now(), falla: 0, dato: { nombre, temp: n(temp), uso: n(uso), memUsada: n(memUsada), memTotal: n(memTotal), ventilador: n(ventilador), consumo: n(consumo) } };
      ok(gpu.dato);
    });
  });
}

const NOMBRES = { Browser: 'Principal', GPU: 'Gráficos', Utility: 'Servicio', Tab: 'Ventana', 'Pepper Plugin': 'Complemento', Zygote: 'Base' };
let iniciado = Date.now();
let ventanas = () => []; // () => [{ pid, nombre }] para ponerle nombre a cada proceso de ventana
let extras = () => []; // () => [{ pid, nombre }] procesos propios (ffmpeg, jarvis-red…)
function configurar(f = {}) { if (f.ventanas) ventanas = f.ventanas; if (f.extras) extras = f.extras; if (f.desde) iniciado = f.desde; }

function procesosJarvis() {
  let lista = [];
  try {
    const { app } = require('electron');
    const nombres = new Map(ventanas().map((v) => [v.pid, v.nombre]));
    lista = app.getAppMetrics().map((m) => ({
      pid: m.pid,
      nombre: nombres.get(m.pid) || m.name || NOMBRES[m.type] || m.type,
      tipo: m.type,
      cpu: Math.round(((m.cpu && m.cpu.percentCPUUsage) || 0) * 10) / 10,
      memMB: Math.round(((m.memory && (m.memory.privateBytes || m.memory.workingSetSize)) || 0) / 1024),
    }));
  } catch {}
  for (const x of extras()) if (x && x.pid && !lista.some((p) => p.pid === x.pid)) lista.push({ pid: x.pid, nombre: x.nombre, tipo: 'Externo', cpu: null, memMB: null });
  return lista.sort((a, b) => (b.memMB || 0) - (a.memMB || 0));
}

async function leer({ detalle = false } = {}) {
  const total = os.totalmem(); const libre = os.freemem();
  const procesos = procesosJarvis();
  const cpus = os.cpus();
  return {
    cpu: { uso: usoCpu(), nombre: (cpus[0] && cpus[0].model || '').replace(/\s+/g, ' ').trim(), nucleos: cpus.length },
    ram: { usadaMB: Math.round((total - libre) / 1048576), totalMB: Math.round(total / 1048576), uso: Math.round(((total - libre) / total) * 100) },
    gpu: await leerGpu(),
    jarvis: {
      cpu: Math.round(procesos.reduce((n, p) => n + (p.cpu || 0), 0) * 10) / 10,
      memMB: procesos.reduce((n, p) => n + (p.memMB || 0), 0),
      procesos: detalle ? procesos : undefined,
      abiertoDesde: iniciado,
    },
    encendidaDesde: Date.now() - os.uptime() * 1000,
    cuando: Date.now(),
  };
}

module.exports = { leer, configurar, usoCpu, _pruebas: { procesosJarvis } };
