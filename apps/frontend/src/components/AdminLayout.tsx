import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Users, GraduationCap, BookOpen, Receipt, Zap, ClipboardList, BarChart3, Settings, LogOut, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/admin/alumnos', label: 'Alumnos', icon: Users },
  { to: '/admin/actividades', label: 'Actividades', icon: Dumbbell },
  { to: '/admin/clases-pagos', label: 'Inscripciones', icon: BookOpen },
  { to: '/admin/pagos', label: 'Historial Pagos', icon: Receipt },
  { to: '/admin/molinetes', label: 'Molinetes', icon: Zap },
  { to: '/admin/ingresos', label: 'Log Ingresos', icon: ClipboardList },
  { to: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/admin/profesores', label: 'Profesores', icon: GraduationCap },
  { to: '/admin/config', label: 'Configuración', icon: Settings },
];

export function AdminLayout() {
  const { usuario, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="w-full md:w-56 md:shrink-0 border-b md:border-b-0 md:border-r border-cefide-border bg-cefide-surface flex flex-col">
        <div className="p-4 border-b border-cefide-border">
          <h1 className="text-xl font-bold text-cefide-accent">CEFIDE</h1>
          <p className="text-xs text-cefide-muted mt-1">Panel Admin</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:block md:flex-1 md:space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-cefide-accent/10 text-cefide-accent'
                    : 'text-cefide-muted hover:text-cefide-text hover:bg-cefide-bg',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 md:p-4 border-t border-cefide-border flex items-center justify-between md:block">
          <p className="text-xs text-cefide-muted truncate md:mb-2">{usuario?.email}</p>
          <Button variant="ghost" size="sm" className="md:w-full justify-start" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
          <p className="hidden md:block text-[11px] text-cefide-muted mt-3">
            Desarrollado por{' '}
            <a
              href="https://fullmindtech.com.ar/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cefide-accent hover:underline"
            >
              Fullmindtech
            </a>
            ®
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
