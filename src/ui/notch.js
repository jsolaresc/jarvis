// El notch: ojos, panel al pasar el mouse, acciones rápidas, modos y el audio de la conversación.
import { icono, escapar } from './iconos.js';
import { Voz } from './voz.js';
import { usarNombre } from './nombre.js';
import { sacarFoto, pcmAOgg } from './medios.js';
import { Grabadora, recortarFinal } from './grabadora.js';
import { normalizarLista, empaquetar } from './widgets.js';

const jarvis = window.jarvis;
const $ = (id) => document.getElementById(id);
const escena = $('escena');
const notch = $('notch');
const pastilla = $('pastilla');
const ojos = $('ojos');
const leyenda = $('leyenda');
const burbuja = $('burbuja');
const campoTexto = $('texto');

let estado = { fase: 'reposo', modo: 'normal', listo: false, sesion: false };
let config = { nombre: 'Jarvis', apariencia: {}, voz: {}, camara: {}, modos: [] };
const modoDe = (id) => (config.modos || []).find((m) => m.id === id);
const charla = { vos: '', jarvis: '', ultimo: '' };

// Las llamadas al proceso principal vuelven como { ok, dato, error }.
async function pedir(canal, ...datos) {
  const r = await jarvis.pedir(canal, ...datos);
  if (r && r.ok === false) throw new Error(r.error);
  return r ? r.dato : undefined;
}

$('mic').innerHTML = icono('mic', 20);
$('ajustes').innerHTML = icono('abrir', 17);
$('mudo').innerHTML = icono('silencio', 16);
$('sinred').innerHTML = icono('sin_conexion', 16);
$('musica-anterior').innerHTML = icono('anterior', 15);
$('musica-play').innerHTML = icono('musica_play', 17);
$('musica-cast').innerHTML = icono('cast', 16);
$('musica-disco-icono').innerHTML = icono('musica', 22);
$('charla-borrar').innerHTML = icono('cruz', 13);
$('respuesta-cancelar').innerHTML = icono('cruz', 13);
$('musica-siguiente').innerHTML = icono('siguiente', 15);

// ---------- Posición horizontal (la pastilla puede llegar hasta el borde de la pantalla) ----------
// main.js manda en "pastillaX" dónde cae el centro de la pastilla dentro de la ventana (en píxeles
// "de CSS", ya sin la escala). #notch y #burbuja ya no se centran solos (align-items ahora es
// flex-start): cada uno se ubica con margin-left, centrado en pastillaX pero sin salirse nunca de
// la ventana — así el panel, al abrirse, "crece" desde el lado que tiene lugar en vez de recortarse.
//
// Para #notch, el ancho objetivo se calcula a mano (no con el ancho real vivo vía ResizeObserver):
// el ancho cambia con una transición CSS de 0.3s al entrar/salir de "activo" o "abierto", y si cada
// tick de ese resize dispara un nuevo margin-left, la transición de margin-left se reinicia en cada
// frame y la animación se ve escalonada en vez de fluida. Al calcular el ancho final de antemano (debe
// coincidir con notch.css) y fijar el margin-left una sola vez, junto con el cambio de clase, el
// navegador anima width y margin-left juntos y en un solo paso.
const ANCHOS_NOTCH = { base: 165, activo: 280, abierto: 360 }; // deben coincidir con notch.css
function anchoObjetivoNotch() {
  if (notch.classList.contains('abierto')) return ANCHOS_NOTCH.abierto;
  if (notch.classList.contains('activo')) return ANCHOS_NOTCH.activo;
  return ANCHOS_NOTCH.base;
}
let pastillaX = null;
function fijarMargen(el, anchoEl) {
  if (pastillaX === null) return;
  const anchoEscena = escena.clientWidth || anchoEl;
  const maximo = Math.max(0, anchoEscena - anchoEl);
  const izquierda = Math.max(0, Math.min(maximo, Math.round(pastillaX - anchoEl / 2)));
  el.style.marginLeft = `${izquierda}px`;
}
// La burbuja sí varía de ancho según el texto (no por una transición animada), así que para ella
// alcanza con medir su ancho real cuando cambia.
function ubicarNotch() { fijarMargen(notch, anchoObjetivoNotch()); }
function ubicarBurbuja() { fijarMargen(burbuja, burbuja.offsetWidth); }
function ubicarTodoHorizontal() { ubicarNotch(); ubicarBurbuja(); }
new ResizeObserver(ubicarBurbuja).observe(burbuja);
window.addEventListener('resize', ubicarTodoHorizontal);

// ---------- Mouse: la ventana es más grande que el notch y solo "existe" donde hay algo dibujado ----------
let encima = false;
let arrastre = null;
function fijarEncima(valor) {
  if (valor === encima) return;
  encima = valor;
  jarvis.enviar('notch:raton', valor);
}
document.addEventListener('mousemove', (e) => {
  if (arrastre) return;
  fijarEncima(!!(e.target instanceof Element && e.target.closest('.zona')));
});
document.documentElement.addEventListener('mouseleave', () => { if (!arrastre) fijarEncima(false); });

// ---------- Abrir y cerrar el panel ----------
let relojAbrir = null;
let relojCerrar = null;
const escribiendoEnElPanel = () => document.activeElement instanceof HTMLInputElement && !!document.activeElement.closest('#panel');
function abrir() { if (!arrastre) { notch.classList.add('abierto'); ubicarNotch(); pintarWidgets(estado); } }
function cerrar() {
  if (dictando) return; // está dictando una respuesta: el panel se queda hasta que termine
  notch.classList.remove('abierto');
  ubicarNotch();
  if (escribiendoEnElPanel()) document.activeElement.blur();
}
notch.addEventListener('mouseenter', () => {
  clearTimeout(relojCerrar);
  relojAbrir = setTimeout(abrir, 170);
});
notch.addEventListener('mouseleave', () => {
  clearTimeout(relojAbrir);
  // Si está escribiendo le damos más tiempo antes de cerrarle el panel.
  relojCerrar = setTimeout(cerrar, escribiendoEnElPanel() ? 5000 : 480);
});
window.addEventListener('blur', () => { clearTimeout(relojCerrar); relojCerrar = setTimeout(cerrar, 300); });

// ---------- Arrastrar la pastilla (o click para hablar) ----------
pastilla.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('#ajustes')) return;
  arrastre = { x: e.screenX, y: e.screenY, movio: false };
  pastilla.setPointerCapture(e.pointerId);
});
pastilla.addEventListener('pointermove', (e) => {
  if (!arrastre) return;
  const dx = e.screenX - arrastre.x;
  const dy = e.screenY - arrastre.y;
  if (!arrastre.movio && Math.hypot(dx, dy) > 5) {
    arrastre.movio = true;
    clearTimeout(relojAbrir);
    cerrar();
    notch.classList.add('arrastrando');
  }
  if (arrastre.movio) jarvis.enviar('notch:arrastre', { dx, dy });
});
function soltar(e) {
  if (!arrastre) return;
  const { movio, x, y } = arrastre;
  arrastre = null;
  notch.classList.remove('arrastrando');
  if (movio) jarvis.enviar('notch:arrastre', { dx: e.screenX - x, dy: e.screenY - y, fin: true });
  else if (e.type === 'pointerup') jarvis.enviar('voz:alternar');
}
pastilla.addEventListener('pointerup', soltar);
pastilla.addEventListener('pointercancel', soltar);
// [E31] La pastilla también se usa con teclado: Enter o Espacio = hablar; flecha abajo/arriba abre o cierra el panel.
pastilla.addEventListener('keydown', (e) => {
  if (e.target !== pastilla) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jarvis.enviar('voz:alternar'); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (notch.classList.contains('abierto')) cerrar(); else { abrir(); setTimeout(() => campoTexto && campoTexto.focus(), 60); } }
  else if (e.key === 'Escape') cerrar();
});

// ---------- Ojos ----------
function parpadear() {
  if (['reposo', 'escuchando', 'hablando'].includes(estado.fase) && !baile.activo) {
    ojos.classList.add('parpadeo');
    setTimeout(() => ojos.classList.remove('parpadeo'), 120);
  }
  setTimeout(parpadear, 2400 + Math.random() * 3800);
}
setTimeout(parpadear, 1500);

const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
jarvis.escuchar('cursor', ({ dx, dy }) => {
  ojos.style.setProperty('--mx', limitar(dx / 45, -5, 5).toFixed(1));
  ojos.style.setProperty('--my', limitar(dy / 70, -2, 3.5).toFixed(1));
});

function nivel(valor, tipo) {
  if (tipo === 'voz' && estado.fase === 'hablando') ojos.style.setProperty('--abre', (0.72 + valor * 0.55).toFixed(2));
  else if (tipo === 'mic' && estado.fase === 'escuchando') ojos.style.setProperty('--abre', (1 + valor * 0.22).toFixed(2));
}

// ---------- Burbuja ----------
let relojBurbuja = null;
function mostrarBurbuja(texto, fijo = false) {
  clearTimeout(relojBurbuja);
  burbuja.textContent = texto;
  burbuja.classList.toggle('visible', !!texto);
  burbuja.classList.toggle('zona', !!texto);
  if (texto && !fijo) relojBurbuja = setTimeout(() => mostrarBurbuja(''), limitar(texto.length * 70, 3500, 14000));
}

// ---------- Voz ----------
const voz = new Voz({
  alDespertar: () => jarvis.enviar('voz:despertar'),
  alNivel: nivel,
  alError: (texto) => mostrarBurbuja(texto),
});

jarvis.escuchar('voz:salida', (pcm, hz) => voz.reproducir(pcm, hz));
jarvis.escuchar('voz:cortar', () => voz.cortar());
jarvis.escuchar('sonido', (id) => voz.sonido(id));

let vozWindows = null;
function elegirVoz() {
  const voces = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
  vozWindows = voces.find((v) => /es-AR/i.test(v.lang)) || voces.find((v) => /es-(MX|US|419)/i.test(v.lang)) || voces[0] || null;
}
elegirVoz();
speechSynthesis.addEventListener('voiceschanged', elegirVoz);

