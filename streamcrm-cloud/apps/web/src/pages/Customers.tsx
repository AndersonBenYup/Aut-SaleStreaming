import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDate, fmtDaysLeft } from '../lib/format';
import type { SubRow } from '../lib/types';
import { Badge, Button, Card, Checkbox, Drawer, Empty, ErrorBox, Field, Input, IntentBadge, PageHeader, Spinner, StatusBadge, Table, Td, Textarea } from '../components/ui';
import { SubscriptionDrawer, useAction } from '../components/subscription';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consentCalls: boolean;
  notes: string | null;
  subscriptions: number;
  nextEndDate: string | null;
}

function CustomerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api<Omit<CustomerRow, 'subscriptions'> & { subscriptions: SubRow[] }>(`/customers/${id}`) });
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; phone: string; notes: string; consentCalls: boolean } | null>(null);
  const save = useAction(() => api(`/customers/${id}`, { method: 'PATCH', body: form }), 'Cliente actualizado');
  const c = q.data;
  const f = form ?? (c ? { name: c.name, phone: c.phone ?? '', notes: c.notes ?? '', consentCalls: c.consentCalls } : null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined, { onSuccess: () => setForm(null) });
  };

  return (
    <Drawer title={c?.name ?? 'Cliente'} onClose={onClose}>
      {!c || !f ? (
        <Spinner />
      ) : (
        <>
          <Card title="Datos">
            <form onSubmit={submit} className="space-y-3">
              <Field label="Nombre">
                <Input value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} />
              </Field>
              <Field label="Teléfono">
                <Input value={f.phone} onChange={(e) => setForm({ ...f, phone: e.target.value })} />
              </Field>
              <Field label="Notas">
                <Textarea rows={2} value={f.notes} onChange={(e) => setForm({ ...f, notes: e.target.value })} />
              </Field>
              <Checkbox checked={f.consentCalls} onChange={(v) => setForm({ ...f, consentCalls: v })} label="Acepta llamadas automáticas" />
              <ErrorBox error={save.error} />
              <Button type="submit" size="sm" disabled={!form} loading={save.isPending}>
                Guardar
              </Button>
            </form>
          </Card>
          <Card title="Suscripciones" padded={false}>
            <ul className="divide-y divide-slate-100 text-sm">
              {c.subscriptions.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setOpenSub(s.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50">
                    <span>
                      <div className="font-medium">{s.serviceName}</div>
                      <div className="text-xs text-slate-500">
                        {fmtDate(s.endDate)} · {fmtDaysLeft(s.daysLeft)}
                      </div>
                    </span>
                    <span className="flex gap-1.5">
                      <StatusBadge status={s.status} daysLeft={s.daysLeft} />
                      <IntentBadge intent={s.renewalIntent} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {openSub && <SubscriptionDrawer id={openSub} onClose={() => setOpenSub(null)} />}
        </>
      )}
    </Drawer>
  );
}

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['customers', q], queryFn: () => api<CustomerRow[]>('/customers', { query: { q } }) });

  return (
    <>
      <PageHeader title="Clientes" subtitle="Se crean solos al leer la hoja o al registrar una venta." />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
        <Input className="pl-9" placeholder="Buscar por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card padded={false}>
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.length ? (
          <Empty>Sin clientes todavía.</Empty>
        ) : (
          <Table head={['Cliente', 'Teléfono', 'Llamadas', 'Suscripciones', 'Próximo vencimiento']}>
            {list.data.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(c.id)}>
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.phone ?? <span className="text-red-600">falta</span>}</Td>
                <Td>{c.consentCalls ? <Badge tone="green">Acepta</Badge> : <Badge>No</Badge>}</Td>
                <Td>{c.subscriptions}</Td>
                <Td>{fmtDate(c.nextEndDate)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {open && <CustomerDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
