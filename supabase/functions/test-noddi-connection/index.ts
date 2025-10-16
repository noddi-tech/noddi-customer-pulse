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
    
    // Try multiple common health/test endpoints
    const endpoints = [
      '/v1/health/',
      '/health/',
      '/v1/health',
      '/health',
      '/api/v1/health',
      '/v1/users/',  // Try a basic list endpoint
    ];
    
    let lastResponse = null;
    let lastStatus = 0;
    
    for (const endpoint of endpoints) {
      const url = `${API}${endpoint}`;
      console.log(`Trying endpoint: ${url}`);
      
      const r = await fetch(url, { 
        headers: { Authorization: `Api-Key ${KEY}` } 
      }).catch(() => null);
      
      lastResponse = r;
      lastStatus = r?.status ?? 0;
      
      console.log(`Endpoint ${endpoint} returned status: ${lastStatus}`);
      
      if (r && r.ok) {
        console.log(`Connection test SUCCESS with endpoint: ${endpoint}`);
        return new Response(
          JSON.stringify({ ok: true, status: lastStatus, endpoint }), 
          { headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }
    
    console.log(`All endpoints failed. Last status: ${lastStatus}`);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        status: lastStatus,
        message: 'All test endpoints returned errors. Please check API documentation for correct endpoint.'
      }), 
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
