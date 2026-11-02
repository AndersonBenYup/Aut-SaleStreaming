import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertTriangle, Bot, CalendarClock, CircleDollarSign, FileSpreadsheet, MessageCircle, Plus, RefreshCw, TimerReset } from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { eventText, fmtDate, fmtDateTime, fmtDaysLeft, fmtMoney, fmtRelative, whatsappLink } from '../lib/format';
import type { Dashboard, SubRow } from '../lib/types';
import { Button, Card, Empty, ErrorBox, IntentBadge, PageHeader, Spinner, StatusBadge, cx } from '../components/ui';
import { NewSaleModal, RenewModal, SubscriptionDrawer, reminderText, useAction } from '../components/subscription';

function Kpi({ label, value, hint, tone, to, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string; to?: string; icon: ReactNode }) {
  const body = (
    <div className={cx('h-full rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition', to && 'hover:ring-indigo-300')}>
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className={cx('mt-2 text-2xl font-semibold', tone ?? 'text-slate-900')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function SheetCard({ d }: { d: Dashboard }) {
  const scan = useAction(() => api<{ imported: number; waiting: number }>('/settings/sheet/scan', { method: 'POST' }), 'Hoja leída');
  const s = d.sheet;
  if (!s.connected) {
    return (
      <Card title="Hoja del negocio">
        <p className="text-sm text-slate-600">Conecta tu Google Sheet para que el sistema lea tus ventas y escriba las respuestas de los clientes.</p>
        <Link to="/ajustes#hoja">
          <Button className="mt-3" size="sm">
            <FileSpreadsheet className="size-4" /> Conectar hoja
          </Button>
        </Link>
      </Card>
    );
  }
  const st = s.stats ?? {};
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          <FileSpreadsheet className="size-4 text-emerald-600" /> Hoja del negocio {s.provider === 'xlsx' && <span className="font-normal text-slate-400">(archivo demo)</span>}
        </span>
      }
      actions={
        <Button size="sm" variant="secondary" onClick={() => scan.mutate(undefined)} loading={scan.isPending}>
          <RefreshCw className="size-3.5" /> Leer ahora
        </Button>
      }
    >
      {s.lastError && (
        <div className="mb-3 flex gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" /> {s.lastError}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-lg font-semibold">{st.rows ?? '—'}</div>
          <div className="text-xs text-slate-500">filas en la hoja</div>
        </div>
        <div className="rounded-lg bg-indigo-50 p-2">
          <div className="text-lg font-semibold text-indigo-700">{d.inDb}</div>
          <div className="text-xs text-slate-500">en el sistema</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-lg font-semibold">{st.waiting ?? '—'}</div>
          <div className="text-xs text-slate-500">esperando su fecha</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Última lectura {fmtRelative(s.lastScanAt)}. Se lee sola cada 15 min; solo entran al sistema las ventas que vencen en las próximas 48 h.
      </p>
    </Card>
  );
}

function AttentionRow({ s, onOpen, onRenew }: { s: SubRow; onOpen: () => void; onRenew: () => void }) {
  const wa = whatsappLink(s.phone, reminderText(s));
  const why =
    s.renewalIntent === 'renueva'
      ? 'Dijo que renueva: coordina el pago'
      : s.renewalIntent === 'pensando'
        ? 'Lo está pensando: insiste'
        : s.reminderChannelUsed === 'manual'
          ? s.lastCallSummary ?? 'Avisar manualmente'
          : 'No contestó los avisos';
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{s.customerName}</span>
          <IntentBadge intent={s.renewalIntent} />
        </div>
        <div className="text-sm text-slate-500">
          {s.serviceName} · {fmtDate(s.endDate)} ({fmtDaysLeft(s.daysLeft)})
        </div>
        <div className="text-xs text-slate-500">{why}</div>
      </button>
      <div className="flex gap-2">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">
              <MessageCircle className="size-3.5" /> WhatsApp
            </Button>
          </a>
        )}
        <Button size="sm" variant="success" onClick={onRenew}>
          Renovar
        </Button>
      </div>
    </li>
  );
}

