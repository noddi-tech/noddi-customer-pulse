-- PHASE 6: Add deferrable FK constraints for single-transaction batch loads
-- This allows inserting bookings + order_lines in a single transaction with FK validation at commit time

-- Make bookings.user_id constraint deferrable
ALTER TABLE bookings 
  DROP CONSTRAINT IF EXISTS bookings_user_id_fkey,
  ADD CONSTRAINT bookings_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES customers(id) 
    ON DELETE CASCADE 
    DEFERRABLE INITIALLY DEFERRED;

-- Make order_lines.booking_id constraint deferrable
ALTER TABLE order_lines 
  DROP CONSTRAINT IF EXISTS order_lines_booking_id_fkey,
  ADD CONSTRAINT order_lines_booking_id_fkey 
    FOREIGN KEY (booking_id) REFERENCES bookings(id) 
    ON DELETE CASCADE 
    DEFERRABLE INITIALLY DEFERRED;