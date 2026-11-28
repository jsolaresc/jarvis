// Configuración y datos de Jarvis. Todo vive en la carpeta "datos" del proyecto,
// en archivos JSON que también se pueden editar a mano.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..'); // recursos de la app (de solo lectura si está empaquetada en un .asar)

// Dónde guardar "datos": en desarrollo, al lado del código (RAIZ) como siempre. Empaquetada como
// portable, RAIZ cae adentro del app.asar, que es de solo lectura, así que ahí hay que usar la
// carpeta real donde vive el .exe que el usuario abre. electron-builder (target "portable") pone
// esa carpeta en PORTABLE_EXECUTABLE_DIR antes de arrancar la app — así "datos" termina al lado
// de Jarvis.exe, no en una carpeta temporal, e incluso coincide con la que ya usa "npm start".
function carpetaReal() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  try {
    if (process.versions && process.versions.electron) {
      const { app } = require('electron');
      if (app && app.isPackaged) return path.dirname(process.execPath);
    }
  } catch {}
  return RAIZ;
}

const DATOS = process.env.JARVIS_DATOS || path.join(carpetaReal(), 'datos');

const CONFIG_DEFECTO = {
  nombre: 'Jarvis',
  usuario: '', // cómo te llama Jarvis
  ciudad: '', // para "¿cómo está el clima?" sin tener que aclarar dónde
  modo: 'normal', // normal | silencio | oculto | dormido
  inicioConWindows: true,
  atajoHablar: 'Control+Alt+J',
  apariencia: { colorOjos: '#8BE9FF', colorFondo: '#000000', escala: 1, opacidadFondo: 1, opacidadOjos: 1, opacidadNotch: 1, ojosBailan: true, caras: true },
  ancla: null, // posición de la pastilla en pantalla; null = arriba al centro
  // Escuchar: en esta PC (gratis, sin límites) o con el Whisper gratuito de Groq (si hay clave).
  // seguir: después de contestar, ¿se queda escuchando? 'pregunta' (solo si Jarvis preguntó algo) | 'siempre' | 'nunca'.
  // confirmar: 'dudas' (pregunta "Entendí tal cosa, ¿lo hago?" cuando un modelo interpretó un envío o una rutina quedó dudosa) | 'nunca'.
  // confirmarAgendados: false = a los contactos cargados en Ajustes → WhatsApp (y a uno mismo) se les manda directo, sin repreguntar; true = también se les pregunta.
  escucha: { motor: 'local', seguir: 'pregunta', confirmar: 'dudas', confirmarAgendados: false, segundosExtra: 7, silencioMs: 700 },
  // Hablar: una voz neuronal que corre en esta PC, o la voz de Windows ('windows').
  // personalidades: { '<id de la voz>': 'texto' } = cómo habla Jarvis cuando usa esa voz (modismos, tono, humor). Se suma a sus instrucciones.
  habla: { voz: 'claude', velocidad: 1, personalidades: {} },
  // Entender pedidos libres: se prueban en este orden los que estén configurados; si uno se queda
  // sin cuota o falla, se pasa al siguiente. "modelo" vacío = Jarvis elige solo.
  ia: {
    orden: ['groq', 'gemini', 'ollama'],
    groq: { clave: '', modelo: '' },
    gemini: { clave: '', modelo: '' },
    ollama: { url: 'http://127.0.0.1:11434', modelo: '' },
  },
  // Jarvis en el celular (Ajustes → Celular): servidor solo en 127.0.0.1, que se publica por Tailscale ("tailscale serve").
  // hablarEnPC: si lo que le escribís desde el celular Jarvis también lo dice en voz alta en la PC.
  // Dónde avisar los recordatorios (notas con hora) y los eventos del calendario: en la PC, en el celular (app de Android) o en los dos.
  avisos: { recordatorios: { pc: true, celular: true }, calendario: { pc: true, celular: true } },
  // casa: modo casa para la app de Android (misma Wi-Fi, sin Tailscale), en el puerto puertoCasa de la red local.
  // afuera: Tailscale integrado (jarvis-red), para usar la app de Android fuera de casa.
  celular: { activo: false, puerto: 47820, https: 443, hablarEnPC: false, casa: true, puertoCasa: 47821, afuera: false, camara: false },
  volumen: 1, // cuánto se escucha la voz de Jarvis (1 = normal; no afecta al resto de la PC)
  modos: [
    { id: 'normal', nombre: 'Normal', habla: true, visible: true },
    { id: 'juego', nombre: 'Juego', habla: true, visible: true, panel: { texto: true, avisos: false, acciones: false, musica: true, clips: true } },
    { id: 'silencio', nombre: 'Silencio', habla: false, visible: true },
    { id: 'oculto', nombre: 'Oculto', habla: true, visible: false },
    { id: 'dormido', nombre: 'Dormido', habla: false, visible: false },
  ],
  // palabraClave: el detector clásico de "Hey Jarvis" (entrenado con voces en inglés). porTranscripcion:
  // además, entender "Jarvis" / "che Jarvis" dicho con cualquier acento, pasando a texto lo que se oye.
  // tambien: otras formas en que el oído escribe "Jarvis" cuando lo decís vos (se cargan con "Enseñarle").
  voz: { palabraClave: true, umbral: 0.5, porTranscripcion: true, ahorro: true, tambien: '', microfono: '' },
  camara: { dispositivo: '' },
  // Notas de voz de WhatsApp con tu voz: revisar = reproducirlas y preguntar "¿Lo mando?" antes de mandarlas.
  audios: { revisar: true },
  // Notas de voz (grabadora del panel): se guardan en "Notas de voz" dentro de la carpeta de clips (o en `carpeta`, si se elige otra).
  // formato: 'm4a' (se convierte con ffmpeg si está instalado) o 'wav'.
  notasVoz: { carpeta: '', formato: 'm4a' },
  // Descargas con yt-dlp ("descargá este video"). carpeta vacía = "Descargas" junto a los clips; ytdlp vacío = buscarlo solo; calidad: 'mejor' | '1080' | '720'.
  descargas: { carpeta: '', ytdlp: '', calidad: '1080', cookies: '' },
  // Repetición instantánea (clips): mientras está activa, Jarvis guarda en un buffer los últimos segundos de la pantalla
  // (con el sonido de Windows y/o el micrófono) y con un atajo, una orden de voz o un botón los guarda en un video.
  // Solo corre en los modos que la tienen habilitada (Ajustes → Modos). calidad: '480p' | '720p' | '1080p' | '1440p'. audioKbps: 96 | 128 | 192.
  clips: {
    activo: false, segundos: 90, calidad: '720p', fps: 30, sistema: true, microfono: true, volumenMic: 1, volumenSistema: 0.8, audioKbps: 128,
    carpeta: '', porJuego: true, sinJuego: 'Varios', atajo: 'Alt+F10', pantalla: 0,
    grabarPantalla: 'principal', // qué pantalla graba el botón "Pantalla": 'principal' | 'preguntar' | número de pantalla (1, 2, ...)
    nombres: {}, // { 'proceso': 'Nombre del juego' }: cómo se llama la carpeta de cada programa
    enviarA: '', // a quién va "enviar el último clip" si no se dice
    sinJarvis: true, // los clips no muestran a Jarvis (el notch y Ajustes se ocultan de la captura) ni se escucha tu voz hablándole ni la suya
    recorteDeVoz: 0, // el clip pedido por voz termina estos segundos antes de que empieces a hablar (0 = justo cuando empezás)
    segundosJugada: 30, // cuánto dura el clip de "grabá la última kill" / "cómo morí recién"
  },
  // Contexto: que Jarvis mire la pantalla cuando se lo pedís ("¿qué estoy viendo?"). Apagado hasta que lo prendas, porque la
  // captura viaja al modelo que la mira (Groq, Gemini u Ollama). anchoCaptura: tamaño máximo de esa captura.
  contexto: { verPantalla: false, anchoCaptura: 1280 },
  // Notas: capturar = guardar también una captura de pantalla cuando la nota es "de lo que estoy viendo".
  notas: { capturar: true, porWhatsapp: true },
  homeAssistant: { url: '', token: '' },
  teles: [], // { nombre, cast, entidadHA }
  casa: [], // { nombre, entidad }
  salidasAudio: [], // { nombre, dispositivo }
  programas: [], // { nombre, ruta, argumentos }
  // Cómo llamás a cada quien: { nombre (el apodo con el que lo pedís), numero (cargado a mano) o jid (elegido
  // de la agenda de WhatsApp: una persona o un grupo), avisar: '' (según las reglas) | 'siempre' | 'nunca' }
  contactos: [],
  whatsapp: { activo: false },
  // Lo que Jarvis antepone a cada WhatsApp que manda, y el pie de los mails que contesta.
  firma: { whatsapp: '🤖', mail: 'Enviado con Jarvis, mi asistente.' },
  // apiKeyYoutube: para buscar canciones por nombre. porDefecto: link de la lista que suena con
  // "poné música" (vacío = Mi Supermix, la mezcla automática de la cuenta).
  musica: { apiKeyYoutube: '', porDefecto: '' },
  // sistema: mantenerPantalla = que Windows no apague la pantalla (ni la tele que hace de monitor) mientras suena música.
  sistema: { mantenerPantalla: true },
  busqueda: { tavily: '' }, // clave gratuita opcional de tavily.com para buscar en internet
  // Notificaciones (WhatsApp entrante, mails). Las reglas se miran en orden y gana la primera que
  // coincide: { origen: 'todos'|'whatsapp'|'mail', quien: texto del remitente/grupo/asunto ('' = cualquiera),
  // accion: 'avisar' | 'decir' (avisar y decirlo en voz alta) | 'callar', modos: [] (vacío = todos) }.
  notificaciones: {
    estilo: 'ambos', // 'punto' | 'burbuja' | 'ambos'
    // Cada fuente tiene su modo: 'nada' (no avisa), 'elegidos' (solo lo que elegiste) o 'todo' (todo, salvo lo silenciado).
    // elegidos / silenciados: nombres, direcciones o dominios (en WhatsApp, el contacto o el grupo). Un contacto con "Avisar siempre" en Ajustes → WhatsApp también cuenta como elegido.
    whatsapp: { modo: 'elegidos', elegidos: [], silenciados: [], grupos: true }, // grupos: en modo "todo", incluir los grupos
    mail: { modo: 'elegidos', elegidos: [], silenciados: [], cuentas: {} }, // cuentas: { gmail: 'nada' | 'elegidos' | 'todo' } para que una cuenta se comporte distinto al resto ('' o ausente = como Mail)
    calendario: { modo: 'todo' }, // 'todo': los avisos de siempre de cada evento · 'elegidos': solo calendarios y eventos con avisos propios (o marcados "Avisar") · 'nada'
    nota: { modo: 'todo' }, // los recordatorios y notas con hora también son un aviso (sonido + ojos) hasta que los saques
    sonidos: { nota: 'campanita', calendario: 'campanita' }, // el sonido de cada tipo de aviso ('' = el general, 'ninguno' = mudo)
    sonido: '', // sonido general para todo lo que avisa ('' = ninguno); cada regla puede tener el suyo
    reglas: [{ origen: 'todos', quien: '', accion: 'callar', modos: ['dormido'] }],
  },
  // Conexión: manual = modo sin conexión prendido a mano (además de entrar solo cuando se corta internet); alertas = cómo avisa cuando se cae internet o un servicio:
  // 'icono' (solo el ícono junto a los ojos) | 'burbuja' (ícono y burbuja, una vez al caer y otra al volver) | 'voz' (además lo dice en voz alta).
  conexion: { manual: false, alertas: 'burbuja' },
  // Google Calendar. Se puede conectar la cuenta de Google (google: ID de cliente propio + permiso de solo lectura; trae todos los
  // calendarios, elegidos = ids a usar o null para los tildados en Google) y/o cargar enlaces secretos iCal (enlace + enlaces: [{ nombre, enlace, activo }]).
  // minutosAntes: cuánto antes se avisa de cada evento (en minutos; puede haber varios).
  calendario: { activo: false, enlace: '', enlaces: [], minutosAntes: [10], calendarios: {}, google: { clientId: '', clientSecret: '', token: '', cuenta: '', elegidos: null, ocultos: [] } },
  // Series y películas. tmdb: clave gratuita de themoviedb.org para saber en qué servicio está cada
  // título. servicios: los que tiene el usuario, en orden de preferencia; {q} es lo que se busca.
  // navegador: 'predeterminado' | 'chrome' (donde tengas las sesiones iniciadas). equipos: los que
  // seguís, para "poné a Racing" (además de los más conocidos, que ya vienen).
  streaming: {
    tmdb: '', pais: 'AR', tele: '', navegador: 'chrome', equipos: '',
    servicios: [
      { id: 'disney', nombre: 'Disney+', activo: true, url: 'https://www.disneyplus.com/search?q={q}' },
      { id: 'hbo', nombre: 'HBO Max', activo: true, url: 'https://play.hbomax.com/search?q={q}' },
      { id: 'netflix', nombre: 'Netflix', activo: false, url: 'https://www.netflix.com/search?q={q}' },
      { id: 'prime', nombre: 'Prime Video', activo: false, url: 'https://www.primevideo.com/search/?phrase={q}' },
      { id: 'youtube', nombre: 'YouTube', activo: true, url: 'https://www.youtube.com/results?search_query={q}' },
      { id: 'stremio', nombre: 'Stremio', activo: true, url: 'stremio:///search?search={q}' },
      { id: 'flow', nombre: 'Flow', activo: false, url: 'https://web.flow.com.ar/' },
      { id: 'pluto', nombre: 'Pluto TV', activo: true, url: 'https://pluto.tv/latam/search/details?q={q}' },
    ],
  },
  // Mails: avisa de lo nuevo y, si se lo pedís desde una notificación, contesta (solo Gmail).
  // Gmail: usuario + "contraseña de aplicación". Outlook: permiso OAuth (token).
  correo: {
    cadaSegundos: 90,
    gmail: { usuario: '', clave: '', soloPrincipal: true },
    outlook: { usuario: '', idAplicacion: '', token: '', web: false }, // web: sesión iniciada en la ventana de navegador de Jarvis
  },
};

