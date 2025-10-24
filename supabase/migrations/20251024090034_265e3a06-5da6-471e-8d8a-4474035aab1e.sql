-- Function 1: Get pyramid counts by customer type (B2C/B2B)
-- This bypasses PostgREST row limits by returning aggregated counts instead of thousands of rows
CREATE OR REPLACE FUNCTION public.get_pyramid_by_customer_type()
RETURNS TABLE (
  customer_segment text,
  champion_count bigint,
  loyalist_count bigint,
  engaged_count bigint,
  prospect_count bigint,
  total_count bigint
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    customer_segment,
    COALESCE(SUM(CASE WHEN pyramid_tier_name = 'Champion' THEN 1 ELSE 0 END), 0) as champion_count,
    COALESCE(SUM(CASE WHEN pyramid_tier_name = 'Loyalist' THEN 1 ELSE 0 END), 0) as loyalist_count,
    COALESCE(SUM(CASE WHEN pyramid_tier_name = 'Engaged' THEN 1 ELSE 0 END), 0) as engaged_count,
    COALESCE(SUM(CASE WHEN pyramid_tier_name = 'Prospect' THEN 1 ELSE 0 END), 0) as prospect_count,
    COUNT(*) as total_count
  FROM segments
  WHERE pyramid_tier_name IS NOT NULL
    AND customer_segment IS NOT NULL
  GROUP BY customer_segment
  ORDER BY customer_segment;
$$;

-- Function 2: Get full pyramid tier distribution including dormant segments
-- This bypasses PostgREST row limits by returning aggregated counts instead of thousands of rows
CREATE OR REPLACE FUNCTION public.get_pyramid_tier_distribution()
RETURNS TABLE (
  customer_segment text,
  total bigint,
  tier1_champion bigint,
  tier2_loyalist bigint,
  tier3_engaged bigint,
  tier4_prospect bigint,
  dormant bigint
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    customer_segment,
    COUNT(*) as total,
    COALESCE(SUM(CASE WHEN pyramid_tier = 1 THEN 1 ELSE 0 END), 0) as tier1_champion,
    COALESCE(SUM(CASE WHEN pyramid_tier = 2 THEN 1 ELSE 0 END), 0) as tier2_loyalist,
    COALESCE(SUM(CASE WHEN pyramid_tier = 3 THEN 1 ELSE 0 END), 0) as tier3_engaged,
    COALESCE(SUM(CASE WHEN pyramid_tier = 4 THEN 1 ELSE 0 END), 0) as tier4_prospect,
    COALESCE(SUM(CASE WHEN dormant_segment IS NOT NULL THEN 1 ELSE 0 END), 0) as dormant
  FROM segments
  WHERE customer_segment IS NOT NULL
  GROUP BY customer_segment
  ORDER BY customer_segment;
$$;