// Burbuja con un texto y, si hace falta, dicho con la voz de Windows (cuando no hay una voz local
// instalada). Al terminar de hablar se le avisa al proceso principal, que está esperando para seguir.
jarvis.escuchar('decir', ({ texto, voz: conVoz, burbuja: conBurbuja, id }) => {
  if (conBurbuja !== false) mostrarBurbuja(texto);
  if (!conVoz) return;
  const frase = new SpeechSynthesisUtterance(texto);
  if (vozWindows) frase.voice = vozWindows;
  frase.lang = vozWindows ? vozWindows.lang : 'es-AR';
  frase.volume = Math.max(0, Math.min(1, Number(config.volumen) || 1)); // la API de Windows no admite más de 1
  const fin = () => { if (id) jarvis.enviar('voz:fin', id); };
  frase.onend = fin;
  frase.onerror = fin;
  speechSynthesis.speak(frase);
});
jarvis.escuchar('voz:cortar', () => speechSynthesis.cancel());

function pintarCharla() {
  $('charla').hidden = !(charla.vos || charla.jarvis);
  document.querySelector('#charla .vos').textContent = charla.vos.trim();
  document.querySelector('#charla .jarvis').textContent = charla.jarvis.trim();
}
function anotarEnCharla(vos, respuesta) {
  charla.vos = vos || ''; charla.jarvis = respuesta || ''; charla.ultimo = respuesta ? 'jarvis' : 'vos';
  pintarCharla();
}
$('charla-borrar').addEventListener('click', () => anotarEnCharla('', ''));

jarvis.escuchar('texto', ({ quien, texto }) => {
  if (quien === 'vos') { // lo que entendió de tu pedido (llega entero, ya transcripto)
    charla.vos = texto; charla.jarvis = '';
  } else {
    charla.jarvis = texto;
  }
  charla.ultimo = quien;
  pintarCharla();
  pintarLeyenda();
  // En silencio no hay voz: la respuesta se lee en la burbuja.
  if (quien === 'jarvis' && !(modoDe(estado.modo)?.habla ?? true)) mostrarBurbuja(charla.jarvis.trim());
});

function cola(texto, largo = 34) {
  const t = texto.trim();
  return t.length > largo ? `…${t.slice(-largo)}` : t;
}
function pintarLeyenda() {
  const textos = {
    reposo: '',
    escuchando: 'Te escucho…',
    pensando: charla.ultimo === 'vos' && charla.vos ? cola(charla.vos) : 'Dame un segundo…',
    hablando: charla.jarvis ? cola(charla.jarvis) : 'Hablando…',
    ok: estado.texto ? `${estado.texto} · listo` : 'Listo',
    error: 'Algo falló',
    alerta: estado.texto || 'Recordatorio',
  };
  leyenda.textContent = textos[estado.fase] ?? '';
  // [E33] Los cambios de estado se anuncian a lectores de pantalla (antes solo cambiaban los ojos).
  const anuncios = { escuchando: `${config.nombre || 'Jarvis'} te escucha`, pensando: 'Pensando', ok: 'Listo', error: estado.texto ? `Error: ${estado.texto}` : 'Algo falló', alerta: `Recordatorio: ${estado.texto || ''}` };
  const a = anuncios[estado.fase] || '';
  if (a && a !== pintarLeyenda.ultimo) $('anuncio').textContent = a;
  pintarLeyenda.ultimo = a;
}

// ---------- Pedidos del proceso principal (webcam, grabar nota de voz) ----------
jarvis.escuchar('pedido', async ({ id, tipo, datos }) => {
  try {
    let dato;
    if (tipo === 'foto') {
      dato = await sacarFoto(config.camara.dispositivo);
    } else if (tipo === 'audio') {
      voz.campanita();
      await new Promise((r) => setTimeout(r, 350));
      // Sin duración fija: graba hasta que dejes de hablar (máximo 60 s). Con duración, esa cantidad de segundos.
      const grab = datos.segundos ? { pcm: await voz.grabar(datos.segundos), hablo: true } : await voz.grabarHastaCallar({ max: datos.max || 60 });
      voz.campanita(true);
      if (!grab.hablo || grab.pcm.length < 16000 * 0.6) dato = { vacio: true };
      else {
        const segundos = grab.pcm.length / 16000;
        if (datos.vistaPrevia) { // se reproduce lo grabado para que lo escuches antes de mandarlo
          await new Promise((r) => setTimeout(r, 300));
          voz.reproducir(new Uint8Array(grab.pcm.buffer, grab.pcm.byteOffset, grab.pcm.byteLength), 16000);
          await new Promise((r) => setTimeout(r, segundos * 1000 + 250));
        }
        dato = { ogg: await pcmAOgg(grab.pcm, 16000), segundos };
      }
    } else if (tipo === 'notavoz') {
      dato = datos.accion === 'parar' ? await terminarNotaVoz({ recorte: datos.recorte || 0 }) : await empezarNotaVoz();
    } else if (tipo === 'pcm') { // audio crudo, para probar la escucha desde Ajustes
      voz.campanita();
      await new Promise((r) => setTimeout(r, 350));
      dato = (await voz.grabar(datos.segundos)).buffer;
      voz.campanita(true);
    } else {
      throw new Error(`Pedido desconocido: ${tipo}`);
    }
    jarvis.enviar('respuesta', { id, dato });
  } catch (e) {
    const texto = e.name === 'NotAllowedError' ? 'Windows no da permiso para usar la cámara.'
      : e.name === 'NotFoundError' ? 'No encuentro ninguna cámara.' : e.message;
    jarvis.enviar('respuesta', { id, error: texto });
  }
});

// ---------- Aviso de lo que falta bajar (el modelo de escucha y la voz, una sola vez) ----------
function pintarAviso(e) {
  const d = e.descarga || {};
  const aviso = $('aviso');
  const boton = $('configurar');
  aviso.hidden = !!e.listo && !d.bajando && !d.error;
  if (aviso.hidden) return;
  boton.hidden = !!d.bajando;
  if (d.bajando) {
    $('aviso-texto').textContent = d.bajando.fase === 'descomprimiendo'
      ? `Preparando "${d.bajando.nombre}"… ${d.bajando.porcentaje}%`
      : `Bajando "${d.bajando.nombre}"… ${d.bajando.porcentaje}%`;
  } else if (d.error) {
    $('aviso-texto').textContent = d.error;
    boton.textContent = 'Reintentar';
  } else {
    $('aviso-texto').textContent = `Para escucharte sin depender de nadie, Jarvis baja una vez sus modelos de voz (${d.mb || 530} MB).`;
    boton.textContent = 'Bajar';
  }
}

// ---------- Novedades: mensajes de WhatsApp y mails pendientes ----------
// Click en una novedad: contestarla (dictando o escribiendo). El tacho la borra.
let respondiendo = null; // { clave, origen, de } de la novedad que se está contestando
let dictando = false;

function pintarNovedades(e) {
  const grupos = e.avisos || [];
  notch.classList.toggle('con-avisos', grupos.length > 0 && e.puntoDeAvisos !== false);
  if (grupos.length) notch.style.setProperty('--aviso', ({ mail: '#6EA8FE', calendario: '#F4B400', nota: '#C792EA' })[grupos[0].origen] || '#25D366');
  // Un recordatorio o un evento que ya sonó queda "pidiendo atención": los ojos se lo hacen notar hasta que lo saques (tacho) o lo abras.
  const alarma = grupos.find((g) => g.origen === 'nota' || g.origen === 'calendario');
  notch.toggleAttribute('data-aviso', !!alarma);
  if (alarma) notch.style.setProperty('--aviso-ojos', alarma.origen === 'nota' ? '#C792EA' : '#F4B400');
  $('avisos-titulo').hidden = !grupos.length;
  $('avisos').hidden = !grupos.length;
  const cuantos = (g) => (g.origen === 'calendario' ? 'Evento:' : g.origen === 'nota' ? '' : g.origen === 'mail' ? (g.cantidad === 1 ? 'Mail de' : `${g.cantidad} mails de`) : (g.cantidad === 1 ? '' : `${g.cantidad} de`));
  // [D26] Cuántas novedades hay, como número en el punto (en lugar de un punto de color sin explicación).
  const total = grupos.reduce((n, g) => n + (g.cantidad || 1), 0);
  $('punto').textContent = grupos.length && e.puntoDeAvisos !== false ? (total > 9 ? '9+' : String(total)) : '';
  pastilla.setAttribute('aria-label', total ? `Hablar con ${config.nombre || 'Jarvis'}. ${total === 1 ? '1 novedad' : `${total} novedades`}` : `Hablar con ${config.nombre || 'Jarvis'}`);
  // [D27] Cada novedad con el ícono de dónde viene y la hora; el tacho, separado del renglón.
  const ICONO_ORIGEN = { whatsapp: 'whatsapp', mail: 'mail', calendario: 'calendario', nota: 'nota' };
  const NOMBRE_ORIGEN = { whatsapp: 'WhatsApp', mail: 'Mail', calendario: 'Calendario', nota: 'Recordatorio' };
  const hora = (ms) => {
    if (!ms) return '';
    const d = new Date(ms); const min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `${min} min`;
    if (min < 12 * 60) return `${Math.round(min / 60)} h`;
    return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };
  $('avisos').innerHTML = grupos.slice(0, 3).map((g) => `<div class="aviso ${g.origen}${respondiendo && respondiendo.clave === g.clave ? ' elegida' : ''}" data-clave="${escapar(g.clave)}">
    <button type="button" class="cuerpo" title="${g.origen === 'mail' ? 'Abrir el mail' : g.origen === 'calendario' ? 'Ver el evento' : g.origen === 'nota' ? 'Abrir mis notas' : 'Contestar'}" aria-label="${escapar(`${NOMBRE_ORIGEN[g.origen] || ''}: ${cuantos(g)} ${g.de}. ${g.texto || ''}. ${g.origen === 'mail' ? 'Abrir' : 'Contestar'}`)}"><span class="origen" aria-hidden="true">${icono(ICONO_ORIGEN[g.origen] || 'novedades', 14)}</span><b>${escapar(`${cuantos(g)} ${g.de}`.trim())}</b><span class="txt">${escapar(g.texto || '')}</span><time>${hora(g.cuando)}</time></button>
    ${g.origen === 'whatsapp' || g.origen === 'mail' ? `<button type="button" class="silenciar" title="No avisarme más de ${escapar(g.de || 'esto')}" aria-label="No avisarme más de ${escapar(g.de || 'esto')}">${icono('silencio', 14)}</button>` : ''}
    <button type="button" class="tacho" title="Borrar esta novedad" aria-label="Borrar la novedad de ${escapar(g.de || '')}">${icono('tacho', 14)}</button></div>`).join('')
    + (grupos.length > 3 ? `<div class="aviso resto" data-clave=""><div class="cuerpo"><span class="origen" aria-hidden="true">${icono('novedades', 14)}</span><b>y ${grupos.length - 3} más</b><span class="txt">Pedímelas: "leeme las novedades"</span></div></div>` : '');
  // Si la novedad que se estaba contestando ya no está (se leyó en el celular), se suelta.
  if (respondiendo && !grupos.some((g) => g.clave === respondiendo.clave)) terminarRespuesta();
}

