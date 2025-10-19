-- Clean slate: truncate both tables
TRUNCATE TABLE features CASCADE;
TRUNCATE TABLE segments CASCADE;

-- Drop existing primary keys
ALTER TABLE features DROP CONSTRAINT IF EXISTS features_pkey;
ALTER TABLE segments DROP CONSTRAINT IF EXISTS segments_pkey;

-- Drop existing unique constraints
ALTER TABLE features DROP CONSTRAINT IF EXISTS features_user_group_id_unique;
ALTER TABLE features DROP CONSTRAINT IF EXISTS features_user_group_id_key;
ALTER TABLE segments DROP CONSTRAINT IF EXISTS segments_user_group_id_unique;
ALTER TABLE segments DROP CONSTRAINT IF EXISTS segments_user_group_id_key;

-- Make user_id nullable
ALTER TABLE features ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE segments ALTER COLUMN user_id DROP NOT NULL;

-- Add user_group_id as the new primary key
ALTER TABLE features ADD PRIMARY KEY (user_group_id);
ALTER TABLE segments ADD PRIMARY KEY (user_group_id);