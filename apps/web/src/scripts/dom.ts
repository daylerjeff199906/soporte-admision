import { createElement, type IconNode } from 'lucide';
export const el = <T extends HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Falta ${selector}`);
  return node;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Tres puntos que saltan, para indicar que se está consultando. */
export function puntos(tamano = 'size-2.5'): HTMLElement {
  const caja = h('span', 'inline-flex items-center gap-1.5');
  caja.setAttribute('aria-hidden', 'true');
  [0, 150, 300].forEach(retraso => {
    const punto = h('span', `inline-block ${tamano} animate-bounce bg-current`);
    punto.style.borderRadius = '50%';
    punto.style.animationDelay = `${retraso}ms`;
    caja.append(punto);
  });
  return caja;
}

/** Icono de Lucide como elemento SVG (decorativo). */
export function icono(nodo: IconNode, clase = 'size-4'): SVGElement {
  const svg = createElement(nodo);
  svg.setAttribute('class', clase);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
