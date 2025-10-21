-- Add multi-interval RFM metrics for comprehensive CLV analysis
ALTER TABLE features
ADD COLUMN IF NOT EXISTS frequency_12m integer,
ADD COLUMN IF NOT EXISTS revenue_12m numeric,
ADD COLUMN IF NOT EXISTS margin_12m numeric,
ADD COLUMN IF NOT EXISTS frequency_36m integer,
ADD COLUMN IF NOT EXISTS revenue_36m numeric,
ADD COLUMN IF NOT EXISTS margin_36m numeric,
ADD COLUMN IF NOT EXISTS frequency_48m integer,
ADD COLUMN IF NOT EXISTS revenue_48m numeric,
ADD COLUMN IF NOT EXISTS margin_48m numeric,
ADD COLUMN IF NOT EXISTS frequency_lifetime integer,
ADD COLUMN IF NOT EXISTS revenue_lifetime numeric,
ADD COLUMN IF NOT EXISTS margin_lifetime numeric;

COMMENT ON COLUMN features.frequency_12m IS 'Number of bookings in last 12 months';
COMMENT ON COLUMN features.revenue_12m IS 'Total revenue in last 12 months (NOK)';
COMMENT ON COLUMN features.margin_12m IS 'Total margin in last 12 months (NOK)';
COMMENT ON COLUMN features.frequency_36m IS 'Number of bookings in last 36 months';
COMMENT ON COLUMN features.revenue_36m IS 'Total revenue in last 36 months (NOK)';
COMMENT ON COLUMN features.margin_36m IS 'Total margin in last 36 months (NOK)';
COMMENT ON COLUMN features.frequency_48m IS 'Number of bookings in last 48 months';
COMMENT ON COLUMN features.revenue_48m IS 'Total revenue in last 48 months (NOK)';
COMMENT ON COLUMN features.margin_48m IS 'Total margin in last 48 months (NOK)';
COMMENT ON COLUMN features.frequency_lifetime IS 'Total number of bookings (all time)';
COMMENT ON COLUMN features.revenue_lifetime IS 'Total revenue (all time, NOK)';
COMMENT ON COLUMN features.margin_lifetime IS 'Total margin (all time, NOK)';