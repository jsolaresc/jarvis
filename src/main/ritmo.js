// Análisis del ritmo de la música, para que los ojos del notch bailen "con" la canción y no solo reaccionen.
// Es una función pura y autocontenida (sin require ni nada de Node): su código se inyecta tal cual en la página
// del reproductor oculto (musica.js), que le va pasando el espectro del audio (AnalyserNode, 0-255) varias veces
// por segundo; y los tests la corren con espectros sintéticos.
//
// Qué calcula:
//   - golpes: cada vez que aparece un ataque (bombo, caja, una nota fuerte) en graves y medios bajos (flujo espectral
//     con umbral adaptativo), con la hora exacta en que ocurrió;
//   - bpm y confianza: el tempo, por autocorrelación del flujo de los últimos ~8 segundos (70 a 180 BPM, con
//     preferencia por 85-150 para no confundirse con el doble o la mitad);
//   - graves / medios / agudos / energia: cuánta fuerza hay, relativa a lo que viene sonando (0 a 1);
//   - subida: cuánto más fuerte suena el último segundo que lo anterior (un "drop" da valores altos).
function crearAnalizador() {
  var PASO = 10; // ms por casillero del sobre de ataques
  var N = 800; // 8 segundos
  var sobre = new Float32Array(N); // flujo espectral, por casillero de 10 ms (circular)
  var casilleroActual = -1;
  var casilleroInicio = -1;
  var previo = null;
  var historial = []; // últimos flujos {t, v}, para el umbral
  var ultimos = [0, 0]; // flujos de los dos cuadros anteriores (para ver el pico)
  var tUlt = [0, 0];
  var golpes = 0;
  var tGolpe = -1e9;
  var bpm = 0;
  var conf = 0;
  var tTempo = 0;
  var gMax = 30; var gProm = 10; var energiaProm = 10; var energiaCorta = 10;
  var tAnterior = 0;
  var nivel = { graves: 0, medios: 0, agudos: 0, energia: 0 };

  function suma(e, a, b) { var s = 0; for (var i = a; i < b && i < e.length; i++) s += e[i]; return s / Math.max(1, Math.min(b, e.length) - a); }

  function tempo(ahora) {
    // Autocorrelación del sobre, de los casilleros ya completos.
    var fin = casilleroActual; // índice absoluto del casillero actual
    var largo = Math.min(N - 1, fin - casilleroInicio);
    if (largo < 300) { conf = 0; return; } // hace falta al menos 3 segundos de música
    var x = new Float32Array(largo);
    var media = 0;
    for (var i = 0; i < largo; i++) { x[i] = sobre[(fin - largo + i) % N]; media += x[i]; }
    media /= largo;
    for (var j = 0; j < largo; j++) x[j] = Math.max(0, x[j] - media);
    // Los ataques caen en un solo casillero y los cuadros no son del todo regulares: se los "ensancha" un poco
    // (triángulo de ±30 ms) para que dos golpes casi a la misma distancia se reconozcan como lo mismo.
    var ancho = new Float32Array(largo);
    var kernel = [1, 2, 3, 4, 3, 2, 1];
    for (var u = 0; u < largo; u++) { var acc = 0; for (var w = -3; w <= 3; w++) { var idx = u + w; if (idx >= 0 && idx < largo) acc += x[idx] * kernel[w + 3]; } ancho[u] = acc / 16; }
    x = ancho;
    var minLag = Math.round(6000 / 180 / PASO * 10); // 180 BPM
    var maxLag = Math.round(6000 / 70 / PASO * 10); // 70 BPM
    var r = []; var mejor = -1; var mejorV = 0; var total = 0; var cuenta = 0;
    for (var lag = minLag - 1; lag <= maxLag + 1; lag++) {
      var s = 0;
      for (var k = lag; k < largo; k++) s += x[k] * x[k - lag];
      s /= (largo - lag);
      r[lag] = s;
    }
    for (var l = minLag; l <= maxLag; l++) {
      var b = 60000 / (l * PASO);
      // Preferencia por el rango más común (centrada en ~118 BPM, ancho de poco más de media octava): evita tomar la mitad o el doble.
      var oct = Math.log(b / 118) / Math.LN2;
      var peso = Math.exp(-0.5 * Math.pow(oct / 0.55, 2));
      var v = r[l] * peso;
      // Un pico verdadero: mayor que sus vecinos.
      if (r[l] > r[l - 1] && r[l] >= r[l + 1] && v > mejorV) { mejorV = v; mejor = l; }
      total += r[l]; cuenta++;
    }
    if (mejor < 0) { conf = Math.max(0, conf - 0.1); return; }
    // Interpolación parabólica para afinar entre casilleros.
    var a = r[mejor - 1]; var c0 = r[mejor]; var d = r[mejor + 1];
    var den = a - 2 * c0 + d;
    var delta = den !== 0 ? 0.5 * (a - d) / den : 0;
    var lagFino = mejor + Math.max(-0.5, Math.min(0.5, delta));
    var nuevo = 60000 / (lagFino * PASO);
    // Si hay un pico casi igual al doble del tempo (mitad de lag), conviene el de ritmo más "natural"; el peso ya lo prefiere.
    var promedio = total / Math.max(1, cuenta);
    var nitidez = promedio > 0 ? (r[mejor] / promedio) : 0;
    var nuevaConf = Math.max(0, Math.min(1, (nitidez - 1.3) / 2.2));
    if (bpm === 0 || Math.abs(nuevo - bpm) / bpm > 0.12) { // un cambio grande de tempo: se acepta si es firme
      if (nuevaConf > 0.35 || bpm === 0) { bpm = nuevo; conf = nuevaConf; }
      else conf = conf * 0.8;
    } else { bpm += (nuevo - bpm) * 0.35; conf += (nuevaConf - conf) * 0.4; }
    tTempo = ahora;
  }

  // espectro: Uint8Array de AnalyserNode.getByteFrequencyData; ahora: ms (performance.now()).
  function paso(espectro, ahora) {
    var dt = tAnterior ? Math.min(200, ahora - tAnterior) : 23;
    tAnterior = ahora;
    var flujo = 0;
    if (previo) {
      var tope = Math.min(70, espectro.length);
      for (var i = 1; i < tope; i++) {
        var d = espectro[i] - previo[i];
        if (d > 0) flujo += d * (i <= 8 ? 2 : 1);
      }
      for (var q = 0; q < espectro.length; q++) previo[q] = espectro[q];
    } else { previo = new Uint8Array(espectro.length); previo.set(espectro); }

    // El sobre: el mayor flujo dentro de cada casillero de 10 ms.
    var cas = Math.floor(ahora / PASO);
    if (casilleroActual < 0) { casilleroActual = cas; casilleroInicio = cas; }
    while (casilleroActual < cas) { casilleroActual++; sobre[casilleroActual % N] = 0; }
    if (flujo > sobre[casilleroActual % N]) sobre[casilleroActual % N] = flujo;

    // Umbral adaptativo sobre el último segundo y medio.
    historial.push({ t: ahora, v: flujo });
    while (historial.length && ahora - historial[0].t > 1500) historial.shift();
    var m = 0; for (var h = 0; h < historial.length; h++) m += historial[h].v; m /= Math.max(1, historial.length);
    var varianza = 0; for (var h2 = 0; h2 < historial.length; h2++) varianza += Math.pow(historial[h2].v - m, 2);
    var desvio = Math.sqrt(varianza / Math.max(1, historial.length));
    var umbral = m + 1.3 * desvio + 6;
    // Pico: el cuadro anterior fue mayor que el umbral, que el de antes y que el actual. Su hora es la del cuadro anterior.
    if (ultimos[0] > umbral && ultimos[0] >= ultimos[1] && ultimos[0] > flujo && tUlt[0] - tGolpe > 220) {
      golpes++; tGolpe = tUlt[0];
    }
    ultimos[1] = ultimos[0]; tUlt[1] = tUlt[0]; ultimos[0] = flujo; tUlt[0] = ahora;

    // Niveles relativos.
    var g = suma(espectro, 1, 8); var me = suma(espectro, 8, 50); var ag = suma(espectro, 50, 200);
    var e = suma(espectro, 1, 200);
    gMax = Math.max(g, gMax * Math.pow(0.5, dt / 8000), 30); // el máximo reciente decae con media vida de 8 s
    var k = Math.min(1, dt / 20000);
    gProm += (g - gProm) * k; energiaProm += (e - energiaProm) * k;
    energiaCorta += (e - energiaCorta) * Math.min(1, dt / 1000);
    nivel.graves = Math.max(0, Math.min(1, (g - gProm * 0.6) / Math.max(1, gMax - gProm * 0.6)));
    nivel.medios = Math.max(0, Math.min(1, me / 140));
    nivel.agudos = Math.max(0, Math.min(1, ag / 110));
    nivel.energia = Math.max(0, Math.min(1, (e - 18) / 70));
    if (ahora - tTempo > 500) tempo(ahora);
  }

  function estado(ahora) {
    var subida = energiaProm > 1 ? energiaCorta / energiaProm : 1;
    return {
      bpm: Math.round(bpm * 10) / 10, conf: Math.round(conf * 100) / 100,
      n: golpes, hace: golpes ? Math.round(ahora - tGolpe) : null,
      graves: Math.round(nivel.graves * 100) / 100, medios: Math.round(nivel.medios * 100) / 100,
      agudos: Math.round(nivel.agudos * 100) / 100, energia: Math.round(nivel.energia * 100) / 100,
      subida: Math.round(subida * 100) / 100,
    };
  }
  return { paso: paso, estado: estado };
}

module.exports = { crearAnalizador };
