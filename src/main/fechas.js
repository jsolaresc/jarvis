// Fechas y horas dichas en castellano ("mañana a las tres de la tarde", "el viernes 18:30", "el 20 de noviembre",
// "en dos horas", "por una hora y media"), para crear eventos del calendario. Trabaja sobre texto ya "aplanado"
// (sin acentos ni mayúsculas, como lo deja config.normalizar) y devuelve qué entendió y qué texto sobra (el título).
const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
const NUM = '(\\d{1,3}|[a-z]+(?: y [a-z]+)?)';

const sumarDias = (f, n) => { const d = new Date(f); d.setDate(d.getDate() + n); return d; };
const dia0 = (f) => new Date(f.getFullYear(), f.getMonth(), f.getDate());
const dos = (n) => String(n).padStart(2, '0');
// '2026-11-12T15:30' (hora local, sin zona): es lo que viaja entre las reglas, el modelo y el calendario.
const aISOLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
const deISOLocal = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; };

// -> { inicio: Date, todoElDia, duracionMin|null, resto } o null si no hay ninguna fecha ni hora.
function analizar(texto, ahora = new Date(), numeroDe = (x) => (/^\d+$/.test(x) ? Number(x) : null)) {
  let t = ` ${texto} `;
  const sacar = (re) => { const m = re.exec(t); if (m) t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`; return m; };
  let duracionMin = null;
  let m = sacar(new RegExp(` por ${NUM} (horas?|minutos?)(?: y media)? `));
  if (m) {
    const n = numeroDe(m[1]);
    if (n) duracionMin = m[2].startsWith('hora') ? n * 60 + (/ y media $/.test(m[0]) ? 30 : 0) : n;
  } else if ((m = sacar(/ por (media hora|un cuarto de hora|una hora y media) /))) duracionMin = { 'media hora': 30, 'un cuarto de hora': 15, 'una hora y media': 90 }[m[1]];

  // "en 2 horas", "en media hora": desde ahora.
  let relativo = null;
  if ((m = sacar(new RegExp(` en ${NUM} (minutos?|horas?) `)))) { const n = numeroDe(m[1]); if (n) relativo = new Date(ahora.getTime() + n * (m[2].startsWith('hora') ? 60 : 1) * 60000); }
  else if ((m = sacar(/ en (media hora|un cuarto de hora|una hora y media) /))) relativo = new Date(ahora.getTime() + { 'media hora': 30, 'un cuarto de hora': 15, 'una hora y media': 90 }[m[1]] * 60000);

  // El día.
  let fecha = null;
  if (sacar(/ pasado manana /)) fecha = sumarDias(dia0(ahora), 2);
  else if (sacar(/ (?:para )?manana /)) fecha = sumarDias(dia0(ahora), 1);
  else if (sacar(/ (?:para )?hoy /)) fecha = dia0(ahora);
  else if ((m = sacar(new RegExp(` (?:el |este |proximo |el proximo )*(${Object.keys(DIAS).join('|')}) (?:que viene |proximo )?`)))) {
    let falta = (DIAS[m[1]] - ahora.getDay() + 7) % 7;
    if (falta === 0) falta = 7;
    fecha = sumarDias(dia0(ahora), falta);
  } else if ((m = sacar(new RegExp(` (?:el )?(?:dia )?(\\d{1,2}) de (${Object.keys(MESES).join('|')})(?: de (\\d{4}))? `)))) {
    fecha = new Date(+(m[3] || ahora.getFullYear()), MESES[m[2]], +m[1]);
    if (!m[3] && fecha < dia0(ahora)) fecha.setFullYear(fecha.getFullYear() + 1);
  } else if ((m = sacar(/ (?:el )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))? /))) {
    const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : ahora.getFullYear();
    fecha = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && fecha < dia0(ahora)) fecha.setFullYear(fecha.getFullYear() + 1);
  } else if ((m = sacar(/ el (?:dia )?(\d{1,2}) /))) {
    const n = +m[1];
    if (n >= 1 && n <= 31) { fecha = new Date(ahora.getFullYear(), ahora.getMonth(), n); if (fecha < dia0(ahora)) fecha = new Date(ahora.getFullYear(), ahora.getMonth() + 1, n); }
  }

  // La hora.
  let h = null; let min = 0; let franja = '';
  if ((m = sacar(/ al? mediodia /))) { h = 12; franja = 'x'; }
  else {
    const franjaRe = '(?: (?:de la|del|a la|por la|en la) (manana|tarde|noche|madrugada|mediodia))?( ?hs| horas)?';
    const intentos = [
      // "a las 8 y media", "a las 8 y veinte", "a las 8 con 15", "a las 8 15"
      new RegExp(` a las? (\\d{1,2}|[a-z]+)(?: (media|y media|y cuarto|menos cuarto|y (\\d{1,2}|[a-z]+(?: y [a-z]+)?)|con (\\d{1,2})|(\\d{2})))?${franjaRe} `),
      new RegExp(` a las? (\\d{1,2}|[a-z]+)()()()()${franjaRe} `), // sin minutos: lo que sigue es parte del título
    ];
    for (const re of intentos) {
      const mh = re.exec(t);
      if (!mh) continue;
      const hh = numeroDe(mh[1]);
      const f = mh[2] || '';
      const minutosPalabra = mh[3] ? numeroDe(mh[3]) : null;
      if (hh === null || (mh[3] && minutosPalabra === null)) continue;
      t = `${t.slice(0, mh.index)} ${t.slice(mh.index + mh[0].length)}`;
      h = hh;
      if (/media/.test(f)) min = 30; else if (f === 'y cuarto') min = 15; else if (f === 'menos cuarto') { min = 45; h -= 1; }
      else if (mh[3]) min = minutosPalabra; else if (mh[4]) min = +mh[4]; else if (mh[5]) min = +mh[5];
      franja = mh[6] || '';
      break;
    }
  }
  if (h === null && !fecha && !relativo) return null;
  if (h !== null && (h < 0 || h > 24 || min > 59)) return null;

  let inicio; let todoElDia = false;
  if (relativo) inicio = relativo;
  else if (h === null) { todoElDia = true; inicio = fecha; }
  else {
    if (/tarde|noche/.test(franja) && h < 12) h += 12;
    else if (!franja && h >= 1 && h <= 6) h += 12; // "a las 5" sin aclarar: una reunión a las 5 de la mañana es rara
    inicio = new Date((fecha || dia0(ahora)).getTime());
    inicio.setHours(h % 24, min, 0, 0);
    if (!fecha && inicio <= ahora) inicio = sumarDias(inicio, 1); // "a las 9" cuando ya pasaron las 9: mañana
  }
  const resto = t.replace(/\s+/g, ' ').trim();
  return { inicio, todoElDia, duracionMin, resto };
}

module.exports = { analizar, aISOLocal, deISOLocal };
