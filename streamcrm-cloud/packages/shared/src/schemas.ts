import { z } from 'zod';
import { PAYMENT_METHODS, PLATFORMS, REMINDER_STATUS, RENEWAL_INTENT, SUBSCRIPTION_STATUS } from './enums.js';

const money = z.coerce.number().nonnegative().max(100000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');
const optionalEmail = z
  .string()
  .trim()
  .email('Email inválido')
  .max(160)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const customerInput = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(120),
  phone: z.string().trim().min(6, 'Teléfono requerido').max(30),
  email: optionalEmail,
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  consentCalls: z.boolean().default(false),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const serviceInput = z.object({
  name: z.string().trim().min(1).max(120),
  platform: z.enum(PLATFORMS),
  price: money,
  durationDays: z.coerce.number().int().min(1).max(3650),
  active: z.boolean().default(true),
});
export type ServiceInput = z.infer<typeof serviceInput>;

export const streamAccountInput = z.object({
  platform: z.enum(PLATFORMS),
  email: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(200),
  totalProfiles: z.coerce.number().int().min(1).max(20),
  expiresOn: isoDate.optional().nullable(),
  cost: money.default(0),
  notes: z.string().max(1000).optional(),
});
export type StreamAccountInput = z.infer<typeof streamAccountInput>;

export const subscriptionInput = z
  .object({
    customerId: z.string().uuid().optional(),
    customer: customerInput.optional(),
    serviceId: z.string().uuid(),
    streamAccountId: z.string().uuid().optional().nullable(),
    profileName: z.string().max(60).optional(),
    pin: z.string().max(20).optional(),
    startDate: isoDate,
    endDate: isoDate.optional(),
    price: money.optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  })
  .refine((v) => v.customerId || v.customer, { message: 'Indica un cliente existente o uno nuevo' });
export type SubscriptionInput = z.infer<typeof subscriptionInput>;

export const subscriptionUpdate = z.object({
  streamAccountId: z.string().uuid().optional().nullable(),
  profileName: z.string().max(60).optional(),
  pin: z.string().max(20).optional(),
  endDate: isoDate.optional(),
  price: money.optional(),
});

export const renewInput = z.object({
  amount: money,
  method: z.enum(PAYMENT_METHODS),
});
export type RenewInput = z.infer<typeof renewInput>;

export const subscriptionFilters = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(SUBSCRIPTION_STATUS).optional(),
  intent: z.enum(RENEWAL_INTENT).optional(),
  reminderStatus: z.enum(REMINDER_STATUS).optional(),
  serviceId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const tenantSettingsInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().max(60).optional(),
  country: z.string().length(2).optional(),
  reminderChannel: z.enum(['retell', 'whatsapp', 'manual']).optional(),
  reminderDaysBefore: z.coerce.number().int().min(0).max(30).optional(),
  reminderHour: z.coerce.number().int().min(0).max(23).optional(),
  allowedStartHour: z.coerce.number().int().min(0).max(23).optional(),
  allowedEndHour: z.coerce.number().int().min(1).max(24).optional(),
  retellFromNumber: z.string().max(30).optional().nullable(),
  whatsappPhoneNumberId: z.string().max(60).optional().nullable(),
  whatsappToken: z.string().max(600).optional().nullable(),
  whatsappTemplate: z.string().max(80).optional(),
  ownerNotifyPhone: z.string().max(30).optional().nullable(),
  staffCanSeePasswords: z.boolean().optional(),
  privacyText: z.string().max(10000).optional(),
  // Vendedor por WhatsApp con IA
  salesAgentEnabled: z.boolean().optional(),
  storeApiUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => u.startsWith('https://') || u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'), 'La URL de la tienda debe ser https')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  storeBotKey: z.string().min(16, 'La clave del bot debe tener al menos 16 caracteres').max(200).optional().nullable().or(z.literal('').transform(() => null)),
  salesToneGuide: z.string().max(8000).optional().nullable(),
  salesMaxDiscountRounds: z.coerce.number().int().min(0).max(5).optional(),
});
export type TenantSettingsInput = z.infer<typeof tenantSettingsInput>;

export const signupInput = z.object({
  businessName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  whatsapp: z.string().trim().min(6).max(30),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(200),
  acceptTerms: z.literal(true, { error: 'Debes aceptar los términos' }),
});

export type SignupInput = z.infer<typeof signupInput>;

export const loginInput = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña').max(200),
});

/** Venta nueva desde el panel: crea (o reutiliza por teléfono) el cliente y agrega la fila a la hoja. */
export const saleInput = z.object({
  customerName: z.string().trim().min(1, 'Nombre requerido').max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('').transform(() => undefined)),
  consentCalls: z.boolean().default(false),
  serviceName: z.string().trim().min(1, 'Servicio requerido').max(120),
  durationDays: z.coerce.number().int().min(1).max(3650).default(30),
  price: money,
  cost: money.default(0),
  startDate: isoDate,
  profileName: z.string().trim().max(60).optional(),
  pin: z.string().trim().max(20).optional(),
  accountEmail: z.string().trim().max(160).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});
export type SaleInput = z.infer<typeof saleInput>;

export const intentInput = z.object({ intent: z.enum(RENEWAL_INTENT), note: z.string().max(500).optional() });

export const customerUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: optionalEmail.nullable(),
  notes: z.string().max(2000).optional().nullable(),
  consentCalls: z.boolean().optional(),
});

export const teamInviteInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email('Email inválido').max(160),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(200),
  role: z.enum(['owner', 'staff']).default('staff'),
});

export const changePasswordInput = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(8, 'Mínimo 8 caracteres').max(200),
});

/** Conectar la hoja: URL (o id) de Google Sheets + nombres de pestañas. */
export const sheetConnectInput = z.object({
  url: z.string().trim().min(10, 'Pega el enlace de la hoja').max(500),
  salesTab: z.string().trim().min(1).max(100).default('VENTAS'),
  accountsTab: z.string().trim().min(1).max(100).default('CUENTAS'),
  dateOrder: z.enum(['dmy', 'mdy']).default('dmy'),
});
