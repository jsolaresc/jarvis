// Clips: "repetición instantánea" propia (como la de NVIDIA, pero que no se desconfigura sola).
// Una ventana oculta (ui/clips.js) captura la pantalla con el sonido de Windows y/o el micrófono y la va entregando en
// pedacitos de unos 6 segundos; acá se guardan los últimos y, cuando se pide un clip, se unen con ffmpeg en un mp4
// dentro de la carpeta del juego. Todo gratis y local; ffmpeg se baja una sola vez (modelos.js) la primera vez.
//
// Límites conocidos: la captura es la de Windows para cualquier programa en ventana o "ventana sin bordes"; un juego en
// pantalla completa exclusiva puede salir negro (en ese caso, pasarlo a ventana sin bordes).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { leerConfig, panelDeModo, DATOS } = require('./config');
const modelos = require('./modelos');

const BUFFER = path.join(DATOS, 'clips-buffer');
const TEMPORAL = path.join(DATOS, 'clips-temporal');
const PEDAZO_MS = 6000;
const LIMITE_WHATSAPP = 15.5 * 1024 * 1024;

let elegirFuente = async () => null; // (modo) → { fuenteId, recorte, nombre } | { clips: true } | null si se cancela
let abrirVentana = async () => { throw new Error('Los clips no están listos.'); };
let ordenar = () => {};
let avisarUsuario = () => {};
let pedazos = []; // { archivo, inicio, fin, audio }
let muestras = []; // { t, proceso, producto, titulo }: qué programa estaba al frente
let espiaPrimerPlano = null;
let activa = false;
let encendiendo = null;
let esperaPedazo = [];
let ultimoClip = null; // { archivo, juego, segundos }
let grabacion = null; // { archivo, inicio, pausado, audio, juego, escritura }
let estadoVentana = {};
let ultimoError = '';
let trabajando = false;

function configurar(f) {
  if (f.abrirVentana) abrirVentana = f.abrirVentana;
  if (f.ordenar) ordenar = f.ordenar;
  if (f.elegirFuente) elegirFuente = f.elegirFuente;
  if (f.avisar) avisarUsuario = f.avisar;
}
const cfg = () => leerConfig().clips;
const modoActual = () => { const c = leerConfig(); return (c.modos || []).find((m) => m.id === c.modo); };
const permitidoAhora = () => !!cfg().activo && panelDeModo(modoActual()).clips;

