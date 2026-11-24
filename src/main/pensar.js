// Los modelos que "piensan" los pedidos libres. Todos gratuitos y todos hablan el mismo idioma
// (el formato de chat de OpenAI, con herramientas), así que se prueban en cadena: si uno no tiene
// clave, se quedó sin cuota o está caído, se pasa al siguiente sin que se note.
//   - groq:   nube, gratis sin tarjeta, muy rápido (console.groq.com)
//   - gemini: nube, capa gratuita de los modelos de TEXTO (no la Live API de voz, que casi no tiene cuota)
//   - ollama: un modelo corriendo en esta misma PC (ollama.com), sin internet ni límites
const historial = require('./historial');
const { leerConfig } = require('./config');
const conexion = require('./conexion');

const PROVEEDORES = {
  groq: {
    nombre: 'Groq', base: 'https://api.groq.com/openai/v1',
    // Los que figuran en la capa gratuita de Groq (cada uno tiene su propio cupo diario).
    candidatos: async () => ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'],
    // De esos, el que acepta imágenes (para mirar por la webcam).
    queVen: async () => ['qwen/qwen3.8-27b'],
    // Los gpt-oss "razonan" antes de contestar: para un asistente de voz alcanza con lo mínimo.
    extra: (modelo) => (/gpt-oss/.test(modelo) ? { reasoning_effort: 'low' } : {}),
  },
  gemini: {
    nombre: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    candidatos: (p) => modelosDeGemini(p),
    queVen: async (p) => (await modelosDeGemini(p)).filter((m) => /^gemini-/.test(m)),
    extra: () => ({}),
  },
  ollama: {
    nombre: 'Ollama (en esta PC)', base: null, local: true,
    candidatos: (p) => modelosDeOllama(p),
    queVen: (p) => modelosDeOllama(p), // depende del modelo que tengas bajado: se prueba y listo
    extra: () => ({}),
  },
};

const enfriando = new Map(); // "proveedor/modelo" -> hasta cuándo no usarlo
const sinExtra = new Set(); // modelos que rechazaron los parámetros opcionales
const informe = {}; // id -> { ok, modelo, error, cuando } (lo que muestra Ajustes)
const cache = new Map(); // listas de modelos ya consultadas

function datos(id) {
  const c = leerConfig().ia || {};
  const propio = c[id] || {};
  const p = PROVEEDORES[id];
  const base = (propio.url ? (p.local ? `${propio.url.replace(/\/+$/, '')}/v1` : propio.url.replace(/\/+$/, '')) : p.base);
  return { id, ...p, base, clave: (propio.clave || '').trim(), modelo: (propio.modelo || '').trim(), raiz: (propio.url || '').replace(/\/+$/, '') };
}
const configurado = (p) => (p.local ? !!p.base : !!p.clave);

