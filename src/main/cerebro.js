// El "cerebro" de Jarvis, 100% gratuito:
//   1. ESCUCHAR: el audio del micrófono se pasa a texto en esta misma PC (oido.js), sin clave ni cuota.
//   2. DECIDIR:  los pedidos comunes se resuelven con reglas, sin ningún modelo (comandos.js); el resto
//                lo piensa un modelo gratuito, probando varios en cadena (pensar.js).
//   3. HABLAR:   la respuesta la dice una voz que también corre en esta PC (o la voz de Windows).
// Antes todo esto lo hacía la Live API de Gemini, que en la capa gratuita se queda sin cuota enseguida.
const { leerConfig, leerRutinas, conSinonimos, buscarPorNombre } = require('./config');
const conexion = require('./conexion');
const acciones = require('./acciones');
const recordatorios = require('./recordatorios');
const contexto = require('./contexto');
const comandos = require('./comandos');
const clips = require('./clips');
const pensar = require('./pensar');
const oido = require('./oido');
const modelos = require('./modelos');
const internet = require('./internet');
const historial = require('./historial');
const whatsapp = require('./whatsapp');
const musica = require('./musica');
const aprendido = require('./aprendido');
const calendario = require('./calendario');

// main.js completa esto: { estado(fase, texto), salida(pcm, hz), cortar(), texto(quien, texto),
//   modo(), vozDeWindows(texto) -> Promise, programas() -> [nombres] }
const puente = { programas: () => [], vozDeWindows: async () => {} };
function configurar(funciones) { Object.assign(puente, funciones); }

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// El audio viaja entre procesos y puede llegar como ArrayBuffer, Buffer o Int16Array según el camino:
// acá se lo deja siempre como muestras de 16 bits (copiando, para no depender de cómo venía alineado).
function muestras(pcm) {
  if (pcm instanceof Int16Array) return pcm;
  const bytes = pcm instanceof ArrayBuffer ? new Uint8Array(pcm) : new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const copia = new Uint8Array(bytes.byteLength & ~1);
  copia.set(bytes.subarray(0, copia.length));
  return new Int16Array(copia.buffer);
}
const habla = () => ((leerConfig().modos || []).find((m) => m.id === puente.modo()) || { habla: true }).habla !== false;

// ---------- Herramientas que puede usar el modelo ----------
const cadena = (descripcion, opciones) => ({ type: 'string', description: descripcion, ...(opciones ? { enum: opciones } : {}) });
const numero = (descripcion) => ({ type: 'number', description: descripcion });
const funcion = (name, description, properties = {}, required = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } },
});

