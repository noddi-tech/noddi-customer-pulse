import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const base = Deno.env.get("NODDI_API_BASE_URL") ?? "https://api.noddi.no";
    const key  = Deno.env.get("NODDI_API_KEY") ?? "";
    const testEmail = url.searchParams.get("email") ?? "silje@concom.no";

    if (!key) {
      return new Response(JSON.stringify({ ok:false, error:"Missing NODDI_API_KEY" }), { 
        status: 400, 
        headers: { ...corsHeaders, "content-type":"application/json" } 
      });
    }

    const endpoint = `${base.replace(/\/+$/,"")}/v1/users/get-by-email/?email=${encodeURIComponent(testEmail)}`;

    const tries: Array<{ name: string; headers: Record<string, string> }> = [
      { name: "Authorization: Api-Key", headers: { Accept: "application/json", Authorization: `Api-Key ${key}` } },
      { name: "X-Api-Key",             headers: { Accept: "application/json", "X-Api-Key": key } },
    ];

    for (const t of tries) {
      try {
        const r = await fetch(endpoint, { headers: t.headers });
        const text = await r.text();
        if (r.ok) {
          return new Response(
            JSON.stringify({ ok:true, style:t.name, status:r.status, endpoint, sample: JSON.parse(text) }), 
            { headers: { ...corsHeaders, "content-type":"application/json" }}
          );
        } else {
          // keep trying; but collect detail
          console.log(`[noddi] probe ${t.name} -> ${r.status} ${r.statusText} ${text.slice(0,400)}`);
        }
      } catch (e) {
        console.log(`[noddi] probe ${t.name} failed`, e);
      }
    }

    return new Response(JSON.stringify({
      ok:false,
      endpoint,
      hint: "If both header styles fail: ensure API key is valid and linked user is is_staff=True for this endpoint.",
    }), { status: 502, headers: { ...corsHeaders, "content-type":"application/json" }});
  } catch (error) {
    console.error("Connection test error:", error);
    return new Response(
      JSON.stringify({ ok: false, status: 0, error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, "content-type":"application/json" } }
    );
  }
});
