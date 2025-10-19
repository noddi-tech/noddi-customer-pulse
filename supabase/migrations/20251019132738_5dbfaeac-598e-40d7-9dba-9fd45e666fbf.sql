-- Create RPC function to get lifecycle insights with averages
CREATE OR REPLACE FUNCTION get_lifecycle_insights()
RETURNS TABLE (
  lifecycle TEXT,
  customer_count BIGINT,
  avg_recency_days NUMERIC,
  avg_frequency_24m NUMERIC,
  avg_revenue_24m NUMERIC,
  avg_margin_24m NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  LEFT JOIN features f ON s.user_id = f.user_id
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
$$;

-- Create RPC function to get churn timeline breakdown
CREATE OR REPLACE FUNCTION get_churn_timeline()
RETURNS TABLE (
  churn_period TEXT,
  customer_count BIGINT,
  period_order INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  JOIN features f ON s.user_id = f.user_id
  WHERE s.lifecycle = 'Churned'
    AND f.recency_days >= 270
  GROUP BY churn_period, period_order
  ORDER BY period_order;
END;
$$;

-- Create RPC function to get product line statistics
CREATE OR REPLACE FUNCTION get_product_line_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;