-- Booth Checkout — Production PostgreSQL Schema
-- Enforces strict vendor attribution, integer-cent accounting, and order idempotency.

CREATE TABLE IF NOT EXISTS market_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate_bps INTEGER NOT NULL DEFAULT 0,
  tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  commission_rate_bps INTEGER NOT NULL DEFAULT 0,
  payment_provider TEXT NOT NULL,
  payment_identifier TEXT NOT NULL,
  custom_payment_template TEXT,
  order_prefix TEXT NOT NULL,
  next_order_seq INTEGER NOT NULL DEFAULT 1001,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES market_events(id) ON DELETE CASCADE,
  vendor_letter TEXT NOT NULL,
  name TEXT NOT NULL CHECK (LOWER(TRIM(name)) <> 'unknown vendor'),
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  dot_color TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  source_spreadsheet TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, vendor_letter)
);

CREATE TABLE IF NOT EXISTS vendor_price_options (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES market_events(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  label TEXT
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES market_events(id) ON DELETE CASCADE,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by TEXT NOT NULL,
  valid_row_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  sheets_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES market_events(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  vendor_letter TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity > 0),
  tag_type TEXT NOT NULL CHECK (tag_type IN ('HANG_TAG', 'DOT')),
  dot_category TEXT,
  photo_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'SOLD', 'REMOVED')),
  original_workbook_name TEXT,
  original_sheet_name TEXT,
  original_row_index INTEGER,
  original_row_data JSONB,
  import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
  sold_in_order_number TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_event_code ON inventory_items(event_id, item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_vendor ON inventory_items(vendor_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES market_events(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'ADJUSTED')),
  payment_provider TEXT NOT NULL,
  payment_url TEXT,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  source TEXT NOT NULL CHECK (source IN ('REGISTER', 'PAPER_RECOVERY')),
  device_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  idempotency_key TEXT NOT NULL UNIQUE,
  notes TEXT,
  conflict_flags JSONB
);

CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);

-- OrderLines store transaction-time snapshots so historical orders remain immutable
CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL CHECK (LOWER(TRIM(vendor_name)) <> 'unknown vendor'),
  vendor_letter TEXT NOT NULL,
  item_description TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents = unit_price_cents * quantity),
  tag_type TEXT NOT NULL CHECK (tag_type IN ('HANG_TAG', 'DOT'))
);

CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_vendor ON order_lines(vendor_id);

CREATE TABLE IF NOT EXISTS order_adjustments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES market_events(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  notes TEXT NOT NULL,
  original_value_json JSONB NOT NULL,
  updated_value_json JSONB NOT NULL,
  delta_total_cents INTEGER NOT NULL,
  vendor_id TEXT,
  performed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_name TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