// Solo se declaran las que tienen sentido con lo que hay configurado (menos texto = menos cuota gastada).
function herramientas() {
  const c = leerConfig();
  const lista = [
    funcion('ejecutar_rutina', 'Ejecuta una rutina guardada del usuario.', { rutina: cadena('Id o nombre de la rutina.') }, ['rutina']),
    funcion('abrir_programa', 'Abre un programa de la PC por su nombre.', { programa: cadena('Nombre del programa.') }, ['programa']),
    funcion('volumen_pc', 'Fija el volumen general de la PC.', { nivel: numero('De 0 a 100.') }, ['nivel']),
    funcion('cambiar_modo', 'Cambia el modo de Jarvis.', { modo: cadena('Id del modo.', acciones.idsDeModos()) }, ['modo']),
    funcion('crear_recordatorio', 'Crea un recordatorio: "minutos" u "hora" (HH:MM, 24 hs), no ambos.',
      { texto: cadena('Qué hay que recordar.'), minutos: numero('Dentro de cuántos minutos.'), hora: cadena('Hora del día, HH:MM.') }, ['texto']),
    funcion('anotar', 'Guarda una nota; con hora o minutos también avisa. contexto=true si dice "este video"/"esto": guarda link y captura.',
      { texto: cadena('La nota.'), minutos: numero('Aviso en N minutos.'), hora: cadena('Aviso a HH:MM.'), contexto: { type: 'boolean' } }, ['texto']),
    funcion('descargar', 'Descarga con yt-dlp el video o solo el audio (mp3) de lo que mira en el navegador; "cancelar" frena la descarga.',
      { modo: cadena('Qué hacer.', ['video', 'audio', 'cancelar']), calidad: cadena('Solo si la nombra.', ['720', '1080', 'mejor']), url: cadena('Solo si dictó un link.') }, ['modo']),
    funcion('reproducir_musica', 'Pone MÚSICA (canciones, artistas, álbumes) en YouTube Music; series y películas son ver_contenido. "busqueda" vacía = su Supermix.',
      { busqueda: cadena('Canción, álbum, artista o género.'), dispositivo: cadena('Solo si nombra otro aparato (Nest, Chromecast…); si no, omitir: suena en la PC.') }),
    funcion('buscar_en_internet', 'Busca en internet datos actuales o dudosos (noticias, resultados, precios).',
      { consulta: cadena('Qué buscar, en una frase, con sus palabras clave.') }, ['consulta']),
    funcion('ver_contenido', 'Abre una serie, película o video para VERLO ("poné Los Simpson"): en la PC (en su streaming) o en la tele (solo YouTube).',
      { titulo: cadena('Qué ver.'), servicio: cadena('Solo si nombró uno (Netflix, Disney, HBO, YouTube...).'), dispositivo: cadena('Solo si nombró la tele u otro aparato; si no, omitir.') }, ['titulo']),
    funcion('ver_partido', 'Averigua por qué canal pasan el partido de un equipo y abre Flow ("poné a Racing").',
      { equipo: cadena('Nombre del equipo.') }, ['equipo']),
    funcion('novedades', 'WhatsApp y mails pendientes: contarlos, leerlos o borrarlos.',
      { accion: cadena('Qué hacer.', ['contar', 'leer', 'limpiar']), origen: cadena('Solo unos u otros.', ['whatsapp', 'mail']) }, ['accion']),
    funcion('clima', 'Clima actual y pronóstico de una ciudad.',
      { lugar: cadena('Ciudad. Omitir para la ciudad del usuario.'), cuando: cadena('Para cuándo.', ['ahora', 'manana', 'pasado']) }),
    funcion('agenda', 'Eventos del calendario: hoy, mañana o lo próximo.', { cuando: cadena('Para cuándo.', ['hoy', 'manana', 'proximo']) }),
    funcion('crear_evento', 'Crea un evento en Google Calendar (abre la página cargada y el usuario toca Guardar). Calculá la fecha con "Ahora".',
      { titulo: cadena('Nombre.'), inicio: cadena('AAAA-MM-DDTHH:MM, hora local.'), duracion_min: numero('Minutos; omitir = 60.'), todo_el_dia: { type: 'boolean', description: 'Sin hora.' }, lugar: cadena('Lugar.') }, ['titulo', 'inicio']),
    funcion('clips', 'Clips de video del juego (repetición instantánea): guardar los últimos segundos, enviarlos por WhatsApp, grabar la pantalla.',
      { accion: cadena('Qué hacer.', ['guardar', 'enviar', 'grabar', 'pausar', 'seguir', 'parar', 'activar', 'desactivar']), segundos: numero('Últimos N segundos (60 = un minuto).'), contacto: cadena('A quién enviarlo.'), ultimo: { type: 'boolean', description: 'Enviar el último clip ya guardado.' } }, ['accion']),
    funcion('controlar_musica', 'Controla la música que está sonando.', { accion: cadena('Qué hacer.', ['pausar', 'reanudar', 'siguiente', 'anterior']) }, ['accion']),
    funcion('mirar_camara', 'Solo para describir lo que ve la webcam. Para mandar foto: enviar_foto_whatsapp.'),
    funcion('mirar_pantalla', 'Mira la pantalla del usuario ("¿qué estoy viendo?").'),
    funcion('terminar_conversacion', 'Cierra la conversación (despedida o nada más que hacer).'),
  ];
  if (c.salidasAudio.length) lista.push(funcion('cambiar_salida_audio', 'Cambia la salida de sonido de la PC.', { salida: cadena('Nombre de la salida.') }, ['salida']));
  if (c.teles.length) {
    lista.push(funcion('controlar_tele', 'Controla una tele o parlante con Chromecast.',
      { tele: cadena('Nombre de la tele.'), accion: cadena('Qué hacer.', ['prender', 'apagar', 'pausar', 'reanudar', 'detener', 'volumen', 'silenciar', 'sonido']), valor: cadena('Para volumen: 0 a 100, "subir" o "bajar".') }, ['tele', 'accion']));
    lista.push(funcion('reproducir_en_tele', 'Envía a una tele un archivo de la PC o una URL directa a un video, audio o imagen.',
      { tele: cadena('Nombre de la tele.'), origen: cadena('Ruta del archivo o URL.') }, ['tele', 'origen']));
  }
  if (c.casa.length) {
    lista.push(funcion('controlar_casa', 'Controla un dispositivo de la casa (luces, enchufes).',
      { dispositivo: cadena('Nombre del dispositivo.'), accion: cadena('Qué hacer.', ['prender', 'apagar', 'alternar', 'brillo']), valor: cadena('Para brillo: 0 a 100.') }, ['dispositivo', 'accion']));
  }
  if (c.contactos.length || c.whatsapp.activo) {
    const aQuien = cadena('Nombre del contacto o del grupo de WhatsApp tal como lo dijo el usuario, o "yo" para mandárselo al propio usuario.');
    lista.push(funcion('enviar_whatsapp', 'Envía un WhatsApp de texto a un contacto, grupo o al usuario; con hora o minutos, queda programado.',
      { contacto: aQuien, mensaje: cadena('El mensaje, en primera persona, como lo escribiría el usuario.'), hora: cadena('Si es para después: HH:MM (24 hs).'), minutos: numero('Si es para después: dentro de N minutos.') }, ['contacto', 'mensaje']));
    lista.push(funcion('enviar_foto_whatsapp', 'Saca una foto con la webcam y la envía por WhatsApp, sin describirla.',
      { contacto: aQuien, epigrafe: cadena('Texto opcional.') }, ['contacto']));
    lista.push(funcion('enviar_audio_whatsapp', 'Graba la voz del usuario y la envía como nota de voz de WhatsApp.',
      { contacto: aQuien, segundos: numero('Solo si pidió una duración; si no, omitir.') }, ['contacto']));
  }
  return lista;
}

function instrucciones() {
  const c = leerConfig();
  const lista = (titulo, items) => (items.length ? `${titulo}: ${items.join(', ')}.` : null);
  const personalidad = String(((c.habla || {}).personalidades || {})[(c.habla || {}).voz] || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  return [
    `Sos ${c.nombre}, el asistente de voz personal${c.usuario ? ` de ${c.usuario}` : ''}, y vivís en su PC con Windows.`,
    'Lo que escribas se dice en voz alta: español rioplatense (voseo), cálido y directo, una o dos frases cortas, sin listas, símbolos ni emojis.',
    personalidad ? `Personalidad de la voz que estás usando: seguila al hablar (modismos, tono, humor); tiene prioridad sobre el estilo de arriba, pero sin dejar de cumplir bien lo que te piden ni inventar datos. ${personalidad}` : null,
    'El pedido llega transcripto de la voz y puede tener errores de oído: interpretá lo más razonable (un nombre parecido al de una rutina o un contacto es ese).',
    'Si no parece un pedido (ruido, activación sin querer), llamá a terminar_conversacion sin contestar. No inventes rutinas ni contactos que no estén en las listas.',
    'Si piden hacer algo, usá la herramienta que corresponda (el sistema se encarga de pedir confirmación cuando hace falta) y después confirmá en pocas palabras. Si una herramienta da error, contalo simple. No digas que hiciste algo si no lo confirmó.',
    'Para WhatsApp, redactá el mensaje como lo escribiría el usuario ("Estoy jugando, después te llamo"), no como un asistente. Se le puede escribir a cualquier contacto o grupo de su WhatsApp: pasá el nombre tal como lo dijo, sin verificarlo vos. Si no queda claro a quién o qué decir, preguntá.',
    '"Poné tal cosa": si es una canción, un artista o un género va con reproducir_musica; si es una serie, película, dibujo o programa va con ver_contenido; si es un equipo de fútbol, ver_partido.',
    'Para actualidad o datos que pueden haber cambiado (noticias, resultados, precios, quién ocupa un cargo) usá buscar_en_internet y respondé con lo que encuentres, sin inventar. Clima: usá clima.',
    'Con un equipo, "cuánto va" o "cómo salió" piden el MARCADOR, no un precio ("Estudiantes" es el de La Plata). Si lo hallado no responde lo preguntado, decí que no lo encontraste.',
    `Ahora: ${new Date().toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })}. Modo actual: ${c.modo}.`,
    lista('Modos', (c.modos || []).map((m) => `${m.id}${m.habla ? '' : ' (no habla)'}`)),
    lista('Rutinas', leerRutinas().map((r) => `"${r.nombre}" (id ${r.id}${Array.isArray(r.activadores) && r.activadores.length ? `; también se pide como: ${r.activadores.map((x) => `"${x}"`).join(', ')}` : ''})`)),
    lista('Teles y parlantes', c.teles.map((t) => conSinonimos(t.nombre))),
    lista('Dispositivos de la casa', c.casa.map((d) => conSinonimos(d.nombre))),
    lista('Salidas de audio', c.salidasAudio.map((s) => conSinonimos(s.nombre))),
    lista('Apodos de contactos y grupos de WhatsApp', c.contactos.map((x) => conSinonimos(x.nombre)).filter(Boolean)),
    (() => { const g = whatsapp.listaDeAgenda().filter((x) => x.grupo).slice(0, 25).map((x) => x.nombre); return g.length ? `Grupos de WhatsApp: ${g.join(', ')}.` : null; })(),
    c.ciudad ? `Ciudad del usuario: ${c.ciudad}.` : null,
  ].filter(Boolean).join('\n');
}

// ---------- Escuchar ----------
const puedeEscuchar = () => modelos.instalado('vad') && (modelos.instalado('oido') || usaGroqParaEscuchar());
const usaGroqParaEscuchar = () => { const c = leerConfig(); return c.escucha.motor === 'groq' && !!c.ia.groq.clave; };

function wav(pcm16, hz) {
  const datos = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0); cabecera.writeUInt32LE(36 + datos.length, 4); cabecera.write('WAVEfmt ', 8);
  cabecera.writeUInt32LE(16, 16); cabecera.writeUInt16LE(1, 20); cabecera.writeUInt16LE(1, 22);
  cabecera.writeUInt32LE(hz, 24); cabecera.writeUInt32LE(hz * 2, 28); cabecera.writeUInt16LE(2, 32); cabecera.writeUInt16LE(16, 34);
  cabecera.write('data', 36); cabecera.writeUInt32LE(datos.length, 40);
  return Buffer.concat([cabecera, datos]);
}