function pintarRespuesta() {
  $('respuesta').hidden = !respondiendo;
  if (!respondiendo) { campoTexto.placeholder = `Escribile o hablale a ${config.nombre || 'Jarvis'}…`; return; }
  $('respuesta-a').textContent = respondiendo.de;
  $('respuesta-ayuda').textContent = dictando ? ' · decí el mensaje' : respondiendo.origen === 'mail' ? ' · Enter para enviar' : ' · escribí y Enter';
  campoTexto.placeholder = dictando ? 'Te escucho… (o escribí acá)' : 'Escribí la respuesta…';
  for (const a of document.querySelectorAll('#avisos .aviso')) a.classList.toggle('elegida', a.dataset.clave === respondiendo.clave);
}
function terminarRespuesta() {
  const habia = dictando;
  respondiendo = null; dictando = false;
  pintarRespuesta();
  for (const a of document.querySelectorAll('#avisos .aviso.elegida')) a.classList.remove('elegida');
  if (habia) pedir('avisos:cancelar').catch(() => {});
}
async function enviarRespuesta(texto) {
  const a = respondiendo;
  if (!a || !texto.trim()) return;
  if (dictando) { dictando = false; pedir('avisos:cancelar').catch(() => {}); }
  respondiendo = null;
  pintarRespuesta();
  campoTexto.value = '';
  anotarEnCharla(`Para ${a.de}: ${texto.trim()}`, 'Enviando…');
  try { anotarEnCharla(`Para ${a.de}: ${texto.trim()}`, await pedir('avisos:responder', a.clave, texto.trim())); } catch (e) { anotarEnCharla(`Para ${a.de}: ${texto.trim()}`, `No pude enviarlo: ${e.message}`); }
}
async function empezarRespuesta(g) {
  if (respondiendo) terminarRespuesta();
  respondiendo = g;
  campoTexto.value = '';
  campoTexto.focus();
  if (!estado.listo) { pintarRespuesta(); return; } // sin modelo de escucha: se contesta escribiendo
  dictando = true;
  pintarRespuesta();
  let dicho = '';
  try { dicho = await pedir('avisos:dictar'); } catch { /* no se pudo escuchar: queda para escribir */ }
  if (respondiendo !== g || !dictando) return; // se canceló o se mandó escrita mientras tanto
  dictando = false;
  pintarRespuesta();
  if (!dicho) return; // no dijo nada: puede escribirla
  // Un WhatsApp sale tal cual se dictó. Un mail no se puede "des-enviar": queda escrito para revisarlo y mandar con Enter.
  if (g.origen === 'whatsapp') enviarRespuesta(dicho);
  else { campoTexto.value = dicho; campoTexto.focus(); }
}
$('avisos').addEventListener('click', (e) => {
  const fila = e.target.closest('.aviso');
  if (!fila || !fila.dataset.clave) return;
  if (e.target.closest('.silenciar')) {
    if (respondiendo && respondiendo.clave === fila.dataset.clave) terminarRespuesta();
    pedir('avisos:silenciar', fila.dataset.clave).then((quien) => mostrarBurbuja(quien ? `Listo: no te aviso más de ${quien}. Lo cambiás en Ajustes → Notificaciones.` : 'Ese aviso ya no está.')).catch((er) => mostrarBurbuja(er.message));
    return;
  }
  if (e.target.closest('.tacho')) { if (respondiendo && respondiendo.clave === fila.dataset.clave) terminarRespuesta(); pedir('avisos:limpiar', fila.dataset.clave); return; }
  if (!e.target.closest('.cuerpo')) return;
  const g = (estado.avisos || []).find((x) => x.clave === fila.dataset.clave);
  if (!g) return;
  if (g.origen === 'calendario') return; // un evento no se contesta: se borra con el tacho
  if (g.origen === 'nota') { pedir('ajustes:abrir', 'notas'); return; } // un recordatorio se ve en Notas; se saca con el tacho
  if (g.origen === 'mail') { // un mail se abre en Chrome; los WhatsApp se contestan desde acá
    pedir('avisos:abrir', g.clave).then(() => mostrarBurbuja('Abriendo el mail en Chrome…')).catch((er) => mostrarBurbuja(er.message));
    return;
  }
  empezarRespuesta({ clave: g.clave, origen: g.origen, de: g.de });
});
$('avisos-limpiar').addEventListener('click', () => { terminarRespuesta(); pedir('avisos:limpiar'); });
$('respuesta-cancelar').addEventListener('click', () => { terminarRespuesta(); campoTexto.value = ''; });
campoTexto.addEventListener('keydown', (e) => { if (e.key === 'Escape' && respondiendo) { terminarRespuesta(); campoTexto.value = ''; } });

// ---------- Ojos bailando al ritmo de la música ----------
// Del reproductor llega, cada ~100 ms, lo que analizó de la canción (ver ritmo.js): tempo (bpm) y qué tan seguro
// está, la hora de cada golpe, y la fuerza de graves/medios/agudos. Con eso los ojos no "reaccionan" a cada sonido
// (se veía nervioso): llevan un metrónomo propio enganchado al tempo de la canción —una fase que avanza sola y se
// corrige suave con cada golpe— y sobre él hacen una coreografía que cambia cada cuatro tiempos según la energía:
// respiran, rebotan, se mecen, miran a los costados, guiñan, saltan, cabecean. Además pestañean solos, se abren
// grandes cuando la música "explota" y brillan con cada golpe. Todo pasa por resortes (movimiento continuo).
// Mensajes: { parar: true } | { ok: false } (no se pudo medir: bailan a un compás propio) | { ok: true, bpm, conf, n, hace, graves, medios, agudos, energia, subida }.
const RETRASO_SALIDA = 70; // ms: el audio se mide un poco antes de que salga por los parlantes
class Muelle {
  constructor(valor = 0, w = 28, z = 0.8) { this.v = valor; this.vel = 0; this.w = w; this.z = z; }
  paso(meta, dt) {
    const pasos = Math.max(1, Math.ceil(dt / 0.008)); const h = dt / pasos;
    for (let i = 0; i < pasos; i++) { this.vel += (this.w * this.w * (meta - this.v) - 2 * this.z * this.w * this.vel) * h; this.v += this.vel * h; }
    return this.v;
  }
}
const baile = {
  activo: false, cuadro: 0, ultimo: 0,
  fase: 0, compas: 0, bpm: 104, conf: 0, medido: false, ultimaMedida: 0, ultimoN: -1, ultimoAjuste: 0,
  energia: 0.25, objetivo: 0.25, subida: 1, pulso: 0,
  mov: 'respira', proxParpadeo: 0, parpadeoT: -1, abrirT: -1, ultimaApertura: 0,
  m: null,
};
const nuevosMuelles = () => ({
  y: new Muelle(0, 34, 0.7), x: new Muelle(0, 22, 0.9), lean: new Muelle(0, 26, 0.75), sq: new Muelle(1, 40, 0.7), sx: new Muelle(1, 40, 0.7),
  ai: new Muelle(1, 70, 0.9), ad: new Muelle(1, 70, 0.9), forma: new Muelle(0.4, 14, 1), brillo: new Muelle(0, 18, 1),
});
const azar = (a, b) => a + Math.random() * (b - a);
const sube = (x) => Math.sin(Math.PI * Math.min(1, Math.max(0, x))); // 0 → 1 → 0

function elegirMovimiento() {
  const e = baile.energia;
  const opciones = e < 0.3 ? ['respira', 'vaiven', 'mira', 'vaiven'] : e < 0.62 ? ['rebote', 'vaiven', 'guiño', 'mira', 'rebote'] : ['salto', 'doble', 'cabeceo', 'rebote', 'guiño', 'salto'];
  let nuevo = baile.mov;
  for (let i = 0; i < 6 && nuevo === baile.mov; i++) nuevo = opciones[Math.floor(Math.random() * opciones.length)];
  baile.mov = nuevo;
}

