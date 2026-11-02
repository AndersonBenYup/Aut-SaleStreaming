import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { PlanLimits } from '@streamcrm/shared';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/index.js';
import { payments, plans, streamAccounts, subscriptions, users } from '../src/db/schema.js';
import { encrypt } from '../src/lib/crypto.js';
import { todayIn } from '../src/lib/dates.js';

const app = createApp();

const PRO: PlanLimits = { max_active_subscriptions: 500, ai_minutes_per_month: 100, max_users: 2, channels_allowed: ['retell', 'whatsapp', 'manual'], api_access: false };

async function seedPlan(limits = PRO) {
  await getDb().insert(plans).values({ code: 'pro', name: 'Pro', priceMonthly: '89.00', limits });
}

/** Registra un negocio nuevo y devuelve un agente con la cookie de sesión y el token CSRF. */
async function signup(email = 'dueno@a.test', businessName = 'Negocio A') {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/signup')
    .send({ businessName, name: 'Dueño', email, whatsapp: '987654321', password: 'clave-segura-1', acceptTerms: true });
  expect(res.status).toBe(201);
  return { agent, csrf: res.body.csrfToken as string, tenantId: res.body.tenant.id as string, body: res.body };
}

async function login(email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  return { agent, res, csrf: res.body.csrfToken as string };
}

const sale = (over: Record<string, unknown> = {}) => ({
  customerName: 'Lucía Prueba',
  phone: '987111222',
  consentCalls: true,
  serviceName: 'NETFLIX 1 Perfil',
  durationDays: 30,
  price: 15,
  startDate: todayIn('America/Lima'),
  paymentMethod: 'yape',
  ...over,
});

describe('autenticación', () => {
  it('registro crea negocio en prueba con el plan Pro y deja la sesión abierta', async () => {
    await seedPlan();
    const { agent, body } = await signup();
    expect(body.user.role).toBe('owner');
    expect(body.tenant.subscriptionStatus).toBe('trialing');
    expect(body.tenant.plan.code).toBe('pro');
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.tenant.name).toBe('Negocio A');
  });

  it('no permite registrar dos veces el mismo email', async () => {
    await seedPlan();
    await signup();
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ businessName: 'Otro', name: 'Xavier', email: 'DUENO@a.test', whatsapp: '987654321', password: 'clave-segura-1', acceptTerms: true });
    expect(res.status).toBe(409);
  });

  it('login con contraseña incorrecta → 401; correcta → 200 y la contraseña se guarda con argon2', async () => {
    await seedPlan();
    await signup();
    expect((await login('dueno@a.test', 'mala')).res.status).toBe(401);
    expect((await login('nadie@a.test', 'mala')).res.status).toBe(401);
    const ok = await login('dueno@a.test', 'clave-segura-1');
    expect(ok.res.status).toBe(200);
    expect(ok.res.headers['set-cookie']?.[0]).toMatch(/sc_session=.*HttpOnly/i);
    const [u] = await getDb().select().from(users).where(eq(users.email, 'dueno@a.test'));
    expect(u!.passwordHash.startsWith('$argon2')).toBe(true);
  });

  it('sin sesión → 401', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('sin token CSRF no se puede modificar nada', async () => {
    await seedPlan();
    const { agent, csrf } = await signup();
    expect((await agent.post('/api/subscriptions').send(sale())).status).toBe(403);
    expect((await agent.post('/api/subscriptions').set('x-csrf-token', 'otro').send(sale())).status).toBe(403);
    expect((await agent.post('/api/subscriptions').set('x-csrf-token', csrf).send(sale())).status).toBe(201);
  });

  it('logout invalida la sesión', async () => {
    await seedPlan();
    const { agent, csrf } = await signup();
    expect((await agent.post('/api/auth/logout').set('x-csrf-token', csrf)).status).toBe(204);
    expect((await agent.get('/api/dashboard')).status).toBe(401);
  });

  it('cambiar la contraseña cierra las otras sesiones', async () => {
    await seedPlan();
    const { agent, csrf } = await signup();
    const other = await login('dueno@a.test', 'clave-segura-1');
    const res = await agent.post('/api/auth/password').set('x-csrf-token', csrf).send({ current: 'clave-segura-1', next: 'nueva-clave-22' });
    expect(res.status).toBe(204);
    expect((await agent.get('/api/dashboard')).status).toBe(200);
    expect((await other.agent.get('/api/dashboard')).status).toBe(401);
  });
});

