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
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { Alumno } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  alumno?: Alumno | null;
}

export function AlumnoFormDialog({ open, onClose, onSuccess, alumno }: Props) {
  const token = useAuthStore((s) => s.token);

  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!alumno;

  useEffect(() => {
    if (alumno) {
      setDni(alumno.dni);
      setNombre(alumno.nombre);
      setApellido(alumno.apellido);
      setTelefono(alumno.telefono ?? '');
      setDireccion(alumno.direccion ?? '');
    } else {
      setDni('');
      setNombre('');
      setApellido('');
      setTelefono('');
      setDireccion('');
    }
    setError('');
  }, [alumno, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const body = {
      dni,
      nombre,
      apellido,
      telefono: telefono.trim(),
      direccion: direccion.trim(),
    };

    try {
      if (isEdit) {
        await api(`/alumnos/${alumno!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
          token: token!,
        });
      } else {
        await api('/alumnos', {
          method: 'POST',
          body: JSON.stringify(body),
          token: token!,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
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

          {error && <p className="text-sm text-cefide-accent-alt">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
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
