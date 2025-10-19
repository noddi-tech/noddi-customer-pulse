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
    const { confirm } = await req.json();
    
    // Safety check: require explicit confirmation
    if (confirm !== 'DELETE') {
      return new Response(
        JSON.stringify({ error: 'Confirmation required. Send { confirm: "DELETE" } to proceed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('=== DATABASE RESET INITIATED ===');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Track deletion counts
    const deletionCounts: Record<string, number> = {};

    // Truncate tables in order (respecting foreign key constraints)
    const tablesToTruncate = [
      'segments',
      'features', 
      'storage_status',
      'order_lines',
      'bookings',
      'customers',
      'user_groups'
    ];

    for (const table of tablesToTruncate) {
      console.log(`Truncating ${table}...`);
      
      // Get count before deletion
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      deletionCounts[table] = count || 0;
      
      // Delete all records from the table
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (deleteError) {
        console.error(`Error deleting from ${table}:`, deleteError);
        throw deleteError;
      }
      
      console.log(`✓ Deleted from ${table}: ${deletionCounts[table]} records`);
    }

    // Reset sync_state to initial values
    console.log('Resetting sync_state...');
    const { error: syncError } = await supabase
      .from('sync_state')
      .update({
        sync_mode: 'full',
        max_id_seen: 0,
        current_page: 0,
        rows_fetched: 0,
        total_records: null,
        progress_percentage: 0,
        high_watermark: '1970-01-01T00:00:00.000Z',
        status: 'pending',
        error_message: null,
        estimated_total: null,
        estimated_completion_at: null,
      })
      .in('resource', ['customers', 'bookings', 'user_groups', 'order_lines']);

    if (syncError) {
      console.error('Error resetting sync_state:', syncError);
      throw syncError;
    }

    console.log('✓ Sync state reset');
    console.log('=== DATABASE RESET COMPLETE ===\n');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Database reset complete',
        deleted: deletionCounts,
        total_deleted: Object.values(deletionCounts).reduce((sum, count) => sum + count, 0),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Database reset error:', error);
    return new Response(
      JSON.stringify({ 
        error: error?.message || 'Unknown error during database reset',
        details: error 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
