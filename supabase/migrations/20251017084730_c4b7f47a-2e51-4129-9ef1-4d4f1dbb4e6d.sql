-- Add current_page to track pagination progress
ALTER TABLE sync_state 
ADD COLUMN IF NOT EXISTS current_page INTEGER DEFAULT 0;

-- Add estimated_total for better progress calculation
ALTER TABLE sync_state 
ADD COLUMN IF NOT EXISTS estimated_total INTEGER DEFAULT NULL;

-- Reset counters for accurate fresh start
UPDATE sync_state 
SET 
  current_page = 0,
  rows_fetched = 0,
  total_records = 0,
  sync_mode = 'initial',
  status = 'pending',
  progress_percentage = 0,
  error_message = NULL
WHERE resource IN ('customers', 'bookings');

COMMENT ON COLUMN sync_state.current_page IS 'Current page number being processed (for pagination resume)';
COMMENT ON COLUMN sync_state.estimated_total IS 'Estimated total records (for better progress tracking)';