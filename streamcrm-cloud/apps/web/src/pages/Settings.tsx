import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { isOwner, useMe } from '../lib/auth';
import { fmtRelative } from '../lib/format';
import type { PlanLimits, SheetInfo } from '../lib/types';
import { Badge, Button, Card, Checkbox, ErrorBox, Field, Input, PageHeader, Select, Spinner, useToast } from '../components/ui';
import { useAction } from '../components/subscription';

interface Settings {
  name: string;
  country: string;
  timezone: string;
  reminderChannel: 'retell' | 'whatsapp' | 'manual';
  reminderDaysBefore: number;
  reminderHour: number;
  allowedStartHour: number;
  allowedEndHour: number;
  retellFromNumber: string | null;
  whatsappPhoneNumberId: string | null;
  hasWhatsappToken: boolean;
  whatsappTemplate: string;
  ownerNotifyPhone: string | null;
  staffCanSeePasswords: boolean;
  plan: { code: string; name: string; limits: PlanLimits } | null;
}

const HOURS = Array.from({ length: 25 }, (_, h) => h);
const TIMEZONES = ['America/Lima', 'America/Bogota', 'America/Guayaquil', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/La_Paz', 'America/Caracas'];

function Section({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className="grid scroll-mt-6 gap-4 border-b border-slate-200 py-6 first:pt-0 last:border-0 lg:grid-cols-3">
      <div>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      <div className="lg:col-span-2">{children}</div>
    </div>
  );
}

function SheetSection({ owner }: { owner: boolean }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['sheet'], queryFn: () => api<SheetInfo>('/settings/sheet') });
  const [f, setF] = useState({ url: '', salesTab: 'VENTAS', accountsTab: 'CUENTAS', dateOrder: 'dmy' });
  const [result, setResult] = useState<{ detected: string[]; missing: string[]; systemColumnsCreated: string[]; rows: number; invalidRows: number } | null>(null);
  const connect = useAction(
    async () => setResult(await api('/settings/sheet', { body: f })),
    'Hoja conectada y leída',
  );
  const scan = useAction(() => api('/settings/sheet/scan', { method: 'POST' }), 'Hoja leída');
  const disconnect = useAction(() => api('/settings/sheet', { method: 'DELETE' }), 'Hoja desconectada');
  const s = q.data;

  useEffect(() => {
    if (s?.provider === 'google' && s.url) setF((x) => ({ ...x, url: s.url!, salesTab: s.salesTab, accountsTab: s.accountsTab, dateOrder: s.dateOrder }));
  }, [s]);

  if (!s) return <Spinner />;
  const connected = !!s.provider;

  return (
    <div className="space-y-4">
      {connected && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 size-5 text-emerald-600" />
              <div className="text-sm">
                <div className="font-medium text-slate-900">
                  {s.provider === 'google' ? 'Google Sheets conectada' : `Archivo de demo: ${s.fileName}`}
                </div>
                <div className="text-slate-500">
                  Pestañas {s.salesTab} y {s.accountsTab} · leída {fmtRelative(s.lastScanAt)}
                </div>
                {s.stats && (
                  <div className="mt-1 text-slate-500">
                    {s.stats.rows} filas · {s.stats.imported} nuevas en la última lectura · {s.stats.waiting} esperando su fecha
                    {s.stats.invalid ? ` · ${s.stats.invalid} sin fecha válida` : ''}
                  </div>
                )}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-indigo-600 hover:underline">
                    Abrir la hoja <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => scan.mutate(undefined)} loading={scan.isPending}>
                <RefreshCw className="size-3.5" /> Leer ahora
              </Button>
              {owner && (
                <Button size="sm" variant="danger" onClick={() => window.confirm('¿Desconectar la hoja? Lo que ya está en el sistema se conserva.') && disconnect.mutate(undefined)}>
                  Desconectar
                </Button>
              )}
            </div>
          </div>
          {s.lastError && (
            <div className="mt-3 flex gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
              <AlertTriangle className="size-4 shrink-0" /> {s.lastError}
            </div>
          )}
        </Card>
      )}

      {owner && (
        <Card title={connected ? 'Cambiar a otra Google Sheet' : 'Conectar tu Google Sheet'}>
          <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
            <li>Abre tu hoja en Google Sheets y pulsa <b>Compartir</b>.</li>
            <li>
              Agrega como <b>Editor</b> a:{' '}
              {s.serviceAccountEmail ? (
                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                  {s.serviceAccountEmail}
                  <button onClick={() => navigator.clipboard.writeText(s.serviceAccountEmail!).then(() => toast('Copiado'))} aria-label="Copiar">
                    <Copy className="size-3.5" />
                  </button>
                </span>
              ) : (
                <span className="text-amber-700">(el servidor aún no tiene cuenta de Google: falta GOOGLE_SERVICE_ACCOUNT_JSON en el .env, ver docs/google-sheets.md)</span>
              )}
            </li>
            <li>Copia el enlace de la hoja y pégalo aquí.</li>
          </ol>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              connect.mutate(undefined);
            }}
            className="space-y-3"
          >
            <Field label="Enlace de la hoja">
              <Input required value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…/edit" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Pestaña de ventas">
                <Input value={f.salesTab} onChange={(e) => setF({ ...f, salesTab: e.target.value })} />
              </Field>
              <Field label="Pestaña de cuentas">
                <Input value={f.accountsTab} onChange={(e) => setF({ ...f, accountsTab: e.target.value })} />
              </Field>
              <Field label="Fechas como 05/04/2026" hint="Cómo leer fechas ambiguas">
                <Select value={f.dateOrder} onChange={(e) => setF({ ...f, dateOrder: e.target.value })}>
                  <option value="dmy">5 de abril (día/mes)</option>
                  <option value="mdy">4 de mayo (mes/día)</option>
                </Select>
              </Field>
            </div>
            <ErrorBox error={connect.error} />
            <Button type="submit" loading={connect.isPending} disabled={!s.serviceAccountEmail}>
              Probar y conectar
            </Button>
          </form>
          {result && (
            <div className="mt-4 space-y-1 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-4" /> {result.rows} ventas encontradas
                {result.invalidRows ? `, ${result.invalidRows} filas sin fecha válida` : ''}
              </div>
              <div>Columnas reconocidas: {result.detected.join(', ')}</div>
              {result.missing.length > 0 && <div className="text-amber-800">Te conviene agregar: {result.missing.join(', ')} (sin ellas no se puede llamar).</div>}
              {result.systemColumnsCreated.length > 0 && <div>Columnas que creó el sistema al final: {result.systemColumnsCreated.join(', ')}</div>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function PasswordSection() {
  const [f, setF] = useState({ current: '', next: '' });
  const change = useAction(() => api('/auth/password', { body: f }), 'Contraseña cambiada. Se cerraron tus otras sesiones.');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate(undefined, { onSuccess: () => setF({ current: '', next: '' }) });
      }}
      className="grid max-w-md gap-3"
    >
      <Field label="Contraseña actual">
        <Input type="password" required autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      </Field>
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
        <Input type="password" required minLength={8} autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
      </Field>
      <ErrorBox error={change.error} />
      <div>
        <Button type="submit" variant="secondary" loading={change.isPending}>
          Cambiar contraseña
        </Button>
      </div>
    </form>
  );
}

