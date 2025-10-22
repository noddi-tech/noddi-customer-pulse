const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[value_tier] Starting SQL-based value tier computation...");

    // Fetch thresholds
    const { data: thresholdData } = await sb
      .from("settings")
      .select("value")
      .eq("key", "thresholds")
      .single();

    const th = thresholdData?.value || {};
    const highThreshold = th.value_high_percentile ?? 0.8;
    const midThreshold = th.value_mid_percentile ?? 0.5;

    console.log(`[value_tier] Using thresholds: High >= ${highThreshold}, Mid >= ${midThreshold}`);

    // Execute SQL-based value tier calculation
    console.log("[value_tier] Calculating RFM percentiles and updating segments in database...");
    
    const { error: sqlError } = await sb.rpc('exec_sql', {
      sql: `
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
            WHEN (sf.r_score + sf.f_score + sf.m_score) / 3.0 + sf.boost >= ${highThreshold} THEN 'High'
            WHEN (sf.r_score + sf.f_score + sf.m_score) / 3.0 + sf.boost >= ${midThreshold} THEN 'Mid'
            ELSE 'Low'
          END,
          updated_at = now()
        FROM scored_features sf
        WHERE s.user_group_id = sf.user_group_id;
      `
    });

    if (sqlError) {
      console.error("[value_tier] SQL execution error:", sqlError);
      throw sqlError;
    }

    console.log("[value_tier] ✓ SQL-based value tier calculation completed");

    // Get distribution counts
    const { data: distribution } = await sb
      .from("segments")
      .select("value_tier")
      .not("value_tier", "is", null);

    const counts = {
      High: distribution?.filter(s => s.value_tier === "High").length || 0,
      Mid: distribution?.filter(s => s.value_tier === "Mid").length || 0,
      Low: distribution?.filter(s => s.value_tier === "Low").length || 0,
    };

    const totalUpdated = counts.High + counts.Mid + counts.Low;
    console.log(`[value_tier] ✓ Updated ${totalUpdated} customers with distribution:`, counts);

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: totalUpdated,
        distribution: counts
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[value_tier] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