// ---------- ffmpeg ----------
let huerfanosLimpios = false;
function rutaFfmpeg() {
  if (process.env.JARVIS_FFMPEG) return process.env.JARVIS_FFMPEG;
  const r = modelos.rutas('ffmpeg');
  return r ? r.modelo : null;
}
async function asegurarFfmpeg() {
  let ruta = rutaFfmpeg();
  if (!ruta) {
    await modelos.bajar('ffmpeg'); // la primera vez baja ~80 MB
    ruta = rutaFfmpeg();
    if (!ruta) throw new Error('No pude preparar la herramienta de video (ffmpeg).');
  }
  if (!huerfanosLimpios) { huerfanosLimpios = true; limpiarHuerfanos(ruta); }
  return ruta;
}
const hijosFfmpeg = new Set();
function matarFfmpeg() { for (const h of hijosFfmpeg) { try { h.kill(); } catch {} } hijosFfmpeg.clear(); }
// Si Jarvis se cerró mal (o una versión anterior se colgó), puede haber quedado un ffmpeg nuestro trabajando solo y comiendo procesador.
function limpiarHuerfanos(ruta) {
  if (process.platform !== 'win32' || !ruta) return;
  try {
    const guion = `Get-Process ffmpeg -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${ruta.replace(/'/g, "''")}' } | Stop-Process -Force`;
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(guion, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
  } catch {}
}
function correr(ruta, args, { espera = 5 * 60 * 1000 } = {}) {
  return new Promise((ok, mal) => {
    const hijo = spawn(ruta, args, { windowsHide: true });
    hijosFfmpeg.add(hijo);
    hijo.on('close', () => hijosFfmpeg.delete(hijo));
    let err = '';
    hijo.stderr.on('data', (d) => { err += d; if (err.length > 200000) err = err.slice(-100000); });
    const reloj = setTimeout(() => { try { hijo.kill(); } catch {} mal(new Error('ffmpeg tardó demasiado.')); }, espera);
    hijo.on('error', (e) => { clearTimeout(reloj); mal(e); });
    hijo.on('close', (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) ok(err); else mal(Object.assign(new Error(`ffmpeg falló (código ${codigo}): ${err.split(/\r?\n/).filter(Boolean).slice(-3).join(' | ')}`), { salida: err }));
    });
    try { os.setPriority(hijo.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {} // que no le robe fluidez al juego
  });
}
const duracionDe = (salida) => { const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(salida); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; };

// ---------- Qué programa está al frente (para separar los clips por juego) ----------
const IGNORAR = /^(jarvis|electron|explorer|shellexperiencehost|searchhost|searchapp|startmenuexperiencehost|applicationframehost|textinputhost|lockapp|dwm|taskmgr|powershell|pwsh|cmd|conhost|windowsterminal|screensketch|snippingtool|obs64|nvidia share|nvcontainer|nvidia overlay|msiafterburner|rtss|discord)$/i;
const PRODUCTO_GENERICO = /microsoft|windows|electron|chromium|java|openjdk|runtime|launcher|^unity$|^unreal/i;
function lineaAMuestra(linea, t = Date.now()) {
  const [proceso = '', producto = '', ...titulo] = String(linea).replace(/\r/g, '').split('|');
  if (!proceso.trim()) return null;
  return { t, proceso: proceso.trim(), producto: producto.trim(), titulo: titulo.join('|').trim() };
}
function empezarAEspiar() {
  if (espiaPrimerPlano || process.platform !== 'win32') return;
  // Liviano: el nombre y el producto del programa se consultan una sola vez por proceso (es lo caro: abre el módulo principal);
  // en cada vuelta solo se pregunta qué ventana está al frente y su título (una llamada directa a Windows).
  const guion = `
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class JW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$cache = @{}
$sb = New-Object System.Text.StringBuilder 256
$vueltas = 0
while ($true) {
  try {
    $vueltas++
    if ($vueltas % 150 -eq 0) { $cache.Clear() }
    $h = [JW]::GetForegroundWindow(); $p = 0; [void][JW]::GetWindowThreadProcessId($h, [ref]$p)
    if (-not $cache.ContainsKey($p)) {
      $pr = Get-Process -Id $p -ErrorAction Stop; $prod = ''
      try { $prod = $pr.MainModule.FileVersionInfo.ProductName } catch {}
      $cache[$p] = "$($pr.ProcessName)|$prod"
    }
    [void]$sb.Clear(); [void][JW]::GetWindowText($h, $sb, 256)
    "$($cache[$p])|$($sb.ToString())"
  } catch { "|" }
  Start-Sleep -Seconds 2
}`;
  const codificado = Buffer.from(guion, 'utf16le').toString('base64');
  const hijo = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', codificado], { windowsHide: true });
  espiaPrimerPlano = hijo;
  let resto = '';
  hijo.stdout.setEncoding('utf8');
  hijo.stdout.on('data', (d) => {
    resto += d;
    const lineas = resto.split('\n'); resto = lineas.pop();
    for (const l of lineas) { const m = lineaAMuestra(l); if (m) { muestras.push(m); } }
    const corte = Date.now() - (cfg().segundos + 120) * 1000;
    while (muestras.length && muestras[0].t < corte) muestras.shift();
  });
  hijo.on('close', () => { if (espiaPrimerPlano === hijo) espiaPrimerPlano = null; });
  hijo.on('error', () => { espiaPrimerPlano = null; });
}
function dejarDeEspiar() {
  if (espiaPrimerPlano) { try { espiaPrimerPlano.kill(); } catch {} espiaPrimerPlano = null; }
}

const limpiarNombre = (n) => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 60);
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// El nombre de la carpeta: lo que el usuario puso en Ajustes para ese programa; si no, el "producto" del ejecutable
// (los juegos suelen traer su nombre ahí), si no, el título de la ventana (cuando es corto) o el nombre del proceso.
function nombreDeJuego(m, nombres = {}) {
  if (!m) return '';
  const propio = nombres[m.proceso.toLowerCase()] || nombres[m.proceso];
  if (propio) return limpiarNombre(propio);
  if (m.producto && !PRODUCTO_GENERICO.test(m.producto) && m.producto.length >= 3) return limpiarNombre(m.producto);
  if (m.titulo && m.titulo.length <= 40 && !/ - /.test(m.titulo)) return limpiarNombre(m.titulo);
  return limpiarNombre(mayuscula(m.proceso.replace(/[-_]?(win64|win32|shipping)/gi, '').replace(/[-_]+/g, ' ')));
}
// El programa que más estuvo al frente en el tramo [desde, hasta] (sin contar el escritorio, Jarvis, Discord…).
function elegirJuego(desde, hasta, lista = muestras, nombres = cfg().nombres) {
  const cuenta = new Map();
  for (const m of lista) {
    if (m.t < desde - 3000 || m.t > hasta + 3000 || IGNORAR.test(m.proceso)) continue;
    const e = cuenta.get(m.proceso) || { n: 0, m };
    e.n++; e.m = m;
    cuenta.set(m.proceso, e);
  }
  const mejor = [...cuenta.values()].sort((a, b) => b.n - a.n)[0];
  return mejor ? nombreDeJuego(mejor.m, nombres) : '';
}

// ---------- Encender y apagar ----------
// Lo que obliga a reiniciar la captura si cambia (resolución, cuadros, fuentes de audio, micrófono) y lo que se aplica en vivo (volúmenes).
let firmaEncendida = '';
let volumenesEncendidos = '';
const firmaDe = () => { const c = cfg(); return JSON.stringify([c.calidad, c.fps, c.sistema, c.microfono, kbpsAudio(), leerConfig().voz.microfono || '', c.pantalla]); };
const volumenesDe = () => { const c = cfg(); return JSON.stringify([c.volumenMic, c.volumenSistema]); };
function carpetaLimpia(dir) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); }
async function encender() {
  if (activa || encendiendo) return encendiendo;
  encendiendo = (async () => {
    try {
      carpetaLimpia(BUFFER); pedazos = []; muestras = []; ultimoError = '';
      await asegurarFfmpeg();
      await abrirVentana();
      empezarAEspiar();
      firmaEncendida = firmaDe();
      volumenesEncendidos = volumenesDe();
      ordenar('iniciar', { ...cfg(), dispositivoMic: leerConfig().voz.microfono || '' });
      activa = true;
      registrarAtajo();
    } catch (e) { ultimoError = e.message; activa = false; avisarUsuario(`Clips: ${e.message}`); }
    finally { encendiendo = null; }
  })();
  return encendiendo;
}
function apagar() {
  if (!activa && !encendiendo) return;
  activa = false;
  ordenar('detener', {});
  dejarDeEspiar();
  if (registrar && atajoRegistrado) { registrar.quitar(atajoRegistrado); atajoRegistrado = ''; }
  pedazos = [];
  try { carpetaLimpia(BUFFER); } catch {}
}
// Se llama cuando cambia la configuración o el modo: enciende o apaga según corresponda.
function sincronizar() {
  const debe = permitidoAhora();
  if (debe && !activa) return encender();
  if (!debe && (activa || encendiendo)) apagar();
  if (debe && activa && cfg().atajo !== atajoRegistrado) registrarAtajo();
  if (debe && activa && !grabacion && !trabajando && firmaDe() !== firmaEncendida) { apagar(); return encender(); } // cambió la resolución, el audio o el micrófono: se reinicia (el buffer vuelve a empezar)
  if (debe && activa && volumenesDe() !== volumenesEncendidos) { volumenesEncendidos = volumenesDe(); ordenar('volumenes', { volumenMic: cfg().volumenMic, volumenSistema: cfg().volumenSistema }); } // los volúmenes se aplican en vivo
  return Promise.resolve();
}
let atajoRegistrado = '';
let registrar = null; // (atajo, fn) => bool   y   quitar(atajo)
function usarAtajos(f) { registrar = f; }
function registrarAtajo() {
  if (!registrar) return;
  const nuevo = cfg().atajo;
  if (atajoRegistrado) registrar.quitar(atajoRegistrado);
  atajoRegistrado = '';
  if (nuevo && registrar.poner(nuevo, () => guardarYAvisar().catch(() => {}))) atajoRegistrado = nuevo;
}

