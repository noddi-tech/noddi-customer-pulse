// Clear all segments and features before recomputation - v1.0.0
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log('[CLEAR] Starting database cleanup...');
    
    // Delete all records from features and segments tables
    const { error: featuresError, count: featuresCount } = await supabase
      .from('features')
      .delete()
      .neq('user_group_id', 0);
    
    const { error: segmentsError, count: segmentsCount } = await supabase
      .from('segments')
      .delete()
      .neq('user_group_id', 0);
    
    if (featuresError) throw new Error(`Features delete failed: ${featuresError.message}`);
    if (segmentsError) throw new Error(`Segments delete failed: ${segmentsError.message}`);
    
    console.log(`[CLEAR] ✓ Cleared ${featuresCount || 'all'} features and ${segmentsCount || 'all'} segments`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Database cleared successfully',
        deleted: {
          features: featuresCount,
          segments: segmentsCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[CLEAR] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
