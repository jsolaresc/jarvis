// Muestra en la interfaz el nombre que el usuario le puso al asistente. Los textos de las pantallas
// dicen "Jarvis"; si el asistente se llama de otra forma, se cambia esa palabra en lo que se ve
// (textos, placeholder, title, aria-label), también en lo que se dibuja después.
// Lo marcado con data-sin-nombre (por ejemplo, el detector clásico "Hey Jarvis", que solo
// entiende esa palabra) queda como está.
const ATRIBUTOS = ['placeholder', 'title', 'aria-label'];
const SALTEAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'KBD']);
let nombre = 'Jarvis';
let observador = null;
const escritos = new WeakMap(); // nodo -> último texto que puse yo (para no volver a procesarlo)

const PALABRA = /\bJarvis\b/g;
const cambiar = (t) => t.replace(PALABRA, nombre);

function excluido(nodo) {
  for (let n = nodo.nodeType === 1 ? nodo : nodo.parentElement; n; n = n.parentElement) {
    if (SALTEAR.has(n.tagName) || n.hasAttribute('data-sin-nombre')) return true;
  }
  return false;
}
function texto(nodo) {
  if (escritos.get(nodo) === nodo.data || !PALABRA.test(nodo.data)) return;
  PALABRA.lastIndex = 0;
  if (excluido(nodo)) return;
  const nuevo = cambiar(nodo.data);
  escritos.set(nodo, nuevo);
  if (nuevo !== nodo.data) nodo.data = nuevo;
}
function atributos(el) {
  if (el.closest && el.closest('[data-sin-nombre]')) return;
  for (const a of ATRIBUTOS) {
    const v = el.getAttribute && el.getAttribute(a);
    if (v && /\bJarvis\b/.test(v)) el.setAttribute(a, cambiar(v));
  }
}
function recorrer(raiz) {
  if (!raiz) return;
  if (raiz.nodeType === 3) { texto(raiz); return; }
  if (raiz.nodeType !== 1 && raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
  if (raiz.nodeType === 1) atributos(raiz);
  const caminante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = caminante.nextNode(); n; n = caminante.nextNode()) { if (n.nodeType === 3) texto(n); else atributos(n); }
}

export function usarNombre(nuevo) {
  const limpio = String(nuevo || '').trim() || 'Jarvis';
  if (limpio === nombre && observador) return;
  nombre = limpio;
  if (nombre === 'Jarvis') { if (observador) { observador.disconnect(); observador = null; } return; }
  if (/\bJarvis\b/.test(nombre)) return; // "Jarvis 2": reemplazar entraría en un ciclo; se deja el texto de fábrica
  recorrer(document.body);
  document.title = cambiar(document.title);
  if (observador) return;
  observador = new MutationObserver((cambios) => {
    for (const c of cambios) {
      if (c.type === 'characterData') texto(c.target);
      else if (c.type === 'attributes') atributos(c.target);
      else c.addedNodes.forEach(recorrer);
    }
  });
  observador.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
}
export const nombreActual = () => nombre;
