// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  {
    global: { 
      headers: { 
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` 
      } 
    }
  }
);

const API = Deno.env.get("NODDI_API_BASE_URL")!;
const KEY = Deno.env.get("NODDI_API_KEY")!;

const MAX_PAGES_PER_RESOURCE = 5; // Process max 5 pages per sync run to avoid timeouts

async function getHWM(resource: string) {
  const { data } = await sb
    .from("sync_state")
    .select("high_watermark")
    .eq("resource", resource)
    .maybeSingle();
  return data?.high_watermark ?? null;
}

async function setState(resource: string, patch: Record<string, any>) {
  await sb.from("sync_state").upsert({ 
    resource, 
    ...patch, 
    last_run_at: new Date().toISOString() 
  });
}

async function* paged(path: string, params: Record<string, string | number | undefined>, updatedSince?: string | null) {
  const baseUrl = API.replace(/\/+$/, "");
  let page_index = Number(params?.page_index ?? 0);
  const page_size = Number(params?.page_size ?? 50);
  
  for (;;) {
    const queryParams: Record<string, string> = {
      page_index: String(page_index),
      page_size: String(page_size),
    };
    
    // Add incremental filter if watermark exists
    if (updatedSince) {
      queryParams.updated_at__gte = updatedSince;
    }
    
    const url = `${baseUrl}${path}?${new URLSearchParams(queryParams)}`;
    console.log(`[sync] GET ${url}`);
    
    const res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Api-Key ${KEY}` },
    });
    
    if (!res.ok) {
      const body = await res.text();
      // Fail-soft on server errors; stop gracefully on invalid page
      if (res.status >= 500) {
        console.warn(`[sync] page ${page_index} -> ${res.status}; skipping this page`);
        page_index++; // skip ahead
        continue;
      }
      if (res.status === 404 && /Invalid page/i.test(body)) break;
      throw new Error(`Fetch failed ${res.status}: ${body.slice(0, 500)}`);
    }
    
    const data: any = await res.json();
    const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    if (!rows.length) break;
    yield { rows, page_index };
    page_index++;
  }
}

async function upsertCustomers(rows: any[]) {
  if (!rows.length) return;
  const mapped = rows.map((u) => ({
    id: u.id,
    email: u.email,
    phone: u.phone_number ?? null,
    first_name: u.first_name ?? null,
    last_name: u.last_name ?? null,
    user_group_id: u.user_group_id ?? null,
    language_code: u.language_code ?? null,
    created_at: u.created_at,
    updated_at: u.updated_at
  }));
  const { error } = await sb.from("customers").upsert(mapped, { onConflict: "id" });
  if (error) console.error("Error upserting customers:", error);
}

async function upsertBookings(rows: any[]) {
  if (!rows.length) return;
  const mapped = rows.map((b) => ({
    id: b.id,
    // Noddi list returns user_id flat; handle string|number safely
    user_id: b.user_id != null ? (typeof b.user_id === 'string' ? parseInt(b.user_id, 10) : b.user_id) : null,
    user_group_id: b.user_group_id ?? null,
    date: b.date ?? null,
    started_at: b.started_at ?? null,
    completed_at: b.completed_at ?? null,
    status_label: b.status?.label ?? b.status_label ?? null,
    is_cancelled: !!b.is_cancelled,
    is_fully_paid: b.order?.is_fully_paid ?? b.is_fully_paid ?? null,
    is_partially_unable_to_complete: !!b.is_partially_unable_to_complete,
    is_fully_unable_to_complete: !!b.is_fully_unable_to_complete,
    updated_at: b.updated_at ?? null
  }));
  const { error } = await sb.from("bookings").upsert(mapped, { onConflict: "id" });
  if (error) console.error("Error upserting bookings:", error);
}

