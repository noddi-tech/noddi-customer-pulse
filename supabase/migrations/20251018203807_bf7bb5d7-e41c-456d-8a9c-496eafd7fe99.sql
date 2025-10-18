-- Reset bookings sync to force complete re-sync from page 0
-- This will populate booking_items for ALL bookings (not just recent ones)
UPDATE sync_state SET 
  status = 'pending',
  sync_mode = 'initial',
  current_page = 0,
  rows_fetched = 0,
  max_id_seen = 0,
  progress_percentage = 0,
  high_watermark = NULL,
  error_message = NULL
WHERE resource = 'bookings';

-- Reset order_lines since they need to be re-extracted from complete booking_items
UPDATE sync_state SET 
  status = 'pending',
  current_page = 0,
  max_id_seen = 0,
  progress_percentage = 0,
  error_message = NULL
WHERE resource = 'order_lines';

-- Keep customers as-is (already complete)
COMMENT ON TABLE sync_state IS 'Bookings reset to initial mode to populate booking_items for historical records';