describe('aislamiento entre negocios', () => {
  it('un negocio no ve ni modifica las ventas de otro', async () => {
    await seedPlan();
    const a = await signup('a@a.test', 'Negocio A');
    const b = await signup('b@b.test', 'Negocio B');
    const created = await a.agent.post('/api/subscriptions').set('x-csrf-token', a.csrf).send(sale());
    const id = created.body.id;

    expect((await a.agent.get(`/api/subscriptions/${id}`)).status).toBe(200);
    expect((await b.agent.get(`/api/subscriptions/${id}`)).status).toBe(404);
    expect((await b.agent.get('/api/subscriptions')).body.total).toBe(0);
    expect((await b.agent.get('/api/customers')).body).toHaveLength(0);
    expect((await b.agent.post(`/api/subscriptions/${id}/renew`).set('x-csrf-token', b.csrf).send({ amount: 15, method: 'yape' })).status).toBe(404);
    expect((await b.agent.post(`/api/subscriptions/${id}/cancel`).set('x-csrf-token', b.csrf)).status).toBe(404);
    const [sub] = await getDb().select().from(subscriptions).where(eq(subscriptions.id, id));
    expect(sub!.status).not.toBe('cancelada');
  });
});

describe('ventas y renovaciones desde el panel', () => {
  it('venta con pago → aparece en la lista, en pagos y en el resumen; renovar extiende la fecha', async () => {
    await seedPlan();
    const { agent, csrf } = await signup();
    const { body } = await agent.post('/api/subscriptions').set('x-csrf-token', csrf).send(sale());
    const list = await agent.get('/api/subscriptions?q=luc');
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ customerName: 'Lucía Prueba', phone: '+51987111222', daysLeft: 30, status: 'activa' });
    expect(list.body.items[0].reminderLabel).toMatch(/^Programado/);

    const renewed = await agent.post(`/api/subscriptions/${body.id}/renew`).set('x-csrf-token', csrf).send({ amount: 18, method: 'plin' });
    expect(renewed.status).toBe(200);
    const detail = await agent.get(`/api/subscriptions/${body.id}`);
    expect(detail.body.daysLeft).toBe(60);
    expect(detail.body.payments).toHaveLength(2);

    const dash = await agent.get('/api/dashboard');
    expect(dash.body.month).toMatchObject({ revenue: 33, payments: 2, renewals: 1 });
    expect(dash.body.counts.activa).toBe(1);
  });

  it('marcar la intención a mano y cancelar', async () => {
    await seedPlan();
    const { agent, csrf } = await signup();
    const { body } = await agent.post('/api/subscriptions').set('x-csrf-token', csrf).send(sale({ paymentMethod: undefined }));
    expect((await agent.post(`/api/subscriptions/${body.id}/intent`).set('x-csrf-token', csrf).send({ intent: 'renueva', note: 'pagará el viernes' })).status).toBe(204);
    let d = (await agent.get(`/api/subscriptions/${body.id}`)).body;
    expect(d.renewalIntent).toBe('renueva');
    expect(d.lastCallSummary).toBe('Nota: pagará el viernes');
    expect((await agent.get('/api/dashboard')).body.attention).toHaveLength(1);

    await agent.post(`/api/subscriptions/${body.id}/cancel`).set('x-csrf-token', csrf);
    d = (await agent.get(`/api/subscriptions/${body.id}`)).body;
    expect(d).toMatchObject({ status: 'cancelada', renewalIntent: 'no_renueva', reminderAt: null });
    expect(await getDb().select().from(payments)).toHaveLength(0);
  });

  it('datos inválidos → 400 con el mensaje del campo', async () => {
    await seedPlan();
    const { agent, csrf } = await signup();
    const res = await agent.post('/api/subscriptions').set('x-csrf-token', csrf).send(sale({ startDate: '30/10/2026' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/startDate/);
  });
});

