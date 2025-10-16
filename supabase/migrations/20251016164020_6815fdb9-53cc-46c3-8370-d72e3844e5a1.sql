-- Noddi Customer Segmentation Platform Schema

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id BIGINT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  user_group_id BIGINT,
  language_code TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS ix_customers_group ON customers (user_group_id);
CREATE INDEX IF NOT EXISTS ix_customers_updated ON customers (updated_at);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT PRIMARY KEY,
  user_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
  user_group_id BIGINT,
  date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status_label TEXT,
  is_cancelled BOOLEAN DEFAULT FALSE,
  is_fully_paid BOOLEAN,
  is_partially_unable_to_complete BOOLEAN DEFAULT FALSE,
  is_fully_unable_to_complete BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_bookings_user ON bookings (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_bookings_group ON bookings (user_group_id);
CREATE INDEX IF NOT EXISTS ix_bookings_updated ON bookings (updated_at);

-- Order lines table
CREATE TABLE IF NOT EXISTS order_lines (
  id BIGINT PRIMARY KEY,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE CASCADE,
  sales_item_id BIGINT,
  description TEXT,
  quantity NUMERIC,
  amount_gross NUMERIC,
  amount_vat NUMERIC,
  currency TEXT,
  is_discount BOOLEAN DEFAULT FALSE,
  is_delivery_fee BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_ol_booking ON order_lines (booking_id);
CREATE INDEX IF NOT EXISTS ix_ol_sales_item ON order_lines (sales_item_id);
CREATE INDEX IF NOT EXISTS ix_ol_created ON order_lines (created_at);

-- Storage status table
CREATE TABLE IF NOT EXISTS storage_status (
  user_group_id BIGINT PRIMARY KEY,
  is_active BOOLEAN,
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Sync state table
CREATE TABLE IF NOT EXISTS sync_state (
  resource TEXT PRIMARY KEY,
  high_watermark TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  rows_fetched INT,
  status TEXT,
  error_message TEXT
);

-- Features table (computed metrics)
CREATE TABLE IF NOT EXISTS features (
  user_id BIGINT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ,
  last_booking_at TIMESTAMPTZ,
  last_dekkskift_at TIMESTAMPTZ,
  seasonal_due_at TIMESTAMPTZ,
  storage_active BOOLEAN,
  recency_days INT,
  frequency_24m INT,
  revenue_24m NUMERIC,
  margin_24m NUMERIC,
  discount_share_24m NUMERIC,
  fully_paid_rate NUMERIC,
  service_counts JSONB,
  service_tags_all JSONB
);

-- Segments table
CREATE TABLE IF NOT EXISTS segments (
  user_id BIGINT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  lifecycle TEXT,
  value_tier TEXT,
  tags JSONB,
  previous_lifecycle TEXT,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_segments_lifecycle ON segments (lifecycle);
CREATE INDEX IF NOT EXISTS ix_segments_value ON segments (value_tier);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default thresholds
INSERT INTO settings(key, value) VALUES
('thresholds', jsonb_build_object(
  'new_days', 90,
  'active_months', 7,
  'at_risk_from_months', 7,
  'at_risk_to_months', 9,
  'winback_days', 60,
  'default_margin_pct', 25,
  'value_high_percentile', 0.80,
  'value_mid_percentile', 0.50
))
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security (public read access for PoC)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE features ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read access" ON customers FOR SELECT USING (true);
CREATE POLICY "Public read access" ON bookings FOR SELECT USING (true);
CREATE POLICY "Public read access" ON order_lines FOR SELECT USING (true);
CREATE POLICY "Public read access" ON storage_status FOR SELECT USING (true);
CREATE POLICY "Public read access" ON sync_state FOR SELECT USING (true);
CREATE POLICY "Public read access" ON features FOR SELECT USING (true);
CREATE POLICY "Public read access" ON segments FOR SELECT USING (true);
CREATE POLICY "Public read access" ON settings FOR SELECT USING (true);

-- Enable realtime for sync_state and segments
ALTER PUBLICATION supabase_realtime ADD TABLE sync_state;
ALTER PUBLICATION supabase_realtime ADD TABLE segments;