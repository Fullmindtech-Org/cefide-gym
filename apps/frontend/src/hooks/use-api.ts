import useSWR, { type SWRConfiguration } from 'swr';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

function useApiGet<T>(endpoint: string | null, config?: SWRConfiguration) {
  const token = useAuthStore((s) => s.token);

  return useSWR<T>(
    endpoint ? [endpoint, token] : null,
    ([url]: [string]) => api<T>(url, { token: token! }),
    {
      // Revalida al volver a la pestaña/ventana y al reconectar, así los datos
      // (ingresos, etc.) se actualizan sin tener que refrescar la página a mano.
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      ...config,
    },
  );
}

export { useApiGet };
