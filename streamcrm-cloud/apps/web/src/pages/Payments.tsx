import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { METHOD_LABEL, fmtDateTime, fmtMoney, todayIso } from '../lib/format';
import type { PaymentRow } from '../lib/types';
import { Card, Empty, Field, Input, PageHeader, Spinner, Table, Td } from '../components/ui';

export function PaymentsPage() {
  const me = useMe();
  const [from, setFrom] = useState(`${todayIso().slice(0, 8)}01`);
  const [to, setTo] = useState(todayIso());
  const q = useQuery({
    queryKey: ['payments', from, to],
    queryFn: () => api<{ items: PaymentRow[]; total: number; count: number }>('/payments', { query: { from, to } }),
  });
  const byMethod = (q.data?.items ?? []).reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.method]: (acc[p.method] ?? 0) + p.amount }), {});

  return (
    <>
      <PageHeader title="Pagos" subtitle="Ventas y renovaciones cobradas que se registraron en el sistema." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {q.data && (
          <div className="ml-auto rounded-xl bg-white px-4 py-2 text-right shadow-sm ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">{q.data.count} pagos</div>
            <div className="text-xl font-semibold text-emerald-700">{fmtMoney(q.data.total)}</div>
            <div className="text-xs text-slate-500">
              {Object.entries(byMethod)
                .map(([m, v]) => `${METHOD_LABEL[m as keyof typeof METHOD_LABEL]} ${fmtMoney(v)}`)
                .join(' · ')}
            </div>
          </div>
        )}
      </div>
      <Card padded={false}>
        {q.isLoading ? (
          <Spinner />
        ) : !q.data?.items.length ? (
          <Empty>Sin pagos en estas fechas.</Empty>
        ) : (
          <Table head={['Fecha', 'Cliente', 'Servicio', 'Método', 'Monto']}>
            {q.data.items.map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(p.paidAt, me.tenant?.timezone)}</Td>
                <Td className="font-medium">{p.customerName ?? '—'}</Td>
                <Td>{p.serviceName ?? '—'}</Td>
                <Td>{METHOD_LABEL[p.method]}</Td>
                <Td className="font-medium">{fmtMoney(p.amount)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
