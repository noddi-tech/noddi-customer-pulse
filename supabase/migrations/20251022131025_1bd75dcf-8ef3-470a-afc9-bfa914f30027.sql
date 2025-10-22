-- Fix the last function without search_path security setting

CREATE OR REPLACE FUNCTION public.get_segment_counts()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT jsonb_build_object(
    'lifecycle', (
      SELECT jsonb_object_agg(lifecycle, count)
      FROM (
        SELECT lifecycle, COUNT(*)::int as count
        FROM segments
        WHERE lifecycle IS NOT NULL
        GROUP BY lifecycle
      ) lifecycle_counts
    ),
    'value_tier', (
      SELECT jsonb_object_agg(value_tier, count)
      FROM (
        SELECT value_tier, COUNT(*)::int as count
        FROM segments
        WHERE value_tier IS NOT NULL
        GROUP BY value_tier
      ) value_tier_counts
    ),
    'customer_type', (
      SELECT jsonb_object_agg(customer_type, count)
      FROM (
        SELECT 
          CASE 
            WHEN ug.org_id IS NULL THEN 'B2C'
            ELSE 'B2B'
          END as customer_type,
          COUNT(*)::int as count
        FROM segments s
        LEFT JOIN user_groups ug ON s.user_group_id = ug.id
        WHERE s.user_group_id IS NOT NULL
        GROUP BY customer_type
      ) type_counts
    )
  );
$function$;