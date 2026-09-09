import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSWRConfig } from 'swr';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { api, ApiError, getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { useApiGet } from '@/hooks/use-api';
import type { Actividad, Alumno, ConfigSistema, Frecuencia } from '@/types';
import { FRECUENCIAS, FRECUENCIA_LABEL, frecuenciaConClases } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  alumno?: Alumno | null;
}

export function AlumnoFormDialog({ open, onClose, onSuccess, alumno }: Props) {
  const token = useAuthStore((s) => s.token);
  const { mutate } = useSWRConfig();
  const submittingRef = useRef(false);

  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingStage, setSavingStage] = useState<'alumno' | 'inscripcion'>('alumno');
  const [actividadId, setActividadId] = useState('none');
  const [frecuencia, setFrecuencia] = useState('DOS_VECES');
  const [partialSuccess, setPartialSuccess] = useState(false);

  const isEdit = !!alumno;
  const { data: actividades } = useApiGet<Actividad[]>(
    open && !isEdit ? '/actividades?soloActivas=true' : null,
  );
  const { data: config } = useApiGet<ConfigSistema>(open && !isEdit ? '/config' : null);

  useEffect(() => {
    if (alumno) {
      setDni(alumno.dni);
      setNombre(alumno.nombre);
      setApellido(alumno.apellido);
      setTelefono(alumno.telefono ?? '');
      setDireccion(alumno.direccion ?? '');
      setFechaNacimiento(alumno.fechaNacimiento ? alumno.fechaNacimiento.slice(0, 10) : '');
      setFechaIngreso(alumno.fechaIngreso ? alumno.fechaIngreso.slice(0, 10) : '');
      setObservaciones(alumno.observaciones ?? '');
    } else {
      setDni('');
      setNombre('');
      setApellido('');
      setTelefono('');
      setDireccion('');
      setFechaNacimiento('');
      setFechaIngreso('');
      setObservaciones('');
    }
    setError('');
    setActividadId('none');
    setFrecuencia('DOS_VECES');
    setPartialSuccess(false);
    setSavingStage('alumno');
  }, [alumno, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submittingRef.current || partialSuccess) return;
    submittingRef.current = true;
    setSaving(true);
    setSavingStage('alumno');
    setError('');

    const body = {
      dni,
      nombre,
      apellido,
      telefono: telefono.trim() || undefined,
      direccion: direccion.trim() || undefined,
      fechaNacimiento: fechaNacimiento || undefined,
      fechaIngreso: fechaIngreso || undefined,
      observaciones: observaciones.trim() || undefined,
    };

    try {
      if (isEdit) {
        await api(`/alumnos/${alumno!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
          token: token!,
        });
      } else {
        const creado = await api<Alumno>('/alumnos', {
          method: 'POST',
          body: JSON.stringify(body),
          token: token!,
        });
        onSuccess();

        if (actividadId !== 'none') {
          setSavingStage('inscripcion');
          try {
            await api('/inscripciones', {
              method: 'POST',
              body: JSON.stringify({ alumnoId: creado.id, actividadId, frecuencia }),
              token: token!,
            });
            void mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/inscripciones'));
            toast.success('Alumno creado e inscripto correctamente');
            onClose();
            return;
          } catch (inscripcionError) {
            void mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/inscripciones'));
            const uncertain = inscripcionError instanceof ApiError &&
              (inscripcionError.kind === 'timeout' || inscripcionError.kind === 'network' || inscripcionError.kind === 'invalid-response');
            setPartialSuccess(true);
            setError(
              `Alumno creado correctamente, pero ${uncertain ? 'no se pudo confirmar la inscripción' : 'no se pudo completar la inscripción'}. ` +
              `${getApiErrorMessage(inscripcionError)} El alumno quedó registrado; verificá la sección de inscripciones antes de reintentar.`,
            );
            return;
          }
        }
      }
      toast.success(isEdit ? 'Alumno actualizado' : 'Alumno creado');
      if (isEdit) onSuccess();
      onClose();
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Alumno' : 'Nuevo Alumno'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dni">DNI</Label>
            <Input
              id="dni"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="12345678"
              required
              minLength={7}
              maxLength={8}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apellido">Apellido</Label>
              <Input
                id="apellido"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                required
                minLength={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="direccion">Dirección</Label>
              <Input
                id="direccion"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaNacimiento">Fecha de nacimiento</Label>
              <Input
                id="fechaNacimiento"
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaIngreso">Fecha de ingreso</Label>
              <Input
                id="fechaIngreso"
                type="date"
                value={fechaIngreso}
                onChange={(e) => setFechaIngreso(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <textarea
              id="observaciones"
              value={observaciones}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservaciones(e.target.value)}
              placeholder="Opcional"
              rows={3}
              className="flex w-full rounded-md border border-cefide-border bg-cefide-surface px-3 py-2 text-sm text-cefide-text placeholder:text-cefide-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cefide-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {!isEdit && (
            <div className="space-y-4 border-t border-cefide-border pt-4">
              <div>
                <p className="font-medium">Inscripción inicial (opcional)</p>
                <p className="mt-1 text-xs text-cefide-muted">Podés seleccionar una actividad para dejar al alumno inscripto al momento de crearlo.</p>
              </div>
              <div className="space-y-2">
                <Label>Actividad</Label>
                <Select value={actividadId} onValueChange={setActividadId} disabled={saving || partialSuccess}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin inscripción inicial</SelectItem>
                    {actividades?.map((actividad) => <SelectItem key={actividad.id} value={actividad.id}>{actividad.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {actividadId !== 'none' && (
                <div className="space-y-2">
                  <Label>Frecuencia</Label>
                  <Select value={frecuencia} onValueChange={setFrecuencia} disabled={saving || partialSuccess}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FRECUENCIAS.map((opcion: Frecuencia) => (
                        <SelectItem key={opcion} value={opcion}>
                          {config ? frecuenciaConClases(config, opcion) : FRECUENCIA_LABEL[opcion]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p>{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {partialSuccess ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!partialSuccess && <Button type="submit" disabled={saving}>
              {saving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? (savingStage === 'inscripcion' ? 'Creando inscripción...' : 'Creando alumno...') : isEdit ? 'Guardar' : 'Crear'}
            </Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
