// Reference SQL schema for the Bankoo economy core.
// Runs on SQLite (tests / local dev) and is written to translate 1:1 to PostgreSQL
// (see /prisma/schema.prisma for the production model + /prisma/ledger_guards.sql for PG triggers).

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Per-school economy policy (salary, bill, days, hour). Defaults = master spec.
CREATE TABLE school_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  salary_amount INTEGER NOT NULL DEFAULT 10,
  salary_weekday INTEGER NOT NULL DEFAULT 6,      -- 0=Sun ... 6=Sat (Saturday)
  bill_amount INTEGER NOT NULL DEFAULT 4,
  bill_weekday INTEGER NOT NULL DEFAULT 0,        -- Sunday
  run_hour INTEGER NOT NULL DEFAULT 8,            -- local hour, Africa/Algiers
  salary_enabled INTEGER NOT NULL DEFAULT 1,
  bills_enabled INTEGER NOT NULL DEFAULT 1,
  fraud_sim_enabled INTEGER NOT NULL DEFAULT 1,
  fraud_max_loss INTEGER NOT NULL DEFAULT 3,
  reward_cap_per_day INTEGER NOT NULL DEFAULT 20  -- anti-farming ceiling for activity rewards
);

CREATE TABLE school_holidays (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  day TEXT NOT NULL,                               -- YYYY-MM-DD local date
  PRIMARY KEY (tenant_id, day)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),           -- NULL only for platform super admin
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','SCHOOL_ADMIN','TEACHER','STUDENT','PARENT')),
  display_name TEXT NOT NULL
);

-- Ledger accounts. Student accounts may never go below zero.
-- System accounts (treasury / sinks) are counterparts so that every transaction sums to zero.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  owner_user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'STUDENT_WALLET','STUDENT_SAVINGS',
    'SCHOOL_TREASURY','SCHOOL_UTILITIES','SCHOOL_SHOP','FRAUD_SIM'
  )),
  allow_negative INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, owner_user_id, kind)
);

CREATE TABLE ledger_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  idempotency_key TEXT NOT NULL,
  type TEXT NOT NULL,                              -- SALARY, BILL_PAYMENT, REWARD, PURCHASE, SAVINGS_MOVE, FRAUD_LOSS, FRAUD_RECOVERY, ADJUSTMENT, REVERSAL
  memo TEXT NOT NULL,
  actor_user_id TEXT,                              -- NULL = system scheduler
  reason TEXT,                                     -- mandatory for manual ADJUSTMENT
  reverses_tx_id TEXT REFERENCES ledger_transactions(id),
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_id TEXT NOT NULL REFERENCES ledger_transactions(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  amount INTEGER NOT NULL CHECK (amount <> 0)      -- signed, whole Bankooz
);

-- Append-only ledger: history is corrected by REVERSAL transactions, never edited.
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_tx_no_update BEFORE UPDATE ON ledger_transactions
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_tx_no_delete BEFORE DELETE ON ledger_transactions
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  period_key TEXT NOT NULL,                        -- e.g. 2026-W48
  kind TEXT NOT NULL DEFAULT 'UTILITIES',
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING','PAID')),
  paid_tx_id TEXT REFERENCES ledger_transactions(id),
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, student_id, kind, period_key)
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  visible INTEGER NOT NULL DEFAULT 1,
  min_age INTEGER NOT NULL DEFAULT 6,
  max_age INTEGER NOT NULL DEFAULT 16,
  needs_approval INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PAID','AWAITING_APPROVAL','DELIVERED','CANCELLED')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('BANKOO_CARD','VIRTUAL_PHONE','INTERNAL_QR','CASH_BANKOOZ')),
  tx_id TEXT REFERENCES ledger_transactions(id),
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

-- One rewardable completion per (student, activity). Retries are free, rewards are not repeated.
CREATE TABLE reward_claims (
  tenant_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  activity_key TEXT NOT NULL,                      -- lesson:<id> | mission:<id> | fraud:<scenario>
  tx_id TEXT NOT NULL REFERENCES ledger_transactions(id),
  local_day TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, student_id, activity_key)
);

CREATE TABLE lesson_progress (
  tenant_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  scene_index INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  mastered INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, student_id, lesson_id)
);

CREATE TABLE fraud_attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  choice TEXT NOT NULL,
  safe INTEGER NOT NULL,
  loss_tx_id TEXT,
  recovered_tx_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  reason TEXT,
  at TEXT NOT NULL
);
`;
