import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, BellRing, Copy, Eye, FlaskConical, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import { api, devApi } from '../lib/api';
import { useMe } from '../lib/auth';
import {
  CHANNEL_LABEL,
  INTENT_LABEL,
  METHOD_LABEL,
  eventText,
  fmtDate,
  fmtDateTime,
  fmtDaysLeft,
  fmtMoney,
  todayIso,
  whatsappLink,
} from '../lib/format';
import type { Intent, PaymentMethod, SubDetail, SubRow } from '../lib/types';
import { Badge, Button, Card, Checkbox, Drawer, ErrorBox, Field, Input, IntentBadge, Modal, Select, Spinner, StatusBadge, useToast } from './ui';

/** Ejecuta una acción, refresca todos los datos del panel y muestra el resultado. */
export function useAction<V>(fn: (v: V) => Promise<unknown>, okText?: string | ((v: V) => string)) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      if (okText) toast(typeof okText === 'function' ? okText(v) : okText);
    },
    onError: (err) => toast((err as Error).message, false),
  });
}

export const reminderText = (s: SubRow) =>
  `Hola ${s.customerName.split(' ')[0]}, te recuerdo que tu ${s.serviceName ?? 'servicio'}${s.profileName ? ` (perfil ${s.profileName})` : ''} ${
    s.daysLeft < 0 ? 'venció el' : 'vence el'
  } ${fmtDate(s.endDate)}. La renovación es ${fmtMoney(s.price)}. ¿Deseas renovar?`;

// ---------- Renovar ----------

