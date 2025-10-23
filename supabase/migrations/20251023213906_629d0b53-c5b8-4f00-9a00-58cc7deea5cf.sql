-- Function to get pyramid tier counts efficiently
CREATE OR REPLACE FUNCTION get_pyramid_tier_counts()
RETURNS TABLE(pyramid_tier_name text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.pyramid_tier_name::text,
    COUNT(*)::bigint
  FROM segments s
  WHERE s.pyramid_tier_name IS NOT NULL
  GROUP BY s.pyramid_tier_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to get dormant counts efficiently
CREATE OR REPLACE FUNCTION get_dormant_counts()
RETURNS TABLE(dormant_segment text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.dormant_segment::text,
    COUNT(*)::bigint
  FROM segments s
  WHERE s.dormant_segment IS NOT NULL
  GROUP BY s.dormant_segment;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to get customer segment counts
CREATE OR REPLACE FUNCTION get_customer_segment_counts()
RETURNS TABLE(customer_segment text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.customer_segment::text,
    COUNT(*)::bigint
  FROM segments s
  WHERE s.customer_segment IS NOT NULL
  GROUP BY s.customer_segment
  ORDER BY s.customer_segment;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;