export function DashboardPage() {
  const me = useMe();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard'), refetchInterval: 30_000 });
  const [open, setOpen] = useState<string | null>(null);
  const [renew, setRenew] = useState<SubRow | null>(null);
  const [newSale, setNewSale] = useState(false);

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <ErrorBox error={q.error} />;
  const d = q.data;
  const tz = me.tenant?.timezone;
  const minutesLimit = me.tenant?.plan?.limits.ai_minutes_per_month ?? 0;

  return (
    <>
      <PageHeader
        title={`Hola, ${me.user.name.split(' ')[0]}`}
        subtitle={`Hoy es ${fmtDate(d.today)}`}
        actions={
          <Button onClick={() => setNewSale(true)}>
            <Plus className="size-4" /> Nueva venta
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Vencen hoy" value={d.counts.venceHoy} tone={d.counts.venceHoy ? 'text-red-600' : undefined} icon={<CalendarClock className="size-4" />} to="/suscripciones?status=por_vencer" />
        <Kpi label="Por vencer" value={d.counts.por_vencer} hint="hoy a 3 días" tone="text-amber-600" icon={<TimerReset className="size-4" />} to="/suscripciones?status=por_vencer" />
        <Kpi label="Vencidas" value={d.counts.vencida} tone="text-red-600" icon={<AlertTriangle className="size-4" />} to="/suscripciones?status=vencida" />
        <Kpi label="Renovaciones" value={d.month.renewals} hint="este mes" icon={<RefreshCw className="size-4" />} to="/pagos" />
        <Kpi label="Cobrado" value={fmtMoney(d.month.revenue)} hint={`${d.month.payments} pagos este mes`} tone="text-emerald-700" icon={<CircleDollarSign className="size-4" />} to="/pagos" />
        <Kpi
          label="Minutos IA"
          value={`${d.aiMinutesUsed} / ${minutesLimit}`}
          hint={minutesLimit ? 'usados este mes' : 'tu plan no incluye llamadas'}
          icon={<Bot className="size-4" />}
          to="/actividad"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title={`Para hacer hoy (${d.attention.length})`}
            actions={
              <span className="text-xs text-slate-500">
                {d.intents.renueva ?? 0} renuevan · {d.intents.pensando ?? 0} lo piensan · {d.intents.no_renueva ?? 0} no renuevan
              </span>
            }
            padded={false}
          >
            {d.attention.length ? (
              <ul className="divide-y divide-slate-100">
                {d.attention.map((s) => (
                  <AttentionRow key={s.id} s={s} onOpen={() => setOpen(s.id)} onRenew={() => setRenew(s)} />
                ))}
              </ul>
            ) : (
              <Empty>Nada pendiente. Aquí aparecen los clientes que dijeron que renuevan, los que lo están pensando y los que no se pudo contactar.</Empty>
            )}
          </Card>

          <Card title="Próximos avisos automáticos" padded={false}>
            {d.upcoming.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {d.upcoming.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setOpen(s.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50">
                      <span>
                        <span className="font-medium">{s.customerName}</span> <span className="text-slate-500">· {s.serviceName}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={s.status} daysLeft={s.daysLeft} />
                        <span className="text-slate-500">{fmtDateTime(s.reminderAt, tz)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No hay avisos programados. Lee la hoja o registra una venta.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <SheetCard d={d} />
          <Card title="Actividad reciente" padded={false} actions={<Link to="/actividad" className="text-xs text-indigo-600 hover:underline">Ver todo</Link>}>
            <ul className="divide-y divide-slate-100 text-sm">
              {d.recent.map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <div className="text-slate-700">{eventText(e)}</div>
                  <div className="text-xs text-slate-400">{fmtDateTime(e.createdAt, tz)}</div>
                </li>
              ))}
              {!d.recent.length && <li className="px-4 py-3 text-slate-500">Sin actividad todavía.</li>}
            </ul>
          </Card>
        </div>
      </div>

      {open && <SubscriptionDrawer id={open} onClose={() => setOpen(null)} />}
      {renew && <RenewModal sub={renew} onClose={() => setRenew(null)} />}
      {newSale && <NewSaleModal onClose={() => setNewSale(false)} />}
    </>
  );
}
