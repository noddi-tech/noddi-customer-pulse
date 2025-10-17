-- Add total_records column to sync_state to track cumulative records synced
ALTER TABLE sync_state 
ADD COLUMN IF NOT EXISTS total_records INTEGER DEFAULT 0;

-- Reset sync state to force complete re-sync from the beginning
UPDATE sync_state 
SET 
  sync_mode = 'initial',
  max_id_seen = 0,
  rows_fetched = 0,
  total_records = 0,
  status = 'pending',
  progress_percentage = 0,
  error_message = NULL
WHERE resource IN ('customers', 'bookings');

COMMENT ON COLUMN sync_state.total_records IS 'Cumulative total of unique records synced (distinct from rows_fetched which counts all fetched rows)';