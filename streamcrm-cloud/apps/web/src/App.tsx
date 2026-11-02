import { Navigate, Route, Routes } from 'react-router';
import { Spinner } from './components/ui';
import { Layout } from './components/Layout';
import { useSession } from './lib/auth';
import { Login, Signup } from './pages/Auth';
import { DashboardPage } from './pages/Dashboard';
import { SubscriptionsPage } from './pages/Subscriptions';
import { CustomersPage } from './pages/Customers';
import { AccountsPage } from './pages/Accounts';
import { PaymentsPage } from './pages/Payments';
import { ActivityPage } from './pages/Activity';
import { SettingsPage } from './pages/Settings';
import { TeamPage } from './pages/Team';
import { AdminPage } from './pages/Admin';

export function App() {
  const { data: session, isLoading, error } = useSession();
  if (isLoading) return <Spinner className="h-screen items-center" />;
  if (error) return <div className="p-8 text-center text-red-600">No se pudo conectar con el servidor. ¿Está corriendo la API?</div>;

  if (!session) {
    return (
      <Routes>
        <Route path="/registro" element={<Signup />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Super-admin sin negocio elegido: solo la lista de negocios.
  if (!session.tenant) {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="suscripciones" element={<SubscriptionsPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="cuentas" element={<AccountsPage />} />
        <Route path="pagos" element={<PaymentsPage />} />
        <Route path="actividad" element={<ActivityPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="equipo" element={<TeamPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
