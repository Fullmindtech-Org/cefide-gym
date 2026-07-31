import { useState } from 'react';
import { Search, Plus, UserX, UserCheck, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { AlumnoFormDialog } from './AlumnoFormDialog';
import type { Alumno, PaginatedResponse } from '@/types';

export function AlumnosPage() {
  const token = useAuthStore((s) => s.token);
  const [search, setSearch] = useState('');
  const [filterActivo, setFilterActivo] = useState('all');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAlumno, setEditAlumno] = useState<Alumno | null>(null);

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (filterActivo !== 'all') params.set('activo', filterActivo);
  params.set('page', String(page));
  params.set('limit', '20');

  const { data, mutate } = useApiGet<PaginatedResponse<Alumno>>(
    `/alumnos?${params.toString()}`,
  );

  async function toggleActivo(alumno: Alumno) {
    const action = alumno.activo ? 'deactivate' : 'activate';
    await api(`/alumnos/${alumno.id}/${action}`, {
      method: 'PATCH',
      token: token!,
    });
    mutate();
  }

  async function eliminarAlumno(alumno: Alumno) {
    const ok = window.confirm(
      `¿Eliminar a ${alumno.apellido}, ${alumno.nombre} (DNI ${alumno.dni})?\n\n` +
        'Se borran también sus inscripciones, pagos e ingresos. Esta acción no se puede deshacer.',
    );
    if (!ok) return;
    await api(`/alumnos/${alumno.id}`, { method: 'DELETE', token: token! });
    mutate();
  }

  function openNew() {
    setEditAlumno(null);
    setDialogOpen(true);
  }

  function openEdit(alumno: Alumno) {
    setEditAlumno(alumno);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Alumnos</h2>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Alumno
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cefide-muted" />
          <Input
            placeholder="Buscar por DNI, nombre, apellido, teléfono o dirección..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={filterActivo}
          onValueChange={(v) => {
            setFilterActivo(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="true">Activos</SelectItem>
            <SelectItem value="false">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-cefide-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cefide-surface">
            <tr className="border-b border-cefide-border">
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">DNI</th>
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">Teléfono</th>
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-cefide-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((alumno) => (
              <tr
                key={alumno.id}
                className="border-b border-cefide-border hover:bg-cefide-surface/50 transition-colors"
              >
                <td className="px-4 py-3 font-mono">{alumno.dni}</td>
                <td className="px-4 py-3">
                  {alumno.apellido}, {alumno.nombre}
                </td>
                <td className="px-4 py-3 text-cefide-muted">
                  {alumno.telefono || '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={alumno.activo ? 'success' : 'muted'}>
                    {alumno.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(alumno)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleActivo(alumno)}
                      title={alumno.activo ? 'Desactivar' : 'Activar'}
                    >
                      {alumno.activo ? (
                        <UserX className="h-4 w-4 text-cefide-accent-alt" />
                      ) : (
                        <UserCheck className="h-4 w-4 text-cefide-success" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => eliminarAlumno(alumno)}
                      title="Eliminar alumno"
                    >
                      <Trash2 className="h-4 w-4 text-cefide-accent-alt" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-cefide-muted">
                  No se encontraron alumnos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-cefide-muted">
            {data.total} alumno{data.total !== 1 ? 's' : ''} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="flex items-center px-3 text-sm text-cefide-muted">
              {page} / {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <AlumnoFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => mutate()}
        alumno={editAlumno}
      />
    </div>
  );
}
