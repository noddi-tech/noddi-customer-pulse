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

    // Call database function to compute value tiers
    console.log("[value_tier] Calculating RFM percentiles and updating segments in database...");
    
    const { data: result, error: rpcError } = await sb.rpc('compute_value_tiers', {
      high_threshold: highThreshold,
      mid_threshold: midThreshold
    });

    if (rpcError) {
      console.error("[value_tier] Database function error:", rpcError);
      throw rpcError;
    }

    console.log("[value_tier] ✓ SQL-based value tier calculation completed");
    console.log(`[value_tier] Result:`, result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: result?.updated || 0,
        distribution: result?.distribution || { High: 0, Mid: 0, Low: 0 }
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
