-- Fix search_path security warnings for existing functions

-- Fix get_product_line_stats
CREATE OR REPLACE FUNCTION public.get_product_line_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'tire_service_customers', (
      SELECT COUNT(*)
      FROM features
      WHERE service_counts IS NOT NULL
        AND (service_counts->>'is_wheel_change_customer')::boolean = true
    ),
    'storage_customers', (
      SELECT COUNT(*)
      FROM features
      WHERE service_counts IS NOT NULL
        AND (service_counts->>'is_storage_customer')::boolean = true
    ),
    'fleet_customers', (
      SELECT COUNT(*)
      FROM features
      WHERE service_counts IS NOT NULL
        AND (service_counts->>'is_fleet_customer')::boolean = true
    ),
    'multi_service_customers', (
      SELECT COUNT(*)
      FROM features
      WHERE service_counts IS NOT NULL
        AND (service_counts->>'is_multi_service')::boolean = true
    )
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- Fix get_lifecycle_insights
CREATE OR REPLACE FUNCTION public.get_lifecycle_insights()
RETURNS TABLE(lifecycle text, customer_count bigint, avg_recency_days numeric, avg_frequency_24m numeric, avg_revenue_24m numeric, avg_margin_24m numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    s.lifecycle,
    COUNT(*)::BIGINT as customer_count,
    ROUND(AVG(f.recency_days)::NUMERIC, 0) as avg_recency_days,
    ROUND(AVG(f.frequency_24m)::NUMERIC, 1) as avg_frequency_24m,
    ROUND(AVG(f.revenue_24m)::NUMERIC, 0) as avg_revenue_24m,
    ROUND(AVG(f.margin_24m)::NUMERIC, 0) as avg_margin_24m
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

-- Fix get_churn_timeline
CREATE OR REPLACE FUNCTION public.get_churn_timeline()
RETURNS TABLE(churn_period text, customer_count bigint, period_order integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN f.recency_days BETWEEN 270 AND 365 THEN '9-12 months inactive'
      WHEN f.recency_days BETWEEN 366 AND 548 THEN '12-18 months inactive'
      WHEN f.recency_days > 548 THEN '18+ months inactive'
    END as churn_period,
    COUNT(*)::BIGINT as customer_count,
    CASE 
      WHEN f.recency_days BETWEEN 270 AND 365 THEN 1
      WHEN f.recency_days BETWEEN 366 AND 548 THEN 2
      WHEN f.recency_days > 548 THEN 3
    END as period_order
  FROM segments s
  JOIN features f ON COALESCE(s.user_group_id, s.user_id) = COALESCE(f.user_group_id, f.user_id)
  WHERE s.lifecycle = 'Churned'
    AND f.recency_days >= 270
  GROUP BY churn_period, period_order
  ORDER BY period_order;
END;
$function$;