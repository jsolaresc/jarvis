// Lo que Jarvis consulta en internet, siempre con servicios gratuitos:
//   - clima: Open-Meteo (sin clave ni registro); si no responde, se reintenta una vez y después se usa
//     MET Norway (el servicio meteorológico noruego, también gratis y sin clave) como respaldo.
//   - buscar: se prueban en cadena, igual que los modelos — la búsqueda web de Groq (con la misma
//     clave gratuita de Inteligencia), Tavily (clave gratuita opcional, 1.000 búsquedas por mes) y,
//     si no hay ninguna clave, Wikipedia (que no sabe de noticias pero sí de casi todo lo demás).
const historial = require('./historial');
const { leerConfig } = require('./config');

// Direcciones de cada servicio (se pueden cambiar con variables de entorno: lo usan las pruebas).
const DONDE = {
  geocodificar: process.env.JARVIS_URL_GEO || 'https://geocoding-api.open-meteo.com/v1/search',
  pronostico: process.env.JARVIS_URL_CLIMA || 'https://api.open-meteo.com/v1/forecast',
  respaldo: process.env.JARVIS_URL_CLIMA_RESPALDO || 'https://api.met.no/weatherapi/locationforecast/2.0/compact',
  tavily: process.env.JARVIS_URL_TAVILY || 'https://api.tavily.com/search',
  wikipedia: process.env.JARVIS_URL_WIKIPEDIA || 'https://es.wikipedia.org/w/api.php',
};

// MET Norway pide que cada app se identifique con nombre y una dirección de contacto.
const AGENTE = `Jarvis/${(() => { try { return require('../../package.json').version; } catch { return '1'; } })()} github.com/jsolaresc/jarvis`;

// Si la conexión se corta de entrada (por ejemplo, una conexión vieja que la PC dejó abierta al suspenderse),
// se prueba una vez más antes de decir que no hay internet.
async function pedir(url, opciones = {}) {
  try { return await pedirUnaVez(url, opciones); } catch (e) {
    if (e.message === 'tardó demasiado en responder') throw e;
    return pedirUnaVez(url, opciones);
  }
}

