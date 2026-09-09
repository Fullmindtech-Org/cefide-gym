import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApiGet } from '@/hooks/use-api';
import type { Profesor, PaginatedResponse } from '@/types';
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';

interface Ingreso {
  id: string;
  fechaHora: string;
  estado: 'VERDE' | 'AMARILLO' | 'ROJO';
  molinete: number;
  alumno: {
    dni: string;
    nombre: string;
    apellido: string;
    profesor: { nombre: string; apellido: string } | null;
  };
}

const estadoBadge = {
  VERDE: 'success' as const,
  AMARILLO: 'warning' as const,
  ROJO: 'destructive' as const,
};

export function IngresosLogPage() {
  const [search, setSearch] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterProfesor, setFilterProfesor] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('fecha');
  const [sortOrder, setSortOrder] = useState<SortDirection>('desc');

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if (filterEstado !== 'all') params.set('estado', filterEstado);
  if (filterProfesor !== 'all') params.set('profesorId', filterProfesor);
  params.set('page', String(page));
  params.set('limit', String(pageSize));
  params.set('sortBy', sortBy);
  params.set('sortOrder', sortOrder);

  function handleSort(field: string) {
    setSortOrder((current) => sortBy === field && current === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  }

  const { data } = useApiGet<PaginatedResponse<Ingreso>>(
    `/ingresos?${params.toString()}`,
    { refreshInterval: 15000 },
  );
  const { data: profesores } = useApiGet<Profesor[]>('/profesores');

  const ingresos = sortBy === 'profesor'
    ? [...(data?.data ?? [])].sort((a, b) => {
        const left = a.alumno.profesor ? `${a.alumno.profesor.apellido} ${a.alumno.profesor.nombre}` : '';
        const right = b.alumno.profesor ? `${b.alumno.profesor.apellido} ${b.alumno.profesor.nombre}` : '';
        const result = left.localeCompare(right, 'es');
        return sortOrder === 'asc' ? result : -result;
      })
    : data?.data;

  function formatFecha(iso: string) {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Log de Ingresos</h2>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cefide-muted" />
          <Input
            placeholder="Buscar por DNI o nombre..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Input
          type="date"
          value={desde}
          onChange={(e) => { setDesde(e.target.value); setPage(1); }}
          className="w-[160px]"
          placeholder="Desde"
        />
        <Input
          type="date"
          value={hasta}
          onChange={(e) => { setHasta(e.target.value); setPage(1); }}
          className="w-[160px]"
          placeholder="Hasta"
        />
        <Select value={filterEstado} onValueChange={(v) => { setFilterEstado(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="VERDE">Verde</SelectItem>
            <SelectItem value="AMARILLO">Amarillo</SelectItem>
            <SelectItem value="ROJO">Rojo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterProfesor} onValueChange={(v) => { setFilterProfesor(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Profesor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {profesores?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.apellido}, {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-cefide-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cefide-surface">
            <tr className="border-b border-cefide-border">
              <SortableHeader label="Fecha/Hora" field="fecha" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="DNI" field="dni" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Nombre" field="nombre" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Profesor" field="profesor" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Estado" field="estado" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Molinete" field="molinete" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
            </tr>
          </thead>
          <tbody>
            {ingresos?.map((ing) => (
              <tr key={ing.id} className="border-b border-cefide-border hover:bg-cefide-surface/50">
                <td className="px-4 py-3 font-mono text-xs">{formatFecha(ing.fechaHora)}</td>
                <td className="px-4 py-3 font-mono">{ing.alumno.dni}</td>
                <td className="px-4 py-3">{ing.alumno.apellido}, {ing.alumno.nombre}</td>
                <td className="px-4 py-3 text-cefide-muted">
                  {ing.alumno.profesor
                    ? `${ing.alumno.profesor.apellido}, ${ing.alumno.profesor.nombre}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={estadoBadge[ing.estado]}>{ing.estado}</Badge>
                </td>
                <td className="px-4 py-3 text-center font-mono">{ing.molinete}</td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-cefide-muted">
                  No se encontraron ingresos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {data && <PaginationControls page={page} totalPages={data.totalPages} total={data.total} pageSize={pageSize} itemLabel="ingreso" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}
    </div>
  );
}
