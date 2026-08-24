import { useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { Search, Plus, DollarSign, Check, X, Trash2, Pencil } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useApiGet } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { Actividad, Alumno, InscripcionActividad, PaginatedResponse } from '@/types';
import { FRECUENCIA_LABEL as FL } from '@/types';

interface InscripcionFlat extends InscripcionActividad {
  alumno: { id: string; dni: string; nombre: string; apellido: string; activo: boolean };
}

interface NuevaInscripcionForm {
  alumnoId: string;
  actividadId: string;
  frecuencia: string;
}

export function ClasesPagosPage() {
  const token = useAuthStore((s) => s.token);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [filterActividad, setFilterActividad] = useState('all');
  const [page, setPage] = useState(1);

  // Clases sueltas dialog
  const [clasesDialog, setClasesDialog] = useState<string | null>(null);
  const [clasesValue, setClasesValue] = useState('');

  // Editar clases (ajuste absoluto: usadas / total)
  const [editClases, setEditClases] = useState<InscripcionFlat | null>(null);
  const [editUsadas, setEditUsadas] = useState('');
  const [editTotal, setEditTotal] = useState('');
  const [editError, setEditError] = useState('');

  // Confirmar eliminación
  const [confirmInscripcion, setConfirmInscripcion] = useState<InscripcionFlat | null>(null);

  // Nueva inscripción dialog
  const [nuevaDialog, setNuevaDialog] = useState(false);
  const [nuevaForm, setNuevaForm] = useState<NuevaInscripcionForm>({ alumnoId: '', actividadId: '', frecuencia: 'DOS_VECES' });

  // Buscador de alumno (por DNI / nombre) dentro del dialog
  const [alumnoSearch, setAlumnoSearch] = useState('');
  const [alumnoSel, setAlumnoSel] = useState<Alumno | null>(null);

  const { data: actividades } = useApiGet<Actividad[]>('/actividades?soloActivas=true');

  const { data: alumnosResult } = useApiGet<PaginatedResponse<Alumno>>(
    nuevaDialog && !alumnoSel && alumnoSearch.trim().length >= 2
      ? `/alumnos?search=${encodeURIComponent(alumnoSearch.trim())}&activo=true&limit=8`
      : null,
  );

  function seleccionarAlumno(a: Alumno) {
    setAlumnoSel(a);
    setNuevaForm((f) => ({ ...f, alumnoId: a.id }));
    setAlumnoSearch('');
  }

  function resetNuevaInscripcion() {
    setNuevaDialog(false);
    setNuevaForm({ alumnoId: '', actividadId: '', frecuencia: 'DOS_VECES' });
    setAlumnoSel(null);
    setAlumnoSearch('');
  }

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (filterActividad !== 'all') params.set('actividadId', filterActividad);
  params.set('page', String(page));
  params.set('limit', '20');

  const { data, mutate } = useApiGet<PaginatedResponse<InscripcionFlat>>(
    `/inscripciones?${params.toString()}`,
  );

  async function handleTogglePago(ins: InscripcionFlat) {
    await api(`/inscripciones/${ins.id}/pagar`, {
      method: 'PATCH',
      body: JSON.stringify({ pagado: !ins.pagado }),
      token: token!,
    });
    mutate();
  }

  async function handleAgregarClases() {
    const num = parseInt(clasesValue, 10);
    if (!clasesDialog || isNaN(num) || num < 1) return;

    await api(`/inscripciones/${clasesDialog}/clases-sueltas`, {
      method: 'PATCH',
      body: JSON.stringify({ clases: num }),
      token: token!,
    });
    setClasesDialog(null);
    setClasesValue('');
    mutate();
  }

  function abrirEditarClases(ins: InscripcionFlat) {
    setEditClases(ins);
    setEditUsadas(String(ins.clasesUsadas));
    setEditTotal(String(ins.clasesTotal));
    setEditError('');
  }

  async function handleGuardarClases() {
    if (!editClases) return;
    const usadas = parseInt(editUsadas, 10);
    const total = parseInt(editTotal, 10);
    if (isNaN(usadas) || isNaN(total) || usadas < 0 || total < 0) {
      setEditError('Valores inválidos');
      return;
    }
    if (usadas > total) {
      setEditError('Las clases usadas no pueden superar el total');
      return;
    }
    try {
      await api(`/inscripciones/${editClases.id}/clases`, {
        method: 'PATCH',
        body: JSON.stringify({ clasesUsadas: usadas, clasesTotal: total }),
        token: token!,
      });
      setEditClases(null);
      mutate();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function doEliminarInscripcion() {
    if (!confirmInscripcion) return;
    await api(`/inscripciones/${confirmInscripcion.id}`, { method: 'DELETE', token: token! });
    setConfirmInscripcion(null);
    mutate();
  }

  async function handleNuevaInscripcion() {
    if (!nuevaForm.alumnoId || !nuevaForm.actividadId) return;

    await api('/inscripciones', {
      method: 'POST',
      body: JSON.stringify(nuevaForm),
      token: token!,
    });
    resetNuevaInscripcion();
    mutate();
  }

  function getEstadoBadge(ins: InscripcionFlat) {
    const restantes = ins.clasesTotal - ins.clasesUsadas;
    if (ins.pagado && restantes > 0) return <Badge variant="success">VERDE</Badge>;
    if (!ins.pagado && restantes > 0) return <Badge variant="warning">AMARILLO</Badge>;
    return <Badge variant="destructive">ROJO</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Inscripciones y Pagos</h2>
        <Button onClick={() => setNuevaDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Inscripción
        </Button>
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
        <Select value={filterActividad} onValueChange={(v) => { setFilterActividad(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas las actividades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las actividades</SelectItem>
            {actividades?.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-cefide-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cefide-surface">
            <tr className="border-b border-cefide-border">
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">DNI</th>
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">Alumno</th>
              <th className="px-4 py-3 text-left font-medium text-cefide-muted">Actividad</th>
              <th className="px-4 py-3 text-center font-medium text-cefide-muted">Frecuencia</th>
              <th className="px-4 py-3 text-center font-medium text-cefide-muted">Clases</th>
              <th className="px-4 py-3 text-center font-medium text-cefide-muted">Pago</th>
              <th className="px-4 py-3 text-center font-medium text-cefide-muted">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-cefide-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((ins) => (
              <tr key={ins.id} className="border-b border-cefide-border hover:bg-cefide-surface/50 transition-colors">
                <td className="px-4 py-3 font-mono">{ins.alumno.dni}</td>
                <td className="px-4 py-3">{ins.alumno.apellido}, {ins.alumno.nombre}</td>
                <td className="px-4 py-3">{ins.actividad.nombre}</td>
                <td className="px-4 py-3 text-center text-cefide-muted">{FL[ins.frecuencia]}</td>
                <td className="px-4 py-3 text-center font-mono">
                  {ins.clasesUsadas}/{ins.clasesTotal}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={ins.pagado ? 'success' : 'destructive'}>
                    {ins.pagado ? 'Pagado' : 'Pendiente'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">{getEstadoBadge(ins)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setClasesDialog(ins.id); setClasesValue(''); }}
                      title="Agregar clases sueltas"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Clases
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => abrirEditarClases(ins)}
                      title="Editar clases (usadas / total)"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePago(ins)}
                    >
                      <DollarSign className="mr-1 h-3 w-3" />
                      {ins.pagado ? 'Anular' : 'Cobrar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmInscripcion(ins)}
                      title="Eliminar inscripción"
                    >
                      <Trash2 className="h-4 w-4 text-cefide-accent-alt" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-cefide-muted">
                  No se encontraron inscripciones
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-cefide-muted">{data.total} inscripcion{data.total !== 1 ? 'es' : ''}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span className="flex items-center px-3 text-sm text-cefide-muted">{page} / {data.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}

      {/* Clases sueltas dialog */}
      <Dialog open={!!clasesDialog} onOpenChange={(v) => !v && setClasesDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar clases sueltas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cantidad de clases a agregar</Label>
              <Input
                type="number"
                min="1"
                value={clasesValue}
                onChange={(e) => setClasesValue(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarClases(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setClasesDialog(null)}>Cancelar</Button>
              <Button onClick={handleAgregarClases}>
                <Check className="mr-1 h-4 w-4" />
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editar clases dialog (ajuste absoluto usadas / total) */}
      <Dialog open={!!editClases} onOpenChange={(v) => !v && setEditClases(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar clases</DialogTitle>
          </DialogHeader>
          {editClases && (
            <div className="space-y-4">
              <p className="text-sm text-cefide-muted">
                {editClases.alumno.apellido}, {editClases.alumno.nombre} — {editClases.actividad.nombre}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Clases usadas</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editUsadas}
                    onChange={(e) => setEditUsadas(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Clases total</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editTotal}
                    onChange={(e) => setEditTotal(e.target.value)}
                  />
                </div>
              </div>
              {editError && <p className="text-sm text-cefide-accent-alt">{editError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditClases(null)}>Cancelar</Button>
                <Button onClick={handleGuardarClases}>
                  <Check className="mr-1 h-4 w-4" />
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación inscripción */}
      <Dialog open={!!confirmInscripcion} onOpenChange={(v) => !v && setConfirmInscripcion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar inscripción</DialogTitle>
          </DialogHeader>
          {confirmInscripcion && (
            <div className="space-y-4">
              <p className="text-sm">
                ¿Eliminar la inscripción de{' '}
                <strong>{confirmInscripcion.alumno.apellido}, {confirmInscripcion.alumno.nombre}</strong>{' '}
                en &ldquo;{confirmInscripcion.actividad.nombre}&rdquo;?
              </p>
              <p className="text-xs text-cefide-muted">
                Se borran también sus pagos e ingresos de esta actividad. Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmInscripcion(null)}>Cancelar</Button>
                <Button variant="destructive" onClick={doEliminarInscripcion}>Eliminar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Nueva inscripción dialog */}
      <Dialog open={nuevaDialog} onOpenChange={(v) => !v && resetNuevaInscripcion()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Inscripción</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Alumno</Label>
              {alumnoSel ? (
                <div className="flex items-center justify-between rounded-md border border-cefide-border bg-cefide-surface px-3 py-2">
                  <span className="text-sm">
                    <span className="font-mono">{alumnoSel.dni}</span> — {alumnoSel.apellido}, {alumnoSel.nombre}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setAlumnoSel(null); setNuevaForm((f) => ({ ...f, alumnoId: '' })); }}
                    title="Cambiar alumno"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cefide-muted" />
                  <Input
                    placeholder="Buscar por DNI, nombre o apellido..."
                    value={alumnoSearch}
                    onChange={(e) => setAlumnoSearch(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                  {alumnoSearch.trim().length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-cefide-border bg-cefide-surface shadow-lg max-h-56 overflow-auto">
                      {alumnosResult?.data.length ? (
                        alumnosResult.data.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => seleccionarAlumno(a)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cefide-border/50"
                          >
                            <span className="font-mono text-cefide-muted">{a.dni}</span>
                            <span>{a.apellido}, {a.nombre}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-sm text-cefide-muted">Sin resultados</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Actividad</Label>
              <Select value={nuevaForm.actividadId} onValueChange={(v) => setNuevaForm((f) => ({ ...f, actividadId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar actividad" />
                </SelectTrigger>
                <SelectContent>
                  {actividades?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frecuencia</Label>
              <Select value={nuevaForm.frecuencia} onValueChange={(v) => setNuevaForm((f) => ({ ...f, frecuencia: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNA_VEZ">1x semana (5 clases)</SelectItem>
                  <SelectItem value="DOS_VECES">2x semana (9 clases)</SelectItem>
                  <SelectItem value="TRES_VECES">3x semana (13 clases)</SelectItem>
                  <SelectItem value="LIBRE">Libre (30 clases)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetNuevaInscripcion}>Cancelar</Button>
              <Button onClick={handleNuevaInscripcion} disabled={!nuevaForm.alumnoId || !nuevaForm.actividadId}>Crear</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