describe('roles', () => {
  async function withStaff(staffCanSeePasswords = false) {
    await seedPlan();
    const owner = await signup();
    const added = await owner.agent
      .post('/api/team')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Vendedor', email: 'staff@a.test', password: 'clave-staff-1', role: 'staff' });
    expect(added.status).toBe(201);
    if (staffCanSeePasswords) {
      await owner.agent.patch('/api/settings').set('x-csrf-token', owner.csrf).send({ staffCanSeePasswords: true });
    }
    const [acc] = await getDb()
      .insert(streamAccounts)
      .values({ tenantId: owner.tenantId, email: 'cuenta@x.test', passwordEnc: encrypt('secreta123'), platform: 'netflix' })
      .returning();
    const staff = await login('staff@a.test', 'clave-staff-1');
    return { owner, staff, accountId: acc!.id };
  }

  it('el vendedor vende y renueva, pero no toca Ajustes ni Equipo', async () => {
    const { staff } = await withStaff();
    expect((await staff.agent.post('/api/subscriptions').set('x-csrf-token', staff.csrf).send(sale())).status).toBe(201);
    expect((await staff.agent.get('/api/team')).status).toBe(403);
    expect((await staff.agent.patch('/api/settings').set('x-csrf-token', staff.csrf).send({ name: 'X' })).status).toBe(403);
    expect((await staff.agent.post('/api/settings/sheet').set('x-csrf-token', staff.csrf).send({ url: 'https://docs.google.com/x' })).status).toBe(403);
    expect((await staff.agent.get('/api/admin/tenants')).status).toBe(403);
  });

  it('el vendedor no ve contraseñas salvo que el dueño lo permita (y queda registrado)', async () => {
    const { owner, staff, accountId } = await withStaff();
    expect((await staff.agent.get(`/api/accounts/${accountId}/password`)).status).toBe(403);
    expect((await owner.agent.get(`/api/accounts/${accountId}/password`)).body.password).toBe('secreta123');

    await owner.agent.patch('/api/settings').set('x-csrf-token', owner.csrf).send({ staffCanSeePasswords: true });
    expect((await staff.agent.get(`/api/accounts/${accountId}/password`)).body.password).toBe('secreta123');
    const events = (await owner.agent.get('/api/activity/events')).body;
    expect(events.filter((e: { type: string }) => e.type === 'account.password_viewed')).toHaveLength(2);
  });

  it('el límite de usuarios del plan se respeta y desactivar un usuario cierra su sesión', async () => {
    const { owner, staff } = await withStaff();
    const third = await owner.agent
      .post('/api/team')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'Otro', email: 'otro@a.test', password: 'clave-otro-1' });
    expect(third.status).toBe(402);

    const team = (await owner.agent.get('/api/team')).body;
    const staffId = team.users.find((u: { email: string }) => u.email === 'staff@a.test').id;
    expect((await owner.agent.patch(`/api/team/${staffId}`).set('x-csrf-token', owner.csrf).send({ disabled: true })).status).toBe(204);
    expect((await staff.agent.get('/api/dashboard')).status).toBe(401);
    expect((await login('staff@a.test', 'clave-staff-1')).res.status).toBe(401);
  });
});

describe('super-admin', () => {
  it('ve la lista de negocios y entra a uno; un dueño no puede', async () => {
    await seedPlan();
    const a = await signup();
    await getDb()
      .insert(users)
      .values({ email: 'root@admin.test', name: 'Root', role: 'superadmin', passwordHash: await argon2.hash('clave-root-1') });
    const admin = await login('root@admin.test', 'clave-root-1');
    expect((await admin.agent.get('/api/dashboard')).status).toBe(403);
    const list = await admin.agent.get('/api/admin/tenants');
    expect(list.body).toHaveLength(1);
    const sw = await admin.agent.post('/api/auth/switch-tenant').set('x-csrf-token', admin.csrf).send({ tenantId: a.tenantId });
    expect(sw.body.tenant.name).toBe('Negocio A');
    expect((await admin.agent.get('/api/dashboard')).status).toBe(200);

    expect((await a.agent.get('/api/admin/tenants')).status).toBe(403);
    expect((await a.agent.post('/api/auth/switch-tenant').set('x-csrf-token', a.csrf).send({ tenantId: null })).status).toBe(403);
  });
});

describe('ajustes', () => {
  it('cambiar la hora del aviso reprograma los avisos pendientes', async () => {
    await seedPlan();
    const { agent, csrf } = await signup();
    const { body } = await agent.post('/api/subscriptions').set('x-csrf-token', csrf).send(sale());
    const before = (await agent.get(`/api/subscriptions/${body.id}`)).body.reminderAt;
    const res = await agent.patch('/api/settings').set('x-csrf-token', csrf).send({ reminderHour: 16 });
    expect(res.status).toBe(200);
    const after = (await agent.get(`/api/subscriptions/${body.id}`)).body.reminderAt;
    expect(new Date(after).getTime() - new Date(before).getTime()).toBe(6 * 3600_000);
  });

  it('no se puede elegir un canal que el plan no incluye; el token de WhatsApp se guarda cifrado', async () => {
    await seedPlan({ ...PRO, channels_allowed: ['whatsapp', 'manual'] });
    const { agent, csrf, tenantId } = await signup();
    expect((await agent.patch('/api/settings').set('x-csrf-token', csrf).send({ reminderChannel: 'retell' })).status).toBe(400);
    const ok = await agent.patch('/api/settings').set('x-csrf-token', csrf).send({ reminderChannel: 'whatsapp', whatsappToken: 'EAAG-token' });
    expect(ok.body).toMatchObject({ reminderChannel: 'whatsapp', hasWhatsappToken: true });
    expect(JSON.stringify(ok.body)).not.toContain('EAAG');
    const { tenants } = await import('../src/db/schema.js');
    const [t] = await getDb().select().from(tenants).where(eq(tenants.id, tenantId));
    expect(t!.whatsappTokenEnc).toMatch(/^v1:/);
  });

  it('conectar Google Sheets sin service account da un error claro', async () => {
    await seedPlan();
    const { agent, csrf } = await signup();
    const res = await agent.post('/api/settings/sheet').set('x-csrf-token', csrf).send({ url: 'https://docs.google.com/spreadsheets/d/abc123/edit' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/GOOGLE_SERVICE_ACCOUNT_JSON/);
  });
});
