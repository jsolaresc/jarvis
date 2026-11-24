// Acciones sobre la PC: abrir y cerrar programas, salida de audio, volumen.
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { DATOS, leerConfig, normalizar, buscarPorNombre } = require('./config');

const ES_WINDOWS = process.platform === 'win32';
let abrirRuta = async () => { throw new Error('abrirRuta sin configurar'); }; // lo inyecta main.js (shell.openPath)
let abrirEnlace = async () => { throw new Error('abrirEnlace sin configurar'); }; // idem (shell.openExternal): para steam://
function configurar(opciones) { if (opciones.abrirRuta) abrirRuta = opciones.abrirRuta; if (opciones.abrirEnlace) abrirEnlace = opciones.abrirEnlace; }

function soloWindows() {
  if (!ES_WINDOWS) throw new Error('Esta acción solo funciona en Windows.');
}

// ---- Programas ----
let menuInicio = null;
let menuInicioLeido = 0;

function recorrer(carpeta, salida, nivel = 0) {
  let entradas = [];
  try { entradas = fs.readdirSync(carpeta, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) { if (nivel < 4) recorrer(ruta, salida, nivel + 1); }
    else if (/\.(lnk|url|appref-ms)$/i.test(e.name)) salida.push({ nombre: e.name.replace(/\.[^.]+$/, ''), ruta });
  }
}

// Todos los accesos directos del menú Inicio: así "abrí Discord" funciona sin configurar nada.
function listarProgramas() {
  if (menuInicio && Date.now() - menuInicioLeido < 5 * 60 * 1000) return menuInicio;
  const lista = [];
  if (ES_WINDOWS) {
    const sub = path.join('Microsoft', 'Windows', 'Start Menu', 'Programs');
    if (process.env.APPDATA) recorrer(path.join(process.env.APPDATA, sub), lista);
    if (process.env.ProgramData) recorrer(path.join(process.env.ProgramData, sub), lista);
  }
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
  menuInicio = lista.filter((x) => !/desinstalar|uninstall/i.test(x.nombre));
  menuInicioLeido = Date.now();
  return menuInicio;
}

async function abrirPrograma(pedido) {
  soloWindows();
  if (!pedido) throw new Error('Falta decir qué programa abrir.');
  // 1) Programas definidos a mano en Ajustes (con ruta y argumentos propios).
  const propio = buscarPorNombre(leerConfig().programas, pedido);
  if (propio && propio.ruta) {
    const ruta = propio.ruta.replace(/%([^%]+)%/g, (_, v) => process.env[v] || '');
    const argumentos = (propio.argumentos || '').match(/"[^"]+"|\S+/g) || [];
    if (/\.exe$/i.test(ruta)) {
      const hijo = spawn(ruta, argumentos.map((a) => a.replace(/^"|"$/g, '')), { detached: true, stdio: 'ignore', cwd: path.dirname(ruta) });
      await new Promise((ok, mal) => { hijo.once('error', (e) => mal(new Error(`No pude abrir ${propio.nombre}: ${e.message}`))); hijo.once('spawn', ok); });
      hijo.unref();
    } else {
      const error = await abrirRuta(ruta);
      if (error) throw new Error(`No pude abrir ${propio.nombre}: ${error}`);
    }
    return `Abrí ${propio.nombre}.`;
  }
  // 2) Si es una ruta directa.
  if (/^[a-z]:\\/i.test(pedido) && fs.existsSync(pedido)) {
    const error = await abrirRuta(pedido);
    if (error) throw new Error(error);
    return `Abrí ${path.basename(pedido)}.`;
  }
  // 3) Menú Inicio.
  const encontrado = buscarPorNombre(listarProgramas(), pedido);
  if (!encontrado) {
    // 4) Un juego de Steam ("abrí Valheim"): el modelo suele pedirlo como programa, así que también se busca entre los juegos instalados.
    if (hayJuegoDeSteam(pedido)) return abrirJuego({ juego: pedido });
    throw new Error(`No encontré ningún programa ni juego de Steam llamado "${pedido}". Se puede agregar en Ajustes > PC.`);
  }
  const error = await abrirRuta(encontrado.ruta);
  if (error) throw new Error(`No pude abrir ${encontrado.nombre}: ${error}`);
  return `Abrí ${encontrado.nombre}.`;
}


