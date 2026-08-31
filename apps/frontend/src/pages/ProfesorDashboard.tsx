import { useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { Search, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useApiGet } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth.store';
import { FRECUENCIA_LABEL } from '@/types';
import type { Alumno, PaginatedResponse } from '@/types';

export function ProfesorDashboard() {
  const { usuario, logout } = useAuthStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  params.set('limit', '50');

  const { data } = useApiGet<PaginatedResponse<Alumno>>(
    `/alumnos?${params.toString()}`,
  );

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-cefide-bg">
      <header className="border-b border-cefide-border p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cefide-accent">CEFIDE</h1>
          <p className="text-sm text-cefide-muted">
            Profesor — {usuario?.nombre} {usuario?.apellido}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-cefide-muted">{usuario?.email}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Buscar Alumno</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cefide-muted" />
              <Input
                placeholder="Buscar por DNI, nombre o apellido..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
          </CardContent>
        </Card>

        {data && data.data.length > 0 && (
          <div className="space-y-4">
            {data.data.map((alumno) => (
              <Card key={alumno.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold">{alumno.apellido}, {alumno.nombre}</p>
                      <p className="text-sm text-cefide-muted font-mono">{alumno.dni}</p>
                    </div>
                    <Badge variant={alumno.activo ? 'success' : 'muted'}>
                      {alumno.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>

                  {alumno.inscripciones && alumno.inscripciones.length > 0 ? (
                    <div className="space-y-2">
                      {alumno.inscripciones.map((ins) => {
                        const restantes = ins.clasesTotal - ins.clasesUsadas;
                        return (
                          <div key={ins.id} className="flex items-center justify-between text-sm bg-cefide-surface rounded-md px-3 py-2">
                            <span className="font-medium">{ins.actividad.nombre}</span>
                            <span className="text-cefide-muted">{FRECUENCIA_LABEL[ins.frecuencia]}</span>
                            <span className="font-mono">{ins.clasesUsadas}/{ins.clasesTotal}</span>
                            <Badge variant={ins.pagado && restantes > 0 ? 'success' : !ins.pagado && restantes > 0 ? 'warning' : 'destructive'}>
                              {ins.pagado ? 'Pagado' : 'Pendiente'}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-cefide-muted">Sin actividades inscriptas</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {data && data.data.length === 0 && search && (
          <p className="text-center text-cefide-muted py-8">No se encontraron alumnos</p>
        )}

        {!search && (
          <p className="text-center text-cefide-muted py-8">Ingrese un DNI o nombre para buscar</p>
        )}
      </main>
    </div>
  );
}
