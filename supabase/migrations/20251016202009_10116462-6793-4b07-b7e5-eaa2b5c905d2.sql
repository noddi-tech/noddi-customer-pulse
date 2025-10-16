-- Add new columns to sync_state for progress tracking
ALTER TABLE sync_state
ADD COLUMN IF NOT EXISTS sync_mode text DEFAULT 'initial',
ADD COLUMN IF NOT EXISTS total_records integer,
ADD COLUMN IF NOT EXISTS progress_percentage numeric,
ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS estimated_completion_at timestamptz;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_sync_state_resource ON sync_state(resource);

-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the automated sync job (runs every 2 minutes)
SELECT cron.schedule(
  'auto-sync-noddi-data',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wylrkmtpjodunmnwncej.supabase.co/functions/v1/sync-noddi-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bHJrbXRwam9kdW5tbnduY2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzA1ODAsImV4cCI6MjA3NjIwNjU4MH0.L0tBvJ5tCfKiclLo6q35TIC8gOrxUiQ2tVmk5V2RQpo'
    ),
    body := jsonb_build_object('triggered_by', 'cron', 'timestamp', now())
  ) AS request_id;
  $$
);