// El Whisper gratuito de Groq (opcional): más preciso que el modelo local, pero necesita internet.
async function transcribirConGroq(pcm) {
  const c = leerConfig();
  const base = (c.ia.groq.url || pensar.PROVEEDORES.groq.base).replace(/\/+$/, '');
  const formulario = new FormData();
  formulario.append('file', new Blob([wav(pcm, 16000)], { type: 'audio/wav' }), 'audio.wav');
  formulario.append('model', 'whisper-large-v3-turbo');
  formulario.append('language', 'es');
  formulario.append('response_format', 'json');
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 15000);
  try {
    const r = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${c.ia.groq.clave}` }, body: formulario, signal: control.signal });
    if (!r.ok) throw new Error(`Groq respondió ${r.status}`);
    return String((await r.json()).text || '').trim();
  } finally {
    clearTimeout(reloj);
  }
}

async function transcribir(pcm) {
  const enteros = muestras(pcm);
  if (usaGroqParaEscuchar()) {
    try { return await transcribirConGroq(enteros); } catch (e) { if (!modelos.instalado('oido')) throw e; } // si falla, sigue con el local
  }
  return oido.transcribir(enteros);
}

// ---------- Hablar ----------
function paraDecir(texto) {
  return String(texto || '')
    .replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' un enlace ')
    .replace(/[*_#`>|~]/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ').trim();
}

let turnoDeVoz = 0; // cada vez que Jarvis empieza a decir algo nuevo (o se lo calla) cambia
let finAudio = 0; // momento en que termina de sonar lo que ya se mandó al parlante

// Dice un texto con la voz elegida y vuelve cuando terminó de sonar. Si la voz local no está
// instalada (o falla), usa la de Windows. Sirve para las respuestas y para rutinas y recordatorios.
async function hablar(texto) {
  const limpio = paraDecir(texto);
  if (!limpio || !habla()) return;
  const c = leerConfig();
  const turno = ++turnoDeVoz;
  const idVoz = modelos.idDeVoz(c.habla.voz);
  if (idVoz && modelos.instalado(idVoz)) {
    try {
      finAudio = 0;
      await oido.decir(limpio, c.habla.voz, c.habla.velocidad, (pcm, hz) => {
        if (turno !== turnoDeVoz) return;
        const enteros = muestras(pcm);
        finAudio = Math.max(Date.now(), finAudio) + (enteros.length / hz) * 1000;
        puente.salida(Buffer.from(enteros.buffer, enteros.byteOffset, enteros.byteLength), hz);
      });
      // Un cachito más después de la última palabra, para no escucharse a sí mismo al volver a prestar atención.
      while (turno === turnoDeVoz && Date.now() < finAudio + 250) await esperar(60);
      return;
    } catch (e) {
      console.error('[voz]', e.message);
      if (turno !== turnoDeVoz) return;
    }
  }
  await puente.vozDeWindows(limpio);
}

function callar() {
  turnoDeVoz++;
  finAudio = 0;
  oido.callar();
  puente.cortar();
}

function fraseDePrueba() {
  const nombre = (leerConfig().usuario || '').trim();
  return nombre ? `Hola, ${nombre}. Así sueno con esta voz.` : 'Hola. Así sueno con esta voz.';
}

// Para el botón "Probar" de Ajustes: devuelve el audio (PCM de 16 bits) y a cuántos Hz está.
async function probarVoz(voz) {
  const id = modelos.idDeVoz(voz);
  if (!id) throw new Error('Esa voz no existe.');
  if (!modelos.instalado(id)) await modelos.bajar(id);
  const trozos = [];
  let hz = 22050;
  await oido.decir(fraseDePrueba(), voz, leerConfig().habla.velocidad, (pcm, h) => {
    const enteros = muestras(pcm);
    trozos.push(Buffer.from(enteros.buffer, enteros.byteOffset, enteros.byteLength));
    hz = h;
  });
  return { pcm: Buffer.concat(trozos), hz };
}

