import { useState, useEffect, useCallback } from 'react';
import { Zap, Activity, AlertTriangle, CircleCheck, CircleX } from 'lucide-react';
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
interface MolineteCardProps {
  num: number;
  onStatusChange: (num: number, status: DriverStatus) => void;
}

function MolineteCard({ num, onStatusChange }: MolineteCardProps) {
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [opening, setOpening] = useState(false);
  const [lastAction, setLastAction] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function fetchStatus() {
      const s = await statusMolineteLocal(num);
      if (!cancelado) {
        setStatus(s);
        onStatusChange(num, s);
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => {
      cancelado = true;
      clearInterval(interval);
    };
  }, [num, onStatusChange]);

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

    setLastAction({
      ok: apertura.ok,
      message: apertura.ok
        ? `Molinete ${num} abierto correctamente`
        : apertura.error ?? 'No se puede conectar con el molinete',
    });
    if (apertura.ok) {
      const nuevoEstado = await statusMolineteLocal(num);
      setStatus(nuevoEstado);
      onStatusChange(num, nuevoEstado);
    }
    setOpening(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">Molinete {num}</CardTitle>
        {status ? (
          status.ok && status.online !== false ? (
            <Badge variant="success" className="gap-1">
              <CircleCheck className="h-3 w-3" /> Conectado
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <CircleX className="h-3 w-3" /> Sin conexión
            </Badge>
          )
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
          <div className={lastAction.ok
            ? 'rounded-md border border-cefide-success/30 bg-cefide-success/10 p-2 text-sm text-cefide-success'
            : 'rounded-md border border-cefide-accent-alt/30 bg-cefide-accent-alt/10 p-2 text-sm text-cefide-accent-alt'}
          >
            {lastAction.message}
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
  const [statuses, setStatuses] = useState<Record<number, DriverStatus>>({});

  const handleStatusChange = useCallback((num: number, status: DriverStatus) => {
    setStatuses((current) => ({ ...current, [num]: status }));
  }, []);

  const cargados = molinetes.every((num) => statuses[num] !== undefined);
  const todosConectados = cargados && molinetes.every(
    (num) => statuses[num].ok && statuses[num].online !== false,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Molinetes</h2>
        <div className="flex items-center gap-3">
          <Badge
            variant={!cargados ? 'muted' : todosConectados ? 'success' : 'destructive'}
            className="gap-1.5"
          >
            {!cargados ? (
              <Activity className="h-3.5 w-3.5" />
            ) : todosConectados ? (
              <CircleCheck className="h-3.5 w-3.5" />
            ) : (
              <CircleX className="h-3.5 w-3.5" />
            )}
            {!cargados ? 'Verificando molinetes' : todosConectados ? 'Molinetes conectados' : 'Molinetes sin conexión'}
          </Badge>
          <span className="hidden text-sm text-cefide-muted sm:inline">Actualiza cada 10s</span>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 max-w-3xl">
        {molinetes.map((n) => (
          <MolineteCard key={n} num={n} onStatusChange={handleStatusChange} />
        ))}
      </div>
    </div>
  );
}
