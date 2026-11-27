// Jarvis en el celular. Todo lo que hace pasa por /api de la PC con el token de este celular.
const $ = (s) => document.querySelector(s);
const ICONOS = {
  cafe: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5"/>',
  cama: '<path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10.5" r="1.8"/>',
  auto: '<path d="M5 16V12l1.6-4.2A2 2 0 0 1 8.5 6.5h7a2 2 0 0 1 1.9 1.3L19 12v4"/><path d="M4 12h16v4H4z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  pesa: '<path d="M6 8v8M18 8v8M3.5 10v4M20.5 10v4M6 12h12"/>',
  pelota: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.5 2.5-1.3 4h-4.4l-1.3-4zM12 3.5v4M15.5 10l4-1.5M14.2 14l2.3 3.8M9.8 14l-2.3 3.8M8.5 10l-4-1.5"/>',
  libro: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  comida: '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1.5-3 4-3 7h3"/>',
  avion: '<path d="M10.5 13.5L4 11l1.5-1.5 6.5.5 4-4.5a1.8 1.8 0 0 1 2.5 2.5l-4.5 4 .5 6.5L13 20l-2.5-6.5z"/>',
  campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  corazon: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  codigo: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  pincel: '<path d="M14.5 4.5l5 5L11 18l-5-5z"/><path d="M6 13c-2 0-3 1.5-3 3.5V20h3.5c2 0 3.5-1 3.5-3"/>',
  pata: '<circle cx="7" cy="9" r="1.8"/><circle cx="17" cy="9" r="1.8"/><circle cx="10" cy="5.5" r="1.6"/><circle cx="14" cy="5.5" r="1.6"/><path d="M8.5 16.5c0-2.5 1.6-4.5 3.5-4.5s3.5 2 3.5 4.5c0 1.6-1.5 2.5-3.5 2.5s-3.5-.9-3.5-2.5z"/>',
  personas: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.5M17.5 14a5 5 0 0 1 3 5"/>',
  cohete: '<path d="M12 3c3 2.5 4.5 6 4 10l-2 3h-4l-2-3c-.5-4 1-7.5 4-10z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M8 13l-2.5 2.5V19l3-1.5M16 13l2.5 2.5V19l-3-1.5M11 19.5h2"/>',
  fuego: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.6-8.4 1 1.4 1.6 2.6 1.6 4 1.6-1 2.4-3 2.4-5.5C17 7.5 18 10.5 18 15.4 18 18.6 15.6 21 12 21z"/>',
  alarma: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M4 5.5L6.5 3M20 5.5L17.5 3"/>',
  regalo: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9S10.5 4.5 8 4.8 7.2 9 12 9zM12 9s1.5-4.5 4-4.2.8 4.2-4 4.2z"/>',
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
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  expandir: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  agarrar: '<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>',
  esquina: '<path d="M20 10v10H10M20 20L13 13"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  arriba: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  abajo: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  ancho: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  alto: '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
  pintar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  cast: '<path d="M3 17a4 4 0 0 1 4 4M3 13a8 8 0 0 1 8 8M3 9a12 12 0 0 1 12 12"/><path d="M7 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3"/>',
  pc: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  tilde: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
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
const SIN_PC = NATIVO ? 'Tu PC no responde. Revisá que esté prendida, con Jarvis abierto, y que el celular esté en la misma Wi-Fi (o, para usarlo desde afuera, que en la PC esté prendido "Usar Jarvis desde afuera").'
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
// Desde afuera: la PC tiene una dirección pública https (Tailscale Funnel, en la PC). El celular entra con sus datos, sin VPN.
let modoAfuera = false; let baseAfuera = '';
const baseActual = () => { const pc = pcElegida(); return !pc ? '' : modoAfuera && baseAfuera ? baseAfuera : pc.base; };
const u = (ruta) => { const b = baseActual(); return b && typeof ruta === 'string' && ruta.startsWith('/api/') ? b + ruta : ruta; };
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
    if (NATIVO && !base && !reintento && pcElegida() && await elegirCamino()) return api(ruta, { metodo, cuerpo, espera, reintento: true });
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
// ¿La PC contesta en esta dirección?
async function responde(base, ms = 1500) {
  const ctrl = new AbortController(); const reloj = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(`${base}/api/hola`, { signal: ctrl.signal, cache: 'no-store' }); const d = await r.json(); return !!(d && d.jarvis); } catch { return false; } finally { clearTimeout(reloj); }
}
// Cuando la PC no contesta: ¿fue un corte? ¿estoy afuera (Tailscale)? ¿volví a casa? ¿le cambió la IP?
let eligiendo = null;
function elegirCamino() {
  if (eligiendo) return eligiendo;
  eligiendo = (async () => {
    const pc = pcElegida();
    if (!pc) return false;
    if (!modoAfuera && await responde(pc.base)) return true;
    if (modoAfuera && await responde(pc.base)) { modoAfuera = false; ultimaSincro = 0; sincronizarAvisos(); return true; } // volví a casa
    if (pc.publica && await responde(pc.publica, 8000)) { baseAfuera = pc.publica; if (!modoAfuera) { modoAfuera = true; ultimaSincro = 0; sincronizarAvisos(); } return true; }
    return reencontrar();
  })().finally(() => { eligiendo = null; });
  return eligiendo;
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
    if (NATIVO) { const pc = pcElegida(); const pub = (estado.afuera && estado.afuera.publica) || ''; if (pc && (pc.publica || '') !== pub) guardado.escribir('pc', { ...pc, publica: pub }); }
    $('#estado-pc').textContent += modoAfuera ? ' · desde afuera' : '';
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
    const r = await fetch(NATIVO ? medio(url) : u(url), { headers: NATIVO ? {} : { Authorization: `Bearer ${guardado.token}` }, cache: 'no-store' });
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
// En la app de Android, un video de la PC se trae entero antes de reproducirlo: el reproductor del WebView no sabe
// pedirlo de a pedazos a través de la app (se trababa). Con el progreso a la vista.
async function traerParaVer(a, reproductor, boton) {
  boton.disabled = true;
  try {
    const r = await fetch(medio(a.ver), { cache: 'no-store' });
    if (!r.ok) throw new Error('No pude traerlo de la PC.');
    const total = Number(r.headers.get('Content-Length')) || a.bytes || 0;
    const lector = r.body.getReader(); const partes = []; let n = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      partes.push(value); n += value.length;
      boton.textContent = total ? `Trayendo… ${Math.min(99, Math.round((n / total) * 100))} %` : 'Trayendo…';
    }
    const url = URL.createObjectURL(new Blob(partes, { type: a.tipo === 'audio' ? 'audio/mpeg' : 'video/mp4' }));
    if (!abierto || abierto.a !== a) { URL.revokeObjectURL(url); return; }
    abierto.url = url;
    reproductor.src = url;
    boton.remove();
    reproductor.play().catch(() => {});
    if (abierto.alCargar) abierto.alCargar();
  } catch (e) { boton.disabled = false; boton.textContent = 'Reproducir'; aviso(e.message, { tipo: 'mal' }); }
}
async function abrirArchivo(a) {
  const enCel = donde === 'celular';
  let src = medio(a.ver);
  if (enCel) { try { src = URL.createObjectURL(await local.blob(a.id)); } catch (e) { aviso(e.message, { tipo: 'mal' }); return; } }
  const traer = NATIVO && !enCel; // en la app de Android, lo de la PC se trae al tocar Reproducir
  abierto = { a, enCel, url: enCel ? src : '' };
  const reproductor = a.tipo === 'audio' ? h('audio', { controls: '', ...(traer ? {} : { src }), preload: 'metadata' }) : h('video', { controls: '', playsinline: '', ...(traer ? { poster: a.miniatura ? medio(a.miniatura) : '' } : { src }), preload: 'metadata' });
  $('#ha-medio').replaceChildren(reproductor);
  if (traer) {
    const boton = h('button', { type: 'button', class: 'ha-play principal', onclick: () => traerParaVer(a, reproductor, boton) }, 'Reproducir');
    $('#ha-medio').append(boton);
  }
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
    if (a.tipo === 'clip') acciones.push(['Recortar (en la PC)', () => abrirRecorte()]);
  }
  $('#ha-acciones').replaceChildren(...acciones.map(([t, fn, clase]) => h('button', { type: 'button', class: clase || '', onclick: (ev) => fn(ev.currentTarget) }, t)));
  hoja.showModal();
}
// Recortar un clip de la PC: se elige desde y hasta mirando el video, y lo recorta la PC (queda como un clip nuevo).
function abrirRecorte() {
  const a = abierto && abierto.a; const v = $('#ha-medio video');
  if (!a || !v) return;
  if (!v.src) { // primero hay que tenerlo para verlo
    abierto.alCargar = () => { abierto.alCargar = null; abrirRecorte(); };
    const b = $('#ha-medio .ha-play'); if (b) b.click();
    return;
  }
  if (!isFinite(v.duration) || !v.duration) { v.addEventListener('loadedmetadata', abrirRecorte, { once: true }); return; }
  const dur = v.duration;
  const r = { desde: 0, hasta: dur };
  const etiqueta = h('p', { class: 'tenue rc-texto' });
  const pintarTexto = () => { etiqueta.textContent = `Desde ${tiempo(r.desde)} hasta ${tiempo(r.hasta)} (${(r.hasta - r.desde).toFixed(1).replace('.', ',')} s)`; };
  const barra = (k, nombre) => {
    const i = h('input', { type: 'range', min: '0', max: String(dur), step: '0.1', value: String(r[k]), 'aria-label': nombre });
    i.addEventListener('input', () => {
      r[k] = Number(i.value);
      if (r.desde > r.hasta - 0.5) { if (k === 'desde') r.desde = Math.max(0, r.hasta - 0.5); else r.hasta = Math.min(dur, r.desde + 0.5); i.value = String(r[k]); }
      v.currentTime = r[k]; pintarTexto();
    });
    return h('label', { class: 'rc-barra' }, h('span', {}, nombre), i);
  };
  const probar = () => { v.currentTime = r.desde; v.play().catch(() => {}); const corte = () => { if (v.currentTime >= r.hasta) { v.pause(); v.removeEventListener('timeupdate', corte); } }; v.addEventListener('timeupdate', corte); };
  const guardar = async (b) => {
    await trabajando(b, async () => {
      const res = await api('/api/archivos/recortar', { metodo: 'POST', cuerpo: { id: a.id, desde: r.desde, hasta: r.hasta }, espera: 300000 });
      aviso(res.texto || 'Listo: el recorte quedó en la PC.', { tipo: 'bien', ms: 6000 });
      cerrarHoja(); cargarArchivos();
    });
  };
  pintarTexto();
  $('#ha-acciones').replaceChildren(h('div', { class: 'recorte' }, barra('desde', 'Desde'), barra('hasta', 'Hasta'), etiqueta,
    h('div', { class: 'fila' }, h('button', { type: 'button', onclick: probar }, 'Ver el recorte'), h('button', { type: 'button', class: 'principal', onclick: (ev) => guardar(ev.currentTarget) }, 'Guardar recorte en la PC'))));
}
const tiempo = (s) => { const m = Math.floor(s / 60); const x = s - m * 60; return `${m}:${x < 10 ? '0' : ''}${x.toFixed(1).replace('.', ',')}`; };
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
  if (modoAfuera) return Promise.reject(new Error('Para pasar archivos del celular a la PC, conectate a la Wi-Fi de casa.'));
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
      const r = await fetch(medio(a.ver)); if (!r.ok) throw new Error('No pude traerlo de la PC.');
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
const HOJAS = ['inicio', 'charla', 'archivos', 'mensaje', 'mas', 'descargar', 'notas', 'calendario', 'rutinas', 'historial'];
let hojaActual = 'inicio';
function irA(hoja) {
  if (!HOJAS.includes(hoja)) hoja = 'inicio';
  if (hoja !== 'inicio' && editando) terminarEdicion();
  for (const x of HOJAS) $(`#s-${x}`).hidden = x !== hoja;
  const enNav = SUBHOJAS.includes(hoja) ? 'mas' : hoja; // Notas, Calendario… viven adentro de "Más"
  document.querySelectorAll('#abajo button').forEach((b) => { if (b.dataset.hoja === enNav) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  guardado.escribir('hoja', hoja);
  hojaActual = hoja;
  if (hoja === 'archivos') cargarArchivos();
  if (hoja === 'descargar') seguirDescargas();
  if (hoja === 'charla') $('#mensajes').scrollTop = 1e9;
  if (hoja === 'inicio') { pintarInicio(); cargarInicio(); }
  if (hoja === 'notas') { pintarNotas(); cargarNotas(); }
  if (hoja === 'calendario') cargarCalendario();
  if (hoja === 'rutinas') { pintarRutinas(); cargarRutinas(); opciones(); }
  if (hoja === 'historial') { pintarHistorial(); cargarHistorial(); }
  $(`#s-${hoja}`).scrollTop = 0;
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
// tams: anchos posibles (1 = media fila, 2 = fila entera); altos: 1 o 2 filas. grupo y detalle: para el catálogo.
const TIPOS_W = {
  hablar: { nombre: 'Hablale a Jarvis', detalle: 'Escribí o hablá, y la respuesta aparece ahí', grupo: 'Jarvis', icono: 'mic', tams: [2], altos: [1, 2], unico: true, opciones: ['voz'] },
  reloj: { nombre: 'Reloj', detalle: 'La hora y el día', grupo: 'Información', icono: 'reloj', tams: [1, 2], altos: [1, 2], unico: true },
  clima: { nombre: 'Clima', detalle: 'El de tu ciudad (la de la PC)', grupo: 'Información', icono: 'sol', tams: [1, 2], altos: [1, 2], unico: true },
  agenda: { nombre: 'Próximos eventos', detalle: 'Tu calendario', grupo: 'Información', icono: 'calendario', tams: [1, 2], altos: [1, 2], unico: true },
  notas: { nombre: 'Recordatorios y notas', detalle: 'Lo que le pediste anotar', grupo: 'Información', icono: 'nota', tams: [1, 2], altos: [1, 2], unico: true },
  nota: { nombre: 'Nota rápida', detalle: 'Anotar algo de un toque', grupo: 'Jarvis', icono: 'nota', tams: [2], altos: [1], unico: true },
  camara: { nombre: 'Cámara de seguridad', detalle: 'Ver la webcam y escuchar el micrófono de la PC', grupo: 'PC', icono: 'camara', tams: [1, 2], altos: [1, 2], unico: true },
  rutinas: { nombre: 'Rutinas', detalle: 'Todas, de a un toque', grupo: 'Jarvis', icono: 'rayo', tams: [2], altos: [1, 2], unico: true },
  rutina: { nombre: 'Una rutina', detalle: 'Un botón para una rutina', grupo: 'Jarvis', icono: 'estrella', tams: [1, 2], altos: [1, 2], datos: 'rutina' },
  modos: { nombre: 'Modos', detalle: 'Cambiar el modo de Jarvis', grupo: 'Jarvis', icono: 'modos', tams: [2], altos: [1], unico: true },
  modo: { nombre: 'Botón de un modo', detalle: 'Un modo de un toque', grupo: 'Jarvis', icono: 'modos', tams: [1, 2], altos: [1, 2], datos: 'modo' },
  musica: { nombre: 'Música en la PC', detalle: 'Qué suena, pausa y a qué aparato', grupo: 'PC', icono: 'musica', tams: [2], altos: [1, 2], unico: true },
  volumen: { nombre: 'Volumen de la PC', detalle: 'Subir, bajar o silenciar', grupo: 'PC', icono: 'parlante', tams: [2], altos: [1], unico: true },
  'clip-guardar': { nombre: 'Guardar clip', detalle: 'Los últimos segundos de la pantalla', grupo: 'PC', icono: 'clip', tams: [1, 2], altos: [1, 2], unico: true },
  captura: { nombre: 'Captura de pantalla', detalle: 'Una foto de la pantalla de la PC', grupo: 'PC', icono: 'camara', tams: [1, 2], altos: [1, 2], unico: true },
  frase: { nombre: 'Atajo de voz', detalle: 'Un botón que le dice algo a Jarvis', grupo: 'Jarvis', icono: 'charla', tams: [1, 2], altos: [1, 2], datos: 'frase' },
};
const NOMBRE_TAM = (t, a) => (t === 2 ? (a === 2 ? 'Grande' : 'Ancho') : (a === 2 ? 'Alto' : 'Chico'));
const INICIO_DE_SIEMPRE = [
  { tipo: 'hablar', tam: 2 }, { tipo: 'reloj', tam: 1 }, { tipo: 'clima', tam: 1 }, { tipo: 'agenda', tam: 2 }, { tipo: 'rutinas', tam: 2 },
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
      if (!evs.length) return h('button', { type: 'button', class: 'w-lista', onclick: () => irA('calendario') }, h('span', { class: 'w-fila' }, h('span', { class: 'w-ic', html: svg('calendario', 18) }), h('span', {}, h('b', {}, 'Sin eventos'), h('small', {}, 'Nada próximo en tu calendario'))));
      return h('button', { type: 'button', class: 'w-lista', onclick: () => irA('calendario') }, ...evs.map((ev) => h('span', { class: 'w-fila' }, h('span', { class: 'w-ic', html: svg('calendario', 18) }), h('span', {}, h('b', {}, ev.titulo), h('small', {}, enCuanto(ev))))));
    }
    case 'notas': {
      const ns = (datosInicio.notas || []).slice(0, w.alto === 2 ? 5 : 2);
      if (!ns.length) return h('button', { type: 'button', class: 'w-info tenue', onclick: () => irA('notas') }, 'Sin notas. Probá: "recordame comprar pan a las 5".');
      return h('button', { type: 'button', class: 'w-lista', onclick: () => irA('notas') }, ...ns.map((n) => h('span', { class: 'w-fila' }, h('span', { class: 'w-ic', html: svg(n.cuando && !n.avisada ? 'reloj' : 'nota', 18) }), h('span', {}, h('b', {}, n.texto), n.cuando ? h('small', {}, cuandoNota(n.cuando)) : null))));
    }
    case 'nota': {
      const campo = h('input', { type: 'text', placeholder: 'Anotá algo…', maxlength: '500', 'aria-label': 'Nota rápida' });
      const mandar = async (b) => { const t = campo.value.trim(); if (!t) return; const r = await accion({ tipo: 'nota', texto: t }, b); if (r) { campo.value = ''; ultimoInicio = 0; cargarInicio(true); } };
      campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); mandar(null); } });
      return h('div', { class: 'w-nota' }, campo, h('button', { type: 'button', class: 'icono principal', 'aria-label': 'Guardar nota', html: svg('mas'), onclick: (ev) => mandar(ev.currentTarget) }));
    }
    case 'rutinas': {
      const rs = [...(e.rutinas || [])].sort((a, b) => (b.rapida - a.rapida)).slice(0, 8);
      if (!rs.length) return h('div', { class: 'w-info tenue' }, 'No tenés rutinas. Armalas en Más → Rutinas.');
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
      const ctrl = (acc, ic, etiqueta, clase = '') => h('button', { type: 'button', class: `icono ${clase}`, 'aria-label': etiqueta, html: svg(ic, clase ? 24 : 20), onclick: (ev) => accion({ tipo: 'musica', accion: acc }, ev.currentTarget) });
      const disco = h('span', { class: 'm-disco', html: svg('musica', 22) });
      if (mu.tapa) disco.append(h('img', { src: mu.tapa, alt: '', onerror: (ev) => ev.target.remove() }));
      return h('div', { class: 'w-musica' },
        h('div', { class: 'm-fila' }, disco,
          h('span', { class: `m-titulo${mu.cancion ? '' : ' vacio'}` }, h('b', {}, mu.cancion || 'Nada sonando'), h('small', {}, mu.cancion ? [mu.artista, mu.destino ? `en ${mu.destino}` : ''].filter(Boolean).join(' · ') : 'Play arranca la música de siempre'))),
        h('div', { class: 'm-botones' },
          ctrl('anterior', 'anterior', 'Anterior'), ctrl('alternar', mu.sonando ? 'pausa' : 'play', 'Pausa o play', 'grande'), ctrl('siguiente', 'siguiente', 'Siguiente'),
          h('button', { type: 'button', class: `icono${mu.destino ? ' activo' : ''}`, 'aria-label': 'Escuchar en otro aparato', html: svg('cast', 20), onclick: () => elegirAparato() })));
    }
    case 'volumen': {
      const barra = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(volumenLocal), 'aria-label': 'Volumen de la PC' });
      barra.addEventListener('change', () => { volumenLocal = Number(barra.value); guardado.escribir('volumen', volumenLocal); accion({ tipo: 'volumen', nivel: volumenLocal }); });
      return h('div', { class: 'w-volumen' }, h('span', { class: 'w-ic', html: svg('parlante', 22) }), barra, h('button', { type: 'button', class: 'icono', 'aria-label': 'Silenciar la PC', html: svg('mudo', 22), onclick: (ev) => accion({ tipo: 'volumen', mudo: true }, ev.currentTarget) }));
    }
    case 'clip-guardar': return boton('clip', 'Guardar clip', (b) => accion({ tipo: 'clip', accion: 'guardar' }, b));
    case 'captura': return boton('camara', 'Captura', (b) => accion({ tipo: 'clip', accion: 'captura' }, b));
    case 'frase': return boton('charla', w.nombre || w.texto || 'Atajo', () => decirAJarvis(w.texto || ''));
    case 'hablar': return contenidoHablar(w);
    case 'camara': return contenidoCamara(w);
    default: return h('span');
  }
}

