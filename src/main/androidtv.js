// Control remoto de Google TV / Android TV (el mismo que usa la app "Google TV" del celu): sirve para
// abrir en la tele la aplicación de un servicio (Disney+, HBO Max, Netflix…). El título lo elegís vos con el
// control: ninguna de esas apps deja que otra aplicación le elija qué reproducir.
// Hay que vincular cada tele una vez: la tele muestra un código y se escribe en Ajustes → Dispositivos.
const path = require('path');
const { DATOS, leerJSON, guardarJSON } = require('./config');

const ARCHIVO = 'androidtv.json'; // { [dispositivo]: { cert: {key, cert} } } — son certificados de esta PC, no contraseñas tuyas
let resolverTele = async () => { throw new Error('androidtv sin configurar'); };
const pendientes = new Map(); // dispositivo -> { remoto, ... } vinculación a medias
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function configurar(f) { if (f.resolver) resolverTele = f.resolver; }
const guardados = () => leerJSON(ARCHIVO, {});
const vinculada = (nombre) => !!(guardados()[nombre] && guardados()[nombre].cert && guardados()[nombre].cert.key);
const vinculadas = () => Object.keys(guardados()).filter(vinculada);

function nuevoRemoto(host, cert) {
  const { AndroidRemote } = require('androidtv-remote');
  return new AndroidRemote(host, { cert: cert || {}, service_name: 'Jarvis' });
}
// La librería se reconecta sola cuando se cierra la conexión (incluso a propósito): se le quita eso antes de cortar.
function cortar(remoto) {
  try { if (remoto && remoto.remoteManager) { remoto.remoteManager.start = async () => {}; remoto.remoteManager.stop(); } } catch {}
  try { if (remoto && remoto.pairingManager && remoto.pairingManager.client) remoto.pairingManager.client.destroy(); } catch {}
}

// Parlantes y pantallas Nest / Google Home hablan solo Cast: no tienen el control remoto de Google TV,
// así que no hay nada que vincular (la música y YouTube les llegan igual por Cast).
const SOLO_CAST = /nest ?hub|nest ?mini|home ?mini|home ?max|nest ?audio|nest ?wifi|google ?home|chromecast ?audio|home$/i;
const esSoloCast = (modelo) => SOLO_CAST.test(String(modelo || ''));

// ¿Atiende en el puerto de vinculación (6467)? Una tele con Google TV / Android TV sí.
function puertoAbierto(host, puerto, ms = 3000) {
  return new Promise((ok) => {
    const net = require('net');
    const c = net.connect({ host, port: puerto });
    const fin = (r) => { try { c.destroy(); } catch {} ok(r); };
    c.setTimeout(ms, () => fin(false));
    c.once('connect', () => fin(true));
    c.once('error', () => fin(false));
  });
}

// Paso 1: la tele muestra un código de 6 caracteres. Resuelve cuando ya lo está mostrando.
async function iniciarVinculo(nombre) {
  const d = await resolverTele(nombre);
  if (esSoloCast(d.modelo) || !(await puertoAbierto(d.host, 6467))) {
    throw new Error(`${d.nombre}${d.modelo ? ` (${d.modelo})` : ''} no tiene control remoto de Google TV, por eso no se puede vincular. No hace falta: la música y los videos de YouTube le llegan igual por Cast. Vincular sirve para teles o Chromecast con Google TV.`);
  }
  const previo = pendientes.get(d.nombre);
  if (previo) cortar(previo.remoto);
  const remoto = nuevoRemoto(d.host, null);
  const pendiente = { remoto, host: d.host, listo: null };
  pendientes.set(d.nombre, pendiente);
  const muestra = new Promise((ok, mal) => {
    const plazo = setTimeout(() => mal(new Error('La tele no mostró el código. Fijate que esté prendida y en la misma red.')), 15000);
    remoto.once('secret', () => { clearTimeout(plazo); ok(); });
  });
  // start() espera, adentro, a que se mande el código: no se espera acá.
  pendiente.listo = remoto.start().catch((e) => { throw e; });
  pendiente.listo.catch(() => {});
  await muestra;
  return { dispositivo: d.nombre };
}

// Paso 2: el código que se ve en la tele.
async function enviarCodigo(nombre, codigo) {
  const d = await resolverTele(nombre);
  const p = pendientes.get(d.nombre);
  if (!p) throw new Error('Primero tocá "Vincular" para que la tele muestre el código.');
  const limpio = String(codigo || '').trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(limpio)) throw new Error('El código tiene 6 letras o números (0-9 y A-F).');
  const respuesta = p.remoto.sendCode(limpio);
  await Promise.race([respuesta, esperar(8000)]).catch(() => {});
  const ok = await Promise.race([
    new Promise((r) => p.remoto.once('ready', () => r(true))),
    p.listo.then((x) => !!x).catch(() => false),
    esperar(12000).then(() => false),
  ]);
  const cert = p.remoto.getCertificate();
  cortar(p.remoto);
  pendientes.delete(d.nombre);
  if (!ok || !cert.key) throw new Error('La tele no aceptó el código. Probá de nuevo con "Vincular".');
  const todo = guardados();
  todo[d.nombre] = { cert, cuando: Date.now() };
  guardarJSON(ARCHIVO, todo);
  return { dispositivo: d.nombre };
}

// Abre la dirección de una app en la tele (la app que la atiende, instalada en la tele, se abre sola).
async function abrir(nombre, enlace) {
  const d = await resolverTele(nombre);
  const guardado = guardados()[d.nombre];
  if (!guardado || !guardado.cert) {
    // Sin vincular: o falta hacerlo (Google TV / Android TV), o este aparato no tiene control remoto y no hay nada que vincular (solo Cast).
    if (esSoloCast(d.modelo)) throw new Error(`${d.nombre}${d.modelo ? ` (${d.modelo})` : ''} es solo Cast: no puedo abrirle apps como Disney+ (sí YouTube y música). Si querés, lo abro en la PC.`);
    throw Object.assign(new Error(`Falta vincular el control de ${d.nombre} para abrirle apps: Ajustes → Dispositivos → "Vincular control" (una sola vez, con el código que muestra la tele). Si querés, mientras tanto lo abro en la PC.`), { faltaVincular: true });
  }
  const remoto = nuevoRemoto(d.host, guardado.cert);
  let fallo = null;
  remoto.on('error', (e) => { fallo = e; });
  const desvinculada = new Promise((r) => remoto.once('unpaired', () => r('unpaired')));
  const lista = new Promise((r) => remoto.once('ready', () => r('ready')));
  remoto.start().catch(() => {});
  try {
    const estado = await Promise.race([lista, desvinculada, esperar(12000).then(() => 'tarde')]);
    if (estado === 'unpaired') throw new Error(`${d.nombre} ya no reconoce a Jarvis: volvé a vincular el control en Ajustes → Dispositivos.`);
    if (estado === 'tarde') throw new Error(`No pude conectarme al control de ${d.nombre}. ¿Está prendida?`);
    remoto.sendAppLink(enlace);
    await esperar(1500);
    if (fallo) throw new Error(`${d.nombre} no pudo abrir eso (${(fallo.error && fallo.error.message) || 'sin detalle'}).`);
    return d.nombre;
  } finally { cortar(remoto); }
}

module.exports = { esSoloCast, configurar, vinculada, vinculadas, iniciarVinculo, enviarCodigo, abrir };
