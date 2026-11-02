export type Role = 'superadmin' | 'owner' | 'staff';
export type SubStatus = 'activa' | 'por_vencer' | 'vencida' | 'cancelada';
export type Intent = 'renueva' | 'no_renueva' | 'pensando' | 'sin_respuesta';
export type ReminderStatus = 'pendiente' | 'enviando' | 'enviado' | 'respondido' | 'fallido';
export type PaymentMethod = 'yape' | 'plin' | 'efectivo' | 'transferencia';

export interface PlanLimits {
  max_active_subscriptions: number | null;
  ai_minutes_per_month: number;
  max_users: number;
  channels_allowed: string[];
  api_access: boolean;
}

export interface Session {
  user: { id: string; email: string; name: string; role: Role; homeTenantId: string | null };
  tenant: {
    id: string;
    name: string;
    timezone: string;
    subscriptionStatus: string;
    trialEndsAt: string | null;
    activeUntil: string | null;
    sheetConnected: boolean;
    staffCanSeePasswords: boolean;
    plan: { code: string; name: string; price: string; limits: PlanLimits } | null;
  } | null;
  csrfToken: string;
}

export interface SubRow {
  id: string;
  customerId: string;
  customerName: string;
  phone: string | null;
  consentCalls: boolean;
  serviceName: string | null;
  platform: string | null;
  accountEmail: string | null;
  profileName: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  price: number;
  status: SubStatus;
  reminderStatus: ReminderStatus;
  reminderAt: string | null;
  reminderAttempts: number;
  reminderChannelUsed: string | null;
  renewalIntent: Intent | null;
  lastContactAt: string | null;
  lastCallSummary: string | null;
  source: 'sheet' | 'panel' | 'api';
  sheetDirty: boolean;
  daysLeft: number;
  reminderLabel: string;
}

export interface EventRow {
  id: string;
  type: string;
  entity: string | null;
  entityId: string | null;
  userId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface CallRow {
  id: string;
  channel: string;
  status: string;
  disconnectionReason: string | null;
  durationMs: number | null;
  summary: string | null;
  sentiment: string | null;
  recordingUrl: string | null;
  intent: string | null;
  createdAt: string;
  subscriptionId?: string | null;
  customerName?: string | null;
  phone?: string | null;
}

export interface PaymentRow {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  subscriptionId: string | null;
  customerName?: string | null;
  serviceName?: string | null;
}

export interface SubDetail extends SubRow {
  cost: number;
  pin: string | null;
  streamAccountId: string | null;
  recordingUrl: string | null;
  sheetSyncedAt: string | null;
  canSeeSecrets: boolean;
  payments: PaymentRow[];
  calls: CallRow[];
  events: EventRow[];
}

export interface SheetStats {
  rows?: number;
  imported?: number;
  updatedFromSheet?: number;
  waiting?: number;
  invalid?: number;
  flushed?: number;
}

export interface SheetInfo {
  provider: 'google' | 'xlsx' | null;
  spreadsheetId: string | null;
  url: string | null;
  fileName: string | null;
  salesTab: string;
  accountsTab: string;
  dateOrder: 'dmy' | 'mdy';
  lastScanAt: string | null;
  lastError: string | null;
  stats: SheetStats | null;
  serviceAccountEmail: string | null;
}

export interface Dashboard {
  today: string;
  counts: { activa: number; por_vencer: number; vencida: number; cancelada: number; venceHoy: number };
  intents: Partial<Record<Intent, number>>;
  month: { revenue: number; payments: number; renewals: number };
  aiMinutesUsed: number;
  upcoming: SubRow[];
  attention: SubRow[];
  recent: EventRow[];
  sheet: { connected: boolean; provider: string | null; lastScanAt: string | null; lastError: string | null; stats: SheetStats | null };
  inDb: number;
}
