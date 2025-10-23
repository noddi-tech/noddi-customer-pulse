-- Phase 1: Extend features table with tire/service revenue split and fleet size
ALTER TABLE features 
  ADD COLUMN IF NOT EXISTS tire_revenue_24m NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_revenue_24m NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tire_revenue_lifetime NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_revenue_lifetime NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS largest_tire_order NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tire_order_count_24m INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fleet_size INTEGER DEFAULT 0;

-- Phase 1: Extend segments table with pyramid tier and customer segmentation
ALTER TABLE segments
  ADD COLUMN IF NOT EXISTS customer_segment TEXT,
  ADD COLUMN IF NOT EXISTS pyramid_tier INTEGER,
  ADD COLUMN IF NOT EXISTS pyramid_tier_name TEXT,
  ADD COLUMN IF NOT EXISTS dormant_segment TEXT,
  ADD COLUMN IF NOT EXISTS composite_score NUMERIC,
  ADD COLUMN IF NOT EXISTS high_value_tire_purchaser BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fleet_size INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_tier_requirements JSONB;

-- Phase 1: Create tier_thresholds table for dynamic quantile tracking
CREATE TABLE IF NOT EXISTS tier_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_segment TEXT NOT NULL,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tier1_min_score NUMERIC,
  tier2_min_score NUMERIC,
  tier3_min_score NUMERIC,
  total_active_customers INTEGER,
  tier_distribution JSONB
);

-- Enable RLS on tier_thresholds
ALTER TABLE tier_thresholds ENABLE ROW LEVEL SECURITY;

-- Public read access for tier_thresholds
CREATE POLICY "Public read access"
ON tier_thresholds
FOR SELECT
USING (true);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_segments_customer_segment ON segments(customer_segment);
CREATE INDEX IF NOT EXISTS idx_segments_pyramid_tier ON segments(pyramid_tier);
CREATE INDEX IF NOT EXISTS idx_tier_thresholds_segment ON tier_thresholds(customer_segment, calculated_at DESC);