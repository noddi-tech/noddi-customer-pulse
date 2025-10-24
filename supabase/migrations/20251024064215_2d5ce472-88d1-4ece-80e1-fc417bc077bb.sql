-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule automatic data sync every 2 hours
SELECT cron.schedule(
  'auto-sync-noddi-data',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wylrkmtpjodunmnwncej.supabase.co/functions/v1/sync-noddi-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bHJrbXRwam9kdW5tbnduY2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzA1ODAsImV4cCI6MjA3NjIwNjU4MH0.L0tBvJ5tCfKiclLo6q35TIC8gOrxUiQ2tVmk5V2RQpo'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule automatic analysis 10 minutes after sync completes
SELECT cron.schedule(
  'auto-run-analysis',
  '10 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wylrkmtpjodunmnwncej.supabase.co/functions/v1/orchestrate-analysis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bHJrbXRwam9kdW5tbnduY2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzA1ODAsImV4cCI6MjA3NjIwNjU4MH0.L0tBvJ5tCfKiclLo6q35TIC8gOrxUiQ2tVmk5V2RQpo'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Create helper function to view cron job status
CREATE OR REPLACE FUNCTION public.get_cron_jobs()
RETURNS TABLE (
  jobid bigint,
  schedule text,
  command text,
  nodename text,
  nodeport integer,
  database text,
  username text,
  active boolean,
  jobname text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT 
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active,
    jobname
  FROM cron.job
  WHERE jobname IN ('auto-sync-noddi-data', 'auto-run-analysis')
  ORDER BY jobname;
$$;

-- Create helper function to view recent cron job runs
CREATE OR REPLACE FUNCTION public.get_recent_cron_runs(limit_count integer DEFAULT 10)
RETURNS TABLE (
  jobid bigint,
  runid bigint,
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamp with time zone,
  end_time timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT 
    j.jobid,
    d.runid,
    d.job_pid,
    d.database,
    d.username,
    d.command,
    d.status,
    d.return_message,
    d.start_time,
    d.end_time
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname IN ('auto-sync-noddi-data', 'auto-run-analysis')
  ORDER BY d.start_time DESC
  LIMIT limit_count;
$$;