// ---------- Lo que llega de la ventana ----------
function recibirPedazo(meta, datos) {
  if (meta && !meta.vacio && datos && datos.byteLength) {
    const archivo = path.join(BUFFER, `p-${meta.inicio}.webm`);
    try {
      fs.mkdirSync(BUFFER, { recursive: true });
      fs.writeFileSync(archivo, Buffer.from(datos));
      pedazos.push({ archivo, inicio: meta.inicio, fin: meta.fin, audio: !!meta.audio });
    } catch (e) { ultimoError = e.message; }
  }
  // Se guardan los de los últimos N segundos (+ margen).
  const corte = Date.now() - (cfg().segundos + 20) * 1000;
  while (pedazos.length && pedazos[0].fin < corte) { try { fs.unlinkSync(pedazos[0].archivo); } catch {} pedazos.shift(); }
  const esperando = esperaPedazo; esperaPedazo = [];
  for (const ok of esperando) ok();
}
function cortarYEsperar() {
  return new Promise((ok) => {
    const reloj = setTimeout(ok, 5000);
    esperaPedazo.push(() => { clearTimeout(reloj); ok(); });
    ordenar('girar', {});
  });
}

// ---------- Armar un clip ----------
const BITRATE_SALIDA = { '480p': '2M', '720p': '4M', '1080p': '8M', '1440p': '12M' };
// Calidad del audio del clip: 96 / 128 / 192 kbps (en el video casi no se nota el peso; lo que pesa es la imagen).
const kbpsAudio = () => { const n = Number(cfg().audioKbps); return [96, 128, 192].includes(n) ? n : 128; };
function argumentosDeUnion(elegidos, desdeSeg, destino, codificador, largo, mudos = []) {
  const entradas = elegidos.flatMap((p) => ['-i', p.archivo]);
  const conAudio = elegidos.every((p) => p.audio);
  // Cada pedazo se deja de EXACTAMENTE lo que duró (según el reloj de Jarvis): los videos de pantalla casi quieta traen pocos cuadros y
  // marcas de tiempo raras, y sin esto la unión podía alargarse sin límite (un clip de 1,5 min llegó a pesar cientos de MB).
  const partes = elegidos.map((p, i) => {
    const d = Math.max(0.5, Math.min(15, (p.fin - p.inicio) / 1000)).toFixed(3);
    return `[${i}:v]setpts=PTS-STARTPTS,fps=${cfg().fps || 30},tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS[v${i}];`
      + (conAudio ? `[${i}:a]aresample=48000,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}];` : '');
  }).join('');
  const uniones = elegidos.map((_, i) => `[v${i}]${conAudio ? `[a${i}]` : ''}`).join('');
  // Lo que se habló con Jarvis (tu pedido y su respuesta) se silencia: volumen 0 en esos tramos (tiempos de la línea ya unida).
  const silencios = mudos.length ? `volume=0:enable='${mudos.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+')}',` : '';
  const filtro = `${partes}${uniones}concat=n=${elegidos.length}:v=1:a=${conAudio ? 1 : 0}[v]${conAudio ? `[ac];[ac]${silencios}alimiter=limit=0.89:attack=4:release=60:level=disabled[a]` : ''}`;
  const calidad = codificador === 'h264_nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '24', '-b:v', BITRATE_SALIDA[cfg().calidad] || '4M']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '4'];
  return ['-y', '-hide_banner', ...entradas, '-filter_complex', filtro, '-map', '[v]', ...(conAudio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', `${kbpsAudio()}k`] : []),
    ...(desdeSeg > 0.3 ? ['-ss', desdeSeg.toFixed(2)] : []), ...(largo ? ['-t', (largo + 0.5).toFixed(2)] : []),
    ...calidad, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', destino];
}
// Se escribe en un archivo ".parte" y recién al terminar bien pasa a tener su nombre: así nunca queda en la carpeta un video a medias que no se puede abrir.
async function codificar(ruta, argsPara, destino, segundos = 90) {
  const parte = destino.replace(/\.mp4$/i, '') + '.parte.mp4';
  // Primero la placa de video (NVENC); si no hay o falla, el procesador. Con tiempo límite: nada de quedarse trabajando 15 minutos.
  for (const codificador of (process.env.JARVIS_SIN_NVENC ? ['libx264'] : ['h264_nvenc', 'libx264'])) {
    const espera = (codificador === 'h264_nvenc' ? 60 + segundos * 1.5 : 90 + segundos * 3) * 1000;
    try {
      await correr(ruta, argsPara(codificador, parte), { espera });
      const tam = fs.existsSync(parte) ? fs.statSync(parte).size : 0;
      if (tam < 1000) throw new Error('El video quedó vacío.');
      fs.renameSync(parte, destino);
      return;
    } catch (e) {
      try { fs.unlinkSync(parte); } catch {}
      if (codificador === 'libx264') throw e;
    }
  }
}

const dos = (n) => String(n).padStart(2, '0');
function nombreDeArchivo(juego, fecha = new Date()) {
  const marca = `${fecha.getFullYear()}.${dos(fecha.getMonth() + 1)}.${dos(fecha.getDate())} - ${dos(fecha.getHours())}.${dos(fecha.getMinutes())}.${dos(fecha.getSeconds())}`;
  return `${juego || 'Clip'} ${marca}.mp4`;
}
function destinoDe(juego, fecha) {
  const c = cfg();
  const carpetaJuego = c.porJuego ? path.join(c.carpeta, juego || c.sinJuego || 'Varios') : c.carpeta;
  fs.mkdirSync(carpetaJuego, { recursive: true });
  return path.join(carpetaJuego, nombreDeArchivo(juego, fecha));
}

// ---------- Que Jarvis no salga en los clips ----------
// Su voz y la tuya hablándole se silencian en el clip: el cerebro avisa cuándo habló el usuario (silenciarJarvis) y cuándo habla Jarvis
// (jarvisHabla). Después se pasan a tiempos del clip ya unido (mudosEnLinea) y ffmpeg les baja el volumen a cero.
let intervalosJarvis = []; // [{ desde, hasta }] en ms
let jarvisDesde = 0;
function silenciarJarvis(desde, hasta) {
  if (!(Number(hasta) > Number(desde))) return;
  intervalosJarvis.push({ desde: Number(desde), hasta: Number(hasta) });
  const corte = Date.now() - 30 * 60 * 1000;
  intervalosJarvis = intervalosJarvis.filter((x) => x.hasta > corte).slice(-300);
}
function jarvisHabla(habla) {
  if (habla && !jarvisDesde) jarvisDesde = Date.now();
  else if (!habla && jarvisDesde) { silenciarJarvis(jarvisDesde, Date.now() + 500); jarvisDesde = 0; }
}
// Los tramos mudos, en segundos desde el principio del clip armado con "elegidos" (cada pedazo cuenta lo que duró, como en la unión).
function mudosEnLinea(elegidos, intervalos, ahora = Date.now(), margen = 0.15) {
  const todos = [...intervalos, ...(jarvisDesde ? [{ desde: jarvisDesde, hasta: ahora }] : [])];
  const salida = [];
  let base = 0;
  for (const p of elegidos) {
    const d = Math.max(0.5, Math.min(15, (p.fin - p.inicio) / 1000));
    for (const iv of todos) {
      const a = Math.max(iv.desde, p.inicio); const b = Math.min(iv.hasta, p.fin);
      if (b > a) salida.push([Math.max(0, base + (a - p.inicio) / 1000 - margen), Math.min(base + d, base + (b - p.inicio) / 1000 + margen)]);
    }
    base += d;
  }
  salida.sort((x, y) => x[0] - y[0]);
  const unidos = [];
  for (const t of salida) { const u = unidos[unidos.length - 1]; if (u && t[0] <= u[1]) u[1] = Math.max(u[1], t[1]); else unidos.push([...t]); }
  return unidos;
}
const sinJarvis = () => cfg().sinJarvis !== false;

// El clip que se pide por voz no tiene que terminar con el propio pedido ("grabá los últimos 30 segundos"): el cerebro avisa desde cuándo
// empezó a hablar el usuario (estimado) y el clip termina unos segundos antes (Ajustes → Clips → "Cortar antes de mi pedido").
// En una misma conversación vale la PRIMERA frase: si Jarvis pregunta "¿lo hago?" y contestás "sí", el clip igual termina cuando
// empezaste el pedido (antes terminaba antes del "sí" y metía el pedido entero en el clip).
let pedidoDeVoz = null; // { desde, marcado }
function marcarPedidoDeVoz(desde, { primeraDeLaCharla = false } = {}) {
  const d = Number(desde);
  if (!(d > 0)) { pedidoDeVoz = null; return; }
  if (!primeraDeLaCharla && pedidoDeVoz && Date.now() - pedidoDeVoz.marcado < 60 * 1000 && pedidoDeVoz.desde < d) return; // ya hay una marca anterior de esta charla
  pedidoDeVoz = { desde: d, marcado: Date.now() };
}
function olvidarPedido() { pedidoDeVoz = null; }
// Hasta cuándo (ms) tiene que llegar el clip de este pedido, o 0 si no hay que recortar nada. La marca se usa una sola vez.
function finDelPedido() {
  const m = pedidoDeVoz;
  pedidoDeVoz = null;
  const margen = Math.max(0, Number(cfg().recorteDeVoz) || 0);
  if (!m || Date.now() - m.marcado > 90 * 1000) return 0; // 0 = sin pedido de voz: hasta ahora
  return m.desde - margen * 1000;
}

// Qué pedazos del buffer forman un clip de "pedido" segundos que termina en "hasta" (ms; sin eso, ahora). Si recortar el final deja casi
// nada (el buffer recién arrancó), se arma como siempre. Devuelve { elegidos, total, desde, largo } (segundos) o null si no hay nada.
function elegirPedazos(lista, pedido, hasta, ahora = Date.now()) {
  let tope = Number(hasta) > 0 && Number(hasta) < ahora ? Number(hasta) : ahora;
  const juntar = (t) => lista.filter((p) => p.fin > t - pedido * 1000 && p.inicio < t);
  let elegidos = juntar(tope);
  const queda = (t, e) => (e.length ? (Math.min(t, e[e.length - 1].fin) - Math.max(t - pedido * 1000, e[0].inicio)) / 1000 : 0);
  if (tope !== ahora && queda(tope, elegidos) < 1) { tope = ahora; elegidos = juntar(tope); }
  if (!elegidos.length) return null;
  const total = elegidos.reduce((s, p) => s + (p.fin - p.inicio), 0) / 1000;
  const sobra = Math.max(0, (elegidos[elegidos.length - 1].fin - tope) / 1000); // lo que queda después del tope en el último pedazo
  const desde = Math.max(0, total - sobra - pedido);
  return { elegidos, total, desde, largo: Math.min(pedido, total - sobra - desde) };
}

async function guardar({ segundos, etiqueta, hasta } = {}) {
  if (!activa) throw new Error(permitidoAhora() ? 'Los clips todavía están arrancando: probá en unos segundos.' : 'Los clips no están activos en este modo. Se prenden en Ajustes → Clips y en Ajustes → Modos.');
  if (trabajando) throw new Error('Ya estoy armando un clip.');
  trabajando = true;
  try {
    const pedido = Math.max(5, Math.min(600, Number(segundos) || cfg().segundos));
    await cortarYEsperar();
    const ahora = Date.now();
    const sel = elegirPedazos(pedazos, pedido, hasta, ahora);
    if (!sel) throw new Error('Todavía no hay nada grabado: el buffer recién arrancó.');
    const { elegidos, total, desde, largo } = sel;
    const inicio = elegidos[0].inicio;
    const fin = elegidos[elegidos.length - 1].fin;
    const juego = elegirJuego(inicio, fin);
    const fecha = new Date(fin);
    let destino = destinoDe(juego, fecha);
    if (etiqueta) destino = destino.replace(/(\.[^.\\/]+)$/, ` - ${nombreSeguro(etiqueta)}$1`); // "… - Kill.mp4"
    const ruta = await asegurarFfmpeg();
    const mudos = sinJarvis() ? mudosEnLinea(elegidos, intervalosJarvis) : [];
    await codificar(ruta, (cod, salida) => argumentosDeUnion(elegidos, desde, salida, cod, largo, mudos), destino, largo);
    ultimoClip = { archivo: destino, juego: juego || cfg().sinJuego, segundos: Math.round(largo) };
    return ultimoClip;
  } finally { trabajando = false; }
}

// ---------- Capturas de pantalla ----------
// Se guardan en las mismas carpetas que los clips (la del juego que está al frente), como PNG con el tamaño real de la pantalla.
// El notch no sale (está protegido de capturas), así que la imagen es lo que se ve sin Jarvis.
let ultimaCaptura = null; // { archivo, juego }
async function capturar() {
  const contexto = require('./contexto');
  let juego = '';
  try {
    const v = await contexto.ventanaActiva({ espera: 4000 });
    if (v && v.proceso && !IGNORAR.test(v.proceso)) juego = nombreDeJuego({ proceso: v.proceso, producto: v.producto, titulo: v.titulo }, cfg().nombres);
  } catch {}
  if (!juego) juego = elegirJuego(Date.now() - 20000, Date.now());
  const { png } = await contexto.capturarPantalla({ nativa: true });
  const fecha = new Date();
  const destino = destinoDe(juego, fecha).replace(/\.mp4$/i, '.png');
  fs.writeFileSync(destino, png);
  ultimaCaptura = { archivo: destino, juego: juego || cfg().sinJuego };
  return ultimaCaptura;
}
async function capturarYAvisar() {
  try {
    const c = await capturar();
    avisarUsuario(`Captura guardada${c.juego ? ` en ${c.juego}` : ''}`, 'ok');
    return c;
  } catch (e) { avisarUsuario(e.message, 'error'); throw e; }
}
// Para mandarla por WhatsApp: el PNG si es razonable; si pesa mucho (pantallas grandes), una copia en JPEG.
function capturaParaEnviar(archivo) {
  const datos = fs.readFileSync(archivo);
  if (datos.length <= 6 * 1024 * 1024) return datos;
  const { nativeImage } = require('electron');
  return nativeImage.createFromBuffer(datos).toJPEG(90);
}
const ultimaDeCaptura = () => ultimaCaptura;

const mmss = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${dos(Math.round(s % 60))}` : `${Math.round(s)} s`);
async function guardarYAvisar(opciones) {
  try {
    const c = await guardar(opciones);
    avisarUsuario(`Clip guardado (${mmss(c.segundos)})${c.juego ? ` en ${c.juego}` : ''}`, 'ok');
    return c;
  } catch (e) { avisarUsuario(e.message, 'error'); throw e; }
}

// ---------- Mandarlo por WhatsApp (<= 15 MB: si pesa más, se arma una copia más liviana) ----------
async function prepararParaEnviar(archivo) {
  const tamano = fs.statSync(archivo).size;
  if (tamano <= LIMITE_WHATSAPP) return { archivo, temporal: false };
  const ruta = await asegurarFfmpeg();
  const info = await correr(ruta, ['-hide_banner', '-i', archivo]).catch((e) => e.salida || '');
  const segundos = Math.max(1, duracionDe(info) || 60);
  const kbps = Math.max(250, Math.floor((14.2 * 8 * 1024) / segundos - 96)); // lo que entra en ~14 MB, menos el audio
  fs.mkdirSync(TEMPORAL, { recursive: true });
  const copia = path.join(TEMPORAL, `envio-${Date.now()}.mp4`);
  await codificar(ruta, (cod, salida) => ['-y', '-hide_banner', '-i', archivo, '-vf', "scale='min(1280,iw)':-2",
    ...(cod === 'h264_nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', `${kbps}k`, '-maxrate', `${Math.floor(kbps * 1.2)}k`, '-bufsize', `${kbps * 2}k`] : ['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${kbps}k`, '-maxrate', `${Math.floor(kbps * 1.2)}k`, '-bufsize', `${kbps * 2}k`, '-threads', '4']),
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', salida], copia, segundos);
  return { archivo: copia, temporal: true };
}

