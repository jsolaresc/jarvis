// "Poné tal serie o película": se averigua en cuál de los servicios del usuario está (con la base
// gratuita de TMDB, que toma ese dato de JustWatch) y se abre ahí, en la PC, ya buscada. Si no está
// en ninguno de los suyos, se abre en Stremio. En la tele, por Chromecast, solo se puede con YouTube:
// los demás servicios no dejan que otra aplicación les elija el título.
// También: "poné a Racing" (averigua por qué canal va el partido y abre Flow) y "poné tal cosa" a
// secas, donde hay que decidir si es algo para ver o una canción.
const { leerConfig, normalizar, buscarPorNombre } = require('./config');
const musica = require('./musica');
const internet = require('./internet');
const historial = require('./historial');

const TMDB = (process.env.JARVIS_URL_TMDB || 'https://api.themoviedb.org/3').replace(/\/+$/, '');

// main.js completa esto: { abrir(url) -> Promise, youtubeEnTele(tele, videoId) -> Promise<string> }
const puente = { appEnTele: async () => { throw new Error('tele sin configurar'); }, abrir: async () => { throw new Error('abrir sin configurar'); }, youtubeEnTele: async () => { throw new Error('tele sin configurar'); } };
function configurar(funciones) { Object.assign(puente, funciones); }

// Cómo aparece cada servicio en TMDB/JustWatch, y cómo se lo suele nombrar al hablar.
const RECONOCER = {
  disney: { catalogo: /disney/i, dicho: /disney/ },
  hbo: { catalogo: /hbo|^max\b/i, dicho: /hbo|\bmax\b/ },
  netflix: { catalogo: /netflix/i, dicho: /netflix/ },
  prime: { catalogo: /amazon prime|prime video/i, dicho: /prime|amazon/ },
  youtube: { catalogo: /youtube/i, dicho: /youtube|you tube|yutub/ },
  stremio: { catalogo: /^$/, dicho: /stremio|estremio/ },
  flow: { catalogo: /^flow$/i, dicho: /^flow$|^flou$|^flo$/ },
  pluto: { catalogo: /pluto/i, dicho: /pluto/ },
};

const servicios = () => (leerConfig().streaming.servicios || []).filter((s) => s && s.id && s.url);
const activos = () => servicios().filter((s) => s.activo);
function servicioDicho(nombre) {
  const n = normalizar(nombre);
  if (!n) return null;
  return servicios().find((s) => (RECONOCER[s.id] && RECONOCER[s.id].dicho.test(n)) || normalizar(s.nombre) === n) || null;
}
const enlace = (servicio, titulo) => servicio.url.replace('{q}', encodeURIComponent(titulo));

async function tmdb(ruta, parametros = {}) {
  const clave = (leerConfig().streaming.tmdb || '').trim();
  const largo = clave.startsWith('eyJ'); // TMDB da dos claves: la corta va en la dirección, la larga en la cabecera
  const consulta = new URLSearchParams({ ...parametros, ...(largo ? {} : { api_key: clave }) });
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 12000);
  try {
    const pedir = () => fetch(`${TMDB}${ruta}?${consulta}`, { signal: control.signal, headers: largo ? { Authorization: `Bearer ${clave}` } : {} });
    const r = await pedir().catch((e) => { if (e.name === 'AbortError') throw e; return pedir(); }); // un corte de red suelto: se intenta una vez más
    if (r.status === 401) throw new Error('la clave de TMDB no es válida');
    if (!r.ok) throw new Error(`TMDB respondió ${r.status}`);
    return await r.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'TMDB tardó demasiado' : /fetch failed/.test(e.message) ? 'no hay conexión con TMDB' : e.message);
  } finally {
    clearTimeout(reloj);
  }
}

const sinArticulo = (t) => normalizar(t).replace(/^(el|la|los|las|un|una|the) /, '');

// Busca el título y dónde se puede ver por suscripción en el país del usuario.
// conocido: tiene bastantes votos en TMDB (no es un título perdido que justo se llama igual que una
// canción). coincide: el nombre es lo que se pidió, no algo que apenas se le parece.
async function averiguar(titulo) {
  const pais = (leerConfig().streaming.pais || 'AR').toUpperCase();
  const busqueda = await tmdb('/search/multi', { query: titulo, language: 'es-AR', region: pais, include_adult: 'false' });
  const obra = (busqueda.results || []).find((x) => x.media_type === 'movie' || x.media_type === 'tv');
  if (!obra) { historial.anotar(`TMDB: no encontró "${titulo}"`); return null; }
  const tipo = obra.media_type;
  const [donde, ids] = await Promise.all([
    tmdb(`/${tipo}/${obra.id}/watch/providers`),
    tmdb(`/${tipo}/${obra.id}/external_ids`).catch(() => ({})),
  ]);
  const local = (donde.results && donde.results[pais]) || {};
  const nombres = [obra.title, obra.name, obra.original_title, obra.original_name].filter(Boolean);
  const r = {
    tipo, nombre: obra.title || obra.name || titulo, imdb: ids.imdb_id || null,
    incluidos: [...(local.flatrate || []), ...(local.free || []), ...(local.ads || [])].map((p) => p.provider_name),
    conocido: (Number(obra.vote_count) || 0) >= 150,
    coincide: nombres.some((n) => sinArticulo(n) === sinArticulo(titulo)),
  };
  historial.anotar(`TMDB: "${r.nombre}" (${tipo === 'tv' ? 'serie' : 'película'}, ${obra.vote_count || 0} votos) — en ${pais}: ${r.incluidos.join(', ') || 'ningún servicio de suscripción'}`);
  return r;
}