// ---------- Decidir ----------
// Lo que manda mensajes o fotos no se hace a ciegas cuando lo interpretó un modelo: se confirma antes.
const CON_CONFIRMACION = new Set(['enviar_whatsapp', 'enviar_foto_whatsapp']); // (el audio tiene su propia revisión: lo escuchás antes de mandarlo)
const quien = (c) => (/^(yo|mi|mi mismo)$/i.test(String(c || '').trim()) ? 'vos' : String(c || '').trim());
function queEntendi(nombre, a) {
  const para = quien(a.contacto);
  if (nombre === 'enviar_whatsapp') return `mandarle a ${para}${a.hora ? ` a las ${a.hora}` : a.minutos ? ` dentro de ${a.minutos} minutos` : ''} este mensaje por WhatsApp: "${String(a.mensaje || '').slice(0, 160)}"`;
  if (nombre === 'enviar_foto_whatsapp') return `sacar una foto y mandársela a ${para}`;
  return `grabar un audio de ${Math.max(2, Math.min(60, Number(a.segundos) || 8))} segundos y mandárselo a ${para}`;
}
const confirmarActivo = () => (leerConfig().escucha.confirmar || 'dudas') !== 'nunca';
// ¿El destinatario ya está agendado en Jarvis (Ajustes → WhatsApp → Contactos y grupos) o es uno mismo? A esos se les manda directo, sin repreguntar lo que se entendió.
// A un contacto que no cargaste (aunque esté en tu agenda de WhatsApp) se sigue pidiendo confirmación.
function esDeConfianza(contacto) {
  const c = leerConfig();
  if ((c.escucha || {}).confirmarAgendados) return false;
  const pedido = String(contacto || '').trim();
  if (!pedido) return false;
  if (/^(yo|mi|mí|mi mismo|mí mismo|a mi|a mí)$/i.test(pedido)) return true;
  try { return !!buscarPorNombre(c.contactos || [], pedido); } catch { return false; }
}

// Saca una captura de la pantalla para que un modelo la mire (si en Ajustes → Contexto está permitido).
async function tomarPantalla(s) {
  const c = leerConfig().contexto || {};
  if (!c.verPantalla) throw new Error('Mirar la pantalla está apagado: se prende en Ajustes → Contexto, porque la captura se manda al modelo que la mira.');
  const [captura, ventana] = await Promise.all([contexto.capturarPantalla({ ancho: c.anchoCaptura || 1280 }), contexto.ventanaActiva().catch(() => null)]);
  s.foto = captura.jpeg.toString('base64');
  s.fotoTipo = 'pantalla';
  s.ventana = ventana ? contexto.describir(ventana) : '';
  historial.anotar(`Captura de pantalla para el modelo: ${Math.round(captura.jpeg.length / 1024)} KB${s.ventana ? `, ventana al frente: ${s.ventana}` : ''}`);
}
const textoDeImagen = (s) => (s.fotoTipo === 'pantalla'
  ? `Esta es una captura de la pantalla del usuario${s.ventana ? ` (lo que tiene al frente: ${s.ventana})` : ''}. Respondé lo que te pidió según lo que se ve, en una o dos frases cortas y sin inventar lo que no se ve. Si pregunta cómo avanzar en un juego, decile el próximo paso concreto.`
  : 'Esta es la foto de la webcam. Respondé lo que te pedí según lo que se ve.');

