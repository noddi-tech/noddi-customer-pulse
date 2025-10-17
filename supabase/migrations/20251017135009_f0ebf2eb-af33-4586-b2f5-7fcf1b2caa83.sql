-- Backfill started_at from date field for existing bookings
UPDATE bookings 
SET started_at = CASE 
  WHEN date IS NOT NULL THEN date::timestamp with time zone
  ELSE NULL 
END
WHERE started_at IS NULL;