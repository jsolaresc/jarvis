// Sonidos cortos para las notificaciones, hechos con osciladores (sin archivos): se eligen en
// Ajustes → Notificaciones y suenan en el notch. Cada uno es una lista de [frecuencia Hz, segundos desde el inicio, duración].
export const SONIDOS = {
  campanita: { nombre: 'Campanita', notas: [[660, 0, 0.16], [880, 0.09, 0.16]] },
  doble: { nombre: 'Doble toque', notas: [[784, 0, 0.1], [784, 0.16, 0.1]] },
  gota: { nombre: 'Gota', notas: [[1175, 0, 0.12], [880, 0.07, 0.22]], tipo: 'triangle' },
  suave: { nombre: 'Suave', notas: [[523, 0, 0.35], [659, 0.12, 0.35]], tipo: 'sine', volumen: 0.08 },
  alerta: { nombre: 'Alerta', notas: [[988, 0, 0.12], [740, 0.14, 0.12], [988, 0.28, 0.12], [740, 0.42, 0.12]], tipo: 'square', volumen: 0.05 },
  ascendente: { nombre: 'Ascendente', notas: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.22]] },
};
export const LISTA_DE_SONIDOS = Object.entries(SONIDOS).map(([id, s]) => [id, s.nombre]);

export function tocar(contexto, id) {
  const s = SONIDOS[id];
  if (!s || !contexto) return;
  const ahora = contexto.currentTime;
  for (const [frecuencia, inicio, duracion] of s.notas) {
    const o = contexto.createOscillator();
    const g = contexto.createGain();
    o.type = s.tipo || 'sine';
    o.frequency.value = frecuencia;
    const t = ahora + inicio;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(s.volumen || 0.12, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + duracion);
    o.connect(g).connect(contexto.destination);
    o.start(t);
    o.stop(t + duracion + 0.02);
  }
  if (contexto.state === 'suspended') contexto.resume();
}
