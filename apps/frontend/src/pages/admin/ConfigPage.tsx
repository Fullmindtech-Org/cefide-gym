import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useApiGet } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { ConfigSistema } from '@/types';
import { Pencil, Plus, Trash2, X, Check } from 'lucide-react';

export function ConfigPage() {
  const token = useAuthStore((s) => s.token);
  const { data: config, mutate } = useApiGet<ConfigSistema>('/config');

  const [clasesGracia, setClasesGracia] = useState('5');
  const [diaVencimiento, setDiaVencimiento] = useState('5');
  const [clasesUnaVez, setClasesUnaVez] = useState('5');
  const [clasesDosVeces, setClasesDosVeces] = useState('9');
  const [clasesTresVeces, setClasesTresVeces] = useState('13');
  const [clasesLibre, setClasesLibre] = useState('30');
  const [tiempoVerde, setTiempoVerde] = useState('4');
  const [tiempoAmarillo, setTiempoAmarillo] = useState('5');
  const [tiempoRojo, setTiempoRojo] = useState('6');
  const [reingresoHoras, setReingresoHoras] = useState('3');
  const [reingresoMinutos, setReingresoMinutos] = useState('0');
  const [codigosComodin, setCodigosComodin] = useState<string[]>(['00000000', '99999999']);
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [codigoError, setCodigoError] = useState('');
  const [editingCodigo, setEditingCodigo] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setClasesGracia(String(config.clasesGracia));
      setDiaVencimiento(String(config.diaVencimiento));
      setClasesUnaVez(String(config.clasesUnaVez));
      setClasesDosVeces(String(config.clasesDosVeces));
      setClasesTresVeces(String(config.clasesTresVeces));
      setClasesLibre(String(config.clasesLibre));
      setTiempoVerde(String(config.tiempoVerde));
      setTiempoAmarillo(String(config.tiempoAmarillo));
      setTiempoRojo(String(config.tiempoRojo));
      const ventanaMinutos = config.reingresoVentanaMinutos ?? 180;
      setReingresoHoras(String(Math.floor(ventanaMinutos / 60)));
      setReingresoMinutos(String(ventanaMinutos % 60));
      setCodigosComodin((config.codigosComodin ?? '').split(',').filter(Boolean));
    }
  }, [config]);

  const reingresoHorasNumero = Number(reingresoHoras);
  const reingresoMinutosNumero = Number(reingresoMinutos);
  const reingresoTotalMinutos = reingresoHorasNumero * 60 + reingresoMinutosNumero;
  const reingresoValido =
    Number.isInteger(reingresoHorasNumero) &&
    Number.isInteger(reingresoMinutosNumero) &&
    reingresoHorasNumero >= 0 &&
    reingresoHorasNumero <= 24 &&
    reingresoMinutosNumero >= 0 &&
    reingresoMinutosNumero <= 59 &&
    reingresoTotalMinutos >= 1 &&
    reingresoTotalMinutos <= 1440;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await api('/config', {
      method: 'PATCH',
      body: JSON.stringify({
        clasesGracia: parseInt(clasesGracia, 10),
        diaVencimiento: parseInt(diaVencimiento, 10),
        clasesUnaVez: parseInt(clasesUnaVez, 10),
        clasesDosVeces: parseInt(clasesDosVeces, 10),
        clasesTresVeces: parseInt(clasesTresVeces, 10),
        clasesLibre: parseInt(clasesLibre, 10),
        tiempoVerde: parseInt(tiempoVerde, 10),
        tiempoAmarillo: parseInt(tiempoAmarillo, 10),
        tiempoRojo: parseInt(tiempoRojo, 10),
        reingresoVentanaMinutos: reingresoTotalMinutos,
        codigosComodin: codigosComodin.join(','),
      }),
      token: token!,
    });
    mutate();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function normalizarCodigo(value: string) {
    return value.replace(/\D/g, '').slice(0, 8);
  }

  function validarCodigo(value: string, exceptIndex?: number) {
    if (!/^\d{7,8}$/.test(value)) return 'El DNI debe tener 7 u 8 dígitos';
    if (codigosComodin.some((codigo, index) => codigo === value && index !== exceptIndex)) return 'El DNI ya está agregado';
    return '';
  }

  function agregarCodigo() {
    const error = validarCodigo(nuevoCodigo);
    if (error) {
      setCodigoError(error);
      return;
    }
    setCodigosComodin((current) => [...current, nuevoCodigo]);
    setNuevoCodigo('');
    setCodigoError('');
  }

  function iniciarEdicion(index: number) {
    setEditingCodigo(index);
    setEditingValue(codigosComodin[index]);
    setCodigoError('');
  }

  function guardarEdicion() {
    if (editingCodigo === null) return;
    const error = validarCodigo(editingValue, editingCodigo);
    if (error) {
      setCodigoError(error);
      return;
    }
    setCodigosComodin((current) => current.map((codigo, index) => index === editingCodigo ? editingValue : codigo));
    setEditingCodigo(null);
    setEditingValue('');
    setCodigoError('');
  }

  function eliminarCodigo(index: number) {
    setCodigosComodin((current) => current.filter((_, currentIndex) => currentIndex !== index));
    if (editingCodigo === index) setEditingCodigo(null);
    setCodigoError('');
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Configuración del Sistema</h2>

      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Parámetros de acceso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clasesGracia">Clases de gracia (sin pago)</Label>
              <Input
                id="clasesGracia"
                type="number"
                min="0"
                max="10"
                value={clasesGracia}
                onChange={(e) => setClasesGracia(e.target.value)}
              />
              <p className="text-xs text-cefide-muted">
                Clases que puede tomar sin pagar antes de quedar bloqueado
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="diaVencimiento">Día de vencimiento</Label>
              <Input
                id="diaVencimiento"
                type="number"
                min="1"
                max="28"
                value={diaVencimiento}
                onChange={(e) => setDiaVencimiento(e.target.value)}
              />
              <p className="text-xs text-cefide-muted">
                Día del mes en que vence el período de pago
              </p>
              <p className="text-xs text-amber-500">
                ⚠ Este valor se guarda pero aún no afecta el control de acceso. La gracia se calcula por ingresos del mes calendario, no por fecha límite.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ventana de reingreso</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="reingresoHoras" className="text-xs text-cefide-muted">Horas</Label>
                  <Input
                    id="reingresoHoras"
                    type="number"
                    min="0"
                    max="24"
                    value={reingresoHoras}
                    onChange={(e) => setReingresoHoras(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reingresoMinutos" className="text-xs text-cefide-muted">Minutos</Label>
                  <Input
                    id="reingresoMinutos"
                    type="number"
                    min="0"
                    max="59"
                    value={reingresoMinutos}
                    onChange={(e) => setReingresoMinutos(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-cefide-muted">
                Durante este periodo, un nuevo ingreso a la misma actividad no descuenta otra clase.
              </p>
              {!reingresoValido && (
                <p className="text-xs text-cefide-accent-alt">
                  Ingresa un periodo entre 1 minuto y 24 horas.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Códigos de acceso ilimitado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label htmlFor="nuevoCodigoComodin">Agregar DNI comodín</Label>
              <div className="flex gap-2">
                <Input
                  id="nuevoCodigoComodin"
                  inputMode="numeric"
                  value={nuevoCodigo}
                  onChange={(e) => { setNuevoCodigo(normalizarCodigo(e.target.value)); setCodigoError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') agregarCodigo(); }}
                  placeholder="DNI de 7 u 8 dígitos"
                  className="font-mono"
                />
                <Button type="button" onClick={agregarCodigo} disabled={nuevoCodigo.length < 7}>
                  <Plus className="mr-1 h-4 w-4" /> Agregar
                </Button>
              </div>
              {codigoError && <p className="text-sm text-cefide-accent-alt">{codigoError}</p>}
              <p className="text-xs text-cefide-muted">Solo números enteros, con una longitud de 7 u 8 dígitos.</p>

              <div className="overflow-hidden rounded-md border border-cefide-border">
                <div className="grid grid-cols-[1fr_auto] border-b border-cefide-border bg-cefide-surface px-3 py-2 text-xs font-medium text-cefide-muted">
                  <span>DNI comodín</span><span>Acciones</span>
                </div>
                {codigosComodin.map((codigo, index) => (
                  <div key={`${codigo}-${index}`} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-cefide-border px-3 py-2 last:border-b-0">
                    {editingCodigo === index ? (
                      <Input
                        inputMode="numeric"
                        value={editingValue}
                        onChange={(e) => { setEditingValue(normalizarCodigo(e.target.value)); setCodigoError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(); }}
                        className="h-8 font-mono"
                        autoFocus
                      />
                    ) : <span className="font-mono text-sm">{codigo}</span>}
                    <div className="flex gap-1">
                      {editingCodigo === index ? (
                        <>
                          <Button type="button" variant="ghost" size="icon" onClick={guardarEdicion} title="Guardar DNI"><Check className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setEditingCodigo(null)} title="Cancelar"><X className="h-4 w-4" /></Button>
                        </>
                      ) : (
                        <Button type="button" variant="ghost" size="icon" onClick={() => iniciarEdicion(index)} title="Editar DNI"><Pencil className="h-4 w-4" /></Button>
                      )}
                      <Button type="button" variant="ghost" size="icon" onClick={() => eliminarCodigo(index)} title="Eliminar DNI"><Trash2 className="h-4 w-4 text-cefide-accent-alt" /></Button>
                    </div>
                  </div>
                ))}
                {codigosComodin.length === 0 && <p className="px-3 py-6 text-center text-sm text-cefide-muted">No hay DNI comodín configurados</p>}
              </div>
              <p className="text-xs text-cefide-muted">Las altas, modificaciones y bajas se aplican al presionar Guardar.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Clases por frecuencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clasesUnaVez">1x por semana</Label>
                <Input
                  id="clasesUnaVez"
                  type="number"
                  min="1"
                  value={clasesUnaVez}
                  onChange={(e) => setClasesUnaVez(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clasesDosVeces">2x por semana</Label>
                <Input
                  id="clasesDosVeces"
                  type="number"
                  min="1"
                  value={clasesDosVeces}
                  onChange={(e) => setClasesDosVeces(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clasesTresVeces">3x por semana</Label>
                <Input
                  id="clasesTresVeces"
                  type="number"
                  min="1"
                  value={clasesTresVeces}
                  onChange={(e) => setClasesTresVeces(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clasesLibre">Libre</Label>
                <Input
                  id="clasesLibre"
                  type="number"
                  min="1"
                  value={clasesLibre}
                  onChange={(e) => setClasesLibre(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-cefide-muted">
              Clases asignadas al inscribir un alumno según su frecuencia semanal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tiempo de pantalla del molinete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tiempoVerde">Verde (seg)</Label>
                <Input
                  id="tiempoVerde"
                  type="number"
                  min="1"
                  max="30"
                  value={tiempoVerde}
                  onChange={(e) => setTiempoVerde(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tiempoAmarillo">Amarillo (seg)</Label>
                <Input
                  id="tiempoAmarillo"
                  type="number"
                  min="1"
                  max="30"
                  value={tiempoAmarillo}
                  onChange={(e) => setTiempoAmarillo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tiempoRojo">Rojo (seg)</Label>
                <Input
                  id="tiempoRojo"
                  type="number"
                  min="1"
                  max="30"
                  value={tiempoRojo}
                  onChange={(e) => setTiempoRojo(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-cefide-muted">
              Segundos que la pantalla del molinete muestra el estado del alumno
              (verde = acceso ok, amarillo = gracia, rojo = bloqueado) antes de
              volver a pedir el DNI.
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !reingresoValido}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
          {saved && <span className="text-sm text-cefide-success">Guardado</span>}
        </div>
      </div>
    </div>
  );
}
