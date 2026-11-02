import '../config/dotenv.js';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { PlanLimits } from '@streamcrm/shared';
import { apiRoot, bootDatabase } from '../bootstrap.js';
import { getDb } from '../db/index.js';
import { plans, tenants, users } from '../db/schema.js';
import { todayIn } from '../lib/dates.js';
import { buildDemoWorkbook } from './demoWorkbook.js';

export const DEMO_TENANT_NAME = 'Streaming Demo Lima';
export const DEMO_USERS = [
  { email: 'admin@streamcrm.test', password: 'Admin12345!', name: 'Super Admin', role: 'superadmin' },
  { email: 'dueno@demo.test', password: 'Demo12345!', name: 'Rocío Dueña', role: 'owner' },
  { email: 'vendedor@demo.test', password: 'Demo12345!', name: 'Kevin Vendedor', role: 'staff' },
] as const;

const PLANS: { code: string; name: string; price: string; sort: number; limits: PlanLimits }[] = [
  { code: 'basico', name: 'Básico', price: '39.00', sort: 1, limits: { max_active_subscriptions: 100, ai_minutes_per_month: 0, max_users: 1, channels_allowed: ['whatsapp', 'manual'], api_access: false } },
  { code: 'pro', name: 'Pro', price: '89.00', sort: 2, limits: { max_active_subscriptions: 500, ai_minutes_per_month: 100, max_users: 3, channels_allowed: ['retell', 'whatsapp', 'manual'], api_access: false } },
  { code: 'negocio', name: 'Negocio', price: '189.00', sort: 3, limits: { max_active_subscriptions: null, ai_minutes_per_month: 400, max_users: 10, channels_allowed: ['retell', 'whatsapp', 'manual'], api_access: true, white_label: true } },
];

const db = await bootDatabase();
const d = getDb();

for (const p of PLANS) {
  await d
    .insert(plans)
    .values({ code: p.code, name: p.name, priceMonthly: p.price, limits: p.limits, sortOrder: p.sort })
    .onConflictDoUpdate({ target: plans.code, set: { name: p.name, priceMonthly: p.price, limits: p.limits } });
}
const [pro] = await d.select().from(plans).where(eq(plans.code, 'pro'));

// Se recrea el negocio demo desde cero (borra en cascada sus clientes, ventas y usuarios).
await d.delete(tenants).where(eq(tenants.name, DEMO_TENANT_NAME));

const sheetFile = path.resolve(apiRoot, '../../data/hoja-demo-trabajo.xlsx');
mkdirSync(path.dirname(sheetFile), { recursive: true });
const today = todayIn('America/Lima');
await buildDemoWorkbook(sheetFile, today);

const [tenant] = await d
  .insert(tenants)
  .values({
    name: DEMO_TENANT_NAME,
    planId: pro!.id,
    subscriptionStatus: 'trialing',
    trialEndsAt: new Date(Date.now() + 7 * 86400_000),
    reminderChannel: 'retell',
    sheetProvider: 'xlsx',
    sheetSpreadsheetId: sheetFile,
  })
  .returning();

for (const u of DEMO_USERS) {
  const passwordHash = await argon2.hash(u.password);
  const tenantId = u.role === 'superadmin' ? null : tenant!.id;
  await d
    .insert(users)
    .values({ email: u.email, name: u.name, role: u.role, passwordHash, tenantId, emailVerifiedAt: new Date() })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash, tenantId, role: u.role } });
}

console.log('\n✔ Seed listo');
console.log(`  Negocio: ${DEMO_TENANT_NAME}  (id ${tenant!.id})`);
console.log(`  Hoja conectada (xlsx local): ${sheetFile}`);
console.log('  Usuarios de prueba:');
for (const u of DEMO_USERS) console.log(`    ${u.role.padEnd(10)} ${u.email.padEnd(24)} ${u.password}`);
console.log('\n  Ahora: npm run dev  →  http://localhost:5173  (entra como dueño y pulsa "Leer ahora" en la hoja)\n');

await db.close();
