// Jugadas de los juegos: cuándo pasó cada kill, muerte o asistencia, para que "grabá esa kill" arme el clip justo alrededor de la
// jugada en vez de medir segundos hacia atrás. Jarvis no mira la pantalla: lo cuentan los propios juegos que lo permiten.
//  - Counter-Strike 2 y Dota 2: "Game State Integration" de Valve. Jarvis deja un archivo de configuración en la carpeta del juego
//    y el juego le manda su estado a 127.0.0.1 (con una clave) cada vez que cambia. Es la vía oficial, la usan los torneos y no
//    tiene riesgo de VAC. Dota 2 necesita además la opción de inicio -gamestateintegration.
//  - League of Legends: la "Live Client Data API" del propio juego (https://127.0.0.1:2999), que lista las kills de la partida.
// Se guardan las jugadas de los últimos 15 minutos (más que el buffer de clips).
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUERTO = 47833;
const GUARDAR_MS = 15 * 60 * 1000;
let jugadas = []; // { tipo: 'kill'|'muerte'|'asistencia', t, juego, detalle }
let estado = { cs2: { conectado: false, ultimo: 0, error: '' }, dota2: { conectado: false, ultimo: 0, error: '' }, lol: { ultimo: 0 } };
let servidor = null;
let clave = '';
let leerConfig = () => ({});
let guardarConfig = () => {};
let alJugada = () => {};
let ahora = () => Date.now();

function configurar(f = {}) {
  if (f.leerConfig) leerConfig = f.leerConfig;
  if (f.guardarConfig) guardarConfig = f.guardarConfig;
  if (f.alJugada) alJugada = f.alJugada;
  if (f.ahora) ahora = f.ahora;
  if (f.pedirLol) pedirLol = f.pedirLol; // pruebas
}

function anotar(tipo, juego, detalle = '', t = ahora()) {
  jugadas.push({ tipo, t, juego, detalle });
  jugadas = jugadas.filter((j) => ahora() - j.t < GUARDAR_MS).slice(-200);
  try { alJugada({ tipo, t, juego, detalle }); } catch {}
}

// Las últimas n jugadas de un tipo ('kill', 'muerte', o 'jugada' = kill o asistencia) de los últimos `dentroDe` ms.
function ultimas(tipo, { n = 1, dentroDe = 120000, hasta = 0 } = {}) {
  const limite = hasta || ahora();
  const sirve = (j) => (tipo === 'jugada' ? j.tipo === 'kill' || j.tipo === 'asistencia' : j.tipo === tipo);
  return jugadas.filter((j) => sirve(j) && j.t <= limite + 500 && limite - j.t <= dentroDe).slice(-Math.max(1, n));
}

// ---------- Counter-Strike 2 y Dota 2 (Game State Integration) ----------
const anteriores = { cs2: null, dota2: null };
function delta(juego, clavePartida, actuales, nombres) {
  const a = anteriores[juego];
  anteriores[juego] = { partida: clavePartida, ...actuales };
  if (!a || a.partida !== clavePartida) return; // partida nueva (o primera lectura): solo se toma la base
  for (const [campo, tipo] of nombres) {
    const antes = a[campo]; const ahoraN = actuales[campo];
    if (!Number.isFinite(antes) || !Number.isFinite(ahoraN)) continue;
    if (ahoraN < antes) continue; // se reinició el contador
    for (let k = 0; k < Math.min(5, ahoraN - antes); k++) anotar(tipo, juego === 'cs2' ? 'Counter-Strike 2' : 'Dota 2', actuales.detalle && tipo === 'kill' ? actuales.detalle : '');
  }
}
function recibirCs2(d) {
  estado.cs2 = { ...estado.cs2, conectado: true, ultimo: ahora(), error: '' };
  const p = d.player || {}; const prov = d.provider || {};
  // Muerto o mirando a otro: el "player" es a quien se mira. Solo cuentan los números propios.
  if (!p.match_stats || (prov.steamid && p.steamid && p.steamid !== prov.steamid)) { if (prov.steamid && p.steamid && p.steamid !== prov.steamid && anteriores.cs2) anteriores.cs2.mirando = true; return; }
  const ronda = (p.state && p.state.round_kills) || 0;
  const detalle = ronda >= 5 ? 'Ace' : ronda === 4 ? '4 kills en la ronda' : ronda === 3 ? '3 kills en la ronda' : (p.state && p.state.round_killhs && ronda && p.state.round_killhs === ronda) ? 'Headshot' : '';
  const m = d.map || {};
  delta('cs2', `${m.name || ''}|${m.mode || ''}`, { kills: p.match_stats.kills, deaths: p.match_stats.deaths, assists: p.match_stats.assists, detalle }, [['kills', 'kill'], ['deaths', 'muerte'], ['assists', 'asistencia']]);
}
function recibirDota(d) {
  estado.dota2 = { ...estado.dota2, conectado: true, ultimo: ahora(), error: '' };
  const p = d.player || {};
  if (!Number.isFinite(p.kills)) return;
  const m = d.map || {};
  delta('dota2', String(m.matchid || ''), { kills: p.kills, deaths: p.deaths, assists: p.assists, detalle: p.kill_streak >= 3 ? `racha de ${p.kill_streak}` : '' }, [['kills', 'kill'], ['deaths', 'muerte'], ['assists', 'asistencia']]);
}

