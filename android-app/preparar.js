// Arma la carpeta www de la app de Android a partir de la app del celular de siempre (src/movil):
// es el mismo código; app.js se da cuenta de que corre adentro de la app nativa y cambia lo necesario
// (busca la PC en la Wi-Fi, guarda archivos con Android, etc.). También anota la versión de Jarvis
// en android/app/build.gradle (versionName y versionCode), para que la app avise cuando hay una nueva.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ORIGEN = path.join(RAIZ, 'src', 'movil');
const DESTINO = path.join(__dirname, 'www');

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });
for (const f of fs.readdirSync(ORIGEN)) {
  if (f === 'sw.js' || f === 'manifest.webmanifest') continue; // la app nativa no usa service worker ni manifiesto
  fs.copyFileSync(path.join(ORIGEN, f), path.join(DESTINO, f));
}
// Sin manifiesto ni service worker: se sacan de index.html. Rutas relativas (la app se abre desde https://localhost/).
let html = fs.readFileSync(path.join(DESTINO, 'index.html'), 'utf8');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
fs.writeFileSync(path.join(DESTINO, 'index.html'), html);

const version = require(path.join(RAIZ, 'package.json')).version;
const [a, b, c] = version.split('.').map((n) => parseInt(n, 10) || 0);
const codigo = a * 10000 + b * 100 + c;
const gradle = path.join(__dirname, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradle)) {
  let g = fs.readFileSync(gradle, 'utf8');
  g = g.replace(/versionCode\s+\d+/, `versionCode ${codigo}`).replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  fs.writeFileSync(gradle, g);
}
console.log(`www listo (Jarvis ${version}, versionCode ${codigo})`);
