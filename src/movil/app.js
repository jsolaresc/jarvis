// Jarvis en el celular. Todo lo que hace pasa por /api de la PC con el token de este celular.
const $ = (s) => document.querySelector(s);
const ICONOS = {
  charla: '<path d="M4 5h16v11H9l-5 4z"/>',
  rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  actualizar: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  bajar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  carpeta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  clip: '<path d="M4 7h16v10H4z"/><path d="M9 7l-2 -3M15 7l2 -3M8 12h8"/>',
  whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-2z"/>',
  enviar: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/>',
  anterior: '<path d="M18 5v14L8 12z"/><path d="M6 5v14"/>',
  siguiente: '<path d="M6 5v14l10-7z"/><path d="M18 5v14"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  pausa: '<path d="M9 5v14M15 5v14"/>',
  juego: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M7 10.5v3M5.5 12h3"/><circle cx="15.5" cy="11" r=".6"/><circle cx="17.8" cy="13" r=".6"/>',
  tele: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8"/>',
  mensaje: '<path d="M4 5h16v11H9l-5 4z"/>',
  luz: '<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.5 1 .5 1.6h6c0-.6 0-1.2.5-1.6A6 6 0 0 0 12 3z"/>',
  musica: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  casa: '<path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/>',
  luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  estrella: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z"/>',
  camara: '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  auriculares: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  parlante: '<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7" r="1"/>',
  apagar: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  nube: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  lluvia: '<path d="M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  nota: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  modos: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  arriba: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  abajo: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  ancho: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  alto: '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
  pintar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  mudo: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/>',
  trabajo: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
};
const svg = (n, t = 22) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ICONOS.rayo}</svg>`;
const h = (tag, props = {}, ...hijos) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
  }
  for (const x of hijos.flat()) if (x != null && x !== false) el.append(x);
  return el;
};

// ---------- App de Android ----------
// Este mismo código corre adentro de la app nativa (android-app/): ahí no hay service worker, la PC se busca
// en la Wi-Fi de casa (modo casa) y los archivos se guardan o comparten con Android.
const CAP = window.Capacitor;
const NATIVO = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const nativo = NATIVO ? (CAP.registerPlugin ? CAP.registerPlugin('JarvisNativo') : CAP.Plugins.JarvisNativo) : null;
const PUERTO_CASA = 47821;
const SIN_PC = NATIVO ? 'Tu PC no responde. Revisá que esté prendida, con Jarvis abierto, y que el celular esté en la misma Wi-Fi.'
  : 'Tu PC no responde. Puede estar apagada, o Tailscale apagado en la PC o en este celular.';

// ---------- Guardado local ----------
const guardado = {
  get token() { try { return localStorage.getItem('jarvis.token') || ''; } catch { return ''; } },
  set token(v) { try { if (v) localStorage.setItem('jarvis.token', v); else localStorage.removeItem('jarvis.token'); } catch {} },
  leer(k, def) { try { const v = localStorage.getItem(`jarvis.${k}`); return v == null ? def : JSON.parse(v); } catch { return def; } },
  escribir(k, v) { try { localStorage.setItem(`jarvis.${k}`, JSON.stringify(v)); } catch {} },
};

// ---------- Pedidos a la PC ----------
// En la app de Android, la PC elegida: { base: 'http://192.168.0.10:47821', id, nombre }. En el navegador, la misma página.
const pcElegida = () => (NATIVO ? guardado.leer('pc', null) : null);
const u = (ruta) => { const pc = pcElegida(); return pc && typeof ruta === 'string' && ruta.startsWith('/api/') ? pc.base + ruta : ruta; };
// Videos, audios y miniaturas: en la app de Android pasan por la propia app (https://localhost/pc/…), que se los pide a la PC.
// Así el WebView los trata como propios (sin bloqueos por venir de otra dirección) y se pueden adelantar.
const medio = (ruta) => (NATIVO && pcElegida() && typeof ruta === 'string' && ruta.startsWith('/api/') ? `/pc${ruta}` : u(ruta));
class SinPC extends Error {}
class NoVinculado extends Error {}
async function api(ruta, { metodo = 'GET', cuerpo, espera = 20000, base, reintento = false } = {}) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), espera);
  let r;
  try {
    r = await fetch(base ? base + ruta : u(ruta), {
      method: metodo, signal: ctrl.signal, cache: 'no-store',
      headers: { ...(guardado.token && !base ? { Authorization: `Bearer ${guardado.token}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    clearTimeout(reloj);
    // En la app de Android: quizás el router le cambió la IP a la PC. Se la busca y se prueba de nuevo.
    if (NATIVO && !base && !reintento && pcElegida() && await reencontrar()) return api(ruta, { metodo, cuerpo, espera, reintento: true });
    throw new SinPC('Tu PC no responde.');
  } finally { clearTimeout(reloj); }
  let dato = {};
  try { dato = await r.json(); } catch {}
  if (r.status === 401 && ruta !== '/api/vincular') { guardado.token = ''; mostrarVincular('Este celular ya no está vinculado. Pedí un código nuevo en la PC.'); throw new NoVinculado(dato.error || 'No vinculado.'); }
  if (r.status === 502 || r.status === 503 || r.status === 504) throw new SinPC('Tu PC no responde.');
  if (!r.ok) throw new Error(dato.error || `Error ${r.status}`);
  return dato;
}

// ---------- Buscar la PC en la Wi-Fi (app de Android) ----------
// Pregunta /api/hola a cada dirección de la red del celular (las 254 de un /24), de a muchas por vez.
async function buscarPCs({ alEncontrar = () => {}, primero } = {}) {
  const { ip } = await nativo.red().catch(() => ({ ip: '' }));
  if (!ip) return [];
  const red = ip.split('.').slice(0, 3).join('.');
  const candidatas = [];
  if (primero) candidatas.push(primero);
  for (let i = 1; i < 255; i++) { const x = `${red}.${i}`; if (x !== ip && x !== primero) candidatas.push(x); }
  const halladas = [];
  const probar = async (host) => {
    const base = `http://${host}:${PUERTO_CASA}`;
    const ctrl = new AbortController(); const reloj = setTimeout(() => ctrl.abort(), 1500);
    try {
      const r = await fetch(`${base}/api/hola`, { signal: ctrl.signal, cache: 'no-store' });
      const d = await r.json();
      if (d && d.jarvis && d.pc && d.pc.id) { const pc = { base, id: d.pc.id, nombre: d.pc.nombre || host, ip: host }; halladas.push(pc); alEncontrar(pc); }
    } catch {} finally { clearTimeout(reloj); }
  };
  const cola = [...candidatas];
  await Promise.all(Array.from({ length: 48 }, async () => { while (cola.length) await probar(cola.shift()); }));
  return halladas;
}
let reencontrando = null; let ultimoReencuentro = 0;
function reencontrar() {
  const pc = pcElegida();
  if (!pc) return Promise.resolve(false);
  if (reencontrando) return reencontrando;
  if (Date.now() - ultimoReencuentro < 30000) return Promise.resolve(false);
  ultimoReencuentro = Date.now();
  reencontrando = (async () => {
    let hallada = null;
    await buscarPCs({ alEncontrar: (x) => { if (x.id === pc.id) hallada = x; } });
    if (hallada && hallada.base !== pc.base) { guardado.escribir('pc', { ...pc, base: hallada.base, ip: hallada.ip }); ultimaSincro = 0; return true; }
    return false;
  })().finally(() => { reencontrando = null; });
  return reencontrando;
}

// ---------- Ojos ----------
const pastilla = $('#pastilla');
let relojFase = null;
function fase(f, ms) {
  pastilla.dataset.fase = f;
  clearTimeout(relojFase);
  if (ms) relojFase = setTimeout(() => { pastilla.dataset.fase = conectado ? 'reposo' : 'dormido'; }, ms);
}

// ---------- Aviso arriba ----------
let relojAviso = null;
function aviso(texto, { tipo = '', ms = 3500, accion } = {}) {
  const a = $('#aviso');
  a.replaceChildren(h('span', {}, texto), accion ? h('button', { type: 'button', onclick: accion.hacer }, accion.texto) : '');
  a.className = tipo; a.hidden = !texto;
  clearTimeout(relojAviso);
  if (ms) relojAviso = setTimeout(() => { a.hidden = true; }, ms);
}

