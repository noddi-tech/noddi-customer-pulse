-- Clean up old user-level data from features and segments tables
TRUNCATE TABLE features CASCADE;
TRUNCATE TABLE segments CASCADE;

-- Add unique constraint on user_group_id for features table
-- This allows the compute-segments function to properly upsert user_group-level data
ALTER TABLE features
ADD CONSTRAINT features_user_group_id_unique UNIQUE (user_group_id);

-- Add unique constraint on user_group_id for segments table
-- This allows the compute-segments function to properly upsert user_group-level data
ALTER TABLE segments
ADD CONSTRAINT segments_user_group_id_unique UNIQUE (user_group_id);