// Version: 1.0.1 - Deployed for automatic sync recovery
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResourceDiagnostic {
  api_total: number;
  db_total: number;
  missing?: number;
  coverage: number;
  status: 'healthy' | 'incomplete' | 'unknown';
  sync_mode: string | null;
  high_watermark: string | null;
  watermark_age_hours: number | null;
  recommendation: string;
  fix?: {
    action: string;
    body: any;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const apiBaseUrl = Deno.env.get('NODDI_API_BASE_URL');
    const apiKey = Deno.env.get('NODDI_API_KEY');

    console.log('[DEPLOY-CHECK] Sync diagnostics v1.0.1 deployed successfully');
    console.log('[DIAGNOSTICS] Starting sync diagnostics...');

    // Fetch API totals from Noddi
    const [userGroupsRes, usersRes, bookingsRes] = await Promise.all([
      fetch(`${apiBaseUrl}/user-groups/?page_size=1`, {
        headers: { 'Authorization': `Token ${apiKey}` }
      }),
      fetch(`${apiBaseUrl}/users/?page_size=1`, {
        headers: { 'Authorization': `Token ${apiKey}` }
      }),
      fetch(`${apiBaseUrl}/bookings/?page_size=1`, {
        headers: { 'Authorization': `Token ${apiKey}` }
      })
    ]);

    const apiTotals = {
      user_groups: (await userGroupsRes.json()).count || 0,
      customers: (await usersRes.json()).count || 0,
      bookings: (await bookingsRes.json()).count || 0
    };

    console.log('[DIAGNOSTICS] API totals:', apiTotals);

    // Fetch database counts
    const { count: dbUserGroups } = await supabase.from('user_groups').select('*', { count: 'exact', head: true });
    const { count: dbCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: dbBookings } = await supabase.from('bookings').select('*', { count: 'exact', head: true });
    const { count: dbOrderLines } = await supabase.from('order_lines').select('*', { count: 'exact', head: true });

    console.log('[DIAGNOSTICS] DB counts:', { dbUserGroups, dbCustomers, dbBookings, dbOrderLines });

    // Fetch sync state
    const { data: syncState } = await supabase
      .from('sync_state')
      .select('*')
      .order('resource', { ascending: true });

    const stateMap = new Map(syncState?.map(s => [s.resource, s]) || []);

    // Helper to calculate watermark age
    const getWatermarkAge = (watermark: string | null): number | null => {
      if (!watermark) return null;
      const age = Date.now() - new Date(watermark).getTime();
      return age / (1000 * 60 * 60); // hours
    };

    // Helper to create diagnostic
    const createDiagnostic = (
      resource: string,
      apiTotal: number,
      dbTotal: number
    ): ResourceDiagnostic => {
      const state = stateMap.get(resource);
      const coverage = apiTotal > 0 ? (dbTotal / apiTotal) * 100 : 100;
      const missing = apiTotal - dbTotal;
      const watermarkAge = getWatermarkAge(state?.high_watermark || null);

      let status: 'healthy' | 'incomplete' | 'unknown' = 'unknown';
      let recommendation = '';
      let fix = undefined;

      if (coverage >= 98) {
        status = 'healthy';
        recommendation = '✓ Full coverage';
      } else if (coverage >= 90) {
        status = 'incomplete';
        recommendation = `⚠️ ${(100 - coverage).toFixed(1)}% data missing (${missing.toLocaleString()} records). Consider running full sync.`;
        fix = {
          action: 'force-full-sync',
          body: { resource, trigger_sync: true }
        };
      } else {
        status = 'incomplete';
        recommendation = `🔴 ${(100 - coverage).toFixed(1)}% data missing (${missing.toLocaleString()} records). Run full historical sync immediately.`;
        fix = {
          action: 'force-full-sync',
          body: { resource, trigger_sync: true }
        };
      }

      return {
        api_total: apiTotal,
        db_total: dbTotal,
        missing: missing > 0 ? missing : undefined,
        coverage: Math.round(coverage * 10) / 10,
        status,
        sync_mode: state?.sync_mode || null,
        high_watermark: state?.high_watermark || null,
        watermark_age_hours: watermarkAge ? Math.round(watermarkAge * 10) / 10 : null,
        recommendation,
        fix
      };
    };

    // Build diagnostics
    const resources = {
      user_groups: createDiagnostic('user_groups', apiTotals.user_groups, dbUserGroups || 0),
      customers: createDiagnostic('customers', apiTotals.customers, dbCustomers || 0),
      bookings: createDiagnostic('bookings', apiTotals.bookings, dbBookings || 0),
      order_lines: {
        api_total: 0, // No direct API endpoint
        db_total: dbOrderLines || 0,
        coverage: 100,
        status: 'healthy' as const,
        sync_mode: stateMap.get('order_lines')?.sync_mode || null,
        high_watermark: null,
        watermark_age_hours: null,
        recommendation: `Extracted from ${dbBookings || 0} bookings`
      }
    };

    // Determine overall health
    const hasIncomplete = Object.values(resources).some(r => r.status === 'incomplete');
    const overallHealth = hasIncomplete ? 'degraded' : 'healthy';

    const response = {
      ok: true,
      timestamp: new Date().toISOString(),
      resources,
      overall_health: overallHealth,
      action_required: hasIncomplete
    };

    console.log('[DIAGNOSTICS] Complete:', response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[DIAGNOSTICS] Error:', error);
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
