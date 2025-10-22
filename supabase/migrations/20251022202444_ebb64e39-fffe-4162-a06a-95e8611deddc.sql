-- Fix search_path security warning for get_lifecycle_insights function
CREATE OR REPLACE FUNCTION get_lifecycle_insights(time_period INTEGER DEFAULT 24)
RETURNS TABLE (
  lifecycle TEXT,
  customer_count BIGINT,
  avg_recency_days NUMERIC,
  avg_frequency_24m NUMERIC,
  avg_revenue_per_booking NUMERIC,
  avg_margin_per_booking NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    $q$
    SELECT 
      s.lifecycle,
      COUNT(*)::BIGINT as customer_count,
      ROUND(AVG(f.recency_days)::NUMERIC, 0) as avg_recency_days,
      ROUND(AVG(CASE 
        WHEN %1$s = 12 THEN f.frequency_12m
        WHEN %1$s = 24 THEN f.frequency_24m
        WHEN %1$s = 36 THEN f.frequency_36m
        WHEN %1$s = 48 THEN f.frequency_48m
        ELSE f.frequency_lifetime
      END)::NUMERIC, 1) as avg_frequency_24m,
      ROUND(AVG(CASE 
        WHEN %1$s = 12 THEN f.revenue_12m
        WHEN %1$s = 24 THEN f.revenue_24m
        WHEN %1$s = 36 THEN f.revenue_36m
        WHEN %1$s = 48 THEN f.revenue_48m
        ELSE f.revenue_lifetime
      END / NULLIF(CASE 
        WHEN %1$s = 12 THEN f.frequency_12m
        WHEN %1$s = 24 THEN f.frequency_24m
        WHEN %1$s = 36 THEN f.frequency_36m
        WHEN %1$s = 48 THEN f.frequency_48m
        ELSE f.frequency_lifetime
      END, 0))::NUMERIC, 0) as avg_revenue_per_booking,
      ROUND(AVG(CASE 
        WHEN %1$s = 12 THEN f.margin_12m
        WHEN %1$s = 24 THEN f.margin_24m
        WHEN %1$s = 36 THEN f.margin_36m
        WHEN %1$s = 48 THEN f.margin_48m
        ELSE f.margin_lifetime
      END / NULLIF(CASE 
        WHEN %1$s = 12 THEN f.frequency_12m
        WHEN %1$s = 24 THEN f.frequency_24m
        WHEN %1$s = 36 THEN f.frequency_36m
        WHEN %1$s = 48 THEN f.frequency_48m
        ELSE f.frequency_lifetime
      END, 0))::NUMERIC, 0) as avg_margin_per_booking
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
      END
    $q$, time_period
  );
END;
$$;