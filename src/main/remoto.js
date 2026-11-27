// Control de la PC desde el celular: mover el mouse y hacer clic (como un touchpad), escribir, teclas especiales,
// música y volumen (teclas multimedia), bloquear, suspender, apagar y reiniciar. En Windows usa un PowerShell
// que queda abierto (así cada movimiento llega al toque) con las funciones de user32.dll.
const { spawn, execFile } = require('child_process');

let ps = null;
let cola = [];
const PREPARAR = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class JarvisRemoto {
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool LockWorkStation();
  public static void Tecla(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Combo(byte a, byte b) { keybd_event(a, 0, 0, UIntPtr.Zero); keybd_event(b, 0, 0, UIntPtr.Zero); keybd_event(b, 0, 2, UIntPtr.Zero); keybd_event(a, 0, 2, UIntPtr.Zero); }
}
"@
`;
function proceso() {
  if (process.platform !== 'win32') throw new Error('El control de la PC funciona en Windows.');
  if (ps && !ps.killed && ps.exitCode === null) return ps;
  ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  ps.on('exit', () => { ps = null; });
  ps.stdin.write(PREPARAR + '\n');
  return ps;
}
let reloj = null;
// Si en 3 minutos nadie lo usa, se cierra (no queda nada abierto de más).
function correr(linea) {
  if (process.env.JARVIS_REMOTO_LOG) { require('fs').appendFileSync(process.env.JARVIS_REMOTO_LOG, `${linea}\n`); return; } // pruebas
  const p = proceso();
  p.stdin.write(`${linea}\n`);
  clearTimeout(reloj);
  reloj = setTimeout(() => { try { if (ps) ps.stdin.end(); } catch {} }, 180000);
  if (reloj.unref) reloj.unref();
}
const entero = (x, max = 2000) => Math.max(-max, Math.min(max, Math.round(Number(x) || 0)));
const VK = { play: 0xB3, siguiente: 0xB0, anterior: 0xB1, subir: 0xAF, bajar: 0xAE, mudo: 0xAD, win: 0x5B };
// Teclas especiales de SendKeys (el resto del texto se escribe tal cual, escapando + ^ % ~ ( ) { } [ ]).
const ESPECIALES = { enter: '{ENTER}', borrar: '{BS}', esc: '{ESC}', tab: '{TAB}', arriba: '{UP}', abajo: '{DOWN}', izquierda: '{LEFT}', derecha: '{RIGHT}', suprimir: '{DEL}', inicio: '{HOME}', fin: '{END}', f5: '{F5}', f11: '{F11}', 'alt-tab': '%{TAB}', 'alt-f4': '%{F4}', copiar: '^c', pegar: '^v', deshacer: '^z', espacio: ' ' };
const escaparSendKeys = (t) => String(t).replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`);
const comillas = (t) => `'${String(t).replace(/'/g, "''")}'`;

async function hacer(o = {}) {
  switch (o.tipo) {
    case 'mover': correr(`[JarvisRemoto]::mouse_event(1, ${entero(o.dx)}, ${entero(o.dy)}, 0, [UIntPtr]::Zero)`); return '';
    case 'clic': {
      const [abajo, arriba] = o.boton === 'derecho' ? [8, 16] : o.boton === 'medio' ? [32, 64] : [2, 4];
      const veces = o.doble ? 2 : 1;
      for (let i = 0; i < veces; i++) correr(`[JarvisRemoto]::mouse_event(${abajo}, 0, 0, 0, [UIntPtr]::Zero); [JarvisRemoto]::mouse_event(${arriba}, 0, 0, 0, [UIntPtr]::Zero)`);
      return '';
    }
    case 'apretar': correr(`[JarvisRemoto]::mouse_event(${o.soltar ? 4 : 2}, 0, 0, 0, [UIntPtr]::Zero)`); return ''; // arrastrar: apretar, mover, soltar
    case 'rueda': correr(`[JarvisRemoto]::mouse_event(0x0800, 0, 0, ${entero(o.cuanto, 2400)}, [UIntPtr]::Zero)`); return '';
    case 'escribir': { const t = String(o.texto || '').slice(0, 2000); if (t) correr(`[System.Windows.Forms.SendKeys]::SendWait(${comillas(escaparSendKeys(t))})`); return ''; }
    case 'tecla': {
      if (o.tecla === 'win') { correr(`[JarvisRemoto]::Tecla(${VK.win})`); return ''; }
      if (o.tecla === 'escritorio') { correr(`[JarvisRemoto]::Combo(${VK.win}, 0x44)`); return ''; } // Win + D
      const k = ESPECIALES[o.tecla];
      if (!k) throw new Error('Tecla desconocida.');
      correr(`[System.Windows.Forms.SendKeys]::SendWait(${comillas(k)})`);
      return '';
    }
    case 'multimedia': { const vk = VK[o.tecla]; if (!vk) throw new Error('Tecla desconocida.'); correr(`[JarvisRemoto]::Tecla(${vk})`); return ''; }
    case 'bloquear': correr('[JarvisRemoto]::LockWorkStation() | Out-Null'); return 'Bloqueé la PC.';
    case 'suspender':
      setTimeout(() => correr("[System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false) | Out-Null"), 1500);
      return 'Suspendo la PC en un segundo.';
    case 'apagar': case 'reiniciar':
      await new Promise((ok, mal) => execFile('shutdown.exe', [o.tipo === 'apagar' ? '/s' : '/r', '/t', '20', '/c', 'Jarvis: pedido desde el celular'], { windowsHide: true }, (e) => (e ? mal(e) : ok())));
      return o.tipo === 'apagar' ? 'La PC se apaga en 20 segundos (tocá "Cancelar" si te equivocaste).' : 'La PC se reinicia en 20 segundos.';
    case 'cancelar-apagado':
      await new Promise((ok) => execFile('shutdown.exe', ['/a'], { windowsHide: true }, () => ok()));
      return 'Cancelado: la PC sigue prendida.';
    default: throw new Error('No sé hacer eso.');
  }
}
function cerrar() { try { if (ps) ps.kill(); } catch {} ps = null; cola = []; }
module.exports = { hacer, cerrar, _pruebas: { escaparSendKeys } };
