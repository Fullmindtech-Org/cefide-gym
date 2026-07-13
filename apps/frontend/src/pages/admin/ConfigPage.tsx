import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useApiGet } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { ConfigSistema } from '@/types';

export function ConfigPage() {
  const token = useAuthStore((s) => s.token);
  const { data: config, mutate } = useApiGet<ConfigSistema>('/config');

  const [clasesGracia, setClasesGracia] = useState('2');
  const [diaVencimiento, setDiaVencimiento] = useState('5');
  const [clasesUnaVez, setClasesUnaVez] = useState('5');
  const [clasesDosVeces, setClasesDosVeces] = useState('9');
  const [clasesTresVeces, setClasesTresVeces] = useState('13');
  const [clasesLibre, setClasesLibre] = useState('30');
  const [tiempoVerde, setTiempoVerde] = useState('4');
  const [tiempoAmarillo, setTiempoAmarillo] = useState('5');
  const [tiempoRojo, setTiempoRojo] = useState('6');
  const [codigosComodin, setCodigosComodin] = useState('00000000,99999999');
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
      setCodigosComodin(config.codigosComodin ?? '');
    }
  }, [config]);

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
        codigosComodin: codigosComodin
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
          .join(','),
      }),
      token: token!,
    });
    mutate();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Códigos de acceso ilimitado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="codigosComodin">Códigos comodín (DNI)</Label>
              <Input
                id="codigosComodin"
                type="text"
                value={codigosComodin}
                onChange={(e) => setCodigosComodin(e.target.value)}
                placeholder="00000000,99999999"
              />
              <p className="text-xs text-cefide-muted">
                DNIs con acceso libre e ilimitado en el molinete. Separar varios
                con coma. Ej: <code>00000000,99999999</code>
              </p>
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
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
          {saved && <span className="text-sm text-cefide-success">Guardado</span>}
        </div>
      </div>
    </div>
  );
}
