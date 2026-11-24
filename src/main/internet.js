// Lo que Jarvis consulta en internet, siempre con servicios gratuitos:
//   - clima: Open-Meteo (sin clave ni registro).
//   - buscar: se prueban en cadena, igual que los modelos — la búsqueda web de Groq (con la misma
//     clave gratuita de Inteligencia), Tavily (clave gratuita opcional, 1.000 búsquedas por mes) y,
//     si no hay ninguna clave, Wikipedia (que no sabe de noticias pero sí de casi todo lo demás).
const historial = require('./historial');
const { leerConfig } = require('./config');

// Direcciones de cada servicio (se pueden cambiar con variables de entorno: lo usan las pruebas).
const DONDE = {
  geocodificar: process.env.JARVIS_URL_GEO || 'https://geocoding-api.open-meteo.com/v1/search',
  pronostico: process.env.JARVIS_URL_CLIMA || 'https://api.open-meteo.com/v1/forecast',
  tavily: process.env.JARVIS_URL_TAVILY || 'https://api.tavily.com/search',
  wikipedia: process.env.JARVIS_URL_WIKIPEDIA || 'https://es.wikipedia.org/w/api.php',
};

async function pedir(url, { cuerpo, clave, espera = 15000 } = {}) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), espera);
  try {
    const r = await fetch(url, {
      method: cuerpo ? 'POST' : 'GET', signal: control.signal,
      headers: { 'User-Agent': 'Jarvis/0.1 (asistente personal de escritorio)', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(clave ? { Authorization: `Bearer ${clave}` } : {}) },
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

// lugar: ciudad (si no se dice, la cargada en Ajustes). cuando: 'ahora' | 'hoy' | 'manana' | 'pasado'.
async function clima(lugar, cuando = 'ahora') {
  const ciudad = String(lugar || leerConfig().ciudad || '').trim();
  if (!ciudad) throw new Error('No sé de qué ciudad. Decime "el clima en tal lugar", o cargá tu ciudad en Ajustes, en General.');
  const g = await pedir(`${DONDE.geocodificar}?name=${encodeURIComponent(ciudad)}&count=1&language=es&format=json`);
  const sitio = g.json && g.json.results && g.json.results[0];
  if (!sitio) throw new Error(`No encontré ninguna ciudad llamada "${ciudad}".`);
  const p = await pedir(`${DONDE.pronostico}?latitude=${sitio.latitude}&longitude=${sitio.longitude}`
    + '&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=3');
  const ahora = p.json && p.json.current;
  const dias = p.json && p.json.daily;
  if (p.estado !== 200 || !ahora || !dias || !Array.isArray(dias.time)) throw new Error('El servicio del clima no respondió bien.');
  const dia = (i) => {
    const lluvia = dias.precipitation_probability_max && dias.precipitation_probability_max[i];
    return `${cielo(dias.weather_code[i])}, máxima de ${grados(dias.temperature_2m_max[i])} y mínima de ${grados(dias.temperature_2m_min[i])}`
      + (Number.isFinite(lluvia) ? `, con ${Math.round(lluvia)} por ciento de probabilidad de lluvia` : '');
  };
  if (cuando === 'manana') return `Mañana en ${sitio.name}: ${dia(1)}.`;
  if (cuando === 'pasado') return `Pasado mañana en ${sitio.name}: ${dia(2)}.`;
  const sensacion = Math.abs(ahora.apparent_temperature - ahora.temperature_2m) >= 2 ? `, con sensación de ${Math.round(ahora.apparent_temperature)}` : '';
  return `En ${sitio.name} hace ${grados(ahora.temperature_2m)}${sensacion}, ${cielo(ahora.weather_code)}. Hoy: ${dia(0)}.`;
}

// Para el widget del clima: los números (no una frase), con 15 minutos de memoria para no consultar de más.
let climaGuardado = { clave: '', cuando: 0, dato: null };
async function climaDatos(lugar) {
  const ciudad = String(lugar || leerConfig().ciudad || '').trim();
  if (!ciudad) return { sinCiudad: true };
  if (climaGuardado.clave === ciudad.toLowerCase() && Date.now() - climaGuardado.cuando < 15 * 60 * 1000) return climaGuardado.dato;
  const g = await pedir(`${DONDE.geocodificar}?name=${encodeURIComponent(ciudad)}&count=1&language=es&format=json`);
  const sitio = g.json && g.json.results && g.json.results[0];
  if (!sitio) return { error: `No encontré "${ciudad}"` };
  const p = await pedir(`${DONDE.pronostico}?latitude=${sitio.latitude}&longitude=${sitio.longitude}`
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1');
  const a = p.json && p.json.current; const d = p.json && p.json.daily;
  if (p.estado !== 200 || !a) return { error: 'El clima no respondió' };
  const dato = {
    ciudad: sitio.name, temp: Math.round(a.temperature_2m), sensacion: Math.round(a.apparent_temperature), codigo: a.weather_code, dia: a.is_day !== 0,
    cielo: cielo(a.weather_code), max: d ? Math.round(d.temperature_2m_max[0]) : null, min: d ? Math.round(d.temperature_2m_min[0]) : null,
    lluvia: d && d.precipitation_probability_max ? d.precipitation_probability_max[0] : null,
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