const ES_ACA = /^(|aca|pc|la pc|esta pc|compu|la compu|computadora|la computadora|el monitor)$/;
const ES_TELE_GENERICA = /^(tele|la tele|tv|la tv|el televisor|televisor|chromecast|el chromecast)$/;

// El video de YouTube para lo pedido: con la clave de la API si está cargada; si no, con la búsqueda común.
const videoDeYoutube = (consulta) => musica.buscarVideo(consulta, { enVivo: true }); // si el canal está en vivo ahora, esa transmisión

// Qué dirección abre la app de cada servicio en la tele (Google TV). Se puede cambiar con el campo "tele" del servicio.
const ENLACE_TELE = {
  disney: 'https://www.disneyplus.com', hbo: 'https://play.hbomax.com', netflix: 'https://www.netflix.com',
  prime: 'https://app.primevideo.com', pluto: 'https://pluto.tv', flow: 'market://launch?id=ar.com.flow.androidtv',
};

async function enLaTele(titulo, servicio, dispositivo) {
  const c = leerConfig();
  const pedida = normalizar(dispositivo);
  const conocida = ES_TELE_GENERICA.test(pedida) ? null : buscarPorNombre(c.teles || [], dispositivo); // "telecomedor" -> "Tele Comedor"
  const tele = ES_TELE_GENERICA.test(pedida) ? (c.streaming.tele || (c.teles.length === 1 ? c.teles[0].nombre : '')) : (conocida ? conocida.nombre : dispositivo);
  if (!tele) throw new Error(c.teles.length ? 'Decime en cuál tele (o elegí una por defecto en Ajustes, en Streaming).' : 'No hay ninguna tele cargada en Ajustes, en Dispositivos.');

  // Si no nombró el servicio, se averigua dónde está (igual que en la PC).
  let elegido = servicio;
  let nombreObra = titulo;
  if (!elegido && (c.streaming.tmdb || '').trim()) {
    try {
      const obra = await averiguar(titulo);
      if (obra) {
        nombreObra = obra.nombre;
        elegido = activos().find((s) => RECONOCER[s.id] && s.id !== 'stremio' && obra.incluidos.some((p) => RECONOCER[s.id].catalogo.test(p))) || null;
      }
    } catch (e) { historial.anotar(`TMDB falló: ${e.message}`, { error: true }); }
  }
  if (elegido && elegido.id !== 'youtube') {
    const enlace = elegido.tele || ENLACE_TELE[elegido.id];
    if (!enlace) throw new Error(`No sé cómo abrir ${elegido.nombre} en la tele. Lo que sí puedo es abrírtelo en la PC.`);
    await puente.appEnTele(tele, enlace);
    return `"${nombreObra}" está en ${elegido.nombre}: te abrí la app en ${tele}. El título elegilo vos con el control.`;
  }
  const video = await videoDeYoutube(titulo);
  const r = await puente.youtubeEnTele(tele, video.id);
  const que = `${video.enVivo ? 'la transmisión en vivo ' : ''}"${video.titulo}" de YouTube`;
  if (r && r.confirmado === false) return `Le mandé ${que} a ${r.dispositivo || tele}, pero no recibí confirmación de que empezara. Si no se ve, decímelo y miro el historial.`;
  return `Poniendo ${que} en ${tele}.`;
}