// Dónde quiere estar cada parte del ojo en este instante: depende del movimiento, de la fase del tiempo (0 a 1), del
// número de tiempo y de la energía.
function blancos(ahora) {
  const f = baile.fase; const c = baile.compas; const e = baile.energia;
  const salto = Math.abs(Math.sin(Math.PI * f)); // 0 justo en el tiempo, 1 a la mitad
  const contacto = Math.exp(-f * 9); // 1 justo en el tiempo, cae rápido (el "aterrizaje")
  const amp = 1.5 + 3.3 * e;
  const ciclo2 = Math.sin(Math.PI * ((c % 2) + f)); // un vaivén completo cada dos tiempos
  const barra = (c % 4) + f; // 0 a 4
  const t = {
    y: 0, x: 0, lean: 0, sq: 1, sx: 1, ai: 1, ad: 1,
    forma: 0.3 + 0.45 * e, brillo: 0.1 + 0.4 * e * contacto,
  };
  switch (baile.mov) {
    case 'respira': {
      const r = Math.sin((2 * Math.PI * ahora) / 2600);
      t.y = -1.2 * r; t.sq = 1 + 0.05 * r; t.lean = 2.2 * Math.sin((2 * Math.PI * ahora) / 5400); t.forma = 0.15; t.brillo = 0.08;
      break;
    }
    case 'rebote':
      t.y = -amp * salto; t.lean = ciclo2 * (3 + 6 * e); t.sq = 1 + 0.12 * salto - 0.2 * e * contacto; t.sx = 1 - 0.06 * salto + 0.1 * e * contacto;
      break;
    case 'vaiven':
      t.x = 3.8 * Math.sin((2 * Math.PI * barra) / 4); t.lean = t.x * 1.8; t.y = -amp * 0.35 * salto; t.forma = 0.3 + 0.3 * e;
      break;
    case 'guiño': {
      t.y = -amp * salto; t.lean = ciclo2 * (2 + 5 * e); t.sq = 1 + 0.1 * salto - 0.15 * e * contacto;
      if (c % 4 === 2) t.ad = 1 - 0.92 * sube(f / 0.75); // el ojo derecho se cierra y se abre en el tercer tiempo
      t.forma = 0.55;
      break;
    }
    case 'mira': {
      t.x = (c % 2 ? 1 : -1) * 3.6; t.lean = t.x * 0.9; t.y = -amp * 0.5 * salto; t.forma = 0.2 + 0.3 * e; t.sq = 1 + 0.05 * salto;
      break;
    }
    case 'salto': {
      const fuerte = c % 4 === 0;
      t.y = -amp * (fuerte ? 1.7 : 1.05) * salto;
      t.sq = 1 + (fuerte ? 0.24 : 0.1) * salto - (fuerte ? 0.3 : 0.14) * contacto; t.sx = 1 - 0.1 * salto + 0.12 * contacto;
      t.forma = fuerte ? 0.05 : 0.5; t.lean = (c % 2 ? 1 : -1) * 4 * salto; t.brillo = 0.25 + 0.6 * contacto;
      break;
    }
    case 'doble': {
      const m = Math.abs(Math.sin(2 * Math.PI * f));
      t.y = -amp * 0.7 * m; t.lean = ciclo2 * 4; t.sq = 1 - 0.14 * Math.exp(-((f * 2) % 1) * 9) * e; t.forma = 0.6;
      break;
    }
    case 'cabeceo':
      t.y = amp * 0.9 * contacto - amp * 0.2 * salto; t.lean = ciclo2 * 10; t.sq = 1 - 0.26 * contacto; t.sx = 1 + 0.1 * contacto; t.forma = 0.85; t.brillo = 0.2 + 0.5 * contacto;
      break;
  }
  // Pestañeo: solo, cada pocos segundos (más seguido cuando la música está tranquila).
  if (ahora >= baile.proxParpadeo) { baile.parpadeoT = ahora; baile.proxParpadeo = ahora + (e < 0.3 ? azar(1500, 4000) : azar(3200, 7000)); }
  if (baile.parpadeoT >= 0) {
    const p = (ahora - baile.parpadeoT) / 160;
    if (p < 1) { const cierre = 1 - 0.93 * sube(p); t.ai = Math.min(t.ai, cierre); t.ad = Math.min(t.ad, cierre); } else baile.parpadeoT = -1;
  }
  // Cuando la música "explota" (de golpe suena mucho más fuerte que hasta ahora): los ojos se abren grandes y brillan.
  if (baile.subida > 1.45 && ahora - baile.ultimaApertura > 2500) { baile.abrirT = ahora; baile.ultimaApertura = ahora; }
  if (baile.abrirT >= 0) {
    const p = (ahora - baile.abrirT) / 700;
    if (p < 1) { const env = sube(p); t.sq += 0.3 * env; t.sx += 0.08 * env; t.forma -= 0.35 * env; t.brillo += 0.7 * env; } else baile.abrirT = -1;
  }
  t.brillo += baile.pulso * 0.45; // un destello con cada golpe que se oye
  t.forma = limitar(t.forma, 0, 1);
  t.y = limitar(t.y, -8, 5); // sin salirse del notch
  return t;
}

function cuadroBaile(marca) {
  const dt = Math.min(0.05, Math.max(0.001, (marca - (baile.ultimo || marca)) / 1000));
  baile.ultimo = marca;
  const ahora = performance.now();
  // El metrónomo: si hay medición vigente avanza al tempo de la canción; si no, a un compás propio tranquilo.
  const sigue = baile.medido && ahora - baile.ultimaMedida < 1500;
  baile.fase += ((sigue ? baile.bpm : 104) / 60) * dt;
  while (baile.fase >= 1) { baile.fase -= 1; baile.compas++; if (baile.compas % 4 === 0) elegirMovimiento(); }
  // Energía y destello suavizados (suben rápido, bajan despacio).
  baile.energia += (baile.objetivo - baile.energia) * (1 - Math.exp(-dt / (baile.objetivo > baile.energia ? 0.15 : 0.7)));
  baile.pulso *= Math.exp(-dt / 0.12);
  const t = blancos(ahora);
  const m = baile.m;
  const v = (nombre, meta) => m[nombre].paso(meta, dt);
  ojos.style.setProperty('--by', v('y', t.y).toFixed(2));
  ojos.style.setProperty('--bx', v('x', t.x).toFixed(2));
  ojos.style.setProperty('--lean', v('lean', t.lean).toFixed(2));
  ojos.style.setProperty('--sq', limitar(v('sq', t.sq), 0.4, 1.6).toFixed(3));
  ojos.style.setProperty('--sx', limitar(v('sx', t.sx), 0.6, 1.4).toFixed(3));
  ojos.style.setProperty('--ai', limitar(v('ai', t.ai), 0.05, 1.2).toFixed(3));
  ojos.style.setProperty('--ad', limitar(v('ad', t.ad), 0.05, 1.2).toFixed(3));
  ojos.style.setProperty('--forma', limitar(v('forma', t.forma), 0, 1).toFixed(3));
  ojos.style.setProperty('--brillo', limitar(v('brillo', t.brillo), 0, 1.3).toFixed(3));
  baile.cuadro = requestAnimationFrame(cuadroBaile);
}

function empezarBaile() {
  if (baile.activo) return;
  Object.assign(baile, { activo: true, tempoFijado: false, ultimo: 0, fase: 0, compas: 0, medido: false, conf: 0, ultimoN: -1, energia: 0.25, objetivo: 0.25, pulso: 0, mov: 'respira', proxParpadeo: performance.now() + 1500, parpadeoT: -1, abrirT: -1, m: nuevosMuelles() });
  notch.classList.add('baila');
  baile.cuadro = requestAnimationFrame(cuadroBaile);
}
function pararBaile() {
  if (!baile.activo) return;
  baile.activo = false; cancelAnimationFrame(baile.cuadro);
  notch.classList.remove('baila');
  for (const p of ['--by', '--bx', '--lean', '--sq', '--sx', '--ai', '--ad', '--forma', '--brillo']) ojos.style.removeProperty(p);
}

const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
function bailar(msg) {
  if (!msg || msg.parar || menosMovimiento.matches) { pararBaile(); return; }
  empezarBaile();
  const ahora = performance.now();
  if (msg.ok === false) { baile.medido = false; baile.conf = 0; return; }
  baile.medido = true; baile.ultimaMedida = ahora; baile.conf = msg.conf || 0;
  baile.objetivo = limitar(0.65 * (msg.energia || 0) + 0.35 * (msg.graves || 0), 0, 1);
  baile.subida = msg.subida || 1;
  // Tempo: se toma el que mide el analizador si está seguro; un cambio grande (otra canción) se adopta de una vez.
  if (msg.bpm >= 60 && msg.conf >= 0.25) {
    if (!baile.tempoFijado || Math.abs(msg.bpm - baile.bpm) / baile.bpm > 0.12) { baile.bpm = msg.bpm; baile.tempoFijado = true; }
    else baile.bpm += (msg.bpm - baile.bpm) * 0.25;
  }
  // Un golpe nuevo: destello, y se corrige la fase del metrónomo para que los tiempos caigan con la música.
  if (msg.n !== baile.ultimoN) {
    const primera = baile.ultimoN < 0;
    baile.ultimoN = msg.n;
    if (!primera && msg.hace !== null && msg.hace < 400) {
      baile.pulso = 1;
      const haceReal = msg.hace - RETRASO_SALIDA; // negativo: todavía no suena
      const faseEnElGolpe = baile.fase - (baile.bpm / 60) * (haceReal / 1000);
      const error = ((((faseEnElGolpe % 1) + 1.5) % 1) - 0.5); // -0.5 a 0.5: cuánto se desvió respecto del tiempo
      if (msg.conf >= 0.25) { if (Math.abs(error) < 0.3) baile.fase -= error * 0.25; } // enganche suave a los tiempos
      else if (ahora - baile.ultimoAjuste > 250) { baile.fase = 0; baile.ultimoAjuste = ahora; } // sin tempo claro: cada golpe marca un tiempo
    }
  }
}
jarvis.escuchar('ritmo', bailar);

// ---------- Música: el botón del medio es Pausa si está sonando y Play si no ----------
let sonabaMusica = null;
function pintarMusica(e) {
  pintarCastDeMusica();
  const sonando = !!(e.musica && e.musica.sonando);
  const m = e.musica || {};
  const cancion = m.cancion || m.titulo || '';
  // Todo ocupa siempre su lugar (tapa vacía, "Nada sonando"): los botones no se mueven según haya música o no.
  const t = $('musica-titulo');
  t.title = m.titulo || cancion;
  $('musica-cancion').textContent = cancion || 'Nada sonando'; t.classList.toggle('vacio', !cancion);
  $('musica-artista').textContent = m.cancion ? (m.artista || '') : '';
  const tapa = $('musica-tapa');
  const url = m.tapa || '';
  if (tapa.dataset.url !== url) { tapa.dataset.url = url; if (url) tapa.src = url; else tapa.removeAttribute('src'); }
  tapa.hidden = !url; $('musica').classList.toggle('con-tapa', !!url);
  if (sonando === sonabaMusica) return;
  sonabaMusica = sonando;
  $('musica-play').innerHTML = icono(sonando ? 'musica_pausa' : 'musica_play', 17);
  $('musica-play').title = sonando ? 'Pausar' : 'Reproducir';
}

// ---------- Clips (repetición instantánea) ----------
// Los controles de clips solo se ven si están prendidos en Ajustes y el modo los usa.
const clipsDisponibles = (e) => { const c = (e && e.clips) || {}; return !!c.activo && c.permitido !== false; };
function pintarClips(e) {
  const clips = e.clips || {};
  const ver = clipsDisponibles(e);
  $('clips').hidden = !ver;
  if (!ver) return;
  $('clip-grabar').innerHTML = icono(clips.grabando ? 'parar' : 'grabar', 16);
  $('clip-grabar').classList.toggle('grabando', !!clips.grabando);
  $('clip-grabar').title = clips.grabando ? 'Parar y guardar la grabación' : 'Grabar la pantalla';
  $('clip-pausa').hidden = !clips.grabando;
  $('clip-pausa').innerHTML = icono(clips.pausado ? 'musica_play' : 'pausa', 15);
  $('clip-pausa').title = clips.pausado ? 'Seguir grabando' : 'Pausar la grabación';
  $('clip-guardar').innerHTML = `${icono('clip', 16)}<span>Clip</span>`;
  $('clip-enviar').innerHTML = `${icono('enviar', 15)}<span>Enviar</span>`;
  $('clip-info').textContent = clips.error ? clips.error : clips.grabando ? (clips.pausado ? 'Grabación en pausa' : 'Grabando…') : clips.corriendo ? `Buffer ${clips.segundos || 0} s` : clips.permitido ? 'Arrancando…' : '';
}

