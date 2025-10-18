-- Fix order_lines table to use UUID primary key instead of INTEGER
-- This prevents duplicate key errors when multiple bookings have items with the same sales_item.id

-- Drop the existing primary key constraint
ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_pkey;

-- Change id column to UUID type and set default
ALTER TABLE order_lines ALTER COLUMN id TYPE UUID USING gen_random_uuid();
ALTER TABLE order_lines ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Re-add primary key constraint
ALTER TABLE order_lines ADD PRIMARY KEY (id);

-- Add sales_item_id column to store the original template ID from Noddi API
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS sales_item_id BIGINT;

-- Clear existing data to start fresh with the new schema
TRUNCATE TABLE order_lines;

-- Update sync_state to reset order_lines progress
UPDATE sync_state 
SET 
  rows_fetched = 0,
  current_page = 0,
  progress_percentage = 0,
  status = 'pending'
WHERE resource = 'order_lines';