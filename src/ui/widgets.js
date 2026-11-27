// Los widgets del panel del notch (lo que se ve al pasar el mouse). El panel de cada modo es una lista ordenada de widgets en una
// grilla de 4 columnas: un widget ocupa de 1 a 4 columnas (tam) y 1 o 2 filas (alto). Lo usan el notch (para dibujarlos) y la
// ventana de Jarvis (para editarlos). Lo que está vacío (sin acciones rápidas, sin novedades, clips apagados) no se muestra.
export const COLUMNAS = 4;
export const NOMBRE_DE_TAM = { 1: 'Chico', 2: 'Mitad', 3: 'Tres cuartos', 4: 'Ancho' };
export const NOMBRE_DE_ALTO = { 1: 'Normal', 2: 'Doble' };
// Colores para personalizar cada widget ('' = el de los ojos).
export const COLORES_WIDGET = ['', '#6EE787', '#FFC857', '#FF8FA3', '#C3A6FF', '#6EA8FE', '#FF9F5A', '#FFFFFF'];

const BOTON = [1, 2, 3, 4];
// unico: solo puede haber uno en el panel. datos: lo que hay que completar al agregarlo. altos: alturas posibles (1 = normal, 2 = doble).
// color: se le puede elegir color. grupo: para ordenar la paleta.
export const TIPOS = {
  // Jarvis
  texto: { grupo: 'Jarvis', nombre: 'Escribir y hablar', icono: 'mic', tams: [4], unico: true, ayuda: 'El campo para escribirle a Jarvis y el micrófono.' },
  frase: { grupo: 'Jarvis', nombre: 'Atajo de voz', icono: 'mic', tams: BOTON, altos: [1, 2], color: true, ayuda: 'Un botón que le dice una frase a Jarvis, como si la hablaras ("qué estoy viendo", "poné música").', datos: ['nombre', 'icono', 'texto'] },
  modos: { grupo: 'Jarvis', nombre: 'Barra de modos', icono: 'modos', tams: [4], unico: true, ayuda: 'Para cambiar entre Normal, Juego, Silencio…' },
  modo: { grupo: 'Jarvis', nombre: 'Botón de un modo', icono: 'modos', tams: BOTON, altos: [1, 2], color: true, ayuda: 'Pasa a un modo con un toque (por ejemplo, "Juego"). Se marca cuando ese modo está activo.', datos: ['modo'] },
  // Automatizar
  rutinas: { grupo: 'Automatizar', nombre: 'Acciones rápidas', icono: 'rayo', tams: [4], unico: true, ayuda: 'Todas las rutinas marcadas como acción rápida. No se ve si no hay ninguna.' },
  rutina: { grupo: 'Automatizar', nombre: 'Una rutina', icono: 'estrella', tams: BOTON, altos: [1, 2], color: true, ayuda: 'Un botón que ejecuta una rutina que elijas.', datos: ['rutina'] },
  abrir: { grupo: 'Automatizar', nombre: 'Abrir programa o página', icono: 'trabajo', tams: BOTON, altos: [1, 2], color: true, ayuda: 'Abre un programa, un juego de Steam o una página web con un toque.', datos: ['nombre', 'icono', 'destino'] },
  volumen: { grupo: 'Automatizar', nombre: 'Volumen de la PC', icono: 'parlante', tams: [2, 3, 4], unico: true, color: true, ayuda: 'Un deslizador para el volumen general de Windows, con botón de silencio.' },
  // Avisos y agenda
  novedades: { grupo: 'Avisos y agenda', nombre: 'Novedades', icono: 'novedades', tams: [4], unico: true, ayuda: 'Mensajes de WhatsApp, mails y avisos pendientes. No se ve si no hay ninguno.' },
  agenda: { grupo: 'Avisos y agenda', nombre: 'Próximo evento', icono: 'calendario', tams: [2, 3, 4], altos: [1, 2], unico: true, color: true, ayuda: 'Lo que viene en tu calendario; en doble alto, los próximos tres. Si no hay nada, dice "Sin eventos" y sigue ocupando su lugar.' },
  'leer-avisos': { grupo: 'Avisos y agenda', nombre: 'Leer notificaciones', icono: 'novedades', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Jarvis te lee en voz alta lo pendiente: mensajes de WhatsApp, mails y avisos.' },
  nota: { grupo: 'Avisos y agenda', nombre: 'Nota rápida', icono: 'nota', tams: [2, 3, 4], unico: true, ayuda: 'Un campo para anotar algo al toque. Las notas se ven en la ventana de Jarvis → Notas.' },
  'nota-voz': { grupo: 'Avisos y agenda', nombre: 'Nota de voz', icono: 'mic', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Un botón para grabar una nota de voz y otro toque para parar. Se guarda en la carpeta de clips, en "Notas de voz" (por voz: "grabá una nota de voz").' },
  notas: { grupo: 'Avisos y agenda', nombre: 'Mis notas', icono: 'nota', tams: [2, 3, 4], altos: [1, 2], unico: true, color: true, ayuda: 'Tus últimas notas (primero las que tienen aviso). Tocá una para abrir Notas.' },
  // Info
  reloj: { grupo: 'Info', nombre: 'Reloj', icono: 'reloj', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'La hora y la fecha.' },
  pc: { grupo: 'Info', nombre: 'Estado de la PC', icono: 'chip', tams: [2, 3, 4], altos: [1, 2], unico: true, color: true, ayuda: 'Procesador, memoria y placa de video (temperatura con NVIDIA); en doble alto, también lo que gasta Jarvis.' },
  clima: { grupo: 'Info', nombre: 'Clima', icono: 'sol', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Temperatura y cielo de tu ciudad (Ajustes → Asistente → Básico); en doble alto, máxima, mínima y lluvia.' },
  titulo: { grupo: 'Info', nombre: 'Título', icono: 'interfaz', tams: [4], ayuda: 'Un texto chico para separar el panel en partes ("Juegos", "Trabajo"…).', datos: ['texto'] },
  // Música y clips
  musica: { grupo: 'Música y clips', nombre: 'Música', icono: 'musica', tams: [2, 3, 4], altos: [1, 2], unico: true, ayuda: 'Anterior, pausa/play y siguiente; con lugar, qué está sonando.' },
  cast: { grupo: 'Música y clips', nombre: 'Enviar música a otro aparato', icono: 'cast', tams: [2, 3, 4], unico: true, color: true, ayuda: 'Elegís uno de tus aparatos (Nest, Chromecast, tele) y le manda lo que está sonando o tu Supermix. Los aparatos se cargan en Dispositivos.' },
  clips: { grupo: 'Música y clips', nombre: 'Clips (barra completa)', icono: 'clip', tams: [4], unico: true, ayuda: 'Grabar, pausar, guardar un clip y enviarlo. Solo si los clips están prendidos.' },
  'clip-guardar': { grupo: 'Música y clips', nombre: 'Guardar clip', icono: 'clip', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Guarda los últimos segundos como clip.' },
  'clip-grabar': { grupo: 'Música y clips', nombre: 'Grabar', icono: 'grabar', tams: [2, 3, 4], unico: true, color: true, ayuda: 'Un menú para elegir qué grabar: la pantalla completa, una ventana o un recuadro. Mientras graba, se transforma en el botón de parar.' },
  'grabar-pantalla': { grupo: 'Música y clips', nombre: 'Grabar pantalla completa', icono: 'grabar', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Graba toda la pantalla (si tenés varias, te deja elegir cuál).' },
  'grabar-ventana': { grupo: 'Música y clips', nombre: 'Grabar una ventana', icono: 'grabar', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Te muestra tus ventanas abiertas y grabás solo la que elijas.' },
  'grabar-recuadro': { grupo: 'Música y clips', nombre: 'Grabar un recuadro', icono: 'grabar', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Arrastrás un rectángulo sobre la pantalla y graba solo esa parte.' },
  captura: { grupo: 'Música y clips', nombre: 'Captura de pantalla', icono: 'camara', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Saca una captura de la pantalla y la guarda junto a tus clips (por voz: "sacá una captura", "mandame una captura").' },
  'clip-enviar': { grupo: 'Música y clips', nombre: 'Enviar último clip', icono: 'enviar', tams: BOTON, altos: [1, 2], unico: true, color: true, ayuda: 'Manda el último clip por WhatsApp.' },
};
export const GRUPOS_DE_WIDGETS = ['Jarvis', 'Automatizar', 'Avisos y agenda', 'Info', 'Música y clips'];
// Los que requieren los clips prendidos para verse.
export const DE_CLIPS = new Set(['clips', 'clip-guardar', 'clip-grabar', 'grabar-pantalla', 'grabar-ventana', 'grabar-recuadro', 'clip-enviar']);

export const nuevoIdDeWidget = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
// Al sumarlo: el tamaño que mejor se ve (los botones, a la mitad; la música y la agenda, a lo ancho).
const TAM_AL_SUMAR = { rutina: 2, frase: 2, abrir: 2, modo: 2, reloj: 2, clima: 2, 'clip-guardar': 2, 'clip-grabar': 2, 'clip-enviar': 2, captura: 2, 'nota-voz': 2, 'leer-avisos': 2, cast: 4, musica: 4, agenda: 4, volumen: 4, nota: 4, notas: 4 };
export const tamPorDefecto = (tipo) => (TIPOS[tipo] ? (TAM_AL_SUMAR[tipo] || TIPOS[tipo].tams[0]) : 4);
// Un widget con lo que haga falta: id, tipo, tamaño y alto válidos para ese tipo, y un color de la lista (o ninguno).
export function normalizarWidget(w) {
  const t = TIPOS[w && w.tipo];
  if (!t) return null;
  const tam = t.tams.includes(Number(w.tam)) ? Number(w.tam) : t.tams.reduce((a, b) => (Math.abs(b - Number(w.tam)) < Math.abs(a - Number(w.tam)) ? b : a), t.tams[0]);
  const altos = t.altos || [1];
  const alto = altos.includes(Number(w.alto)) ? Number(w.alto) : 1;
  const color = t.color && typeof w.color === 'string' && /^#[0-9a-f]{6}$/i.test(w.color) ? w.color : '';
  // col / fila: dónde está en la grilla (empiezan en 1). 0 = todavía sin lugar: se le busca uno al acomodar.
  const fila = Number.isInteger(w.fila) && w.fila >= 1 && Number.isInteger(w.col) && w.col >= 1 ? w.fila : 0;
  const col = fila ? Math.min(w.col, COLUMNAS - tam + 1) : 0;
  return { ...w, id: w.id || nuevoIdDeWidget(), tam, alto, color, col, fila };
}
export const normalizarLista = (lista) => (Array.isArray(lista) ? lista : []).map(normalizarWidget).filter(Boolean);

// Le da a cada widget su lugar en la grilla (col, fila) sin que se pisen. Los que ya tienen lugar libre lo conservan (primero el de "primero",
// después los demás en el orden de la lista); a los demás se les busca el primer hueco avanzando de izquierda a derecha y de arriba abajo.
// Devuelve una lista nueva (con los mismos objetos copiados).
export function empaquetar(lista, { primero = null } = {}) {
  const ocupado = new Set();
  const cabe = (c, f, tam, alto) => {
    if (c < 1 || c + tam - 1 > COLUMNAS || f < 1) return false;
    for (let i = 0; i < tam; i++) for (let j = 0; j < alto; j++) if (ocupado.has(`${c + i},${f + j}`)) return false;
    return true;
  };
  const tomar = (c, f, tam, alto) => { for (let i = 0; i < tam; i++) for (let j = 0; j < alto; j++) ocupado.add(`${c + i},${f + j}`); };
  const orden = lista.slice().sort((a, b) => (a.id === primero ? -1 : 0) - (b.id === primero ? -1 : 0));
  const puesto = new Map();
  for (const w of orden) {
    const alto = w.alto || 1;
    if (w.col && w.fila && cabe(w.col, w.fila, w.tam, alto)) { tomar(w.col, w.fila, w.tam, alto); puesto.set(w.id, { col: w.col, fila: w.fila }); }
  }
  let cf = 1; let cc = 1; // el cursor solo avanza, como en una grilla que se llena en orden
  for (const w of lista) {
    if (puesto.has(w.id)) continue;
    const alto = w.alto || 1;
    for (let f = cf; ; f++) {
      let hallado = false;
      for (let c = f === cf ? cc : 1; c <= COLUMNAS - w.tam + 1; c++) {
        if (cabe(c, f, w.tam, alto)) { tomar(c, f, w.tam, alto); puesto.set(w.id, { col: c, fila: f }); cf = f; cc = c + w.tam; hallado = true; break; }
      }
      if (hallado) break;
    }
  }
  return lista.map((w) => ({ ...w, ...puesto.get(w.id) }));
}
