export const SUBSCRIPTION_STATUS = ['activa', 'por_vencer', 'vencida', 'cancelada'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const REMINDER_STATUS = ['pendiente', 'enviando', 'enviado', 'respondido', 'fallido'] as const;
export type ReminderStatus = (typeof REMINDER_STATUS)[number];

export const RENEWAL_INTENT = ['renueva', 'no_renueva', 'pensando', 'sin_respuesta'] as const;
export type RenewalIntent = (typeof RENEWAL_INTENT)[number];

export const TENANT_BILLING_STATUS = ['trialing', 'active', 'past_due', 'canceled', 'suspended'] as const;
export type TenantBillingStatus = (typeof TENANT_BILLING_STATUS)[number];

export const USER_ROLES = ['superadmin', 'owner', 'staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CHANNELS = ['retell', 'whatsapp', 'console', 'manual'] as const;
export type Channel = (typeof CHANNELS)[number];

export const PAYMENT_METHODS = ['yape', 'plin', 'efectivo', 'transferencia'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PLATFORMS = [
  'netflix',
  'disney',
  'max',
  'prime',
  'spotify',
  'youtube',
  'paramount',
  'crunchyroll',
  'otro',
] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Motivos de desconexión de Retell que cuentan como "no contestó" y disparan reintento. */
export const RETRYABLE_DISCONNECTIONS = [
  'dial_no_answer',
  'dial_busy',
  'dial_failed',
  'voicemail_reached',
  'user_declined',
  'invalid_destination',
  'error_no_audio_received',
] as const;

export interface PlanLimits {
  /** null = ilimitado */
  max_active_subscriptions: number | null;
  ai_minutes_per_month: number;
  max_users: number;
  channels_allowed: Channel[];
  api_access: boolean;
  white_label?: boolean;
}