const RUTINAS_DEFECTO = [
  {
    id: 'modo_juego', nombre: 'Modo juego', icono: 'juego', rapida: true,
    pasos: [
      { tipo: 'modo', modo: 'juego' },
      { tipo: 'decir', texto: 'Modo juego activado.' },
    ],
  },
  {
    id: 'modo_normal', nombre: 'Modo normal', icono: 'tele', rapida: true,
    pasos: [
      { tipo: 'modo', modo: 'normal' },
      { tipo: 'decir', texto: 'Volvimos al modo normal.' },
    ],
  },
];
function sembrarRutinas() {}

function esObjeto(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// Completa con los valores por defecto lo que falte (sin pisar lo que ya está).
function completar(dato, defecto) {
  if (!esObjeto(defecto)) return dato === undefined ? defecto : dato;
  const salida = esObjeto(dato) ? { ...dato } : {};
  for (const clave of Object.keys(defecto)) salida[clave] = completar(salida[clave], defecto[clave]);
  return salida;
}

function leerJSON(nombre, defecto) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATOS, nombre), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Archivo roto: lo guardamos aparte para no perder lo que hubiera y seguimos con el defecto.
      try { fs.copyFileSync(path.join(DATOS, nombre), path.join(DATOS, nombre + '.roto')); } catch {}
    }
    return defecto;
  }
}

