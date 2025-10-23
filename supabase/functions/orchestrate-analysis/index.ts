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

console.log('[DEPLOY-CHECK] orchestrate-analysis v1.0.0 deployed successfully');

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[orchestrate] Computing value tiers and pyramid tiers (steps 2 & 3)...");
    const startTime = Date.now();
    const results: any = {
      steps: [],
      success: true,
      totalDuration: 0
    };

    // Step 1: Compute value tiers
    console.log("[orchestrate] Step 1/2: Computing value tiers...");
    const step1Start = Date.now();
    try {
      const { data: valueTiersData, error: valueTiersError } = await sb.functions.invoke(
        "compute-value-tiers",
        { body: {} }
      );

      if (valueTiersError) throw valueTiersError;

      const step1Duration = ((Date.now() - step1Start) / 1000).toFixed(2);
      results.steps.push({
        name: "Compute Value Tiers",
        success: true,
        duration: parseFloat(step1Duration),
        data: valueTiersData
      });
      console.log(`[orchestrate] ✓ Step 1 completed in ${step1Duration}s`);
    } catch (error) {
      const step1Duration = ((Date.now() - step1Start) / 1000).toFixed(2);
      results.steps.push({
        name: "Compute Value Tiers",
        success: false,
        duration: parseFloat(step1Duration),
        error: error instanceof Error ? error.message : "Unknown error"
      });
      results.success = false;
      console.error(`[orchestrate] Step 1 failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      
      return new Response(
        JSON.stringify(results),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Step 2: Compute pyramid tiers
    console.log("[orchestrate] Step 2/2: Computing pyramid tiers...");
    const step2Start = Date.now();
    try {
      const { data: pyramidTiersData, error: pyramidTiersError } = await sb.functions.invoke(
        "compute-pyramid-tiers",
        { body: {} }
      );

      if (pyramidTiersError) throw pyramidTiersError;

      const step2Duration = ((Date.now() - step2Start) / 1000).toFixed(2);
      results.steps.push({
        name: "Compute Pyramid Tiers",
        success: true,
        duration: parseFloat(step2Duration),
        data: pyramidTiersData
      });
      console.log(`[orchestrate] ✓ Step 2 completed in ${step2Duration}s`);
    } catch (error) {
      const step2Duration = ((Date.now() - step2Start) / 1000).toFixed(2);
      results.steps.push({
        name: "Compute Pyramid Tiers",
        success: false,
        duration: parseFloat(step2Duration),
        error: error instanceof Error ? error.message : "Unknown error"
      });
      results.success = false;
      console.error(`[orchestrate] Step 2 failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      
      return new Response(
        JSON.stringify(results),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Calculate total duration
    results.totalDuration = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    console.log(`[orchestrate] ✓ Analysis complete in ${results.totalDuration}s`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[orchestrate] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
