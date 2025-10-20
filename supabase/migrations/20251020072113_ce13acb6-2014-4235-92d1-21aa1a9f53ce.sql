-- Remove problematic display columns from sync_state
-- These tracked API pagination progress, not actual database counts
-- The UI will now use real-time database counts from useDatabaseCounts hook

ALTER TABLE sync_state 
DROP COLUMN IF EXISTS display_count,
DROP COLUMN IF EXISTS display_total;