async function usar(nombre, a, s, confirmado = false) {
  const voz = { porVoz: true, pedirConfirmacion: (p) => { s.pendiente = { ...p, dicho: '' }; } };
  historial.anotar(`El modelo pidió ${nombre}(${JSON.stringify(a || {}).slice(0, 200)})`);
  if (!confirmado && CON_CONFIRMACION.has(nombre) && confirmarActivo() && !esDeConfianza((a || {}).contacto) && !conexion.sinConexion()) { // sin conexión pregunta la propia acción (¿lo dejo en cola?)
    s.pendiente = { herramienta: { nombre, args: a || {} }, dicho: s.dichoActual || '' };
    s.preguntar = `Entendí: ${queEntendi(nombre, a || {})}. ¿Lo hago?`;
    historial.anotar('Pido confirmación antes de hacerlo (lo interpretó un modelo).');
    return 'Esperando que el usuario confirme. No digas que ya está hecho.';
  }
  switch (nombre) {
    case 'ejecutar_rutina': return resumenDeRutina(await acciones.ejecutarRutina(a.rutina, voz));
    case 'controlar_tele': return acciones.ejecutarPaso({ tipo: 'tele', ...a }, voz);
    case 'reproducir_en_tele': return acciones.ejecutarPaso({ tipo: 'reproducir', ...a }, voz);
    case 'controlar_casa': return acciones.ejecutarPaso({ tipo: 'casa', ...a }, voz);
    case 'enviar_whatsapp': return acciones.ejecutarPaso({ tipo: 'whatsapp', ...a }, voz);
    case 'enviar_foto_whatsapp': { const r = await acciones.ejecutarPaso({ tipo: 'foto_whatsapp', ...a }, voz); s.foto = null; s.fotoEnviada = true; return r; }
    case 'enviar_audio_whatsapp': { const r = await acciones.ejecutarPaso({ tipo: 'audio_whatsapp', ...a }, voz); return s.pendiente ? `${r} (TODAVÍA NO se mandó: preguntale al usuario si lo mando.)` : r; }
    case 'mirar_camara': if (s.fotoEnviada) return 'La foto ya se mandó; no hace falta mirarla.'; s.foto = Buffer.from(await acciones.pedirFoto()).toString('base64'); s.fotoTipo = 'camara'; return 'Foto tomada. Te la paso en el próximo mensaje.';
    case 'descargar': return acciones.ejecutarPaso({ tipo: 'descargar', modo: a.modo, calidad: a.calidad, url: a.url }, voz);
    case 'anotar': { const r = await acciones.ejecutarPaso({ tipo: 'nota', texto: a.texto, minutos: a.minutos, hora: a.hora, contexto: !!a.contexto }, voz); return r; }
    case 'mirar_pantalla': { await tomarPantalla(s); return 'Captura tomada. Te la paso en el próximo mensaje.'; }
    case 'abrir_programa': return acciones.ejecutarPaso({ tipo: 'abrir', ...a }, voz);
    case 'cambiar_salida_audio': return acciones.ejecutarPaso({ tipo: 'salida_audio', ...a }, voz);
    case 'volumen_pc': return acciones.ejecutarPaso({ tipo: 'volumen', ...a }, voz);
    case 'cambiar_modo': return acciones.ejecutarPaso({ tipo: 'modo', ...a }, voz);
    case 'crear_recordatorio': { const r = recordatorios.crear(a); acciones.marcarExito(); return r; }
    case 'reproducir_musica': return acciones.ejecutarPaso({ tipo: 'musica', busqueda: a.busqueda, dispositivo: a.dispositivo }, voz);
    case 'buscar_en_internet': return acciones.ejecutarPaso({ tipo: 'buscar', consulta: a.consulta }, voz);
    case 'clima': return acciones.ejecutarPaso({ tipo: 'clima', lugar: a.lugar, cuando: a.cuando }, voz);
    case 'ver_contenido': return acciones.ejecutarPaso({ tipo: 'ver', titulo: a.titulo, servicio: a.servicio, dispositivo: a.dispositivo }, voz);
    case 'ver_partido': return acciones.ejecutarPaso({ tipo: 'partido', equipo: a.equipo }, voz);
    case 'novedades': return acciones.ejecutarPaso({ tipo: 'avisos', accion: a.accion, origen: a.origen }, voz);
    case 'agenda': return acciones.ejecutarPaso({ tipo: 'agenda', cuando: a.cuando || 'hoy' }, voz);
    case 'clips': return acciones.ejecutarPaso({ tipo: 'clip', accion: a.accion, segundos: a.segundos, contacto: a.contacto, ultimo: !!a.ultimo }, voz);
    case 'crear_evento': return acciones.ejecutarPaso({ tipo: 'evento', titulo: a.titulo, inicio: a.inicio, duracionMin: a.duracion_min, todoElDia: !!a.todo_el_dia, lugar: a.lugar }, voz);
    case 'controlar_musica': return acciones.ejecutarPaso({ tipo: 'musica_control', accion: a.accion }, voz);
    case 'terminar_conversacion': s.terminar = true; return 'Listo. Despedite en una frase corta.';
    default: throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

// Lo que conviene decir después de una rutina: lo que la rutina misma mandaba a decir, o un "listo".
function resumenDeRutina(r) {
  const dichos = r.hechos.map((h) => /^Decile al usuario: (.*)$/s.exec(String(h))).filter(Boolean).map((m) => m[1]);
  const base = dichos.length ? dichos.join(' ') : `${r.rutina}, listo.`;
  return r.ok ? base : `${dichos.join(' ')} Hice "${r.rutina}", pero algo falló: ${r.errores.join('; ')}`.trim();
}

async function decidirSinModelo(directo) {
  let pendiente = null;
  const ctx = { porVoz: true, pedirConfirmacion: (p) => { pendiente = { ...p, dicho: '' }; } };
  if (directo.rutina) {
    try { return { texto: resumenDeRutina(await acciones.ejecutarRutina(directo.rutina, ctx)), pendiente }; } catch (e) { return { texto: `No pude: ${e.message}` }; }
  }
  const resultados = [];
  for (const paso of directo.pasos) {
    try { resultados.push(String(await acciones.ejecutarPaso(paso, ctx))); } catch (e) { return { texto: `No pude: ${e.message}` }; }
  }
  return { texto: directo.respuesta !== undefined && !pendiente ? directo.respuesta : resultados.join(' '), terminar: !!directo.terminar, pendiente };
}

async function decidirConModelo(dicho, s) {
  const mensajes = [{ role: 'system', content: instrucciones() }, ...s.historial.slice(-8), { role: 'user', content: dicho }];
  // "¿Qué estoy viendo?", "¿cómo avanzo en este juego?": la captura ya va en el primer mensaje (un modelo no siempre se acuerda de pedirla).
  if (comandos.pedidoDePantalla(dicho)) {
    try { await tomarPantalla(s); } catch (e) { return { texto: e.message }; }
    mensajes[mensajes.length - 1] = { role: 'user', content: [{ type: 'text', text: `${dicho}\n\n${textoDeImagen(s)}` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${s.foto}` } }] };
    s.foto = null; s.viendo = true;
  }
  const utiles = herramientas();
  const hechos = []; // resultados de herramientas, por si el modelo deja de responder a mitad de camino
  let fallo = ''; // el motivo del último error de una herramienta (si después no se arregló): se le dice al usuario tal cual
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    let r;
    try {
      r = await pensar.preguntar(mensajes, utiles, { conImagen: !!s.viendo });
    } catch (e) {
      if (hechos.length) return { texto: hechos.join(' ') };
      if (s.viendo) {
        const que = s.fotoTipo === 'pantalla' ? 'la captura' : 'la foto';
        if (e.sinConexion) return { texto: `Saqué ${que}, pero ${conexion.motivo().toLowerCase()} y no tengo un modelo en esta PC que la mire.` };
        return { texto: e.sinModelos ? `Saqué ${que}, pero para contarte qué se ve necesito algún modelo configurado en Ajustes, en Inteligencia.` : `Saqué ${que}, pero ningún modelo pudo mirarla. ${e.message}.` };
      }
      if (e.sinConexion) return { sinModelo: true, texto: `${conexion.motivo()} y no tengo un modelo en esta PC (Ollama), así que no puedo pensar pedidos libres. Sí puedo hacer lo de la PC, los clips, los recordatorios y las rutinas.` };
      if (e.sinModelos) return { sinModelo: true, texto: 'Eso no lo puedo resolver solo. Para pedidos libres hay que configurar un modelo gratuito en Ajustes, en Inteligencia.' };
      return { sinModelo: true, texto: `No pude pensar la respuesta. ${e.message}.` };
    }
    if (!r.llamadas.length) return { texto: conMotivo(r.texto || (hechos.length ? hechos.join(' ') : 'Listo.'), fallo) };
    mensajes.push(r.mensaje);
    for (const llamada of r.llamadas) {
      let resultado;
      try { resultado = String(await usar(llamada.nombre, llamada.args, s)); hechos.push(resultado); fallo = ''; } catch (e) { resultado = `ERROR: ${e.message}`; hechos.push(`No pude: ${e.message}`); fallo = e.message; }
      mensajes.push({ role: 'tool', tool_call_id: llamada.id, content: resultado });
      if (s.cerrada) return { texto: '' };
    }
    if (s.preguntar) { const q = s.preguntar; s.preguntar = null; return { texto: q }; }
    // Mandar una foto no necesita que ningún modelo la vea: se contesta con el resultado y se termina.
    if (s.fotoEnviada && !s.foto) return { texto: hechos.join(' ') };
    if (s.foto) {
      mensajes.push({ role: 'user', content: [{ type: 'text', text: textoDeImagen(s) }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${s.foto}` } }] });
      s.foto = null; s.viendo = true; hechos.length = 0;
    }
  }
  return { texto: hechos.join(' ') || 'Listo.' };
}

