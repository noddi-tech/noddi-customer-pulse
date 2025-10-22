-- Create a function to compute value tiers using SQL percentile calculations
CREATE OR REPLACE FUNCTION public.compute_value_tiers(
  high_threshold NUMERIC DEFAULT 0.8,
  mid_threshold NUMERIC DEFAULT 0.5
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  updated_count INTEGER;
BEGIN
  -- Calculate value tiers using percentile-based RFM scoring
  WITH percentiles AS (
    SELECT
      percentile_cont(0.2) WITHIN GROUP (ORDER BY recency_days) as r_20,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY recency_days) as r_50,
      percentile_cont(0.8) WITHIN GROUP (ORDER BY recency_days) as r_80,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY frequency_24m) as f_50,
      percentile_cont(0.8) WITHIN GROUP (ORDER BY frequency_24m) as f_80,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY revenue_24m) as m_50,
      percentile_cont(0.8) WITHIN GROUP (ORDER BY revenue_24m) as m_80
    FROM features
    WHERE recency_days IS NOT NULL 
      AND frequency_24m IS NOT NULL 
      AND revenue_24m IS NOT NULL
  ),
  scored_features AS (
    SELECT 
      f.user_group_id,
      -- Calculate normalized RFM scores (0-1 range, inverted for recency)
      CASE 
        WHEN f.recency_days <= p.r_20 THEN 1.0
        WHEN f.recency_days <= p.r_50 THEN 0.7
        WHEN f.recency_days <= p.r_80 THEN 0.4
        ELSE 0.1
      END as r_score,
      CASE
        WHEN f.frequency_24m >= p.f_80 THEN 1.0
        WHEN f.frequency_24m >= p.f_50 THEN 0.5
        ELSE 0.2
      END as f_score,
      CASE
        WHEN f.revenue_24m >= p.m_80 THEN 1.0
        WHEN f.revenue_24m >= p.m_50 THEN 0.5
        ELSE 0.2
      END as m_score,
      -- Stickiness boosts
      COALESCE((CASE WHEN (f.service_counts->>'is_storage_customer')::boolean THEN 0.15 ELSE 0 END), 0) +
      COALESCE((CASE WHEN (f.service_counts->>'is_fleet_customer')::boolean THEN 0.10 ELSE 0 END), 0) +
      COALESCE((CASE WHEN COALESCE((f.service_counts->>'service_mix_count')::int, 0) >= 3 THEN 0.05 ELSE 0 END), 0) as boost
    FROM features f
    CROSS JOIN percentiles p
    WHERE f.recency_days IS NOT NULL 
      AND f.frequency_24m IS NOT NULL 
      AND f.revenue_24m IS NOT NULL
  )
  UPDATE segments s
  SET 
    value_tier = CASE
      WHEN (sf.r_score + sf.f_score + sf.m_score) / 3.0 + sf.boost >= high_threshold THEN 'High'
      WHEN (sf.r_score + sf.f_score + sf.m_score) / 3.0 + sf.boost >= mid_threshold THEN 'Mid'
      ELSE 'Low'
    END,
    updated_at = now()
  FROM scored_features sf
  WHERE s.user_group_id = sf.user_group_id;

  -- Get the count of updated rows and distribution
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Get distribution
  SELECT json_build_object(
    'updated', updated_count,
    'distribution', json_build_object(
      'High', (SELECT COUNT(*) FROM segments WHERE value_tier = 'High'),
      'Mid', (SELECT COUNT(*) FROM segments WHERE value_tier = 'Mid'),
      'Low', (SELECT COUNT(*) FROM segments WHERE value_tier = 'Low')
    )
  ) INTO result;

  RETURN result;
END;
$$;