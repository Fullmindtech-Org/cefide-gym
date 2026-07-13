/**
 * Configuracion central de variables de entorno.
 *
 * Todas las envs del frontend deben leerse desde aca (no usar
 * `import.meta.env` directamente en los componentes/servicios).
 *
 * En Cloudflare Pages, estas variables se definen en:
 *   Settings -> Environment variables (build)
 */

/** URL base del backend, ej: https://api.cefide.com (sin slash final). */
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/**
 * URL del proxy local del molinete (GymProxy, corre en la MISMA PC que el
 * navegador). `localhost`/`127.0.0.1` está exento del bloqueo mixed-content,
 * por eso un front HTTPS puede llamarlo. El proxy reenvía a la ESP/molinete
 * de red según `targets{}` en su `config.json`.
 *
 * El front pega a `${driverBase}/proxy/<molineteN>/<ruta-esp>`.
 */
const DRIVER_URL = (import.meta.env.VITE_DRIVER_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

/** Ruta en la ESP para abrir (último segmento del proxy). Ajustable si la ESP usa otra. */
const MOLINETE_OPEN_PATH = (import.meta.env.VITE_MOLINETE_OPEN_PATH ?? 'abrir').replace(/^\//, '');

/** Ruta en la ESP para consultar estado. */
const MOLINETE_STATUS_PATH = (import.meta.env.VITE_MOLINETE_STATUS_PATH ?? 'estado').replace(/^\//, '');

/** Método HTTP para la apertura (la ESP del demo abre con GET). */
const MOLINETE_OPEN_METHOD = (import.meta.env.VITE_MOLINETE_OPEN_METHOD ?? 'GET').toUpperCase();

/**
 * Cantidad de molinetes que maneja el sistema. La vista admin de contingencia
 * muestra una tarjeta por cada uno (targets `molinete1..N` del proxy local).
 */
const MOLINETE_COUNT = Math.max(1, parseInt(import.meta.env.VITE_MOLINETE_COUNT ?? '2', 10) || 2);

export const config = {
  /** Endpoint base del API (incluye el prefijo `/api`). */
  apiBase: `${API_URL}/api`,
  /** Base del proxy local del molinete (GymProxy). */
  driverBase: DRIVER_URL,
  /** Ruta ESP de apertura. */
  molineteOpenPath: MOLINETE_OPEN_PATH,
  /** Ruta ESP de estado. */
  molineteStatusPath: MOLINETE_STATUS_PATH,
  /** Método HTTP de apertura. */
  molineteOpenMethod: MOLINETE_OPEN_METHOD,
  /** Cantidad de molinetes del sistema. */
  molineteCount: MOLINETE_COUNT,
} as const;