// Si una herramienta falló y el modelo contestó "No pude abrir X" sin decir por qué, se agrega el motivo (trae qué hacer: "falta vincular…").
function conMotivo(texto, fallo) {
  if (!fallo) return texto;
  const t = String(texto || '');
  if (t.toLowerCase().includes(String(fallo).slice(0, 24).toLowerCase())) return t;
  return `${t.replace(/[\s.]*$/, '')}. ${fallo}`;
}

// La respuesta a un "¿lo hago?": sí lo hace (y si lo interpretó un modelo, aprende la frase), no lo cancela;
// cualquier otra cosa se toma como un pedido nuevo.
const DICE_SI = /^(si|sii+|dale|daleee*|hacelo|hacela|ok|okey|oka|claro|obvio|de una|correcto|exacto|eso|eso es|confirmo|confirmado|mandalo|mandala|adelante|por supuesto|si dale|si hacelo|si hacela|si claro|si por favor|joya|perfecto|buenisimo)( .*)?$/;
const DICE_NO = /^(no|nop|nope|noo+|cancela|cancelar|mejor no|dejalo|deja|nada|no gracias|no hagas nada|ni en pedo|negativo)( .*)?$/;
async function resolverPendiente(dicho, s) {
  const p = s.pendiente;
  s.pendiente = null;
  const t = comandos.limpiar(dicho);
  if (DICE_NO.test(t)) { historial.anotar('Dijo que no: no se hace.'); return { texto: (p.descartar && p.descartar()) || 'Listo, no hago nada.', terminar: true }; }
  if (!DICE_SI.test(t)) return null; // era otro pedido
  historial.anotar('Confirmó: se hace.');
  if (p.accion) { // algo ya preparado (por ejemplo un audio grabado) que solo faltaba mandar
    try { return { texto: String(await p.accion()), terminar: true }; } catch (e) { return { texto: `No pude: ${e.message}` }; }
  }
  if (p.herramienta) {
    const { nombre, args } = p.herramienta;
    let texto;
    try { texto = String(await usar(nombre, args, s, true)); } catch (e) { return { texto: `No pude: ${e.message}` }; }
    if (p.dicho && aprendido.aprender(p.dicho, nombre, args)) historial.anotar('Aprendí la frase: la próxima vez lo hago sin preguntar.');
    return { texto, terminar: !!s.terminar };
  }
  const { confirmar, ...directo } = p.directo;
  const r = await decidirSinModelo(directo);
  return { texto: r.texto, terminar: !!(r.terminar || s.terminar) };
}

async function decidir(dicho, s) {
  s.terminar = false; s.viendo = false; s.foto = null; s.fotoTipo = ''; s.ventana = ''; s.fotoEnviada = false; s.preguntar = null; s.dichoActual = dicho;
  if (s.pendiente) {
    const r = await resolverPendiente(dicho, s);
    if (r) { s.historial.push({ role: 'user', content: dicho }, { role: 'assistant', content: r.texto || 'Listo.' }); return { texto: r.texto, terminar: !!r.terminar }; }
  }
  // Algo que ya se le enseñó (una frase confirmada antes): se hace directo.
  const conocida = aprendido.buscar(dicho);
  if (conocida) {
    historial.anotar(`Frase aprendida antes: ${conocida.nombre}, sin modelo y sin preguntar.`);
    let texto;
    try { texto = String(await usar(conocida.nombre, conocida.args, s, true)); } catch (e) { texto = `No pude: ${e.message}`; }
    s.historial.push({ role: 'user', content: dicho }, { role: 'assistant', content: texto });
    return { texto, terminar: false };
  }
  const directo = comandos.resolver(dicho, { programas: puente.programas() });
  if (directo && directo.confirmar && confirmarActivo()) {
    s.pendiente = { directo, dicho };
    historial.anotar(`Regla directa con dudas: ${directo.confirmar}`);
    s.historial.push({ role: 'user', content: dicho }, { role: 'assistant', content: directo.confirmar });
    return { texto: directo.confirmar, terminar: false };
  }
  historial.anotar(directo && directo.nota ? directo.nota : directo
    ? `Regla directa, sin modelo: ${directo.rutina ? `rutina ${directo.rutina}` : directo.pasos.map((p) => p.tipo).join(', ') || 'respuesta fija'}`
    : 'Ninguna regla directa lo cubre: se lo paso a un modelo.');
  let r;
  if (directo && directo.deporte) {
    // Marcador o fecha de un equipo: la consulta ya va armada con el sentido correcto; se dice lo encontrado, cortito.
    r = await decidirSinModelo(directo);
    r.texto = internet.recortar(String(r.texto).replace(/^- /gm, ''), 420);
  } else if (directo && directo.resumir) {
    // Una búsqueda: lo mejor es que un modelo lea lo encontrado y conteste corto; si no hay ninguno, se dice tal cual.
    r = await decidirConModelo(dicho, s);
    if (r.sinModelo) { r = await decidirSinModelo(directo); r.texto = internet.recortar(String(r.texto).replace(/^- /gm, ''), 420); }
  } else {
    r = directo ? await decidirSinModelo(directo) : await decidirConModelo(dicho, s);
  }
  if (r.pendiente) s.pendiente = r.pendiente;
  s.historial.push({ role: 'user', content: dicho }, { role: 'assistant', content: r.texto || 'Listo.' });
  return { texto: r.texto, terminar: !!(r.terminar || s.terminar) };
}

// ---------- La conversación ----------
let sesion = null;

class Sesion {
  constructor() {
    this.historial = [];
    this.cerrada = false;
    this.escuchando = false;
    this.ocupada = false;
    this.vacios = 0;
    this.reloj = null;
    this.origen = 'voz'; // de dónde vino el pedido que se está atendiendo (para el historial)
    this.dictado = null; // si no es una conversación sino un dictado: a quién entregarle el texto
  }

  escuchar() {
    if (this.cerrada) return;
    if (!puedeEscuchar()) { this.cerrar(); return; } // conversación solo por texto: no queda esperando
    this.escuchando = true;
    puente.estado('escuchando');
    oido.escuchar(true);
    this.esperarVoz();
  }

