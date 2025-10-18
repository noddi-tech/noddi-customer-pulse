-- Add booking_items column to store nested order line data from Noddi API
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_items JSONB;