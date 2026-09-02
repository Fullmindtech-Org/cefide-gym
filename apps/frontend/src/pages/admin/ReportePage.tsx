import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { FRECUENCIA_LABEL } from '@/types';
import type { Actividad } from '@/types';
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';

interface ReporteInscripcion {
  dni: string;
  nombre: string;
  apellido: string;
  actividad: string;
  frecuencia: string;
  clasesTotal: number;
  clasesUsadas: number;
  clasesRestantes: number;
  pagado: boolean;
  fechaPago: string | null;
}

export function ReportePage() {
  const token = useAuthStore((s) => s.token);
  const [filterActividad, setFilterActividad] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('nombre');
  const [sortOrder, setSortOrder] = useState<SortDirection>('asc');

  const { data: actividades } = useApiGet<Actividad[]>('/actividades');

  const params = new URLSearchParams();
  if (filterActividad !== 'all') params.set('actividadId', filterActividad);

  const { data } = useApiGet<ReporteInscripcion[]>(
    `/reportes/actividad?${params.toString()}`,
  );

  const total = data?.length ?? 0;
  function handleSort(field: string) {
    setSortOrder((current) => sortBy === field && current === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  }
  const sorted = [...(data ?? [])].sort((a, b) => {
    const estado = (item: ReporteInscripcion) => item.pagado && item.clasesRestantes > 0 ? 2 : !item.pagado && item.clasesRestantes > 0 ? 1 : 0;
    const values: Record<string, [string | number | boolean, string | number | boolean]> = {
      dni: [a.dni, b.dni], nombre: [`${a.apellido} ${a.nombre}`, `${b.apellido} ${b.nombre}`], actividad: [a.actividad, b.actividad],
      frecuencia: [a.frecuencia, b.frecuencia], realizadas: [a.clasesUsadas, b.clasesUsadas], restantes: [a.clasesRestantes, b.clasesRestantes],
      pago: [a.pagado, b.pagado], estado: [estado(a), estado(b)],
    };
    const [left, right] = values[sortBy] ?? values.nombre;
    const result = typeof left === 'string' ? left.localeCompare(String(right), 'es') : Number(left) - Number(right);
    return sortOrder === 'asc' ? result : -result;
  });
  const totalPages = Math.ceil(total / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  function handleExportCsv() {
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

  function getEstadoBadge(item: ReporteInscripcion) {
    if (item.pagado && item.clasesRestantes > 0) return <Badge variant="success">VERDE</Badge>;
    if (!item.pagado && item.clasesRestantes > 0) return <Badge variant="warning">AMARILLO</Badge>;
    return <Badge variant="destructive">ROJO</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Reporte de Actividad</h2>
        <Button onClick={handleExportCsv}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

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

      <div className="rounded-lg border border-cefide-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cefide-surface">
            <tr className="border-b border-cefide-border">
              <SortableHeader label="DNI" field="dni" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Nombre" field="nombre" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
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
                <td className="px-4 py-3">{item.actividad}</td>
                <td className="px-4 py-3 text-center text-cefide-muted">
                  {FRECUENCIA_LABEL[item.frecuencia as keyof typeof FRECUENCIA_LABEL] ?? item.frecuencia}
                </td>
                <td className="px-4 py-3 text-center font-mono">{item.clasesUsadas}</td>
                <td className="px-4 py-3 text-center font-mono">{item.clasesRestantes}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={item.pagado ? 'success' : 'destructive'}>
                    {item.pagado ? 'Sí' : 'No'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">{getEstadoBadge(item)}</td>
              </tr>
            ))}
            {total === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-cefide-muted">Sin datos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel="inscripción" pluralLabel="inscripciones" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}
    </div>
  );
}
