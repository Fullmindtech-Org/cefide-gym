import { config } from '@/config/env';

const API_BASE = config.apiBase;

interface ApiOptions extends RequestInit {
  token?: string;
  /** Evita el ciclo refresh→retry (se usa internamente y en endpoints /auth). */
  skipAuthRefresh?: boolean;
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
  const { token, skipAuthRefresh, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers,
    ...rest,
  });

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
    throw new ApiError(res.status, error.message || 'Error del servidor');
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