function asegurarClave() {
  const c = leerConfig();
  c.juegos = c.juegos || {};
  if (!c.juegos.clave) { c.juegos.clave = crypto.randomBytes(12).toString('hex'); guardarConfig(c); }
  clave = c.juegos.clave;
  return clave;
}

function iniciarServidor() {
  if (servidor) return Promise.resolve();
  asegurarClave();
  servidor = http.createServer((req, res) => {
    const juego = req.url === '/gsi/cs2' ? 'cs2' : req.url === '/gsi/dota2' ? 'dota2' : '';
    if (req.method !== 'POST' || !juego) { res.writeHead(404); res.end(); return; }
    let cuerpo = ''; let largo = 0;
    req.on('data', (b) => { largo += b.length; if (largo > 512 * 1024) { req.destroy(); return; } cuerpo += b; });
    req.on('end', () => {
      res.writeHead(200); res.end();
      let d; try { d = JSON.parse(cuerpo); } catch { return; }
      if (!d || !d.auth || d.auth.token !== clave) return; // solo lo que manda el juego con nuestra clave
      try { (juego === 'cs2' ? recibirCs2 : recibirDota)(d); } catch {}
    });
  });
  return new Promise((ok) => {
    servidor.once('error', (e) => { estado.cs2.error = estado.dota2.error = `No pude abrir el puerto ${PUERTO}: ${e.code || e.message}`; servidor = null; ok(); });
    servidor.listen(PUERTO, '127.0.0.1', ok);
  });
}

// El archivo que le dice al juego adónde mandar su estado.
function textoCfg(juego) {
  const datos = juego === 'cs2'
    ? '"provider" "1"\n    "map" "1"\n    "round" "1"\n    "player_id" "1"\n    "player_state" "1"\n    "player_match_stats" "1"'
    : '"provider" "1"\n    "map" "1"\n    "player" "1"\n    "hero" "1"';
  return `"Jarvis"\n{\n  "uri" "http://127.0.0.1:${PUERTO}/gsi/${juego}"\n  "timeout" "1.0"\n  "buffer" "0.0"\n  "throttle" "0.1"\n  "heartbeat" "30.0"\n  "auth"\n  {\n    "token" "${clave}"\n  }\n  "data"\n  {\n    ${datos}\n  }\n}\n`;
}
const RUTA_CFG = {
  cs2: (carpeta) => path.join(carpeta, 'game', 'csgo', 'cfg', 'gamestate_integration_jarvis.cfg'),
  dota2: (carpeta) => path.join(carpeta, 'game', 'dota', 'cfg', 'gamestate_integration', 'gamestate_integration_jarvis.cfg'),
};
const APP_ID = { cs2: 730, dota2: 570 };
// Deja (o actualiza) el archivo en los juegos instalados. Devuelve qué pasó con cada uno.
function conectarJuegos(juegosSteam = []) {
  asegurarClave();
  const r = {};
  for (const juego of ['cs2', 'dota2']) {
    const j = juegosSteam.find((x) => x.id === APP_ID[juego]);
    if (!j || !j.carpeta || !fs.existsSync(j.carpeta)) { r[juego] = 'no instalado'; continue; }
    const ruta = RUTA_CFG[juego](j.carpeta);
    try {
      const texto = textoCfg(juego);
      let actual = ''; try { actual = fs.readFileSync(ruta, 'utf8'); } catch {}
      if (actual !== texto) { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, texto); r[juego] = 'listo (abrí o reiniciá el juego)'; }
      else r[juego] = 'listo';
    } catch (e) { r[juego] = `no pude escribir el archivo: ${e.code || e.message}`; }
  }
  return r;
}

