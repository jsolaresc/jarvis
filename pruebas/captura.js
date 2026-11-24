// Prueba automática dentro de Electron: recorre los estados del notch y la ventana de ajustes,
// guarda capturas y anota los errores de consola. Si los modelos de voz están bajados, además hace
// una conversación de verdad (voz -> oído -> respuesta hablada) dentro de la app.
// Se activa con la variable JARVIS_PRUEBA=<carpeta>.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const PERS_PRUEBA = 'Hablá como un gallego de Galicia: tuteo, tono socarrón y modismos de allá (¡carallo!, pois, home).';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Una conversación real adentro de Electron: una voz local dice el pedido, entra como si fuera el
// micrófono, el proceso de voz lo transcribe y Jarvis contesta (el audio llega hasta el notch).
async function conversar(n) {
  const cerebro = require('../src/main/cerebro');
  const oido = require('../src/main/oido');
  const modelos = require('../src/main/modelos');
  const { leerConfig } = require('../src/main/config');
  if (!['vad', 'oido', 'voz-claude'].every((id) => modelos.instalado(id))) return { salteada: 'faltan los modelos de voz' };
  const inicio = Date.now();
  await cerebro.preparar();
  const carga = Date.now() - inicio;
  const decir = async (texto, canal = 'voz:audio') => {
    const trozos = []; let hz = 22050;
    await oido.decir(texto, 'claude', 1, (pcm, h) => { trozos.push(Int16Array.from(pcm)); hz = h; });
    const total = new Int16Array(trozos.reduce((a, t) => a + t.length, 0));
    let pos = 0; for (const t of trozos) { total.set(t, pos); pos += t.length; }
    const mic = new Int16Array(9600 + Math.floor((total.length * 16000) / hz) + 25600);
    for (let i = 0; i < mic.length; i++) mic[i] = (Math.random() - 0.5) * 80;
    for (let i = 0; i < mic.length - 35200; i++) { const x = (i * hz) / 16000; const a = Math.floor(x); mic[9600 + i] += (total[a] + (total[Math.min(total.length - 1, a + 1)] - total[a]) * (x - a)) * 0.8; }
    // El audio sale desde la ventana del notch, por el mismo camino que usa el micrófono de verdad.
    const base64 = Buffer.from(mic.buffer).toString('base64');
    await n.webContents.executeJavaScript(`(async () => {
      const bytes = Uint8Array.from(atob('${base64}'), (c) => c.charCodeAt(0));
      const todo = new Int16Array(bytes.buffer);
      for (let i = 0; i + 1280 <= todo.length; i += 1280) { window.jarvis.enviar('${canal}', todo.slice(i, i + 1280).buffer); await new Promise((r) => setTimeout(r, 20)); }
    })()`);
  };
  const leer = () => n.webContents.executeJavaScript(`({ vos: document.querySelector('#charla .vos').textContent, jarvis: document.querySelector('#charla .jarvis').textContent, fase: document.getElementById('notch').dataset.fase })`);
  const hasta = async (condicion, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await condicion()) return true; await esperar(100); } return false; };
  const activo = await cerebro.activar();
  await decir('¿Qué hora es?');
  const contesto = await hasta(async () => /Son las/.test((await leer()).jarvis));
  const charla = await leer();
  await foto(n, '7-conversacion');
  // No preguntó nada: al terminar de hablar deja de escuchar sola.
  const dejoDeEscuchar = await hasta(() => !cerebro.activa(), 10000);
  await esperar(1200);
  // Sin conversación abierta: se lo llama por su nombre, con el pedido en la misma frase. El audio
  // viaja por el camino de la vigilia (el que usa el micrófono cuando nadie lo llamó todavía).
  await decir('Yarvis, modo silencio.', 'voz:vigilia');
  const cambio = await hasta(() => leerConfig().modo === 'silencio');
  const historial = require('../src/main/historial').recientes(3).map((e) => ({ dicho: e.dicho, respuesta: e.respuesta, origen: e.origen, detalle: e.detalle.map((d) => d.texto) }));
  cerebro.cancelar();
  return { activo, carga, contesto, charla, dejoDeEscuchar, despertoPorSuNombre: cambio, historial, voz: oido.diagnostico() };
}

// Música contra una página de mentira que imita lo que Jarvis usa de YouTube Music: la cookie de
// sesión, el enlace "Mi Supermix" en el inicio (que aparece tarde), y un reproductor con botones.
// Se activa con JARVIS_URL_MUSICA=http://127.0.0.1:47990 (music.youtube.com de verdad no se toca).
async function probarMusica() {
  if (!/127\.0\.0\.1:47990/.test(process.env.JARVIS_URL_MUSICA || '')) return { salteada: 'sin página de mentira' };
  const http = require('http');
  const { session, BrowserWindow } = require('electron');
  const musica = require('../src/main/musica');
  const tono = (() => { // 3 segundos de un tono, como archivo WAV
    const n = 8000 * 3; const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 6) * 3000), 44 + i * 2);
    return b;
  })();
  const pedidos = [];
  const servidor = http.createServer((req, res) => {
    pedidos.push(req.url);
    if (req.url === '/tono.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': tono.length }); res.end(tono); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (req.url.startsWith('/results')) { // la búsqueda de YouTube: un anuncio, un Short y recién después el video
      res.end('<a href="https://ads.example/x">Anuncio</a><a href="/shorts/abcdefghijk" title="Un short">s</a><script>setTimeout(() => { document.body.insertAdjacentHTML("beforeend", \'<a id="video-title" href="/watch?v=dQw4w9WgXcQ&pp=x" title="Soda Stereo - Persiana Americana">Soda Stereo - Persiana Americana</a>\'); }, 600);</script>');
      return;
    }
    if (req.url.startsWith('/watch')) {
      res.end('<audio src="/tono.wav" loop preload="auto"></audio><script>navigator.mediaSession.metadata = new MediaMetadata({ title: "Persiana Americana", artist: "Soda Stereo", artwork: [{ src: "http://127.0.0.1:47990/tapa.svg", sizes: "512x512", type: "image/svg+xml" }] });</script><ytmusic-player-bar><button class="next-button" onclick="window.saltos=(window.saltos||0)+1">sig</button></ytmusic-player-bar>');
    } else {
      res.end('<h1>Inicio</h1><a href="/playlist?list=PL_otra_lista_cualquiera">Otra lista</a><div style="height:3000px"></div><script>setTimeout(() => { document.body.insertAdjacentHTML("beforeend", \'<a href="/playlist?list=RDTM_supermix_de_prueba_1">Mi Supermix</a>\'); }, 1500);</script>');
    }
  });
  await new Promise((ok) => servidor.listen(47990, '127.0.0.1', ok));
  const r = {};
  try {
    r.sinSesion = await musica.reproducir('').catch((e) => e.message);
    await session.fromPartition('persist:musica').cookies.set({ url: process.env.JARVIS_URL_MUSICA, name: 'SAPISID', value: 'x' });
    r.conSesion = await musica.conSesion();
    r.supermix = await musica.reproducir('');
    r.abrio = pedidos.filter((u) => u.startsWith('/watch'));
    r.pausar = await musica.controlar('pausar');
    r.pausarDeNuevo = await musica.controlar('pausar'); // no tiene que arrancarla
    r.seguir = await musica.controlar('reanudar');
    r.siguiente = await musica.controlar('siguiente');
    const volumen = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/watch')).webContents.executeJavaScript('document.querySelector("audio").volume');
    musica.atenuar(true); await esperar(200); r.volumenEscuchando = await volumen();
    musica.atenuar(false); await esperar(200); r.volumenDespues = await volumen();
    r.enOtroLado = await musica.reproducir('', 'living').catch((e) => e.message);
    // El botón del notch: Pausa si suena, Play si no. Lo avisa el propio reproductor.
    const boton = () => require('electron').BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('notch.html')).webContents.executeJavaScript('document.getElementById("musica-play").title');
    await esperar(400); r.botonSonando = [musica.estado().sonando, await boton()];
    await musica.controlar('alternar'); await esperar(500); r.botonPausado = [musica.estado().sonando, await boton()];
    await musica.controlar('alternar'); await esperar(500); r.botonDeNuevo = [musica.estado().sonando, await boton()];
    await esperar(4800); r.info = musica.estado(); // canción, artista y tapa que la página cuenta por mediaSession
    // Una canción por nombre, sin clave de la API: toma el primer video de la búsqueda (ni anuncios ni Shorts).
    r.cancion = await musica.reproducir('Persiana Americana').catch((e) => `FALLÓ: ${e.message}`);
    await esperar(600);
    r.abrioCancion = pedidos.filter((u) => u.startsWith('/results') || u.includes('v=dQw4w9WgXcQ'));
    const oculta = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/watch'));
    r.estado = oculta ? await oculta.webContents.executeJavaScript('({ pausado: document.querySelector("audio").paused, saltos: window.saltos || 0, visible: false })') : 'no encontré la ventana oculta';
    r.ventanaVisible = oculta ? oculta.isVisible() : null;
  } catch (e) { r.fallo = e.stack; }
  servidor.closeAllConnections(); servidor.close();
  return r;
}

