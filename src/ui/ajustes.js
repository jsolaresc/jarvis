// Ventana de ajustes: todo lo que se cambia acá se guarda solo en datos/config.json y datos/rutinas.json.
import { icono, ICONOS_RUTINA } from './iconos.js';
import { LISTA_DE_SONIDOS, tocar } from './sonidos.js';
import { Grabadora } from './grabadora.js';
import { usarNombre } from './nombre.js';
import { TIPOS, COLUMNAS, NOMBRE_DE_TAM, NOMBRE_DE_ALTO, COLORES_WIDGET, GRUPOS_DE_WIDGETS, DE_CLIPS, nuevoIdDeWidget, normalizarWidget, tamPorDefecto, empaquetar } from './widgets.js';

const jarvis = window.jarvis;
const contenido = document.getElementById('contenido');
const cartel = document.getElementById('guardado');

async function pedir(canal, ...datos) {
  const r = await jarvis.pedir(canal, ...datos);
  if (r && r.ok === false) throw new Error(r.error);
  return r ? r.dato : undefined;
}

let cfg = null;
const esJarvis = (n) => String(n || 'Jarvis').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'jarvis';
let INFO = { nombre: 'Jarvis', edicion: '' }; // qué edición es (Jarvis o Jarvis B)
function pintarMarca() {
  const marca = document.querySelector('.marca strong');
  if (marca) marca.textContent = 'Jarvis';
  const chip = document.querySelector('.marca .edicion');
  if (chip) { chip.hidden = !INFO.edicion; chip.textContent = INFO.edicion; chip.title = INFO.edicion ? 'Edición de prueba: usa sus propios datos (carpeta datos-B)' : ''; }
}
let rutinas = [];
let elegida = 0; // rutina abierta en el editor
let estadoPc = null; let relojEstadoPc = null; // Estado de la PC (Sistema)
const listas = { aprendido: [], salidas: [], programas: [], juegos: [], cast: [], entidades: [], microfonos: [], camaras: [] };
let whatsapp = { fase: 'apagado' };
let voces = { modelos: {}, voces: [], voz: {} }; // modelos de voz locales: qué hay instalado y qué se está bajando
let ia = {}; // estado de cada proveedor de inteligencia
let modelosOllama = [];
let correo = { gmail: {}, outlook: {} }; // estado de cada casilla
let codigoMicrosoft = null; // { codigo, url } mientras se espera que el usuario autorice en la página de Microsoft
let agenda = { grupos: 0, contactos: 0, lista: [] }; // lo que Jarvis leyó de WhatsApp: contactos y grupos
let registros = []; // historial de pedidos
let contextoPrueba = null; // lo último que devolvió "¿Qué vería ahora?"
const calGoogle = { lista: null, error: '', esperando: false };
const calAgenda = { lista: null, buscar: '' }; // lo que Jarvis tiene cargado de tu agenda (próximos días) // los calendarios de la cuenta de Google conectada
// Celular: estado (servidor, Tailscale, aparatos vinculados), el código para vincular y el último resultado de "Publicar".
const cel = { estado: null, codigo: null, resultado: null, cargando: false };
const detallesAbiertos = new Set(); // qué registros tienen el detalle desplegado (para no cerrarlos al repintar)

// ---------- Mini ayudante para armar la página ----------
function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const hijo of hijos.flat()) if (hijo !== null && hijo !== undefined && hijo !== false) el.append(hijo);
  return el;
}

// ---------- Guardado automático ----------
let relojCfg = null;
let relojRutinas = null;
// "Guardado" va chiquito en el menú. Cualquier otro mensaje (el resultado de un "Probar", un error)
// puede ser largo: va en un cartel al pie, que se va solo o con un click.
const cartelGrande = document.getElementById('cartel');
cartelGrande.addEventListener('click', () => { cartelGrande.hidden = true; });
function avisarGuardado(texto = 'Guardado') {
  if (texto === 'Guardado') {
    // [C22] Un aviso chico y consistente abajo a la derecha (y anunciado a lectores de pantalla).
    cartel.innerHTML = `${icono('tilde', 16)}<span>Cambios guardados</span>`;
    cartel.classList.add('visible');
    clearTimeout(avisarGuardado.reloj);
    avisarGuardado.reloj = setTimeout(() => { cartel.classList.remove('visible'); }, 1600);
    return;
  }
  cartelGrande.textContent = texto;
  cartelGrande.className = /^(no |error|falt)|no pude|no se pudo|no encontr|falló|no existe|inválid/i.test(texto) ? 'mal' : '';
  cartelGrande.hidden = false;
  clearTimeout(avisarGuardado.relojGrande);
  avisarGuardado.relojGrande = setTimeout(() => { cartelGrande.hidden = true; }, Math.max(4000, Math.min(20000, texto.length * 90)));
}
function guardar() {
  clearTimeout(relojCfg);
  relojCfg = setTimeout(async () => {
    try { await pedir('cfg:guardar', cfg); usarNombre(cfg.nombre); avisarGuardado(); } catch (e) { avisarGuardado(`No se pudo guardar: ${e.message}`); }
  }, 450);
}
function guardarRutinas() {
  clearTimeout(relojRutinas);
  relojRutinas = setTimeout(async () => {
    try { await pedir('rutinas:guardar', rutinas); avisarGuardado(); } catch (e) { avisarGuardado(`No se pudo guardar: ${e.message}`); }
  }, 450);
}

// ---------- Controles ----------
const texto = (obj, clave, alCambiar, extra = {}) => h('input', {
  type: 'text', value: obj[clave] ?? '', ...extra,
  oninput: (e) => { obj[clave] = e.target.value; alCambiar(); },
});
const numero = (obj, clave, alCambiar, extra = {}) => h('input', {
  type: 'number', value: obj[clave] ?? '', ...extra,
  oninput: (e) => { obj[clave] = e.target.value === '' ? '' : Number(e.target.value); alCambiar(); },
});
function selector(obj, clave, opciones, alCambiar, vacio = 'Elegir…') {
  const valores = opciones.map((o) => (typeof o === 'string' ? { valor: o, nombre: o } : o));
  const actual = obj[clave] ?? '';
  // Si el valor guardado ya no está en la lista (dispositivo desconectado), no lo perdemos.
  if (actual && !valores.some((o) => o.valor === actual)) valores.unshift({ valor: actual, nombre: `${actual} (no disponible ahora)` });
  return h('select', { onchange: (e) => { obj[clave] = e.target.value; alCambiar(); } },
    h('option', { value: '' }, vacio),
    valores.map((o) => h('option', { value: o.valor, selected: o.valor === actual }, o.nombre)));
}
// Interruptor (reemplaza a la casilla clásica). porDefecto: lo que vale si todavía no se guardó nada.
const casilla = (obj, clave, alCambiar, porDefecto = false) => h('label', { class: 'interruptor' },
  h('input', { type: 'checkbox', checked: obj[clave] === undefined ? porDefecto : !!obj[clave], onchange: (e) => { obj[clave] = e.target.checked; alCambiar(); } }),
  h('i'));
// Elegir una entre pocas opciones, todas a la vista (en lugar de una lista desplegable).
function segmentado(obj, clave, opciones, alCambiar, { formato, porDefecto } = {}) {
  const valores = opciones.map((o) => (Array.isArray(o) ? { valor: o[0], nombre: o[1] } : o));
  const actual = () => (obj[clave] === undefined || obj[clave] === '' ? porDefecto : obj[clave]);
  if (actual() !== undefined && !valores.some((o) => String(o.valor) === String(actual()))) valores.push({ valor: actual(), nombre: formato ? formato(actual()) : String(actual()) });
  const caja = h('div', { class: 'segmentado', role: 'radiogroup' });
  const pintarCaja = () => caja.replaceChildren(...valores.map((o) => h('button', {
    type: 'button', role: 'radio', class: String(o.valor) === String(actual()) ? 'on' : '', 'aria-checked': String(o.valor) === String(actual()),
    onclick: () => { obj[clave] = o.valor; alCambiar(); pintarCaja(); },
  }, o.nombre)));
  pintarCaja();
  return caja;
}
// Varias opciones que se prenden y apagan, como fichas (en lugar de una fila de casilleros). piezas: [clave, nombre, porDefecto]
function fichas(obj, piezas, alCambiar) {
  const caja = h('div', { class: 'fichas' });
  const pintarCaja = () => caja.replaceChildren(...piezas.map(([clave, nombre, porDefecto]) => {
    const prendida = obj[clave] === undefined ? !!porDefecto : !!obj[clave];
    return h('button', { type: 'button', class: `ficha ${prendida ? 'on' : ''}`, 'aria-pressed': String(prendida), onclick: () => { obj[clave] = !prendida; alCambiar(); pintarCaja(); } }, nombre);
  }));
  pintarCaja();
  return caja;
}
// Deslizador que muestra el valor elegido al lado.
function deslizador(obj, clave, { min, max, step = 1, formato = (v) => String(v), porDefecto }, alCambiar) {
  const valor = h('span', { class: 'valor' }, formato(obj[clave] ?? porDefecto));
  return [h('input', { type: 'range', min, max, step, value: obj[clave] ?? porDefecto, oninput: (e) => { obj[clave] = Number(e.target.value); valor.textContent = formato(obj[clave]); alCambiar(); } }), valor];
}
// Un tiempo como "número + unidad" (en lugar de una fila de botones con valores fijos). Se guarda en la unidad base (base: 's' o 'min').
const UNIDADES = { s: ['s', 1, 's'], min: ['min', 60, 'min'], h: ['horas', 3600, 'hora'], d: ['días', 86400, 'día'] }; // [nombre, segundos, nombre en singular]
function duracion(obj, clave, { base = 's', unidades = ['s', 'min'], min = 0, max = Infinity, porDefecto = 0 }, alCambiar) {
  const segDeBase = UNIDADES[base][1];
  const actual = () => { const v = obj[clave]; return v === undefined || v === '' || v === null || !Number.isFinite(Number(v)) ? porDefecto : Number(v); };
  // Arranca en la unidad más grande que lo muestra redondo (90 s se ve "90 s"; 300 s se ve "5 min").
  let unidad = [...unidades].reverse().find((u) => actual() > 0 && (actual() * segDeBase) % UNIDADES[u][1] === 0) || unidades[0];
  const aUnidad = (v) => +(v * segDeBase / UNIDADES[unidad][1]).toFixed(2);
  const numeroInput = h('input', { type: 'number', class: 'duracion-n', min: aUnidad(min), step: 'any', value: aUnidad(actual()), 'aria-label': 'Cantidad' });
  const guardarNumero = () => {
    const n = Number(numeroInput.value);
    if (numeroInput.value === '' || !Number.isFinite(n)) return;
    obj[clave] = Math.max(min, Math.min(max, Math.round(n * UNIDADES[unidad][1] / segDeBase)));
    alCambiar();
  };
  numeroInput.addEventListener('input', guardarNumero);
  numeroInput.addEventListener('change', () => { numeroInput.value = aUnidad(actual()); }); // al salir, muestra lo que realmente quedó (dentro de los límites)
  const unidadSelect = h('select', { class: 'duracion-u', 'aria-label': 'Unidad', onchange: (e) => { unidad = e.target.value; guardarNumero(); numeroInput.value = aUnidad(actual()); rotular(); } },
    unidades.map((u) => h('option', { value: u, selected: u === unidad }, UNIDADES[u][0])));
  // "1 hora", "2 horas": el nombre de la unidad sigue a la cantidad.
  const rotular = () => { const uno = Number(numeroInput.value) === 1; [...unidadSelect.options].forEach((o) => { o.textContent = UNIDADES[o.value][uno ? 2 : 0]; }); };
  numeroInput.addEventListener('input', rotular);
  rotular();
  return h('span', { class: 'duracion' }, numeroInput, unidadSelect);
}
const avanzado = (titulo, ...contenido) => h('details', { class: 'avanzado', open: Array.isArray(titulo) ? !!titulo[1] : false }, h('summary', {}, Array.isArray(titulo) ? titulo[0] : titulo), ...contenido);
const duracionCorta = (s) => (s < 60 ? `${s} s` : `${(s / 60) % 1 === 0 ? s / 60 : (s / 60).toFixed(1).replace('.', ',')} min`);
// Ayuda: la corta, a la vista; la larga, detrás de un ícono "i" que la muestra en un globo (sin llenar la pantalla de texto).
let idCampo = 0;
const LARGA = 80;
const globo = h('div', { class: 'globo', role: 'note', hidden: true });
document.body.append(globo);
let globoDe = null;
function cerrarGlobo() { if (globoDe) globoDe.setAttribute('aria-expanded', 'false'); globo.hidden = true; globoDe = null; }
function botonInfo(textoAyuda) {
  const b = h('button', { type: 'button', class: 'boton-info', 'aria-label': 'Más información', 'aria-expanded': 'false', html: icono('info', 15) });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (globoDe === b) { cerrarGlobo(); return; }
    cerrarGlobo();
    globo.textContent = textoAyuda; globo.hidden = false; globoDe = b; b.setAttribute('aria-expanded', 'true');
    const r = b.getBoundingClientRect(); const w = Math.min(380, window.innerWidth - 24);
    globo.style.width = `${w}px`;
    globo.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left - 12))}px`;
    const abajo = r.bottom + 8 + globo.offsetHeight < window.innerHeight;
    globo.style.top = `${abajo ? r.bottom + 8 : r.top - globo.offsetHeight - 8}px`;
  });
  return b;
}
document.addEventListener('click', (e) => { if (globoDe && !globo.contains(e.target)) cerrarGlobo(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && globoDe) { const b = globoDe; cerrarGlobo(); b.focus(); } });
document.getElementById('contenido').addEventListener('scroll', () => cerrarGlobo(), { passive: true });
function ayudaPlegable(texto) { return h('div', { class: 'ayuda' }, texto); }
// [E29] La etiqueta queda asociada al control (lectores de pantalla y click en la etiqueta).
const campo = (etiqueta, control, ayuda) => {
  const fila = h('div', { class: 'fila' }, control);
  const id = `c${++idCampo}`;
  const objetivo = fila.querySelector('input:not([type="hidden"]), select, textarea');
  const label = h('label', {}, etiqueta);
  if (objetivo) { if (!objetivo.id) objetivo.id = id; label.htmlFor = objetivo.id; }
  else { label.id = `${id}-l`; const grupo = fila.querySelector('[role="radiogroup"], .fichas, button'); if (grupo && !grupo.hasAttribute('aria-label')) grupo.setAttribute('aria-labelledby', label.id); }
  const larga = typeof ayuda === 'string' && ayuda.length > LARGA;
  const ayudaEl = ayuda && !larga ? ayudaPlegable(ayuda) : null;
  if (ayudaEl && objetivo) { ayudaEl.id = `${id}-a`; objetivo.setAttribute('aria-describedby', ayudaEl.id); }
  if (larga && objetivo) objetivo.setAttribute('aria-description', ayuda);
  return h('div', { class: 'campo' }, larga ? h('div', { class: 'campo-et' }, label, botonInfo(ayuda)) : label, fila, ayudaEl);
};
const boton = (nombre, alTocar, clase = '', deshabilitado = false) => h('button', { type: 'button', class: `boton ${clase}`, onclick: alTocar, disabled: !!deshabilitado }, nombre);
// [C19] Quitar: ícono de tacho con color de peligro, con nombre accesible.
const botonQuitar = (alTocar, que = '') => h('button', { type: 'button', class: 'boton icono-solo quitar', title: que ? `Quitar ${que}` : 'Quitar', 'aria-label': que ? `Quitar ${que}` : 'Quitar', html: icono('tacho', 16), onclick: alTocar });
const botonIcono = (nombreIcono, etiqueta, alTocar) => h('button', { type: 'button', class: 'boton icono-solo', title: etiqueta, 'aria-label': etiqueta, html: icono(nombreIcono, 16), onclick: alTocar });

// [F40][A7] Confirmación propia (no el cuadro del sistema), con foco en "Cancelar" para las acciones que borran.
function confirmar({ titulo, texto = '', si = 'Aceptar', peligro = false }) {
  return new Promise((listo) => {
    const d = h('dialog', { class: 'dialogo', 'aria-labelledby': 'dlg-t' },
      h('h2', { id: 'dlg-t' }, titulo), texto ? h('p', {}, texto) : null,
      h('div', { class: 'fila fin' },
        h('button', { type: 'button', class: 'boton', value: 'no', onclick: () => d.close('no') }, 'Cancelar'),
        h('button', { type: 'button', class: `boton ${peligro ? 'peligro-lleno' : 'principal'}`, onclick: () => d.close('si') }, si)));
    d.addEventListener('close', () => { listo(d.returnValue === 'si'); d.remove(); });
    document.body.append(d);
    d.showModal();
    d.querySelector('button[value="no"]').focus();
  });
}
const enlace = (nombre, url) => h('a', { onclick: () => pedir('abrir:enlace', url) }, nombre);

// Reproduce el audio PCM (16 bits, 24 kHz, mono) que devuelve "voz:probar" — mismo formato que usa el notch.
let audioPrueba = null;
let fuenteActual = null;
function detenerPrueba() {
  if (!fuenteActual) return;
  try { fuenteActual.stop(); } catch {}
  fuenteActual = null;
}
function reproducirPCM(bytes, hz, alTerminar) {
  detenerPrueba(); // si ya sonaba una voz anterior, la corta antes de arrancar la nueva
  audioPrueba = audioPrueba || new AudioContext();
  const muestras = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + (bytes.byteLength & ~1)));
  if (!muestras.length) throw new Error('La voz no generó audio.');
  const bufer = audioPrueba.createBuffer(1, muestras.length, hz || 22050);
  const canal = bufer.getChannelData(0);
  for (let i = 0; i < muestras.length; i++) canal[i] = muestras[i] / 32768;
  const fuente = audioPrueba.createBufferSource();
  fuente.buffer = bufer;
  fuente.connect(audioPrueba.destination);
  fuente.onended = () => { if (fuenteActual === fuente) { fuenteActual = null; alTerminar && alTerminar(); } };
  if (audioPrueba.state === 'suspended') audioPrueba.resume();
  fuente.start();
  fuenteActual = fuente;
}

// Tabla editable: una fila por elemento de la lista, con botón para quitar y para agregar.
function tabla(lista, columnas, alCambiar, { nuevo, vacio, accion, agregar = 'Agregar' } = {}) {
  const cuerpo = lista.map((item, i) => h('tr', {},
    columnas.map((c) => h('td', {}, c.control(item))),
    h('td', {}, accion ? accion(item) : null, ' ', botonQuitar(() => { lista.splice(i, 1); alCambiar(); pintar(); }))));
  return h('div', {},
    lista.length
      ? h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, columnas.map((c) => h('th', {}, c.titulo)), h('th', {}))), h('tbody', {}, cuerpo))
      : h('div', { class: 'vacio' }, vacio || 'Todavía no hay nada cargado.'),
    boton(agregar, () => { lista.push(nuevo ? nuevo() : {}); alCambiar(); pintar(); }, 'chico'));
}

// Un sonido de prueba, con un contexto de audio propio de esta ventana.
let contextoSonido = null;
// Un sonido para una nota o un evento: "Por defecto" (el de siempre), "Sin sonido" (avisa pero mudo) o uno de la lista, con el botón para escucharlo.
function selectorDeSonido(valor, alCambiar) {
  const opciones = [['', 'Por defecto'], ['ninguno', 'Sin sonido'], ...LISTA_DE_SONIDOS];
  const sel = h('select', { 'aria-label': 'Sonido del aviso', onchange: (e) => alCambiar(e.target.value) }, opciones.map(([v, n]) => h('option', { value: v, selected: v === (valor || '') }, n)));
  return h('span', { class: 'fila-sonido' }, sel, h('button', { type: 'button', class: 'boton chico', title: 'Escuchar', 'aria-label': 'Escuchar el sonido', onclick: () => probarSonido(sel.value || 'campanita') }, '▶'));
}
// Lista de avisos de un evento o de un calendario: cada uno dice cuánto antes, por dónde (Jarvis, WhatsApp o mail), a quién y con qué texto.
// lista: [{ antes (minutos), canal, para, asunto, texto, sonido }] — se edita en el lugar; alCambiar() guarda.
const CANALES_AVISO = [['jarvis', 'Aviso en Jarvis'], ['whatsapp', 'WhatsApp'], ['mail', 'Mail']];
const PLANTILLA_AYUDA = 'Podés usar {titulo}, {cuando} (en 10 min (15:30)), {hora}, {fecha}, {lugar} y {calendario}. Vacío = el texto de siempre.';
function editorDeAvisos(lista, alCambiar) {
  const caja = h('div', { class: 'avisos-ed' });
  const nombresWa = [...new Set((cfg.contactos || []).map((x) => String(x.nombre || '').split(',')[0].trim()).filter(Boolean))];
  const fila = (a, i) => {
    const cambiarCanal = (v) => { a.canal = v; if (v === 'jarvis') { delete a.para; delete a.asunto; } else delete a.sonido; alCambiar(); pintarCaja(); };
    return h('div', { class: 'aviso-fila' },
      h('div', { class: 'aviso-linea' },
        duracion(a, 'antes', { base: 'min', unidades: ['min', 'h', 'd'], min: 0, max: 30 * 1440, porDefecto: 10 }, alCambiar),
        h('span', { class: 'nota' }, 'antes · por'),
        h('select', { 'aria-label': 'Cómo avisar', onchange: (e) => cambiarCanal(e.target.value) }, CANALES_AVISO.map(([v, n]) => h('option', { value: v, selected: v === (a.canal || 'jarvis') }, n))),
        botonQuitar(() => { lista.splice(i, 1); alCambiar(); pintarCaja(); }, 'este aviso')),
      a.canal === 'whatsapp' ? h('input', { type: 'text', class: 'aviso-para', placeholder: 'A quién: vacío = a mí mismo, o un contacto, un grupo o un número', value: a.para || '', list: 'contactos-avisos', 'aria-label': 'A quién se lo mando por WhatsApp', oninput: (e) => { a.para = e.target.value; alCambiar(); } }) : null,
      a.canal === 'mail' ? [h('input', { type: 'text', class: 'aviso-para', placeholder: 'A quién: vacío = a mi Gmail, o una dirección de mail', value: a.para || '', 'aria-label': 'A quién se lo mando por mail', oninput: (e) => { a.para = e.target.value; alCambiar(); } }),
        h('input', { type: 'text', class: 'aviso-para', placeholder: 'Asunto (opcional)', value: a.asunto || '', 'aria-label': 'Asunto del mail', oninput: (e) => { a.asunto = e.target.value; alCambiar(); } })] : null,
      a.canal === 'jarvis' ? h('div', { class: 'aviso-linea' }, h('span', { class: 'nota' }, 'Sonido'), selectorDeSonido(a.sonido, (v) => { if (v) a.sonido = v; else delete a.sonido; alCambiar(); })) : null,
      h('textarea', { class: 'aviso-texto', rows: 2, placeholder: a.canal === 'jarvis' ? 'Texto del aviso (opcional)' : 'Mensaje (opcional). Ej.: Acordate de {titulo}, es {cuando}', 'aria-label': 'Texto del aviso', oninput: (e) => { if (e.target.value.trim()) a.texto = e.target.value; else delete a.texto; alCambiar(); } }, a.texto || ''));
  };
  const pintarCaja = () => caja.replaceChildren(
    h('datalist', { id: 'contactos-avisos' }, nombresWa.map((n) => h('option', { value: n }))),
    ...(lista.length ? lista.map(fila) : [h('p', { class: 'nota' }, 'Sin avisos: tocá "Agregar aviso".')]),
    h('div', { class: 'fila' }, boton('+ Agregar aviso', () => { lista.push({ antes: lista.length ? 60 : 10, canal: 'jarvis' }); alCambiar(); pintarCaja(); }, 'chico')),
    h('p', { class: 'nota' }, PLANTILLA_AYUDA));
  pintarCaja();
  return caja;
}
const PALETA_COLORES = ['#4F9DF7', '#56CCF2', '#6FCF97', '#27AE60', '#F2C94C', '#F2994A', '#EB5757', '#E0709A', '#BB6BD9', '#A0A7B4'];
// Elegir un color: unos cuantos a un toque, o cualquiera. valor '' = el del calendario.
function selectorDeColor(valor, alCambiar, { vacio = 'Del calendario' } = {}) {
  const caja = h('div', { class: 'colores', role: 'radiogroup', 'aria-label': 'Color' });
  const pintarCaja = () => caja.replaceChildren(
    h('button', { type: 'button', class: `color-op sin ${!valor ? 'on' : ''}`, title: vacio, 'aria-label': vacio, 'aria-checked': String(!valor), role: 'radio', onclick: () => { valor = ''; alCambiar(''); pintarCaja(); } }, 'A'),
    ...PALETA_COLORES.map((c) => h('button', { type: 'button', class: `color-op ${valor.toLowerCase() === c.toLowerCase() ? 'on' : ''}`, style: `--c:${c}`, title: c, 'aria-label': `Color ${c}`, role: 'radio', 'aria-checked': String(valor.toLowerCase() === c.toLowerCase()), onclick: () => { valor = c; alCambiar(c); pintarCaja(); } })),
    h('input', { type: 'color', class: 'color-libre', value: /^#[0-9a-f]{6}$/i.test(valor) ? valor : '#4f9df7', title: 'Otro color', 'aria-label': 'Otro color', onchange: (e) => { valor = e.target.value; alCambiar(valor); pintarCaja(); } }));
  pintarCaja();
  return caja;
}
function probarSonido(id) {
  if (!id || id === 'ninguno') return;
  try { contextoSonido = contextoSonido || new AudioContext(); tocar(contextoSonido, id); } catch {}
}

// ---------- Voz: juntar audios y entrenar una voz propia ----------
const vp = {
  lista: null, sel: '', proy: null, modo: 'grabar', idx: 0, grab: new Grabadora(), grabando: false, procesando: false, nivel: 0,
  trabajo: { activo: false }, libre: false, calidad: 'normal', armado: null, verTodas: false, solo: '', ocupado: '',
};
const duracionLinda = (s) => { s = Math.round(s || 0); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ''}`.trim() : `${s} s`; };
async function cargarVoces() {
  try { vp.lista = await pedir('voces:lista'); } catch { vp.lista = []; }
  if (seccion === 'voz' && !escribiendo()) pintar();
}
async function cargarVoz(id = vp.sel) {
  try { vp.proy = await pedir('voces:proyecto', id); } catch (e) { avisarGuardado(e.message); vp.proy = null; vp.sel = ''; }
  if (vp.proy) {
    vp.trabajo = vp.proy.trabajo || vp.trabajo;
    if (!vp.proy.guion[vp.idx] || vp.proy.guion[vp.idx].clip) vp.idx = siguienteSinGrabar(0);
  }
  if (seccion === 'voz' && !escribiendo()) pintar();
}
const siguienteSinGrabar = (desde) => {
  const g = (vp.proy && vp.proy.guion) || [];
  for (let i = desde; i < g.length; i++) if (!g[i].clip) return i;
  for (let i = 0; i < desde && i < g.length; i++) if (!g[i].clip) return i;
  return Math.min(desde, Math.max(0, g.length - 1));
};
async function abrirVoz(id) { vp.sel = id; vp.proy = null; vp.idx = 0; vp.armado = null; vp.verTodas = false; vp.solo = ''; pintar(); await cargarVoz(id); }

function barraDeNiveles(r) {
  const niveles = (vp.proy && vp.proy.niveles) || [];
  const max = niveles.length ? niveles[niveles.length - 1].minutos * 60 : 7200;
  const pct = Math.min(100, (r.segundos / max) * 100);
  return h('div', { class: 'vp-niveles' },
    h('div', { class: 'vp-barra', role: 'img', 'aria-label': `${duracionLinda(r.segundos)} de audio` }, h('i', { style: `width:${pct}%` }),
      ...niveles.map((n) => h('b', { class: r.segundos >= n.minutos * 60 ? 'ok' : '', style: `left:${(n.minutos * 60 / max) * 100}%`, title: `${n.nombre}: ${n.minutos} min / ${n.frases} frases` }))),
    h('div', { class: 'vp-hitos' }, ...niveles.map((n) => h('span', { class: r.segundos >= n.minutos * 60 ? 'ok' : '' }, `${r.segundos >= n.minutos * 60 ? '✓ ' : ''}${n.nombre} · ${n.frases} frases (${n.minutos} min)`))));
}

const PERSONALIDADES = [
  ['Argentino con lunfardo', 'Hablá como un porteño de barrio: voseo, lunfardo (che, boludo, quilombo, laburo, mango, pibe, bondi, re copado), tono canchero y con humor. De vez en cuando, cuando viene a cuento y de buena onda, soltá una puteada o un insulto cariñoso (boludo, pelotudo), sin pasarte ni insultar a terceros.'],
  ['Gallego', 'Hablá como un gallego de Galicia que habla castellano: tuteo (nada de voseo), tono tranquilo, irónico y algo socarrón, con modismos de allá (¿qué tal?, ¡carallo!, ho, pois, home, e logo, mira que, non). Escribí en castellano normal, sin imitar el acento con letras raras: la entonación la pone la voz.'],
  ['Español de España', 'Hablá como un español de la península: tuteo, "vale", "tío/tía", "guay", "flipar", "mola", "me da igual", y algún "joder" suelto cuando pega. Cercano y bromista.'],
  ['Neutro y formal', 'Hablá en un español neutro, correcto y amable, sin lunfardo ni groserías, claro y breve.'],
];
// Cómo habla Jarvis cuando usa esa voz (se suma a sus instrucciones). Vale para cualquier voz, propia o no.
function editorPersonalidad(vozId) {
  cfg.habla.personalidades = cfg.habla.personalidades || {};
  const area = h('textarea', { class: 'vp-personalidad', rows: 5, maxLength: 2000, placeholder: 'Ej.: Hablá como un porteño: lunfardo, humor, alguna puteada de vez en cuando…', 'aria-label': 'Personalidad de la voz',
    oninput: (e) => { if (e.target.value.trim()) cfg.habla.personalidades[vozId] = e.target.value; else delete cfg.habla.personalidades[vozId]; guardar(); } });
  area.value = cfg.habla.personalidades[vozId] || '';
  const poner = (t) => { area.value = t; area.dispatchEvent(new Event('input')); };
  return h('div', { class: 'vp-pers' },
    area,
    h('div', { class: 'fila' }, h('span', { class: 'ayuda' }, 'Ejemplos:'), ...PERSONALIDADES.map(([n, t]) => boton(n, () => poner(t), 'chico')), boton('Borrar', () => poner(''), 'chico')),
    h('p', { class: 'ayuda' }, 'Esto cambia qué dice Jarvis (vocabulario, modismos, humor, tono) cuando habla con esta voz. La tonada, en cambio, la da el audio con el que se entrenó la voz, no el texto. Las respuestas fijas (como "listo" o los avisos) no pasan por acá. Un modelo gratuito puede negarse a insultar o hacerlo a medias.'));
}

function vistaListaDeVoces() {
  const nueva = { nombre: '', espeak: 'es-419' };
  const crearBoton = boton('Crear', async () => {
    try { const r = await pedir('voces:crear', { nombre: nueva.nombre, espeak: nueva.espeak }); await cargarVoces(); await abrirVoz(r.id); } catch (e) { avisarGuardado(e.message); }
  }, 'principal');
  const importarBoton = boton('Importar una voz o un respaldo (zip)…', async () => {
    try {
      const r = await pedir('voces:importarPaquete');
      if (!r) return;
      voces = await pedir('modelos:estado'); cfg = await pedir('cfg:leer');
      avisarGuardado(r.tipo === 'voz' ? `Cargué la voz "${r.nombre}".${r.falta ? ` ${r.falta}` : ''}` : `Recuperé "${r.nombre}" con ${r.frases} frases.`);
      await cargarVoces();
    } catch (e) { avisarGuardado(`No pude importarlo: ${e.message}`); }
  }, 'chico');
  const filas = vp.lista.map((r) => h('div', { class: 'vp-voz' },
    h('div', { class: 'vp-voz-datos' },
      h('input', { type: 'text', class: 'vp-nombre', value: r.nombre, 'aria-label': 'Nombre de la voz', onchange: async (e) => { try { await pedir('voces:renombrar', { id: r.id, nombre: e.target.value }); await cargarVoces(); } catch (er) { avisarGuardado(er.message); e.target.value = r.nombre; } } }),
      h('span', { class: 'ayuda' }, `${r.clips} frases · ${duracionLinda(r.segundos)}${r.voz ? ' · voz cargada en Jarvis' : ''}`)),
    h('div', { class: 'fila' }, boton('Abrir', () => abrirVoz(r.id), 'chico'),
      botonQuitar(async () => {
        if (!(await confirmar({ titulo: `Borrar "${r.nombre}"`, texto: 'Se borran todas sus grabaciones y el set de entrenamiento (la voz ya cargada en Jarvis no se toca). Si las querés conservar, abrila y guardá antes un respaldo (zip).', si: 'Borrar', peligro: true }))) return;
        try { await pedir('voces:borrar', r.id); await cargarVoces(); } catch (e) { avisarGuardado(e.message); }
      }, 'esta voz'))));
  const propias = (voces.voces || []).filter((x) => String(x.id).startsWith('propia-'));
  const nombreLindo = (x) => String(x.nombre).replace(/ \(voz propia\)$/, '');
  return [
    h('h2', {}, 'Entrenar una voz nueva'),
    h('p', { class: 'ayuda' }, 'Cada voz tiene su nombre, sus grabaciones y su personalidad, y podés tener todas las que quieras. Juntás audios grabando leyendo un guion o subiendo audios (MP3, M4A, WAV, audios de WhatsApp) que te manden; Jarvis los corta en frases y arma el set, y el entrenamiento corre en la placa NVIDIA de esta PC con un script de un clic.'),
    h('div', { class: 'fila' }, texto(nueva, 'nombre', () => {}, { placeholder: 'Nombre (por ejemplo, el tuyo o el de quien grabe)' }), crearBoton),
    campo('Pronunciación base', segmentado(nueva, 'espeak', [['es-419', 'Latinoamérica / Argentina'], ['es', 'España']], () => {}, { porDefecto: 'es-419' }),
      'Con qué reglas de pronunciación se entrena: "Latinoamérica" sirve para voces rioplatenses, mexicanas, etc. (la zeta y la ce suenan como ese); "España" suena la zeta y la ce como zeta castellana (ceceo de distinción). Se decide al crear la voz y no se cambia después.'),
    h('h2', {}, 'Tus voces'),
    filas.length ? h('div', { class: 'vp-lista' }, filas) : h('p', { class: 'ayuda' }, 'Todavía no creaste ninguna. Los nombres se pueden cambiar tocándolos.'),
    h('div', { class: 'fila' }, importarBoton),
    h('p', { class: 'ayuda' }, 'Todo queda guardado en esta PC, en la carpeta "datos" de Jarvis (entrenar-voz y modelos-voz), y sobrevive a las actualizaciones. Para compartir una voz con un amigo o tener un respaldo, usá "Guardar la voz (zip)" y "Guardar respaldo de grabaciones (zip)": se abren acá con "Importar".'),
    propias.length ? h('h2', {}, 'Voces cargadas en Jarvis') : null,
    ...propias.map((x) => h('div', { class: 'vp-voz vp-voz-carga' },
      h('div', { class: 'vp-voz-datos' },
        h('input', { type: 'text', class: 'vp-nombre', value: nombreLindo(x), 'aria-label': 'Nombre de la voz cargada', onchange: async (e) => { try { await pedir('voces:renombrarVoz', { vid: x.id.replace(/^propia-/, ''), nombre: e.target.value }); voces = await pedir('modelos:estado'); pintar(); } catch (er) { avisarGuardado(er.message); e.target.value = nombreLindo(x); } } }),
        h('span', { class: 'ayuda' }, cfg.habla.voz === x.id ? 'Es la voz que usa Jarvis ahora.' : 'Elegila arriba, en "Voz de Jarvis", o tocá "Usar".')),
      h('div', { class: 'fila' },
        cfg.habla.voz === x.id ? null : boton('Usar', () => { cfg.habla.voz = x.id; guardar(); pintar(); }, 'chico'),
        boton('Guardar la voz (zip)', async () => { try { const r = await pedir('voces:exportarVoz', x.id.replace(/^propia-/, '')); if (r) avisarGuardado(`Guardé la voz en ${r.destino}. Mandale ese zip a quien quieras.`); } catch (e) { avisarGuardado(`No pude guardarla: ${e.message}`); } }, 'chico'),
        botonQuitar(async () => {
          if (!(await confirmar({ titulo: `Quitar la voz "${nombreLindo(x)}" de Jarvis`, texto: 'Se borra el modelo cargado y su personalidad. Las grabaciones y el set se conservan. Si querés poder recuperarla, guardá antes la voz en un zip.', si: 'Quitar', peligro: true }))) return;
          try { await pedir('voces:quitarVoz', x.id.replace(/^propia-/, '')); cfg = await pedir('cfg:leer'); voces = await pedir('modelos:estado'); pintar(); } catch (e) { avisarGuardado(e.message); }
        }, 'esta voz')),
      h('details', { class: 'vp-pers-caja' }, h('summary', {}, 'Personalidad de esta voz'), editorPersonalidad(x.id)))),
    h('h2', {}, '¿Cuántas frases hacen falta?'),
    h('div', { class: 'vp-tabla' }, ...[['Para probar', '120 frases', '~10 minutos', 'Suena parecido, con errores y pronunciación torpe.'], ['Recomendado', '350 frases', '~30 minutos', 'Se reconoce bien la voz y se entiende casi todo. Es lo que trae el guion de Jarvis (356).'], ['Muy bueno', '700 frases', '~1 hora', 'Natural, con buena entonación en frases nuevas.'], ['Excelente', '1.400 frases', '~2 horas', 'Lo mejor que da este método en una PC.']]
      .map(([a, b, c, d]) => h('div', { class: 'vp-fila' }, h('b', {}, a), h('span', {}, `${b} · ${c}`), h('span', { class: 'ayuda' }, d)))),
    h('p', { class: 'ayuda' }, 'No se entrena de cero: se parte de una voz en español ya entrenada y se "afina" con las frases, por eso alcanzan decenas de minutos. Más importante que la cantidad: audios limpios (sin ruido ni eco) y que el texto coincida con lo que se dijo. Usá solo tu propia voz o la de personas que lo autorizaron.'),
  ];
}

function vistaDeUnaVoz() {
  const p = vp.proy;
  if (!p) return [h('h1', {}, 'Voz'), h('p', { class: 'bajada' }, 'Abriendo la voz…')];
  const nombre = h('input', { type: 'text', value: p.nombre, 'aria-label': 'Nombre de la voz', class: 'vp-nombre', onchange: async (e) => { try { await pedir('voces:renombrar', { id: p.id, nombre: e.target.value }); await cargarVoz(); } catch (er) { avisarGuardado(er.message); } } });
  const modos = [['grabar', 'Grabar leyendo el guion'], ['subir', 'Subir audios'], ['pedir', 'Pedirle a otra persona']];
  return [
    h('div', { class: 'fila' }, boton('← Volver a Voz', () => { vp.sel = ''; vp.proy = null; cargarVoces(); }, 'chico')),
    h('h1', {}, nombre),
    h('p', { class: 'bajada' }, `${p.clips} frases · ${duracionLinda(p.segundos)} de audio${p.siguiente ? ` · te faltan ${duracionLinda(p.siguiente.falta)} para "${p.siguiente.nombre}"` : ' · ya pasaste el último nivel'}.`),
    h('p', { class: 'ayuda' }, `Pronunciación base: ${p.espeak === 'es' ? 'España' : 'Latinoamérica / Argentina'}.`),
    barraDeNiveles(p),
    h('h2', {}, 'Juntar audios'),
    segmentado(vp, 'modo', modos, () => { pintar(); }, { porDefecto: 'grabar' }),
    vp.modo === 'grabar' ? modoGrabar(p) : vp.modo === 'subir' ? modoSubir(p) : modoPedir(p),
    listaDeFrases(p),
    entrenar(p),
    guardadoYPersonalidad(p),
  ];
}

function guardadoYPersonalidad(p) {
  const vozId = p.voz ? `propia-${p.voz}` : '';
  return h('section', { class: 'vp-guardado' },
    h('h2', {}, 'Guardar y compartir'),
    h('p', { class: 'ayuda' }, `Las grabaciones (audio y texto) de esta voz quedan guardadas en esta PC, en: ${p.carpeta}. No se borran solas ni al actualizar Jarvis.`),
    h('div', { class: 'fila' },
      boton('Abrir la carpeta', () => pedir('voces:abrirCarpetaProyecto', p.id).catch((e) => avisarGuardado(e.message)), 'chico'),
      boton('Guardar respaldo de grabaciones (zip)', async () => { try { const r = await pedir('voces:exportarProyecto', p.id); if (r) avisarGuardado(`Respaldo guardado en ${r.destino} (${r.archivos} archivos).`); } catch (e) { avisarGuardado(`No pude guardarlo: ${e.message}`); } }, 'chico'),
      vozId ? boton('Guardar la voz entrenada (zip)', async () => { try { const r = await pedir('voces:exportarVoz', p.voz); if (r) avisarGuardado(`Guardé la voz en ${r.destino}. Con ese zip, otra persona la carga en su Jarvis con "Importar".`); } catch (e) { avisarGuardado(`No pude guardarla: ${e.message}`); } }, 'chico') : null),
    h('p', { class: 'ayuda' }, 'El zip de la voz trae solo el modelo y su personalidad (no tus grabaciones). El respaldo trae las grabaciones, para volver a entrenar o seguir juntando frases en otra PC.'),
    vozId ? [h('h2', {}, 'Personalidad de esta voz'), editorPersonalidad(vozId)] : h('p', { class: 'ayuda' }, 'Cuando cargues la voz entrenada vas a poder darle una personalidad (tonada escrita, modismos, humor).'));
}

function modoGrabar(p) {
  const g = p.guion[vp.idx] || { n: 0, texto: '', clip: 0 };
  const hechas = p.guion.filter((x) => x.clip).length;
  const accion = async () => {
    if (vp.procesando) return;
    try {
      if (!vp.grabando) {
        await vp.grab.iniciar({ microfono: (cfg.voz || {}).microfono || '', alNivel: (n) => { vp.nivel = n; const m = document.getElementById('vp-nivel'); if (m) m.style.width = `${Math.round(n * 100)}%`; } });
        vp.grabando = true; pintar();
      } else {
        vp.grabando = false; vp.procesando = true; pintar();
        const r = await vp.grab.detener();
        if (r.segundos < 0.8 || r.pico < 0.01) { vp.procesando = false; avisarGuardado('No se oyó nada: revisá el micrófono y probá de nuevo.'); pintar(); return; }
        try {
          await pedir('voces:grabar', { id: p.id, wav: r.wav, guion: g.n, texto: g.texto });
          await cargarVoz();
          vp.idx = siguienteSinGrabar(g.n + 1);
        } catch (e) { avisarGuardado(e.message); }
        vp.procesando = false; pintar();
      }
    } catch (e) { vp.grabando = false; vp.procesando = false; await vp.grab.cancelar().catch(() => {}); avisarGuardado(e.message); pintar(); }
  };
  vp.accionGrabar = accion;
  const ir = (i) => { if (vp.grabando || vp.procesando) return; vp.idx = Math.max(0, Math.min(p.guion.length - 1, i)); pintar(); };
  return h('div', { class: 'vp-grabar' },
    h('p', { class: 'ayuda' }, `Frase ${g.n + 1} de ${p.guion.length} · grabadas ${hechas}${g.clip ? ' · esta ya está grabada (si grabás de nuevo, se reemplaza)' : ''}`),
    h('blockquote', { class: 'vp-frase' }, g.texto),
    h('div', { class: 'vp-nivel' }, h('i', { id: 'vp-nivel', style: 'width:0%' })),
    h('div', { class: 'fila' },
      h('button', { type: 'button', class: `boton ${vp.grabando ? 'peligro-lleno' : 'principal'}`, disabled: vp.procesando, onclick: accion }, vp.procesando ? 'Procesando…' : vp.grabando ? '■ Parar y guardar' : '● Grabar esta frase'),
      boton('← Anterior', () => ir(vp.idx - 1), 'chico'), boton('Saltear →', () => ir(vp.idx + 1), 'chico'),
      boton('Ir a la próxima sin grabar', () => ir(siguienteSinGrabar(vp.idx + 1)), 'chico')),
    h('p', { class: 'ayuda' }, 'Atajo: barra espaciadora para grabar y parar. Leé con tu voz natural, a unos 20 cm del micrófono, en un lugar silencioso, y esperá un segundito antes de parar. La primera vez Jarvis baja una herramienta de audio (ffmpeg, ~80 MB, gratis).'));
}

function modoSubir(p) {
  const t = vp.trabajo || {};
  const ocupado = !!t.activo;
  return h('div', { class: 'vp-subir' },
    h('p', {}, 'Elegí los audios (MP3, M4A, WAV, OGG, audios de WhatsApp…). Jarvis los corta en frases por los silencios y pasa cada una a texto en esta PC, sin mandar nada a internet.'),
    campo('Qué hay en los audios', segmentado(vp, 'libre', [[false, 'Leen el guion de Jarvis'], [true, 'Hablan con libertad']], () => pintar(), { porDefecto: false }),
      'Si leen el guion, a cada frase se le pone el texto exacto del guion (sin errores de transcripción). Si hablan con libertad, el texto sale de lo que Jarvis entiende y hay que revisarlo.'),
    h('div', { class: 'fila' }, h('button', { type: 'button', class: 'boton principal', disabled: ocupado, onclick: async () => {
      try {
        const rutas = await pedir('voces:elegirAudios');
        if (!rutas.length) return;
        vp.trabajo = { activo: true, fase: 'Empezando…', hecho: 0, total: rutas.length };
        pintar();
        await pedir('voces:importar', { id: p.id, rutas, modo: vp.libre ? 'libre' : 'auto' });
      } catch (e) { vp.trabajo = { activo: false, error: e.message }; pintar(); }
    } }, ocupado ? 'Procesando…' : 'Elegir audios…')),
    t.fase ? h('div', { class: `vp-trabajo ${t.error ? 'mal' : ''}` },
      h('b', {}, t.fase), t.total ? h('span', {}, ` · ${t.hecho || 0} de ${t.total} archivos`) : null,
      t.mensaje ? h('p', {}, t.mensaje) : null, t.error ? h('p', { class: 'nota mal' }, t.error) : null) : null,
    h('p', { class: 'ayuda' }, 'Hace falta el modelo de escucha de Jarvis (Asistente → Básico → Escuchar). Un audio de 5 minutos tarda uno o dos minutos en procesarse.'));
}

function modoPedir(p) {
  return h('div', { class: 'vp-pedir' },
    h('p', {}, 'Para que otra persona te preste su voz: mandale el guion, pedile que grabe y que te devuelva los audios, y después los subís en "Subir audios".'),
    h('ol', {},
      h('li', {}, 'Copiá el guion (o guardalo como archivo) y mandáselo. Trae las indicaciones para grabar y las frases en partes de unos 5 minutos.'),
      h('li', {}, 'Que grabe cada parte como un audio (con el celular alcanza) en un lugar silencioso y te los mande: MP3, M4A, WAV o audios de WhatsApp.'),
      h('li', {}, 'Guardá los audios en esta PC, andá a "Subir audios" y elegí todos juntos (dejá marcado "Leen el guion de Jarvis").')),
    h('div', { class: 'fila' },
      boton('Copiar el guion', async () => { try { await navigator.clipboard.writeText(await pedir('voces:guionTexto', p.nombre)); avisarGuardado('Guion copiado: pegalo en un mensaje o un mail.'); } catch (e) { avisarGuardado(`No pude copiarlo: ${e.message}`); } }, 'principal'),
      boton('Guardar el guion como archivo', async () => { try { await pedir('voces:guardarGuion', p.id); avisarGuardado('Guardé "guion para enviar.txt" y abrí su carpeta.'); } catch (e) { avisarGuardado(e.message); } }, 'chico')),
    h('p', { class: 'ayuda' }, 'Importante: usá la voz de otra persona solo con su permiso, y que sepa para qué la vas a usar.'));
}

function listaDeFrases(p) {
  const filas = p.clipsLista.slice().sort((a, b) => b.id - a.id).filter((c) => (vp.solo === 'revisar' ? c.revisar : true));
  const visibles = vp.verTodas ? filas : filas.slice(0, 40);
  const revisar = p.clipsLista.filter((c) => c.revisar).length;
  return h('details', { class: 'vp-frases', open: vp.frasesAbierto, ontoggle: (e) => { vp.frasesAbierto = e.target.open; } },
    h('summary', {}, `Frases grabadas (${p.clips})${revisar ? ` · ${revisar} para revisar` : ''}`),
    revisar ? h('div', { class: 'fila' }, segmentado(vp, 'solo', [['', 'Todas'], ['revisar', 'Solo las que hay que revisar']], () => pintar(), { porDefecto: '' })) : null,
    !filas.length ? h('p', { class: 'ayuda' }, 'Todavía no hay frases.') : null,
    ...visibles.map((c) => {
      const caja = h('div', { class: 'vp-clip' });
      const entrada = h('input', { type: 'text', value: c.texto, 'aria-label': 'Texto de la frase', onchange: async (e) => { try { await pedir('voces:clip:texto', { id: p.id, clip: c.id, texto: e.target.value }); await cargarVoz(); } catch (er) { avisarGuardado(er.message); } } });
      return h('div', { class: 'vp-clip-fila' },
        h('div', { class: 'fila' }, boton('▶', async () => { try { const url = await pedir('voces:clip:vista', { id: p.id, clip: c.id }); caja.replaceChildren(h('audio', { controls: true, autoplay: true, src: url })); } catch (er) { avisarGuardado(er.message); } }, 'chico'),
          entrada, h('span', { class: 'ayuda' }, `${c.segundos.toFixed(1).replace('.', ',')} s`), c.revisar ? h('span', { class: 'vp-chip' }, 'revisar') : null,
          botonQuitar(async () => { try { await pedir('voces:clip:quitar', { id: p.id, clip: c.id }); await cargarVoz(); } catch (er) { avisarGuardado(er.message); } }, 'esta frase')),
        caja);
    }),
    filas.length > 40 && !vp.verTodas ? boton(`Ver las ${filas.length}`, () => { vp.verTodas = true; pintar(); }, 'chico') : null);
}

function entrenar(p) {
  const calidades = [['rapido', 'Rápido (600 épocas)'], ['normal', 'Normal (1200)'], ['completo', 'Completo (2000)']];
  const v = (voces.voces || []).find((x) => x.id === `propia-${p.voz || ''}`);
  return h('section', { class: 'vp-entrenar' },
    h('h2', {}, 'Entrenar'),
    h('p', { class: 'ayuda' }, 'Cuando tengas las frases, armá el set: Jarvis deja una carpeta con los audios, la lista de textos y un script. Después abrís entrenar.bat con doble clic y el entrenamiento corre en tu placa de video (hace falta WSL/Ubuntu, una sola vez: el archivo LEEME.txt lo explica).'),
    campo('Cuánto entrenar', segmentado(vp, 'calidad', calidades, () => {}, { porDefecto: 'normal' }), 'Más épocas = voz más fina pero más horas. Para empezar, "Normal" y dejarlo de noche.'),
    h('div', { class: 'fila' },
      h('button', { type: 'button', class: 'boton principal', disabled: p.clips < 20, onclick: async () => {
        try { vp.armado = await pedir('voces:armar', p.id, { calidad: vp.calidad }); await cargarVoz(); } catch (e) { avisarGuardado(e.message); }
      } }, 'Armar el set de entrenamiento'),
      p.armado ? boton('Abrir la carpeta', () => pedir('voces:abrirCarpeta', p.id).catch((e) => avisarGuardado(e.message)), 'chico') : null),
    p.clips < 20 ? h('p', { class: 'ayuda' }, 'Hacen falta al menos 20 frases buenas para armar el set.') : null,
    vp.armado ? h('div', { class: 'vp-trabajo' }, h('b', {}, `Set listo: ${vp.armado.frases} frases, ${vp.armado.minutos} minutos.`),
      h('p', {}, `Quedó en la carpeta del proyecto. Abrí entrenar.bat (doble clic) y esperá; entrena ${vp.armado.epocas} épocas.`),
      ...vp.armado.advertencias.map((a) => h('p', { class: 'nota mal' }, a))) : null,
    h('h3', {}, 'Cuando termine'),
    h('p', { class: 'ayuda' }, 'El script deja voz.onnx y voz.onnx.json en la carpeta "resultado". Cargala acá y aparece en la lista de voces de arriba.'),
    h('div', { class: 'fila' },
      boton(v ? 'Cargar de nuevo la voz entrenada' : 'Cargar la voz entrenada', async () => {
        try {
          const r = await pedir('voces:cargarVoz', p.id);
          if (!r) return;
          voces = await pedir('modelos:estado');
          avisarGuardado(r.falta ? `Cargada. ${r.falta}` : `Cargué la voz "${r.nombre}".`);
          await cargarVoz();
        } catch (e) { avisarGuardado(`No pude cargarla: ${e.message}`); }
      }, p.resultado ? 'principal' : ''),
      v && cfg.habla.voz !== v.id ? boton('Usar esta voz en Jarvis', () => { cfg.habla.voz = v.id; guardar(); pintar(); avisarGuardado('Listo, Jarvis habla con esa voz.'); }, 'principal') : null),
    v ? h('p', { class: 'ayuda' }, `Voz cargada: ${v.nombre}${cfg.habla.voz === v.id ? ' (la que usa Jarvis ahora)' : ''}.`) : null);
}

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || seccion !== 'voz' || !vp.sel || vp.modo !== 'grabar' || escribiendo() || e.target.tagName === 'BUTTON' || !vp.accionGrabar) return;
  e.preventDefault(); vp.accionGrabar();
});
jarvis.escuchar('voces-trabajo', (t) => {
  vp.trabajo = t;
  if (seccion !== 'voz' || !vp.sel) return;
  if (t.activo === false) cargarVoz(); else if (!escribiendo()) pintar();
});

let notasVozLista = null; // { carpeta, notas } (se pide al entrar a Notas de voz)
const notaVozGrabando = { activa: false, desde: 0 };
// ---------- Descargas (yt-dlp) ----------
let descargasEstado = null;
const descargasUI = { enlace: '', actualizando: '', bajando: false };
async function cargarDescargas() {
  try { descargasEstado = await pedir('descargas:estado'); } catch (e) { descargasEstado = descargasEstado || { activa: null, enCola: [], historial: [], carpeta: '', ytdlp: null, version: null }; }
  if (seccion === 'descargas' && !escribiendo()) pintar();
}
async function cargarNotasVoz() {
  try { notasVozLista = await pedir('notasvoz:lista'); } catch { notasVozLista = { carpeta: '', notas: [] }; }
  if (seccion === 'notasvoz' && !escribiendo()) pintar();
}
let estadoConexion = null; // lo último que contó el motor de conexión
// ---------- Avisos: modos por fuente ----------
const MODOS_AVISO = ['nada', 'elegidos', 'todo'];
let omitidas = null; // lo que llegó y no avisó por no estar elegido (se pide al entrar a Notificaciones)
let calNombres = null; // los calendarios que Jarvis conoce
async function cargarAvisos() {
  omitidas = await pedir('avisos:omitidas').catch(() => []);
  const conocidos = await pedir('calendario:conocidos').catch(() => []);
  calNombres = (conocidos || []).map((c) => (typeof c === 'string' ? c : c.nombre)).filter(Boolean);
  if (seccion === 'notificaciones' && !escribiendo()) pintar();
}
const enlaceInterno = (nombre, hoja) => h('a', { href: `#${hoja}`, onclick: (e) => { e.preventDefault(); irA(hoja); } }, nombre);
// Una frase que dice qué avisa hoy cada fuente (la usan la pantalla de Notificaciones y las líneas de WhatsApp, Mail y Calendario).
function resumenDeAvisos(id) {
  const n = cfg.notificaciones || {};
  const o = n[id] || {};
  const modo = MODOS_AVISO.includes(o.modo) ? o.modo : 'todo';
  const cuantos = (k, uno, varios) => (k === 1 ? `1 ${uno}` : `${k} ${varios}`);
  if (id === 'whatsapp') {
    const el = (o.elegidos || []).length; const siempre = (cfg.contactos || []).filter((c) => c && c.avisar === 'siempre').length; const sil = (o.silenciados || []).length;
    if (modo === 'nada') return 'No te avisa de ningún chat.';
    if (modo === 'elegidos') return el + siempre ? `Te avisa solo de ${cuantos(el + siempre, 'chat elegido', 'chats elegidos')}.` : 'Hoy no te avisa de ningún chat: sumá a quienes querés que te avisen.';
    return `Te avisa de todos los chats${o.grupos === false ? ', menos los grupos' : ' y grupos'}${sil ? `, menos ${cuantos(sil, 'silenciado', 'silenciados')}` : ''}.`;
  }
  if (id === 'mail') {
    const el = (o.elegidos || []).length; const sil = (o.silenciados || []).length;
    const raras = Object.entries(o.cuentas || {}).filter(([, v]) => MODOS_AVISO.includes(v) && v !== modo).length;
    const base = modo === 'nada' ? 'No te avisa de ningún mail' : modo === 'elegidos' ? (el ? `Te avisa solo de ${cuantos(el, 'remitente elegido', 'remitentes elegidos')}` : 'Hoy no te avisa de ningún mail: sumá a quienes querés que te avisen') : `Te avisa de todos los mails${sil ? `, menos ${cuantos(sil, 'silenciado', 'silenciados')}` : ''}`;
    return `${base}${raras ? `; ${cuantos(raras, 'cuenta se porta', 'cuentas se portan')} distinto` : ''}.`;
  }
  if (id === 'calendario') return modo === 'nada' ? 'No hay alertas de eventos en Jarvis.' : modo === 'elegidos' ? 'Avisa solo de los calendarios marcados y de los eventos con avisos propios.' : 'Avisa de todos los eventos, con los avisos de siempre o los propios.';
  if (id === 'nota') return modo === 'nada' ? 'Los recordatorios no suenan ni avisan.' : 'Cada recordatorio con hora suena y deja los ojos llamando hasta que lo saques.';
  return '';
}
// Una línea al principio de WhatsApp, Mail y Calendario que dice qué avisa y lleva a Notificaciones (ahí se decide todo).
const lineaDeAvisos = (id) => {
  const modo = ((cfg.notificaciones || {})[id] || {}).modo || 'todo';
  return h('div', { class: `linea-avisos modo-${modo}` }, h('span', { class: 'linea-icono', html: icono('novedades', 16) }),
    h('div', {}, h('b', {}, 'Avisos: '), resumenDeAvisos(id)),
    boton('Configurar →', () => irA('notificaciones'), 'chico'));
};
// Una lista de etiquetas que se escribe con Enter y se quita con la ×; propone nombres conocidos.
function etiquetasEditor(lista, alCambiar, { placeholder = '', sugerencias = [], id = '' } = {}) {
  const caja = h('div', { class: 'etiquetas' });
  const idLista = `sug-${id || Math.random().toString(36).slice(2, 8)}`;
  const entrada = h('input', { type: 'text', list: idLista, placeholder, 'aria-label': placeholder, autocomplete: 'off' });
  const opciones = h('datalist', { id: idLista }, sugerencias.slice(0, 300).map((x) => h('option', { value: x })));
  const pintarCaja = () => caja.replaceChildren(...lista.map((t, i) => h('span', { class: 'etiqueta' }, h('span', {}, t),
    h('button', { type: 'button', title: `Quitar ${t}`, 'aria-label': `Quitar ${t}`, onclick: () => { lista.splice(i, 1); alCambiar(); pintarCaja(); } }, '×'))), entrada, opciones);
  const sumar = () => {
    const nuevos = entrada.value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    entrada.value = '';
    let cambio = false;
    for (const t of nuevos) if (!lista.some((x) => String(x).toLowerCase() === t.toLowerCase())) { lista.push(t); cambio = true; }
    if (cambio) { alCambiar(); pintarCaja(); entrada.focus(); }
  };
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); sumar(); }
    else if (e.key === 'Backspace' && !entrada.value && lista.length) { lista.pop(); alCambiar(); pintarCaja(); entrada.focus(); }
  });
  entrada.addEventListener('change', sumar);
  pintarCaja();
  return caja;
}

// ---------- Vincular el control de una tele (Google TV) ----------
const vinculo = { nombre: '', mensaje: '', error: false, ocupado: false, vinculadas: [] };
function botonVinculo(t) {
  const nombre = t.cast || t.nombre;
  if (!nombre) return null;
  const hecho = vinculo.vinculadas.includes(nombre);
  const ficha = (listas.cast || []).find((d) => d.nombre === nombre);
  if (ficha && /nest ?hub|nest ?mini|home ?mini|home ?max|nest ?audio|google ?home|chromecast ?audio/i.test(ficha.modelo || '')) {
    return h('span', { class: 'nota' }, 'Parlante/pantalla Nest: no se vincula, anda por Cast');
  }
  return boton(hecho ? 'Control vinculado ✓' : 'Vincular control', async () => {
    Object.assign(vinculo, { nombre, mensaje: 'Pidiendo el código a la tele…', error: false, ocupado: true }); pintar();
    try { await pedir('tele:vincular', nombre); vinculo.mensaje = 'Mirá la tele: muestra un código. Escribilo acá.'; } catch (e) { vinculo.mensaje = e.message; vinculo.error = true; }
    vinculo.ocupado = false; pintar();
  }, 'chico');
}
function cajaDeCodigo() {
  const campoCodigo = h('input', { type: 'text', maxlength: 6, placeholder: 'Código de la tele', style: 'width:140px;text-transform:uppercase' });
  return h('div', { class: 'fila', style: 'margin:8px 0' },
    h('span', { class: `nota ${vinculo.error ? 'mal' : ''}` }, `${vinculo.nombre}: ${vinculo.mensaje}`),
    vinculo.error ? null : campoCodigo,
    vinculo.error ? null : boton('Confirmar', async () => {
      vinculo.ocupado = true; vinculo.mensaje = 'Probando el código…'; pintar();
      try {
        await pedir('tele:codigo', { nombre: vinculo.nombre, codigo: campoCodigo.value });
        vinculo.vinculadas = await pedir('tele:vinculadas').catch(() => vinculo.vinculadas);
        vinculo.nombre = '';
      } catch (e) { vinculo.mensaje = e.message; vinculo.error = true; }
      vinculo.ocupado = false; pintar();
    }, 'chico'),
    boton('Cerrar', () => { vinculo.nombre = ''; pintar(); }, 'chico'));
}

// ---------- Secciones ----------
const megas = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} GB` : `${m} MB`);

// Una línea con el estado de un modelo local: instalado, bajando (con porcentaje) o falta (con botón).
function estadoDeModelo(id) {
  const m = (voces.modelos || {})[id];
  if (!m) return h('span', { class: 'nota cargando' }, 'Consultando…');
  if (m.bajando) {
    const pct = m.bajando.total ? Math.floor((m.bajando.hecho / m.bajando.total) * 100) : 0;
    return h('span', { class: 'nota aviso' }, `${m.bajando.fase === 'descomprimiendo' ? 'Preparando' : 'Bajando'}… ${pct}%`);
  }
  if (m.instalado) return h('span', { class: 'nota bien' }, 'Instalado en esta PC');
  return [
    h('span', { class: `nota ${m.error ? 'mal' : ''}` }, m.error || `Falta bajarlo (${megas(m.mb)}, una sola vez)`),
    // Lo de escuchar se baja todo junto (detector + modelo + la voz elegida); una voz suelta, sola.
    boton(m.error ? 'Reintentar' : 'Bajar', () => pedir('modelos:bajar', id.startsWith('voz-') ? id : 'esenciales').catch((e) => avisarGuardado(e.message)), 'chico'),
  ];
}

// Para sumar a la lista a alguien (o un grupo) de la agenda de WhatsApp: se escribe parte del nombre y
// se elige de los que aparecen. Los resultados se actualizan sin repintar toda la página, así no se
// pierde el foco mientras se escribe.
function buscadorDeAgenda() {
  if (!agenda.lista.length) return null;
  const plano = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hallados = h('div', { class: 'hallados' });
  const yaEsta = (x) => cfg.contactos.some((c) => c.jid === x.jid);
  const buscar = (valor) => {
    const q = plano(valor).trim();
    const lista = q ? agenda.lista.filter((x) => plano(x.nombre).includes(q) && !yaEsta(x)).slice(0, 10) : [];
    hallados.replaceChildren(...(q && !lista.length ? [h('span', { class: 'nota' }, 'Nadie con ese nombre en tu agenda.')] : lista.map((x) => boton(
      [`+ ${x.nombre}`, h('small', {}, x.grupo ? 'grupo' : x.telefono ? `+${x.telefono}` : '')],
      () => { cfg.contactos.push({ nombre: x.nombre, jid: x.jid, avisar: '' }); guardar(); pintar(); }, 'chico'))));
  };
  return campo('Agregar de mi agenda', h('input', { type: 'text', placeholder: 'Escribí parte del nombre de un contacto o grupo…', oninput: (e) => buscar(e.target.value) }), hallados);
}

const compo = { lista: null, act: null, info: {}, tam: null }; // Componentes y Actualizaciones
// Avisos del sistema para el Inicio: versión nueva de Jarvis, yt-dlp viejo, componentes con error.
let avisosSistema = [];
const avisoHaciendo = new Set();
async function cargarAvisosSistema() {
  avisosSistema = await pedir('avisos:sistema').catch(() => avisosSistema);
  pintarPuntosDelMenu();
  if (seccion === 'resumen' && !escribiendo()) pintar();
}
function bloqueAvisosSistema() {
  if (!avisosSistema.length) return null;
  const ICONO = { aviso: 'novedades', mal: 'info', info: 'actualizar' };
  return h('section', { class: 'avisos-sistema', 'aria-label': 'Avisos' }, avisosSistema.map((a) => h('div', { class: `aviso-sistema ${a.tono}` },
    h('span', { class: 'as-icono', html: icono(ICONO[a.tono] || 'info', 18) }),
    h('div', { class: 'as-texto' }, h('b', {}, a.titulo), a.texto ? h('span', {}, a.texto) : null),
    h('div', { class: 'as-acciones' },
      a.accion ? boton(avisoHaciendo.has(a.id) ? 'Un momento…' : a.accion.texto, async (ev) => {
        if (avisoHaciendo.has(a.id)) return;
        avisoHaciendo.add(a.id); ev.target.disabled = true; pintar();
        try { const r = await pedir(a.accion.canal, ...(a.accion.args || [])); if (typeof r === 'string') avisarGuardado(r); } catch (e) { avisarGuardado(e.message); }
        avisoHaciendo.delete(a.id);
        await cargarAvisosSistema(); if (seccion === 'resumen') pintar();
      }, 'principal chico') : null,
      a.hoja ? boton('Ver', () => irA(a.hoja), 'chico') : null))));
}
let relojCompo = null;
async function cargarComponentes() {
  clearTimeout(relojCompo);
  compo.lista = await pedir('componentes:estado').catch(() => compo.lista || []);
  compo.info = await pedir('app:info').catch(() => compo.info);
  if (seccion === 'componentes' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) pintar();
  if (seccion === 'componentes' && compo.lista.some((c) => c.bajando)) relojCompo = setTimeout(cargarComponentes, 1500);
}
const formatoBytes = (b) => {
  if (!b) return '0 MB';
  const coma = (n) => n.toFixed(n >= 100 ? 0 : 1).replace('.', ',');
  return b >= 1e9 ? `${coma(b / 1e9)} GB` : b >= 1e6 ? `${coma(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
};
async function cargarActualizacion() {
  compo.act = await pedir('actualizacion:estado').catch(() => compo.act);
  compo.info = await pedir('app:info').catch(() => compo.info);
  compo.tam = null;
  if (seccion === 'actualizaciones') pintar();
  compo.tam = await pedir('app:tamanos').catch(() => null);
  if (seccion === 'actualizaciones' && !escribiendo()) pintar();
}
let almacen = null; // lo que ocupa Jarvis en el disco (se calcula al entrar a Almacenamiento)
let confirmando = '';
let relojConfirmar = null;
async function cargarAlmacen() {
  almacen = await pedir('almacenamiento:resumen').catch((e) => ({ error: e.message }));
  if (seccion === 'almacenamiento') pintar();
}
// ---------- Los clips guardados (todos, de a páginas) ----------
let clipsGuardados = null; // [{ archivo, nombre, juego, bytes, fecha }] o null mientras carga
const miniaturas = new Map(); // archivo -> data URL del cuadro del video
let clipsEnviando = '';
// Lista completa, de a páginas: filtro por carpeta (juego o programa) y orden por fecha, tamaño o nombre.
const clipsUI = { carpeta: '', orden: 'fecha', asc: false, pagina: 0, favoritos: false };
const POR_PAGINA = 30;
function clipsVisibles() {
  const todos = clipsGuardados || [];
  const lista = (clipsUI.carpeta ? todos.filter((x) => (x.juego || '') === clipsUI.carpeta) : todos.slice()).filter((x) => !clipsUI.favoritos || x.favorito);
  const k = clipsUI.orden;
  lista.sort((a, b) => {
    const d = k === 'nombre' ? a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }) : k === 'tamano' ? a.bytes - b.bytes : a.fecha - b.fecha;
    return clipsUI.asc ? d : -d;
  });
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  clipsUI.pagina = Math.min(clipsUI.pagina, paginas - 1);
  return { total: lista.length, paginas, pagina: lista.slice(clipsUI.pagina * POR_PAGINA, (clipsUI.pagina + 1) * POR_PAGINA) };
}
// Las miniaturas se piden solo para los clips de la página que se ve.
function pedirMiniaturas(lista) {
  for (const x of lista) {
    if (miniaturas.has(x.archivo)) continue;
    miniaturas.set(x.archivo, '');
    pedir('clips:miniatura', x.archivo).then((url) => {
      miniaturas.set(x.archivo, url || '');
      const img = [...document.querySelectorAll('img.miniatura')].find((i) => i.dataset.archivo === x.archivo);
      if (img && url) { img.src = url; img.hidden = false; img.nextElementSibling && (img.nextElementSibling.hidden = true); }
    }).catch(() => {});
  }
}
async function cargarClips() {
  clipsGuardados = await pedir('clips:lista').catch(() => []);
  if (clipsUI.carpeta && !clipsGuardados.some((x) => (x.juego || '') === clipsUI.carpeta)) clipsUI.carpeta = '';
  if (seccion === 'clips' || seccion === 'clips-ajustes' || seccion === 'almacenamiento' || (seccion === 'resumen' && !escribiendo())) pintar();
}
// ---------- Editor de clips: renombrar y recortar ----------
let clipEditor = null; // { archivo, base, ext, nodo } mientras se edita un clip (la pantalla no se repinta para no cortar el video)
const tiempoTexto = (s) => { s = Math.max(0, Number(s) || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
function abrirEditor(x) {
  const m = /^(.*?)(\.[^.]+)?$/.exec(x.nombre);
  clipEditor = { archivo: x.archivo, base: m[1], ext: m[2] || '.mp4', nodo: null, favorito: !!x.favorito };
  pintar(true);
}
function cerrarEditor() { if (document.body.classList.contains('con-cine')) { document.body.classList.remove('con-cine'); pedir('ventana:pantallaCompleta', false).catch(() => {}); } clipEditor = null; pintar(true); cargarClips(); }
// Un pedazo copiado en el editor: se puede pegar en el mismo clip o en otro.
let portapapelesClip = null;
function editorDeClip() {
  const ed = clipEditor;
  if (ed.nodo) return ed.nodo;
  const c = cfg.clips;
  const T = { dur: 0, desde: 0, hasta: 0 };
  const MIN = 0.5;
  // La edición: los pedazos (de este clip u otros, en orden, repetibles), formato, textos/recuadros y fundido.
  // La línea de tiempo y las manijas muestran el pedazo elegido (y el video, su clip).
  const nuevaEdicion = () => ({ tramos: [], sel: 0, formato: 'original', encuadre: 0.5, capas: [], fundido: false });
  const E = nuevaEdicion();
  let fuente = ed.archivo;
  const mensaje = h('div', { class: 'nota', style: 'min-height:20px' });
  const decir = (texto, clase = '') => { mensaje.className = `nota ${clase}`; mensaje.textContent = texto; };
  const video = h('video', { class: 'editor-video', controls: true, preload: 'metadata', controlsList: 'nofullscreen', disablePictureInPicture: true });
  const nombre = h('input', { type: 'text', value: ed.base, 'aria-label': 'Nombre del clip', style: 'flex:1;min-width:160px' });
  const nDesde = h('input', { type: 'number', min: 0, step: 0.1, class: 'seg', 'aria-label': 'Inicio (segundos)' });
  const nHasta = h('input', { type: 'number', min: 0, step: 0.1, class: 'seg', 'aria-label': 'Fin (segundos)' });
  const resumen = h('div', { class: 'resumen-recorte' });
  // Una sola línea de tiempo, como en los editores de video: cuadritos del video, la parte que se queda resaltada entre dos manijas
  // (inicio y fin) y el cabezal que sigue al video. Se arrastran las manijas, se toca o arrastra la línea para moverse en el video.
  const cuadros = h('div', { class: 'lt-cuadros' });
  const sombraIzq = h('div', { class: 'lt-sombra' });
  const sombraDer = h('div', { class: 'lt-sombra' });
  const marco = h('div', { class: 'lt-marco' });
  const manijaDesde = h('div', { class: 'lt-manija inicio', role: 'slider', tabindex: 0, 'aria-label': 'Dónde empieza el clip', title: 'Inicio: arrastralo (o usá las flechas)' }, h('i'));
  const manijaHasta = h('div', { class: 'lt-manija fin', role: 'slider', tabindex: 0, 'aria-label': 'Dónde termina el clip', title: 'Fin: arrastralo (o usá las flechas)' }, h('i'));
  const cabezal = h('div', { class: 'lt-cabezal' });
  const pista = h('div', { class: 'lt-pista' }, cuadros, sombraIzq, sombraDer, marco, cabezal, manijaDesde, manijaHasta);
  const marcas = h('div', { class: 'lt-marcas' });
  const linea = h('div', { class: 'lt' }, pista, marcas);
  const pct = (t) => `${T.dur ? Math.max(0, Math.min(100, (t / T.dur) * 100)) : 0}%`;
  let refrescar = () => {
    T.desde = Math.max(0, Math.min(T.desde, T.hasta - MIN)); T.hasta = Math.min(T.dur, Math.max(T.hasta, T.desde + MIN));
    if (document.activeElement !== nDesde) nDesde.value = T.desde.toFixed(1);
    if (document.activeElement !== nHasta) nHasta.value = T.hasta.toFixed(1);
    const largo = T.hasta - T.desde;
    resumen.textContent = !T.dur ? '' : E.tramos.length > 1 ? `Pedazo ${E.sel + 1} de ${E.tramos.length}: ${tiempoTexto(T.desde)} → ${tiempoTexto(T.hasta)} · el clip editado dura ${tiempoTexto(largoTotal())}` : `Se queda con ${tiempoTexto(largo)} de ${tiempoTexto(T.dur)} (${tiempoTexto(T.desde)} → ${tiempoTexto(T.hasta)})`;
    manijaDesde.style.left = pct(T.desde); manijaHasta.style.left = pct(T.hasta);
    manijaDesde.setAttribute('aria-valuenow', T.desde.toFixed(1)); manijaHasta.setAttribute('aria-valuenow', T.hasta.toFixed(1));
    sombraIzq.style.left = '0'; sombraIzq.style.width = pct(T.desde);
    sombraDer.style.left = pct(T.hasta); sombraDer.style.right = '0';
    marco.style.left = pct(T.desde); marco.style.width = `${T.dur ? (largo / T.dur) * 100 : 100}%`;
    const tr = E.tramos[E.sel];
    if (tr && tr.fuente === fuente && T.dur) { tr.desde = T.desde; tr.hasta = T.hasta; }
    pintarTiras();
  };
  const moverCabezal = () => { cabezal.style.left = pct(video.currentTime || 0); };
  const tiempoEn = (x) => { const r = pista.getBoundingClientRect(); return T.dur && r.width ? Math.max(0, Math.min(T.dur, ((x - r.left) / r.width) * T.dur)) : 0; };
  // Arrastrar: una manija o la línea entera (esa mueve el video).
  const arrastrar = (el, alMover) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !T.dur) return;
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch {}
      el.classList.add('agarrado');
      alMover(tiempoEn(e.clientX));
      const mover = (ev) => alMover(tiempoEn(ev.clientX));
      const soltar = () => { el.classList.remove('agarrado'); el.removeEventListener('pointermove', mover); el.removeEventListener('pointerup', soltar); el.removeEventListener('pointercancel', soltar); };
      el.addEventListener('pointermove', mover); el.addEventListener('pointerup', soltar); el.addEventListener('pointercancel', soltar);
    });
  };
  const irA = (t) => { video.currentTime = Math.max(0, Math.min(T.dur || 0, t)); moverCabezal(); };
  arrastrar(manijaDesde, (t) => { T.desde = Math.min(t, T.hasta - MIN); refrescar(); irA(T.desde); });
  arrastrar(manijaHasta, (t) => { T.hasta = Math.max(t, T.desde + MIN); refrescar(); irA(Math.max(T.desde, T.hasta - 0.05)); });
  arrastrar(pista, (t) => irA(t));
  const conFlechas = (manija, quien) => manija.addEventListener('keydown', (e) => {
    const paso = e.shiftKey ? 1 : 0.1;
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -paso : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? paso : 0;
    if (!d) return;
    e.preventDefault();
    if (quien === 'desde') { T.desde = Math.max(0, Math.min(T.desde + d, T.hasta - MIN)); refrescar(); irA(T.desde); } else { T.hasta = Math.min(T.dur, Math.max(T.hasta + d, T.desde + MIN)); refrescar(); irA(Math.max(T.desde, T.hasta - 0.05)); }
  });
  conFlechas(manijaDesde, 'desde'); conFlechas(manijaHasta, 'hasta');
  // Cuadritos del video y marcas de tiempo (se arman al conocer la duración; si algo falla, la línea sirve igual).
  let oculto = null;
  // Antes de reemplazar o renombrar el archivo hay que soltarlo: Windows no deja tocar un video que se está reproduciendo.
  const soltarVideos = async () => {
    try { video.pause(); } catch {}
    video.removeAttribute('src'); video.load();
    if (oculto) { oculto.removeAttribute('src'); oculto.load(); }
    await new Promise((r) => setTimeout(r, 350));
  };
  const armarLinea = (url, dur) => {
    marcas.replaceChildren(...[0, 0.25, 0.5, 0.75, 1].map((f) => h('span', { style: `left:${f * 100}%` }, tiempoTexto(dur * f).replace(/\.\d$/, ''))));
    cuadros.replaceChildren();
    const N = 12;
    oculto = h('video', { muted: true, preload: 'auto', src: url });
    const lienzos = Array.from({ length: N }, () => { const c = h('canvas', { width: 96, height: 54 }); cuadros.append(c); return c; });
    let i = 0;
    const siguiente = () => {
      if (i >= N || !pista.isConnected) { oculto.removeAttribute('src'); oculto.load(); return; }
      oculto.currentTime = Math.min(dur - 0.05, (dur * (i + 0.5)) / N);
    };
    oculto.addEventListener('seeked', () => {
      try { lienzos[i].getContext('2d').drawImage(oculto, 0, 0, 96, 54); } catch {}
      i++; siguiente();
    });
    oculto.addEventListener('loadeddata', siguiente, { once: true });
    oculto.addEventListener('error', () => {});
  };
  let vistaUrl = '';
  const usarUrl = (url, conservar) => new Promise((ok) => {
    vistaUrl = url;
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      if (!dur) { decir('No pude leer la duración de este video: usá "Abrir en el reproductor" (en ⋯) para verlo.', 'mal'); ok(); return; }
      const antes = { ...T };
      T.dur = dur;
      [nDesde, nHasta].forEach((n) => { n.max = dur; });
      if (!E.tramos.length) E.tramos = [{ fuente, desde: 0, hasta: dur, velocidad: 1, mudo: false }];
      const tr = E.tramos[E.sel];
      if (tr && tr.fuente === fuente) { T.desde = Math.min(tr.desde, dur - MIN); T.hasta = Math.min(tr.hasta, dur); }
      else if (conservar && antes.dur) { T.desde = Math.min(antes.desde, dur - MIN); T.hasta = Math.min(antes.hasta, dur); } else { T.desde = 0; T.hasta = dur; }
      refrescar(); moverCabezal(); armarLinea(url, dur); pintarCapas(); ok();
    }, { once: true });
  });
  // Si el visor no puede con el formato (por ejemplo los clips HEVC de la app de NVIDIA), se arma una vista previa liviana:
  // se ve y se recorta igual; el recorte se hace sobre el original, sin perder calidad.
  let probóVista = false;
  const cargar = async (conservar) => { probóVista = false; await usarUrl(await pedir('clips:vista', fuente), conservar); };
  // Mostrar otro clip en el visor (un pedazo que viene de otro clip).
  const cambiarFuente = async (f) => { if (f === fuente && video.getAttribute('src')) return; fuente = f; T.dur = 0; await cargar(true); };
  const usarVistaPrevia = async (motivo) => {
    if (probóVista) return;
    probóVista = true;
    progreso('vista', 0, motivo);
    try { await usarUrl(await pedir('clips:vistaPrevia', fuente), true); decir('Estás viendo una vista previa más liviana: al guardar, el recorte sale del original, con su calidad.', ''); }
    catch (er) { decir(`No pude preparar la vista previa: ${er.message}`, 'mal'); }
    barra.hidden = true;
  };
  ed.forzarVista = () => { probóVista = false; usarVistaPrevia('Preparo una vista previa que el visor de Jarvis pueda mostrar…'); };
  const NO_LEE = 'Este clip tiene un formato que el visor de Jarvis no lee (pasa con los HEVC de la app de NVIDIA). Preparo una vista previa…';
  video.addEventListener('error', () => {
    if (!video.getAttribute('src')) return;
    if (probóVista) { decir('Este video no se puede reproducir acá. Probá con "Abrir en el reproductor" (en ⋯).', 'mal'); return; }
    usarVistaPrevia(NO_LEE);
  });
  // Lee la duración pero no la imagen (sin decodificador para ese formato): también va la vista previa.
  video.addEventListener('loadeddata', () => { if (!probóVista && video.videoWidth === 0 && video.getAttribute('src')) usarVistaPrevia(NO_LEE); });
  // "Ver cómo queda": pedazo por pedazo (cambiando de clip si hace falta), cada uno con su velocidad y sonido.
  let viendo = null; // { i } mientras se reproduce el montaje
  let saltando = false;
  const reproducirPedazo = async (i) => {
    const tr = E.tramos[i];
    if (!tr) return;
    saltando = true;
    viendo = { i };
    if (tr.fuente !== fuente) await cambiarFuente(tr.fuente);
    video.currentTime = tr.desde;
    video.playbackRate = tr.velocidad; video.muted = !!tr.mudo;
    saltando = false;
    await video.play().catch(() => {});
  };
  const terminarDeVer = async () => {
    const v = viendo; viendo = null;
    video.pause(); video.playbackRate = 1; video.muted = false;
    const tr = E.tramos[E.sel];
    if (v && tr && tr.fuente !== fuente) { await cambiarFuente(tr.fuente); }
  };
  const vigilarMontaje = () => {
    if (!viendo || saltando) return;
    const tr = E.tramos[viendo.i];
    if (!tr || video.currentTime >= tr.hasta - 0.04) { if (viendo.i + 1 < E.tramos.length) reproducirPedazo(viendo.i + 1); else terminarDeVer(); }
  };
  const bucle = () => { if (!viendo) return; vigilarMontaje(); moverCabezal(); pintarCapas(); requestAnimationFrame(bucle); };
  video.addEventListener('play', () => { if (viendo) requestAnimationFrame(bucle); });
  video.addEventListener('timeupdate', () => { moverCabezal(); vigilarMontaje(); pintarCapas(); });
  video.addEventListener('seeked', () => { moverCabezal(); pintarCapas(); });
  video.addEventListener('pause', () => { if (viendo && !saltando && !video.ended) { viendo = null; video.playbackRate = 1; video.muted = false; } });
  nDesde.addEventListener('input', () => { if (nDesde.value === '') return; T.desde = Number(nDesde.value); refrescar(); });
  nHasta.addEventListener('input', () => { if (nHasta.value === '') return; T.hasta = Number(nHasta.value); refrescar(); });
  nDesde.addEventListener('change', () => { refrescar(); nDesde.value = T.desde.toFixed(1); irA(T.desde); });
  nHasta.addEventListener('change', () => { refrescar(); nHasta.value = T.hasta.toFixed(1); irA(Math.max(T.desde, T.hasta - 0.05)); });
  // Barra de progreso (vista previa, convertir, comprimir) dentro del mensaje.
  const barra = h('div', { class: 'progreso fino', hidden: true }, h('i'));
  const progreso = (tipo, p, texto) => { barra.hidden = false; barra.firstChild.style.width = `${p}%`; if (texto) decir(texto); else if (p != null) decir(`${TAREAS_CLIP[tipo] || 'Trabajando'}… ${p} %`); };
  ed.progreso = (d) => { if (d.archivo !== ed.archivo) return; if (d.fin) { barra.hidden = true; return; } progreso(d.tipo, d.porcentaje); };
  const editado = () => E.tramos.length > 1 || E.tramos.some((x) => x.velocidad !== 1 || x.mudo || x.fuente !== ed.archivo) || E.formato !== 'original' || E.capas.length > 0 || E.fundido;
  const recortado = () => (T.dur && (T.desde > 0.05 || T.hasta < T.dur - 0.05)) || editado();
  const todos = [];
  const ocupado = (si) => { todos.forEach((x) => { x.disabled = si; }); if (!si) estadoGuardar(); };
  const acciones = (nombreBoton, clase, hacer) => { const b = boton(nombreBoton, async () => { ocupado(true); try { await hacer(b); } catch (er) { decir(er.message, 'mal'); barra.hidden = true; } ocupado(false); }, clase); todos.push(b); return b; };
  const aVer = acciones('▶ Ver cómo queda', 'chico', async () => { if (E.tramos.length) await reproducirPedazo(0); });
  const aCortar = h('button', { type: 'button', class: 'boton chico', title: 'Partir el pedazo donde está el video (tecla S)', onclick: () => cortarAca() }, '✂ Cortar acá');
  const acaDesde = boton('Acá', () => { T.desde = Math.min(video.currentTime, T.hasta - MIN); refrescar(); }, 'chico');
  const acaHasta = boton('Acá', () => { T.hasta = Math.max(video.currentTime, T.desde + MIN); refrescar(); }, 'chico');
  // Guardar = el recorte queda en lugar del original (con "Deshacer" un rato). La otra opción, en la flechita: guardar una copia.
  const guardarRecorte = async () => {
    decir('Recortando…');
    await soltarVideos();
    let r;
    const edicion = await edicionFinal();
    try { r = await pedir('clips:recortar', { archivo: ed.archivo, ...rangoParaGuardar(), reemplazar: true, edicion }); } catch (er) { await cargar(true).catch(() => {}); throw er; }
    const antes = ed.archivo;
    ed.archivo = r.archivo; ed.base = r.archivo.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''); nombre.value = ed.base;
    T.dur = 0; Object.assign(E, nuevaEdicion()); deshechos.length = 0; capaSel = -1; fuente = ed.archivo; pintarEdicion(); await cargar(false);
    decir('Guardado: el clip quedó recortado.', 'bien'); cargarClips();
    avisarConAccion('Guardé el recorte en lugar del original.', 'Deshacer', async () => {
      await soltarVideos();
      const d = await pedir('clips:deshacerRecorte', r.deshacer);
      if (clipEditor === ed) { ed.archivo = d.archivo || antes; fuente = ed.archivo; Object.assign(E, nuevaEdicion()); pintarEdicion(); ed.base = ed.archivo.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''); nombre.value = ed.base; T.dur = 0; await cargar(false); decir('Volvió a como estaba.', 'bien'); }
      cargarClips(); return d.texto;
    }, r.plazo);
  };
  const guardarCopia = async () => {
    decir('Recortando…');
    const r = await pedir('clips:recortar', { archivo: ed.archivo, ...rangoParaGuardar(), edicion: await edicionFinal() });
    const n = r.archivo.split(/[\\/]/).pop();
    decir(`Listo: guardé "${n}" (el original sigue igual).`, 'bien'); cargarClips();
    avisarConAccion(`Guardé la copia "${n}".`, 'Abrirla', () => { abrirEditor({ archivo: r.archivo, nombre: n }); return ''; }, 8000);
  };
  const guardarB = acciones('Guardar', 'principal', guardarRecorte);
  const guardarCaja = botonDividido(guardarB, [
    { texto: 'Guardar una copia', detalle: 'El recorte queda como clip nuevo y el original sigue igual', hacer: () => guardarB.disabled || ocuparY(guardarCopia) },
  ], 'Más formas de guardar');
  const ocuparY = async (fn) => { ocupado(true); try { await fn(); } catch (er) { decir(er.message, 'mal'); barra.hidden = true; } ocupado(false); };
  const estadoGuardar = () => { const r = recortado(); guardarB.disabled = !r; guardarCaja.querySelector('.dividido-flecha').disabled = !r; guardarB.title = r ? 'Reemplaza el clip por el recorte (podés deshacerlo)' : 'Elegí un recorte con las manijas para guardar'; };
  const refrescarViejo = refrescar;
  refrescar = () => { refrescarViejo(); estadoGuardar(); enviar.textContent = recortado() ? 'Enviar el recorte' : 'Enviar'; };
  const destino = h('input', { type: 'text', value: c.enviarA || '', placeholder: 'Contacto o grupo', list: 'contactos-clips', 'aria-label': 'A quién se lo mando por WhatsApp', style: 'width:170px', oninput: (e) => { c.enviarA = e.target.value; guardar(); } });
  const enviar = acciones('Enviar', 'principal', async () => {
    if (!String(c.enviarA || '').trim()) { destino.focus(); throw new Error('Escribí a quién se lo mando.'); }
    if (recortado()) { decir('Recortando y enviando…'); decir(await pedir('clips:enviarRecorte', { archivo: ed.archivo, ...rangoParaGuardar(), contacto: c.enviarA, edicion: await edicionFinal() }), 'bien'); }
    else { decir('Enviando…'); decir(await pedir('clips:enviar', { archivo: ed.archivo, contacto: c.enviarA }), 'bien'); }
  });
  // El nombre se guarda solo al apretar Enter o al salir del campo.
  const renombrar = async () => {
    const nuevo = nombre.value.trim();
    if (!nuevo || nuevo === ed.base) { nombre.value = ed.base; return; }
    const t = video.currentTime;
    ocupado(true);
    await soltarVideos();
    try {
      const r = await pedir('clips:renombrar', { archivo: ed.archivo, nombre: nuevo });
      E.tramos.forEach((x) => { if (x.fuente === ed.archivo) x.fuente = r; });
      if (fuente === ed.archivo) fuente = r;
      ed.archivo = r; ed.base = r.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''); nombre.value = ed.base;
      avisarGuardado('Guardado');
    } catch (er) { decir(er.message, 'mal'); nombre.value = ed.base; }
    await (vistaUrl && probóVista ? usarUrl(await pedir('clips:vistaPrevia', fuente), true) : cargar(true)).catch(() => {});
    video.currentTime = t; cargarClips(); ocupado(false);
  };
  nombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nombre.blur(); } if (e.key === 'Escape') { nombre.value = ed.base; nombre.blur(); } });
  nombre.addEventListener('blur', renombrar);
  // ---- Panel "Edición": pedazos (cortar, copiar/pegar, mover, de otros clips), velocidad, sonido, formato, textos y recuadros ----
  var marcasTramos = h('div', { class: 'lt-quitar lt-tramos' });
  pista.append(marcasTramos);
  const mascara = h('div', { class: 'mascara-formato', hidden: true }, h('i', { class: 'mf-izq' }), h('i', { class: 'mf-marco' }), h('i', { class: 'mf-der' }));
  // El rectángulo del video que queda (sobre el video tal como se ve, object-fit: contain), en píxeles de la pantalla.
  const marcoVisible = () => {
    if (!video.videoWidth) return null;
    const caja = video.getBoundingClientRect(); const vr = video.videoWidth / video.videoHeight; const cr = caja.width / caja.height;
    const ancho = vr > cr ? caja.width : caja.height * vr; const alto = vr > cr ? caja.width / vr : caja.height;
    const proporcion = E.formato === 'vertical' ? 9 / 16 : E.formato === 'cuadrado' ? 1 : ancho / alto;
    const anchoMarco = Math.min(ancho, alto * proporcion);
    return { x: (caja.width - ancho) / 2 + (ancho - anchoMarco) * E.encuadre, y: (caja.height - alto) / 2, w: anchoMarco, h: alto };
  };
  const pintarMascara = () => {
    const m = marcoVisible();
    if (E.formato === 'original' || !m) { mascara.hidden = true; return; }
    mascara.hidden = false;
    mascara.style.setProperty('--x', `${m.x}px`); mascara.style.setProperty('--w', `${m.w}px`);
    mascara.style.setProperty('--top', `${m.y}px`); mascara.style.setProperty('--h', `${m.h}px`);
  };
  // Tiempo en el clip editado (lo que va a durar): sirve para los textos y recuadros.
  const durDe = (x) => (x.hasta - x.desde) / x.velocidad;
  function largoTotal() { return E.tramos.reduce((t, x) => t + durDe(x), 0); }
  const inicioDe = (i) => E.tramos.slice(0, i).reduce((t, x) => t + durDe(x), 0);
  const tSalida = () => {
    const i = viendo ? viendo.i : E.sel; const x = E.tramos[i];
    if (!x) return 0;
    return inicioDe(i) + Math.max(0, Math.min(durDe(x), (video.currentTime - x.desde) / x.velocidad));
  };
  const rangoParaGuardar = () => (editado() ? { desde: 0, hasta: Math.max(0.5, largoTotal()) } : { desde: T.desde, hasta: T.hasta });
  // Textos y recuadros: se ven y se acomodan arriba del video; al guardar se dibujan del tamaño justo del clip.
  const COLORES_CAPA = ['#ffffff', '#ffd60a', '#ff3b30', '#34c759', '#0a84ff', '#000000'];
  var capasCaja = h('div', { class: 'capas-video' });
  let capaSel = -1;
  let arrastrandoCapa = false;
  // Cómo se ve una capa arriba del video (posición y tamaño relativos al cuadro que queda).
  const estiloCapa = (c, m, el) => {
    if (c.tipo === 'texto') Object.assign(el.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, fontSize: `${c.tam * m.h}px`, color: c.color, background: c.fondo ? (c.color === '#000000' ? '#ffffffd9' : '#000000b3') : 'transparent' });
    else Object.assign(el.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%`, background: c.relleno ? c.color : 'transparent', border: c.relleno ? '0' : `${Math.max(2, 0.006 * m.h)}px solid ${c.color}` });
  };
  function elegirCapa(k) { capaSel = k; pintarCapas(); pintarEdicion(); }
  function pintarCapas() {
    if (!capasCaja || arrastrandoCapa) return; // mientras se arrastra no se redibuja (si no, se pierde el arrastre)
    const m = marcoVisible();
    if (!m || !E.capas.length) { capasCaja.replaceChildren(); return; }
    Object.assign(capasCaja.style, { left: `${m.x}px`, top: `${m.y}px`, width: `${m.w}px`, height: `${m.h}px` });
    const t = tSalida();
    capasCaja.replaceChildren(...E.capas.map((c, k) => {
      const visible = t >= c.desde - 0.05 && t <= c.hasta + 0.05;
      if (!visible && k !== capaSel) return null;
      const el = h('div', { class: `capa capa-${c.tipo === 'texto' ? 'texto' : 'cuadro'}${c.fondo && c.tipo === 'texto' ? ' con-fondo' : ''}${k === capaSel ? ' elegida' : ''}${visible ? '' : ' fuera'}`, title: visible ? 'Arrastrá para moverlo' : 'No se ve en este momento del clip' },
        c.tipo === 'texto' ? (c.texto || 'Texto') : null,
        k === capaSel ? h('i', { class: 'capa-esquina', title: c.tipo === 'texto' ? 'Agrandar o achicar' : 'Cambiar el tamaño' }) : null);
      estiloCapa(c, m, el);
      el.addEventListener('dblclick', (e) => { e.stopPropagation(); if (c.tipo === 'texto') { elegirCapa(k); setTimeout(() => { const i = panelEdicion.querySelector('.capa-editor input[type="text"]'); if (i) { panelEdicion.open = true; i.focus(); i.select(); } }, 30); } });
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        const esquina = e.target.classList.contains('capa-esquina');
        if (capaSel !== k) { capaSel = k; capasCaja.querySelectorAll('.capa').forEach((x) => x.classList.remove('elegida')); el.classList.add('elegida'); }
        const x0 = e.clientX; const y0 = e.clientY; const antes = { ...c };
        arrastrandoCapa = true; guardarPaso();
        try { el.setPointerCapture(e.pointerId); } catch {}
        const mover = (ev) => {
          const dx = (ev.clientX - x0) / m.w; const dy = (ev.clientY - y0) / m.h;
          if (esquina && c.tipo === 'texto') c.tam = Math.max(0.025, Math.min(0.3, antes.tam * (1 + (dx + dy) * 2)));
          else if (esquina) { c.w = Math.max(0.03, Math.min(1 - c.x, antes.w + dx)); c.h = Math.max(0.03, Math.min(1 - c.y, antes.h + dy)); }
          else if (c.tipo === 'texto') { c.x = Math.max(0.02, Math.min(0.98, antes.x + dx)); c.y = Math.max(0.03, Math.min(0.97, antes.y + dy)); }
          else { c.x = Math.max(0, Math.min(1 - c.w, antes.x + dx)); c.y = Math.max(0, Math.min(1 - c.h, antes.y + dy)); }
          estiloCapa(c, m, el);
        };
        const soltar = () => {
          el.removeEventListener('pointermove', mover); el.removeEventListener('pointerup', soltar); el.removeEventListener('pointercancel', soltar);
          arrastrandoCapa = false;
          if (c.x === antes.x && c.y === antes.y && c.w === antes.w && c.h === antes.h && c.tam === antes.tam) deshechos.pop(); // fue solo un clic
          pintarCapas(); pintarEdicion();
        };
        el.addEventListener('pointermove', mover); el.addEventListener('pointerup', soltar); el.addEventListener('pointercancel', soltar);
      });
      return el;
    }).filter(Boolean));
  }
  // Clic en el video, afuera de las capas: se suelta la elegida.
  video.addEventListener('pointerdown', () => { if (capaSel !== -1) { capaSel = -1; pintarCapas(); pintarEdicion(); } });
  // Deshacer lo editado (Ctrl+Z): pedazos, velocidad, formato, textos y recuadros.
  const deshechos = [];
  const foto = () => JSON.stringify({ tramos: E.tramos, sel: E.sel, formato: E.formato, encuadre: E.encuadre, capas: E.capas, fundido: E.fundido });
  function guardarPaso() { const f = foto(); if (deshechos[deshechos.length - 1] !== f) deshechos.push(f); if (deshechos.length > 60) deshechos.shift(); }
  async function deshacerEdicion() {
    const f = deshechos.pop();
    if (!f) { decir('No hay nada para deshacer.'); return; }
    Object.assign(E, JSON.parse(f));
    capaSel = Math.min(capaSel, E.capas.length - 1);
    const x = E.tramos[E.sel];
    if (x && x.fuente !== fuente) await cambiarFuente(x.fuente);
    if (x) { T.desde = x.desde; T.hasta = x.hasta; }
    refrescar(); pintarEdicion();
  }
  // Las manijas también se deshacen: se guarda cómo estaba al empezar a arrastrar.
  linea.addEventListener('pointerdown', () => guardarPaso(), true);
  // Dibujar cada capa en un PNG transparente del tamaño del video que sale (lo mismo que se ve acá).
  const dibujarCapa = (c, W, H) => {
    const lienzo = document.createElement('canvas'); lienzo.width = W; lienzo.height = H;
    const g = lienzo.getContext('2d');
    if (c.tipo === 'texto') {
      const tam = Math.round(c.tam * H);
      g.font = `800 ${tam}px "Segoe UI", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const lineas = String(c.texto || 'Texto').split('\n');
      const alto = tam * 1.18; const x = c.x * W; const y0 = c.y * H - ((lineas.length - 1) * alto) / 2;
      if (c.fondo) {
        const ancho = Math.max(...lineas.map((l) => g.measureText(l).width));
        const pad = tam * 0.35;
        g.fillStyle = c.color === '#000000' ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.7)';
        const rx = x - ancho / 2 - pad; const ry = y0 - alto / 2 - pad * 0.4; const rw = ancho + pad * 2; const rh = alto * lineas.length + pad * 0.8;
        g.beginPath(); (g.roundRect ? g.roundRect(rx, ry, rw, rh, tam * 0.25) : g.rect(rx, ry, rw, rh)); g.fill();
      } else { g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = tam * 0.12; g.lineWidth = Math.max(2, tam * 0.08); g.strokeStyle = 'rgba(0,0,0,.75)'; lineas.forEach((l, i) => g.strokeText(l, x, y0 + i * alto)); g.shadowBlur = 0; }
      g.fillStyle = c.color;
      lineas.forEach((l, i) => g.fillText(l, x, y0 + i * alto));
    } else if (c.relleno) { g.fillStyle = c.color; g.fillRect(c.x * W, c.y * H, c.w * W, c.h * H); }
    else { const lw = Math.max(3, Math.round(0.006 * H)); g.lineWidth = lw; g.strokeStyle = c.color; g.strokeRect(c.x * W + lw / 2, c.y * H + lw / 2, c.w * W - lw, c.h * H - lw); }
    return lienzo.toDataURL('image/png');
  };
  async function edicionFinal() {
    if (!editado()) return {};
    let capas = [];
    if (E.capas.length) {
      const md = await pedir('clips:medidas', ed.archivo);
      const H = Math.round((md.alto || 1080) / 2) * 2; const W0 = Math.round((md.ancho || 1920) / 2) * 2;
      const W = E.formato === 'vertical' ? Math.floor((H * 9) / 16 / 2) * 2 : E.formato === 'cuadrado' ? Math.floor(H / 2) * 2 : W0;
      capas = E.capas.map((c) => ({ png: dibujarCapa(c, W, H), desde: c.desde, hasta: c.hasta }));
    }
    return { tramos: E.tramos.map(({ fuente: f, desde, hasta, velocidad, mudo }) => ({ fuente: f, desde, hasta, velocidad, mudo })), formato: E.formato, encuadre: E.encuadre, fundido: E.fundido, capas };
  }
  // En la línea de tiempo: los otros pedazos que salen de este mismo clip (el elegido es el que tiene manijas).
  var tiras = h('div', { class: 'tiras', role: 'listbox', 'aria-label': 'Pedazos del clip, en orden' });
  const nombreDe = (f) => f.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  function pintarTiras() {
    if (!tiras || !marcasTramos) return;
    marcasTramos.replaceChildren(...E.tramos.map((x, i) => (i !== E.sel && x.fuente === fuente && T.dur ? h('span', { style: `left:${pct(x.desde)};width:${((x.hasta - x.desde) / T.dur) * 100}%`, title: `Pedazo ${i + 1}` }, h('b', {}, String(i + 1))) : null)).filter(Boolean));
    const total = largoTotal() || 1;
    tiras.replaceChildren(...E.tramos.map((x, i) => h('button', {
      type: 'button', role: 'option', 'aria-selected': String(i === E.sel), class: `tira${i === E.sel ? ' elegida' : ''}${x.fuente !== ed.archivo ? ' otra' : ''}`,
      style: `flex-grow:${Math.max(0.06, durDe(x) / total)}`,
      title: `${x.fuente !== ed.archivo ? `De "${nombreDe(x.fuente)}" · ` : ''}${tiempoTexto(x.desde)} → ${tiempoTexto(x.hasta)}`,
      onclick: () => elegirPedazo(i),
    }, h('b', {}, String(i + 1)), h('span', {}, [tiempoTexto(durDe(x)), x.velocidad !== 1 ? `${String(x.velocidad).replace('.', ',')}x` : '', x.mudo ? 'sin sonido' : ''].filter(Boolean).join(' · ')))));
  }
  const elegirPedazo = async (i) => {
    if (!E.tramos[i]) return;
    E.sel = i;
    const x = E.tramos[i];
    if (x.fuente !== fuente) await cambiarFuente(x.fuente);
    T.desde = x.desde; T.hasta = x.hasta;
    refrescar(); irA(x.desde); pintarEdicion();
  };
  // Después de reordenar: las manijas pasan a mostrar el pedazo elegido (antes de refrescar, que guarda las manijas en él).
  const ordenar = (fn) => {
    fn(); E.sel = Math.max(0, Math.min(E.sel, E.tramos.length - 1));
    const x = E.tramos[E.sel];
    if (x && x.fuente === fuente) { T.desde = x.desde; T.hasta = x.hasta; }
    refrescar(); pintarEdicion();
  };
  // Cortar el pedazo elegido donde está el video: quedan dos (y se puede borrar o mover cada uno).
  const cortarAca = () => {
    const x = E.tramos[E.sel]; const t = video.currentTime;
    if (!x || x.fuente !== fuente || t <= x.desde + 0.2 || t >= x.hasta - 0.2) { decir('Poné el video adentro del pedazo elegido (lejos de las puntas) y cortá ahí.', 'mal'); return; }
    guardarPaso();
    ordenar(() => { E.tramos.splice(E.sel, 1, { ...x, hasta: t }, { ...x, desde: t }); E.sel += 1; });
    decir(`Cortado en ${tiempoTexto(t)}. Elegí un pedazo abajo para borrarlo, moverlo, repetirlo o cambiarle la velocidad (Ctrl+Z deshace).`, 'bien');
  };
  const copiar = () => { portapapelesClip = { ...E.tramos[E.sel] }; decir(`Copiado ${E.tramos.length > 1 ? `el pedazo ${E.sel + 1}` : 'el pedazo'} (${tiempoTexto(E.tramos[E.sel].hasta - E.tramos[E.sel].desde)}). Pegalo acá o en otro clip (Ctrl+V).`, 'bien'); pintarEdicion(); };
  const pegar = () => { if (!portapapelesClip) return; ordenar(() => { E.tramos.splice(E.sel + 1, 0, { ...portapapelesClip }); E.sel += 1; }); elegirPedazo(E.sel); };
  const sumarClip = (archivo) => {
    const x = (clipsGuardados || []).find((c) => c.archivo === archivo);
    if (!x) return;
    pedir('clips:medidas', archivo).then((md) => {
      guardarPaso();
      ordenar(() => { E.tramos.push({ fuente: archivo, desde: 0, hasta: Math.max(0.5, md.duracion || 1), velocidad: 1, mudo: false }); });
      elegirPedazo(E.tramos.length - 1);
      decir(`Sumé "${nombreDe(archivo)}" al final: recortalo con las manijas.`, 'bien');
    }).catch((er) => decir(er.message, 'mal'));
  };
  new ResizeObserver(() => { pintarMascara(); pintarCapas(); }).observe(video);
  video.addEventListener('loadedmetadata', () => { pintarMascara(); pintarCapas(); });
  const panelEdicion = h('details', { class: 'panel-edicion', open: true });
  const nombreCapa = (c) => (c.tipo === 'texto' ? `"${(c.texto || 'Texto').slice(0, 18)}"` : c.relleno ? 'Recuadro relleno' : 'Recuadro');
  function pintarEdicion() {
    pintarTiras();
    pintarMascara(); pintarCapas();
    estadoGuardar();
    const x = E.tramos[E.sel] || { velocidad: 1, mudo: false };
    const varios = E.tramos.length > 1;
    const cambio = (fn) => () => { guardarPaso(); fn(); refrescar(); pintarEdicion(); };
    const seg = (opciones, valor, alElegir, etiqueta) => h('div', { class: 'segmentado chico', role: 'radiogroup', 'aria-label': etiqueta }, opciones.map(([v, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === valor), class: v === valor ? 'on' : '', onclick: cambio(() => alElegir(v)) }, t)));
    const nTextos = E.capas.filter((c) => c.tipo === 'texto').length; const nCuadros = E.capas.length - nTextos;
    const resumenEd = [varios ? `${E.tramos.length} pedazos` : '', E.tramos.some((y) => y.velocidad !== 1) ? 'velocidad' : '', E.tramos.some((y) => y.mudo) ? 'sin sonido' : '', E.formato !== 'original' ? (E.formato === 'vertical' ? 'vertical 9:16' : 'cuadrado') : '',
      nTextos ? `${nTextos} ${nTextos === 1 ? 'texto' : 'textos'}` : '', nCuadros ? `${nCuadros} ${nCuadros === 1 ? 'recuadro' : 'recuadros'}` : '', E.fundido ? 'fundido' : ''].filter(Boolean).join(' · ');
    const otros = (clipsGuardados || []).filter((c) => c.archivo !== ed.archivo && /\.(mp4|webm|mkv|mov)$/i.test(c.archivo || c.nombre || '')).slice(0, 80);
    const total = largoTotal();
    const sumarCapa = (c) => { guardarPaso(); E.capas.push({ desde: 0, hasta: total, ...c }); capaSel = E.capas.length - 1; refrescar(); pintarEdicion(); };
    const c = E.capas[capaSel];
    const editorCapa = c ? h('div', { class: 'capa-editor' },
      c.tipo === 'texto'
        ? h('input', { type: 'text', value: c.texto, maxlength: 80, placeholder: 'Escribí el texto', 'aria-label': 'Texto', onfocus: () => guardarPaso(), oninput: (e) => { c.texto = e.target.value; pintarCapas(); const chip = panelEdicion.querySelector('.chip-capa.elegida'); if (chip) chip.lastChild.textContent = nombreCapa(c); } })
        : null,
      h('div', { class: 'fila' },
        h('div', { class: 'colores', role: 'radiogroup', 'aria-label': 'Color' }, COLORES_CAPA.map((col) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(c.color === col), 'aria-label': col, class: `color${c.color === col ? ' elegido' : ''}`, style: `--c:${col}`, onclick: cambio(() => { c.color = col; }) }))),
        c.tipo === 'texto'
          ? seg([[false, 'Solo texto'], [true, 'Con fondo']], !!c.fondo, (v) => { c.fondo = v; }, 'Fondo del texto')
          : seg([[false, 'Borde (marcar)'], [true, 'Relleno (tapar)']], !!c.relleno, (v) => { c.relleno = v; }, 'Estilo del recuadro')),
      h('div', { class: 'fila' },
        h('span', { class: 'et' }, 'Se ve'),
        h('span', { class: 'rango-capa' }, c.desde <= 0.05 && c.hasta >= total - 0.05 ? 'todo el clip' : `de ${tiempoTexto(c.desde)} a ${tiempoTexto(c.hasta)}`),
        boton('Desde acá', cambio(() => { c.desde = Math.min(tSalida(), c.hasta - 0.2); }), 'chico'),
        boton('Hasta acá', cambio(() => { c.hasta = Math.max(tSalida(), c.desde + 0.2); }), 'chico'),
        boton('Todo el clip', cambio(() => { c.desde = 0; c.hasta = total; }), 'chico'),
        h('span', { style: 'flex:1' }),
        boton('Duplicar', cambio(() => { E.capas.push({ ...c, x: Math.min(0.9, c.x + 0.04), y: Math.min(0.9, c.y + 0.04) }); capaSel = E.capas.length - 1; }), 'chico'),
        boton('Quitar', cambio(() => { E.capas.splice(capaSel, 1); capaSel = -1; }), 'chico peligro'))) : null;
    panelEdicion.replaceChildren(
      h('summary', {}, h('b', {}, 'Edición'), h('span', { class: 'nota' }, resumenEd || 'cortar, velocidad, vertical, textos y recuadros'),
        h('span', { style: 'flex:1' }),
        deshechos.length ? h('button', { type: 'button', class: 'boton chico', title: 'Deshacer (Ctrl+Z)', onclick: (e) => { e.preventDefault(); deshacerEdicion(); } }, 'Deshacer') : null),
      // Pedazos
      h('div', { class: 'pe-bloque' },
        h('div', { class: 'fila' },
          h('span', { class: 'et' }, varios ? `Pedazos (elegí uno para recortarlo, moverlo o cambiarle la velocidad)` : 'Pedazos'),
          h('span', { style: 'flex:1' }),
          otros.length ? h('select', { class: 'chico', 'aria-label': 'Sumar otro clip al final', onchange: (e) => { const v = e.target.value; e.target.value = ''; if (v) sumarClip(v); } },
            h('option', { value: '' }, '+ Sumar otro clip'), otros.map((y) => h('option', { value: y.archivo }, y.nombre || nombreDe(y.archivo)))) : null),
        varios ? tiras : h('p', { class: 'nota' }, 'Todo el clip es un solo pedazo. Con "Cortar acá" (arriba, o la tecla S) lo partís donde está el video para sacar o repetir partes.'),
        h('div', { class: 'fila' },
          boton('Duplicar', () => { guardarPaso(); portapapelesClip = { ...E.tramos[E.sel] }; pegar(); }, 'chico'),
          boton('Copiar', copiar, 'chico'),
          portapapelesClip ? boton('Pegar', () => { guardarPaso(); pegar(); }, 'chico') : null,
          varios ? boton('◀ Antes', () => { guardarPaso(); ordenar(() => { const [y] = E.tramos.splice(E.sel, 1); E.tramos.splice(E.sel - 1, 0, y); E.sel -= 1; }); }, 'chico', E.sel === 0) : null,
          varios ? boton('Después ▶', () => { guardarPaso(); ordenar(() => { const [y] = E.tramos.splice(E.sel, 1); E.tramos.splice(E.sel + 1, 0, y); E.sel += 1; }); }, 'chico', E.sel >= E.tramos.length - 1) : null,
          varios ? boton('Borrar pedazo', () => { guardarPaso(); ordenar(() => { E.tramos.splice(E.sel, 1); }); elegirPedazo(E.sel); }, 'chico peligro') : null)),
      // Velocidad y sonido
      h('div', { class: 'pe-bloque' },
        h('span', { class: 'et' }, varios ? `Velocidad y sonido del pedazo ${E.sel + 1}` : 'Velocidad y sonido'),
        h('div', { class: 'fila' },
          seg([[0.5, '0,5x'], [0.75, '0,75x'], [1, 'Normal'], [1.25, '1,25x'], [1.5, '1,5x'], [2, '2x']], x.velocidad, (v) => { x.velocidad = v; }, 'Velocidad'),
          varios ? boton('Esta velocidad a todos', cambio(() => { E.tramos.forEach((y) => { y.velocidad = x.velocidad; }); }), 'chico') : null,
          h('label', { class: 'casilla-texto' }, h('input', { type: 'checkbox', checked: !!x.mudo, onchange: (e) => { guardarPaso(); x.mudo = e.target.checked; refrescar(); pintarEdicion(); } }), h('span', {}, 'Sin sonido')))),
      // Formato
      h('div', { class: 'pe-bloque' },
        h('span', { class: 'et' }, 'Formato'),
        h('div', { class: 'fila' },
          seg([['original', 'Original'], ['vertical', 'Vertical 9:16'], ['cuadrado', 'Cuadrado']], E.formato, (v) => { E.formato = v; }, 'Formato'),
          E.formato !== 'original' ? h('label', { class: 'fila encuadre' }, h('span', { class: 'nota' }, 'Encuadre'), h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: E.encuadre, 'aria-label': 'Encuadre de izquierda a derecha', onpointerdown: () => guardarPaso(), oninput: (e) => { E.encuadre = Number(e.target.value); pintarMascara(); pintarCapas(); } })) : null)),
      // Textos y recuadros
      h('div', { class: 'pe-bloque' },
        h('div', { class: 'fila' },
          h('span', { class: 'et' }, 'Textos y recuadros'),
          boton('+ Texto', () => sumarCapa({ tipo: 'texto', texto: 'Texto', x: 0.5, y: 0.15, tam: 0.08, color: '#ffffff', fondo: false }), 'chico'),
          boton('+ Recuadro', () => sumarCapa({ tipo: 'recuadro', x: 0.35, y: 0.35, w: 0.3, h: 0.3, color: '#ff3b30', relleno: false }), 'chico')),
        E.capas.length ? h('div', { class: 'chips-capas', role: 'listbox', 'aria-label': 'Textos y recuadros' }, E.capas.map((y, k) => h('button', { type: 'button', role: 'option', 'aria-selected': String(k === capaSel), class: `chip-capa${k === capaSel ? ' elegida' : ''}`, onclick: () => elegirCapa(k === capaSel ? -1 : k) }, h('i', { style: `background:${y.color}` }), nombreCapa(y)))) : null,
        editorCapa || (E.capas.length ? h('p', { class: 'nota' }, 'Tocá uno (acá o sobre el video) para editarlo. Sobre el video: arrastrá para mover, la esquina para el tamaño, doble clic en un texto para escribir. Supr lo quita.') : h('p', { class: 'nota' }, 'Para poner un título o marcar algo (borde) o taparlo (relleno). Se acomodan arrastrándolos sobre el video.'))),
      // Fundido
      h('div', { class: 'pe-bloque' },
        h('label', { class: 'casilla-texto' }, h('input', { type: 'checkbox', checked: E.fundido, onchange: (e) => { guardarPaso(); E.fundido = e.target.checked; refrescar(); pintarEdicion(); } }), h('span', {}, 'Fundido a negro al empezar y al terminar'))));
  }
  // Atajos del editor: S corta, Ctrl+Z deshace, Ctrl+C / Ctrl+V / Ctrl+D con el pedazo, Supr y flechas con el texto o recuadro elegido.
  ed.teclas = (e) => {
    if (escribiendo()) return false;
    const k = e.key; const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === 'z' || k === 'Z')) { deshacerEdicion(); return true; }
    if (ctrl && (k === 'c' || k === 'C') && capaSel === -1) { copiar(); return true; }
    if (ctrl && (k === 'v' || k === 'V') && portapapelesClip) { guardarPaso(); pegar(); return true; }
    if (ctrl && (k === 'd' || k === 'D')) { guardarPaso(); if (capaSel !== -1) { const c = E.capas[capaSel]; E.capas.push({ ...c, x: Math.min(0.9, c.x + 0.04), y: Math.min(0.9, c.y + 0.04) }); capaSel = E.capas.length - 1; refrescar(); pintarEdicion(); } else { portapapelesClip = { ...E.tramos[E.sel] }; pegar(); } return true; }
    if (ctrl || e.altKey) return false;
    if (k === 's' || k === 'S') { cortarAca(); return true; }
    const c = E.capas[capaSel];
    if (!c) return false;
    if (k === 'Delete' || k === 'Backspace') { guardarPaso(); E.capas.splice(capaSel, 1); capaSel = -1; refrescar(); pintarEdicion(); return true; }
    if (k === 'Escape') { capaSel = -1; pintarCapas(); pintarEdicion(); return true; }
    const paso = e.shiftKey ? 0.05 : 0.01;
    const mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[k];
    if (mov) { guardarPaso(); c.x = Math.max(0, Math.min(c.tipo === 'texto' ? 1 : 1 - c.w, c.x + mov[0])); c.y = Math.max(0, Math.min(c.tipo === 'texto' ? 1 : 1 - c.h, c.y + mov[1])); pintarCapas(); return true; }
    return false;
  };
  pintarEdicion();
  ed.favorito = !!ed.favorito;
  const estrella = h('button', { type: 'button', class: `boton icono-solo estrella${ed.favorito ? ' on' : ''}`, title: 'Favorito', 'aria-pressed': String(ed.favorito), 'aria-label': 'Marcar como favorito', html: icono('estrella', 18), onclick: async () => {
    try { ed.favorito = await pedir('clips:favorito', { archivo: ed.archivo, si: !ed.favorito }); estrella.classList.toggle('on', ed.favorito); estrella.setAttribute('aria-pressed', String(ed.favorito)); cargarClips(); } catch (er) { decir(er.message, 'mal'); }
  } });
  // Convertir y comprimir: secundarios, en el menú ⋯.
  const panelComprimir = h('div', { class: 'panel-comprimir', hidden: true });
  const transformar = async (tipo, opciones = {}) => {
    panelComprimir.hidden = true;
    ocupado(true);
    progreso(tipo, 0);
    try {
      const r = await pedir('clips:transformar', { archivo: ed.archivo, tipo, opciones });
      barra.hidden = true;
      const ahorro = tipo === 'comprimir' ? ` Pesa ${tamano(r.bytes)} (antes ${tamano(r.antes)}).` : '';
      decir(`Listo: "${r.nombre}".${ahorro}`, 'bien');
      mensaje.append(' ', r.esVideo ? boton('Abrir en el editor', () => abrirEditor({ archivo: r.archivo, nombre: r.nombre }), 'chico') : null, boton('Mostrar en la carpeta', () => pedir('clips:mostrarArchivo', r.archivo).catch((er) => avisarGuardado(er.message)), 'chico'));
      cargarClips();
    } catch (er) { barra.hidden = true; decir(er.message, 'mal'); }
    ocupado(false);
  };
  const nivelC = { v: 'medio' };
  const mbC = h('input', { type: 'number', min: 1, max: 4000, step: 1, placeholder: '16', class: 'seg', 'aria-label': 'Megas como máximo' });
  const pintarComprimir = () => panelComprimir.replaceChildren(
    h('b', {}, 'Comprimir'), h('span', { class: 'nota' }, 'Queda una copia al lado; el original no se toca.'),
    h('div', { class: 'opciones-comprimir', role: 'radiogroup', 'aria-label': 'Cuánto comprimir' }, [['poco', 'Un poco', 'Casi igual de nítido'], ['medio', 'Bastante', 'Hasta 720p'], ['mucho', 'Mucho', 'Hasta 480p, para compartir'], ['mb', 'Por peso', 'Que no pase de…']].map(([id, t, d]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(nivelC.v === id), class: `opcion-c${nivelC.v === id ? ' elegida' : ''}`, onclick: () => { nivelC.v = id; pintarComprimir(); if (id === 'mb') setTimeout(() => mbC.focus(), 0); } }, h('b', {}, t), h('span', {}, d)))),
    nivelC.v === 'mb' ? h('div', { class: 'fila' }, mbC, h('span', { class: 'nota' }, 'MB')) : null,
    h('div', { class: 'fila' }, boton('Comprimir', () => { if (nivelC.v === 'mb') { const mb = Number(mbC.value); if (!(mb > 0)) { mbC.focus(); return; } transformar('comprimir', { mb }); } else transformar('comprimir', { nivel: nivelC.v }); }, 'principal chico'), boton('Cancelar', () => { panelComprimir.hidden = true; }, 'chico')));
  ed.comprimir = () => { pintarComprimir(); panelComprimir.hidden = false; panelComprimir.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  const masOpciones = menuKebab([
    { texto: 'Abrir en el reproductor', icono: 'play', hacer: () => pedir('clips:abrir', ed.archivo).catch((er) => decir(er.message, 'mal')) },
    { texto: 'Mostrar en la carpeta', icono: 'carpeta', hacer: () => pedir('clips:mostrar', ed.archivo).catch((er) => decir(er.message, 'mal')) },
    { texto: '¿No se ve bien acá?', detalle: 'Preparar una vista previa compatible', icono: 'actualizar', hacer: () => ed.forzarVista() },
    null,
    { texto: 'Convertir para editar', detalle: 'MP4 H.264 para After Effects, Premiere…', icono: 'clip', hacer: () => transformar('editable') },
    { texto: 'Comprimir…', detalle: 'Que pese menos', icono: 'bajar', hacer: () => ed.comprimir() },
    { texto: 'Sacar el audio (MP3)', icono: 'musica', hacer: () => transformar('mp3') },
    { texto: 'Convertir a GIF', detalle: 'Los primeros 30 segundos', icono: 'camara', hacer: () => transformar('gif') },
    null,
    { texto: 'Mandar a la Papelera', icono: 'tacho', peligro: true, hacer: async () => {
      await soltarVideos();
      try { const r = await pedir('clips:papelera', ed.archivo); clipEditor = null; pintar(true); cargarClips(); avisarConDeshacer(r.texto, r.id, r.plazo); } catch (er) { decir(er.message, 'mal'); await cargar(true).catch(() => {}); }
    } },
  ], 'Más opciones del clip');
  // Pantalla completa propia (la del reproductor no anda bien adentro de Ajustes): doble clic, el botón o la tecla F; Esc sale.
  const cine = h('div', { class: 'video-caja' }, video, mascara, capasCaja,
    h('button', { type: 'button', class: 'boton-cine', title: 'Pantalla completa (F)', 'aria-label': 'Pantalla completa', html: icono('expandir', 18), onclick: () => alternarCine() }));
  const alternarCine = async (forzar) => {
    const si = forzar !== undefined ? forzar : !cine.classList.contains('cine');
    cine.classList.toggle('cine', si);
    document.body.classList.toggle('con-cine', si);
    cine.querySelector('.boton-cine').innerHTML = icono(si ? 'achicar' : 'expandir', 18);
    cine.querySelector('.boton-cine').setAttribute('aria-label', si ? 'Salir de pantalla completa' : 'Pantalla completa');
    pedir('ventana:pantallaCompleta', si).catch(() => {});
  };
  ed.alternarCine = alternarCine;
  video.addEventListener('dblclick', (e) => { e.preventDefault(); alternarCine(); });
  const nombres = [...new Set((cfg.contactos || []).map((x) => String(x.nombre || '').split(',')[0].trim()).filter(Boolean))];
  ed.nodo = h('div', { class: 'editor-clip' },
    h('datalist', { id: 'contactos-clips' }, nombres.map((n) => h('option', { value: n }))),
    h('div', { class: 'editor-cabeza' },
      boton('← Clips', () => cerrarEditor(), 'chico'),
      h('div', { class: 'nombre-editable' }, nombre, h('span', { class: 'nota' }, ed.ext)),
      estrella, masOpciones),
    cine,
    h('div', { class: 'recorte' },
      linea,
      h('div', { class: 'fila-recorte' },
        h('span', { class: 'et' }, 'Inicio'), nDesde, h('span', { class: 'nota' }, 's'), acaDesde,
        h('span', { class: 'sep' }),
        h('span', { class: 'et' }, 'Fin'), nHasta, h('span', { class: 'nota' }, 's'), acaHasta,
        h('span', { style: 'flex:1' }), aCortar, aVer),
      resumen),
    h('div', { class: 'editor-lado' }, panelEdicion, panelComprimir),
    h('div', { class: 'editor-pie' },
      guardarCaja,
      h('span', { style: 'flex:1' }),
      h('span', { class: 'nota', html: `${icono('whatsapp', 16)}` }), destino, enviar),
    h('div', { class: 'editor-mensaje' }, mensaje, barra),
    h('p', { class: 'nota editor-atajos' }, 'Espacio: reproducir · S: cortar · Ctrl+Z: deshacer · Ctrl+C / Ctrl+V: copiar y pegar · Supr: borrar · F: pantalla completa',
      botonInfo('Arrastrá las manijas para elegir el recorte; tocá la línea para moverte. En "Edición": cortar en pedazos, copiar y pegar, velocidad, textos y recuadros. "Guardar" reemplaza el clip (con Deshacer); en la flechita está "Guardar una copia".')));
  refrescar();
  cargar(false).catch((er) => decir(er.message, 'mal'));
  return ed.nodo;
}

// Estado + acciones de clips con la misma forma que las acciones rápidas del notch (ícono arriba, texto abajo).
function controlesDeClips() {
  const e = clipsEstado || {};
  const activo = !!cfg.clips.activo;
  const texto = e.error ? e.error
    : e.corriendo ? `Grabando en segundo plano · ${e.captura || ''}${e.formato ? ` · ${/h264/i.test(e.formato) ? 'H.264' : /vp9/i.test(e.formato) ? 'VP9' : 'VP8'}` : ''} · últimos ${e.segundos || 0} s`.replace(' ·  ·', ' ·')
    : activo ? 'Prendido, pero el modo actual no graba clips' : 'Apagado';
  const tono = e.error ? 'mal' : e.corriendo ? 'bien' : activo ? 'aviso' : '';
  const accion = async (que, modo) => { try { avisarGuardado(await pedir('clips:accion', { accion: que, ...(modo ? { modo } : {}) })); } catch (er) { avisarGuardado(er.message); } refrescarClips(); };
  const tile = (ic, nombre, alTocar, clase = '', deshabilitado = false) => h('button', { type: 'button', class: `tile-accion ${clase}`, disabled: deshabilitado, onclick: alTocar, html: `${icono(ic, 22)}<span>${nombre}</span>` });
  return h('section', { class: 'clips-controles' },
    h('div', { class: 'cc-estado' },
      h('span', { class: `estado-chip ${tono}` }, texto),
      botonIcono('actualizar', 'Actualizar estado', refrescarClips)),
    h('div', { class: 'cc-tiles' },
      activo ? tile('clip', 'Guardar clip', () => accion('guardar'), '', !e.corriendo) : null,
      activo ? (e.grabando ? tile('parar', 'Parar grabación', () => accion('parar'), 'rojo') : tile('grabar', 'Grabar pantalla', () => accion('grabar', 'pantalla'), 'rojo')) : null,
      activo && !e.grabando ? tile('grabar', 'Grabar ventana', () => accion('grabar', 'ventana'), 'rojo') : null,
      activo && !e.grabando ? tile('grabar', 'Grabar recuadro', () => accion('grabar', 'recuadro'), 'rojo') : null,
      tile(activo ? 'ajustes' : 'clip', activo ? 'Ajustes de clips' : 'Prender clips', () => irA('clips-ajustes'), activo ? '' : 'principal')));
}

function listaDeClips() {
  if (!clipsGuardados) return h('div', { class: 'vacio' }, 'Buscando tus clips…');
  const tamano = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
  const hace = (ms) => {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'recién';
    if (m < 60) return `hace ${m} min`;
    if (m < 1440) return `hace ${Math.round(m / 60)} h`;
    const d = Math.round(m / 1440);
    return d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : new Date(ms).toLocaleDateString('es-AR');
  };
  const c = cfg.clips;
  const nombres = [...new Set((cfg.contactos || []).map((x) => String(x.nombre || '').split(',')[0].trim()).filter(Boolean))];
  const destino = h('input', { type: 'text', value: c.enviarA || '', placeholder: 'Nombre del contacto', list: 'contactos-clips', style: 'max-width:220px', oninput: (e) => { c.enviarA = e.target.value; guardar(); } });
  const vis = clipsVisibles();
  setTimeout(() => pedirMiniaturas(vis.pagina), 0);
  const carpetas = [...new Set((clipsGuardados || []).map((x) => x.juego || ''))].sort((a, b) => a.localeCompare(b, 'es'));
  const irPagina = (n) => { clipsUI.pagina = n; pintar(); const l = document.querySelector('.clips-lista'); if (l) l.scrollIntoView({ block: 'start' }); };
  const filtros = h('div', { class: 'fila clips-filtros' },
    h('label', { class: 'nota' }, 'Carpeta ', h('select', { 'aria-label': 'Carpeta', onchange: (e) => { clipsUI.carpeta = e.target.value; clipsUI.pagina = 0; pintar(); } },
      h('option', { value: '', selected: !clipsUI.carpeta }, `Todas (${(clipsGuardados || []).length})`),
      carpetas.map((c) => h('option', { value: c, selected: clipsUI.carpeta === c }, `${c || 'Sueltos'} (${clipsGuardados.filter((x) => (x.juego || '') === c).length})`)))),
    h('label', { class: 'nota' }, 'Ordenar por ', h('select', { 'aria-label': 'Ordenar por', onchange: (e) => { clipsUI.orden = e.target.value; clipsUI.asc = e.target.value === 'nombre'; clipsUI.pagina = 0; pintar(); } },
      [['fecha', 'Fecha'], ['tamano', 'Tamaño'], ['nombre', 'Nombre']].map(([v, t]) => h('option', { value: v, selected: clipsUI.orden === v }, t)))),
    boton(clipsUI.orden === 'nombre' ? (clipsUI.asc ? 'A → Z' : 'Z → A') : clipsUI.orden === 'tamano' ? (clipsUI.asc ? 'Más chicos primero' : 'Más grandes primero') : (clipsUI.asc ? 'Más viejos primero' : 'Más nuevos primero'),
      () => { clipsUI.asc = !clipsUI.asc; clipsUI.pagina = 0; pintar(); }, 'chico'),
    h('button', { type: 'button', class: `boton chico estrella-filtro${clipsUI.favoritos ? ' on' : ''}`, 'aria-pressed': String(clipsUI.favoritos), onclick: () => { clipsUI.favoritos = !clipsUI.favoritos; clipsUI.pagina = 0; pintar(); }, html: `${icono('estrella', 14)}<span>Favoritos</span>` }));
  const paginador = vis.paginas > 1 ? h('div', { class: 'fila clips-paginas' },
    Object.assign(boton('Anteriores', () => irPagina(clipsUI.pagina - 1), 'chico'), { disabled: clipsUI.pagina === 0 }),
    h('span', { class: 'nota' }, `Página ${clipsUI.pagina + 1} de ${vis.paginas} · ${vis.total} clips`),
    Object.assign(boton('Siguientes', () => irPagina(clipsUI.pagina + 1), 'chico'), { disabled: clipsUI.pagina >= vis.paginas - 1 })) : null;
  const hechos = vis.pagina.map((x) => {
    const foto = miniaturas.get(x.archivo);
    const enviando = clipsEnviando === x.archivo;
    const trabajo = trabajosClips.get(x.archivo);
    const transformarDesdeLista = async (tipo) => {
      try {
        const r = await pedir('clips:transformar', { archivo: x.archivo, tipo, opciones: {} });
        avisarConAccion(`Listo: "${r.nombre}"${tipo === 'comprimir' ? ` (${tamano(r.bytes)}, antes ${tamano(r.antes)})` : ''}.`, 'Mostrar', () => { pedir('clips:mostrarArchivo', r.archivo); return ''; }, 12000);
        cargarClips();
      } catch (er) { avisarGuardado(er.message); }
    };
    return h('div', { class: 'clip-fila', 'data-archivo': x.archivo },
      h('button', { type: 'button', class: 'cuadro', onclick: () => abrirEditor(x), title: 'Recortar, guardar y enviar', 'aria-label': `Editar ${x.nombre}` }, h('img', { class: 'miniatura', alt: '', 'data-archivo': x.archivo, src: foto || undefined, hidden: !foto }), h('span', { class: 'sin-foto', hidden: !!foto }, 'Editar'), h('span', { class: 'cuadro-play', html: icono('tijera', 18) })),
      h('div', { class: 'quien-espacio', onclick: () => abrirEditor(x), style: 'cursor:pointer' }, h('div', { class: 'nombre-clip', title: 'Recortar, guardar y enviar' }, x.nombre), h('div', { class: 'nota' }, [x.juego, tamano(x.bytes), hace(x.fecha)].filter(Boolean).join(' · ')),
        h('div', { class: 'progreso fino fila-progreso', hidden: !trabajo, title: trabajo ? `${TAREAS_CLIP[trabajo.tipo]}… ${trabajo.porcentaje} %` : '' }, h('i', { style: `width:${trabajo ? trabajo.porcentaje : 0}%` }))),
      h('div', { class: 'acciones-clip' },
        h('button', { type: 'button', class: `boton icono-solo estrella${x.favorito ? ' on' : ''}`, title: x.favorito ? 'Sacar de favoritos' : 'Favorito', 'aria-pressed': String(!!x.favorito), 'aria-label': `Favorito: ${x.nombre}`, html: icono('estrella', 16), onclick: async () => { try { x.favorito = await pedir('clips:favorito', { archivo: x.archivo, si: !x.favorito }); pintar(); } catch (er) { avisarGuardado(er.message); } } }),
        boton('Recortar', () => abrirEditor(x), 'chico'),
        boton(enviando ? 'Enviando…' : 'Enviar', async (ev) => {
          if (!String(c.enviarA || '').trim()) { avisarGuardado('Escribí arriba a quién se lo mando.'); return; }
          clipsEnviando = x.archivo; ev.target.disabled = true; ev.target.textContent = 'Enviando…';
          try { avisarGuardado(await pedir('clips:enviar', { archivo: x.archivo, contacto: c.enviarA })); } catch (er) { avisarGuardado(er.message); }
          clipsEnviando = ''; pintar();
        }, 'chico principal enviar-clip'),
        menuKebab([
          { texto: 'Abrir en el reproductor', icono: 'play', hacer: () => pedir('clips:abrir', x.archivo).catch((er) => avisarGuardado(er.message)) },
          { texto: 'Mostrar en la carpeta', icono: 'carpeta', hacer: () => pedir('clips:mostrar', x.archivo).catch((er) => avisarGuardado(er.message)) },
          null,
          { texto: 'Convertir para editar', detalle: 'MP4 H.264 para After Effects, Premiere…', icono: 'clip', hacer: () => transformarDesdeLista('editable') },
          { texto: 'Comprimir…', detalle: 'Que pese menos', icono: 'bajar', hacer: () => { abrirEditor(x); setTimeout(() => clipEditor && clipEditor.comprimir && clipEditor.comprimir(), 60); } },
          { texto: 'Sacar el audio (MP3)', icono: 'musica', hacer: () => transformarDesdeLista('mp3') },
          { texto: 'Convertir a GIF', detalle: 'Los primeros 30 segundos', icono: 'camara', hacer: () => transformarDesdeLista('gif') },
          null,
          { texto: 'Mandar a la Papelera', icono: 'tacho', peligro: true, hacer: async () => { try { const r = await pedir('clips:papelera', x.archivo); avisarConDeshacer(r.texto, r.id, r.plazo); } catch (er) { avisarGuardado(er.message); } cargarClips(); } },
        ], `Más opciones de ${x.nombre}`)));
  });
  return h('div', { class: 'ancho' },
    h('datalist', { id: 'contactos-clips' }, nombres.map((n) => h('option', { value: n }))),
    h('div', { class: 'clips-barra' }, (clipsGuardados || []).length ? filtros : null,
      h('label', { class: 'nota enviar-a', title: 'Contacto o grupo de WhatsApp para "Enviar"' }, h('span', { html: icono('whatsapp', 15) }), destino),
      botonIcono('actualizar', 'Actualizar', cargarClips)),
    hechos.length ? h('div', { class: 'clips-lista' }, hechos) : h('div', { class: 'vacio' }, (clipsGuardados || []).length ? 'No hay clips en esa carpeta.' : 'Todavía no hay clips en la carpeta. Cuando guardes uno, aparece acá.'),
    paginador);
}
// Papelera: el primer toque pide confirmación en el mismo botón ("¿Seguro?" aparece flotando, sin mover nada de la fila);
// el segundo manda el clip a la Papelera y el aviso trae un "Deshacer".
function botonPapelera(x) {
  let reloj = null;
  const caja = h('span', { class: 'quitar-clip' });
  const reposo = () => { clearTimeout(reloj); caja.classList.remove('seguro'); b.innerHTML = icono('tacho', 16); b.setAttribute('aria-label', `Mandar a la Papelera ${x.nombre}`); };
  const b = h('button', { type: 'button', class: 'boton icono-solo quitar', title: 'Mandar a la Papelera', 'aria-label': `Mandar a la Papelera ${x.nombre}`, html: icono('tacho', 16),
    onblur: reposo,
    onclick: async () => {
      if (!caja.classList.contains('seguro')) {
        caja.classList.add('seguro'); b.innerHTML = `${icono('tacho', 16)}<span>¿Seguro?</span>`; b.setAttribute('aria-label', '¿Seguro? Tocá de nuevo para mandar el clip a la Papelera');
        clearTimeout(reloj); reloj = setTimeout(reposo, 4000);
        return;
      }
      clearTimeout(reloj); b.disabled = true;
      try { const r = await pedir('clips:papelera', x.archivo); avisarConDeshacer(r.texto, r.id, r.plazo); } catch (er) { avisarGuardado(er.message); }
      cargarClips();
    } });
  caja.append(b);
  return caja;
}
// Un aviso con un botón (Deshacer, Abrir…) en el mismo cartel de abajo. hacer() puede devolver un texto para mostrar.
function avisarConAccion(texto, accion, hacer, plazo = 10000) {
  clearTimeout(avisarGuardado.relojGrande);
  const b = h('button', { type: 'button', class: 'boton chico principal', style: 'margin-left:12px', onclick: async (ev) => {
    ev.stopPropagation(); b.disabled = true;
    try { const r = await hacer(); if (r) avisarGuardado(r); else cartelGrande.hidden = true; } catch (er) { avisarGuardado(er.message); }
  } }, accion);
  cartelGrande.className = '';
  cartelGrande.replaceChildren(h('span', {}, texto), b);
  cartelGrande.hidden = false;
  avisarGuardado.relojGrande = setTimeout(() => { cartelGrande.hidden = true; }, plazo);
}
// Menú de "⋯" (kebab). items: { texto, detalle, icono, peligro, hacer } o null para una línea divisoria.
function menuDesplegable(items, etiqueta, disparador) {
  const lista = h('div', { class: 'menu-desplegable', role: 'menu', hidden: true });
  const cerrar = () => { lista.hidden = true; disparador.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', afuera, true); document.removeEventListener('keydown', teclas, true); };
  const afuera = (e) => { if (!caja.contains(e.target)) cerrar(); };
  const teclas = (e) => {
    const bs = [...lista.querySelectorAll('button')];
    const i = bs.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); cerrar(); disparador.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  };
  lista.replaceChildren(...items.map((it) => (it ? h('button', { type: 'button', role: 'menuitem', class: it.peligro ? 'peligro' : '', onclick: (e) => { e.stopPropagation(); cerrar(); it.hacer(); } },
    it.icono ? h('span', { class: 'md-icono', html: icono(it.icono, 16) }) : null,
    h('span', { class: 'md-texto' }, h('span', {}, it.texto), it.detalle ? h('small', {}, it.detalle) : null)) : h('hr'))));
  disparador.setAttribute('aria-haspopup', 'menu'); disparador.setAttribute('aria-expanded', 'false');
  disparador.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!lista.hidden) { cerrar(); return; }
    lista.hidden = false; disparador.setAttribute('aria-expanded', 'true');
    // Se abre hacia arriba si abajo no entra.
    const r = disparador.getBoundingClientRect();
    lista.classList.toggle('arriba', window.innerHeight - r.bottom < Math.min(360, lista.scrollHeight + 16) && r.top > window.innerHeight - r.bottom);
    document.addEventListener('pointerdown', afuera, true); document.addEventListener('keydown', teclas, true);
    const primero = lista.querySelector('button'); if (primero && e.detail === 0) primero.focus();
  });
  const caja = h('div', { class: 'con-menu' }, disparador, lista);
  return caja;
}
const menuKebab = (items, etiqueta) => menuDesplegable(items, etiqueta, h('button', { type: 'button', class: 'boton icono-solo kebab', title: etiqueta, 'aria-label': etiqueta, html: icono('puntos', 18) }));
// Botón dividido: la acción principal y, en la flechita, las alternativas.
function botonDividido(principal, items, etiqueta) {
  const flecha = h('button', { type: 'button', class: `boton dividido-flecha ${principal.className.replace(/\bboton\b/, '')}`, title: etiqueta, 'aria-label': etiqueta, html: icono('chevron', 16) });
  const caja = menuDesplegable(items, etiqueta, flecha);
  return h('div', { class: 'boton-dividido' }, principal, caja);
}
const TAREAS_CLIP = { vista: 'Preparando la vista previa', editable: 'Convirtiendo para editar', comprimir: 'Comprimiendo', mp3: 'Sacando el audio', gif: 'Armando el GIF' };
const trabajosClips = new Map(); // archivo -> { tipo, porcentaje } (para mostrar el avance en la lista)
jarvis.escuchar('clips-trabajo', (d) => {
  if (d.fin) trabajosClips.delete(d.archivo); else trabajosClips.set(d.archivo, d);
  if (clipEditor && clipEditor.progreso) clipEditor.progreso(d);
  if (!clipEditor && seccion === 'clips') {
    const fila = [...document.querySelectorAll('.clip-fila')].find((f) => f.dataset.archivo === d.archivo);
    const b = fila && fila.querySelector('.fila-progreso');
    if (b) { b.hidden = !!d.fin; b.firstChild.style.width = `${d.porcentaje || 0}%`; b.title = `${TAREAS_CLIP[d.tipo] || 'Trabajando'}… ${d.porcentaje || 0} %`; }
  }
});
// Atajos del editor: F = pantalla completa, Esc = salir de ella.
document.addEventListener('keydown', (e) => {
  if (!clipEditor || !clipEditor.alternarCine || seccion !== 'clips') return;
  const enCine = document.body.classList.contains('con-cine');
  if (e.key === 'Escape' && enCine) { e.preventDefault(); clipEditor.alternarCine(false); }
  else if ((e.key === 'f' || e.key === 'F') && !escribiendo() && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); clipEditor.alternarCine(); }
  else if (clipEditor.teclas && clipEditor.teclas(e)) e.preventDefault();
});

// Un aviso con un botón "Deshacer" (el mismo cartel de abajo).
function avisarConDeshacer(texto, id, plazo = 10000) {
  clearTimeout(avisarGuardado.relojGrande);
  const hacer = h('button', { type: 'button', class: 'boton chico principal', style: 'margin-left:12px', onclick: async (ev) => {
    ev.stopPropagation(); hacer.disabled = true;
    try { avisarGuardado(await pedir('clips:deshacer', id)); } catch (er) { avisarGuardado(er.message); }
    cargarClips();
  } }, 'Deshacer');
  cartelGrande.className = '';
  cartelGrande.replaceChildren(h('span', {}, texto), hacer);
  cartelGrande.hidden = false;
  avisarGuardado.relojGrande = setTimeout(() => { cartelGrande.hidden = true; }, plazo);
}

let nombresFilas = null; // la tabla de nombres de carpetas de Clips (se arma al entrar a la sección)
let clipsEstado = {};
async function refrescarClips() {
  clipsEstado = await pedir('clips:estado').catch(() => clipsEstado);
  if (seccion === 'clips' || seccion === 'clips-ajustes') pintar();
}
// ---------- Notas ----------
let notasLista = null;
const agendaUI = { conocidos: null, pidiendoConocidos: false, gestionAbierta: false, editor: null, buscar: '', vista: 'mes', fecha: Date.now(), datos: null, pidiendo: null, nota: { texto: '', fecha: '', hora: '', sonido: '' } };
const notasUI = { filtro: 'todas', buscar: '', capturas: new Map(), verCaptura: new Set(), borrando: null, nueva: { texto: '', cuando: '' }, confirmarAvisadas: false };
const aLocal = (ms) => { const d = new Date(ms); const dos = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`; };
const cuandoLindo = (ms) => new Date(ms).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
async function cargarNotas() {
  try { notasLista = await pedir('notas:leer'); } catch (e) { notasLista = notasLista || []; avisarGuardado(`No pude leer las notas: ${e.message}`); }
  if (seccion === 'notas' && !escribiendo()) pintar();
}
async function cambiarNota(id, cambios, repintar = false) {
  try {
    const n = await pedir('notas:guardar', { id, cambios });
    const i = notasLista.findIndex((x) => x.id === id);
    if (i >= 0) notasLista[i] = n;
    avisarGuardado();
    if (repintar) pintar();
  } catch (e) { avisarGuardado(e.message); }
}
function tarjetaDeNota(n) {
  const pendiente = n.cuando && !n.avisada;
  const area = h('textarea', { class: 'nota-texto', rows: 2, value: n.texto, 'aria-label': 'Texto de la nota' });
  let relojTexto = null;
  area.addEventListener('input', () => { clearTimeout(relojTexto); relojTexto = setTimeout(() => { if (area.value.trim()) cambiarNota(n.id, { texto: area.value }); }, 600); });
  const caja = h('div', { class: 'nota-captura' });
  const mostrarCaptura = async () => {
    if (!notasUI.capturas.has(n.id)) { try { notasUI.capturas.set(n.id, await pedir('notas:captura', n.id)); } catch { notasUI.capturas.set(n.id, null); } }
    const url = notasUI.capturas.get(n.id);
    caja.replaceChildren(url ? h('img', { src: url, alt: 'Captura de pantalla de la nota' }) : h('span', { class: 'nota' }, 'La captura ya no está.'));
  };
  if (n.tieneCaptura && notasUI.verCaptura.has(n.id)) mostrarCaptura();
  const aviso = h('input', { type: 'datetime-local', value: n.cuando ? aLocal(n.cuando) : '', 'aria-label': 'Fecha y hora del aviso',
    onchange: (e) => { const ms = e.target.value ? new Date(e.target.value).getTime() : 0; cambiarNota(n.id, { cuando: ms || null }, true); } });
  return h('div', { class: `nota-tarjeta ${pendiente ? 'con-aviso' : ''}` },
    h('div', { class: 'nota-cabeza' },
      pendiente ? h('span', { class: 'etiqueta aviso' }, `Avisa ${cuandoLindo(n.cuando)}`) : n.cuando ? h('span', { class: 'etiqueta' }, `Avisó ${cuandoLindo(n.cuando)}`) : null,
      h('span', { class: 'nota' }, `Anotada ${cuandoLindo(n.creada)}`)),
    area,
    (n.app || n.titulo) ? h('div', { class: 'nota-contexto' }, h('span', { class: 'nota' }, 'Desde: '), n.app || '', n.titulo ? ` — ${n.titulo}` : '') : null,
    n.enlace ? h('div', { class: 'nota-contexto' }, boton('Abrir link', () => pedir('notas:abrir-enlace', n.id).catch((e) => avisarGuardado(e.message)), 'chico'), h('span', { class: 'nota enlace-texto', title: n.enlace }, n.enlace)) : null,
    n.tieneCaptura ? h('div', {}, boton(notasUI.verCaptura.has(n.id) ? 'Ocultar captura' : 'Ver captura', () => { if (notasUI.verCaptura.has(n.id)) notasUI.verCaptura.delete(n.id); else notasUI.verCaptura.add(n.id); pintar(); }, 'chico'), caja) : null,
    h('div', { class: 'fila nota-acciones' },
      h('label', { class: 'nota' }, 'Aviso: '), aviso,
      n.cuando ? selectorDeSonido(n.sonido, (v) => cambiarNota(n.id, { sonido: v })) : null,
      n.cuando ? boton('Quitar aviso', () => cambiarNota(n.id, { cuando: null }, true), 'chico') : null,
      boton('Agregar a Google Calendar', () => pedir('notas:calendar', n.id).catch((e) => avisarGuardado(e.message)), 'chico'),
      boton(notasUI.borrando === n.id ? '¿Borrar? Tocá de nuevo' : 'Borrar', async () => {
        if (notasUI.borrando !== n.id) { notasUI.borrando = n.id; pintar(); setTimeout(() => { if (notasUI.borrando === n.id) { notasUI.borrando = null; if (seccion === 'notas') pintar(); } }, 3500); return; }
        notasUI.borrando = null;
        try { await pedir('notas:borrar', n.id); notasLista = notasLista.filter((x) => x.id !== n.id); notasUI.capturas.delete(n.id); avisarGuardado('Nota borrada'); pintar(); } catch (e) { avisarGuardado(e.message); }
      }, 'chico peligro')));
}

// ---------- Panel del notch: los widgets de cada modo ----------
const panelUI = { modo: null, sel: null, arrastrando: null, sobre: null, quitado: null }; // quitado: lo último que se sacó, para poder volver a ponerlo
const widgetsDe = (m) => { m.panel = m.panel || {}; if (!Array.isArray(m.panel.widgets)) m.panel.widgets = []; m.panel.grilla = 4; return m.panel.widgets; };
const widgetsPorDefecto = () => [['texto', 4], ['novedades', 4], ['rutinas', 4], ['musica', 4], ['clip-grabar', 2], ['clip-guardar', 2], ['modos', 4]].map(([tipo, tam]) => normalizarWidget({ tipo, tam }));
const nuevoPanel = (clips, tipos) => ({ clips: !!clips, grilla: 4, widgets: tipos ? tipos.map(([tipo, tam]) => normalizarWidget({ tipo, tam })) : widgetsPorDefecto() });
const SE_OCULTA = { notas: 'se oculta si no hay notas', titulo: 'se oculta si no tiene texto', abrir: 'se oculta hasta que le pongas qué abrir', modo: 'se oculta hasta que elijas un modo', novedades: 'se oculta si no hay novedades', rutinas: 'se oculta si no hay acciones rápidas', clips: 'solo con los clips prendidos', 'clip-guardar': 'solo con los clips prendidos', 'clip-grabar': 'solo con los clips prendidos', 'clip-enviar': 'solo con los clips prendidos' };
const nombreDeWidget = (w) => {
  if (w.tipo === 'rutina') { const r = rutinas.find((x) => x.id === w.rutina); return r ? r.nombre : 'Rutina (elegí una)'; }
  if (w.tipo === 'frase') return w.nombre || w.texto || 'Atajo de voz (completalo)';
  if (w.tipo === 'abrir') return w.nombre || w.destino || 'Abrir (completalo)';
  if (w.tipo === 'modo') { const m = cfg.modos.find((x) => x.id === w.modo); return m ? `Modo ${m.nombre}` : 'Modo (elegí uno)'; }
  if (w.tipo === 'titulo') return w.texto ? `Título: ${w.texto}` : 'Título (escribilo)';
  return TIPOS[w.tipo].nombre;
};
const iconoDeWidget = (w) => (w.tipo === 'rutina' ? ((rutinas.find((x) => x.id === w.rutina) || {}).icono || 'estrella') : ['frase', 'abrir', 'modo'].includes(w.tipo) && w.icono ? w.icono : TIPOS[w.tipo].icono);

function mover(lista, desde, hasta) {
  if (desde < 0 || hasta < 0 || desde === hasta || hasta >= lista.length) return;
  lista.splice(hasta, 0, lista.splice(desde, 1)[0]);
}

function quitarWidget(m, id) {
  const lista = widgetsDe(m);
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) return;
  panelUI.quitado = { modo: m.id, widget: lista[i], indice: i };
  lista.splice(i, 1);
  if (panelUI.sel === id) panelUI.sel = null;
  guardar(); pintar();
}

// Le da a cada widget su lugar en la grilla (sin que se pisen) y deja la lista en orden de lectura.
function acomodar(m, primero = null) {
  const lista = widgetsDe(m);
  for (const x of empaquetar(lista.map((w) => normalizarWidget(w)), { primero })) {
    const w = lista.find((y) => y.id === x.id);
    if (w) { w.col = x.col; w.fila = x.fila; }
  }
  lista.sort((a, b) => a.fila - b.fila || a.col - b.col);
}
// Mueve un widget a una celda (col, fila); lo que había ahí se corre al primer hueco.
function ponerEn(m, w, col, fila) {
  w.col = Math.max(1, Math.min(col, COLUMNAS - w.tam + 1));
  w.fila = Math.max(1, fila);
  acomodar(m, w.id);
  guardar(); pintar();
}

function vistaDelPanel(m) {
  acomodar(m);
  const lista = widgetsDe(m);
  const ocupadas = new Set();
  for (const w of lista) for (let i = 0; i < w.tam; i++) for (let j = 0; j < (w.alto || 1); j++) ocupadas.add(`${w.col + i},${w.fila + j}`);
  const filasTotal = Math.max(0, ...lista.map((w) => w.fila + (w.alto || 1) - 1)) + 1; // una fila más: para soltar abajo de todo
  const celdas = [];
  for (let f = 1; f <= filasTotal; f++) for (let c = 1; c <= COLUMNAS; c++) {
    if (ocupadas.has(`${c},${f}`)) continue;
    celdas.push(h('div', {
      class: 'celda', style: `grid-column: ${c}; grid-row: ${f};`, 'aria-hidden': 'true',
      ondragover: (e) => { if (!panelUI.arrastrando) return; e.preventDefault(); e.currentTarget.classList.add('sobre'); },
      ondragleave: (e) => e.currentTarget.classList.remove('sobre'),
      ondrop: (e) => {
        e.preventDefault();
        const w = lista.find((x) => x.id === panelUI.arrastrando);
        panelUI.arrastrando = null; panelUI.sobre = null;
        if (w) ponerEn(m, w, c, f);
      },
    }));
  }
  const tiles = lista.map((w) => h('div', {
    class: `pw ${w.tam === 1 ? 'chico' : ''} ${w.alto === 2 ? 'alto' : ''} ${panelUI.sel === w.id ? 'sel' : ''} ${panelUI.sobre === w.id ? 'sobre' : ''}`, draggable: 'true', 'data-id': w.id,
    style: `grid-column: ${w.col} / span ${w.tam}; grid-row: ${w.fila} / span ${w.alto || 1};${w.color ? ` --wc:${w.color};` : ''}`,
    title: 'Arrastralo a otro lugar (también a los espacios vacíos) · tocalo para editarlo',
    onclick: () => { panelUI.sel = panelUI.sel === w.id ? null : w.id; pintar(); },
    ondragstart: (e) => { panelUI.arrastrando = w.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); setTimeout(() => e.target.closest && e.target.closest('.panel-vista') && e.target.closest('.panel-vista').classList.add('arrastrando'), 0); },
    ondragend: () => { panelUI.arrastrando = null; panelUI.sobre = null; pintar(); },
    ondragover: (e) => { if (!panelUI.arrastrando || panelUI.arrastrando === w.id) return; e.preventDefault(); if (panelUI.sobre !== w.id) { panelUI.sobre = w.id; e.currentTarget.parentNode.querySelectorAll('.pw').forEach((x) => x.classList.toggle('sobre', x.dataset.id === w.id)); } },
    ondrop: (e) => {
      e.preventDefault();
      const quien = lista.find((x) => x.id === panelUI.arrastrando);
      panelUI.arrastrando = null; panelUI.sobre = null;
      if (!quien || quien === w) return;
      // Intercambian lugares.
      const antes = { col: quien.col, fila: quien.fila };
      quien.col = Math.min(w.col, COLUMNAS - quien.tam + 1); quien.fila = w.fila;
      w.col = antes.col; w.fila = antes.fila;
      acomodar(m, quien.id); guardar(); pintar();
    },
  },
  h('span', { class: 'pw-icono', html: icono(iconoDeWidget(w), 18) }),
  h('span', { class: 'pw-nombre' }, nombreDeWidget(w)),
  w.tam > 2 ? h('small', {}, `${w.tam}×${w.alto || 1}`) : null,
  h('button', { type: 'button', class: 'pw-quitar', title: 'Quitar del panel', 'aria-label': `Quitar ${nombreDeWidget(w)}`, html: icono('cruz', 12), onclick: (e) => { e.stopPropagation(); quitarWidget(m, w.id); } })));
  return h('div', { class: 'panel-vista' },
    lista.length ? [...celdas, ...tiles] : h('div', { class: 'vacio', style: 'grid-column:1/-1' }, 'El panel de este modo está vacío: solo se ve la pastilla. Agregá widgets abajo.'),
    h('button', { type: 'button', class: 'pw-sumar', style: `grid-row: ${filasTotal + 1};`, onclick: () => { const p = document.getElementById('paleta-widgets'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, h('span', { html: icono('agregar', 16) }), 'Agregar widget'));
}

function barraDelWidget(m) {
  const lista = widgetsDe(m);
  const i = lista.findIndex((x) => x.id === panelUI.sel);
  if (i < 0) return null;
  const w = lista[i];
  const t = TIPOS[w.tipo];
  const campos = [];
  if (w.tipo === 'rutina') {
    campos.push(campo('Rutina', h('select', { onchange: (e) => { w.rutina = e.target.value; guardar(); pintar(); } },
      h('option', { value: '' }, 'Elegir…'), rutinas.map((r) => h('option', { value: r.id, selected: r.id === w.rutina }, r.nombre)))));
  }
  if (w.tipo === 'frase') {
    campos.push(campo('Nombre del botón', texto(w, 'nombre', () => { guardar(); }, { placeholder: 'Qué veo', onchange: () => pintar() })));
    campos.push(campo('Qué le dice a Jarvis', texto(w, 'texto', () => { guardar(); }, { placeholder: '¿Qué estoy viendo?', onchange: () => pintar() }), 'La frase tal cual la dirías. Por ejemplo "¿qué estoy viendo?", "poné música" o "modo juego".'));
    campos.push(campo('Ícono', h('div', { class: 'iconos-rutina' }, [...ICONOS_RUTINA, 'mic', 'nota', 'calendario'].map((n) => h('button', {
      type: 'button', class: `ficha ${w.icono === n ? 'on' : ''}`, title: n, html: icono(n, 18), onclick: () => { w.icono = n; guardar(); pintar(); },
    })))));
  }
  if (w.tipo === 'abrir') {
    campos.push(campo('Qué abre', texto(w, 'destino', () => { guardar(); }, { placeholder: 'Spotify, Valheim o youtube.com', onchange: () => pintar() }), 'El nombre de un programa (como lo buscarías en Inicio), un juego de Steam o una página web.'));
    campos.push(campo('Nombre del botón', texto(w, 'nombre', () => { guardar(); }, { placeholder: 'Opcional', onchange: () => pintar() })));
  }
  if (w.tipo === 'modo') {
    campos.push(campo('Modo', h('select', { onchange: (e) => { w.modo = e.target.value; guardar(); pintar(); } },
      h('option', { value: '' }, 'Elegir…'), cfg.modos.map((x) => h('option', { value: x.id, selected: x.id === w.modo }, x.nombre)))));
  }
  if (w.tipo === 'titulo') campos.push(campo('Texto', texto(w, 'texto', () => { guardar(); }, { placeholder: 'Juegos', onchange: () => pintar() })));
  if (w.tipo === 'abrir' || w.tipo === 'modo') {
    campos.push(campo('Ícono', h('div', { class: 'iconos-rutina' }, [...new Set([...ICONOS_RUTINA, 'trabajo', 'juego', 'musica', 'enviar', 'mail', 'whatsapp', 'carpeta', 'luna', 'silencio'])].map((n) => h('button', {
      type: 'button', class: `ficha ${(w.icono || TIPOS[w.tipo].icono) === n ? 'on' : ''}`, title: n, 'aria-label': `Ícono ${n}`, html: icono(n, 18), onclick: () => { w.icono = n; guardar(); pintar(); },
    })))));
  }
  const sinClips = DE_CLIPS.has(w.tipo) && !m.panel.clips;
  const altos = t.altos || [1];
  return h('div', { class: 'panel-barra' },
    h('div', { class: 'fila' }, h('b', {}, nombreDeWidget(w)), h('span', { class: 'nota' }, t.ayuda)),
    t.tams.length > 1 ? campo('Ancho', segmentado(w, 'tam', t.tams.map((n) => [n, `${NOMBRE_DE_TAM[n]} (${n}/4)`]), () => { w.tam = Number(w.tam); guardar(); pintar(); }, { porDefecto: t.tams[0] })) : null,
    altos.length > 1 ? campo('Alto', segmentado(w, 'alto', altos.map((n) => [n, NOMBRE_DE_ALTO[n]]), () => { w.alto = Number(w.alto); guardar(); pintar(); }, { porDefecto: 1 }), w.alto === 2 ? 'En doble alto muestra más: ícono grande, más eventos o notas, qué suena…' : null) : null,
    t.color ? campo('Color', h('div', { class: 'muestras', role: 'radiogroup', 'aria-label': 'Color del widget' }, COLORES_WIDGET.map((c) => h('button', {
      type: 'button', role: 'radio', class: `muestra ${c ? '' : 'auto'}`, style: c ? `--m:${c}` : '', title: c || 'El de los ojos', 'aria-label': c || 'El de los ojos', 'aria-checked': String((w.color || '') === c),
      onclick: () => { w.color = c; guardar(); pintar(); },
    })))) : null,
    ...campos,
    SE_OCULTA[w.tipo] ? h('p', { class: 'nota' }, `Ojo: ${SE_OCULTA[w.tipo]}.`) : null,
    sinClips ? h('p', { class: 'nota aviso' }, 'Este modo no graba clips, así que este botón no se va a ver. Prendelo en Modos ("Grabar clips en este modo") o en el selector de abajo.') : null,
    h('div', { class: 'fila' },
      boton('←', () => ponerEn(m, w, w.col - 1, w.fila), 'chico'),
      boton('→', () => ponerEn(m, w, w.col + 1, w.fila), 'chico'),
      boton('↑', () => ponerEn(m, w, w.col, w.fila - 1), 'chico'),
      boton('↓', () => ponerEn(m, w, w.col, w.fila + 1), 'chico'),
      boton('Quitar del panel', () => quitarWidget(m, w.id), 'chico peligro')));
}

function paletaDeWidgets(m) {
  const lista = widgetsDe(m);
  return h('div', { id: 'paleta-widgets' }, GRUPOS_DE_WIDGETS.flatMap((grupo) => [h('h3', { class: 'paleta-grupo' }, grupo), h('div', { class: 'paleta' }, Object.entries(TIPOS).filter(([, t]) => t.grupo === grupo).map(([tipo, t]) => {
    const puesto = t.unico ? lista.find((w) => w.tipo === tipo) : null; // los que van una sola vez: si ya están, se marcan (y al tocarlos se eligen)
    return h('button', {
      type: 'button', class: `paleta-item ${puesto ? 'puesto' : ''}`, title: puesto ? 'Ya está en el panel: tocalo para editarlo' : t.ayuda,
      onclick: () => {
        if (puesto) { panelUI.sel = puesto.id; pintar(); return; }
        const w = normalizarWidget({ tipo, tam: tamPorDefecto(tipo) });
        lista.push(w); panelUI.sel = w.id;
        if (panelUI.quitado && panelUI.quitado.widget.tipo === tipo) panelUI.quitado = null;
        guardar(); pintar();
      },
    }, h('span', { class: 'pi-icono', html: icono(t.icono, 18) }), h('span', { class: 'pi-texto' }, h('b', {}, t.nombre), h('small', {}, t.ayuda)),
    h('span', { class: 'pi-estado', html: puesto ? icono('tilde', 14) : icono('agregar', 14) }));
  }))]));
}

function avisoDeQuitado(m) {
  const q = panelUI.quitado;
  if (!q || q.modo !== m.id) return null;
  return h('div', { class: 'panel-deshacer' }, h('span', {}, `Sacaste «${nombreDeWidget(q.widget)}».`),
    boton('Volver a ponerlo', () => {
      const lista = widgetsDe(m);
      if (!(q.widget.tipo && TIPOS[q.widget.tipo].unico && lista.some((w) => w.tipo === q.widget.tipo))) lista.splice(Math.min(q.indice, lista.length), 0, q.widget);
      panelUI.sel = q.widget.id; panelUI.quitado = null; guardar(); pintar();
    }, 'chico'));
}

const secciones = {
  _general() {
    const vozElegida = cfg.habla.voz;
    const fraseDePrueba = () => (cfg.usuario ? `Hola, ${cfg.usuario}. Así sueno con esta voz.` : 'Hola. Así sueno con esta voz.');
    const botonProbar = boton('Probar', async () => {
      if (fuenteActual || speechSynthesis.speaking) { detenerPrueba(); speechSynthesis.cancel(); botonProbar.textContent = 'Probar'; return; } // segundo click: corta
      if (vozElegida === 'windows') {
        const frase = new SpeechSynthesisUtterance(fraseDePrueba());
        const es = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
        frase.voice = es.find((v) => /es-AR/i.test(v.lang)) || es.find((v) => /es-(MX|US|419)/i.test(v.lang)) || es[0] || null;
        frase.lang = frase.voice ? frase.voice.lang : 'es-AR';
        frase.onend = () => { botonProbar.textContent = 'Probar'; };
        speechSynthesis.speak(frase);
        botonProbar.textContent = 'Detener';
        return;
      }
      botonProbar.disabled = true;
      botonProbar.textContent = 'Preparando…';
      try {
        const { pcm, hz } = await pedir('voz:probar', vozElegida);
        reproducirPCM(pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm), hz, () => { botonProbar.textContent = 'Probar'; });
        botonProbar.textContent = 'Detener';
      } catch (e) {
        avisarGuardado(`No pude probar la voz: ${e.message}`);
        botonProbar.textContent = 'Probar';
      } finally {
        botonProbar.disabled = false;
      }
    }, 'chico');
    const opcionesDeVoz = [...(voces.voces || []).map((v) => ({ valor: v.id, nombre: v.nombre })), { valor: 'windows', nombre: 'La voz de Windows (más robótica, no baja nada)' }];
    const resultadoEscucha = h('span', { class: 'nota' });
    const botonEscucha = boton('Probar la escucha', async () => {
      botonEscucha.disabled = true;
      resultadoEscucha.className = 'nota aviso';
      resultadoEscucha.textContent = 'Hablá ahora, tenés 4 segundos…';
      try {
        const r = await pedir('oido:probar', 4);
        resultadoEscucha.className = `nota ${r.texto ? 'bien' : 'mal'}`;
        resultadoEscucha.textContent = r.texto ? `Entendí: "${r.texto}" (tardó ${(r.ms / 1000).toFixed(1)} s)` : 'No escuché ninguna palabra. Revisá el micrófono elegido.';
      } catch (e) {
        resultadoEscucha.className = 'nota mal';
        resultadoEscucha.textContent = e.message;
      }
      botonEscucha.disabled = false;
    }, 'chico');
    const resultadoAprender = h('span', { class: 'nota' });
    const botonAprender = boton('Escuchar cómo lo digo', async () => {
      botonAprender.disabled = true;
      resultadoAprender.className = 'nota aviso';
      resultadoAprender.textContent = 'Decí "Jarvis" ahora…';
      try {
        const r = await pedir('oido:aprender');
        if (!r.oido) { resultadoAprender.className = 'nota mal'; resultadoAprender.textContent = 'No escuché nada. Probá de nuevo, un poco más fuerte.'; }
        else if (r.yaLoReconoce) { resultadoAprender.className = 'nota bien'; resultadoAprender.textContent = `Entendí "${r.oido}": así ya te reconoce.`; }
        else if (r.forma) {
          const lista = String(cfg.voz.tambien || '').split(',').map((x) => x.trim()).filter(Boolean);
          cfg.voz.tambien = [...new Set([...lista, r.forma])].join(', ');
          await pedir('cfg:guardar', cfg);
          pintar();
          avisarGuardado(`Entendí "${r.oido}". Anoté "${r.forma}" como otra forma de tu "Jarvis".`);
          return;
        } else { resultadoAprender.className = 'nota mal'; resultadoAprender.textContent = `Entendí "${r.oido}", que no parece una sola palabra. Probá de nuevo diciendo solo "Jarvis".`; }
      } catch (e) { resultadoAprender.className = 'nota mal'; resultadoAprender.textContent = e.message; }
      botonAprender.disabled = false;
    }, 'chico');
    const errorDeVoz = voces.voz && voces.voz.error;
    const hablar = [
      h('h2', {}, 'Voz de Jarvis'),
      campo('Voz', [h('select', { onchange: (e) => {
        cfg.habla.voz = e.target.value; guardar();
        const m = (voces.modelos || {})[`voz-${cfg.habla.voz}`];
        if (m && !m.instalado && !m.bajando) pedir('modelos:bajar', `voz-${cfg.habla.voz}`).catch(() => {});
        pintar();
      } }, opcionesDeVoz.map((o) => h('option', { value: o.valor, selected: o.valor === vozElegida }, o.nombre))), botonProbar],
        'Las voces con nombre son neuronales y corren en esta PC. Dora y Alex (Kokoro) suenan más naturales, pero pesan 365 MB, tienen acento neutro (no argentino) y tardan un poco más en arrancar a hablar. Probalas y quedate con la que más te guste.'),
      vozElegida !== 'windows' ? campo('Estado de la voz', estadoDeModelo(`voz-${vozElegida}`)) : null,
      campo('Personalidad de esta voz', editorPersonalidad(vozElegida)),
      campo('Velocidad', deslizador(cfg.habla, 'velocidad', { min: 0.8, max: 1.4, step: 0.05, formato: (v) => `${Number(v).toFixed(2).replace('.', ',')}×`, porDefecto: 1 }, guardar)),
      campo('Volumen de Jarvis', deslizador(cfg, 'volumen', { min: 0.1, max: 1.5, step: 0.05, formato: (v) => `${Math.round(v * 100)} %`, porDefecto: 1 }, guardar),
        'Qué tan fuerte se escucha Jarvis en relación al resto de la PC.'),
      campo('Volumen de Windows', boton('Abrir el mezclador de volumen', () => pedir('windows:mezclador'), 'chico'),
        'Para subir o bajar Jarvis por separado del resto de los programas.'),
    ];
    const basico = [
      h('h1', {}, 'Básico'),
      h('p', { class: 'bajada' }, 'Tu nombre, tu ciudad y cómo arranca Jarvis. La voz con la que habla está en la pestaña Voz.'),
      campo('Cómo te llamás', texto(cfg, 'usuario', guardar, { placeholder: 'Tu nombre' })),
      campo('Nombre del asistente', texto(cfg, 'nombre', guardar, { placeholder: 'Jarvis' }),
        'Cómo querés llamarlo. Es también la palabra que lo despierta: "che <nombre>, poné música". Si es cortito (menos de 5 letras), decí un saludo antes ("che", "hey"). Después usá "Enseñarle" en la pestaña Escucha para que aprenda cómo lo decís vos.'),
      campo('Tu ciudad', texto(cfg, 'ciudad', guardar, { placeholder: 'Buenos Aires' }), 'Para preguntar "¿cómo está el clima?" o "¿va a llover mañana?" sin aclarar dónde. El clima sale de un servicio gratuito, sin clave.'),
      campo('Cámara', selector(cfg.camara, 'dispositivo', listas.camaras, guardar, 'La predeterminada')),
      h('h2', {}, 'Arranque'),
      campo('Atajo para hablar', texto(cfg, 'atajoHablar', guardar, { placeholder: 'Control+Alt+J' }), 'Funciona desde cualquier programa, también dentro de un juego.'),
      campo('Iniciar con Windows', [casilla(cfg, 'inicioConWindows', guardar), h('span', {}, 'Abrir Jarvis al encender la PC')]),
    ];
    const escucha = [
      h('h1', {}, 'Escucha'),
      h('p', { class: 'bajada' }, 'Cómo te escucha Jarvis y cuándo se despierta. Todo se transcribe en esta PC, sin mandar tu audio a ningún lado (salvo que elijas Groq).'),
      campo('Modelo de escucha', estadoDeModelo('oido'), 'Pasa tu voz a texto acá mismo, sin mandar el audio a ningún lado. Se baja una sola vez.'),
      campo('Detector de voz', estadoDeModelo('vad'), 'Nota cuándo empezás y cuándo terminás de hablar.'),
      errorDeVoz ? campo('Problema', h('span', { class: 'nota mal' }, errorDeVoz)) : null,
      campo('Micrófono', selector(cfg.voz, 'microfono', listas.microfonos, guardar, 'El predeterminado de Windows')),
      campo('Probar', [botonEscucha, resultadoEscucha]),
      campo('Dónde se transcribe', segmentado(cfg.escucha, 'motor', [['local', 'En esta PC'], ['groq', 'Groq']], guardar, { porDefecto: 'local' }),
        'En esta PC no hay límites y el audio no sale. Con Groq (más preciso; usa la clave de Inteligencia) el audio de cada pedido viaja a su servidor gratuito; si falla o se acaba el cupo, sigue con el de esta PC.'),
      campo('Después de contestar', segmentado(cfg.escucha, 'seguir', [['pregunta', 'Si me pregunta'], ['siempre', 'Siempre un rato'], ['nunca', 'Nunca']], guardar, { porDefecto: 'pregunta' }),
        'La mayoría de los pedidos no necesitan respuesta tuya ("poné música", "modo juego"): al terminar, Jarvis deja de escuchar. Si te hace una pregunta ("¿a quién se lo mando?"), espera tu respuesta. "Siempre un rato" sigue escuchando; "Nunca" exige volver a llamarlo.'),
      campo('Antes de actuar', segmentado(cfg.escucha, 'confirmar', [['dudas', 'Preguntar si duda'], ['nunca', 'Actuar directo']], guardar, { porDefecto: 'dudas' }),
        'Con "Preguntar", si Jarvis no está seguro (un mensaje o una foto que interpretó, o una rutina dicha distinto) te dice "Entendí tal cosa, ¿lo hago?" y contestás "sí" o "no" (también escrito). Cuando decís que sí a algo que entendió un modelo, Jarvis aprende esa frase y la próxima vez la hace directo.'),
      campo('WhatsApp a mis contactos', [casilla(cfg.escucha, 'confirmarAgendados', guardar, false), h('span', {}, 'Preguntar también cuando el contacto ya está agendado en Jarvis')],
        'Apagado (lo normal): si le pedís un mensaje o una foto a alguien que cargaste en Ajustes → WhatsApp → Contactos y grupos, Jarvis lo manda directo, sin repetirte lo que entendió. A quien no cargaste le sigue preguntando ("Entendí tal cosa, ¿lo hago?"). Solo cuenta si la opción de arriba está en "Preguntar si duda".'),
      campo('Ahorrar CPU en silencio', [casilla(cfg.voz, 'ahorro', guardar, true), h('span', {}, cfg.voz.ahorro === false ? 'No: el detector "Hey Jarvis" analiza el micrófono todo el tiempo' : 'Sí: el detector duerme mientras no se oye nada')],
        'En silencio no hace falta analizar el micrófono: el detector se despierta apenas se oye ruido y revisa también los últimos 2 segundos, así que no se pierde el principio de la frase. En pruebas detecta lo mismo y gasta bastante menos. Apagalo solo si notás que a veces no te escucha.'),
      campo('Llamarlo por su nombre', [casilla(cfg.voz, 'porTranscripcion', guardar, true), h('span', {}, 'Despertar diciendo "Jarvis", "che Jarvis" o "hey Jarvis", con tu acento')],
        'Pasa a texto en esta PC lo que se dice cerca del micrófono y se fija si lo nombran; no sale nada a internet. Si ya viene con el pedido ("Jarvis, poné música"), lo hace de una. Usa un poco de procesador cada vez que alguien habla: si lo notás en un juego, destildalo.'),
      avanzado('Ajustes finos de la escucha',
      campo('Cuánto espera', deslizador(cfg.escucha, 'segundosExtra', { min: 3, max: 30, step: 1, formato: (v) => `${v} s`, porDefecto: 8 }, guardar), 'Segundos sin que hables antes de dejar de escuchar.'),
      campo('Pausa que cierra la frase', deslizador(cfg.escucha, 'silencioMs', { min: 400, max: 1500, step: 50, formato: (v) => `${(v / 1000).toFixed(2).replace('.', ',')} s`, porDefecto: 800 }, guardar),
        'Cuánto silencio espera para dar por terminado el pedido. Más largo: te deja pensar más, pero tarda más en contestar.'),
      campo('Enseñarle tu "Jarvis"', [botonAprender, resultadoAprender],
        'Tocá el botón y decí solo "Jarvis", como te sale. Si lo que entiende no es una forma que ya conoce, la anota abajo. Repetilo dos o tres veces.'),
      campo('También responde a', texto(cfg.voz, 'tambien', guardar, { placeholder: 'Nada cargado' }),
        'Palabras, separadas por coma, que el oído escribe cuando decís "Jarvis". Podés borrar las que le hagan despertarse por error.'),
      esJarvis(cfg.nombre)
        ? campo('Detector clásico', [casilla(cfg.voz, 'palabraClave', guardar, true), h('span', { 'data-sin-nombre': '' }, '"Hey Jarvis" (entrenado con voces en inglés)')],
          'Casi no usa procesador, pero pide pronunciarlo a la inglesa. Pueden quedar los dos activos.')
        : h('p', { class: 'nota', 'data-sin-nombre': '' }, `El detector clásico solo reconoce "Hey Jarvis" en inglés, así que con el nombre "${cfg.nombre}" queda apagado: ${cfg.nombre} se despierta pasando a texto lo que oye (y aprende con "Enseñarle").`),
      !esJarvis(cfg.nombre) ? null : campo('Sensibilidad del clásico', (() => { const v = h('span', { class: 'valor' }, `${Math.round((1.1 - cfg.voz.umbral) * 100)} %`); return [h('input', { type: 'range', min: 0.2, max: 0.9, step: 0.05, value: 1.1 - cfg.voz.umbral, oninput: (e) => { cfg.voz.umbral = Math.round((1.1 - e.target.value) * 100) / 100; v.textContent = `${Math.round(e.target.value * 100)} %`; guardar(); } }), v]; })(),
        'Más a la derecha: se despierta más fácil (y también por error más seguido).'),
      campo('Frases aprendidas', listas.aprendido.length
        ? h('div', {}, listas.aprendido.slice(0, 30).map((x) => h('div', { class: 'fila', style: 'margin-bottom:4px' },
          h('span', {}, `"${x.dicho}" → ${x.nombre.replace(/_/g, ' ')}${x.args && x.args.contacto ? ` (${x.args.contacto})` : ''}`),
          boton('Olvidar', async () => { listas.aprendido = await pedir('aprendido:olvidar', x.clave).catch(() => listas.aprendido); pintar(); }, 'chico'))))
        : h('span', { class: 'nota' }, 'Todavía no aprendió ninguna.'))),
    ];
    return { basico, escucha, hablar };
  },

  inteligencia() {
    const busquedaEnInternet = () => {
      const entrada = h('input', { type: 'password', value: cfg.busqueda.tavily, placeholder: 'Opcional', oninput: (e) => { cfg.busqueda.tavily = e.target.value.trim(); guardar(); } });
      const resultado = h('span', { class: 'nota' });
      return [
        h('h2', {}, 'Buscar en internet'),
        h('p', { class: 'bajada' }, 'Para noticias, resultados y datos que cambian. Primero se intenta con la búsqueda web de Groq (usa la misma clave de arriba, no hay que hacer nada más). Si esa no está o no alcanza, con Tavily. Y sin ninguna clave queda Wikipedia, que no sabe de noticias pero sí de casi todo lo demás. El clima va aparte y no necesita nada.'),
        campo('Clave de Tavily', [entrada, boton('Ver', () => { entrada.type = entrada.type === 'password' ? 'text' : 'password'; }, 'chico')],
          h('span', {}, 'Opcional. Gratis, sin tarjeta, 1.000 búsquedas por mes: se saca en ', enlace('tavily.com', 'https://app.tavily.com'), '.')),
        campo('Estado', [boton('Probar', async (ev) => {
          ev.target.disabled = true;
          resultado.className = 'nota'; resultado.textContent = 'Buscando…';
          try {
            await pedir('cfg:guardar', cfg);
            const r = await pedir('buscar:probar');
            resultado.className = 'nota bien';
            resultado.textContent = `Funciona con ${r.fuente} (${(r.ms / 1000).toFixed(1)} s): ${r.texto}`;
          } catch (er) { resultado.className = 'nota mal'; resultado.textContent = er.message; }
          ev.target.disabled = false;
        }, 'chico'), resultado]),
      ];
    };
    const tarjeta = (id, titulo, descripcion, campos) => {
      const e = ia[id] || {};
      const resultado = h('span', { class: `nota ${e.error ? 'mal' : e.ok ? 'bien' : ''}` },
        e.error ? `No anduvo: ${e.error}` : e.ok ? `Funcionando (${e.modelo})` : '');
      const probar = boton('Probar', async (ev) => {
        ev.target.disabled = true;
        resultado.className = 'nota'; resultado.textContent = 'Probando…';
        try {
          await pedir('cfg:guardar', cfg);
          const r = await pedir('ia:probar', id);
          resultado.className = 'nota bien';
          resultado.textContent = `Funciona: respondió ${r.modelo} en ${(r.ms / 1000).toFixed(1)} s.`;
        } catch (er) { resultado.className = 'nota mal'; resultado.textContent = er.message; }
        ev.target.disabled = false;
      }, 'chico');
      const lugar = cfg.ia.orden.indexOf(id);
      const mover = (d) => { const o = cfg.ia.orden; o.splice(lugar, 1); o.splice(lugar + d, 0, id); guardar(); pintar(); };
      return [
        h('h2', {}, `${lugar + 1}. ${titulo}`),
        h('p', { class: 'bajada' }, descripcion),
        campos,
        campo('Estado', [probar, lugar > 0 ? boton('↑ Usar antes', () => mover(-1), 'chico') : null, lugar < cfg.ia.orden.length - 1 ? boton('↓ Usar después', () => mover(1), 'chico') : null, resultado]),
      ];
    };
    const clave = (obj, donde, nombreDelSitio) => {
      const entrada = h('input', { type: 'password', value: obj.clave, placeholder: 'Pegá acá la clave', oninput: (e) => { obj.clave = e.target.value.trim(); guardar(); } });
      return campo('Clave', [entrada, boton('Ver', () => { entrada.type = entrada.type === 'password' ? 'text' : 'password'; }, 'chico')],
        h('span', {}, 'Gratis, sin tarjeta: se saca en ', enlace(nombreDelSitio, donde), '. Se guarda solo en esta PC.'));
    };
    const tarjetas = {
      groq: () => tarjeta('groq', 'Groq', 'En la nube, gratis y muy rápido (contesta en menos de un segundo). Tiene un cupo diario generoso para uso personal; si algún día se acaba, Jarvis pasa solo al siguiente. También puede mirar por la webcam.', [
        clave(cfg.ia.groq, 'https://console.groq.com/keys', 'console.groq.com'),
        campo('Modelo', texto(cfg.ia.groq, 'modelo', guardar, { placeholder: 'Automático' }), 'Vacío: Jarvis prueba solo los modelos gratuitos, de mejor a más liviano.'),
      ]),
      gemini: () => tarjeta('gemini', 'Gemini (modelos de texto)', 'La misma clave de Google AI Studio que ya tenías. Acá no se usa la voz en vivo (que casi no tiene cupo gratis) sino los modelos de texto, que tienen cientos de pedidos gratis por día. También puede mirar por la webcam.', [
        clave(cfg.ia.gemini, 'https://aistudio.google.com/apikey', 'Google AI Studio'),
        campo('Modelo', texto(cfg.ia.gemini, 'modelo', guardar, { placeholder: 'Automático' }), 'Vacío: Jarvis le pregunta a Google qué modelos hay y elige los de mayor cupo gratuito.'),
      ]),
      ollama: () => tarjeta('ollama', 'Ollama (en esta PC)', 'Un modelo corriendo en tu propia PC: sin internet, sin clave y sin ningún límite. Hay que instalar Ollama y bajar un modelo que soporte herramientas. Ojo: mientras piensa usa la placa de video, así que en medio de un juego conviene que conteste uno de los de arriba.', [
        campo('Programa', h('span', {}, 'Se instala desde ', enlace('ollama.com', 'https://ollama.com/download'), '; los modelos que sirven están en ', enlace('ollama.com/search?c=tools', 'https://ollama.com/search?c=tools'), '.')),
        campo('Modelo', [selector(cfg.ia.ollama, 'modelo', modelosOllama, guardar, modelosOllama.length ? 'El primero que encuentre' : 'Ollama no está andando'),
          boton('Buscar de nuevo', async () => { modelosOllama = await pedir('ia:ollama').catch(() => []); pintar(); }, 'chico')]),
        campo('Dirección', texto(cfg.ia.ollama, 'url', guardar, { placeholder: 'http://127.0.0.1:11434' })),
      ]),
    };
    return [
      h('h1', {}, 'Inteligencia'),
      h('p', { class: 'bajada' }, 'Los pedidos de todos los días (rutinas, modos, música, volumen, abrir programas, recordatorios simples) Jarvis los entiende solo, sin ningún modelo. Para lo demás —pedidos libres, redactar un WhatsApp, preguntas— usa un modelo de los de abajo: todos gratuitos, y se prueban en este orden hasta que uno conteste. Con uno solo configurado alcanza.'),
      cfg.ia.orden.filter((id) => tarjetas[id]).map((id) => tarjetas[id]()),
      busquedaEnInternet(),
    ];
  },

  apariencia() {
    // [C21] Muestras de color listas para elegir, más el selector libre.
    const MUESTRAS = { colorOjos: ['#8BE9FF', '#6EE787', '#FFC857', '#FF8FA3', '#C3A6FF', '#FFFFFF'], colorFondo: ['#000000', '#101418', '#1B1F2A', '#1A1423', '#0F1F1A', '#F2F2F2'] };
    const color = (clave) => {
      const libre = h('input', { type: 'color', value: cfg.apariencia[clave], 'aria-label': 'Otro color', title: 'Otro color', oninput: (e) => { cfg.apariencia[clave] = e.target.value; guardar(); pintarMuestras(); } });
      const caja = h('div', { class: 'muestras', role: 'radiogroup' });
      const pintarMuestras = () => caja.replaceChildren(...MUESTRAS[clave].map((c) => h('button', {
        type: 'button', role: 'radio', class: 'muestra', style: `--m:${c}`, title: c, 'aria-label': c,
        'aria-checked': String(String(cfg.apariencia[clave]).toLowerCase() === c.toLowerCase()),
        onclick: () => { cfg.apariencia[clave] = c; libre.value = c; guardar(); pintarMuestras(); },
      })), libre);
      pintarMuestras();
      return caja;
    };
    // [C20] Todos los deslizadores muestran su valor.
    const pct = (v) => `${Math.round(Number(v) * 100)} %`;
    const opacidad = (clave) => deslizador(cfg.apariencia, clave, { min: 0.1, max: 1, step: 0.05, formato: pct, porDefecto: 1 }, guardar);
    return [
      h('h1', {}, 'Apariencia'),
      h('p', { class: 'bajada' }, 'Los cambios se ven al instante en el notch. Para moverlo, arrastralo desde los ojos.'),
      campo('Color de los ojos', color('colorOjos')),
      campo('Color de fondo', color('colorFondo')),
      campo('Tamaño', deslizador(cfg.apariencia, 'escala', { min: 0.8, max: 1.5, step: 0.05, formato: pct, porDefecto: 1 }, guardar)),
      h('h2', {}, 'Transparencia'),
      campo('Fondo', opacidad('opacidadFondo'), 'Qué tan sólido se ve el fondo negro (o del color que elijas) detrás de todo.'),
      campo('Ojos', opacidad('opacidadOjos'), 'Transparencia de los ojos solos.'),
      campo('Todo el notch', opacidad('opacidadNotch'), 'Transparencia general: afecta fondo, ojos y el panel cuando está abierto.'),
      campo('Bailar', [casilla(cfg.apariencia, 'ojosBailan', guardar, true), h('span', {}, 'Bailar al ritmo de la música')], 'Con música sonando y Jarvis sin hacer otra cosa, los ojos se mueven con los graves.'),
      campo('Caras', [casilla(cfg.apariencia, 'caras', guardar, true), h('span', {}, 'Cambiar de cara según lo que dice')], 'Mientras habla, los ojos acompañan cada frase: contento si es una buena noticia, triste si es mala, sorprendido cuando aprende algo.'),
      campo('Posición', boton('Volver arriba al centro', () => jarvis.enviar('notch:centrar'))),
    ];
  },

  modos() {
    const idNuevo = () => {
      let n = 1;
      while (cfg.modos.some((m) => m.id === `modo_${n}`)) n++;
      return `modo_${n}`;
    };
    // Qué aparece en el panel del notch al pasar el mouse, en cada modo.
    const panelDe = (m) => { m.panel = { ...(m.panel || {}) }; if (!Array.isArray(m.panel.widgets)) { m.panel.widgets = widgetsPorDefecto(); m.panel.grilla = 4; } return m.panel; };
    const tarjetas = cfg.modos.map((m, i) => {
      const panel = panelDe(m);
      return h('div', { class: 'tarjeta-modo' },
        h('div', { class: 'fila' },
          texto(m, 'nombre', guardar, { placeholder: 'Nombre' }),
          botonQuitar(async () => {
            if (cfg.modos.length <= 1) { avisarGuardado('Tiene que quedar al menos un modo'); return; }
            if (!await confirmar({ titulo: `¿Quitar el modo "${m.nombre}"?`, texto: 'Se pierden su configuración y el diseño de su panel.', si: 'Quitar', peligro: true })) return;
            cfg.modos.splice(i, 1);
            if (cfg.modo === m.id) cfg.modo = cfg.modos[0].id;
            guardar(); pintar();
          }, `el modo ${m.nombre}`)),
        h('div', { class: 'interruptores' },
          [['habla', 'Jarvis habla', true, m], ['visible', 'Notch visible', true, m], ['enBarra', 'En la barra del notch', true, m], ['clips', 'Graba clips', false, panel]]
            .map(([clave, nombre, def, obj]) => h('label', { class: 'opcion' }, casilla(obj, clave, guardar, def), h('span', {}, nombre)))),
        h('div', { class: 'fila' }, boton('Diseñar el panel de este modo', () => { panelUI.modo = m.id; panelUI.sel = null; irA('panel'); }, 'chico')));
    });
    return [
      h('h1', {}, 'Modos'),
      h('p', { class: 'bajada' }, 'Cada modo dice si Jarvis habla, si el notch se ve, si graba clips y qué widgets muestra el panel al pasar el mouse (se arman en Panel). Si sacás un modo de la barra del notch, sigue existiendo: lo podés poner por voz ("modo silencio") o con una rutina.'),
      ...tarjetas,
      h('div', { class: 'fila' },
        boton('Agregar modo', () => { cfg.modos.push({ id: idNuevo(), nombre: 'Nuevo modo', habla: true, visible: true, panel: nuevoPanel(false) }); guardar(); pintar(); }, 'chico'),
        cfg.modos.some((m) => m.id === 'juego') ? null : boton('Agregar modo Juego', () => { cfg.modos.splice(1, 0, { id: 'juego', nombre: 'Juego', habla: true, visible: true, panel: nuevoPanel(true, [['texto', 4], ['musica', 4], ['clip-grabar', 2], ['clip-guardar', 2], ['modos', 4]]) }); guardar(); pintar(); }, 'chico')),
    ];
  },

  rutinas() {
    if (elegida >= rutinas.length) elegida = Math.max(0, rutinas.length - 1);
    const r = rutinas[elegida];
    const lista = h('div', { class: 'lista-rutinas' },
      rutinas.map((x, i) => h('button', { class: `item${i === elegida ? ' elegido' : ''}`, onclick: () => { elegida = i; pintar(); } }, h('span', { html: icono(x.icono, 18) }), x.nombre || 'Sin nombre')),
      boton('Nueva rutina', () => {
        rutinas.push({ id: `rutina_${Date.now().toString(36)}`, nombre: 'Nueva rutina', icono: 'estrella', rapida: true, pasos: [] });
        elegida = rutinas.length - 1; guardarRutinas(); pintar();
      }, 'chico'));
    return [
      h('h1', {}, 'Rutinas'),
      h('p', { class: 'bajada' }, 'Una rutina es una lista de pasos con nombre. Se activa por voz ("Hey Jarvis, modo juego") o con un click en las acciones rápidas del notch.'),
      h('div', { class: 'dos' }, lista, r ? editorRutina(r) : h('div', { class: 'vacio' }, 'Creá tu primera rutina.')),
    ];
  },

  dispositivos() {
    const medios = listas.entidades.filter((e) => e.entidad.startsWith('media_player.')).map((e) => ({ valor: e.entidad, nombre: `${e.nombre} (${e.entidad})` }));
    const todas = listas.entidades.filter((e) => /^(light|switch|fan|scene|script|input_boolean|cover)\./.test(e.entidad)).map((e) => ({ valor: e.entidad, nombre: `${e.nombre} (${e.entidad})` }));
    const estadoHA = h('span', { class: 'nota' });
    return [
      h('h1', {}, 'Dispositivos'),
      h('p', { class: 'bajada' }, 'Las teles y parlantes con Chromecast se controlan directo desde la PC. Luces, enchufes y el apagado real de las teles pasan por Home Assistant, que es opcional.'),
      h('h2', {}, 'Teles y parlantes'),
      h('p', { class: 'bajada' }, 'Poneles el nombre con el que las vas a pedir ("tele comedor") y elegí a qué dispositivo corresponde. Para que entienda otras formas, separalas con coma: "Tele Comedor, la tele grande". No hace falta poner "Telecomedor": las palabras pegadas las entiende solo.'),
      tabla(cfg.teles, [
        { titulo: 'Cómo la llamás', control: (t) => texto(t, 'nombre', guardar, { placeholder: 'tele comedor, living', title: 'Podés poner varios nombres separados por coma: Jarvis entiende cualquiera y dice el primero.' }) },
        { titulo: 'Dispositivo en la red', control: (t) => selector(t, 'cast', listas.cast.map((d) => ({ valor: d.nombre, nombre: d.modelo ? `${d.nombre} · ${d.modelo}` : d.nombre })), guardar) },
        { titulo: 'En Home Assistant (opcional)', control: (t) => (medios.length ? selector(t, 'entidadHA', medios, guardar, 'Ninguno') : texto(t, 'entidadHA', guardar, { placeholder: 'media_player.tele' })) },
      ], guardar, { accion: (t) => botonVinculo(t), nuevo: () => ({ nombre: '', cast: '', entidadHA: '' }), vacio: listas.cast.length ? `Encontré ${listas.cast.length} en tu red. Agregá las que quieras usar.` : 'Todavía no encontré ninguno en la red.' }),
      vinculo.nombre ? cajaDeCodigo() : null,
      h('div', { class: 'fila', style: 'margin-top:8px' }, boton('Buscar de nuevo', async () => { listas.cast = await pedir('cast:lista').catch(() => []); pintar(); }, 'chico'),
        h('span', { class: 'nota' }, listas.cast.length ? `En la red: ${listas.cast.map((d) => d.nombre).join(', ')}` : 'La primera vez Windows puede preguntar si deja a Jarvis usar la red: hay que aceptar.')),
      h('h2', {}, 'Home Assistant'),
      campo('Dirección', texto(cfg.homeAssistant, 'url', guardar, { placeholder: 'http://192.168.0.50:8123' })),
      campo('Token de larga duración', h('input', { type: 'password', value: cfg.homeAssistant.token, oninput: (e) => { cfg.homeAssistant.token = e.target.value.trim(); guardar(); } }),
        'Se crea en Home Assistant: tu perfil > Seguridad > Tokens de acceso de larga duración.'),
      h('div', { class: 'fila', style: 'margin:10px 0' }, boton('Probar conexión', async () => {
        estadoHA.className = 'nota'; estadoHA.textContent = 'Probando…';
        try {
          await pedir('cfg:guardar', cfg); await pedir('ha:probar');
          listas.entidades = await pedir('ha:entidades');
          pintar();
        } catch (e) { estadoHA.className = 'nota mal'; estadoHA.textContent = e.message; }
      }), estadoHA, listas.entidades.length ? h('span', { class: 'nota bien' }, `Conectado: ${listas.entidades.length} entidades.`) : null),
      h('h2', {}, 'Casa'),
      tabla(cfg.casa, [
        { titulo: 'Cómo lo llamás', control: (d) => texto(d, 'nombre', guardar, { placeholder: 'luz del cuarto' }) },
        { titulo: 'Entidad de Home Assistant', control: (d) => (todas.length ? selector(d, 'entidad', todas, guardar) : texto(d, 'entidad', guardar, { placeholder: 'light.cuarto' })) },
      ], guardar, { nuevo: () => ({ nombre: '', entidad: '' }), vacio: 'Sin luces ni enchufes cargados.' }),
    ];
  },

  pc() {
    return [
      h('h1', {}, 'PC'),
      h('p', { class: 'bajada' }, 'Nombres cortos para lo que Jarvis maneja en esta computadora.'),
      h('h2', {}, 'Salidas de audio'),
      h('p', { class: 'bajada' }, 'Para decir "cambiá a auriculares" o usarlo en una rutina.'),
      listas.errorSalidas ? h('p', { class: 'nota mal' }, `No pude leer las salidas de audio de Windows: ${listas.errorSalidas}`) : null,
      tabla(cfg.salidasAudio, [
        { titulo: 'Cómo la llamás', control: (s) => texto(s, 'nombre', guardar, { placeholder: 'auriculares' }) },
        { titulo: 'Dispositivo de Windows', control: (s) => selector(s, 'dispositivo', listas.salidas.map((x) => x.nombre), guardar) },
      ], guardar, {
        nuevo: () => ({ nombre: '', dispositivo: '' }), vacio: 'Sin salidas cargadas.',
        accion: (s) => boton('Probar', async (e) => {
          e.target.disabled = true;
          try { avisarGuardado(await pedir('paso:probar', { tipo: 'salida_audio', salida: s.dispositivo || s.nombre })); } catch (er) { avisarGuardado(er.message); }
          e.target.disabled = false;
        }, 'chico'),
      }),
      h('h2', {}, 'Programas'),
      h('p', { class: 'bajada' }, `Todo lo que aparece en el menú Inicio (${listas.programas.length} programas) ya se puede abrir por nombre. Acá solo hace falta cargar los que no estén ahí o necesiten argumentos.`),
      tabla(cfg.programas, [
        { titulo: 'Nombre', control: (p) => texto(p, 'nombre', guardar, { placeholder: 'Afterburner' }) },
        { titulo: 'Ruta del .exe o acceso directo', control: (p) => texto(p, 'ruta', guardar, { placeholder: 'C:\\Program Files (x86)\\MSI Afterburner\\MSIAfterburner.exe' }) },
        { titulo: 'Argumentos', control: (p) => texto(p, 'argumentos', guardar) },
      ], guardar, {
        nuevo: () => ({ nombre: '', ruta: '', argumentos: '' }), vacio: 'Sin programas propios.',
        accion: (p) => boton('Probar', async () => { try { avisarGuardado(await pedir('paso:probar', { tipo: 'abrir', programa: p.nombre })); } catch (er) { avisarGuardado(er.message); } }, 'chico'),
      }),
    ];
  },

  whatsapp() {
    const w = whatsapp;
    const textos = {
      apagado: ['Sin vincular', ''], conectando: ['Conectando…', ''], qr: ['Esperando que escanees el código', 'aviso'],
      conectado: [`Vinculado${w.numero ? ` al +${w.numero}` : ''}`, 'bien'], error: ['Error', 'mal'],
    }[w.fase] || ['', ''];
    return [
      h('h1', {}, 'WhatsApp'),
      h('p', { class: 'bajada' }, 'Jarvis se suma como un dispositivo vinculado más, igual que WhatsApp Web, pero sin abrir ninguna ventana: manda los mensajes por detrás aunque estés en un juego. Los mensajes salen del número que escanee el código.'),
      lineaDeAvisos('whatsapp'),
      campo('Estado', [h('span', { class: `nota ${textos[1]}` }, textos[0]),
        w.fase === 'apagado' || w.fase === 'error' ? boton('Vincular', async () => { whatsapp = { fase: 'conectando' }; pintar(); await pedir('wa:vincular').catch((e) => avisarGuardado(e.message)); }, 'principal') : null,
        w.fase !== 'apagado' ? boton('Desvincular', () => pedir('wa:desvincular').catch((e) => avisarGuardado(e.message)), 'peligro') : null],
      w.error ? h('span', { class: 'nota mal' }, w.error) : null),
      w.fase === 'qr' && w.qr ? h('div', {},
        h('div', { class: 'qr' }, h('img', { src: w.qr, alt: 'Código QR para vincular WhatsApp' })),
        h('ol', { class: 'pasos-qr' }, h('li', {}, 'Abrí WhatsApp en el celular.'), h('li', {}, 'Ajustes > Dispositivos vinculados > Vincular un dispositivo.'), h('li', {}, 'Escaneá este código.'))) : null,
      w.fase === 'conectado' ? campo('Webcam', boton('Mandarme una foto de la webcam', async (e) => {
        e.target.disabled = true;
        try { avisarGuardado(await pedir('paso:probar', { tipo: 'foto_whatsapp', contacto: 'yo', epigrafe: 'Foto de prueba de Jarvis' })); } catch (er) { avisarGuardado(er.message); }
        e.target.disabled = false;
      }, 'chico'), 'Te llega a tu propio chat de WhatsApp. Por voz: "Hey Jarvis, mandame una foto" o "mandale una foto a Eva". No usa ningún modelo de inteligencia.') : null,
      campo('Marca de Jarvis', texto(cfg.firma, 'whatsapp', guardar, { placeholder: 'Sin marca', style: 'max-width:120px' }),
        'Va adelante de todo lo que manda Jarvis por WhatsApp (mensajes y fotos), para que se note que no lo tipeaste vos. Vacío: sin marca.'),
      campo('Notas de voz', [casilla(cfg.audios || (cfg.audios = { revisar: true }), 'revisar', guardar), h('span', {}, 'Escuchar mi audio y confirmar antes de mandarlo')],
        'Por voz: "mandale un audio a Eva". Jarvis graba con tu micrófono hasta que te quedás callado, te lo reproduce y manda con tu "sí" (con "no" lo descarta). Sale con tu voz, no con la de Jarvis.'),
      h('h2', {}, 'Contactos y grupos'),
      h('p', { class: 'bajada' }, 'Jarvis le puede escribir a cualquier contacto o grupo de tu WhatsApp por el nombre con el que lo tenés agendado ("mandale a Laura Gómez…", "mandá una foto al grupo Casa"). Acá cargás solo a los que querés nombrar de otra forma —un apodo— o a los que querés elegirles si avisan cuando escriben.'),
      campo('Tu agenda', [
        h('span', { class: `nota ${agenda.contactos || agenda.grupos ? 'bien' : ''}` }, agenda.contactos || agenda.grupos ? `Leí ${agenda.contactos} contactos y ${agenda.grupos} grupos de tu WhatsApp` : 'Todavía no leí tu agenda'),
        w.fase === 'conectado' ? boton('Leer mis contactos', async (e) => {
          e.target.disabled = true; e.target.textContent = 'Leyendo…';
          try { const r = await pedir('wa:releer'); agenda = r; avisarGuardado(r.aviso || `Listo: ${r.contactos} contactos y ${r.grupos} grupos.`); } catch (er) { avisarGuardado(`No pude leer la agenda: ${er.message}`); }
          pintar();
        }, 'chico') : null,
      ], 'Los nombres y números quedan guardados solo en esta PC. WhatsApp manda la agenda completa al vincular; si acá faltan contactos, desvinculá y volvé a vincular. En "Cómo lo llamás" podés poner varios nombres separados por coma ("Eva, mi hermana, Evi"): Jarvis entiende cualquiera, pero siempre dice el primero.'),
      buscadorDeAgenda(),
      tabla(cfg.contactos, [
        { titulo: 'Cómo lo llamás', control: (c) => texto(c, 'nombre', guardar, { placeholder: 'Eva, mi hermana, Evi', title: 'Podés poner varios nombres separados por coma: Jarvis entiende cualquiera y siempre dice el primero.' }) },
        { titulo: 'Quién es', control: (c) => {
          if (!c.jid) return texto(c, 'numero', guardar, { placeholder: '+54 9 11 2345 6789' });
          const a = agenda.lista.find((x) => x.jid === c.jid);
          return h('span', { class: 'quien', title: c.jid }, a ? `${a.nombre}${a.grupo ? ' (grupo)' : a.telefono ? ` · +${a.telefono}` : ''}` : (c.jid.endsWith('@g.us') ? 'Un grupo' : `+${c.jid.split('@')[0]}`));
        } },
        { titulo: 'Cuando escribe', control: (c) => h('select', { onchange: (e) => { c.avisar = e.target.value; guardar(); } },
          [['', 'Según las reglas'], ['siempre', 'Avisar siempre'], ['nunca', 'No avisar']].map(([valor, nombre]) => h('option', { value: valor, selected: (c.avisar || '') === valor }, nombre))) },
      ], guardar, {
        nuevo: () => ({ nombre: '', numero: '', avisar: '' }), vacio: 'Nadie cargado todavía.', agregar: 'Agregar con un número',
        accion: (c) => boton('Enviar prueba', async (e) => {
          e.target.disabled = true;
          try { await pedir('cfg:guardar', cfg); avisarGuardado(await pedir('paso:probar', { tipo: 'whatsapp', contacto: c.nombre, mensaje: 'Prueba de Jarvis: si te llegó esto, funciona.' })); } catch (er) { avisarGuardado(er.message); }
          e.target.disabled = false;
        }, 'chico'),
      }),
      h('p', { class: 'nota' }, '"Cuando escribe" manda sobre el modo de Notificaciones: "Avisar siempre" cuenta como elegido (avisa aunque la fuente esté en "Solo lo que elijas") y "No avisar" lo calla siempre. Para elegir a varios de una vez o ver quién te escribió sin avisarte, andá a Notificaciones.'),
    ];
  },

  mail() {
    const estadoDe = (id) => {
      const e = correo[id] || {};
      return h('span', { class: `nota ${e.error ? 'mal' : e.ok ? 'bien' : ''}` }, e.error || (e.ok ? 'Conectado y revisando' : e.configurada ? 'Configurado' : 'Sin configurar'));
    };
    const probar = (id) => boton('Probar', async (ev) => {
      ev.target.disabled = true;
      try { await pedir('cfg:guardar', cfg); avisarGuardado(await pedir('correo:probar', id)); } catch (er) { avisarGuardado(er.message); }
      correo = await pedir('correo:estado').catch(() => correo);
      ev.target.disabled = false; pintar();
    }, 'chico');
    const claveGmail = h('input', { type: 'password', value: cfg.correo.gmail.clave, placeholder: 'abcd efgh ijkl mnop', oninput: (e) => { cfg.correo.gmail.clave = e.target.value.trim(); guardar(); } });
    const conectada = !!(correo.outlook && correo.outlook.configurada && !cfg.correo.outlook.web);
    const webConectada = !!cfg.correo.outlook.web;
    return [
      h('h1', {}, 'Mail'),
      h('p', { class: 'bajada' }, 'Jarvis revisa la bandeja de entrada cada tanto y te avisa de lo nuevo (qué avisa y cómo, se elige en Notificaciones). Leer es solo lectura: no marca nada como leído ni borra. Enviar, únicamente cuando vos contestás un aviso desde el notch (click en la novedad, dictás o escribís, y Enter).'),
      lineaDeAvisos('mail'),
      h('h2', {}, 'Gmail'),
      campo('Dirección', texto(cfg.correo.gmail, 'usuario', guardar, { placeholder: 'vos@gmail.com' })),
      campo('Contraseña de aplicación', [claveGmail, boton('Ver', () => { claveGmail.type = claveGmail.type === 'password' ? 'text' : 'password'; }, 'chico')],
        h('span', {}, 'No es tu contraseña de Google: es una clave de 16 letras que generás vos en ', enlace('myaccount.google.com/apppasswords', 'https://myaccount.google.com/apppasswords'), ' (necesita tener activada la verificación en dos pasos). Se guarda solo en esta PC y la podés anular cuando quieras desde esa misma página.')),
      campo('Solo lo importante', [casilla(cfg.correo.gmail, 'soloPrincipal', guardar, true), h('span', {}, 'Solo la pestaña "Principal" (sin promociones ni redes)')]),
      campo('Estado', [probar('gmail'), estadoDe('gmail')]),
      campo('Pie de las respuestas', texto(cfg.firma, 'mail', guardar, { placeholder: 'Sin pie' }), 'Se agrega al final de cada mail que contestás con Jarvis. La respuesta sale desde tu dirección de Gmail.'),
      h('h2', {}, 'Hotmail / Outlook'),
      h('p', { class: 'bajada' }, 'Microsoft no deja que una app lea una cuenta personal con contraseña, ni sin registrar una "aplicación" en Azure (que una cuenta personal no puede crear). Hay dos caminos que sí funcionan:'),
      h('h3', {}, 'A. Entrar por el navegador de Jarvis (experimental)'),
      h('p', { class: 'bajada' }, 'Jarvis abre Outlook en una ventana oculta (su propio navegador, aparte de tu Chrome), con tu sesión, lee la lista de mensajes cada pocos minutos y la cierra. Vos iniciás sesión una sola vez en una ventana visible: Jarvis no ve ni guarda tu contraseña, solo queda la sesión del navegador en la carpeta de datos. Es lectura de la página, así que si Microsoft cambia su diseño puede dejar de encontrar los mensajes (el botón "Probar" te lo dice). Las condiciones de Microsoft pueden no ver con buenos ojos el acceso automático: es tu cuenta y tu decisión.'),
      campo('Sesión', [
        webConectada ? h('span', { class: 'nota bien' }, 'Sesión iniciada') : null,
        boton(webConectada ? 'Iniciar sesión de nuevo' : 'Iniciar sesión en Outlook', async (ev) => {
          ev.target.disabled = true;
          try { const r = await pedir('correo:outlookWeb'); avisarGuardado(r && r.yaAbierta ? 'La ventana de Outlook ya está abierta.' : 'Se abrió una ventana de Outlook: entrá con tu cuenta y listo, se cierra sola.'); } catch (er) { avisarGuardado(er.message); }
          ev.target.disabled = false;
        }, webConectada ? 'chico' : 'chico principal'),
        webConectada ? boton('Salir', async () => { await pedir('correo:desconectarOutlookWeb'); correo = await pedir('correo:estado').catch(() => correo); cfg = await pedir('cfg:leer'); pintar(); }, 'peligro chico') : null,
      ], 'Se revisa cada unos 3 minutos como mínimo, y abre la bandeja un instante en una ventana oculta. Los avisos funcionan como los de Gmail (click para abrir Outlook en tu navegador); contestar desde el notch todavía no.'),
      webConectada ? campo('Estado', [probar('outlook'), estadoDe('outlook')]) : null,
      h('h3', {}, 'B. Que Hotmail reenvíe a tu Gmail'),
      h('p', { class: 'bajada' }, 'Más estable y sin ventanas. Jarvis reconoce lo reenviado y lo marca como de Hotmail. Pasos:'),
      h('ol', { class: 'pasos' },
        h('li', {}, 'Escribí abajo tu dirección de Hotmail/Outlook (si tenés varias, separalas con coma).'),
        h('li', {}, 'Tocá "Abrir el reenvío de Outlook", activá el reenvío, poné tu Gmail y dejá tildado "Conservar una copia".'),
        h('li', {}, 'Listo: lo que llegue a Hotmail aparece como novedad (aunque Gmail lo mande a Promociones), y al hacer click se abre en Outlook, no en Gmail.')),
      campo('Mi Hotmail / Outlook', [texto(cfg.correo.outlook, 'usuario', guardar, { placeholder: 'vos@hotmail.com' }), boton('Abrir el reenvío de Outlook', () => pedir('abrir:enlace', 'https://outlook.live.com/mail/0/options/mail/forwarding'), 'chico')],
        'Solo para reconocer lo reenviado. Si en Gmail algo reenviado cae en Spam, abrilo una vez y tocá "No es spam".'),
      h('details', { class: 'avanzado', open: conectada || !!cfg.correo.outlook.idAplicacion },
        h('summary', {}, 'Conexión directa (solo si tenés una cuenta con directorio de Microsoft Entra)'),
        campo('Id de aplicación', texto(cfg.correo.outlook, 'idAplicacion', guardar, { placeholder: '00000000-0000-0000-0000-000000000000' }),
          'El "Id. de aplicación (cliente)" de un registro de aplicación con cuentas personales y flujos de cliente público habilitados.'),
        campo('Permiso', [
          conectada ? h('span', { class: 'nota bien' }, 'Cuenta conectada') : null,
          boton(conectada ? 'Conectar de nuevo' : 'Conectar', async (ev) => {
            ev.target.disabled = true;
            try { await pedir('cfg:guardar', cfg); codigoMicrosoft = await pedir('correo:conectarOutlook'); } catch (er) { codigoMicrosoft = null; avisarGuardado(er.message); }
            ev.target.disabled = false; pintar();
          }, 'chico'),
          conectada ? boton('Desconectar', async () => { await pedir('correo:desconectarOutlook'); correo = await pedir('correo:estado'); pintar(); }, 'peligro') : null,
        ], codigoMicrosoft ? h('span', { class: 'nota aviso' }, `Se abrió la página de Microsoft en tu navegador (${codigoMicrosoft.url}). Escribí ahí este código: ${codigoMicrosoft.codigo} — y aceptá el permiso. Esta pantalla se actualiza sola cuando termines.`) : 'Abre la página de Microsoft en tu navegador. Jarvis nunca ve tu contraseña.'),
        conectada ? campo('Estado', [probar('outlook'), estadoDe('outlook')]) : null),
      h('h2', {}, 'Frecuencia'),
      campo('Revisar cada', duracion(cfg.correo, 'cadaSegundos', { base: 's', unidades: ['s', 'min', 'h'], min: 30, max: 86400, porDefecto: 90 }, guardar), 'Mínimo 30 segundos.'),
    ];
  },

  clips() {
    if (clipEditor) return [h('h1', {}, 'Editar clip'), editorDeClip()];
    const todo = this._clips();
    const i = todo.findIndex((n) => n && n.tagName === 'H2' && n.textContent === 'Video');
    const estado = todo.filter((n) => n && n.classList && n.classList.contains('campo') && /^Estado/.test(n.textContent));
    const botones = todo.find((n) => n && n.classList && n.classList.contains('fila') && !n.classList.contains('campo'));
    const ultimos = todo.slice(todo.findIndex((n) => n && n.tagName === 'H2' && n.textContent === 'Tus clips'), i);
    return [
      h('h1', {}, 'Clips'),
      cfg.clips.activo ? null : h('p', { class: 'bajada' }, 'La repetición instantánea está apagada.'),
      controlesDeClips(),
      ...ultimos,
    ];
  },
  'clips-ajustes'() {
    const todo = this._clips();
    const i = todo.findIndex((n) => n && n.tagName === 'H2' && n.textContent === 'Video');
    const usar = todo.filter((n) => n && n.classList && n.classList.contains('campo') && /^(Usar clips|Herramienta de video)/.test(n.textContent));
    return [
      h('h1', {}, 'Ajustes de clips'),
      h('p', { class: 'bajada' }, 'Cómo graba la repetición instantánea. Los clips guardados están en Clips, arriba en el menú. Corre solo en los modos que lo tengan habilitado (Interfaz → Modos).'),
      h('div', { class: 'fila' }, boton('Ver mis clips', () => irA('clips'), 'chico')),
      h('h2', {}, 'Grabación'),
      ...usar,
      ...todo.slice(i),
    ];
  },
  _clips() {
    const c = cfg.clips;
    if (clipEditor) return [h('h1', {}, 'Editar clip'), editorDeClip()];
    const e = clipsEstado;
    const carpetaInput = texto(c, 'carpeta', guardar, { placeholder: 'D:\\Videos\\Clips' });
    if (!nombresFilas) nombresFilas = Object.entries(c.nombres || {}).map(([programa, carpeta]) => ({ programa, carpeta }));
    const guardarNombres = () => {
      c.nombres = Object.fromEntries(nombresFilas.filter((f) => String(f.programa).trim() && String(f.carpeta).trim()).map((f) => [String(f.programa).trim().toLowerCase().replace(/\.exe$/, ''), String(f.carpeta).trim()]));
      guardar();
    };
    return [
      h('h1', {}, 'Clips'),
      h('p', { class: 'bajada' }, 'Repetición instantánea: Jarvis va guardando en segundo plano los últimos segundos de tu pantalla (con el sonido de Windows y tu micrófono) y, cuando lo pedís, los convierte en un video. Se usa con el atajo, con la voz ("guardá el último minuto", "enviá el último minuto a Tomi") o con los botones del notch. Corre solo en los modos que lo tengan habilitado (Ajustes → Modos).'),
      campo('Usar clips', [casilla(c, 'activo', () => { guardar(); setTimeout(refrescarClips, 1500); }), h('span', {}, 'Grabar en segundo plano en los modos que lo permitan')], 'La primera vez baja una herramienta de video (ffmpeg, ~80 MB, gratis).'),
      campo('Pausar con la PC bloqueada', [casilla(c, 'pausarBloqueada', guardar, true), h('span', {}, 'Ahorra placa de video y procesador')], 'Mientras la PC está bloqueada o suspendida no graba en segundo plano; al desbloquearla vuelve sola (el buffer empieza de cero).'),
      campo('Herramienta de video', estadoDeModelo('ffmpeg')),
      campo('Estado', h('span', { class: `nota ${e.error ? 'mal' : e.corriendo ? 'bien' : ''}` }, e.error ? e.error : e.corriendo ? `Grabando en segundo plano${e.captura ? ` · ${e.captura}` : ''}${e.formato ? ` · ${/h264/i.test(e.formato) ? 'H.264' : /vp9/i.test(e.formato) ? 'VP9' : 'VP8'}` : ''} · buffer de ${e.segundos || 0} s` : e.activo ? 'Prendido, pero este modo no usa clips (Ajustes → Modos).' : 'Apagado')),
      h('div', { class: 'fila', style: 'margin-top:10px' },
        boton('Guardar un clip ahora', async () => { try { avisarGuardado(await pedir('clips:accion', { accion: 'guardar' })); } catch (er) { avisarGuardado(er.message); } refrescarClips(); }, 'chico'),
        e.grabando ? boton('Parar grabación', async () => { try { avisarGuardado(await pedir('clips:accion', { accion: 'parar' })); } catch (er) { avisarGuardado(er.message); } refrescarClips(); }, 'chico') : [['Grabar pantalla', 'pantalla'], ['Grabar ventana', 'ventana'], ['Grabar recuadro', 'recuadro']].map(([t, modo]) => boton(t, async () => { try { avisarGuardado(await pedir('clips:accion', { accion: 'grabar', modo })); } catch (er) { avisarGuardado(er.message); } refrescarClips(); }, 'chico')),
        boton('Actualizar estado', refrescarClips, 'chico')),
      h('h2', {}, 'Tus clips'),
      listaDeClips(),
      h('h2', {}, 'Video'),
      campo('Pantalla que graba el botón "Pantalla"', (() => {
        const pantallas = clipsEstado.pantallas || [];
        const valor = String(c.grabarPantalla || 'principal');
        const ops = [['principal', 'La pantalla principal'], ...pantallas.map((p) => [String(p.n), p.nombre]), ['preguntar', 'Preguntarme cada vez']];
        if (!ops.some(([v]) => v === valor)) ops.splice(1, 0, [valor, `Pantalla ${valor} (no conectada ahora)`]);
        return h('select', { 'aria-label': 'Pantalla que graba', onchange: (e) => { c.grabarPantalla = e.target.value; guardar(); } },
          ops.map(([v, n]) => h('option', { value: v, selected: v === valor }, n)));
      })(), 'Con más de una pantalla, el botón "Pantalla" (del notch, de los widgets y de esta página) graba la que elijas acá, directo y a tamaño real, sin preguntar. "Preguntarme cada vez" muestra las pantallas con una miniatura para elegir. Con una sola pantalla no cambia nada.'),
      campo('Pantalla de los clips', (() => {
        const pantallas = clipsEstado.pantallas || [];
        const valor = String(Number(c.pantalla) || 0);
        const ops = pantallas.length ? pantallas.map((p) => [String(p.n - 1), p.nombre]) : [['0', 'La pantalla principal']];
        if (!ops.some(([v]) => v === valor)) ops.push([valor, `Pantalla ${Number(valor) + 1} (no conectada ahora)`]);
        return h('select', { 'aria-label': 'Pantalla de los clips', onchange: (e) => { c.pantalla = Number(e.target.value); guardar(); setTimeout(refrescarClips, 1800); } },
          ops.map(([v, n]) => h('option', { value: v, selected: v === valor }, n)));
      })(), 'Cuál de tus pantallas va guardando la repetición instantánea (el "Guardar clip"). Es independiente de la de arriba.'),
      campo('Duración del clip', duracion(c, 'segundos', { base: 's', unidades: ['s', 'min'], min: 5, max: 600, porDefecto: 90 }, guardar), 'Cuánto tiempo hacia atrás guarda cuando pedís un clip (de 5 segundos a 10 minutos). Podés pedir otro tiempo por voz ("guardá los últimos 20 segundos").'),
      campo('Que Jarvis no salga en los clips', casilla(c, 'sinJarvis', guardar, true), 'El notch no se ve en los clips ni en las capturas de pantalla, y si Jarvis habla en el medio de un clip, esos segundos quedan sin sonido. Tu voz nunca se silencia. Para sacarle una captura al notch, apagá esto (o usá la bandeja → "Ocultar a Jarvis en clips y capturas").'),
      campo('Margen antes de mi pedido', duracion(c, 'recorteDeVoz', { base: 's', unidades: ['s'], min: 0, max: 30, porDefecto: 0 }, guardar), 'Un clip pedido por voz ("mandale los últimos 30 segundos a Eva") termina cuando empezaste a hablarle a Jarvis, así no se oye el pedido ni su respuesta. Si contesta con una pregunta y le decís "sí", cuenta el primer pedido. Con 0 puede llegar a oírse el "ey Jarvis" del final; subilo si preferís cortar antes.'),
      campo('Clip de una jugada', duracion(c, 'segundosJugada', { base: 's', unidades: ['s', 'min'], min: 5, max: 300, porDefecto: 30 }, guardar), 'Para "grabá la última kill" o "hacé un clip de cómo morí recién". Jarvis no detecta qué pasó en el juego: guarda los últimos segundos y los rotula "Kill", "Muerte" o "Jugada". Si fue antes, pedí más tiempo ("hacé un clip del último minuto").'),
      campo('Resolución', segmentado(c, 'calidad', [['480p', '480p'], ['720p', '720p'], ['1080p', '1080p'], ['1440p', '1440p']], () => { guardar(); setTimeout(refrescarClips, 1800); }, { porDefecto: '720p' }), 'Más resolución = más nitidez, más peso y más trabajo para la PC mientras jugás. 720p es lo mejor para mandar por WhatsApp.'),
      campo('Cuadros por segundo', segmentado(c, 'fps', [[30, '30 fps'], [60, '60 fps']], () => { c.fps = Number(c.fps) || 30; guardar(); setTimeout(refrescarClips, 1800); }, { porDefecto: 30 })),
      h('h2', {}, 'Audio'),
      campo('Qué se graba', fichas(c, [['sistema', 'Sonido de Windows', true], ['microfono', 'Mi micrófono', true]], () => { guardar(); setTimeout(refrescarClips, 1800); }), 'Usa el micrófono que elegiste en Escucha. Si el micrófono capta los parlantes, usá auriculares.'),
      campo('Volumen del micrófono', deslizador(c, 'volumenMic', { min: 0, max: 3, step: 0.1, formato: (v) => `${Math.round(v * 100)} %`, porDefecto: 1 }, guardar)),
      campo('Volumen del sonido de Windows', deslizador(c, 'volumenSistema', { min: 0.1, max: 2, step: 0.05, formato: (v) => `${Math.round(v * 100)} %`, porDefecto: 0.8 }, guardar), 'Los volúmenes se aplican en el momento. Si el audio suena saturado, bajá este: el juego y tu voz se suman. Jarvis además pone un limitador para evitar los chasquidos.'),
      campo('Calidad del audio', segmentado(c, 'audioKbps', [[96, 'Ligera'], [128, 'Normal'], [192, 'Alta']], () => { guardar(); setTimeout(refrescarClips, 1800); }, { porDefecto: 128 }), 'Cambia poco el peso del archivo: lo que más pesa es la imagen.'),
      h('p', { class: 'nota' }, 'Al cambiar la resolución, los cuadros o qué se graba, la grabación en segundo plano se reinicia y el buffer empieza de cero.'),
      h('h2', {}, 'Guardado'),
      campo('Atajo para guardar', texto(c, 'atajo', () => { guardar(); }, { placeholder: 'Alt+F10', style: 'width:140px' }), 'Por ejemplo Alt+F10 o Control+Shift+C. Si tenés la repetición de NVIDIA prendida, usá otro o apagala.'),
      campo('Carpeta', [carpetaInput, boton('Elegir…', async () => { const r = await pedir('clips:carpeta', c.carpeta).catch(() => null); if (r) { c.carpeta = r; guardar(); pintar(); } }, 'chico'), boton('Abrir', () => pedir('clips:abrir-carpeta', c.carpeta).catch((er) => avisarGuardado(er.message)), 'chico')]),
      campo('Una carpeta por juego', [casilla(c, 'porJuego', guardar, true), h('span', {}, 'Separar los clips en carpetas con el nombre del juego')], 'Jarvis mira qué programa tenías al frente. Si el nombre sale raro, corregilo en la tabla de abajo.'),
      campo('Mandar a (por defecto)', texto(c, 'enviarA', guardar, { placeholder: 'Nombre del contacto', style: 'width:200px' }), 'Si decís "enviá el último clip" sin nombre, va a esta persona.'),
      avanzado(['Nombres de carpetas por juego', (c.nombres && Object.keys(c.nombres).length > 0)],
        h('p', { class: 'bajada' }, 'Si un juego sale con otro nombre, escribí acá cómo se llama el programa (el nombre del .exe sin ".exe", como "cs2") y cómo querés la carpeta.'),
        tabla(nombresFilas, [
          { titulo: 'Programa (.exe)', control: (f) => texto(f, 'programa', guardarNombres, { placeholder: 'cs2' }) },
          { titulo: 'Carpeta', control: (f) => texto(f, 'carpeta', guardarNombres, { placeholder: 'Counter-Strike 2' }) },
        ], guardarNombres, { nuevo: () => ({ programa: '', carpeta: '' }), vacio: 'Sin nombres propios: Jarvis usa el nombre que trae el programa.' })),
      h('p', { class: 'bajada', style: 'margin-top:12px' }, 'Ojo: la captura funciona con juegos en ventana o en "pantalla completa sin bordes". Un juego en pantalla completa exclusiva puede salir negro: cambialo a sin bordes en sus opciones de video.'),
    ];
  },

  calendario() {
    const c = cfg.calendario;
    c.enlaces = Array.isArray(c.enlaces) ? c.enlaces : [];
    c.google = c.google || {};
    c.minutosAntes = Array.isArray(c.minutosAntes) ? c.minutosAntes : [10];
    // El enlace único de antes pasa a la lista de enlaces.
    if ((c.enlace || '').trim()) { c.enlaces.unshift({ nombre: 'Principal', enlace: c.enlace.trim() }); c.enlace = ''; guardar(); }
    const g = c.google;
    const conectadaG = !!g.token;
    const resultado = h('span', { class: 'nota' });

    // --- Cuenta de Google ---
    const idCliente = h('input', { type: 'text', value: g.clientId || '', placeholder: '123456789-abc….apps.googleusercontent.com', oninput: (e) => { g.clientId = e.target.value.trim(); guardar(); } });
    const secreto = h('input', { type: 'password', value: g.clientSecret || '', placeholder: 'GOCSPX-…', oninput: (e) => { g.clientSecret = e.target.value.trim(); guardar(); } });
    const elegidos = () => (Array.isArray(g.elegidos) ? g.elegidos : null);
    const estaUsado = (cal) => (elegidos() ? elegidos().includes(cal.id) : cal.tildado);
    const listaCalendarios = () => {
      if (!conectadaG) return null;
      if (calGoogle.error) return h('div', { class: 'nota mal' }, calGoogle.error);
      if (!calGoogle.lista) return h('div', { class: 'nota' }, 'Leyendo tus calendarios…');
      const quitadosIds = Array.isArray(g.ocultos) ? g.ocultos : [];
      const visibles = calGoogle.lista.filter((x) => !quitadosIds.includes(x.id));
      const quitados = calGoogle.lista.filter((x) => quitadosIds.includes(x.id));
      return h('div', {},
        h('div', { class: 'calendarios-lista' }, visibles.map((cal) => h('label', { class: `cal-item ${estaUsado(cal) ? '' : 'off'}` },
          h('span', { class: 'punto', style: `background:${cal.color || 'var(--acento)'}` }),
          h('span', {}, cal.nombre),
          h('small', {}, /freeBusy/i.test(cal.rol) ? 'solo ve ocupado/libre' : cal.principal ? 'principal' : ''),
          h('button', { type: 'button', class: 'cal-quitar', title: 'Quitar de la lista de Jarvis (no se borra de Google)', onclick: (e) => {
            e.preventDefault(); e.stopPropagation();
            g.ocultos = [...new Set([...(g.ocultos || []), cal.id])];
            if (elegidos()) g.elegidos = elegidos().filter((x) => x !== cal.id);
            guardar(); pintar();
          } }, '✕'),
          h('span', { class: 'interruptor' },
            h('input', { type: 'checkbox', checked: estaUsado(cal), onchange: (e) => {
              const base = new Set(elegidos() || visibles.filter((x) => x.tildado).map((x) => x.id));
              if (e.target.checked) base.add(cal.id); else base.delete(cal.id);
              g.elegidos = [...base]; guardar(); pintar();
            } }), h('i'))))),
        h('div', { class: 'fila' },
          boton('Actualizar lista', async (ev) => {
            ev.target.disabled = true; ev.target.textContent = 'Actualizando…';
            await cargarCalendarios();
            pedir('calendario:actualizar').catch(() => {});
            pintar();
          }, 'chico'),
          boton('Usar los que tengo tildados en Google Calendar', () => { g.elegidos = null; guardar(); pintar(); }, 'chico'),
          elegidos() ? h('span', { class: 'nota' }, 'Elegidos a mano') : h('span', { class: 'nota' }, 'Los mismos que tenés tildados en Google Calendar (los nuevos se suman solos)')),
        quitados.length ? h('div', { class: 'fila', style: 'margin-top:6px' },
          h('span', { class: 'nota' }, `Quitados de la lista: ${quitados.map((c) => c.nombre).join(', ')}`),
          boton('Volver a mostrarlos', () => { g.ocultos = []; guardar(); pintar(); }, 'chico')) : null,
        h('p', { class: 'nota', style: 'margin-top:6px' }, 'Quitar un calendario solo lo saca de esta lista: no se borra de tu cuenta de Google (Jarvis tiene permiso de solo lectura). La lista se actualiza sola cada vez que abrís esta pantalla y cada 30 minutos.'));
    };
    const conectar = h('div', { class: 'fila' },
      conectadaG ? h('span', { class: 'nota bien' }, `Cuenta conectada${g.cuenta ? `: ${g.cuenta}` : ''}`) : null,
      conectadaG ? null : boton(calGoogle.esperando ? 'Esperando a Google…' : 'Conectar con Google', async (ev) => {
        ev.target.disabled = true;
        try { await pedir('calendario:google:conectar', { clientId: g.clientId, clientSecret: g.clientSecret }); calGoogle.esperando = true; avisarGuardado('Se abrió Google en tu navegador: entrá y aceptá el permiso de solo lectura.'); } catch (er) { avisarGuardado(er.message); }
        pintar();
      }, 'chico'),
      !conectadaG && calGoogle.esperando ? boton('Cancelar', async () => { await pedir('calendario:google:cancelar').catch(() => {}); calGoogle.esperando = false; pintar(); }, 'chico') : null,
      conectadaG ? boton('Desconectar', async () => { const nuevo = await pedir('calendario:google:desconectar'); Object.assign(g, nuevo); calGoogle.lista = null; pintar(); }, 'peligro') : null);

    // --- Enlaces iCal ---
    const enlaces = tabla(c.enlaces, [
      { titulo: 'Nombre', control: (f) => texto(f, 'nombre', guardar, { placeholder: 'Familia' }) },
      { titulo: 'Enlace secreto (iCal)', control: (f) => h('input', { type: 'password', value: f.enlace || '', placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics', oninput: (e) => { f.enlace = e.target.value.trim(); guardar(); } }) },
    ], guardar, { nuevo: () => ({ nombre: '', enlace: '' }), vacio: 'Sin enlaces cargados.', agregar: 'Agregar enlace' });

    // --- Avisos ---
    const avisos = h('div', {},
      c.minutosAntes.map((_, i) => h('div', { class: 'aviso-fila' },
        duracion(c.minutosAntes, i, { base: 'min', unidades: ['min', 'h', 'd'], min: 0, max: 20160, porDefecto: 10 }, guardar),
        h('span', { class: 'nota' }, 'antes'),
        boton('Quitar', () => { c.minutosAntes.splice(i, 1); guardar(); pintar(); }, 'chico'))),
      c.minutosAntes.length ? null : h('div', { class: 'vacio' }, 'Sin avisos: Jarvis no te avisa de los eventos (igual contesta "¿qué tengo hoy?").'),
      h('div', { class: 'fila' },
        boton('Agregar aviso', () => { c.minutosAntes.push(c.minutosAntes.length ? 30 : 10); guardar(); pintar(); }, 'chico'),
        h('span', { class: 'nota' }, '0 = justo cuando empieza. Cada aviso pasa por las reglas de Notificaciones (ahí le ponés sonido o que lo lea en voz alta).')));

    return [
      h('h1', {}, 'Calendario'),
      h('p', { class: 'bajada' }, 'Conectá tu Google Calendar para que Jarvis te avise de los eventos antes de que empiecen y te cuente tu agenda ("¿qué tengo hoy?", "¿qué tengo mañana?", "¿cuál es mi próximo evento?"). Se pueden juntar todos tus calendarios en una sola agenda.'),
      lineaDeAvisos('calendario'),
      campo('Usar mi calendario', [casilla(c, 'activo', guardar), h('span', {}, 'Avisar de los eventos y responder sobre mi agenda')]),
      h('h2', {}, 'Mi cuenta de Google'),
      h('p', { class: 'bajada' }, 'Es la forma de traer TODOS los calendarios de golpe, también los que otra persona o empresa comparte con tu cuenta (esos no tienen "enlace secreto"). Entrás vos en la página de Google: Jarvis no ve tu contraseña y el permiso es solo de lectura. Hace falta un "ID de cliente" propio y gratuito, que se crea una sola vez.'),
      avanzado(['Cómo crear el ID de cliente (unos 5 minutos, una sola vez)', !conectadaG && !g.clientId],
        h('ol', { class: 'pasos-lista' },
          h('li', {}, 'Entrá a ', enlace('console.cloud.google.com', 'https://console.cloud.google.com/projectcreate'), ' con tu cuenta y creá un proyecto (por ejemplo "Jarvis").'),
          h('li', {}, 'Activá la ', enlace('Google Calendar API', 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'), ' (botón "Habilitar").'),
          h('li', {}, 'En ', enlace('Pantalla de consentimiento', 'https://console.cloud.google.com/auth/overview'), ': tipo "Externo", poné cualquier nombre y tu mail. En "Público" agregá tu mail como usuario de prueba y, para que la conexión no venza a los 7 días, tocá "Publicar la aplicación" (es solo para vos; Google va a avisar que no está verificada y no pasa nada).'),
          h('li', {}, 'En ', enlace('Clientes', 'https://console.cloud.google.com/auth/clients/create'), ' elegí "Aplicación de escritorio", creala y copiá el ID de cliente y el secreto acá abajo.')),
        h('p', { class: 'nota' }, 'Al conectar, Google dice "Google no verificó esta aplicación": tocá "Configuración avanzada" → "Ir a Jarvis" y aceptá. Si un calendario de trabajo no aparece, puede ser que su administrador no deje usarlo con aplicaciones propias.')),
      campo('ID de cliente', idCliente),
      campo('Secreto de cliente', [secreto, boton('Ver', () => { secreto.type = secreto.type === 'password' ? 'text' : 'password'; }, 'chico')]),
      campo('Conexión', conectar),
      conectadaG ? campo('Calendarios a usar', listaCalendarios(), 'Marcá los que quieras sumar a la agenda y a los avisos.') : null,
      h('h2', {}, 'Enlaces secretos (opcional)'),
      avanzado(['Otra forma: un enlace por calendario', c.enlaces.length > 0],
        h('p', { class: 'bajada' }, 'No pide permisos ni cuenta: en ', enlace('calendar.google.com', 'https://calendar.google.com/calendar/u/0/r/settings'), ' elegí el calendario → "Integrar el calendario" → copiá la "Dirección secreta en formato iCal". Sirve para los calendarios tuyos; los que te comparten otros no lo muestran. Quien tenga el enlace puede ver el calendario: Jarvis lo guarda solo en esta PC.'),
        enlaces),
      h('h2', {}, 'Avisos'),
      campo('Avisar antes', avisos),
      campo('Estado', [boton('Actualizar y probar', async () => {
        resultado.className = 'nota'; resultado.textContent = 'Leyendo…';
        try {
          await pedir('cfg:guardar', cfg);
          const r = await pedir('calendario:actualizar');
          cargarAgendaCargada();
          const malas = (r.fuentes || []).filter((f) => !f.ok);
          resultado.className = `nota ${malas.length ? 'mal' : 'bien'}`;
          resultado.textContent = malas.length ? malas.map((f) => `${f.nombre}: ${f.error}`).join(' · ')
            : r.cantidad ? `Anda: ${r.cantidad} evento(s) en los próximos días. Lo próximo: ${r.proximos[0] ? `${r.proximos[0].titulo} (${r.proximos[0].cuando})` : '—'}.` : 'Anda, pero no hay eventos en los próximos días.';
        } catch (er) { resultado.className = 'nota mal'; resultado.textContent = er.message; }
      }, 'chico'), resultado]),
      h('h2', {}, 'Lo que Jarvis ve en tu agenda'),
      h('p', { class: 'bajada' }, 'Los eventos de los próximos días que Jarvis tiene cargados, con el calendario del que vienen. Sirve para encontrar un evento del que te avisa: buscá por el nombre, mirá de qué calendario es (puede ser uno compartido o de otra cuenta) y abrilo en Google Calendar. Si se repite, abrí el evento y editá "todos los eventos" de la serie (el original puede ser de hace años).'),
      (() => {
        const fecha = (ms, todo) => { const d = new Date(ms); const dia = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }); return todo ? `${dia} · todo el día` : `${dia} · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`; };
        return h('div', {},
          h('div', { class: 'fila', style: 'margin-bottom:8px' }, h('input', { type: 'text', placeholder: 'Buscar un evento (por ejemplo PASTILLA)…', value: calAgenda.buscar, style: 'flex:1;max-width:360px', oninput: (e) => { calAgenda.buscar = e.target.value; clearTimeout(calAgenda.reloj); calAgenda.reloj = setTimeout(() => { const el = document.querySelector('.agenda-cargada'); if (el) el.replaceWith(vistaAgenda()); }, 150); } }), boton('Actualizar', cargarAgendaCargada, 'chico')),
          vistaAgenda());
        function vistaAgenda() {
          const f = (calAgenda.lista || []).filter((e) => !calAgenda.buscar.trim() || `${e.titulo} ${e.calendario} ${e.lugar}`.toLowerCase().includes(calAgenda.buscar.trim().toLowerCase()));
          return h('div', { class: 'agenda-cargada' }, calAgenda.lista === null ? h('div', { class: 'vacio' }, 'Leyendo…')
            : !f.length ? h('div', { class: 'vacio' }, calAgenda.lista.length ? 'Ninguno coincide con la búsqueda.' : 'No hay eventos cargados para los próximos días.')
              : f.map((e) => h('div', { class: 'evento-fila' },
                h('div', { class: 'ev-cuando' }, fecha(e.inicio, e.todoElDia)),
                h('div', { class: 'ev-dato' }, h('b', {}, e.titulo), h('small', {}, `${e.calendario || 'Calendario'}${e.repite ? ' · se repite' : ''}${e.lugar ? ` · ${e.lugar}` : ''}`)),
                e.enlace ? boton('Abrir en Calendar', () => pedir('abrir:enlace', e.enlace), 'chico') : null)));
        }
      })(),
      h('h2', {}, 'Crear eventos'),
      h('p', { class: 'bajada' }, 'Decí, por ejemplo, "agendá reunión con Juan mañana a las 15 por una hora" o "creá un evento cumpleaños de Eva el viernes a las 21". Jarvis abre Google Calendar con el evento ya armado y vos tocás Guardar (se crea en la cuenta con la que tengas abierto el navegador). No hace falta conectar nada para esto.'),
    ];
  },

  // Calendario: día, semana o mes, con navegación por fechas. Muestra los eventos de tus calendarios y los propios; se pueden cambiar solo acá (no toca Google) y elegir sus avisos y su sonido.
  agenda() {
    const u = agendaUI;
    const dos = (n) => String(n).padStart(2, '0');
    const fechaInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
    const horaInput = (ms) => { const d = new Date(ms); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; };
    const aMs = (f, hh) => { const t = new Date(`${f}T${hh || '00:00'}`).getTime(); return Number.isFinite(t) ? t : 0; };
    const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mayus = (t) => `${t[0].toUpperCase()}${t.slice(1)}`;
    const dia0 = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d; };
    const masDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const lunesDe = (d) => masDias(dia0(d), -((dia0(d).getDay() + 6) % 7)); // la semana empieza el lunes
    const clave = (d) => fechaInput(+d);
    const hoyClave = clave(new Date());
    const ancla = dia0(u.fecha);
    // El rango que se ve: el día, la semana (lun–dom) o el mes completo (con los días de las semanas de los bordes).
    const rangoDeVista = () => {
      if (u.vista === 'dia') return [ancla, masDias(ancla, 1)];
      if (u.vista === 'semana') { const l = lunesDe(ancla); return [l, masDias(l, 7)]; }
      const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
      const l = lunesDe(primero); return [l, masDias(l, 42)];
    };
    const [desde, hasta] = rangoDeVista();
    const claveRango = `${u.vista}|${+desde}`;
    const titulo = u.vista === 'dia' ? `${mayus(DIAS_L[ancla.getDay()])} ${ancla.getDate()} de ${MESES[ancla.getMonth()]} de ${ancla.getFullYear()}`
      : u.vista === 'semana' ? (() => { const f = masDias(desde, 6); return desde.getMonth() === f.getMonth() ? `${desde.getDate()} – ${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}` : `${desde.getDate()} ${MESES[desde.getMonth()].slice(0, 3)} – ${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)} ${f.getFullYear()}`; })()
      : `${mayus(MESES[ancla.getMonth()])} ${ancla.getFullYear()}`;
    const mover = (n) => {
      if (u.vista === 'dia') u.fecha = +masDias(ancla, n);
      else if (u.vista === 'semana') u.fecha = +masDias(ancla, 7 * n);
      else { const d = new Date(ancla.getFullYear(), ancla.getMonth() + n, 1); u.fecha = +d; }
      pintar();
    };
    const tiempoDe = (m) => (m === 0 ? 'al empezar' : m % 10080 === 0 ? `${m / 10080} sem antes` : m % 1440 === 0 ? `${m / 1440} d antes` : m % 60 === 0 ? `${m / 60} h antes` : `${m} min antes`);
    const CANAL_CORTO = { jarvis: '', whatsapp: ' por WhatsApp', mail: ' por mail' };
    const mostrarAvisos = (e) => (e.silenciado ? 'sin avisos' : e.avisos ? e.avisos.map((a) => `${tiempoDe(a.antes)}${CANAL_CORTO[a.canal] || ''}`).join(', ') : '');
    cfg.calendario.calendarios = cfg.calendario.calendarios || {};
    // El color de un evento: el suyo, si no el que se le eligió a su calendario, si no el que ya tiene.
    const colorDe = (e) => e.color || ((cfg.calendario.calendarios[e.calendario || 'Principal'] || {}).color) || e.colorCalendario || '#4F9DF7';
    const COLOR_NOTA = '#C792EA';

    // Lo que se ve viene del proceso principal (con lo de afuera guardado unos minutos); se pide si todavía no está.
    const cargar = async (forzar) => {
      const k = claveRango;
      u.pidiendo = k;
      try {
        if (forzar) await pedir('calendario:actualizar').catch(() => {});
        const [r, ns] = await Promise.all([pedir('calendario:rango', { desde: +desde, hasta: +hasta - 1 }), pedir('notas:leer').catch(() => [])]);
        if (u.pidiendo !== k) return;
        u.datos = { clave: k, eventos: r.eventos, error: r.error, notas: (ns || []).filter((n) => n.cuando && n.cuando >= +desde && n.cuando < +hasta) };
      } catch (er) { if (u.pidiendo === k) u.datos = { clave: k, eventos: [], error: er.message, notas: [] }; }
      if (u.pidiendo === k) u.pidiendo = null;
      if (seccion === 'agenda' && !escribiendo()) pintar();
    };
    const listo = u.datos && u.datos.clave === claveRango;
    if (!listo && u.pidiendo !== claveRango) cargar(false);
    const recargar = async () => { u.datos = null; u.pidiendo = null; pintar(); };
    const refrescar = async () => { u.datos = null; u.pidiendo = null; await cargar(true); };

    const nuevoEditor = (e, diaNuevo) => {
      const ahora = new Date(); ahora.setMinutes(0, 0, 0); ahora.setHours(ahora.getHours() + 1);
      if (!e && diaNuevo) { const d = new Date(diaNuevo); d.setHours(ahora.getHours(), 0, 0, 0); ahora.setTime(+d); }
      const ini = e ? e.inicio : ahora.getTime();
      return {
        id: e ? e.id : null, local: e ? e.local : true, original: e || null,
        titulo: e ? e.titulo : '', fecha: fechaInput(ini), hora: horaInput(ini), duracion: e ? Math.max(5, Math.round((e.fin - e.inicio) / 60000)) : 60,
        todoElDia: !!(e && e.todoElDia), lugar: e ? e.lugar : '', detalle: e ? e.detalle : '',
        propios: !!(e && e.avisos), avisos: e && e.avisos ? e.avisos.map((a) => ({ ...a })) : [{ antes: 10, canal: 'jarvis' }], silenciar: !!(e && e.silenciado), sonido: (e && e.sonido) || '', color: (e && e.color) || '',
        calendario: e ? e.calendario : 'Jarvis',
      };
    };
    const cerrarEditor = () => { u.editor = null; pintar(); };
    const guardarEditor = async () => {
      const x = u.editor;
      const inicio = aMs(x.fecha, x.todoElDia ? '00:00' : x.hora);
      if (!x.titulo.trim()) { avisarGuardado('Falta el nombre del evento.'); return; }
      if (!inicio) { avisarGuardado('Falta la fecha y la hora.'); return; }
      const fin = x.todoElDia ? inicio + 86400000 : inicio + Math.max(1, Number(x.duracion) || 60) * 60000;
      const avisos = x.propios && !x.silenciar ? x.avisos : [];
      try {
        if (x.local) await pedir('calendario:guardar-local', { id: x.id, titulo: x.titulo, inicio, fin, todoElDia: x.todoElDia, lugar: x.lugar, detalle: x.detalle, avisos: x.propios ? x.avisos : null, sonido: x.sonido, color: x.color });
        else await pedir('calendario:cambiar', { id: x.id, cambios: { titulo: x.titulo, lugar: x.lugar, inicio, fin, todoElDia: x.todoElDia, avisos, silenciar: x.silenciar, sonido: x.sonido, color: x.color } });
        avisarGuardado(x.id ? 'Evento actualizado en Jarvis.' : 'Evento creado en Jarvis.');
        u.fecha = +dia0(inicio); u.editor = null; await recargar();
      } catch (er) { avisarGuardado(er.message); }
    };
    const editor = () => {
      const x = u.editor;
      const cambiar = () => {};
      const origen = x.local ? 'Evento de Jarvis' : x.calendario;
      const hayAvisosMail = x.propios && x.avisos.some((a) => a.canal === 'mail');
      return h('div', { class: 'agenda-editor' },
        h('div', { class: 'editor-cabeza' },
          boton('← Volver al calendario', cerrarEditor, 'volver'),
          h('h2', {}, x.id ? (x.local ? 'Editar evento de Jarvis' : 'Editar solo en Jarvis') : 'Nuevo evento'),
          h('span', { class: 'nota' }, origen ? `${origen} · Esc para salir` : 'Esc para salir')),
        !x.local ? h('p', { class: 'nota' }, 'Los cambios valen solo dentro de Jarvis (avisos, notch, "¿qué tengo hoy?"): el evento en Google Calendar queda como está.') : null,
        h('div', { class: 'editor-columnas' },
          h('div', { class: 'editor-col' },
            h('h3', {}, 'El evento'),
            campo('Nombre', texto(x, 'titulo', cambiar, { placeholder: 'Entrenar, Reunión, Cumpleaños de Eva…' })),
            campo('Día y hora', h('span', { class: 'fila' }, h('input', { type: 'date', value: x.fecha, oninput: (e) => { x.fecha = e.target.value; } }),
              h('input', { type: 'time', value: x.hora, disabled: x.todoElDia, oninput: (e) => { x.hora = e.target.value; } }),
              h('label', { class: 'opcion' }, casilla(x, 'todoElDia', () => pintar()), h('span', {}, 'Todo el día')))),
            !x.todoElDia ? campo('Duración (minutos)', numero(x, 'duracion', cambiar, { min: 5, max: 1440, style: 'max-width:120px' })) : null,
            campo('Lugar', texto(x, 'lugar', cambiar, { placeholder: 'Opcional' })),
            campo('Color', selectorDeColor(x.color, (v) => { x.color = v; }), 'Solo para este evento. "A" = el color de su calendario.')),
          h('div', { class: 'editor-col' },
            h('h3', {}, 'Avisos'),
            h('div', { class: 'fichas' },
              h('button', { type: 'button', class: `ficha ${!x.propios && !x.silenciar ? 'on' : ''}`, onclick: () => { x.propios = false; x.silenciar = false; pintar(); } }, 'Los de su calendario'),
              h('button', { type: 'button', class: `ficha ${x.propios && !x.silenciar ? 'on' : ''}`, onclick: () => { x.propios = true; x.silenciar = false; if (!x.avisos.length) x.avisos = [{ antes: 10, canal: 'jarvis' }]; pintar(); } }, 'Elegir'),
              h('button', { type: 'button', class: `ficha ${x.silenciar ? 'on' : ''}`, onclick: () => { x.silenciar = true; x.propios = false; pintar(); } }, 'Sin avisos')),
            h('p', { class: 'nota' }, '"Los de su calendario" usan los de la lista "Mis calendarios"; si ese calendario no tiene, los de siempre (Cuentas y avisos → Calendario). Con "Elegir" sumás los que quieras: por ejemplo una semana antes por mail, 3 días antes por WhatsApp y 10 minutos antes con alerta de Jarvis.'),
            x.propios && !x.silenciar ? editorDeAvisos(x.avisos, cambiar) : null,
            x.propios && !x.silenciar ? h('p', { class: 'nota' }, 'WhatsApp: Jarvis tiene que estar abierto y con WhatsApp conectado a esa hora; si no, lo manda apenas se abra. Mail: sale por tu Gmail (Ajustes → Mail) y también necesita Jarvis abierto: ni Gmail ni Outlook dejan que otro programa programe el envío.') : null,
            !x.silenciar && !x.propios ? campo('Sonido', selectorDeSonido(x.sonido, (v) => { x.sonido = v; }), '"Por defecto" usa el sonido de los eventos (Cuentas y avisos → Notificaciones). "Sin sonido" avisa igual, pero en silencio.') : null)),
        h('div', { class: 'editor-acciones' },
          boton('Guardar', guardarEditor, 'principal'),
          boton('Cancelar', cerrarEditor),
          x.id && x.local ? boton('Borrar evento', async () => { if (!await confirmar({ titulo: '¿Borrar este evento?', texto: 'Es un evento propio de Jarvis: se borra de acá.', si: 'Borrar', peligro: true })) return; await pedir('calendario:borrar-local', x.id); u.editor = null; await recargar(); }, 'peligro') : null,
          x.id && !x.local && x.original && x.original.cambiado ? boton('Volver al original', async () => { await pedir('calendario:cambiar', { id: x.id, cambios: null }); u.editor = null; avisarGuardado('Volvió a como está en el calendario.'); await recargar(); }) : null,
          x.id && !x.local ? boton('Ocultar en Jarvis', async () => { await pedir('calendario:cambiar', { id: x.id, cambios: { oculto: true } }); u.editor = null; avisarGuardado('Listo: Jarvis no lo muestra ni avisa. En Google sigue igual.'); await recargar(); }, 'peligro') : null));
    };

    // ---- Mis calendarios: color y avisos propios de cada uno ----
    const cargarConocidos = async () => { try { u.conocidos = await pedir('calendario:conocidos'); } catch { u.conocidos = []; } if (seccion === 'agenda' && !escribiendo()) pintar(); };
    if (!u.conocidos && !u.pidiendoConocidos) { u.pidiendoConocidos = true; cargarConocidos(); }
    const calendariosPanel = () => {
      const vistos = new Map((u.conocidos || []).map((c) => [c.nombre, c]));
      for (const e of (u.datos && u.datos.eventos) || []) if (e.calendario && !vistos.has(e.calendario)) vistos.set(e.calendario, { nombre: e.calendario, origen: '', colorBase: e.colorCalendario });
      for (const e of (cfg.calendario.enlaces || [])) if (e && e.nombre && !vistos.has(e.nombre)) vistos.set(e.nombre, { nombre: e.nombre, origen: 'Enlace iCal', colorBase: '#4F9DF7' });
      const lista = [...vistos.values()];
      return h('details', { class: 'avanzado cal-gestion', open: !!u.gestionAbierta, ontoggle: (e) => { u.gestionAbierta = e.target.open; } },
        h('summary', {}, `Mis calendarios · color y avisos de cada uno (${lista.length})`),
        h('div', { class: 'cal-gestion-lista' }, lista.length ? lista.map((c) => {
          const aj = (cfg.calendario.calendarios[c.nombre] = cfg.calendario.calendarios[c.nombre] || {});
          const cambiar = () => { guardar(); };
          const propios = Array.isArray(aj.avisos);
          return h('section', { class: 'cal-gestion-fila', style: `--ec:${aj.color || c.colorBase}` },
            h('div', { class: 'cal-gestion-cabeza' },
              h('i', { class: 'cal-punto' }), h('b', {}, c.nombre), h('span', { class: 'nota' }, c.origen || '')),
            campo('Color', selectorDeColor(aj.color || '', (v) => { if (v) aj.color = v; else delete aj.color; guardar(); pintar(); }, { vacio: 'El de siempre' })),
            campo('Avisos', [h('div', { class: 'fichas' },
              h('button', { type: 'button', class: `ficha ${!propios && !aj.silenciar ? 'on' : ''}`, onclick: () => { delete aj.avisos; delete aj.silenciar; guardar(); pintar(); } }, 'Los de siempre'),
              h('button', { type: 'button', class: `ficha ${propios && !aj.silenciar ? 'on' : ''}`, onclick: () => { aj.avisos = aj.avisos && aj.avisos.length ? aj.avisos : [{ antes: 10, canal: 'jarvis' }]; delete aj.silenciar; guardar(); pintar(); } }, 'Propios'),
              h('button', { type: 'button', class: `ficha ${aj.silenciar ? 'on' : ''}`, onclick: () => { aj.silenciar = true; delete aj.avisos; guardar(); pintar(); } }, 'Silenciado')),
              propios && !aj.silenciar ? editorDeAvisos(aj.avisos, cambiar) : null],
              'Valen para todos los eventos de este calendario que no tengan avisos propios.'));
        }) : h('p', { class: 'nota' }, 'Todavía no hay calendarios: conectá tu cuenta de Google o pegá un enlace en Cuentas y avisos → Calendario.')));
    };

    // Los eventos por día (un evento de todo el día de varios días aparece en cada uno).
    const buscar = u.buscar.trim().toLowerCase();
    const porDia = new Map();
    const poner = (k, it) => { if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(it); };
    if (listo) {
      for (const e of u.datos.eventos) {
        if (buscar && !`${e.titulo} ${e.calendario} ${e.lugar}`.toLowerCase().includes(buscar)) continue;
        const ultimo = e.todoElDia ? Math.max(e.inicio, e.fin - 1) : e.inicio;
        for (let d = dia0(e.inicio), n = 0; +d <= ultimo && n < 42; d = masDias(d, 1), n++) poner(clave(d), { tipo: 'evento', e, hora: e.todoElDia ? -1 : e.inicio });
      }
      for (const n of u.datos.notas) { if (buscar && !n.texto.toLowerCase().includes(buscar)) continue; poner(clave(dia0(n.cuando)), { tipo: 'nota', n, hora: n.cuando }); }
      for (const l of porDia.values()) l.sort((a, b) => a.hora - b.hora);
    }
    const abrirItem = (it) => { if (it.tipo === 'nota') irA('notas'); else { u.editor = nuevoEditor(it.e); pintar(); } };
    const irAlDia = (d) => { u.fecha = +dia0(d); u.vista = 'dia'; pintar(); };
    const etiquetaDe = (it) => (it.tipo === 'nota' ? it.n.texto : it.e.titulo);
    const horaDe = (it) => (it.tipo === 'nota' ? horaInput(it.n.cuando) : it.e.todoElDia ? '' : horaInput(it.e.inicio));

    // ---- Vista de día ----
    const vistaDia = () => {
      const items = porDia.get(clave(ancla)) || [];
      const fila = (it) => (it.tipo === 'nota'
        ? h('div', { class: 'agenda-fila nota-fila', style: `--ec:${COLOR_NOTA}` }, h('div', { class: 'agenda-hora' }, horaInput(it.n.cuando)),
          h('div', { class: 'agenda-info' }, h('b', {}, it.n.texto), h('div', { class: 'nota' }, `Recordatorio${it.n.avisada ? ' · ya avisó' : ''}${it.n.sonido === 'ninguno' ? ' · sin sonido' : ''}`)),
          h('div', { class: 'agenda-acciones' }, botonIcono('lapiz', 'Ver en Notas', () => irA('notas'))))
        : h('div', { class: `agenda-fila ${it.e.local ? 'propio' : ''}`, style: `--ec:${colorDe(it.e)}` },
          h('div', { class: 'agenda-hora' }, it.e.todoElDia ? 'Todo el día' : horaInput(it.e.inicio)),
          h('div', { class: 'agenda-info' }, h('b', {}, it.e.titulo),
            h('div', { class: 'nota' }, [it.e.local ? 'Evento de Jarvis' : it.e.calendario, it.e.lugar, it.e.repite ? 'se repite' : '', it.e.cambiado ? 'cambiado en Jarvis' : '', mostrarAvisos(it.e), it.e.sonido === 'ninguno' ? 'sin sonido' : ''].filter(Boolean).join(' · '))),
          h('div', { class: 'agenda-acciones' }, botonIcono('lapiz', 'Editar', () => { u.editor = nuevoEditor(it.e); pintar(); }))));
      return items.length ? h('div', { class: 'agenda-lista' }, items.map(fila))
        : h('div', { class: 'vacio' }, buscar ? 'Nada coincide con la búsqueda en este día.' : 'No hay nada este día.', ' ', boton('Agregar un evento', () => { u.editor = nuevoEditor(null, ancla); pintar(); }, 'chico'));
    };
    // ---- Vista de semana ----
    const vistaSemana = () => h('div', { class: 'cal-semana' }, Array.from({ length: 7 }, (_, i) => {
      const d = masDias(desde, i); const items = porDia.get(clave(d)) || [];
      return h('section', { class: `cal-col ${clave(d) === hoyClave ? 'hoy' : ''}` },
        h('button', { type: 'button', class: 'cal-cab', onclick: () => irAlDia(d), title: 'Ver el día' }, h('span', {}, DIAS_C[d.getDay()]), h('b', {}, String(d.getDate()))),
        items.length ? items.map((it) => h('button', { type: 'button', class: `cal-ev ${it.tipo === 'nota' ? 'es-nota' : it.e.local ? 'propio' : ''}`, style: `--ec:${it.tipo === 'nota' ? COLOR_NOTA : colorDe(it.e)}`, onclick: () => abrirItem(it), title: etiquetaDe(it) },
          h('small', {}, horaDe(it) || 'Todo el día'), h('span', {}, etiquetaDe(it))))
          : h('div', { class: 'cal-nada' }, '—'));
    }));
    // ---- Vista de mes ----
    const vistaMes = () => h('div', { class: 'cal-mes' },
      DIAS_C.slice(1).concat(DIAS_C[0]).map((n) => h('div', { class: 'cal-nombre' }, n)),
      Array.from({ length: 42 }, (_, i) => {
        const d = masDias(desde, i); const items = porDia.get(clave(d)) || [];
        return h('div', { class: `cal-celda ${d.getMonth() !== ancla.getMonth() ? 'fuera' : ''} ${clave(d) === hoyClave ? 'hoy' : ''}` },
          h('button', { type: 'button', class: 'cal-num', onclick: () => irAlDia(d), title: 'Ver el día', 'aria-label': `${d.getDate()} de ${MESES[d.getMonth()]}` }, String(d.getDate())),
          items.slice(0, 3).map((it) => h('button', { type: 'button', class: `cal-chip ${it.tipo === 'nota' ? 'es-nota' : it.e.local ? 'propio' : ''}`, style: `--ec:${it.tipo === 'nota' ? COLOR_NOTA : colorDe(it.e)}`, onclick: () => abrirItem(it), title: `${horaDe(it)} ${etiquetaDe(it)}`.trim() }, horaDe(it) ? h('small', {}, horaDe(it)) : null, h('span', {}, etiquetaDe(it)))),
          items.length > 3 ? h('button', { type: 'button', class: 'cal-mas', onclick: () => irAlDia(d) }, `+${items.length - 3} más`) : null);
      }));

    const notaConAviso = h('div', { class: 'fila' },
      h('input', { type: 'text', placeholder: 'Ej.: llamar al contador', value: u.nota.texto, style: 'flex:1;min-width:200px', 'aria-label': 'Texto de la nota con aviso', oninput: (e) => { u.nota.texto = e.target.value; } }),
      h('input', { type: 'date', value: u.nota.fecha, 'aria-label': 'Día del aviso', oninput: (e) => { u.nota.fecha = e.target.value; } }),
      h('input', { type: 'time', value: u.nota.hora, 'aria-label': 'Hora del aviso', oninput: (e) => { u.nota.hora = e.target.value; } }),
      selectorDeSonido(u.nota.sonido, (v) => { u.nota.sonido = v; }),
      boton('Anotar con aviso', async () => {
        const cuando = u.nota.fecha ? aMs(u.nota.fecha, u.nota.hora || '09:00') : 0;
        if (!u.nota.texto.trim()) { avisarGuardado('¿Qué anoto?'); return; }
        if (u.nota.fecha && !cuando) { avisarGuardado('Esa fecha no es válida.'); return; }
        try { await pedir('notas:crear', { texto: u.nota.texto, cuando: cuando || undefined, sonido: u.nota.sonido || undefined }); u.nota = { texto: '', fecha: '', hora: '', sonido: '' }; avisarGuardado(cuando ? 'Nota anotada con aviso.' : 'Nota anotada.'); await recargar(); } catch (er) { avisarGuardado(er.message); }
      }, 'principal chico'));
    return [
      h('h1', {}, 'Calendario'),
      h('p', { class: 'bajada' }, 'Tus eventos por día, semana o mes: los de tus calendarios (Cuentas y avisos → Calendario), los que armes acá y tus recordatorios. Podés cambiar cualquiera —nombre, hora, lugar, avisos y sonido— pero solo dentro de Jarvis: no se modifica nada en Google. Los eventos propios no se crean en Google.'),
      u.editor ? editor() : [
        h('div', { class: 'cal-barra' },
          h('div', { class: 'cal-nav' },
            boton('Hoy', () => { u.fecha = +dia0(Date.now()); pintar(); }, 'chico'),
            botonIcono('anterior', 'Anterior', () => mover(-1)),
            botonIcono('siguiente', 'Siguiente', () => mover(1)),
            h('h2', { class: 'cal-titulo', 'aria-live': 'polite' }, titulo)),
          h('div', { class: 'cal-herr' },
            segmentado(u, 'vista', [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']], () => pintar(), { porDefecto: 'mes' }),
            h('input', { type: 'date', value: fechaInput(+ancla), 'aria-label': 'Ir a una fecha', title: 'Ir a una fecha', onchange: (e) => { const t = aMs(e.target.value); if (t) { u.fecha = t; pintar(); } } }))),
        h('div', { class: 'fila', style: 'margin:8px 0' },
          boton('Nuevo evento', () => { u.editor = nuevoEditor(null, u.vista === 'dia' ? ancla : (clave(ancla) === hoyClave ? null : ancla)); pintar(); }, 'principal'),
          h('input', { type: 'text', placeholder: 'Buscar en esta vista…', value: u.buscar, style: 'flex:1;max-width:300px', 'aria-label': 'Buscar un evento', oninput: (e) => { u.buscar = e.target.value; clearTimeout(u.reloj); u.reloj = setTimeout(() => { if (seccion !== 'agenda') return; pintar(); const i = document.querySelector('[aria-label="Buscar un evento"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); } }),
          boton('Actualizar', refrescar, 'chico')),
        listo && u.datos.error ? h('p', { class: 'nota mal' }, `No pude leer todo: ${u.datos.error}`) : null,
        !listo ? h('div', { class: 'vacio' }, 'Leyendo…') : u.vista === 'dia' ? vistaDia() : u.vista === 'semana' ? vistaSemana() : vistaMes(),
      ],
      u.editor ? null : calendariosPanel(),
      h('h2', {}, 'Nota con aviso'),
      h('p', { class: 'bajada' }, 'Una nota que suena a su hora, con el sonido que elijas (en Jarvis y, si está prendido en Notas → "Avisarme por WhatsApp", también en tu WhatsApp). Sin día ni hora queda como nota suelta. También por voz: "recordame comprar pan a las 5".'),
      notaConAviso,
    ];
  },
  notas() {
    if (!notasLista) { cargarNotas(); return [h('h1', {}, 'Notas'), h('p', { class: 'bajada' }, 'Leyendo tus notas…')]; }
    const u = notasUI;
    const buscar = u.buscar.trim().toLowerCase();
    const visibles = notasLista.filter((n) => {
      if (u.filtro === 'aviso' && !(n.cuando && !n.avisada)) return false;
      if (u.filtro === 'avisadas' && !(n.cuando && n.avisada)) return false;
      if (u.filtro === 'sin' && n.cuando) return false;
      return !buscar || `${n.texto} ${n.titulo} ${n.app} ${n.enlace}`.toLowerCase().includes(buscar);
    }).sort((a, b) => (u.filtro === 'aviso' ? a.cuando - b.cuando : b.creada - a.creada));
    const avisadas = notasLista.filter((n) => n.cuando && n.avisada).length;
    const texto2 = h('input', { type: 'text', placeholder: 'Escribí una nota…', value: u.nueva.texto, oninput: (e) => { u.nueva.texto = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') agregar.click(); } });
    const cuando = h('input', { type: 'datetime-local', value: u.nueva.cuando, 'aria-label': 'Aviso (opcional)', oninput: (e) => { u.nueva.cuando = e.target.value; } });
    const agregar = boton('Agregar', async () => {
      if (!u.nueva.texto.trim()) { avisarGuardado('Escribí la nota primero.'); return; }
      try {
        const n = await pedir('notas:crear', { texto: u.nueva.texto, cuando: u.nueva.cuando ? new Date(u.nueva.cuando).getTime() : 0 });
        notasLista.unshift(n); u.nueva = { texto: '', cuando: '' }; avisarGuardado(); pintar();
      } catch (e) { avisarGuardado(e.message); }
    });
    return [
      h('h1', {}, 'Notas'),
      h('p', { class: 'bajada' }, 'Lo que le pedís que anote, con aviso o sin aviso. Por voz: "anotá comprar leche", "guardame esto para después" o "recordame ver este video a las 6" (esta guarda también el link de la página y una captura de la pantalla, y a la hora te avisa con eso). Las notas se quedan hasta que las borres; los recordatorios simples ("sacar la pizza en diez minutos") se borran solos al sonar.'),
      h('div', { class: 'fila nota-nueva' }, texto2, cuando, agregar),
      h('div', { class: 'fila', style: 'margin:12px 0' },
        segmentado(u, 'filtro', [['todas', 'Todas'], ['aviso', 'Con aviso'], ['avisadas', 'Ya avisadas'], ['sin', 'Sin aviso']], () => pintar(), { porDefecto: 'todas' }),
        h('input', { type: 'search', placeholder: 'Buscar…', value: u.buscar, oninput: (e) => { u.buscar = e.target.value; clearTimeout(u.relojBuscar); u.relojBuscar = setTimeout(() => { pintar(); const i = contenido.querySelector('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); }, style: 'max-width:200px' }),
        avisadas ? boton(u.confirmarAvisadas ? `¿Borrar ${avisadas}? Tocá de nuevo` : `Borrar las ${avisadas} ya avisadas`, async () => {
          if (!u.confirmarAvisadas) { u.confirmarAvisadas = true; pintar(); setTimeout(() => { u.confirmarAvisadas = false; if (seccion === 'notas') pintar(); }, 3500); return; }
          u.confirmarAvisadas = false;
          try { await pedir('notas:borrar-avisadas'); await cargarNotas(); } catch (e) { avisarGuardado(e.message); }
        }, 'chico') : null),
      visibles.length ? h('div', { class: 'notas-lista' }, visibles.map(tarjetaDeNota))
        : h('div', { class: 'vacio' }, notasLista.length ? 'Ninguna nota coincide con ese filtro.' : 'Todavía no hay notas. Probá decir "Jarvis, anotá comprar leche".'),
    ];
  },

  contexto() {
    const c = cfg.contexto;
    const prueba = contextoPrueba;
    return [
      h('h1', {}, 'Contexto'),
      h('p', { class: 'bajada' }, 'Para que Jarvis pueda ver lo que estás haciendo cuando se lo pedís: "¿qué estoy viendo?", "¿cómo avanzo en este juego?", "traducime lo que dice la pantalla". Nunca mira solo: solo saca una captura cuando se lo pedís.'),
      campo('Dejar que Jarvis vea la pantalla', [casilla(c, 'verPantalla', () => { guardar(); pintar(); }), h('span', {}, c.verPantalla ? 'Sí, cuando se lo pido' : 'No')],
        'La captura se manda al modelo que la mire (el de Inteligencia: Groq o Gemini gratuitos, o Ollama en tu PC con un modelo con visión). No se guarda en ningún lado. Si hay algo privado en pantalla (claves, mails), cerralo antes de preguntar o usá Ollama para que no salga de tu PC.'),
      c.verPantalla ? campo('Tamaño de la captura', segmentado(c, 'anchoCaptura', [[960, 'Chica'], [1280, 'Normal'], [1600, 'Grande']], guardar, { porDefecto: 1280 }), 'Más grande lee mejor los textos chicos, pero tarda más y gasta más cupo gratuito.') : null,
      c.verPantalla ? campo('Probar', [boton('¿Qué vería ahora?', async (ev) => {
        ev.target.disabled = true; ev.target.textContent = 'Mirando…';
        try { contextoPrueba = await pedir('contexto:probar'); } catch (e) { contextoPrueba = { error: e.message }; }
        pintar();
      }, 'chico')], 'Saca una captura de prueba y te la muestra; sirve para comprobar que Windows deja capturar. (Va a verse esta misma ventana de Ajustes.)') : null,
      prueba ? (prueba.error ? h('div', { class: 'nota mal' }, prueba.error) : h('div', { class: 'contexto-prueba' },
        h('img', { src: prueba.imagen, alt: 'Captura de prueba' }),
        h('div', { class: 'nota' }, `${prueba.kb} KB${prueba.ventana ? ` · ventana al frente: ${prueba.ventana}` : ''}${prueba.enlace ? ` · ${prueba.enlace}` : ''}`))) : null,
      h('h2', {}, 'Notas con contexto'),
      campo('Avisarme por WhatsApp', [casilla(cfg.notas, 'porWhatsapp', guardar, true), h('span', {}, 'Cuando suena una nota con aviso, mandarme también un WhatsApp a "Mensajes para mí"')], 'Sirve para cuando no estás frente a la PC. Los mensajes programados ("a las 5 decile a Tomi que…") no usan esto: se mandan a la persona. Ojo: WhatsApp puede no hacer sonar el celular con lo que uno mismo se manda desde otro dispositivo.'),
      campo('Guardar captura', [casilla(cfg.notas, 'capturar', guardar, true), h('span', {}, 'Con "recordame ver este video…", guardar también una captura de la pantalla')], 'Se guarda en la carpeta "notas-capturas" dentro de datos y no sale de tu PC. Se borra junto con la nota.'),
      h('h2', {}, 'Cosas para decir'),
      h('ul', { class: 'pasos-lista' }, [
        '"¿Qué estoy viendo?" · "Mirá mi pantalla y decime qué hago" · "¿Cómo avanzo en este juego?"',
        '"Grabá la última kill" · "Hacé un clip de cómo morí recién" (guarda los últimos segundos como clip de jugada; la duración se cambia en Clips)',
        '"Anotá comprar leche" · "Guardame esto para después" · "Recordame ver este video a las 6"',
        '"¿Qué notas tengo?" · "Abrí las notas"',
      ].map((t) => h('li', {}, t))),
    ];
  },

  panel() {
    if (!panelUI.modo || !cfg.modos.some((m) => m.id === panelUI.modo)) panelUI.modo = cfg.modo;
    const m = cfg.modos.find((x) => x.id === panelUI.modo) || cfg.modos[0];
    widgetsDe(m).forEach((w, i, l) => { const n = normalizarWidget(w); if (n) l[i] = n; });
    m.panel.widgets = m.panel.widgets.filter((w) => TIPOS[w.tipo]);
    const otros = cfg.modos.filter((x) => x.id !== m.id);
    return [
      h('h1', {}, 'Panel del notch'),
      h('p', { class: 'bajada' }, 'Lo que aparece al pasar el mouse sobre el notch, distinto para cada modo. Arrastrá los widgets para ordenarlos y tocá uno para cambiarle ancho, alto, color o contenido. Lo que esté vacío (sin novedades, sin eventos…) no se muestra.'),
      h('div', { class: 'fila', style: 'margin-bottom:12px' }, h('span', { class: 'nota' }, 'Modo:'), segmentado(panelUI, 'modo', cfg.modos.map((x) => [x.id, x.nombre]), () => { panelUI.sel = null; pintar(); }, { porDefecto: cfg.modo })),
      h('h2', {}, 'Vista previa'),
      vistaDelPanel(m),
      avisoDeQuitado(m),
      barraDelWidget(m),
      h('h2', {}, 'Widgets'),
      h('p', { class: 'nota' }, 'Tocá uno para sumarlo al panel. Los que se marcan con una tilde ya están (tocalos para editarlos); los demás se pueden sumar todas las veces que quieras.'),
      paletaDeWidgets(m),
      h('h2', {}, 'Este modo'),
      campo('Clips', [casilla(m.panel, 'clips', () => { guardar(); pintar(); }), h('span', {}, 'Grabar clips en segundo plano en este modo')], 'Los widgets de clips solo se ven si los clips están prendidos (Ajustes → Multimedia → Grabación de clips) y este modo los usa.'),
      otros.length ? campo('Copiar diseño', [
        h('select', { id: 'copiar-de' }, h('option', { value: '' }, 'Elegir un modo…'), otros.map((x) => h('option', { value: x.id }, x.nombre))),
        boton('Copiar', () => {
          const de = cfg.modos.find((x) => x.id === document.getElementById('copiar-de').value);
          if (!de) { avisarGuardado('Elegí de qué modo copiar.'); return; }
          m.panel.widgets = widgetsDe(de).map((w) => ({ ...w, id: nuevoIdDeWidget() }));
          panelUI.sel = null; guardar(); pintar(); avisarGuardado('Diseño copiado');
        }, 'chico'),
      ], 'Copia los widgets de otro modo a este (reemplaza los de ahora).') : null,
      campo('Volver al diseño de fábrica', boton('Restaurar este modo', () => { m.panel.widgets = widgetsPorDefecto(); panelUI.sel = null; guardar(); pintar(); }, 'chico')),
    ];
  },

  notificaciones() {
    const n = cfg.notificaciones;
    n.sonidos = n.sonidos || {};
    for (const k of ['whatsapp', 'mail']) { n[k] = n[k] || {}; n[k].elegidos = Array.isArray(n[k].elegidos) ? n[k].elegidos : []; n[k].silenciados = Array.isArray(n[k].silenciados) ? n[k].silenciados : []; }
    n.mail.cuentas = n.mail.cuentas || {};
    n.calendario = n.calendario || { modo: 'todo' }; n.nota = n.nota || { modo: 'todo' };
    const elegir = (obj, clave, opciones) => h('select', { onchange: (e) => { obj[clave] = e.target.value; guardar(); } },
      opciones.map(([valor, nombre]) => h('option', { value: valor, selected: (obj[clave] ?? '') === valor }, nombre)));
    const MODOS3 = [['nada', 'Nada'], ['elegidos', 'Solo lo que elijas'], ['todo', 'Todo']];
    // Al agregar o quitar una etiqueta se guarda y se actualiza la frase de la tarjeta (sin repintar todo, para no perder el foco).
    const alEtiquetar = (id) => () => { guardar(); const r = document.querySelector(`#fuente-${id} .fuente-resumen`); if (r) r.textContent = resumenDeAvisos(id); };

    // Una fuente: título, el modo a la vista y, abajo, lo que corresponde a ese modo.
    const fuente = (id, titulo, iconoDe, modoObj, opciones, cuerpo) => h('section', { class: `aviso-fuente modo-${modoObj.modo || 'todo'}`, id: `fuente-${id}` },
      h('div', { class: 'fuente-cabeza' }, h('span', { class: 'fuente-icono', html: icono(iconoDe, 18) }), h('h3', {}, titulo),
        segmentado(modoObj, 'modo', opciones, () => { guardar(); pintar(); }, { porDefecto: 'todo' })),
      h('p', { class: 'fuente-resumen' }, resumenDeAvisos(id)),
      modoObj.modo === 'nada' ? null : h('div', { class: 'fuente-cuerpo' }, cuerpo));

    const sugerenciasWa = () => [...new Set((agenda.lista || []).map((x) => x.nombre).filter(Boolean))].slice(0, 400);
    const sugerenciasMail = () => [...new Set((omitidas || []).filter((x) => x.origen === 'mail').flatMap((x) => [x.direccion, x.nombre]).filter(Boolean))];

    // --- WhatsApp ---
    const siempre = (cfg.contactos || []).filter((c) => c && c.avisar === 'siempre').length;
    const wa = fuente('whatsapp', 'WhatsApp', 'whatsapp', n.whatsapp, MODOS3, [
      n.whatsapp.modo === 'elegidos' ? campo('Avisar de', etiquetasEditor(n.whatsapp.elegidos, alEtiquetar('whatsapp'), { placeholder: 'Escribí un contacto o grupo y Enter', sugerencias: sugerenciasWa(), id: 'wa-elegidos' }),
        h('span', {}, 'Alcanza con parte del nombre ("eva" sirve para "Eva López"). Para un grupo, el nombre del grupo. ', siempre ? `Además avisan los ${siempre} marcados "Avisar siempre" en ` : 'También podés marcar "Avisar siempre" a uno en ', enlaceInterno('Ajustes → WhatsApp', 'whatsapp'), '.')) : null,
      n.whatsapp.modo === 'todo' ? campo('Grupos', [casilla(n.whatsapp, 'grupos', () => { guardar(); pintar(); }, true), h('span', {}, n.whatsapp.grupos === false ? 'Sin avisar de los grupos' : 'También avisar de los grupos')]) : null,
      campo('Nunca avisar de', etiquetasEditor(n.whatsapp.silenciados, alEtiquetar('whatsapp'), { placeholder: 'Un contacto o grupo que querés callar', sugerencias: sugerenciasWa(), id: 'wa-silenciados' }), 'Gana sobre todo lo demás.'),
    ]);

    // --- Mail (con una fila por cuenta) ---
    const cuentas = [];
    if ((cfg.correo.gmail.usuario || '').trim()) cuentas.push(['gmail', 'Gmail', cfg.correo.gmail.usuario.trim()]);
    if (cfg.correo.outlook.web || (correo.outlook && correo.outlook.configurada)) cuentas.push(['outlook', 'Hotmail / Outlook', cfg.correo.outlook.usuario || (cfg.correo.outlook.web ? 'por el navegador de Jarvis' : '')]);
    const efectivo = (id) => (MODOS_AVISO.includes(n.mail.cuentas[id]) ? n.mail.cuentas[id] : n.mail.modo);
    const algunoElegidos = n.mail.modo === 'elegidos' || cuentas.some(([id]) => efectivo(id) === 'elegidos');
    const filaCuenta = ([id, nombre, detalle]) => h('div', { class: 'cuenta-fila' },
      h('div', { class: 'cuenta-nombre' }, h('b', {}, nombre), h('span', { class: 'nota' }, detalle)),
      h('select', { 'aria-label': `Avisos de ${nombre}`, onchange: (e) => { if (e.target.value) n.mail.cuentas[id] = e.target.value; else delete n.mail.cuentas[id]; guardar(); pintar(); } },
        [['', 'Como el resto del mail'], ['nada', 'Nada'], ['elegidos', 'Solo lo que elijas'], ['todo', 'Todo']].map(([v, t]) => h('option', { value: v, selected: (n.mail.cuentas[id] || '') === v }, t))));
    const mail = fuente('mail', 'Mail', 'mail', n.mail, MODOS3, [
      cuentas.length ? campo('Cuentas', h('div', { class: 'cuentas' }, cuentas.map(filaCuenta)), 'Cada cuenta puede portarse distinto: por ejemplo, la del trabajo en "Todo" y la personal en "Solo lo que elijas". Se conectan en Ajustes → Mail.')
        : campo('Cuentas', h('span', { class: 'nota' }, 'Todavía no hay ninguna cuenta de mail conectada. '), 'Cuando conectes una, aparece acá para elegirle los avisos aparte.'),
      algunoElegidos ? campo('Avisar de', etiquetasEditor(n.mail.elegidos, alEtiquetar('mail'), { placeholder: 'Nombre, dirección o @dominio, y Enter', sugerencias: sugerenciasMail(), id: 'mail-elegidos' }), 'Alcanza con parte del nombre o de la dirección: "jefe@empresa.com", "Banco Nación", "@miuniversidad.edu.ar".') : null,
      campo('Nunca avisar de', etiquetasEditor(n.mail.silenciados, alEtiquetar('mail'), { placeholder: 'Temu, @promos.com…', sugerencias: sugerenciasMail(), id: 'mail-silenciados' }), 'Promociones, por ejemplo. Gana sobre todo lo demás y vale para todas las cuentas.'),
    ]);

    // --- Calendario ---
    const nombresCal = [...new Set([...(calNombres || []), ...Object.keys((cfg.calendario && cfg.calendario.calendarios) || {})])];
    if (cfg.calendario) cfg.calendario.calendarios = cfg.calendario.calendarios || {};
    const filaCal = (nombre) => {
      const aj = (cfg.calendario.calendarios[nombre] = cfg.calendario.calendarios[nombre] || {});
      const estado = aj.silenciar ? 'silenciar' : Array.isArray(aj.avisos) ? 'propios' : aj.avisar ? 'avisar' : '';
      return h('div', { class: 'cuenta-fila' }, h('div', { class: 'cuenta-nombre' }, h('i', { class: 'cal-punto', style: `--ec:${aj.color || 'var(--acento)'}` }), h('b', {}, nombre)),
        h('select', { 'aria-label': `Avisos de ${nombre}`, onchange: (e) => {
          const v = e.target.value;
          delete aj.avisar; delete aj.silenciar; if (v !== 'propios') delete aj.avisos;
          if (v === 'avisar') aj.avisar = true; if (v === 'silenciar') aj.silenciar = true;
          guardar(); pintar();
        } }, [['', n.calendario.modo === 'elegidos' ? 'No avisa (salvo eventos con avisos propios)' : 'Avisa con los de siempre'], ['avisar', 'Avisar siempre'], ...(estado === 'propios' ? [['propios', 'Avisos propios (se editan en Calendario)']] : []), ['silenciar', 'Silenciado']]
          .map(([val, t]) => h('option', { value: val, selected: estado === val }, t))));
    };
    const cal = fuente('calendario', 'Calendario', 'calendario', n.calendario, [['nada', 'Nada'], ['elegidos', 'Solo lo que elijas'], ['todo', 'Todo']], [
      n.calendario.modo === 'elegidos'
        ? h('p', { class: 'nota' }, 'Avisa de los eventos con avisos propios y de los calendarios marcados "Avisar siempre". Los demás eventos quedan en tu agenda pero no suenan.')
        : h('p', { class: 'nota' }, 'Cada evento avisa con los de siempre ("Avisar antes" en Ajustes → Calendario) o con los suyos si los tiene.'),
      nombresCal.length ? campo('Cada calendario', h('div', { class: 'cuentas' }, nombresCal.map(filaCal)), 'El color, los avisos propios (por mail o WhatsApp, con texto y destinatario) y los de cada evento se editan en Calendario.')
        : h('p', { class: 'nota' }, 'Cuando conectes tu calendario, acá aparece cada uno para elegirle si avisa.'),
      h('p', { class: 'nota' }, '"Nada" apaga las alertas dentro de Jarvis; los WhatsApp y mails que le pediste a un evento siguen saliendo.'),
    ]);

    // --- Recordatorios ---
    const notas = fuente('nota', 'Recordatorios', 'nota', n.nota, [['nada', 'Nada'], ['todo', 'Todos']], [
      campo('Sonido', [elegir(n.sonidos, 'nota', [['', 'El general'], ['ninguno', 'Sin sonido'], ...LISTA_DE_SONIDOS]), boton('▶ Probar', () => probarSonido(n.sonidos.nota || n.sonido), 'chico')], 'Suena cuando una nota con hora te avisa, y los ojos quedan llamando la atención hasta que la saques de la lista.'),
    ]);

    // --- Lo que llegó y no avisó ---
    const hace = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
    const sumar = (o) => {
      const lista = n[o.origen].elegidos;
      const dato = o.origen === 'mail' ? (o.direccion || o.nombre) : o.nombre;
      if (!lista.some((x) => String(x).toLowerCase() === dato.toLowerCase())) lista.push(dato);
      guardar();
      pedir('avisos:olvidar', o.clave).catch(() => {}); omitidas = (omitidas || []).filter((x) => x.clave !== o.clave); pintar();
      avisarGuardado(`Listo: ahora te aviso de ${dato}.`);
    };
    const hayOmitidas = omitidas && omitidas.length;
    const sinAvisar = h('details', { class: 'avanzado', open: !!hayOmitidas, id: 'sin-avisar' },
      h('summary', {}, `Llegaron y no te avisé${hayOmitidas ? ` (${omitidas.length})` : ''}`),
      h('p', { class: 'bajada' }, 'Lo último que te escribió gente que no elegiste, uno por persona. Tocá "Avisar" para sumarla a tus elegidos. Se guarda solo el nombre y un pedazo del mensaje, y se borra a la semana.'),
      hayOmitidas ? h('div', { class: 'omitidas' }, omitidas.map((o) => h('div', { class: 'omitida-fila' },
        h('span', { class: `fuente-icono ${o.origen}`, html: icono(o.origen === 'mail' ? 'mail' : 'whatsapp', 16) }),
        h('div', { class: 'omitida-texto' }, h('b', {}, o.nombre), o.esGrupo ? h('span', { class: 'nota' }, ' · grupo') : null, h('div', { class: 'nota' }, `${o.texto || ''}${o.cantidad > 1 ? ` · ${o.cantidad} en total` : ''} · ${hace(o.cuando)}`)),
        boton('Avisar', () => sumar(o), 'chico'),
        botonQuitar(() => { pedir('avisos:olvidar', o.clave).catch(() => {}); omitidas = omitidas.filter((x) => x.clave !== o.clave); pintar(); }, 'de la lista')))
      ) : h('div', { class: 'vacio' }, omitidas ? 'Todavía no llegó nada que no hayas elegido.' : 'Leyendo…'));

    // --- Reglas avanzadas ---
    const filas = n.reglas.map((r, i) => {
      const modo = { valor: (r.modos || [])[0] || '' };
      return h('tr', {},
        h('td', {}, elegir(r, 'origen', [['todos', 'Todo'], ['whatsapp', 'WhatsApp'], ['mail', 'Mail'], ['calendario', 'Calendario'], ['nota', 'Recordatorio']])),
        h('td', {}, texto(r, 'quien', guardar, { placeholder: 'Cualquiera' })),
        h('td', {}, elegir(r, 'accion', [['avisar', 'Avisar'], ['decir', 'Avisar y leerlo en voz alta'], ['callar', 'No avisar']])),
        h('td', {}, elegir(r, 'sonido', [['', 'El general'], ['ninguno', 'Sin sonido'], ...LISTA_DE_SONIDOS]), ' ', boton('▶', () => probarSonido(r.sonido || n.sonido), 'chico')),
        h('td', {}, h('select', { onchange: (e) => { r.modos = e.target.value ? [e.target.value] : []; guardar(); } },
          [['', 'En todos los modos'], ...cfg.modos.map((m) => [m.id, `Solo en ${m.nombre}`])].map(([valor, nombre]) => h('option', { value: valor, selected: modo.valor === valor }, nombre)))),
        h('td', {}, i > 0 ? boton('↑', () => { n.reglas.splice(i - 1, 0, n.reglas.splice(i, 1)[0]); guardar(); pintar(); }, 'chico') : null, ' ',
          boton('Quitar', () => { n.reglas.splice(i, 1); guardar(); pintar(); }, 'chico')));
    });
    const reglas = h('details', { class: 'avanzado', open: n.reglas.some((r) => !(r.origen === 'todos' && !r.quien && r.accion === 'callar')) },
      h('summary', {}, `Reglas para casos particulares (${n.reglas.length})`),
      h('p', { class: 'bajada' }, 'Para decidir caso por caso, por encima del modo de cada fuente: una persona con su propio sonido, leer en voz alta lo de un remitente, callar todo en un modo (por defecto, en "Dormido"). Se miran de arriba hacia abajo y gana la primera que coincide; en "Quién" va parte del nombre del remitente, del grupo o del asunto. Una regla "Avisar" hace pasar a ese caso aunque la fuente esté en "Solo lo que elijas" (pero no si está en "Nada").'),
      n.reglas.length
        ? h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, ['De dónde', 'Quién', 'Qué hacer', 'Sonido', 'Cuándo', ''].map((t) => h('th', {}, t)))), h('tbody', {}, filas))
        : h('div', { class: 'vacio' }, 'Sin reglas.'),
      boton('Agregar regla', () => { n.reglas.push({ origen: 'todos', quien: '', accion: 'avisar', sonido: '', modos: [] }); guardar(); pintar(); }, 'chico'));

    const ponerTodo = (modo) => {
      n.whatsapp.modo = modo; n.mail.modo = modo; n.mail.cuentas = {};
      n.calendario.modo = modo; n.nota.modo = modo === 'nada' ? 'nada' : 'todo';
      guardar(); pintar(); avisarGuardado(modo === 'nada' ? 'Jarvis no avisa de nada.' : modo === 'todo' ? 'Jarvis avisa de todo.' : 'Jarvis avisa solo de lo que elegiste.');
    };
    return [
      h('h1', {}, 'Notificaciones'),
      h('p', { class: 'bajada' }, 'Elegí de qué te avisa Jarvis. Cada fuente tiene tres modos: "Nada", "Solo lo que elijas" (hoy el que usás) y "Todo". Lo pendiente aparece en el panel del notch, y por voz: "¿tengo mensajes?", "leeme los mails", "borrá las notificaciones".'),
      h('div', { class: 'atajos-avisos' }, h('span', {}, 'Poner todo en'), ...[['nada', 'Nada'], ['elegidos', 'Solo lo elegido'], ['todo', 'Todo']].map(([v, t]) => boton(t, () => ponerTodo(v), 'chico'))),
      wa, mail, cal, notas,
      sinAvisar,
      h('h2', {}, 'Cómo avisa'),
      campo('Estilo', segmentado(n, 'estilo', [['ambos', 'Punto y burbuja'], ['punto', 'Solo el punto'], ['burbuja', 'Solo la burbuja']], guardar, { porDefecto: 'ambos' }),
        'El punto muestra cuántas novedades hay; su color dice de dónde vino la última (verde WhatsApp, celeste mail, amarillo calendario, violeta recordatorio).'),
      campo('Sonido de eventos', [elegir(n.sonidos, 'calendario', [['', 'El general'], ['ninguno', 'Sin sonido'], ...LISTA_DE_SONIDOS]), boton('▶ Probar', () => probarSonido(n.sonidos.calendario || n.sonido), 'chico')], 'Suena antes de cada evento del calendario. Cada evento puede tener el suyo.'),
      campo('Sonido general', [elegir(n, 'sonido', [['', 'Ninguno'], ...LISTA_DE_SONIDOS]), boton('▶ Probar', () => probarSonido(n.sonido), 'chico')], 'Suena con todo lo que avisa, salvo lo que tenga el suyo. En modo silencio no suena.'),
      reglas,
    ];
  },

  voz() {
    const hablar = secciones._general().hablar;
    const cabeza = [h('h1', {}, 'Voz'), h('p', { class: 'bajada' }, 'La voz con la que habla Jarvis y cómo se expresa. También podés entrenar una voz nueva (la tuya o la de un amigo que te dio permiso) y guardar o compartir las voces que armes. Todo corre en esta PC: gratis y sin límite de uso.')];
    if (vp.sel) return vistaDeUnaVoz();
    if (!vp.lista) { cargarVoces(); return [...cabeza, ...hablar, h('h2', {}, 'Entrenar una voz nueva'), h('p', { class: 'ayuda' }, 'Leyendo tus voces…')]; }
    return [...cabeza, ...hablar, ...vistaListaDeVoces()];
  },

  notasvoz() {
    if (!notasVozLista) { cargarNotasVoz(); return [h('h1', {}, 'Notas de voz'), h('p', { class: 'bajada' }, 'Leyendo tus notas de voz…')]; }
    cfg.notasVoz = cfg.notasVoz || { carpeta: '', formato: 'm4a' };
    const nv = cfg.notasVoz;
    const fecha = (t) => new Date(t).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
    const peso = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
    const grabando = notaVozGrabando.activa;
    const botonGrabar = boton(grabando ? 'Parar y guardar' : 'Grabar una nota de voz', async () => {
      try {
        const r = await pedir('notasvoz:accion', grabando ? 'parar' : 'grabar');
        notaVozGrabando.activa = !grabando;
        notaVozGrabando.desde = Date.now();
        avisarGuardado(r);
        if (grabando) await cargarNotasVoz(); else pintar();
      } catch (e) { avisarGuardado(`No pude grabar: ${e.message}`); }
    }, grabando ? 'peligro-lleno' : 'principal');
    const filas = notasVozLista.notas.map((n) => {
      const reproductor = h('div', { class: 'nv-repro' });
      const nombre = h('input', { type: 'text', value: n.nombre.replace(/\.[^.]+$/, ''), 'aria-label': 'Nombre de la nota', onchange: async (e) => {
        try { await pedir('notasvoz:renombrar', { archivo: n.archivo, nombre: e.target.value }); await cargarNotasVoz(); } catch (er) { avisarGuardado(er.message); e.target.value = n.nombre.replace(/\.[^.]+$/, ''); }
      } });
      return h('div', { class: 'nv-fila' },
        h('div', { class: 'nv-datos' }, nombre, h('span', { class: 'ayuda' }, [dur(n.segundos), peso(n.bytes), fecha(n.fecha)].filter(Boolean).join(' · '))),
        h('div', { class: 'fila' },
          boton('▶ Escuchar', async () => {
            try {
              const url = await pedir('notasvoz:vista', n.archivo);
              reproductor.replaceChildren(h('audio', { controls: true, autoplay: true, src: url }));
            } catch (er) { avisarGuardado(`No pude reproducirla: ${er.message}`); }
          }, 'chico'),
          boton('En la carpeta', () => pedir('notasvoz:mostrar', n.archivo).catch((er) => avisarGuardado(er.message)), 'chico'),
          botonQuitar(async () => {
            if (!(await confirmar({ titulo: 'Mandar la nota a la Papelera', texto: n.nombre, si: 'A la Papelera', peligro: true }))) return;
            try { await pedir('notasvoz:papelera', n.archivo); await cargarNotasVoz(); } catch (er) { avisarGuardado(er.message); }
          }, 'esta nota')),
        reproductor);
    });
    return [
      h('h1', {}, 'Notas de voz'),
      h('p', { class: 'bajada' }, 'Grabá audios sueltos con el micrófono: desde el widget "Nota de voz" del panel del notch, desde acá o por voz ("grabá una nota de voz" / "parar la nota de voz"). Se guardan en la carpeta de clips, dentro de "Notas de voz".'),
      h('div', { class: 'fila' }, botonGrabar, boton('Abrir la carpeta', () => pedir('notasvoz:carpeta').catch((e) => avisarGuardado(e.message)), 'chico')),
      h('p', { class: 'ayuda' }, `Carpeta: ${notasVozLista.carpeta}`),
      h('h2', {}, 'Tus notas de voz'),
      filas.length ? h('div', { class: 'nv-lista' }, filas) : h('p', { class: 'ayuda' }, 'Todavía no hay ninguna. Para tenerla a mano, sumá el widget "Nota de voz" en Interfaz → Panel.'),
      h('h2', {}, 'Cómo se guardan'),
      campo('Formato', segmentado(nv, 'formato', [['m4a', 'M4A (liviano)'], ['wav', 'WAV (sin compresión)']], guardar, { porDefecto: 'm4a' }),
        'M4A pesa unas 20 veces menos y suena en todos lados; usa ffmpeg (el mismo de los clips, se baja al activarlos). Si todavía no lo tenés, queda en WAV.'),
      campo('Carpeta propia', texto(nv, 'carpeta', guardar, { placeholder: 'Vacío = "Notas de voz" dentro de la carpeta de clips' }), 'Si querés guardarlas en otro lado, pegá acá la ruta de la carpeta.'),
    ];
  },

  descargas() {
    if (!descargasEstado) { cargarDescargas(); return [h('h1', {}, 'Descargas'), h('p', { class: 'bajada' }, 'Buscando yt-dlp…')]; }
    cfg.descargas = cfg.descargas || { carpeta: '', ytdlp: '', calidad: '1080', cookies: '' };
    const d = cfg.descargas;
    const e = descargasEstado;
    const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
    const pedirDescarga = async (modo) => {
      try { avisarGuardado(await pedir('descargas:iniciar', { modo, url: descargasUI.enlace.trim() })); await cargarDescargas(); } catch (er) { avisarGuardado(er.message); }
    };
    const fila = (x) => h('div', { class: 'nv-fila' },
      h('div', { class: 'nv-datos' },
        h('b', {}, x.nombre || x.url),
        h('span', { class: 'ayuda' }, x.estado === 'bajando' ? `${x.modo === 'audio' ? 'Audio' : 'Video'} · bajando${x.pct ? ` ${x.pct} %` : '…'}` : x.estado === 'espera' ? `${x.modo === 'audio' ? 'Audio' : 'Video'} · esperando su turno` : x.estado === 'error' ? `No se pudo: ${x.error}` : `${x.modo === 'audio' ? 'Audio (mp3)' : 'Video'} · ${hace(x.cuando)}`)),
      x.estado === 'listo' && x.archivo ? h('div', { class: 'fila' },
        boton('Abrir', () => pedir('descargas:abrir', x.archivo).catch((er) => avisarGuardado(er.message)), 'chico'),
        boton('En la carpeta', () => pedir('descargas:mostrar', x.archivo).catch((er) => avisarGuardado(er.message)), 'chico')) : null);
    const hechas = [...(e.activa ? [e.activa] : []), ...(e.enCola || []), ...(e.historial || [])];
    return [
      h('h1', {}, 'Descargas'),
      h('p', { class: 'bajada' }, 'Con yt-dlp, Jarvis baja el video (o solo el audio en mp3) de lo que estás mirando en el navegador. Decile "descargá este video" o "descargá el audio de este video" con el navegador al frente (si no encuentra la pestaña, usa el link que tengas copiado). Se guardan en la carpeta Descargas, junto a tus clips; los audios, en Descargas\\Audio.'),
      
      h('div', { class: 'fila' },
        h('input', { type: 'text', placeholder: 'Pegá el link del video (vacío = el de tu navegador o el que copiaste)', value: descargasUI.enlace, style: 'flex:1;min-width:240px', 'aria-label': 'Link del video', oninput: (ev) => { descargasUI.enlace = ev.target.value; } }),
        boton('Descargar video', () => pedirDescarga('video'), 'principal'),
        boton('Solo el audio', () => pedirDescarga('audio'), 'chico'),
        e.activa || (e.enCola || []).length ? boton('Cancelar', async () => { try { avisarGuardado(await pedir('descargas:cancelar')); await cargarDescargas(); } catch (er) { avisarGuardado(er.message); } }, 'chico') : null),
      hechas.length ? h('div', { class: 'nv-lista' }, hechas.map(fila)) : h('p', { class: 'ayuda' }, 'Todavía no descargaste nada.'),
      h('div', { class: 'fila', style: 'margin-top:10px' },
        boton('Abrir la carpeta', () => pedir('descargas:carpeta').catch((er) => avisarGuardado(er.message)), 'chico'),
        e.ytdlp ? boton(descargasUI.actualizando === '…' ? 'Actualizando…' : 'Actualizar yt-dlp', async () => {
          descargasUI.actualizando = '…'; pintar();
          try { descargasUI.actualizando = await pedir('componentes:actualizar', 'ytdlp'); } catch (er) { descargasUI.actualizando = er.message; }
          await cargarDescargas(); cargarAvisosSistema();
        }, 'chico') : null),
      descargasUI.actualizando && descargasUI.actualizando !== '…' ? h('p', { class: 'ayuda' }, descargasUI.actualizando) : null,
      h('h2', {}, 'Ajustes'),
      campo('yt-dlp', e.ytdlp
        ? [h('span', { class: 'nota bien' }, `Listo${e.version ? ` · versión ${e.version}` : ''}`), h('span', { class: 'ayuda' }, e.ytdlp)]
        : [h('span', { class: 'nota mal' }, 'No lo encuentro'),
          boton('Buscar de nuevo', async () => { try { const r = await pedir('descargas:buscar'); descargasEstado = { ...descargasEstado, ...r }; pintar(); } catch (er) { avisarGuardado(er.message); } }, 'chico'),
          boton(descargasUI.bajando ? 'Bajando…' : 'Bajar yt-dlp (sitio oficial, ~20 MB)', async () => {
            if (descargasUI.bajando) return;
            descargasUI.bajando = true; pintar();
            try { const r = await pedir('descargas:bajarYtdlp'); descargasEstado = { ...descargasEstado, ...r }; avisarGuardado('Listo, bajé yt-dlp.'); } catch (er) { avisarGuardado(`No pude bajarlo: ${er.message}`); }
            descargasUI.bajando = false; pintar();
          }, 'chico')],
      e.ytdlp ? 'Si ya lo tenés instalado (WinGet, scoop o suelto) lo encuentra solo; si no, indicá abajo dónde está.' : 'Instalalo vos (por ejemplo con "winget install yt-dlp") o dejá que Jarvis baje el programa oficial a su carpeta de datos.'),
      campo('Calidad del video', segmentado(d, 'calidad', [['mejor', 'La mejor'], ['1080', '1080p MP4'], ['720', '720p MP4']], guardar, { porDefecto: '1080' }),
        'Es lo que usa "descargá este video" si no decís otra ("en 720", "en la mejor calidad"). 1080p y 720p son las mismas opciones de tu archivo de comandos.'),
      h('h2', {}, 'Avanzado'),
      campo('Carpeta propia', texto(d, 'carpeta', guardar, { placeholder: 'Vacío = "Descargas" dentro de la carpeta de clips' }), `Ahora se guarda en: ${e.carpeta || 'la carpeta de clips'}`),
      campo('Ruta de yt-dlp', texto(d, 'ytdlp', () => { guardar(); setTimeout(async () => { try { descargasEstado = { ...descargasEstado, ...(await pedir('descargas:buscar')) }; pintar(); } catch {} }, 600); }, { placeholder: 'Vacío = buscarlo solo' }), 'Solo si lo tenés en un lugar raro (por ejemplo D:\\Apps\\J\\Videos\\yt-dlp.exe).'),
      campo('Archivo de cookies', texto(d, 'cookies', guardar, { placeholder: 'Opcional, por ejemplo la ruta de tu cookies.txt' }), 'Para videos que piden iniciar sesión (X, Instagram, YouTube con edad). Es tu archivo: Jarvis no lo lee, solo se lo pasa a yt-dlp.'),
    ];
  },

  conexion() {
    const c = cfg.conexion = cfg.conexion || { manual: false, alertas: 'burbuja' };
    const e = estadoConexion || { sin: false, manual: !!c.manual, internet: true, enCola: 0, problemas: [], todos: [] };
    const NOMBRE_ESTADO = { ok: 'Anda', caido: 'No responde', cupo: 'Sin cupo gratuito por ahora' };
    const hace = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
    const filas = e.todos.map((x) => h('div', { class: `conexion-fila ${x.estado}` },
      h('i', { class: 'conexion-punto' }), h('b', {}, x.nombre),
      h('span', {}, `${x.id === 'internet' && x.estado !== 'ok' ? 'Sin conexión' : NOMBRE_ESTADO[x.estado] || x.estado}${x.estado !== 'ok' && x.desde ? ` · ${hace(x.desde)}` : ''}${x.detalle && x.id !== 'internet' ? ` · ${x.detalle}` : ''}`)));
    return [
      h('h1', {}, 'Conexión'),
      h('p', { class: 'bajada' }, 'Jarvis mira si hay internet y si cada servicio (Groq, Gemini, WhatsApp, mail, calendario) responde. Sin conexión aparece un ícono tachado junto a los ojos y Jarvis no usa nada online: siguen andando los clips, los recordatorios, los avisos del calendario ya cargado, las rutinas y lo de esta PC.'),
      h('section', { class: `conexion-estado ${e.sin ? 'sin' : 'con'}` },
        h('span', { html: icono(e.sin ? 'sin_conexion' : 'wifi', 22) }),
        h('div', {}, h('b', {}, e.sin ? (e.manual ? 'Modo sin conexión (activado a mano)' : 'Sin conexión a internet') : e.problemas.length ? 'Hay internet, pero algo no anda' : 'Todo conectado'),
          h('p', {}, e.sin ? 'No consulto modelos en la nube ni mando mensajes. Los pedidos por WhatsApp quedan en cola si querés.' : 'Si se corta internet, paso solo a modo sin conexión y vuelvo cuando regrese.')),
        boton('Revisar ahora', async () => { try { estadoConexion = await pedir('conexion:revisar'); } catch {} if (seccion === 'conexion') pintar(); }, 'chico')),
      h('h2', {}, 'Modo sin conexión'),
      campo('Activarlo a mano', casilla(c, 'manual', async () => { try { estadoConexion = await pedir('conexion:manual', !!c.manual); } catch {} pintar(); }),
        'Útil para usar Jarvis sin gastar datos o para probarlo. Ojo: en este modo no corto la conexión de WhatsApp, así que los mensajes que te llegan pueden seguir apareciendo. Por voz: "modo sin conexión" y "volvé a conectarte".'),
      h('h2', {}, 'Estado de los servicios'),
      h('div', { class: 'conexion-lista' }, filas.length ? filas : h('p', { class: 'ayuda' }, 'Todavía no hay datos.')),
      h('h2', {}, 'Mensajes en cola'),
      e.enCola
        ? h('div', { class: 'conexion-cola' }, h('span', {}, `${e.enCola} mensaje${e.enCola === 1 ? '' : 's'} de WhatsApp esperando internet. Salen solos apenas vuelva (los de más de 6 horas se descartan).`),
          boton('Descartar la cola', async () => { try { estadoConexion = await pedir('conexion:descartarCola'); } catch {} if (seccion === 'conexion') pintar(); }, 'chico'))
        : h('p', { class: 'ayuda' }, 'No hay nada en cola. Si pedís un WhatsApp sin conexión, Jarvis te pregunta cada vez si lo deja en cola o lo cancela. Fotos, audios, música y búsquedas no se encolan: no tienen sentido tarde.'),
      h('h2', {}, 'Alertas'),
      campo('Cuando algo cae o vuelve', segmentado(c, 'alertas', [['icono', 'Solo el ícono'], ['burbuja', 'Ícono y burbuja'], ['voz', 'Ícono, burbuja y voz']], guardar, { porDefecto: 'burbuja' }),
        'Avisa una sola vez cuando cae (internet, Groq, Gemini, WhatsApp, mail o calendario) y otra cuando vuelve. Si se corta internet no avisa de cada servicio por separado.'),
    ];
  },

  celular() {
    const c = cfg.celular = cfg.celular || { activo: false, puerto: 47820, https: 443, hablarEnPC: false, casa: true, puertoCasa: 47821 };
    const e = cel.estado;
    const ts = e && e.tailscale;
    const fecha = (t) => (t ? new Date(t).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
    const hace = (t) => { if (!t) return 'nunca'; const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
    const copiar = (t) => { navigator.clipboard.writeText(t).then(() => avisarGuardado('Copiado.')).catch(() => {}); };
    const pasoCasa = () => {
      if (!c.activo) return h('p', { class: 'ayuda' }, 'Prendé "Usar Jarvis desde el celular" para configurar el acceso.');
      const ca = e && e.casa;
      return [
        campo('Modo casa (app de Android)', casilla(c, 'casa', () => { guardar(); setTimeout(() => cargarCelular(false), 700); }, true),
          'Con la app de Jarvis para Android, el celular encuentra esta PC solo cuando están en la misma Wi-Fi. No hace falta instalar nada más. La primera vez, Windows puede preguntar si deja entrar a Jarvis en redes privadas: tocá "Permitir".'),
        c.casa !== false ? h('div', { class: `cel-ts ${ca && ca.activo ? 'ok' : ''}` },
          h('span', { html: icono(ca && ca.activo ? 'tilde' : 'wifi', 20) }),
          h('div', {},
            h('b', {}, ca && ca.activo ? 'Esperando a la app en tu Wi-Fi' : 'Prendiendo…'),
            h('p', {}, ca && ca.activo && ca.ips && ca.ips.length ? `Esta PC en tu red: ${ca.ips.map((ip) => `${ip}:${ca.puerto}`).join(' · ')} (por si la app no la encuentra sola).` : 'No encuentro una red de casa en esta PC (¿está conectada por Wi-Fi o cable?).'),
            h('p', {}, 'La app se baja de ', enlace('la página de descargas de Jarvis', 'https://github.com/jsolaresc/jarvis/releases/latest'), ' (el archivo que termina en .apk). Android va a pedir permiso para instalar apps de otros orígenes.'))) : null,
      ];
    };
    // Desde afuera con Tailscale integrado (jarvis-red): sin instalar la app de Tailscale.
    const pasoAfuera = () => {
      if (!c.activo) return null;
      const r = (e && e.red) || {};
      const partes = [campo('Usar Jarvis desde afuera (app de Android)', casilla(c, 'afuera', () => { guardar(); setTimeout(() => cargarCelular(false), 900); }, false),
        'Con Tailscale integrado (gratis), esta PC tiene una dirección segura (https) para que la app del celular entre desde cualquier lado con sus datos, sin VPN ni instalar nada en el celular. Solo entran los celulares vinculados. La primera vez hay que iniciar sesión en Tailscale (con Google, por ejemplo) y habilitar "Funnel" con un click.')];
      if (!c.afuera) return partes;
      let cuerpo;
      if (r.disponible === false || r.estado === 'no-disponible') cuerpo = h('p', {}, 'Esta copia de Jarvis no trae Tailscale integrado (viene con el instalador de GitHub). Podés usar la app de Tailscale (más abajo).');
      else if (r.estado === 'NeedsLogin' && r.url) cuerpo = [h('p', {}, 'Falta iniciar sesión en Tailscale (una sola vez). Usá la misma cuenta que vas a usar en el celular.'), h('div', { class: 'fila' }, boton('Iniciar sesión en Tailscale', () => pedir('abrir:enlace', r.url), 'principal'))];
      else if (r.estado === 'Running' && r.funnel === 'listo') cuerpo = [h('b', {}, 'Listo para usar desde afuera'), h('p', {}, `El celular entra solo cuando no está en tu Wi-Fi, con sus datos (sin VPN ni otra app). Dirección: ${r.publica}. Abrí la app del celular una vez en casa para que la aprenda.`)];
      else if (r.estado === 'Running' && r.funnel === 'falta') cuerpo = [h('p', {}, 'Falta un paso en tu cuenta de Tailscale (una sola vez): permitir que esta PC tenga una dirección para entrar desde afuera ("Funnel").'), r.funnelUrl ? h('div', { class: 'fila' }, boton('Habilitarlo en Tailscale', () => pedir('abrir:enlace', r.funnelUrl), 'principal')) : h('p', { class: 'nota' }, r.funnelTexto || ''), h('p', { class: 'nota' }, 'Después de habilitarlo, en unos segundos se pone solo en "Listo".')];
      else if (r.estado === 'Running') cuerpo = [h('p', {}, 'Conectado a Tailscale. Preparando la dirección para entrar desde afuera…')];
      else if (r.estado === 'error') cuerpo = h('p', {}, `No pude conectar: ${r.texto || 'error sin detalle'}.`);
      else cuerpo = h('p', {}, 'Conectando con Tailscale…');
      partes.push(h('div', { class: `cel-ts ${r.estado === 'Running' ? 'ok' : ''}` }, h('span', { html: icono(r.estado === 'Running' ? 'tilde' : 'wifi', 20) }), h('div', {}, cuerpo),
        r.estado === 'Running' ? boton('Cerrar sesión', async (ev) => { ev.target.disabled = true; await pedir('celular:redSalir').catch(() => {}); c.afuera = false; cargarCelular(false); }, 'chico') : null));
      return partes;
    };
    const pasoTs = () => {
      if (!c.activo) return null;
      if (!e || cel.cargando) return h('p', { class: 'ayuda' }, 'Revisando Tailscale…');
      if (!ts || !ts.instalado) return h('div', { class: 'cel-paso' },
        h('p', {}, 'Opcional. Para usar Jarvis fuera de casa, o desde el navegador del celular sin la app de Android, hace falta Tailscale: gratis, arma una red privada entre tu PC y tu celular, cifrada de punta a punta, sin abrir nada a internet.'),
        h('ol', {}, h('li', {}, 'Instalalo en la PC y en el celular (Play Store: "Tailscale").'), h('li', {}, 'Iniciá sesión con la misma cuenta en los dos.'), h('li', {}, 'Volvé acá y tocá "Revisar".')),
        h('div', { class: 'fila' }, boton('Bajar Tailscale', () => pedir('abrir:enlace', 'https://tailscale.com/download/windows'), 'principal'), boton('Revisar', () => cargarCelular(true))));
      if (!ts.conectado) return h('div', { class: 'cel-paso' }, h('p', {}, ts.texto || 'Tailscale no está conectado.'), h('p', { class: 'ayuda' }, 'Abrí Tailscale desde el ícono de la bandeja e iniciá sesión.'), boton('Revisar', () => cargarCelular(true)));
      const r = cel.resultado;
      return h('div', { class: 'cel-paso' },
        h('div', { class: `cel-ts ${ts.publicado ? 'ok' : ''}` },
          h('span', { html: icono(ts.publicado ? 'tilde' : 'wifi', 20) }),
          h('div', {}, h('b', {}, ts.publicado ? 'Listo para usar desde el celular' : 'Tailscale conectado'),
            h('p', {}, ts.publicado ? 'Dirección de Jarvis (solo funciona en tus aparatos con Tailscale):' : `Esta PC en Tailscale: ${ts.nombre}. Falta publicar Jarvis en tu red privada.`),
            ts.publicado ? h('div', { class: 'cel-url' }, h('code', {}, ts.url), botonIcono('copiar', 'Copiar la dirección', () => copiar(ts.url))) : null),
          ts.publicado ? boton('Dejar de publicar', async () => { cel.resultado = await pedir('celular:despublicar').catch((x) => ({ texto: x.message })); cargarCelular(true); }, 'chico')
            : boton('Publicar Jarvis en Tailscale', async (ev) => { ev.target.disabled = true; ev.target.textContent = 'Publicando…'; try { cel.resultado = await pedir('celular:publicar'); } catch (x) { cel.resultado = { ok: false, texto: x.message }; } cargarCelular(true); }, 'principal')),
        r && !r.ok ? h('div', { class: 'cel-resultado mal' }, h('p', {}, r.texto),
          r.habilitar ? h('div', { class: 'fila' }, boton('Habilitar HTTPS en Tailscale', () => pedir('abrir:enlace', r.habilitar), 'principal'), boton('Ya lo habilité', async () => { cel.resultado = await pedir('celular:publicar').catch((x) => ({ ok: false, texto: x.message })); cargarCelular(true); })) : null,
          r.comando ? h('div', { class: 'cel-url' }, h('code', {}, r.comando), botonIcono('copiar', 'Copiar el comando', () => copiar(r.comando))) : null) : null);
    };
    const pasoVincular = () => {
      if (!c.activo) return null;
      const k = cel.codigo;
      if (k && k.vence > Date.now()) {
        const quedan = Math.max(0, Math.round((k.vence - Date.now()) / 1000));
        return h('div', { class: 'cel-codigo' },
          k.qr ? h('img', { class: 'cel-qr', src: k.qr, alt: 'Código QR para vincular el celular' }) : null,
          h('div', {},
            h('p', {}, k.qr ? 'En la app de Android, elegí esta PC y escribí el código. Desde el navegador (con Tailscale), escaneá el QR o abrí la dirección y escribí el código:' : 'En la app de Android, elegí esta PC y escribí este código:'),
            h('div', { class: 'cel-numero', 'aria-label': `Código ${k.codigo.split('').join(' ')}` }, `${k.codigo.slice(0, 3)} ${k.codigo.slice(3)}`),
            h('p', { class: 'ayuda', id: 'cel-quedan' }, `Vence en ${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, '0')}. Sirve una sola vez.`),
            !k.base && !(e && e.casa && e.casa.activo) ? h('p', { class: 'ayuda' }, 'Prendé el modo casa o publicá Jarvis en Tailscale (paso 1): sin eso el celular no llega.') : null,
            boton('Cancelar', async () => { await pedir('celular:cancelarCodigo').catch(() => {}); cel.codigo = null; pintar(); }, 'chico')));
      }
      return h('div', { class: 'fila' }, boton('Vincular un celular', async () => {
        try { cel.codigo = await pedir('celular:codigo'); } catch (x) { avisarGuardado(`No pude: ${x.message}`); }
        pintar(); seguirCodigo();
      }, 'principal'));
    };
    const lista = e && e.dispositivos && e.dispositivos.length
      ? h('div', { class: 'cel-lista' }, e.dispositivos.map((d) => h('div', { class: 'cel-disp' },
        h('span', { class: 'cel-icono', html: icono('celular', 20) }),
        h('div', {}, h('input', { type: 'text', value: d.nombre, 'aria-label': 'Nombre del celular', onchange: async (ev) => { try { await pedir('celular:renombrar', { id: d.id, nombre: ev.target.value }); avisarGuardado(); } catch (x) { avisarGuardado(x.message); } } }),
          h('p', { class: 'ayuda' }, `Vinculado el ${fecha(d.creado)} · último uso ${hace(d.ultimo)}`)),
        boton('Desvincular', async () => {
          if (!await confirmar({ titulo: `¿Desvincular "${d.nombre}"?`, texto: 'Ese celular deja de poder usar Jarvis al instante. Para volver a usarlo hay que vincularlo de nuevo con un código.', si: 'Desvincular', peligro: true })) return;
          try { await pedir('celular:revocar', d.id); } catch (x) { avisarGuardado(x.message); } cargarCelular(false);
        }, 'chico peligro'))))
      : h('p', { class: 'ayuda' }, 'Ningún celular vinculado todavía.');
    return [
      h('h1', {}, 'Celular'),
      h('p', { class: 'bajada' }, 'Usá Jarvis desde el celular: escribile, corré rutinas, descargá, guardá o mandá clips y mandá WhatsApp desde la PC. En casa alcanza con la app de Jarvis para Android, en la misma Wi-Fi. Para usarlo desde afuera, sumá Tailscale (gratis). Solo entran los celulares que vincules acá.'),
      campo('Usar Jarvis desde el celular', casilla(c, 'activo', () => { guardar(); setTimeout(() => cargarCelular(true), 700); }),
        'Mientras está apagado no hay nada escuchando. Prendido, espera pedidos sin gastar recursos.'),
      c.activo ? permisosCelular(c) : null,
      h('h2', {}, '1. En casa'),
      pasoCasa(),
      c.activo ? h('h2', {}, '2. Desde afuera') : null,
      pasoAfuera(),
      c.activo ? avanzado('Con la app de Tailscale (para el navegador del celular)', pasoTs()) : null,
      h('h2', {}, '3. Vincular'),
      c.activo ? h('p', { class: 'ayuda' }, 'Cada celular se vincula una sola vez con un código de 6 cifras. Después queda reconocido hasta que lo desvincules acá.') : null,
      pasoVincular(),
      h('h2', {}, 'Celulares vinculados'),
      lista,
      h('h2', {}, 'Archivos de la PC'),
      h('p', { class: 'ayuda' }, 'Las carpetas que el celular vinculado puede ver: desde ahí bajás cualquier archivo o subís uno, en casa y desde afuera, sin pasar por Drive.'),
      bloqueCarpetasCelular(),
      h('h2', {}, 'Avisos de recordatorios y eventos'),
      h('p', { class: 'ayuda' }, 'Dónde te avisa Jarvis. En el celular llegan como notificación de la app de Android, aunque esté cerrada (la app los pide a la PC cada 15 minutos y al abrirla; en cada celular se pueden apagar desde su menú).'),
      (() => {
        const av = cfg.avisos = cfg.avisos || {};
        const fila = (clave, nombre) => {
          const x = av[clave] = av[clave] || { pc: true, celular: true };
          return campo(nombre, h('div', { class: 'fila' },
            h('span', { class: 'casilla-texto' }, casilla(x, 'pc', guardar, true), h('span', {}, 'En la PC')),
            h('span', { class: 'casilla-texto' }, casilla(x, 'celular', guardar, true), h('span', {}, 'En el celular'))));
        };
        return [fila('recordatorios', 'Recordatorios ("recordame… a las 5")'), fila('calendario', 'Eventos del calendario')];
      })(),
      h('h2', {}, 'Cuando le escribís desde el celular'),
      campo('Contestar también en voz alta en la PC', casilla(c, 'hablarEnPC', guardar),
        'Apagado (recomendado): la respuesta solo aparece en el celular; en la PC queda escrita en el notch y en el Historial ("desde el celular").'),
      avanzado('Avanzado',
        campo('Puerto interno', numero(c, 'puerto', guardar, { min: 1024, max: 65535 }), 'Solo se escucha en esta PC (127.0.0.1). Tailscale le pasa los pedidos. Si lo cambiás, volvé a publicar en Tailscale.'),
        campo('Puerto del modo casa', numero(c, 'puertoCasa', guardar, { min: 1024, max: 65535 }), 'El que usa la app de Android en tu Wi-Fi. Si lo cambiás, la app lo busca en 47821: escribí la dirección a mano en la app.'),
        campo('Puerto HTTPS en Tailscale', numero(c, 'https', guardar, { min: 1, max: 65535 }), '443 = la dirección queda sin número al final. Cambialo solo si ya usás ese puerto para otra cosa.'),
        e && e.local ? h('p', { class: 'ayuda' }, 'Para probar la app en esta misma PC: ', enlace(e.local, e.local)) : null),
    ];
  },

  streaming() {
    const st = cfg.streaming;
    const clave = h('input', { type: 'password', value: st.tmdb, placeholder: 'Opcional', oninput: (e) => { st.tmdb = e.target.value.trim(); guardar(); } });
    const resultado = h('span', { class: 'nota' });
    const titulo = h('input', { type: 'text', placeholder: 'Por ejemplo: Los Simpson' });
    const filas = st.servicios.map((sv, i) => h('tr', {},
      h('td', {}, casilla(sv, 'activo', guardar)),
      h('td', {}, texto(sv, 'nombre', guardar)),
      h('td', {}, texto(sv, 'url', guardar)),
      h('td', {}, i > 0 ? boton('↑', () => { st.servicios.splice(i - 1, 0, st.servicios.splice(i, 1)[0]); guardar(); pintar(); }, 'chico') : null)));
    return [
      h('h1', {}, 'Streaming'),
      h('p', { class: 'bajada' }, '"Poné Los Simpson", "poné la serie tal" o "quiero ver tal película": Jarvis se fija en cuál de tus servicios está y te la abre ahí, en la PC, ya buscada. Si no está en ninguno de los tuyos, la abre en Stremio. También podés nombrar el servicio ("poné Bluey en Disney"). Cuando decís "poné tal cosa" a secas, Jarvis consulta el catálogo: si es una serie o película conocida la abre para ver, y si no, la toma como música.'),
      h('h2', {}, 'Tus servicios'),
      h('p', { class: 'bajada' }, 'Tildá los que tenés. El orden es la preferencia cuando un título está en más de uno. La dirección es la página de búsqueda de cada servicio ({q} es lo que se busca): si alguno cambia su página, se corrige acá.'),
      h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, ['Lo tengo', 'Nombre', 'Dirección de búsqueda', ''].map((t) => h('th', {}, t)))), h('tbody', {}, filas)),
      campo('Abrir con', h('select', { onchange: (e) => { st.navegador = e.target.value; guardar(); } },
        [['predeterminado', 'El navegador predeterminado de Windows'], ['chrome', 'Google Chrome']].map(([valor, nombre]) => h('option', { value: valor, selected: (st.navegador || 'predeterminado') === valor }, nombre))),
        'Elegí el navegador donde tenés iniciada la sesión de tus servicios.'),
      h('h2', {}, 'Fútbol'),
      h('p', { class: 'bajada' }, '"Poné el partido de tu equipo" o "¿por dónde pasan el partido?": Jarvis busca en internet por qué canal va, te lo dice y abre Flow (si lo tenés tildado arriba). Elegir el canal dentro de Flow todavía lo hacés vos. Necesita la búsqueda en internet funcionando (Ajustes → Inteligencia).'),
      campo('Tus equipos', texto(st, 'equipos', guardar, { placeholder: 'Ej.: Banfield, Estudiantes' }), 'Separados por coma. Los clubes más conocidos y la Selección ya se entienden sin cargarlos; esto es para otros (un club del ascenso, un equipo de afuera).'),
      h('h2', {}, 'Saber dónde está cada título'),
      campo('Clave de TMDB', [clave, boton('Ver', () => { clave.type = clave.type === 'password' ? 'text' : 'password'; }, 'chico')],
        h('span', {}, 'Gratis para uso personal: se saca en ', enlace('themoviedb.org', 'https://www.themoviedb.org/settings/api'), ' (hay que crear una cuenta). Sin esta clave Jarvis no sabe en qué servicio está cada cosa y abre directo Stremio, o el servicio que nombres.')),
      campo('País', texto(st, 'pais', guardar, { placeholder: 'AR' }), 'El catálogo cambia según el país (código de dos letras).'),
      campo('Estado', [boton('Probar', async (ev) => {
        ev.target.disabled = true; resultado.className = 'nota'; resultado.textContent = 'Consultando…';
        try { await pedir('cfg:guardar', cfg); resultado.textContent = await pedir('streaming:probar'); resultado.className = 'nota bien'; } catch (er) { resultado.className = 'nota mal'; resultado.textContent = er.message; }
        ev.target.disabled = false;
      }, 'chico'), resultado]),
      campo('Probar con un título', [titulo, boton('Abrir en la PC', async () => {
        if (!titulo.value.trim()) return;
        try { await pedir('cfg:guardar', cfg); avisarGuardado(await pedir('streaming:ver', { titulo: titulo.value.trim() })); } catch (er) { avisarGuardado(er.message); }
      }, 'chico')]),
      h('h2', {}, 'En la tele'),
      h('p', { class: 'bajada' }, '"Poné Los Simpson en la tele": Jarvis se fija en qué servicio está, te lo dice y abre esa app en la tele (Disney+, HBO Max, Netflix, Prime, Pluto TV, Flow) con el control remoto de Google TV; el título lo elegís vos con el control. Para eso hay que vincular cada tele una vez, en Dispositivos → "Vincular control". YouTube sí se elige directo. Es un camino no oficial: puede dejar de andar si Google cambia algo.'),
      campo('Tele por defecto', selector(st, 'tele', nombres(cfg.teles), guardar, cfg.teles.length ? 'Preguntar cuál' : 'No hay teles cargadas (Ajustes → Dispositivos)'), 'La que se usa cuando decís "en la tele" sin aclarar cuál.'),
      h('p', { class: 'nota' }, 'Los datos de dónde ver cada título vienen de JustWatch a través de TMDB. Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.'),
    ];
  },

  musica() {
    const clave = h('input', { type: 'password', value: cfg.musica.apiKeyYoutube, placeholder: 'Pegá acá la clave', oninput: (e) => { cfg.musica.apiKeyYoutube = e.target.value.trim(); guardar(); } });
    const estadoSesion = h('span', { class: 'nota cargando' }, 'Consultando…');
    const mirarSesion = () => pedir('musica:sesionIniciada').then((si) => {
      estadoSesion.className = `nota ${si ? 'bien' : 'aviso'}`;
      estadoSesion.textContent = si ? 'Sesión iniciada' : 'Todavía sin iniciar sesión';
    }).catch(() => {});
    mirarSesion();
    const resultado = h('span', { class: 'nota' });
    return [
      h('h1', {}, 'Música'),
      h('p', { class: 'bajada' }, 'Suena en YouTube Music, en esta PC, sin abrir ninguna ventana (con YouTube Premium, sin anuncios). "Jarvis, poné música" pone tu Supermix: la mezcla que YouTube Music arma con tus gustos. El botón del medio del notch es Pausa cuando suena y Play cuando no (sin nada puesto, arranca el Supermix).'),
      h('h2', {}, 'Sesión'),
      campo('Cuenta de YouTube Music', [boton('Iniciar sesión…', () => pedir('musica:sesion'), 'chico'), boton('Revisar', mirarSesion, 'chico'), estadoSesion],
        'Se abre una ventana para que inicies sesión vos mismo con tu cuenta de Google (Jarvis nunca ve ni guarda tu contraseña). Hace falta una sola vez; después cerrá esa ventana.'),
      h('h2', {}, '"Poné música"'),
      campo('Pantalla despierta', [casilla(cfg.sistema, 'mantenerPantalla', guardar, true), h('span', {}, 'Que Windows no apague la pantalla mientras Jarvis reproduce música')], 'Útil si una tele hace de segundo monitor y de parlantes: sin esto se apaga por inactividad y se corta el sonido. No toca la configuración de energía de Windows: solo vale mientras suena algo. Si la tele se apaga sola por su propio temporizador, eso se cambia en la tele.'),
      campo('Qué suena', texto(cfg.musica, 'porDefecto', guardar, { placeholder: 'Mi Supermix (automático)' }),
        'Vacío: tu Supermix. Si preferís otra lista o mezcla, pegá acá su link de YouTube Music (el que tiene "list=").'),
      campo('Probar', [boton('Poner música ahora', async (e) => {
        e.target.disabled = true; resultado.className = 'nota'; resultado.textContent = 'Abriendo…';
        try { await pedir('cfg:guardar', cfg); resultado.textContent = await pedir('musica:reproducir', ''); resultado.className = 'nota bien'; } catch (er) { resultado.className = 'nota mal'; resultado.textContent = er.message; }
        e.target.disabled = false;
      }, 'chico'), boton('Pausar / seguir', () => pedir('musica:controlar', 'alternar').catch((er) => avisarGuardado(er.message)), 'chico'), resultado]),
      h('h2', {}, 'Canciones por nombre'),
      h('p', { class: 'bajada' }, '"Poné la canción tal" o "poné a tal artista" ya funciona sin configurar nada: Jarvis abre la búsqueda de YouTube por detrás y toma el primer resultado. La clave de abajo es opcional; con ella la búsqueda es un poco más rápida y se limita a música.'),
      campo('Clave de la API de YouTube', [clave, boton('Ver', () => { clave.type = clave.type === 'password' ? 'text' : 'password'; }, 'chico')],
        h('span', {}, 'Opcional. En ', enlace('Google Cloud Console → Credenciales', 'https://console.cloud.google.com/apis/credentials'), ', con "YouTube Data API v3" ya habilitada: botón "Crear credenciales" → "Clave de API", y pegás acá la clave que te muestra.')),
    ];
  },

  componentes() {
    const lista = compo.lista;
    const filas = !lista ? [h('p', { class: 'bajada cargando' }, 'Revisando qué está instalado…')] : lista.map((c) => h('div', { class: 'tarjeta-componente' },
      h('div', { class: 'fila' },
        h('strong', {}, c.nombre),
        h('span', { class: `nota ${c.listo ? (c.desactualizado ? 'aviso' : 'bien') : c.error ? 'mal' : c.bajando ? 'aviso' : ''}` },
          c.actualizando ? 'Actualizando…' : c.listo ? (c.desactualizado ? `Desactualizado${c.version ? ` · ${c.version}` : ''}${c.ultima && c.ultima !== c.version ? ` (salió la ${c.ultima})` : ''}` : `Instalado${c.version ? ` · ${c.version}` : ''}`) : c.bajando ? 'Bajando…' : c.error ? 'No se pudo bajar' : `No instalado · ~${c.mb} MB`),
        c.listo && c.actualizable ? boton(c.actualizando ? 'Actualizando…' : 'Actualizar', async (ev) => {
          ev.target.disabled = true; c.actualizando = true; pintar();
          try { avisarGuardado(await pedir('componentes:actualizar', c.id)); } catch (e) { avisarGuardado(e.message); }
          await cargarComponentes(); cargarAvisosSistema();
        }, c.desactualizado ? 'principal chico' : 'chico') : null,
        c.listo || c.bajando ? null : boton(c.recomendado ? 'Bajar (recomendado)' : 'Bajar', async () => { try { await pedir('componentes:instalar', c.id); setTimeout(cargarComponentes, 400); } catch (e) { avisarGuardado(e.message); } }, c.recomendado ? 'principal chico' : 'chico')),
      h('p', { class: 'nota' }, c.detalle),
      c.error ? h('p', { class: 'nota mal' }, c.error) : null));
    return [
      h('h1', {}, 'Componentes'),
      h('p', { class: 'bajada' }, 'Lo que no viene dentro del instalador porque pesa mucho o no todos lo usan. Se baja una sola vez de su fuente oficial; lo que elegiste al instalar se baja solo. Para borrarlos, andá a Almacenamiento.'),
      ...filas,
      h('h2', {}, 'Tus datos'),
      campo('Dónde se guardan', [h('code', {}, compo.info.datos || '…'), boton('Abrir la carpeta', () => pedir('datos:carpeta').catch((e) => avisarGuardado(e.message)), 'chico')],
        'Configuración, rutinas, sesión de WhatsApp, voces y modelos. Las actualizaciones no tocan esta carpeta.'),
      campo('Traer datos de otro Jarvis', boton('Elegir la carpeta "datos"…', async () => {
        try {
          const r = await pedir('datos:importar');
          if (r && !r.cancelado) avisarGuardado(`Listo: copié ${r.copiados} archivos. Reinicio Jarvis para usarlos.`);
        } catch (e) { avisarGuardado(e.message); }
      }, 'chico'), 'Para pasar de la versión portable (Jarvis.exe suelto) a esta: elegí la carpeta "datos" que está al lado del exe anterior. Se copia todo (configuración, WhatsApp vinculado, voces) y Jarvis se reinicia. Lo que había acá queda guardado aparte. No uses los dos Jarvis a la vez con el mismo WhatsApp.'),
    ];
  },

  actualizaciones() {
    const a = compo.act || {};
    const i = compo.info || {};
    const t = compo.tam;
    const fechaLinda = (iso) => { const d = new Date(iso); return !iso || Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }); };
    const copias = { instalada: 'Instalada (se actualiza sola)', portable: 'Portable (un solo .exe)', codigo: 'Desde el código (npm start)' };
    const fases = { quieto: 'Todavía no revisó.', buscando: 'Buscando una versión nueva…', 'al-dia': 'Tenés la última versión.', bajando: `Bajando la versión ${a.nueva || 'nueva'}… ${a.progreso || 0} %`, lista: `La versión ${a.nueva} está lista para instalar.`, error: a.error || 'No se pudo revisar.' };
    const revisado = a.revisado ? ` Última revisión: ${new Date(a.revisado).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.` : '';
    const barraTamano = t && t.total > 0 ? [
      h('div', { class: 'barra-espacio', role: 'img', 'aria-label': 'Reparto del espacio: programa y datos' },
        t.programa > 0 ? h('span', { class: 'trozo g-herramientas', style: `flex:${Math.max(t.programa, t.total * 0.02)}`, title: `Programa: ${formatoBytes(t.programa)}` }) : null,
        h('span', { class: 'trozo g-datos', style: `flex:${Math.max(t.datos, t.total * 0.02)}`, title: `Tus datos: ${formatoBytes(t.datos)}` })),
      h('div', { class: 'leyenda' },
        t.programaSinDato ? null : h('span', { class: 'rotulo' }, h('i', { class: 'punto g-herramientas' }), `Programa ${formatoBytes(t.programa)}`),
        h('span', { class: 'rotulo' }, h('i', { class: 'punto g-datos' }), `Tus datos ${formatoBytes(t.datos)}`)),
    ] : [];
    const sinActualizar = a.posible === false;
    const accion = a.fase === 'lista'
      ? boton(`Reiniciar y actualizar a ${a.nueva}`, () => pedir('actualizacion:instalar').catch((e) => avisarGuardado(e.message)), 'principal')
      : a.fase === 'bajando' || a.fase === 'buscando'
        ? Object.assign(boton(a.fase === 'bajando' ? `Bajando… ${a.progreso || 0} %` : 'Buscando…', () => {}, 'chico'), { disabled: true })
        : boton('Buscar actualizaciones', async (ev) => { ev.target.disabled = true; compo.act = await pedir('actualizacion:buscar').catch(() => compo.act); pintar(); }, 'principal');
    const texto = [
      `Jarvis ${i.version || ''}${i.commit ? ` (${i.commit})` : ''}`,
      `Release: ${fechaLinda(i.fecha) || 'sin dato'}`,
      `Copia: ${copias[i.copia] || ''}`,
      t ? `Tamaño en disco: ${formatoBytes(t.total)} (programa ${t.programaSinDato ? '—' : formatoBytes(t.programa)}, datos ${formatoBytes(t.datos)})` : '',
      `Electron ${i.electron || ''} · Chromium ${i.chromium || ''} · Node ${i.node || ''}`,
      `Sistema: ${i.sistema || ''}`,
    ].filter(Boolean).join('\n');
    return [
      h('h1', {}, 'Información'),
      h('p', { class: 'bajada' }, 'Qué versión tenés, de cuándo es, cuánto ocupa y cómo actualizarla. Tus datos y ajustes se conservan al actualizar.'),
      h('div', { class: 'resumen-espacio' },
        h('div', { class: 'cifra' }, `${i.nombre || 'Jarvis'} ${i.version || '…'}`, h('small', {}, ` · ${copias[i.copia] || ''}`)),
        h('p', { class: 'nota' }, i.fecha ? `Release del ${fechaLinda(i.fecha)}${i.commit ? ` · compilación ${i.commit}` : ''}` : 'Fecha del release: sin dato')),
      h('h2', {}, 'Actualizar'),
      sinActualizar
        ? [h('p', { class: 'nota aviso' }, a.motivo || 'Las actualizaciones automáticas son para la versión instalada.'),
          h('div', { class: 'fila' }, boton('Abrir la página de descargas', () => pedir('abrir:enlace', 'https://github.com/jsolaresc/jarvis/releases/latest'), 'principal'))]
        : [campo('Estado', [h('span', { class: `nota ${a.fase === 'error' ? 'mal' : a.fase === 'lista' || a.fase === 'al-dia' ? 'bien' : 'aviso'}` }, (fases[a.fase] || '') + (a.fase === 'al-dia' || a.fase === 'error' ? revisado : '')), accion],
          'Jarvis busca solo cada unas horas, baja la versión nueva en segundo plano y la instala cuando lo cerrás. Con este botón la buscás o la instalás ahora.'),
        a.nueva ? campo('Versión nueva', [h('strong', {}, a.nueva), a.nuevaFecha ? h('span', { class: 'nota' }, `publicada el ${fechaLinda(a.nuevaFecha)}`) : null, enlace('Qué cambió', `https://github.com/jsolaresc/jarvis/releases/tag/v${a.nueva}`)]) : null,
        a.fase === 'bajando' ? h('div', { class: 'barra-espacio', role: 'progressbar', 'aria-valuenow': String(a.progreso || 0), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { class: 'trozo', style: `--c:var(--acento);flex:${Math.max(a.progreso || 0, 2)}` }), h('span', { style: `flex:${100 - Math.max(a.progreso || 0, 2)}` })) : null],
      h('h2', {}, 'Tamaño en disco'),
      !t ? h('p', { class: 'bajada cargando' }, 'Calculando cuánto ocupa…') : h('div', { class: 'resumen-espacio' },
        h('div', { class: 'cifra' }, formatoBytes(t.total), h('small', {}, ' entre programa y datos')),
        ...barraTamano,
        h('p', { class: 'nota' }, `${t.completo ? '' : 'Cálculo parcial (hay muchísimos archivos). '}${t.libre != null ? `Quedan ${formatoBytes(t.libre)} libres en ese disco. ` : ''}Los clips y las descargas se guardan aparte, en tu carpeta de videos.`),
        h('div', { class: 'fila' }, boton('Ver detalle y liberar espacio', () => irA('almacenamiento'), 'chico'), boton('Volver a calcular', cargarActualizacion, 'chico'))),
      h('h2', {}, 'Esta copia'),
      campo('Programa', [h('code', {}, i.programa || '…')]),
      campo('Datos', [h('code', {}, i.datos || '…'), boton('Abrir la carpeta', () => pedir('datos:carpeta').catch((e) => avisarGuardado(e.message)), 'chico')], 'Configuración, rutinas, WhatsApp vinculado, voces y modelos.'),
      campo('Componentes', [h('span', { class: 'nota' }, `Electron ${i.electron || '…'} · Chromium ${i.chromium || '…'} · Node ${i.node || '…'}`)]),
      campo('Sistema', [h('span', { class: 'nota' }, i.sistema || '…')]),
      h('div', { class: 'fila' },
        boton('Copiar esta información', async () => { try { await navigator.clipboard.writeText(texto); avisarGuardado('Copiado. Pegalo donde lo necesites.'); } catch { avisarGuardado('No pude copiar.'); } }, 'chico'),
        enlace('Todas las versiones', 'https://github.com/jsolaresc/jarvis/releases')),
    ];
  },

  almacenamiento() {
    if (!almacen) return [h('h1', {}, 'Almacenamiento'), h('p', { class: 'bajada cargando' }, 'Calculando cuánto ocupa cada cosa…')];
    if (almacen.error) return [h('h1', {}, 'Almacenamiento'), h('p', { class: 'nota mal' }, almacen.error)];
    const tamano = (b) => {
      if (!b) return '0 MB';
      const coma = (n) => n.toFixed(n >= 100 ? 0 : 1).replace('.', ',');
      return b >= 1e9 ? `${coma(b / 1e9)} GB` : b >= 1e6 ? `${coma(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
    };
    const dosPasos = (id, texto, alConfirmar) => {
      const b = boton(confirmando === id ? '¿Seguro?' : texto, async () => {
        if (confirmando !== id) { confirmando = id; clearTimeout(relojConfirmar); relojConfirmar = setTimeout(() => { confirmando = ''; if (seccion === 'almacenamiento') pintar(); }, 4000); pintar(); return; }
        confirmando = ''; clearTimeout(relojConfirmar);
        b.disabled = true;
        try { avisarGuardado(await alConfirmar()); } catch (er) { avisarGuardado(er.message); }
        await cargarAlmacen(); voces = await pedir('modelos:estado').catch(() => voces);
      }, confirmando === id ? 'peligro chico' : 'chico');
      return b;
    };
    const liberarId = (id) => () => pedir('almacenamiento:liberar', id);
    const seguros = almacen.grupos.filter((g) => g.id === 'temporales').flatMap((g) => g.items).filter((i) => i.bytes > 0);
    const segurosBytes = seguros.reduce((t, i) => t + i.bytes, 0);
    const barra = h('div', { class: 'barra-espacio', role: 'img', 'aria-label': 'Reparto del espacio que usa Jarvis' },
      almacen.grupos.filter((g) => g.bytes > 0 && g.id !== 'fotos').map((g) => h('span', { class: `trozo g-${g.id}`, style: `flex:${Math.max(g.bytes, almacen.total * 0.01)}`, title: `${g.titulo}: ${tamano(g.bytes)}` })));
    const leyenda = h('div', { class: 'leyenda' }, almacen.grupos.filter((g) => g.bytes > 0 && g.id !== 'fotos').map((g) => h('span', { class: 'rotulo' }, h('i', { class: `punto g-${g.id}` }), `${g.titulo} ${tamano(g.bytes)}`)));
    const disco = almacen.disco ? `En el disco donde está Jarvis quedan ${tamano(almacen.disco.libre)} libres de ${tamano(almacen.disco.total)}.` : '';
    const discoClips = almacen.discoClips && (!almacen.disco || almacen.discoClips.total !== almacen.disco.total) ? ` En el de los clips, ${tamano(almacen.discoClips.libre)} libres de ${tamano(almacen.discoClips.total)}.` : '';
    return [
      h('h1', {}, 'Almacenamiento'),
      h('p', { class: 'bajada' }, 'Todo lo que Jarvis guarda en tu disco, y cómo liberarlo. Los modelos y las herramientas se pueden borrar: Jarvis los vuelve a bajar solo cuando los necesita.'),
      h('div', { class: 'resumen-espacio' },
        h('div', { class: 'cifra' }, tamano(almacen.total), h('small', {}, ' en total')),
        barra, leyenda,
        h('p', { class: 'nota' }, disco + discoClips)),
      segurosBytes > 0 ? campo('Limpieza rápida', [dosPasos('rapida', `Liberar ${tamano(segurosBytes)} de temporales`, async () => { let dicho = ''; for (const i of seguros) dicho = await pedir('almacenamiento:liberar', i.id); return `Listo: liberé ${tamano(segurosBytes)}.`; }), h('span', { class: 'nota' }, 'Memoria de clips, copias para WhatsApp y descargas cortadas. No toca tus videos.')]) : null,
      bloqueVideosEnLote(tamano),
      ...almacen.grupos.map((g) => h('section', { class: `bloque-espacio g-${g.id}` },
        h('div', { class: 'cabeza-espacio' }, h('h2', {}, g.titulo), h('span', { class: 'cifra-chica' }, g.id === 'fotos' ? 'No se guardan' : tamano(g.bytes))),
        h('p', { class: 'bajada' }, g.ayuda),
        g.id === 'clips' ? h('div', { class: 'fila', style: 'margin-bottom:6px' }, boton('Abrir la carpeta', () => pedir('clips:abrir-carpeta', g.carpeta).catch((er) => avisarGuardado(er.message)), 'chico')) : null,
        g.items.length ? h('div', { class: 'renglones' }, g.items.map((i) => h('div', { class: 'renglon' },
          h('div', { class: 'quien-espacio' }, h('div', {}, i.nombre), h('div', { class: 'nota' }, i.enUso && g.id === 'voces' ? 'Es la voz que usa Jarvis ahora: cambiala en Básico para poder borrarla' : i.detalle)),
          h('div', { class: 'peso' }, (i.soloInfo && i.id === 'fotos') || !i.instalado ? '—' : tamano(i.bytes)),
          h('div', { class: 'accion-espacio' }, i.soloInfo || !i.instalado || !i.bytes || i.enUso ? null
            : dosPasos(i.id, g.id === 'clips' ? 'A la Papelera' : 'Liberar', liberarId(i.id)))))) : h('div', { class: 'vacio' }, g.id === 'clips' ? 'Todavía no hay clips guardados.' : 'Nada por acá.'))),
      h('div', { class: 'fila' }, boton('Volver a calcular', cargarAlmacen, 'chico')),
    ];
  },
};
secciones.general = () => secciones._general().basico;
secciones.escucha = () => secciones._general().escucha;

// Historial: una línea de tiempo por día, con de dónde vino cada pedido y filtros.
const histUI = { filtro: 'todo', buscar: '' };
secciones.historial = function historial() {
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const ORIGEN = { voz: 'voz', texto: 'escrito', click: 'click', aviso: 'sola', celular: 'celular' };
  const FILTROS = [['todo', 'Todo'], ['voz', 'Voz'], ['celular', 'Celular'], ['aviso', 'Solas'], ['error', 'Errores']];
  const q = histUI.buscar.trim().toLowerCase();
  const lista = registros.filter((r) => (histUI.filtro === 'todo' || (histUI.filtro === 'error' ? r.ok === false : r.origen === histUI.filtro)) && (!q || `${r.dicho} ${r.respuesta}`.toLowerCase().includes(q)));
  const hoy = new Date().toDateString(); const ayer = new Date(Date.now() - 86400000).toDateString();
  const nombreDia = (t) => { const d = new Date(t).toDateString(); return d === hoy ? 'Hoy' : d === ayer ? 'Ayer' : new Date(t).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }); };
  const grupos = [];
  for (const r of lista) { const k = new Date(r.cuando).toDateString(); const g = grupos[grupos.length - 1]; if (g && g.k === k) g.items.push(r); else grupos.push({ k, t: r.cuando, items: [r] }); }
  const fila = (r) => h('div', { class: `registro o-${r.origen}${r.ok === false ? ' mal' : ''}` },
    h('div', { class: 'cabeza' },
      h('span', { class: 'r-hora' }, hhmm(r.cuando)),
      h('span', { class: 'r-dicho' }, r.dicho || '(sin texto)'),
      h('span', { class: 'chip' }, ORIGEN[r.origen] || r.origen),
      r.ok === false ? h('span', { class: 'chip mal' }, 'falló') : null,
      h('span', { class: 'r-acciones' },
        r.dicho && r.origen !== 'aviso' ? boton(r.ok === false ? 'Reintentar' : 'Repetir', async (ev) => {
          ev.target.disabled = true; ev.target.textContent = 'Haciéndolo…';
          try { avisarGuardado(await pedir('historial:repetir', r.id)); } catch (er) { avisarGuardado(er.message); }
          registros = await pedir('historial:leer').catch(() => registros); pintar();
        }, 'chico') : null,
        r.dicho && r.origen !== 'aviso' ? boton('Hacer rutina', async () => {
          try {
            const n = await pedir('historial:aRutina', r.id);
            rutinas = await pedir('rutinas:leer').catch(() => rutinas);
            avisarConAccion(`Armé la rutina "${n.nombre}".`, 'Verla', () => { elegida = Math.max(0, rutinas.findIndex((x) => x.id === n.id)); irA('rutinas'); return ''; }, 8000);
          } catch (er) { avisarGuardado(er.message); }
        }, 'chico') : null,
        botonIcono('tacho', 'Borrar esta línea', async () => { await pedir('historial:borrar', r.id); registros = registros.filter((x) => x.id !== r.id); pintar(); }))),
    r.respuesta ? h('div', { class: 'respuesta' }, r.respuesta) : null,
    (r.detalle || []).length ? h('details', { open: detallesAbiertos.has(r.id), ontoggle: (e) => { if (e.target.open) detallesAbiertos.add(r.id); else detallesAbiertos.delete(r.id); } },
      h('summary', {}, `Detalle${typeof r.ms === 'number' ? ` · ${(r.ms / 1000).toFixed(1).replace('.', ',')} s` : ''}`),
      h('ol', {}, r.detalle.map((d) => h('li', { class: d.error ? 'error' : '' }, h('time', {}, `+${(d.t / 1000).toFixed(2)} s`), h('span', {}, d.texto))))) : null);
  return [
    h('div', { class: 'titulo-con-acciones' }, h('h1', {}, 'Historial'),
      botonIcono('actualizar', 'Actualizar', async () => { registros = await pedir('historial:leer').catch(() => registros); pintar(); }),
      registros.length ? botonIcono('tacho', 'Borrar todo el historial', async () => { if (!await confirmar({ titulo: '¿Borrar todo el historial?', texto: `Se borran ${registros.length} pedidos. No se puede deshacer.`, si: 'Borrar', peligro: true })) return; await pedir('historial:limpiar'); registros = []; detallesAbiertos.clear(); pintar(); }) : null),
    h('div', { class: 'hist-barra' },
      h('div', { class: 'fichas', role: 'radiogroup', 'aria-label': 'Mostrar' }, FILTROS.map(([v, t]) => h('button', { type: 'button', role: 'radio', class: `ficha${histUI.filtro === v ? ' on' : ''}`, 'aria-checked': String(histUI.filtro === v), onclick: () => { histUI.filtro = v; pintar(); } }, t))),
      h('input', { type: 'search', class: 'hist-buscar', placeholder: 'Buscar', 'aria-label': 'Buscar en el historial', value: histUI.buscar, oninput: (e) => { histUI.buscar = e.target.value; const pos = e.target.selectionStart; pintar(); const i = document.querySelector('.hist-buscar'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } })),
    !registros.length ? h('div', { class: 'vacio' }, 'Todavía no hay nada. Pedile algo a Jarvis y aparece acá.')
      : !lista.length ? h('div', { class: 'vacio' }, 'Nada con ese filtro.')
        : grupos.map((g) => h('section', { class: 'hist-dia' }, h('h2', { class: 'hist-dia-t' }, nombreDia(g.t)), h('div', { class: 'hist-linea' }, g.items.map(fila)))),
  ];
};

// ---------- Editor de rutinas ----------
const nombres = (lista) => lista.map((x) => String(x.nombre || '').split(',')[0].trim()).filter(Boolean); // con sinónimos ("Eva, Evi") se muestra el primero
// A quién se le puede mandar un WhatsApp: los contactos cargados, o uno mismo.
const destinatarios = () => [{ valor: 'yo', nombre: 'A mí (mi propio WhatsApp)' }, ...nombres(cfg.contactos),
  ...agenda.lista.filter((x) => x.grupo && !cfg.contactos.some((c) => c.jid === x.jid)).map((x) => ({ valor: x.nombre, nombre: `${x.nombre} (grupo)` }))];
const TIPOS_PASO = {
  juego: {
    titulo: 'Abrir un juego (Steam)',
    campos: (p) => [h('input', { type: 'text', value: p.juego || '', placeholder: 'Counter-Strike 2', list: 'juegos', oninput: (e) => {
      p.juego = e.target.value;
      const j = listas.juegos.find((x) => x.nombre.toLowerCase() === e.target.value.trim().toLowerCase());
      if (j) p.appid = j.id; else delete p.appid; // si es uno de la lista, se guarda su número: así anda aunque lo digas distinto
      guardarRutinas();
    } }),
    h('span', { class: 'nota' }, listas.juegos.length ? 'Elegí de tus juegos de Steam o escribí el nombre. Abre Steam si está cerrado.' : 'Escribí el nombre del juego tal como está en Steam. Abre Steam si está cerrado.')],
  },
  abrir: { titulo: 'Abrir un programa', campos: (p) => [texto(p, 'programa', guardarRutinas, { placeholder: 'Discord', list: 'programas' })] },
  cerrar: { titulo: 'Cerrar un programa', campos: (p) => [texto(p, 'proceso', guardarRutinas, { placeholder: 'Discord.exe' })] },
  salida_audio: { titulo: 'Cambiar salida de audio', campos: (p) => [selector(p, 'salida', [...nombres(cfg.salidasAudio), ...listas.salidas.map((s) => s.nombre)], guardarRutinas)] },
  volumen: { titulo: 'Volumen de la PC', campos: (p) => [numero(p, 'nivel', guardarRutinas, { min: 0, max: 100, placeholder: '0 a 100' })] },
  tele: {
    titulo: 'Controlar una tele',
    campos: (p) => [selector(p, 'tele', nombres(cfg.teles), guardarRutinas, 'Qué tele…'),
      selector(p, 'accion', ['prender', 'apagar', 'pausar', 'reanudar', 'detener', 'volumen', 'silenciar', 'sonido'], guardarRutinas, 'Qué hacer…'),
      texto(p, 'valor', guardarRutinas, { placeholder: 'Volumen (0 a 100)' })],
  },
  reproducir: {
    titulo: 'Enviar algo a la tele',
    campos: (p) => [selector(p, 'tele', nombres(cfg.teles), guardarRutinas, 'Qué tele…'), texto(p, 'origen', guardarRutinas, { placeholder: 'Ruta de un video o una URL' })],
  },
  casa: {
    titulo: 'Luces y casa',
    campos: (p) => [selector(p, 'dispositivo', nombres(cfg.casa), guardarRutinas, 'Qué dispositivo…'),
      selector(p, 'accion', ['prender', 'apagar', 'alternar', 'brillo'], guardarRutinas, 'Qué hacer…'), texto(p, 'valor', guardarRutinas, { placeholder: 'Brillo (0 a 100)' })],
  },
  whatsapp: { titulo: 'Mandar un WhatsApp', campos: (p) => [selector(p, 'contacto', destinatarios(), guardarRutinas, 'A quién…'), texto(p, 'mensaje', guardarRutinas, { placeholder: 'Mensaje' })] },
  foto_whatsapp: { titulo: 'Mandar foto de la webcam', campos: (p) => [selector(p, 'contacto', destinatarios(), guardarRutinas, 'A quién…'), texto(p, 'epigrafe', guardarRutinas, { placeholder: 'Texto (opcional)' })] },
  audio_whatsapp: { titulo: 'Grabar y mandar nota de voz', campos: (p) => [selector(p, 'contacto', destinatarios(), guardarRutinas, 'A quién…'), numero(p, 'segundos', guardarRutinas, { min: 2, max: 60, placeholder: 'Segundos (8)' })] },
  decir: { titulo: 'Que Jarvis diga algo', campos: (p) => [texto(p, 'texto', guardarRutinas, { placeholder: 'Modo juego activado.' })] },
  esperar: { titulo: 'Esperar', campos: (p) => [numero(p, 'segundos', guardarRutinas, { min: 1, max: 120, placeholder: 'Segundos' })] },
  modo: { titulo: 'Cambiar modo de Jarvis', campos: (p) => [selector(p, 'modo', (cfg.modos || []).map((m) => ({ valor: m.id, nombre: m.nombre })), guardarRutinas)] },
  ver: {
    titulo: 'Abrir una serie, película o video',
    campos: (p) => [texto(p, 'titulo', guardarRutinas, { placeholder: 'Qué ver' }),
      selector(p, 'servicio', cfg.streaming.servicios.map((sv) => ({ valor: sv.id, nombre: sv.nombre })), guardarRutinas, 'Donde esté'),
      texto(p, 'dispositivo', guardarRutinas, { placeholder: 'En la PC (o el nombre de una tele)' })],
  },
  musica: { titulo: 'Reproducir música', campos: (p) => [texto(p, 'busqueda', guardarRutinas, { placeholder: 'Canción, álbum, género… (vacío = "poné música")' })] },
  pedido: { titulo: 'Pedirle algo a Jarvis', campos: (p) => [texto(p, 'texto', guardarRutinas, { placeholder: 'Lo que le dirías, por ejemplo "apagá la tele del comedor"' })] },
};

// Carpetas compartidas con el celular (sin elegir: Descargas, Escritorio, Documentos, Imágenes y Clips).
let carpetasCel = null;
function bloqueCarpetasCelular() {
  const c = cfg.celular;
  if (!carpetasCel) { pedir('celular:carpetas').then((l) => { carpetasCel = l; pintar(); }).catch(() => { carpetasCel = []; }); return h('p', { class: 'nota' }, 'Cargando…'); }
  const guardarLista = (l) => { c.carpetas = l.map(({ id, nombre, ruta }) => ({ id, nombre, ruta })); carpetasCel = c.carpetas; guardar(); pintar(); };
  return h('div', { class: 'carpetas-cel' },
    carpetasCel.map((x, i) => h('div', { class: 'renglon' },
      h('div', { class: 'quien-espacio' }, h('input', { type: 'text', value: x.nombre, 'aria-label': 'Nombre que ve el celular', onchange: (e) => { const l = carpetasCel.slice(); l[i] = { ...x, nombre: e.target.value.trim() || x.nombre }; guardarLista(l); } }), h('div', { class: 'nota' }, x.ruta)),
      botonQuitar(() => guardarLista(carpetasCel.filter((_, k) => k !== i)), `la carpeta ${x.nombre}`))),
    h('div', { class: 'fila' },
      boton('Agregar una carpeta', async () => { const r = await pedir('celular:elegirCarpeta'); if (!r) return; const nombre = r.split(/[\\/]/).filter(Boolean).pop() || r; guardarLista([...carpetasCel, { id: `c${Date.now().toString(36)}`, nombre, ruta: r }]); }, 'chico'),
      Array.isArray(c.carpetas) ? boton('Volver a las de siempre', () => { delete c.carpetas; carpetasCel = null; guardar(); pintar(); }, 'chico') : null));
}
// "Se hace sola": a una hora, al abrir un juego o programa, al conectar un aparato de audio, al llegar a casa, al prender la PC.
const TIPOS_DISPARADOR = [['hora', 'A una hora'], ['juego', 'Al abrir un juego'], ['programa', 'Al abrir un programa'], ['audio', 'Al conectar un aparato de audio'], ['llegar', 'Al llegar a casa (con el celular)'], ['inicio', 'Al prender la PC']];
const DIAS_CORTOS = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
function editorDisparadores(r) {
  r.disparadores = Array.isArray(r.disparadores) ? r.disparadores : [];
  const cambio = () => { guardarRutinas(); pintar(); };
  const filas = r.disparadores.map((d, i) => {
    let campos = [];
    if (d.tipo === 'hora') {
      d.dias = Array.isArray(d.dias) ? d.dias : [];
      campos = [h('input', { type: 'time', value: d.hora || '08:00', 'aria-label': 'Hora', onchange: (e) => { d.hora = e.target.value; guardarRutinas(); } }),
        h('div', { class: 'dias', role: 'group', 'aria-label': 'Días (ninguno = todos)' }, DIAS_CORTOS.map(([n, l]) => h('button', { type: 'button', class: `dia${d.dias.includes(n) ? ' on' : ''}`, 'aria-pressed': String(d.dias.includes(n)), title: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][n], onclick: () => { d.dias = d.dias.includes(n) ? d.dias.filter((x) => x !== n) : [...d.dias, n].sort(); cambio(); } }, l))),
        h('span', { class: 'nota' }, d.dias.length ? '' : 'todos los días')];
    } else if (d.tipo === 'juego') {
      campos = [selector(d, 'juego', listas.juegos.map((j) => j.nombre), () => { const j = listas.juegos.find((x) => x.nombre === d.juego); d.carpeta = j ? j.carpeta : ''; guardarRutinas(); }, 'Qué juego (de Steam)…')];
    } else if (d.tipo === 'programa') {
      campos = [h('input', { type: 'text', value: d.proceso || '', placeholder: 'Discord.exe', 'aria-label': 'Nombre del programa (.exe)', oninput: (e) => { d.proceso = e.target.value.trim(); guardarRutinas(); } }), h('span', { class: 'nota' }, 'el nombre del .exe (lo ves en el Administrador de tareas → Detalles)')];
    } else if (d.tipo === 'audio') {
      campos = [selector(d, 'salida', [...nombres(cfg.salidasAudio), ...listas.salidas.map((x) => x.nombre)], guardarRutinas, 'Qué aparato…'), h('span', { class: 'nota' }, 'auriculares, parlante Bluetooth… cuando aparece en Windows')];
    } else if (d.tipo === 'llegar') campos = [h('span', { class: 'nota' }, 'Cuando el celular vinculado vuelve a la Wi-Fi de casa (la app lo revisa al abrirla y cada 15 minutos).')];
    else if (d.tipo === 'inicio') campos = [h('span', { class: 'nota' }, 'Cuando arranca Jarvis (si arranca con Windows, al prender la PC).')];
    return h('div', { class: 'disparador' },
      h('span', { class: 'd-tipo' }, (TIPOS_DISPARADOR.find(([t]) => t === d.tipo) || [0, d.tipo])[1]),
      h('div', { class: 'd-campos' }, campos),
      botonQuitar(() => { r.disparadores.splice(i, 1); cambio(); }, 'este disparador'));
  });
  const sumar = h('select', { 'aria-label': 'Agregar cuándo se hace sola', onchange: (e) => { const t = e.target.value; if (!t) return; r.disparadores.push(t === 'hora' ? { tipo: 'hora', hora: '08:00', dias: [] } : { tipo: t }); if (t === 'juego' && !listas.juegos.length) pedir('pc:juegos').then((j) => { listas.juegos = j || []; pintar(); }).catch(() => {}); cambio(); } },
    h('option', { value: '' }, '+ Que se haga sola…'), TIPOS_DISPARADOR.map(([t, n]) => h('option', { value: t }, n)));
  return h('div', { class: 'disparadores' },
    h('h2', {}, 'Cuándo se hace sola'),
    r.disparadores.length ? null : h('p', { class: 'nota' }, 'Por ahora solo cuando la pedís (por voz, el botón o el celular).'),
    filas, h('div', { class: 'fila' }, sumar));
}
function editorRutina(r) {
  const resultado = h('span', { class: 'nota' });
  const mover = (i, d) => { const [p] = r.pasos.splice(i, 1); r.pasos.splice(i + d, 0, p); guardarRutinas(); pintar(); };
  return h('div', { class: 'editor' },
    h('datalist', { id: 'programas' }, listas.programas.map((n) => h('option', { value: n }))),
    h('datalist', { id: 'juegos' }, listas.juegos.map((j) => h('option', { value: j.nombre }))),
    campo('Nombre', h('input', { type: 'text', value: r.nombre, oninput: (e) => { r.nombre = e.target.value; guardarRutinas(); }, onchange: pintar }), 'Así se la pedís a Jarvis por voz.'),
    campo('Ícono', h('div', { class: 'iconos' }, ICONOS_RUTINA.map((n) => h('button', { type: 'button', title: n, 'aria-label': `Ícono ${n}`, 'aria-pressed': String(n === r.icono), class: n === r.icono ? 'elegido' : '', html: icono(n, 18), onclick: () => { r.icono = n; guardarRutinas(); pintar(); } })))),
    campo('Otras frases', h('input', { type: 'text', value: (r.activadores || []).join(', '), placeholder: 'avisale que juego, decile que juego',
      oninput: (e) => { r.activadores = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); guardarRutinas(); } }),
      'Otras maneras de pedirla, separadas por coma. Aunque no las cargues, Jarvis entiende variantes parecidas ("avisale", "decile", "contale" cuentan como lo mismo) y, si duda, te pregunta antes de hacerla.'),
    campo('Acción rápida', [casilla(r, 'rapida', guardarRutinas), h('span', {}, 'Mostrar como botón en el notch')]),
    editorDisparadores(r),
    h('h2', {}, 'Pasos'),
    r.pasos.length ? null : h('div', { class: 'vacio' }, 'Esta rutina todavía no hace nada. Agregale un paso.'),
    r.pasos.map((p, i) => h('div', { class: 'paso' },
      h('span', { class: 'n' }, `${i + 1}.`),
      h('div', { class: 'cabeza' },
        h('select', { 'aria-label': 'Tipo de paso', onchange: (e) => { r.pasos[i] = { tipo: e.target.value }; guardarRutinas(); pintar(); } },
          Object.entries(TIPOS_PASO).map(([id, t]) => h('option', { value: id, selected: id === p.tipo }, t.titulo))),
        Object.assign(botonIcono('subir', 'Subir paso', () => mover(i, -1)), { disabled: i === 0 }),
        Object.assign(botonIcono('bajar', 'Bajar paso', () => mover(i, 1)), { disabled: i === r.pasos.length - 1 }),
        botonQuitar(() => { r.pasos.splice(i, 1); guardarRutinas(); pintar(); }, `el paso ${i + 1}`)),
      TIPOS_PASO[p.tipo]
        ? h('div', { class: 'extra' }, TIPOS_PASO[p.tipo].campos(p))
        : h('div', { class: 'extra nota' }, `Paso "${p.tipo}": se edita a mano en datos/rutinas.json.`))),
    h('div', { class: 'fila', style: 'margin-top:14px' },
      boton('Agregar paso', () => { r.pasos.push({ tipo: 'abrir' }); guardarRutinas(); pintar(); }),
      boton('Probar ahora', async (e) => {
        e.target.disabled = true; resultado.className = 'nota'; resultado.textContent = 'Ejecutando…';
        try {
          await pedir('rutinas:guardar', rutinas);
          const res = await pedir('rutina:ejecutar', r.id);
          resultado.className = `nota ${res.ok ? 'bien' : 'mal'}`;
          resultado.textContent = res.ok ? 'Salió todo bien.' : res.errores.join(' · ');
        } catch (er) { resultado.className = 'nota mal'; resultado.textContent = er.message; }
        e.target.disabled = false;
      }, 'principal'),
      h('span', { style: 'flex:1' }),
      boton('Eliminar rutina', async () => {
        if (!await confirmar({ titulo: `¿Eliminar "${r.nombre || 'la rutina'}"?`, texto: 'No se puede deshacer.', si: 'Eliminar', peligro: true })) return;
        rutinas.splice(elegida, 1); elegida = 0; guardarRutinas(); pintar();
      }, 'peligro')),
    h('div', { style: 'margin-top:8px' }, resultado));
}

// ---------- [A4][A5] Resumen: estado de todo de un vistazo + primeros pasos ----------
// Celular: todo lo que el celular puede hacer en esta PC, en un solo lugar, con lo último que hizo.
let accesoAhora = {};
jarvis.escuchar('acceso', (a) => { accesoAhora = a || {}; if (seccion === 'celular' && !escribiendo()) pintar(); });
function permisosCelular(c) {
  const fila = (ic, nombre, detalle, control) => h('div', { class: 'permiso' }, h('span', { class: 'p-ic', html: icono(ic, 18) }), h('div', { class: 'p-texto' }, h('b', {}, nombre), detalle ? h('span', { class: 'nota' }, detalle) : null), control);
  const casillaCon = (clave, nombre, porDefecto) => { const l = casilla(c, clave, () => { guardar(); pintar(); }, porDefecto); l.querySelector('input').setAttribute('aria-label', nombre); return l; };
  const actividad = (registros || []).filter((r) => r.origen === 'celular').slice(0, 5);
  const v = c.vigilar = c.vigilar || { activo: false, sensibilidad: 'media', grabar: true };
  const aplicarVig = () => pedir('camara:vigilar', v).then(() => { avisarGuardado(v.activo ? 'Vigilando' : 'Guardado'); pintar(); }).catch((e) => { v.activo = false; avisarGuardado(e.message); pintar(); });
  const casVig = casilla(v, 'activo', aplicarVig); casVig.querySelector('input').setAttribute('aria-label', 'Vigilar');
  const AHORA = [['camara', 'Viendo la cámara'], ['pantalla', 'Viendo la pantalla'], ['control', 'Manejando el mouse y el teclado'], ['archivos', 'Con los archivos']].filter(([k]) => (accesoAhora[k] || []).length);
  return h('section', { class: 'permisos-cel' },
    AHORA.length ? h('div', { class: 'acceso-ahora', role: 'status' }, h('span', { class: 'aa-punto' }),
      h('div', {}, h('b', {}, 'Ahora'), ...AHORA.map(([k, t]) => h('div', { class: 'nota' }, `${t}: ${accesoAhora[k].join(', ')}`))),
      AHORA.some(([k]) => k === 'pantalla' || k === 'camara') ? boton('Cortar', async () => { accesoAhora = await pedir('acceso:cortar').catch(() => accesoAhora); pintar(); }, 'chico peligro') : null) : null,
    h('h2', {}, 'Qué puede hacer el celular'),
    fila('celular', 'Charla, rutinas, mouse, teclado y energía', 'Siempre, con un celular vinculado', null),
    fila('carpeta', 'Archivos de la PC', (() => { const n = (carpetasCel || c.carpetas || []).length; return `${n} ${n === 1 ? 'carpeta compartida' : 'carpetas compartidas'}`; })(), boton('Elegir', () => { const x = document.querySelector('.carpetas-cel, #carpetas-cel'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 'chico')),
    fila('tele', 'Escritorio remoto', 'Ver y manejar la pantalla', casillaCon('escritorio', 'Escritorio remoto')),
    c.escritorio ? fila('parlante', 'Con el sonido de la PC', null, casillaCon('escritorioAudio', 'Con el sonido de la PC', true)) : null,
    fila('camara', 'Cámara', 'Webcam y micrófono, solo mientras mira', casillaCon('camara', 'Cámara')),
    c.camara ? fila('alerta', 'Vigilar', 'Avisa al celular si hay movimiento y lo graba', casVig) : null,
    c.camara && v.activo ? fila('ajustes', 'Sensibilidad', null, h('select', { 'aria-label': 'Sensibilidad', onchange: (e) => { v.sensibilidad = e.target.value; aplicarVig(); } }, ...[['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']].map(([x, t]) => h('option', { value: x, selected: (v.sensibilidad || 'media') === x }, t)))) : null,
    c.escritorio ? h('div', { class: 'fila' }, boton('Cortar si alguien está mirando', async () => { await pedir('escritorio:cortar'); avisarGuardado('Cortado'); }, 'chico')) : null,
    h('h3', { class: 'p-sub' }, 'Lo último que hizo'),
    actividad.length ? h('ul', { class: 'actividad-cel' }, actividad.map((r) => h('li', { class: r.ok === false ? 'mal' : '' }, h('span', { class: 'nota' }, new Date(r.cuando).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), h('span', {}, r.dicho || r.respuesta || ''))))
      : h('p', { class: 'nota' }, 'Nada todavía.'));
}

// ---------- Inicio: tu día y lo último que hiciste (el estado de los servicios vive en Sistema → Servicios) ----------
const inicioDatos = { agenda: null, pidiendo: false, t: 0 };
async function cargarInicioPC() {
  if (inicioDatos.pidiendo || Date.now() - inicioDatos.t < 60000) return;
  inicioDatos.pidiendo = true;
  try {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const [r, ns] = await Promise.all([pedir('calendario:rango', { desde: +d0, hasta: +d0 + 86400000 }).catch(() => ({ eventos: [] })), pedir('notas:leer').catch(() => notasLista || [])]);
    notasLista = ns;
    inicioDatos.agenda = [...(r.eventos || []).filter((e) => e.fin > Date.now()).map((e) => ({ t: e.todoElDia ? +d0 : e.inicio, titulo: e.titulo, hora: e.todoElDia ? 'Todo el día' : new Date(e.inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), ic: 'calendario' })),
      ...(ns || []).filter((n) => n.cuando && !n.avisada && n.cuando < +d0 + 86400000).map((n) => ({ t: n.cuando, titulo: n.texto, hora: new Date(n.cuando).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), ic: 'reloj' }))].sort((a, b) => a.t - b.t);
    inicioDatos.t = Date.now();
  } finally { inicioDatos.pidiendo = false; }
  if (seccion === 'resumen' && !escribiendo()) pintar();
}
secciones.resumen = function resumen() {
  const m = voces.modelos || {};
  const vozLista = ['oido', 'vad'].every((id) => !m[id] || m[id].instalado) && (cfg.habla.voz === 'windows' || !m[`voz-${cfg.habla.voz}`] || m[`voz-${cfg.habla.voz}`].instalado);
  const iaLista = Object.values(ia || {}).filter((x) => x && x.configurado).map((x) => x.nombre);
  const pasos = [
    ['Decile a Jarvis cómo te llamás', !!cfg.usuario, 'general'],
    ['Bajar los modelos de voz', vozLista, 'escucha'],
    ['Configurar una inteligencia (Groq o Gemini, gratis)', iaLista.length > 0, 'inteligencia'],
    ['Cargar tu ciudad para el clima', !!cfg.ciudad, 'general'],
    ['Vincular WhatsApp (opcional)', whatsapp.fase === 'conectado', 'whatsapp'],
  ];
  const hechos = pasos.filter((x) => x[1]).length;
  const hora = new Date().getHours();
  const saludo = `${hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'}${cfg.usuario ? `, ${cfg.usuario}` : ''}`;
  const pend = pendientes();
  const problemas = Object.entries(pend).filter(([k]) => k !== 'resumen' && k !== 'sistema');
  const ultimo = (clipsGuardados || []).slice().sort((a, b) => b.fecha - a.fecha)[0];
  if (ultimo) setTimeout(() => pedirMiniaturas([ultimo]), 0);
  const hace = (t) => { const mm = Math.round((Date.now() - t) / 60000); return mm < 1 ? 'recién' : mm < 60 ? `hace ${mm} min` : mm < 1440 ? `hace ${Math.round(mm / 60)} h` : new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); };
  const pedidos = (registros || []).filter((r) => r.dicho && r.origen !== 'aviso').slice(0, 4);
  const rapidas = rutinas.filter((r) => r.rapida).slice(0, 6);
  const tarjetaHoy = h('section', { class: 'tarjeta-inicio' },
    h('div', { class: 'ti-cabeza' }, h('h2', {}, 'Para hoy'), boton('Agenda', () => irA('agenda'), 'chico')),
    inicioDatos.agenda === null ? h('p', { class: 'nota' }, 'Cargando…')
      : inicioDatos.agenda.length ? h('ul', { class: 'ti-lista' }, inicioDatos.agenda.slice(0, 5).map((x) => h('li', {}, h('span', { class: 'ti-hora' }, x.hora), h('span', { html: icono(x.ic, 14), class: 'ti-ic' }), h('span', {}, x.titulo))))
        : h('p', { class: 'nota' }, 'Nada para hoy.'));
  const tarjetaClip = h('section', { class: 'tarjeta-inicio clip' },
    h('div', { class: 'ti-cabeza' }, h('h2', {}, 'Último clip'), boton('Clips', () => irA('clips'), 'chico')),
    ultimo ? h('button', { type: 'button', class: 'ti-clip', onclick: () => { irA('clips'); abrirEditor(ultimo); } },
      h('span', { class: 'ti-cuadro' }, h('img', { class: 'miniatura', alt: '', 'data-archivo': ultimo.archivo, src: miniaturas.get(ultimo.archivo) || undefined, hidden: !miniaturas.get(ultimo.archivo) }), h('span', { html: icono('clip', 26), hidden: !!miniaturas.get(ultimo.archivo) })),
      h('span', { class: 'ti-clip-datos' }, h('b', {}, ultimo.nombre), h('span', { class: 'nota' }, [ultimo.juego, hace(ultimo.fecha)].filter(Boolean).join(' · '))))
      : h('p', { class: 'nota' }, clipsGuardados ? 'Todavía no hay clips.' : 'Cargando…'));
  return [
    h('h1', {}, saludo),
    bloqueAvisosSistema(),
    problemas.length ? h('section', { class: 'avisos-sistema' }, h('div', { class: 'aviso-sistema aviso' }, h('span', { class: 'as-icono', html: icono('alerta', 18) }), h('div', { class: 'as-texto' }, h('b', {}, problemas.map(([, t]) => t).join(' · '))), h('div', { class: 'as-acciones' }, boton('Ver', () => irA('servicios'), 'chico')))) : null,
    INFO.edicion ? h('div', { class: 'aviso-edicion' }, h('span', { html: icono('info', 18) }), h('div', {}, h('b', {}, 'Jarvis B, la edición de prueba.'), ' Guarda sus datos aparte (datos-B).')) : null,
    hechos < pasos.length ? h('section', { class: 'primeros-pasos compacto' },
      h('div', { class: 'pp-cabeza' }, h('h2', {}, 'Primeros pasos'), h('span', { class: 'nota' }, `${hechos} de ${pasos.length}`)),
      h('div', { class: 'progreso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(pasos.length), 'aria-valuenow': String(hechos), 'aria-label': 'Primeros pasos completados' }, h('i', { style: `width:${(hechos / pasos.length) * 100}%` })),
      h('ol', { class: 'pp-lista' }, pasos.filter(([, ok]) => !ok).map(([t, , hoja]) => h('li', {}, h('span', { class: 'pp-marca' }), h('a', { onclick: () => irA(hoja), tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter') irA(hoja); } }, t))))) : null,
    h('div', { class: 'inicio-grilla' }, tarjetaHoy, tarjetaClip),
    rapidas.length ? h('section', { class: 'tarjeta-inicio' }, h('div', { class: 'ti-cabeza' }, h('h2', {}, 'Atajos'), boton('Rutinas', () => irA('rutinas'), 'chico')),
      h('div', { class: 'ti-atajos' }, rapidas.map((r) => h('button', { type: 'button', class: 'tile-accion', onclick: async (ev) => { ev.currentTarget.disabled = true; try { const x = await pedir('rutina:ejecutar', r.id); avisarGuardado(x && x.ok === false ? x.errores.join(' · ') : `Listo: ${String(r.nombre).split(',')[0]}.`); } catch (er) { avisarGuardado(er.message); } ev.target.disabled = false; },
        html: `${icono(r.icono || 'rayo', 22)}<span>${String(r.nombre).split(',')[0]}</span>` })))) : null,
    h('section', { class: 'tarjeta-inicio' }, h('div', { class: 'ti-cabeza' }, h('h2', {}, 'Lo último que pediste'), boton('Historial', () => irA('historial'), 'chico')),
      pedidos.length ? h('ul', { class: 'ti-pedidos' }, pedidos.map((r) => h('li', { class: r.ok === false ? 'mal' : '' },
        h('span', { class: 'ti-hora' }, hace(r.cuando)), h('b', {}, `"${r.dicho}"`), h('span', { class: 'nota' }, r.respuesta || ''),
        boton('Repetir', async (ev) => { ev.target.disabled = true; try { avisarGuardado(await pedir('historial:repetir', r.id)); } catch (er) { avisarGuardado(er.message); } registros = await pedir('historial:leer').catch(() => registros); pintar(); }, 'chico'))))
        : h('p', { class: 'nota' }, 'Pedile algo a Jarvis y aparece acá.')),
  ];
};
// Sistema → Servicios: cómo está cada parte (antes estaba en Inicio).
secciones.servicios = function servicios() {
  const m = voces.modelos || {};
  const vozLista = ['oido', 'vad'].every((id) => !m[id] || m[id].instalado) && (cfg.habla.voz === 'windows' || !m[`voz-${cfg.habla.voz}`] || m[`voz-${cfg.habla.voz}`].instalado);
  const bajando = Object.values(m).find((x) => x && x.bajando);
  const iaLista = Object.values(ia || {}).filter((x) => x && x.configurado).map((x) => x.nombre);
  const WA = { conectado: ['bien', 'Vinculado'], qr: ['aviso', 'Esperando el código QR'], conectando: ['aviso', 'Conectando…'], error: ['mal', 'Con error'] };
  const wa = WA[whatsapp.fase] || ['', 'Sin vincular'];
  const gmail = cfg.correo.gmail.usuario && cfg.correo.gmail.clave;
  const casillas = [gmail ? 'Gmail' : null, cfg.correo.outlook && cfg.correo.outlook.web ? 'Hotmail' : null].filter(Boolean);
  const tarjeta = (iconoN, titulo, [tono, estado], hoja, accion) => h('div', { class: 'estado-tarjeta' },
    h('button', { type: 'button', class: 'et-abrir', 'aria-label': `${titulo}: ${estado}. Abrir ajustes`, onclick: () => irA(hoja) },
      h('span', { class: 'et-icono', html: icono(iconoN, 20) }),
      h('span', { class: 'et-texto' }, h('b', {}, titulo), h('span', { class: `estado-chip ${tono}` }, estado)),
      h('span', { class: 'et-flecha', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' })),
    accion || null);
  return [
    h('h1', {}, 'Servicios'),
    bloqueAvisosSistema(),
    h('div', { class: 'estado-grilla' },
      tarjeta('mic', 'Voz', bajando ? ['aviso', 'Bajando modelos…'] : vozLista ? ['bien', 'Lista'] : ['mal', 'Faltan modelos'], 'escucha',
        !vozLista && !bajando ? boton('Bajar', () => pedir('modelos:bajar', 'esenciales').catch((e) => avisarGuardado(e.message)), 'chico principal') : null),
      tarjeta('asistente', 'Inteligencia', iaLista.length ? ['bien', iaLista.join(' · ')] : ['mal', 'Sin configurar'], 'inteligencia'),
      tarjeta('whatsapp', 'WhatsApp', wa, 'whatsapp'),
      tarjeta('mail', 'Mail', casillas.length ? ['bien', casillas.join(' · ')] : ['', 'Sin configurar'], 'mail'),
      tarjeta('calendario', 'Calendario', cfg.calendario.activo ? ['bien', 'Activo'] : ['', 'Apagado'], 'calendario'),
      tarjeta('clip', 'Clips', cfg.clips.activo ? ['bien', 'Prendidos'] : ['', 'Apagados'], 'clips-ajustes'),
      tarjeta('celular', 'Celular', cfg.celular && cfg.celular.activo ? ['bien', 'Prendido'] : ['', 'Apagado'], 'celular')),
  ];
};

// ---------- Almacenamiento: elegir varios videos (con Shift, un rango) para comprimirlos o mandarlos a la Papelera ----------
const lote = { sel: new Set(), ultimo: null, orden: 'tamano', asc: false, carpeta: '', trabajo: null, nivel: 'medio', reemplazar: true, mostrar: 100 };
function videosDelLote() {
  const l = (clipsGuardados || []).filter((x) => !lote.carpeta || (x.juego || '') === lote.carpeta);
  const k = { tamano: (x) => x.bytes, fecha: (x) => x.fecha, nombre: (x) => x.nombre.toLowerCase() }[lote.orden];
  return l.slice().sort((a, b) => { const va = k(a); const vb = k(b); const c = typeof va === 'string' ? va.localeCompare(vb, 'es', { numeric: true }) : va - vb; return lote.asc ? c : -c; });
}
const tamanoCorto = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.round((b || 0) / 1e6)} MB`);
async function hacerLote(tipo) {
  const elegidos = (clipsGuardados || []).filter((x) => lote.sel.has(x.archivo));
  if (!elegidos.length) return;
  if (tipo === 'papelera') {
    if (!await confirmar({ titulo: `¿Mandar ${elegidos.length} ${elegidos.length === 1 ? 'video' : 'videos'} a la Papelera?`, texto: 'Se pueden recuperar desde la Papelera de Windows.', si: 'Mandar a la Papelera', peligro: true })) return;
    const r = await pedir('clips:papeleraVarios', elegidos.map((x) => x.archivo)).catch((e) => ({ error: e.message }));
    avisarGuardado(r.error || `Listo: mandé ${r.n} a la Papelera (${tamanoCorto(r.bytes)} libres).${r.fallos.length ? ` No pude con ${r.fallos.length}.` : ''}`);
    lote.sel.clear(); await cargarClips(); cargarAlmacen(); return;
  }
  lote.trabajo = { i: 0, total: elegidos.length, ahorro: 0, fallos: 0, actual: '', porcentaje: 0, cortar: false };
  pintar();
  for (const x of elegidos) {
    if (lote.trabajo.cortar) break;
    lote.trabajo.actual = x.nombre; lote.trabajo.porcentaje = 0; pintar();
    try {
      const r = await pedir('clips:transformar', { archivo: x.archivo, tipo: 'comprimir', opciones: { nivel: lote.nivel, reemplazar: lote.reemplazar } });
      lote.trabajo.ahorro += Math.max(0, r.antes - r.bytes);
    } catch { lote.trabajo.fallos++; }
    lote.trabajo.i++;
  }
  const t = lote.trabajo; lote.trabajo = null; lote.sel.clear();
  avisarGuardado(`Comprimí ${t.i - t.fallos} de ${t.total}: ${lote.reemplazar ? 'liberaste' : 'ahorrarías'} ${tamanoCorto(t.ahorro)}.${t.fallos ? ` ${t.fallos} no achicaban o fallaron (quedaron igual).` : ''}`);
  await cargarClips(); cargarAlmacen();
}
jarvis.escuchar('clips-trabajo', (d) => { if (lote.trabajo && !d.fin) { lote.trabajo.porcentaje = d.porcentaje || 0; const b = document.querySelector('.lote-progreso i'); if (b) b.style.width = `${((lote.trabajo.i + (d.porcentaje || 0) / 100) / lote.trabajo.total) * 100}%`; } });
function bloqueVideosEnLote(tamano) {
  if (!clipsGuardados) return h('section', { class: 'bloque-espacio' }, h('h2', {}, 'Tus videos'), h('p', { class: 'nota cargando' }, 'Leyendo la carpeta…'));
  const lista = videosDelLote();
  const vis = lista.slice(0, lote.mostrar);
  const elegidos = (clipsGuardados || []).filter((x) => lote.sel.has(x.archivo));
  const bytesSel = elegidos.reduce((t, x) => t + x.bytes, 0);
  const todosVis = vis.length && vis.every((x) => lote.sel.has(x.archivo));
  const tocar = (x, i, ev) => {
    if (ev.shiftKey && lote.ultimo != null && vis[lote.ultimo]) {
      // Shift: del último tocado a este, todos quedan como quedó el último (elegidos o no).
      const desde = Math.min(lote.ultimo, i); const hasta = Math.max(lote.ultimo, i);
      const valor = lote.sel.has(vis[lote.ultimo].archivo);
      for (let k = desde; k <= hasta; k++) { if (valor) lote.sel.add(vis[k].archivo); else lote.sel.delete(vis[k].archivo); }
    } else if (lote.sel.has(x.archivo)) lote.sel.delete(x.archivo); else lote.sel.add(x.archivo);
    lote.ultimo = i;
    pintar();
  };
  const carpetas = [...new Set((clipsGuardados || []).map((x) => x.juego || ''))].sort();
  const t = lote.trabajo;
  return h('section', { class: 'bloque-espacio lote' },
    h('div', { class: 'cabeza-espacio' }, h('h2', {}, 'Tus videos'), h('span', { class: 'cifra-chica' }, tamano((clipsGuardados || []).reduce((n, x) => n + x.bytes, 0)))),
    h('p', { class: 'bajada' }, 'Clips, grabaciones y descargas. Elegí varios (con Shift elegís todos los del medio) para comprimirlos o mandarlos a la Papelera.'),
    h('div', { class: 'fila lote-filtros' },
      h('select', { 'aria-label': 'Carpeta', onchange: (e) => { lote.carpeta = e.target.value; lote.ultimo = null; pintar(); } }, h('option', { value: '' }, 'Todas las carpetas'), carpetas.map((c) => h('option', { value: c, selected: c === lote.carpeta }, c || '(sueltos)'))),
      h('select', { 'aria-label': 'Ordenar por', onchange: (e) => { lote.orden = e.target.value; lote.asc = e.target.value === 'nombre'; lote.ultimo = null; pintar(); } }, [['tamano', 'Más pesados primero'], ['fecha', 'Más nuevos primero'], ['nombre', 'Por nombre']].map(([v, n]) => h('option', { value: v, selected: v === lote.orden }, n)))),
    t ? h('div', { class: 'lote-barra trabajando' },
      h('span', {}, `Comprimiendo ${Math.min(t.i + 1, t.total)} de ${t.total}: ${t.actual}`),
      h('div', { class: 'progreso lote-progreso' }, h('i', { style: `width:${((t.i + t.porcentaje / 100) / t.total) * 100}%` })),
      boton('Parar después de este', () => { t.cortar = true; }, 'chico'))
      : elegidos.length ? h('div', { class: 'lote-barra' },
        h('b', {}, `${elegidos.length} ${elegidos.length === 1 ? 'elegido' : 'elegidos'} · ${tamano(bytesSel)}`),
        h('select', { 'aria-label': 'Cuánto comprimir', onchange: (e) => { lote.nivel = e.target.value; } }, [['poco', 'Un poco'], ['medio', 'Bastante (720p)'], ['mucho', 'Mucho (480p)']].map(([v, n]) => h('option', { value: v, selected: v === lote.nivel }, n))),
        h('label', { class: 'casilla-texto' }, h('input', { type: 'checkbox', checked: lote.reemplazar, onchange: (e) => { lote.reemplazar = e.target.checked; } }), h('span', {}, 'Reemplazar los originales (van a la Papelera)')),
        boton('Comprimir', () => hacerLote('comprimir'), 'principal chico'),
        boton('Mandar a la Papelera', () => hacerLote('papelera'), 'peligro chico'),
        boton('Ninguno', () => { lote.sel.clear(); lote.ultimo = null; pintar(); }, 'chico')) : null,
    lista.length ? h('div', { class: 'tabla-lote', role: 'grid', 'aria-label': 'Videos' },
      h('div', { class: 'fila-lote cabeza', role: 'row' },
        h('label', { class: 'cl-check' }, h('input', { type: 'checkbox', checked: !!todosVis, 'aria-label': 'Elegir todos los que se ven', onchange: () => { for (const x of vis) { if (todosVis) lote.sel.delete(x.archivo); else lote.sel.add(x.archivo); } pintar(); } })),
        h('span', {}, 'Nombre'), h('span', {}, 'Carpeta'), h('span', {}, 'Fecha'), h('span', { class: 'der' }, 'Tamaño')),
      vis.map((x, i) => h('div', { class: `fila-lote${lote.sel.has(x.archivo) ? ' elegida' : ''}`, role: 'row', onclick: (ev) => tocar(x, i, ev) },
        h('span', { class: 'cl-check' }, h('input', { type: 'checkbox', checked: lote.sel.has(x.archivo), tabindex: '-1', 'aria-label': `Elegir ${x.nombre}`, style: 'pointer-events:none' })),
        h('span', { class: 'cl-nombre', title: x.nombre }, x.favorito ? h('span', { class: 'fav-mini', html: icono('estrella', 12) }) : null, x.nombre), h('span', { class: 'nota' }, x.juego || '—'),
        h('span', { class: 'nota' }, new Date(x.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })),
        h('span', { class: 'der' }, tamano(x.bytes)))),
      lista.length > vis.length ? h('div', { class: 'fila' }, boton(`Ver ${Math.min(200, lista.length - vis.length)} más (de ${lista.length})`, () => { lote.mostrar += 200; pintar(); }, 'chico')) : null)
      : h('div', { class: 'vacio' }, 'No hay videos en esa carpeta.'));
}

// ---------- Estado de la PC: procesador, memoria, placa de video y lo que gasta Jarvis (se actualiza cada 2 s) ----------
const historiaPc = { cpu: [], ram: [], gpu: [], jarvis: [] }; // últimos 60 valores, para las líneas
async function cargarEstadoPc() {
  try {
    estadoPc = await pedir('pc:estado', { detalle: true });
    const meter = (k, v) => { if (v == null) return; historiaPc[k].push(v); if (historiaPc[k].length > 60) historiaPc[k].shift(); };
    meter('cpu', estadoPc.cpu.uso); meter('ram', estadoPc.ram.uso); meter('gpu', estadoPc.gpu && estadoPc.gpu.uso); meter('jarvis', estadoPc.jarvis.cpu);
  } catch (e) { estadoPc = { error: e.message }; }
  if (seccion === 'estado-pc' && !escribiendo()) pintar();
}
function lineaPc(valores, max = 100) {
  if (valores.length < 2) return null;
  const pts = valores.map((v, i) => `${(i / 59) * 100},${30 - (Math.min(max, v) / max) * 28}`).join(' ');
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 100 30'); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('class', 'linea-pc'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  return s;
}
secciones['estado-pc'] = function estadoDeLaPc() {
  const e = estadoPc;
  if (!e) return [h('h1', {}, 'Estado de la PC'), h('p', { class: 'bajada cargando' }, 'Midiendo…')];
  if (e.error) return [h('h1', {}, 'Estado de la PC'), h('p', { class: 'nota mal' }, e.error)];
  const gb = (mb) => `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
  const tono = (v, a = 70, b = 90) => (v >= b ? 'mal' : v >= a ? 'aviso' : 'bien');
  const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`; };
  const tarjeta = (titulo, cifra, tonoC, detalle, valores) => h('div', { class: `tarjeta-pc ${tonoC}` }, h('span', { class: 'tp-titulo' }, titulo), h('b', { class: 'tp-cifra' }, cifra), h('span', { class: 'nota' }, detalle), valores ? lineaPc(valores) : null);
  const g = e.gpu;
  const procesos = (e.jarvis.procesos || []);
  return [
    h('h1', {}, 'Estado de la PC'),
    h('p', { class: 'bajada' }, 'Se actualiza cada 2 segundos mientras estás en esta pantalla. Lo de Jarvis sirve para ver qué parte gasta más.'),
    h('div', { class: 'grilla-pc' },
      tarjeta('Procesador', `${e.cpu.uso} %`, tono(e.cpu.uso), `${e.cpu.nombre} · ${e.cpu.nucleos} hilos`, historiaPc.cpu),
      tarjeta('Memoria', `${e.ram.uso} %`, tono(e.ram.uso, 80, 92), `${gb(e.ram.usadaMB)} de ${gb(e.ram.totalMB)}`, historiaPc.ram),
      g ? tarjeta('Placa de video', g.temp != null ? `${g.temp} °C` : `${g.uso} %`, g.temp != null ? tono(g.temp, 75, 85) : tono(g.uso), [g.nombre, g.uso != null ? `${g.uso} % de uso` : '', g.memTotal ? `${gb(g.memUsada)} de ${gb(g.memTotal)}` : '', g.ventilador != null ? `ventilador ${g.ventilador} %` : '', g.consumo != null ? `${Math.round(g.consumo)} W` : ''].filter(Boolean).join(' · '), historiaPc.gpu)
        : tarjeta('Placa de video', '—', '', 'Solo con placas NVIDIA (usa nvidia-smi, que viene con el driver).'),
      tarjeta('Jarvis', `${String(e.jarvis.cpu).replace('.', ',')} %`, tono(e.jarvis.cpu, 15, 35), `${e.jarvis.memMB} MB de memoria · abierto hace ${hace(e.jarvis.abiertoDesde)}`, historiaPc.jarvis)),
    h('p', { class: 'nota' }, `PC encendida hace ${hace(e.encendidaDesde)}. La temperatura del procesador Windows no la da sin programas aparte; la de la placa de video, sí.`),
    h('h2', {}, 'Lo que gasta cada parte de Jarvis'),
    h('div', { class: 'tabla-pc', role: 'table', 'aria-label': 'Procesos de Jarvis' },
      h('div', { class: 'fila-pc cabeza', role: 'row' }, h('span', { role: 'columnheader' }, 'Parte'), h('span', { role: 'columnheader' }, 'Procesador'), h('span', { role: 'columnheader' }, 'Memoria')),
      procesos.map((p) => h('div', { class: 'fila-pc', role: 'row' }, h('span', { role: 'cell' }, p.nombre), h('span', { role: 'cell' }, p.cpu == null ? '—' : `${String(p.cpu).replace('.', ',')} %`), h('span', { role: 'cell' }, p.memMB == null ? '—' : `${p.memMB} MB`)))),
    h('p', { class: 'nota' }, 'Si Jarvis te parece pesado, mandame una captura de esta pantalla con la PC en uso normal (y otra jugando): con esos números se optimiza lo que más gasta.'),
  ];
};

// ---------- Navegación ----------
// [A1] Grupos pensados por tarea; [A2] cada uno con ícono; [A3] un punto avisa si algo de adentro necesita atención.
const GRUPOS = [
  // Lo que usás y creás con Jarvis: la barra de siempre.
  { id: 'resumen', nombre: 'Inicio', icono: 'inicio', hojas: [['resumen', 'Inicio']] },
  { id: 'agenda', nombre: 'Agenda', icono: 'calendario', hojas: [['agenda', 'Calendario'], ['notas', 'Notas'], ['notasvoz', 'Notas de voz']] },
  { id: 'rutinas', nombre: 'Rutinas', icono: 'rayo', hojas: [['rutinas', 'Rutinas']] },
  { id: 'clips', nombre: 'Clips', icono: 'clip', hojas: [['clips', 'Clips']] },
  { id: 'descargas', nombre: 'Descargas', icono: 'bajar', hojas: [['descargas', 'Descargas']] },
  { id: 'historial', nombre: 'Historial', icono: 'reloj', hojas: [['historial', 'Historial']] },
  // Ajustes: detrás del engranaje, agrupados por tarea.
  { id: 'jarvis', ajuste: true, nombre: 'Jarvis', icono: 'asistente', hojas: [['general', 'Básico'], ['voz', 'Voz'], ['escucha', 'Escucha'], ['inteligencia', 'Inteligencia'], ['contexto', 'Contexto']] },
  { id: 'interfaz', ajuste: true, nombre: 'Apariencia y notch', icono: 'interfaz', hojas: [['panel', 'Panel'], ['apariencia', 'Apariencia'], ['modos', 'Modos']] },
  { id: 'cuentas', ajuste: true, nombre: 'Cuentas y avisos', icono: 'cuentas', hojas: [['whatsapp', 'WhatsApp'], ['mail', 'Mail'], ['calendario', 'Calendario'], ['notificaciones', 'Notificaciones'], ['conexion', 'Conexión']] },
  { id: 'celular', ajuste: true, nombre: 'Celular', icono: 'celular', hojas: [['celular', 'Celular']] },
  { id: 'equipos', ajuste: true, nombre: 'Casa', icono: 'casa', hojas: [['dispositivos', 'Teles y parlantes']] },
  { id: 'multimedia', ajuste: true, nombre: 'Clips y música', icono: 'musica', hojas: [['clips-ajustes', 'Grabación de clips'], ['musica', 'Música'], ['streaming', 'Streaming']] },
  { id: 'sistema', ajuste: true, nombre: 'Sistema', icono: 'sistema', hojas: [['servicios', 'Servicios'], ['estado-pc', 'Estado de la PC'], ['pc', 'Programas y audio'], ['actualizaciones', 'Información'], ['componentes', 'Componentes'], ['almacenamiento', 'Almacenamiento']] },
];
// [A6] Palabras para el buscador (además del nombre de cada pantalla).
const CLAVES = {
  'estado-pc': 'procesador cpu memoria ram placa video gpu temperatura consumo recursos lento optimizar',
  general: 'nombre ciudad clima cámara webcam atajo iniciar windows arranque',
  escucha: 'micrófono escuchar transcribir groq despertar hey jarvis palabra clave sensibilidad frases aprendidas confirmar',
  inteligencia: 'ia modelo groq gemini ollama clave api buscar internet tavily',
  contexto: 'pantalla captura ventana activa ver',
  panel: 'widgets notch panel ordenar tamaño',
  apariencia: 'color ojos fondo tamaño transparencia opacidad bailar posición',
  modos: 'modo juego silencio oculto dormido barra',
  rutinas: 'rutina pasos acción rápida botón',
  notas: 'nota recordatorio aviso',
  agenda: 'calendario eventos agenda aviso recordatorio reunión cita cumpleaños editar nuevo',
  notificaciones: 'avisos sonido burbuja punto reglas grupos',
  voz: 'voz hablar velocidad volumen personalidad lunfardo tonada probar daniela claude dora alex kokoro propia entrenar modelo clonar piper audios mp3 guion frases grabar subir wsl',
  descargas: 'descargar bajar video audio mp3 yt-dlp youtube carpeta cookies calidad 1080 720',
  notasvoz: 'grabar audio grabadora nota de voz micrófono m4a wav carpeta',
  conexion: 'internet sin conexión offline wifi red cola alertas caída groq gemini servicio',
  whatsapp: 'vincular qr contactos grupos agenda firma audio foto',
  mail: 'gmail hotmail outlook correo contraseña de aplicación',
  calendario: 'google agenda eventos ical',
  celular: 'celular teléfono android app vincular código qr tailscale afuera remoto descargar archivos',
  dispositivos: 'chromecast tele parlante nest home assistant vincular control',
  pc: 'programas salida de audio juegos steam',
  clips: 'grabar pantalla video repetición instantánea últimos clips editar recortar enviar',
  'clips-ajustes': 'clips duración resolución fps audio micrófono carpeta atajo ffmpeg calidad',
  musica: 'youtube music supermix lista',
  streaming: 'netflix disney hbo tmdb stremio flow fútbol pluto navegador chrome',
  almacenamiento: 'espacio disco liberar borrar',
  componentes: 'instalar bajar modelos voz ffmpeg yt-dlp kokoro daniela componentes importar portable datos',
  actualizaciones: 'información info versión fecha release tamaño disco actualizar actualización update acerca de github',
  historial: 'registro pedidos errores detalle',
  resumen: 'inicio hoy resumen primeros pasos',
  servicios: 'estado servicios voz inteligencia whatsapp mail calendario clips funciona',
};
const grupoDe = (hoja) => GRUPOS.find((g) => g.hojas.some(([id]) => id === hoja)) || GRUPOS[0];
const nombreDeHoja = (hoja) => (grupoDe(hoja).hojas.find(([id]) => id === hoja) || [hoja, hoja])[1];
let seccion = (location.hash || '#resumen').slice(1);
const menu = document.getElementById('menu');
// La barra cambia entre "usar" (lo de todos los días) y "Ajustes" (el engranaje), como dos lugares distintos.
let menuEnAjustes = null;
let ultimaDeUso = 'resumen'; let ultimaDeAjustes = 'general';
function armarMenu(enAjustes) {
  if (menuEnAjustes === enAjustes) return;
  menuEnAjustes = enAjustes;
  menu.querySelectorAll('[data-grupo], .menu-titulo, .menu-volver, .menu-engranaje').forEach((x) => x.remove());
  const fin = document.getElementById('menu-fin');
  if (enAjustes) {
    menu.insertBefore(h('button', { type: 'button', class: 'menu-volver', 'data-accion': 'volver', html: `${icono('chevron', 16)}<span>Volver</span>` }), fin);
    menu.insertBefore(h('div', { class: 'menu-titulo grande', role: 'presentation' }, 'Ajustes'), fin);
  }
  for (const g of GRUPOS.filter((x) => !!x.ajuste === enAjustes)) {
    menu.insertBefore(h('button', { type: 'button', 'data-grupo': g.id, html: `${icono(g.icono, 18)}<span>${g.nombre}</span><i class="punto-menu" hidden></i>` }), fin);
  }
  if (!enAjustes) fin.prepend(h('button', { type: 'button', class: 'menu-engranaje', 'data-accion': 'ajustes', html: `${icono('ajustes', 18)}<span>Ajustes</span><i class="punto-menu" hidden></i>` }));
}

// Qué necesita atención (para el punto del menú y el Resumen). Solo cosas que impiden usar algo que está prendido.
function pendientes() {
  const p = {};
  const m = voces.modelos || {};
  const faltaVoz = ['oido', 'vad'].some((id) => m[id] && !m[id].instalado) || (cfg.habla.voz !== 'windows' && m[`voz-${cfg.habla.voz}`] && !m[`voz-${cfg.habla.voz}`].instalado);
  if (faltaVoz || (voces.voz && voces.voz.error)) p.jarvis = 'Faltan los modelos de voz';
  else if (!Object.values(ia || {}).some((x) => x && x.configurado)) p.jarvis = 'Sin inteligencia configurada';
  if (whatsapp.fase === 'error') p.cuentas = 'WhatsApp con error';
  const importante = avisosSistema.filter((a) => a.tono !== 'info');
  if (importante.length) { p.sistema = importante.map((a) => a.titulo).join(' · '); p.resumen = p.sistema; }
  return p;
}
function pintarPuntosDelMenu() {
  const p = pendientes();
  const marcar = (b, motivo) => { const punto = b.querySelector('.punto-menu'); if (!punto) return; punto.hidden = !motivo; b.title = motivo || ''; b.setAttribute('aria-label', motivo ? `${b.textContent} (necesita atención: ${motivo})` : b.textContent); };
  for (const b of menu.querySelectorAll('button[data-grupo]')) marcar(b, p[b.dataset.grupo]);
  const eng = menu.querySelector('.menu-engranaje');
  if (eng) marcar(eng, GRUPOS.filter((g) => g.ajuste).map((g) => p[g.id]).filter(Boolean).join(' · '));
}

// [A6] Buscador: filtra pantallas por nombre y por palabras clave.
const buscador = document.getElementById('buscar');
const resultados = document.getElementById('resultados');
let elegidoBusqueda = 0;
const sinAcentos = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function buscarHojas(q) {
  const t = sinAcentos(q.trim());
  if (!t) return [];
  const todas = GRUPOS.flatMap((g) => g.hojas.map(([id, nombre]) => ({ id, nombre, grupo: g.nombre })));
  return todas.map((x) => {
    const n = sinAcentos(x.nombre);
    const k = sinAcentos(CLAVES[x.id] || '');
    const puntos = n.startsWith(t) ? 3 : n.includes(t) ? 2 : t.split(/\s+/).every((w) => k.includes(w)) ? 1 : 0;
    return { ...x, puntos };
  }).filter((x) => x.puntos).sort((a, b) => b.puntos - a.puntos).slice(0, 7);
}
function pintarResultados() {
  const lista = buscarHojas(buscador.value);
  elegidoBusqueda = Math.min(elegidoBusqueda, Math.max(0, lista.length - 1));
  resultados.hidden = !buscador.value.trim();
  buscador.setAttribute('aria-expanded', String(!resultados.hidden));
  resultados.replaceChildren(...(lista.length ? lista.map((x, i) => h('li', {
    role: 'option', id: `res-${i}`, 'aria-selected': String(i === elegidoBusqueda), class: i === elegidoBusqueda ? 'elegido' : '',
    onmousedown: (e) => { e.preventDefault(); irDesdeBusqueda(x.id); },
  }, h('b', {}, x.nombre), h('small', {}, x.grupo))) : [h('li', { class: 'sin' }, 'Sin resultados')]));
  if (lista.length) buscador.setAttribute('aria-activedescendant', `res-${elegidoBusqueda}`); else buscador.removeAttribute('aria-activedescendant');
  return lista;
}
function irDesdeBusqueda(id) { buscador.value = ''; resultados.hidden = true; buscador.setAttribute('aria-expanded', 'false'); irA(id); contenido.focus({ preventScroll: true }); }
buscador.addEventListener('input', () => { elegidoBusqueda = 0; pintarResultados(); });
buscador.addEventListener('blur', () => { resultados.hidden = true; buscador.setAttribute('aria-expanded', 'false'); });
buscador.addEventListener('keydown', (e) => {
  const lista = buscarHojas(buscador.value);
  if (e.key === 'ArrowDown') { e.preventDefault(); elegidoBusqueda = (elegidoBusqueda + 1) % Math.max(1, lista.length); pintarResultados(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); elegidoBusqueda = (elegidoBusqueda - 1 + lista.length) % Math.max(1, lista.length); pintarResultados(); }
  else if (e.key === 'Enter' && lista[elegidoBusqueda]) { e.preventDefault(); irDesdeBusqueda(lista[elegidoBusqueda].id); }
  else if (e.key === 'Escape') { buscador.value = ''; pintarResultados(); }
});
document.addEventListener('keydown', (e) => {
  // En el editor de un evento, Esc vuelve al calendario (si no hay un cuadro de confirmación abierto).
  if (e.key === 'Escape' && seccion === 'agenda' && agendaUI.editor && !document.querySelector('dialog[open]')) { e.preventDefault(); agendaUI.editor = null; pintar(); return; }
  if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (e.key === '/' && !escribiendo())) { e.preventDefault(); buscador.focus(); buscador.select(); }
});

// La bajada larga de una pantalla no se muestra entera: va al "i" al lado del título.
function plegarBajadas(raiz) {
  const h1 = raiz.querySelector('h1');
  for (const p of raiz.querySelectorAll('p.bajada')) {
    if (p.dataset.plegada || p.children.length || p.textContent.length <= 110) continue;
    p.dataset.plegada = '1';
    const titulo = p.previousElementSibling && p.previousElementSibling.tagName === 'H1' ? p.previousElementSibling : (p.parentElement === raiz && h1 && !h1.querySelector('.boton-info') ? h1 : null);
    if (titulo) { titulo.append(' ', botonInfo(p.textContent)); p.remove(); continue; }
    const t = p.textContent; const m = /^(.{30,}?[.:!?])\s+(?=[A-ZÁÉÍÓÚÑ"¿(])/s.exec(t);
    if (m) p.replaceChildren(m[1], ' ', botonInfo(t));
  }
  for (const p of raiz.querySelectorAll('p.ayuda')) {
    if (p.dataset.plegada || p.children.length || p.textContent.length <= 160) continue;
    p.dataset.plegada = '1';
    const t = p.textContent; const m = /^(.{30,}?[.:!?])\s+(?=[A-ZÁÉÍÓÚÑ"¿(])/s.exec(t);
    if (m) p.replaceChildren(m[1], ' ', botonInfo(t));
  }
}
// [C16] Lo que va entre subtítulos (h2) se agrupa en tarjetas, si tiene campos.
function agruparEnTarjetas(nodos) {
  const salida = [];
  let grupo = null;
  const cerrar = () => {
    if (!grupo) return;
    if (grupo.some((n) => n.classList && n.classList.contains('campo'))) salida.push(h('section', { class: 'bloque' }, grupo));
    else salida.push(...grupo);
    grupo = null;
  };
  for (const n of nodos) {
    const tag = n.tagName;
    if (tag === 'H1' || (n.classList && (n.classList.contains('pestanas') || n.classList.contains('bajada') && !grupo))) { cerrar(); salida.push(n); continue; }
    if (tag === 'H2') { cerrar(); grupo = [n]; continue; }
    if (n.classList && n.classList.contains('campo')) { grupo = grupo || []; grupo.push(n); continue; }
    if (grupo) grupo.push(n); else salida.push(n);
  }
  cerrar();
  return salida;
}

function pintar(forzar) {
  if (clipEditor && seccion === 'clips' && forzar !== true) return; // con el editor abierto no se repinta solo: se cortaría el video
  if (!secciones[seccion]) seccion = 'resumen';
  const grupo = grupoDe(seccion);
  armarMenu(!!grupo.ajuste);
  if (grupo.ajuste) ultimaDeAjustes = seccion; else ultimaDeUso = seccion;
  document.body.classList.toggle('editor-abierto', !!(clipEditor && seccion === 'clips'));
  for (const b of menu.querySelectorAll('button[data-grupo]')) {
    const si = b.dataset.grupo === grupo.id;
    b.classList.toggle('elegido', si);
    if (si) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  // [E34] Pestañas accesibles: tablist/tab/tabpanel, una sola parada de Tab y flechas para moverse.
  const pestanas = grupo.hojas.length > 1
    ? h('div', { class: 'pestanas', role: 'tablist', 'aria-label': grupo.nombre }, grupo.hojas.map(([id, nombre]) => h('button', {
      type: 'button', role: 'tab', id: `tab-${id}`, 'aria-controls': 'contenido', 'aria-selected': String(id === seccion), tabindex: id === seccion ? '0' : '-1',
      class: id === seccion ? 'elegido' : '', 'data-seccion': id,
    }, nombre)))
    : null;
  if (pestanas) { contenido.setAttribute('role', 'tabpanel'); contenido.setAttribute('aria-labelledby', `tab-${seccion}`); }
  else { contenido.removeAttribute('role'); contenido.removeAttribute('aria-labelledby'); }
  contenido.dataset.seccion = seccion;
  const arriba = contenido.scrollTop;
  const nodos = [...secciones[seccion]()].flat(Infinity).filter(Boolean);
  contenido.replaceChildren(...[pestanas ? h('div', { class: 'cabecera' }, pestanas) : null, ...agruparEnTarjetas(nodos)].filter(Boolean));
  plegarBajadas(contenido);
  contenido.scrollTop = arriba;
  pintarPuntosDelMenu();
  document.title = `${nombreDeHoja(seccion)} · ${INFO.nombre}`;
}
async function cargarCelular(conTailscale) {
  if (conTailscale) cel.cargando = !cel.estado;
  try { cel.estado = await pedir('celular:estado', !!conTailscale || !(cel.estado && cel.estado.tailscale)); } catch {}
  if (cel.estado && !conTailscale && cel.estado.tailscale === null) cel.estado.tailscale = (cel.prev || {}).tailscale;
  if (cel.estado && cel.estado.tailscale) cel.prev = cel.estado;
  cel.cargando = false;
  if (cel.codigo && !cel.estado.codigo) cel.codigo = null; // se usó (o venció)
  if (seccion === 'celular' && !escribiendo()) pintar();
}
// Cuenta regresiva del código (sin repintar toda la hoja cada segundo).
function seguirCodigo() {
  clearInterval(seguirCodigo.reloj);
  seguirCodigo.reloj = setInterval(() => {
    const k = cel.codigo;
    const el = document.getElementById('cel-quedan');
    if (!k || seccion !== 'celular') { clearInterval(seguirCodigo.reloj); return; }
    const quedan = Math.round((k.vence - Date.now()) / 1000);
    if (quedan <= 0) { cel.codigo = null; clearInterval(seguirCodigo.reloj); pintar(); return; }
    if (el) el.textContent = `Vence en ${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, '0')}. Sirve una sola vez.`;
  }, 1000);
}
async function cargarAgendaCargada() {
  try { calAgenda.lista = await pedir('calendario:lista'); } catch { calAgenda.lista = []; }
  if ((seccion === 'calendario' || seccion === 'agenda') && !escribiendo()) pintar();
}
async function cargarCalendarios() {
  cargarAgendaCargada();
  if (!cfg.calendario.google || !cfg.calendario.google.token) { calGoogle.lista = null; return; }
  calGoogle.error = '';
  try { await pedir('cfg:guardar', cfg); calGoogle.lista = (await pedir('calendario:calendarios')).lista; } catch (e) { calGoogle.error = e.message; }
  if (seccion === 'calendario' && !escribiendo()) pintar();
}
function irA(hoja) {
  clipEditor = null;
  seccion = hoja;
  history.replaceState(null, '', `#${seccion}`);
  contenido.scrollTop = 0;
  pintar();
  if (seccion === 'clips' || seccion === 'clips-ajustes') { nombresFilas = null; refrescarClips(); cargarClips(); }
  if (seccion === 'resumen') { cargarAvisosSistema(); inicioDatos.t = 0; cargarInicioPC(); if (!clipsGuardados) cargarClips(); }
  if (seccion === 'servicios') cargarAvisosSistema();
  clearInterval(relojEstadoPc);
  if (seccion === 'estado-pc') { cargarEstadoPc(); relojEstadoPc = setInterval(() => { if (seccion === 'estado-pc' && !document.hidden) cargarEstadoPc(); else if (seccion !== 'estado-pc') clearInterval(relojEstadoPc); }, 2000); }
  if (seccion === 'almacenamiento') { almacen = null; pintar(); cargarAlmacen(); cargarClips(); }
  if (seccion === 'componentes') cargarComponentes();
  if (seccion === 'actualizaciones') cargarActualizacion();
  if (seccion === 'historial' || seccion === 'resumen') pedir('historial:leer').then((x) => { registros = x; if ((seccion === 'historial' || seccion === 'resumen') && !escribiendo()) pintar(); }).catch(() => {});
  if (seccion === 'calendario') cargarCalendarios();
  if (seccion === 'notificaciones') cargarAvisos();
  if (seccion === 'notasvoz') cargarNotasVoz();
  if (seccion === 'descargas') cargarDescargas();
  if (seccion === 'voz') { if (vp.sel) cargarVoz(); else cargarVoces(); }
  if (seccion === 'conexion') pedir('conexion:estado').then((x) => { estadoConexion = x; if (cfg && cfg.conexion && x) cfg.conexion.manual = !!x.manual; if (seccion === 'conexion') pintar(); }).catch(() => {});
  if (seccion === 'agenda') cargarAgendaCargada();
  if (seccion === 'celular') cargarCelular(true);
  if (seccion === 'notas') cargarNotas();
  if (seccion === 'whatsapp') pedir('wa:agenda').then((x) => { agenda = x; if (seccion === 'whatsapp') pintar(); }).catch(() => {});
}
const ultimaHoja = {};
menu.addEventListener('click', (e) => {
  const acc = e.target.closest('button[data-accion]');
  if (acc) { irA(acc.dataset.accion === 'ajustes' ? ultimaDeAjustes : ultimaDeUso); return; }
  const b = e.target.closest('button[data-grupo]');
  if (!b) return;
  const grupo = GRUPOS.find((g) => g.id === b.dataset.grupo);
  irA(ultimaHoja[grupo.id] || grupo.hojas[0][0]);
});
contenido.addEventListener('click', (e) => {
  const b = e.target.closest('.pestanas button[data-seccion]');
  if (!b) return;
  ultimaHoja[grupoDe(b.dataset.seccion).id] = b.dataset.seccion;
  irA(b.dataset.seccion);
  contenido.querySelector(`#tab-${b.dataset.seccion}`)?.focus();
});
contenido.addEventListener('keydown', (e) => {
  const b = e.target.closest && e.target.closest('.pestanas [role="tab"]');
  if (!b || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const hojas = grupoDe(b.dataset.seccion).hojas.map(([id]) => id);
  const i = hojas.indexOf(b.dataset.seccion);
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? hojas.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + hojas.length) % hojas.length;
  ultimaHoja[grupoDe(hojas[j]).id] = hojas[j];
  irA(hojas[j]);
  contenido.querySelector(`#tab-${hojas[j]}`)?.focus();
});
window.addEventListener('hashchange', () => { const h2 = location.hash.slice(1); if (h2 && h2 !== seccion && secciones[h2]) irA(h2); });
// [A7] Cerrar Jarvis pide confirmación (antes cerraba de un click).
document.getElementById('salir').addEventListener('click', async () => {
  if (await confirmar({ titulo: `¿Cerrar ${INFO.nombre}?`, texto: 'Deja de escucharte y de avisarte hasta que lo vuelvas a abrir.', si: 'Cerrar', peligro: true })) pedir('app:cerrar');
});

jarvis.escuchar('actualizacion', (e) => { compo.act = e; if (seccion === 'actualizaciones') pintar(); });
jarvis.escuchar('descargas', (e) => { if (descargasEstado) descargasEstado = { ...descargasEstado, ...e }; if (seccion === 'descargas' && !escribiendo()) pintar(); });
jarvis.escuchar('notas', () => { if (seccion === 'notas' || notasLista) cargarNotas(); });
jarvis.escuchar('wa', (estado) => { whatsapp = estado; pintarPuntosDelMenu(); if (seccion === 'whatsapp' || (seccion === 'resumen' && !escribiendo())) pintar(); });
// ¿Está escribiendo algo? (un interruptor o un deslizador con el foco no cuenta: si no, la hoja no se actualiza al tocarlos)
const escribiendo = () => { const el = document.activeElement; return !!el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !(el.tagName === 'INPUT' && ['checkbox', 'radio', 'range', 'button'].includes(el.type)); };
jarvis.escuchar('agenda', (a) => { agenda = a; if (seccion === 'whatsapp' && !escribiendo()) pintar(); });
jarvis.escuchar('celular', () => { if (seccion === 'celular') cargarCelular(false); });
jarvis.escuchar('conexion', (e) => { estadoConexion = e; if (cfg && cfg.conexion && e) cfg.conexion.manual = !!e.manual; if (seccion === 'conexion' && !escribiendo()) pintar(); });
jarvis.escuchar('avisos-config', (n) => { if (n) { cfg.notificaciones = n; if (seccion === 'notificaciones' && !escribiendo()) pintar(); } }); // lo cambió el notch ("No avisarme más de…")
jarvis.escuchar('historial', async () => { if (seccion !== 'historial' && seccion !== 'resumen') return; registros = await pedir('historial:leer').catch(() => registros); if (!escribiendo()) pintar(); });
// Microsoft avisa cuando el permiso quedó dado (o si venció el código).
jarvis.escuchar('correo', async (dato) => {
  codigoMicrosoft = null;
  if (!dato.ok) avisarGuardado(`No se pudo conectar: ${dato.error}`);
  else avisarGuardado('Listo: Jarvis ya puede mirar tu bandeja.');
  try { const fresco = await pedir('cfg:leer'); cfg.correo.outlook.web = !!fresco.correo.outlook.web; } catch {}
  correo = await pedir('correo:estado').catch(() => correo);
  if (seccion === 'mail') pintar();
});
// Google avisa cuando el permiso del calendario quedó dado (o si se canceló o falló).
jarvis.escuchar('calendario', async (dato) => {
  calGoogle.esperando = false;
  if (!dato.ok) avisarGuardado(`No se pudo conectar: ${dato.error}`);
  else avisarGuardado('Listo: Jarvis ya puede leer tus calendarios.');
  try { const fresco = await pedir('cfg:leer'); cfg.calendario.google = { ...cfg.calendario.google, token: fresco.calendario.google.token, cuenta: fresco.calendario.google.cuenta }; } catch {}
  calGoogle.lista = null;
  if (seccion === 'calendario') { pintar(); cargarCalendarios(); }
});
// Avance de las descargas de modelos: se repinta solo si no se está escribiendo en un campo.
jarvis.escuchar('modelos', (estado) => {
  voces = estado;
  if (seccion === 'componentes') cargarComponentes();
  pintarPuntosDelMenu();
  if (seccion === 'resumen') { pintar(); return; }
  if ((seccion === 'general' || seccion === 'escucha' || seccion === 'voz') && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) pintar();
});

async function cargarDispositivosMultimedia() {
  try {
    const d = await navigator.mediaDevices.enumerateDevices();
    const etiquetas = (tipo) => [...new Set(d.filter((x) => x.kind === tipo && x.label && x.deviceId !== 'default' && x.deviceId !== 'communications').map((x) => x.label))];
    listas.microfonos = etiquetas('audioinput');
    listas.camaras = etiquetas('videoinput');
  } catch { /* sin permiso todavía: quedan las listas vacías */ }
}

(async function iniciar() {
  cfg = await pedir('cfg:leer');
  usarNombre(cfg.nombre);
  rutinas = await pedir('rutinas:leer');
  whatsapp = await pedir('wa:estado').catch(() => whatsapp);
  voces = await pedir('modelos:estado').catch(() => voces);
  ia = await pedir('ia:estado').catch(() => ia);
  correo = await pedir('correo:estado').catch(() => correo);
  agenda = await pedir('wa:agenda').catch(() => agenda);
  registros = await pedir('historial:leer').catch(() => registros);
  await cargarDispositivosMultimedia();
  INFO = await pedir('app:info').catch(() => INFO);
  pintarMarca();
  irA(secciones[seccion] ? seccion : 'resumen');
  // Lo que tarda (PowerShell, red) llega después y vuelve a pintar.
  const tardios = [
    pedir('pc:salidas').then((x) => { listas.salidas = x; listas.errorSalidas = ''; }, (e) => { listas.errorSalidas = e.message; }),
    pedir('pc:programas').then((x) => { listas.programas = x; }),
    pedir('pc:juegos').then((x) => { listas.juegos = x || []; }),
    pedir('cast:lista').then((x) => { listas.cast = x; }),
    pedir('aprendido:lista').then((x) => { listas.aprendido = x || []; }).catch(() => {}),
    pedir('tele:vinculadas').then((x) => { vinculo.vinculadas = x || []; }).catch(() => {}),
    pedir('ia:ollama').then((x) => { modelosOllama = x; }),
    cfg.homeAssistant.url && cfg.homeAssistant.token ? pedir('ha:entidades').then((x) => { listas.entidades = x; }) : null,
  ].filter(Boolean).map((p) => p.catch(() => {}));
  await Promise.all(tardios);
  if (!contenido.contains(document.activeElement) || document.activeElement === document.body) pintar();
  pintarPuntosDelMenu();
})();

// [E32] Botones de solo ícono: el "title" pasa a ser también su nombre accesible.
function etiquetarIconos(raiz) { for (const b of raiz.querySelectorAll('button[title]:not([aria-label])')) if (!b.textContent.trim()) b.setAttribute('aria-label', b.title); }
new MutationObserver(() => etiquetarIconos(document.body)).observe(document.body, { subtree: true, childList: true });

// Cambios hechos desde el celular: se toman acá para no pisarlos al guardar en la PC.
jarvis.escuchar('rutinas-celular', (lista) => { if (Array.isArray(lista)) rutinas = lista; if (seccion === 'rutinas' && !escribiendo()) pintar(); });
jarvis.escuchar('agenda-celular', () => { agendaUI.datos = null; agendaUI.pidiendo = null; if (seccion === 'agenda' && !agendaUI.editor && !escribiendo()) pintar(); });

jarvis.escuchar('avisos-sistema', (lista) => { if (Array.isArray(lista)) avisosSistema = lista; pintarPuntosDelMenu(); if ((seccion === 'resumen' || seccion === 'servicios') && !escribiendo()) pintar(); });
cargarAvisosSistema();