// ---------- Voz: hablarle a Jarvis desde el celular ----------
// En la app de Android, el reconocimiento de voz de Android (plugin JarvisVoz); en el navegador, el de Chrome si existe.
const VOZ = NATIVO ? (CAP.registerPlugin ? CAP.registerPlugin('JarvisVoz') : (CAP.Plugins || {}).JarvisVoz) : null;
const ReconocerWeb = window.SpeechRecognition || window.webkitSpeechRecognition;
const puedeEscuchar = () => !!(VOZ || ReconocerWeb);
let escuchandoAhora = null; // { cortar }
async function escucharVoz({ alParcial = () => {}, alEstado = () => {} } = {}) {
  if (escuchandoAhora) { escuchandoAhora.cortar(); return ''; }
  if (VOZ) {
    const oyentes = await Promise.all([VOZ.addListener('vozParcial', (d) => alParcial(d.texto || '')), VOZ.addListener('vozEstado', (d) => alEstado(d.estado))]).catch(() => []);
    escuchandoAhora = { cortar: () => VOZ.dejarDeEscuchar().catch(() => {}) };
    alEstado('escuchando');
    try { const r = await VOZ.escuchar({ idioma: 'es-AR' }); return (r && r.texto) || ''; }
    catch (e) { if (/not implemented|UNIMPLEMENTED/i.test(e.message || '')) throw new Error('Para hablarle, actualizá la app (menú → Buscar actualizaciones).'); throw e; }
    finally { escuchandoAhora = null; oyentes.forEach((o) => o && o.remove && o.remove()); alEstado('fin'); }
  }
  if (!ReconocerWeb) throw new Error('Este navegador no reconoce la voz.');
  return new Promise((ok, mal) => {
    const r = new ReconocerWeb();
    r.lang = 'es-AR'; r.interimResults = true; r.maxAlternatives = 1;
    let final = '';
    r.onresult = (ev) => { let t = ''; for (const x of ev.results) t += x[0].transcript; alParcial(t); if (ev.results[ev.results.length - 1].isFinal) final = t; };
    r.onerror = (ev) => { escuchandoAhora = null; alEstado('fin'); mal(new Error(ev.error === 'no-speech' ? 'No te escuché.' : ev.error === 'not-allowed' ? 'Sin permiso para usar el micrófono.' : `No pude escuchar (${ev.error}).`)); };
    r.onend = () => { escuchandoAhora = null; alEstado('fin'); ok(final); };
    escuchandoAhora = { cortar: () => r.stop() };
    alEstado('escuchando');
    r.start();
  });
}
function leerEnVozAlta(texto) {
  const t = String(texto || '').slice(0, 600);
  if (!t) return;
  if (VOZ) { VOZ.hablar({ texto: t }).catch(() => {}); return; }
  try { const u = new SpeechSynthesisUtterance(t); u.lang = 'es-AR'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
}
// Botón de micrófono reutilizable (widget y Charla): escucha, muestra lo que entiende en el campo y lo manda.
function botonMic(campo, alTerminar) {
  const b = h('button', { type: 'button', class: 'icono mic', 'aria-label': 'Hablarle a Jarvis', html: svg('mic', 22) });
  b.hidden = !puedeEscuchar();
  b.addEventListener('click', async () => {
    if (escuchandoAhora) { escuchandoAhora.cortar(); return; }
    const antes = campo.value;
    try {
      const texto = await escucharVoz({
        alParcial: (t) => { campo.value = t; campo.dispatchEvent(new Event('input')); },
        alEstado: (e) => { b.classList.toggle('escuchando', e === 'escuchando' || e === 'hablando'); b.setAttribute('aria-label', e === 'escuchando' || e === 'hablando' ? 'Escuchando… tocá para terminar' : 'Hablarle a Jarvis'); },
      });
      if (texto.trim()) { campo.value = ''; campo.dispatchEvent(new Event('input')); alTerminar(texto.trim()); } else campo.value = antes;
    } catch (e) { campo.value = antes; aviso(e.message, { tipo: 'mal', ms: 5000 }); }
  });
  return b;
}
// También en la Charla.
{
  const f = $('#form-texto');
  f.insertBefore(botonMic(campoTexto, (t) => mandarTexto(t)), $('#enviar'));
}

// ---------- Cámara de seguridad ----------
// La PC manda WebM en vivo (VP8 + Opus); acá se arma con Media Source y se mantiene pegado al "en vivo".
const hojaCam = $('#hoja-camara');
let camara = null; // { ctrl, ms, url, desde, reloj }
const camOpciones = guardado.leer('camara.opciones', { video: true, audio: true, calidad: 'normal' });
function pintarCamaraControles() {
  $('#cam-sonido').innerHTML = svg(camOpciones.audio ? 'parlante' : 'mudo', 22);
  $('#cam-sonido').setAttribute('aria-pressed', String(camOpciones.audio));
  $('#cam-sonido').setAttribute('aria-label', camOpciones.audio ? 'Escuchando el micrófono. Tocá para cortar el sonido' : 'Sin sonido. Tocá para escuchar el micrófono');
  $('#cam-video').innerHTML = svg(camOpciones.video ? 'ojo' : 'auriculares', 22);
  $('#cam-video').setAttribute('aria-label', camOpciones.video ? 'Viendo la cámara. Tocá para solo escuchar' : 'Solo escuchando. Tocá para ver la cámara');
  $('#cam-calidad').textContent = camOpciones.calidad === 'alta' ? 'HD' : 'SD';
  $('#cam-calidad').setAttribute('aria-label', camOpciones.calidad === 'alta' ? 'Calidad alta (usa más datos)' : 'Calidad normal');
}
function cerrarCamara() {
  if (!camara) return;
  try { camara.ctrl.abort(); } catch {}
  clearInterval(camara.reloj);
  const v = $('#cam-video-el'); v.pause(); v.removeAttribute('src'); v.load();
  URL.revokeObjectURL(camara.url);
  camara = null;
}
async function abrirCamara() {
  pintarCamaraControles();
  if (!hojaCam.open) hojaCam.showModal();
  cerrarCamara();
  const est = $('#cam-estado');
  est.textContent = 'Conectando con la cámara…'; est.className = 'cam-estado';
  const v = $('#cam-video-el');
  v.classList.toggle('solo-audio', !camOpciones.video);
  const ctrl = new AbortController();
  const ms = new MediaSource();
  const url = URL.createObjectURL(ms);
  camara = { ctrl, ms, url, desde: 0, reloj: null };
  const mio = camara;
  v.src = url;
  v.muted = !camOpciones.audio;
  try {
    await new Promise((ok) => ms.addEventListener('sourceopen', ok, { once: true }));
    const q = `video=${camOpciones.video ? 1 : 0}&audio=${camOpciones.audio ? 1 : 0}&calidad=${camOpciones.calidad}`;
    const r = await fetch(u(`/api/camara/vivo?${q}`), { headers: { Authorization: `Bearer ${guardado.token}` }, signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) { let m = 'No pude abrir la cámara.'; try { m = (await r.json()).error || m; } catch {} throw new Error(m); }
    const codec = r.headers.get('X-Jarvis-Codec') || (camOpciones.video ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus');
    const tipo = codec.replace(/;codecs=([^;]+)/, '; codecs="$1"');
    if (!MediaSource.isTypeSupported(tipo)) throw new Error('Este celular no puede reproducir el video de la cámara.');
    const sb = ms.addSourceBuffer(tipo);
    sb.mode = 'sequence';
    const cola = [];
    const seguir = () => {
      if (sb.updating || !cola.length || ms.readyState !== 'open') return;
      try { sb.appendBuffer(cola.shift()); } catch (e) { if (e.name === 'QuotaExceededError') { try { sb.remove(0, Math.max(0, v.currentTime - 5)); } catch {} } }
    };
    sb.addEventListener('updateend', () => {
      // Pegado al vivo: si se atrasa más de 1,5 s, salta al final. Lo viejo se borra para no llenar la memoria.
      if (v.buffered.length) {
        const fin = v.buffered.end(v.buffered.length - 1);
        if (fin - v.currentTime > 1.5) v.currentTime = Math.max(0, fin - 0.4);
        if (v.currentTime > 30 && !sb.updating) { try { sb.remove(0, v.currentTime - 20); return; } catch {} }
      }
      seguir();
    });
    const lector = r.body.getReader();
    let primero = true;
    for (;;) {
      const { value, done } = await lector.read();
      if (done || camara !== mio) break;
      cola.push(value); seguir();
      if (primero) {
        primero = false;
        v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
        mio.desde = Date.now();
        est.className = 'cam-estado vivo';
        const pintarTiempo = () => { const s = Math.round((Date.now() - mio.desde) / 1000); est.textContent = `En vivo · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${camOpciones.video ? '' : ' · solo sonido'}`; };
        pintarTiempo(); mio.reloj = setInterval(pintarTiempo, 1000);
      }
    }
    if (camara === mio) { est.textContent = 'La PC cortó la transmisión.'; est.className = 'cam-estado mal'; }
  } catch (e) {
    if (camara !== mio || e.name === 'AbortError') return;
    est.textContent = e instanceof TypeError ? 'Tu PC no responde.' : e.message; est.className = 'cam-estado mal';
  }
}
$('#cam-cerrar').addEventListener('click', () => { cerrarCamara(); hojaCam.close(); });
hojaCam.addEventListener('close', cerrarCamara);
$('#cam-sonido').addEventListener('click', () => {
  camOpciones.audio = !camOpciones.audio; guardado.escribir('camara.opciones', camOpciones); pintarCamaraControles();
  if (!camOpciones.audio && !camOpciones.video) { camOpciones.video = true; pintarCamaraControles(); }
  abrirCamara();
});
$('#cam-video').addEventListener('click', () => { camOpciones.video = !camOpciones.video; if (!camOpciones.video) camOpciones.audio = true; guardado.escribir('camara.opciones', camOpciones); abrirCamara(); });
$('#cam-calidad').addEventListener('click', () => { camOpciones.calidad = camOpciones.calidad === 'alta' ? 'normal' : 'alta'; guardado.escribir('camara.opciones', camOpciones); abrirCamara(); });
$('#cam-completa').addEventListener('click', () => { const v = $('#cam-caja'); (document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen()).catch(() => {}); });
$('#cam-completa').innerHTML = svg('expandir', 22);
$('#cam-cerrar').innerHTML = svg('cerrar', 22);

// ---------- Widgets: editar como en el inicio del celular ----------
// Mantener apretado un widget (o tocar Editar): se pueden arrastrar para ordenarlos, agrandarlos desde la esquina,
// tocarlos para elegir tamaño y color, y sacarlos con la cruz (con Deshacer).
let editando = false;
let quitadoReciente = null;
const vibrar = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
function contenidoHablar(w) {
  const campo = h('input', { type: 'text', placeholder: 'Preguntale o pedile algo…', maxlength: '2000', 'aria-label': 'Escribile a Jarvis', enterkeyhint: 'send' });
  const salida = h('div', { class: 'h-salida', 'aria-live': 'polite' });
  const ultima = guardado.leer('hablar.ultima', null);
  const pintarSalida = (x) => {
    if (!x) { salida.replaceChildren(h('span', { class: 'tenue' }, puedeEscuchar() ? 'Tocá el micrófono y hablá, o escribí.' : 'Escribí lo que quieras pedirle.')); return; }
    salida.replaceChildren(h('small', { class: 'tenue' }, `Vos: ${x.pedido}`), x.pensando ? h('span', { class: 'pensando-mini' }, h('i'), h('i'), h('i')) : h('p', { class: x.error ? 'mal' : '' }, x.respuesta));
  };
  pintarSalida(ultima);
  const mandar = async (texto) => {
    const t = String(texto || '').trim(); if (!t) return;
    campo.value = '';
    pintarSalida({ pedido: t, pensando: true });
    sumar('vos', t);
    try {
      const r = await api('/api/texto', { metodo: 'POST', cuerpo: { texto: t }, espera: 120000 });
      const x = { pedido: t, respuesta: r.texto || 'Listo.' };
      sumar('jarvis', x.respuesta); guardado.escribir('hablar.ultima', x); pintarSalida(x);
      if (w.alto !== 2) aviso(x.respuesta, { ms: Math.min(12000, 3000 + x.respuesta.length * 50) });
      if (w.voz) leerEnVozAlta(x.respuesta);
      refrescar({ silencioso: true }); ultimoInicio = 0; cargarInicio(true);
    } catch (e) {
      if (e instanceof NoVinculado) return;
      const x = { pedido: t, respuesta: e instanceof SinPC ? 'Tu PC no responde.' : e.message, error: true };
      pintarSalida(x); aviso(x.respuesta, { tipo: 'mal' });
    }
  };
  campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); mandar(campo.value); } });
  return h('div', { class: 'w-hablar' },
    w.alto === 2 ? salida : null,
    h('div', { class: 'h-fila' }, campo, botonMic(campo, mandar),
      h('button', { type: 'button', class: 'icono principal', 'aria-label': 'Mandar', html: svg('enviar', 20), onclick: () => mandar(campo.value) })));
}
function contenidoCamara(w) {
  const permitida = !(estado && estado.camara && estado.camara.permitida === false);
  const grande = w.alto === 2 || w.tam === 2;
  return h('button', { type: 'button', class: 'w-camara', onclick: () => abrirCamara() },
    h('span', { class: 'cam-icono', html: svg('camara', grande ? 30 : 24) }),
    h('span', {}, h('b', {}, 'Cámara de seguridad'), h('small', {}, permitida ? (grande ? 'Ver la webcam y escuchar el micrófono de la PC' : 'Ver en vivo') : 'Apagada en la PC')),
    estado && estado.camara && estado.camara.mirando ? h('span', { class: 'cam-punto', 'aria-label': 'Alguien está mirando' }) : null);
}
function pintarInicio() {
  const caja = $('#widgets');
  if (!caja) return;
  if (arrastre) return; // no se repinta en medio de un arrastre
  const hora = new Date().getHours();
  $('#saludo').textContent = `${hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'}${estado && estado.usuario ? `, ${estado.usuario}` : ''}`;
  if (editando && caja.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  if (!editando && caja.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
    // No pisar lo que se está escribiendo en "Hablale a Jarvis" o en la nota rápida.
    return;
  }
  caja.classList.toggle('editando', editando);
  caja.replaceChildren(...widgets.map((w) => {
    const t = TIPOS_W[w.tipo];
    const el = h('div', { class: `widget wt-${w.tipo} tam-${w.tam} alto-${w.alto}`, style: w.color ? `--c:${w.color}` : '', 'data-id': w.id }, contenidoW(w));
    if (editando) {
      el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `${t.nombre}, ${NOMBRE_TAM(w.tam, w.alto).toLowerCase()}. Tocá para cambiarlo; arrastralo para moverlo.`);
      el.append(h('button', { type: 'button', class: 'w-quitar', 'aria-label': `Sacar ${t.nombre}`, html: svg('cerrar', 14), onclick: (ev) => { ev.stopPropagation(); quitarWidget(w.id); } }));
      if (puedeCrecer(w)) el.append(h('span', { class: 'w-asa', 'aria-hidden': 'true', html: svg('esquina', 16) }));
    }
    return el;
  }));
  if (!widgets.length) caja.append(h('button', { type: 'button', class: 'w-vacio', onclick: () => { if (!editando) empezarEdicion(); catalogo(); } }, h('span', { html: svg('mas', 24) }), h('span', {}, 'Agregá tu primer widget')));
}
const puedeCrecer = (w) => { const t = TIPOS_W[w.tipo]; return t.tams.length > 1 || (t.altos || [1]).length > 1; };
function quitarWidget(id) {
  const i = widgets.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [w] = widgets.splice(i, 1);
  quitadoReciente = { w, i };
  guardarWidgets(); pintarInicio(); vibrar();
  aviso(`Saqué "${TIPOS_W[w.tipo].nombre}".`, { ms: 6000, accion: { texto: 'Deshacer', hacer: () => { if (!quitadoReciente) return; widgets.splice(Math.min(quitadoReciente.i, widgets.length), 0, quitadoReciente.w); quitadoReciente = null; guardarWidgets(); pintarInicio(); $('#aviso').hidden = true; } } });
}
function empezarEdicion() { editando = true; $('#editando').hidden = false; $('#editar-inicio').textContent = 'Listo'; vibrar(20); pintarInicio(); }
function terminarEdicion() { editando = false; $('#editando').hidden = true; $('#editar-inicio').textContent = 'Editar'; pintarInicio(); }
$('#editar-inicio').addEventListener('click', () => { if (editando) terminarEdicion(); else empezarEdicion(); });
$('#restaurar-inicio').addEventListener('click', () => { if (!confirm('¿Volver al inicio de siempre? Se pierden los cambios.')) return; widgets = INICIO_DE_SIEMPRE.map(normalizarW); guardarWidgets(); pintarInicio(); });

