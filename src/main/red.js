// Tailscale adentro de Jarvis: para usar Jarvis desde el celular fuera de casa sin instalar la app de Tailscale.
// Arranca jarvis-red.exe (red/pc, viene con el instalador), que une esta PC a la red privada de Tailscale del usuario
// y le pasa a Jarvis lo que llega por ahí al puerto del celular. La primera vez hay que iniciar sesión (un enlace).
// La sesión queda en datos/tailscale. Si Jarvis se cierra, jarvis-red se cierra solo (se le cierra stdin).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { RAIZ, DATOS } = require('./config');

let proc = null;
let estado = { estado: 'apagado' };
let alCambiar = () => {};
let anotar = () => {};
function configurar(f) { if (f.alCambiar) alCambiar = f.alCambiar; if (f.anotar) anotar = f.anotar; }

function exe() {
  const nombre = process.platform === 'win32' ? 'jarvis-red.exe' : 'jarvis-red';
  const lugares = [process.env.JARVIS_RED, process.resourcesPath && path.join(process.resourcesPath, 'red', nombre), path.join(RAIZ, 'build', 'red', nombre)];
  return lugares.find((x) => x && fs.existsSync(x)) || '';
}
const carpeta = () => path.join(DATOS, 'tailscale');
const nombrePC = () => `jarvis-${os.hostname().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pc'}`;
const cambiar = (nuevo) => { estado = nuevo; alCambiar(estado); };

function iniciar(puerto) {
  if (proc) return;
  const ruta = exe();
  if (!ruta) { cambiar({ estado: 'no-disponible' }); return; }
  fs.mkdirSync(carpeta(), { recursive: true });
  cambiar({ estado: 'Starting' });
  const p = spawn(ruta, ['-dir', carpeta(), '-nombre', nombrePC(), '-destino', `127.0.0.1:${puerto}`, '-puerto', String(puerto)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  proc = p;
  let resto = '';
  p.stdout.on('data', (d) => {
    resto += d;
    const lineas = resto.split('\n'); resto = lineas.pop();
    for (const l of lineas) {
      try {
        const m = JSON.parse(l);
        if (m.estado === 'Running' && estado.estado !== 'Running') anotar(`Tailscale integrado: conectado como ${m.nombre || m.ip}.`);
        cambiar(m);
      } catch {}
    }
  });
  p.stderr.on('data', () => {});
  p.on('exit', (codigo) => {
    if (proc === p) { proc = null; if (estado.estado !== 'apagado') cambiar(codigo ? { estado: 'error', texto: estado.texto || `se cerró (código ${codigo})` } : { estado: 'apagado' }); }
  });
  p.on('error', (e) => { if (proc === p) { proc = null; cambiar({ estado: 'error', texto: e.message }); } });
}

function detener() {
  if (!proc) return;
  const p = proc; proc = null;
  cambiar({ estado: 'apagado' });
  try { p.stdin.end(); } catch {}
  setTimeout(() => { try { p.kill(); } catch {} }, 3000);
}

// Cierra la sesión de Tailscale de esta PC (para usar otra cuenta o dejar de usarlo).
async function salir() {
  const ruta = exe();
  detener();
  if (!ruta) return;
  await new Promise((ok) => {
    const p = spawn(ruta, ['-dir', carpeta(), '-nombre', nombrePC(), '-salir'], { windowsHide: true, stdio: 'ignore' });
    const reloj = setTimeout(() => { try { p.kill(); } catch {} ok(); }, 20000);
    p.on('exit', () => { clearTimeout(reloj); ok(); });
    p.on('error', () => { clearTimeout(reloj); ok(); });
  });
  cambiar({ estado: 'apagado' });
}

const leer = () => ({ ...estado, disponible: !!exe() });
const ip = () => (estado.estado === 'Running' && estado.ip ? estado.ip : '');

module.exports = { configurar, iniciar, detener, salir, estado: leer, ip, nombrePC };
