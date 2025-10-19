-- Add display columns for scalable progress tracking
ALTER TABLE sync_state 
ADD COLUMN IF NOT EXISTS display_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS display_total INTEGER DEFAULT 0;

-- Backfill display_total from estimated_total for existing rows
UPDATE sync_state 
SET display_total = estimated_total 
WHERE display_total = 0 AND estimated_total IS NOT NULL;

-- Backfill display_count based on current progress
UPDATE sync_state 
SET display_count = CASE 
  WHEN resource IN ('user_groups', 'customers', 'bookings') THEN current_page * 100
  WHEN resource = 'order_lines' THEN rows_fetched
  ELSE rows_fetched
END
WHERE display_count = 0;