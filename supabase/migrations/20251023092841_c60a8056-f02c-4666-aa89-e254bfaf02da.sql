-- Create compute_pyramid_tiers_v3() function for Phase 2 segmentation
CREATE OR REPLACE FUNCTION public.compute_pyramid_tiers_v3()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  -- Step 1: Calculate segment-specific quantiles for B2C, SMB, Large, Enterprise
  WITH segment_quantiles AS (
    SELECT 
      s.customer_segment,
      -- Recency quantiles (inverted: lower is better)
      percentile_cont(0.25) WITHIN GROUP (ORDER BY f.recency_days) as r_p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY f.recency_days) as r_p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY f.recency_days) as r_p75,
      -- Frequency quantiles
      percentile_cont(0.50) WITHIN GROUP (ORDER BY f.frequency_24m) as f_p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY f.frequency_24m) as f_p75,
      -- Revenue quantiles (use service revenue to avoid tire bias)
      percentile_cont(0.50) WITHIN GROUP (ORDER BY f.service_revenue_24m) as m_p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY f.service_revenue_24m) as m_p75,
      -- Segment average tire revenue (for capping)
      AVG(f.tire_revenue_24m) as avg_tire_revenue,
      COUNT(*) as segment_customer_count
    FROM segments s
    JOIN features f ON s.user_group_id = f.user_group_id
    WHERE s.customer_segment IS NOT NULL
      AND f.recency_days IS NOT NULL
    GROUP BY s.customer_segment
  ),
  
  -- Step 2: Calculate composite scores with capped tire revenue
  scored_customers AS (
    SELECT 
      s.user_group_id,
      s.customer_segment,
      s.lifecycle,
      f.recency_days,
      f.frequency_24m,
      f.frequency_lifetime,
      f.service_revenue_24m,
      f.tire_revenue_24m,
      f.storage_active,
      s.high_value_tire_purchaser,
      s.fleet_size,
      -- R score (inverted, 0-1 range)
      CASE 
        WHEN f.recency_days <= q.r_p25 THEN 1.0
        WHEN f.recency_days <= q.r_p50 THEN 0.7
        WHEN f.recency_days <= q.r_p75 THEN 0.4
        ELSE 0.1
      END as r_score,
      -- F score
      CASE
        WHEN f.frequency_24m >= q.f_p75 THEN 1.0
        WHEN f.frequency_24m >= q.f_p50 THEN 0.5
        ELSE 0.2
      END as f_score,
      -- M score (using service revenue)
      CASE
        WHEN f.service_revenue_24m >= q.m_p75 THEN 1.0
        WHEN f.service_revenue_24m >= q.m_p50 THEN 0.5
        ELSE 0.2
      END as m_score,
      -- Tire revenue boost (capped at 2x segment average)
      CASE 
        WHEN f.tire_revenue_24m > 0 AND q.avg_tire_revenue > 0 THEN 
          LEAST(f.tire_revenue_24m, q.avg_tire_revenue * 2) / NULLIF(q.avg_tire_revenue * 2, 0) * 0.15
        ELSE 0
      END as tire_boost,
      -- Stickiness boosts
      CASE WHEN f.storage_active THEN 0.15 ELSE 0 END as storage_boost,
      CASE WHEN (f.service_counts->>'is_multi_service')::boolean THEN 0.05 ELSE 0 END as multi_service_boost,
      -- B2B Enterprise bonus (largest fleets get extra weight)
      CASE 
        WHEN s.customer_segment = 'Enterprise' AND s.fleet_size >= 100 THEN 0.10
        WHEN s.customer_segment = 'Enterprise' THEN 0.05
        ELSE 0
      END as enterprise_boost
    FROM segments s
    JOIN features f ON s.user_group_id = f.user_group_id
    LEFT JOIN segment_quantiles q ON q.customer_segment = s.customer_segment
    WHERE s.customer_segment IS NOT NULL
      AND f.recency_days IS NOT NULL
  ),
  
  -- Step 3: Calculate final composite scores
  final_scores AS (
    SELECT 
      user_group_id,
      customer_segment,
      lifecycle,
      recency_days,
      frequency_24m,
      frequency_lifetime,
      storage_active,
      high_value_tire_purchaser,
      fleet_size,
      (r_score + f_score + m_score) / 3.0 + 
        tire_boost + storage_boost + multi_service_boost + enterprise_boost as composite_score
    FROM scored_customers
  ),
  
  -- Step 4: Assign tiers based on lifecycle + composite score
  tier_assignments AS (
    SELECT 
      fs.user_group_id,
      fs.composite_score,
      fs.customer_segment,
      -- Tier 1: Champions
      CASE
        WHEN fs.lifecycle = 'Active' AND 
             (fs.composite_score >= 0.75 OR 
              fs.high_value_tire_purchaser OR 
              fs.storage_active OR 
              fs.customer_segment = 'Enterprise') 
        THEN 1
        
        -- Tier 2: Loyalists  
        WHEN (fs.lifecycle = 'Active' AND fs.composite_score >= 0.5) OR
             (fs.lifecycle = 'At-risk' AND fs.composite_score >= 0.7)
        THEN 2
        
        -- Tier 3: Engaged
        WHEN (fs.lifecycle IN ('Active', 'At-risk') AND fs.frequency_lifetime >= 2) OR
             (fs.lifecycle = 'Winback' AND fs.composite_score >= 0.5)
        THEN 3
        
        -- Tier 4: Prospects
        WHEN fs.lifecycle IN ('New', 'Winback') OR
             (fs.frequency_lifetime = 1 AND fs.recency_days < 180)
        THEN 4
        
        ELSE NULL -- Dormant pool
      END as pyramid_tier,
      
      -- Dormant segmentation
      CASE
        WHEN CASE
          WHEN fs.lifecycle = 'Active' AND 
               (fs.composite_score >= 0.75 OR 
                fs.high_value_tire_purchaser OR 
                fs.storage_active OR 
                fs.customer_segment = 'Enterprise') 
          THEN 1
          
          WHEN (fs.lifecycle = 'Active' AND fs.composite_score >= 0.5) OR
               (fs.lifecycle = 'At-risk' AND fs.composite_score >= 0.7)
          THEN 2
          
          WHEN (fs.lifecycle IN ('Active', 'At-risk') AND fs.frequency_lifetime >= 2) OR
               (fs.lifecycle = 'Winback' AND fs.composite_score >= 0.5)
          THEN 3
          
          WHEN fs.lifecycle IN ('New', 'Winback') OR
               (fs.frequency_lifetime = 1 AND fs.recency_days < 180)
          THEN 4
          
          ELSE NULL
        END IS NULL AND fs.lifecycle = 'Churned' AND fs.recency_days <= 730 
        THEN 'salvageable'
        WHEN CASE
          WHEN fs.lifecycle = 'Active' AND 
               (fs.composite_score >= 0.75 OR 
                fs.high_value_tire_purchaser OR 
                fs.storage_active OR 
                fs.customer_segment = 'Enterprise') 
          THEN 1
          
          WHEN (fs.lifecycle = 'Active' AND fs.composite_score >= 0.5) OR
               (fs.lifecycle = 'At-risk' AND fs.composite_score >= 0.7)
          THEN 2
          
          WHEN (fs.lifecycle IN ('Active', 'At-risk') AND fs.frequency_lifetime >= 2) OR
               (fs.lifecycle = 'Winback' AND fs.composite_score >= 0.5)
          THEN 3
          
          WHEN fs.lifecycle IN ('New', 'Winback') OR
               (fs.frequency_lifetime = 1 AND fs.recency_days < 180)
          THEN 4
          
          ELSE NULL
        END IS NULL 
        THEN 'transient'
        ELSE NULL
      END as dormant_segment,
      
      -- Calculate next tier requirements (simplified)
      CASE 
        WHEN CASE
          WHEN fs.lifecycle = 'Active' AND 
               (fs.composite_score >= 0.75 OR 
                fs.high_value_tire_purchaser OR 
                fs.storage_active OR 
                fs.customer_segment = 'Enterprise') 
          THEN 1
          
          WHEN (fs.lifecycle = 'Active' AND fs.composite_score >= 0.5) OR
               (fs.lifecycle = 'At-risk' AND fs.composite_score >= 0.7)
          THEN 2
          
          WHEN (fs.lifecycle IN ('Active', 'At-risk') AND fs.frequency_lifetime >= 2) OR
               (fs.lifecycle = 'Winback' AND fs.composite_score >= 0.5)
          THEN 3
          
          WHEN fs.lifecycle IN ('New', 'Winback') OR
               (fs.frequency_lifetime = 1 AND fs.recency_days < 180)
          THEN 4
          
          ELSE NULL
        END = 4 THEN 
          jsonb_build_object(
            'next_tier', 'Engaged',
            'requirement', 'Book 1 more service within 6 months',
            'current_bookings', fs.frequency_lifetime
          )
        WHEN CASE
          WHEN fs.lifecycle = 'Active' AND 
               (fs.composite_score >= 0.75 OR 
                fs.high_value_tire_purchaser OR 
                fs.storage_active OR 
                fs.customer_segment = 'Enterprise') 
          THEN 1
          
          WHEN (fs.lifecycle = 'Active' AND fs.composite_score >= 0.5) OR
               (fs.lifecycle = 'At-risk' AND fs.composite_score >= 0.7)
          THEN 2
          
          WHEN (fs.lifecycle IN ('Active', 'At-risk') AND fs.frequency_lifetime >= 2) OR
               (fs.lifecycle = 'Winback' AND fs.composite_score >= 0.5)
          THEN 3
          
          WHEN fs.lifecycle IN ('New', 'Winback') OR
               (fs.frequency_lifetime = 1 AND fs.recency_days < 180)
          THEN 4
          
          ELSE NULL
        END = 3 THEN 
          jsonb_build_object(
            'next_tier', 'Loyalist',
            'requirement', 'Maintain active status with frequency ≥2/year',
            'current_frequency', fs.frequency_24m
          )
        WHEN CASE
          WHEN fs.lifecycle = 'Active' AND 
               (fs.composite_score >= 0.75 OR 
                fs.high_value_tire_purchaser OR 
                fs.storage_active OR 
                fs.customer_segment = 'Enterprise') 
          THEN 1
          
          WHEN (fs.lifecycle = 'Active' AND fs.composite_score >= 0.5) OR
               (fs.lifecycle = 'At-risk' AND fs.composite_score >= 0.7)
          THEN 2
          
          WHEN (fs.lifecycle IN ('Active', 'At-risk') AND fs.frequency_lifetime >= 2) OR
               (fs.lifecycle = 'Winback' AND fs.composite_score >= 0.5)
          THEN 3
          
          WHEN fs.lifecycle IN ('New', 'Winback') OR
               (fs.frequency_lifetime = 1 AND fs.recency_days < 180)
          THEN 4
          
          ELSE NULL
        END = 2 THEN 
          jsonb_build_object(
            'next_tier', 'Champion',
            'requirement', 'Add storage contract or increase frequency',
            'has_storage', fs.storage_active
          )
        ELSE NULL
      END as next_tier_requirements
    FROM final_scores fs
  )
  
  -- Step 5: Update segments table
  UPDATE segments s
  SET 
    pyramid_tier = ta.pyramid_tier,
    pyramid_tier_name = CASE ta.pyramid_tier
      WHEN 1 THEN 'Champion'
      WHEN 2 THEN 'Loyalist'
      WHEN 3 THEN 'Engaged'
      WHEN 4 THEN 'Prospect'
      ELSE NULL
    END,
    dormant_segment = ta.dormant_segment,
    composite_score = ta.composite_score,
    next_tier_requirements = ta.next_tier_requirements,
    updated_at = NOW()
  FROM tier_assignments ta
  WHERE s.user_group_id = ta.user_group_id;
  
  -- Step 6: Save tier thresholds for tracking
  INSERT INTO tier_thresholds (customer_segment, calculated_at, total_active_customers, tier_distribution)
  SELECT 
    customer_segment,
    NOW(),
    COUNT(*),
    jsonb_build_object(
      'tier1', SUM(CASE WHEN pyramid_tier = 1 THEN 1 ELSE 0 END),
      'tier2', SUM(CASE WHEN pyramid_tier = 2 THEN 1 ELSE 0 END),
      'tier3', SUM(CASE WHEN pyramid_tier = 3 THEN 1 ELSE 0 END),
      'tier4', SUM(CASE WHEN pyramid_tier = 4 THEN 1 ELSE 0 END),
      'dormant', SUM(CASE WHEN pyramid_tier IS NULL THEN 1 ELSE 0 END)
    )
  FROM segments
  WHERE customer_segment IS NOT NULL
  GROUP BY customer_segment;
  
  -- Step 7: Return distribution summary
  SELECT json_build_object(
    'total_tiered', (SELECT COUNT(*) FROM segments WHERE pyramid_tier IS NOT NULL),
    'total_dormant', (SELECT COUNT(*) FROM segments WHERE pyramid_tier IS NULL),
    'tier_distribution', (
      SELECT jsonb_object_agg(pyramid_tier_name, count)
      FROM (
        SELECT pyramid_tier_name, COUNT(*) as count
        FROM segments
        WHERE pyramid_tier IS NOT NULL
        GROUP BY pyramid_tier_name
      ) t
    ),
    'dormant_distribution', (
      SELECT jsonb_object_agg(dormant_segment, count)
      FROM (
        SELECT dormant_segment, COUNT(*) as count
        FROM segments
        WHERE dormant_segment IS NOT NULL
        GROUP BY dormant_segment
      ) d
    ),
    'by_customer_segment', (
      SELECT jsonb_object_agg(customer_segment, dist)
      FROM (
        SELECT 
          customer_segment,
          jsonb_build_object(
            'total', COUNT(*),
            'tier1_champion', SUM(CASE WHEN pyramid_tier = 1 THEN 1 ELSE 0 END),
            'tier2_loyalist', SUM(CASE WHEN pyramid_tier = 2 THEN 1 ELSE 0 END),
            'tier3_engaged', SUM(CASE WHEN pyramid_tier = 3 THEN 1 ELSE 0 END),
            'tier4_prospect', SUM(CASE WHEN pyramid_tier = 4 THEN 1 ELSE 0 END),
            'dormant', SUM(CASE WHEN pyramid_tier IS NULL THEN 1 ELSE 0 END)
          ) as dist
        FROM segments
        WHERE customer_segment IS NOT NULL
        GROUP BY customer_segment
      ) cs
    )
  ) INTO result;
  
  RETURN result;
END;
$$;