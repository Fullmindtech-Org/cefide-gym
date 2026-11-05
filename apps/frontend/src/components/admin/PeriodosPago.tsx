import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatoPeriodoArgentina, periodoActualArgentina } from '@/lib/fecha-argentina';

export function PeriodosPago({ periodos, onChange, disabled }: {
  periodos: string[]; onChange: (periodos: string[]) => void; disabled: boolean;
}) {
  const [nuevo, setNuevo] = useState(periodoActualArgentina);
  const valido = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(nuevo);
  return <div className="space-y-2">
    <p className="text-sm font-medium">Períodos seleccionados</p>
    <div className="flex flex-wrap gap-2">
      {periodos.map(p => <Button key={p} variant="outline" size="sm" disabled={disabled}
        aria-label={`Quitar ${formatoPeriodoArgentina(p)}`}
        onClick={() => onChange(periodos.filter(actual => actual !== p))}>
        {formatoPeriodoArgentina(p)} ×
      </Button>)}
    </div>
    <div className="flex gap-2">
      <Input type="month" aria-label="Mes y año del período" value={nuevo}
        min="1000-01" max="9999-12" disabled={disabled} onChange={e => setNuevo(e.target.value)} />
      <Button variant="outline" disabled={disabled || !valido || periodos.includes(nuevo) || periodos.length >= 12}
        onClick={() => onChange([...periodos, nuevo].sort())}>Agregar</Button>
    </div>
    <p className="text-xs text-cefide-muted">Seleccioná hasta 12 meses anteriores, actuales o futuros. Para quitar un mes, presionalo.</p>
  </div>;
}