// ---------- Estado de la PC ----------
let estado = null;
let conectado = false;
let ultimaSincro = 0;
async function refrescar({ silencioso = false } = {}) {
  try {
    estado = await api('/api/estado', { espera: 8000 });
    if (!conectado) { conectado = true; aviso(''); }
    pintarEstado();
    if (NATIVO && Date.now() - ultimaSincro > 5 * 60000) { ultimaSincro = Date.now(); sincronizarAvisos(); }
    if (pastilla.dataset.fase === 'dormido') fase('reposo');
  } catch (e) {
    if (e instanceof SinPC) {
      conectado = false;
      $('#estado-pc').textContent = 'Tu PC no responde';
      $('#arriba').classList.add('sin-pc');
      fase('dormido');
      if (!silencioso) aviso(SIN_PC, { tipo: 'mal', ms: 0, accion: { texto: 'Reintentar', hacer: () => refrescar() } });
    }
  }
}
function pintarEstado() {
  const e = estado;
  $('#arriba').classList.remove('sin-pc');
  $('#pc').textContent = e.pc || 'Jarvis';
  const modo = (e.modos || []).find((m) => m.id === e.modo);
  $('#estado-pc').textContent = [modo ? `Modo ${modo.nombre.toLowerCase()}` : 'Conectado', e.conexion && e.conexion.sin ? 'la PC está sin internet' : '', e.whatsapp !== 'conectado' ? 'WhatsApp desconectado' : ''].filter(Boolean).join(', ');
  $('#menu-yo').textContent = `Este celular: ${(e.yo && e.yo.nombre) || ''}`;
  // Contactos para "Para" (sugerencias; también se puede escribir cualquier nombre o número).
  $('#contactos').replaceChildren(...['Yo', ...(e.contactos || [])].map((c) => h('option', { value: c })));
  pintarInicio();
  const c = e.clips || {};
  $('#clips-estado').textContent = c.grabando ? `Grabando${c.pausado ? ' (en pausa)' : ''}…` : !c.activo ? 'La repetición instantánea está apagada en la PC: "Guardar clip" no va a tener nada.' : !c.permitido ? 'El modo actual no graba clips.' : c.corriendo ? `Repetición instantánea andando${c.segundos ? ` (${c.segundos} s guardados)` : ''}.` : c.error ? `Clips: ${c.error}` : 'Repetición instantánea en pausa.';
  const g = $('#boton-grabar');
  g.textContent = c.grabando ? 'Parar' : 'Grabar';
  g.dataset.clip = c.grabando ? 'parar' : 'grabar';
  g.classList.toggle('grabando', !!c.grabando);
}

// ---------- Acciones ----------
async function accion(pedido, boton) {
  if (boton) boton.disabled = true;
  fase('pensando');
  try {
    const r = await api('/api/accion', { metodo: 'POST', cuerpo: pedido, espera: 120000 });
    fase('ok', 1400);
    aviso(r.texto || 'Listo.', { tipo: 'bien' });
    refrescar({ silencioso: true });
    return r;
  } catch (e) {
    if (e instanceof NoVinculado) return null;
    fase('error', 1800);
    aviso(e instanceof SinPC ? 'Tu PC no responde: no se pudo hacer.' : e.message, { tipo: 'mal', ms: 6000 });
    return null;
  } finally { if (boton) boton.disabled = false; }
}

// ---------- Charla ----------
let charla = guardado.leer('charla', []);
function pintarCharla() {
  const ol = $('#mensajes');
  ol.replaceChildren(...(charla.length ? charla.map((m) => h('li', { class: m.quien }, m.texto)) : [h('li', { class: 'vacio' }, 'Pedile lo que le pedirías por voz: "poné música", "mandale a Tomi que ya salgo", "¿qué tengo hoy?". Lo hace la PC.')]));
  ol.scrollTop = ol.scrollHeight;
}
function sumar(quien, texto) {
  charla.push({ quien, texto, t: Date.now() });
  charla = charla.slice(-60);
  guardado.escribir('charla', charla);
  pintarCharla();
}
let ocupado = false;
async function mandarTexto(t) {
  const texto = String(t || '').trim();
  if (!texto || ocupado) return;
  ocupado = true;
  $('#respuestas-rapidas').hidden = true;
  sumar('vos', texto);
  const pensando = h('li', { class: 'jarvis pensando', 'aria-label': 'Jarvis está pensando' }, h('i'), h('i'), h('i'));
  $('#mensajes').append(pensando); $('#mensajes').scrollTop = 1e9;
  fase('pensando');
  try {
    const r = await api('/api/texto', { metodo: 'POST', cuerpo: { texto }, espera: 120000 });
    pensando.remove();
    sumar('jarvis', r.texto || 'Listo.');
    if (NATIVO) setTimeout(sincronizarAvisos, 1500); // por si fue "recordame…": que el celular ya lo tenga
    fase(/^(No pude|Algo falló)/.test(r.texto || '') ? 'error' : 'ok', 1400);
    // Jarvis preguntó "¿lo hago?": botones para contestar de un toque.
    if (r.espera || /\?\s*$/.test(r.texto || '')) {
      const rr = $('#respuestas-rapidas');
      rr.replaceChildren(...['Sí', 'No'].map((x) => h('button', { type: 'button', onclick: () => mandarTexto(x) }, x)));
      rr.hidden = false;
    }
    refrescar({ silencioso: true });
  } catch (e) {
    pensando.remove();
    if (e instanceof NoVinculado) return;
    sumar('error', e instanceof SinPC ? 'Tu PC no responde. No llegó el pedido.' : e.message);
    fase('error', 1800);
  } finally { ocupado = false; }
}
const campoTexto = $('#texto');
campoTexto.addEventListener('input', () => { campoTexto.style.height = 'auto'; campoTexto.style.height = `${Math.min(140, campoTexto.scrollHeight)}px`; });
campoTexto.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#form-texto').requestSubmit(); } });
$('#form-texto').addEventListener('submit', (e) => { e.preventDefault(); const t = campoTexto.value; campoTexto.value = ''; campoTexto.style.height = 'auto'; mandarTexto(t); });

// ---------- Archivos guardados en este celular ----------
// Se guardan dentro de la app (Cache Storage del navegador: aguanta archivos grandes y no los borra al actualizar).
// La lista con nombre/tipo/tamaño va aparte. La app no puede ver la galería ni las carpetas del celular (Android no
// se lo permite a una app web): solo lo que se bajó con Jarvis. "Guardar en Descargas" deja una copia en el celular.
const local = {
  cache: () => caches.open('jarvis-archivos'),
  lista() { return guardado.leer('archivos', []); },
  escribir(l) { guardado.escribir('archivos', l); },
  clave: (id) => `/local/${id}`,
  async guardarDesde(url, meta, alAvanzar = () => {}) {
    const r = await fetch(u(url), { headers: { Authorization: `Bearer ${guardado.token}` }, cache: 'no-store' });
    if (!r.ok || !r.body) throw new Error(r.status === 404 ? 'El archivo ya no está en la PC.' : `La PC contestó ${r.status}.`);
    const total = Number(r.headers.get('content-length')) || meta.bytes || 0;
    let n = 0;
    const lector = r.body.getReader();
    const flujo = new ReadableStream({
      async pull(c) {
        const { done, value } = await lector.read();
        if (done) { c.close(); return; }
        n += value.length; alAvanzar(total ? n / total : 0); c.enqueue(value);
      },
      cancel(m) { lector.cancel(m); },
    });
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const tipoMime = r.headers.get('content-type') || 'application/octet-stream';
    await (await local.cache()).put(local.clave(id), new Response(flujo, { headers: { 'Content-Type': tipoMime } }));
    if (total && n !== total) { await local.borrar(id); throw new Error('Se cortó a mitad de camino. Probá de nuevo.'); }
    const item = { id, nombre: meta.nombre, tipo: meta.tipo, bytes: n, fecha: Date.now(), mime: tipoMime };
    if (meta.tipo !== 'audio') item.miniatura = await local.cuadro(id).catch(() => '');
    local.escribir([item, ...local.lista()]);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
    return item;
  },
  // Un cuadro del video (a 1 s, o al medio si es más corto), chiquito, para la lista.
  async cuadro(id) {
    const u = URL.createObjectURL(await local.blob(id));
    try {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = u;
      await new Promise((ok, mal) => { v.onloadedmetadata = ok; v.onerror = mal; setTimeout(mal, 8000); });
      v.currentTime = Math.min(1, (v.duration || 2) / 2);
      await new Promise((ok, mal) => { v.onseeked = ok; v.onerror = mal; setTimeout(mal, 8000); });
      const c = document.createElement('canvas');
      c.width = 208; c.height = Math.round(208 * (v.videoHeight / v.videoWidth || 9 / 16));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } finally { URL.revokeObjectURL(u); }
  },
  async blob(id) {
    const r = await (await local.cache()).match(local.clave(id));
    if (!r) throw new Error('Ese archivo ya no está en el celular.');
    return r.blob();
  },
  async borrar(id) {
    await (await local.cache()).delete(local.clave(id));
    local.escribir(local.lista().filter((x) => x.id !== id));
  },
};

