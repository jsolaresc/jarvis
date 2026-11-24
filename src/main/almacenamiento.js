// Cuánto espacio ocupa Jarvis en el disco y cómo liberarlo.
//  - Voces, modelo de escucha y ffmpeg se pueden borrar y volver a bajar cuando haga falta.
//  - Los clips son videos del usuario: nunca se borran de verdad, van a la Papelera de Windows.
//  - Las fotos y los audios que Jarvis manda por WhatsApp NO se guardan: viven un instante en memoria.
const fs = require('fs');
const path = require('path');
const { DATOS, leerConfig } = require('./config');
const modelos = require('./modelos');

const BUFFER = path.join(DATOS, 'clips-buffer');
const TEMPORAL = path.join(DATOS, 'clips-temporal');

// Tamaño de un archivo o de una carpeta entera (sin seguir enlaces). Con tope de tiempo: nunca cuelga la ventana.
async function pesoDe(ruta, limiteMs = 8000) {
  const hasta = Date.now() + limiteMs;
  let bytes = 0, archivos = 0, completo = true;
  const pila = [ruta];
  while (pila.length) {
    if (Date.now() > hasta) { completo = false; break; }
    const actual = pila.pop();
    let info;
    try { info = await fs.promises.lstat(actual); } catch { continue; }
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      let hijos = [];
      try { hijos = await fs.promises.readdir(actual); } catch {}
      for (const h of hijos) pila.push(path.join(actual, h));
    } else { bytes += info.size; archivos++; }
  }
  return { bytes, archivos, completo };
}

const existe = (r) => { try { fs.accessSync(r); return true; } catch { return false; } };

async function espacioDeDisco(ruta) {
  try {
    let r = ruta;
    while (r && !existe(r) && path.dirname(r) !== r) r = path.dirname(r);
    const s = await fs.promises.statfs(r);
    return { libre: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) };
  } catch { return null; }
}

function carpetaDeClips() { return leerConfig().clips.carpeta; }