async function upsertOrderLines(bookingId: number, lines: any[]) {
  if (!lines?.length) return;
  const mapped = lines.map((l) => ({
    id: l.id,
    booking_id: bookingId,
    sales_item_id: l.sales_item_id ?? null,
    description: l.description ?? l.name ?? null,
    quantity: Number(l.quantity ?? 1),
    amount_gross: Number(l.amount_gross?.amount ?? l.amount ?? 0),
    amount_vat: Number(l.amount_vat?.amount ?? 0),
    currency: l.currency ?? l.amount_gross?.currency ?? "NOK",
    is_discount: !!l.is_discount,
    is_delivery_fee: !!l.is_delivery_fee,
    created_at: l.created_at ?? null
  }));
  const { error } = await sb.from("order_lines").upsert(mapped, { onConflict: "id" });
  if (error) console.error("Error upserting order lines:", error);
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting sync...");
    
    // Determine sync mode based on high_watermark
    const sinceUsers = await getHWM("customers");
    const sinceBookings = await getHWM("bookings");
    
    const customersSyncMode = sinceUsers ? 'incremental' : 'initial';
    const bookingsSyncMode = sinceBookings ? 'incremental' : 'initial';
    
    console.log(`[sync] Customers mode: ${customersSyncMode}, Bookings mode: ${bookingsSyncMode}`);
    
    // Reset sync state for current run
    await setState("customers", { status: "running", rows_fetched: 0, error_message: null, sync_mode: customersSyncMode });
    await setState("bookings", { status: "running", rows_fetched: 0, error_message: null, sync_mode: bookingsSyncMode });

    // CUSTOMERS
    let usersFetched = 0;
    let customerPages = 0;
    console.log(`Syncing customers since: ${sinceUsers ?? 'beginning'}`);
    
    for await (const { rows, page_index } of paged("/v1/users/", { page_index: 0, page_size: 50 }, sinceUsers)) {
      if (customerPages === 0 && rows.length > 0) {
        console.log("[sync] sample customer:", JSON.stringify(rows[0], null, 2));
      }
      
      await upsertCustomers(rows);
      usersFetched += rows.length;
      customerPages++;
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        sinceUsers ?? "1970-01-01"
      );
      
      // Calculate progress for initial sync (estimate 20k total)
      const progress = customersSyncMode === 'initial' ? (usersFetched / 20000) * 100 : null;
      
      await setState("customers", { 
        high_watermark: maxUpdated, 
        rows_fetched: usersFetched,
        error_message: null,
        sync_mode: customersSyncMode,
        progress_percentage: progress
      });
      
      console.log(`[sync] customers page done: ${page_index}, rows=${rows.length}`);
      
      if (customerPages >= MAX_PAGES_PER_RESOURCE) {
        console.log(`Reached page limit for customers (${MAX_PAGES_PER_RESOURCE} pages)`);
        break;
      }
    }
    console.log(`Synced ${usersFetched} customers across ${customerPages} pages`);
    
    // Mark customers sync as completed if no more pages
    const customersStatus = customerPages >= MAX_PAGES_PER_RESOURCE ? 'running' : 'completed';
    await setState("customers", { 
      status: customersStatus, 
      rows_fetched: usersFetched,
      error_message: null,
      sync_mode: customersSyncMode
    });

    // BOOKINGS
    let bookingsFetched = 0;
    let bookingPages = 0;
    console.log(`Syncing bookings since: ${sinceBookings ?? 'beginning'}`);
    
    for await (const { rows, page_index } of paged("/v1/bookings/", { page_index: 0, page_size: 50 }, sinceBookings)) {
      if (bookingPages === 0 && rows.length > 0) {
        console.log("[sync] sample booking:", JSON.stringify(rows[0], null, 2));
      }
      
      await upsertBookings(rows);
      bookingsFetched += rows.length;
      
      // Persist order lines directly from the list payload (if present)
      for (const b of rows) {
        const lines = b?.order?.order_lines ?? b?.order_lines ?? [];
        if (Array.isArray(lines) && lines.length > 0) {
          await upsertOrderLines(b.id, lines);
        }
      }
      
      bookingPages++;
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        sinceBookings ?? "1970-01-01"
      );
      
      // Calculate progress for initial sync (estimate 20k total)
      const progress = bookingsSyncMode === 'initial' ? (bookingsFetched / 20000) * 100 : null;
      
      await setState("bookings", { 
        high_watermark: maxUpdated, 
        rows_fetched: bookingsFetched,
        error_message: null,
        sync_mode: bookingsSyncMode,
        progress_percentage: progress
      });
      
      console.log(`[sync] bookings page done: ${page_index}, rows=${rows.length}`);
      
      if (bookingPages >= MAX_PAGES_PER_RESOURCE) {
        console.log(`Reached page limit for bookings (${MAX_PAGES_PER_RESOURCE} pages)`);
        break;
      }
    }
    console.log(`Synced ${bookingsFetched} bookings across ${bookingPages} pages`);
    
    // Mark bookings sync as completed if no more pages
    const bookingsStatus = bookingPages >= MAX_PAGES_PER_RESOURCE ? 'running' : 'completed';
    await setState("bookings", { 
      status: bookingsStatus, 
      rows_fetched: bookingsFetched,
      error_message: null,
      sync_mode: bookingsSyncMode
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        usersFetched, 
        bookingsFetched,
        customersMode: customersSyncMode,
        bookingsMode: bookingsSyncMode,
        customersComplete: customersStatus === 'completed',
        bookingsComplete: bookingsStatus === 'completed'
      }), 
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("Sync error:", e);
    await setState("customers", { status: "error", error_message: String(e) });
    await setState("bookings", { status: "error", error_message: String(e) });
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }), 
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