function guardarJSON(nombre, dato) {
  fs.mkdirSync(DATOS, { recursive: true });
  const destino = path.join(DATOS, nombre);
  const temporal = destino + '.tmp';
  fs.writeFileSync(temporal, JSON.stringify(dato, null, 2), 'utf8');
  fs.renameSync(temporal, destino);
}

let config = null;
let rutinas = null;

// El panel del notch es una lista de widgets (ver ui/widgets.js). Los modos de antes tenían solo casilleros (texto, avisos,
// acciones, música, clips): de ahí se arma la lista equivalente, en el mismo orden en que se veía el panel.
function widgetsDeBanderas(panel) {
  const f = { ...PANEL_BASE, ...(panel || {}) };
  const lista = [];
  if (f.texto) lista.push({ id: 'texto', tipo: 'texto', tam: 4 });
  if (f.avisos) lista.push({ id: 'novedades', tipo: 'novedades', tam: 4 });
  if (f.acciones) lista.push({ id: 'rutinas', tipo: 'rutinas', tam: 4 });
  if (f.musica) lista.push({ id: 'musica', tipo: 'musica', tam: 4 });
  // Grabar y guardar clip: los que más se usan. Solo se ven en los modos que graban clips (y con los clips prendidos).
  lista.push({ id: 'clip-grabar', tipo: 'clip-grabar', tam: 2 }, { id: 'clip-guardar', tipo: 'clip-guardar', tam: 2 });
  lista.push({ id: 'modos', tipo: 'modos', tam: 4 });
  return lista;
}
// La grilla del panel pasó de 6 columnas (chico 2, mitad 3, ancho 6) a 4 (chico 1, mitad 2, ancho 4): los diseños guardados se convierten una vez.
const GRILLA = 4;
const DE_6_A_4 = { 2: 1, 3: 2, 6: 4 };

