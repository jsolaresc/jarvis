// Descargar videos y audios con yt-dlp ("descargá este video", "descargá el audio de este video").
// yt-dlp lo instala la persona (o lo baja Jarvis desde el sitio oficial, a pedido); acá solo se lo manda a trabajar, de a una descarga
// por vez y con prioridad baja para no trabar la PC. Los archivos quedan en la carpeta "Descargas" (los audios en "Descargas\Audio"), junto a los clips.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { leerConfig, DATOS } = require('./config');

let avisar = () => {}; // (texto, 'ok' | 'error') → burbuja del notch
let alCambiar = () => {}; // el estado cambió (Ajustes lo muestra)
let ffmpegDe = async () => null; // () → ruta de ffmpeg (la herramienta de video de Jarvis)
let enlaceActual = async () => ''; // () → link de lo que se está mirando (la pestaña del navegador)
let portapapeles = () => '';
let alViejo = () => {}; // una descarga falló porque yt-dlp parece viejo (el Inicio de Ajustes lo muestra)
function configurar(f = {}) {
  if (f.alViejo) alViejo = f.alViejo;
  if (f.avisar) avisar = f.avisar;
  if (f.alCambiar) alCambiar = f.alCambiar;
  if (f.ffmpeg) ffmpegDe = f.ffmpeg;
  if (f.enlace) enlaceActual = f.enlace;
  if (f.portapapeles) portapapeles = f.portapapeles;
}

