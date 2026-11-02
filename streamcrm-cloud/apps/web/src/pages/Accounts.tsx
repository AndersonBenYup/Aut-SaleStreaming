import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import { isOwner, useMe } from '../lib/auth';
import { fmtDate, fmtMoney } from '../lib/format';
import { Badge, Card, Empty, PageHeader, Spinner, Table, Td, useToast } from '../components/ui';

interface AccountRow {
  id: string;
  platform: string;
  serviceLabel: string | null;
  email: string;
  totalProfiles: number;
  usedProfiles: number;
  expiresOn: string | null;
  cost: number;
  provider: string | null;
  sheetStatus: string | null;
}

function Password({ id }: { id: string }) {
  const toast = useToast();
  const [pw, setPw] = useState<string | null>(null);
  const reveal = useMutation({
    mutationFn: () => api<{ password: string | null }>(`/accounts/${id}/password`),
    onSuccess: (d) => setPw(d.password ?? ''),
    onError: (e) => toast((e as Error).message, false),
  });
  if (pw === null)
    return (
      <button className="inline-flex items-center gap-1 text-indigo-600 hover:underline" onClick={() => reveal.mutate()}>
        <Eye className="size-3.5" /> Ver
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      {pw || '—'}
      {pw && (
        <button onClick={() => navigator.clipboard.writeText(pw).then(() => toast('Copiado'))} className="text-slate-400 hover:text-slate-700" aria-label="Copiar">
          <Copy className="size-3.5" />
        </button>
      )}
      <button onClick={() => setPw(null)} className="text-slate-400 hover:text-slate-700" aria-label="Ocultar">
        <EyeOff className="size-3.5" />
      </button>
    </span>
  );
}

export function AccountsPage() {
  const me = useMe();
  const canSee = isOwner(me) || !!me.tenant?.staffCanSeePasswords;
  const list = useQuery({ queryKey: ['accounts'], queryFn: () => api<AccountRow[]>('/accounts') });
  return (
    <>
      <PageHeader
        title="Cuentas madre"
        subtitle="Las cuentas entran al sistema cuando se importa una venta que las usa (pestaña CUENTAS de la hoja). Las contraseñas se guardan cifradas."
      />
      <Card padded={false}>
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.length ? (
          <Empty>Todavía no hay cuentas en el sistema.</Empty>
        ) : (
          <Table head={['Cuenta', 'Servicio', 'Perfiles', 'Vence', 'Costo', 'Proveedor', 'Contraseña']}>
            {list.data.map((a) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.email}</Td>
                <Td>
                  {a.serviceLabel ?? a.platform}
                  {a.sheetStatus && (
                    <span className="ml-1.5">
                      <Badge tone={a.sheetStatus.toUpperCase() === 'DISPONIBLE' ? 'green' : 'gray'}>{a.sheetStatus}</Badge>
                    </span>
                  )}
                </Td>
                <Td>
                  {a.usedProfiles} / {a.totalProfiles}
                </Td>
                <Td>{fmtDate(a.expiresOn)}</Td>
                <Td>{fmtMoney(a.cost)}</Td>
                <Td>{a.provider ?? '—'}</Td>
                <Td>{canSee ? <Password id={a.id} /> : <span className="text-xs text-slate-400">solo el dueño</span>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
