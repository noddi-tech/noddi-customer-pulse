-- Drop and recreate get_lifecycle_insights with per-booking metrics
DROP FUNCTION IF EXISTS public.get_lifecycle_insights();

CREATE OR REPLACE FUNCTION public.get_lifecycle_insights()
RETURNS TABLE(
  lifecycle text,
  customer_count bigint,
  avg_recency_days numeric,
  avg_frequency_24m numeric,
  avg_revenue_per_booking numeric,
  avg_margin_per_booking numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    s.lifecycle,
    COUNT(*)::BIGINT as customer_count,
    ROUND(AVG(f.recency_days)::NUMERIC, 0) as avg_recency_days,
    ROUND(AVG(f.frequency_24m)::NUMERIC, 1) as avg_frequency_24m,
    -- Per-booking revenue (Net, excluding VAT)
    ROUND(AVG(
      CASE 
        WHEN f.frequency_24m > 0 THEN f.revenue_24m / f.frequency_24m 
        ELSE 0 
      END
    )::NUMERIC, 0) as avg_revenue_per_booking,
    -- Per-booking margin
    ROUND(AVG(
      CASE 
        WHEN f.frequency_24m > 0 THEN f.margin_24m / f.frequency_24m 
        ELSE 0 
      END
    )::NUMERIC, 0) as avg_margin_per_booking
  FROM segments s
  LEFT JOIN features f ON COALESCE(s.user_group_id, s.user_id) = COALESCE(f.user_group_id, f.user_id)
  WHERE s.lifecycle IS NOT NULL
  GROUP BY s.lifecycle
  ORDER BY 
    CASE s.lifecycle
      WHEN 'New' THEN 1
      WHEN 'Active' THEN 2
      WHEN 'At-risk' THEN 3
      WHEN 'Churned' THEN 4
      WHEN 'Winback' THEN 5
      ELSE 6
    END;
END;
$function$;