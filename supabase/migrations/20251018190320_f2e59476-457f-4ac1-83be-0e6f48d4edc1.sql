-- Enable public insert access for sync_state
CREATE POLICY "Public insert access" ON public.sync_state
FOR INSERT
TO public
WITH CHECK (true);

-- Enable public update access for sync_state
CREATE POLICY "Public update access" ON public.sync_state
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);