// ---------- Los widgets del panel (lo que muestra cada modo, en el orden que se eligió en Ajustes → Panel) ----------
// Los que ya existen en la página (escribir, novedades, acciones rápidas, clips, música, modos) se muestran, ordenan y achican con CSS;
// los sueltos (una rutina, un atajo de voz, clips en botones, nota rápida, próximo evento) se crean acá. Lo que está vacío no se ve.
const ESTATICOS = { texto: 'w-texto', novedades: 'w-novedades', rutinas: 'w-rutinas', clips: 'w-clips', musica: 'w-musica', modos: 'w-modos' };
const SUELTOS = new Set(['leer-avisos', 'cast', 'rutina', 'frase', 'captura', 'clip-guardar', 'clip-grabar', 'grabar-pantalla', 'grabar-ventana', 'grabar-recuadro', 'clip-enviar', 'nota-voz', 'nota', 'agenda', 'abrir', 'modo', 'volumen', 'notas', 'reloj', 'clima', 'titulo']);
const tiles = new Map(); // id del widget -> { el, tipo, html }
let rutinasTodas = [];

function enCuanto(inicio, fin, todoElDia) {
  if (todoElDia) return 'Todo el día';
  const ahora = Date.now();
  const hora = new Date(inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (inicio <= ahora) return `Ahora · hasta ${new Date(fin).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  const min = Math.round((inicio - ahora) / 60000);
  if (min < 60) return `En ${Math.max(1, min)} min · ${hora}`;
  if (min < 360) return `En ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''} · ${hora}`;
  const manana = new Date(ahora + 86400000).toDateString() === new Date(inicio).toDateString();
  return `${manana ? 'Mañana' : 'Hoy'} · ${hora}`;
}

// Datos que piden algunos widgets: se piden solo si hay un widget que los muestre.
const datosWidgets = { clima: null, climaPedido: 0, notas: null, notasPedido: 0, volumen: null, mudo: false, pc: null };
// Estado de la PC: cada 5 s, solo si hay un widget que lo muestre y el panel está a la vista.
setInterval(async () => {
  if (!estado || !estado.panel || document.hidden || !normalizarLista(estado.panel.widgets).some((w) => w.tipo === 'pc')) return;
  try { datosWidgets.pc = await pedir('pc:estado'); pintarWidgets(estado); } catch {}
}, 5000);
async function refrescarDatosDeWidgets(lista, forzar) {
  const ahora = Date.now();
  if (lista.some((w) => w.tipo === 'clima') && (forzar || ahora - datosWidgets.climaPedido > 15 * 60 * 1000)) {
    datosWidgets.climaPedido = ahora;
    try { datosWidgets.clima = await pedir('widget:clima'); } catch (er) { datosWidgets.clima = { error: er.message }; }
    pintarWidgets(estado);
  }
  if (lista.some((w) => w.tipo === 'notas') && (forzar || ahora - datosWidgets.notasPedido > 5 * 60 * 1000)) {
    datosWidgets.notasPedido = ahora;
    try { datosWidgets.notas = await pedir('notas:leer'); } catch { datosWidgets.notas = []; }
    pintarWidgets(estado);
  }
}
jarvis.escuchar('notas', () => { datosWidgets.notasPedido = 0; refrescarDatosDeWidgets(normalizarLista((estado.panel || {}).widgets), true); });
setInterval(() => { if (estado && estado.panel) { pintarWidgets(estado); refrescarDatosDeWidgets(normalizarLista(estado.panel.widgets)); } }, 30 * 1000); // el reloj, el clima y la agenda al día

const ICONO_CIELO = (c, dia) => (c === 0 || c === 1 ? (dia ? 'sol' : 'luna') : c <= 3 ? 'nube' : c >= 51 && c <= 82 ? 'lluvia' : c >= 95 ? 'rayo' : 'nube');
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Un botón de widget: ícono + nombre (en doble alto, el ícono grande arriba).
const tileBoton = (accion, ic, nombre, extra = '', titulo = '') => `<button type="button" class="tile-b" data-accion="${accion}" ${extra} title="${escapar(titulo || nombre)}">${icono(ic, 20)}<span>${escapar(nombre)}</span></button>`;

// ---------- Menú desplegable propio (en lugar de la lista nativa de Windows) ----------
// Se abre pegado al botón, siempre dentro del notch; Esc, un click afuera o elegir algo lo cierran. Con flechas y Enter también se maneja.
let menuAbierto = null;
function cerrarMenu() {
  if (!menuAbierto) return;
  const { el, ancla, quitar } = menuAbierto;
  menuAbierto = null;
  quitar();
  el.remove();
  if (ancla && ancla.isConnected) { ancla.setAttribute('aria-expanded', 'false'); ancla.classList.remove('abierto'); }
}
function abrirMenu(ancla, opciones, alElegir, { actual = '' } = {}) {
  const yaEraEste = menuAbierto && menuAbierto.ancla === ancla;
  cerrarMenu();
  if (yaEraEste || !opciones.length) return;
  const el = document.createElement('div');
  el.className = 'menu-j'; el.setAttribute('role', 'menu');
  el.innerHTML = opciones.map((o, i) => `<button type="button" role="menuitem" class="menu-op${o.valor === actual ? ' actual' : ''}" data-i="${i}">${o.icono ? icono(o.icono, 16) : ''}<span>${escapar(o.nombre)}</span>${o.valor === actual ? icono('tilde', 14) : ''}</button>`).join('');
  notch.append(el);
  const nr = notch.getBoundingClientRect();
  const z = nr.width / (notch.offsetWidth || nr.width) || 1; // el panel puede estar con zoom: las medidas se llevan a píxeles del propio notch
  const ar = ancla.getBoundingClientRect();
  const ancho = Math.min(notch.offsetWidth - 16, Math.max(180, ar.width / z));
  el.style.width = `${ancho}px`;
  const alto = el.offsetHeight;
  let izq = (ar.left - nr.left) / z + (ar.width / z - ancho) / 2;
  izq = Math.max(8, Math.min(notch.offsetWidth - ancho - 8, izq));
  let arriba = (ar.bottom - nr.top) / z + 6;
  if (arriba + alto > notch.offsetHeight - 6) arriba = (ar.top - nr.top) / z - alto - 6; // si abajo no entra, se abre hacia arriba
  el.style.left = `${izq}px`; el.style.top = `${Math.max(6, arriba)}px`;
  ancla.setAttribute('aria-expanded', 'true'); ancla.classList.add('abierto');
  const botones = [...el.querySelectorAll('.menu-op')];
  const elegir = (b) => { const o = opciones[Number(b.dataset.i)]; cerrarMenu(); if (o) alElegir(o.valor, o); };
  el.addEventListener('click', (e) => { const b = e.target.closest('.menu-op'); if (b) elegir(b); });
  const afuera = (e) => { if (!el.contains(e.target) && !ancla.contains(e.target)) cerrarMenu(); };
  const teclas = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cerrarMenu(); ancla.focus(); return; }
    const i = botones.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); botones[(i + 1) % botones.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); botones[(i - 1 + botones.length) % botones.length].focus(); }
  };
  document.addEventListener('pointerdown', afuera, true);
  document.addEventListener('keydown', teclas, true);
  menuAbierto = { el, ancla, quitar: () => { document.removeEventListener('pointerdown', afuera, true); document.removeEventListener('keydown', teclas, true); } };
  (botones.find((b) => b.classList.contains('actual')) || botones[0]).focus({ preventScroll: true });
}
notch.addEventListener('mouseleave', () => { /* el panel se cierra solo al sacar el mouse: el menú se va con él */ if (!notch.classList.contains('abierto')) cerrarMenu(); });

// Los aparatos cargados en Dispositivos, para elegir a dónde mandar la música.
const aparatosDeCast = () => (config.teles || []).map((t) => String(t.nombre || '').split(',')[0].trim()).filter(Boolean);
function pintarCastDeMusica() {
  $('musica-cast').hidden = !aparatosDeCast().length;
}
async function mandarMusicaA(aparato) {
  if (!aparato) return;
  mostrarBurbuja(`Mandando la música a ${aparato}…`);
  try { mostrarBurbuja(String(await pedir('musica:aDispositivo', aparato))); } catch (er) { mostrarBurbuja(er.message); }
}
const PC = '\u0000pc';
const menuDeCast = (ancla) => {
  const actual = (estado.musica && estado.musica.destino) || '';
  const op = aparatosDeCast().map((n) => ({ valor: n, nombre: n, icono: 'cast' }));
  if (actual) op.unshift({ valor: PC, nombre: 'Esta PC', icono: 'musica' });
  abrirMenu(ancla, op, async (v) => {
    if (v !== PC) return mandarMusicaA(v);
    try { mostrarBurbuja(String(await pedir('musica:aLaPC'))); } catch (er) { mostrarBurbuja(er.message); }
  }, { actual });
};
const OPCIONES_DE_GRABAR = [{ valor: 'pantalla', nombre: 'Pantalla completa', icono: 'interfaz' }, { valor: 'ventana', nombre: 'Una ventana', icono: 'modos' }, { valor: 'recuadro', nombre: 'Un recuadro', icono: 'camara' }];
const menuDeGrabar = (ancla) => abrirMenu(ancla, OPCIONES_DE_GRABAR, (v, o) => accionClip({ accion: 'grabar', modo: v }, ancla));
$('musica-cast').addEventListener('click', (e) => menuDeCast(e.currentTarget));

function datosDeTile(w, e) {
  switch (w.tipo) {
    case 'titulo': return (w.texto || '').trim() ? { html: `<div class="tile-titulo">${escapar(w.texto)}</div>` } : { vacio: true };
    case 'abrir':
      return (w.destino || '').trim() ? { html: tileBoton('abrir', w.icono || (/^https?:/i.test(w.destino) ? 'enviar' : 'trabajo'), w.nombre || w.destino, `data-destino="${escapar(w.destino)}"`, `Abrir ${w.destino}`) } : { vacio: true };
    case 'modo': {
      const m = (config.modos || []).find((x) => x.id === w.modo);
      if (!m) return { vacio: true };
      const activo = e.modo === m.id;
      return { html: `<button type="button" class="tile-b${activo ? ' activo' : ''}" data-accion="modo" data-modo="${escapar(m.id)}" aria-pressed="${activo}" title="Modo ${escapar(m.nombre)}">${icono(w.icono || 'modos', 20)}<span>${escapar(m.nombre)}</span></button>` };
    }
    case 'volumen': {
      const v = datosWidgets.volumen ?? (Number.isFinite(Number(w.ultimo)) ? Number(w.ultimo) : 50);
      return { html: `<div class="tile-volumen"><button type="button" data-accion="mudo" title="${datosWidgets.mudo ? 'Activar el sonido' : 'Silenciar la PC'}" aria-pressed="${datosWidgets.mudo}">${icono(datosWidgets.mudo ? 'silencio' : 'parlante', 18)}</button><input type="range" min="0" max="100" step="2" value="${v}" aria-label="Volumen de la PC" data-accion="volumen"><output>${v}</output></div>`, fijo: true };
    }
    case 'reloj': {
      const d = new Date();
      const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
      const fecha = `${DIAS[d.getDay()]} ${d.getDate()} de ${d.toLocaleDateString('es-AR', { month: 'long' })}`;
      return { html: `<div class="tile-info tile-reloj"><b>${hora}</b><small>${w.tam === 1 && w.alto === 1 ? DIAS[d.getDay()].slice(0, 3) + ' ' + d.getDate() : fecha}</small></div>` };
    }
    case 'clima': {
      const c = datosWidgets.clima;
      if (!c) return { html: '<div class="tile-info"><small>Clima…</small></div>' };
      if (c.sinCiudad) return { html: '<div class="tile-info"><small>Cargá tu ciudad en Ajustes</small></div>' };
      if (c.error) return { html: `<div class="tile-info"><small>${escapar(c.error)}</small></div>` };
      const extra = w.alto === 2 ? `<small>${c.max}° / ${c.min}°${Number.isFinite(c.lluvia) ? ` · ${Math.round(c.lluvia)} % lluvia` : ''}</small>` : '';
      return { html: `<button type="button" class="tile-info tile-clima" data-accion="frase" data-texto="¿Cómo está el clima?" title="${escapar(`${c.ciudad}: ${c.cielo}, sensación de ${c.sensacion}°`)}">${icono(ICONO_CIELO(c.codigo, c.dia), w.alto === 2 ? 30 : 22)}<span><b>${c.temp}°</b><small>${escapar(w.tam === 1 ? c.cielo.split(' ')[0] : w.tam >= 3 ? `${c.cielo} · ${c.ciudad}` : c.cielo)}</small>${extra}</span></button>` };
    }
    case 'notas': {
      const l = (datosWidgets.notas || []).slice().sort((a, b) => (Number(!!(b.cuando && !b.avisada)) - Number(!!(a.cuando && !a.avisada))) || (b.creada - a.creada)).slice(0, w.alto === 2 ? 5 : 2);
      if (!l.length) return { vacio: true };
      return { html: `<div class="tile-lista">${l.map((n) => `<button type="button" data-accion="ver-notas" title="${escapar(n.texto)}">${icono(n.cuando && !n.avisada ? 'reloj' : 'nota', 14)}<span>${escapar(n.texto)}</span></button>`).join('')}</div>` };
    }
    case 'rutina': {
      const r = rutinasTodas.find((x) => x.id === w.rutina);
      if (r && w.alto === 2) return { html: `<button type="button" class="tile-b" data-accion="rutina" data-id="${escapar(r.id)}" title="${escapar(r.nombre)}">${icono(r.icono, 28)}<span>${escapar(r.nombre)}</span></button>` };
      return r ? { html: `<button type="button" class="tile-b" data-accion="rutina" data-id="${escapar(r.id)}" title="${escapar(r.nombre)}">${icono(r.icono, 20)}<span>${escapar(r.nombre)}</span></button>` } : { vacio: true };
    }
    case 'frase':
      return (w.texto || '').trim()
        ? { html: `<button type="button" class="tile-b" data-accion="frase" data-texto="${escapar(w.texto)}" title="Le dice: ${escapar(w.texto)}">${icono(w.icono || 'mic', 20)}<span>${escapar(w.nombre || w.texto)}</span></button>` }
        : { vacio: true };
    case 'leer-avisos': return { html: `<button type="button" class="tile-b" data-accion="frase" data-texto="leeme las novedades" title="Jarvis lee en voz alta lo pendiente">${icono('novedades', w.alto === 2 ? 28 : 20)}<span>Leer novedades</span></button>` };
    case 'cast': return { html: aparatosDeCast().length ? `<button type="button" class="tile-sel" data-accion="menu-cast" title="Enviar lo que suena a otro aparato" aria-haspopup="menu" aria-expanded="false">${icono('cast', 18)}<span>Enviar a…</span>${icono('chevron', 14)}</button>` : '<div class="tile-info"><small>Cargá tus aparatos en Dispositivos</small></div>' };
    case 'nota-voz': {
      if (notaVoz.activa) return { html: `<button type="button" class="tile-b grabando" data-accion="nota-voz" title="Parar y guardar la nota de voz">${icono('parar', 20)}<span class="nv-tiempo">${tiempoNotaVoz()}</span></button>` };
      return { html: `<button type="button" class="tile-b" data-accion="nota-voz" title="Grabar una nota de voz (se guarda en Notas de voz, junto a tus clips)">${icono('mic', 20)}<span>Nota de voz</span></button>` };
    }
    case 'captura': return { html: `<button type="button" class="tile-b" data-accion="captura" title="Sacar una captura de pantalla (se guarda junto a los clips)">${icono('camara', 20)}<span>Captura</span></button>` };
    case 'clip-guardar': return clipsDisponibles(e) ? { html: `<button type="button" class="tile-b" data-accion="clip-guardar" title="Guardar los últimos segundos">${icono('clip', 20)}<span>Guardar clip</span></button>` } : { vacio: true };
    case 'clip-enviar': return clipsDisponibles(e) ? { html: `<button type="button" class="tile-b" data-accion="clip-enviar" title="Mandar el último clip por WhatsApp">${icono('enviar', 20)}<span>Enviar clip</span></button>` } : { vacio: true };
    case 'clip-grabar': {
      if (!clipsDisponibles(e)) return { vacio: true };
      if ((e.clips || {}).grabando) return { html: `<button type="button" class="tile-b grabando" data-accion="clip-grabar">${icono('parar', 20)}<span>Parar</span></button>` };
      return { html: `<button type="button" class="tile-sel" data-accion="menu-grabar" title="Grabar la pantalla, una ventana o un recuadro" aria-haspopup="menu" aria-expanded="false">${icono('grabar', 18)}<span>Grabar…</span>${icono('chevron', 14)}</button>` };
    }
    case 'grabar-pantalla': case 'grabar-ventana': case 'grabar-recuadro': {
      if (!clipsDisponibles(e)) return { vacio: true };
      const modo = w.tipo.slice(7);
      const nombre = { pantalla: 'Pantalla', ventana: 'Ventana', recuadro: 'Recuadro' }[modo];
      const titulo = { pantalla: 'Grabar la pantalla completa', ventana: 'Grabar una ventana', recuadro: 'Grabar un recuadro de la pantalla' }[modo];
      if ((e.clips || {}).grabando) return { html: `<button type="button" class="tile-b grabando" data-accion="clip-grabar" title="Parar la grabación">${icono('parar', 20)}<span>Parar</span></button>` };
      return { html: `<button type="button" class="tile-b" data-accion="grabar" data-modo="${modo}" title="${titulo}">${icono('grabar', 20)}<span>${nombre}</span></button>` };
    }
    case 'agenda': {
      if (w.alto === 2) {
        const evs = (e.agenda || []).filter((x) => x.fin > Date.now()).slice(0, 3);
        if (!evs.length) return { html: `<button type="button" class="tile-agenda" data-accion="agenda" title="Contame mi agenda">${icono('calendario', 20)}<span><b>Sin eventos</b><small>Nada próximo en tu calendario</small></span></button>` };
        return { html: `<button type="button" class="tile-agenda varios" data-accion="agenda" title="Contame mi agenda">${evs.map((ev) => `<span>${icono('calendario', 14)}<b>${escapar(ev.titulo)}</b><small>${escapar(enCuanto(ev.inicio, ev.fin, ev.todoElDia))}</small></span>`).join('')}</button>` };
      }
      const ev = (e.agenda || []).find((x) => x.fin > Date.now());
      return ev ? { html: `<button type="button" class="tile-agenda" data-accion="agenda" title="Contame mi agenda">${icono('calendario', 20)}<span><b>${escapar(ev.titulo)}</b><small>${escapar(enCuanto(ev.inicio, ev.fin, ev.todoElDia))}</small></span></button>` } : { html: `<button type="button" class="tile-agenda" data-accion="agenda" title="Contame mi agenda">${icono('calendario', 20)}<span><b>Sin eventos</b><small>Nada próximo en tu calendario</small></span></button>` };
    }
    case 'pc': {
      const p = datosWidgets.pc;
      if (!p) return { html: '<div class="tile-info"><small>Midiendo…</small></div>' };
      const barra = (nombre, v, texto) => `<span class="pc-fila"><small>${nombre}</small><i style="--v:${Math.max(2, Math.min(100, v || 0))}%" class="${v >= 90 ? 'alto' : v >= 70 ? 'medio' : ''}"></i><b>${escapar(texto)}</b></span>`;
      const g = p.gpu;
      const filas = [barra('CPU', p.cpu.uso, `${p.cpu.uso}%`), barra('RAM', p.ram.uso, `${p.ram.uso}%`)];
      if (g) filas.push(barra('GPU', g.temp != null ? g.temp : g.uso, g.temp != null ? `${g.temp}°` : `${g.uso}%`));
      if (w.alto === 2) filas.push(`<span class="pc-fila jarvis"><small>Jarvis</small><b>${String(p.jarvis.cpu).replace('.', ',')}% · ${p.jarvis.memMB} MB</b></span>`);
      return { html: `<button type="button" class="tile-pc" data-accion="abrir-ajustes" data-hoja="estado-pc" title="Ver el estado de la PC">${filas.join('')}</button>` };
    }
    case 'nota': return { html: '<form class="tile-nota"><input type="text" placeholder="Anotar algo…" autocomplete="off" spellcheck="false" aria-label="Nota rápida"><button type="submit" title="Guardar la nota">' + icono('agregar', 16) + '</button></form>', fijo: true };
    default: return { vacio: true };
  }
}

// Pone cada widget en su lugar de la grilla (col, fila): lo que no se ve (vacío, apagado) no deja huecos de filas enteras, pero sí
// se respetan los espacios libres al costado dentro de una fila.
function ubicar(el, w) {
  el.style.setProperty('--col', w.col);
  el.style.setProperty('--fila', w.fila);
  el.dataset.col = w.col;
  el.dataset.fila = w.fila;
  el.dataset.alto = w.alto || 1;
}
let compactarPendiente = false;
function compactar() {
  compactarPendiente = false;
  const visibles = [...$('widgets').children].filter((el) => getComputedStyle(el).display !== 'none');
  let r = 1;
  const filas = new Set();
  for (const el of visibles) {
    if (el.dataset.fila) { const f = Number(el.dataset.fila); const a = Number(el.dataset.alto) || 1; for (let i = 0; i < a; i++) filas.add(f + i); } else { el.style.setProperty('--filac', r); r++; }
  }
  const mapa = new Map([...filas].sort((a, b) => a - b).map((f, i) => [f, r + i]));
  for (const el of visibles) if (el.dataset.fila) el.style.setProperty('--filac', mapa.get(Number(el.dataset.fila)));
}
const pedirCompactar = () => { if (compactarPendiente) return; compactarPendiente = true; requestAnimationFrame(compactar); };
new MutationObserver(pedirCompactar).observe($('widgets'), { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-vacio', 'data-fuera', 'data-sintexto'] });

function pintarWidgets(e) {
  const lista = empaquetar(normalizarLista((e.panel || {}).widgets));
  const puesto = (w) => lista.indexOf(w) + 10;
  for (const [tipo, id] of Object.entries(ESTATICOS)) {
    const el = $(id);
    const w = lista.find((x) => x.tipo === tipo);
    if (tipo === 'texto') el.toggleAttribute('data-sintexto', !w);
    else el.toggleAttribute('data-fuera', !w);
    if (w) { el.style.setProperty('--orden', puesto(w)); el.style.setProperty('--tam', w.tam); el.style.setProperty('--alto', w.alto || 1); el.dataset.tam = w.tam; ubicar(el, w); }
    else { delete el.dataset.fila; if (tipo === 'texto') { el.style.setProperty('--orden', -1); el.style.setProperty('--tam', 4); } }
  }
  $('w-rutinas').toggleAttribute('data-vacio', !rutinasTodas.some((r) => r.rapida));
  // Los sueltos: se crean los que faltan, se actualizan y se quitan los que ya no están.
  const vivos = new Set();
  for (const w of lista) {
    if (!SUELTOS.has(w.tipo)) continue;
    vivos.add(w.id);
    let t = tiles.get(w.id);
    if (!t || t.tipo !== w.tipo) {
      if (t) t.el.remove();
      const el = document.createElement('section');
      el.className = 'w';
      el.dataset.w = w.id;
      $('widgets').append(el);
      t = { el, tipo: w.tipo, html: null };
      tiles.set(w.id, t);
    }
    t.el.style.setProperty('--orden', puesto(w));
    t.el.style.setProperty('--tam', w.tam);
    t.el.style.setProperty('--alto', w.alto || 1);
    t.el.dataset.tam = w.tam;
    ubicar(t.el, w);
    t.el.dataset.tipo = w.tipo;
    if (w.color) t.el.style.setProperty('--wc', w.color); else t.el.style.removeProperty('--wc');
    const d = datosDeTile(w, e);
    t.el.toggleAttribute('data-vacio', !!d.vacio);
    if (!d.vacio && (d.fijo ? t.html === null : d.html !== t.html)) { t.el.innerHTML = d.html; t.html = d.fijo ? '' : d.html; }
  }
  for (const [id, t] of tiles) if (!vivos.has(id)) { t.el.remove(); tiles.delete(id); }
  pedirCompactar();
  refrescarDatosDeWidgets(lista);
}
// ---------- Notas de voz ----------
const notaVoz = { grab: new Grabadora(), activa: false, reloj: null };
const tiempoNotaVoz = () => { const s = Math.floor(notaVoz.grab.segundos); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function repintarTilesDeNotaVoz() {
  if (estado && estado.panel) pintarWidgets(estado);
}
async function empezarNotaVoz() {
  if (notaVoz.activa) return { ya: true };
  await notaVoz.grab.iniciar({ microfono: (config.voz || {}).microfono || '' });
  notaVoz.activa = true;
  voz.campanita();
  clearInterval(notaVoz.reloj);
  notaVoz.reloj = setInterval(() => {
    for (const el of document.querySelectorAll('.nv-tiempo')) el.textContent = tiempoNotaVoz();
    if (notaVoz.grab.segundos > 30 * 60) terminarNotaVoz().catch(() => {}); // tope de media hora por nota
  }, 250);
  repintarTilesDeNotaVoz();
  mostrarBurbuja('Grabando la nota de voz… tocá el botón (o decí "parar la nota de voz") para guardarla.');
  return { grabando: true };
}
async function terminarNotaVoz({ recorte = 0 } = {}) {
  if (!notaVoz.activa) return { vacio: true };
  notaVoz.activa = false;
  clearInterval(notaVoz.reloj);
  const r = await notaVoz.grab.detener();
  repintarTilesDeNotaVoz();
  voz.campanita(true);
  const segundos = Math.max(0, r.segundos - recorte);
  if (segundos < 0.8 || r.pico < 0.01) { mostrarBurbuja('No se grabó nada (o no se oyó), así que no guardé la nota.'); return { vacio: true }; }
  const wav = recorte ? recortarFinal(r.wav, recorte) : r.wav;
  const g = await pedir('notasvoz:guardar', wav, segundos);
  mostrarBurbuja(`Guardé la nota de voz (${Math.round(segundos)} s): ${g.nombre}`);
  return g;
}
async function alternarNotaVoz(boton) {
  boton.classList.add('ocupado');
  try { if (notaVoz.activa) await terminarNotaVoz(); else await empezarNotaVoz(); }
  catch (e) { notaVoz.activa = false; clearInterval(notaVoz.reloj); await notaVoz.grab.cancelar().catch(() => {}); repintarTilesDeNotaVoz(); mostrarBurbuja(e.message); }
  boton.classList.remove('ocupado');
}

async function accionClip(paso, boton) {
  boton.classList.add('ocupado');
  try {
    const r = await pedir('clips:accion', paso);
    if (r) mostrarBurbuja(String(r));
  } catch (e) { mostrarBurbuja(e.message); }
  boton.classList.remove('ocupado');
}
$('clip-guardar').addEventListener('click', (e) => accionClip({ accion: 'guardar' }, e.currentTarget));
$('clip-grabar').addEventListener('click', (e) => accionClip({ accion: (estado.clips || {}).grabando ? 'parar' : 'grabar' }, e.currentTarget));
$('clip-pausa').addEventListener('click', (e) => accionClip({ accion: (estado.clips || {}).pausado ? 'seguir' : 'pausar' }, e.currentTarget));
function enviarUltimoClip(boton) {
  // Con un contacto por defecto (Ajustes → Clips) se manda directo; si no, se deja escrito para completar el nombre.
  if ((config.clips || {}).enviarA) { accionClip({ accion: 'enviar' }, boton); return; }
  campoTexto.value = 'enviá el último clip a ';
  campoTexto.focus();
}
$('widgets').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const a = b.dataset.accion;
  if (a === 'rutina') { b.classList.add('ocupado'); try { await pedir('rutina:ejecutar', b.dataset.id); } catch { /* el error ya se muestra en el notch */ } b.classList.remove('ocupado'); }
  else if (a === 'frase') jarvis.pedir('voz:texto', b.dataset.texto);
  else if (a === 'agenda') jarvis.pedir('voz:texto', '¿Qué tengo hoy en la agenda?');
  else if (a === 'nota-voz') alternarNotaVoz(b);
  else if (a === 'captura') accionClip({ accion: 'captura' }, b);
  else if (a === 'clip-guardar') accionClip({ accion: 'guardar' }, b);
  else if (a === 'clip-grabar') accionClip({ accion: (estado.clips || {}).grabando ? 'parar' : 'grabar' }, b);
  else if (a === 'grabar') accionClip({ accion: 'grabar', modo: b.dataset.modo }, b);
  else if (a === 'menu-cast') menuDeCast(b);
  else if (a === 'menu-grabar') menuDeGrabar(b);
  else if (a === 'clip-enviar') enviarUltimoClip(b);
  else if (a === 'abrir') {
    const destino = b.dataset.destino;
    b.classList.add('ocupado');
    try {
      if (/^https?:\/\//i.test(destino)) await pedir('abrir:enlace', destino);
      else if (/^[\w-]+\.[a-z]{2,}([/?#].*)?$/i.test(destino)) await pedir('abrir:enlace', `https://${destino}`);
      else { const r = await pedir('paso:probar', { tipo: 'abrir', programa: destino }); if (r) mostrarBurbuja(String(r)); }
    } catch (er) { mostrarBurbuja(er.message); }
    b.classList.remove('ocupado');
  } else if (a === 'modo') pedir('modo:cambiar', b.dataset.modo).catch((er) => mostrarBurbuja(er.message));
  else if (a === 'ver-notas') pedir('ajustes:abrir', 'notas');
  else if (a === 'abrir-ajustes') pedir('ajustes:abrir', b.dataset.hoja);
  else if (a === 'mudo') {
    datosWidgets.mudo = !datosWidgets.mudo;
    try { await pedir('widget:silenciar', datosWidgets.mudo); } catch (er) { datosWidgets.mudo = !datosWidgets.mudo; mostrarBurbuja(er.message); }
    b.innerHTML = icono(datosWidgets.mudo ? 'silencio' : 'parlante', 18); b.setAttribute('aria-pressed', String(datosWidgets.mudo));
  }
});
// El deslizador de volumen: mientras se arrastra solo se ve el número; al soltar se aplica (PowerShell tarda unos ms).
$('widgets').addEventListener('input', (e) => {
  const r = e.target.closest('input[data-accion="volumen"]');
  if (r) r.nextElementSibling.textContent = r.value;
});
$('widgets').addEventListener('change', async (e) => {
  const r = e.target.closest('input[data-accion="volumen"]');
  if (!r) return;
  datosWidgets.volumen = Number(r.value);
  try { await pedir('widget:volumen', Number(r.value)); } catch (er) { mostrarBurbuja(er.message); }
});
// Nota rápida: se guarda en Notas (ventana de Jarvis → Notas).
$('widgets').addEventListener('submit', async (e) => {
  const f = e.target.closest('.tile-nota');
  if (!f) return;
  e.preventDefault();
  const campo = f.querySelector('input');
  const texto = campo.value.trim();
  if (!texto) return;
  campo.value = '';
  try { await pedir('notas:crear', { texto }); mostrarBurbuja(`Anotado: ${texto}`); } catch (er) { mostrarBurbuja(er.message); }
});
$('clip-enviar').addEventListener('click', (e) => enviarUltimoClip(e.currentTarget));

