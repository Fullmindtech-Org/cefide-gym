import { useState, useEffect, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useApiGet } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import type { Profesor, Actividad } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profesor?: Profesor | null;
}

export function ProfesorFormDialog({ open, onClose, onSuccess, profesor }: Props) {
  const token = useAuthStore((s) => s.token);

  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [actividadIds, setActividadIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: actividades } = useApiGet<Actividad[]>('/actividades?soloActivas=true');

  const isEdit = !!profesor;

  useEffect(() => {
    if (profesor) {
      setDni(profesor.dni);
      setNombre(profesor.nombre);
      setApellido(profesor.apellido);
      setEmail(profesor.usuario?.email ?? '');
      setPassword('');
      setActividadIds(profesor.actividades?.map((a) => a.id) ?? []);
    } else {
      setDni('');
      setNombre('');
      setApellido('');
      setEmail('');
      setPassword('');
      setActividadIds([]);
    }
    setShowPassword(false);
    setError('');
  }, [profesor, open]);

  function toggleActividad(id: string) {
    setActividadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (isEdit) {
        const body: Record<string, unknown> = { nombre, apellido, actividadIds };
        if (email) body.email = email;
        if (password) body.password = password;

        await api(`/profesores/${profesor!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
          token: token!,
        });
      } else {
        const body: Record<string, unknown> = { dni, nombre, apellido, actividadIds };
        if (email) body.email = email;
        if (password) body.password = password;

        await api('/profesores', {
          method: 'POST',
          body: JSON.stringify(body),
          token: token!,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Profesor' : 'Nuevo Profesor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prof-dni">DNI</Label>
            <Input
              id="prof-dni"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="12345678"
              required
              minLength={7}
              maxLength={8}
              disabled={isEdit}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prof-nombre">Nombre</Label>
              <Input
                id="prof-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prof-apellido">Apellido</Label>
              <Input
                id="prof-apellido"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                required
                minLength={2}
              />
            </div>
          </div>

          <div className="border-t border-cefide-border pt-4">
            <p className="text-sm text-cefide-muted mb-3">
              {isEdit
                ? 'Cambiar email o contraseña (dejar en blanco para no modificar)'
                : 'Cuenta de acceso (opcional — permite login como profesor)'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prof-email">Email</Label>
                <Input
                  id="prof-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="profesor@cefide.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prof-password">
                  {isEdit ? 'Nueva contraseña' : 'Contraseña'}
                </Label>
                <div className="relative">
                  <Input
                    id="prof-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isEdit ? 'dejar vacío para no cambiar' : 'mínimo 6 caracteres'}
                    minLength={password ? 6 : undefined}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-cefide-muted hover:text-cefide-text"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-cefide-border pt-4">
            <p className="text-sm text-cefide-muted mb-3">
              Actividades a cargo (el profesor solo verá alumnos de estas actividades)
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {actividades?.map((act) => (
                <label
                  key={act.id}
                  className="flex items-center gap-2 rounded-md border border-cefide-border px-3 py-2 cursor-pointer hover:bg-cefide-surface"
                >
                  <input
                    type="checkbox"
                    checked={actividadIds.includes(act.id)}
                    onChange={() => toggleActividad(act.id)}
                    className="h-4 w-4 accent-cefide-accent"
                  />
                  <span className="text-sm">{act.nombre}</span>
                </label>
              ))}
              {actividades && actividades.length === 0 && (
                <p className="text-sm text-cefide-muted col-span-2">
                  No hay actividades activas
                </p>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-cefide-accent-alt">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
