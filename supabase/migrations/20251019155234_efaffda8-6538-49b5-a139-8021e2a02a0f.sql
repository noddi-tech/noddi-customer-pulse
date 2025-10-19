-- Add is_personal and type columns to user_groups table
ALTER TABLE user_groups 
ADD COLUMN IF NOT EXISTS is_personal BOOLEAN,
ADD COLUMN IF NOT EXISTS type TEXT;