import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatoPeriodoArgentina, periodoActualArgentina } from '@/lib/fecha-argentina';
import { getApiErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApiGet } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { config } from '@/config/env';
import { toast } from 'sonner';
import { FRECUENCIA_LABEL } from '@/types';
import type { Actividad } from '@/types';
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';

interface ReporteInscripcion {
  dni: string;
  nombre: string;
  apellido: string;
  actividad: string;
  frecuencia: string;
  clasesTotal: number | null;
  clasesUsadas: number | null;
  clasesRestantes: number | null;
  pagado: boolean;
  fechaPago: string | null;
  telefono?: string | null;
}

export function ReportePage() {
  const token = useAuthStore((s) => s.token);
  const [reporte, setReporte] = useState<'actividad' | 'deudores'>('actividad');
  const [filterActividad, setFilterActividad] = useState('all');
  const periodoActual = periodoActualArgentina();
  const [periodo, setPeriodo] = useState(periodoActualArgentina);
  const [exportando, setExportando] = useState(false);
  const historico = reporte === 'deudores' && periodo !== periodoActual;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('nombre');
  const [sortOrder, setSortOrder] = useState<SortDirection>('asc');

  const { data: actividades } = useApiGet<Actividad[]>('/actividades');
  const { data: periodosDisponibles } = useApiGet<string[]>(
    reporte === 'deudores' ? '/reportes/deudores/periodos' : null,
  );
  const periodos = Array.from(new Set([periodoActual, periodo, ...(periodosDisponibles ?? [])]))
    .filter((value) => value <= periodoActual).sort().reverse();

  const params = new URLSearchParams();
  if (filterActividad !== 'all') params.set('actividadId', filterActividad);

  if (historico) params.set('periodo', periodo);

  const { data, error, isLoading } = useApiGet<ReporteInscripcion[]>(
    `/reportes/${reporte === 'actividad' ? 'actividad' : 'deudores'}?${params.toString()}`,
    { keepPreviousData: false },
  );

  const total = data?.length ?? 0;
  function handleSort(field: string) {
    setSortOrder((current) => sortBy === field && current === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  }
  const sorted = [...(data ?? [])].sort((a, b) => {
    const estado = (item: ReporteInscripcion) => item.pagado && (item.clasesRestantes ?? 0) > 0 ? 2 : !item.pagado && (item.clasesRestantes ?? 0) > 0 ? 1 : 0;
    const values: Record<string, [string | number | boolean, string | number | boolean]> = {
      dni: [a.dni, b.dni], nombre: [`${a.apellido} ${a.nombre}`, `${b.apellido} ${b.nombre}`], actividad: [a.actividad, b.actividad],
      frecuencia: [a.frecuencia, b.frecuencia], realizadas: [a.clasesUsadas ?? -1, b.clasesUsadas ?? -1], restantes: [a.clasesRestantes ?? -1, b.clasesRestantes ?? -1],
      pago: [a.pagado, b.pagado], estado: [estado(a), estado(b)],
    };
    const [left, right] = values[sortBy] ?? values.nombre;
    const result = typeof left === 'string' ? left.localeCompare(String(right), 'es') : Number(left) - Number(right);
    return sortOrder === 'asc' ? result : -result;
  });
  const totalPages = Math.ceil(total / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  function handleExportCsv() {
    toast.info('Preparando la descarga...');
    const csvParams = new URLSearchParams();
    if (filterActividad !== 'all') csvParams.set('actividadId', filterActividad);

    const url = `${config.apiBase}/reportes/actividad/csv?${csvParams.toString()}`;
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `reporte-cefide-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  }

  async function handleExportDeudores(formato: 'csv' | 'excel') {
    setExportando(true);
    toast.info('Preparando la descarga...');
    const extension = formato === 'excel' ? 'xls' : 'csv';
    const fecha = historico ? periodo : new Date().toISOString().split('T')[0];
    try {
      const res = await fetch(`${config.apiBase}/reportes/deudores/${formato}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo generar el reporte. Revisá el mes seleccionado y volvé a intentar.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-deudores-${fecha}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setExportando(false);
    }
  }

  function getEstadoBadge(item: ReporteInscripcion) {
    if (historico) return <Badge variant="muted">{item.frecuencia === 'BECADO' ? 'Becado: revisar' : 'Sin pago registrado'}</Badge>;
    if (item.pagado && (item.clasesRestantes ?? 0) > 0) return <Badge variant="success">VERDE</Badge>;
    if (!item.pagado && (item.clasesRestantes ?? 0) > 0) return <Badge variant="warning">AMARILLO</Badge>;
    return <Badge variant="destructive">ROJO</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Reportes</h2>
        {reporte === 'actividad' && <Button onClick={handleExportCsv}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>}
        {reporte === 'deudores' && <div className="flex flex-wrap gap-2">
          <Button disabled={isLoading || !!error || exportando} onClick={() => void handleExportDeudores('csv')}>
            <Download className="mr-2 h-4 w-4" />Exportar CSV
          </Button>
          <Button disabled={isLoading || !!error || exportando} onClick={() => void handleExportDeudores('excel')}>
            <Download className="mr-2 h-4 w-4" />Exportar Excel
          </Button>
        </div>}
      </div>

      <div className="flex gap-2 border-b border-cefide-border">
        <Button variant={reporte === 'actividad' ? 'default' : 'ghost'} onClick={() => { setReporte('actividad'); setPage(1); }}>
          Actividad
        </Button>
        <Button variant={reporte === 'deudores' ? 'default' : 'ghost'} onClick={() => { setReporte('deudores'); setPage(1); }}>
          Reporte de deudores
        </Button>
      </div>

      {reporte === 'deudores' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="periodo-deudores" className="text-sm font-medium">Período</label>
              <Select value={periodo} onValueChange={(value) => { setPeriodo(value); setPage(1); }}>
                <SelectTrigger id="periodo-deudores" className="w-[250px]" aria-label="Período de deudores">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodos.map((value) => (
                    <SelectItem key={value} value={value}>{formatoPeriodoArgentina(value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {historico ? (
            <div className="rounded-lg border border-cefide-border bg-cefide-surface p-3 text-sm text-cefide-muted space-y-1">
              <p>Mes consultado: <strong>{formatoPeriodoArgentina(periodo)}</strong>. Inscripciones con al menos un ingreso permitido a esa actividad y sin pago vigente registrado en ese mes, considerando el último pago o anulación en horario de Argentina.</p>
              <p>Se usan alumnos actualmente activos e inscripciones creadas antes del cierre del mes. La actividad y la frecuencia son las actuales. Las clases históricas no están disponibles.</p>
              <p>Se excluyen las inscripciones sin asistencia. Los becados requieren revisión antes de reclamar deuda. Los pagos de otros meses no se imputan a este período.</p>
            </div>
          ) : <p className="text-sm text-cefide-muted">Inscripciones activas sin pago registrado y con clases realizadas mayores a cero. Elegí un mes anterior para consultar el historial.</p>}
        </div>
      )}

      <Select value={filterActividad} onValueChange={(v) => { setFilterActividad(v); setPage(1); }}>
        <SelectTrigger className="w-[250px]">
          <SelectValue placeholder="Todas las actividades" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las actividades</SelectItem>
          {actividades?.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && <p className="text-sm text-cefide-muted" role="status">Cargando reporte...</p>}
      {error && <p className="text-sm text-cefide-accent-alt" role="alert">No se pudo cargar el reporte. Revisá la conexión y volvé a intentar.</p>}

      <div className="rounded-lg border border-cefide-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cefide-surface">
            <tr className="border-b border-cefide-border">
              <SortableHeader label="DNI" field="dni" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Nombre" field="nombre" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              {reporte === 'deudores' && <th className="px-4 py-3 text-left font-medium text-cefide-muted">Teléfono</th>}
              <SortableHeader label="Actividad" field="actividad" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Frecuencia" field="frecuencia" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Realizadas" field="realizadas" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Restantes" field="restantes" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Pago" field="pago" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Estado" field="estado" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
            </tr>
          </thead>
          <tbody>
            {paginated.map((item, i) => (
              <tr key={`${item.dni}-${item.actividad}-${i}`} className="border-b border-cefide-border hover:bg-cefide-surface/50">
                <td className="px-4 py-3 font-mono">{item.dni}</td>
                <td className="px-4 py-3">{item.apellido}, {item.nombre}</td>
                {reporte === 'deudores' && <td className="px-4 py-3 text-cefide-muted">{item.telefono ?? '—'}</td>}
                <td className="px-4 py-3">{item.actividad}</td>
                <td className="px-4 py-3 text-center text-cefide-muted">
                  {FRECUENCIA_LABEL[item.frecuencia as keyof typeof FRECUENCIA_LABEL] ?? item.frecuencia}
                </td>
                <td className="px-4 py-3 text-center font-mono">{item.clasesUsadas ?? 'No disponible'}</td>
                <td className="px-4 py-3 text-center font-mono">{item.clasesRestantes ?? 'No disponible'}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={item.pagado ? 'success' : 'destructive'}>
                    {item.pagado ? 'Sí' : 'No'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">{getEstadoBadge(item)}</td>
              </tr>
            ))}
            {data && total === 0 && (
              <tr>
                <td colSpan={reporte === 'deudores' ? 9 : 8} className="px-4 py-8 text-center text-cefide-muted">Sin datos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel="inscripción" pluralLabel="inscripciones" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}
    </div>
  );
}
