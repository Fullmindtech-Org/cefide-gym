import { useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { Search, Plus, DollarSign, Check, X, Trash2, Pencil, LoaderCircle, TriangleAlert } from 'lucide-react';
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
import { api, ApiError, getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import type { Actividad, Alumno, ConfigSistema, Frecuencia, InscripcionActividad, PaginatedResponse } from '@/types';
import { clasesDeFrecuencia, FRECUENCIAS, FRECUENCIA_LABEL as FL, frecuenciaConClases } from '@/types';
import { PaginationControls, SortableHeader, type SortDirection } from '@/components/admin/TableControls';

interface InscripcionFlat extends InscripcionActividad {
  alumno: { id: string; dni: string; nombre: string; apellido: string; activo: boolean };
}

interface NuevaInscripcionForm {
  alumnoId: string;
  actividadId: string;
  frecuencia: Frecuencia;
}

export function ClasesPagosPage() {
  const token = useAuthStore((s) => s.token);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [filterActividad, setFilterActividad] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('alumno');
  const [sortOrder, setSortOrder] = useState<SortDirection>('asc');
  const [pagoDialog, setPagoDialog] = useState<InscripcionFlat | null>(null);
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pagoSuccess, setPagoSuccess] = useState(false);
  const [pagoError, setPagoError] = useState('');

  // Clases sueltas dialog
  const [clasesDialog, setClasesDialog] = useState<string | null>(null);
  const [clasesValue, setClasesValue] = useState('');
  const [clasesSaving, setClasesSaving] = useState(false);
  const [clasesError, setClasesError] = useState('');

  // Editar clases (ajuste absoluto: usadas / total)
  const [editClases, setEditClases] = useState<InscripcionFlat | null>(null);
  const [editUsadas, setEditUsadas] = useState('');
  const [editFrecuencia, setEditFrecuencia] = useState<Frecuencia>('DOS_VECES');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Confirmar eliminación
  const [confirmInscripcion, setConfirmInscripcion] = useState<InscripcionFlat | null>(null);
  const [deletingInscripcion, setDeletingInscripcion] = useState(false);

  // Nueva inscripción dialog
  const [nuevaDialog, setNuevaDialog] = useState(false);
  const [nuevaForm, setNuevaForm] = useState<NuevaInscripcionForm>({ alumnoId: '', actividadId: '', frecuencia: 'DOS_VECES' });
  const [nuevaSaving, setNuevaSaving] = useState(false);
  const [nuevaSuccess, setNuevaSuccess] = useState(false);
  const [nuevaError, setNuevaError] = useState('');

  // Buscador de alumno (por DNI / nombre) dentro del dialog
  const [alumnoSearch, setAlumnoSearch] = useState('');
  const [alumnoSel, setAlumnoSel] = useState<Alumno | null>(null);

  const { data: actividades } = useApiGet<Actividad[]>('/actividades?soloActivas=true');
  const { data: config } = useApiGet<ConfigSistema>('/config');

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
    if (nuevaSaving) return;
    setNuevaDialog(false);
    setNuevaForm({ alumnoId: '', actividadId: '', frecuencia: 'DOS_VECES' });
    setAlumnoSel(null);
    setAlumnoSearch('');
    setNuevaSuccess(false);
    setNuevaError('');
  }

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (filterActividad !== 'all') params.set('actividadId', filterActividad);
  params.set('page', String(page));
  params.set('limit', String(pageSize));
  params.set('sortBy', sortBy);
  params.set('sortOrder', sortOrder);

  function handleSort(field: string) {
    setSortOrder((current) => sortBy === field && current === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  }

  const { data, mutate } = useApiGet<PaginatedResponse<InscripcionFlat>>(
    `/inscripciones?${params.toString()}`,
  );

  function abrirPago(ins: InscripcionFlat) {
    setPagoDialog(ins);
    setPagoSuccess(false);
    setPagoError('');
  }

  function cerrarPago() {
    if (pagoSaving) return;
    setPagoDialog(null);
    setPagoSuccess(false);
    setPagoError('');
  }

  async function confirmarPago() {
    if (!pagoDialog) return;
    const nuevoEstado = !pagoDialog.pagado;
    setPagoSaving(true);
    setPagoError('');
    try {
      await api(`/inscripciones/${pagoDialog.id}/pagar`, {
        method: 'PATCH',
        body: JSON.stringify({ pagado: nuevoEstado }),
        token: token!,
      });
      void mutate();
      setPagoSuccess(true);
    } catch (err) {
      setPagoError(getApiErrorMessage(err));
    } finally {
      setPagoSaving(false);
    }
  }

  async function handleAgregarClases() {
    const num = parseInt(clasesValue, 10);
    if (!clasesDialog || isNaN(num) || num < 1 || clasesSaving) return;
    setClasesSaving(true);
    setClasesError('');
    try {
      await api(`/inscripciones/${clasesDialog}/clases-sueltas`, { method: 'PATCH', body: JSON.stringify({ clases: num }), token: token! });
      setClasesDialog(null);
      setClasesValue('');
      toast.success('Clases agregadas');
      void mutate();
    } catch (error) { setClasesError(getApiErrorMessage(error)); }
    finally { setClasesSaving(false); }
  }

  function abrirEditarClases(ins: InscripcionFlat) {
    setEditClases(ins);
    setEditUsadas(String(ins.clasesUsadas));
    setEditFrecuencia(ins.frecuencia);
    setEditError('');
  }

  async function handleGuardarClases() {
    if (!editClases || editSaving) return;
    const usadas = parseInt(editUsadas, 10);
    if (isNaN(usadas) || usadas < 0) {
      setEditError('Valores inválidos');
      return;
    }
    const total = config ? clasesDeFrecuencia(config, editFrecuencia) : editClases.clasesTotal;
    if (usadas > total) {
      setEditError('Las clases usadas no pueden superar el total');
      return;
    }
    setEditSaving(true);
    try {
      await api(`/inscripciones/${editClases.id}/frecuencia`, {
        method: 'PATCH',
        body: JSON.stringify({ frecuencia: editFrecuencia, clasesUsadas: usadas }),
        token: token!,
      });
      setEditClases(null);
      toast.success('Clases actualizadas');
      void mutate();
    } catch (err) {
      setEditError(getApiErrorMessage(err));
    } finally { setEditSaving(false); }
  }

  async function doEliminarInscripcion() {
    if (!confirmInscripcion || deletingInscripcion) return;
    setDeletingInscripcion(true);
    try {
      await api(`/inscripciones/${confirmInscripcion.id}`, { method: 'DELETE', token: token! });
      setConfirmInscripcion(null);
      toast.success('Inscripción eliminada');
      void mutate();
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setDeletingInscripcion(false); }
  }

  async function handleNuevaInscripcion() {
    if (!nuevaForm.alumnoId || !nuevaForm.actividadId || nuevaSaving) return;

    setNuevaSaving(true);
    setNuevaError('');
    try {
      await api('/inscripciones', {
        method: 'POST',
        body: JSON.stringify(nuevaForm),
        token: token!,
      });
      setNuevaSuccess(true);
      void mutate();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.kind === 'timeout') {
          setNuevaError('No se pudo confirmar el resultado. Verificá la lista antes de volver a intentar.');
        } else if (err.kind === 'network') {
          setNuevaError('No se pudo conectar con el servidor. La inscripción no fue confirmada.');
        } else if (err.kind === 'invalid-response') {
          setNuevaError('El servidor respondió de forma inesperada. Verificá la lista antes de reintentar.');
        } else if (err.status >= 500) {
          setNuevaError('El servidor no pudo crear la inscripción. Intentá nuevamente más tarde.');
        } else {
          setNuevaError(err.message);
        }
      } else {
        setNuevaError('Ocurrió un error inesperado al crear la inscripción.');
      }
    } finally {
      setNuevaSaving(false);
    }
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
              <SortableHeader label="DNI" field="dni" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Alumno" field="alumno" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Actividad" field="actividad" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Frecuencia" field="frecuencia" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Clases" field="clases" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Pago" field="pago" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
              <SortableHeader label="Estado" field="estado" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
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
                      onClick={() => { setClasesDialog(ins.id); setClasesValue(''); setClasesError(''); }}
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
                      onClick={() => abrirPago(ins)}
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

      {data && <PaginationControls page={page} totalPages={data.totalPages} total={data.total} pageSize={pageSize} itemLabel="inscripción" pluralLabel="inscripciones" onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}

      <Dialog open={!!pagoDialog} onOpenChange={(open) => !open && cerrarPago()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pagoDialog?.pagado ? 'Confirmar anulación de cobro' : 'Confirmar cobro de actividad'}</DialogTitle>
          </DialogHeader>
          {pagoDialog && (pagoSuccess ? (
            <div className="space-y-4">
              <div className="rounded-md border border-cefide-success/30 bg-cefide-success/10 p-4 text-cefide-success">
                <p className="font-medium">{pagoDialog.pagado ? 'Cobro anulado correctamente' : 'Cobro registrado correctamente'}</p>
                <p className="mt-1 text-sm">{pagoDialog.alumno.apellido}, {pagoDialog.alumno.nombre} — {pagoDialog.actividad.nombre}</p>
              </div>
              <div className="flex justify-end"><Button onClick={cerrarPago}>Cerrar</Button></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-cefide-border bg-cefide-surface p-4 text-sm space-y-2">
                <p><span className="text-cefide-muted">Alumno:</span> {pagoDialog.alumno.apellido}, {pagoDialog.alumno.nombre}</p>
                <p><span className="text-cefide-muted">DNI:</span> <span className="font-mono">{pagoDialog.alumno.dni}</span></p>
                <p><span className="text-cefide-muted">Actividad:</span> {pagoDialog.actividad.nombre}</p>
                <p><span className="text-cefide-muted">Acción:</span> {pagoDialog.pagado ? 'Anular cobro registrado' : 'Registrar cobro'}</p>
              </div>
              {pagoError && <p className="text-sm text-cefide-accent-alt">{pagoError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={cerrarPago} disabled={pagoSaving}>Cancelar</Button>
                <Button onClick={confirmarPago} disabled={pagoSaving}>
                  <DollarSign className="mr-1 h-4 w-4" />
                  {pagoSaving ? 'Guardando...' : pagoDialog.pagado ? 'Confirmar anulación' : 'Confirmar cobro'}
                </Button>
              </div>
            </div>
          ))}
        </DialogContent>
      </Dialog>

      {/* Clases sueltas dialog */}
      <Dialog open={!!clasesDialog} onOpenChange={(v) => !v && !clasesSaving && setClasesDialog(null)}>
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
                disabled={clasesSaving}
              />
            </div>
            {clasesError && <p className="text-sm text-cefide-accent-alt">{clasesError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setClasesDialog(null)} disabled={clasesSaving}>Cancelar</Button>
              <Button onClick={handleAgregarClases} disabled={clasesSaving}>
                <Check className="mr-1 h-4 w-4" />
                {clasesSaving ? 'Agregando...' : 'Agregar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editar clases dialog (ajuste absoluto usadas / total) */}
      <Dialog open={!!editClases} onOpenChange={(v) => !v && !editSaving && setEditClases(null)}>
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
                  <Select value={editFrecuencia} onValueChange={(value) => setEditFrecuencia(value as Frecuencia)} disabled={!config}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FRECUENCIAS.map((opcion) => (
                        <SelectItem key={opcion} value={opcion}>
                          {config ? frecuenciaConClases(config, opcion) : FL[opcion]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editError && <p className="text-sm text-cefide-accent-alt">{editError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditClases(null)} disabled={editSaving}>Cancelar</Button>
                <Button onClick={handleGuardarClases} disabled={editSaving}>
                  <Check className="mr-1 h-4 w-4" />
                  {editSaving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación inscripción */}
      <Dialog open={!!confirmInscripcion} onOpenChange={(v) => !v && !deletingInscripcion && setConfirmInscripcion(null)}>
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
                <Button variant="outline" onClick={() => setConfirmInscripcion(null)} disabled={deletingInscripcion}>Cancelar</Button>
                <Button variant="destructive" onClick={doEliminarInscripcion} disabled={deletingInscripcion}>{deletingInscripcion ? 'Eliminando...' : 'Eliminar'}</Button>
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
          {nuevaSuccess ? (
            <div className="space-y-4">
              <div className="rounded-md border border-cefide-success/30 bg-cefide-success/10 p-4 text-cefide-success">
                <p className="font-medium">Inscripción creada correctamente</p>
                <p className="mt-1 text-sm">El servidor confirmó la nueva inscripción.</p>
              </div>
              <div className="flex justify-end"><Button onClick={resetNuevaInscripcion}>Cerrar</Button></div>
            </div>
          ) : <div className="space-y-4">
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
                    disabled={nuevaSaving}
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
                    disabled={nuevaSaving}
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
              <Select disabled={nuevaSaving} value={nuevaForm.actividadId} onValueChange={(v) => setNuevaForm((f) => ({ ...f, actividadId: v }))}>
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
              <Select disabled={nuevaSaving} value={nuevaForm.frecuencia} onValueChange={(v) => setNuevaForm((f) => ({ ...f, frecuencia: v as Frecuencia }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRECUENCIAS.map((opcion) => (
                    <SelectItem key={opcion} value={opcion}>
                      {config ? frecuenciaConClases(config, opcion) : FL[opcion]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {nuevaError && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-cefide-text">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p>{nuevaError}</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetNuevaInscripcion} disabled={nuevaSaving}>Cancelar</Button>
              <Button onClick={handleNuevaInscripcion} disabled={nuevaSaving || !nuevaForm.alumnoId || !nuevaForm.actividadId}>
                {nuevaSaving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                {nuevaSaving ? 'Creando inscripción...' : 'Crear'}
              </Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