async function pedirJSON(url, { clave, cuerpo, espera = 25000, metodo, intento = 1 } = {}) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), espera);
  try {
    const r = await fetch(url, {
      method: metodo || (cuerpo ? 'POST' : 'GET'), signal: control.signal,
      headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(clave ? { Authorization: `Bearer ${clave}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch {}
    return { estado: r.status, json, texto, reintentar: Number(r.headers.get('retry-after')) || 0 };
  } catch (e) {
    clearTimeout(reloj);
    const rechazada = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(String(e.cause && e.cause.code));
    // Un corte suelto de la conexión (pasa seguido con conexiones que quedaron abiertas) merece un segundo intento.
    if (e.name !== 'AbortError' && !rechazada && intento < 2) return pedirJSON(url, { clave, cuerpo, espera, metodo, intento: intento + 1 });
    const error = new Error(e.name === 'AbortError' ? 'tardó demasiado en responder' : 'no hay conexión');
    error.red = true;
    throw error;
  } finally {
    clearTimeout(reloj);
  }
}

async function conCache(clave, minutos, fn) {
  const guardado = cache.get(clave);
  if (guardado && Date.now() < guardado.hasta) return guardado.valor;
  const valor = await fn();
  cache.set(clave, { valor, hasta: Date.now() + minutos * 60000 });
  return valor;
}

// Google cambia seguido los nombres de sus modelos: en vez de fijarlos acá, se le pregunta qué hay
// y se eligen los de mayor cupo gratuito (los "flash-lite"; después Gemma, y recién después "flash").
function elegirDeGemini(ids) {
  const limpios = ids.map((x) => String(x).replace(/^models\//, ''))
    .filter((x) => !/embedding|imagen|image|tts|live|audio|veo|aqa|learnlm|robotics|computer|vision|guard|customtools/i.test(x));
  const version = (x) => { const m = /-(\d+(?:\.\d+)?)/.exec(x); return m ? Number(m[1]) : 0; };
  const orden = (a, b) => version(b) - version(a) || (/preview|exp/.test(a) ? 1 : 0) - (/preview|exp/.test(b) ? 1 : 0) || a.length - b.length;
  const lite = limpios.filter((x) => /^gemini-.*flash-lite/.test(x)).sort(orden);
  const gemma = limpios.filter((x) => /^gemma-/.test(x) && /-it$|^gemma-\d+$/.test(x)).sort(orden);
  const flash = limpios.filter((x) => /^gemini-.*flash/.test(x) && !/lite/.test(x)).sort(orden);
  return [...lite.slice(0, 2), ...gemma.slice(0, 1), ...flash.slice(0, 1)];
}
function modelosDeGemini(p) {
  return conCache(`gemini:${p.base}:${p.clave}`, 360, async () => {
    const r = await pedirJSON(`${p.base}/models`, { clave: p.clave, espera: 12000 });
    if (r.estado === 400 || r.estado === 401 || r.estado === 403) { const e = new Error('la clave no es válida'); e.clave = true; throw e; }
    const elegidos = elegirDeGemini(((r.json && r.json.data) || []).map((x) => x.id));
    if (!elegidos.length) throw new Error('no encontré ningún modelo de texto disponible para esa clave');
    return elegidos;
  });
}

async function listarOllama(raiz) {
  const r = await pedirJSON(`${raiz}/api/tags`, { espera: 2500 });
  return ((r.json && r.json.models) || []).map((x) => x.name).filter(Boolean);
}
function modelosDeOllama(p) {
  return conCache(`ollama:${p.raiz}`, 1, async () => {
    const lista = await listarOllama(p.raiz);
    if (!lista.length) throw new Error('Ollama está andando pero no tiene ningún modelo bajado');
    return lista.slice(0, 1);
  });
}

function mensajeDeError(r) {
  const e = r.json && (r.json.error || (Array.isArray(r.json) && r.json[0] && r.json[0].error));
  return String((e && (e.message || e)) || r.texto || '').slice(0, 300);
}

// Una consulta a un modelo puntual. Devuelve el mensaje del asistente o tira un error ya clasificado.
// conImagen: el pedido lleva una foto. Si el modelo la rechaza no se lo "enfría": para texto sigue sirviendo.
async function consultar(p, modelo, mensajes, herramientas, conImagen) {
  const clave = `${p.id}/${modelo}`;
  const armar = (conExtra) => ({
    model: modelo, messages: mensajes, temperature: 0.4, max_tokens: 900,
    ...(herramientas && herramientas.length ? { tools: herramientas, tool_choice: 'auto' } : {}),
    ...(conExtra ? p.extra(modelo) : {}),
  });
  const tieneExtra = Object.keys(p.extra(modelo)).length > 0 && !sinExtra.has(clave);
  let r = await pedirJSON(`${p.base}/chat/completions`, { clave: p.clave, cuerpo: armar(tieneExtra), espera: p.local ? 120000 : 25000 });
  if (r.estado === 400 && tieneExtra) {
    sinExtra.add(clave);
    r = await pedirJSON(`${p.base}/chat/completions`, { clave: p.clave, cuerpo: armar(false), espera: p.local ? 120000 : 25000 });
  }
  if (r.estado >= 200 && r.estado < 300) {
    const mensaje = r.json && r.json.choices && r.json.choices[0] && r.json.choices[0].message;
    if (!mensaje) throw Object.assign(new Error('respondió algo que no entiendo'), { enfriar: 60 });
    return mensaje;
  }
  const detalle = mensajeDeError(r);
  if (r.estado === 401 || r.estado === 403) throw Object.assign(new Error('la clave no es válida'), { clave: true });
  if (r.estado === 429) {
    const diario = /per day|daily|\bday\b|RPD|TPD|requests per day|tokens per day/i.test(detalle);
    throw Object.assign(new Error(diario ? 'se acabó el cupo gratuito de hoy' : 'demasiados pedidos seguidos'), { enfriar: diario ? 3600 : Math.max(20, Math.min(600, r.reintentar || 60)) });
  }
  if ((r.estado === 400 || r.estado === 404 || r.estado === 413 || r.estado === 422) && conImagen) throw new Error('no puede ver imágenes');
  if (r.estado === 400 || r.estado === 404 || r.estado === 422) throw Object.assign(new Error(`no sirve para esto (${detalle || r.estado})`), { enfriar: 3600 });
  throw Object.assign(new Error(`falló (${r.estado})`), { enfriar: 30 });
}

function normalizarRespuesta(mensaje) {
  const texto = String(mensaje.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const llamadas = (mensaje.tool_calls || []).filter((l) => l && l.function && l.function.name).map((l, i) => {
    let args = {};
    try { args = typeof l.function.arguments === 'string' ? JSON.parse(l.function.arguments || '{}') : (l.function.arguments || {}); } catch {}
    return { id: l.id || `llamada_${i}`, nombre: l.function.name, args: args && typeof args === 'object' ? args : {} };
  });
  // Lo que se guarda en el historial: solo los campos estándar (algunos modelos agregan "reasoning").
  const paraHistorial = { role: 'assistant', content: texto || (llamadas.length ? null : '') };
  if (llamadas.length) paraHistorial.tool_calls = llamadas.map((l) => ({ id: l.id, type: 'function', function: { name: l.nombre, arguments: JSON.stringify(l.args) } }));
  return { texto, llamadas, mensaje: paraHistorial };
}

// Prueba un proveedor: sus modelos candidatos, en orden, salteando los que están "enfriando".
// Modelos que ya dijeron que no aceptan imágenes: no se vuelven a probar con fotos (gastan un pedido en vano).
const sinVista = new Set();

async function conProveedor(id, mensajes, herramientas, conImagen = false) {
  const p = datos(id);
  if (!configurado(p)) throw Object.assign(new Error('sin configurar'), { ausente: true });
  let candidatos;
  try {
    candidatos = conImagen
      ? [...new Set([...(await p.queVen(p)), ...(p.modelo ? [p.modelo] : [])])]
      : (p.modelo ? [p.modelo] : await p.candidatos(p));
  } catch (e) {
    if (p.local && e.red) throw Object.assign(new Error('no está andando'), { ausente: true });
    throw e;
  }
  let ultimo = null;
  for (const modelo of candidatos) {
    const clave = `${id}/${modelo}`;
    if (conImagen && sinVista.has(clave)) continue;
    if ((enfriando.get(clave) || 0) > Date.now()) { ultimo = ultimo || new Error('se acabó el cupo gratuito por ahora'); continue; }
    const inicio = Date.now();
    try {
      const mensaje = await consultar(p, modelo, mensajes, herramientas, conImagen);
      if (!conImagen) informe[id] = { ok: true, modelo, error: null, cuando: Date.now() };
      historial.anotar(`Modelo ${p.nombre} · ${modelo}: contestó en ${Date.now() - inicio} ms`);
      return { ...normalizarRespuesta(mensaje), proveedor: id, modelo };
    } catch (e) {
      ultimo = e;
      historial.anotar(`Modelo ${p.nombre} · ${modelo}: ${e.message}`);
      if (e.enfriar) enfriando.set(clave, Date.now() + e.enfriar * 1000);
      if (conImagen && e.message === 'no puede ver imágenes') sinVista.add(clave);
      if (p.local && e.red) throw Object.assign(new Error('no está andando'), { ausente: true });
      if (e.clave || e.red) break; // con otra variante del mismo proveedor va a pasar lo mismo
    }
  }
  throw ultimo || new Error('no tiene modelos disponibles');
}

const orden = () => (leerConfig().ia.orden || []).filter((id) => PROVEEDORES[id]);

// Le pregunta al primer modelo que conteste. conImagen: el pedido lleva una foto, así que de cada
// proveedor se prueban los modelos que aceptan imágenes (los tres proveedores tienen alguno).
async function preguntar(mensajes, herramientas, { conImagen = false } = {}) {
  const fallas = [];
  let sinRed = false;
  for (const id of orden()) {
    if (conexion.sinConexion() && !PROVEEDORES[id].local) { if (configurado(datos(id))) sinRed = true; continue; } // sin conexión solo sirve el modelo de esta PC (Ollama)
    try {
      const r = await conProveedor(id, mensajes, herramientas, conImagen);
      if (!PROVEEDORES[id].local) conexion.reportar(id, true);
      return r;
    } catch (e) {
      if (e.ausente) continue;
      if (!conImagen) informe[id] = { ok: false, modelo: null, error: e.message, cuando: Date.now() };
      fallas.push(`${PROVEEDORES[id].nombre}: ${e.message}`);
      if (!PROVEEDORES[id].local) { // ¿cupo agotado, o el servicio no contesta? (un modelo que "no sirve para esto" no es una caída)
        const cupo = !!e.enfriar && /cupo|demasiados pedidos/i.test(e.message);
        if (cupo) conexion.reportar(id, false, { cupo: true, detalle: e.message });
        else if (e.red || e.clave || /falló \(\d{3}\)/.test(e.message)) conexion.reportar(id, false, { detalle: e.message });
      }
    }
  }
  const error = new Error(fallas.length ? fallas.join(' · ') : sinRed ? 'sin conexión' : 'no hay ningún modelo configurado');
  error.sinModelos = !fallas.length && !sinRed;
  error.sinConexion = !fallas.length && sinRed;
  throw error;
}

// Para el botón "Probar" de Ajustes: una consulta mínima a un proveedor solo.
async function probar(id) {
  if (!PROVEEDORES[id]) throw new Error('Proveedor desconocido.');
  const inicio = Date.now();
  try {
    const r = await conProveedor(id, [{ role: 'user', content: 'Respondé solamente con la palabra: listo' }], null);
    return { modelo: r.modelo, ms: Date.now() - inicio, texto: r.texto.slice(0, 80) };
  } catch (e) {
    if (!e.ausente) informe[id] = { ok: false, modelo: null, error: e.message, cuando: Date.now() };
    throw new Error(e.ausente ? (PROVEEDORES[id].local ? 'Ollama no está andando en esta PC.' : 'Falta la clave.') : e.message);
  }
}

function estado() {
  const salida = {};
  for (const id of Object.keys(PROVEEDORES)) {
    const p = datos(id);
    salida[id] = { nombre: p.nombre, configurado: configurado(p), local: !!p.local, ...(informe[id] || {}) };
  }
  return salida;
}

function olvidar() { enfriando.clear(); cache.clear(); sinExtra.clear(); for (const k of Object.keys(informe)) delete informe[k]; }

module.exports = { preguntar, probar, estado, listarOllama, elegirDeGemini, olvidar, PROVEEDORES };
