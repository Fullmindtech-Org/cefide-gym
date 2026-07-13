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
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-cefide-border bg-cefide-surface flex flex-col">
        <div className="p-4 border-b border-cefide-border">
          <h1 className="text-xl font-bold text-cefide-accent">CEFIDE</h1>
          <p className="text-xs text-cefide-muted mt-1">Panel Admin</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
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
        <div className="p-4 border-t border-cefide-border">
          <p className="text-xs text-cefide-muted truncate mb-2">{usuario?.email}</p>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
          <p className="text-[11px] text-cefide-muted mt-3">
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

      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
