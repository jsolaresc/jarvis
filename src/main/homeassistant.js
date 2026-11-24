// Puente opcional con Home Assistant (luces, enchufes, prender/apagar teles de verdad).
const { leerConfig, buscarPorNombre } = require('./config');

function datos() {
  const { url, token } = leerConfig().homeAssistant;
  return { url: (url || '').replace(/\/+$/, ''), token: token || '' };
}
const configurado = () => { const d = datos(); return !!(d.url && d.token); };

async function pedir(ruta, cuerpo) {
  const { url, token } = datos();
  if (!url || !token) throw new Error('Home Assistant no está configurado (Ajustes > Dispositivos).');
  let respuesta;
  try {
    respuesta = await fetch(`${url}${ruta}`, {
      method: cuerpo ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new Error(`No pude conectarme a Home Assistant en ${url} (${e.cause?.code || e.name}).`);
  }
  if (respuesta.status === 401) throw new Error('Home Assistant rechazó el token.');
  if (!respuesta.ok) throw new Error(`Home Assistant respondió ${respuesta.status}.`);
  return respuesta.json().catch(() => null);
}

const servicio = (dominio, nombre, cuerpo) => pedir(`/api/services/${dominio}/${nombre}`, cuerpo);

async function entidades() {
  const estados = await pedir('/api/states');
  return estados
    .map((e) => ({ entidad: e.entity_id, nombre: e.attributes?.friendly_name || e.entity_id, estado: e.state }))
    .sort((a, b) => a.entidad.localeCompare(b.entidad));
}

async function probar() {
  const r = await pedir('/api/');
  return r?.message || 'Conectado.';
}

// accion: prender | apagar | alternar | brillo (valor 0-100)
async function controlarCasa(pedido, accion, valor) {
  const cosa = buscarPorNombre(leerConfig().casa, pedido);
  if (!cosa || !cosa.entidad) throw new Error(`No tengo ningún dispositivo de casa llamado "${pedido}" (Ajustes > Dispositivos).`);
  const entity_id = cosa.entidad;
  switch (accion) {
    case 'prender': await servicio('homeassistant', 'turn_on', { entity_id }); return `${cosa.nombre}: prendido.`;
    case 'apagar': await servicio('homeassistant', 'turn_off', { entity_id }); return `${cosa.nombre}: apagado.`;
    case 'alternar': await servicio('homeassistant', 'toggle', { entity_id }); return `${cosa.nombre}: cambiado.`;
    case 'brillo': {
      const n = Math.max(0, Math.min(100, Math.round(Number(valor))));
      if (!Number.isFinite(n)) throw new Error('El brillo tiene que ser un número de 0 a 100.');
      await servicio('light', 'turn_on', { entity_id, brightness_pct: n });
      return `${cosa.nombre}: brillo al ${n}%.`;
    }
    default: throw new Error(`No sé hacer "${accion}" con ${cosa.nombre}.`);
  }
}

module.exports = { configurado, servicio, entidades, probar, controlarCasa };
