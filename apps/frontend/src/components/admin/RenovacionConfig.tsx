import { useState } from 'react';
import { RefreshCw, Settings2 } from 'lucide-react';
import { useSWRConfig } from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiGet } from '@/hooks/use-api';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from 'sonner';

type ModoRenovacion = 'MANUAL' | 'AUTOMATICO';
type ProgramacionRenovacion = 'ULTIMO_DIA_MES' | 'PRIMER_LUNES_HABIL';
interface EstadoRenovacion {
  modo: ModoRenovacion;
  programacion: ProgramacionRenovacion;
  proximaEjecucion: string | null;
  proximoPeriodo: string | null;
  ultimaRenovacion: { periodo: string; finalizadaEn: string | null; renovadas: number } | null;
}
interface VistaPreviaRenovacion { periodo: string; cantidadEstimada: number; estadoPeriodo: string; }

export function RenovacionConfig() {
  const token = useAuthStore((s) => s.token);
  const { mutate } = useSWRConfig();
  const [modoDialog, setModoDialog] = useState(false);
  const [accionConfiguracion, setAccionConfiguracion] = useState<'modo' | 'programacion'>('modo');
  const [ejecutarDialog, setEjecutarDialog] = useState(false);
  const [programacion, setProgramacion] = useState<ProgramacionRenovacion>('ULTIMO_DIA_MES');
  const [renovando, setRenovando] = useState(false);
  const { data: renovacion, mutate: actualizarRenovacion } = useApiGet<EstadoRenovacion>('/renovaciones/estado');
  const { data: vistaPrevia, mutate: actualizarVistaPrevia } = useApiGet<VistaPreviaRenovacion>(
    renovacion?.modo === 'MANUAL' ? '/renovaciones/vista-previa' : null,
  );
  const { data: proximaSeleccionada } = useApiGet<{ fecha: string; periodo: string }>(
    modoDialog ? `/renovaciones/proxima?programacion=${programacion}` : null,
  );
  function formatFechaRenovacion(iso: string | null) {
    return iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }) : 'Sin renovaciones registradas';
  }

  async function confirmarModo() {
    if (!renovacion) return;
    setRenovando(true);
    try {
      const modo = accionConfiguracion === 'modo'
        ? renovacion.modo === 'MANUAL' ? 'AUTOMATICO' : 'MANUAL'
        : renovacion.modo;
      await api('/renovaciones/configuracion', { method: 'PATCH', token: token!, body: JSON.stringify({ modo, programacion }) });
      toast.success('Configuración de renovación actualizada');
      setModoDialog(false);
      await actualizarRenovacion();
      await actualizarVistaPrevia();
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setRenovando(false); }
  }

  async function ejecutarRenovacion() {
    setRenovando(true);
    try {
      const resultado = await api<{ periodo: string; yaCompletada: boolean; renovados: number; omitidos: number; errores: number }>('/renovaciones/ejecutar', { method: 'POST', token: token! });
      toast.success(resultado.yaCompletada ? `El período ${resultado.periodo} ya estaba renovado` : `${resultado.renovados} inscripciones renovadas para ${resultado.periodo}`);
      setEjecutarDialog(false);
      await Promise.all([actualizarRenovacion(), actualizarVistaPrevia(), mutate((key) =>
        Array.isArray(key) && typeof key[0] === 'string' &&
        ['/inscripciones', '/reportes', '/alumnos', '/config'].some((prefix) => key[0].startsWith(prefix)),
      )]);
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setRenovando(false); }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Renovación mensual</CardTitle>
        </CardHeader>
        <CardContent>
      {renovacion && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${renovacion.modo === 'MANUAL' ? 'bg-sky-400/15 text-sky-300' : 'bg-amber-300/15 text-amber-300'}`}>
                  {renovacion.modo === 'MANUAL' ? 'Manual' : 'Automático'}
                </span>
                <span className="text-sm text-cefide-muted">Última renovación: {formatFechaRenovacion(renovacion.ultimaRenovacion?.finalizadaEn ?? null)}</span>
              </div>
              {renovacion.modo === 'AUTOMATICO' && <p className="text-sm text-cefide-muted">{renovacion.programacion === 'ULTIMO_DIA_MES' ? 'Último día del mes' : 'Domingo previo al primer lunes del mes'} · Próxima: {formatFechaRenovacion(renovacion.proximaEjecucion)}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {renovacion.modo === 'MANUAL' && <Button onClick={() => setEjecutarDialog(true)} disabled={renovando || !vistaPrevia || vistaPrevia.estadoPeriodo === 'COMPLETADA'}><RefreshCw className="mr-2 h-4 w-4" />Ejecutar renovación</Button>}
              {renovacion.modo === 'AUTOMATICO' && <Button variant="outline" onClick={() => { setAccionConfiguracion('programacion'); setProgramacion(renovacion.programacion); setModoDialog(true); }} disabled={renovando}><Settings2 className="mr-2 h-4 w-4" />Cambiar programación</Button>}
              <Button variant="outline" onClick={() => { setAccionConfiguracion('modo'); setProgramacion(renovacion.programacion); setModoDialog(true); }} disabled={renovando}><Settings2 className="mr-2 h-4 w-4" />Cambiar a {renovacion.modo === 'MANUAL' ? 'automático' : 'manual'}</Button>
            </div>
          </div>
      )}
        </CardContent>
      </Card>

      <Dialog open={modoDialog} onOpenChange={(open) => !renovando && setModoDialog(open)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{accionConfiguracion === 'modo' ? 'Cambiar modo de renovación' : 'Cambiar programación automática'}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            {accionConfiguracion === 'modo' && <p>Modo actual: <strong>{renovacion?.modo === 'MANUAL' ? 'Manual' : 'Automático'}</strong>. El nuevo modo será <strong>{renovacion?.modo === 'MANUAL' ? 'Automático' : 'Manual'}</strong>.</p>}
            {(accionConfiguracion === 'programacion' || renovacion?.modo === 'MANUAL') && <div className="space-y-2"><label className="text-cefide-muted">Programación automática</label><Select value={programacion} onValueChange={(v) => setProgramacion(v as ProgramacionRenovacion)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ULTIMO_DIA_MES">Último día del mes, 23:59</SelectItem><SelectItem value="PRIMER_LUNES_HABIL">Domingo previo al primer lunes, 23:59</SelectItem></SelectContent></Select><p className="text-cefide-muted">Próxima ejecución: {formatFechaRenovacion(proximaSeleccionada?.fecha ?? null)}</p></div>}
            <p className="text-cefide-muted">El cambio queda registrado con tu usuario, fecha y hora.</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModoDialog(false)} disabled={renovando}>Cancelar</Button><Button onClick={confirmarModo} disabled={renovando}>{renovando ? 'Guardando...' : accionConfiguracion === 'modo' ? 'Confirmar cambio' : 'Confirmar programación'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ejecutarDialog} onOpenChange={(open) => !renovando && setEjecutarDialog(open)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar renovación mensual</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <p>Se generará el período <strong>{vistaPrevia?.periodo ?? '—'}</strong> y se procesarán aproximadamente <strong>{vistaPrevia?.cantidadEstimada ?? 0}</strong> inscripciones activas.</p>
            <p className="text-cefide-muted">La operación restablece clases y marca las inscripciones como pendientes de pago. No puede ejecutarse dos veces para el mismo período.</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEjecutarDialog(false)} disabled={renovando}>Cancelar</Button><Button onClick={ejecutarRenovacion} disabled={renovando || !vistaPrevia || vistaPrevia.estadoPeriodo === 'COMPLETADA'}>{renovando ? 'Procesando...' : 'Confirmar renovación'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
