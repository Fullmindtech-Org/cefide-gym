import { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiGet } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { PaginatedResponse } from '@/types';
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';

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
}

export function PagosLogPage() {
  const token = useAuthStore((s) => s.token);
  const [search, setSearch] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('fecha');
  const [sortOrder, setSortOrder] = useState<SortDirection>('desc');

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
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

  async function eliminarPago(pago: Pago) {
    const ok = window.confirm(
      '¿Eliminar este registro del historial de pagos?\n\n' +
        'Solo borra el registro del log; no modifica la inscripción. Esta acción no se puede deshacer.',
    );
    if (!ok) return;
    await api(`/reportes/pagos/${pago.id}`, { method: 'DELETE', token: token! });
    mutate();
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Historial de Pagos</h2>

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
                  >
                    <Trash2 className="h-4 w-4 text-cefide-accent-alt" />
                  </Button>
                </td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-cefide-muted">
                  No se encontraron pagos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && <PaginationControls page={page} totalPages={data.totalPages} total={data.total} pageSize={pageSize} itemLabel="registro" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}
    </div>
  );
}