// titulo: qué ver. servicio: si el usuario nombró uno. dispositivo: vacío = la PC.
async function ver({ titulo, servicio, dispositivo } = {}) {
  const pedido = String(titulo || '').trim();
  if (!pedido) throw new Error('Falta decir qué querés ver.');
  const elegido = servicio ? servicioDicho(servicio) : null;
  if (servicio && !elegido) throw new Error(`No conozco el servicio "${servicio}". Los que tengo cargados: ${servicios().map((s) => s.nombre).join(', ')}.`);
  if (!ES_ACA.test(normalizar(dispositivo))) return enLaTele(pedido, elegido, dispositivo);

  if (elegido) {
    await puente.abrir(enlace(elegido, pedido));
    return `Abrí ${elegido.nombre} con "${pedido}".`;
  }
  const stremio = activos().find((s) => s.id === 'stremio');
  let obra = null;
  let aviso = '';
  if ((leerConfig().streaming.tmdb || '').trim()) {
    try { obra = await averiguar(pedido); } catch (e) { aviso = ` (No pude consultar dónde está: ${e.message}.)`; }
  }
  if (obra) {
    const propio = activos().find((s) => RECONOCER[s.id] && s.id !== 'stremio' && obra.incluidos.some((p) => RECONOCER[s.id].catalogo.test(p)));
    if (propio) {
      await puente.abrir(enlace(propio, obra.nombre));
      return `"${obra.nombre}" está en ${propio.nombre}: te lo abrí ahí.`;
    }
    if (stremio) {
      // Con el identificador de la obra, Stremio abre directo su ficha en vez de una búsqueda.
      await puente.abrir(obra.imdb ? `stremio:///detail/${obra.tipo === 'tv' ? 'series' : 'movie'}/${obra.imdb}${obra.tipo === 'tv' ? '' : `/${obra.imdb}`}` : enlace(stremio, obra.nombre));
      return `"${obra.nombre}" no está en tus servicios${obra.incluidos.length ? ` (está en ${obra.incluidos.slice(0, 3).join(', ')})` : ''}: te lo abrí en Stremio.`;
    }
    return obra.incluidos.length ? `"${obra.nombre}" está en ${obra.incluidos.slice(0, 4).join(', ')}, que no figuran entre tus servicios.` : `No encontré "${obra.nombre}" en ningún servicio de suscripción de tu país.`;
  }
  if (stremio) {
    await puente.abrir(enlace(stremio, pedido));
    return `Te abrí "${pedido}" en Stremio.${aviso || ((leerConfig().streaming.tmdb || '').trim() ? '' : ' Con una clave gratuita de TMDB puedo fijarme primero si está en tus servicios.')}`;
  }
  const primero = activos()[0];
  if (!primero) throw new Error('No hay ningún servicio de streaming activado en Ajustes.');
  await puente.abrir(enlace(primero, pedido));
  return `Te abrí ${primero.nombre} con "${pedido}".${aviso}`;
}

// ---------- "Poné tal cosa", sin aclarar si es para ver o para escuchar ----------
// Si es un título conocido de TMDB que se llama igual a lo pedido, es para ver; si no, es música.
async function poner({ titulo, dispositivo } = {}) {
  const pedido = String(titulo || '').trim();
  if (!pedido) throw new Error('Falta decir qué poner.');
  const enOtroLado = !ES_ACA.test(normalizar(dispositivo));
  if ((leerConfig().streaming.tmdb || '').trim()) {
    let obra = null;
    try { obra = await averiguar(pedido); } catch (e) { historial.anotar(`TMDB falló: ${e.message}`, { error: true }); }
    if (obra && obra.coincide && obra.conocido) {
      historial.anotar('Lo tomé como algo para ver (título conocido que coincide).');
      return `${await ver({ titulo: pedido, dispositivo })} Si querías la canción, decime "poné la canción ${pedido}".`;
    }
  } else {
    historial.anotar('Sin clave de TMDB: no puedo saber si es una serie o película, lo tomo como música.');
  }
  if (enOtroLado) return ver({ titulo: pedido, dispositivo }); // "en la tele": un video de YouTube con eso
  historial.anotar('Lo tomé como música.');
  return musica.reproducir(pedido);
}

// ---------- "Poné a Racing": por qué canal va el partido ----------
const EQUIPOS = ['racing', 'boca', 'boca juniors', 'river', 'river plate', 'independiente', 'san lorenzo', 'huracan', 'velez', 'estudiantes', 'gimnasia',
  'newells', 'rosario central', 'central', 'talleres', 'belgrano', 'lanus', 'banfield', 'argentinos', 'argentinos juniors', 'tigre', 'platense', 'union', 'colon',
  'defensa y justicia', 'godoy cruz', 'instituto', 'barracas central', 'atletico tucuman', 'la seleccion', 'seleccion', 'argentina', 'la seleccion argentina',
  'independiente rivadavia', 'estudiantes de la plata', 'gimnasia de la plata', 'deportivo riestra', 'riestra', 'sarmiento', 'sarmiento de junin', 'central cordoba',
  'aldosivi', 'gimnasia de mendoza', 'tigre', 'quilmes', 'chacarita', 'ferro', 'all boys', 'nueva chicago', 'san martin de san juan', 'san martin de tucuman'];
