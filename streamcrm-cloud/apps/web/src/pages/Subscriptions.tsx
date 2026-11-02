import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { INTENT_LABEL, fmtDate, fmtDaysLeft, fmtMoney } from '../lib/format';
import type { SubRow } from '../lib/types';
import { Button, Card, Empty, ErrorBox, Input, IntentBadge, PageHeader, Select, Spinner, StatusBadge, Table, Td, cx } from '../components/ui';
import { NewSaleModal, RenewModal, SubscriptionDrawer } from '../components/subscription';

const TABS = [
  { value: '', label: 'Todas' },
  { value: 'por_vencer', label: 'Por vencer' },
  { value: 'vencida', label: 'Vencidas' },
  { value: 'activa', label: 'Activas' },
  { value: 'cancelada', label: 'Canceladas' },
];

const PAGE_SIZE = 50;

export function SubscriptionsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const intent = params.get('intent') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const [renew, setRenew] = useState<SubRow | null>(null);
  const [newSale, setNewSale] = useState(false);

  const update = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  // Búsqueda con una pequeña espera para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => q !== (params.get('q') ?? '') && update('q', q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ['subscriptions', status, intent, params.get('q'), page],
    queryFn: () =>
      api<{ items: SubRow[]; total: number }>('/subscriptions', {
        query: { status, intent, q: params.get('q'), page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Suscripciones"
        subtitle="Lo que ya está en el sistema. Las ventas de la hoja entran a medida que se acerca su fecha."
        actions={
          <Button onClick={() => setNewSale(true)}>
            <Plus className="size-4" /> Nueva venta
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200 sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => update('status', t.value)}
            className={cx('rounded-md px-3 py-1.5 text-sm', status === t.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar por cliente, teléfono, servicio o correo de la cuenta" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="sm:w-56" value={intent} onChange={(e) => update('intent', e.target.value)}>
          <option value="">Cualquier respuesta</option>
          {Object.entries(INTENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      <ErrorBox error={list.error} />
      <Card padded={false}>
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.items.length ? (
          <Empty>No hay suscripciones con esos filtros.</Empty>
        ) : (
          <>
            {/* Tabla en pantallas grandes */}
            <div className="hidden md:block">
              <Table head={['Cliente', 'Servicio', 'Vence', 'Estado', 'Aviso', 'Respuesta', '']}>
                {list.data.items.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(s.id)}>
                    <Td>
                      <div className="font-medium text-slate-900">{s.customerName}</div>
                      <div className="text-xs text-slate-500">{s.phone ?? 'sin teléfono'}</div>
                    </Td>
                    <Td>
                      <div>{s.serviceName ?? '—'}</div>
                      <div className="text-xs text-slate-500">
                        {[s.profileName && `perfil ${s.profileName}`, fmtMoney(s.price)].filter(Boolean).join(' · ')}
                      </div>
                    </Td>
                    <Td>
                      <div className="whitespace-nowrap">{fmtDate(s.endDate)}</div>
                      <div className={cx('text-xs', s.daysLeft < 0 ? 'text-red-600' : s.daysLeft <= 3 ? 'text-amber-700' : 'text-slate-500')}>{fmtDaysLeft(s.daysLeft)}</div>
                    </Td>
                    <Td>
                      <StatusBadge status={s.status} daysLeft={s.daysLeft} />
                    </Td>
                    <Td className="max-w-56 text-xs text-slate-600">{s.reminderLabel}</Td>
                    <Td>
                      <IntentBadge intent={s.renewalIntent} />
                    </Td>
                    <Td>
                      {s.status !== 'cancelada' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenew(s);
                          }}
                        >
                          Renovar
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
            {/* Tarjetas en el celular */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {list.data.items.map((s) => (
                <li key={s.id} className="px-4 py-3" onClick={() => setOpen(s.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.customerName}</div>
                      <div className="text-sm text-slate-500">{s.serviceName}</div>
                    </div>
                    <StatusBadge status={s.status} daysLeft={s.daysLeft} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {fmtDate(s.endDate)} · {fmtDaysLeft(s.daysLeft)}
                    </span>
                    <IntentBadge intent={s.renewalIntent} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{s.reminderLabel}</div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm text-slate-500">
              <span>{list.data.total} en total</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => update('page', String(page - 1))} aria-label="Anterior">
                  <ChevronLeft className="size-4" />
                </Button>
                <span>
                  {page} / {pages}
                </span>
                <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => update('page', String(page + 1))} aria-label="Siguiente">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {open && <SubscriptionDrawer id={open} onClose={() => setOpen(null)} />}
      {renew && <RenewModal sub={renew} onClose={() => setRenew(null)} />}
      {newSale && <NewSaleModal onClose={() => setNewSale(false)} />}
    </>
  );
}
