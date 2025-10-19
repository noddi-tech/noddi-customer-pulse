-- Create function to get aggregated segment counts efficiently
CREATE OR REPLACE FUNCTION get_segment_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
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
    )
  );
$$;