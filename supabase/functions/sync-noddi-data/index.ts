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

async function getState(resource: string) {
  const { data } = await sb
    .from("sync_state")
    .select("high_watermark, max_id_seen, rows_fetched, sync_mode")
    .eq("resource", resource)
    .maybeSingle();
  return data ?? { high_watermark: null, max_id_seen: 0, rows_fetched: 0, sync_mode: 'initial' };
}

async function setState(resource: string, patch: Record<string, any>) {
  await sb.from("sync_state").upsert({ 
    resource, 
    ...patch, 
    last_run_at: new Date().toISOString() 
  });
}

async function* paged(path: string, params: Record<string, string | number | undefined>, maxPages: number, knownMaxId: number) {
  const baseUrl = API.replace(/\/+$/, "");
  let page_index = Number(params?.page_index ?? 0);
  const page_size = Number(params?.page_size ?? 50);
  let pagesProcessed = 0;
  
  for (;;) {
    const queryParams: Record<string, string> = {
      page_index: String(page_index),
      page_size: String(page_size),
    };
    
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
    
    // In incremental mode, check if we've seen new IDs
    const maxIdInPage = rows.length > 0 ? Math.max(...rows.map((r: any) => r.id)) : 0;
    const hasNewRecords = maxIdInPage > knownMaxId;
    
    yield { rows, page_index, maxIdInPage, hasNewRecords };
    page_index++;
    pagesProcessed++;
    
    // Stop early if page limit reached
    if (pagesProcessed >= maxPages) {
      console.log(`[sync] Reached page limit (${maxPages})`);
      break;
    }
    
    // In incremental mode, stop if no new records found
    if (knownMaxId > 0 && !hasNewRecords) {
      console.log(`[sync] No new records found (max ID ${maxIdInPage} <= known ${knownMaxId}), stopping`);
      break;
    }
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
    
    // Get current sync state
    const customersState = await getState("customers");
    const bookingsState = await getState("bookings");
    
    // Determine sync mode and dynamic page limits
    const customersSyncMode = customersState.sync_mode || 'initial';
    const bookingsSyncMode = bookingsState.sync_mode || 'initial';
    
    // Smart page limits based on mode and progress
    let customersMaxPages = 3; // Default for incremental
    let bookingsMaxPages = 3;
    
    if (customersSyncMode === 'initial') {
      customersMaxPages = customersState.rows_fetched < 500 ? 10 : 5; // Fast initial, then backfill
    }
    if (bookingsSyncMode === 'initial') {
      bookingsMaxPages = bookingsState.rows_fetched < 500 ? 10 : 5;
    }
    
    console.log(`[sync] Customers: ${customersSyncMode} mode, max ${customersMaxPages} pages, known max_id=${customersState.max_id_seen}`);
    console.log(`[sync] Bookings: ${bookingsSyncMode} mode, max ${bookingsMaxPages} pages, known max_id=${bookingsState.max_id_seen}`);
    
    // Reset sync state for current run
    await setState("customers", { status: "running", error_message: null });
    await setState("bookings", { status: "running", error_message: null });

    // CUSTOMERS
    let usersFetched = 0;
    let customerPages = 0;
    let customersMaxIdSeen = customersState.max_id_seen || 0;
    let customersFoundNew = false;
    
    for await (const { rows, page_index, maxIdInPage, hasNewRecords } of paged(
      "/v1/users/", 
      { page_index: 0, page_size: 50 }, 
      customersMaxPages,
      customersState.max_id_seen || 0
    )) {
      if (customerPages === 0 && rows.length > 0) {
        console.log("[sync] sample customer:", JSON.stringify(rows[0], null, 2));
      }
      
      if (hasNewRecords) customersFoundNew = true;
      
      await upsertCustomers(rows);
      usersFetched += rows.length;
      customerPages++;
      customersMaxIdSeen = Math.max(customersMaxIdSeen, maxIdInPage);
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        customersState.high_watermark ?? "1970-01-01"
      );
      
      // Calculate progress for initial sync (estimate 20k total)
      const progress = customersSyncMode === 'initial' ? Math.min((usersFetched / 20000) * 100, 99) : null;
      
      await setState("customers", { 
        high_watermark: maxUpdated, 
        max_id_seen: customersMaxIdSeen,
        rows_fetched: (customersState.rows_fetched || 0) + rows.length,
        progress_percentage: progress
      });
      
      console.log(`[sync] customers page ${page_index}: ${rows.length} rows, max_id=${maxIdInPage}, new=${hasNewRecords}`);
    }
    console.log(`Synced ${usersFetched} customers across ${customerPages} pages`);
    
    // Switch to incremental if we hit empty page or no new records in incremental mode
    const customersCompleted = customerPages < customersMaxPages || (customersSyncMode === 'incremental' && !customersFoundNew);
    const newCustomersMode = customersCompleted && customersSyncMode === 'initial' ? 'incremental' : customersSyncMode;
    
    await setState("customers", { 
      status: customersCompleted ? 'completed' : 'running',
      sync_mode: newCustomersMode
    });

    // BOOKINGS
    let bookingsFetched = 0;
    let bookingPages = 0;
    let bookingsMaxIdSeen = bookingsState.max_id_seen || 0;
    let bookingsFoundNew = false;
    
    for await (const { rows, page_index, maxIdInPage, hasNewRecords } of paged(
      "/v1/bookings/", 
      { page_index: 0, page_size: 50 },
      bookingsMaxPages,
      bookingsState.max_id_seen || 0
    )) {
      if (bookingPages === 0 && rows.length > 0) {
        console.log("[sync] sample booking:", JSON.stringify(rows[0], null, 2));
      }
      
      if (hasNewRecords) bookingsFoundNew = true;
      
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
      bookingsMaxIdSeen = Math.max(bookingsMaxIdSeen, maxIdInPage);
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        bookingsState.high_watermark ?? "1970-01-01"
      );
      
      // Calculate progress for initial sync (estimate 20k total)
      const progress = bookingsSyncMode === 'initial' ? Math.min((bookingsFetched / 20000) * 100, 99) : null;
      
      await setState("bookings", { 
        high_watermark: maxUpdated,
        max_id_seen: bookingsMaxIdSeen,
        rows_fetched: (bookingsState.rows_fetched || 0) + rows.length,
        progress_percentage: progress
      });
      
      console.log(`[sync] bookings page ${page_index}: ${rows.length} rows, max_id=${maxIdInPage}, new=${hasNewRecords}`);
    }
    console.log(`Synced ${bookingsFetched} bookings across ${bookingPages} pages`);
    
    // Switch to incremental if we hit empty page or no new records in incremental mode
    const bookingsCompleted = bookingPages < bookingsMaxPages || (bookingsSyncMode === 'incremental' && !bookingsFoundNew);
    const newBookingsMode = bookingsCompleted && bookingsSyncMode === 'initial' ? 'incremental' : bookingsSyncMode;
    
    await setState("bookings", { 
      status: bookingsCompleted ? 'completed' : 'running',
      sync_mode: newBookingsMode
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        usersFetched, 
        bookingsFetched,
        customersMode: newCustomersMode,
        bookingsMode: newBookingsMode,
        customersComplete: customersCompleted,
        bookingsComplete: bookingsCompleted
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
