import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

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
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { resource, trigger_sync = true } = await req.json();
    
    if (!resource || !['user_groups', 'customers', 'bookings', 'order_lines'].includes(resource)) {
      throw new Error(`Invalid resource: ${resource}. Must be one of: user_groups, customers, bookings, order_lines`);
    }

    console.log(`[FORCE-FULL-SYNC] Starting full sync reset for: ${resource}`);

    // Get previous state
    const { data: previousState } = await supabase
      .from('sync_state')
      .select('*')
      .eq('resource', resource)
      .single();

    console.log(`[FORCE-FULL-SYNC] Previous state:`, previousState);

    // Reset to full sync mode
    const { error: updateError } = await supabase
      .from('sync_state')
      .update({
        sync_mode: 'full',
        current_page: 0,
        high_watermark: '1970-01-01T00:00:00+00:00',
        status: 'pending',
        error_message: null,
        progress_percentage: 0,
        updated_at: new Date().toISOString()
      })
      .eq('resource', resource);

    if (updateError) throw updateError;

    // Log the change to history
    await supabase.from('sync_mode_history').insert({
      resource,
      old_mode: previousState?.sync_mode,
      new_mode: 'full',
      changed_by: 'manual',
      reason: 'Force full sync via diagnostics',
      previous_page: previousState?.current_page,
      new_page: 0
    });

    // Get new state
    const { data: newState } = await supabase
      .from('sync_state')
      .select('*')
      .eq('resource', resource)
      .single();

    let syncTriggered = false;
    let syncResult = null;

    // Optionally trigger sync immediately
    if (trigger_sync) {
      console.log(`[FORCE-FULL-SYNC] Triggering sync-noddi-data...`);
      const { data, error } = await supabase.functions.invoke('sync-noddi-data');
      
      if (error) {
        console.error(`[FORCE-FULL-SYNC] Sync trigger error:`, error);
      } else {
        syncTriggered = true;
        syncResult = data;
        console.log(`[FORCE-FULL-SYNC] Sync triggered successfully`);
      }
    }

    // Estimate completion time
    const estimatedPages = previousState?.estimated_total 
      ? Math.ceil(previousState.estimated_total / 100) 
      : 0;
    const estimatedTimeMinutes = Math.ceil(estimatedPages / 10); // ~10 pages per 2-min run

    const response = {
      ok: true,
      resource,
      previous_state: {
        sync_mode: previousState?.sync_mode,
        current_page: previousState?.current_page,
        high_watermark: previousState?.high_watermark,
        rows_fetched: previousState?.rows_fetched
      },
      new_state: {
        sync_mode: newState?.sync_mode,
        current_page: newState?.current_page,
        high_watermark: newState?.high_watermark,
        status: newState?.status
      },
      sync_triggered: syncTriggered,
      sync_result: syncResult,
      estimated_pages: estimatedPages,
      estimated_time_minutes: estimatedTimeMinutes
    };

    console.log(`[FORCE-FULL-SYNC] Complete:`, response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[FORCE-FULL-SYNC] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      ok: false, 
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