// ---------- Estado ----------
// ---------- Acceso desde el celular: si alguien ve la pantalla o la cámara, maneja la PC o está con los archivos ----------
// No importa estar conectado: solo lo que te ve o toca tus cosas. Los ojos cambian de color y queda un cartel fijo.
const ACCESO = [
  ['camara', 'Cámara activa', 'Viendo la cámara', 'camara', 'ambar'],
  ['pantalla', 'Remoto activo', 'Viendo la pantalla', 'tele', 'ambar'],
  ['control', 'Remoto activo', 'Manejando el mouse y el teclado', 'pc', 'ambar'],
  ['archivos', 'Remoto activo', 'Con los archivos', 'carpeta', 'ambar'],
];
function pintarAcceso(e) {
  const a = e.acceso || {};
  const hay = ACCESO.filter(([k]) => (a[k] || []).length);
  const principal = hay[0];
  notch.toggleAttribute('data-vigilado', !!principal);
  notch.dataset.vigia = principal ? principal[4] : '';
  $('acceso').hidden = !principal;
  $('w-acceso').hidden = !principal;
  if (!principal) { pintarAcceso.ultimo = ''; return; }
  const quienes = (k) => (a[k] || []).join(', ');
  const cortos = [...new Set(hay.map((x) => x[1]))];
  $('acceso-texto').textContent = cortos.length > 1 ? `${cortos[0]} +${cortos.length - 1}` : cortos[0];
  $('acceso').title = hay.map(([k, , largo]) => `${largo}: ${quienes(k)}`).join('\n');
  $('acceso-lista').innerHTML = hay.map(([k, , largo, ic, tono]) => `<div class="acc-fila ${tono}">${icono(ic, 16)}<span><b>${escapar(largo)}</b><small>${escapar(quienes(k))}</small></span></div>`).join('');
  $('acceso-cortar').hidden = !hay.some(([k]) => k === 'pantalla' || k === 'camara');
  const anuncio = hay.map(([k, , largo]) => `${largo} (${quienes(k)})`).join('. ');
  if (anuncio !== pintarAcceso.ultimo) $('anuncio').textContent = anuncio;
  pintarAcceso.ultimo = anuncio;
}
$('acceso-cortar').addEventListener('click', async (ev) => { ev.stopPropagation(); try { await jarvis.pedir('acceso:cortar'); } catch {} });

