// Revisa que en el código no quede nada personal antes de subirlo a GitHub:
// claves de APIs, tokens, mails y teléfonos que no sean de ejemplo, rutas de tu PC y,
// si existe, cualquier palabra de ".privado.txt" (un archivo tuyo, que no se sube, con
// tus nombres, mails, contactos, etc., uno por línea).
// Uso: npm run revisar-privacidad   (sale con error si encuentra algo)
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SALTEAR = new Set(['node_modules', '.git', 'dist', 'datos']);
const EXTENSIONES = /\.(js|json|md|html|css|txt|ps1|nsh|yml|yaml|webmanifest)$/i;
const IGNORAR_ARCHIVOS = new Set(['package-lock.json', '.privado.txt']);

const REGLAS = [
  ['clave de Google', /AIza[0-9A-Za-z_-]{30,}/],
  ['secreto de Google OAuth', /GOCSPX-[0-9A-Za-z_-]{10,}/],
  ['ID de cliente de Google', /\b\d{8,}-[0-9a-z]{20,}\.apps\.googleusercontent\.com/],
  ['clave de Groq', /gsk_[0-9A-Za-z]{20,}/],
  ['clave de OpenAI/Anthropic', /\bsk-(?:ant-)?[0-9A-Za-z_-]{20,}/],
  ['clave de Tavily', /tvly-[0-9A-Za-z]{16,}/],
  ['token de GitHub', /\b(?:ghp|gho|ghu|ghs|github_pat)_[0-9A-Za-z_]{20,}/],
  ['token de Slack', /xox[abpr]-[0-9A-Za-z-]{10,}/],
  ['contraseña de aplicación de Gmail', /\b(?!abcd )(?!([a-z]{4}) \1 )[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}\b/],
  ['ruta de una carpeta de usuario', /[A-Z]:\\\\?(?:Users|Usuarios)\\\\?(?!x\\|vos\\|usuario\\|<)[A-Za-z0-9._-]{2,}/],
];
// Mails y teléfonos: se aceptan solo los de ejemplo.
const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MAIL_DE_EJEMPLO = /@(x\.com|b\.com|example\.(com|org)|ejemplo\.com|casa\.com|y\.com|mail\.gmail\.com|empresa\.com|tienda\.com|banco\.com|promos\.com|gmail\.com|hotmail\.com|outlook\.com|s\.whatsapp\.net|g\.us|lid|anthropic\.com|users\.noreply\.github\.com|group\.v\.calendar\.google\.com)$/i;
const MAILS_GENERICOS = /^(micuenta|abc123|yo|vos|usuario|otra|otro|a|p|jefe|martin|viejo|leido|ofertas|avisos|banco|trabajo|noreply|festivos|alguien|test|prueba)@/i;
const TELEFONO = /\b549?\d{10}\b/g;
// De ejemplo: 11 2345 678x, o con bloques de cifras repetidas (1155554444, 1100001111...).
const TELEFONO_DE_EJEMPLO = (n) => /^549?11(2345678\d|00000000)$/.test(n) || /(\d)\1{3}/.test(n.slice(-8));

const propias = (() => {
  try {
    return fs.readFileSync(path.join(RAIZ, '.privado.txt'), 'utf8').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
  } catch { return []; }
})();

const hallazgos = [];
function revisar(archivo) {
  const rel = path.relative(RAIZ, archivo);
  const lineas = fs.readFileSync(archivo, 'utf8').split(/\r?\n/);
  lineas.forEach((linea, i) => {
    const donde = `${rel}:${i + 1}`;
    for (const [nombre, re] of REGLAS) if (re.test(linea)) hallazgos.push(`${donde}  ${nombre}`);
    for (const m of linea.match(MAIL) || []) if (!MAIL_DE_EJEMPLO.test(m) || (/@(gmail|hotmail|outlook)\./i.test(m) && !MAILS_GENERICOS.test(m))) hallazgos.push(`${donde}  mail: ${m}`);
    for (const m of linea.match(TELEFONO) || []) if (!TELEFONO_DE_EJEMPLO(m)) hallazgos.push(`${donde}  teléfono: ${m}`);
    for (const p of propias) if (linea.toLowerCase().includes(p.toLowerCase())) hallazgos.push(`${donde}  palabra privada: "${p}"`);
  });
}
function recorrer(dir) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SALTEAR.has(n.name)) continue;
    const ruta = path.join(dir, n.name);
    if (n.isDirectory()) recorrer(ruta);
    else if (EXTENSIONES.test(n.name) && !IGNORAR_ARCHIVOS.has(n.name)) revisar(ruta);
  }
}
recorrer(RAIZ);
if (hallazgos.length) {
  console.log(`Ojo: ${hallazgos.length} cosa(s) que podrían ser personales:\n`);
  for (const h of hallazgos) console.log(`  ${h}`);
  process.exit(1);
}
console.log(`Sin datos personales a la vista${propias.length ? ` (también revisé ${propias.length} palabra(s) de .privado.txt)` : ''}.`);