async function pedirUnaVez(url, { cuerpo, clave, espera = 15000 } = {}) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), espera);
  try {
    const r = await fetch(url, {
      method: cuerpo ? 'POST' : 'GET', signal: control.signal,
      headers: { 'User-Agent': AGENTE, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(clave ? { Authorization: `Bearer ${clave}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let json = null;
    try { json = await r.json(); } catch {}
    return { estado: r.status, json };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'tardó demasiado en responder' : 'no hay conexión a internet');
  } finally {
    clearTimeout(reloj);
  }
}

// ---------- Clima ----------
// Códigos del tiempo de la Organización Meteorológica Mundial, que es lo que devuelve Open-Meteo.
const CIELO = {
  0: 'despejado', 1: 'mayormente despejado', 2: 'algo nublado', 3: 'nublado', 45: 'con niebla', 48: 'con niebla',
  51: 'con llovizna leve', 53: 'con llovizna', 55: 'con llovizna fuerte', 56: 'con llovizna helada', 57: 'con llovizna helada',
  61: 'con lluvia leve', 63: 'con lluvia', 65: 'con lluvia fuerte', 66: 'con lluvia helada', 67: 'con lluvia helada',
  71: 'con nevada leve', 73: 'con nieve', 75: 'con nevada fuerte', 77: 'con aguanieve', 80: 'con chaparrones aislados', 81: 'con chaparrones',
  82: 'con chaparrones fuertes', 85: 'con nevadas', 86: 'con nevadas fuertes', 95: 'con tormenta', 96: 'con tormenta y granizo', 99: 'con tormenta y granizo',
};
const cielo = (codigo) => CIELO[codigo] || 'variable';
const grados = (n) => `${Math.round(n)} grados`;

// MET Norway no usa los códigos de la OMM sino nombres ("lightrainshowers_day"): se pasan al código más parecido.
function codigoMet(simbolo) {
  const s = String(simbolo || '').replace(/_(day|night|polartwilight)$/, '');
  const fuerte = /^heavy/.test(s); const leve = /^light/.test(s); const chaparron = /showers/.test(s);
  if (/thunder/.test(s)) return 95;
  if (/sleet/.test(s)) return 67;
  if (/snow/.test(s)) return chaparron ? (fuerte ? 86 : 85) : fuerte ? 75 : leve ? 71 : 73;
  if (/rain/.test(s)) return chaparron ? (fuerte ? 82 : leve ? 80 : 81) : fuerte ? 65 : leve ? 61 : 63;
  return { fog: 45, cloudy: 3, partlycloudy: 2, fair: 1, clearsky: 0 }[s] ?? 3;
}

// El día (AAAA-MM-DD) de una hora UTC en la zona horaria de la ciudad.
function diaLocal(fecha, zona) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: zona || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(fecha)); } catch { return String(fecha).slice(0, 10); }
}

// Respaldo: MET Norway. Da la temperatura hora por hora; los máximos y mínimos del día se calculan acá.
// No trae sensación térmica ni probabilidad de lluvia (quedan sin decir).
async function pronosticoMet(sitio, nDias) {
  const p = await pedir(`${DONDE.respaldo}?lat=${Number(sitio.latitude).toFixed(4)}&lon=${Number(sitio.longitude).toFixed(4)}`);
  const serie = p.json && p.json.properties && p.json.properties.timeseries;
  if (p.estado !== 200 || !Array.isArray(serie) || !serie.length) throw new Error(`respondió ${p.estado}`);
  const simbolo = (d) => { const x = d.next_1_hours || d.next_6_hours || d.next_12_hours; return x && x.summary && x.summary.symbol_code; };
  const primero = serie[0].data; const temp = primero.instant.details.air_temperature;
  const s0 = simbolo(primero);
  const dias = []; const porDia = new Map();
  for (const t of serie) {
    const dia = diaLocal(t.time, sitio.timezone);
    if (!porDia.has(dia)) { if (porDia.size >= nDias) break; porDia.set(dia, { max: -Infinity, min: Infinity, codigo: 0 }); }
    const d = porDia.get(dia); const v = t.data.instant.details.air_temperature;
    if (Number.isFinite(v)) { d.max = Math.max(d.max, v); d.min = Math.min(d.min, v); }
    const s = simbolo(t.data); if (s) d.codigo = Math.max(d.codigo, codigoMet(s));
  }
  for (const d of porDia.values()) dias.push({ max: d.max, min: d.min, lluvia: null, codigo: d.codigo });
  if (!dias.length) throw new Error('el pronóstico vino vacío');
  return { ahora: { temp, sensacion: temp, codigo: codigoMet(s0), dia: !/_night$/.test(s0 || '') }, dias, fuente: 'MET Norway' };
}

const DEMORA_REINTENTO = Number(process.env.JARVIS_DEMORA_REINTENTO || 1500);
const motivo = (p) => `${p.estado}${p.json && p.json.reason ? ` (${p.json.reason})` : ''}`;

// El pronóstico de un lugar ya ubicado: Open-Meteo, un reintento si falla y, si sigue sin responder, MET Norway.
// Cada falla queda anotada en el Historial con el motivo real, para saber qué pasó.
async function pronostico(sitio, nDias) {
  const url = `${DONDE.pronostico}?latitude=${sitio.latitude}&longitude=${sitio.longitude}`
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day'
    + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=${nDias}`;
  const fallas = [];
  for (let intento = 0; intento < 2; intento++) {
    if (intento) await new Promise((r) => setTimeout(r, DEMORA_REINTENTO));
    try {
      const p = await pedir(url);
      const a = p.json && p.json.current; const d = p.json && p.json.daily;
      if (p.estado === 200 && a && d && Array.isArray(d.time)) {
        const lluvia = d.precipitation_probability_max || [];
        return {
          ahora: { temp: a.temperature_2m, sensacion: a.apparent_temperature, codigo: a.weather_code, dia: a.is_day !== 0 },
          dias: d.time.map((_, i) => ({ max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], lluvia: lluvia[i], codigo: (d.weather_code || [])[i] })),
          fuente: 'Open-Meteo',
        };
      }
      fallas.push(`Open-Meteo respondió ${motivo(p)}`);
    } catch (e) { fallas.push(`Open-Meteo: ${e.message}`); }
    historial.anotar(`Clima: ${fallas[fallas.length - 1]}${intento ? '' : '; reintento'}`, { error: true });
  }
  try {
    const r = await pronosticoMet(sitio, nDias);
    historial.anotar('Clima: se usó el respaldo (MET Norway)');
    return r;
  } catch (e) {
    fallas.push(`MET Norway: ${e.message}`);
    historial.anotar(`Clima: MET Norway ${e.message}`, { error: true });
  }
  const error = new Error('El servicio del clima no respondió bien.');
  error.detalle = fallas.join(' · ');
  throw error;
}

async function ubicar(ciudad) {
  const g = await pedir(`${DONDE.geocodificar}?name=${encodeURIComponent(ciudad)}&count=1&language=es&format=json`);
  return g.json && g.json.results && g.json.results[0];
}

// lugar: ciudad (si no se dice, la cargada en Ajustes). cuando: 'ahora' | 'hoy' | 'manana' | 'pasado'.
async function clima(lugar, cuando = 'ahora') {
  const ciudad = String(lugar || leerConfig().ciudad || '').trim();
  if (!ciudad) throw new Error('No sé de qué ciudad. Decime "el clima en tal lugar", o cargá tu ciudad en Ajustes, en General.');
  const sitio = await ubicar(ciudad);
  if (!sitio) throw new Error(`No encontré ninguna ciudad llamada "${ciudad}".`);
  const { ahora, dias } = await pronostico(sitio, 3);
  const dia = (i) => {
    const x = dias[i];
    if (!x) throw new Error('El servicio del clima no trajo el pronóstico de ese día.');
    return `${cielo(x.codigo)}, máxima de ${grados(x.max)} y mínima de ${grados(x.min)}`
      + (Number.isFinite(x.lluvia) ? `, con ${Math.round(x.lluvia)} por ciento de probabilidad de lluvia` : '');
  };
  if (cuando === 'manana') return `Mañana en ${sitio.name}: ${dia(1)}.`;
  if (cuando === 'pasado') return `Pasado mañana en ${sitio.name}: ${dia(2)}.`;
  const sensacion = Math.abs(ahora.sensacion - ahora.temp) >= 2 ? `, con sensación de ${Math.round(ahora.sensacion)}` : '';
  return `En ${sitio.name} hace ${grados(ahora.temp)}${sensacion}, ${cielo(ahora.codigo)}. Hoy: ${dia(0)}.`;
}

// Para el widget del clima: los números (no una frase), con 15 minutos de memoria para no consultar de más.
let climaGuardado = { clave: '', cuando: 0, dato: null };
async function climaDatos(lugar) {
  const ciudad = String(lugar || leerConfig().ciudad || '').trim();
  if (!ciudad) return { sinCiudad: true };
  if (climaGuardado.clave === ciudad.toLowerCase() && Date.now() - climaGuardado.cuando < 15 * 60 * 1000) return climaGuardado.dato;
  const sitio = await ubicar(ciudad);
  if (!sitio) return { error: `No encontré "${ciudad}"` };
  let r;
  try { r = await pronostico(sitio, 1); } catch { return { error: 'El clima no respondió' }; }
  const { ahora: a, dias: [d] } = r;
  const dato = {
    ciudad: sitio.name, temp: Math.round(a.temp), sensacion: Math.round(a.sensacion), codigo: a.codigo, dia: a.dia,
    cielo: cielo(a.codigo), max: d ? Math.round(d.max) : null, min: d ? Math.round(d.min) : null,
    lluvia: d && Number.isFinite(d.lluvia) ? d.lluvia : null,
  };
  climaGuardado = { clave: ciudad.toLowerCase(), cuando: Date.now(), dato };
  return dato;
}

// ---------- Buscar ----------
const recortar = (texto, largo) => { const t = String(texto || '').replace(/\s+/g, ' ').trim(); return t.length > largo ? `${t.slice(0, largo).replace(/\s\S*$/, '')}…` : t; };

// Lo que se va a decir en voz alta no lleva negritas ni marcas de cita.
const paraVoz = (t) => String(t).replace(/【[^】]*】/g, '').replace(/[*_`#]+/g, '').replace(/[ \t]+/g, ' ').trim();

// Groq: sus modelos gpt-oss traen una herramienta propia para buscar y leer páginas.
async function conGroq(consulta) {
  const c = leerConfig().ia.groq;
  if (!c.clave) return null;
  const base = (c.url || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  let ultimo = null;
  for (const modelo of ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']) {
    const r = await pedir(`${base}/chat/completions`, {
      clave: c.clave, espera: 45000,
      cuerpo: {
        model: modelo, temperature: 0.2, max_tokens: 1500, reasoning_effort: 'low',
        tools: [{ type: 'browser_search' }], tool_choice: 'required',
        messages: [
          { role: 'system', content: `Buscá en internet y respondé en español, en dos o tres frases, con los datos concretos (nombres, números, fechas). El usuario es de Argentina: si nombra un equipo, es de fútbol argentino. Si no encontrás lo que pide, decilo; no contestes otro tema. Sin asteriscos ni formato. Hoy es ${new Date().toLocaleDateString('es-AR', { dateStyle: 'full' })}.` },
          { role: 'user', content: consulta },
        ],
      },
    });
    const texto = r.json && r.json.choices && r.json.choices[0] && r.json.choices[0].message && r.json.choices[0].message.content;
    if (r.estado === 200 && texto && texto.trim()) return paraVoz(texto);
    ultimo = new Error(r.estado === 429 ? 'se acabó el cupo gratuito por ahora' : `respondió ${r.estado}`);
    if (r.estado === 401 || r.estado === 403) break;
  }
  throw ultimo;
}

async function conTavily(consulta) {
  const clave = (leerConfig().busqueda.tavily || '').trim();
  if (!clave) return null;
  const r = await pedir(DONDE.tavily, { clave, espera: 20000, cuerpo: { query: consulta, max_results: 4, search_depth: 'basic', include_answer: true } });
  if (r.estado === 401 || r.estado === 403) throw new Error('la clave no es válida');
  if (r.estado === 429 || r.estado === 432) throw new Error('se acabaron las búsquedas gratuitas del mes');
  if (r.estado !== 200 || !r.json) throw new Error(`respondió ${r.estado}`);
  const resultados = (r.json.results || []).slice(0, 4).map((x) => `- ${x.title}: ${recortar(x.content, 280)}`);
  const texto = [r.json.answer, ...resultados].filter(Boolean).join('\n');
  if (!texto) throw new Error('no encontró nada');
  return texto;
}

async function conWikipedia(consulta) {
  const r = await pedir(`${DONDE.wikipedia}?action=query&generator=search&gsrsearch=${encodeURIComponent(consulta)}&gsrlimit=1&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json`);
  const paginas = r.json && r.json.query && r.json.query.pages;
  const pagina = paginas && Object.values(paginas)[0];
  if (!pagina || !pagina.extract) throw new Error('no encontró nada');
  return `Según Wikipedia (${pagina.title}): ${recortar(pagina.extract, 900)}`;
}

const FUENTES = [['groq', 'Groq', conGroq], ['tavily', 'Tavily', conTavily], ['wikipedia', 'Wikipedia', conWikipedia]];
let ultimaFuente = '';

// Devuelve un texto con lo encontrado (para que el modelo arme la respuesta, o para decirlo tal cual).
async function buscar(consulta) {
  const pedido = String(consulta || '').trim();
  if (!pedido) throw new Error('Falta decir qué buscar.');
  const fallas = [];
  for (const [id, nombre, fn] of FUENTES) {
    const inicio = Date.now();
    try {
      const texto = await fn(pedido);
      if (texto) { ultimaFuente = id; historial.anotar(`Búsqueda en internet con ${nombre} (${Date.now() - inicio} ms): "${pedido}"`); return texto; }
    } catch (e) { fallas.push(`${nombre}: ${e.message}`); historial.anotar(`Búsqueda con ${nombre} falló: ${e.message}`); }
  }
  throw new Error(`No pude buscar eso. ${fallas.join(' · ')}`);
}

// Para el botón "Probar" de Ajustes: qué servicio contestó y un pedacito de lo que dijo.
async function probar() {
  const inicio = Date.now();
  const texto = await buscar('¿Quién ganó el último mundial de fútbol masculino?');
  return { fuente: (FUENTES.find((f) => f[0] === ultimaFuente) || [])[1], ms: Date.now() - inicio, texto: recortar(texto, 160) };
}

module.exports = { clima, climaDatos, buscar, probar, recortar };
