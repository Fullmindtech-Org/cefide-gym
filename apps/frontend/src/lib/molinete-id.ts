/**
 * Identidad del molinete de ESTA PC.
 *
 * Cada PC controla su propio molinete (el driver/proxy corre en localhost).
 * El número identifica cuál es, para el log del backend y la UI.
 *
 * Fuente de verdad: `localStorage` (persistente por PC). Se puede sembrar/forzar
 * con `?molinete=N` en la URL — si viene, se guarda. Default 1.
 */

const STORAGE_KEY = 'cefide.molineteId';

/** Número de molinete configurado en esta PC (1 si no hay nada). */
export function getMolineteId(): number {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('molinete');
  if (fromUrl !== null) {
    const n = parseInt(fromUrl, 10);
    if (Number.isFinite(n) && n > 0) {
      setMolineteId(n); // sembrar/forzar desde URL
      return n;
    }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return 1;
}

/** Fija el número de molinete de esta PC (persistente). */
export function setMolineteId(n: number): void {
  localStorage.setItem(STORAGE_KEY, String(n));
}
