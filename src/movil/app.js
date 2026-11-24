// Jarvis en el celular. Todo lo que hace pasa por /api de la PC con el token de este celular.
const $ = (s) => document.querySelector(s);
const ICONOS = {
  charla: '<path d="M4 5h16v11H9l-5 4z"/>',
  rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
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

// ---------- Guardado local ----------
const guardado = {
  get token() { try { return localStorage.getItem('jarvis.token') || ''; } catch { return ''; } },
  set token(v) { try { if (v) localStorage.setItem('jarvis.token', v); else localStorage.removeItem('jarvis.token'); } catch {} },
  leer(k, def) { try { const v = localStorage.getItem(`jarvis.${k}`); return v == null ? def : JSON.parse(v); } catch { return def; } },
  escribir(k, v) { try { localStorage.setItem(`jarvis.${k}`, JSON.stringify(v)); } catch {} },
};

// ---------- Pedidos a la PC ----------
class SinPC extends Error {}
class NoVinculado extends Error {}
async function api(ruta, { metodo = 'GET', cuerpo, espera = 20000 } = {}) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), espera);
  let r;
  try {
    r = await fetch(ruta, {
      method: metodo, signal: ctrl.signal, cache: 'no-store',
      headers: { ...(guardado.token ? { Authorization: `Bearer ${guardado.token}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch { throw new SinPC('Tu PC no responde.'); } finally { clearTimeout(reloj); }
  let dato = {};
  try { dato = await r.json(); } catch {}
  if (r.status === 401 && ruta !== '/api/vincular') { guardado.token = ''; mostrarVincular('Este celular ya no está vinculado. Pedí un código nuevo en la PC.'); throw new NoVinculado(dato.error || 'No vinculado.'); }
  if (r.status === 502 || r.status === 503 || r.status === 504) throw new SinPC('Tu PC no responde.');
  if (!r.ok) throw new Error(dato.error || `Error ${r.status}`);
  return dato;
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
async function refrescar({ silencioso = false } = {}) {
  try {
    estado = await api('/api/estado', { espera: 8000 });
    if (!conectado) { conectado = true; aviso(''); }
    pintarEstado();
    if (pastilla.dataset.fase === 'dormido') fase('reposo');
  } catch (e) {
    if (e instanceof SinPC) {
      conectado = false;
      $('#estado-pc').textContent = 'Tu PC no responde';
      $('#arriba').classList.add('sin-pc');
      fase('dormido');
      if (!silencioso) aviso('Tu PC no responde. Puede estar apagada, o Tailscale apagado en la PC o en este celular.', { tipo: 'mal', ms: 0, accion: { texto: 'Reintentar', hacer: () => refrescar() } });
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
  if (!$('#clip-para').value && e.enviarA) $('#clip-para').value = e.enviarA;
  // Rutinas: las rápidas primero.
  const rutinas = [...(e.rutinas || [])].sort((a, b) => (b.rapida - a.rapida));
  $('#lista-rutinas').replaceChildren(...(rutinas.length ? rutinas.map((r) => h('button', { type: 'button', class: 'rutina', 'data-id': r.id, onclick: (ev) => accion({ tipo: 'rutina', id: r.id }, ev.currentTarget) }, h('span', { html: svg(r.icono) }), h('span', {}, r.nombre)))
    : [h('p', { class: 'tenue' }, 'No tenés rutinas. Se arman en la PC, en Ajustes → Rutinas.')]));
  $('#lista-modos').replaceChildren(...(e.modos || []).map((m) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(m.id === e.modo), class: m.id === e.modo ? 'on' : '', onclick: (ev) => accion({ tipo: 'modo', modo: m.id }, ev.currentTarget) }, m.nombre)));
  const mu = e.musica || {};
  $('#musica-ahora').textContent = mu.cancion ? `${mu.sonando ? 'Sonando' : 'En pausa'}: ${mu.cancion}${mu.artista ? `, ${mu.artista}` : ''}${mu.destino ? ` (en ${mu.destino})` : ''}` : 'No hay nada sonando. Play arranca la música de siempre.';
  $('[data-musica="alternar"]').innerHTML = svg(mu.sonando ? 'pausa' : 'play', 28);
  const c = e.clips || {};
  $('#clips-estado').textContent = c.grabando ? `Grabando${c.pausado ? ' (en pausa)' : ''}…` : !c.activo ? 'La repetición instantánea está apagada en la PC: "Guardar clip" no va a tener nada. Grabar y capturar sí andan.' : !c.permitido ? 'El modo actual no graba clips.' : c.corriendo ? `Repetición instantánea andando${c.segundos ? ` (${c.segundos} s guardados)` : ''}.` : c.error ? `Clips: ${c.error}` : 'Repetición instantánea en pausa.';
  const g = $('#boton-grabar');
  g.textContent = c.grabando ? 'Parar y guardar' : 'Empezar a grabar';
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

// ---------- Clips ----------
const tam = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const cuando = (t) => { const d = new Date(t); const hoy = new Date(); const misma = d.toDateString() === hoy.toDateString(); return misma ? `hoy ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); };
async function cargarClips() {
  const ul = $('#lista-clips');
  try {
    const { clips } = await api('/api/clips');
    ul.replaceChildren(...(clips.length ? clips.map((c) => h('li', {},
      h('button', { type: 'button', class: 'mini', 'aria-label': `Ver ${c.nombre}`, onclick: () => ver(c) }, h('img', { src: c.miniatura, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() })),
      h('div', { class: 'datos' }, h('b', {}, c.nombre.replace(/\.(mp4|mkv|webm|mov)$/i, '')), h('span', {}, [c.juego, cuando(c.fecha), tam(c.bytes)].filter(Boolean).join(', '))),
      h('button', { type: 'button', class: 'texto', onclick: (ev) => mandarClip(c, ev.currentTarget) }, 'Mandar'))) : [h('li', { class: 'tenue' }, 'Todavía no hay clips guardados.')]));
  } catch (e) { ul.replaceChildren(h('li', { class: 'tenue' }, e instanceof SinPC ? 'Tu PC no responde.' : e.message)); }
}
function ver(c) {
  const v = $('#video');
  v.src = c.ver;
  $('#visor-nombre').textContent = c.nombre;
  $('#visor').showModal();
  v.play().catch(() => {});
}
$('#cerrar-visor').addEventListener('click', () => $('#visor').close());
$('#visor').addEventListener('close', () => { const v = $('#video'); v.pause(); v.removeAttribute('src'); v.load(); });
async function mandarClip(c, boton) {
  const para = $('#clip-para').value.trim();
  if (!para) { aviso('Escribí a quién mandárselo en "Mandar a".', { tipo: 'mal' }); $('#clip-para').focus(); return; }
  boton.disabled = true; fase('pensando');
  try { const r = await api('/api/clips/enviar', { metodo: 'POST', cuerpo: { id: c.id, contacto: para }, espera: 180000 }); fase('ok', 1400); aviso(r.texto || `Listo, se lo mandé a ${para}.`, { tipo: 'bien' }); }
  catch (e) { if (e instanceof NoVinculado) return; fase('error', 1800); aviso(e.message, { tipo: 'mal', ms: 6000 }); }
  finally { boton.disabled = false; }
}
document.querySelectorAll('[data-clip]').forEach((b) => b.addEventListener('click', async () => {
  const acc = b.dataset.clip;
  const para = $('#clip-para').value.trim();
  if (acc === 'enviar' && !para) { aviso('Escribí a quién mandárselo.', { tipo: 'mal' }); $('#clip-para').focus(); return; }
  const r = await accion({ tipo: 'clip', accion: acc, ...(acc === 'enviar' ? { contacto: para } : {}) }, b);
  if (r && (acc === 'guardar' || acc === 'parar' || acc === 'enviar')) cargarClips();
}));
$('#actualizar-clips').addEventListener('click', cargarClips);

// ---------- Música ----------
document.querySelectorAll('[data-musica]').forEach((b) => { b.innerHTML = svg(b.dataset.musica === 'alternar' ? 'play' : b.dataset.musica, b.classList.contains('grande') ? 28 : 22); b.addEventListener('click', () => accion({ tipo: 'musica', accion: b.dataset.musica }, b)); });

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
  accion({ tipo: 'foto', contacto: para }, e.currentTarget);
});

// ---------- Navegación ----------
const HOJAS = ['charla', 'rutinas', 'clips', 'mensaje'];
function irA(hoja) {
  if (!HOJAS.includes(hoja)) hoja = 'charla';
  for (const x of HOJAS) $(`#s-${x}`).hidden = x !== hoja;
  document.querySelectorAll('#abajo button').forEach((b) => { if (b.dataset.hoja === hoja) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  guardado.escribir('hoja', hoja);
  if (hoja === 'clips') cargarClips();
  if (hoja === 'charla') $('#mensajes').scrollTop = 1e9;
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
}
function mostrarApp() {
  $('#vincular').hidden = true;
  $('#app').hidden = false; $('#abajo').hidden = false; $('#boton-menu').hidden = false;
  pintarCharla();
  irA(guardado.leer('hoja', 'charla'));
}
const campoCodigo = $('#codigo');
campoCodigo.addEventListener('input', () => { const d = campoCodigo.value.replace(/\D/g, '').slice(0, 6); campoCodigo.value = d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d; });
$('#form-vincular').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = campoCodigo.value.replace(/\D/g, '');
  if (codigo.length !== 6) { $('#error-vincular').textContent = 'El código tiene 6 cifras.'; return; }
  const b = e.submitter || $('#form-vincular button'); b.disabled = true; fase('pensando');
  try {
    const r = await api('/api/vincular', { metodo: 'POST', cuerpo: { codigo, nombre: $('#nombre-cel').value.trim() || nombrePorDefecto() } });
    guardado.token = r.token;
    history.replaceState(null, '', '/');
    fase('ok', 1400);
    mostrarApp();
    aviso(`Listo, "${r.nombre}" quedó vinculado.`, { tipo: 'bien' });
    refrescar();
    seguir();
  } catch (x) {
    fase('error', 1800);
    $('#error-vincular').textContent = x instanceof SinPC ? 'No llego a tu PC. Revisá que Jarvis esté abierto y Tailscale prendido en los dos aparatos.' : x.message;
  } finally { b.disabled = false; }
});
function nombrePorDefecto() {
  const m = /Android[^;]*;\s*([^;)]+?)(?:\s+Build|\))/.exec(navigator.userAgent);
  return m && !/^K$/.test(m[1].trim()) ? m[1].trim().slice(0, 40) : 'Mi celular';
}

// ---------- Arranque ----------
let relojEstado = null;
function seguir() {
  clearInterval(relojEstado);
  if (document.hidden || !guardado.token) return; // en segundo plano no se pregunta nada (no gasta datos ni batería)
  relojEstado = setInterval(() => refrescar({ silencioso: true }), 8000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && guardado.token) refrescar({ silencioso: true }); seguir(); });

(function iniciar() {
  const desdeQR = /#v=(\d{6})/.exec(location.hash);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (desdeQR && !guardado.token) {
    mostrarVincular();
    campoCodigo.value = `${desdeQR[1].slice(0, 3)} ${desdeQR[1].slice(3)}`;
    $('#nombre-cel').value = nombrePorDefecto();
    $('#nombre-cel').focus();
    return;
  }
  if (!guardado.token) { mostrarVincular(); $('#nombre-cel').value = nombrePorDefecto(); return; }
  mostrarApp();
  refrescar();
  seguir();
}());
