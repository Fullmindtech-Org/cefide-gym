import { useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { Search, Plus, UserX, UserCheck, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';

export function AlumnosPage() {
  const token = useAuthStore((s) => s.token);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [filterActivo, setFilterActivo] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('nombre');
  const [sortOrder, setSortOrder] = useState<SortDirection>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAlumno, setEditAlumno] = useState<Alumno | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Alumno | null>(null);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (filterActivo !== 'all') params.set('activo', filterActivo);
  params.set('page', String(page));
  params.set('limit', String(pageSize));
  params.set('sortBy', sortBy);
  params.set('sortOrder', sortOrder);

  function handleSort(field: string) {
    setSortOrder((current) => sortBy === field && current === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  }

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

  async function doEliminarAlumno() {
    if (!confirmDelete) return;
    await api(`/alumnos/${confirmDelete.id}`, { method: 'DELETE', token: token! });
    setConfirmDelete(null);
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
              <SortableHeader label="DNI" field="dni" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Nombre" field="nombre" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Teléfono" field="telefono" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Estado" field="activo" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
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
                      onClick={() => setConfirmDelete(alumno)}
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

      {data && <PaginationControls page={page} totalPages={data.totalPages} total={data.total} pageSize={pageSize} itemLabel="alumno" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}

      <AlumnoFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => mutate()}
        alumno={editAlumno}
      />

      <Dialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar alumno</DialogTitle>
          </DialogHeader>
          {confirmDelete && (
            <div className="space-y-4">
              <p className="text-sm">
                ¿Eliminar a <strong>{confirmDelete.apellido}, {confirmDelete.nombre}</strong> (DNI {confirmDelete.dni})?
              </p>
              <p className="text-xs text-cefide-muted">
                Se borran también sus inscripciones, pagos e ingresos. Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
                <Button variant="destructive" onClick={doEliminarAlumno}>Eliminar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
