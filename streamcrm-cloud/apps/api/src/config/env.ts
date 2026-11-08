import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  /** Si se omite en desarrollo/test, se levanta un Postgres 16 embebido. */
  DATABASE_URL: z.string().optional(),
  /** 32 bytes en hex (64 caracteres). Generar: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" */
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY debe tener 64 caracteres hex'),
  REMINDER_CHANNEL_OVERRIDE: z.enum(['console']).optional().or(z.literal('').transform(() => undefined)),
  /**
   * Fuera de producción solo se llama/escribe de verdad a estos números (E.164, separados por coma).
   * Al resto se le "envía" por consola. Así los datos de ejemplo nunca llaman a desconocidos.
   */
  DEV_ALLOWED_NUMBERS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  RETELL_API_KEY: z.string().default(''),
  RETELL_AGENT_ID: z.string().default(''),
  RETELL_FROM_NUMBER: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default('streamcrm-verify'),
  WHATSAPP_APP_SECRET: z.string().default(''),
  /** Vendedor por WhatsApp con IA (Claude). Sin clave, el bot no responde y se usa la interpretación por palabras. */
  ANTHROPIC_API_KEY: z.string().default(''),
  /**
   * 'openrouter' usa modelos gratis de OpenRouter (para probar sin gastar) con el mismo vendedor;
   * requiere OPENROUTER_API_KEY y un SALES_AGENT_MODEL de OpenRouter (p. ej. openrouter/free).
   */
  SALES_AGENT_PROVIDER: z.enum(['anthropic', 'openrouter']).default('anthropic'),
  OPENROUTER_API_KEY: z.string().default(''),
  SALES_AGENT_MODEL: z.string().default('claude-haiku-5-5'),
  /** JSON de la service account (contenido completo o ruta a un archivo .json). */
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(''),
  SHEET_SCAN_CRON: z.string().default('*/15 * * * *'),
  /** Horas hacia adelante en que una fila de la hoja pasa a la base de datos. */
  SHEET_IMPORT_WINDOW_HOURS: z.coerce.number().default(48),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return parsed.data;
}

let cached: Env | undefined;
export const env = (): Env => (cached ??= loadEnv());
export const setEnvForTests = (e: Env) => {
  cached = e;
};
