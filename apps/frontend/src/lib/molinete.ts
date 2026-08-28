import { config } from '@/config/env';

/**
 * Cliente del proxy local del molinete (GymProxy).
 *
 * GymProxy corre en la MISMA PC que el navegador (localhost:8080 por defecto).
 * Un front HTTPS puede llamar a localhost sin bloqueo mixed-content. El proxy
 * reenvía a la ESP/molinete de red según el nombre de target y su `config.json`:
 *
 *   ${driverBase}/proxy/<molineteN>/<ruta-esp>
 *     → http://<ip-de-la-esp>/<ruta-esp>
 *
 * El nombre de target (`molinete1`, `molinete2`, ...) debe coincidir con las
 * keys de `targets{}` en el config.json de GymProxy.
 */

const DRIVER = config.driverBase;

export interface DriverResult {
  ok: boolean;
  error?: string;
}

export interface DriverStatus {
  ok: boolean;
  /** Estado reportado por la ESP, ej "abierto" | "cerrado". */
  estado?: string;
  /** La ESP está alcanzable desde el proxy. */
  online?: boolean;
  error?: string;
}

/** Nombre de target en el config.json de GymProxy. */
function targetName(molineteId: number): string {
  return `molinete${molineteId}`;
}

/** Envía la orden de apertura a la ESP del molinete vía el proxy local. */
export async function abrirMolineteLocal(molineteId: number): Promise<DriverResult> {
  try {
    const url = `${DRIVER}/proxy/${targetName(molineteId)}/${config.molineteOpenPath}`;
    const res = await fetch(url, {
      method: config.molineteOpenMethod,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'sin conexión' };
  }
}

/** Consulta el estado de la ESP del molinete vía el proxy local. */
export async function statusMolineteLocal(molineteId: number): Promise<DriverStatus> {
  try {
    const url = `${DRIVER}/proxy/${targetName(molineteId)}/${config.molineteStatusPath}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { estado?: string; online?: boolean };
    return { ok: true, estado: data.estado, online: data.online };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No responde' };
  }
}