// ---------- Grabación completa a pedido ----------
function recibirTrozo(meta, datos) {
  if (!grabacion || !datos) return;
  grabacion.audio = !!meta.audio;
  grabacion.escritura.write(Buffer.from(datos));
}
// modo: 'pantalla' | 'ventana' | 'recuadro'. Sin modo (por voz, "empezá a grabar") graba la pantalla de los clips tal cual.
// Con modo, se pide elegir qué grabar (pantalla si hay varias, ventana o recuadro) y la grabación se hace aparte, a tamaño real.
async function empezarGrabacion(modo) {
  if (!activa) throw new Error('Los clips no están activos en este modo.');
  if (grabacion) throw new Error('Ya estoy grabando.');
  const elegido = modo ? await elegirFuente(modo) : { clips: true };
  if (!elegido) return 'Listo, no grabo nada.';
  if (grabacion) throw new Error('Ya estoy grabando.');
  fs.mkdirSync(TEMPORAL, { recursive: true });
  const archivo = path.join(TEMPORAL, `grabacion-${Date.now()}.webm`);
  grabacion = { archivo, inicio: Date.now(), pausado: false, audio: true, escritura: fs.createWriteStream(archivo), recorte: elegido.recorte || null, nombre: elegido.nombre || '' };
  ordenar('grabar', elegido.clips ? {} : { aparte: true, fuenteId: elegido.fuenteId });
  return elegido.nombre ? `Grabando ${elegido.nombre}.` : 'Grabando.';
}
// Si la captura propia no arrancó (o la ventana se cerró antes de empezar), se descarta lo que se había preparado.
function cancelarGrabacion() {
  const g = grabacion;
  if (!g) return;
  grabacion = null;
  try { g.escritura.end(); } catch {}
  setTimeout(() => { try { fs.unlinkSync(g.archivo); } catch {} }, 500);
}
// Filtro de ffmpeg para quedarse con el recuadro (fracciones de la pantalla, así no importa la resolución real de la captura).
function filtroDeRecorte(r) {
  if (!r) return null;
  const par = (x) => `trunc(${x}/2)*2`;
  const f = (n) => Number(n).toFixed(5);
  return `crop=${par(`iw*${f(r.w)}`)}:${par(`ih*${f(r.h)}`)}:${par(`iw*${f(r.x)}`)}:${par(`ih*${f(r.y)}`)}`;
}
function pausarGrabacion(pausar) {
  if (!grabacion) throw new Error('No estoy grabando.');
  grabacion.pausado = pausar;
  ordenar(pausar ? 'pausar' : 'seguir', {});
  return pausar ? 'Grabación en pausa.' : 'Sigo grabando.';
}
async function terminarGrabacion() {
  const g = grabacion;
  if (!g) throw new Error('No estoy grabando.');
  const cerro = new Promise((ok) => { g.alCerrar = ok; setTimeout(ok, 6000); });
  ordenar('parar', {});
  await cerro;
  grabacion = null;
  await new Promise((ok) => g.escritura.end(ok));
  const juego = elegirJuego(g.inicio, Date.now());
  const destino = destinoDe(juego, new Date());
  const ruta = await asegurarFfmpeg();
  const recorte = filtroDeRecorte(g.recorte);
  await codificar(ruta, (cod, salida) => ['-y', '-hide_banner', '-i', g.archivo, ...(recorte ? ['-vf', recorte] : []), ...(cod === 'h264_nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '24', '-b:v', BITRATE_SALIDA[cfg().calidad] || '4M'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '4']), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', `${kbpsAudio()}k`, '-movflags', '+faststart', salida], destino, (Date.now() - g.inicio) / 1000);
  try { fs.unlinkSync(g.archivo); } catch {}
  ultimoClip = { archivo: destino, juego: juego || cfg().sinJuego, segundos: Math.round((Date.now() - g.inicio) / 1000) };
  return ultimoClip;
}
function finDeTrozos() { if (grabacion && grabacion.alCerrar) grabacion.alCerrar(); }

// ---------- Los clips ya guardados (para verlos y mandarlos desde Ajustes) ----------
const esVideo = (n) => /\.(mp4|webm|mkv)$/i.test(n) && !/\.parte\./i.test(n);
// Solo se toca lo que está dentro de la carpeta de clips (nada de rutas de afuera).
function dentroDeCarpeta(archivo) {
  const raiz = path.resolve(cfg().carpeta);
  const real = path.resolve(String(archivo || ''));
  return real.startsWith(raiz + path.sep) && esVideo(path.basename(real));
}
function listar(limite = 30) {
  const raiz = cfg().carpeta;
  const salida = [];
  const mirar = (dir, nivel) => {
    let entradas = [];
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) { if (nivel < 2) mirar(ruta, nivel + 1); continue; }
      if (!e.isFile() || !esVideo(e.name)) continue;
      try {
        const st = fs.statSync(ruta);
        const juego = path.relative(raiz, dir);
        salida.push({ archivo: ruta, nombre: e.name, juego: juego || '', bytes: st.size, fecha: st.mtimeMs });
      } catch {}
    }
  };
  mirar(raiz, 0);
  return salida.sort((a, b) => b.fecha - a.fecha).slice(0, limite);
}
// ---------- Papelera con "Deshacer" ----------
// Al borrar, el clip se aparta un momento (se le agrega ".borrando": la lista ya no lo ve) y recién pasado el plazo
// vuelve a su nombre y se manda a la Papelera de Windows (así Windows recuerda de dónde era y se puede restaurar desde ahí).
const PLAZO_DESHACER = 10000;
const apartados = new Map(); // id -> { archivo, apartado, reloj }
const SUFIJO_BORRANDO = '.borrando';
async function aLaPapelera(archivo, mandar, plazo = PLAZO_DESHACER) {
  if (!dentroDeCarpeta(archivo)) throw new Error('Ese video no está en la carpeta de clips.');
  soltarLecturas(archivo);
  const apartado = archivo + SUFIJO_BORRANDO;
  await conReintentos(() => fs.renameSync(archivo, apartado));
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const reloj = setTimeout(() => { terminarBorrado(id, mandar).catch(() => {}); }, plazo);
  if (reloj.unref) reloj.unref();
  apartados.set(id, { archivo, apartado, reloj });
  return { id, plazo };
}
async function terminarBorrado(id, mandar) {
  const a = apartados.get(id);
  if (!a) return false;
  apartados.delete(id);
  clearTimeout(a.reloj);
  await conReintentos(() => fs.renameSync(a.apartado, a.archivo));
  await mandar(a.archivo);
  return true;
}
async function deshacerBorrado(id) {
  const a = apartados.get(id);
  if (!a) throw new Error('Ya pasó el tiempo para deshacer: el clip está en la Papelera de Windows.');
  apartados.delete(id);
  clearTimeout(a.reloj);
  await conReintentos(() => fs.renameSync(a.apartado, a.archivo));
  return `Listo, recuperé "${path.basename(a.archivo)}".`;
}
// Si Jarvis se cerró dentro del plazo, al abrir se termina lo que se había pedido (a la Papelera de Windows).
async function finalizarBorrados(mandar) {
  const hechos = [];
  const mirar = (dir, nivel) => {
    let entradas = [];
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) { if (nivel < 2) mirar(ruta, nivel + 1); continue; }
      if (e.isFile() && e.name.endsWith(SUFIJO_BORRANDO) && esVideo(e.name.slice(0, -SUFIJO_BORRANDO.length))) hechos.push(ruta);
    }
  };
  mirar(cfg().carpeta, 0);
  for (const apartado of hechos) {
    const original = apartado.slice(0, -SUFIJO_BORRANDO.length);
    try { fs.renameSync(apartado, original); await mandar(original); } catch {}
  }
  return hechos.length;
}