// Lo que venía de la versión con Gemini Live: la clave sirve igual para los modelos de texto.
function migrar(c) {
  // Carpeta de clips: si no se eligió ninguna, "Videos\Jarvis" del usuario.
  if (c.clips && !String(c.clips.carpeta || '').trim()) c.clips.carpeta = path.join(require('os').homedir(), 'Videos', 'Jarvis');
  if (c.gemini && c.gemini.apiKey && c.ia && c.ia.gemini && !c.ia.gemini.clave) c.ia.gemini.clave = c.gemini.apiKey;
  delete c.gemini;
  // Servicios de streaming que se agregaron después: las listas guardadas no se completan solas.
  const servicios = c.streaming && Array.isArray(c.streaming.servicios) ? c.streaming.servicios : null;
  if (servicios) for (const nuevo of CONFIG_DEFECTO.streaming.servicios) if (!servicios.some((s) => s && s.id === nuevo.id)) servicios.push({ ...nuevo });
  // Cada modo guarda su lista de widgets (los que no la tenían la reciben a partir de sus casilleros viejos).
  if (Array.isArray(c.modos)) {
    for (const m of c.modos) {
      if (!m) continue;
      if (!(m.panel && Array.isArray(m.panel.widgets))) m.panel = { ...(m.panel || {}), widgets: widgetsDeBanderas(m.panel), grilla: GRILLA };
      else if (m.panel.grilla !== GRILLA) m.panel = { ...m.panel, grilla: GRILLA, widgets: m.panel.widgets.map((w) => (w && DE_6_A_4[w.tam] ? { ...w, tam: DE_6_A_4[w.tam] } : w)) };
    }
  }
  return c;
}

