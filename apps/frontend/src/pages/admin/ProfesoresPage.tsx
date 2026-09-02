import { useState } from 'react';
import { Plus, Trash2, Mail, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApiGet } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { ProfesorFormDialog } from './ProfesorFormDialog';
import type { Profesor } from '@/types';
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';

export function ProfesoresPage() {
  const token = useAuthStore((s) => s.token);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewProfesor, setViewProfesor] = useState<Profesor | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('nombre');
  const [sortOrder, setSortOrder] = useState<SortDirection>('asc');

  const { data: profesores, mutate } = useApiGet<Profesor[]>('/profesores');

  const total = profesores?.length ?? 0;
  function handleSort(field: string) {
    setSortOrder((current) => sortBy === field && current === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  }
  const sorted = [...(profesores ?? [])].sort((a, b) => {
    const values: Record<string, [string | number, string | number]> = {
      dni: [a.dni, b.dni], nombre: [`${a.apellido} ${a.nombre}`, `${b.apellido} ${b.nombre}`],
      email: [a.usuario?.email ?? '', b.usuario?.email ?? ''], alumnos: [a._count?.alumnos ?? 0, b._count?.alumnos ?? 0],
    };
    const [left, right] = values[sortBy] ?? values.nombre;
    const result = typeof left === 'string' ? left.localeCompare(String(right), 'es') : left - Number(right);
    return sortOrder === 'asc' ? result : -result;
  });
  const totalPages = Math.ceil(total / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  async function handleDelete(profesor: Profesor) {
    if (!confirm(`¿Eliminar a ${profesor.nombre} ${profesor.apellido}? Solo es posible si no tiene alumnos asignados.`)) return;

    try {
      await api(`/profesores/${profesor.id}`, {
        method: 'DELETE',
        token: token!,
      });
      mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Profesores</h2>
        <Button onClick={() => { setViewProfesor(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Profesor
        </Button>
      </div>

      <div className="rounded-lg border border-cefide-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cefide-surface">
            <tr className="border-b border-cefide-border">
              <SortableHeader label="DNI" field="dni" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Nombre" field="nombre" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Alumnos" field="alumnos" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <th className="px-4 py-3 text-right font-medium text-cefide-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((profesor) => (
              <tr
                key={profesor.id}
                className="border-b border-cefide-border hover:bg-cefide-surface/50 transition-colors"
              >
                <td className="px-4 py-3 font-mono">{profesor.dni}</td>
                <td className="px-4 py-3">
                  {profesor.apellido}, {profesor.nombre}
                </td>
                <td className="px-4 py-3">
                  {profesor.usuario ? (
                    <span className="flex items-center gap-1 text-cefide-muted">
                      <Mail className="h-3 w-3" />
                      {profesor.usuario.email}
                    </span>
                  ) : (
                    <Badge variant="muted">Sin cuenta</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-center font-mono">
                  {profesor._count?.alumnos ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setViewProfesor(profesor); setDialogOpen(true); }}
                      title="Editar profesor"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(profesor)}
                      title="Eliminar profesor"
                    >
                      <Trash2 className="h-4 w-4 text-cefide-accent-alt" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {total === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-cefide-muted">
                  No hay profesores registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {profesores && <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel="profesor" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}

      <ProfesorFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => mutate()}
        profesor={viewProfesor}
      />
    </div>
  );
}
