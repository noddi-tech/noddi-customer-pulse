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
    const base = Deno.env.get("NODDI_API_BASE_URL") ?? "https://api.noddi.co";
    const key = Deno.env.get("NODDI_API_KEY") ?? "";

    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: "Missing NODDI_API_KEY" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const endpoint = `${base.replace(/\/+$/, "")}/v1/organizations/?page_size=5`;

    console.log(`[test-organizations] Fetching: ${endpoint}`);

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        Authorization: `Api-Key ${key}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({
        ok: false,
        status: response.status,
        statusText: response.statusText,
        endpoint,
        data
      }), {
        status: response.status,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Log sample structure
    const sampleOrg = data.results?.[0];
    console.log(`[test-organizations] Sample organization structure:`, JSON.stringify(sampleOrg, null, 2));
    console.log(`[test-organizations] Total count: ${data.count}`);
    console.log(`[test-organizations] Sample keys:`, Object.keys(sampleOrg || {}).join(", "));

    return new Response(JSON.stringify({
      ok: true,
      status: response.status,
      endpoint,
      totalCount: data.count,
      resultCount: data.results?.length || 0,
      sampleOrganization: sampleOrg,
      allKeys: Object.keys(sampleOrg || {}),
      hasUserGroup: !!sampleOrg?.user_group,
      hasUserGroupId: !!sampleOrg?.user_group_id,
      hasServiceOrganization: !!sampleOrg?.service_organization,
    }), {
      headers: { ...corsHeaders, "content-type": "application/json" }
    });

  } catch (error) {
    console.error("[test-organizations] Error:", error);
    return new Response(JSON.stringify({
      ok: false,
      error: String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