// ---------- Descargar ----------
const elegido = (campo) => document.querySelector(`.segmentado[data-campo="${campo}"] [aria-checked="true"]`).dataset.valor;
document.querySelectorAll('.segmentado[data-campo] button').forEach((b) => b.addEventListener('click', () => {
  b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  guardado.escribir(`descarga.${b.parentElement.dataset.campo}`, b.dataset.valor);
  $('#d-calidad-fila').hidden = elegido('modo') === 'audio';
}));
for (const campo of ['modo', 'calidad', 'para']) {
  const v = guardado.leer(`descarga.${campo}`, null);
  const b = v && document.querySelector(`.segmentado[data-campo="${campo}"] [data-valor="${v}"]`);
  if (b) b.click();
}
// Un link suelto o dentro de un texto ("Mirá esto https://youtu.be/…"), como llega al compartir desde otra app.
const linkDe = (t) => { const m = /https?:\/\/[^\s<>"']+/i.exec(String(t || '')); return m ? m[0].replace(/[).,;]+$/, '') : ''; };
// Si se pega un texto con el link adentro, queda solo el link.
$('#d-url').addEventListener('input', () => { const v = $('#d-url').value; const l = linkDe(v); if (l && l !== v.trim()) $('#d-url').value = l; });
$('#d-pegar').addEventListener('click', async () => {
  try { const t = await navigator.clipboard.readText(); const l = linkDe(t) || t.trim(); if (l) $('#d-url').value = l; else aviso('No hay un link copiado.', { tipo: 'mal' }); }
  catch { aviso('El navegador no dejó leer lo copiado: mantené apretado el campo y elegí Pegar.', { tipo: 'mal', ms: 5000 }); }
});
$('#form-descarga').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = linkDe($('#d-url').value) || $('#d-url').value.trim();
  if (!/^https?:\/\//i.test(url)) { aviso('Pegá un link que empiece con http.', { tipo: 'mal' }); return; }
  const b = e.submitter; b.disabled = true; fase('pensando');
  try {
    const r = await api('/api/descargas', { metodo: 'POST', cuerpo: { url, modo: elegido('modo'), calidad: elegido('calidad'), para: elegido('para') } });
    fase('ok', 1400);
    aviso(r.texto, { tipo: 'bien' });
    $('#d-url').value = '';
    seguirDescargas();
  } catch (x) {
    fase('error', 1800);
    aviso(x instanceof SinPC ? 'Tu PC no responde: para descargar tiene que estar prendida con Jarvis abierto.' : x.message, { tipo: 'mal', ms: 7000 });
  } finally { b.disabled = false; }
});

// Lo que se pidió desde este celular: progreso, y las que son para el celular se traen solas al terminar.
const trayendo = new Map(); // id -> fracción
let relojDescargas = null;
let descargas = [];
async function seguirDescargas() {
  clearTimeout(relojDescargas);
  try { descargas = (await api('/api/descargas', { espera: 8000 })).descargas || []; } catch { descargas = descargas || []; }
  for (const d of descargas) if (d.bajar && !trayendo.has(d.id)) traer(d);
  pintarDescargas();
  if (!document.hidden && descargas.some((d) => d.estado === 'bajando' || d.estado === 'espera' || trayendo.has(d.id))) relojDescargas = setTimeout(seguirDescargas, 1500);
}
async function traer(d) {
  trayendo.set(d.id, 0);
  try {
    await local.guardarDesde(d.bajar, { nombre: d.archivo || d.nombre, tipo: d.modo === 'audio' ? 'audio' : 'video', bytes: d.bytes }, (f) => { trayendo.set(d.id, f); pintarDescargas(); });
    await api('/api/descargas/recibido', { metodo: 'POST', cuerpo: { id: d.id } }).catch(() => {});
    aviso(`Listo: "${d.nombre || d.archivo}" quedó en el celular (Archivos → En este celular).`, { tipo: 'bien', ms: 5000 });
    fase('ok', 1400);
  } catch (e) {
    aviso(`No pude traerlo al celular: ${e.message}`, { tipo: 'mal', ms: 7000 });
  } finally { trayendo.delete(d.id); seguirDescargas(); if (hojaActual === 'archivos') pintarArchivos(); }
}
function pintarDescargas() {
  const ul = $('#lista-descargas');
  const visibles = descargas.filter((d) => !(d.para === 'celular' && d.estado === 'listo' && !trayendo.has(d.id) && !d.bajar));
  ul.replaceChildren(...visibles.map((d) => {
    const t = trayendo.get(d.id);
    const pct = t !== undefined ? Math.round(t * 100) : d.pct;
    const que = d.estado === 'error' ? d.error : d.estado === 'espera' ? 'En la fila' : d.estado === 'bajando' ? `La PC lo está bajando: ${d.pct}%` : t !== undefined ? `Pasándolo al celular: ${pct}%` : d.para === 'pc' ? 'Listo, quedó en la PC' : 'Listo';
    return h('li', { class: d.estado === 'error' ? 'mal' : '' },
      h('span', { class: 'ic', html: svg(d.modo === 'audio' ? 'musica' : 'bajar') }),
      h('div', { class: 'datos' }, h('b', {}, d.nombre || (d.modo === 'audio' ? 'Audio' : 'Video')), h('span', {}, `${d.para === 'pc' ? 'Para la PC' : 'Para el celular'}. ${que}`),
        (d.estado === 'bajando' || t !== undefined) ? h('div', { class: 'progreso' }, h('i', { style: `width:${pct}%` })) : null));
  }));
}

// ---------- Archivos ----------
let donde = guardado.leer('archivos.donde', 'pc');
let filtro = 'todo';
let enPC = [];
const tam = (b) => (!b ? '' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const cuando = (t) => { const d = new Date(t); const hoy = new Date(); return d.toDateString() === hoy.toDateString() ? `hoy ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); };
const TIPO = { clip: 'Clip', video: 'Descarga', audio: 'Audio' };
const sinExt = (n) => String(n || '').replace(/ \[[^\]]+\](?=\.[a-z0-9]+$)/i, '').replace(/\.[a-z0-9]{2,4}$/i, '');
document.querySelectorAll('[data-donde]').forEach((b) => b.addEventListener('click', () => { donde = b.dataset.donde; guardado.escribir('archivos.donde', donde); cargarArchivos(); }));
document.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.filtro; pintarArchivos(); }));
$('#actualizar-archivos').innerHTML = svg('actualizar', 20);
$('#actualizar-archivos').addEventListener('click', () => cargarArchivos());
async function cargarArchivos() {
  if (donde === 'pc') {
    try { enPC = (await api('/api/archivos')).archivos || []; $('#lista-archivos').dataset.error = ''; }
    catch (e) { enPC = []; $('#lista-archivos').dataset.error = e instanceof SinPC ? 'Tu PC no responde: los archivos de la PC se ven con la PC prendida. Los de este celular siguen acá.' : e.message; }
  }
  pintarArchivos();
}
async function pintarArchivos() {
  document.querySelectorAll('[data-donde]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.donde === donde)));
  document.querySelectorAll('[data-filtro]').forEach((b) => { b.setAttribute('aria-checked', String(b.dataset.filtro === filtro)); b.classList.toggle('on', b.dataset.filtro === filtro); });
  const todos = donde === 'pc' ? enPC : local.lista();
  const lista = todos.filter((a) => filtro === 'todo' || a.tipo === filtro);
  const ul = $('#lista-archivos');
  const vacio = ul.dataset.error && donde === 'pc' ? ul.dataset.error
    : donde === 'pc' ? (filtro === 'todo' ? 'No hay clips ni descargas en la PC.' : 'No hay nada de este tipo en la PC.')
      : 'Todavía no guardaste nada en este celular. Descargá algo eligiendo "En este celular", o abrí un archivo de la PC y tocá "Pasar al celular".';
  ul.replaceChildren(...(lista.length ? lista.map((a) => h('li', {},
    h('button', { type: 'button', class: 'abrir', 'aria-label': `Abrir ${sinExt(a.nombre)}`, onclick: () => abrirArchivo(a) },
      a.miniatura ? h('span', { class: 'mini' }, h('img', { src: medio(a.miniatura), alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(h('span', { html: svg(a.tipo === 'audio' ? 'musica' : 'clip', 26) })) }))
        : h('span', { class: 'mini', html: svg(a.tipo === 'audio' ? 'musica' : 'clip', 26) }),
      h('span', { class: 'datos' }, h('b', {}, sinExt(a.nombre)), h('span', {}, [TIPO[a.tipo] || '', a.tipo === 'clip' ? a.carpeta : '', cuando(a.fecha), tam(a.bytes)].filter(Boolean).join(', ')))))) : [h('li', { class: 'tenue vacio' }, vacio)]));
  if (donde === 'celular' && navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate().catch(() => null);
    $('#espacio').textContent = e ? `Ocupa ${tam(local.lista().reduce((s, a) => s + (a.bytes || 0), 0)) || '0 KB'} en el celular.` : '';
  } else $('#espacio').textContent = '';
}

// La hoja de un archivo: verlo o escucharlo y qué hacer con él.
const hoja = $('#hoja-archivo');
let abierto = null; // { a, donde, url }
async function abrirArchivo(a) {
  const enCel = donde === 'celular';
  let src = medio(a.ver);
  if (enCel) { try { src = URL.createObjectURL(await local.blob(a.id)); } catch (e) { aviso(e.message, { tipo: 'mal' }); return; } }
  abierto = { a, enCel, url: enCel ? src : '' };
  const reproductor = a.tipo === 'audio' ? h('audio', { controls: '', src, preload: 'metadata' }) : h('video', { controls: '', playsinline: '', src, preload: 'metadata' });
  $('#ha-medio').replaceChildren(reproductor);
  $('#ha-medio').className = a.tipo === 'audio' ? 'audio' : '';
  $('#ha-nombre').textContent = sinExt(a.nombre);
  $('#ha-datos').textContent = [TIPO[a.tipo], enCel ? 'En este celular' : `En la PC${a.carpeta ? ` (${a.carpeta})` : ''}`, tam(a.bytes)].filter(Boolean).join('. ');
  $('#ha-progreso').hidden = true;
  if (!$('#ha-para').value && estado && estado.enviarA) $('#ha-para').value = estado.enviarA;
  const acciones = [];
  if (enCel) {
    acciones.push(['Compartir…', compartir], ['Guardar en Descargas del celular', exportar], ['Pasar a la PC', pasarAPC], ['Borrar del celular', borrarLocal, 'peligro']);
  } else {
    acciones.push(['Pasar al celular', pasarAlCelular], ['Compartir…', compartir]);
  }
  $('#ha-acciones').replaceChildren(...acciones.map(([t, fn, clase]) => h('button', { type: 'button', class: clase || '', onclick: (ev) => fn(ev.currentTarget) }, t)));
  hoja.showModal();
}
function cerrarHoja() { hoja.close(); }
hoja.addEventListener('close', () => {
  const m = $('#ha-medio').firstChild; if (m) { m.pause(); m.removeAttribute('src'); m.load && m.load(); }
  if (abierto && abierto.url) URL.revokeObjectURL(abierto.url);
  abierto = null;
});
$('#ha-cerrar').addEventListener('click', cerrarHoja);
hoja.addEventListener('click', (e) => { if (e.target === hoja) cerrarHoja(); });
const progreso = (f) => { const p = $('#ha-progreso'); p.hidden = f === null; if (f !== null) p.firstChild.style.width = `${Math.round(f * 100)}%`; };
async function trabajando(boton, fn) {
  const botones = hoja.querySelectorAll('button:not(#ha-cerrar)');
  botones.forEach((b) => { b.disabled = true; });
  fase('pensando');
  try { await fn(); fase('ok', 1400); }
  catch (e) { fase('error', 1800); aviso(e instanceof SinPC ? 'Tu PC no responde.' : e.message, { tipo: 'mal', ms: 7000 }); }
  finally { botones.forEach((b) => { b.disabled = false; }); progreso(null); }
}
// Mandar por WhatsApp desde la PC: lo de la PC sale directo; lo del celular primero se sube.
$('#ha-mandar').addEventListener('click', (ev) => {
  const para = $('#ha-para').value.trim();
  if (!para) { aviso('Escribí a quién mandárselo.', { tipo: 'mal' }); $('#ha-para').focus(); return; }
  const { a, enCel } = abierto;
  trabajando(ev.currentTarget, async () => {
    const r = enCel ? await subir(a, { destino: 'enviar', contacto: para }) : await api('/api/archivos/enviar', { metodo: 'POST', cuerpo: { id: a.id, contacto: para }, espera: 600000 });
    aviso(r.texto || `Listo, se lo mandé a ${para}.`, { tipo: 'bien', ms: 5000 });
  });
});
// Subir con progreso (fetch todavía no lo informa al subir).
function subir(a, { destino, contacto = '' }) {
  return local.blob(a.id).then((blob) => new Promise((ok, mal) => {
    const x = new XMLHttpRequest();
    x.open('POST', u(`/api/subir?destino=${destino}&nombre=${encodeURIComponent(a.nombre)}&contacto=${encodeURIComponent(contacto)}`));
    x.setRequestHeader('Authorization', `Bearer ${guardado.token}`);
    x.upload.onprogress = (e) => { if (e.lengthComputable) progreso(e.loaded / e.total); };
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} if (x.status >= 200 && x.status < 300) ok(d); else mal(new Error(d.error || `Error ${x.status}`)); };
    x.onerror = () => mal(new SinPC('Tu PC no responde.'));
    x.send(blob);
  }));
}
async function pasarAlCelular() {
  const { a } = abierto;
  await trabajando(null, async () => {
    await local.guardarDesde(a.ver, { nombre: a.nombre, tipo: a.tipo, bytes: a.bytes }, (f) => progreso(f));
    aviso('Listo, quedó en este celular.', { tipo: 'bien' });
  });
}
async function pasarAPC() {
  await trabajando(null, async () => { const r = await subir(abierto.a, { destino: 'pc' }); aviso(r.texto, { tipo: 'bien', ms: 6000 }); });
}
async function compartir() {
  const { a, enCel } = abierto;
  await trabajando(null, async () => {
    let blob;
    if (enCel) blob = await local.blob(a.id);
    else {
      const r = await fetch(u(a.ver)); if (!r.ok) throw new Error('No pude traerlo de la PC.');
      blob = await r.blob();
    }
    if (NATIVO) { await aAndroid(blob, a.nombre, 'compartir'); return; }
    const archivo = new File([blob], a.nombre, { type: blob.type || 'application/octet-stream' });
    if (!navigator.canShare || !navigator.canShare({ files: [archivo] })) throw new Error('Este navegador no deja compartir archivos. Guardalo en Descargas y compartilo desde la galería.');
    try { await navigator.share({ files: [archivo], title: sinExt(a.nombre) }); }
    catch (e) { if (e.name !== 'AbortError') throw e; }
  });
}
// Pasarle un archivo a Android (Descargas o el menú Compartir), de a 2 MB para no llenar la memoria.
async function aAndroid(blob, nombre, destino) {
  const { id } = await nativo.archivoAbrir({ nombre, mime: blob.type || 'application/octet-stream', destino });
  const PARTE = 2 * 1024 * 1024;
  try {
    for (let i = 0; i < blob.size; i += PARTE) {
      const datos = await new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => mal(fr.error); fr.readAsDataURL(blob.slice(i, i + PARTE)); });
      await nativo.archivoEscribir({ id, datos });
      if (blob.size > PARTE * 2) progreso(Math.min(1, (i + PARTE) / blob.size));
    }
    const r = await nativo.archivoCerrar({ id });
    progreso(null);
    return r;
  } catch (e) { await nativo.archivoCancelar({ id }).catch(() => {}); progreso(null); throw e; }
}
async function exportar() {
  const blob = await local.blob(abierto.a.id);
  if (NATIVO) {
    await trabajando(null, async () => { await aAndroid(blob, abierto.a.nombre, 'descargas'); aviso('Listo: quedó en Descargas → Jarvis, en el celular.', { tipo: 'bien', ms: 5000 }); });
    return;
  }
  const u = URL.createObjectURL(blob);
  const link = h('a', { href: u, download: abierto.a.nombre });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
  aviso('Listo: lo vas a ver en la carpeta Descargas del celular.', { tipo: 'bien', ms: 5000 });
}
async function borrarLocal() {
  const { a } = abierto;
  if (!confirm(`¿Borrar "${sinExt(a.nombre)}" de este celular? La copia de la PC (si hay) no se toca.`)) return;
  await local.borrar(a.id);
  cerrarHoja(); pintarArchivos();
  aviso('Listo, lo borré del celular.', { tipo: 'bien' });
}

// Botones de clips (arriba de Archivos).
document.querySelectorAll('[data-clip]').forEach((b) => b.addEventListener('click', async () => {
  const acc = b.dataset.clip;
  const r = await accion({ tipo: 'clip', accion: acc }, b);
  if (r && (acc === 'guardar' || acc === 'parar' || acc === 'captura')) setTimeout(() => { if (donde === 'pc') cargarArchivos(); }, 1500);
}));

// ---------- Música ----------


// ---------- WhatsApp ----------
$('#form-wa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const para = $('#wa-para').value.trim(); const mensaje = $('#wa-texto').value.trim();
  if (!mensaje) { aviso('Escribí el mensaje.', { tipo: 'mal' }); $('#wa-texto').focus(); return; }
  const r = await accion({ tipo: 'whatsapp', contacto: para, mensaje }, e.submitter);
  if (r) $('#wa-texto').value = '';
});
$('#wa-foto').addEventListener('click', (e) => {
  const para = $('#wa-para').value.trim();
  if (!para) { aviso('Escribí a quién mandarle la foto.', { tipo: 'mal' }); $('#wa-para').focus(); return; }
  const mensaje = $('#wa-texto').value.trim();
  accion({ tipo: 'foto', contacto: para, ...(mensaje ? { mensaje } : {}) }, e.currentTarget).then((r) => { if (r && mensaje) $('#wa-texto').value = ''; });
});

// ---------- Navegación ----------
const HOJAS = ['inicio', 'charla', 'descargar', 'archivos', 'mensaje'];
let hojaActual = 'inicio';
function irA(hoja) {
  if (!HOJAS.includes(hoja)) hoja = 'inicio';
  if (hoja !== 'inicio' && editando) terminarEdicion();
  for (const x of HOJAS) $(`#s-${x}`).hidden = x !== hoja;
  document.querySelectorAll('#abajo button').forEach((b) => { if (b.dataset.hoja === hoja) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  guardado.escribir('hoja', hoja);
  hojaActual = hoja;
  if (hoja === 'archivos') cargarArchivos();
  if (hoja === 'descargar') seguirDescargas();
  if (hoja === 'charla') $('#mensajes').scrollTop = 1e9;
  if (hoja === 'inicio') { pintarInicio(); cargarInicio(); }
}
document.querySelectorAll('#abajo button').forEach((b) => { b.querySelector('.i').innerHTML = svg(b.querySelector('.i').dataset.i); b.addEventListener('click', () => irA(b.dataset.hoja)); });
$('#enviar').innerHTML = svg('enviar');
$('#boton-menu').innerHTML = svg('menu');

// Menú de opciones
const menu = $('#menu');
$('#boton-menu').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#boton-menu').setAttribute('aria-expanded', String(!menu.hidden)); });
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; $('#boton-menu').setAttribute('aria-expanded', 'false'); } });
$('#m-borrar').addEventListener('click', () => { charla = []; guardado.escribir('charla', charla); pintarCharla(); menu.hidden = true; });
$('#m-desvincular').addEventListener('click', async () => {
  menu.hidden = true;
  if (!confirm('¿Desvincular este celular? Para volver a usar Jarvis vas a necesitar un código nuevo de la PC.')) return;
  try { await api('/api/desvincular', { metodo: 'POST' }); } catch {}
  guardado.token = ''; charla = []; guardado.escribir('charla', []);
  if (NATIVO) guardado.escribir('pc', null);
  mostrarVincular('Listo, este celular quedó desvinculado.');
});

// ---------- Vincular ----------
function mostrarVincular(mensaje = '') {
  $('#app').hidden = true; $('#abajo').hidden = true; $('#boton-menu').hidden = true;
  $('#vincular').hidden = false;
  $('#pc').textContent = 'Jarvis';
  $('#estado-pc').textContent = 'Sin vincular';
  $('#error-vincular').textContent = mensaje;
  campoCodigo.value = '';
  aviso('');
  clearInterval(relojEstado);
  fase('reposo');
  if (NATIVO) { $('#elegir-pc').hidden = false; $('#vincular-texto').textContent = 'Con el celular en la misma Wi-Fi que la PC: en Jarvis, abrí Ajustes → Dispositivos → Celular y tocá Vincular un celular. Escribí acá el código que aparece.'; buscarParaVincular(); }
}
function mostrarApp() {
  $('#vincular').hidden = true;
  $('#app').hidden = false; $('#abajo').hidden = false; $('#boton-menu').hidden = false;
  pintarCharla();
  irA('inicio'); // siempre arranca en Inicio (y "atrás" vuelve acá)
}
const campoCodigo = $('#codigo');
campoCodigo.addEventListener('input', () => { const d = campoCodigo.value.replace(/\D/g, '').slice(0, 6); campoCodigo.value = d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d; });
// En la app de Android: elegir la PC (se busca sola en la Wi-Fi, o se escribe su dirección).
let pcsHalladas = [];
let pcVincular = null;
function pintarPCs() {
  const lista = $('#lista-pcs');
  lista.replaceChildren(...pcsHalladas.map((pc) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(!!pcVincular && pcVincular.base === pc.base), class: pcVincular && pcVincular.base === pc.base ? 'on' : '',
    onclick: () => { pcVincular = pc; $('#ip-pc').value = ''; pintarPCs(); campoCodigo.focus(); } }, h('b', {}, pc.nombre), h('span', {}, pc.ip))));
}
async function buscarParaVincular() {
  if (!NATIVO) return;
  const b = $('#buscar-pcs'); b.disabled = true;
  $('#buscando-pcs').textContent = 'Buscando tu PC en la Wi-Fi…';
  pcsHalladas = []; pintarPCs();
  const halladas = await buscarPCs({ alEncontrar: (pc) => { pcsHalladas.push(pc); if (!pcVincular && pcsHalladas.length === 1) pcVincular = pc; pintarPCs(); } });
  $('#buscando-pcs').textContent = halladas.length ? (halladas.length === 1 ? '' : 'Elegí tu PC.')
    : 'No encontré ninguna PC con Jarvis en esta Wi-Fi. Revisá que Jarvis esté abierto, con el modo casa prendido (Ajustes → Celular), y que el celular esté en la misma Wi-Fi. La primera vez, Windows puede preguntar si deja entrar a Jarvis: tocá "Permitir".';
  b.disabled = false;
}
async function pcParaVincular() {
  const escrita = $('#ip-pc').value.trim();
  if (escrita) {
    const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?$/.exec(escrita);
    if (!m) throw new Error('Escribí la dirección como aparece en la PC, por ejemplo 192.168.0.10.');
    const base = `http://${m[1]}:${m[2] || PUERTO_CASA}`;
    const d = await api('/api/hola', { base, espera: 4000 });
    if (!d.jarvis || !d.pc) throw new SinPC('No es Jarvis.');
    return { base, id: d.pc.id, nombre: d.pc.nombre || m[1], ip: m[1] };
  }
  if (!pcVincular) throw new Error(pcsHalladas.length ? 'Elegí tu PC.' : 'Todavía no encontré tu PC. Tocá "Buscar de nuevo" o escribí su dirección.');
  return pcVincular;
}
$('#form-vincular').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = campoCodigo.value.replace(/\D/g, '');
  if (codigo.length !== 6) { $('#error-vincular').textContent = 'El código tiene 6 cifras.'; return; }
  const b = e.submitter || $('#form-vincular button'); b.disabled = true; fase('pensando');
  try {
    const pc = NATIVO ? await pcParaVincular() : null;
    const r = await api('/api/vincular', { metodo: 'POST', base: pc ? pc.base : undefined, cuerpo: { codigo, nombre: $('#nombre-cel').value.trim() || nombrePorDefecto() } });
    if (pc) guardado.escribir('pc', pc);
    guardado.token = r.token;
    if (!NATIVO) history.replaceState(null, '', '/');
    fase('ok', 1400);
    mostrarApp();
    aviso(`Listo, "${r.nombre}" quedó vinculado.`, { tipo: 'bien' });
    if (NATIVO) { nativo.pedirPermisoAvisos().catch(() => {}); ultimaSincro = 0; }
    refrescar();
    seguir();
  } catch (x) {
    fase('error', 1800);
    $('#error-vincular').textContent = x instanceof SinPC ? (NATIVO ? 'No llego a tu PC. Revisá que Jarvis esté abierto, con el modo casa prendido, y que el celular esté en la misma Wi-Fi.' : 'No llego a tu PC. Revisá que Jarvis esté abierto y Tailscale prendido en los dos aparatos.') : x.message;
  } finally { b.disabled = false; }
});
function nombrePorDefecto() {
  const m = /Android[^;]*;\s*([^;)]+?)(?:\s+Build|\))/.exec(navigator.userAgent);
  return m && !/^K$/.test(m[1].trim()) ? m[1].trim().slice(0, 40) : 'Mi celular';
}

