-- Create user_groups table to store customer information
CREATE TABLE public.user_groups (
  id BIGINT PRIMARY KEY,
  name TEXT,
  org_id BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Create index for org_id to quickly identify B2B vs B2C
CREATE INDEX idx_user_groups_org_id ON public.user_groups(org_id);

-- Enable RLS
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

-- Public read access policy
CREATE POLICY "Public read access" ON public.user_groups 
FOR SELECT USING (true);

-- Add user_group_id to features table (allow nulls initially)
ALTER TABLE public.features ADD COLUMN user_group_id BIGINT;

-- Add user_group_id to segments table (allow nulls initially)
ALTER TABLE public.segments ADD COLUMN user_group_id BIGINT;

-- Create indexes
CREATE INDEX idx_features_user_group_id ON public.features(user_group_id);
CREATE INDEX idx_segments_user_group_id ON public.segments(user_group_id);

-- We'll need to sync user_groups and recompute segments before we can change primary keys
-- For now, just add the columns and indexes

-- Update RPC function to include customer_type breakdown
CREATE OR REPLACE FUNCTION public.get_segment_counts()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- Update get_lifecycle_insights to work with user_group_id
CREATE OR REPLACE FUNCTION public.get_lifecycle_insights()
RETURNS TABLE(lifecycle text, customer_count bigint, avg_recency_days numeric, avg_frequency_24m numeric, avg_revenue_24m numeric, avg_margin_24m numeric)
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Update get_churn_timeline to work with user_group_id
CREATE OR REPLACE FUNCTION public.get_churn_timeline()
RETURNS TABLE(churn_period text, customer_count bigint, period_order integer)
LANGUAGE plpgsql
SECURITY DEFINER
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