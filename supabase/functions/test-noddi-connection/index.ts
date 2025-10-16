import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API = Deno.env.get("NODDI_API_BASE_URL")!;
const KEY = Deno.env.get("NODDI_API_KEY")!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`Testing connection to: ${API}`);
    const r = await fetch(`${API}/v1/health/`, { 
      headers: { Authorization: `Api-Key ${KEY}` } 
    }).catch(() => null);
    
    const ok = !!r && r.ok;
    const status = r?.status ?? 0;
    
    console.log(`Connection test result: ${ok ? 'SUCCESS' : 'FAILED'} (status: ${status})`);
    
    return new Response(
      JSON.stringify({ ok, status }), 
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("Connection test error:", error);
    return new Response(
      JSON.stringify({ ok: false, status: 0, error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
