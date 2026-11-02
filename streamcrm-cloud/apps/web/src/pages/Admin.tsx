import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useMe, useSetSession } from '../lib/auth';
import { fmtDate } from '../lib/format';
import type { Session } from '../lib/types';
import { Badge, Button, Card, PageHeader, Spinner, Table, Td, useToast } from '../components/ui';

interface TenantRow {
  id: string;
  name: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  plan: string | null;
  createdAt: string;
  subscriptions: number;
  users: number;
}

const STATUS_TONE = { trialing: 'indigo', active: 'green', past_due: 'amber', suspended: 'red', canceled: 'gray' } as const;

export function AdminPage() {
  const me = useMe();
  const setSession = useSetSession();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin-tenants'], queryFn: () => api<TenantRow[]>('/admin/tenants'), enabled: me.user.role === 'superadmin' });

  if (me.user.role !== 'superadmin') return <p className="text-sm text-slate-500">Solo para el super-admin.</p>;

  const enter = async (tenantId: string | null) => {
    try {
      setSession(await api<Session>('/auth/switch-tenant', { body: { tenantId } }));
      navigate(tenantId ? '/' : '/admin');
    } catch (err) {
      toast((err as Error).message, false);
    }
  };

  return (
    <>
      <PageHeader
        title="Negocios"
        subtitle="Vista mínima del super-admin. Métricas, suspensiones y planes llegan en la fase 4."
        actions={me.tenant && <Button variant="secondary" onClick={() => enter(null)}>Salir de {me.tenant.name}</Button>}
      />
      <Card padded={false}>
        {!q.data ? (
          <Spinner />
        ) : (
          <Table head={['Negocio', 'Estado', 'Plan', 'Suscripciones', 'Usuarios', 'Alta', '']}>
            {q.data.map((t) => (
              <tr key={t.id}>
                <Td className="font-medium">{t.name}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[t.subscriptionStatus as keyof typeof STATUS_TONE] ?? 'gray'}>{t.subscriptionStatus}</Badge>
                </Td>
                <Td>{t.plan ?? '—'}</Td>
                <Td>{t.subscriptions}</Td>
                <Td>{t.users}</Td>
                <Td>{fmtDate(t.createdAt)}</Td>
                <Td>
                  <Button size="sm" variant="secondary" onClick={() => enter(t.id)} disabled={me.tenant?.id === t.id}>
                    {me.tenant?.id === t.id ? 'Viendo' : 'Entrar'}
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
