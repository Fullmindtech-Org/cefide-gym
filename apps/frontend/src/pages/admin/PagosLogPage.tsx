import { useState } from 'react';
import { RefreshCw, Search, Settings2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiGet } from '@/hooks/use-api';
import { api, getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import type { PaginatedResponse } from '@/types';
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Pago {
  id: string;
  tipo: 'PAGO' | 'ANULACION';
  fecha: string;
  nota: string | null;
  alumno: {
    dni: string;
    nombre: string;
    apellido: string;
  };
  inscripcion: { actividad: { nombre: string } } | null;
}

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
interface EstadisticasPagos { pagos: number; anulaciones: number; }

export function PagosLogPage() {
  const token = useAuthStore((s) => s.token);
  const [search, setSearch] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('fecha');
  const [sortOrder, setSortOrder] = useState<SortDirection>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modoDialog, setModoDialog] = useState(false);
  const [accionConfiguracion, setAccionConfiguracion] = useState<'modo' | 'programacion'>('modo');
  const [ejecutarDialog, setEjecutarDialog] = useState(false);
  const [programacion, setProgramacion] = useState<ProgramacionRenovacion>('ULTIMO_DIA_MES');
  const [renovando, setRenovando] = useState(false);

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if (periodo) params.set('periodo', periodo);
  params.set('page', String(page));
  params.set('limit', String(pageSize));
  params.set('sortBy', sortBy);
  params.set('sortOrder', sortOrder);

  function handleSort(field: string) {
    setSortOrder((current) => sortBy === field && current === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  }

  const { data, mutate } = useApiGet<PaginatedResponse<Pago>>(
    `/reportes/pagos?${params.toString()}`,
  );
  const { data: renovacion, mutate: actualizarRenovacion } = useApiGet<EstadoRenovacion>('/renovaciones/estado');
  const { data: periodosDisponibles } = useApiGet<string[]>('/reportes/pagos/periodos');
  const { data: estadisticasPagos } = useApiGet<EstadisticasPagos>(
    `/reportes/pagos/estadisticas${periodo ? `?periodo=${periodo}` : ''}`,
  );
  const { data: vistaPrevia, mutate: actualizarVistaPrevia } = useApiGet<VistaPreviaRenovacion>(
    renovacion?.modo === 'MANUAL' ? '/renovaciones/vista-previa' : null,
  );
  const { data: proximaSeleccionada } = useApiGet<{ fecha: string; periodo: string }>(
    modoDialog ? `/renovaciones/proxima?programacion=${programacion}` : null,
  );

  async function eliminarPago(pago: Pago) {
    const ok = window.confirm(
      '¿Eliminar este registro del historial de pagos?\n\n' +
        'Solo borra el registro del log; no modifica la inscripción. Esta acción no se puede deshacer.',
    );
    if (!ok) return;
    if (deletingId) return;
    setDeletingId(pago.id);
    try {
      await api(`/reportes/pagos/${pago.id}`, { method: 'DELETE', token: token! });
      toast.success('Registro eliminado');
      void mutate();
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setDeletingId(null); }
  }

  function formatFecha(iso: string) {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatMes(iso: string) {
    return new Intl.DateTimeFormat('es-AR', { month: '2-digit', year: 'numeric' }).format(new Date(iso));
  }

  function formatPeriodo(periodoPago: string) {
    const [year, month] = periodoPago.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1, 12))
      .replace(/^./, (letter) => letter.toUpperCase());
  }

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
      await Promise.all([actualizarRenovacion(), actualizarVistaPrevia(), mutate()]);
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setRenovando(false); }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Historial de Pagos</h2>

      {renovacion && (
        <section className="rounded-lg border border-cefide-border bg-cefide-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${renovacion.modo === 'MANUAL' ? 'bg-sky-400/15 text-sky-300' : 'bg-amber-300/15 text-amber-300'}`}>
                  {renovacion.modo === 'MANUAL' ? 'Manual' : 'Automático'}
                </span>
                <span className="text-sm text-cefide-muted">Última renovación: {formatFechaRenovacion(renovacion.ultimaRenovacion?.finalizadaEn ?? null)}</span>
              </div>
              {renovacion.modo === 'AUTOMATICO' && <p className="text-sm text-cefide-muted">{renovacion.programacion === 'ULTIMO_DIA_MES' ? 'Último día del mes' : 'Domingo previo al primer lunes del mes'} · Próxima: {formatFechaRenovacion(renovacion.proximaEjecucion)}</p>}
            </div>
            <div className="flex gap-2">
              {renovacion.modo === 'MANUAL' && <Button onClick={() => setEjecutarDialog(true)} disabled={renovando || vistaPrevia?.estadoPeriodo === 'COMPLETADA'}><RefreshCw className="mr-2 h-4 w-4" />Ejecutar renovación</Button>}
              {renovacion.modo === 'AUTOMATICO' && <Button variant="outline" onClick={() => { setAccionConfiguracion('programacion'); setProgramacion(renovacion.programacion); setModoDialog(true); }} disabled={renovando}><Settings2 className="mr-2 h-4 w-4" />Cambiar programación</Button>}
              <Button variant="outline" onClick={() => { setAccionConfiguracion('modo'); setProgramacion(renovacion.programacion); setModoDialog(true); }} disabled={renovando}><Settings2 className="mr-2 h-4 w-4" />Cambiar a {renovacion.modo === 'MANUAL' ? 'automático' : 'manual'}</Button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-cefide-border bg-cefide-surface px-4 py-3">
          <p className="text-xs font-medium text-cefide-muted">Pagos registrados{periodo ? ` · ${formatPeriodo(periodo)}` : ''}</p>
          <p className="mt-1 text-2xl font-semibold text-cefide-success">{estadisticasPagos?.pagos ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-cefide-border bg-cefide-surface px-4 py-3">
          <p className="text-xs font-medium text-cefide-muted">Anulaciones{periodo ? ` · ${formatPeriodo(periodo)}` : ''}</p>
          <p className="mt-1 text-2xl font-semibold text-cefide-muted">{estadisticasPagos?.anulaciones ?? '—'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cefide-muted" />
          <Input
            placeholder="Buscar por DNI, nombre, apellido, teléfono o dirección..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={periodo || 'todos'} onValueChange={(value) => { setPeriodo(value === 'todos' ? '' : value); setPage(1); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos los períodos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los períodos</SelectItem>
            {periodosDisponibles?.map((periodoDisponible) => (
              <SelectItem key={periodoDisponible} value={periodoDisponible}>{formatPeriodo(periodoDisponible)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={desde}
          onChange={(e) => { setDesde(e.target.value); setPage(1); }}
          className="w-[160px]"
          title="Desde"
        />
        <Input
          type="date"
          value={hasta}
          onChange={(e) => { setHasta(e.target.value); setPage(1); }}
          className="w-[160px]"
          title="Hasta"
        />
      </div>

      <div className="rounded-lg border border-cefide-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cefide-surface">
            <tr className="border-b border-cefide-border">
              <SortableHeader label="Fecha" field="fecha" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="DNI" field="dni" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Alumno" field="alumno" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">Actividad</th>
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">Mes registrado</th>
              <SortableHeader label="Tipo" field="tipo" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <th className="px-4 py-3 text-right font-medium text-cefide-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((pago) => (
              <tr
                key={pago.id}
                className="border-b border-cefide-border hover:bg-cefide-surface/50 transition-colors"
              >
                <td className="px-4 py-3 text-cefide-muted">{formatFecha(pago.fecha)}</td>
                <td className="px-4 py-3 font-mono">{pago.alumno.dni}</td>
                <td className="px-4 py-3">{pago.alumno.apellido}, {pago.alumno.nombre}</td>
                <td className="px-4 py-3">{pago.inscripcion?.actividad.nombre ?? 'Sin actividad'}</td>
                <td className="px-4 py-3">{formatMes(pago.fecha)}</td>
                <td className="px-4 py-3 text-center">
                  {pago.tipo === 'PAGO' ? (
                    <Badge variant="success">Pago</Badge>
                  ) : (
                    <Badge variant="destructive">Anulación</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => eliminarPago(pago)}
                    title="Eliminar registro"
                    disabled={deletingId === pago.id}
                  >
                    <Trash2 className="h-4 w-4 text-cefide-accent-alt" />
                  </Button>
                </td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-cefide-muted">
                  No se encontraron pagos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && <PaginationControls page={page} totalPages={data.totalPages} total={data.total} pageSize={pageSize} itemLabel="registro" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}

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
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEjecutarDialog(false)} disabled={renovando}>Cancelar</Button><Button onClick={ejecutarRenovacion} disabled={renovando}>{renovando ? 'Procesando...' : 'Confirmar renovación'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
