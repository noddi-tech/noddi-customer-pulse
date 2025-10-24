-- Add foreign key constraint from segments.user_group_id to user_groups.id
-- This enables PostgREST to resolve relationships and improves query performance
ALTER TABLE segments 
ADD CONSTRAINT segments_user_group_id_fkey 
FOREIGN KEY (user_group_id) 
REFERENCES user_groups(id) 
ON DELETE CASCADE;

-- Add index on user_group_id for faster joins and lookups
CREATE INDEX IF NOT EXISTS idx_segments_user_group_id 
ON segments(user_group_id);