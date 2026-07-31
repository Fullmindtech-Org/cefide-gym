import { useState, useEffect } from 'react';
import { Zap, Activity, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { abrirMolineteLocal, statusMolineteLocal, type DriverStatus } from '@/lib/molinete';
import { config } from '@/config/env';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Panel admin del molinete — apertura de contingencia.
 *
 * El proxy (GymProxy) corre en la MISMA PC que este navegador (localhost) y
 * reenvía a la ESP de cada molinete por red según sus `targets{}`. Si el proxy
 * de esta PC tiene ambos targets (`molinete1`, `molinete2`), desde acá se pueden
 * abrir los dos. Mostramos una tarjeta por molinete (config.molineteCount).
 */
function MolineteCard({ num }: { num: number }) {
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [opening, setOpening] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function fetchStatus() {
      const s = await statusMolineteLocal(num);
      if (!cancelado) setStatus(s);
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => {
      cancelado = true;
      clearInterval(interval);
    };
  }, [num]);

  async function handleContingencia() {
    setOpening(true);
    setLastAction(null);

    // 1. Apertura física contra el proxy local de esta PC.
    const apertura = await abrirMolineteLocal(num);

    // 2. Registrar la contingencia en el backend (auditoría), aunque la
    //    apertura física la hizo el navegador.
    try {
      await api(`/molinete/${num}/contingencia`, {
        method: 'POST',
        body: JSON.stringify({ motivo: 'Apertura manual desde panel admin' }),
        token: token!,
      });
    } catch {
      /* el log es secundario; no bloquea la apertura */
    }

    setLastAction(
      apertura.ok
        ? `Molinete ${num} abierto correctamente`
        : `Error al abrir: ${apertura.error}`,
    );
    setOpening(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">Molinete {num}</CardTitle>
        {status ? (
          status.ok ? (
            <Badge variant={status.online === false ? 'warning' : 'success'}>
              {status.online === false ? 'ESP sin responder' : 'Conectado'}
            </Badge>
          ) : null
        ) : (
          <Badge variant="muted">Cargando...</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.ok && (
          <div className="text-sm text-cefide-muted space-y-1">
            <p>Estado ESP: {status.estado ?? '—'}</p>
            <p>Alcanzable: {status.online === false ? 'no' : 'sí'}</p>
          </div>
        )}

        {lastAction && (
          <div className="rounded-md border border-cefide-border bg-cefide-bg p-2 text-sm">
            {lastAction}
          </div>
        )}

        <Button
          className="w-full"
          variant="destructive"
          size="lg"
          disabled={opening}
          onClick={handleContingencia}
        >
          <Zap className="mr-2 h-5 w-5" />
          {opening ? 'Abriendo...' : 'Apertura de Contingencia'}
        </Button>

        <p className="text-xs text-cefide-muted flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Abre sin validar estado del alumno
        </p>
      </CardContent>
    </Card>
  );
}

export function MolinetesPage() {
  const molinetes = Array.from({ length: config.molineteCount }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Molinetes</h2>
        <div className="flex items-center gap-2 text-sm text-cefide-muted">
          <Activity className="h-4 w-4" />
          Estado en tiempo real (cada 10s)
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 max-w-3xl">
        {molinetes.map((n) => (
          <MolineteCard key={n} num={n} />
        ))}
      </div>
    </div>
  );
}
