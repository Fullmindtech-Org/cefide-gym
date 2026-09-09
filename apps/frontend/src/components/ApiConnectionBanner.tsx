import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { API_CONNECTION_EVENT } from '@/lib/api';

export function ApiConnectionBanner() {
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const handleConnection = (event: Event) => {
      setAvailable((event as CustomEvent<{ available: boolean }>).detail.available);
    };
    window.addEventListener(API_CONNECTION_EVENT, handleConnection);
    return () => window.removeEventListener(API_CONNECTION_EVENT, handleConnection);
  }, []);

  if (available) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 border-b border-amber-500 bg-amber-400 px-4 py-2 text-sm font-medium text-black shadow-md">
      <TriangleAlert className="h-4 w-4 shrink-0" />
      Sin comunicación con el servidor. Los datos mostrados pueden estar desactualizados.
    </div>
  );
}