export function RenewModal({ sub, onClose }: { sub: SubRow; onClose: () => void }) {
  const [amount, setAmount] = useState(String(sub.price || ''));
  const [method, setMethod] = useState<PaymentMethod>('yape');
  const renew = useAction(
    () => api(`/subscriptions/${sub.id}/renew`, { body: { amount: Number(amount), method } }),
    `${sub.customerName} renovado. Se actualizará la hoja en unos segundos.`,
  );
  const base = sub.endDate >= todayIso() ? sub.endDate : todayIso();
  const [y, m, d] = base.split('-').map(Number);
  const newEnd = new Date(Date.UTC(y!, m! - 1, d! + sub.durationDays)).toISOString().slice(0, 10);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    renew.mutate(undefined, { onSuccess: onClose });
  };

  return (
    <Modal title={`Renovar · ${sub.customerName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <div>
            {sub.serviceName} {sub.profileName && `· perfil ${sub.profileName}`}
          </div>
          <div className="mt-1">
            Vence {fmtDate(sub.endDate)} → <span className="font-semibold text-slate-900">nuevo vencimiento {fmtDate(newEnd)}</span> ({sub.durationDays} días)
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (S/)">
            <Input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Método">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-slate-500">Se registra el pago y se cambia la FECHA INICIO en la hoja (las fórmulas recalculan el vencimiento).</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="success" loading={renew.isPending}>
            Registrar renovación
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Nueva venta ----------

export function NewSaleModal({ onClose }: { onClose: () => void }) {
  const services = useQuery({ queryKey: ['services'], queryFn: () => api<{ id: string; name: string; price: number; durationDays: number }[]>('/services') });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<{ id: string; email: string; serviceLabel: string | null }[]>('/accounts') });
  const [f, setF] = useState({
    customerName: '',
    phone: '',
    consentCalls: true,
    serviceName: '',
    durationDays: '30',
    price: '',
    cost: '',
    startDate: todayIso(),
    profileName: '',
    pin: '',
    accountEmail: '',
    paymentMethod: 'yape' as PaymentMethod | '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const create = useAction(
    () =>
      api('/subscriptions', {
        body: {
          ...f,
          durationDays: Number(f.durationDays),
          price: Number(f.price),
          cost: Number(f.cost || 0),
          paymentMethod: f.paymentMethod || undefined,
          accountEmail: f.accountEmail || undefined,
          profileName: f.profileName || undefined,
          pin: f.pin || undefined,
        },
      }),
    'Venta guardada. Se agregará como fila nueva en la hoja.',
  );

  const pickService = (name: string) => {
    const s = services.data?.find((x) => x.name === name);
    setF({ ...f, serviceName: name, ...(s && { price: String(s.price || f.price), durationDays: String(s.durationDays) }) });
  };

  return (
    <Modal title="Nueva venta" onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(undefined, { onSuccess: onClose });
        }}
        className="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <Input required value={f.customerName} onChange={set('customerName')} />
          </Field>
          <Field label="Teléfono" hint="Se guarda como +51 si no tiene código de país.">
            <Input value={f.phone} onChange={set('phone')} placeholder="987 654 321" />
          </Field>
          <Field label="Servicio">
            <Input required list="services-list" value={f.serviceName} onChange={(e) => pickService(e.target.value)} placeholder="NETFLIX 1 Perfil" />
            <datalist id="services-list">
              {services.data?.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Cuenta (correo)" hint="Opcional: una cuenta madre ya registrada.">
            <Select value={f.accountEmail} onChange={set('accountEmail')}>
              <option value="">— Sin cuenta —</option>
              {accounts.data?.map((a) => (
                <option key={a.id} value={a.email}>
                  {a.email} {a.serviceLabel ? `· ${a.serviceLabel}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Perfil">
            <Input value={f.profileName} onChange={set('profileName')} />
          </Field>
          <Field label="PIN">
            <Input value={f.pin} onChange={set('pin')} inputMode="numeric" />
          </Field>
          <Field label="Fecha de inicio">
            <Input type="date" required value={f.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="Duración (días)">
            <Input type="number" min="1" required value={f.durationDays} onChange={set('durationDays')} />
          </Field>
          <Field label="Precio de venta (S/)">
            <Input type="number" step="0.01" min="0" required value={f.price} onChange={set('price')} />
          </Field>
          <Field label="Costo (S/)" hint="Lo que te cuesta a ti (para la ganancia).">
            <Input type="number" step="0.01" min="0" value={f.cost} onChange={set('cost')} />
          </Field>
          <Field label="¿Ya pagó?">
            <Select value={f.paymentMethod} onChange={set('paymentMethod')}>
              <option value="">Todavía no</option>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  Sí, por {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Checkbox
          checked={f.consentCalls}
          onChange={(v) => setF({ ...f, consentCalls: v })}
          label="El cliente aceptó recibir llamadas automáticas de recordatorio"
        />
        <ErrorBox error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Guardar venta
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Detalle ----------

function CopyButton({ value }: { value: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      onClick={() => navigator.clipboard.writeText(value).then(() => toast('Copiado'))}
      aria-label="Copiar"
    >
      <Copy className="size-3.5" />
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{children}</span>
    </div>
  );
}

function AccountPassword({ accountId }: { accountId: string }) {
  const [pw, setPw] = useState<string | null>(null);
  const reveal = useMutation({ mutationFn: () => api<{ password: string | null }>(`/accounts/${accountId}/password`), onSuccess: (d) => setPw(d.password ?? '') });
  if (pw !== null)
    return (
      <span className="inline-flex items-center gap-1 font-mono">
        {pw || '—'} {pw && <CopyButton value={pw} />}
      </span>
    );
  return (
    <button className="inline-flex items-center gap-1 text-indigo-600 hover:underline" onClick={() => reveal.mutate()}>
      <Eye className="size-3.5" /> Ver
    </button>
  );
}

/** Herramientas de desarrollo: simular lo que haría Retell sin llamar de verdad. */
function DevTools({ sub }: { sub: SubDetail }) {
  const send = useAction(() => devApi(`/subscriptions/${sub.id}/send-now`), 'Aviso enviado (mira la consola de la API)');
  const simulate = useAction(
    (body: { renovacion?: string; noContesta?: boolean }) => devApi(`/subscriptions/${sub.id}/simulate-call`, body),
    'Respuesta simulada',
  );
  const sent = sub.reminderStatus === 'enviado';
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5 text-amber-700">
          <FlaskConical className="size-4" /> Probar sin llamar (solo desarrollo)
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <p className="mb-2 text-slate-600">1. Enviar el aviso ya (si es de noche, simula que son las 10:00).</p>
          <Button size="sm" variant="secondary" onClick={() => send.mutate(undefined)} loading={send.isPending}>
            Enviar aviso ahora
          </Button>
        </div>
        <div>
          <p className="mb-2 text-slate-600">2. Simular qué respondió el cliente en la llamada.</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Sí renuevo', body: { renovacion: 'sí, renuevo' } },
              { label: 'Lo pienso', body: { renovacion: 'lo voy a pensar' } },
              { label: 'Ya no', body: { renovacion: 'ya no quiero' } },
              { label: 'No contesta', body: { noContesta: true } },
            ].map((o) => (
              <Button key={o.label} size="sm" variant="secondary" disabled={!sent} onClick={() => simulate.mutate(o.body)}>
                {o.label}
              </Button>
            ))}
          </div>
          {!sent && <p className="mt-1 text-xs text-slate-400">Primero envía el aviso (paso 1).</p>}
        </div>
      </div>
    </Card>
  );
}

export function SubscriptionDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const me = useMe();
  const tz = me.tenant?.timezone;
  const q = useQuery({ queryKey: ['subscription', id], queryFn: () => api<SubDetail>(`/subscriptions/${id}`) });
  const [renewing, setRenewing] = useState(false);
  const setIntent = useAction((intent: Intent) => api(`/subscriptions/${id}/intent`, { body: { intent } }), (i) => `Marcado: ${INTENT_LABEL[i]}`);
  const remind = useAction(() => api(`/subscriptions/${id}/remind-now`, { method: 'POST' }), 'Se avisará en el próximo minuto (dentro del horario permitido)');
  const cancel = useAction(() => api(`/subscriptions/${id}/cancel`, { method: 'POST' }), 'Suscripción cancelada');

  const s = q.data;
  const wa = s && whatsappLink(s.phone, reminderText(s));

  return (
    <Drawer title={s ? s.customerName : 'Cargando…'} onClose={onClose}>
      {!s ? (
        <Spinner />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={s.status} daysLeft={s.daysLeft} />
            <IntentBadge intent={s.renewalIntent} />
            <span className="text-sm text-slate-500">{fmtDaysLeft(s.daysLeft)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {s.status !== 'cancelada' && (
              <Button variant="success" onClick={() => setRenewing(true)}>
                <RefreshCw className="size-4" /> Renovar
              </Button>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer">
                <Button variant="secondary">
                  <MessageCircle className="size-4" /> WhatsApp
                </Button>
              </a>
            )}
            {s.phone && (
              <a href={`tel:${s.phone}`}>
                <Button variant="secondary">
                  <Phone className="size-4" /> Llamar
                </Button>
              </a>
            )}
            {s.status !== 'cancelada' && (
              <Button variant="secondary" onClick={() => remind.mutate(undefined)} loading={remind.isPending}>
                <BellRing className="size-4" /> Avisar ahora
              </Button>
            )}
          </div>

          <Card title="Suscripción">
            <Row label="Servicio">{s.serviceName ?? '—'}</Row>
            <Row label="Perfil">{s.profileName ?? '—'}</Row>
            <Row label="PIN">
              {s.pin ? (
                <span className="inline-flex items-center gap-1 font-mono">
                  {s.pin} {s.canSeeSecrets && <CopyButton value={s.pin} />}
                </span>
              ) : (
                '—'
              )}
            </Row>
            {s.accountEmail && (
              <>
                <Row label="Cuenta">
                  <span className="inline-flex items-center gap-1">
                    {s.accountEmail} <CopyButton value={s.accountEmail} />
                  </span>
                </Row>
                {s.canSeeSecrets && s.streamAccountId && (
                  <Row label="Contraseña">
                    <AccountPassword accountId={s.streamAccountId} />
                  </Row>
                )}
              </>
            )}
            <Row label="Inicio">{fmtDate(s.startDate)}</Row>
            <Row label="Vence">
              <span className="font-medium">{fmtDate(s.endDate)}</span> ({s.durationDays} días)
            </Row>
            <Row label="Precio / costo">
              {fmtMoney(s.price)} / {fmtMoney(s.cost)} · ganancia {fmtMoney(s.price - s.cost)}
            </Row>
            <Row label="Teléfono">{s.phone ?? <span className="text-red-600">falta</span>}</Row>
            <Row label="Acepta llamadas">{s.consentCalls ? 'Sí' : <span className="text-amber-700">No (se avisa por WhatsApp o a mano)</span>}</Row>
            <Row label="Origen">
              {s.source === 'sheet' ? 'Hoja del negocio' : s.source === 'api' ? 'API' : 'Panel'}
              {s.sheetDirty && <Badge tone="blue">escribiendo en la hoja…</Badge>}
            </Row>
          </Card>

          <Card title="Aviso de renovación">
            <Row label="Estado">{s.reminderLabel}</Row>
            <Row label="Último contacto">{fmtDateTime(s.lastContactAt, tz)}</Row>
            {s.lastCallSummary && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{s.lastCallSummary}</p>}
            {s.recordingUrl && (
              <audio controls src={s.recordingUrl} className="mt-2 w-full">
                <track kind="captions" />
              </audio>
            )}
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-500">¿El cliente te respondió por otro medio? Regístralo:</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(INTENT_LABEL) as Intent[]).map((i) => (
                  <Button key={i} size="sm" variant={s.renewalIntent === i ? 'primary' : 'secondary'} onClick={() => setIntent.mutate(i)}>
                    {INTENT_LABEL[i]}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          {import.meta.env.DEV && s.status !== 'cancelada' && <DevTools sub={s} />}

          <Card title="Pagos" padded={false}>
            {s.payments.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {s.payments.map((p) => (
                  <li key={p.id} className="flex justify-between px-4 py-2">
                    <span>{fmtDateTime(p.paidAt, tz)}</span>
                    <span>
                      {fmtMoney(p.amount)} · {METHOD_LABEL[p.method]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-slate-500">Sin pagos registrados en el sistema.</p>
            )}
          </Card>

          {s.calls.length > 0 && (
            <Card title="Llamadas y mensajes" padded={false}>
              <ul className="divide-y divide-slate-100 text-sm">
                {s.calls.map((c) => (
                  <li key={c.id} className="px-4 py-2">
                    <div className="flex justify-between">
                      <span>{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                      <span className="text-slate-500">{fmtDateTime(c.createdAt, tz)}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.status}
                      {c.durationMs ? ` · ${Math.round(c.durationMs / 1000)} s` : ''}
                      {c.disconnectionReason ? ` · ${c.disconnectionReason}` : ''}
                    </div>
                    {c.summary && <p className="mt-1 text-slate-700">{c.summary}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Historial" padded={false}>
            <ul className="divide-y divide-slate-100 text-sm">
              {s.events.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 px-4 py-2">
                  <span className="text-slate-700">{eventText(e)}</span>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(e.createdAt, tz)}</span>
                </li>
              ))}
              {!s.events.length && <li className="px-4 py-3 text-slate-500">Sin movimientos todavía.</li>}
            </ul>
          </Card>

          {s.status !== 'cancelada' && (
            <div className="pt-2">
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`¿Cancelar la suscripción de ${s.customerName}? Ya no se le avisará.`)) cancel.mutate(undefined);
                }}
              >
                <Ban className="size-4" /> El cliente no sigue (cancelar)
              </Button>
            </div>
          )}
          <ErrorBox error={q.error} />
          {renewing && <RenewModal sub={s} onClose={() => setRenewing(false)} />}
        </>
      )}
    </Drawer>
  );
}
