import { config } from '@/config/env';

const API_BASE = config.apiBase;
// Evita que una operación quede esperando indefinidamente. Quince segundos
// toleran demoras normales del servidor sin ocultar una pérdida de conexión.
export const API_TIMEOUT_MS = 15_000;

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'invalid-response';
export const API_CONNECTION_EVENT = 'cefide:api-connection';

function reportConnection(available: boolean): void {
  window.dispatchEvent(new CustomEvent(API_CONNECTION_EVENT, { detail: { available } }));
}

interface ApiOptions extends RequestInit {
  token?: string;
  /** Evita el ciclo refresh→retry (se usa internamente y en endpoints /auth). */
  skipAuthRefresh?: boolean;
  timeoutMs?: number;
}

/**
 * Handler de refresh registrado por el auth store (evita import circular).
 * Devuelve el nuevo accessToken, o null si el refresh falló (sesión muerta).
 */
type AuthRefreshHandler = () => Promise<string | null>;
let authRefreshHandler: AuthRefreshHandler | null = null;

export function registerAuthRefresh(fn: AuthRefreshHandler): void {
  authRefreshHandler = fn;
}

export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const {
    token,
    skipAuthRefresh,
    timeoutMs = API_TIMEOUT_MS,
    headers: customHeaders,
    signal: callerSignal,
    ...rest
  } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      headers,
      signal: controller.signal,
      ...rest,
    });
  } catch (error) {
    reportConnection(false);
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new ApiError(0, 'La solicitud superó el tiempo de espera', 'timeout');
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'No se pudo conectar con el servidor', 'network');
  } finally {
    window.clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }

  reportConnection(true);

  // Token expirado/inválido: intenta refrescar una vez y reintenta el request.
  if (
    res.status === 401 &&
    !skipAuthRefresh &&
    token &&
    authRefreshHandler
  ) {
    const newToken = await authRefreshHandler();
    if (newToken) {
      return api<T>(endpoint, { ...options, token: newToken, skipAuthRefresh: true });
    }
    // refresh falló → el handler ya hizo logout; propaga el 401.
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Error de red' }));
    throw new ApiError(res.status, error.message || 'Error del servidor', 'http');
  }

  try {
    return await res.json();
  } catch {
    throw new ApiError(res.status, 'El servidor devolvió una respuesta inesperada', 'invalid-response');
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public kind: ApiErrorKind = 'http',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getApiErrorMessage(error: unknown, write = true): string {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado. Intentá nuevamente.';
  if (error.kind === 'timeout') {
    return write
      ? 'No se pudo confirmar el resultado. La operación podría haberse completado; verificá el estado antes de reintentar.'
      : 'La operación está tardando más de lo esperado. No fue posible obtener una respuesta del servidor.';
  }
  if (error.kind === 'network') return 'No se pudo conectar con el servidor. No fue posible confirmar la operación.';
  if (error.kind === 'invalid-response') return 'El servidor devolvió una respuesta inesperada. Verificá el estado antes de reintentar.';
  if (error.status >= 500) return 'Ocurrió un problema en el servidor. Intentá nuevamente.';
  return error.message;
}