jarvis.escuchar('estado', (nuevo) => {
  const anterior = estado;
  estado = nuevo;
  pintarAcceso(nuevo);
  pintarConexion(nuevo.conexion);
  if (typeof nuevo.pastillaX === 'number') pastillaX = nuevo.pastillaX;
  document.body.className = `${nuevo.orientacion}${nuevo.pegado ? ' pegado' : ''}`;
  notch.dataset.fase = nuevo.fase;
  notch.dataset.modo = nuevo.modo;
  notch.classList.toggle('activo', nuevo.fase !== 'reposo');
  notch.classList.toggle('sin-clave', !nuevo.listo);
  notch.classList.toggle('sin-voz', !(modoDe(nuevo.modo)?.habla ?? true));
  // El ancho de #notch puede haber cambiado de golpe (entrar/salir de "activo"): recalculamos el
  // margin-left ahora, en el mismo tick, para que viaje junto con la transición de ancho.
  ubicarTodoHorizontal();
  pintarAviso(nuevo);
  pintarNovedades(nuevo);
  pintarMusica(nuevo);
  pintarClips(nuevo);
  pintarWidgets(nuevo);
  if (nuevo.fase !== anterior.fase) ojos.style.removeProperty('--abre');
  pintarBarraDeModos();
  voz.fijarConversacion(!!nuevo.sesion);
  if (nuevo.sesion && !anterior.sesion) {
    charla.vos = ''; charla.jarvis = ''; charla.ultimo = '';
    mostrarBurbuja('');
    if (modoDe(nuevo.modo)?.habla ?? true) voz.campanita();
  }
  if (nuevo.fase === 'error' && nuevo.texto) mostrarBurbuja(nuevo.texto);
  if (nuevo.fase === 'alerta' && nuevo.texto) mostrarBurbuja(`Recordatorio: ${nuevo.texto}`);
  pintarLeyenda();
});

