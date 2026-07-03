import { create } from 'zustand';
import { api, registerAuthRefresh } from '@/lib/api';

interface Usuario {
  id: string;
  email: string;
  rol: 'ADMIN' | 'PROFESOR';
  profesorId: string | null;
  nombre: string | null;
  apellido: string | null;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  usuario: Usuario;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  usuario: Usuario | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<boolean>;
  hydrate: () => void;
}

/**
 * Lee la sesión guardada de forma síncrona, antes del primer render.
 * Evita el race con ProtectedRoute (que en F5 redirigía a /login porque
 * el estado arrancaba en null y hydrate corría recién en un useEffect).
 */
function readStoredSession(): Pick<AuthState, 'token' | 'refreshToken' | 'usuario'> {
  try {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    const usuarioStr = localStorage.getItem('usuario');
    if (token && usuarioStr) {
      return { token, refreshToken, usuario: JSON.parse(usuarioStr) as Usuario };
    }
  } catch {
    /* localStorage no disponible o JSON corrupto */
  }
  return { token: null, refreshToken: null, usuario: null };
}

/** Promesa de refresh en curso, compartida entre requests concurrentes. */
let refreshInFlight: Promise<boolean> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  ...readStoredSession(),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuthRefresh: true,
      });

      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));

      set({
        token: data.accessToken,
        refreshToken: data.refreshToken,
        usuario: data.usuario,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Error al iniciar sesión',
      });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('usuario');
    set({ token: null, refreshToken: null, usuario: null });
  },

  refresh: async () => {
    // Single-flight: si varios requests 401 disparan refresh a la vez,
    // comparten la misma promesa en lugar de pegarle N veces al backend.
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      const currentRefresh = get().refreshToken;
      if (!currentRefresh) return false;

      try {
        const data = await api<{ accessToken: string; refreshToken: string }>(
          '/auth/refresh',
          {
            method: 'POST',
            body: JSON.stringify({ refreshToken: currentRefresh }),
            skipAuthRefresh: true,
          },
        );

        localStorage.setItem('token', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        set({ token: data.accessToken, refreshToken: data.refreshToken });
        return true;
      } catch {
        get().logout();
        return false;
      }
    })();

    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  },

  // El estado ya arranca hidratado (readStoredSession). Se mantiene por
  // compatibilidad / re-sincronización manual.
  hydrate: () => {
    set(readStoredSession());
  },
}));

// Conecta el refresh del store con api(): cualquier request que reciba 401
// intentará refrescar el token una vez y reintentar automáticamente.
registerAuthRefresh(async () => {
  const ok = await useAuthStore.getState().refresh();
  return ok ? useAuthStore.getState().token : null;
});