const cfg = () => leerConfig().descargas || {};
const RUTA_PROPIA = () => path.join(DATOS, 'modelos-voz', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const existe = (r) => { try { return !!r && fs.statSync(r).isFile(); } catch { return false; } };

// ---------- Dónde está yt-dlp ----------
let encontrado = null;
const comoEjecutable = (archivo, args = []) => new Promise((ok) => {
  execFile(archivo, args, { windowsHide: true, timeout: 8000 }, (e, salida) => ok(e ? null : String(salida).trim()));
});
async function buscarYtdlp({ olvidar = false } = {}) {
  if (olvidar) encontrado = null;
  if (encontrado && existe(encontrado)) return encontrado;
  const candidatas = [process.env.JARVIS_YTDLP, cfg().ytdlp];
  const local = process.env.LOCALAPPDATA || '';
  if (process.platform === 'win32') {
    const donde = await comoEjecutable('where.exe', ['yt-dlp.exe']);
    if (donde) candidatas.push(...donde.split(/\r?\n/));
    candidatas.push(
      path.join(local, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
      path.join(os.homedir(), 'scoop', 'shims', 'yt-dlp.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe',
    );
  } else {
    const donde = await comoEjecutable('which', ['yt-dlp']);
    if (donde) candidatas.push(donde.split('\n')[0]);
  }
  candidatas.push(RUTA_PROPIA());
  encontrado = candidatas.find(existe) || null;
  return encontrado;
}
async function version() {
  const r = await buscarYtdlp();
  return r ? comoEjecutable(r, ['--version']) : null;
}

// ---------- Carpeta ----------
function carpetaDestino() {
  const c = cfg();
  const base = String(c.carpeta || '').trim() || path.join(String(leerConfig().clips.carpeta || DATOS), 'Descargas');
  fs.mkdirSync(base, { recursive: true });
  return base;
}
const dentroDeCarpeta = (ruta) => {
  const base = path.resolve(carpetaDestino()).toLowerCase() + path.sep;
  return path.resolve(String(ruta || '')).toLowerCase().startsWith(base);
};

// ---------- Qué link ----------
const ES_ENLACE = /^https?:\/\/[^\s]+$/i;
// Del portapapeles se acepta un link suelto, con texto alrededor ("mirá esto https://…") o sin el "https://" ("youtube.com/watch?v=…").
function enlaceDeTexto(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  const con = /https?:\/\/[^\s<>"']+/i.exec(t);
  if (con) return con[0].replace(/[).,;]+$/, '');
  const sin = /^(?:www\.)?(?:youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)\/[^\s]+$/i.exec(t);
  return sin ? `https://${t}` : '';
}
// Lo que dice la pestaña de YouTube ("(3) Tema - Artista - YouTube") sirve para buscar el mismo video si no se pudo leer el link.
function buscarPorTitulo(titulo) {
  const m = /^(?:\(\d+\)\s*)?(.+?)\s+-\s+YouTube$/.exec(String(titulo || '').trim());
  return m && m[1].length > 3 ? `ytsearch1:${m[1]}` : '';
}
async function enlaceDeLoQueMira(dado) {
  const directo = String(dado || '').trim();
  if (directo) { if (!ES_ENLACE.test(directo)) throw new Error('Ese link no parece una dirección web (tiene que empezar con http o https).'); return directo; }
  const r = await enlaceActual().catch(() => '');
  const pestana = String((r && typeof r === 'object' ? r.url : r) || '').trim();
  const nota = r && typeof r === 'object' && r.nota ? ` (${r.nota})` : '';
  if (ES_ENLACE.test(pestana)) return pestana;
  const texto = String(portapapeles() || '');
  const copiado = enlaceDeTexto(texto);
  if (copiado) return copiado;
  const porTitulo = r && typeof r === 'object' ? buscarPorTitulo(r.titulo) : '';
  if (porTitulo) return porTitulo;
  const portap = !texto.trim() ? 'el portapapeles está vacío' : `en el portapapeles hay un texto de ${texto.trim().length} caracteres que no parece un link`;
  throw new Error(`No encuentro el link${nota}; ${portap}. Copialo (Ctrl+L, Ctrl+C en el navegador) y repetime el pedido.`);
}

// ---------- Estado ----------
let cola = [];
let activa = null;
let historial = []; // más nueva primero, hasta 15
let proceso = null;
let numero = 0;
const publico = (d) => ({ id: d.id, url: d.url, modo: d.modo, calidad: d.calidad, estado: d.estado, pct: d.pct, nombre: d.nombre, archivo: d.archivo, error: d.error, cuando: d.cuando, para: d.para || 'pc' });
// Una descarga por su número (la que baja, las de la fila o las últimas terminadas).
function buscar(id) {
  const d = [activa, ...cola, ...historial].find((x) => x && x.id === Number(id));
  return d ? publico(d) : null;
}
function estado() {
  return { activa: activa ? publico(activa) : null, enCola: cola.map(publico), historial: historial.map(publico), carpeta: (() => { try { return carpetaDestino(); } catch { return ''; } })() };
}

// Los formatos salen de los comandos que ya usaba el usuario.
const FORMATOS = {
  mejor: ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4'],
  1080: ['-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4] / bv*[height<=1080]+ba/b[height<=1080] / bv*+ba/b', '--merge-output-format', 'mp4'],
  720: ['-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4] / bv*[height<=720]+ba/b[height<=720] / bv*+ba/b', '--merge-output-format', 'mp4'],
};
const CALIDADES = Object.keys(FORMATOS);

function argumentos(d, carpeta, ffmpeg) {
  // Los audios van a su propia subcarpeta: si no, bajar el audio de un video ya descargado (mismo nombre) le borraría el video (yt-dlp -x borra el original).
  const destino = d.modo === 'audio' ? path.join(carpeta, 'Audio') : carpeta;
  fs.mkdirSync(destino, { recursive: true });
  const salida = path.join(destino, '%(title).150B [%(id)s].%(ext)s');
  const a = ['--no-playlist', '--windows-filenames', '--newline', '--no-colors', '--no-mtime', '-o', salida, '--print', 'after_move:JARVIS-ARCHIVO:%(filepath)s', '--no-quiet', '--progress'];
  if (ffmpeg) a.push('--ffmpeg-location', ffmpeg);
  const galletas = String(cfg().cookies || '').trim();
  if (galletas && existe(galletas)) a.push('--cookies', galletas);
  if (d.modo === 'audio') a.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  else a.push(...FORMATOS[d.calidad]);
  a.push('--', d.url); // el "--" evita que un link raro se tome como opción
  return a;
}

// Los errores de yt-dlp, dichos en castellano y con qué hacer.
function explicar(texto) {
  const t = String(texto || '');
  if (/Unsupported URL/i.test(t)) return 'Ese sitio o link no lo soporta yt-dlp.';
  if (/Sign in to confirm|login required|log in|cookies|private video|members-only|age-restricted|confirm your age/i.test(t)) return 'Ese video pide iniciar sesión. Si querés, en Ajustes → Descargas podés indicar tu archivo de cookies.';
  if (/Video unavailable|not available|removed|deleted|does not exist|404/i.test(t)) return 'El video no está disponible (borrado, privado o bloqueado en tu país).';
  if (/ffmpeg|ffprobe/i.test(t) && /not found|not installed/i.test(t)) return 'Falta ffmpeg para unir audio y video; probá de nuevo en un rato.';
  if (/Unable to extract|extractor|nsig|signature|HTTP Error 403/i.test(t)) { fallóPorViejo = true; ultima = { version: '', cuando: 0 }; alViejo(); return 'yt-dlp no pudo leer ese video; seguramente está desactualizado. Tocá "Actualizar" en el aviso de Inicio (o en Ajustes → Sistema → Componentes) y probá de nuevo.'; }
  if (/Unable to download|timed out|Temporary failure|Name or service|getaddrinfo|Connection/i.test(t)) return 'No pude conectarme (¿hay internet?).';
  const e = /ERROR:\s*(.+)/i.exec(t);
  return e ? e[1].slice(0, 200) : 'yt-dlp falló sin decir por qué.';
}

const nombreDe = (archivo) => path.basename(String(archivo || '')).replace(/ \[[^\]]+\]\.[a-z0-9]+$/i, '').replace(/\.[a-z0-9]+$/i, '');

function terminar(d, error) {
  proceso = null;
  activa = null;
  d.cuando = Date.now();
  if (error) { d.estado = 'error'; d.error = error; } else d.estado = 'listo';
  historial.unshift(d);
  historial = historial.slice(0, 30);
  alCambiar(estado());
  if (error) avisar(`No pude descargar: ${error}`, 'error');
  else avisar(`Listo, descargué ${d.modo === 'audio' ? 'el audio de ' : ''}"${(d.nombre || 'el video').slice(0, 60)}". ${d.para === 'celular' ? 'Se lo paso al celular.' : 'Está en Descargas.'}`, 'ok');
  setTimeout(siguiente, 300);
}

async function correr(d) {
  activa = d;
  d.estado = 'bajando';
  alCambiar(estado());
  let ytdlp;
  try {
    ytdlp = await buscarYtdlp();
    if (!ytdlp) throw new Error('No encuentro yt-dlp. Instalalo, o indicá dónde está en Ajustes → Descargas (también podés dejar que Jarvis lo baje).');
    const ffmpeg = await ffmpegDe().catch(() => null);
    const carpeta = d.carpeta || carpetaDestino();
    proceso = spawn(ytdlp, argumentos(d, carpeta, ffmpeg), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    try { os.setPriority(proceso.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
  } catch (e) { terminar(d, e.message); return; }
  let resto = '';
  let errores = '';
  const lineas = (texto) => {
    resto += texto;
    const l = resto.split(/\r?\n/); resto = l.pop();
    for (const linea of l) {
      let m;
      if ((m = /^JARVIS-ARCHIVO:(.+)$/.exec(linea))) { d.archivo = m[1].trim(); d.nombre = nombreDe(d.archivo); }
      else if ((m = /\[download\]\s+([\d.]+)%/.exec(linea))) { const p = Math.round(Number(m[1])); if (p !== d.pct) { d.pct = p; alCambiar(estado()); } }
      else if ((m = /\[(?:download|ExtractAudio|Merger|VideoConvertor)\].*?(?:Destination:|into) "?(.+?)"?$/.exec(linea))) { if (!d.archivo) { d.nombre = nombreDe(m[1]); } }
    }
  };
  proceso.stdout.setEncoding('utf8');
  proceso.stderr.setEncoding('utf8');
  proceso.stdout.on('data', lineas);
  proceso.stderr.on('data', (t) => { errores += t; if (errores.length > 6000) errores = errores.slice(-6000); });
  proceso.on('error', (e) => terminar(d, `No pude ejecutar yt-dlp (${e.message}).`));
  proceso.on('close', (codigo) => {
    if (!activa || activa !== d) return;
    if (codigo === 0 && d.archivo && existe(d.archivo)) terminar(d, '');
    else if (codigo === 0) terminar(d, 'yt-dlp terminó pero no encuentro el archivo.');
    else terminar(d, explicar(errores));
  });
}
function siguiente() {
  if (activa || !cola.length) return;
  correr(cola.shift());
}

// Empieza (o pone en cola) una descarga. Devuelve enseguida lo que Jarvis dice; el aviso del final sale por `avisar`.
// `carpeta` cambia dónde queda (lo usa el celular: una carpeta temporal que se borra cuando el celular se lo llevó).
const iniciar = async (o) => (await encolar(o)).texto;
async function encolar({ modo = 'video', calidad = '', url = '', carpeta = '', para = 'pc' } = {}) {
  const m = modo === 'audio' ? 'audio' : 'video';
  const q = CALIDADES.includes(String(calidad)) ? String(calidad) : (CALIDADES.includes(String(cfg().calidad)) ? String(cfg().calidad) : '1080');
  const link = await enlaceDeLoQueMira(url);
  if (!(await buscarYtdlp())) throw new Error('No encuentro yt-dlp. Instalalo, o indicá dónde está en Ajustes → Descargas (también podés dejar que Jarvis lo baje).');
  const d = { id: ++numero, url: link, modo: m, calidad: q, estado: 'espera', pct: 0, nombre: '', archivo: '', error: '', cuando: Date.now(), carpeta: carpeta || '', para: para === 'celular' ? 'celular' : 'pc' };
  cola.push(d);
  const lugar = (activa ? 1 : 0) + cola.length;
  alCambiar(estado());
  setTimeout(siguiente, 0);
  const que = m === 'audio' ? 'el audio' : (q === 'mejor' ? 'el video en la mejor calidad' : `el video en ${q}p`);
  if (link.startsWith('ytsearch1:')) return { id: d.id, texto: `No pude leer el link, así que busco en YouTube "${link.slice(10, 70)}" y descargo ${que}.` };
  return { id: d.id, texto: lugar > 1 ? `Listo, puse en la fila ${que}; hay ${lugar - 1} descarga${lugar > 2 ? 's' : ''} antes.` : `Listo, empiezo a descargar ${que}. Te aviso cuando termine.` };
}

function cancelar() {
  const hubo = !!activa || cola.length > 0;
  cola = [];
  if (proceso) { try { proceso.kill(); } catch {} }
  if (activa) terminar(activa, 'Cancelada.');
  return hubo ? 'Listo, cancelé las descargas.' : 'No hay nada descargándose.';
}

// Bajar yt-dlp.exe del sitio oficial (solo Windows), a pedido.
const URL_YTDLP = process.env.JARVIS_URL_YTDLP || 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
async function bajarYtdlp() {
  const https = require('https');
  const destino = RUTA_PROPIA();
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const bajar = (url, saltos = 0) => new Promise((ok, mal) => {
    if (saltos > 6) { mal(new Error('Demasiadas redirecciones.')); return; }
    https.get(url, { headers: { 'User-Agent': 'Jarvis' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); ok(bajar(new URL(r.headers.location, url).href, saltos + 1)); return; }
      if (r.statusCode !== 200) { r.resume(); mal(new Error(`El sitio contestó ${r.statusCode}.`)); return; }
      const tmp = `${destino}.parte`;
      const f = fs.createWriteStream(tmp);
      r.pipe(f);
      f.on('finish', () => f.close(() => { try { fs.renameSync(tmp, destino); ok(destino); } catch (e) { mal(e); } }));
      f.on('error', mal);
    }).on('error', mal);
  });
  await bajar(URL_YTDLP);
  encontrado = null;
  return destino;
}

// ---------- ¿Está al día? ----------
// La última versión sale de los releases oficiales de yt-dlp en GitHub (se consulta como mucho cada 6 horas).
// Además, si una descarga falla con el error típico de "estoy viejo", queda marcado aunque GitHub no conteste.
let ultima = { version: '', cuando: 0 };
let fallóPorViejo = false;
const URL_ULTIMA = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
function pedirUltima() {
  const prueba = process.env.JARVIS_YTDLP_ULTIMA; // pruebas
  if (prueba !== undefined) return prueba === 'error' ? Promise.reject(new Error('sin red')) : Promise.resolve(prueba);
  const https = require('https');
  return new Promise((ok, mal) => {
    const pedido = https.get(URL_ULTIMA, { headers: { 'User-Agent': 'Jarvis', Accept: 'application/vnd.github+json' }, timeout: 15000 }, (r) => {
      let texto = ''; r.setEncoding('utf8');
      r.on('data', (c) => { texto += c; if (texto.length > 2e6) r.destroy(); });
      r.on('end', () => { try { if (r.statusCode !== 200) throw new Error(`GitHub contestó ${r.statusCode}.`); ok(String(JSON.parse(texto).tag_name || '').trim()); } catch (e) { mal(e); } });
    });
    pedido.on('timeout', () => pedido.destroy(new Error('GitHub no contestó.')));
    pedido.on('error', mal);
  });
}
// "2026.11.20" vs "2026.11.20.1": compara número por número.
function masNueva(a, b) {
  const pa = String(a || '').split(/[^\d]+/).filter(Boolean).map(Number); const pb = String(b || '').split(/[^\d]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0; const y = pb[i] || 0; if (x !== y) return x > y; }
  return false;
}
async function revisarVersion({ fuerza = false } = {}) {
  const ruta = await buscarYtdlp();
  if (!ruta) return { instalado: false, version: '', ultima: '', desactualizado: false, fallo: false };
  const v = (await version()) || '';
  if (fuerza || !ultima.version || Date.now() - ultima.cuando > 6 * 3600000) {
    try { const u = await pedirUltima(); if (u) ultima = { version: u, cuando: Date.now() }; } catch { if (!ultima.cuando) ultima.cuando = Date.now() - 5 * 3600000; } // reintenta en una hora
  }
  const viejo = !!(v && ultima.version && masNueva(ultima.version, v));
  if (!viejo && ultima.version && v && fallóPorViejo) fallóPorViejo = false; // ya está en la última: el error era otra cosa (actualizar no lo arregla)
  return { instalado: true, ruta, version: v, ultima: ultima.version, desactualizado: viejo || fallóPorViejo, fallo: fallóPorViejo };
}

// Actualizar: la copia de Jarvis se vuelve a bajar entera; una instalada por otro lado (WinGet, scoop, pip) primero prueba
// "yt-dlp -U" y, si con eso no queda en la última, Jarvis baja la oficial a su carpeta y pasa a usar esa.
async function actualizar() {
  const r = await buscarYtdlp();
  if (!r) throw new Error('No encuentro yt-dlp.');
  const antes = (await version()) || '';
  let u = ultima.version;
  try { u = (await pedirUltima()) || u; if (u) ultima = { version: u, cuando: Date.now() }; } catch {}
  const propia = path.resolve(r) === path.resolve(RUTA_PROPIA());
  if (!propia) {
    await new Promise((ok) => { execFile(r, ['-U'], { windowsHide: true, timeout: 120000 }, () => ok()); });
    encontrado = null;
    const ahora = (await version()) || '';
    if (ahora && (!u || !masNueva(u, ahora))) { fallóPorViejo = false; alCambiar(estado()); return ahora === antes ? `Ya estaba en la última (${ahora}).` : `Listo, yt-dlp pasó de ${antes || '?'} a ${ahora}.`; }
    if (process.platform !== 'win32') throw new Error('No se pudo actualizar solo. Actualizalo con el programa con el que lo instalaste.');
  } else if (u && antes && !masNueva(u, antes)) { fallóPorViejo = false; return `Ya estaba en la última (${antes}).`; }
  await bajarYtdlp();
  if (!propia) { const { guardarConfig } = require('./config'); const c = leerConfig(); guardarConfig({ ...c, descargas: { ...(c.descargas || {}), ytdlp: RUTA_PROPIA() } }); }
  encontrado = null;
  const nueva = (await version()) || u || '';
  fallóPorViejo = false;
  alCambiar(estado());
  return `Listo, yt-dlp pasó de ${antes || '?'} a ${nueva || 'la última'}${propia ? '' : ' (bajé la oficial a la carpeta de Jarvis y uso esa)'}.`;
}

module.exports = { configurar, iniciar, encolar, buscar, cancelar, estado, buscarYtdlp, version, bajarYtdlp, actualizar, revisarVersion, masNueva, carpetaDestino, dentroDeCarpeta, enlaceDeLoQueMira, enlaceDeTexto, explicar, argumentos, CALIDADES, _pruebas: { nombreDe } };
