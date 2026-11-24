// Componentes opcionales: lo que no viene dentro del instalador porque pesa mucho o no todos lo usan.
// Se eligen con casilleros al instalar y se pueden bajar (o borrar) en cualquier momento desde
// Ajustes → Sistema → Componentes. Todo se baja de su fuente oficial, sin claves ni cuentas.
//
// El instalador deja en la carpeta de datos un "instalacion.txt" con lo elegido (nombre del asistente,
// componentes, arranque con Windows). La primera vez que abre, Jarvis lo aplica y lo renombra.
const fs = require('fs');
const path = require('path');
const { DATOS, leerConfig, guardarConfig } = require('./config');
const modelos = require('./modelos');

let ganchos = { esenciales: null, preparar: null, descargas: null };
function configurar(g) { ganchos = { ...ganchos, ...g }; }

// id, nombre, para qué sirve, peso aproximado y cómo saber si está.
const LISTA = [
  { id: 'voz', nombre: 'Escuchar y hablar', detalle: 'El modelo que pasa tu voz a texto, el detector de voz y una voz para contestar. Sin esto solo se le puede escribir.', mb: 530, recomendado: true,
    ids: () => ['vad', 'oido', modelos.idDeVoz(leerConfig().habla.voz) || 'voz-claude'] },
  { id: 'voz-daniela', nombre: 'Voz argentina (Daniela)', detalle: 'Otra voz para que te conteste, con tonada rioplatense.', mb: 110, ids: () => ['voz-daniela'] },
  { id: 'voz-kokoro', nombre: 'Voces más naturales (Dora y Alex)', detalle: 'Voces Kokoro: suenan más naturales, con acento neutro. Tardan un poco más en arrancar.', mb: 365, ids: () => ['voz-dora'] },
  { id: 'ffmpeg', nombre: 'ffmpeg (video y audio)', detalle: 'Para los clips de pantalla, las notas de voz en M4A, entrenar voces y unir video y audio al descargar.', mb: 81, ids: () => ['ffmpeg'] },
  { id: 'ytdlp', nombre: 'yt-dlp (descargar videos)', detalle: '"Descargá este video": baja videos y audios de YouTube y otros sitios.', mb: 18, externo: true },
];

async function estado() {
  const salida = [];
  for (const c of LISTA) {
    let listo = false; let bajando = false; let error = '';
    if (c.externo) {
      try { listo = !!(ganchos.descargas && (await ganchos.descargas.buscarYtdlp())); } catch {}
      bajando = enCurso.has(c.id);
      error = errores.get(c.id) || '';
    } else {
      const est = modelos.estado();
      const ids = c.ids();
      listo = ids.every((id) => modelos.instalado(id));
      bajando = ids.some((id) => est[id] && est[id].bajando);
      error = ids.map((id) => est[id] && est[id].error).filter(Boolean)[0] || '';
    }
    salida.push({ id: c.id, nombre: c.nombre, detalle: c.detalle, mb: c.mb, recomendado: !!c.recomendado, listo, bajando, error });
  }
  return salida;
}

const enCurso = new Map();
const errores = new Map();
function instalar(id) {
  const c = LISTA.find((x) => x.id === id);
  if (!c) return Promise.reject(new Error(`Componente desconocido: ${id}`));
  if (c.id === 'voz' && ganchos.esenciales) return ganchos.esenciales();
  if (c.externo) {
    if (enCurso.has(id)) return enCurso.get(id);
    errores.delete(id);
    if (process.platform !== 'win32') return Promise.reject(new Error('Solo en Windows.'));
    const p = ganchos.descargas.bajarYtdlp()
      .catch((e) => { errores.set(id, `No pude bajar yt-dlp: ${e.message}`); throw e; })
      .finally(() => enCurso.delete(id));
    enCurso.set(id, p);
    return p;
  }
  return modelos.bajarVarios(c.ids()).then(() => (ganchos.preparar ? ganchos.preparar() : null));
}

// ---- Lo que eligió el instalador ----
const ARCHIVO = () => path.join(DATOS, 'instalacion.txt');
function leerArchivo(ruta) {
  const crudo = fs.readFileSync(ruta);
  // El instalador escribe en UTF-16 (con BOM) para que el nombre pueda tener acentos o eñes.
  const texto = crudo[0] === 0xff && crudo[1] === 0xfe ? crudo.slice(2).toString('utf16le') : crudo.toString('utf8').replace(/^﻿/, '');
  const datos = {};
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([a-zA-Z0-9_-]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m) datos[m[1].toLowerCase()] = m[2];
  }
  return datos;
}
const si = (v) => /^(1|si|sí|true)$/i.test(String(v || '').trim());

// Aplica lo elegido al instalar (una sola vez). Devuelve lo que se aplicó, o null si no había nada.
function aplicarInstalacion() {
  const ruta = ARCHIVO();
  if (!fs.existsSync(ruta)) return null;
  let d;
  try { d = leerArchivo(ruta); } catch { return null; }
  const c = leerConfig();
  const cambios = {};
  const nombre = String(d.nombre || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
  if (nombre) cambios.nombre = nombre;
  if ('inicio' in d) cambios.inicioConWindows = si(d.inicio);
  if (Object.keys(cambios).length) {
    const voz = cambios.nombre && cambios.nombre !== c.nombre ? { ...c.voz, tambien: '' } : c.voz;
    guardarConfig({ ...c, ...cambios, voz });
  }
  const pedidos = LISTA.map((x) => x.id).filter((id) => si(d[id.replace(/-/g, '_')]) || si(d[id]));
  try { fs.renameSync(ruta, `${ruta}.aplicado`); } catch { try { fs.rmSync(ruta, { force: true }); } catch {} }
  return { ...cambios, componentes: pedidos };
}

// Baja de a uno lo pedido (lo esencial primero). Los errores quedan en el estado de cada componente.
async function instalarVarios(ids) {
  const orden = [...ids].sort((a, b) => (a === 'voz' ? -1 : b === 'voz' ? 1 : 0));
  for (const id of orden) { try { await instalar(id); } catch {} }
}

module.exports = { LISTA, configurar, estado, instalar, instalarVarios, aplicarInstalacion, _pruebas: { leerArchivo } };