let foto = null;

async function correr({ notch, abrirAjustes, ajustes, fase, carpeta }) {
  fs.mkdirSync(carpeta, { recursive: true });
  const errores = [];
  const vigilar = (ventana, nombre) => ventana.webContents.on('console-message', (e, nivel, mensaje) => {
    const grave = e.level ? ['warning', 'error'].includes(e.level) : nivel >= 2;
    if (grave) errores.push(`[${nombre}] ${e.message || mensaje}`);
  });
  foto = async (ventana, nombre) => fs.writeFileSync(path.join(carpeta, `${nombre}.png`), (await ventana.webContents.capturePage()).toPNG());
  try {
    const n = notch();
    vigilar(n, 'notch');
    await esperar(3500);
    n.webContents.executeJavaScript('document.documentElement.style.background = "#3a5a78"');
    // Unas novedades de muestra, para ver el punto de color y la lista del panel.
    const notificaciones = require('../src/main/notificaciones');
    { // Estas capturas necesitan que todo avise (después se vuelve a "solo lo elegido" para probar la pantalla de Notificaciones).
      const cfgM = require('../src/main/config'); const c0 = cfgM.leerConfig();
      cfgM.guardarConfig({ ...c0, notificaciones: { ...c0.notificaciones, whatsapp: { ...c0.notificaciones.whatsapp, modo: 'todo', grupos: true }, mail: { ...c0.notificaciones.mail, modo: 'todo', cuentas: {} } } });
    }
    notificaciones.limpiar();
    notificaciones.agregar({ origen: 'mail', de: 'Martín', asunto: 'Reunión del jueves', clave: `gmail:${Date.now()}${Math.random()}` });
    notificaciones.agregar({ origen: 'whatsapp', de: 'Eva', texto: 'Hola', clave: 'eva' });
    notificaciones.agregar({ origen: 'whatsapp', de: 'Eva', texto: '¿Jugamos a la noche?', clave: 'eva' });
    await esperar(400);
    await foto(n, '1-reposo');
    fase('escuchando'); await esperar(500); await foto(n, '2-escuchando');
    n.webContents.send('texto', { quien: 'jarvis', texto: 'Listo, le avisé a Eva que estás jugando.' });
    fase('hablando'); await esperar(500); await foto(n, '3-hablando');
    fase('ok', 'Modo juego'); await esperar(600); await foto(n, '4-ok');
    fase('error', 'No encontré la salida de audio "auriculares".'); await esperar(600); await foto(n, '5-error');
    fase('reposo'); await esperar(300);
    // Ojos bailando: una canción simulada a 120 BPM (un golpe cada 500 ms), con una "subida" a los 3 s. Se muestrea
    // el movimiento cuadro a cuadro: tiene que ser continuo (sin saltos bruscos) y variado (cambia de movimiento).
    await n.webContents.executeJavaScript(`(() => {
      window.__muestras = [];
      const t0 = performance.now();
      const ojos = document.getElementById('ojos');
      const leer = () => { const g = (p) => parseFloat(ojos.style.getPropertyValue(p)); window.__muestras.push([performance.now() - t0, g('--by'), g('--lean'), g('--sq'), g('--forma'), g('--ai'), g('--ad'), g('--brillo'), g('--bx')]); };
      const m = setInterval(leer, 16);
      setTimeout(() => clearInterval(m), 6200);
    })()`);
    const inicioBaile = Date.now();
    const enviarRitmo = setInterval(() => {
      const t = Date.now() - inicioBaile; const k = Math.floor(t / 500) + 1; const desde = t - (k - 1) * 500;
      n.webContents.send('ritmo', { ok: true, bpm: 120, conf: 0.8, n: k, hace: Math.round(desde), graves: 0.7, medios: 0.5, agudos: 0.4, energia: t > 3000 ? 0.85 : 0.5, subida: t > 3000 && t < 3300 ? 1.8 : 1 });
    }, 100);
    setTimeout(() => clearInterval(enviarRitmo), 6200);
    await esperar(1700); await foto(n, '4b-baila-a'); await esperar(900); await foto(n, '4c-baila-b');
    await esperar(4000);
    const resumen = await n.webContents.executeJavaScript(`(() => {
      const m = window.__muestras; let maxSalto = 0; const rango = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => { const v = m.map((x) => x[i]).filter((x) => !Number.isNaN(x)); return [Math.min(...v), Math.max(...v)].map((x) => +x.toFixed(2)); });
      for (let i = 1; i < m.length; i++) { const d = Math.abs(m[i][1] - m[i - 1][1]); if (!Number.isNaN(d)) maxSalto = Math.max(maxSalto, d); }
      return JSON.stringify({ n: m.length, maxSaltoY: +maxSalto.toFixed(2), rangos: { y: rango[0], lean: rango[1], sq: rango[2], forma: rango[3], ai: rango[4], ad: rango[5], brillo: rango[6], x: rango[7] } });
    })()`);
    console.log('baile:', resumen);
    n.webContents.send('ritmo', { parar: true }); await esperar(200);
    // Disparamos el mismo camino que usa un hover real (mouseenter) en vez de tocar la clase
    // "abierto" a mano: así la prueba también cubre que ubicarNotch() se llame donde corresponde.
    await n.webContents.executeJavaScript('document.getElementById("notch").dispatchEvent(new Event("mouseenter"))');
    await esperar(900); await foto(n, '6-panel');
    // La pastilla puede quedar pegada a un borde: el panel que se abre adentro de la ventana
    // nunca tiene que salirse de ella (ni a la izquierda ni a la derecha), sea cual sea el ancla.
    // Ojo con las unidades: #escena tiene "zoom" puesto en sí misma, y por una rareza de Chromium
    // un elemento zoomeado mide su PROPIO clientWidth sin el zoom (por eso notch.js puede hacer
    // toda la cuenta en el ancho "de diseño" fijo, sin preocuparse por la escala) — pero el
    // getBoundingClientRect() de #escena sí incluye el zoom, igual que el de cualquier hijo (como
    // #notch). Para comparar peras con peras hay que usar getBoundingClientRect() de los dos lados.
    const geometria = await n.webContents.executeJavaScript(`(() => {
      const escena = document.getElementById('escena');
      const notch = document.getElementById('notch');
      const re = escena.getBoundingClientRect();
      const r = notch.getBoundingClientRect();
      return { anchoEscena: re.width, left: r.left, right: r.right, anchoNotch: r.width };
    })()`);
    // Responder una novedad: click en el renglón -> aparece "Respondiendo a…"; se escribe y Enter.
    // (WhatsApp no está vinculado acá: tiene que explicarlo en vez de romperse.) Después, el tacho.
    const responder = await n.webContents.executeJavaScript(`(async () => {
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      const filas = () => [...document.querySelectorAll('#avisos .aviso')];
      const antes = filas().map((f) => f.querySelector('.cuerpo').textContent.replace(/\\s+/g, ' ').trim());
      filas().find((f) => f.classList.contains('whatsapp')).querySelector('.cuerpo').click();
      await espera(500);
      const chip = { visible: !document.getElementById('respuesta').hidden, a: document.getElementById('respuesta-a').textContent, ayuda: document.getElementById('respuesta-ayuda').textContent, campo: document.getElementById('texto').placeholder };
      return { antes, chip };
    })()`);
    await foto(n, '6b-respondiendo');
    Object.assign(responder, await n.webContents.executeJavaScript(`(async () => {
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      const campo = document.getElementById('texto');
      campo.value = 'Dale, a las diez';
      document.getElementById('entrada').dispatchEvent(new Event('submit', { cancelable: true }));
      await espera(900);
      const charla = { vos: document.querySelector('#charla .vos').textContent, jarvis: document.querySelector('#charla .jarvis').textContent };
      document.getElementById('charla-borrar').click();
      const charlaBorrada = document.getElementById('charla').hidden;
      document.querySelector('#avisos .aviso.mail .tacho').click();
      await espera(500);
      return { charla, charlaBorrada, chipDespues: !document.getElementById('respuesta').hidden, despuesDelTacho: [...document.querySelectorAll('#avisos .aviso')].map((f) => f.querySelector('.cuerpo').textContent.replace(/\\s+/g, ' ').trim()) };
    })()`));
    // Sin novedades y en reposo, el punto no se ve.
    notificaciones.limpiar();
    await esperar(300);
    const punto = await n.webContents.executeJavaScript('getComputedStyle(document.getElementById("punto")).backgroundColor');
    notificaciones.agregar({ origen: 'mail', de: 'Martín', asunto: 'Reunión del jueves', clave: `gmail:${Date.now()}${Math.random()}`, cuenta: 'gmail' });
    notificaciones.agregar({ origen: 'whatsapp', de: 'Eva', texto: '¿Jugamos a la noche?', clave: 'eva' });
    // Una agenda de muestra, para ver cómo queda la sección de WhatsApp.
    const whatsapp = require('../src/main/whatsapp');
    whatsapp._pruebas.anotarContactos([{ id: '5491166667777@s.whatsapp.net', name: 'Martín Pérez' }, { id: '5491122223333@s.whatsapp.net', name: 'Evangelina López' }]);
    whatsapp._pruebas.anotarGrupos([{ id: '120363111@g.us', subject: 'Casa' }, { id: '120363222@g.us', subject: 'Fulbito' }]);
    const pc = require('../src/main/pc');
    const guion = pc.rutaDelGuion();
    const guionDeAudio = { ruta: guion, afueraDelPaquete: !/app\.asar[\\/]/.test(guion), existe: fs.existsSync(guion) && fs.statSync(guion).size > 500 };
    // Google Calendar de mentira (para ver la pantalla de Calendario con la cuenta conectada).
    if (process.env.JARVIS_URL_GOOGLE_API) {
      const { leerConfig, guardarConfig } = require('../src/main/config');
      const http = require('http');
      const en = (min) => new Date(Date.now() + min * 60000).toISOString();
      http.createServer((q, r) => {
        r.setHeader('Content-Type', 'application/json');
        if (q.url.startsWith('/token')) return r.end(JSON.stringify({ access_token: 'AT', expires_in: 3600 }));
        if (q.url.includes('calendarList')) return r.end(JSON.stringify({ items: [
          { id: 'usuario@gmail.com', summary: 'Usuario de Prueba', primary: true, selected: true, accessRole: 'owner', backgroundColor: '#3f51b5' },
          { id: 'evi', summary: 'Calendario compartido', selected: true, accessRole: 'owner', backgroundColor: '#d81b9a' },
          { id: 'cumples', summary: 'Cumpleaños', selected: true, accessRole: 'reader', backgroundColor: '#4285f4' },
          { id: 'trabajo@empresa.com', summary: 'trabajo@empresa.com', selected: true, accessRole: 'freeBusyReader', backgroundColor: '#f6bf26' },
          { id: 'festivos', summary: 'Festivos en Argentina', selected: false, accessRole: 'reader', backgroundColor: '#0b8043' },
          { id: 'mundial', summary: 'Mundial 2026 - Horarios Argentina', selected: false, accessRole: 'reader', backgroundColor: '#8e24aa' }] }));
        r.end(JSON.stringify({ items: [{ id: 'e' + q.url.length, summary: 'Reunión', start: { dateTime: en(45) }, end: { dateTime: en(90) } }] }));
      }).listen(47991, '127.0.0.1');
      const c = leerConfig();
      guardarConfig({ ...c, calendario: { ...c.calendario, activo: true, minutosAntes: [10, 60, 1440], enlaces: [], google: { clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-x', token: 'refresco', cuenta: 'usuario@gmail.com', elegidos: null } } });
    }
    // Clips de mentira en una carpeta de prueba (para ver la lista y el editor).
    if (process.env.JARVIS_FFMPEG) {
      const { spawnSync } = require('child_process');
      const { leerConfig, guardarConfig } = require('../src/main/config');
      const carpetaClips = path.join(carpeta, 'clips');
      fs.mkdirSync(path.join(carpetaClips, 'Counter-Strike 2'), { recursive: true });
      for (const [i, nombre] of ['Counter-Strike 2 2026.11.12 - 21.05.09', 'Counter-Strike 2 2026.11.12 - 20.41.55', 'Valorant 2026.11.11 - 23.10.02'].entries()) {
        spawnSync(process.env.JARVIS_FFMPEG, ['-y', '-hide_banner', '-f', 'lavfi', '-i', `testsrc=size=1280x720:rate=30`, '-f', 'lavfi', '-i', `sine=frequency=${300 + i * 150}:sample_rate=48000`, '-t', String(20 + i * 8), '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(carpetaClips, i < 2 ? 'Counter-Strike 2' : '', `${nombre}.mp4`)]);
      }
      const c0 = leerConfig();
      guardarConfig({ ...c0, clips: { ...c0.clips, carpeta: carpetaClips } });
    }
    abrirAjustes('rutinas');
    await esperar(2500);
    vigilar(ajustes(), 'ajustes');
    // Notas de mentira, con link y captura (una captura "de la pantalla" que es la propia ventana de Ajustes).
    const notasMod = require('../src/main/notas');
    const jpgFalso = path.join(carpeta, 'pantalla-falsa.jpg');
    fs.writeFileSync(jpgFalso, (await ajustes().webContents.capturePage()).toJPEG(70));
    process.env.JARVIS_CAPTURA_FALSA = jpgFalso;
    process.env.JARVIS_CONTEXTO_FALSO = JSON.stringify({ proceso: 'chrome', titulo: 'Cómo armar un PC gamer en 2026 - YouTube - Google Chrome', url: 'www.youtube.com/watch?v=abc123' });
    const horaEn = (h) => { const d = new Date(Date.now() + h * 3600000); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const notasCreadas = [
      (await notasMod.crear({ texto: 'Ver este video', hora: horaEn(3), conContexto: true })).nota,
      (await notasMod.crear({ texto: 'Comprar leche y pan' })).nota,
      (await notasMod.crear({ texto: 'Llamar al médico', minutos: 90 })).nota,
    ];
    { const { leerConfig, guardarConfig } = require('../src/main/config'); const c1 = leerConfig(); guardarConfig({ ...c1, contexto: { ...c1.contexto, verPantalla: true } }); }
    const agendaFalsa = () => { // Agenda de mentira: un evento que se repite, de un calendario compartido, para ver cómo se lo encuentra.
      // Los eventos de prueba tienen que caer HOY y seguir siendo futuros aunque la prueba corra de noche (si no, la vista del día queda vacía).
      const baseEventos = new Date(); const escala = baseEventos.getHours() >= 19 ? 0.2 : 1;
      const h1 = (hs) => new Date(baseEventos.getTime() + (hs <= 6 ? hs * escala : hs) * 3600000);
      require('../src/main/calendario')._poner([
        { id: 'g|1', titulo: 'Reunión de equipo', inicio: h1(2), fin: h1(3), todoElDia: false, lugar: 'Meet', calendario: 'Trabajo', enlace: 'https://www.google.com/calendar/event?eid=aaa', repite: false },
        { id: 'g|2', titulo: 'PASTILLA', inicio: h1(5), fin: h1(5.25), todoElDia: false, lugar: '', calendario: 'Salud (compartido con Mónica)', enlace: 'https://www.google.com/calendar/event?eid=bbb', repite: true },
        { id: 'g|3', titulo: 'Cumpleaños de Tomi', inicio: h1(30), fin: h1(31), todoElDia: true, lugar: '', calendario: 'Cumpleaños', enlace: '', repite: true },
      ]);
    };
    { // una voz propia ya cargada (de mentira) con su personalidad, para ver la lista de "Voces cargadas" y el editor
      const zip = require('../src/main/zip'); const vp = require('../src/main/vocesprop');
      const z = path.join(carpeta, 'voz-de-mentira.zip');
      zip.escribirZip(z, [
        { nombre: 'jarvis-voz.json', datos: Buffer.from(JSON.stringify({ formato: 1, tipo: 'voz', nombre: 'Tomi (Galicia)', personalidad: PERS_PRUEBA })) },
        { nombre: 'voz/model.onnx', datos: Buffer.alloc(2000, 7) }, { nombre: 'voz/tokens.txt', datos: Buffer.from('a 1\n') },
        { nombre: 'voz/model.onnx.json', datos: Buffer.from(JSON.stringify({ phoneme_id_map: { a: [1] }, espeak: { voice: 'es' } })) },
      ]);
      const r = vp.importarPaquete(z);
      const { leerConfig, guardarConfig } = require('../src/main/config'); const c1 = leerConfig();
      guardarConfig({ ...c1, habla: { ...c1.habla, personalidades: { ...(c1.habla.personalidades || {}), [r.voz]: r.personalidad } } });
      console.log('VOZ-IMPORTADA', JSON.stringify(r));
    }
    for (const s of ['general', 'inteligencia', 'contexto', 'panel', 'notas', 'apariencia', 'modos', 'rutinas', 'dispositivos', 'pc', 'whatsapp', 'mail', 'notificaciones', 'calendario', 'clips', 'musica', 'clips-ajustes', 'descargas', 'streaming', 'almacenamiento', 'escucha', 'historial', 'notasvoz', 'voz']) {
      await ajustes().webContents.executeJavaScript(`location.hash = '#${s}'`);
      await esperar(400);
      await foto(ajustes(), `ajustes-${s}`);
      if (s === 'mail') { // la parte de Hotmail/Outlook
        await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('h2')].find((x) => /Hotmail/.test(x.textContent)).scrollIntoView()`);
        await esperar(250);
        await foto(ajustes(), 'ajustes-mail-outlook');
      }
      if (s === 'clips-ajustes') { // los selectores de pantalla (la que graba el botón y la de los clips)
        const ops = await ajustes().webContents.executeJavaScript(`(() => { const q = (t) => document.querySelector('select[aria-label="' + t + '"]'); const l = (e) => e ? { valor: e.value, opciones: [...e.options].map((o) => o.textContent) } : null; return { graba: l(q('Pantalla que graba')), clips: l(q('Pantalla de los clips')) }; })()`);
        console.log('CLIPS-PANTALLAS', JSON.stringify(ops));
      }
      if (s === 'clips' && process.env.JARVIS_FFMPEG) { // el editor de clips
        await esperar(1500);
        await foto(ajustes(), 'ajustes-clips-lista');
        await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('.clip-fila button[aria-label^="Editar"]')][0].click()`);
        await esperar(2500);
        const info = await ajustes().webContents.executeJavaScript(`({ dur: document.querySelector('video') && document.querySelector('video').duration, error: document.querySelector('video') && !!document.querySelector('video').error, resumen: (document.querySelector('.resumen-recorte') || {}).textContent })`);
        console.log('EDITOR', JSON.stringify(info));
        await foto(ajustes(), 'ajustes-clips-editor');
        // La línea de tiempo: arrastrar la manija de inicio y la de fin con el mouse (eventos de puntero), como lo haría una persona.
        const lt = await ajustes().webContents.executeJavaScript(`(async () => {
          const esp = (ms) => new Promise((r) => setTimeout(r, ms));
          const pista = document.querySelector('.lt-pista'); const r = pista.getBoundingClientRect();
          const dur = document.querySelector('video.editor-video').duration;
          const pe = (el, tipo, x) => el.dispatchEvent(new PointerEvent(tipo, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: r.top + 10 }));
          const arrastrar = async (el, desdeT, hastaT) => { pe(el, 'pointerdown', r.left + (desdeT / dur) * r.width); await esp(50); pe(el, 'pointermove', r.left + (hastaT / dur) * r.width); await esp(50); pe(el, 'pointerup', r.left + (hastaT / dur) * r.width); };
          const ini = document.querySelector('.lt-manija.inicio'); const fin = document.querySelector('.lt-manija.fin');
          await arrastrar(ini, 0, 4); await arrastrar(fin, dur, 12);
          const cuadros = [...document.querySelectorAll('.lt-cuadros canvas')].length;
          return { desde: ini.getAttribute('aria-valuenow'), hasta: fin.getAttribute('aria-valuenow'), cuadros, resumen: document.querySelector('.resumen-recorte').textContent, dur };
        })()`);
        console.log('LINEA-DE-TIEMPO', JSON.stringify(lt));
        await esperar(500);
        await foto(ajustes(), 'ajustes-clips-editor-recorte');
        await ajustes().webContents.executeJavaScript(`(() => { document.querySelector('.editor-clip input[aria-label="Nombre del clip"]').value = 'Ace en Mirage'; [...document.querySelectorAll('.editor-clip button')].find((b) => b.textContent === 'Renombrar').click(); })()`);
        await esperar(1500);
        await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('.editor-clip button')].find((b) => b.textContent === 'Guardar como clip nuevo').click()`);
        await esperar(5000);
        await ajustes().webContents.executeJavaScript(`document.querySelector('#contenido').scrollTop = 99999`);
        await esperar(300);
        await foto(ajustes(), 'ajustes-clips-editor-guardado');
        // Reemplazar el original con el video reproduciéndose arriba (en Windows esto fallaba por el archivo abierto).
        await ajustes().webContents.executeJavaScript(`(async () => { const v = document.querySelector('video.editor-video'); v.muted = true; await v.play().catch(() => {}); })()`);
        await esperar(600);
        const antes = fs.readdirSync(path.join(carpeta, 'clips', 'Counter-Strike 2')).sort();
        const clicReemplazar = `[...document.querySelectorAll('.editor-clip button')].find((b) => b.textContent.startsWith('Reemplazar') || b.textContent.startsWith('¿Seguro')).click()`;
        await ajustes().webContents.executeJavaScript(clicReemplazar); await esperar(300);
        await ajustes().webContents.executeJavaScript(clicReemplazar);
        await esperar(7000);
        const msg = await ajustes().webContents.executeJavaScript(`(() => { const v = document.querySelector('video.editor-video'); return { mensaje: [...document.querySelectorAll('.editor-clip .nota')].map((n) => n.textContent).filter((t) => /Listo|No pude|Recort/.test(t)).pop(), dur: v.duration, src: !!v.getAttribute('src') }; })()`);
        console.log('REEMPLAZAR', JSON.stringify({ msg, antes, despues: fs.readdirSync(path.join(carpeta, 'clips', 'Counter-Strike 2')).sort() }));
        await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('.editor-clip button')].find((b) => b.textContent.includes('Volver')).click()`);
        await esperar(1200);
        await foto(ajustes(), 'ajustes-clips-lista-final');
        console.log('CLIPS', JSON.stringify(fs.readdirSync(path.join(carpeta, 'clips', 'Counter-Strike 2'))));
      }
      if (s === 'notas') {
        await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('.nota-tarjeta button')].find((b) => b.textContent === 'Ver captura').click()`);
        await esperar(500);
        await ajustes().webContents.executeJavaScript(`document.querySelector('.nota-captura img').scrollIntoView({ block: 'center' })`);
        await esperar(300);
        await foto(ajustes(), 'ajustes-notas-captura');
        await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('.segmentado button')].find((b) => b.textContent === 'Con aviso').click()`);
        await esperar(300);
        await foto(ajustes(), 'ajustes-notas-con-aviso');
        const nota = await ajustes().webContents.executeJavaScript(`(() => { const i = document.querySelector('.nota-nueva input[type=text]'); i.value = 'Revisar el router'; i.dispatchEvent(new Event('input')); document.querySelector('.nota-nueva .boton').click(); return true; })()`);
        await esperar(600);
        console.log('NOTAS', JSON.stringify(notasMod.listar().map((x) => x.texto)));
      }
      if (s === 'contexto') {
        await foto(ajustes(), 'ajustes-contexto-apagado');
        await ajustes().webContents.executeJavaScript(`document.querySelector('.campo input[type=checkbox]').click()`); // prender "Dejar que Jarvis vea la pantalla"
        await esperar(1500);
        await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((b) => /qu[eé] ver[ií]a/i.test(b.textContent)).click()`);
        await esperar(1200);
        await foto(ajustes(), 'ajustes-contexto-prueba');
      }
      if (s === 'calendario') { // lista de calendarios, avisos y estado (más abajo)
        await esperar(800);
        await ajustes().webContents.executeJavaScript(`(() => { const d = document.querySelector('details.avanzado'); if (d) d.open = true; [...document.querySelectorAll('h2')].find((x) => /Avisos/.test(x.textContent)).scrollIntoView(); })()`);
        await esperar(250);
        await foto(ajustes(), 'ajustes-calendario-abajo');
        await ajustes().webContents.executeJavaScript(`document.querySelector('#contenido').scrollTop = 560`);
        await esperar(250);
        await foto(ajustes(), 'ajustes-calendario-lista');
      }
      if (s === 'voz') { // personalidad de la voz elegida (debajo de "Voz")
        await ajustes().webContents.executeJavaScript(`(() => { const t = document.querySelector('.vp-personalidad'); t.value = ${JSON.stringify(PERS_PRUEBA)}; t.dispatchEvent(new Event('input')); t.scrollIntoView({ block: 'center' }); })()`);
        await esperar(300);
        await foto(ajustes(), 'ajustes-general-personalidad');
      }
      if (s === 'voz') { // crear una voz, ver los tres modos, grabar una frase del guion (con un WAV de mentira) y armar el set
        const r = await ajustes().webContents.executeJavaScript(`(async () => {
          const esp = (ms) => new Promise((r) => setTimeout(r, ms));
          const campo = document.querySelector('input[placeholder^="Nombre ("]');
          campo.value = 'Voz de prueba'; campo.dispatchEvent(new Event('input'));
          [...document.querySelectorAll('button')].find((b) => b.textContent === 'Crear').click();
          await esp(900);
          const titulo = (document.querySelector('.vp-nombre') || {}).value;
          const frase = (document.querySelector('.vp-frase') || {}).textContent;
          return { titulo, frase, niveles: document.querySelectorAll('.vp-hitos span').length };
        })()`);
        console.log('MI-VOZ', JSON.stringify(r));
        await foto(ajustes(), 'ajustes-voz-grabar');
        for (const [nombre, clave] of [['Subir audios', 'subir'], ['Pedirle a otra persona', 'pedir']]) {
          await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('.segmentado button')].find((b) => b.textContent === ${JSON.stringify(nombre)}).click()`);
          await esperar(300);
          await foto(ajustes(), `ajustes-voz-${clave}`);
        }
        await ajustes().webContents.executeJavaScript(`document.querySelector('#contenido').scrollTop = 99999`);
        await esperar(250);
        await foto(ajustes(), 'ajustes-voz-entrenar');
        await ajustes().webContents.executeJavaScript(`location.hash = '#voz'; (async () => { await jarvis.pedir('voces:borrar', 'voz-de-prueba'); })()`);
      }
      if (s === 'whatsapp') { // el buscador de la agenda: se escribe y aparecen los que coinciden
        await ajustes().webContents.executeJavaScript(`(() => { const c = [...document.querySelectorAll('input')].find((i) => /parte del nombre/.test(i.placeholder)); if (!c) return; c.scrollIntoView(); c.value = 'a'; c.dispatchEvent(new Event('input')); })()`);
        await esperar(200);
        await foto(ajustes(), 'ajustes-whatsapp-agenda');
      }
    }
    // Editor del panel: elegir el modo Juego, arrastrar un widget, tocar uno (tamaño), sumar uno de la paleta y ver lo guardado.
    const editor = await ajustes().webContents.executeJavaScript(`(async () => {
      const esp = (ms) => new Promise((r) => setTimeout(r, ms));
      location.hash = '#panel'; await esp(300);
      [...document.querySelectorAll('.segmentado button')].find((b) => b.textContent === 'Juego').click(); await esp(200);
      const tipos = () => [...document.querySelectorAll('.panel-vista .pw')].map((x) => x.dataset.id);
      const antes = tipos();
      const tiles = [...document.querySelectorAll('.panel-vista .pw')];
      const dt = new DataTransfer();
      tiles[tiles.length - 1].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      tiles[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      tiles[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await esp(300);
      const despues = tipos();
      document.querySelector('.panel-vista .pw').click(); await esp(200);
      return { antes, despues };
    })()`);
    await foto(ajustes(), 'ajustes-panel-juego');
    const quitar = await ajustes().webContents.executeJavaScript(`(async () => {
      const esp = (ms) => new Promise((r) => setTimeout(r, ms));
      const nombres = () => [...document.querySelectorAll('.panel-vista .pw .pw-nombre')].map((x) => x.textContent);
      const antes = nombres();
      const tile = [...document.querySelectorAll('.panel-vista .pw')].find((x) => /Música/.test(x.textContent));
      tile.querySelector('.pw-quitar').click(); await esp(250);
      const sin = nombres();
      const aviso = (document.querySelector('.panel-deshacer') || {}).textContent || '';
      const itemMusica = [...document.querySelectorAll('.paleta-item')].find((x) => /Música/.test(x.textContent));
      const musicaEnPaleta = !!itemMusica && !itemMusica.classList.contains('puesto');
      itemMusica.click(); await esp(250); // volver a sumarla desde la paleta
      const con = nombres();
      return { antes, sin, aviso, musicaEnPaleta, con };
    })()`);
    await foto(ajustes(), 'ajustes-panel-musica-vuelve');
    console.log('QUITAR-MUSICA', JSON.stringify(quitar));
    await ajustes().webContents.executeJavaScript(`document.querySelector('#contenido').scrollTop = 0`);
    const editor2 = await ajustes().webContents.executeJavaScript(`(async () => {
      const esp = (ms) => new Promise((r) => setTimeout(r, ms));
      const paleta = [...document.querySelectorAll('.paleta-item')].map((x) => x.querySelector('b').textContent);
      [...document.querySelectorAll('.paleta-item')].find((x) => /Atajo de voz/.test(x.textContent)).click(); await esp(250);
      const i = document.querySelector('.panel-barra input[type=text]'); i.value = 'Qué veo'; i.dispatchEvent(new Event('input'));
      const j = document.querySelectorAll('.panel-barra input[type=text]')[1]; j.value = '¿Qué estoy viendo?'; j.dispatchEvent(new Event('input'));
      await esp(700);
      document.querySelector('#contenido').scrollTop = 460; await esp(200);
      return { paleta, tiles: [...document.querySelectorAll('.panel-vista .pw')].length };
    })()`);
    await foto(ajustes(), 'ajustes-panel-agregado');
    const guardadoJuego = require('../src/main/config').leerConfig().modos.find((m) => m.id === 'juego').panel.widgets.map((w) => `${w.tipo}:${w.tam}${w.texto ? ':' + w.texto : ''}`);
    console.log('EDITOR-PANEL', JSON.stringify({ editor, editor2, guardadoJuego }));
    agendaFalsa();
    await ajustes().webContents.executeJavaScript(`location.hash = '#panel'`); await esperar(300);
    await ajustes().webContents.executeJavaScript(`location.hash = '#calendario'`); await esperar(900);
    agendaFalsa();
    await ajustes().webContents.executeJavaScript(`(async () => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Actualizar'); if (b) b.click(); await new Promise((r) => setTimeout(r, 500)); const i = document.querySelector('input[placeholder^="Buscar un evento"]'); if (!i) return; i.value = 'pasti'; i.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 400)); i.scrollIntoView({ block: 'start' }); })()`);
    await esperar(300);
    await foto(ajustes(), 'ajustes-calendario-agenda');
    // La sección accionable "Calendario": eventos linkeados + propios, con edición.
    await ajustes().webContents.executeJavaScript(`location.hash = '#agenda'`); await esperar(900);
    await require('../src/main/calendario').guardarLocal({ titulo: 'Partido con Tomi', inicio: Math.min(Date.now() + 7200000, new Date().setHours(23, 50, 0, 0)), avisos: [30, 5], whatsapp: true });
    await ajustes().webContents.executeJavaScript(`(async () => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Actualizar'); if (b) b.click(); await new Promise((r) => setTimeout(r, 600)); })()`);
    await foto(ajustes(), 'ajustes-agenda');
    await ajustes().webContents.executeJavaScript(`(async () => { const f = document.querySelector('.evento-fila button, .agenda-fila button'); if (f) f.click(); await new Promise((r) => setTimeout(r, 500)); })()`);
    await foto(ajustes(), 'ajustes-agenda-editor');
    for (const vista of ['Día', 'Semana', 'Mes']) {
      await ajustes().webContents.executeJavaScript(`(async () => { const b = [...document.querySelectorAll('.segmentado button')].find((x) => x.textContent === ${JSON.stringify(vista)}); if (b) b.click(); await new Promise((r) => setTimeout(r, 700)); })()`);
      await foto(ajustes(), `ajustes-agenda-vista-${vista.toLowerCase()}`);
    }
    const nav = await ajustes().webContents.executeJavaScript(`(async () => {
      const t = () => (document.querySelector('.cal-titulo') || {}).textContent || '';
      const antes = t();
      const sig = [...document.querySelectorAll('.cal-nav button')].find((b) => b.title === 'Siguiente');
      if (sig) sig.click();
      await new Promise((r) => setTimeout(r, 700));
      return { antes, despues: t(), celdas: document.querySelectorAll('.cal-celda').length };
    })()`);
    console.log('AGENDA-NAV', JSON.stringify(nav));
    await foto(ajustes(), 'ajustes-agenda-mes-siguiente');
    // Ancho y angosto: el calendario usa todo el ancho de la ventana y se reacomoda.
    await ajustes().webContents.executeJavaScript(`(async () => { [...document.querySelectorAll('.segmentado button')].find((x) => x.textContent === 'Mes').click(); await new Promise((r) => setTimeout(r, 400)); })()`);
    ajustes().setSize(1600, 900); await esperar(700);
    const ancho = await ajustes().webContents.executeJavaScript(`(() => { const c = document.getElementById('contenido').getBoundingClientRect(); const m = document.querySelector('.cal-mes').getBoundingClientRect(); return { contenido: Math.round(c.width), calendario: Math.round(m.width), ventana: innerWidth }; })()`);
    console.log('AGENDA-ANCHO', JSON.stringify(ancho));
    await foto(ajustes(), 'ajustes-agenda-ancha');
    ajustes().setSize(620, 820); await esperar(700);
    await ajustes().webContents.executeJavaScript(`(async () => { [...document.querySelectorAll('.segmentado button')].find((x) => x.textContent === 'Semana').click(); await new Promise((r) => setTimeout(r, 400)); })()`);
    await foto(ajustes(), 'ajustes-agenda-angosta-semana');
    const angosto = await ajustes().webContents.executeJavaScript(`({ desborda: document.documentElement.scrollWidth > innerWidth + 1, cont: document.getElementById('contenido').scrollWidth > document.getElementById('contenido').clientWidth + 1 })`);
    console.log('AGENDA-ANGOSTA', JSON.stringify(angosto));
    ajustes().setSize(1100, 800); await esperar(600);
    // Editor de un evento: volver bien a la vista, avisos múltiples, color.
    await ajustes().webContents.executeJavaScript(`(async () => { [...document.querySelectorAll('.segmentado button')].find((x) => x.textContent === 'Mes').click(); await new Promise((r) => setTimeout(r, 300)); [...document.querySelectorAll('.cal-nav button')].find((x) => x.textContent === 'Hoy').click(); for (let i = 0; i < 30 && !document.querySelector('.cal-celda.hoy .cal-chip'); i++) await new Promise((r) => setTimeout(r, 200)); document.querySelector('.cal-celda.hoy .cal-num').click(); await new Promise((r) => setTimeout(r, 500)); document.querySelector('.agenda-fila:not(.nota-fila) .agenda-acciones button').click(); await new Promise((r) => setTimeout(r, 400)); [...document.querySelectorAll('.editor-col .ficha')].find((b) => b.textContent === 'Elegir').click(); await new Promise((r) => setTimeout(r, 200)); const add = [...document.querySelectorAll('.avisos-ed button')].find((b) => /Agregar aviso/.test(b.textContent)); add.click(); await new Promise((r) => setTimeout(r, 150)); add.isConnected || 0; const sel = document.querySelectorAll('.aviso-fila select.fila-canal, .aviso-fila .aviso-linea select:not(.duracion-u):not([aria-label="Sonido del aviso"])'); const s2 = sel[sel.length - 1]; s2.value = 'whatsapp'; s2.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 200)); })()`);
    await foto(ajustes(), 'ajustes-agenda-editor-avisos');
    const editorMedidas = await ajustes().webContents.executeJavaScript(`(() => { const v = document.querySelector('.boton.volver'); const a = document.querySelector('.editor-acciones'); const r = a.getBoundingClientRect(); return { volver: !!v && v.getBoundingClientRect().top >= 0, accionesVisibles: r.bottom <= innerHeight + 1 && r.top >= 0, filasDeAviso: document.querySelectorAll('.aviso-fila').length, cancelar: [...a.querySelectorAll('button')].map((b) => b.textContent) }; })()`);
    console.log('EDITOR-EVENTO', JSON.stringify(editorMedidas));
    await ajustes().webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await esperar(500);
    console.log('EDITOR-ESC', await ajustes().webContents.executeJavaScript(`!document.querySelector('.agenda-editor')`));
    await ajustes().webContents.executeJavaScript(`(async () => { const d = document.querySelector('.cal-gestion'); d.open = true; d.scrollIntoView(); await new Promise((r) => setTimeout(r, 400)); })()`);
    await foto(ajustes(), 'ajustes-agenda-mis-calendarios');
    ajustes().setSize(1000, 720); await esperar(400);
    // ---- Notificaciones: tres modos por fuente, etiquetas, "llegaron y no te avisé" ----
    {
      const avisosMod = require('../src/main/notificaciones');
      { const cfgM = require('../src/main/config'); const c0 = cfgM.leerConfig();
        cfgM.guardarConfig({ ...c0, notificaciones: { ...c0.notificaciones, whatsapp: { ...c0.notificaciones.whatsapp, modo: 'elegidos', elegidos: [], silenciados: [] }, mail: { ...c0.notificaciones.mail, modo: 'elegidos', elegidos: [], silenciados: [] } } });
        ajustes().webContents.send('avisos-config', cfgM.leerConfig().notificaciones); await esperar(300); }
      avisosMod.olvidarOmitidas();
      avisosMod.configurar({ alAvisar() {}, alCambiar() {} });
      avisosMod.agregar({ origen: 'whatsapp', de: 'Laura Gómez', texto: '¿Venís a cenar el sábado?', clave: 'laura@s' });
      avisosMod.agregar({ origen: 'mail', de: 'Tienda Online', direccion: 'ofertas@tienda.com', asunto: 'Súper ofertas de hoy', clave: 'gmail:900', cuenta: 'gmail' });
      ajustes().setSize(1100, 900); await esperar(500);
      await ajustes().webContents.executeJavaScript(`(async () => { location.hash = '#notificaciones'; await new Promise((r) => setTimeout(r, 1200)); })()`);
      await foto(ajustes(), 'ajustes-notificaciones');
      const inicial = await ajustes().webContents.executeJavaScript(`(() => ({ fuentes: [...document.querySelectorAll('.aviso-fuente')].map((f) => f.querySelector('h3').textContent + ': ' + (f.querySelector('.segmentado .on') || {}).textContent + ' · ' + f.querySelector('.fuente-resumen').textContent), omitidas: [...document.querySelectorAll('.omitida-fila b')].map((b) => b.textContent), desborda: document.documentElement.scrollWidth > innerWidth + 1 }))()`);
      console.log('NOTIF-INICIAL', JSON.stringify(inicial));
      // Elegir a Laura desde "Llegaron y no te avisé", y escribir otra etiqueta a mano.
      const elegida = await ajustes().webContents.executeJavaScript(`(async () => {
        const fila = [...document.querySelectorAll('.omitida-fila')].find((f) => /Laura/.test(f.textContent));
        [...fila.querySelectorAll('button')].find((b) => b.textContent === 'Avisar').click();
        await new Promise((r) => setTimeout(r, 500));
        const inp = document.querySelector('#fuente-whatsapp .etiquetas input');
        inp.value = 'Tomi'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
        return { etiquetas: [...document.querySelectorAll('#fuente-whatsapp .etiqueta')].map((e) => e.firstChild.textContent), resumen: document.querySelector('#fuente-whatsapp .fuente-resumen').textContent, omitidas: [...document.querySelectorAll('.omitida-fila b')].map((b) => b.textContent) };
      })()`);
      console.log('NOTIF-ELEGIR', JSON.stringify(elegida));
      await foto(ajustes(), 'ajustes-notificaciones-elegidos');
      // Cambiar WhatsApp a "Todo" y Mail a "Nada".
      const modos = await ajustes().webContents.executeJavaScript(`(async () => {
        const poner = async (id, texto) => { [...document.querySelectorAll('#fuente-' + id + ' .segmentado button')].find((b) => b.textContent === texto).click(); await new Promise((r) => setTimeout(r, 300)); };
        await poner('whatsapp', 'Todo'); await poner('mail', 'Nada');
        return { wa: document.querySelector('#fuente-whatsapp .fuente-resumen').textContent, mail: document.querySelector('#fuente-mail .fuente-resumen').textContent, cuerpoMail: !!document.querySelector('#fuente-mail .fuente-cuerpo') };
      })()`);
      console.log('NOTIF-MODOS', JSON.stringify(modos));
      await foto(ajustes(), 'ajustes-notificaciones-todo');
      await ajustes().webContents.executeJavaScript(`(async () => { [...document.querySelectorAll('.atajos-avisos button')].find((b) => b.textContent === 'Solo lo elegido').click(); await new Promise((r) => setTimeout(r, 400)); })()`);
      const luego = await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('.aviso-fuente')].map((f) => f.querySelector('.segmentado .on').textContent).join(' | ')`);
      console.log('NOTIF-ATAJO', luego);
      // Angosto, sin desborde horizontal.
      ajustes().setSize(620, 820); await esperar(600);
      console.log('NOTIF-ANGOSTA', JSON.stringify(await ajustes().webContents.executeJavaScript(`({ desborda: document.documentElement.scrollWidth > innerWidth + 1, cont: document.getElementById('contenido').scrollWidth > document.getElementById('contenido').clientWidth + 1 })`)));
      await foto(ajustes(), 'ajustes-notificaciones-angosta');
      ajustes().setSize(1100, 800); await esperar(500);
      // La línea "Avisos:" en WhatsApp, Mail y Calendario lleva a Notificaciones.
      const lineas = await ajustes().webContents.executeJavaScript(`(async () => {
        const r = {};
        for (const h of ['whatsapp', 'mail', 'calendario']) { location.hash = '#' + h; await new Promise((x) => setTimeout(x, 500)); const l = document.querySelector('.linea-avisos'); r[h] = l ? l.textContent.replace(/\\s+/g, ' ') : null; }
        location.hash = '#whatsapp'; await new Promise((x) => setTimeout(x, 400));
        [...document.querySelectorAll('.linea-avisos button')][0].click(); await new Promise((x) => setTimeout(x, 700));
        r.va = !!document.querySelector('.aviso-fuente');
        return r;
      })()`);
      console.log('NOTIF-LINEAS', JSON.stringify(lineas));
      // "No avisarme más" desde el notch: quita al elegido y avisa a Ajustes.
      avisosMod.agregar({ origen: 'whatsapp', de: 'Tomi', texto: 'che', clave: 'tomi@s' });
      console.log('NOTIF-SILENCIAR', avisosMod.dejarDeAvisar('whatsapp|Tomi'));
    }
    {
      // Modo sin conexión: el ícono junto a los ojos y la hoja "Conexión" de Ajustes.
      const cx = require('../src/main/conexion');
      cx.descartarCola();
      await esperar(400);
      const sinInicial = await n.webContents.executeJavaScript(`getComputedStyle(document.getElementById('sinred')).display`);
      cx.encolar({ tipo: 'whatsapp', contacto: 'Tomi', mensaje: 'llego tarde' });
      cx.fijarManual(true); await esperar(700);
      const icono = await n.webContents.executeJavaScript(`(() => { const e = document.getElementById('sinred'); const r = e.getBoundingClientRect(); return { display: getComputedStyle(e).display, titulo: e.title, svg: !!e.querySelector('svg'), x: Math.round(r.left), w: Math.round(r.width), pastilla: Math.round(document.getElementById('pastilla').getBoundingClientRect().width) }; })()`);
      console.log('CONEXION-ICONO', sinInicial, JSON.stringify(icono));
      await foto(n, 'conexion-notch-sin');
      cx.reportar('groq', false, { detalle: 'falló (503)' }); cx.reportar('groq', false, { detalle: 'falló (503)' });
      await ajustes().webContents.executeJavaScript(`(async () => { location.hash = '#conexion'; await new Promise((r) => setTimeout(r, 1000)); })()`);
      await foto(ajustes(), 'ajustes-conexion');
      const hoja = await ajustes().webContents.executeJavaScript(`(() => ({ titulo: document.querySelector('h1').textContent, estado: (document.querySelector('.conexion-estado b') || {}).textContent, filas: [...document.querySelectorAll('.conexion-fila')].map((f) => f.textContent.replace(/\\s+/g, ' ')), cola: (document.querySelector('.conexion-cola span') || {}).textContent, desborda: document.documentElement.scrollWidth > innerWidth + 1 }))()`);
      console.log('CONEXION-HOJA', JSON.stringify(hoja));
      // El interruptor de la hoja apaga el modo.
      await ajustes().webContents.executeJavaScript(`(async () => { document.querySelector('.interruptor input').click(); await new Promise((r) => setTimeout(r, 800)); })()`);
      await esperar(500);
      console.log('CONEXION-APAGADO', cx.manual(), await n.webContents.executeJavaScript(`getComputedStyle(document.getElementById('sinred')).display + ' ' + document.getElementById('sinred').title`));
      await foto(n, 'conexion-notch-servicio');
      cx.reportar('groq', true); cx.descartarCola();
    }
    console.log('AGENDA', await ajustes().webContents.executeJavaScript(`[...document.querySelectorAll('.evento-fila')].map((x) => x.textContent.replace(/\\s+/g, ' ')).join(' || ')`));
    for (const x of notasMod.listar()) notasMod.borrar(x.id);
    // Un mensaje largo (un error de "Probar") va en el cartel de abajo, sin tapar "Cerrar Jarvis".
    const cartel = await ajustes().webContents.executeJavaScript(`(async () => {
      location.hash = '#pc';
      await new Promise((r) => setTimeout(r, 300));
      const salir = document.getElementById('salir').getBoundingClientRect();
      const guardado = document.getElementById('guardado').getBoundingClientRect();
      const boton = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Probar');
      if (boton) boton.click();
      await new Promise((r) => setTimeout(r, 1500));
      const c = document.getElementById('cartel');
      return { texto: c.hidden ? '' : c.textContent, sinTaparCerrar: guardado.bottom <= salir.top + 1, agendaEnAjustes: null };
    })()`);
    await foto(ajustes(), 'ajustes-cartel');
    // El panel hecho de widgets. 1) Sin acciones rápidas ni novedades: esas piezas no se ven. 2) Un panel completo, con
    // acciones rápidas y widgets sueltos (clips, música, nota, agenda, atajo). 3) Modo trabajo.
    const W = (tipo, tam, extra = {}) => ({ id: `${tipo}${extra.rutina || extra.nombre || ''}`, tipo, tam, ...extra });
    const base = { fase: 'reposo', modo: 'juego', listo: true, orientacion: 'abajo', pegado: true, avisos: [], puntoDeAvisos: true, sesion: false, musica: { sonando: false },
      clips: { activo: true, permitido: true, corriendo: true, grabando: false, segundos: 42 }, agenda: [] };
    const medir = () => n.webContents.executeJavaScript(`(() => {
      const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
      return { widgets: [...document.querySelectorAll('#widgets > .w, #widgets > .tile')].filter(vis).map((x) => x.id || x.dataset.tipo || x.className), acciones: vis(document.getElementById('w-rutinas')), novedades: vis(document.getElementById('w-novedades')) };
    })()`);
    n.webContents.send('rutinas', []);
    n.webContents.send('estado', { ...base, panel: { clips: true, widgets: [W('texto', 4), W('novedades', 4), W('rutinas', 4), W('clips', 4), W('musica', 4), W('modos', 4)] } });
    await esperar(400);
    await n.webContents.executeJavaScript("document.getElementById('notch').classList.add('abierto')");
    await esperar(700);
    await foto(n, '9-panel-sin-acciones');
    const sinAcciones = await medir();
    n.webContents.send('rutinas', [
      { id: 'r1', nombre: 'Modo trabajo', icono: 'trabajo', rapida: true }, { id: 'r2', nombre: 'Buenas noches', icono: 'luna', rapida: true },
      { id: 'r3', nombre: 'Tele del living', icono: 'tele', rapida: true }, { id: 'r4', nombre: 'Auriculares', icono: 'auriculares', rapida: true },
    ]);
    const ahora = Date.now();
    n.webContents.send('estado', { ...base, avisos: [], agenda: [{ titulo: 'Reunión con Martín', inicio: ahora + 50 * 60000, fin: ahora + 110 * 60000, todoElDia: false }],
      panel: { clips: true, widgets: [W('texto', 4), W('rutinas', 4), W('musica', 2), W('clip-grabar', 1), W('clip-guardar', 1), W('agenda', 2), W('frase', 2, { nombre: 'Qué veo', icono: 'camara', texto: '¿Qué estoy viendo?' }), W('frase', 1, { nombre: 'Siguiente', icono: 'siguiente', texto: 'siguiente canción' }), W('rutina', 1, { rutina: 'r1' }), W('nota', 4), W('modos', 4)] } });
    await esperar(700);
    await foto(n, '9b-panel-completo');
    const completo = await medir();
    n.webContents.send('estado', { ...base, modo: 'trabajo', clips: { activo: true, permitido: false }, panel: { clips: false, widgets: [W('texto', 4), W('rutinas', 4), W('clip-guardar', 2), W('modos', 4)] } });
    await esperar(500);
    await foto(n, '9c-panel-trabajo-sin-clips');
    const trabajo = await medir();
    // El diseño del usuario: música a la mitad y Grabar / Guardar clip chicos. Se mide que todo esté centrado y los íconos a la misma altura.
    n.webContents.send('estado', { ...base, panel: { clips: true, widgets: [W('musica', 2), W('clip-guardar', 1), W('clip-grabar', 1)] } });
    await esperar(600);
    await foto(n, '9e-panel-usuario');
    const alineacion = await n.webContents.executeJavaScript(`(() => {
      const c = (el) => { const r = el.getBoundingClientRect(); return { x: +(r.left + r.width / 2).toFixed(1), top: +r.top.toFixed(1), h: +r.height.toFixed(1), l: +r.left.toFixed(1), r: +r.right.toFixed(1) }; };
      const panel = document.getElementById('notch').getBoundingClientRect();
      const tiles = [...document.querySelectorAll('#widgets .w')].filter((x) => x.getClientRects().length);
      const grid = document.getElementById('widgets').getBoundingClientRect();
      return { centroPanel: +(panel.left + panel.width / 2).toFixed(1), centroOjos: c(document.getElementById('ojos')).x, izq: +(tiles[0].getBoundingClientRect().left - panel.left).toFixed(1), der: +(panel.right - tiles[tiles.length - 1].getBoundingClientRect().right).toFixed(1),
        alturas: tiles.map((x) => c(x).h), iconos: [...document.querySelectorAll('#widgets .tile-b svg')].map((x) => c(x).top), textos: [...document.querySelectorAll('#widgets .tile-b span')].map((x) => x.textContent) };
    })()`);
    console.log('ALINEACION', JSON.stringify(alineacion));
    // Música sonando (con título y tapa) en cada tamaño: nada se tiene que salir de su ficha ni deformar a los vecinos.
    const TAPA = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#5b2a86"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><circle cx="60" cy="60" r="28" fill="#111"/><circle cx="60" cy="60" r="6" fill="#eee"/></svg>');
    const suena = { hay: true, sonando: true, titulo: 'Persiana Americana - Soda Stereo', cancion: 'Persiana Americana', artista: 'Soda Stereo', tapa: TAPA };
    const medirMusica = () => n.webContents.executeJavaScript(`(() => {
      const w = document.getElementById('w-musica'); const m = document.getElementById('musica'); if (!w || !m) return null;
      const rw = w.getBoundingClientRect(); const rm = m.getBoundingClientRect(); const panel = document.getElementById('notch').getBoundingClientRect();
      const hijos = [...m.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return { l: +(r.left - rm.left).toFixed(1), r: +(rm.right - r.right).toFixed(1), t: +(r.top - rm.top).toFixed(1), b: +(rm.bottom - r.bottom).toFixed(1) }; });
      return { ancho: +rw.width.toFixed(1), alto: +rw.height.toFixed(1), tarjetaAncho: +rm.width.toFixed(1), botones: hijos, desborda: m.scrollWidth > m.clientWidth + 1 || m.scrollHeight > m.clientHeight + 1, panelAncho: +panel.width.toFixed(1) };
    })()`);
    const musicas = {};
    for (const [nombre, widgets] of [
      ['2x1', [W('musica', 2), W('clip-guardar', 1), W('clip-grabar', 1)]],
      ['4x1', [W('musica', 4), W('clip-guardar', 2), W('clip-grabar', 2)]],
      ['2x2', [W('musica', 2, { alto: 2 }), W('clip-guardar', 1), W('clip-grabar', 1)]],
      ['4x2', [W('musica', 4, { alto: 2 })]],
    ]) {
      n.webContents.send('estado', { ...base, musica: suena, panel: { clips: true, widgets } });
      await esperar(700);
      await foto(n, `9f-musica-${nombre}`);
      musicas[nombre] = await medirMusica();
    }
    console.log('MUSICA-WIDGET', JSON.stringify(musicas));
    // Sin música: tapa vacía y "Nada sonando", y el play/pausa tiene que quedar EXACTAMENTE donde está cuando suena.
    const posiciones = {};
    for (const [nombre, widgets] of [['2x1', [W('musica', 2), W('clip-guardar', 1), W('clip-grabar', 1)]], ['4x1', [W('musica', 4)]], ['4x2', [W('musica', 4, { alto: 2 })]]]) {
      const pos = {};
      for (const [cual, mus] of [['suena', suena], ['nada', { hay: false, sonando: false, titulo: '', cancion: '', artista: '', tapa: '' }]]) {
        n.webContents.send('estado', { ...base, musica: mus, panel: { clips: true, widgets } });
        await esperar(600);
        if (nombre === '4x1' || nombre === '4x2') await foto(n, `9g-musica-${nombre}-${cual}`);
        pos[cual] = await n.webContents.executeJavaScript(`(() => { const r = document.getElementById('musica-play').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })()`);
      }
      posiciones[nombre] = { ...pos, igual: JSON.stringify(pos.suena) === JSON.stringify(pos.nada) };
    }
    console.log('MUSICA-POSICIONES', JSON.stringify(posiciones));
    // El menú propio (no el nativo): se abre desde el botón de enviar y trae solo los aparatos.
    n.webContents.send('estado', { ...base, musica: suena, panel: { clips: true, widgets: [W('musica', 4), W('cast', 2), W('clip-grabar', 2)] } });
    await esperar(600);
    const menu = await n.webContents.executeJavaScript(`(async () => {
      const b = document.getElementById('musica-cast');
      const visible = !b.hidden;
      if (visible) b.click();
      await new Promise((r) => setTimeout(r, 300));
      const m = document.querySelector('.menu-j');
      const rm = m && m.getBoundingClientRect(); const rn = document.getElementById('notch').getBoundingClientRect();
      return { visible, abierto: !!m, opciones: m ? [...m.querySelectorAll('.menu-op')].map((o) => o.textContent.trim()) : [], dentro: m ? rm.left >= rn.left && rm.right <= rn.right + 1 && rm.top >= rn.top && rm.bottom <= rn.bottom + 1 : null };
    })()`);
    await foto(n, '9h-menu-cast');
    await n.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await esperar(200);
    menu.cierraConEsc = await n.webContents.executeJavaScript(`!document.querySelector('.menu-j')`);
    console.log('MENU-CAST', JSON.stringify(menu));
    n.webContents.send('estado', { ...base, panel: { clips: true, widgets: [] } });
    await esperar(500);
    await foto(n, '9d-panel-vacio');
    const vacio = await medir();
    await n.webContents.executeJavaScript("document.getElementById('notch').classList.remove('abierto')");
    console.log('PANEL-POR-MODO', JSON.stringify({ sinAcciones, completo, trabajo, vacio }));
    const info = await n.webContents.executeJavaScript(`(async () => ({
      ort: !!globalThis.ort, acciones: document.querySelectorAll('#acciones button').length,
      modo: document.getElementById('notch').dataset.modo, burbuja: document.getElementById('burbuja').textContent,
    }))()`);
    const novedades = await n.webContents.executeJavaScript(`({ punto: document.getElementById('notch').classList.contains('con-avisos'), items: [...document.querySelectorAll('#avisos .cuerpo')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim()), burbuja: document.getElementById('burbuja').textContent })`);
    // Un recordatorio vencido: los ojos pasan a estado de aviso hasta que se saque.
    notificaciones.agregar({ origen: 'nota', de: 'Recordatorio', texto: 'Llamar al médico', clave: `nota:h${Date.now()}` });
    await esperar(700);
    const ojosAviso = await n.webContents.executeJavaScript(`({ aviso: document.getElementById('notch').hasAttribute('data-aviso'), anim: getComputedStyle(document.querySelector('#ojos .ojo')).animationName })`);
    await foto(n, '9i-ojos-aviso');
    console.log('OJOS-AVISO', JSON.stringify(ojosAviso));
    notificaciones.limpiar();
    await esperar(500);
    const ojosSinAviso = await n.webContents.executeJavaScript(`document.getElementById('notch').hasAttribute('data-aviso')`);
    console.log('OJOS-SIN-AVISO', ojosSinAviso);
    // El selector de "qué querés grabar": la página tiene que dibujar el título, la lista y Cancelar (no quedar en negro).
    try {
      const { BrowserWindow } = require('electron');
      const base = new URL(n.webContents.getURL()).origin;
      const sel = new BrowserWindow({ width: 760, height: 540, show: false, webPreferences: { preload: path.join(__dirname, '..', 'src', 'main', 'preload.js') } });
      const consola = [];
      sel.webContents.on('console-message', (_e, ...a) => consola.push(a.map(String).join(' ')));
      await sel.loadURL(`${base}/selector.html`);
      await esperar(800);
      const dentro = await sel.webContents.executeJavaScript(`({ cuerpo: document.body.className, titulo: (document.querySelector('h1')||{}).textContent || '', items: document.querySelectorAll('.item').length, texto: document.body.innerText.slice(0, 120) })`);
      console.log('SELECTOR', JSON.stringify({ dibuja: dentro.cuerpo === 'lista' && /Cancelar/.test(dentro.texto), sinErrores: consola.length === 0, dentro, consola }));
      sel.destroy();
    } catch (e) { console.log('SELECTOR-FALLO', e.stack); }
    // Dos pantallas (simuladas): el botón "Pantalla" graba la elegida en Ajustes sin preguntar; con "preguntar" abre el selector.
    try {
      const { screen, BrowserWindow } = require('electron');
      const clipsMod = require('../src/main/clips');
      const { leerConfig, guardarConfig } = require('../src/main/config');
      const real = screen.getAllDisplays();
      const falsa = { ...real[0], id: real[0].id + 1000, bounds: { ...real[0].bounds, x: real[0].bounds.x + real[0].bounds.width }, size: real[0].size, scaleFactor: real[0].scaleFactor };
      const originalTodas = screen.getAllDisplays;
      screen.getAllDisplays = () => [real[0], falsa];
      const c0 = leerConfig();
      const cambiar = (v) => guardarConfig({ ...leerConfig(), clips: { ...leerConfig().clips, grabarPantalla: v } });
      const paso = async (v) => { cambiar(v); clipsMod._pruebas.setActiva(true); clipsMod._pruebas.setOrdenar(() => {}); const r = await Promise.race([clipsMod.empezarGrabacion('pantalla'), esperar(2500).then(() => 'ABRIO-SELECTOR')]); if (r !== 'ABRIO-SELECTOR') clipsMod.cancelarGrabacion(); return r; };
      const resultado = { principal: await paso('principal'), segunda: await paso('2'), preguntar: await paso('preguntar') };
      for (const v of BrowserWindow.getAllWindows()) { if (/elegir qué grabar/.test(v.getTitle())) { require('electron').ipcMain.emit('selector:elegir', { sender: v.webContents }, { cancelar: true }); } }
      screen.getAllDisplays = originalTodas;
      guardarConfig(c0);
      clipsMod._pruebas.setActiva(false);
      console.log('GRABAR-PANTALLA', JSON.stringify(resultado));
    } catch (e) { console.log('GRABAR-PANTALLA-FALLO', e.stack); }
    const musica = await probarMusica().catch((e) => ({ fallo: e.stack }));
    const conversacion = await conversar(n).catch((e) => ({ fallo: e.stack }));
    fs.writeFileSync(path.join(carpeta, 'resultado.json'), JSON.stringify({ errores, info, limites: n.getBounds(), geometria, novedades, responder, punto, guionDeAudio, cartel, musica, conversacion }, null, 2));
  } catch (e) {
    fs.writeFileSync(path.join(carpeta, 'resultado.json'), JSON.stringify({ fallo: e.stack, errores }, null, 2));
  }
  app.quit();
}

module.exports = { correr };