// ---------- Apariencia y configuración ----------
function esClaro(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
}
let vozIniciada = false;
jarvis.escuchar('config', (nueva) => {
  usarNombre(nueva && nueva.nombre);
  config = nueva;
  const raiz = document.documentElement;
  raiz.style.setProperty('--ojo', nueva.apariencia.colorOjos || '#8BE9FF');
  raiz.style.setProperty('--fondo', nueva.apariencia.colorFondo || '#000000');
  const opacidad = (v) => Math.max(0.1, Math.min(1, Number(v)));
  raiz.style.setProperty('--fondo-opacidad', opacidad(nueva.apariencia.opacidadFondo ?? 1));
  raiz.style.setProperty('--ojos-opacidad', opacidad(nueva.apariencia.opacidadOjos ?? 1));
  raiz.style.setProperty('--notch-opacidad', opacidad(nueva.apariencia.opacidadNotch ?? 1));
  raiz.classList.toggle('claro', esClaro(nueva.apariencia.colorFondo));
  escena.style.zoom = Math.max(0.7, Math.min(1.6, Number(nueva.apariencia.escala) || 1));
  requestAnimationFrame(ubicarTodoHorizontal); // el zoom puede cambiar el ancho disponible
  if (!respondiendo) campoTexto.placeholder = `Escribile o hablale a ${nueva.nombre || 'Jarvis'}…`;
  if (!vozIniciada) { vozIniciada = true; voz.iniciar(nueva.voz); } else voz.reconfigurar(nueva.voz);
  voz.fijarVolumen(nueva.volumen ?? 1);
  pintarBarraDeModos();
  pintarCastDeMusica();
  if (estado && estado.panel) pintarWidgets(estado);
  notch.classList.toggle('sin-voz', !(modoDe(estado.modo)?.habla ?? true));
});

// El ícono de "sin conexión" junto a los ojos: sin internet o modo manual (ámbar); con internet pero un servicio caído (naranja, con el nombre al pasar el mouse).
function pintarConexion(c) {
  const sin = !!(c && c.sin);
  const caidos = c ? (c.problemas || []).filter((x) => x.id !== 'internet') : [];
  notch.classList.toggle('sin-red', sin);
  notch.classList.toggle('servicio-caido', !sin && caidos.length > 0);
  const el = $('sinred');
  if (sin) {
    el.title = `${c.manual ? 'Modo sin conexión (a mano)' : 'Sin conexión a internet'} · siguen andando los clips, los recordatorios y lo de esta PC${c.enCola ? ` · ${c.enCola} mensaje${c.enCola === 1 ? '' : 's'} en cola` : ''}`;
  } else if (caidos.length) {
    el.title = caidos.map((x) => `${x.nombre}: ${x.estado === 'cupo' ? 'sin cupo gratuito' : 'no responde'}`).join(' · ');
  } else el.title = '';
}

// La barra de modos: los que se sacaron de ella (Ajustes → Modos) no se muestran, salvo el que está puesto ahora.
function pintarBarraDeModos() {
  const enBarra = (config.modos || []).filter((m) => m.enBarra !== false || m.id === estado.modo);
  $('pie').hidden = enBarra.length < 2;
  $('modos').innerHTML = enBarra
    .map((m) => `<button type="button" data-modo="${escapar(m.id)}" class="${m.id === estado.modo ? 'elegido' : ''}" title="Modo ${escapar(m.nombre)}" aria-pressed="${m.id === estado.modo}">${escapar(m.nombre)}</button>`)
    .join('');
}

// ---------- Acciones rápidas ----------
jarvis.escuchar('rutinas', (rutinas) => {
  rutinasTodas = rutinas;
  const rapidas = rutinas.filter((r) => r.rapida).slice(0, 9);
  $('acciones').innerHTML = rapidas.map((r) => `<button type="button" data-id="${escapar(r.id)}">${icono(r.icono, 20)}<span>${escapar(r.nombre)}</span></button>`).join('');
  pintarWidgets(estado);
});
$('acciones').addEventListener('click', async (e) => {
  const boton = e.target.closest('button[data-id]');
  if (!boton) return;
  boton.classList.add('ocupado');
  try { await pedir('rutina:ejecutar', boton.dataset.id); } catch { /* el error ya se muestra en el notch */ }
  boton.classList.remove('ocupado');
});

// ---------- Controles del panel ----------
$('entrada').addEventListener('submit', (e) => {
  e.preventDefault();
  const texto = campoTexto.value.trim();
  if (!texto) return;
  if (respondiendo) { enviarRespuesta(texto); return; } // es la respuesta a una novedad, no un pedido
  campoTexto.value = '';
  jarvis.pedir('voz:texto', texto);
});
$('mic').addEventListener('click', () => jarvis.enviar('voz:alternar'));
$('modos').addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-modo]');
  if (boton) pedir('modo:cambiar', boton.dataset.modo);
});
$('ajustes').addEventListener('click', () => pedir('ajustes:abrir'));
// Controles de música. El del medio alterna: con música sonando pausa, pausada sigue, y sin nada
// puesto arranca la música de siempre (tu Supermix).
const controlarMusica = (accion) => pedir('musica:controlar', accion).catch((e) => mostrarBurbuja(e.message));
$('musica-anterior').addEventListener('click', () => controlarMusica('anterior'));
$('musica-play').addEventListener('click', () => controlarMusica('alternar'));
$('musica-siguiente').addEventListener('click', () => controlarMusica('siguiente'));
$('configurar').addEventListener('click', () => pedir('modelos:bajar', 'esenciales'));

// [E32] Botones de solo ícono: el "title" pasa a ser también su nombre accesible.
function etiquetarIconos(raiz) { for (const b of raiz.querySelectorAll('button[title]:not([aria-label])')) if (!b.textContent.trim()) b.setAttribute('aria-label', b.title); }
new MutationObserver(() => etiquetarIconos(document.body)).observe(document.body, { subtree: true, childList: true });
etiquetarIconos(document.body);
