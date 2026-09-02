import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApiGet } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { Actividad } from '@/types';
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';

export function ActividadesPage() {
  const token = useAuthStore((s) => s.token);
  const { data: actividades, mutate } = useApiGet<Actividad[]>('/actividades');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editActividad, setEditActividad] = useState<Actividad | null>(null);
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('nombre');
  const [sortOrder, setSortOrder] = useState<SortDirection>('asc');

  function handleSort(field: string) {
    setSortOrder((current) => sortBy === field && current === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  }

  const sorted = [...(actividades ?? [])].sort((a, b) => {
    const values: Record<string, [string | number | boolean, string | number | boolean]> = {
      nombre: [a.nombre, b.nombre],
      inscriptos: [a._count?.inscripciones ?? 0, b._count?.inscripciones ?? 0],
      estado: [a.activo, b.activo],
    };
    const [left, right] = values[sortBy] ?? values.nombre;
    const result = typeof left === 'string' ? left.localeCompare(String(right), 'es') : Number(left) - Number(right);
    return sortOrder === 'asc' ? result : -result;
  });
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  function openNew() {
    setEditActividad(null);
    setNombre('');
    setError('');
    setDialogOpen(true);
  }

  function openEdit(a: Actividad) {
    setEditActividad(a);
    setNombre(a.nombre);
    setError('');
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!nombre.trim()) return;
    setSaving(true);
    setError('');

    try {
      if (editActividad) {
        await api(`/actividades/${editActividad.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ nombre }),
          token: token!,
        });
      } else {
        await api('/actividades', {
          method: 'POST',
          body: JSON.stringify({ nombre }),
          token: token!,
        });
      }
      mutate();
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function eliminarActividad(a: Actividad) {
    const inscriptos = a._count?.inscripciones ?? 0;
    const aviso = inscriptos
      ? `\n\nTiene ${inscriptos} inscripción${inscriptos !== 1 ? 'es' : ''}: se borran junto a sus pagos e ingresos.`
      : '';
    const ok = window.confirm(
      `¿Eliminar la actividad "${a.nombre}"?${aviso}\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;
    await api(`/actividades/${a.id}`, { method: 'DELETE', token: token! });
    mutate();
  }

  async function toggleActivo(a: Actividad) {
    await api(`/actividades/${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ activo: !a.activo }),
      token: token!,
    });
    mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Actividades</h2>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Actividad
        </Button>
      </div>

      <div className="rounded-lg border border-cefide-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cefide-surface">
            <tr className="border-b border-cefide-border">
              <SortableHeader label="Nombre" field="nombre" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Inscriptos" field="inscriptos" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Estado" field="estado" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <th className="px-4 py-3 text-right font-medium text-cefide-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((a) => (
              <tr key={a.id} className="border-b border-cefide-border hover:bg-cefide-surface/50 transition-colors">
                <td className="px-4 py-3 font-medium">{a.nombre}</td>
                <td className="px-4 py-3 text-center text-cefide-muted">
                  {a._count?.inscripciones ?? 0}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={a.activo ? 'success' : 'muted'}>
                    {a.activo ? 'Activa' : 'Inactiva'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo(a)}>
                      {a.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => eliminarActividad(a)}
                      title="Eliminar actividad"
                    >
                      <Trash2 className="h-4 w-4 text-cefide-accent-alt" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {actividades?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-cefide-muted">
                  No hay actividades. Crear la primera.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {actividades && <PaginationControls page={page} totalPages={totalPages} total={actividades.length} pageSize={pageSize} itemLabel="actividad" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}

      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editActividad ? 'Editar Actividad' : 'Nueva Actividad'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Pilates, Spinning, Escalada..."
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              />
            </div>
            {error && <p className="text-sm text-cefide-accent-alt">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : editActividad ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