function equipoDicho(nombre) {
  const n = normalizar(nombre).replace(/^(el partido (de|del|de la) |el partido |a |al |el |la )/, '');
  if (!n) return null;
  const propios = String(leerConfig().streaming.equipos || '').split(',').map((x) => normalizar(x)).filter(Boolean);
  return [...propios, ...EQUIPOS].includes(n) ? n : null;
}
// ¿Se nombra algún equipo en la frase? ("estudiantes independiente rivadavia", "el partido de racing"). Con
// palabras enteras, para que "river" no salte por "driver". Devuelve el texto ya aplanado, o null.
function hablaDeEquipo(texto) {
  let n = ` ${normalizar(texto)} `;
  const propios = String(leerConfig().streaming.equipos || '').split(',').map((x) => normalizar(x)).filter(Boolean);
  const todos = [...new Set([...propios, ...EQUIPOS])].sort((x, y) => y.length - x.length); // el más largo primero
  let hubo = false;
  for (const e of todos) {
    if (n.includes(` ${e} `)) { hubo = true; n = n.split(` ${e} `).join('  '); }
  }
  // Solo equipos y nexos: "la economia de argentina" no es un partido.
  const sobra = n.split(' ').filter((p) => p && !/^(?:de|del|la|el|los|las|vs|contra|y|con|e|partido)$/.test(p));
  return hubo && !sobra.length ? normalizar(texto) : null;
}
// De más específico a más general: "ESPN Premium" tiene que ganarle a "ESPN".
const CANALES = [
  ['ESPN Premium', /espn premium/i], ['TNT Sports', /tnt sports/i], ['TyC Sports', /tyc sports/i],
  ['ESPN 2', /espn ?2\b/i], ['ESPN 3', /espn ?3\b/i], ['ESPN 4', /espn ?4\b/i],
  ['Fox Sports 2', /fox sports ?2\b/i], ['Fox Sports 3', /fox sports ?3\b/i], ['Fox Sports', /fox sports/i],
  ['DSports', /\bd ?sports\b|directv sports/i], ['TV Pública', /tv p[uú]blica|televisi[oó]n p[uú]blica/i],
  ['Telefe', /\btelefe\b/i], ['El Trece', /el ?trece|canal 13/i], ['Disney+', /disney ?\+|disney plus/i], ['ESPN', /\bespn\b/i],
];
function canalEn(texto) {
  let mejor = null;
  let resto = String(texto || '');
  for (const [nombre, patron] of CANALES) {
    const m = patron.exec(resto);
    if (!m) continue;
    if (!mejor || m.index < mejor.pos) mejor = { nombre, pos: m.index };
    resto = resto.replace(new RegExp(patron.source, 'gi'), (x) => ' '.repeat(x.length)); // que "ESPN" no vuelva a contar el mismo "ESPN Premium"
  }
  return mejor ? mejor.nombre : null;
}

async function partido({ equipo } = {}) {
  const quien = String(equipo || '').trim();
  if (!quien) throw new Error('Falta decir de qué equipo.');
  const flow = servicios().find((s) => s.id === 'flow');
  let hallado = '';
  let falla = '';
  try {
    hallado = await internet.buscar(`¿Por qué canal de televisión transmiten en Argentina el partido de ${quien} de hoy y a qué hora empieza? Si hoy no juega, decí cuándo es el próximo.`);
  } catch (e) { falla = e.message; }
  const canal = canalEn(hallado);
  historial.anotar(canal ? `Canal encontrado en la búsqueda: ${canal}` : `No identifiqué el canal. ${falla || 'La búsqueda no nombró ninguno conocido.'}`, { error: !canal && !!falla });
  if (flow) await puente.abrir(flow.url.replace('{q}', encodeURIComponent(canal || quien)));
  const nombre = quien.charAt(0).toUpperCase() + quien.slice(1);
  if (canal) return `${nombre} va por ${canal}.${flow ? ` Te abrí Flow: buscá ${canal} en la guía.` : ''}`;
  const resumen = hallado ? ` Esto es lo que encontré: ${internet.recortar(hallado.replace(/^- /gm, ''), 220)}` : '';
  return `No pude confirmar por qué canal va ${nombre}.${flow ? ' Igual te abrí Flow.' : ''}${resumen}`;
}

// Para el botón "Probar" de Ajustes.
async function probar() {
  const obra = await averiguar('Los Simpson');
  if (!obra) throw new Error('TMDB contestó, pero no encontró nada.');
  return `Funciona: "${obra.nombre}" figura en ${obra.incluidos.length ? obra.incluidos.slice(0, 3).join(', ') : 'ningún servicio de suscripción de tu país'}.`;
}

module.exports = { configurar, ver, poner, partido, averiguar, probar, servicioDicho, equipoDicho, hablaDeEquipo, canalEn };
