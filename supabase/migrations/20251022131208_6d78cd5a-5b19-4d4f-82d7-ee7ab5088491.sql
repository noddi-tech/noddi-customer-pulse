-- Fix count_active_user_groups function

CREATE OR REPLACE FUNCTION public.count_active_user_groups()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COUNT(DISTINCT user_group_id)
  FROM active_bookings
  WHERE user_group_id IS NOT NULL;
$function$;