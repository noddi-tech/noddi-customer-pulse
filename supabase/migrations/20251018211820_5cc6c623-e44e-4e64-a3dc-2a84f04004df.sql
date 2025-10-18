-- Force complete reset of order_lines sync state to trigger edge function reload
UPDATE sync_state SET 
  status = 'pending',
  max_id_seen = 0,
  rows_fetched = 0,
  progress_percentage = 0,
  last_run_at = NOW()
WHERE resource = 'order_lines';