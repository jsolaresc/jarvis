// Comandos directos: los pedidos más comunes se entienden acá mismo, con reglas, sin ningún modelo
// de inteligencia artificial — instantáneo, sin internet y sin cuota. Lo que no encaja en ninguna
// regla (pedidos libres, redactar un mensaje, preguntas) sigue de largo y lo resuelve un modelo.
const { leerConfig, leerRutinas, normalizar, buscarPorNombre } = require('./config');
const streaming = require('./streaming');
const whatsapp = require('./whatsapp');
const nombreDelAsistente = require('./nombre');

// ---- Números dichos en palabras ("treinta y cinco") ----
const UNIDADES = { cero: 0, un: 1, uno: 1, una: 1, veintiuna: 21, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const NUMERO = '(\\d{1,3}|[a-z]+(?: y [a-z]+)?)';
const NUMERO_SIMPLE = '(\\d{1,2}|[a-z]+)'; // para las horas: "ocho", "veintiuna", "21"
const fechas = require('./fechas');
function numeroDe(texto) {
  const t = normalizar(texto);
  if (/^\d+$/.test(t)) return Number(t);
  if (t === 'cien') return 100;
  if (t in UNIDADES) return UNIDADES[t];
  const m = /^([a-z]+)(?: y ([a-z]+))?$/.exec(t);
  if (m && m[1] in DECENAS && (!m[2] || (m[2] in UNIDADES && UNIDADES[m[2]] < 10))) return DECENAS[m[1]] + (m[2] ? UNIDADES[m[2]] : 0);
  return null;
}

// ---- Parecido entre dos textos (0 a 1), para perdonar errores chicos al escuchar ----
function distancia(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temporal = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = temporal;
    }
  }
  return fila[b.length];
}
const parecido = (a, b) => (a && b ? 1 - distancia(a, b) / Math.max(a.length, b.length) : 0);

// El elemento de la lista cuyo nombre es (casi) lo que se dijo. Si hay dos candidatos parejos, ninguno.
function elMasParecido(lista, dicho, minimo = 0.8) {
  const d = normalizar(dicho);
  if (d.length < 4) return lista.find((x) => normalizar(x.nombre) === d) || null;
  const puntajes = lista.map((x) => ({ x, p: parecido(normalizar(x.nombre), d) })).sort((a, b) => b.p - a.p);
  if (!puntajes.length || puntajes[0].p < minimo) return null;
  if (puntajes[1] && puntajes[0].p - puntajes[1].p < 0.08) return null;
  return puntajes[0].x;
}

