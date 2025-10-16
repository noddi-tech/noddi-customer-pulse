-- Add max_id_seen column to track highest ID for incremental sync
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS max_id_seen bigint DEFAULT 0;