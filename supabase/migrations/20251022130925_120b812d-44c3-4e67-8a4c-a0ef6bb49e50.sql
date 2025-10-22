-- Create function to count inactive customers (user_groups with no bookings/segments)
CREATE OR REPLACE FUNCTION public.get_inactive_customer_count()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM user_groups ug
  WHERE NOT EXISTS (
    SELECT 1 FROM segments s WHERE s.user_group_id = ug.id
  );
$$;