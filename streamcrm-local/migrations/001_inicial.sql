-- StreamCRM Local: esquema inicial (un solo negocio por instalación).
-- Fechas de calendario: 'AAAA-MM-DD'. Instantes: ISO UTC '2026-10-30T15:00:00.000Z'.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE users (
  id              INTEGER PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name            TEXT NOT NULL DEFAULT '',
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'vendedor')),
  active          INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE customers (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  notes         TEXT,
  tags          TEXT NOT NULL DEFAULT '',
  consent_calls INTEGER NOT NULL DEFAULT 0,
  consent_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX customers_phone ON customers(phone);

CREATE TABLE services (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL,
  price         REAL NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Cuentas madre: la cuenta que el negocio paga a la plataforma y reparte en perfiles.
CREATE TABLE stream_accounts (
  id             INTEGER PRIMARY KEY,
  platform       TEXT NOT NULL,
  email          TEXT NOT NULL,
  password_enc   TEXT,
  total_profiles INTEGER NOT NULL DEFAULT 1,
  expires_at     TEXT,
  cost           REAL NOT NULL DEFAULT 0,
  notes          TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE subscriptions (
  id                INTEGER PRIMARY KEY,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id        INTEGER REFERENCES services(id) ON DELETE SET NULL,
  stream_account_id INTEGER REFERENCES stream_accounts(id) ON DELETE SET NULL,
  profile_name      TEXT,
  pin_enc           TEXT,
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  price             REAL NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'activa'
                    CHECK (status IN ('activa', 'por_vencer', 'vencida', 'cancelada')),
  reminder_at       TEXT,
  reminder_status   TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (reminder_status IN ('pendiente', 'enviando', 'enviado', 'respondido', 'fallido', 'manual')),
  reminder_channel  TEXT,
  reminder_attempts INTEGER NOT NULL DEFAULT 0,
  renewal_intent    TEXT CHECK (renewal_intent IN ('renueva', 'no_renueva', 'pensando', 'sin_respuesta')),
  last_call_id      TEXT,
  last_call_summary TEXT,
  recording_url     TEXT,
  last_contact_at   TEXT,
  notes             TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX subscriptions_due ON subscriptions(reminder_status, reminder_at);
CREATE INDEX subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX subscriptions_account ON subscriptions(stream_account_id);

CREATE TABLE payments (
  id              INTEGER PRIMARY KEY,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  amount          REAL NOT NULL,
  method          TEXT NOT NULL CHECK (method IN ('yape', 'plin', 'efectivo', 'transferencia', 'otro')),
  paid_at         TEXT NOT NULL,
  note            TEXT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX payments_paid_at ON payments(paid_at);

-- Cada llamada o mensaje enviado (historial del cliente y control del polling a Retell).
CREATE TABLE calls (
  id                  INTEGER PRIMARY KEY,
  subscription_id     INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL,
  external_id         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'enviada',
  disconnection_reason TEXT,
  summary             TEXT,
  intent              TEXT,
  recording_url       TEXT,
  duration_ms         INTEGER,
  last_polled_at      TEXT,
  finished_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (channel, external_id)
);

-- Bitácora: llamadas, renovaciones, contraseñas vistas, cambios de ajustes.
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  type       TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  data       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX events_created ON events(created_at);