// ---------- Inicio: widgets (como el panel del notch de la PC, en una grilla de 2 columnas) ----------
// Cada celular tiene el suyo (se guarda en el celular). tam: 1 = media fila, 2 = fila entera. alto: 1 o 2.
const COLORES_W = ['', '#6EE787', '#FFC857', '#FF8FA3', '#C3A6FF', '#6EA8FE', '#FF9F5A', '#FFFFFF'];
const TIPOS_W = {
  reloj: { nombre: 'Reloj', icono: 'reloj', tams: [1, 2], unico: true },
  clima: { nombre: 'Clima', icono: 'sol', tams: [1, 2], altos: [1, 2], unico: true },
  agenda: { nombre: 'Próximos eventos', icono: 'calendario', tams: [2], altos: [1, 2], unico: true },
  notas: { nombre: 'Recordatorios y notas', icono: 'nota', tams: [2], altos: [1, 2], unico: true },
  nota: { nombre: 'Nota rápida', icono: 'nota', tams: [2], unico: true },
  rutinas: { nombre: 'Rutinas', icono: 'rayo', tams: [2], unico: true },
  rutina: { nombre: 'Una rutina', icono: 'estrella', tams: [1, 2], datos: 'rutina' },
  modos: { nombre: 'Modos', icono: 'modos', tams: [2], unico: true },
  modo: { nombre: 'Botón de un modo', icono: 'modos', tams: [1, 2], datos: 'modo' },
  musica: { nombre: 'Música en la PC', icono: 'musica', tams: [2], altos: [1, 2], unico: true },
  volumen: { nombre: 'Volumen de la PC', icono: 'parlante', tams: [2], unico: true },
  'clip-guardar': { nombre: 'Guardar clip', icono: 'clip', tams: [1, 2], unico: true },
  captura: { nombre: 'Captura de pantalla', icono: 'camara', tams: [1, 2], unico: true },
  frase: { nombre: 'Atajo de voz', icono: 'charla', tams: [1, 2], datos: 'frase' },
};
const INICIO_DE_SIEMPRE = [
  { tipo: 'reloj', tam: 1 }, { tipo: 'clima', tam: 1 }, { tipo: 'agenda', tam: 2 }, { tipo: 'rutinas', tam: 2 },
  { tipo: 'modos', tam: 2 }, { tipo: 'musica', tam: 2 }, { tipo: 'clip-guardar', tam: 1 }, { tipo: 'captura', tam: 1 }, { tipo: 'notas', tam: 2 },
];
const idW = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
function normalizarW(w) {
  const t = TIPOS_W[w && w.tipo];
  if (!t) return null;
  const tam = t.tams.includes(Number(w.tam)) ? Number(w.tam) : t.tams[t.tams.length - 1];
  const alto = (t.altos || [1]).includes(Number(w.alto)) ? Number(w.alto) : 1;
  return { ...w, id: w.id || idW(), tam, alto, color: COLORES_W.includes(w.color) ? w.color : '' };
}
let widgets = (guardado.leer('inicio', null) || INICIO_DE_SIEMPRE).map(normalizarW).filter(Boolean);
const guardarWidgets = () => guardado.escribir('inicio', widgets);
let datosInicio = guardado.leer('inicio.datos', { clima: null, agenda: [], notas: [] });
let pidiendoInicio = false; let ultimoInicio = 0;
async function cargarInicio(forzar) {
  if (pidiendoInicio || (!forzar && Date.now() - ultimoInicio < 60000)) return;
  pidiendoInicio = true;
  try { datosInicio = await api('/api/inicio', { espera: 15000 }); ultimoInicio = Date.now(); guardado.escribir('inicio.datos', datosInicio); pintarInicio(); } catch {} finally { pidiendoInicio = false; }
}
setInterval(() => { if (!document.hidden && hojaActual === 'inicio' && guardado.token) { pintarInicio(); cargarInicio(); } }, 30000);
// Le dice algo a Jarvis como si lo escribieras en la Charla.
function decirAJarvis(texto) { irA('charla'); mandarTexto(texto); }
const hhmm = (t) => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function enCuanto(ev) {
  const ahora = Date.now();
  if (ev.todoElDia) return 'Todo el día';
  if (ev.inicio <= ahora) return `Ahora · hasta las ${hhmm(ev.fin)}`;
  const min = Math.round((ev.inicio - ahora) / 60000);
  if (min < 60) return `En ${Math.max(1, min)} min · ${hhmm(ev.inicio)}`;
  const manana = new Date(ahora + 86400000).toDateString() === new Date(ev.inicio).toDateString();
  return `${new Date(ev.inicio).toDateString() === new Date(ahora).toDateString() ? 'Hoy' : manana ? 'Mañana' : new Date(ev.inicio).toLocaleDateString('es-AR', { weekday: 'long' })} · ${hhmm(ev.inicio)}`;
}
const cuandoNota = (t) => { const d = new Date(t); const hoy = d.toDateString() === new Date().toDateString(); return `${hoy ? 'Hoy' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${hhmm(t)}`; };
const ICONO_CIELO = (c, dia) => (c === 0 || c === 1 ? (dia ? 'sol' : 'luna') : c <= 3 ? 'nube' : c >= 51 && c <= 82 ? 'lluvia' : c >= 95 ? 'rayo' : 'nube');
let volumenLocal = guardado.leer('volumen', 50);