// Saca el "hey jarvis" que a veces queda pegado al principio, y las cortesías.
function limpiar(texto) {
  return nombreDelAsistente.quitarNombre(normalizar(texto))
    .replace(/\b(por favor|porfa|porfi)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
    // Las muletillas de pedir ("¿me podés mandar…?", "quiero que mandes…", "bueno, ahora poné…") no cambian el pedido.
    .replace(/^(?:(?:me |nos )?(?:podes|podrias|puedes|podria|quiero que|necesito que|te pido que|haceme el favor de|hace el favor de|bueno|entonces|ahora|a ver|mira|escucha|ey|che|y) )+/, '')
    .replace(/^(?:vos )?(?:me )?(?:podes|podrias) /, '').trim();
}

// ---- La palabra clave, dicha con cualquier acento ----
// Cuando Jarvis no está en una conversación, lo que se oye se pasa a texto y se mira si empieza (o
// termina) con su nombre. El modelo de escucha lo escribe de varias maneras según cómo suene
// ("Yarvis", "Harvis", y a veces cosas más lejanas como "Harris" o "Tardis"), así que hay tres niveles:
//   - las formas seguras de abajo, y las que el usuario le enseñó en Ajustes (extras): alcanzan solas;
//   - una forma "floja" (algo que suena parecido): solo vale si además el detector clásico de
//     "Hey Jarvis" notó algo en ese momento, aunque no haya llegado a su umbral (ver cerebro.js).
const COMO_SUENA = ['jarvis', 'yarvis', 'yarbis', 'jarbis']; // estas, y lo que esté a una letra de distancia
const TAMBIEN = new Set(['charvis', 'charbis', 'harvis', 'harbis', 'llarvis', 'llarbis', 'garvis', 'farvis', 'giarvis', 'diarvis', 'yarviz', 'jarviz', 'yarvi', 'jarvi', 'yarbi', 'jarbi', 'yarbiz', 'yervis', 'jervis', 'shervis', 'sharvis', 'djarvis', 'dyarvis', 'yardis', 'jardis', 'javis', 'yavis', 'yarbees', 'jarbees', 'yarvees', 'jarvees', 'yarbes', 'jarris', 'yarris']);
const SALUDOS = new Set(['hey', 'ey', 'ei', 'hei', 'jey', 'jei', 'oye', 'che', 'hola', 'ok', 'okey', 'eh', 'e', 'a', 'ver', 'bueno', 'dale', 'hay', 'ay', 'he', 'y', 'o', 'hi']);
const FLOJO = /^(?:de)?(?:j|y|ch|h|ll|g|d|t|f|p|sh|dj|z)?a(?:rr|dd|rd|rv|rb|dv|db|r|d|l|v|b)(?:i|ie|ee)(?:s|z)?$/;
function esSuNombre(palabra, { extras = [], flojo = false } = {}) {
  const propias = nombreDelAsistente.formas(); // null si se llama Jarvis
  if (propias) {
    // Un nombre elegido por el usuario: sus formas parecidas (ver nombre.js), lo que le enseñaste, y a una letra de distancia si es largo.
    const base = propias[0];
    if (!palabra || palabra.length < Math.min(3, base.length) || palabra.length > Math.max(9, base.length + 3)) return false;
    if (propias.includes(palabra) || extras.includes(palabra)) return true;
    if (base.length >= 6 && [base, ...extras.filter((e) => e.length >= 6)].some((v) => distancia(palabra, v) <= 1)) return true;
    return flojo && base.length >= 7 && distancia(palabra, base) <= 2;
  }
  if (!palabra || palabra.length < 4 || palabra.length > 9) return false;
  if (TAMBIEN.has(palabra) || extras.includes(palabra)) return true;
  if (palabra.length >= 6 && [...COMO_SUENA, ...extras.filter((e) => e.length >= 6)].some((v) => distancia(palabra, v) <= 1)) return true;
  return flojo && FLOJO.test(palabra);
}
// Con música sonando, lo que se oye trae la letra de la canción adelante y el "Jarvis" aparece a mitad de la frase. Ahí solo
// vale si lo precede un saludo claro ("hey", "che", "oye", "hola", "ok") y es una forma segura de su nombre: así una letra no lo despierta.
const SALUDOS_FUERTES = new Set(['hey', 'ey', 'jey', 'oye', 'che', 'hola', 'ok', 'okey']);
function despertarEnMedio(dicho, opciones = {}) {
  const originales = String(dicho || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const planas = originales.map((p) => normalizar(p));
  if (planas.length < 2 || planas.length > 60) return null;
  const extras = (opciones.extras || []).map((e) => normalizar(e).replace(/ /g, '')).filter(Boolean);
  for (let i = 1; i < planas.length; i++) {
    if (SALUDOS_FUERTES.has(planas[i - 1]) && esSuNombre(planas[i], { extras })) return { resto: originales.slice(i + 1).join(' '), como: planas[i] };
  }
  return null;
}
// El oído escribe el nombre como suena ("Harvis", "Yarvis"): dentro de un pedido ("decile que dice Jarvis que sí") tiene que
// quedar bien escrito. Solo se corrigen las formas seguras (las de arriba y las que le enseñaste), nunca las "flojas".
function corregirNombre(texto, extras = []) {
  const nombre = nombreDelAsistente.actual();
  const prop = (extras || []).map((e) => normalizar(e).replace(/ /g, '')).filter(Boolean);
  return String(texto || '').replace(/\p{L}+/gu, (palabra) => (esSuNombre(normalizar(palabra), { extras: prop }) ? nombre : palabra));
}
// Devuelve { resto, como } si la frase llama a Jarvis ("che Jarvis, poné música" -> resto "poné música";
// "Jarvis" a secas -> resto ""), o null si no lo nombra. extras: formas enseñadas por el usuario.
function despertar(dicho, opciones = {}) {
  const originales = String(dicho || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const planas = originales.map((p) => normalizar(p));
  if (!planas.length || planas.length > 40) return null;
  const extras = (opciones.extras || []).map((e) => normalizar(e).replace(/ /g, '')).filter(Boolean);
  const seguro = (palabra) => esSuNombre(palabra, { extras });
  const es = (palabra) => esSuNombre(palabra, { extras, flojo: !!opciones.flojo });
  // "cheyarvis": a veces el saludo llega pegado al nombre.
  const sinSaludo = (palabra) => { const m = /^(che|hey|jey|ey|oye)(.{4,})$/.exec(palabra); return m ? m[2] : ''; };
  // Un nombre corto (menos de 5 letras, como "Max" o "Luz") se confunde fácil con palabras comunes: con él hace falta un
  // saludo adelante ("che Max", "hey Luz"). Los nombres de varias palabras ("Señor Robot") se buscan juntando palabras.
  const propio = !!nombreDelAsistente.formas();
  const corto = propio && nombreDelAsistente.plano(nombreDelAsistente.actual()).length < 5;
  const maxAncho = propio ? nombreDelAsistente.palabras() + 1 : 2;
  // Al principio: solo puede haber un saludo adelante ("hey", "che", "a ver").
  for (let i = 0; i < Math.min(4, planas.length); i++) {
    const conSaludo = i > 0;
    let ancho = es(planas[i]) || seguro(sinSaludo(planas[i])) ? 1 : 0;
    for (let w = 2; !ancho && w <= maxAncho && i + w <= planas.length; w++) {
      if (!propio && planas[i].length > 4) break; // "yar vis" llega partido
      const junta = planas.slice(i, i + w).join('');
      if (es(junta)) ancho = w;
    }
    if (ancho && (!corto || conSaludo || seguro(sinSaludo(planas[i])))) return { resto: originales.slice(i + ancho).join(' '), como: planas.slice(i, i + ancho).join('') };
    // Una sola palabrita mal oída adelante ("key Jarvis", "pues Jarvis") se perdona si el nombre es claro.
    if (i === 0 && !propio && planas[0].length <= 4 && planas[1] && seguro(planas[1])) return { resto: originales.slice(2).join(' '), como: planas[1] };
    if (!SALUDOS.has(planas[i])) break;
  }
  // Solo vale al principio de la frase: nombrarlo al final o a mitad de una charla ("le puedo decir Che Jarvis...",
  // hablando con otras personas) no lo despierta; así no toma por pedidos cosas que no eran para él.
  return null;
}
// De lo que se oyó cuando el usuario dijo solo "Jarvis" (para enseñarle cómo suena): la palabra a
// recordar, o null si ya la reconoce o si no fue una sola palabra clara.
function formaNueva(dicho, extras = []) {
  if (despertar(dicho, { extras })) return null;
  const palabras = normalizar(dicho).split(' ').filter((p) => p && !SALUDOS.has(p));
  const forma = palabras.join('');
  return palabras.length >= 1 && palabras.length <= 2 && forma.length >= 4 && forma.length <= 9 ? forma : null;
}

const VERBO_ACTIVAR = '(?:activa|activar|activame|ejecuta|ejecutar|corre|correr|pone|pon|poneme|inicia|iniciar|arranca|arrancar|lanza|lanzar|hace|dale a|dale con)';

function hora(h, m) { return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

// Las reglas trabajan sobre el texto "aplanado" (sin acentos ni mayúsculas). Para lo que después se
// lee o se dice (el texto de un recordatorio, qué canción buscar) conviene recuperar las palabras
// tal como se dijeron: se busca el mismo tramo, palabra por palabra, en el texto original.
function comoSeDijo(dicho, tramo) {
  const planas = normalizar(dicho).split(' ');
  const originales = String(dicho).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const buscadas = tramo.split(' ').filter(Boolean);
  if (planas.length !== originales.length || !buscadas.length) return tramo;
  for (let i = 0; i + buscadas.length <= planas.length; i++) {
    if (buscadas.every((palabra, j) => planas[i + j] === palabra)) return originales.slice(i, i + buscadas.length).join(' ');
  }
  return tramo;
}

function recordatorio(resto, dicho) {
  // "en diez minutos sacar la pizza" / "sacar la pizza en diez minutos" / "en media hora ..." / "a las 8 y media ..."
  const quitarNexo = (t) => {
    const limpio = t.replace(/^(que|de|para|que tengo que|tengo que) /, '').trim();
    const original = limpio.split(/ (?=\S)/).length ? comoSeDijo(dicho, limpio) : limpio;
    return original.charAt(0).toUpperCase() + original.slice(1);
  };
  let m = new RegExp(`^(.*?) ?\\ben ${NUMERO} (minutos?|horas?)\\b ?(.*)$`).exec(resto);
  if (m) {
    const n = numeroDe(m[2]);
    const texto = quitarNexo(`${m[1]} ${m[4]}`.trim());
    if (n && texto) return { tipo: 'recordatorio', texto, minutos: m[3].startsWith('hora') ? n * 60 : n };
  }
  m = /^(.*?) ?\ben (media hora|una hora y media|un cuarto de hora)\b ?(.*)$/.exec(resto);
  if (m) {
    const texto = quitarNexo(`${m[1]} ${m[3]}`.trim());
    const minutos = { 'media hora': 30, 'una hora y media': 90, 'un cuarto de hora': 15 }[m[2]];
    if (texto) return { tipo: 'recordatorio', texto, minutos };
  }
  m = new RegExp(`^(.*?) ?\\ba las? ${NUMERO_SIMPLE}(?: (?:y|con) (media|cuarto|[a-z]+(?: y [a-z]+)?|\\d{1,2})| (\\d{2}))?(?: (?:de la|del|a la|por la) (manana|tarde|noche|mediodia))?\\b ?(.*)$`).exec(resto);
  if (m) {
    let h = numeroDe(m[2]);
    const minutos = m[4] ? Number(m[4]) : m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : m[3] ? numeroDe(m[3]) : 0;
    const texto = quitarNexo(`${m[1]} ${m[6]}`.trim());
    if (h === null || minutos === null || h > 23 || minutos > 59 || !texto) return null;
    if (/tarde|noche/.test(m[5] || '') && h < 12) h += 12;
    // "a las 5" sin aclarar: la próxima vez que el reloj marque las 5 (hoy a la tarde si ya pasó la mañana).
    if (!m[5] && h >= 1 && h < 12) {
      const ahora = new Date();
      const pasada = (hh) => hh * 60 + minutos <= ahora.getHours() * 60 + ahora.getMinutes();
      if (pasada(h) && !pasada(h + 12)) h += 12;
    }
    return { tipo: 'recordatorio', texto, hora: hora(h, minutos) };
  }
  return null;
}

// ---- Rutinas dichas de otra manera ----
// Cada rutina se activa con su nombre y con las otras frases ("activadores") que se le cargaron. Además, al
// comparar se igualan los verbos de la misma familia: "avisá", "avisale", "decile", "contale" son lo mismo.
const FAMILIA = {};
for (const [raiz, formas] of Object.entries({
  avisar: 'avisa avisale avisarle avisales avisar decile deci decirle decir comunicale comunicarle contale contarle informale informarle hacele-saber',
  mandar: 'manda mandale mandarle mandar envia enviale enviarle enviar pasale pasarle compartile compartir',
  activar: 'activa activar activame inicia iniciar lanza lanzar ejecuta ejecutar corre correr pone poner ponete pon hace hacer prepara preparame',
  abrir: 'abri abre abrir abrime',
  cerrar: 'cerra cerrar cerrame',
  apagar: 'apaga apagar apagame',
  prender: 'prende prender prendeme enciende encender',
})) for (const f of formas.split(' ')) FAMILIA[f] = raiz;
const VACIAS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'le', 'les', 'lo', 'al', 'a', 'de', 'del', 'me', 'mi', 'mis', 'por', 'favor', 'rutina', 'que', 'para', 'se', 'te']);
const fichas = (texto) => normalizar(texto).split(/\s+/).filter(Boolean).map((w) => FAMILIA[w] || w).filter((w) => !VACIAS.has(w));
function parecidoDeFrases(a, b) {
  const A = fichas(a); const B = fichas(b);
  if (!A.length || !B.length) return 0;
  let iguales = 0;
  const libres = [...B];
  for (const w of A) {
    const i = libres.findIndex((x) => x === w || (w.length >= 5 && x.length >= 5 && parecido(w, x) >= 0.8));
    if (i >= 0) { iguales++; libres.splice(i, 1); }
  }
  return (2 * iguales) / (A.length + B.length);
}
// La rutina que más se parece a lo dicho: { rutina, seguro } o null. Con dos candidatas parejas, ninguna.
function rutinaParecida(t, rutinas) {
  if (fichas(t).length < 2) return null; // una sola palabra suelta es demasiado poco para adivinar
  const puntajes = rutinas.map((r) => ({ r, p: Math.max(...[r.nombre, ...(Array.isArray(r.activadores) ? r.activadores : [])].filter(Boolean).map((x) => parecidoDeFrases(t, x))) }))
    .sort((a, b) => b.p - a.p);
  const mejor = puntajes[0];
  if (!mejor || mejor.p < 0.7) return null;
  if (puntajes[1] && mejor.p - puntajes[1].p < 0.15) return null;
  return { rutina: mejor.r, seguro: mejor.p >= 0.99 };
}


// ---- "Cancelar" y activaciones por error ----
// Después de despertar sin querer, lo que se dice ("cancelar", "no era nada", "me equivoqué", "perdón") tiene que cerrar
// la conversación aunque el oído lo escriba raro ("Cancelar a Harvis."). Se miran las palabras sueltas: si no queda
// nada fuera del vocabulario de cancelar (más el nombre, escrito como sea), es una cancelación. "Cancelar la rutina X"
// tiene palabras de más y sigue su camino normal.
const CANCELA_CLAVE = new Set(['cancelar', 'cancela', 'cancelalo', 'cancelala', 'cancelo', 'cancelado', 'cancelen', 'olvidalo', 'olvidate', 'olvida', 'dejalo', 'deja', 'dejalo', 'nada', 'equivoque', 'equivocaste', 'equivocado', 'error', 'perdon', 'perdona', 'disculpa', 'disculpame', 'listo', 'chau', 'chao', 'adios', 'gracias', 'importa', 'alarma', 'falsa', 'llame', 'llamaba', 'hablaba', 'hablando', 'querer', 'apagate', 'silencio', 'callate', 'nadie', 'nono', 'basta', 'ya', 'sali', 'salir', 'cerra', 'cerrar', 'ignora', 'ignorame', 'activaste', 'activo', 'activado', 'activaron']);
const CANCELA_RELLENO = new Set(['a', 'de', 'el', 'la', 'lo', 'no', 'si', 'por', 'favor', 'pero', 'eh', 'em', 'um', 'mm', 'ah', 'oh', 'che', 'hey', 'ey', 'ok', 'okey', 'bueno', 'dale', 'esta', 'eso', 'es', 'era', 'fue', 'sin', 'me', 'te', 'se', 'mas', 'muchas', 'mucha', 'tanto', 'todo', 'con', 'vos', 'para', 'en', 'un', 'una', 'yo', 'solo', 'solamente', 'ahora', 'mejor', 'hacer', 'hagas', 'hagas', 'quiero', 'queria', 'puse', 'dije', 'di', 'que', 'tu', 'ti', 'mi', 'sorry', 'perdoname', 'ha', 'han', 'hay', 'a', 'y', 'ni', 'nunca', 'mal', 'loco']);
function esNombre(palabra) { return esSuNombre(palabra, { flojo: true }) || /^(?:j|y|ch|h|ll|g)ar[bv]is?$/.test(palabra) || /^harvey$/.test(palabra); }
function esCancelacion(t) {
  const palabras = String(t).split(' ').filter(Boolean);
  if (!palabras.length || palabras.length > 9) return false;
  if (/^(ya esta|eso es todo|eso era todo|ya esta gracias|eso es todo gracias)$/.test(palabras.join(' '))) return true;
  let ancla = false;
  for (const p of palabras) {
    if (CANCELA_CLAVE.has(p)) { ancla = true; continue; }
    if (CANCELA_RELLENO.has(p) || esNombre(p)) continue;
    return false;
  }
  // "ya" o "listo" solas son del vocabulario pero no cancelan: hace falta una clave de verdad.
  const fuerte = palabras.some((p) => CANCELA_CLAVE.has(p) && !['ya', 'activo', 'activado', 'activaste', 'activaron', 'sali', 'salir', 'cerra', 'cerrar'].includes(p));
  const soloNo = palabras.length === 1 && palabras[0] === 'no';
  const parar = /^(para|pausa|stop|basta)$/.test(palabras.join(' ')); // eso es de la música, no de cancelar
  return !parar && (ancla && fuerte || soloNo);
}
// Inglés suelto: todas las palabras son de uso común en inglés y ninguna es del castellano.
const INGLES = new Set(['see', 'you', 'can', 'have', 'the', 'is', 'it', 'i', 'a', 'an', 'and', 'to', 'of', 'in', 'on', 'that', 'this', 'what', 'was', 'are', 'be', 'do', 'did', 'not', 'yes', 'yeah', 'oh', 'okay', 'well', 'so', 'just', 'like', 'we', 'he', 'she', 'they', 'me', 'my', 'your', 'right', 'thank', 'thanks', 'bye', 'hello', 'hi', 'now', 'here', 'there', 'going', 'got', 'get', 'will', 'would', 'could', 'should', 'with', 'for', 'at', 'but', 'if', 'then', 'how', 'why', 'when', 'where', 'who', 'know', 'think', 'want', 'let', 'lets', 'come', 'go', 'look', 'one', 'two', 'sir', 'man', 'good', 'great', 'sure', 'wait', 'hmm', 'huh', 'wow', 'gonna', 'don', 'dont', 'didn', 'doesn', 'im', 'its', 'thats', 'youre', 'ive', 'us', 'him', 'her', 'them', 'out', 'up', 'down', 'all', 'no', 'name', 'really', 'very', 'much', 'too', 'also', 'more', 'some', 'any', 'said', 'say', 'tell', 'mean', 'something', 'nothing', 'anything', 'put', 'take', 'make', 'by', 'from', 'as', 'or', 'been', 'being', 'has', 'had', 'were', 'am', 'oops', 'sorry']);
function esRuido(t) {
  const palabras = String(t).split(' ').filter(Boolean);
  if (!palabras.length || palabras.length > 8) return false;
  const ingles = palabras.filter((p) => INGLES.has(p));
  // "no" y "me" valen en los dos idiomas: no cuentan como inglés por sí solas.
  const propias = ingles.filter((p) => !['no', 'me', 'a', 'i', 'so', 'e', 'hi', 'oh', 'sir', 'man', 'one', 'name', 'put', 'come', 'go', 'can', 'have', 'sorry'].includes(p));
  return ingles.length === palabras.length && propias.length >= 1;
}

// ---- Clips de video ("guardá el último minuto", "enviá el último minuto a Tomi", "empezá a grabar") ----
// Cuánto dura el clip pedido: "el último minuto" = 60, "los últimos 30 segundos" = 30, "el último minuto y medio" = 90.
function duracionClip(t) {
  if (/\bultim\w* medio minuto\b/.test(t)) return 30;
  const m = new RegExp(`(?:\\bultim\\w* |\\bde )(?:${NUMERO} )?(segundos?|minutos?)( y medio)?\\b`).exec(t);
  if (!m) return null;
  const n = m[1] ? numeroDe(m[1]) : 1;
  if (!n) return null;
  return m[2].startsWith('minuto') ? n * 60 + (m[3] ? 30 : 0) : n;
}
const VERBO_MANDAR = '(?:envia|enviar|enviame|enviale|enviarle|manda|mandame|mandale|mandarle|mandar|pasa|pasame|pasale|pasarle|compartile|comparti|compartir|subi|subile|subirle)';
// ¿Pide un clip de una jugada? Devuelve 'kill' | 'muerte' | 'jugada' o null.
function eventoDeJugada(t) {
  const muerte = /\b(?:mori|morir|muerte|me mataron|me mato|me matan|me liquidaron|me bajaron|me reventaron|me hicieron|perdi el round|perdi la ronda)\b/.test(t);
  const kill = /\b(?:kills?|bajas?|asesinato|ace|clutch|headshot|multikill|triple|cuadruple|penta)\b/.test(t);
  const jugada = /\b(?:jugada|jugadon|highlight|momento|escena)\b/.test(t);
  if (!muerte && !kill && !jugada) return null;
  const clipea = /^(?:graba|grabame|grabalo|guarda|guardame|guardalo|clipea|clipeame|clipealo|captura|capturame|registra|registrame|salva|salvame)\b/.test(t);
  const hace = /^(?:hace|haceme|hacer|crea|creame|crear|saca|sacame|sacar|arma|armame|armar|genera|generame|toma|tomame)\b/.test(t) && /\b(?:clip|clips|clipcito|video)\b/.test(t);
  if (!clipea && !hace) return null;
  return muerte ? 'muerte' : kill ? 'kill' : 'jugada';
}

// ¿Pide mirar la pantalla? "¿qué estoy viendo?", "mirá mi pantalla", "¿cómo avanzo en este juego?", "¿qué dice acá?".
function pedidoDePantalla(dicho) {
  // "Mirá" se descarta como muletilla al limpiar: se prueba también con el texto sin limpiar.
  return [limpiar(dicho), nombreDelAsistente.quitarNombre(normalizar(dicho)).trim()].some(pideMirar);
}
function pideMirar(t) {
  if (!t || /\b(clip|clips|graba|grabar|grabacion|captura|capturar|brillo|apaga|apagar|segunda pantalla|pantalla completa|resolucion|foto|camara|webcam)\b/.test(t)) return false;
  return /\bque (?:estoy viendo|estoy mirando|veo|hay en (?:la |mi |el )?(?:pantalla|monitor)|pasa en (?:la |mi )?pantalla|es esto que (?:veo|tengo))\b/.test(t)
    || /\b(?:mira|mirame|mirá|fijate|observa|revisa|lee|leeme|analiza|describime|describi|explicame|traduci|traduceme|traducime|resumi|resumime|decime|contame)\b.*\b(?:pantalla|monitor)\b/.test(t)
    || /\b(?:en|de) (?:mi |la |el )?(?:pantalla|monitor)\b.*\b(?:que|cual|dice|hay|aparece|significa|hago|sigo)\b/.test(t)
    || /\bque (?:dice|significa|es|hago|sigo|hay) (?:aca|aqui|en esta (?:parte|pagina|ventana|pantalla)|en este (?:nivel|mapa|menu|juego|sitio))\b/.test(t)
    || /\bcomo (?:avanzo|sigo|paso|continuo|sigo avanzando|resuelvo|vencemos|venzo|derroto|le gano|mato|salgo|completo|termino)\b.*\b(?:juego|nivel|jefe|boss|esto|aca|aqui|parte|mision|puzzle|acertijo|mapa|zona|capitulo)\b/.test(t)
    || /\b(?:ayudame|ayudame con|ayudame a) .*\b(?:esto que (?:veo|tengo)|lo que (?:veo|tengo|estoy viendo)|en pantalla)\b/.test(t);
}

// Cuando lo anotado habla de lo que se está mirando ("este video", "esta página", "esto"), la nota se lleva el link y una captura.
const ALUDE_A_LO_QUE_VES = /\b(?:este|esta|ese|esa) (?:video|videos|link|enlace|pagina|articulo|nota|post|hilo|tutorial|stream|partido|serie|capitulo|pelicula|juego|mail|correo|documento|archivo|foto|imagen|cancion|producto|oferta|receta|repo|proyecto|sitio|web|tweet|reel|clase|curso|pestana|ventana|programa|tema|mensaje)\b|\besto\b|\blo que (?:estoy|estas) (?:viendo|mirando|leyendo)\b|\bcon (?:el )?(?:link|enlace|captura)\b/;
function reglaNotas(t, dicho) {
  let m;
  if (/^(?:que notas (?:tengo|hay|guarde)|cuantas notas (?:tengo|hay)|(?:leeme|decime|contame|cuales son) (?:mis |las )?notas|tengo notas)$/.test(t)) return { pasos: [{ tipo: 'nota', accion: 'resumen' }] };
  if (/^(?:abri|abrime|mostrame|muestrame|mostra|ver|anda a|ir a) (?:las |mis |la |mi )?(?:notas|lista de notas|seccion de notas|libreta)$/.test(t)) return { pasos: [{ tipo: 'nota', accion: 'abrir' }] };
  // Guardar lo que se está mirando: "guardame esto para después", "guardá este video", "anotá esta página".
  if (/^(?:guarda|guardame|guardar|guardalo|anota|anotame|anotar|apunta|apuntame|marca|marcame)\b/.test(t) && ALUDE_A_LO_QUE_VES.test(t) && !/\b(clip|clips|grabacion|foto|audio)\b/.test(t)) {
    return { pasos: [{ tipo: 'nota', accion: 'crear', texto: '', contexto: true }] };
  }
  // Una nota con texto: "anotá comprar leche", "tomá nota de llamar al médico", "guardá una nota: revisar el router".
  m = /^(?:anota|anotame|anotar|apunta|apuntame|toma nota|tomame nota|tomar nota|agrega(?:me)? (?:una )?nota|crea(?:me)? (?:una )?nota|hace(?:me)? (?:una )?nota|guarda(?:me)? (?:una )?nota|nota)(?: (?:de|que|sobre|para))? (.+)$/.exec(t);
  if (m && !/^de voz\b/.test(m[1]) && !/^(?:de )?(?:audio|voz)$/.test(m[1])) {
    const texto = comoSeDijo(dicho, m[1].replace(/^(?:de|que|sobre|para) /, ''));
    return { pasos: [{ tipo: 'nota', accion: 'crear', texto: texto.charAt(0).toUpperCase() + texto.slice(1), contexto: ALUDE_A_LO_QUE_VES.test(m[1]) }] };
  }
  return null;
}

// Descargar con yt-dlp: "descargá este video", "bajame este video en 720", "descargá el audio de este video", "descargá este mp3".
// "bajá" a secas es de volumen ("bajá el volumen", "bajá la música"): con ese verbo solo vale si habla de un video/link/mp3.
function reglaDescargas(t) {
  const DESCARGA = '(?:descarga|descargame|descargar|descargarme|descargalo|descargala)';
  const BAJA = '(?:baja|bajame|bajar|bajalo|bajala)';
  const ESTE = '(?:este|ese|esta|esa|aquel|el|la|un|una)';
  const OBJ = '(?:video|videito|reel|reels|short|shorts|tiktok|tuit|tweet|post|link|enlace|stream|clip)';
  const AUD = '(?:audio|mp3|sonido|musica|cancion|tema)';
  const FIN = '(?: por favor| ahora| nomas)?';
  const calidad = (x) => { const q = /\b(1080|720)p?\b/.exec(x || ''); return q ? q[1] : /\b(mejor|maxima|alta|hd|full hd)\b/.test(x || '') ? 'mejor' : ''; };
  let m;
  // Audio: "descargá el audio de este video", "descargá este mp3", "bajame el mp3 de este link", "descargá la canción".
  m = new RegExp(`^${DESCARGA} (?:${ESTE} )?${AUD}(?: (?:de|del|desde) (?:(?:${ESTE} )?${OBJ}|esto|eso))?${FIN}$`).exec(t)
    || new RegExp(`^${BAJA} (?:${ESTE} )?(?:audio|mp3|sonido) (?:de|del|desde) (?:(?:${ESTE} )?${OBJ}|esto|eso)${FIN}$`).exec(t)
    || new RegExp(`^${BAJA} (?:${ESTE} )?mp3${FIN}$`).exec(t)
    || new RegExp(`^(?:${DESCARGA}|${BAJA}) (?:${ESTE} )?${OBJ} (?:en|como|solo|solamente|nada mas el|nada mas) (?:formato )?(?:audio|mp3)${FIN}$`).exec(t);
  if (m) return { pasos: [{ tipo: 'descargar', modo: 'audio' }] };
  // Video: "descargá este video", "bajá este video en 1080", "descargá el video en la mejor calidad".
  m = new RegExp(`^(?:${DESCARGA}|${BAJA}) (?:${ESTE} )?${OBJ}(?: (?:de|desde) (?:esta|este) (?:pagina|link|enlace|pestana))?(?: en (?:calidad |resolucion )?(?<q>[\\w ]+?))?${FIN}$`).exec(t);
  if (m) {
    const q = calidad(m.groups && m.groups.q);
    if (m.groups && m.groups.q && !q) return null; // "bajá este video en mi PC": no es una calidad
    return { pasos: [{ tipo: 'descargar', modo: 'video', ...(q ? { calidad: q } : {}) }] };
  }
  if (new RegExp(`^(?:cancela|cancelar|frena|frená|para|parar|deten|detene|detener) (?:la |las |todas las )?descargas?${FIN}$`).test(t)) return { pasos: [{ tipo: 'descargar', modo: 'cancelar' }] };
  return null;
}

function reglaClips(t, dicho) {
  let m;
  // Capturas de pantalla: "sacá una captura de pantalla", "screenshot", "mandame una captura", "mandale un screenshot a Tomi".
  // ("captura" sola con duración o "clip" sigue siendo un clip: "capturá los últimos 30 segundos".)
  {
    const PANTALLA = '(?:(?:screenshot|screen ?shot|pantallazo|captura)(?: de(?: la)? pantalla)?|print(?: screen)?)';
    const ES_CAPTURA = new RegExp(`\\b${PANTALLA}\\b`);
    const sinClip = !/\b(clip|clips|segundos?|minutos?|ultim\w* \d|video|grabacion)\b/.test(t);
    if (sinClip && ES_CAPTURA.test(t)) {
      const ultima = /\bultim[ao]\b/.test(t);
      let c;
      if ((c = new RegExp(`^(?:enviame|mandame|pasame) (?:un |una |el |la |otro |otra )?(?:ultim[ao] )?${PANTALLA}$`).exec(t))) return { pasos: [{ tipo: 'clip', accion: 'captura-enviar', contacto: 'yo', ...(ultima ? { ultimo: true } : {}) }] };
      if ((c = new RegExp(`^${VERBO_MANDAR}(?: el| la| un| una| ese| esa| otro| otra)?(?: ultim[ao])? ${PANTALLA} (?:a|para) (?:el |la )?(.+)$`).exec(t))) return { pasos: [{ tipo: 'clip', accion: 'captura-enviar', contacto: comoSeDijo(dicho, c[1]), ...(ultima ? { ultimo: true } : {}) }] };
      if ((c = new RegExp(`^${VERBO_MANDAR} (?:a |al )?(?:el |la )?(.+?) (?:el |la |un |una |otro |otra )?(?:ultim[ao] )?${PANTALLA}$`).exec(t))) return { pasos: [{ tipo: 'clip', accion: 'captura-enviar', contacto: comoSeDijo(dicho, c[1]), ...(ultima ? { ultimo: true } : {}) }] };
      if (new RegExp(`^(?:(?:saca|sacame|sacar|hace|haceme|hacer|toma|tomame|tomar|captura|capturame|guarda|guardame|guardar|genera|generame) )?(?:(?:un|una|el|la|otro|otra) )?${PANTALLA}$`).test(t)) return { pasos: [{ tipo: 'clip', accion: 'captura' }] };
    }
  }
  const cuanto = duracionClip(t);
  const habla = /\b(clip|clips|clipcito|ultim\w*)\b/.test(t);
  // Mandarlo por WhatsApp: "enviá el último minuto a Tomi", "mandale el último clip a Tomi", "mandale a Tomi el último minuto", "mandame el último clip".
  // "enviale el clip a Tomi" arma un clip NUEVO; solo "el último clip" / "el clip que guardé" manda el que ya estaba guardado.
  const esUltimo = (txt) => /\bultim\w* clip\b|\bclip (?:que|anterior|recien|de recien)\b|\bclip guardado\b/.test(txt);
  const mandable = (txt) => /\bclip\b|\bultim\w* (?:\d+ |[a-z]+ )?(?:segundos?|minutos?|medio minuto)|\bultim\w* clip/.test(txt);
  if ((m = new RegExp(`^(?:enviame|mandame|pasame) (?:el |la |un |los |las )?(.+)$`).exec(t)) && mandable(m[1]) && !/\b(foto|mensaje|audio|mail)\b/.test(m[1])) {
    return { pasos: [{ tipo: 'clip', accion: 'enviar', contacto: 'yo', ...(duracionClip(m[1]) ? { segundos: duracionClip(m[1]) } : {}), ...(esUltimo(m[1]) ? { ultimo: true } : {}) }] };
  }
  if ((m = new RegExp(`^${VERBO_MANDAR}(?: el| la| un| los| las| ese| este)? (.+?) (?:a|para) (?:el |la )?(.+)$`).exec(t)) && mandable(m[1]) && !/\b(foto|mensaje|audio|mail)\b/.test(m[1]) && !/\bvideo de (?!los |las |ultim)/.test(m[1])) {
    return { pasos: [{ tipo: 'clip', accion: 'enviar', contacto: comoSeDijo(dicho, m[2]), ...(duracionClip(m[1]) ? { segundos: duracionClip(m[1]) } : {}), ...(esUltimo(m[1]) ? { ultimo: true } : {}) }] };
  }
  if ((m = new RegExp(`^${VERBO_MANDAR} (?:a |al )?(?:el |la )?(.+?) (?:el |la |un |los |las )?((?:.* )?(?:clip|ultim).*)$`).exec(t)) && mandable(m[2]) && !/\b(foto|mensaje|audio|mail)\b/.test(m[2]) && !/^(?:un|una|el|la|los|las)$/.test(m[1])) {
    return { pasos: [{ tipo: 'clip', accion: 'enviar', contacto: comoSeDijo(dicho, m[1]), ...(duracionClip(m[2]) ? { segundos: duracionClip(m[2]) } : {}), ...(esUltimo(m[2]) ? { ultimo: true } : {}) }] };
  }
  // Clips de una jugada: "grabá la última kill", "hacé un clip de cómo morí recién". Jarvis no sabe qué pasó en el juego: guarda los
  // últimos segundos (30 por defecto, se cambia en Ajustes → Clips) y los rotula.
  const jugada = eventoDeJugada(t);
  if (jugada && !/\b(foto|audio|mensaje|mail|nota|musica)\b/.test(t)) {
    return { pasos: [{ tipo: 'clip', accion: 'guardar', evento: jugada, ...(cuanto ? { segundos: cuanto } : {}) }] };
  }
  // Guardar: "guardá un clip", "clipeá", "guardá el último minuto", "guardame los últimos 30 segundos".
  if ((m = /^(?:guarda|guardame|guardar|guardalo|clipea|clipeame|clipear|clipealo|salva|salvame|captura|capturame|grabame|graba|grabalo)(?: un| el| ese| eso| lo| los| las| la)?(?: (.*))?$/.exec(t))) {
    const resto = m[1] || '';
    const verboClip = /^clipe/.test(t);
    const pidio = (verboClip || habla || cuanto) && !/\b(audio|foto|mensaje|nota|pantalla|partida|juego|musica)\b/.test(resto);
    if (pidio) return { pasos: [{ tipo: 'clip', accion: 'guardar', ...(cuanto ? { segundos: cuanto } : {}) }] };
  }
  // "hacé un clip", "creame un clip", "sacá un clip de los últimos 30 segundos": también guardan el último tiempo (acá hace falta nombrar el clip, para no confundirlo con otra cosa).
  if ((m = /^(?:hace|haceme|hacer|crea|creame|crear|saca|sacame|sacar|arma|armame|armar|genera|generame|generar|toma|tomame)(?: un| el| otro| ese)? (clips?|clipcito)(?: (.*))?$/.exec(t)) && !/\b(audio|foto|mensaje|nota|musica)\b/.test(m[2] || '')) {
    return { pasos: [{ tipo: 'clip', accion: 'guardar', ...(cuanto ? { segundos: cuanto } : {}) }] };
  }
  // Grabar la pantalla a pedido.
  { // "grabá una ventana", "empezá a grabar un recuadro", "grabá la pantalla completa"
    const g = t.match(/^(?:(?:empeza|empezar|comenza|comenzar|inicia|iniciar|arranca|arrancar|ponete|pone|poneme|activa) (?:a )?)?grab(?:a|ar|ame) (?:(?:una?|la|el|toda la) )?(?:(ventana)|(recuadro|region|area|zona|parte de la pantalla)|(pantalla completa|pantalla entera|toda la pantalla))(?: de la pantalla)?$/);
    if (g) return { pasos: [{ tipo: 'clip', accion: 'grabar', modo: g[1] ? 'ventana' : g[2] ? 'recuadro' : 'pantalla' }] };
  }
  if (/^(?:empeza|empezar|comenza|comenzar|inicia|iniciar|arranca|arrancar|ponete|pone|poneme|activa) (?:a )?grabar(?: la pantalla| el juego| la partida| el escritorio)?$/.test(t) || /^grabar? (?:la )?(?:pantalla|partida|juego)$/.test(t)) return { pasos: [{ tipo: 'clip', accion: 'grabar' }] };
  if (/^(?:para|parar|deten|detene|detener|termina|terminar|frena|frenar|corta|cortar|finaliza|finalizar|deja|dejar)(?: de)?(?: la)? (?:grabar|grabacion)(?: de (?:la )?(?:pantalla|juego|partida))?$/.test(t)) return { pasos: [{ tipo: 'clip', accion: 'parar' }] };
  if (/^pausa(?:r)?(?: la)? grabacion$/.test(t)) return { pasos: [{ tipo: 'clip', accion: 'pausar' }] };
  if (/^(?:segui|seguir|reanuda|reanudar|continua|continuar) (?:grabando|con la grabacion|la grabacion)$/.test(t)) return { pasos: [{ tipo: 'clip', accion: 'seguir' }] };
  // Prender y apagar el sistema de clips.
  if ((m = /^(activa|activar|prende|prender|enciende|encender|habilita|habilitar|desactiva|desactivar|apaga|apagar|deshabilita|deshabilitar|corta) (?:la |el |los |las )?(?:repeticion instantanea|clips?|clipeo|buffer de clips|grabacion automatica|grabacion en segundo plano)$/.exec(t))) {
    return { pasos: [{ tipo: 'clip', accion: /^(?:des|apaga|corta)/.test(m[1]) ? 'desactivar' : 'activar' }] };
  }
  return null;
}

// Devuelve { pasos, respuesta?, terminar? } si el pedido se puede resolver sin IA, o null si no.
// "programas" es la lista de nombres de programas que se pueden abrir (se pasa aparte porque
// leerla del menú Inicio es lento y la tiene main.js).
function resolver(dicho, { programas = [] } = {}) {
  const t = limpiar(dicho);
  if (!t) return null;
  const c = leerConfig();
  let m;

  // Despedidas y "me activé sin querer": cierran la conversación sin decir nada.
  if (esCancelacion(t)) return { pasos: [], respuesta: '', terminar: true, nota: 'Lo tomé como cancelar / activación por error: cierro sin contestar.' };
  // Ruido: algo en inglés suelto ("See?", "You can have.") es la tele o una charla de fondo, no un pedido.
  if (esRuido(t)) return { pasos: [], respuesta: '', terminar: true, nota: 'Parece ruido de fondo (no es un pedido): cierro sin contestar.' };

  // Clips de video.
  const clip = reglaClips(t, dicho);
  if (clip) return clip;

  // Notas de voz con la voz del usuario: "mandale un audio a Tomi", "grabale un audio a Eva", "enviá una nota de voz para Juan".
  const AUDIO = '(?:audio|audito|nota de voz|mensaje de voz|mensaje de audio|voice)';
  m = new RegExp(`^(?:mandale|enviale|grabale|pasale|mandarle|enviarle|grabarle|manda|envia|graba)(?: un| una| otro| otra)? ${AUDIO}(?: de (?<n>${NUMERO}) segundos?)?(?: a| para| al) (?:el |la )?(?<c>.+)$`).exec(t)
    || new RegExp(`^(?:mandale|enviale|grabale|pasale|mandarle|enviarle|grabarle) (?:a |al )(?:el |la )?(?<c>.+?)(?: un| una)? ${AUDIO}(?: de (?<n>${NUMERO}) segundos?)?$`).exec(t);
  if (m && m.groups.c) {
    const segundos = m.groups.n ? numeroDe(m.groups.n) : null;
    return { pasos: [{ tipo: 'audio_whatsapp', contacto: comoSeDijo(dicho, m.groups.c), ...(segundos ? { segundos } : {}) }] };
  }

  // Música.
  if (/^(pausa|pausar|pausala|pausame|para|parar|frena|frenar|detene|detener)( la| el)?( musica| cancion| tema)?$/.test(t) && t !== 'para') return { pasos: [{ tipo: 'musica_control', accion: 'pausar' }], respuesta: 'Pausado.' };
  if (/^(segui|seguir|sigue|reanuda|reanudar|continua|continuar|play|dale play)( con)?( la| el)?( musica| cancion| tema)?$/.test(t)) return { pasos: [{ tipo: 'musica_control', accion: 'reanudar' }], respuesta: 'Sigo.' };
  if (/^((pone |pon |pasa a )?(la |el )?(siguiente|proxima|proximo)( cancion| tema| pista)?|(pasa|pasar|saltea|saltear|cambia|cambiar)( de| la| el| esta| este)* (cancion|tema|pista))$/.test(t)) return { pasos: [{ tipo: 'musica_control', accion: 'siguiente' }], respuesta: 'Siguiente.' };
  if (/^((pone |pon |volve a |volve )?(la |el )?(cancion |tema |pista )?anterior|(cancion|tema) anterior)$/.test(t)) return { pasos: [{ tipo: 'musica_control', accion: 'anterior' }], respuesta: 'Anterior.' };
  // "Poné música" a secas: la mezcla personal (Supermix). Suena en la PC salvo que se nombre otro lugar.
  m = /^(?:pone|pon|poneme|reproduci|reproduce|reproducir|quiero escuchar|quiero)(?: algo de| un poco de)? (?:musica|mi supermix|el supermix|supermix|mi mix)(?: (?:en|por) (?:el |la |los |las )?(.+))?$/.exec(t);
  if (m) return { pasos: [{ tipo: 'musica', busqueda: '', ...(m[1] ? { dispositivo: m[1] } : {}) }] };
  m = /^(?:pone|pon|poneme|reproduci|reproduce|reproducir|quiero escuchar|quiero oir) (?:la cancion|el tema|el album|el disco|la musica de|musica de|algo de|temas de|canciones de) (.+)$/.exec(t);
  if (m) {
    const lugar = /^(.+?) (?:en|por) (?:el |la |los |las )?((?:nest|home|google|chromecast|parlante|living|cocina|cuarto|dormitorio|pieza|tele|televisor)[a-z0-9 ]*)$/.exec(m[1]);
    if (lugar) return { pasos: [{ tipo: 'musica', busqueda: comoSeDijo(dicho, lugar[1]), dispositivo: lugar[2].trim() }] };
    return { pasos: [{ tipo: 'musica', busqueda: comoSeDijo(dicho, m[1]) }] };
  }

  // Fotos de la webcam por WhatsApp: sacar y mandar una foto no necesita "ver" nada, así que no usa ningún modelo.
  const FOTO = '(?: una| la| otra| unas)? (?:foto|fotito|fotos|selfie|selfi)(?: (?:de|con|desde) (?:la|mi) (?:camara|webcam|cam|camara web|compu))?';
  const MANDAR = '(?:le )?(?:mandes|envies|pases|saques|tomes|manda|mandale|mandarle|mandar|envia|enviale|enviarle|enviar|pasa|pasale|pasarle|pasar|compartile|compartir|comparti|saca|sacale|sacarle|sacar|toma|tomale|tomar|saca y manda|sacale y manda|tomale y manda)';
  if (new RegExp(`^(?:mandame|mandarme|enviame|enviarme|pasame|pasarme|sacame|sacarme|saca|sacar|sacate|toma|tomame|quiero|quiero una|necesito)${FOTO}(?: y (?:mandamela|enviamela|pasamela|me la mandas|me la envias))?(?: (?:por|al|a mi) whatsapp)?$`).test(t)) {
    return { pasos: [{ tipo: 'foto_whatsapp', contacto: 'yo' }], respuesta: 'Listo, te mandé la foto a tu WhatsApp.' };
  }
  m = new RegExp(`^${MANDAR}${FOTO}(?: y (?:mandasela|enviasela|pasasela|mandala|enviala|pasala|compartisela))?(?: por (?:whatsapp|wasap|wsp))? (?:(?:a|al|a la|para|para el|para la) )?(.+?)(?: por (?:whatsapp|wasap|wsp))?$`).exec(t);
  if (m) {
    const pedido = m[1].replace(/^(el grupo|grupo|los del grupo|la gente de|los de) /, '');
    const contacto = /^(mi|mi mismo|mi whatsapp|mi celular)$/.test(m[1]) ? { nombre: 'yo' } : whatsapp.buscarDestino(pedido);
    if (contacto) return { pasos: [{ tipo: 'foto_whatsapp', contacto: contacto.nombre }], respuesta: contacto.nombre === 'yo' ? 'Listo, te mandé la foto a tu WhatsApp.' : contacto.grupo ? `Listo, mandé la foto al grupo ${contacto.nombre}.` : `Listo, le mandé la foto a ${contacto.nombre}.` };
  }

  // Novedades (mensajes de WhatsApp y mails que llegaron): contarlas, leerlas o borrarlas.
  const QUE = '(mensajes?|whatsapps?|wasaps?|mails?|correos?|emails?|notificaciones|novedades)';
  const origenDe = (palabra) => (/^(mensaje|whatsapp|wasap)/.test(palabra) ? 'whatsapp' : /^(mail|correo|email)/.test(palabra) ? 'mail' : undefined);
  m = new RegExp(`^(?:tengo|hay|llego|llegaron|me llego|me llegaron|me escribio alguien|alguien me escribio)(?: algun| alguna| algo| nuevos?| nuevas?)*(?: ${QUE})?(?: nuevos?| nuevas?| sin leer)?$`).exec(t);
  if (m && (m[1] || /escribio|algo|nuev/.test(t))) return { pasos: [{ tipo: 'avisos', accion: 'contar', origen: origenDe(m[1] || '') }] };
  m = new RegExp(`^(?:leeme|lee|leer|decime|contame|que dicen|que dice|pasame)(?: los| las| el| la| mis)? ${QUE}(?: nuevos?| nuevas?| sin leer)?$`).exec(t);
  if (m) return { pasos: [{ tipo: 'avisos', accion: 'leer', origen: origenDe(m[1]) }] };
  if (/^(que me perdi|que hay de nuevo|que paso mientras no estaba|alguna novedad|hay novedades|novedades)$/.test(t)) return { pasos: [{ tipo: 'avisos', accion: 'leer' }] };
  m = new RegExp(`^(?:borra|limpia|descarta|elimina|saca)(?: las| los| todas las| todos los| mis)? ${QUE}$`).exec(t);
  if (m) return { pasos: [{ tipo: 'avisos', accion: 'limpiar', origen: origenDe(m[1]) }] };

  // Fútbol: "poné a Racing", "quiero ver el partido de Boca". Se averigua el canal y se abre Flow.
  m = /^(?:pone|poneme|pon|quiero ver|quiero mirar|busca|buscame)(?: en (?:la )?(?:tele|pc|compu))? ((?:a|al|el partido de|el partido del|el partido de la|el partido) .+?)(?: en flow)?$/.exec(t);
  if (m) {
    const equipo = streaming.equipoDicho(m[1]);
    if (equipo || /^el partido (de|del|de la) /.test(m[1])) {
      return { pasos: [{ tipo: 'partido', equipo: equipo || comoSeDijo(dicho, m[1].replace(/^el partido (de la|del|de) /, '')) }] };
    }
  }

  // Resultados de fútbol: "cuánto va Estudiantes", "cómo salió Racing", "cuándo juega Boca". Sin esta regla un modelo
  // se confundía ("estudiantes" por los alumnos, "cuánto" por un precio): se pregunta ya con el sentido correcto.
  {
    const marcador = /^(?:(?:cuanto|como) (?:va|van|salio|salieron|quedo|quedaron|esta|estan|anda|andan)(?: el partido (?:de|del|de la))?|(?:cuanto|como) (?:le|les) (?:va|fue|salio|quedo)(?: hoy)?(?: a)?|(?:que|cual) (?:resultado|marcador) (?:tuvo|hizo|hay|es|tiene)(?: de| del| de la)?|(?:el )?(?:resultado|marcador) (?:de|del|de la)|(?:gano|perdio|empato|metio|hizo gol)(?: hoy)?) (?:el |la |los |las |a )?(.+?)(?: hoy| ahora| en este momento)?$/.exec(t);
    const cuando = /^(?:cuando|a que hora|que dia) (?:juega|jugo|juegan|jugaron|va a jugar|es el partido de|es el proximo partido de|es el partido del|es el partido de la)(?: el proximo partido)?(?: de| del| de la)? (?:el |la |los |las |a )?(.+?)(?: hoy| ahora| mañana| manana)?$/.exec(t);
    const dicen = marcador || cuando;
    const equipos = dicen && streaming.hablaDeEquipo(dicen[1]);
    if (equipos) {
      const quien = comoSeDijo(dicho, dicen[1]);
      const nombre = equipos === 'estudiantes' ? 'Estudiantes de La Plata' : quien;
      const consulta = marcador
        ? `Fútbol argentino: ${nombre}. Si está jugando ahora, decime cuánto va el partido (marcador y minuto); si ya jugó hoy, cómo terminó; si todavía no jugó, cuándo es. En una o dos frases.`
        : `Fútbol argentino: ¿cuándo es el próximo partido de ${nombre} (día, hora y contra quién)? En una frase.`;
      return { pasos: [{ tipo: 'buscar', consulta }], deporte: true };
    }
  }

  // Series, películas y videos: "poné la serie tal", "quiero ver tal en Netflix", "poné tal en la tele".
  {
    const partes = t.split(' en ');
    let servicio; let dispositivo;
    // Del final hacia atrás: lo que sea un servicio conocido o un lugar (la tele, la PC) no es parte del título.
    while (partes.length > 1) {
      const ultimo = partes[partes.length - 1].replace(/^(el|la|los|las) /, '');
      const esLugar = /^(tele|tv|televisor|chromecast|pc|compu|computadora)$/.test(ultimo) || buscarPorNombre(c.teles || [], ultimo);
      const esServicio = streaming.servicioDicho(ultimo);
      if (esLugar && !dispositivo) dispositivo = partes.pop();
      else if (esServicio && !servicio) { servicio = esServicio.id; partes.pop(); } else break;
    }
    const resto = partes.join(' en ');
    const conTipo = /^(?:quiero ver|quiero mirar|pone|poneme|pon|reproduci|reproduce|busca|buscame|abri|abrime) (?:la serie|la pelicula|la peli|el documental|el anime|el programa|el video(?: de)?|un video(?: de)?|videos de) (.+)$/.exec(resto);
    const sinTipo = /^(?:quiero ver|quiero mirar|tengo ganas de ver) (.+)$/.exec(resto) || ((servicio || dispositivo) && /^(?:pone|poneme|pon|reproduci|reproduce|busca|buscame|abri|abrime) (.+)$/.exec(resto));
    const titulo = (conTipo || sinTipo || [])[1];
    if (titulo && !/^(musica|la musica|algo)$/.test(titulo)) {
      return { pasos: [{ tipo: 'ver', titulo: comoSeDijo(dicho, titulo), ...(servicio ? { servicio } : {}), ...(dispositivo ? { dispositivo } : {}) }] };
    }
  }

  // Agenda del calendario: "¿qué tengo hoy?", "mi agenda de mañana", "¿cuál es mi próximo evento?".
  m = /^(?:que|cuales?) (?:eventos |reuniones |compromisos |turnos )?(?:tengo|hay|tenemos)(?: en el calendario| en la agenda| anotado| agendado)?(?: (hoy|manana))?$/.exec(t)
    || /^(?:mi |la )?(?:agenda|calendario)(?: de| para)?(?: (hoy|manana))?$/.exec(t)
    || /^(?:que|cuales?) (?:tengo|hay) (?:para )?(hoy|manana)(?: en el calendario| en la agenda)?$/.exec(t);
  if (m) return { pasos: [{ tipo: 'agenda', cuando: m[1] || 'hoy' }] };
  if (/^(?:cual es|cuando es|que es|que tengo|decime|contame)? ?(?:mi |el )?(?:proximo|siguiente) (?:evento|reunion|compromiso|turno)(?: en el calendario| de mi agenda)?$/.test(t) || /^que (?:sigue|viene) en (?:el calendario|la agenda)$/.test(t)) return { pasos: [{ tipo: 'agenda', cuando: 'proximo' }] };

  // Crear un evento en el calendario: "agendá reunión con Juan mañana a las 15", "creá un evento cumpleaños de Tomi el viernes
  // a las 21 en el calendario". Con "agendá" alcanza; con otros verbos hace falta nombrar el evento o el calendario.
  m = /^(?:agenda|agendame|agendar|agendalo|agregame|agrega|agregar|anota|anotame|anotar|carga|cargame|cargar|crea|creame|crear|programa|programame|programar|pone|poneme|suma|sumame|sumar|guarda|guardame) (.+)$/.exec(t);
  if (m) {
    const verboAgenda = /^agend/.test(t);
    const ref = /\b(evento|reunion|cita|turno|compromiso)\b|\ben (?:el |mi |la )?(?:google )?(?:calendario|calendar|agenda)\b|\bal (?:calendario|calendar|google calendar)\b|\ben la agenda\b/;
    if ((verboAgenda || ref.test(m[1])) && !/\b(recordatorio|alarma|musica|cancion|temporizador)\b/.test(m[1])) {
      const f = fechas.analizar(m[1], new Date(), numeroDe);
      if (f) {
        const plano = f.resto
          .replace(/ ?\b(?:en|al|a) (?:el |mi |la )?(?:google )?(?:calendario|calendar|agenda)\b ?/g, ' ')
          .replace(/^(?:un |una |el |la |mi )?(?:nuevo |nueva )?(?:evento|compromiso)? ?(?:de |para |que diga |llamado |llamada |sobre |:)? ?/, '')
          .replace(/^(?:de |para |que |el |la |un |una )+/, '').replace(/( (?:de|para|a|el|la|en|con|y|por))+$/, '').replace(/\s+/g, ' ').trim();
        if (plano) {
          const titulo = comoSeDijo(dicho, plano);
          return { pasos: [{ tipo: 'evento', titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), inicio: fechas.aISOLocal(f.inicio), todoElDia: f.todoElDia, ...(f.duracionMin ? { duracionMin: f.duracionMin } : {}) }] };
        }
      }
    }
  }


  // Rutinas: por su nombre, con o sin un verbo adelante ("activá modo juego").
  const rutinas = leerRutinas().filter((r) => r.nombre);
  const sinVerbo = t.replace(new RegExp(`^${VERBO_ACTIVAR} `), '').replace(/^(la rutina|el|la|rutina) /, '');
  const frasesDe = (r) => [r.nombre, ...(Array.isArray(r.activadores) ? r.activadores : [])].map((x) => normalizar(x)).filter(Boolean);
  const rutina = rutinas.find((r) => frasesDe(r).includes(t) || frasesDe(r).includes(sinVerbo))
    || elMasParecido(rutinas, sinVerbo) || elMasParecido(rutinas, t);
  if (rutina) return { rutina: rutina.id, pasos: [] };

  // Notas de voz: "grabá una nota de voz", "parar la nota de voz". (Un audio para mandar por WhatsApp es otra cosa: "mandale un audio a…".)
  if (/^(?:(?:quiero|necesito) )?(?:(?:me |nos )?(?:graba|grabar|grabame|grabate|empeza a grabar|empezar a grabar|inicia|iniciar|iniciame|arranca|hace|hacer|haceme|crea|crear|creame)(?: me)? )?(?:una |otra )?(?:nueva )?nota de voz(?: nueva)?$/.test(t) || /^(?:(?:me )?(?:graba|grabame|empeza a grabar|inicia|arranca|hace|haceme)) (?:una |otra )?nota de voz$/.test(t)) return { pasos: [{ tipo: 'notavoz', accion: 'grabar' }] };
  if (/^(?:(?:para|pare|parar|termina|terminar|deten|detene|detener|cerra|cerrar|guarda|guardar|frena|frenar|listo con|fin de) )(?:con )?(?:de grabar )?(?:la |esa |esta |mi )?(?:nota de voz|grabacion de la nota|nota)(?: de voz)?$/.test(t) || /^(?:para|termina|deten|frena|guarda) (?:de )?grabar(?: la nota(?: de voz)?)?$/.test(t)) return { pasos: [{ tipo: 'notavoz', accion: 'parar' }] };

  // Modo sin conexión: "modo sin conexión", "sin internet", "volvé a conectarte", "salí del modo sin conexión".
  if (/^(?:(?:pone|pon|ponete|pasa|pasate|activa|activame|entra|entra en)(?: en| a| al| el)? )?(?:modo )?(?:sin conexion|sin internet|offline|sin red)$/.test(t)) return { pasos: [{ tipo: 'conexion', accion: 'sin' }] };
  if (/^(?:(?:volve|vuelve|reconectate|conectate|salí|sali|sal|desactiva|apaga|apagá|quita|saca)(?: a| de| del| el)? )?(?:(?:modo )?(?:sin conexion|sin internet|offline)|conectarte|conectar|conectate|reconectate|reconectarte|volve a conectarte|con internet|online)$/.test(t) && /(conect|sin conexion|sin internet|offline|online|con internet)/.test(t) && /^(volve|vuelve|reconectate|conectate|sali|sal|desactiva|apaga|quita|saca|con internet|online)/.test(t)) return { pasos: [{ tipo: 'conexion', accion: 'con' }] };

  // Modos de Jarvis: "modo silencio", "ponete en oculto".
  m = /^(?:(?:pone|pon|ponete|pasa|pasate|cambia|cambiate|activa)(?: en| a| al| el)? )?modo (.+)$/.exec(t) || /^(?:ponete|pasate|quedate) (?:en|a) (.+)$/.exec(t);
  if (m) {
    const modos = c.modos || [];
    const modo = modos.find((x) => normalizar(x.nombre) === m[1] || x.id === m[1]) || elMasParecido(modos, m[1]);
    if (modo) return { pasos: [{ tipo: 'modo', modo: modo.id }], respuesta: `Modo ${modo.nombre.toLowerCase()}.` };
  }

  // Volumen de la PC: "volumen al treinta", "poné el volumen en 50".
  m = new RegExp(`^(?:(?:pone|pon|subi|sube|baja|deja|fija) )?(?:el )?volumen(?: de la pc| de la compu| general)?(?: al| a| en)? ${NUMERO}(?: por ciento)?$`).exec(t);
  if (m && numeroDe(m[1]) !== null && numeroDe(m[1]) <= 100) return { pasos: [{ tipo: 'volumen', nivel: numeroDe(m[1]) }], respuesta: `Volumen al ${numeroDe(m[1])}.` };

  // Salida de audio: "cambiá a auriculares", "pasá el sonido a los parlantes".
  m = /^(?:cambia|cambiar|cambiame|pasa|pasar|pasame|pone|pon|usa|usar)(?: el audio| la salida| el sonido| la salida de audio)?(?: a| al| en| por)?(?: los| las| el| la)? (.+)$/.exec(t);
  if (m) {
    const salida = buscarPorNombre(c.salidasAudio || [], m[1]) || elMasParecido(c.salidasAudio || [], m[1]);
    if (salida) return { pasos: [{ tipo: 'salida_audio', salida: salida.nombre }], respuesta: `Listo, sonido en ${salida.nombre}.` };
  }

  // Teles y parlantes con Chromecast.
  m = /^(prende|prender|enciende|encender|apaga|apagar|pausa|pausar|reanuda|reanudar|segui|detene|detener|silencia|silenciar|mutea|mutear) (?:el |la |los |las )?(.+)$/.exec(t);
  if (m) {
    const tele = buscarPorNombre(c.teles || [], m[2]);
    const accion = { prende: 'prender', enciende: 'prender', encender: 'prender', apaga: 'apagar', pausa: 'pausar', reanuda: 'reanudar', segui: 'reanudar', detene: 'detener', silencia: 'silenciar', mutea: 'silenciar', mutear: 'silenciar' }[m[1]] || m[1];
    if (tele) return { pasos: [{ tipo: 'tele', tele: tele.nombre, accion }] };
  }

  // Abrir un programa por su nombre (solo si existe uno claro; si no, que lo piense el modelo).
  m = /^(?:abri|abre|abrir|abrime|inicia|iniciar|lanza|lanzar) (?:el programa |la aplicacion |la app |el |la )?(.+)$/.exec(t);
  if (m && !/ y /.test(m[1])) {
    const conocidos = [...(c.programas || []), ...programas.map((nombre) => ({ nombre }))];
    const programa = buscarPorNombre(conocidos, m[1]) || elMasParecido(conocidos, m[1], 0.85);
    if (programa) return { pasos: [{ tipo: 'abrir', programa: programa.nombre }], respuesta: `Abriendo ${programa.nombre}.` };
  }

  // Descargas con yt-dlp.
  const descarga = reglaDescargas(t);
  if (descarga) return descarga;

  // Notas: "anotá comprar leche", "guardame esto para después", "¿qué notas tengo?", "abrí las notas".
  const nota = reglaNotas(t, dicho);
  if (nota) return nota;

  // Recordatorios con tiempos simples.
  m = /^(?:recordame|recuerdame|recordarme|haceme acordar|acordame|pone un recordatorio|crea un recordatorio|avisame) (.+)$/.exec(t);
  // "Recordame" es de las que peor se escuchan ("recordan", "recordad me"): se acepta algo parecido.
  if (!m) { const partes = /^(\S+) (.+)$/.exec(t); if (partes && parecido(partes[1], 'recordame') >= 0.7) m = partes; else m = null; if (m) m = [m[0], m[2]]; }
  if (m) {
    const paso = recordatorio(m[1].replace(/^(de|que|para) /, ''), dicho);
    // "Recordame ver este video a las 6": se anota con lo que estás mirando (link y captura), para que el aviso lo traiga.
    if (paso && ALUDE_A_LO_QUE_VES.test(normalizar(paso.texto))) return { pasos: [{ ...paso, tipo: 'nota', contexto: true }] };
    if (paso) return { pasos: [paso] };
  }

  // El clima: servicio gratuito y sin clave, no hace falta ningún modelo.
  const CUANDO = '(?: (?:para |de )?(hoy|ahora|manana|pasado manana))?';
  const DONDE = '(?: (?:en|de|para) (?!hoy|manana|pasado)(.+?))?';
  m = new RegExp(`^(?:(?:como|que tal)(?: (?:esta|va a estar|viene|estara))? |cual es |decime |contame |dame )?(?:el |la )?(?:clima|tiempo|pronostico|temperatura)${CUANDO}${DONDE}${CUANDO}$`).exec(t)
    || new RegExp(`^(?:que temperatura hace|cuantos grados hace|hace (?:frio|calor)|como esta afuera|como esta el dia)(?: afuera)?${CUANDO}${DONDE}${CUANDO}$`).exec(t)
    || new RegExp(`^(?:va a llover|llueve|lloverá|llovera|necesito paraguas|hay que llevar paraguas)${CUANDO}${DONDE}${CUANDO}$`).exec(t);
  if (m) {
    const dia = m[1] || m[3] || 'ahora';
    return { pasos: [{ tipo: 'clima', lugar: m[2] ? comoSeDijo(dicho, m[2]) : '', cuando: dia === 'manana' ? 'manana' : dia === 'pasado manana' ? 'pasado' : 'ahora' }] };
  }

  // "Buscá en internet tal cosa": se busca y se dice lo encontrado (un modelo, si hay, lo resume mejor).
  m = /^(?:busca|buscame|buscar|googlea|googleame|fijate|averigua|averiguame) (?:en (?:internet|google|la web|la red|wikipedia) )(.+)$/.exec(t);
  if (m) return { pasos: [{ tipo: 'buscar', consulta: comoSeDijo(dicho, m[1]) }], resumir: true };

  // "Poné tal cosa" sin aclarar: puede ser una serie o una canción. Se decide después, consultando el
  // catálogo (acciones.js): un título conocido que se llama igual es para ver; si no, es música.
  m = /^(?:pone|poneme|pon|reproduci|reproduce|reproducime) (.+)$/.exec(t);
  if (m && !/^(un|una|el|la|los|las|mi|mis|algo|eso|esto|me|te|le|lo|se)$/.test(m[1]) && !/\b(recordatorio|alarma|volumen|modo|brillo|whatsapp|mensaje|mail)\b/.test(m[1])) {
    const sinNexo = m[1].replace(/^(a|algo de|un poco de|lo ultimo de|lo nuevo de) /, '');
    return { pasos: [{ tipo: 'poner', titulo: comoSeDijo(dicho, sinNexo) }] };
  }

  // La hora y la fecha salen del reloj de la PC.
  if (/^(que hora es|que hora tenes|me decis la hora|decime la hora|la hora)$/.test(t) || parecido(t, 'que hora es') >= 0.85) {
    return { pasos: [], respuesta: `Son las ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}.` };
  }
  if (/^(que dia es( hoy)?|que fecha es( hoy)?|a cuanto estamos)$/.test(t)) {
    return { pasos: [], respuesta: `Hoy es ${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}.` };
  }

  // Última chance sin modelo: una rutina dicha con otras palabras ("avisale que juego" por "avisá que juego").
  // Si es casi seguro, se hace; si hay duda, se pregunta ("Entendí tal rutina, ¿la hago?").
  const parecida = rutinaParecida(t, rutinas);
  if (parecida) {
    return parecida.seguro ? { rutina: parecida.rutina.id, pasos: [] } : { rutina: parecida.rutina.id, pasos: [], confirmar: `Entendí la rutina "${parecida.rutina.nombre}". ¿La hago?` };
  }
  return null;
}

module.exports = { pedidoDePantalla, eventoDeJugada, esCancelacion, esRuido, resolver, rutinaParecida, parecidoDeFrases, limpiar, despertar, despertarEnMedio, corregirNombre, formaNueva, numeroDe, parecido, elMasParecido };