async function resumen() {
  const c = leerConfig();
  const grupos = [];

  // ---- Voces ----
  const vozActual = modelos.idDeVoz(c.habla.voz);
  const items = [];
  const vistos = new Set();
  for (const [id, m] of Object.entries(modelos.CATALOGO)) {
    if (!id.startsWith('voz-')) continue;
    const raiz = m.comparte || id;
    if (vistos.has(raiz)) continue;
    vistos.add(raiz);
    if (!modelos.instalado(raiz)) { items.push({ id: raiz, nombre: m.nombre.replace(/ \(.*/, ''), bytes: 0, instalado: false, detalle: `No bajada (${m.mb} MB si la bajás)` }); continue; }
    const p = await pesoDe(path.join(modelos.CARPETA, m.carpeta));
    const comparten = Object.entries(modelos.CATALOGO).filter(([, o]) => o.comparte === raiz).map(([, o]) => o.nombre.replace(/ \(.*/, ''));
    const nombre = comparten.length ? `${m.nombre.replace(/ \(.*/, '')} y ${comparten.join(', ')}` : m.nombre.replace(/ \(.*/, '');
    const enUso = [raiz, ...Object.entries(modelos.CATALOGO).filter(([, o]) => o.comparte === raiz).map(([i]) => i)].includes(vozActual);
    items.push({ id: raiz, nombre, bytes: p.bytes, instalado: true, enUso, detalle: enUso ? 'Es la voz que usa Jarvis ahora' : 'Se puede volver a bajar' });
  }
  grupos.push({ id: 'voces', titulo: 'Voces de Jarvis', ayuda: 'Cada voz se baja una sola vez. Si borrás una, Jarvis puede volver a bajarla desde Ajustes → Asistente → Básico.', items });

  // ---- Escucha ----
  const escucha = [];
  for (const id of ['oido', 'vad']) {
    const m = modelos.CATALOGO[id];
    if (!modelos.instalado(id)) { escucha.push({ id, nombre: m.nombre, bytes: 0, instalado: false, detalle: 'No bajado' }); continue; }
    const p = await pesoDe(path.join(modelos.CARPETA, m.carpeta || m.archivo));
    escucha.push({ id, nombre: m.nombre, bytes: p.bytes, instalado: true, enUso: true, detalle: 'Sin esto Jarvis no te escucha; se vuelve a bajar solo' });
  }
  grupos.push({ id: 'escucha', titulo: 'Escucha', ayuda: 'Lo que usa Jarvis para entenderte, todo dentro de esta PC.', items: escucha });

  // ---- Herramientas ----
  const ff = modelos.CATALOGO.ffmpeg;
  const herramientas = [];
  if (modelos.instalado('ffmpeg')) { const p = await pesoDe(path.join(modelos.CARPETA, ff.archivo)); herramientas.push({ id: 'ffmpeg', nombre: ff.nombre, bytes: p.bytes, instalado: true, detalle: 'Arma los clips de video. Se vuelve a bajar al usar los clips' }); }
  else herramientas.push({ id: 'ffmpeg', nombre: ff.nombre, bytes: 0, instalado: false, detalle: `No bajada (${ff.mb} MB si activás los clips)` });
  grupos.push({ id: 'herramientas', titulo: 'Herramientas', ayuda: 'Programas auxiliares que Jarvis baja solo cuando una función los necesita.', items: herramientas });

  // ---- Videos (clips) ----
  const carpeta = carpetaDeClips();
  const juegos = [];
  let sueltos = 0;
  try {
    for (const e of await fs.promises.readdir(carpeta, { withFileTypes: true })) {
      const ruta = path.join(carpeta, e.name);
      if (e.isDirectory()) {
        const p = await pesoDe(ruta, 4000);
        if (p.archivos) juegos.push({ id: `clips:${e.name}`, nombre: e.name, bytes: p.bytes, cantidad: p.archivos, ruta, detalle: `${p.archivos} ${p.archivos === 1 ? 'video' : 'videos'}${p.completo ? '' : ' o más'}` });
      } else if (/\.(mp4|webm|mkv)$/i.test(e.name)) sueltos += (await fs.promises.stat(ruta).catch(() => ({ size: 0 }))).size;
    }
  } catch { /* la carpeta todavía no existe */ }
  juegos.sort((a, b) => b.bytes - a.bytes);
  if (sueltos) juegos.push({ id: 'clips:', nombre: 'Sueltos (sin carpeta de juego)', bytes: sueltos, detalle: '', ruta: carpeta, sueltos: true });
  grupos.push({ id: 'clips', titulo: 'Videos de clips', ayuda: `Lo que guardó Jarvis en ${carpeta}. Al liberar, los videos van a la Papelera de Windows (los podés recuperar).`, carpeta, items: juegos });

  // ---- Temporales ----
  const temporales = [];
  for (const [id, nombre, ruta, detalle] of [
    ['buffer', 'Memoria de los clips (últimos segundos)', BUFFER, 'Lo que va grabando en segundo plano; se borra solo al apagar los clips'],
    ['temporal', 'Copias para mandar por WhatsApp y grabaciones a medias', TEMPORAL, 'Se puede borrar sin problema'],
  ]) {
    const p = await pesoDe(ruta);
    temporales.push({ id, nombre, bytes: p.bytes, instalado: p.bytes > 0, detalle });
  }
  let sobras = 0;
  try {
    for (const n of await fs.promises.readdir(modelos.CARPETA)) if (/\.(descarga|tmp|plano)$/.test(n)) sobras += (await pesoDe(path.join(modelos.CARPETA, n))).bytes;
  } catch {}
  temporales.push({ id: 'descargas', nombre: 'Descargas incompletas', bytes: sobras, instalado: sobras > 0, detalle: 'Restos de una descarga que se cortó' });
  grupos.push({ id: 'temporales', titulo: 'Temporales', ayuda: 'Archivos de trabajo que Jarvis puede rehacer.', items: temporales });

  // ---- Fotos y audios ----
  grupos.push({
    id: 'fotos', titulo: 'Fotos y audios de WhatsApp',
    ayuda: 'Las fotos de la webcam y los audios con tu voz se sacan, se mandan y se descartan: Jarvis no los guarda en ningún archivo de esta PC. Quedan solamente en el chat de WhatsApp.',
    items: [{ id: 'fotos', nombre: 'Fotos y audios que manda Jarvis', bytes: 0, instalado: true, detalle: 'No se guardan', soloInfo: true }],
  });

  // ---- Datos de Jarvis ----
  const datos = [];
  for (const [id, nombre, ruta, detalle] of [
    ['whatsapp-sesion', 'Sesión de WhatsApp', path.join(DATOS, 'whatsapp-sesion'), 'La vinculación con tu celular (se borra desde Ajustes → WhatsApp → Desvincular)'],
    ['historial', 'Historial, agenda y configuración', DATOS, 'Texto liviano'],
  ]) {
    if (id === 'historial') {
      let b = 0;
      for (const n of ['historial.json', 'whatsapp-agenda.json', 'config.json', 'rutinas.json', 'notificaciones.json', 'correo.json', 'androidtv.json', 'aprendido.json']) { try { b += fs.statSync(path.join(DATOS, n)).size; } catch {} }
      datos.push({ id, nombre, bytes: b, instalado: true, detalle, soloInfo: true });
    } else datos.push({ id, nombre, bytes: (await pesoDe(ruta)).bytes, instalado: true, detalle, soloInfo: true });
  }
  grupos.push({ id: 'datos', titulo: 'Datos de Jarvis', ayuda: 'Ocupan muy poco.', items: datos });

  for (const g of grupos) {
    g.bytes = g.items.reduce((s, i) => s + (i.bytes || 0), 0);
    g.liberable = g.items.filter((i) => !i.soloInfo && i.instalado && i.bytes > 0 && !i.enUso).reduce((s, i) => s + i.bytes, 0);
  }
  return {
    grupos, total: grupos.reduce((s, g) => s + g.bytes, 0),
    disco: await espacioDeDisco(DATOS), discoClips: await espacioDeDisco(carpeta),
  };
}

// Borra una carpeta/archivo sin permitir salirse de las carpetas de Jarvis.
function borrarSeguro(ruta, raices) {
  const real = path.resolve(ruta);
  if (!raices.some((r) => real === path.resolve(r) || real.startsWith(path.resolve(r) + path.sep))) throw new Error('Ese lugar no es de Jarvis.');
  fs.rmSync(real, { recursive: true, force: true });
}

// Libera un renglón. papelera(ruta) manda a la Papelera de Windows (solo para los videos del usuario).
async function liberar(id, { papelera } = {}) {
  if (id.startsWith('clips:')) {
    const carpeta = carpetaDeClips();
    if (id === 'clips:') { // los videos que están sueltos en la raíz
      let n = 0;
      for (const e of await fs.promises.readdir(carpeta, { withFileTypes: true })) if (e.isFile() && /\.(mp4|webm|mkv)$/i.test(e.name)) { await papelera(path.join(carpeta, e.name)); n++; }
      return `Mandé ${n} videos a la Papelera.`;
    }
    const nombre = id.slice(6);
    if (!nombre || /[\\/]/.test(nombre) || nombre === '..') throw new Error('Carpeta inválida.');
    const ruta = path.join(carpeta, nombre);
    if (!existe(ruta)) throw new Error('Esa carpeta ya no existe.');
    await papelera(ruta);
    return `Mandé "${nombre}" a la Papelera.`;
  }
  if (id === 'buffer') { borrarSeguro(BUFFER, [DATOS]); fs.mkdirSync(BUFFER, { recursive: true }); return 'Listo: la memoria de los clips quedó vacía.'; }
  if (id === 'temporal') { borrarSeguro(TEMPORAL, [DATOS]); return 'Listo: borré los temporales.'; }
  // Jarvis B comparte los modelos con el Jarvis original: desde B no se borran (el original los necesita).
  const compartidos = process.env.JARVIS_MODELOS_COMPARTIDOS === '1';
  if (compartidos && (id === 'descargas' || modelos.CATALOGO[id])) throw new Error('Jarvis B comparte las voces y ffmpeg con el Jarvis original: borralos desde el original.');
  if (id === 'descargas') {
    for (const n of fs.readdirSync(modelos.CARPETA)) if (/\.(descarga|tmp|plano)$/.test(n)) borrarSeguro(path.join(modelos.CARPETA, n), [DATOS]);
    return 'Listo: borré las descargas incompletas.';
  }
  const m = modelos.CATALOGO[id];
  if (!m) throw new Error('No sé qué es eso.');
  const raiz = m.comparte || id;
  const quien = modelos.CATALOGO[raiz];
  const objetivo = path.join(modelos.CARPETA, quien.carpeta || quien.archivo);
  try { borrarSeguro(objetivo, [modelos.CARPETA]); } catch (e) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw new Error('Windows no me deja borrarlo porque está en uso. Cambiá de voz en Ajustes → Asistente → Básico y probá de nuevo.');
    throw e;
  }
  fs.rmSync(path.join(modelos.CARPETA, `${raiz}.listo`), { force: true });
  return `Listo: borré "${quien.nombre.replace(/ \(.*/, '')}". Si la necesitás de nuevo, Jarvis la vuelve a bajar.`;
}

module.exports = { resumen, liberar, pesoDe };
