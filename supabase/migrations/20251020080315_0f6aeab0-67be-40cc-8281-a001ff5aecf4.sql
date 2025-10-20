-- Create sync_mode_history table for audit trail
CREATE TABLE IF NOT EXISTS public.sync_mode_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  old_mode TEXT,
  new_mode TEXT,
  changed_by TEXT, -- 'auto' | 'manual' | 'recovery'
  reason TEXT,
  previous_page INTEGER,
  new_page INTEGER
);

-- Enable RLS
ALTER TABLE public.sync_mode_history ENABLE ROW LEVEL SECURITY;

-- Public read access for diagnostics
CREATE POLICY "Public read access" ON public.sync_mode_history
  FOR SELECT USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_sync_mode_history_resource ON public.sync_mode_history(resource, changed_at DESC);