// Arrastrar (mover) y la esquina (agrandar). Con el dedo: mantener apretado ~0,4 s fuera de edición entra a editar y ya agarra.
let arrastre = null;
function scrollerDe(el) { for (let p = el.parentElement; p; p = p.parentElement) { const st = getComputedStyle(p); if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight) return p; } return document.scrollingElement; }
function flip(caja, cambio) {
  const antes = new Map([...caja.children].map((c) => [c, c.getBoundingClientRect()]));
  cambio();
  for (const c of caja.children) {
    if (arrastre && c === arrastre.el) continue;
    const a = antes.get(c); if (!a) continue;
    const d = c.getBoundingClientRect();
    const dx = a.left - d.left; const dy = a.top - d.top;
    if (!dx && !dy) continue;
    c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}
function moverArrastre(x, y) {
  const a = arrastre;
  a.x = x; a.y = y;
  if (a.modo === 'mover') {
    const natural = { left: a.el.getBoundingClientRect().left - a.tx, top: a.el.getBoundingClientRect().top - a.ty };
    a.tx = x - a.offX - natural.left; a.ty = y - a.offY - natural.top;
    a.el.style.transform = `translate(${a.tx}px, ${a.ty}px) scale(1.04)`;
    // ¿Sobre qué widget está el dedo? Se ubica antes o después según de qué lado.
    a.el.style.pointerEvents = 'none';
    const debajo = document.elementFromPoint(x, y);
    a.el.style.pointerEvents = '';
    const otro = debajo && debajo.closest('.widget');
    if (otro && otro !== a.el && otro.parentElement === a.caja) {
      const r = otro.getBoundingClientRect();
      const despues = (y > r.top + r.height * 0.5 && x > r.left) || (x > r.left + r.width * 0.5 && y > r.top);
      const de = widgets.findIndex((w) => w.id === a.el.dataset.id);
      let a2 = widgets.findIndex((w) => w.id === otro.dataset.id) + (despues ? 1 : 0);
      if (a2 > de) a2 -= 1;
      if (a2 !== de && a2 >= 0) {
        flip(a.caja, () => {
          const [w] = widgets.splice(de, 1); widgets.splice(a2, 0, w);
          const ref = a.caja.children[a2 >= de ? a2 + 1 : a2];
          a.caja.insertBefore(a.el, a2 >= de ? (a.caja.children[a2 + 1] || null) : a.caja.children[a2]);
          void ref;
        });
        a.cambio = true; vibrar(8);
        const nat2 = { left: a.el.getBoundingClientRect().left - a.tx, top: a.el.getBoundingClientRect().top - a.ty };
        a.tx = x - a.offX - nat2.left; a.ty = y - a.offY - nat2.top;
        a.el.style.transform = `translate(${a.tx}px, ${a.ty}px) scale(1.04)`;
      }
    }
  } else {
    // Agrandar: ancho por la mitad de la grilla, alto por filas.
    const w = widgets.find((z) => z.id === a.el.dataset.id); const t = TIPOS_W[w.tipo];
    const g = a.caja.getBoundingClientRect(); const r = a.el.getBoundingClientRect();
    const tam = x > g.left + g.width * 0.62 ? 2 : (x < g.left + g.width * 0.45 ? 1 : (r.right > g.left + g.width * 0.75 ? 2 : 1));
    const fila = a.alturaFila;
    const alto = y - r.top > fila * 1.45 ? 2 : 1;
    const nt = t.tams.includes(tam) ? tam : w.tam; const na = (t.altos || [1]).includes(alto) ? alto : w.alto;
    if (nt !== w.tam || na !== w.alto) {
      flip(a.caja, () => { w.tam = nt; w.alto = na; a.el.className = a.el.className.replace(/tam-\d/, `tam-${nt}`).replace(/alto-\d/, `alto-${na}`); });
      a.cambio = true; vibrar(8);
    }
  }
  // Cerca de los bordes de la pantalla, desplaza.
  const borde = 70; const vh = window.innerHeight;
  a.velocidad = y < borde ? -Math.ceil((borde - y) / 6) : y > vh - borde - 70 ? Math.ceil((y - (vh - borde - 70)) / 6) : 0;
}
function bucleScroll() {
  if (!arrastre) return;
  if (arrastre.velocidad) { arrastre.scroller.scrollTop += arrastre.velocidad; moverArrastre(arrastre.x, arrastre.y); }
  requestAnimationFrame(bucleScroll);
}
function soltarArrastre() {
  const a = arrastre; if (!a) return;
  arrastre = null;
  a.el.classList.remove('agarrado'); a.el.style.transform = ''; a.el.style.zIndex = '';
  document.body.classList.remove('arrastrando');
  if (a.cambio) { guardarWidgets(); }
  if (a.modo === 'agrandar' || a.cambio) pintarInicio();
  return a;
}
function empezarArrastre(el, modo, x, y) {
  const caja = $('#widgets');
  const r = el.getBoundingClientRect();
  const filas = getComputedStyle(caja).gridAutoRows.match(/(\d+(\.\d+)?)px/);
  arrastre = { el, caja, modo, offX: x - r.left, offY: y - r.top, tx: 0, ty: 0, x, y, cambio: false, velocidad: 0, scroller: scrollerDe(caja), alturaFila: filas ? Number(filas[1]) : r.height };
  if (modo === 'mover') { el.classList.add('agarrado'); el.style.zIndex = '20'; el.style.transform = 'scale(1.04)'; }
  document.body.classList.add('arrastrando');
  vibrar(15);
  requestAnimationFrame(bucleScroll);
}
{
  const caja = $('#widgets');
  let espera = null;
  let inicio = null;
  caja.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.widget');
    if (!el || e.button > 0) return;
    const enAsa = e.target.closest('.w-asa');
    if (e.target.closest('.w-quitar')) return;
    inicio = { x: e.clientX, y: e.clientY, el, id: e.pointerId, tocado: false };
    if (editando && enAsa) { e.preventDefault(); empezarArrastre(el, 'agrandar', e.clientX, e.clientY); return; }
    // Fuera de edición no se roba el toque a los botones del widget salvo que se mantenga apretado.
    clearTimeout(espera);
    espera = setTimeout(() => {
      if (!inicio) return;
      if (!editando) { empezarEdicion(); const nuevo = [...caja.children].find((c) => c.dataset.id === el.dataset.id); if (nuevo) inicio.el = nuevo; }
      empezarArrastre(inicio.el, 'mover', inicio.x, inicio.y);
    }, editando ? 160 : 420);
  });
  window.addEventListener('pointermove', (e) => {
    if (arrastre) { e.preventDefault(); moverArrastre(e.clientX, e.clientY); return; }
    if (inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 9) { clearTimeout(espera); inicio = null; }
  }, { passive: false });
  // En el celular, una vez agarrado el widget, la pantalla no tiene que desplazarse con el dedo.
  window.addEventListener('touchmove', (e) => { if (arrastre) e.preventDefault(); }, { passive: false });
  const fin = (e) => {
    clearTimeout(espera);
    const a = soltarArrastre();
    const toque = inicio && !a && editando && e.type === 'pointerup' && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 9;
    const el = inicio && inicio.el;
    inicio = null;
    if (toque && el && !e.target.closest('.w-quitar, .w-asa')) ajustesWidget(el.dataset.id);
  };
  window.addEventListener('pointerup', fin);
  window.addEventListener('pointercancel', fin);
  caja.addEventListener('contextmenu', (e) => { if (e.target.closest('.widget')) e.preventDefault(); });
  caja.addEventListener('keydown', (e) => { if (editando && (e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('widget')) { e.preventDefault(); ajustesWidget(e.target.dataset.id); } });
}