  // Si pasan unos segundos sin que nadie hable, la conversación se cierra sola.
  esperarVoz() {
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => this.cerrar(), (Number(leerConfig().escucha.segundosExtra) || 7) * 1000);
  }

  async alSegmento(pcm) {
    if (this.cerrada || !this.escuchando) return;
    this.escuchando = false;
    clearTimeout(this.reloj);
    // Desde cuándo habló (aprox.): un clip pedido en esta charla termina ahí, así no se oye el pedido ni la respuesta de Jarvis.
    // Ya no se silencia tu voz en los clips: perder audio del juego es peor que oír un "ey Jarvis" al final.
    const desdeHablo = Date.now() - (muestras(pcm).length / 16000) * 1000 - 250;
    clips.marcarPedidoDeVoz(desdeHablo, { primeraDeLaCharla: !this.yaHablo });
    this.yaHablo = true;
    puente.estado('pensando');
    let dicho = '';
    const inicio = Date.now();
    try { dicho = await transcribir(pcm); } catch (e) { if (!this.cerrada) { this.cerrar(); puente.estado('error', `No pude entender el audio: ${e.message}`); } return; }
    if (this.cerrada) return;
    this.escucha = `Escucha (${usaGroqParaEscuchar() ? 'Groq o local' : 'local'}): ${((muestras(pcm).length / 16000)).toFixed(1)} s de audio, pasado a texto en ${Date.now() - inicio} ms`;
    if (this.dictado) { // era un dictado (la respuesta a un aviso): se entrega el texto y listo
      const entregar = this.dictado; this.dictado = null;
      this.cerrar();
      entregar(dicho.trim());
      return;
    }
    if (!comandos.limpiar(dicho)) { // ruido, o solo dijo "Jarvis": seguimos escuchando un poco más
      if (++this.vacios >= 2) this.cerrar(); else this.escuchar();
      return;
    }
    this.vacios = 0;
    await this.atender(dicho);
  }

  async atender(dicho) {
    if (this.cerrada || this.ocupada) return null;
    dicho = comandos.corregirNombre(dicho, formasEnsenadas()); // "Harvis" -> "Jarvis" (el oído lo escribe como suena)
    this.ocupada = true;
    this.escuchando = false;
    clearTimeout(this.reloj);
    oido.escuchar(false);
    puente.texto('vos', dicho);
    puente.estado('pensando');
    const entrada = historial.empezar(dicho, this.origen);
    if (this.escucha) { historial.anotar(this.escucha, { entrada }); this.escucha = ''; }
    if (this.despertar) { historial.anotar(this.despertar, { entrada }); this.despertar = ''; }
    let r;
    const antes = acciones.contadores();
    try { r = await decidir(dicho, this); } catch (e) { r = { texto: `Algo falló: ${e.message}` }; historial.anotar(e.stack || e.message, { error: true, entrada }); }
    historial.terminar(entrada, { respuesta: r.texto, ok: /^(No pude|Algo falló|Eso no lo puedo resolver)/.test(r.texto || '') ? false : undefined });
    this.origen = 'voz';
    if (this.cerrada) return;
    // ¿Se cumplió una acción de verdad (y nada falló)? Entonces los ojos muestran "ok" al empezar a contestar,
    // en vez de pasar directo a "hablando".
    const despues = acciones.contadores();
    const exito = despues.exitos > antes.exitos && despues.fallos === antes.fallos && !/^(No pude|Algo falló|Eso no lo puedo resolver)/.test(r.texto || '');
    // (main.js se encarga de que "ok" se vea un ratito antes de pasar al estado siguiente.)
    if (exito) puente.estado('ok');
    if (r.texto) {
      puente.texto('jarvis', r.texto);
      if (habla() && !this.callada) { puente.estado('hablando'); await hablar(r.texto); }
    }
    this.ocupada = false;
    // Charla desde el celular: no abre el micrófono de la PC ni se cierra sola; devuelve la respuesta a quien preguntó.
    if (this.remota) { if (!sesion) puente.estado('reposo'); return r; }
    if (this.cerrada) return r;
    // ¿Sigue escuchando? Por defecto solo si Jarvis preguntó algo ("¿A quién se lo mando?"): la mayoría
    // de los pedidos no necesitan respuesta, y quedarse escuchando hace que tome por pedido cualquier
    // cosa que suene después (la letra de la canción que acaba de poner, por ejemplo).
    const seguir = leerConfig().escucha.seguir || 'pregunta';
    const pregunto = /\?["»”)\s]*$/.test(String(r.texto || '').trim());
    if (r.terminar || seguir === 'nunca' || (seguir === 'pregunta' && !pregunto)) this.cerrar(); else this.escuchar();
    return r;
  }

  cerrar() {
    if (this.cerrada) return;
    this.cerrada = true;
    clearTimeout(this.reloj);
    oido.escuchar(false);
    if (this.dictado) { const entregar = this.dictado; this.dictado = null; entregar(''); } // no se dictó nada
    if (sesion === this) { sesion = null; puente.estado('reposo'); }
  }
}

oido.alHabla(() => { if (sesion && sesion.escuchando) { clearTimeout(sesion.reloj); sesion.reloj = setTimeout(() => sesion && sesion.cerrar(), 40000); } });
oido.alNada(() => { if (sesion && sesion.escuchando) sesion.esperarVoz(); });
oido.alSegmento((pcm) => { if (sesion) sesion.alSegmento(pcm).catch((e) => console.error('[cerebro]', e)); });

const activa = () => !!sesion;

const FALTA_OIDO = 'Para escucharte falta bajar el modelo de escucha (una sola vez). Pasá el mouse por el notch y tocá "Bajar".';

// Empieza a escuchar (por la palabra clave, el atajo o el botón del micrófono).
async function activar() {
  if (sesion) { if (sesion.escuchando) sesion.esperarVoz(); return true; }
  if (!puedeEscuchar()) { puente.estado('error', FALTA_OIDO); return false; }
  const nueva = new Sesion();
  sesion = nueva;
  puente.estado('escuchando');
  try {
    await oido.preparar();
  } catch (e) {
    nueva.cerrar();
    puente.estado('error', `No pude iniciar la escucha en esta PC: ${e.message}`);
    return false;
  }
  if (nueva.cerrada) return false;
  nueva.escuchar();
  return true;
}

function audio(pcm) { if (sesion && sesion.escuchando) oido.audio(muestras(pcm)); }

