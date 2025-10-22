-- Fix the JOIN condition in get_lifecycle_insights function
CREATE OR REPLACE FUNCTION get_lifecycle_insights(time_period integer DEFAULT 24)
RETURNS TABLE (
  lifecycle text,
  customer_count bigint,
  avg_recency_days numeric,
  avg_frequency_24m numeric,
  avg_revenue_per_booking numeric,
  avg_margin_per_booking numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  frequency_col text;
  revenue_col text;
  margin_col text;
BEGIN
  -- Determine which columns to use based on time_period
  CASE time_period
    WHEN 12 THEN
      frequency_col := 'frequency_12m';
      revenue_col := 'revenue_12m';
      margin_col := 'margin_12m';
    WHEN 24 THEN
      frequency_col := 'frequency_24m';
      revenue_col := 'revenue_24m';
      margin_col := 'margin_24m';
    WHEN 36 THEN
      frequency_col := 'frequency_36m';
      revenue_col := 'revenue_36m';
      margin_col := 'margin_36m';
    WHEN 48 THEN
      frequency_col := 'frequency_48m';
      revenue_col := 'revenue_48m';
      margin_col := 'margin_48m';
    WHEN 0 THEN
      frequency_col := 'frequency_lifetime';
      revenue_col := 'revenue_lifetime';
      margin_col := 'margin_lifetime';
    ELSE
      frequency_col := 'frequency_24m';
      revenue_col := 'revenue_24m';
      margin_col := 'margin_24m';
  END CASE;

  RETURN QUERY EXECUTE format('
    SELECT 
      s.lifecycle,
      COUNT(*)::bigint as customer_count,
      AVG(f.recency_days)::numeric as avg_recency_days,
      AVG(f.%I)::numeric as avg_frequency_24m,
      CASE 
        WHEN AVG(f.%I) > 0 THEN (AVG(f.%I) / NULLIF(AVG(f.%I), 0))::numeric
        ELSE 0
      END as avg_revenue_per_booking,
      CASE 
        WHEN AVG(f.%I) > 0 THEN (AVG(f.%I) / NULLIF(AVG(f.%I), 0))::numeric
        ELSE 0
      END as avg_margin_per_booking
    FROM segments s
    LEFT JOIN features f ON s.user_group_id = f.user_group_id
    WHERE s.lifecycle IS NOT NULL
    GROUP BY s.lifecycle
    ORDER BY 
      CASE s.lifecycle
        WHEN ''Champions'' THEN 1
        WHEN ''Loyal'' THEN 2
        WHEN ''Potential'' THEN 3
        WHEN ''New'' THEN 4
        WHEN ''At Risk'' THEN 5
        WHEN ''Cant Lose'' THEN 6
        WHEN ''Hibernating'' THEN 7
        WHEN ''Lost'' THEN 8
        ELSE 9
      END
  ', frequency_col, revenue_col, frequency_col, frequency_col, margin_col, frequency_col, frequency_col);
END;
$$;