function contenidoW(w) {
  const e = estado || {};
  const boton = (ic, texto, fn, extra = {}) => h('button', { type: 'button', class: 'w-boton', onclick: (ev) => fn(ev.currentTarget), ...extra }, h('span', { class: 'w-ic', html: svg(ic, w.alto === 2 ? 30 : 22) }), h('span', {}, texto));
  switch (w.tipo) {
    case 'reloj': {
      const d = new Date();
      return h('div', { class: 'w-reloj' }, h('b', {}, hhmm(d)), h('span', {}, d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })));
    }
    case 'clima': {
      const c = datosInicio.clima;
      if (!c || c.sinCiudad) return h('div', { class: 'w-info tenue' }, c && c.sinCiudad ? 'Cargá tu ciudad en la PC (Ajustes → Asistente).' : 'Clima…');
      if (c.error) return h('div', { class: 'w-info tenue' }, 'El clima no respondió.');
      return h('button', { type: 'button', class: 'w-clima', onclick: () => decirAJarvis('¿Cómo está el clima?') },
        h('span', { class: 'w-ic', html: svg(ICONO_CIELO(c.codigo, c.dia), 30) }),
        h('span', {}, h('b', {}, `${c.temp}°`), h('small', {}, w.tam === 2 ? `${c.cielo} · ${c.ciudad}` : c.cielo),
          w.alto === 2 && c.max != null ? h('small', {}, `Máx ${c.max}° · Mín ${c.min}°${c.lluvia != null ? ` · Lluvia ${c.lluvia}%` : ''}`) : null));
    }
    case 'agenda': {
      const evs = (datosInicio.agenda || []).filter((x) => x.fin > Date.now()).slice(0, w.alto === 2 ? 3 : 1);
      if (!evs.length) return h('button', { type: 'button', class: 'w-lista', onclick: () => decirAJarvis('¿Qué tengo hoy?') }, h('span', { class: 'w-fila' }, h('span', { class: 'w-ic', html: svg('calendario', 18) }), h('span', {}, h('b', {}, 'Sin eventos'), h('small', {}, 'Nada próximo en tu calendario'))));
      return h('button', { type: 'button', class: 'w-lista', onclick: () => decirAJarvis('¿Qué tengo hoy?') }, ...evs.map((ev) => h('span', { class: 'w-fila' }, h('span', { class: 'w-ic', html: svg('calendario', 18) }), h('span', {}, h('b', {}, ev.titulo), h('small', {}, enCuanto(ev))))));
    }
    case 'notas': {
      const ns = (datosInicio.notas || []).slice(0, w.alto === 2 ? 5 : 2);
      if (!ns.length) return h('div', { class: 'w-info tenue' }, 'Sin notas. Probá: "recordame comprar pan a las 5".');
      return h('div', { class: 'w-lista' }, ...ns.map((n) => h('span', { class: 'w-fila' }, h('span', { class: 'w-ic', html: svg(n.cuando && !n.avisada ? 'reloj' : 'nota', 18) }), h('span', {}, h('b', {}, n.texto), n.cuando ? h('small', {}, cuandoNota(n.cuando)) : null))));
    }
    case 'nota': {
      const campo = h('input', { type: 'text', placeholder: 'Anotá algo…', maxlength: '500', 'aria-label': 'Nota rápida' });
      const mandar = async (b) => { const t = campo.value.trim(); if (!t) return; const r = await accion({ tipo: 'nota', texto: t }, b); if (r) { campo.value = ''; ultimoInicio = 0; cargarInicio(true); } };
      campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); mandar(null); } });
      return h('div', { class: 'w-nota' }, campo, h('button', { type: 'button', class: 'icono principal', 'aria-label': 'Guardar nota', html: svg('mas'), onclick: (ev) => mandar(ev.currentTarget) }));
    }
    case 'rutinas': {
      const rs = [...(e.rutinas || [])].sort((a, b) => (b.rapida - a.rapida)).slice(0, 8);
      if (!rs.length) return h('div', { class: 'w-info tenue' }, 'No tenés rutinas. Se arman en la PC, en Rutinas.');
      return h('div', { class: 'w-rutinas' }, ...rs.map((r) => h('button', { type: 'button', class: 'rutina', onclick: (ev) => accion({ tipo: 'rutina', id: r.id }, ev.currentTarget) }, h('span', { html: svg(r.icono || 'rayo', 20) }), h('span', {}, r.nombre))));
    }
    case 'rutina': {
      const r = (e.rutinas || []).find((x) => x.id === w.rutina);
      return boton(r ? (r.icono || 'estrella') : 'estrella', r ? r.nombre : 'Rutina borrada', (b) => r && accion({ tipo: 'rutina', id: r.id }, b));
    }
    case 'modos':
      return h('div', { class: 'fichas', role: 'radiogroup', 'aria-label': 'Modo de Jarvis' }, ...(e.modos || []).map((m) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(m.id === e.modo), class: m.id === e.modo ? 'on' : '', onclick: (ev) => accion({ tipo: 'modo', modo: m.id }, ev.currentTarget) }, m.nombre)));
    case 'modo': {
      const m = (e.modos || []).find((x) => x.id === w.modo);
      return boton('modos', m ? `Modo ${m.nombre.toLowerCase()}` : 'Modo borrado', (b) => m && accion({ tipo: 'modo', modo: m.id }, b), { 'aria-pressed': String(!!m && e.modo === m.id), class: `w-boton${m && e.modo === m.id ? ' activo' : ''}` });
    }
    case 'musica': {
      const mu = e.musica || {};
      const ctrl = (a, ic, etiqueta, grande) => h('button', { type: 'button', class: `icono${grande ? ' grande' : ''}`, 'aria-label': etiqueta, html: svg(ic, grande ? 28 : 22), onclick: (ev) => accion({ tipo: 'musica', accion: a }, ev.currentTarget) });
      return h('div', { class: 'w-musica' },
        h('p', { class: 'tenue' }, mu.cancion ? `${mu.sonando ? 'Sonando' : 'En pausa'}: ${mu.cancion}${mu.artista ? `, ${mu.artista}` : ''}${mu.destino ? ` (en ${mu.destino})` : ''}` : 'Nada sonando. Play arranca la música de siempre.'),
        h('div', { class: 'controles' }, ctrl('anterior', 'anterior', 'Anterior'), ctrl('alternar', mu.sonando ? 'pausa' : 'play', 'Pausa o play', true), ctrl('siguiente', 'siguiente', 'Siguiente')));
    }
    case 'volumen': {
      const barra = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(volumenLocal), 'aria-label': 'Volumen de la PC' });
      barra.addEventListener('change', () => { volumenLocal = Number(barra.value); guardado.escribir('volumen', volumenLocal); accion({ tipo: 'volumen', nivel: volumenLocal }); });
      return h('div', { class: 'w-volumen' }, h('span', { class: 'w-ic', html: svg('parlante', 22) }), barra, h('button', { type: 'button', class: 'icono', 'aria-label': 'Silenciar la PC', html: svg('mudo', 22), onclick: (ev) => accion({ tipo: 'volumen', mudo: true }, ev.currentTarget) }));
    }
    case 'clip-guardar': return boton('clip', 'Guardar clip', (b) => accion({ tipo: 'clip', accion: 'guardar' }, b));
    case 'captura': return boton('camara', 'Captura', (b) => accion({ tipo: 'clip', accion: 'captura' }, b));
    case 'frase': return boton('charla', w.nombre || w.texto || 'Atajo', () => decirAJarvis(w.texto || ''));
    default: return h('span');
  }
}

