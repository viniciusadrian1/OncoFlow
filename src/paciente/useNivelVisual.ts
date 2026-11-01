import { useEffect, type RefObject } from 'react';

/** Read local audio activity without rerendering the patient app on every frame. */
export function useNivelVisual(
  element: RefObject<HTMLElement | null>,
  nivel: RefObject<number> | undefined,
  ativo: boolean,
) {
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let suavizado = 0;
    const update = () => {
      const valor = Math.min(1, Math.max(0, nivel?.current ?? 0));
      suavizado += (valor - suavizado) * .24;
      node.style.setProperty('--audio-level', suavizado.toFixed(3));
      frame = requestAnimationFrame(update);
    };
    const iniciar = () => {
      cancelAnimationFrame(frame);
      node.style.setProperty('--audio-level', '0');
      if (ativo && !motion.matches) frame = requestAnimationFrame(update);
    };
    iniciar();
    motion.addEventListener('change', iniciar);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener('change', iniciar);
      node.style.setProperty('--audio-level', '0');
    };
  }, [element, nivel, ativo]);
}
