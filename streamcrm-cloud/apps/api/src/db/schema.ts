import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { PlanLimits } from '@streamcrm/shared';

const id = () => uuid('id').primaryKey().defaultRandom();
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const plans = pgTable('plans', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  priceMonthly: numeric('price_monthly', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('PEN'),
  limits: jsonb('limits').$type<PlanLimits>().notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  country: text('country').notNull().default('PE'),
  timezone: text('timezone').notNull().default('America/Lima'),
  planId: uuid('plan_id').references(() => plans.id),
  subscriptionStatus: text('subscription_status').notNull().default('trialing'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  activeUntil: timestamp('active_until', { withTimezone: true }),
  pastDueSince: timestamp('past_due_since', { withTimezone: true }),
  reminderChannel: text('reminder_channel').notNull().default('retell'),
  reminderDaysBefore: integer('reminder_days_before').notNull().default(2),
  reminderHour: integer('reminder_hour').notNull().default(10),
  allowedStartHour: integer('allowed_start_hour').notNull().default(9),
  allowedEndHour: integer('allowed_end_hour').notNull().default(20),
  retellFromNumber: text('retell_from_number'),
  whatsappPhoneNumberId: text('whatsapp_phone_number_id'),
  whatsappTokenEnc: text('whatsapp_token_enc'),
  whatsappTemplate: text('whatsapp_template').notNull().default('recordatorio_renovacion'),
  ownerNotifyPhone: text('owner_notify_phone'),
  staffCanSeePasswords: boolean('staff_can_see_passwords').notNull().default(false),
  // --- Hoja de cálculo del negocio (fuente principal de datos) ---
  sheetProvider: text('sheet_provider'), // 'google' | 'xlsx' | null
  sheetSpreadsheetId: text('sheet_spreadsheet_id'), // id de Google Sheets o ruta del .xlsx
  sheetSalesTab: text('sheet_sales_tab').notNull().default('VENTAS'),
  sheetAccountsTab: text('sheet_accounts_tab').notNull().default('CUENTAS'),
  sheetDateOrder: text('sheet_date_order').notNull().default('dmy'), // 'dmy' | 'mdy'
  sheetLastScanAt: timestamp('sheet_last_scan_at', { withTimezone: true }),
  sheetLastError: text('sheet_last_error'),
  /** Resultado del último escaneo: filas totales, importadas, en espera… (para el panel). */
  sheetLastScanStats: jsonb('sheet_last_scan_stats').$type<Record<string, number>>(),
  // --- Vendedor por WhatsApp con IA ---
  salesAgentEnabled: boolean('sales_agent_enabled').notNull().default(false),
  /** URL /exec de la tienda en Apps Script (catálogo, PRECIO MINIMO y pedidos). */
  storeApiUrl: text('store_api_url'),
  /** BOT_API_KEY de la tienda (cifrada). */
  storeBotKeyEnc: text('store_bot_key_enc'),
  /** Cómo habla el vendedor: jerga, trato, ejemplos de chats reales. Lo escribe el dueño. */
  salesToneGuide: text('sales_tone_guide'),
  /** Cuántas rebajas puede dar el vendedor por producto en una conversación. */
  salesMaxDiscountRounds: integer('sales_max_discount_rounds').notNull().default(2),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(), // superadmin | owner | staff
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

/**
 * Sesiones del panel. El id es el SHA-256 del token de la cookie (si se filtra la tabla, no sirve para entrar).
 * tenant_id: el negocio activo de la sesión (el super-admin puede cambiarlo para ver un negocio).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    csrfToken: text('csrf_token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const customers = pgTable(
  'customers',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    phone: text('phone'), // E.164; puede faltar si la hoja no lo tiene

    email: text('email'),
    notes: text('notes'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    consentCalls: boolean('consent_calls').notNull().default(false),
    consentAt: timestamp('consent_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('customers_tenant_idx').on(t.tenantId), uniqueIndex('customers_tenant_phone_uq').on(t.tenantId, t.phone)],
);

export const services = pgTable(
  'services',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    platform: text('platform').notNull().default('otro'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
    durationDays: integer('duration_days').notNull().default(30),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('services_tenant_idx').on(t.tenantId), uniqueIndex('services_tenant_name_uq').on(t.tenantId, t.name)],
);

export const streamAccounts = pgTable(
  'stream_accounts',
  {
    id: id(),
    tenantId: tenantId(),
    platform: text('platform').notNull().default('otro'),
    serviceLabel: text('service_label'),
    email: text('email').notNull(),
    passwordEnc: text('password_enc'),
    totalProfiles: integer('total_profiles').notNull().default(1),
    expiresOn: date('expires_on'),
    cost: numeric('cost', { precision: 10, scale: 2 }).notNull().default('0'),
    provider: text('provider'),
    sheetStatus: text('sheet_status'), // DISPONIBLE | VENDIDO (tal como está en la hoja)
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [index('stream_accounts_tenant_idx').on(t.tenantId), uniqueIndex('stream_accounts_tenant_email_uq').on(t.tenantId, t.email)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    tenantId: tenantId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id),
    streamAccountId: uuid('stream_account_id').references(() => streamAccounts.id),
    profileName: text('profile_name'),
    pinEnc: text('pin_enc'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    durationDays: integer('duration_days').notNull().default(30),
    price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
    cost: numeric('cost', { precision: 10, scale: 2 }).notNull().default('0'),
    status: text('status').notNull().default('activa'),
    reminderAt: timestamp('reminder_at', { withTimezone: true }),
    reminderStatus: text('reminder_status').notNull().default('pendiente'),
    reminderAttempts: integer('reminder_attempts').notNull().default(0),
    reminderChannelUsed: text('reminder_channel_used'),
    renewalIntent: text('renewal_intent'),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
    lastCallId: text('last_call_id'),
    lastCallSummary: text('last_call_summary'),
    recordingUrl: text('recording_url'),
    // --- Sincronización con la hoja ---
    source: text('source').notNull().default('panel'), // sheet | panel | api
    /** Huella de la fila original (cliente+teléfono+vencimiento+cuenta): importar dos veces no duplica. */
    sheetRowKey: text('sheet_row_key'),
    sheetEndDateSeen: date('sheet_end_date_seen'), // último valor leído/escrito en la hoja
    sheetPhoneSeen: text('sheet_phone_seen'),
    sheetDirty: boolean('sheet_dirty').notNull().default(false), // hay cambios pendientes de escribir en la hoja
    sheetSyncedAt: timestamp('sheet_synced_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscriptions_tenant_idx').on(t.tenantId),
    index('subscriptions_due_idx').on(t.reminderStatus, t.reminderAt),
    index('subscriptions_tenant_end_idx').on(t.tenantId, t.endDate),
    uniqueIndex('subscriptions_tenant_row_key_uq').on(t.tenantId, t.sheetRowKey),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    tenantId: tenantId(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    method: text('method').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('payments_tenant_idx').on(t.tenantId, t.paidAt)],
);

export const calls = pgTable(
  'calls',
  {
    id: id(),
    tenantId: tenantId(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    channel: text('channel').notNull(),
    externalId: text('external_id'),
    status: text('status').notNull().default('iniciada'),
    disconnectionReason: text('disconnection_reason'),
    durationMs: integer('duration_ms'),
    callCost: numeric('call_cost', { precision: 10, scale: 4 }),
    summary: text('summary'),
    sentiment: text('sentiment'),
    recordingUrl: text('recording_url'),
    intent: text('intent'),
    createdAt: createdAt(),
  },
  (t) => [index('calls_tenant_idx').on(t.tenantId, t.createdAt), uniqueIndex('calls_external_uq').on(t.channel, t.externalId)],
);

export const events = pgTable(
  'events',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),
    type: text('type').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('events_tenant_idx').on(t.tenantId, t.createdAt)],
);

/** Webhooks entrantes: guarda el id de cada evento procesado para que sea idempotente. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    source: text('source').notNull(), // retell | whatsapp | mercadopago | stripe
    externalId: text('external_id').notNull(),
    tenantId: uuid('tenant_id'),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('recibido'), // recibido | procesado | fallido
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('webhook_events_source_ext_uq').on(t.source, t.externalId)],
);

/**
 * Conversación del vendedor de WhatsApp con un número. `messages` es el historial tal como lo devuelve
 * la API de Claude (incluye bloques de razonamiento): solo se agrega al final, nunca se edita.
 * Tras 24 h sin mensajes se abre un hilo nuevo.
 */
export const chatThreads = pgTable(
  'chat_threads',
  {
    id: id(),
    tenantId: tenantId(),
    phone: text('phone').notNull(), // E.164
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    messages: jsonb('messages').$type<unknown[]>().notNull().default([]),
    /** El dueño tomó el chat: el bot no responde hasta esta fecha. */
    botPausedUntil: timestamp('bot_paused_until', { withTimezone: true }),
    handoffReason: text('handoff_reason'),
    lastOrderId: text('last_order_id'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('chat_threads_tenant_phone_idx').on(t.tenantId, t.phone, t.lastMessageAt)],
);

/** Precios que el vendedor ofreció (los decide el servidor, no la IA). Vencen a las 24 h. */
export const salesOffers = pgTable(
  'sales_offers',
  {
    id: id(),
    tenantId: tenantId(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(), // netflix:1m | pack:pack-cine
    listPrice: numeric('list_price', { precision: 10, scale: 2 }).notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    round: integer('round').notNull().default(0), // 0 = precio de lista, 1+ = rebajas
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('sales_offers_thread_idx').on(t.threadId, t.itemKey)],
);

export const billingEvents = pgTable('billing_events', {
  id: id(),
  tenantId: tenantId(),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }),
  currency: text('currency').default('PEN'),
  provider: text('provider'),
  externalId: text('external_id'),
  data: jsonb('data'),
  createdAt: createdAt(),
});

export const nowSql = sql`now()`;
