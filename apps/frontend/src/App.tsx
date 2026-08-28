import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminLayout } from '@/components/AdminLayout';
import { LoginPage } from '@/pages/LoginPage';
import { AlumnosPage } from '@/pages/admin/AlumnosPage';
import { ActividadesPage } from '@/pages/admin/ActividadesPage';
import { ClasesPagosPage } from '@/pages/admin/ClasesPagosPage';
import { ConfigPage } from '@/pages/admin/ConfigPage';
import { MolinetesPage } from '@/pages/admin/MolinetesPage';
import { IngresosLogPage } from '@/pages/admin/IngresosLogPage';
import { ReportePage } from '@/pages/admin/ReportePage';
import { ProfesoresPage } from '@/pages/admin/ProfesoresPage';
import { PagosLogPage } from '@/pages/admin/PagosLogPage';
import { KioscoPage } from '@/pages/KioscoPage';
import { ProfesorDashboard } from '@/pages/ProfesorDashboard';

export function App() {
  const { hydrate, usuario } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/kiosco" element={<KioscoPage />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="alumnos" replace />} />
          <Route path="alumnos" element={<AlumnosPage />} />
          <Route path="actividades" element={<ActividadesPage />} />
          <Route path="clases-pagos" element={<ClasesPagosPage />} />
          <Route path="pagos" element={<PagosLogPage />} />
          <Route path="molinetes" element={<MolinetesPage />} />
          <Route path="ingresos" element={<IngresosLogPage />} />
          <Route path="reportes" element={<ReportePage />} />
          <Route path="profesores" element={<ProfesoresPage />} />
          <Route path="config" element={<ConfigPage />} />
        </Route>

        <Route
          path="/profesor/*"
          element={
            <ProtectedRoute allowedRoles={['PROFESOR']}>
              <ProfesorDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            usuario
              ? <Navigate to={usuario.rol === 'ADMIN' ? '/admin' : '/profesor'} replace />
              : <Navigate to="/login" replace />
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="bottom-right" />
    </BrowserRouter>
  );
}