// Un cuadro del video, chiquito, para reconocerlo en la lista (se guarda para no volver a sacarlo).
const MINIATURAS = path.join(DATOS, 'clips-miniaturas');
let colaMiniaturas = Promise.resolve();
function miniatura(archivo) {
  if (!dentroDeCarpeta(archivo)) return Promise.resolve('');
  const tarea = colaMiniaturas.then(async () => {
    let st;
    try { st = fs.statSync(archivo); } catch { return ''; }
    const clave = require('crypto').createHash('sha1').update(`${archivo}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex').slice(0, 16);
    const jpg = path.join(MINIATURAS, `${clave}.jpg`);
    if (!fs.existsSync(jpg)) {
      const ruta = rutaFfmpeg();
      if (!ruta) return '';
      fs.mkdirSync(MINIATURAS, { recursive: true });
      try { await correr(ruta, ['-y', '-hide_banner', '-ss', '1', '-i', archivo, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', jpg], { espera: 30000 }); } catch { return ''; }
    }
    try { return `data:image/jpeg;base64,${fs.readFileSync(jpg).toString('base64')}`; } catch { return ''; }
  });
  colaMiniaturas = tarea.catch(() => {});
  return tarea;
}
// Manda un clip ya guardado por WhatsApp (si pesa más de ~15 MB, antes arma una copia más liviana).
async function enviarGuardado(archivo, contacto, enviarVideo) {
  if (!dentroDeCarpeta(archivo)) throw new Error('Ese video no está en la carpeta de clips.');
  if (!contacto) throw new Error('Decime a quién se lo mando.');
  const p = await prepararParaEnviar(archivo);
  try { return await enviarVideo(contacto, fs.readFileSync(p.archivo)); } finally { if (p.temporal) { try { fs.unlinkSync(p.archivo); } catch {} } }
}

// ---------- Editar un clip guardado: renombrar y recortar ----------
const NOMBRE_INVALIDO = /[<>:"/\\|?*\x00-\x1f]/g;
const RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
function nombreSeguro(texto) { return String(texto || '').replace(NOMBRE_INVALIDO, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120); }
// Renombra un clip (el nombre se escribe sin la extensión; no pisa a otro y solo toca archivos de la carpeta de clips).
function renombrar(archivo, nuevo) {
  if (!dentroDeCarpeta(archivo)) throw new Error('Ese video no está en la carpeta de clips.');
  const ext = path.extname(archivo);
  const base = nombreSeguro(String(nuevo || '').replace(new RegExp(`${ext.replace('.', '\\.')}$`, 'i'), '')).replace(/\.parte$/i, '');
  if (!base) throw new Error('Escribí un nombre para el clip.');
  if (RESERVADOS.test(base)) throw new Error(`"${base}" es un nombre que Windows no permite.`);
  const destino = path.join(path.dirname(archivo), base + ext);
  if (destino === archivo) return archivo;
  if (fs.existsSync(destino) && destino.toLowerCase() !== archivo.toLowerCase()) throw new Error(`Ya hay un clip que se llama "${base}".`);
  soltarLecturas(archivo);
  try { fs.renameSync(archivo, destino); } catch (e) {
    if (/^(EBUSY|EPERM|EACCES)$/.test(e.code || '')) throw new Error('No pude renombrarlo: el clip está abierto en otro programa.');
    throw e;
  }
  if (ultimoClip && ultimoClip.archivo === archivo) ultimoClip.archivo = destino;
  return destino;
}
function nombreLibre(dir, base, sufijo) {
  for (let n = 1; n < 100; n++) {
    const c = path.join(dir, `${base} (${sufijo}${n > 1 ? ` ${n}` : ''}).mp4`);
    if (!fs.existsSync(c)) return c;
  }
  return path.join(dir, `${base} (${sufijo} ${Date.now()}).mp4`);
}
function tramo(desde, hasta) {
  const d = Number(desde); const h = Number(hasta);
  if (!Number.isFinite(d) || !Number.isFinite(h) || d < 0 || h - d < 0.5) throw new Error('Elegí un trozo de al menos medio segundo.');
  return { desde: d, largo: h - d };
}
// Corta con precisión (se vuelve a codificar el trozo; NVENC y, si no hay, el procesador).
function argumentosDeRecorte(origen, desde, largo, cod, salida) {
  const video = cod === 'h264_nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '24', '-b:v', BITRATE_SALIDA[cfg().calidad] || '4M']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-threads', '4'];
  return ['-y', '-hide_banner', '-ss', desde.toFixed(3), '-i', origen, '-t', largo.toFixed(3), ...video, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', `${kbpsAudio()}k`, '-movflags', '+faststart', salida];
}
let recortando = false;
function soltarLecturas(archivo) { try { return require('./servidor').soltar(archivo); } catch { return 0; } }
// Repite una operación de archivos mientras Windows conteste "ocupado" (EBUSY/EPERM/EACCES).
async function conReintentos(fn, intentos = 12, espera = 250) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) {
      if (i >= intentos || !/^(EBUSY|EPERM|EACCES)$/.test(e.code || '')) throw e;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}
// Guarda el trozo como clip nuevo ("<nombre> (recorte).mp4") o, con reemplazar, deja el recorte en lugar del original.
async function recortar(archivo, { desde, hasta, reemplazar = false } = {}) {
  if (!dentroDeCarpeta(archivo)) throw new Error('Ese video no está en la carpeta de clips.');
  if (recortando) throw new Error('Ya estoy recortando otro clip: esperá a que termine.');
  const t = tramo(desde, hasta);
  recortando = true;
  try {
    const ruta = await asegurarFfmpeg();
    const dir = path.dirname(archivo);
    const base = path.basename(archivo, path.extname(archivo));
    const destino = nombreLibre(dir, base, reemplazar ? 'editando' : 'recorte');
    await codificar(ruta, (cod, salida) => argumentosDeRecorte(archivo, t.desde, t.largo, cod, salida), destino, t.largo);
    if (!reemplazar) { ultimoClip = { archivo: destino, juego: (ultimoClip && ultimoClip.juego) || '', segundos: Math.round(t.largo) }; return { archivo: destino, segundos: t.largo }; } // "el último clip" pasa a ser el recorte
    const final = path.join(dir, `${base}.mp4`);
    try {
      // Windows no deja reemplazar un archivo abierto (la vista previa del editor, una miniatura): se cierran las lecturas
      // propias y se reintenta unos segundos por si el reproductor tarda en soltarlo.
      await conReintentos(() => {
        soltarLecturas(archivo);
        if (final !== archivo) { try { fs.unlinkSync(archivo); } catch (e) { if (e.code !== 'ENOENT') throw e; } } // era un .webm/.mkv: el recorte queda en .mp4
        fs.renameSync(destino, final);
      });
    } catch (e) { throw new Error(`Recorté el clip pero no pude reemplazar el original (${e.code || e.message}: ¿está abierto en otro programa?). Quedó como "${path.basename(destino)}".`); }
    if (ultimoClip && ultimoClip.archivo === archivo) ultimoClip.archivo = final;
    return { archivo: final, segundos: t.largo };
  } finally { recortando = false; }
}
// Manda solo el trozo elegido por WhatsApp, sin guardarlo en la carpeta.
async function enviarRecorte(archivo, { desde, hasta } = {}, contacto, enviarVideo) {
  if (!dentroDeCarpeta(archivo)) throw new Error('Ese video no está en la carpeta de clips.');
  if (!contacto) throw new Error('Decime a quién se lo mando.');
  if (recortando) throw new Error('Ya estoy recortando otro clip: esperá a que termine.');
  const t = tramo(desde, hasta);
  recortando = true;
  const ruta = await asegurarFfmpeg().catch((e) => { recortando = false; throw e; });
  fs.mkdirSync(TEMPORAL, { recursive: true });
  const tmp = path.join(TEMPORAL, `recorte-${Date.now()}.mp4`);
  let p = null;
  try {
    await codificar(ruta, (cod, salida) => argumentosDeRecorte(archivo, t.desde, t.largo, cod, salida), tmp, t.largo);
    recortando = false;
    p = await prepararParaEnviar(tmp);
    return await enviarVideo(contacto, fs.readFileSync(p.archivo));
  } finally {
    recortando = false;
    try { fs.unlinkSync(tmp); } catch {}
    if (p && p.temporal) { try { fs.unlinkSync(p.archivo); } catch {} }
  }
}

function estado() {
  return {
    activo: cfg().activo, permitido: permitidoAhora(), corriendo: activa, grabando: !!grabacion, pausado: !!(grabacion && grabacion.pausado),
    segundos: pedazos.length ? Math.round((Date.now() - pedazos[0].inicio) / 1000) : 0, ultimo: ultimoClip ? path.basename(ultimoClip.archivo) : '',
    error: ultimoError, captura: estadoVentana.captura || '', formato: estadoVentana.formato || '',
  };
}
function recibirEstado(e) { estadoVentana = { ...estadoVentana, ...e }; }
const ultimo = () => ultimoClip;

module.exports = {
  asegurarFfmpeg, rutaFfmpeg, correrFfmpeg: correr, duracionDe,
  aLaPapelera, deshacerBorrado, finalizarBorrados, SUFIJO_BORRANDO,
  matarFfmpeg, listar, miniatura, dentroDeCarpeta, enviarGuardado, renombrar, recortar, enviarRecorte,
  configurar, usarAtajos, sincronizar, apagar, guardar, guardarYAvisar, capturar, capturarYAvisar, capturaParaEnviar, ultimaDeCaptura, marcarPedidoDeVoz, olvidarPedido, finDelPedido, elegirPedazos, silenciarJarvis, jarvisHabla, mudosEnLinea, argumentosDeUnion, _reiniciarJarvis: () => { intervalosJarvis = []; jarvisDesde = 0; }, prepararParaEnviar, empezarGrabacion, cancelarGrabacion, pausarGrabacion, terminarGrabacion,
  recibirPedazo, recibirTrozo, finDeTrozos, recibirEstado, estado, ultimo, registrarAtajo, permitidoAhora,
  _pruebas: { filtroDeRecorte, argumentosDeRecorte, nombreSeguro, argumentosDeUnion, elegirJuego, nombreDeJuego, lineaAMuestra, nombreDeArchivo, destinoDe, limpiarNombre, correr, duracionDe, recibirPedazo, setActiva: (v) => { activa = v; }, setMuestras: (m) => { muestras = m; }, setOrdenar: (f) => { ordenar = f; }, pedazos: () => pedazos },
};
