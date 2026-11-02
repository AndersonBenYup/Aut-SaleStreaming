import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { MonitorPlay } from 'lucide-react';
import { api } from '../lib/api';
import { useSetSession } from '../lib/auth';
import type { Session } from '../lib/types';
import { Button, Checkbox, ErrorBox, Field, Input } from '../components/ui';

function AuthShell({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-white">
          <div className="grid size-11 place-items-center rounded-xl bg-indigo-600">
            <MonitorPlay className="size-5" />
          </div>
          <div className="text-lg font-semibold">StreamCRM</div>
          <p className="text-center text-sm text-slate-300">Avisos de renovación automáticos para vendedores de streaming</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-4 text-lg font-semibold text-slate-900">{title}</h1>
          {children}
        </div>
        <div className="mt-4 text-center text-sm text-slate-300">{footer}</div>
      </div>
    </div>
  );
}

const DEMO = [
  { label: 'Dueño', email: 'dueno@demo.test', password: 'Demo12345!' },
  { label: 'Vendedor', email: 'vendedor@demo.test', password: 'Demo12345!' },
  { label: 'Super-admin', email: 'admin@streamcrm.test', password: 'Admin12345!' },
];

export function Login() {
  const setSession = useSetSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e?: FormEvent, creds = { email, password }) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setSession(await api<Session>('/auth/login', { body: creds }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Ingresar"
      footer={
        <>
          ¿Aún no tienes cuenta?{' '}
          <Link to="/registro" className="font-medium text-white underline">
            Prueba 7 días gratis
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <Button type="submit" loading={loading} className="w-full">
          Ingresar
        </Button>
      </form>
      {import.meta.env.DEV && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Usuarios de prueba (npm run seed)</p>
          <div className="grid grid-cols-3 gap-2">
            {DEMO.map((d) => (
              <Button key={d.email} variant="secondary" size="sm" onClick={() => submit(undefined, d)} disabled={loading}>
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export function Signup() {
  const setSession = useSetSession();
  const [f, setF] = useState({ businessName: '', name: '', email: '', whatsapp: '', password: '', acceptTerms: false });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setSession(await api<Session>('/auth/signup', { body: f }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Crea tu cuenta"
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/" className="font-medium text-white underline">
            Ingresar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nombre del negocio">
          <Input required value={f.businessName} onChange={set('businessName')} placeholder="Streaming Lima" />
        </Field>
        <Field label="Tu nombre">
          <Input required value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Email">
          <Input type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="WhatsApp" hint="Para avisarte a ti cuando un cliente quiera renovar.">
          <Input required value={f.whatsapp} onChange={set('whatsapp')} placeholder="987 654 321" />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres.">
          <Input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} />
        </Field>
        <Checkbox
          checked={f.acceptTerms}
          onChange={(v) => setF({ ...f, acceptTerms: v })}
          label="Acepto los términos y la política de privacidad, y declaro que mis clientes aceptaron recibir avisos (Ley 29733)."
        />
        <ErrorBox error={error} />
        <Button type="submit" loading={loading} className="w-full" disabled={!f.acceptTerms}>
          Empezar prueba gratis
        </Button>
      </form>
    </AuthShell>
  );
}