// Ajustes de un widget: tamaño, color, orden (para quien no arrastra), opciones propias y sacarlo.
function ajustesWidget(id) {
  const w = widgets.find((x) => x.id === id); if (!w) return;
  const t = TIPOS_W[w.tipo];
  const tamanos = [];
  for (const a of (t.altos || [1])) for (const tm of t.tams) tamanos.push([tm, a]);
  tamanos.sort((x, y) => x[0] * x[1] - y[0] * y[1]);
  const aplicar = () => { guardarWidgets(); pintarInicio(); ajustesWidget(id); };
  const i = widgets.indexOf(w);
  $('#hw-titulo').textContent = t.nombre;
  $('#catalogo').replaceChildren(...[
    tamanos.length > 1 ? h('div', { class: 'wa-grupo' }, h('span', { class: 'wa-et' }, 'Tamaño'),
      h('div', { class: 'wa-tamanos', role: 'radiogroup', 'aria-label': 'Tamaño' }, tamanos.map(([tm, a]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(w.tam === tm && w.alto === a), class: `wa-tam${w.tam === tm && w.alto === a ? ' on' : ''}`, onclick: () => { w.tam = tm; w.alto = a; aplicar(); } },
        h('span', { class: `wa-dibujo t${tm} a${a}` }, h('i')), h('span', {}, NOMBRE_TAM(tm, a)))))) : null,
    h('div', { class: 'wa-grupo' }, h('span', { class: 'wa-et' }, 'Color'),
      h('div', { class: 'wa-colores', role: 'radiogroup', 'aria-label': 'Color' }, COLORES_W.map((c) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(w.color === c), 'aria-label': c ? `Color ${c}` : 'Color de siempre', class: `wa-color${w.color === c ? ' on' : ''}`, style: `--c:${c || 'var(--ojo)'}`, onclick: () => { w.color = c; aplicar(); } })))),
    (t.opciones || []).includes('voz') ? h('label', { class: 'wa-opcion' }, Object.assign(h('input', { type: 'checkbox', onchange: (ev) => { w.voz = ev.target.checked; guardarWidgets(); } }), { checked: !!w.voz }), h('span', {}, 'Leer la respuesta en voz alta en el celular')) : null,
    w.tipo === 'frase' ? h('button', { type: 'button', class: 'w-opcion', onclick: () => { const tx = (prompt('¿Qué le dice a Jarvis?', w.texto || '') || '').trim(); if (!tx) return; w.texto = tx.slice(0, 300); w.nombre = ((prompt('Nombre del botón', w.nombre || tx.slice(0, 24)) || w.nombre || tx).trim()).slice(0, 30); aplicar(); } }, h('span', { class: 'w-ic', html: svg('charla', 20) }), h('span', {}, `Cambiar el atajo ("${w.texto || ''}")`)) : null,
    h('div', { class: 'wa-grupo' }, h('span', { class: 'wa-et' }, 'Lugar'),
      h('div', { class: 'wa-orden' },
        h('button', { type: 'button', disabled: i === 0, onclick: () => { widgets.splice(i, 1); widgets.unshift(w); aplicar(); } }, 'Primero'),
        h('button', { type: 'button', disabled: i === 0, onclick: () => { [widgets[i - 1], widgets[i]] = [widgets[i], widgets[i - 1]]; aplicar(); } }, h('span', { html: svg('arriba', 16) }), 'Subir'),
        h('button', { type: 'button', disabled: i === widgets.length - 1, onclick: () => { [widgets[i + 1], widgets[i]] = [widgets[i], widgets[i + 1]]; aplicar(); } }, h('span', { html: svg('abajo', 16) }), 'Bajar'))),
    h('button', { type: 'button', class: 'w-opcion peligro', onclick: () => { hojaW.close(); quitarWidget(id); } }, h('span', { class: 'w-ic', html: svg('cerrar', 20) }), h('span', {}, 'Sacar del inicio'))].filter(Boolean));
  if (!hojaW.open) hojaW.showModal();
}

