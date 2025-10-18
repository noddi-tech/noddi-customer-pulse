-- Reset order_lines to start processing from the beginning
UPDATE sync_state SET 
  status = 'pending',
  max_id_seen = 0,
  progress_percentage = 0
WHERE resource = 'order_lines';