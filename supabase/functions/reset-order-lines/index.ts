import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting order lines reset...');

    // Step 1: Truncate order_lines table
    const { error: truncateError } = await supabase.rpc('execute_sql', {
      query: 'TRUNCATE TABLE order_lines'
    }).single();

    if (truncateError) {
      console.error('Error truncating order_lines:', truncateError);
      // Try DELETE as fallback
      const { error: deleteError } = await supabase
        .from('order_lines')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (deleteError) {
        throw new Error(`Failed to clear order_lines: ${deleteError.message}`);
      }
      console.log('Cleared order_lines using DELETE (fallback)');
    } else {
      console.log('Truncated order_lines table successfully');
    }

    // Step 2: Reset sync_state for order_lines
    const { error: resetError } = await supabase
      .from('sync_state')
      .update({
        status: 'pending',
        sync_mode: 'full',
        current_page: 0,
        max_id_seen: 0,
        progress_percentage: 0,
        rows_fetched: 0,
        estimated_total: null,
        estimated_completion_at: null,
        error_message: null,
        last_run_at: new Date().toISOString(),
      })
      .eq('resource', 'order_lines');

    if (resetError) {
      console.error('Error resetting sync_state:', resetError);
      throw resetError;
    }

    console.log('Reset sync_state for order_lines');

    // Step 3: Log to sync_mode_history
    const { error: historyError } = await supabase
      .from('sync_mode_history')
      .insert({
        resource: 'order_lines',
        old_mode: 'full',
        new_mode: 'full',
        previous_page: 0,
        new_page: 0,
        changed_by: 'manual_reset',
        reason: 'User-initiated order lines re-extraction',
      });

    if (historyError) {
      console.warn('Failed to log to sync_mode_history:', historyError);
      // Don't throw, this is non-critical
    }

    console.log('Order lines reset complete');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Order lines cleared and reset. Auto-sync will re-extract in ~2 minutes.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in reset-order-lines function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to reset order lines';
    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