function leerConfig() {
  if (!config) {
    config = migrar(completar(leerJSON('config.json', {}), CONFIG_DEFECTO));
    // 13/11/2026: los clips por voz terminan justo cuando empezás el pedido (antes, 2 s antes y silenciando tu voz).
    const m = leerJSON('migraciones.json', {}) || {};
    if (!m.clipsHastaElPedido) {
      if (config.clips && Number(config.clips.recorteDeVoz) === 2) { config.clips.recorteDeVoz = 0; guardarJSON('config.json', config); }
      m.clipsHastaElPedido = true;
      guardarJSON('migraciones.json', m);
    }
    // 18/11/2026: los avisos pasan a tener un modo por fuente (nada / solo lo elegido / todo). Lo que ya andaba se traduce una sola vez:
    // lo apagado queda apagado y el resto arranca en "solo lo elegido" (que avise solo lo que cada uno elige).
    if (!m.avisosPorFuente) {
      const crudo = (leerJSON('config.json', {}) || {}).notificaciones || {};
      const n = config.notificaciones;
      const lista = (t) => (Array.isArray(t) ? t : String(t || '').split(/[,\n;]+/)).map((x) => String(x).trim()).filter(Boolean);
      const wa = crudo.whatsapp || {};
      n.whatsapp.modo = wa.activo === false ? 'nada' : 'elegidos';
      n.whatsapp.grupos = true;
      // Quien tenía "solo mi lista" ya había elegido a los de su lista de contactos: siguen siendo los elegidos.
      n.whatsapp.elegidos = wa.soloLista ? (config.contactos || []).filter((c) => c && c.nombre && c.avisar !== 'nunca').map((c) => String(c.nombre).split(',')[0].trim()).filter(Boolean) : [];
      n.whatsapp.silenciados = [];
      const ma = crudo.mail || {};
      n.mail.modo = ma.activo === false ? 'nada' : 'elegidos';
      n.mail.elegidos = lista(ma.lista);
      n.mail.silenciados = lista(ma.ignorar);
      n.mail.cuentas = {};
      n.calendario.modo = (crudo.calendario || {}).activo === false ? 'nada' : 'todo';
      n.nota.modo = (crudo.nota || {}).activo === false ? 'nada' : 'todo';
      for (const k of ['whatsapp', 'mail', 'calendario', 'nota']) { delete n[k].activo; delete n[k].soloLista; delete n[k].lista; delete n[k].ignorar; }
      m.avisosPorFuente = true;
      guardarJSON('config.json', config);
      guardarJSON('migraciones.json', m);
    }
  }
  return config;
}
function guardarConfig(nueva) {
  config = migrar(completar(nueva, CONFIG_DEFECTO));
  guardarJSON('config.json', config);
  return config;
}
function leerRutinas() {
  if (!rutinas) {
    rutinas = leerJSON('rutinas.json', null);
    if (!Array.isArray(rutinas)) { rutinas = RUTINAS_DEFECTO.map((r) => ({ ...r })); guardarJSON('rutinas.json', rutinas); }
    sembrarRutinas();
  }
  return rutinas;
}
function guardarRutinas(nuevas) {
  rutinas = Array.isArray(nuevas) ? nuevas : [];
  guardarJSON('rutinas.json', rutinas);
  return rutinas;
}

