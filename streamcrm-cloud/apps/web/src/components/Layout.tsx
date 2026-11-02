import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import {
  Activity,
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorPlay,
  Settings,
  Users,
  UserCog,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { isOwner, useMe, useSetSession } from '../lib/auth';
import { ROLE_LABEL } from '../lib/format';
import type { Session } from '../lib/types';
import { cx } from './ui';

const NAV = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/suscripciones', label: 'Suscripciones', icon: MonitorPlay },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/cuentas', label: 'Cuentas', icon: CreditCard },
  { to: '/pagos', label: 'Pagos', icon: Wallet },
  { to: '/actividad', label: 'Llamadas y actividad', icon: Activity },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
  { to: '/equipo', label: 'Equipo', icon: UserCog, ownerOnly: true },
];

function TrialBanner({ s }: { s: Session }) {
  const t = s.tenant;
  if (!t) return null;
  if (t.subscriptionStatus === 'trialing' && t.trialEndsAt) {
    const days = Math.max(0, Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / 86400_000));
    return (
      <div className={cx('px-4 py-2 text-center text-sm', days > 0 ? 'bg-indigo-50 text-indigo-800' : 'bg-red-50 text-red-700')}>
        {days > 0
          ? `Prueba gratis del plan ${t.plan?.name ?? ''}: te quedan ${days} día${days === 1 ? '' : 's'}.`
          : 'Tu prueba terminó: los avisos automáticos están pausados.'}{' '}
        <span className="font-medium">El pago con Mercado Pago llega en la fase 3.</span>
      </div>
    );
  }
  if (t.subscriptionStatus === 'past_due') return <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">Hay un pago pendiente del plan.</div>;
  if (t.subscriptionStatus === 'suspended' || t.subscriptionStatus === 'canceled')
    return <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">Cuenta suspendida: los avisos automáticos están detenidos.</div>;
  return null;
}

export function Layout() {
  const s = useMe();
  const setSession = useSetSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setSession(null);
    navigate('/');
  };

  const items = s.tenant ? NAV.filter((n) => !n.ownerOnly || isOwner(s)) : [];

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">
          <MonitorPlay className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">StreamCRM</div>
          <div className="truncate text-xs text-slate-400">{s.tenant?.name ?? 'Super-admin'}</div>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 px-2">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white')
            }
          >
            <n.icon className="size-4" />
            {n.label}
          </NavLink>
        ))}
        {s.user.role === 'superadmin' && (
          <NavLink
            to="/admin"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cx('mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-slate-800 text-white' : 'text-amber-300 hover:bg-slate-800/60')
            }
          >
            <Building2 className="size-4" />
            Negocios (admin)
          </NavLink>
        )}
      </div>
      <div className="border-t border-slate-800 p-3">
        <div className="mb-2 px-1">
          <div className="truncate text-sm text-white">{s.user.name}</div>
          <div className="truncate text-xs text-slate-400">
            {ROLE_LABEL[s.user.role]} · {s.user.email}
          </div>
        </div>
        <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
          <LogOut className="size-4" /> Cerrar sesión
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-slate-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-2 top-3 p-1 text-slate-400" onClick={() => setOpen(false)} aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md p-1 text-slate-600" aria-label="Abrir menú">
          <Menu className="size-5" />
        </button>
        <span className="truncate text-sm font-semibold">{s.tenant?.name ?? 'StreamCRM'}</span>
      </div>
      <TrialBanner s={s} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