const hojaW = $('#hoja-widgets');
// Una lista de opciones en la hoja de abajo (aparatos para la música, etc.).
function abrirLista(titulo, opciones) {
  $('#hw-titulo').textContent = titulo;
  $('#catalogo').replaceChildren(...opciones.map((o) => h('button', { type: 'button', class: `w-opcion${o.marcado ? ' on' : ''}`, 'aria-pressed': o.marcado ? 'true' : null, onclick: () => { hojaW.close(); o.fn(); } },
    h('span', { class: 'w-ic', html: svg(o.icono, 20) }), h('span', {}, o.nombre), o.marcado ? h('span', { class: 'w-marca', html: svg('tilde', 18) }) : null)));
  hojaW.showModal();
}
function elegirAparato() {
  const e = estado || {};
  const destino = (e.musica || {}).destino || '';
  const aparatos = e.aparatos || [];
  if (!aparatos.length) { aviso('No hay aparatos cargados. En la PC: Ajustes → Dispositivos → Teles y parlantes.', { tipo: 'mal', ms: 6000 }); return; }
  abrirLista('Escuchar en', [
    { icono: 'pc', nombre: 'Esta PC', marcado: !destino, fn: () => accion({ tipo: 'musica', accion: 'aLaPC' }) },
    ...aparatos.map((n) => ({ icono: 'cast', nombre: n, marcado: destino && destino.toLowerCase() === n.toLowerCase(), fn: () => accion({ tipo: 'musica', accion: 'enviar', dispositivo: n }) })),
  ]);
}
$('#hw-cerrar').addEventListener('click', () => hojaW.close());
function sumarWidget(w) {
  const t = TIPOS_W[w.tipo];
  widgets.push(normalizarW({ ...w, tam: w.tam || t.tams[t.tams.length - 1] }));
  guardarWidgets(); hojaW.close(); pintarInicio(); cargarInicio(true); vibrar();
  setTimeout(() => { const ult = $('#widgets').lastElementChild; if (ult) { ult.scrollIntoView({ behavior: 'smooth', block: 'center' }); ult.animate([{ boxShadow: '0 0 0 3px var(--ojo)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 900 }); } }, 50);
}
function catalogo() {
  const e = estado || {};
  const opcion = (ic, nombre, fn, detalle) => h('button', { type: 'button', class: 'w-opcion', onclick: fn }, h('span', { class: 'w-ic', html: svg(ic, 20) }), h('span', { class: 'wo-texto' }, h('span', {}, nombre), detalle ? h('small', {}, detalle) : null));
  $('#hw-titulo').textContent = 'Agregar un widget';
  const disponibles = Object.entries(TIPOS_W).filter(([k, t]) => !(t.unico && widgets.some((w) => w.tipo === k)));
  const grupos = ['Jarvis', 'Información', 'PC'];
  $('#catalogo').replaceChildren(...grupos.map((g) => {
    const items = disponibles.filter(([, t]) => t.grupo === g);
    if (!items.length) return null;
    return h('div', { class: 'cat-grupo' }, h('span', { class: 'wa-et' }, g), ...items.map(([k, t]) => opcion(t.icono, t.nombre, () => {
      if (t.datos === 'rutina') {
        $('#hw-titulo').textContent = '¿Qué rutina?';
        $('#catalogo').replaceChildren(...((e.rutinas || []).length ? e.rutinas.map((r) => opcion(r.icono || 'estrella', r.nombre, () => sumarWidget({ tipo: 'rutina', tam: 1, rutina: r.id }))) : [h('p', { class: 'tenue' }, 'No tenés rutinas: armalas en Más → Rutinas.')]));
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
      sumarWidget({ tipo: k });
    }, t.detalle)));
  }).filter(Boolean), ...(disponibles.length ? [] : [h('p', { class: 'tenue' }, 'Ya tenés todos.')]));
  hojaW.showModal();
}
$('#sumar-widget').addEventListener('click', catalogo);
// Una sola vez: los que ya tenían el inicio armado reciben "Hablale a Jarvis" arriba de todo.
if (!guardado.leer('inicio.hablar', false)) { guardado.escribir('inicio.hablar', true); if (!widgets.some((w) => w.tipo === 'hablar')) { widgets.unshift(normalizarW({ tipo: 'hablar', tam: 2 })); guardarWidgets(); } }


// ---------- Avisos del celular (app de Android) ----------
// La PC dice qué avisar en las próximas 48 h (recordatorios y eventos, si en Ajustes → Celular se eligió el celular);
// Android los programa como notificaciones, aunque la app esté cerrada. Cada 15 minutos Android vuelve a preguntar solo.
const avisosActivos = () => guardado.leer('avisos', true);
async function sincronizarAvisos() {
  if (!NATIVO || !guardado.token) return;
  const pc = pcElegida();
  try { await nativo.configurarPC({ base: pc ? baseActual() : '', token: guardado.token, avisos: avisosActivos() }); } catch {}
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

// Al volver a la app: si estaba afuera, ¿ya estoy en casa? (por la Wi-Fi es más rápido)
document.addEventListener('visibilitychange', () => { if (!document.hidden && modoAfuera) elegirCamino().then(() => refrescar({ silencioso: true })); });

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
// Versiones: la app busca la última Release en GitHub y, si hay una más nueva, la baja y abre el instalador de Android.
const compararVersiones = (x, y) => { const n = (v) => String(v || '0').split('.').map((k) => parseInt(k, 10) || 0); const [a, b] = [n(x), n(y)]; for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); return 0; };
let versionApp = '';
async function ultimaVersion() {
  const r = await fetch('https://api.github.com/repos/jsolaresc/jarvis/releases/latest', { cache: 'no-store' });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  const d = await r.json();
  const apk = (d.assets || []).find((x) => /\.apk$/i.test(x.name) && !/prueba/i.test(x.name));
  return { version: String(d.tag_name || '').replace(/^v/, ''), url: apk ? apk.browser_download_url : '' };
}
let actualizando = false;
async function actualizarApp(url, version) {
  if (actualizando) return;
  actualizando = true;
  const oyente = await nativo.addListener('actualizacion', (p) => { if (p && p.pct >= 0) aviso(`Bajando la versión ${version}: ${p.pct} %`, { ms: 0 }); });
  try {
    aviso(`Bajando la versión ${version}…`, { ms: 0 });
    const r = await nativo.actualizar({ url });
    if (r && r.permiso === false) aviso('Android pide permiso para que Jarvis instale su versión nueva: activalo y volvé a tocar "Actualizar".', { ms: 0, accion: { texto: 'Actualizar', hacer: () => actualizarApp(url, version) } });
    else aviso('Listo: tocá "Instalar" (o "Actualizar") en la pantalla de Android.', { tipo: 'bien', ms: 8000 });
  } catch (e) { aviso(e.message, { tipo: 'mal', ms: 8000 }); } finally { actualizando = false; try { oyente.remove(); } catch {} }
}
async function buscarActualizacion({ avisarSiNoHay = false } = {}) {
  try {
    if (!versionApp) versionApp = (await nativo.info()).version || '';
    const u = await ultimaVersion();
    pintarMenuVersion(u.version);
    if (u.url && compararVersiones(u.version, versionApp) > 0) aviso(`Hay una versión nueva de la app (${u.version}).`, { ms: 0, accion: { texto: 'Actualizar', hacer: () => actualizarApp(u.url, u.version) } });
    else if (avisarSiNoHay) aviso(`Tenés la última versión (${versionApp}).`, { tipo: 'bien' });
  } catch (e) { if (avisarSiNoHay) aviso(`No pude revisar: ${e.message}`, { tipo: 'mal' }); }
}
function pintarMenuVersion(ultima) {
  const b = $('#m-actualizar'); b.hidden = !NATIVO;
  b.textContent = ultima && versionApp && compararVersiones(ultima, versionApp) > 0 ? `Actualizar a la ${ultima}` : `Versión ${versionApp || '…'} · Buscar actualizaciones`;
}
async function revisarVersion() {
  // Una vez por día, sola: si hay una versión nueva, se avisa (y se actualiza desde el aviso).
  if (Date.now() - guardado.leer('revisado', 0) < 20 * 3600000) { nativo.info().then((i) => { versionApp = i.version || ''; pintarMenuVersion(); }).catch(() => {}); return; }
  guardado.escribir('revisado', Date.now());
  buscarActualizacion();
}
$('#m-actualizar').addEventListener('click', () => { menu.hidden = true; buscarActualizacion({ avisarSiNoHay: true }); });
function prepararNativo() {
  document.documentElement.classList.add('nativo');
  nativo.addListener('compartido', (d) => recibirCompartido(d && d.texto));
  nativo.compartidoPendiente().then((d) => recibirCompartido(d && d.texto)).catch(() => {});
  $('#buscar-pcs').addEventListener('click', () => buscarParaVincular());
  nativo.addListener('atras', () => atras());
  pintarMenuAvisos();
  guardado.escribir('afuera', null); // (de la 1.1.2–1.1.4: Tailscale adentro de la app; ya no se usa)
  revisarVersion();
}

// ---------- Más: lo mismo que en Ajustes de la PC (notas, calendario, rutinas, historial) ----------
// Todo pasa por /api/pc con los mismos pedidos que usa la PC: lo que cambiás acá queda igual allá.
const pedirPC = async (canal, ...args) => (await api('/api/pc', { metodo: 'POST', cuerpo: { canal, args }, espera: 60000 })).dato;
const SUBHOJAS = ['notas', 'calendario', 'rutinas', 'historial', 'descargar'];
const errorDe = (e) => (e instanceof SinPC ? 'Tu PC no responde.' : e.message);
const dos = (x) => String(x).padStart(2, '0');
const aLocal = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`; };
const deLocal = (v) => { if (!v) return 0; const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; };
const vacio = (texto) => h('li', { class: 'vacio tenue' }, texto);
function abrirLink(url) {
  if (NATIVO && /^https:\/\//i.test(url)) nativo.abrir({ url }).catch(() => window.open(url, '_blank'));
  else window.open(url, '_blank', 'noopener');
}
function fichas(sel, alCambiar) {
  const bs = [...document.querySelectorAll(`${sel} button`)];
  bs.forEach((b) => b.addEventListener('click', () => { bs.forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); alCambiar(b.dataset.filtro); }));
}

$('#mas-lista').replaceChildren(...[
  ['notas', 'nota', 'Notas', 'Lo que anotaste y los recordatorios'],
  ['calendario', 'calendario', 'Calendario', 'Tus eventos: verlos, crearlos y cambiarlos'],
  ['rutinas', 'rayo', 'Rutinas', 'Hacerlas, cambiarlas o armar nuevas'],
  ['historial', 'reloj', 'Historial', 'Lo que pediste y qué hizo Jarvis'],
  ['@camara', 'camara', 'Cámara de seguridad', 'Ver la webcam y escuchar el micrófono de la PC'],
  ['descargar', 'bajar', 'Descargar', 'Videos y audios de YouTube, Instagram…'],
].map(([hoja, ic, t, sub]) => h('button', { type: 'button', class: 'mas-item', onclick: () => (hoja === '@camara' ? abrirCamara() : irA(hoja)) },
  h('span', { class: 'ic', html: svg(ic) }), h('span', { class: 'datos' }, h('b', {}, t), h('span', {}, sub)))));
document.querySelectorAll('.volver-mas').forEach((b) => b.addEventListener('click', () => irA('mas')));
['#n-actualizar', '#c-actualizar', '#h-actualizar'].forEach((s) => { $(s).innerHTML = svg('actualizar', 20); });

// Hoja para editar (una nota, un evento, una rutina). botones: [{ texto, clase, hacer }]; si hacer devuelve false, queda abierta.
const hojaEd = $('#hoja-ed');
function editor(titulo, cuerpo, botones) {
  $('#ed-titulo').textContent = titulo;
  $('#ed-cuerpo').replaceChildren(...[cuerpo].flat(3).filter(Boolean));
  $('#ed-error').textContent = '';
  $('#ed-botones').replaceChildren(...botones.map((b) => h('button', { type: 'button', class: b.clase || '', onclick: async (ev) => {
    const el = ev.currentTarget; el.disabled = true; $('#ed-error').textContent = '';
    try { if (await b.hacer() !== false) hojaEd.close(); } catch (e) { if (!(e instanceof NoVinculado)) $('#ed-error').textContent = errorDe(e); } finally { el.disabled = false; }
  } }, b.texto)));
  if (!hojaEd.open) hojaEd.showModal();
  hojaEd.scrollTop = 0;
}
const campoEd = (etiqueta, control, nota) => { if (control.setAttribute && !control.getAttribute('aria-label')) control.setAttribute('aria-label', etiqueta); return h('div', { class: 'campo' }, h('span', { class: 'etiqueta' }, etiqueta), control, nota ? h('p', { class: 'tenue' }, nota) : null); };
const entrada = (valor, props = {}) => { const el = h('input', { type: 'text', ...props }); el.value = valor == null ? '' : String(valor); return el; };
const casilla = (valor, texto) => { const c = h('input', { type: 'checkbox' }); c.checked = !!valor; return { c, nodo: h('label', { class: 'casilla' }, c, h('span', {}, texto)) }; };
function elegirDe(valor, opciones, vacioTexto) {
  const ops = opciones.map((o) => (typeof o === 'string' ? { valor: o, nombre: o } : o));
  if (valor && !ops.some((o) => o.valor === valor)) ops.unshift({ valor, nombre: valor });
  const s = h('select', {}, vacioTexto ? h('option', { value: '' }, vacioTexto) : null, ...ops.map((o) => h('option', { value: o.valor }, o.nombre)));
  s.value = valor || '';
  return s;
}

// ----- Notas -----
let notasLista = null; let filtroNotas = 'todas';
async function cargarNotas() {
  try { notasLista = await pedirPC('notas:leer'); } catch (e) { if (!(e instanceof NoVinculado) && !notasLista) $('#lista-notas').replaceChildren(vacio(errorDe(e))); return; }
  pintarNotas();
}
function pintarNotas() {
  if (!notasLista) { $('#lista-notas').replaceChildren(vacio('Cargando…')); return; }
  const q = $('#n-buscar').value.trim().toLowerCase();
  const ns = notasLista.filter((n) => (filtroNotas === 'todas' || (filtroNotas === 'aviso' ? !!n.cuando : !n.cuando)) && (!q || `${n.texto} ${n.titulo || ''} ${n.enlace || ''}`.toLowerCase().includes(q)));
  // Primero lo que todavía tiene que avisar (lo más próximo arriba); después el resto, lo más nuevo arriba.
  const pendiente = (n) => n.cuando && !n.avisada;
  ns.sort((a, b) => (pendiente(b) - pendiente(a)) || (pendiente(a) ? a.cuando - b.cuando : (b.creada || 0) - (a.creada || 0)));
  $('#lista-notas').replaceChildren(...(ns.length ? ns.map((n) => h('li', { class: n.cuando && n.avisada ? 'pasada' : '' },
    h('button', { type: 'button', class: 'abrir', onclick: () => editarNota(n) },
      h('span', { class: 'ic', html: svg(n.cuando ? 'reloj' : 'nota', 20) }),
      h('span', { class: 'datos' }, h('b', { class: 'largo' }, n.texto),
        h('span', {}, [n.cuando ? `${n.avisada ? 'Avisó' : 'Avisa'} ${cuandoNota(n.cuando).replace(/^Hoy/, 'hoy')}` : `Anotada ${cuando(n.creada)}`, n.app ? `en ${n.app}` : '', n.enlace ? 'con link' : '', n.tieneCaptura ? 'con captura' : ''].filter(Boolean).join(' · '))))))
    : [vacio(notasLista.length ? 'Nada con ese filtro.' : 'Todavía no hay notas. Escribí arriba, o decile a Jarvis "anotá…" o "recordame… a las 5".')]));
  $('#n-borrar-avisadas').hidden = !notasLista.some((n) => n.cuando && n.avisada);
}
function editarNota(n) {
  const texto = h('textarea', { rows: '4', maxlength: '2000' }); texto.value = n.texto;
  const cuandoI = entrada(aLocal(n.cuando), { type: 'datetime-local' });
  const enlace = entrada(n.enlace || '', { type: 'url', placeholder: 'https://…', autocapitalize: 'off', spellcheck: 'false' });
  const extra = [];
  if (n.enlace) extra.push(h('button', { type: 'button', class: 'texto', onclick: () => abrirLink(n.enlace) }, 'Abrir el link'));
  if (n.tieneCaptura) {
    const caja = h('div', { class: 'captura' });
    extra.push(h('button', { type: 'button', class: 'texto', onclick: async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { const src = await pedirPC('notas:captura', n.id); if (src) { caja.replaceChildren(h('img', { src, alt: 'Captura de la pantalla de cuando la anotaste' })); b.hidden = true; } } catch (e) { aviso(errorDe(e), { tipo: 'mal' }); }
      b.disabled = false;
    } }, 'Ver la captura de la pantalla'), caja);
  }
  editor(n.tipo === 'recordatorio' || n.cuando ? 'Recordatorio' : 'Nota', [
    campoEd('Texto', texto),
    campoEd('Avisarme', cuandoI, 'Vacío: sin aviso. Suena en la PC y/o en este celular, según los avisos que tengas prendidos.'),
    campoEd('Link', enlace),
    n.app || n.titulo ? h('p', { class: 'tenue' }, `Anotada ${cuando(n.creada)}${n.app ? ` en ${n.app}` : ''}${n.titulo ? `: ${n.titulo}` : ''}.`) : null,
    h('div', { class: 'acciones' }, extra),
  ], [
    { texto: 'Guardar', clase: 'principal', hacer: async () => {
      const t = texto.value.trim(); if (!t) throw new Error('La nota no puede quedar vacía.');
      const nueva = await pedirPC('notas:guardar', { id: n.id, cambios: { texto: t, enlace: enlace.value.trim(), cuando: deLocal(cuandoI.value) || null } });
      notasLista = (notasLista || []).map((x) => (x.id === n.id ? nueva : x)); pintarNotas(); aviso('Nota guardada.', { tipo: 'bien' });
    } },
    { texto: 'Borrar', clase: 'peligro', hacer: async () => {
      if (!confirm('¿Borrar esta nota? No se puede deshacer.')) return false;
      await pedirPC('notas:borrar', n.id); notasLista = (notasLista || []).filter((x) => x.id !== n.id); pintarNotas(); aviso('Nota borrada.', { tipo: 'bien' });
    } },
    { texto: 'Cerrar', clase: 'texto', hacer: () => true },
  ]);
}
$('#form-nota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = $('#n-texto').value.trim(); if (!t) { $('#n-texto').focus(); return; }
  const b = e.submitter || $('#form-nota button'); b.disabled = true;
  try {
    const c = deLocal($('#n-cuando').value);
    if (c && c < Date.now()) throw new Error('Esa hora ya pasó: elegí una que venga.');
    const n = await pedirPC('notas:crear', { texto: t, cuando: c || undefined });
    $('#n-texto').value = ''; $('#n-cuando').value = '';
    notasLista = [n, ...(notasLista || []).filter((x) => x.id !== n.id)]; pintarNotas();
    aviso(c ? `Listo, te aviso ${cuandoNota(c).replace(/^Hoy/, 'hoy')}.` : 'Anotado.', { tipo: 'bien' });
    if (NATIVO && c) sincronizarAvisos();
  } catch (er) { if (!(er instanceof NoVinculado)) aviso(errorDe(er), { tipo: 'mal', ms: 6000 }); }
  b.disabled = false;
});
fichas('#n-filtros', (f) => { filtroNotas = f; pintarNotas(); });
$('#n-buscar').addEventListener('input', () => pintarNotas());
$('#n-actualizar').addEventListener('click', () => cargarNotas());
$('#n-borrar-avisadas').addEventListener('click', async (e) => {
  if (!confirm('¿Borrar todas las notas que ya avisaron?')) return;
  const b = e.currentTarget; b.disabled = true;
  try { await pedirPC('notas:borrar-avisadas'); await cargarNotas(); aviso('Listo, las borré.', { tipo: 'bien' }); } catch (er) { aviso(errorDe(er), { tipo: 'mal' }); }
  b.disabled = false;
});

// ----- Calendario -----
let diasCal = 30; let calDatos = null;
const dia0 = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return +d; };
const AVISOS_EV = [['', 'Los de siempre'], ['0', 'A la hora del evento'], ['5', '5 minutos antes'], ['10', '10 minutos antes'], ['15', '15 minutos antes'], ['30', '30 minutos antes'], ['60', '1 hora antes'], ['120', '2 horas antes'], ['1440', '1 día antes']];
async function cargarCalendario({ fuerza = false } = {}) {
  const desde = dia0(Date.now()); const hasta = desde + diasCal * 86400000;
  if (!calDatos) $('#agenda-cel').replaceChildren(h('p', { class: 'tenue' }, 'Cargando…'));
  try {
    if (fuerza) await pedirPC('calendario:actualizar').catch(() => {});
    const [r, ns] = await Promise.all([pedirPC('calendario:rango', { desde, hasta }), pedirPC('notas:leer').catch(() => notasLista || [])]);
    notasLista = ns;
    calDatos = { eventos: r.eventos || [], error: r.error || '', notas: (ns || []).filter((n) => n.cuando && n.cuando >= desde && n.cuando < hasta) };
  } catch (e) { if (!(e instanceof NoVinculado)) $('#c-estado').textContent = errorDe(e); return; }
  pintarCalendario();
}
function pintarCalendario() {
  if (!calDatos) return;
  $('#c-estado').textContent = calDatos.error ? `Un calendario no respondió (${calDatos.error}). Muestro lo que hay.` : '';
  const items = [...calDatos.eventos.map((e) => ({ t: e.todoElDia ? dia0(e.inicio) - 1 : e.inicio, dia: dia0(Math.max(e.inicio, dia0(Date.now()))), e })),
    ...calDatos.notas.map((n) => ({ t: n.cuando, dia: dia0(n.cuando), n }))].filter((x) => !x.e || x.e.fin > Date.now() - 3600000).sort((a, b) => a.dia - b.dia || a.t - b.t);
  const hoy = dia0(Date.now());
  const nombreDia = (d) => (d === hoy ? 'Hoy' : d === hoy + 86400000 ? 'Mañana' : new Date(d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const grupos = [];
  for (const x of items) { const g = grupos[grupos.length - 1]; if (g && g.dia === x.dia) g.items.push(x); else grupos.push({ dia: x.dia, items: [x] }); }
  $('#agenda-cel').replaceChildren(...(grupos.length ? grupos.map((g) => h('div', { class: 'ag-dia' }, h('h3', {}, nombreDia(g.dia)),
    h('ul', { class: 'lista' }, g.items.map((x) => {
      if (x.n) return h('li', {}, h('button', { type: 'button', class: 'abrir', onclick: () => editarNota(x.n) }, h('span', { class: 'ag-hora' }, hhmm(x.n.cuando)), h('span', { class: 'ag-color nota', html: svg('reloj', 14) }), h('span', { class: 'datos' }, h('b', {}, x.n.texto), h('span', {}, 'Recordatorio'))));
      const e = x.e;
      return h('li', { class: e.silenciado ? 'pasada' : '' }, h('button', { type: 'button', class: 'abrir', onclick: () => verEvento(e) },
        h('span', { class: 'ag-hora' }, e.todoElDia ? 'Todo el día' : hhmm(e.inicio)),
        h('span', { class: 'ag-color', style: `background:${e.color || e.colorCalendario || 'var(--ojo)'}` }),
        h('span', { class: 'datos' }, h('b', {}, e.titulo || '(sin nombre)'), h('span', {}, [e.todoElDia ? '' : `hasta ${hhmm(e.fin)}`, e.lugar, e.calendario || (e.local ? 'Jarvis' : ''), e.silenciado ? 'sin avisos' : ''].filter(Boolean).join(' · ')))));
    }))))
    : [h('p', { class: 'tenue' }, `Nada en los próximos ${diasCal} días.`)]));
  $('#c-mas').hidden = diasCal >= 360;
}
const avisoDe = (e) => (e.avisos && e.avisos.length === 1 && e.avisos[0].canal === 'jarvis' ? String(e.avisos[0].antes) : e.avisos && e.avisos.length ? 'propios' : '');
function formEvento(e = null) {
  const base = e ? e.inicio : (Math.ceil(Date.now() / 3600000)) * 3600000;
  const titulo = entrada(e ? e.titulo : '', { maxlength: '200', placeholder: 'Turno, cumpleaños, reunión…' });
  const todo = casilla(e && e.todoElDia, 'Todo el día');
  const fecha = entrada(aLocal(base).slice(0, 10), { type: 'date' });
  const ini = entrada(aLocal(base).slice(11), { type: 'time' });
  const fin = entrada(aLocal(e ? e.fin : base + 3600000).slice(11), { type: 'time' });
  const lugar = entrada(e ? e.lugar : '', { maxlength: '200' });
  const detalle = h('textarea', { rows: '3', maxlength: '1000' }); detalle.value = e ? e.detalle || '' : '';
  const previo = e ? avisoDe(e) : '';
  const avisoS = elegirDe(previo === 'propios' ? 'propios' : previo, [...AVISOS_EV.slice(1).map(([valor, nombre]) => ({ valor, nombre })), ...(previo === 'propios' ? [{ valor: 'propios', nombre: 'Los que tiene (armados en la PC)' }] : [])], AVISOS_EV[0][1]);
  const horas = h('div', { class: 'fila' }, campoEd('Empieza', ini), campoEd('Termina', fin));
  const ver = () => { horas.hidden = todo.c.checked; };
  todo.c.addEventListener('change', ver); ver();
  const leer = () => {
    const t = titulo.value.trim(); if (!t) throw new Error('Falta el nombre del evento.');
    if (!fecha.value) throw new Error('Falta la fecha.');
    let inicio; let finMs;
    if (todo.c.checked) { inicio = deLocal(`${fecha.value}T00:00`); finMs = inicio + 86400000 - 60000; }
    else { inicio = deLocal(`${fecha.value}T${ini.value || '09:00'}`); finMs = deLocal(`${fecha.value}T${fin.value || ini.value || '10:00'}`); if (finMs <= inicio) finMs += 86400000; }
    const datos = { titulo: t, inicio, fin: finMs, todoElDia: todo.c.checked, lugar: lugar.value.trim(), detalle: detalle.value.trim() };
    if (avisoS.value !== 'propios' && avisoS.value !== previo) datos.avisos = avisoS.value === '' ? null : [{ antes: Number(avisoS.value), canal: 'jarvis' }];
    return datos;
  };
  return { nodos: [campoEd('Nombre', titulo), campoEd('Día', fecha), todo.nodo, horas, campoEd('Lugar', lugar), campoEd('Aviso', avisoS), campoEd('Detalle', detalle)], leer };
}
function nuevoEvento() {
  const f = formEvento();
  editor('Nuevo evento', [h('p', { class: 'tenue' }, 'Queda en el calendario de Jarvis (en la PC) y te avisa como los demás.'), f.nodos], [
    { texto: 'Guardar', clase: 'principal', hacer: async () => { await pedirPC('calendario:guardar-local', f.leer()); aviso('Evento guardado.', { tipo: 'bien' }); cargarCalendario(); if (NATIVO) sincronizarAvisos(); } },
    { texto: 'Cancelar', clase: 'texto', hacer: () => true },
  ]);
}
function verEvento(e) {
  if (e.local) {
    const f = formEvento(e);
    editor('Evento de Jarvis', f.nodos, [
      { texto: 'Guardar', clase: 'principal', hacer: async () => { const d = f.leer(); await pedirPC('calendario:guardar-local', { ...e, ...d, id: e.id, avisos: d.avisos !== undefined ? d.avisos : e.avisos }); aviso('Evento guardado.', { tipo: 'bien' }); cargarCalendario(); if (NATIVO) sincronizarAvisos(); } },
      { texto: 'Borrar', clase: 'peligro', hacer: async () => { if (!confirm(`¿Borrar "${e.titulo}"?`)) return false; await pedirPC('calendario:borrar-local', e.id); aviso('Evento borrado.', { tipo: 'bien' }); cargarCalendario(); } },
      { texto: 'Cerrar', clase: 'texto', hacer: () => true },
    ]);
    return;
  }
  // De Google o de un enlace iCal: el evento en sí se cambia allá; en Jarvis se le puede cambiar el aviso, silenciarlo u ocultarlo.
  const previo = avisoDe(e);
  const avisoS = elegirDe(previo, [...AVISOS_EV.slice(1).map(([valor, nombre]) => ({ valor, nombre })), ...(previo === 'propios' ? [{ valor: 'propios', nombre: 'Los que tiene (armados en la PC)' }] : [])], AVISOS_EV[0][1]);
  const silenciar = casilla(e.silenciado, 'Que Jarvis no avise de este evento');
  const cuandoTxt = e.todoElDia ? `${new Date(e.inicio).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}, todo el día`
    : `${new Date(e.inicio).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}, de ${hhmm(e.inicio)} a ${hhmm(e.fin)}`;
  editor(e.titulo || 'Evento', [
    h('p', {}, cuandoTxt), e.lugar ? h('p', { class: 'tenue' }, e.lugar) : null,
    h('p', { class: 'tenue' }, `Calendario: ${e.calendario || 'externo'}${e.repite ? ' · se repite' : ''}. El evento se cambia en ${/google/i.test(e.calendario || '') ? 'Google Calendar' : 'su calendario'}; acá, solo cómo te avisa Jarvis.`),
    e.detalle ? h('p', { class: 'ev-detalle' }, e.detalle) : null,
    e.enlace ? h('button', { type: 'button', class: 'texto', onclick: () => abrirLink(e.enlace) }, 'Abrir el link del evento') : null,
    campoEd('Aviso', avisoS), silenciar.nodo,
  ], [
    { texto: 'Guardar', clase: 'principal', hacer: async () => {
      const cambios = { silenciar: silenciar.c.checked };
      if (avisoS.value !== 'propios' && avisoS.value !== previo) cambios.avisos = avisoS.value === '' ? [] : [{ antes: Number(avisoS.value), canal: 'jarvis' }];
      await pedirPC('calendario:cambiar', { id: e.id, cambios }); aviso('Listo.', { tipo: 'bien' }); cargarCalendario(); if (NATIVO) sincronizarAvisos();
    } },
    { texto: 'Ocultar en Jarvis', hacer: async () => { if (!confirm('¿Ocultarlo? Jarvis no lo va a mostrar ni avisar (en tu calendario sigue estando).')) return false; await pedirPC('calendario:cambiar', { id: e.id, cambios: { oculto: true } }); cargarCalendario(); } },
    ...(e.cambiado ? [{ texto: 'Volver al original', hacer: async () => { await pedirPC('calendario:cambiar', { id: e.id, cambios: null }); cargarCalendario(); } }] : []),
    { texto: 'Cerrar', clase: 'texto', hacer: () => true },
  ]);
}
$('#c-nuevo').addEventListener('click', () => nuevoEvento());
$('#c-actualizar').addEventListener('click', () => cargarCalendario({ fuerza: true }));
$('#c-mas').addEventListener('click', () => { diasCal = Math.min(360, diasCal + 60); cargarCalendario(); });

// ----- Rutinas -----
let rutinasLista = null; let opcionesRutina = null; let opcionesCuando = 0;
const ICONOS_RUTINA = ['juego', 'tele', 'mensaje', 'luz', 'musica', 'casa', 'luna', 'estrella', 'camara', 'auriculares', 'parlante', 'rayo', 'apagar', 'trabajo', 'cafe', 'cama', 'auto', 'pesa', 'pelota', 'libro', 'comida', 'avion', 'campana', 'corazon', 'codigo', 'pincel', 'mic', 'pata', 'personas', 'cohete', 'fuego', 'alarma', 'pc', 'regalo'];
async function cargarRutinas() {
  try { rutinasLista = await pedirPC('rutinas:leer'); } catch (e) { if (!(e instanceof NoVinculado) && !rutinasLista) $('#lista-rutinas').replaceChildren(vacio(errorDe(e))); return; }
  pintarRutinas();
}
async function opciones() {
  if (opcionesRutina && Date.now() - opcionesCuando < 5 * 60000) return opcionesRutina;
  try { opcionesRutina = await pedirPC('rutinas:opciones'); opcionesCuando = Date.now(); } catch { opcionesRutina = opcionesRutina || { programas: [], juegos: [], salidas: [], teles: [], casa: [], contactos: [], modos: [], servicios: [] }; }
  $('#dl-programas').replaceChildren(...opcionesRutina.programas.map((n) => h('option', { value: n })));
  $('#dl-juegos').replaceChildren(...opcionesRutina.juegos.map((j) => h('option', { value: j.nombre })));
  return opcionesRutina;
}
const primerNombre = (n) => String(n || '').split(',')[0].trim();
function pintarRutinas() {
  if (!rutinasLista) { $('#lista-rutinas').replaceChildren(vacio('Cargando…')); return; }
  $('#lista-rutinas').replaceChildren(...(rutinasLista.length ? rutinasLista.map((r) => h('li', {},
    h('button', { type: 'button', class: 'abrir', onclick: () => editarRutina(JSON.parse(JSON.stringify(r))) },
      h('span', { class: 'ic', html: svg(r.icono || 'rayo', 20) }),
      h('span', { class: 'datos' }, h('b', {}, primerNombre(r.nombre) || 'Sin nombre'), h('span', {}, [`${r.pasos.length} ${r.pasos.length === 1 ? 'paso' : 'pasos'}`, r.rapida ? 'botón en el notch' : ''].filter(Boolean).join(' · ')))),
    h('button', { type: 'button', class: 'chico principal', onclick: (ev) => accion({ tipo: 'rutina', id: r.id }, ev.currentTarget) }, 'Hacer')))
    : [vacio('No tenés rutinas todavía. Armá una: por ejemplo, "modo juego" que abra Steam, cambie el audio y avise por WhatsApp.')]));
}
const contactosRutina = (o) => [{ valor: 'yo', nombre: 'A mí (mi propio WhatsApp)' }, ...o.contactos];
// Los mismos pasos que en la PC (Ajustes → Rutinas). Cada campo: [clave, tipo, texto de ayuda u opciones].
const PASOS = {
  juego: ['Abrir un juego (Steam)', [['juego', 'texto', 'Counter-Strike 2', 'dl-juegos']]],
  abrir: ['Abrir un programa', [['programa', 'texto', 'Discord', 'dl-programas']]],
  cerrar: ['Cerrar un programa', [['proceso', 'texto', 'Discord.exe']]],
  salida_audio: ['Cambiar salida de audio', [['salida', 'elegir', (o) => o.salidas, 'Qué salida…']]],
  volumen: ['Volumen de la PC', [['nivel', 'numero', '0 a 100', 0, 100]]],
  tele: ['Controlar una tele', [['tele', 'elegir', (o) => o.teles, 'Qué tele…'], ['accion', 'elegir', () => ['prender', 'apagar', 'pausar', 'reanudar', 'detener', 'volumen', 'silenciar', 'sonido'], 'Qué hacer…'], ['valor', 'texto', 'Volumen (0 a 100)']]],
  reproducir: ['Enviar algo a la tele', [['tele', 'elegir', (o) => o.teles, 'Qué tele…'], ['origen', 'texto', 'Ruta de un video o una URL']]],
  casa: ['Luces y casa', [['dispositivo', 'elegir', (o) => o.casa, 'Qué dispositivo…'], ['accion', 'elegir', () => ['prender', 'apagar', 'alternar', 'brillo'], 'Qué hacer…'], ['valor', 'texto', 'Brillo (0 a 100)']]],
  whatsapp: ['Mandar un WhatsApp', [['contacto', 'elegir', contactosRutina, 'A quién…'], ['mensaje', 'texto', 'Mensaje']]],
  foto_whatsapp: ['Mandar foto de la webcam', [['contacto', 'elegir', contactosRutina, 'A quién…'], ['epigrafe', 'texto', 'Texto (opcional)']]],
  audio_whatsapp: ['Grabar y mandar nota de voz', [['contacto', 'elegir', contactosRutina, 'A quién…'], ['segundos', 'numero', 'Segundos (8)', 2, 60]]],
  decir: ['Que Jarvis diga algo', [['texto', 'texto', 'Modo juego activado.']]],
  esperar: ['Esperar', [['segundos', 'numero', 'Segundos', 1, 120]]],
  modo: ['Cambiar modo de Jarvis', [['modo', 'elegir', (o) => o.modos.map((m) => ({ valor: m.id, nombre: m.nombre })), 'Qué modo…']]],
  ver: ['Abrir una serie, película o video', [['titulo', 'texto', 'Qué ver'], ['servicio', 'elegir', (o) => o.servicios.map((s) => ({ valor: s.id, nombre: s.nombre })), 'Donde esté'], ['dispositivo', 'texto', 'En la PC (o el nombre de una tele)']]],
  musica: ['Reproducir música', [['busqueda', 'texto', 'Canción, álbum, género… (vacío = "poné música")']]],
};
function camposPaso(p, o) {
  const def = PASOS[p.tipo];
  if (!def) return [h('p', { class: 'tenue' }, `Paso "${p.tipo}": se cambia en la PC. Queda como está.`)];
  return def[1].map(([k, tipo, ayuda, extra, max]) => {
    if (tipo === 'elegir') { const s = elegirDe(p[k] == null ? '' : String(p[k]), ayuda(o), extra); s.setAttribute('aria-label', extra.replace('…', '')); s.addEventListener('change', () => { if (s.value) p[k] = s.value; else delete p[k]; }); return s; }
    const el = entrada(p[k], tipo === 'numero' ? { type: 'number', inputmode: 'numeric', min: String(ayuda === '0 a 100' ? 0 : extra), max: String(max), placeholder: ayuda, 'aria-label': ayuda } : { placeholder: ayuda, 'aria-label': ayuda, ...(extra ? { list: extra } : {}) });
    el.addEventListener('input', () => {
      const v = el.value.trim();
      if (!v) delete p[k]; else p[k] = tipo === 'numero' ? Number(v) : el.value;
      if (k === 'juego') { const j = o.juegos.find((x) => x.nombre.toLowerCase() === v.toLowerCase()); if (j) p.appid = j.id; else delete p.appid; }
    });
    return el;
  });
}
async function guardarRutina(r, { borrar = false } = {}) {
  const actuales = await pedirPC('rutinas:leer'); // la última versión de la PC: así no se pisa lo que cambiaste allá
  const i = actuales.findIndex((x) => x.id === r.id);
  if (borrar) { if (i >= 0) actuales.splice(i, 1); } else if (i >= 0) actuales[i] = r; else actuales.push(r);
  rutinasLista = await pedirPC('rutinas:guardar', actuales);
  pintarRutinas();
}
async function editarRutina(r, nueva = false) {
  const o = await opciones();
  const nombre = entrada(r.nombre, { maxlength: '80', placeholder: 'Modo juego' });
  const frases = entrada((r.activadores || []).join(', '), { placeholder: 'avisale que juego, decile que juego' });
  const rapida = casilla(r.rapida, 'Mostrarla como botón en el notch de la PC');
  const iconos = h('div', { class: 'iconos-r', role: 'radiogroup', 'aria-label': 'Ícono' });
  const pintarIconos = () => iconos.replaceChildren(...ICONOS_RUTINA.map((n) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(n === r.icono), 'aria-label': n, class: n === r.icono ? 'on' : '', html: svg(n, 20), onclick: () => { r.icono = n; pintarIconos(); } })));
  pintarIconos();
  const pasos = h('ol', { class: 'pasos-r' });
  const pintarPasos = () => pasos.replaceChildren(...(r.pasos.length ? r.pasos.map((p, i) => {
    const tipo = h('select', { 'aria-label': `Qué hace el paso ${i + 1}` }, ...(PASOS[p.tipo] ? [] : [h('option', { value: p.tipo }, 'Otro (se cambia en la PC)')]), ...Object.entries(PASOS).map(([id, d]) => h('option', { value: id }, d[0])));
    tipo.value = p.tipo;
    tipo.addEventListener('change', () => { r.pasos[i] = { tipo: tipo.value }; pintarPasos(); });
    const mover = (d) => { const [x] = r.pasos.splice(i, 1); r.pasos.splice(i + d, 0, x); pintarPasos(); };
    return h('li', { class: 'paso-r' },
      h('div', { class: 'fila' }, h('b', { class: 'n' }, `${i + 1}.`), tipo,
        h('button', { type: 'button', class: 'icono', 'aria-label': 'Subir', html: svg('arriba', 18), disabled: i === 0, onclick: () => mover(-1) }),
        h('button', { type: 'button', class: 'icono', 'aria-label': 'Bajar', html: svg('abajo', 18), disabled: i === r.pasos.length - 1, onclick: () => mover(1) }),
        h('button', { type: 'button', class: 'icono peligro', 'aria-label': `Quitar el paso ${i + 1}`, html: svg('cerrar', 18), onclick: () => { r.pasos.splice(i, 1); pintarPasos(); } })),
      h('div', { class: 'campos-paso' }, camposPaso(p, o)));
  }) : [h('li', { class: 'tenue' }, 'Todavía no hace nada: agregale un paso.')]));
  pintarPasos();
  const leer = () => {
    r.nombre = nombre.value.trim(); if (!r.nombre) throw new Error('Ponele un nombre: así se la pedís a Jarvis por voz.');
    r.activadores = frases.value.split(',').map((x) => x.trim()).filter(Boolean); r.rapida = rapida.c.checked;
    return r;
  };
  editor(nueva ? 'Nueva rutina' : primerNombre(r.nombre) || 'Rutina', [
    campoEd('Nombre', nombre, 'Así se la pedís a Jarvis por voz.'), campoEd('Ícono', iconos),
    campoEd('Otras frases', frases, 'Otras maneras de pedirla, separadas por coma.'), rapida.nodo,
    h('h3', {}, 'Pasos'), pasos,
    h('button', { type: 'button', class: 'ancho', onclick: () => { r.pasos.push({ tipo: 'abrir' }); pintarPasos(); setTimeout(() => pasos.lastElementChild.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30); } }, 'Agregar paso'),
  ], [
    { texto: 'Guardar', clase: 'principal', hacer: async () => { await guardarRutina(leer()); aviso('Rutina guardada.', { tipo: 'bien' }); } },
    { texto: 'Probar', hacer: async () => { await guardarRutina(leer()); const res = await pedirPC('rutina:ejecutar', r.id); $('#ed-error').textContent = ''; aviso(res.ok ? 'Salió todo bien.' : res.errores.join(' · '), { tipo: res.ok ? 'bien' : 'mal', ms: 6000 }); return false; } },
    ...(nueva ? [] : [{ texto: 'Eliminar', clase: 'peligro', hacer: async () => { if (!confirm(`¿Eliminar "${primerNombre(r.nombre)}"? No se puede deshacer.`)) return false; await guardarRutina(r, { borrar: true }); aviso('Rutina eliminada.', { tipo: 'bien' }); } }]),
    { texto: 'Cerrar', clase: 'texto', hacer: () => true },
  ]);
}
$('#r-nueva').addEventListener('click', () => editarRutina({ id: `rutina_${Date.now().toString(36)}`, nombre: '', icono: 'estrella', rapida: true, pasos: [] }, true));

// ----- Historial -----
let historialLista = null; let filtroHist = 'todos';
const ORIGENES = { voz: 'por voz', texto: 'escrito', click: 'con un click', aviso: 'por su cuenta', celular: 'desde el celular' };
async function cargarHistorial() {
  try { historialLista = await pedirPC('historial:leer'); } catch (e) { if (!(e instanceof NoVinculado) && !historialLista) $('#lista-historial').replaceChildren(vacio(errorDe(e))); return; }
  pintarHistorial();
}
function pintarHistorial() {
  if (!historialLista) { $('#lista-historial').replaceChildren(vacio('Cargando…')); return; }
  const q = $('#h-buscar').value.trim().toLowerCase();
  const l = historialLista.filter((x) => (filtroHist === 'todos' || (filtroHist === 'error' ? x.ok === false : x.origen === 'celular')) && (!q || `${x.dicho} ${x.respuesta}`.toLowerCase().includes(q)));
  $('#lista-historial').replaceChildren(...(l.length ? l.map((x) => h('li', { class: x.ok === false ? 'mal' : '' },
    h('span', { class: `punto${x.ok === false ? ' mal' : ''}`, 'aria-label': x.ok === false ? 'Con error' : 'Bien' }),
    h('div', { class: 'datos' },
      h('b', { class: 'largo' }, x.dicho || '(sin texto)'),
      h('span', {}, [cuandoNota(x.cuando).replace(/^Hoy/, 'hoy'), ORIGENES[x.origen] || x.origen, x.ms ? `${(x.ms / 1000).toFixed(1).replace('.', ',')} s` : ''].filter(Boolean).join(' · ')),
      x.respuesta ? h('p', { class: 'h-resp' }, x.respuesta) : null,
      h('details', {}, h('summary', {}, (x.detalle || []).length ? `Ver detalle (${x.detalle.length})` : 'Más'),
        (x.detalle || []).length ? h('ol', {}, x.detalle.map((d) => h('li', { class: d.error ? 'mal' : '' }, h('time', {}, `+${(d.t / 1000).toFixed(2)} s`), ' ', d.texto))) : null,
        h('button', { type: 'button', class: 'texto peligro', onclick: async (ev) => {
          const b = ev.currentTarget; b.disabled = true;
          try { await pedirPC('historial:borrar', x.id); historialLista = historialLista.filter((y) => y.id !== x.id); pintarHistorial(); } catch (e) { aviso(errorDe(e), { tipo: 'mal' }); b.disabled = false; }
        } }, 'Borrar esta línea')))))
    : [vacio(historialLista.length ? 'Nada con ese filtro.' : 'Todavía no hay nada en el historial.')]));
}
fichas('#h-filtros', (f) => { filtroHist = f; pintarHistorial(); });
$('#h-buscar').addEventListener('input', () => pintarHistorial());
$('#h-actualizar').addEventListener('click', () => cargarHistorial());
$('#h-limpiar').addEventListener('click', async (e) => {
  if (!confirm('¿Borrar todo el historial? No se puede deshacer.')) return;
  const b = e.currentTarget; b.disabled = true;
  try { await pedirPC('historial:limpiar'); historialLista = []; pintarHistorial(); } catch (er) { aviso(errorDe(er), { tipo: 'mal' }); }
  b.disabled = false;
});

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
