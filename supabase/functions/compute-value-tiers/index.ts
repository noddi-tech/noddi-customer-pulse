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
    console.log("[value_tier] Starting value tier computation for all customers...");

    // Fetch thresholds
    const { data: thresholdData } = await sb
      .from("settings")
      .select("value")
      .eq("key", "thresholds")
      .single();

    const th = thresholdData?.value || {};
    console.log(`[value_tier] Thresholds: ${JSON.stringify(th)}`);

    // Paginate through ALL features (not just 1,000)
    const allFeats: any[] = [];
    let featPage = 0;
    const featPageSize = 1000;
    let hasMoreFeats = true;

    console.log('[value_tier] Fetching ALL features from database with pagination...');
    while (hasMoreFeats) {
      const { data: featsChunk } = await sb
        .from("features")
        .select("*")
        .range(featPage * featPageSize, (featPage + 1) * featPageSize - 1);
      
      if (featsChunk && featsChunk.length > 0) {
        allFeats.push(...featsChunk);
        console.log(`[value_tier] Fetched page ${featPage + 1}: ${featsChunk.length} features (total so far: ${allFeats.length})`);
        featPage++;
        if (featsChunk.length < featPageSize) {
          hasMoreFeats = false;
        }
      } else {
        hasMoreFeats = false;
      }
    }

    console.log(`[value_tier] ✓ Loaded ${allFeats.length} total features for value tier calculation`);

    if (!allFeats || allFeats.length === 0) {
      console.log("[value_tier] No features found, skipping value tier calculation");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No features found",
          updated: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate RFM scores
    const recencies = allFeats.map((f) => f.recency_days ?? 999999).sort((a, b) => a - b);
    const frequencies = allFeats.map((f) => f.frequency_24m ?? 0).sort((a, b) => a - b);
    const revenues = allFeats.map((f) => f.revenue_24m ?? 0).sort((a, b) => a - b);

    const percentile = (arr: number[], val: number) => {
      const idx = arr.filter((x) => x <= val).length;
      return idx / arr.length;
    };

    const valueUpdates = allFeats.map((f) => {
      const R = 1 - percentile(recencies, f.recency_days ?? 999999);
      const F = percentile(frequencies, f.frequency_24m ?? 0);
      const M = percentile(revenues, f.revenue_24m ?? 0);

      // Stickiness boosts
      const sc = f.service_counts || {};
      let boost = 0;
      if (sc.is_storage_customer) boost += 0.15;
      if (sc.is_fleet_customer) boost += 0.10;
      if (sc.service_mix_count >= 3) boost += 0.05;

      const finalScore = (R + F + M) / 3 + boost;

      const tier =
        finalScore >= (th.value_high_percentile ?? 0.8)
          ? "High"
          : finalScore >= (th.value_mid_percentile ?? 0.5)
          ? "Mid"
          : "Low";

      return {
        user_id: null,
        user_group_id: f.user_group_id,
        value_tier: tier,
      };
    });

    // Update segments with value tiers in batches
    const UPDATE_BATCH_SIZE = 100;
    console.log(`[value_tier] Updating ${valueUpdates.length} value tiers in batches of ${UPDATE_BATCH_SIZE}...`);

    for (let i = 0; i < valueUpdates.length; i += UPDATE_BATCH_SIZE) {
      const batch = valueUpdates.slice(i, i + UPDATE_BATCH_SIZE);
      
      await sb.from("segments").upsert(batch, { 
        onConflict: "user_group_id",
        ignoreDuplicates: false 
      });
      
      if ((i + UPDATE_BATCH_SIZE) % 1000 === 0 || i + UPDATE_BATCH_SIZE >= valueUpdates.length) {
        console.log(`[value_tier] Progress: ${Math.min(i + UPDATE_BATCH_SIZE, valueUpdates.length)}/${valueUpdates.length} value tiers updated`);
      }
    }

    console.log(`[value_tier] ✓ Successfully updated all ${valueUpdates.length} value tiers`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: valueUpdates.length,
        distribution: {
          High: valueUpdates.filter(u => u.value_tier === "High").length,
          Mid: valueUpdates.filter(u => u.value_tier === "Mid").length,
          Low: valueUpdates.filter(u => u.value_tier === "Low").length,
        }
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