export function SettingsPage() {
  const me = useMe();
  const owner = isOwner(me);
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const [f, setF] = useState<(Settings & { whatsappToken?: string }) | null>(null);
  const save = useAction((body: Record<string, unknown>) => api('/settings', { method: 'PATCH', body }), 'Ajustes guardados');

  useEffect(() => {
    if (q.data) setF({ ...q.data, whatsappToken: '' });
  }, [q.data]);

  useEffect(() => {
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  }, [f === null]);

  if (!f) return <Spinner />;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const allowed = f.plan?.limits.channels_allowed ?? ['manual'];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { plan: _plan, hasWhatsappToken: _h, whatsappToken, ...rest } = f;
    save.mutate({ ...rest, ...(whatsappToken ? { whatsappToken } : {}) });
  };

  return (
    <>
      <PageHeader title="Ajustes" subtitle={owner ? undefined : 'Solo el dueño puede cambiar los ajustes del negocio.'} />
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <Section
          id="hoja"
          title="Hoja de cálculo"
          description="Tu Google Sheet sigue siendo tu base de datos. El sistema la lee cada 15 minutos y escribe en sus propias columnas al final (INTENCIÓN, RECORDATORIO, …). Nunca toca tus fórmulas."
        >
          <SheetSection owner={owner} />
        </Section>

        <form onSubmit={submit}>
          <fieldset disabled={!owner} className="contents">
            <Section title="Negocio">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input value={f.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Tu WhatsApp" hint="Para avisarte cuando un cliente quiere renovar.">
                  <Input value={f.ownerNotifyPhone ?? ''} onChange={(e) => set('ownerNotifyPhone', e.target.value)} />
                </Field>
                <Field label="Zona horaria">
                  <Select value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
                    {[...new Set([f.timezone, ...TIMEZONES])].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="País (teléfonos sin código)">
                  <Select value={f.country} onChange={(e) => set('country', e.target.value)}>
                    {['PE', 'CO', 'EC', 'MX', 'CL', 'AR', 'BO', 'VE'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Section>

            <Section title="Avisos de renovación" description="Cuándo y cómo se avisa a cada cliente. Los avisos ya programados se recalculan al guardar.">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ['retell', 'Llamada con IA', 'Retell llama al cliente (solo si aceptó llamadas). Si no, usa WhatsApp.'],
                      ['whatsapp', 'WhatsApp', 'Plantilla aprobada por Meta.'],
                      ['manual', 'Manual', 'El sistema solo te lista a quién avisar.'],
                    ] as const
                  ).map(([v, label, desc]) => {
                    const ok = v === 'manual' || allowed.includes(v);
                    return (
                      <label
                        key={v}
                        className={`cursor-pointer rounded-lg p-3 ring-1 ${f.reminderChannel === v ? 'bg-indigo-50 ring-2 ring-indigo-500' : 'ring-slate-200'} ${ok ? '' : 'opacity-50'}`}
                      >
                        <input type="radio" className="sr-only" checked={f.reminderChannel === v} disabled={!ok} onChange={() => set('reminderChannel', v)} />
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-xs text-slate-500">{ok ? desc : `No incluido en el plan ${f.plan?.name ?? ''}`}</div>
                      </label>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Avisar con" hint="Días antes del vencimiento.">
                    <Select value={f.reminderDaysBefore} onChange={(e) => set('reminderDaysBefore', Number(e.target.value))}>
                      {[0, 1, 2, 3, 4, 5, 7].map((d) => (
                        <option key={d} value={d}>
                          {d === 0 ? 'El mismo día' : `${d} día${d === 1 ? '' : 's'} antes`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="A la hora">
                    <Select value={f.reminderHour} onChange={(e) => set('reminderHour', Number(e.target.value))}>
                      {HOURS.slice(0, 24).map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Nunca antes de las">
                    <Select value={f.allowedStartHour} onChange={(e) => set('allowedStartHour', Number(e.target.value))}>
                      {HOURS.slice(0, 24).map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Ni después de las">
                    <Select value={f.allowedEndHour} onChange={(e) => set('allowedEndHour', Number(e.target.value))}>
                      {HOURS.slice(1).map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <p className="text-xs text-slate-500">Si no contesta se reintenta a las 2 horas, hasta 3 intentos. Después queda en “Para hacer hoy” para que lo avises tú.</p>
              </div>
            </Section>

            <Section title="Canales" description="Datos de tus cuentas de Retell y WhatsApp Cloud API. El token se guarda cifrado.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Número de Retell" hint="Desde dónde llama el agente. Vacío = el del servidor.">
                  <Input value={f.retellFromNumber ?? ''} onChange={(e) => set('retellFromNumber', e.target.value || null)} placeholder="+1…" />
                </Field>
                <Field label="WhatsApp: Phone number ID">
                  <Input value={f.whatsappPhoneNumberId ?? ''} onChange={(e) => set('whatsappPhoneNumberId', e.target.value || null)} />
                </Field>
                <Field
                  label="WhatsApp: token de acceso"
                  hint={f.hasWhatsappToken ? <Badge tone="green">guardado</Badge> : 'Sin token: no se envían WhatsApp.'}
                >
                  <Input type="password" value={f.whatsappToken ?? ''} onChange={(e) => set('whatsappToken', e.target.value)} placeholder={f.hasWhatsappToken ? '•••••••• (deja vacío para no cambiarlo)' : 'EAAG…'} />
                </Field>
                <Field label="Plantilla de WhatsApp" hint="5 variables: nombre, servicio, perfil, fecha, precio.">
                  <Input value={f.whatsappTemplate} onChange={(e) => set('whatsappTemplate', e.target.value)} />
                </Field>
              </div>
            </Section>

            <Section title="Seguridad">
              <Checkbox
                checked={f.staffCanSeePasswords}
                onChange={(v) => set('staffCanSeePasswords', v)}
                label="Los vendedores pueden ver contraseñas de cuentas y PIN (cada vez que alguien ve una contraseña queda registrado)."
              />
            </Section>

            {owner && (
              <div className="flex justify-end gap-2 pt-2">
                <ErrorBox error={save.error} />
                <Button type="submit" loading={save.isPending}>
                  Guardar ajustes
                </Button>
              </div>
            )}
          </fieldset>
        </form>

        <Section title="Mi contraseña">
          <PasswordSection />
        </Section>
      </div>
    </>
  );
}
