export interface ReminderPayload {
  tenantId: string;
  subscriptionId: string;
  businessName: string;
  customerName: string;
  toNumber: string;
  serviceName: string;
  profileName: string;
  endDate: string;
  endDateWords: string;
  daysLeft: number;
  /** true si ya venció (el agente dice "venció el…" en vez de "vence el…") */
  expired: boolean;
  price: string;
}

export interface SendResult {
  /** id de la llamada o del mensaje en el proveedor */
  externalId: string;
}

export interface ReminderChannel {
  name: 'retell' | 'whatsapp' | 'console';
  send(p: ReminderPayload, cfg: ChannelConfig): Promise<SendResult>;
}

export interface ChannelConfig {
  retellFromNumber?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappToken?: string | null;
  whatsappTemplate?: string;
}
