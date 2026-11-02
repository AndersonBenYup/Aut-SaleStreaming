import { all, get, run, tx } from './db.js';
import { decrypt, encrypt } from './crypto.js';

/** Tokens que se guardan cifrados con AES-256-GCM. Nunca se devuelven completos al panel. */
export const SECRET_KEYS = new Set(['retell_api_key', 'whatsapp_token', 'license_key']);

export const DEFAULTS = {
  business_name: 'Mi Negocio',
  panel_name: '',
  primary_color: '#7c3aed',
  contact_whatsapp: '',
  country: 'PE',
  timezone: 'America/Lima',
  currency: 'S/',
  reminder_channel: 'manual', // retell | whatsapp | manual
  reminder_days_before: '2',
  reminder_hour: '10',
  allowed_start_hour: '9',
  allowed_end_hour: '20',
  por_vencer_days: '3',
  retell_agent_id: '',
  retell_from_number: '',
  whatsapp_phone_number_id: '',
  whatsapp_template: 'recordatorio_renovacion',
  whatsapp_language: 'es',
  session_idle_minutes: '30',
  backup_hour: '3',
  backup_copy_dir: '',
  public_url: '',
  has_logo: '',
  setup_completed: '',
  demo_started_at: '',
  last_backup_at: '',
  last_auto_backup_date: '',
};

/** Ajustes que el panel puede cambiar con PUT /api/settings. */
export const EDITABLE = [
  'business_name', 'panel_name', 'primary_color', 'contact_whatsapp', 'country', 'timezone', 'currency',
  'reminder_channel', 'reminder_days_before', 'reminder_hour', 'allowed_start_hour', 'allowed_end_hour', 'por_vencer_days',
  'retell_api_key', 'retell_agent_id', 'retell_from_number',
  'whatsapp_phone_number_id', 'whatsapp_token', 'whatsapp_template', 'whatsapp_language',
  'session_idle_minutes', 'backup_hour', 'backup_copy_dir', 'public_url',
];

export function getSettings() {
  const out = { ...DEFAULTS };
  for (const { key, value } of all('SELECT key, value FROM settings')) {
    if (!SECRET_KEYS.has(key)) out[key] = value ?? '';
  }
  return out;
}

export function getSetting(key) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return SECRET_KEYS.has(key) ? '' : (DEFAULTS[key] ?? '');
  return SECRET_KEYS.has(key) ? (decrypt(row.value) ?? '') : (row.value ?? '');
}

export function setSettings(values) {
  tx(() => {
    for (const [key, raw] of Object.entries(values)) {
      if (raw === undefined) continue;
      const value = raw === null ? '' : String(raw);
      run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        SECRET_KEYS.has(key) ? encrypt(value) : value,
      );
    }
  });
}

export const setSetting = (key, value) => setSettings({ [key]: value });

/** Lo que ve el panel: los secretos solo como "configurado" + últimos 4 caracteres. */
export function publicSettings() {
  const s = getSettings();
  for (const key of ['retell_api_key', 'whatsapp_token']) {
    const v = getSetting(key);
    s[key] = v ? `••••${v.slice(-4)}` : '';
    s[`has_${key}`] = !!v;
  }
  delete s.license_key;
  return s;
}

/** Configuración del horario de recordatorios con números. */
export function reminderConfig(s = getSettings()) {
  return {
    timezone: s.timezone,
    daysBefore: Number(s.reminder_days_before),
    hour: Number(s.reminder_hour),
    startHour: Number(s.allowed_start_hour),
    endHour: Number(s.allowed_end_hour),
    porVencerDays: Number(s.por_vencer_days),
  };
}
