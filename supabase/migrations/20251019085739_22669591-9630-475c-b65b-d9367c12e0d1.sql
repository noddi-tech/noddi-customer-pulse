-- Create filtered views that match Metabase business rules

-- Active bookings: exclude cancelled and unable-to-complete
CREATE OR REPLACE VIEW active_bookings AS
SELECT * FROM bookings
WHERE (status_label IN ('Draft', 'Confirmed', 'Assigned', 'Completed')
       OR status_label IS NULL)  -- include nulls to be safe
  AND (is_fully_unable_to_complete = false OR is_fully_unable_to_complete IS NULL)
  AND (is_cancelled = false OR is_cancelled IS NULL);

-- Active order lines: only from active bookings, positive amounts
CREATE OR REPLACE VIEW active_order_lines AS
SELECT ol.* FROM order_lines ol
INNER JOIN bookings b ON ol.booking_id = b.id
WHERE (b.status_label IN ('Draft', 'Confirmed', 'Assigned', 'Completed')
       OR b.status_label IS NULL)
  AND (b.is_fully_unable_to_complete = false OR b.is_fully_unable_to_complete IS NULL)
  AND (b.is_cancelled = false OR b.is_cancelled IS NULL)
  AND (ol.amount_gross > 0 OR ol.amount_gross IS NULL);

-- Active customers: those with at least one active booking
CREATE OR REPLACE VIEW active_customers AS
SELECT DISTINCT c.* FROM customers c
INNER JOIN bookings b ON c.id = b.user_id
WHERE (b.status_label IN ('Draft', 'Confirmed', 'Assigned', 'Completed')
       OR b.status_label IS NULL)
  AND (b.is_fully_unable_to_complete = false OR b.is_fully_unable_to_complete IS NULL)
  AND (b.is_cancelled = false OR b.is_cancelled IS NULL);