-- Reset stuck running states to pending
UPDATE sync_state 
SET status = 'pending' 
WHERE status = 'running';

-- Verify sync_state is clean
SELECT resource, status, last_run_at, current_page, max_id_seen 
FROM sync_state 
ORDER BY resource;