// ---------- League of Legends (Live Client Data API, solo durante una partida) ----------
let relojLol = null;
let lol = { yo: '', vistos: new Set(), partida: '' };
let pedirLol = (ruta) => new Promise((ok, mal) => {
  const req = https.get({ host: '127.0.0.1', port: 2999, path: `/liveclientdata/${ruta}`, rejectUnauthorized: false, timeout: 1500 }, (res) => {
    let t = ''; res.on('data', (b) => { t += b; }); res.on('end', () => { try { ok(JSON.parse(t)); } catch (e) { mal(e); } });
  });
  req.on('error', mal); req.on('timeout', () => req.destroy(new Error('timeout')));
});
async function vueltaLol() {
  let eventos; let stats;
  try { [eventos, stats] = await Promise.all([pedirLol('eventdata'), pedirLol('gamestats')]); } catch { lol.partida = ''; return; }
  const ahoraMs = ahora();
  if (!lol.partida || !lol.yo) {
    try { lol.yo = String(await pedirLol('activeplayername')).split('#')[0]; } catch { return; }
    lol.partida = `${stats.mapName || ''}|${Math.round(ahoraMs / 1000 - stats.gameTime)}`;
    lol.vistos = new Set((eventos.Events || []).map((e) => e.EventID)); // lo que ya había pasado no cuenta
    return;
  }
  estado.lol.ultimo = ahoraMs;
  for (const e of eventos.Events || []) {
    if (lol.vistos.has(e.EventID)) continue;
    lol.vistos.add(e.EventID);
    if (e.EventName !== 'ChampionKill' && e.EventName !== 'Multikill' && e.EventName !== 'Ace') continue;
    const t = ahoraMs - Math.max(0, (stats.gameTime - e.EventTime) * 1000);
    const yo = (n) => String(n || '').split('#')[0] === lol.yo;
    if (e.EventName === 'ChampionKill') {
      if (yo(e.KillerName)) anotar('kill', 'League of Legends', '', t);
      else if (yo(e.VictimName)) anotar('muerte', 'League of Legends', '', t);
      else if ((e.Assisters || []).some(yo)) anotar('asistencia', 'League of Legends', '', t);
    } else if (yo(e.KillerName) || yo(e.Acer)) {
      const ultima = jugadas.filter((j) => j.tipo === 'kill' && j.juego === 'League of Legends').pop();
      if (ultima && Math.abs(ultima.t - t) < 15000) ultima.detalle = e.EventName === 'Ace' ? 'Ace' : ['', '', 'Doble', 'Triple', 'Cuádruple', 'Penta'][e.KillStreak] || 'Multikill';
    }
  }
}
// Solo se pregunta mientras League está abierto (el que decide eso es quien sabe qué programas corren).
function seguirLol(abierto) {
  if (abierto && !relojLol) { lol = { yo: '', vistos: new Set(), partida: '' }; relojLol = setInterval(() => { vueltaLol().catch(() => {}); }, 2000); }
  if (!abierto && relojLol) { clearInterval(relojLol); relojLol = null; }
}

function resumen() {
  const viejo = (x) => !x.ultimo || ahora() - x.ultimo > 5 * 60 * 1000;
  return {
    puerto: PUERTO,
    cs2: { ...estado.cs2, activo: !viejo(estado.cs2) },
    dota2: { ...estado.dota2, activo: !viejo(estado.dota2) },
    lol: { activo: !viejo(estado.lol), mirando: !!relojLol },
    jugadas: jugadas.slice(-12).reverse().map((j) => ({ ...j })),
  };
}
function cerrar() { if (servidor) { servidor.close(); servidor = null; } seguirLol(false); }
function _reiniciar() { jugadas = []; anteriores.cs2 = anteriores.dota2 = null; estado = { cs2: { conectado: false, ultimo: 0, error: '' }, dota2: { conectado: false, ultimo: 0, error: '' }, lol: { ultimo: 0 } }; }

module.exports = { configurar, iniciarServidor, conectarJuegos, seguirLol, ultimas, anotar, resumen, cerrar, textoCfg, recibirCs2, recibirDota, vueltaLol, PUERTO, _reiniciar };
