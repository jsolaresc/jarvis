// Un solo lugar donde se ejecuta cada tipo de acción. Lo usan las rutinas (click o voz)
// y las herramientas que usa el cerebro cuando le pedís algo hablando.
const { leerRutinas, leerConfig, buscarPorNombre } = require('./config');
const conexion = require('./conexion');
const pc = require('./pc');
const cast = require('./cast');
const ha = require('./homeassistant');
const whatsapp = require('./whatsapp');
const recordatorios = require('./recordatorios');
const musica = require('./musica');
const internet = require('./internet');
const streaming = require('./streaming');
const notificaciones = require('./notificaciones');
const historial = require('./historial');
const calendario = require('./calendario');
const clips = require('./clips');
const notas = require('./notas');
const descargas = require('./descargas');
const fs = require('fs');

// main.js completa esto: { pedirAlNotch, fijarModo, decir }
const puente = {};
function configurar(funciones) { Object.assign(puente, funciones); }

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Los modos los define el usuario en Ajustes (config.modos); estas funciones los leen en vivo.
const modos = () => (leerConfig().modos || []);
const idsDeModos = () => modos().map((m) => m.id);

// Lo que se anota de cada paso en el historial: qué era, y cómo salió (sin el contenido de fotos ni audios).
function describir(paso) {
  const { tipo, ...resto } = paso;
  const datos = Object.entries(resto).filter(([, v]) => v !== undefined && v !== '' && typeof v !== 'object').map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`);
  return `${tipo}${datos.length ? ` (${datos.join(', ')})` : ''}`;
}

// Clips: guardar los últimos segundos, mandarlos por WhatsApp, grabar a pedido, prender y apagar.
const mmss = (s) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${Math.round(s % 60)} s` : ''}` : `${Math.round(s)} segundos`);
async function pasoClip(paso) {
  const { leerConfig: leer, guardarConfig } = require('./config');
  switch (paso.accion) {
    case 'guardar': {
      // Un clip "de jugada" ("grabá la última kill"): Jarvis no detecta qué pasó en el juego, guarda los últimos segundos y los rotula.
      const jugada = paso.evento ? { kill: 'Kill', muerte: 'Muerte', jugada: 'Jugada' }[paso.evento] || 'Jugada' : '';
      const segundos = paso.segundos || (jugada ? (leer().clips.segundosJugada || 30) : undefined);
      const c = await clips.guardarYAvisar({ segundos, etiqueta: jugada, hasta: clips.finDelPedido() });
      return jugada
        ? `Listo, guardé los últimos ${mmss(c.segundos)} como "${jugada}"${c.juego ? ` de ${c.juego}` : ''}. Si la jugada fue más atrás, decime por ejemplo "hacé un clip del último minuto".`
        : `Clip guardado: ${mmss(c.segundos)}${c.juego ? ` de ${c.juego}` : ''}.`;
    }
    case 'enviar': {
      const contacto = paso.contacto || leer().clips.enviarA;
      if (!contacto) throw new Error('Decime a quién se lo mando.');
      // "enviale el clip" / "el último minuto" arman un clip NUEVO (con la duración de Ajustes si no se dice otra); solo "el último clip" manda el que ya está guardado.
      const c = paso.ultimo && !paso.segundos && clips.ultimo() ? clips.ultimo() : await clips.guardarYAvisar({ segundos: paso.segundos, hasta: clips.finDelPedido() });
      const p = await clips.prepararParaEnviar(c.archivo);
      try { return await whatsapp.enviarVideo(contacto, fs.readFileSync(p.archivo)); } finally { if (p.temporal) { try { fs.unlinkSync(p.archivo); } catch {} } }
    }
    // Capturas de pantalla: se guardan junto a los clips; "enviar" saca una nueva (o manda la última si se pidió "la última").
    case 'captura': { const c = await clips.capturarYAvisar(); return `Captura guardada${c.juego ? ` en la carpeta de ${c.juego}` : ''}.`; }
    case 'captura-enviar': {
      const contacto = paso.contacto || leer().clips.enviarA;
      if (!contacto) throw new Error('Decime a quién se la mando.');
      const previa = paso.ultimo ? clips.ultimaDeCaptura() : null;
      const c = previa && fs.existsSync(previa.archivo) ? previa : await clips.capturarYAvisar();
      return whatsapp.enviarFoto(contacto, clips.capturaParaEnviar(c.archivo));
    }
    case 'grabar': return clips.empezarGrabacion(['pantalla', 'ventana', 'recuadro'].includes(paso.modo) ? paso.modo : undefined);
    case 'pausar': return clips.pausarGrabacion(true);
    case 'seguir': return clips.pausarGrabacion(false);
    case 'parar': { const c = await clips.terminarGrabacion(); return `Grabación guardada: ${mmss(c.segundos)}${c.juego ? ` de ${c.juego}` : ''}.`; }
    case 'activar': case 'desactivar': {
      const activo = paso.accion === 'activar';
      guardarConfig({ ...leer(), clips: { ...leer().clips, activo } });
      await clips.sincronizar();
      return activo ? (clips.permitidoAhora() ? 'Clips activados.' : 'Clips activados, pero este modo no los usa: se habilitan en Ajustes, Interfaz, Modos.') : 'Clips desactivados.';
    }
    default: throw new Error(`Acción de clips desconocida: ${paso.accion}`);
  }
}

// Notas: anotar algo (con o sin hora, con o sin el contexto de lo que estás viendo), contarlas o abrir la pantalla de notas.
async function pasoNota(paso) {
  if (paso.accion === 'resumen') return notas.resumenDicho();
  if (paso.accion === 'abrir') { if (puente.abrirAjustes) puente.abrirAjustes('notas'); return 'Te abrí las notas.'; }
  const r = await notas.crear({ texto: paso.texto, minutos: paso.minutos, hora: paso.hora, conContexto: !!paso.contexto });
  return r.mensaje;
}

// Cuenta de lo que se hizo, para que el notch muestre el estado "ok" cuando un pedido se cumplió de verdad.
// Las consultas (clima, búsquedas, agenda, novedades) y el "decir" no cuentan: son respuestas, no acciones.
const INFORMATIVOS = new Set(['clima', 'buscar', 'agenda', 'avisos', 'decir', 'esperar']);
const cuenta = { exitos: 0, fallos: 0 };
const contadores = () => ({ ...cuenta });
const marcarExito = () => { cuenta.exitos++; };

// contexto.porVoz: se pidió en una conversación (el cerebro dice el resultado, no hace falta "decir").
async function ejecutarPaso(paso, contexto = {}) {
  const inicio = Date.now();
  try {
    const r = await hacer(paso, contexto);
    historial.anotar(`Acción ${describir(paso)} → ${String(r).slice(0, 160)} (${Date.now() - inicio} ms)`);
    if (!INFORMATIVOS.has(paso.tipo)) cuenta.exitos++;
    return r;
  } catch (e) {
    historial.anotar(`Acción ${describir(paso)} → falló: ${e.message}`, { error: true });
    cuenta.fallos++;
    throw e;
  }
}

const SIN_RED = {
  foto_whatsapp: 'mandar fotos por WhatsApp', audio_whatsapp: 'mandar audios por WhatsApp', musica: 'poner música de YouTube', ver: 'abrir series o películas',
  partido: 'buscar el partido', clima: 'consultar el clima', buscar: 'buscar en internet', evento: 'crear el evento en Google Calendar', clip: 'mandar el clip por WhatsApp', whatsapp: 'mandar el mensaje por WhatsApp',
};
// Pasos que necesitan internet cuando no hay (cortada, o el modo sin conexión prendido a mano). Un texto de WhatsApp puede quedar en cola.
function sinConexionPara(paso, contexto) {
  const que = conexion.queHacerSinConexion(paso);
  if (!que) return null;
  if (paso.tipo === 'whatsapp' && (paso.minutos || paso.hora)) return null; // programado para después: se guarda y a su hora se vuelve a ver
  if (que === 'no') throw new Error(`${conexion.motivo()}: no puedo ${SIN_RED[paso.tipo] || 'hacer eso'}.`);
  const para = /^(yo|mi|mí)$/i.test(String(paso.contacto || '').trim()) ? 'vos' : paso.contacto;
  const dejar = () => { conexion.encolar({ tipo: 'whatsapp', contacto: paso.contacto, mensaje: paso.mensaje }); return `Listo, lo dejé en cola: le llega a ${para} apenas vuelva internet.`; };
  if (contexto.porVoz && contexto.pedirConfirmacion) { // hablando: se pregunta cada vez
    contexto.pedirConfirmacion({ accion: async () => dejar(), descartar: () => 'Listo, no lo mando.' });
    return `${conexion.motivo()}. Para mandarle a ${para} "${String(paso.mensaje || '').slice(0, 120)}", ¿lo dejo en cola y sale apenas vuelva internet?`;
  }
  return dejar(); // por un botón o una rutina no hay a quién preguntarle: queda en cola
}

async function hacer(paso, contexto) {
  const enCola = sinConexionPara(paso, contexto);
  if (enCola) return enCola;
  switch (paso.tipo) {
    case 'abrir': return pc.abrirPrograma(paso.programa);
    case 'juego': return pc.abrirJuego(paso);
    case 'cerrar': return pc.cerrarPrograma(paso.proceso);
    case 'salida_audio': return pc.cambiarSalida(paso.salida);
    case 'volumen': return pc.volumen(paso.nivel);
    case 'tele': return cast.controlar(paso.tele, paso.accion, paso.valor);
    case 'reproducir': return cast.reproducir(paso.tele, paso.origen, paso.titulo);
    case 'casa': return ha.controlarCasa(paso.dispositivo, paso.accion, paso.valor);
    case 'whatsapp':
      // Con "minutos" u "hora" se deja programado para después (queda en Notas, donde se puede cambiar o borrar).
      if (paso.minutos || paso.hora) return notas.programarMensaje({ contacto: paso.contacto, mensaje: paso.mensaje, minutos: paso.minutos, hora: paso.hora }).mensaje;
      return whatsapp.enviarTexto(paso.contacto, paso.mensaje);
    case 'foto_whatsapp': {
      const foto = await puente.pedirAlNotch('foto', {});
      return whatsapp.enviarFoto(paso.contacto, foto, paso.epigrafe);
    }
    case 'audio_whatsapp': {
      // Nota de voz con tu voz: graba hasta que dejes de hablar (o los segundos pedidos). Hablando, antes de mandarla la
      // reproduce y pregunta "¿La mando?"; por un botón o con la revisión apagada, sale directo.
      const revisar = contexto.porVoz && (leerConfig().audios || {}).revisar !== false && !!contexto.pedirConfirmacion;
      const grab = await puente.pedirAlNotch('audio', { segundos: paso.segundos ? Math.max(2, Math.min(60, Number(paso.segundos))) : 0, max: 60, vistaPrevia: revisar }, 120000);
      if (!grab || grab.vacio) throw new Error('No te escuché nada, así que no mandé el audio.');
      const mandar = () => whatsapp.enviarAudio(paso.contacto, grab.ogg, grab.segundos);
      if (!revisar) return mandar();
      contexto.pedirConfirmacion({ accion: mandar, descartar: () => 'Listo, no lo mando.' });
      return `Grabé ${Math.round(grab.segundos)} segundos. ¿Lo mando${paso.contacto && !/^(yo|mi)$/i.test(paso.contacto) ? ` a ${paso.contacto}` : ''}?`;
    }
    case 'decir':
      if (contexto.porVoz) return `Decile al usuario: ${paso.texto}`;
      puente.decir(paso.texto);
      return 'Dicho.';
    case 'pedido': {
      // Pedirle algo a Jarvis como si lo escribieras ("apagá la tele del comedor y poné música").
      if (!puente.pedido) throw new Error('No puedo pedirle cosas a Jarvis desde acá.');
      if (!String(paso.texto || '').trim()) throw new Error('Falta qué pedirle.');
      return (await puente.pedido(String(paso.texto))) || 'Listo.';
    }
    case 'esperar': await esperar(Math.max(0, Math.min(120, Number(paso.segundos) || 1)) * 1000); return 'Listo.';
    case 'notavoz': {
      if (paso.accion === 'parar') {
        const r = await puente.pedirAlNotch('notavoz', { accion: 'parar', recorte: contexto.porVoz ? 2.5 : 0 }, 60000);
        return r && r.nombre ? `Listo, guardé la nota de voz (${Math.round(r.segundos)} segundos).` : 'No había ninguna nota grabándose, o no se oyó nada.';
      }
      const r = await puente.pedirAlNotch('notavoz', { accion: 'grabar' }, 30000);
      return r && r.ya ? 'Ya estoy grabando una nota de voz.' : 'Estoy grabando la nota de voz. Decime "parar la nota de voz" cuando termines.';
    }
    case 'conexion': {
      if (paso.accion === 'estado') { const e = conexion.estado(); return e.sin ? `${conexion.motivo()}.` : (e.problemas.length ? `Hay internet, pero ${e.problemas.map((x) => x.nombre).join(', ')} no anda.` : 'Hay internet y todo anda.'); }
      conexion.fijarManual(paso.accion === 'sin');
      return paso.accion === 'sin' ? 'Listo, paso a modo sin conexión: no uso internet hasta que me digas que vuelva.' : (conexion.hayInternet() ? 'Listo, vuelvo a usar internet.' : 'Apagué el modo sin conexión, pero igual no hay internet por ahora: vuelvo solo cuando regrese.');
    }
    case 'modo':
      if (!idsDeModos().includes(paso.modo)) throw new Error(`Modo desconocido: ${paso.modo}`);
      puente.fijarModo(paso.modo);
      return `Modo ${paso.modo}.`;
    case 'recordatorio': return recordatorios.crear(paso);
    case 'nota': return pasoNota(paso);
    case 'descargar': return paso.modo === 'cancelar' ? descargas.cancelar() : descargas.iniciar({ modo: paso.modo, calidad: paso.calidad, url: paso.url });
    case 'musica': return musica.reproducir(paso.busqueda, paso.dispositivo);
    case 'clima': return internet.clima(paso.lugar, paso.cuando);
    case 'buscar': return internet.buscar(paso.consulta);
    case 'ver': return streaming.ver(paso);
    case 'poner': return streaming.poner(paso);
    case 'partido': return streaming.partido(paso);
    case 'avisos':
      if (paso.accion === 'limpiar') { notificaciones.limpiar(paso.origen); return 'Listo, borré las novedades.'; }
      return paso.accion === 'leer' ? notificaciones.leerEnVozAlta(paso.origen) : notificaciones.contar(paso.origen);
    case 'agenda': return calendario.agenda(paso.cuando);
    case 'evento': return calendario.crearEvento(paso);
    case 'clip': return pasoClip(paso);
    case 'musica_control': return musica.controlar(paso.accion);
    default: throw new Error(`Tipo de paso desconocido: ${paso.tipo}`);
  }
}

// Ejecuta todos los pasos; si uno falla, sigue con el resto y lo cuenta al final.
async function ejecutarRutina(pedido, contexto = {}) {
  const rutinas = leerRutinas();
  const rutina = rutinas.find((r) => r.id === pedido) || buscarPorNombre(rutinas, pedido);
  if (!rutina) throw new Error(`No existe la rutina "${pedido}".`);
  const hechos = [];
  const errores = [];
  for (const paso of rutina.pasos || []) {
    try { hechos.push(await ejecutarPaso(paso, contexto)); } catch (e) { errores.push(e.message); }
  }
  return { rutina: rutina.nombre, ok: errores.length === 0, hechos, errores };
}

const pedirFoto = () => puente.pedirAlNotch('foto', {});

module.exports = { contadores, marcarExito, configurar, ejecutarPaso, ejecutarRutina, pedirFoto, modos, idsDeModos };
