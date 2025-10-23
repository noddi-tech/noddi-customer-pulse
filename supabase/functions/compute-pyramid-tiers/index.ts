import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

console.log('[DEPLOY-CHECK] compute-pyramid-tiers v1.0.0 deployed successfully');

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[pyramid_tiers] Starting pyramid tier calculation...");
    
    const startTime = Date.now();

    // Call database function to compute pyramid tiers
    const { data: result, error: rpcError } = await sb.rpc('compute_pyramid_tiers_v3');

    if (rpcError) {
      console.error("[pyramid_tiers] Database function error:", rpcError);
      throw rpcError;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[pyramid_tiers] ✓ Pyramid tier calculation completed in ${duration}s`);
    console.log(`[pyramid_tiers] Result:`, JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ 
        success: true,
        duration_seconds: parseFloat(duration),
        ...result
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[pyramid_tiers] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
