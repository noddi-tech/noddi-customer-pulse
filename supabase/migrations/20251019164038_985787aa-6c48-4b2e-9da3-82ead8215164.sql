-- Create function to count distinct active user groups
CREATE OR REPLACE FUNCTION count_active_user_groups()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT user_group_id)
  FROM active_bookings
  WHERE user_group_id IS NOT NULL;
$$;