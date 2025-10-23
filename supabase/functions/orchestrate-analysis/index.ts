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
    console.log("[orchestrate] Starting complete customer analysis pipeline (background mode)...");
    
    // Background task that runs the full analysis
    const backgroundTask = async () => {
      const startTime = Date.now();
      const results: any = {
        steps: [],
        success: true,
        totalDuration: 0
      };

      try {
        // Step 1: Compute segments (lifecycle + features) in batches
        console.log("[orchestrate] Step 1/3: Computing segments...");
        const step1Start = Date.now();
        try {
          let offset = 0;
          let hasMore = true;
          let totalProcessed = 0;
          let batchCount = 0;

          while (hasMore) {
            batchCount++;
            console.log(`[orchestrate] Processing batch ${batchCount}...`);
            
            const { data: segmentsData, error: segmentsError } = await sb.functions.invoke(
              "compute-segments",
              { body: { offset } }
            );

            if (segmentsError) throw segmentsError;

            totalProcessed += segmentsData.batch.processed;
            offset = segmentsData.batch.nextOffset;
            hasMore = segmentsData.batch.hasMore;
            
            const percentage = Math.round((totalProcessed / segmentsData.batch.total) * 100);
            console.log(`[orchestrate] Batch ${batchCount} progress: ${totalProcessed}/${segmentsData.batch.total} customers (${percentage}%)`);
          }

          const step1Duration = ((Date.now() - step1Start) / 1000).toFixed(2);
          results.steps.push({
            name: "Compute Segments",
            success: true,
            duration: parseFloat(step1Duration),
            data: { totalProcessed, batches: batchCount }
          });
          console.log(`[orchestrate] ✓ Step 1 completed in ${step1Duration}s (${totalProcessed} customers, ${batchCount} batches)`);
        } catch (error) {
          const step1Duration = ((Date.now() - step1Start) / 1000).toFixed(2);
          results.steps.push({
            name: "Compute Segments",
            success: false,
            duration: parseFloat(step1Duration),
            error: error instanceof Error ? error.message : "Unknown error"
          });
          results.success = false;
          console.error(`[orchestrate] Step 1 failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          return results;
        }

        // Step 2: Compute value tiers
        console.log("[orchestrate] Step 2/3: Computing value tiers...");
        const step2Start = Date.now();
        try {
          const { data: valueTiersData, error: valueTiersError } = await sb.functions.invoke(
            "compute-value-tiers",
            { body: {} }
          );

          if (valueTiersError) throw valueTiersError;

          const step2Duration = ((Date.now() - step2Start) / 1000).toFixed(2);
          results.steps.push({
            name: "Compute Value Tiers",
            success: true,
            duration: parseFloat(step2Duration),
            data: valueTiersData
          });
          console.log(`[orchestrate] ✓ Step 2 completed in ${step2Duration}s`);
        } catch (error) {
          const step2Duration = ((Date.now() - step2Start) / 1000).toFixed(2);
          results.steps.push({
            name: "Compute Value Tiers",
            success: false,
            duration: parseFloat(step2Duration),
            error: error instanceof Error ? error.message : "Unknown error"
          });
          results.success = false;
          console.error(`[orchestrate] Step 2 failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          return results;
        }

        // Step 3: Compute pyramid tiers
        console.log("[orchestrate] Step 3/3: Computing pyramid tiers...");
        const step3Start = Date.now();
        try {
          const { data: pyramidTiersData, error: pyramidTiersError } = await sb.functions.invoke(
            "compute-pyramid-tiers",
            { body: {} }
          );

          if (pyramidTiersError) throw pyramidTiersError;

          const step3Duration = ((Date.now() - step3Start) / 1000).toFixed(2);
          results.steps.push({
            name: "Compute Pyramid Tiers",
            success: true,
            duration: parseFloat(step3Duration),
            data: pyramidTiersData
          });
          console.log(`[orchestrate] ✓ Step 3 completed in ${step3Duration}s`);
        } catch (error) {
          const step3Duration = ((Date.now() - step3Start) / 1000).toFixed(2);
          results.steps.push({
            name: "Compute Pyramid Tiers",
            success: false,
            duration: parseFloat(step3Duration),
            error: error instanceof Error ? error.message : "Unknown error"
          });
          results.success = false;
          console.error(`[orchestrate] Step 3 failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          return results;
        }

        // Calculate total duration
        results.totalDuration = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
        
        console.log(`[orchestrate] ✓ Complete analysis pipeline finished in ${results.totalDuration}s`);
        console.log("[orchestrate] Final results:", JSON.stringify(results, null, 2));

        return results;
      } catch (error) {
        console.error("[orchestrate] Background task error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          steps: results.steps
        };
      }
    };

    // Start background task (don't await - it will continue running)
    backgroundTask().catch((error) => {
      console.error("[orchestrate] Background task failed:", error);
    });

    // Return immediately
    return new Response(
      JSON.stringify({
        status: "started",
        message: "Analysis started in background. Poll the segments table for progress.",
        timestamp: new Date().toISOString()
      }),
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