let editando = false;
function pintarInicio() {
  const caja = $('#widgets');
  if (!caja) return;
  const hora = new Date().getHours();
  $('#saludo').textContent = `${hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'}${estado && estado.usuario ? `, ${estado.usuario}` : ''}`;
  caja.classList.toggle('editando', editando);
  caja.replaceChildren(...widgets.map((w, i) => {
    const t = TIPOS_W[w.tipo];
    const el = h('div', { class: `widget wt-${w.tipo} tam-${w.tam} alto-${w.alto}`, style: w.color ? `--c:${w.color}` : '', 'data-id': w.id }, contenidoW(w));
    if (editando) {
      const mover = (d) => { const j = i + d; if (j < 0 || j >= widgets.length) return; [widgets[i], widgets[j]] = [widgets[j], widgets[i]]; guardarWidgets(); pintarInicio(); };
      const cambiar = (k, lista) => { const p = lista.indexOf(w[k]); w[k] = lista[(p + 1) % lista.length]; guardarWidgets(); pintarInicio(); };
      el.append(h('div', { class: 'w-editar' },
        h('span', { class: 'w-nombre' }, t.nombre),
        h('div', { class: 'w-botones' },
          h('button', { type: 'button', class: 'icono', 'aria-label': `Subir ${t.nombre}`, html: svg('arriba', 18), disabled: i === 0, onclick: () => mover(-1) }),
          h('button', { type: 'button', class: 'icono', 'aria-label': `Bajar ${t.nombre}`, html: svg('abajo', 18), disabled: i === widgets.length - 1, onclick: () => mover(1) }),
          t.tams.length > 1 ? h('button', { type: 'button', class: 'icono', 'aria-label': `Ancho de ${t.nombre}`, html: svg('ancho', 18), onclick: () => cambiar('tam', t.tams) }) : null,
          (t.altos || []).length > 1 ? h('button', { type: 'button', class: 'icono', 'aria-label': `Alto de ${t.nombre}`, html: svg('alto', 18), onclick: () => cambiar('alto', t.altos) }) : null,
          h('button', { type: 'button', class: 'icono', 'aria-label': `Color de ${t.nombre}`, html: svg('pintar', 18), onclick: () => cambiar('color', COLORES_W) }),
          h('button', { type: 'button', class: 'icono peligro', 'aria-label': `Quitar ${t.nombre}`, html: svg('cerrar', 18), onclick: () => { widgets.splice(i, 1); guardarWidgets(); pintarInicio(); } }))));
    }
    return el;
  }));
  if (!widgets.length && !editando) caja.append(h('p', { class: 'tenue' }, 'Inicio vacío. Tocá Editar para sumar widgets.'));
}
function terminarEdicion() { editando = false; $('#editando').hidden = true; $('#editar-inicio').textContent = 'Editar'; pintarInicio(); }
$('#editar-inicio').addEventListener('click', () => { if (editando) { terminarEdicion(); return; } editando = true; $('#editando').hidden = false; $('#editar-inicio').textContent = 'Listo'; pintarInicio(); });
$('#restaurar-inicio').addEventListener('click', () => { if (!confirm('¿Volver al inicio de siempre? Se pierden los cambios.')) return; widgets = INICIO_DE_SIEMPRE.map(normalizarW); guardarWidgets(); pintarInicio(); });
const hojaW = $('#hoja-widgets');
$('#hw-cerrar').addEventListener('click', () => hojaW.close());
function sumarWidget(w) { widgets.push(normalizarW(w)); guardarWidgets(); hojaW.close(); pintarInicio(); cargarInicio(true); setTimeout(() => { const ult = $('#widgets').lastElementChild; if (ult) ult.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50); }
function catalogo() {
  const e = estado || {};
  const opcion = (ic, nombre, fn) => h('button', { type: 'button', class: 'w-opcion', onclick: fn }, h('span', { class: 'w-ic', html: svg(ic, 20) }), h('span', {}, nombre));
  $('#hw-titulo').textContent = 'Agregar un widget';
  $('#catalogo').replaceChildren(...Object.entries(TIPOS_W).filter(([k, t]) => !(t.unico && widgets.some((w) => w.tipo === k))).map(([k, t]) => opcion(t.icono, t.nombre, () => {
    if (t.datos === 'rutina') {
      $('#hw-titulo').textContent = '¿Qué rutina?';
      $('#catalogo').replaceChildren(...((e.rutinas || []).length ? e.rutinas.map((r) => opcion(r.icono || 'estrella', r.nombre, () => sumarWidget({ tipo: 'rutina', tam: 1, rutina: r.id }))) : [h('p', { class: 'tenue' }, 'No tenés rutinas: se arman en la PC.')]));
      return;
    }
    if (t.datos === 'modo') {
      $('#hw-titulo').textContent = '¿Qué modo?';
      $('#catalogo').replaceChildren(...(e.modos || []).map((m) => opcion('modos', m.nombre, () => sumarWidget({ tipo: 'modo', tam: 1, modo: m.id }))));
      return;
    }
    if (t.datos === 'frase') {
      const texto = (prompt('¿Qué le decís a Jarvis con este botón? (por ejemplo: "poné música")') || '').trim();
      if (!texto) return;
      const nombre = (prompt('Nombre del botón', texto.slice(0, 24)) || texto).trim().slice(0, 30);
      sumarWidget({ tipo: 'frase', tam: 1, texto: texto.slice(0, 300), nombre });
      return;
    }
    sumarWidget({ tipo: k, tam: t.tams[t.tams.length - 1] });
  })));
  hojaW.showModal();
}
$('#sumar-widget').addEventListener('click', catalogo);

// ---------- Avisos del celular (app de Android) ----------
// La PC dice qué avisar en las próximas 48 h (recordatorios y eventos, si en Ajustes → Celular se eligió el celular);
// Android los programa como notificaciones, aunque la app esté cerrada. Cada 15 minutos Android vuelve a preguntar solo.
const avisosActivos = () => guardado.leer('avisos', true);
async function sincronizarAvisos() {
  if (!NATIVO || !guardado.token) return;
  const pc = pcElegida();
  try { await nativo.configurarPC({ base: pc ? pc.base : '', token: guardado.token, avisos: avisosActivos() }); } catch {}
  if (!avisosActivos()) { nativo.programarAvisos({ avisos: [] }).catch(() => {}); return; }
  try {
    const r = await api('/api/avisos', { espera: 10000 });
    await nativo.programarAvisos({ avisos: r.avisos || [] });
  } catch {}
}
function pintarMenuAvisos() { const b = $('#m-avisos'); b.hidden = !NATIVO; b.textContent = `Avisos en este celular: ${avisosActivos() ? 'sí' : 'no'}`; }
$('#m-avisos').addEventListener('click', async () => {
  guardado.escribir('avisos', !avisosActivos()); pintarMenuAvisos(); menu.hidden = true;
  if (avisosActivos()) await nativo.pedirPermisoAvisos().catch(() => {});
  sincronizarAvisos();
  aviso(avisosActivos() ? 'Listo: los recordatorios y eventos también te avisan en este celular.' : 'Listo: este celular no te va a avisar nada.', { tipo: 'bien' });
});

// ---------- Botón "atrás" de Android ----------
// Cierra lo que esté abierto; si no hay nada, vuelve a Inicio; en Inicio, sale de la app.
function atras() {
  const dialogo = document.querySelector('dialog[open]');
  if (dialogo) { dialogo.close(); return; }
  if (!menu.hidden) { menu.hidden = true; return; }
  if (editando) { terminarEdicion(); return; }
  if (!$('#app').hidden && hojaActual !== 'inicio') { irA('inicio'); return; }
  nativo.salir();
}

// ---------- Lo propio de la app de Android ----------
function recibirCompartido(texto) {
  const link = linkDe(texto || '');
  if (!link || !guardado.token) return;
  irA('descargar'); $('#d-url').value = link;
}
async function revisarVersion() {
  // Una vez por día: si en GitHub hay una versión más nueva de la app, se avisa (Android pide confirmar al instalarla).
  if (Date.now() - guardado.leer('revisado', 0) < 20 * 3600000) return;
  guardado.escribir('revisado', Date.now());
  try {
    const { version } = await nativo.info();
    const r = await fetch('https://api.github.com/repos/jsolaresc/jarvis/releases/latest', { cache: 'no-store' });
    const d = await r.json();
    const nueva = String(d.tag_name || '').replace(/^v/, '');
    const n = (v) => v.split('.').map((x) => parseInt(x, 10) || 0);
    const comparar = (x, y) => { for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
    const mayor = comparar(n(nueva), n(version || '0')) > 0;
    const apk = (d.assets || []).find((x) => /\.apk$/i.test(x.name));
    if (nueva && mayor && apk) aviso(`Hay una versión nueva de la app (${nueva}).`, { ms: 0, accion: { texto: 'Bajar', hacer: () => { aviso(''); nativo.abrir({ url: apk.browser_download_url }); } } });
  } catch {}
}
function prepararNativo() {
  document.documentElement.classList.add('nativo');
  nativo.addListener('compartido', (d) => recibirCompartido(d && d.texto));
  nativo.compartidoPendiente().then((d) => recibirCompartido(d && d.texto)).catch(() => {});
  $('#buscar-pcs').addEventListener('click', () => buscarParaVincular());
  nativo.addListener('atras', () => atras());
  pintarMenuAvisos();
  revisarVersion();
}

// ---------- Arranque ----------
let relojEstado = null;
function seguir() {
  clearInterval(relojEstado);
  if (document.hidden || !guardado.token) return; // en segundo plano no se pregunta nada (no gasta datos ni batería)
  relojEstado = setInterval(() => refrescar({ silencioso: true }), 8000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && guardado.token) { refrescar({ silencioso: true }); seguirDescargas(); } seguir(); });

(function iniciar() {
  const desdeQR = /#v=(\d{6})/.exec(location.hash);
  if (!NATIVO && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (NATIVO) prepararNativo();
  if (desdeQR && !guardado.token) {
    mostrarVincular();
    campoCodigo.value = `${desdeQR[1].slice(0, 3)} ${desdeQR[1].slice(3)}`;
    $('#nombre-cel').value = nombrePorDefecto();
    $('#nombre-cel').focus();
    return;
  }
  if (!guardado.token) { mostrarVincular(); $('#nombre-cel').value = nombrePorDefecto(); return; }
  mostrarApp();
  // Llegó desde "Compartir" de otra app (YouTube, Instagram…): a Descargar con el link puesto.
  const q = new URLSearchParams(location.search);
  const compartido = linkDe([q.get('url'), q.get('texto'), q.get('titulo')].filter(Boolean).join(' '));
  if (compartido) { irA('descargar'); $('#d-url').value = compartido; history.replaceState(null, '', '/'); }
  refrescar();
  seguir();
  seguirDescargas(); // por si quedó algo bajado para el celular mientras la app estaba cerrada
}());