// ---- Juegos de Steam ----
// Steam abre un juego con la dirección steam://rungameid/<número>: si Steam está cerrado, lo prende, entra solo con la sesión que ya
// tengas y lanza el juego. Los juegos instalados se leen de los archivos de Steam (no hace falta configurar nada).
const JUEGOS_CONOCIDOS = { 730: ['counter strike 2', 'counter strike', 'cs2', 'cs', 'counterstrike'] }; // por si el nombre del archivo no coincide con cómo se lo dice
const NO_SON_JUEGOS = new Set([228980, 1070560, 1391110, 1628350, 1493710]); // redistribuibles y herramientas de Steam
let juegosLeidos = null;
let juegosLeidosEn = 0;

function carpetaDeSteam() {
  const candidatas = [];
  if (process.env.JARVIS_STEAM) candidatas.push(process.env.JARVIS_STEAM);
  if (ES_WINDOWS) {
    try {
      const salida = require('child_process').execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
      const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(salida);
      if (m) candidatas.push(m[1].trim());
    } catch {}
    try {
      const salida = require('child_process').execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', '/v', 'InstallPath'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
      const m = /InstallPath\s+REG_SZ\s+(.+)/i.exec(salida);
      if (m) candidatas.push(m[1].trim());
    } catch {}
    candidatas.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  }
  return candidatas.find((c) => { try { return fs.existsSync(path.join(c, 'steamapps')); } catch { return false; } }) || '';
}
function bibliotecasDeSteam(steam) {
  const lista = [path.join(steam, 'steamapps')];
  try {
    const vdf = fs.readFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) lista.push(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps'));
  } catch {}
  return [...new Set(lista)];
}
function listarJuegosSteam({ forzar = false } = {}) {
  if (!forzar && juegosLeidos && Date.now() - juegosLeidosEn < 5 * 60 * 1000) return juegosLeidos;
  const juegos = new Map();
  const steam = carpetaDeSteam();
  if (steam) {
    for (const carpeta of bibliotecasDeSteam(steam)) {
      let archivos = [];
      try { archivos = fs.readdirSync(carpeta).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
      for (const f of archivos) {
        try {
          const texto = fs.readFileSync(path.join(carpeta, f), 'utf8');
          const id = Number((/"appid"\s+"(\d+)"/.exec(texto) || [])[1]);
          const nombre = (/"name"\s+"([^"]+)"/.exec(texto) || [])[1];
          if (id && nombre && !NO_SON_JUEGOS.has(id) && !/^Steam(works)? /i.test(nombre) && !/Proton|Steam Linux Runtime/i.test(nombre)) juegos.set(id, { id, nombre });
        } catch {}
      }
    }
  }
  juegosLeidos = [...juegos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  juegosLeidosEn = Date.now();
  return juegosLeidos;
}
// Busca un juego instalado por su nombre (exacto, que lo contenga o contenido en lo dicho) o por un alias conocido.
function buscarJuegoDeSteam(pedido) {
  const limpio = (t) => normalizar(String(t).replace(/['’`]/g, '')); // "Baldur's" y "baldurs" son lo mismo
  const p = limpio(pedido);
  if (!p) return null;
  const instalados = listarJuegosSteam();
  const hallado = instalados.find((j) => limpio(j.nombre) === p) || instalados.find((j) => limpio(j.nombre).includes(p)) || instalados.find((j) => limpio(j.nombre).length >= 4 && p.includes(limpio(j.nombre)));
  if (hallado) return hallado;
  const conocido = Object.entries(JUEGOS_CONOCIDOS).find(([, alias]) => alias.includes(p));
  return conocido ? { id: Number(conocido[0]), nombre: '' } : null;
}
const hayJuegoDeSteam = (pedido) => !!buscarJuegoDeSteam(pedido);
// paso: { juego: 'Counter-Strike 2', appid?: 730 }
async function abrirJuego(paso) {
  const pedido = String((paso && paso.juego) || '').trim();
  let id = Number(paso && paso.appid) || 0;
  let nombre = pedido;
  if (!id) {
    if (!pedido) throw new Error('Falta decir qué juego abrir.');
    if (/^\d+$/.test(pedido)) id = Number(pedido);
    else {
      const hallado = buscarJuegoDeSteam(pedido);
      if (hallado) { id = hallado.id; nombre = hallado.nombre; }
      else throw new Error(`No encontré "${pedido}" entre tus juegos de Steam. Si no es de Steam, agregalo como programa en Ajustes → PC y usá el paso "Abrir programa".`);
    }
  }
  if (!Number.isInteger(id) || id <= 0 || id > 1e10) throw new Error('El número del juego no es válido.');
  await abrirEnlace(`steam://rungameid/${id}`);
  return `Le pedí a Steam que abra ${nombre || `el juego ${id}`}.`;
}

function ejecutar(comando, argumentos, espera = 20000) {
  return new Promise((ok, mal) => {
    execFile(comando, argumentos, { windowsHide: true, timeout: espera, encoding: 'utf8' }, (error, salida, errores) => {
      if (error) mal(new Error((errores || '').trim().split(/\r?\n/)[0] || error.message)); else ok(salida.trim());
    });
  });
}

async function cerrarPrograma(proceso) {
  soloWindows();
  if (!proceso) throw new Error('Falta decir qué programa cerrar.');
  const nombre = /\.exe$/i.test(proceso) ? proceso : `${proceso}.exe`;
  try { await ejecutar('taskkill', ['/IM', nombre]); } catch (e) { throw new Error(`No pude cerrar ${nombre}: ${e.message}`); }
  return `Cerré ${nombre}.`;
}

// ---- Audio ----
// PowerShell no puede leer un archivo que vive dentro del paquete de la app (app.asar, lo que pasa
// en Jarvis.exe): ahí se deja una copia del guion en la carpeta de datos y se usa esa.
let guionDeAudio = null;
function rutaDelGuion() {
  if (guionDeAudio && fs.existsSync(guionDeAudio)) return guionDeAudio;
  const original = path.join(__dirname, 'audio.ps1');
  if (!/app\.asar([\\/]|$)/.test(original)) { guionDeAudio = original; return original; }
  const contenido = fs.readFileSync(original); // Electron sí sabe leer dentro del paquete
  const copia = path.join(DATOS, 'audio.ps1');
  let igual = false;
  try { igual = fs.readFileSync(copia).equals(contenido); } catch {}
  if (!igual) { fs.mkdirSync(DATOS, { recursive: true }); fs.writeFileSync(copia, contenido); }
  guionDeAudio = copia;
  return copia;
}

function audio(accion, valor = '') {
  soloWindows();
  return ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', rutaDelGuion(), '-Accion', accion, '-Valor', String(valor)]);
}

async function listarSalidas() {
  const texto = await audio('listar');
  const lista = JSON.parse(texto || '[]');
  return Array.isArray(lista) ? lista : [lista];
}

async function cambiarSalida(pedido) {
  if (!pedido) throw new Error('Falta decir a qué salida de audio cambiar.');
  const alias = buscarPorNombre(leerConfig().salidasAudio, pedido);
  const buscado = alias && alias.dispositivo ? alias.dispositivo : pedido;
  const salidas = await listarSalidas();
  const destino = salidas.find((s) => s.nombre === buscado) || buscarPorNombre(salidas, buscado);
  if (!destino) {
    throw new Error(`No encontré la salida de audio "${pedido}". Disponibles: ${salidas.map((s) => s.nombre).join(', ') || 'ninguna'}.`);
  }
  if (!destino.predeterminada) await audio('fijar', destino.id);
  return `Salida de audio: ${destino.nombre}.`;
}

async function volumen(nivel) {
  const n = Math.round(Number(nivel));
  if (!Number.isFinite(n)) throw new Error('El volumen tiene que ser un número de 0 a 100.');
  await audio('volumen', Math.max(0, Math.min(100, n)));
  return `Volumen de la PC en ${Math.max(0, Math.min(100, n))}.`;
}

async function silenciar(activar) {
  await audio('silencio', activar ? 'si' : 'no');
  return activar ? 'PC silenciada.' : 'PC con sonido.';
}

module.exports = { listarJuegosSteam, abrirJuego, buscarJuegoDeSteam, rutaDelGuion, configurar, listarProgramas, abrirPrograma, cerrarPrograma, listarSalidas, cambiarSalida, volumen, silenciar, normalizar };
