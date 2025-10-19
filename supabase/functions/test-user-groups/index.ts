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

    const endpoint = `${base.replace(/\/+$/, "")}/v1/user-groups/?page_index=0&page_size=5`;

    console.log(`[test-user-groups] Fetching: ${endpoint}`);

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
    const sampleUserGroup = data.results?.[0];
    console.log(`[test-user-groups] Sample user_group structure:`, JSON.stringify(sampleUserGroup, null, 2));
    console.log(`[test-user-groups] Total count: ${data.count}`);
    console.log(`[test-user-groups] Sample keys:`, Object.keys(sampleUserGroup || {}).join(", "));

    // Check for ALL organization-related fields with multiple naming patterns
    const orgFields = {
      hasOrg: !!sampleUserGroup?.org,
      hasOrgId: !!sampleUserGroup?.org_id,
      hasOrganization: !!sampleUserGroup?.organization,
      hasOrganizationId: !!sampleUserGroup?.organization_id,
      hasServiceOrganization: !!sampleUserGroup?.service_organization,
      hasServiceOrganizationId: !!sampleUserGroup?.service_organization_id,
      orgValue: sampleUserGroup?.org || null,
      orgIdValue: sampleUserGroup?.org_id || null,
      organizationValue: sampleUserGroup?.organization || null,
      organizationIdValue: sampleUserGroup?.organization_id || null,
      serviceOrgValue: sampleUserGroup?.service_organization || null,
    };

    console.log(`[test-user-groups] Organization fields:`, JSON.stringify(orgFields, null, 2));
    console.log(`[test-user-groups] Full first user_group:`, JSON.stringify(sampleUserGroup, null, 2));

    return new Response(JSON.stringify({
      ok: true,
      status: response.status,
      endpoint,
      totalCount: data.count,
      resultCount: data.results?.length || 0,
      sampleUserGroup,
      allKeys: Object.keys(sampleUserGroup || {}),
      organizationFields: orgFields,
    }), {
      headers: { ...corsHeaders, "content-type": "application/json" }
    });

  } catch (error) {
    console.error("[test-user-groups] Error:", error);
    return new Response(JSON.stringify({
      ok: false,
      error: String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