// Para comparar nombres dichos por voz: sin mayúsculas, acentos ni signos.
function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
// Un nombre puede traer sinónimos separados por coma ("Laura, mi hermana, Lau", "Los Pibes, Pibes"): todos sirven para pedirlo,
// pero el que se muestra y se dice es el primero.
const nombresDe = (texto) => String(texto || '').split(',').map((x) => x.trim()).filter(Boolean);
const nombrePrincipal = (texto) => nombresDe(texto)[0] || '';
// "Los Pibes (también: Pibes)": para contarle al modelo cómo se puede pedir algo.
const conSinonimos = (texto) => { const n = nombresDe(texto); return n.length > 1 ? `${n[0]} (también se pide como: ${n.slice(1).join(', ')})` : (n[0] || ''); };
// Busca en una lista el elemento cuyo nombre coincide con lo pedido. Compara por palabras enteras
// ("Evangelina" no es "Eva") y, si hay más de un candidato, no adivina: devuelve null. Devuelve el elemento
// con su nombre principal (el primero, si tenía sinónimos).
function buscarPorNombre(lista, pedido, campo = 'nombre') {
  const p = normalizar(pedido);
  if (!p) return null;
  const palabrasPedido = p.split(' ');
  const items = lista.flatMap((x) => nombresDe(x[campo]).map((a) => ({ x, n: normalizar(a) })).filter((i) => i.n));
  const principal = (x) => { const nombre = nombrePrincipal(x[campo]); return nombre && nombre !== x[campo] ? { ...x, [campo]: nombre } : x; };
  const exacto = items.find((i) => i.n === p);
  if (exacto) return principal(exacto.x);
  // Dos sinónimos del mismo elemento cuentan como un solo candidato.
  const unico = (candidatos) => { const xs = [...new Set(candidatos.map((c) => c.x))]; return xs.length === 1 ? principal(xs[0]) : null; };
  // Lo pedido es parte del nombre: "comedor" -> "Tele Comedor".
  const contenidos = items.filter((i) => { const pn = i.n.split(' '); return palabrasPedido.every((w) => pn.includes(w)); });
  if (contenidos.length) return unico(contenidos);
  // El nombre es parte de lo pedido: "la tele del comedor" -> "Tele Comedor".
  const incluido = unico(items.filter((i) => i.n.split(' ').every((w) => palabrasPedido.includes(w))));
  if (incluido) return incluido;
  // El oído a veces junta o separa las palabras ("telecomedor" por "Tele Comedor"): se compara sin espacios.
  const junto = p.replace(/ /g, '');
  if (junto.length < 4) return null;
  // Primero lo idéntico sin espacios ("telecomedor" = "Tele Comedor", aunque "Comedor" también esté adentro).
  const igual = unico(items.filter((i) => i.n.replace(/ /g, '') === junto));
  if (igual) return igual;
  return unico(items.filter((i) => { const nj = i.n.replace(/ /g, ''); return nj.length >= 4 && junto.includes(nj); }));
}

// Qué se muestra en el panel del notch al pasar el mouse, según el modo (cada modo puede cambiarlo en Ajustes → Modos).
const PANEL_BASE = { texto: true, avisos: true, acciones: true, musica: true, clips: false };
// clips: ¿los clips corren en este modo? (los widgets solo muestran los controles). widgets: lo que muestra el panel, en orden.
const panelDeModo = (modo) => { const p = { ...PANEL_BASE, ...((modo && modo.panel) || {}) }; p.widgets = Array.isArray(p.widgets) ? p.widgets : widgetsDeBanderas(p); return p; };

module.exports = {
  PANEL_BASE, panelDeModo, widgetsDeBanderas,
  RAIZ, DATOS, leerConfig, guardarConfig, leerRutinas, guardarRutinas,
  leerJSON, guardarJSON, normalizar, buscarPorNombre, nombresDe, nombrePrincipal, conSinonimos,
};
