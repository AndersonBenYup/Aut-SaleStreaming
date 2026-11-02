import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { ROLE_LABEL, fmtRelative } from '../lib/format';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td } from '../components/ui';
import { useAction } from '../components/subscription';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  lastLoginAt: string | null;
  disabledAt: string | null;
}

function AddUser({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'staff' });
  const add = useAction(() => api('/team', { body: f }), `Usuario creado. Pásale su email y contraseña.`);
  return (
    <Modal title="Agregar usuario" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(undefined, { onSuccess: onClose });
        }}
      >
        <Field label="Nombre">
          <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Contraseña inicial" hint="Mínimo 8 caracteres. Puede cambiarla en Ajustes.">
          <Input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label="Rol">
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="staff">Vendedor: vende, renueva y registra respuestas</option>
            <option value="owner">Dueño: además cambia ajustes, hoja y equipo</option>
          </Select>
        </Field>
        <ErrorBox error={add.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={add.isPending}>
            Crear usuario
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TeamPage() {
  const me = useMe();
  const q = useQuery({ queryKey: ['team'], queryFn: () => api<{ users: Member[]; maxUsers: number }>('/team') });
  const [adding, setAdding] = useState(false);
  const update = useAction((v: { id: string; body: Record<string, unknown> }) => api(`/team/${v.id}`, { method: 'PATCH', body: v.body }), 'Usuario actualizado');
  const active = q.data?.users.filter((u) => !u.disabledAt).length ?? 0;

  return (
    <>
      <PageHeader
        title="Equipo"
        subtitle={q.data && `${active} de ${q.data.maxUsers} usuarios activos en tu plan`}
        actions={
          <Button onClick={() => setAdding(true)} disabled={!!q.data && active >= q.data.maxUsers}>
            <UserPlus className="size-4" /> Agregar usuario
          </Button>
        }
      />
      <Card padded={false}>
        {!q.data ? (
          <Spinner />
        ) : (
          <Table head={['Nombre', 'Email', 'Rol', 'Último ingreso', '']}>
            {q.data.users.map((u) => (
              <tr key={u.id} className={u.disabledAt ? 'opacity-50' : ''}>
                <Td className="font-medium">
                  {u.name} {u.id === me.user.id && <Badge tone="indigo">tú</Badge>}
                </Td>
                <Td>{u.email}</Td>
                <Td>
                  {u.id === me.user.id ? (
                    ROLE_LABEL[u.role]
                  ) : (
                    <Select className="w-32" value={u.role} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value } })}>
                      <option value="staff">Vendedor</option>
                      <option value="owner">Dueño</option>
                    </Select>
                  )}
                </Td>
                <Td>{fmtRelative(u.lastLoginAt)}</Td>
                <Td>
                  {u.id !== me.user.id && (
                    <Button size="sm" variant={u.disabledAt ? 'secondary' : 'danger'} onClick={() => update.mutate({ id: u.id, body: { disabled: !u.disabledAt } })}>
                      {u.disabledAt ? 'Reactivar' : 'Desactivar'}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <ErrorBox error={q.error} />
      {adding && <AddUser onClose={() => setAdding(false)} />}
    </>
  );
}
