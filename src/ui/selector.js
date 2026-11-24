// Ventanita para elegir qué grabar: una pantalla, una ventana (con miniaturas) o un recuadro arrastrando sobre la pantalla.
const jarvis = window.jarvis;
const params = new URLSearchParams(location.search);
const crear = (tag, props = {}, hijos = []) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...hijos); return e; };

if (params.get('recuadro')) {
  document.body.classList.add('recuadro');
  const caja = crear('div', { id: 'caja' });
  const medida = crear('div', { id: 'medida' });
  const ayuda = crear('div', { id: 'ayuda', textContent: 'Arrastrá para elegir qué grabar · Esc o clic derecho cancelan' });
  document.body.append(caja, medida, ayuda);
  let ini = null;
  let actual = null;
  const rect = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const cancelar = () => jarvis.enviar('selector:elegir', { cancelar: true });
  window.addEventListener('mousedown', (e) => { if (e.button === 2) { cancelar(); return; } ini = { x: e.clientX, y: e.clientY }; ayuda.style.display = 'none'; });
  window.addEventListener('mousemove', (e) => {
    if (!ini) return;
    actual = rect(ini, { x: e.clientX, y: e.clientY });
    Object.assign(caja.style, { display: 'block', left: `${actual.x}px`, top: `${actual.y}px`, width: `${actual.w}px`, height: `${actual.h}px` });
    Object.assign(medida.style, { display: 'block', left: `${actual.x}px`, top: `${Math.max(0, actual.y - 24)}px` });
    medida.textContent = `${Math.round(actual.w * devicePixelRatio)} × ${Math.round(actual.h * devicePixelRatio)}`;
  });
  window.addEventListener('mouseup', (e) => {
    if (!ini || e.button !== 0) return;
    const r = rect(ini, { x: e.clientX, y: e.clientY });
    ini = null;
    if (r.w < 40 || r.h < 40) { caja.style.display = 'none'; medida.style.display = 'none'; ayuda.style.display = ''; return; } // fue un clic: se vuelve a intentar
    jarvis.enviar('selector:elegir', { recorte: { x: r.x / innerWidth, y: r.y / innerHeight, w: r.w / innerWidth, h: r.h / innerHeight } });
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelar(); });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
} else {
  document.body.classList.add('lista');
  (async () => {
    const r = await jarvis.pedir('selector:datos');
    const datos = r && r.ok ? r.dato : { titulo: 'Elegí qué grabar', items: [] };
    const rejilla = crear('div', { id: 'rejilla' });
    for (const it of datos.items) {
      const b = crear('button', { type: 'button', className: 'item', title: it.nombre }, [
        it.miniatura ? crear('img', { src: it.miniatura, alt: '' }) : crear('div'),
        crear('span', { textContent: it.nombre }),
      ]);
      b.addEventListener('click', () => jarvis.enviar('selector:elegir', { id: it.id }));
      rejilla.append(b);
    }
    if (!datos.items.length) rejilla.append(crear('p', { textContent: 'No encuentro nada para grabar.' }));
    const cancelar = crear('button', { type: 'button', textContent: 'Cancelar' });
    cancelar.addEventListener('click', () => jarvis.enviar('selector:elegir', { cancelar: true }));
    document.body.append(crear('h1', { textContent: datos.titulo }), rejilla, crear('div', { id: 'pie' }, [cancelar]));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') jarvis.enviar('selector:elegir', { cancelar: true }); });
    (rejilla.querySelector('.item') || cancelar).focus();
  })();
}