// ---------- Vigilia: que alcance con decir "Jarvis" (con cualquier acento) ----------
// El micrófono manda audio todo el tiempo; mientras no hay conversación, el proceso de voz corta lo
// que se dice en frases, las pasa a texto y avisa acá. Si la frase nombra a Jarvis, se despierta; y
// si además ya trae el pedido ("Jarvis, poné música"), lo atiende sin hacerte esperar la campanita.
function vigilia(pcm) {
  if (sesion || !leerConfig().voz.porTranscripcion || Date.now() < finAudio + 700) return; // (no escucharse a sí mismo)
  oido.vigilar(muestras(pcm));
}
// El detector clásico de "Hey Jarvis" avisa cuando nota algo aunque no llegue a su umbral: solo no
// alcanza para despertar, pero sumado a un texto que suena parecido a "Jarvis", sí.
let ultimaPista = { cuando: 0, valor: 0 };
function pista(valor) { ultimaPista = { cuando: Date.now(), valor: Number(valor) || 0 }; }
const formasEnsenadas = () => String(leerConfig().voz.tambien || '').split(',').map((x) => x.trim()).filter(Boolean);

// Decide si lo que se oyó llama a Jarvis. Devuelve { resto, nota } o null.
function loLlaman(texto, segundos) {
  const extras = formasEnsenadas();
  let llamado = comandos.despertar(texto, { extras });
  let motivo = 'oí mi nombre';
  const hayPista = require('./nombre').esJarvis() && ultimaPista.valor >= 0.012 && Date.now() - ultimaPista.cuando < (Number(segundos) || 0) * 1000 + 3500;
  // Con música sonando por los parlantes no se acepta la forma aproximada: una letra podría parecérsele.
  if (!llamado && hayPista && !musica.estado().sonando) {
    llamado = comandos.despertar(texto, { extras, flojo: true });
    motivo = `oí algo parecido a mi nombre y el detector clásico también lo notó (${ultimaPista.valor.toFixed(2)})`;
  }
  if (!llamado && musica.estado().sonando) {
    llamado = comandos.despertarEnMedio(texto, { extras });
    if (llamado) motivo = 'oí mi nombre en medio de la música';
  }
  return llamado ? { resto: llamado.resto, nota: `Me desperté porque ${motivo}: "${texto}"` } : null;
}
oido.alVigilia((texto, segundos) => {
  if (sesion || !leerConfig().voz.porTranscripcion) return;
  const llamado = loLlaman(texto, segundos);
  if (!llamado) return;
  ultimaPista = { cuando: 0, valor: 0 };
  // La frase ya terminó y se pasó a texto: habló hace (su duración + el silencio de corte + la transcripción), más o menos.
  const desdeHablo = Date.now() - (Number(segundos) || 3) * 1000 - 1500;
  clips.marcarPedidoDeVoz(desdeHablo, { primeraDeLaCharla: true });
  if (comandos.limpiar(llamado.resto)) {
    const nueva = new Sesion();
    nueva.yaHablo = true; // el pedido vino con el nombre: la marca de la vigilia es la buena
    nueva.despertar = llamado.nota;
    sesion = nueva;
    nueva.atender(llamado.resto).catch((e) => console.error('[cerebro]', e));
  } else {
    activar().then(() => { if (sesion) { sesion.despertar = llamado.nota; sesion.yaHablo = true; } }).catch(() => {});
  }
});

// "Enseñarle" cómo decís Jarvis: de lo que entendió cuando lo dijiste, la forma que conviene recordar.
function aprenderNombre(oido_) {
  const forma = comandos.formaNueva(oido_, formasEnsenadas());
  return { oido: oido_, yaLoReconoce: !!comandos.despertar(oido_, { extras: formasEnsenadas() }), forma };
}

// Un pedido escrito en el panel: no necesita el modelo de escucha.
async function texto(t) {
  const dicho = String(t || '').trim();
  if (!dicho) return;
  if (!sesion) sesion = new Sesion();
  sesion.origen = 'texto';
  clips.marcarPedidoDeVoz(0); // escrito: no hay nada que recortar
  await sesion.atender(dicho);
}

// Un pedido escrito desde otro aparato (el celular). Cada aparato tiene su propia charla (con su historial y lo
// que quedó por confirmar: "¿lo hago?" → "sí"), separada de la de la PC; se olvida tras 15 minutos sin uso.
// Por defecto Jarvis no lo dice en voz alta en la PC (puede no haber nadie, o sí y no tiene por qué oírlo).
const remotas = new Map(); // id -> { s, ultimo }
async function textoRemoto(t, { id = 'celular', enVoz = false, origen = 'celular' } = {}) {
  const dicho = String(t || '').trim().slice(0, 2000);
  if (!dicho) return { texto: '' };
  let r = remotas.get(id);
  if (!r || Date.now() - r.ultimo > 15 * 60000) {
    r = { s: new Sesion() };
    r.s.remota = true;
    r.s.yaHablo = true;
    remotas.set(id, r);
  }
  r.ultimo = Date.now();
  const s = r.s;
  if (s.ocupada) throw new Error('Todavía estoy con tu pedido anterior.');
  s.origen = origen;
  s.callada = !enVoz;
  clips.marcarPedidoDeVoz(0); // escrito: nada que recortar de un clip
  const res = await s.atender(dicho);
  return { texto: (res && res.texto) || '', espera: !!s.pendiente };
}
const olvidarRemota = (id) => remotas.delete(id);

// Dictado: escucha UNA frase y devuelve el texto, sin tratarla como un pedido (para contestar un
// aviso). Devuelve '' si no se dijo nada o se canceló.
async function dictar() {
  if (sesion) cancelar();
  if (!puedeEscuchar()) throw new Error(FALTA_OIDO);
  const nueva = new Sesion();
  sesion = nueva;
  const espera = new Promise((listo) => { nueva.dictado = listo; });
  puente.estado('escuchando');
  try { await oido.preparar(); } catch (e) { nueva.cerrar(); throw new Error(`No pude iniciar la escucha: ${e.message}`); }
  if (!nueva.cerrada) nueva.escuchar();
  return espera;
}

function cancelar() { callar(); if (sesion) sesion.cerrar(); }

// Deja los modelos cargados en memoria para que el primer "Hey Jarvis" no tenga que esperar.
async function preparar() {
  if (!modelos.instalado('vad')) return null;
  return oido.preparar();
}

module.exports = {
  _conMotivo: conMotivo, configurar, activar, activa, audio, vigilia, pista, loLlaman, aprenderNombre, dictar, texto, textoRemoto, olvidarRemota, cancelar, preparar, hablar, callar, probarVoz, puedeEscuchar,
  instrucciones, herramientas, transcribir, decidir, wav, FALTA_OIDO,
};
