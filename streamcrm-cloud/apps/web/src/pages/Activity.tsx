import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { CHANNEL_LABEL, INTENT_LABEL, eventText, fmtDateTime } from '../lib/format';
import type { CallRow, EventRow, Intent } from '../lib/types';
import { Badge, Card, Empty, PageHeader, Spinner, Table, Td, cx } from '../components/ui';

export function ActivityPage() {
  const me = useMe();
  const tz = me.tenant?.timezone;
  const [tab, setTab] = useState<'calls' | 'events'>('calls');
  const callsQ = useQuery({ queryKey: ['calls'], queryFn: () => api<CallRow[]>('/activity/calls'), enabled: tab === 'calls' });
  const eventsQ = useQuery({ queryKey: ['events'], queryFn: () => api<EventRow[]>('/activity/events'), enabled: tab === 'events' });

  return (
    <>
      <PageHeader title="Llamadas y actividad" subtitle="Cada aviso enviado, lo que respondió el cliente y todo lo que pasó en el negocio." />
      <div className="mb-4 inline-flex gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {(
          [
            ['calls', 'Llamadas y mensajes'],
            ['events', 'Historial'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-md px-3 py-1.5 text-sm', tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'calls' ? (
        <Card padded={false}>
          {callsQ.isLoading ? (
            <Spinner />
          ) : !callsQ.data?.length ? (
            <Empty>Todavía no se envió ningún aviso.</Empty>
          ) : (
            <Table head={['Fecha', 'Cliente', 'Canal', 'Resultado', 'Duración', 'Resumen']}>
              {callsQ.data.map((c) => (
                <tr key={c.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(c.createdAt, tz)}</Td>
                  <Td>
                    <div className="font-medium">{c.customerName ?? '—'}</div>
                    <div className="text-xs text-slate-500">{c.phone}</div>
                  </Td>
                  <Td>{CHANNEL_LABEL[c.channel] ?? c.channel}</Td>
                  <Td>
                    {c.intent ? <Badge tone="indigo">{INTENT_LABEL[c.intent as Intent] ?? c.intent}</Badge> : <Badge>{c.status}</Badge>}
                    {c.disconnectionReason && <div className="mt-0.5 text-xs text-slate-500">{c.disconnectionReason}</div>}
                  </Td>
                  <Td>{c.durationMs ? `${Math.round(c.durationMs / 1000)} s` : '—'}</Td>
                  <Td className="max-w-md text-slate-600">
                    {c.summary ?? '—'}
                    {c.recordingUrl && (
                      <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="ml-1 text-indigo-600 hover:underline">
                        grabación
                      </a>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ) : (
        <Card padded={false}>
          {eventsQ.isLoading ? (
            <Spinner />
          ) : !eventsQ.data?.length ? (
            <Empty>Sin actividad.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {eventsQ.data.map((e) => (
                <li key={e.id} className="flex justify-between gap-4 px-4 py-2.5">
                  <span>{eventText(e)}</span>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(e.createdAt, tz)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
