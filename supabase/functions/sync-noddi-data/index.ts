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
    .select("high_watermark, max_id_seen, rows_fetched, sync_mode, total_records, current_page")
    .eq("resource", resource)
    .maybeSingle();
  return data ?? { high_watermark: null, max_id_seen: 0, rows_fetched: 0, sync_mode: 'initial', total_records: 0, current_page: 0 };
}

async function setState(resource: string, patch: Record<string, any>) {
  await sb.from("sync_state").upsert({ 
    resource, 
    ...patch, 
    last_run_at: new Date().toISOString() 
  });
}

async function* paged(
  path: string, 
  params: Record<string, string | number | undefined>, 
  maxPages: number, 
  knownMaxId: number,
  syncMode: string,
  startPage: number = 0
) {
  const baseUrl = API.replace(/\/+$/, "");
  let page_index = startPage;
  const page_size = Number(params?.page_size ?? 100);
  let pagesProcessed = 0;
  let totalCount: number | undefined;
  
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
      if (res.status >= 500) {
        console.warn(`[sync] page ${page_index} -> ${res.status}; skipping this page`);
        page_index++;
        continue;
      }
      if (res.status === 404 && /Invalid page/i.test(body)) {
        console.log(`[sync] Reached end of data (404 on page ${page_index})`);
        break;
      }
      throw new Error(`Fetch failed ${res.status}: ${body.slice(0, 500)}`);
    }
    
    const data: any = await res.json();
    const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    
    // Capture total count from first page (Django Rest Framework returns {count: X, results: []})
    if (page_index === startPage && data.count !== undefined) {
      totalCount = data.count;
      console.log(`[sync] Total count from Noddi API: ${totalCount}`);
    }
    
    if (!rows.length) {
      console.log(`[sync] Reached end of data (empty page ${page_index})`);
      break;
    }
    
    const maxIdInPage = rows.length > 0 ? Math.max(...rows.map((r: any) => r.id)) : 0;
    const hasNewRecords = maxIdInPage > knownMaxId;
    
    yield { rows, page_index, maxIdInPage, hasNewRecords, totalCount };
    page_index++;
    pagesProcessed++;
    
    if (pagesProcessed >= maxPages) {
      console.log(`[sync] Reached page limit for this run (${maxPages}), will resume next time`);
      break;
    }
    
    if (syncMode === 'incremental' && !hasNewRecords) {
      console.log(`[sync] No new records found (max ID ${maxIdInPage} <= known ${knownMaxId}), stopping`);
      break;
    }
  }
}

async function upsertCustomers(rows: any[]) {
  if (!rows.length) return;
  
  // Batch upsert in chunks of 100 for better performance
  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const mapped = batch.map((u) => ({
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
    if (error) console.error("Error upserting customers batch:", error);
  }
}

async function upsertBookings(rows: any[]) {
  if (!rows.length) return;
  
  // Batch upsert in chunks of 100 for better performance
  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const mapped = batch.map((b) => ({
      id: b.id,
      user_id: b.user_group?.users?.[0]?.id ?? null, // FIX: Extract from user_group.users[0].id
      user_group_id: b.user_group?.id ?? null,
      date: b.date ?? null,
      started_at: b.delivery_window_starts_at || (b.date ? new Date(b.date).toISOString() : null),
      completed_at: b.completed_at ?? null,
      status_label: b.status?.label ?? b.status_label ?? null,
      is_cancelled: !!b.is_cancelled,
      is_fully_paid: b.order?.is_fully_paid ?? b.is_fully_paid ?? null,
      is_partially_unable_to_complete: !!b.is_partially_unable_to_complete,
      is_fully_unable_to_complete: !!b.is_fully_unable_to_complete,
      updated_at: b.updated_at ?? null
    }));
    const { error } = await sb.from("bookings").upsert(mapped, { onConflict: "id" });
    if (error) console.error("Error upserting bookings batch:", error);
  }
}

// Track failed order lines for retry
const failedOrderLines = new Map<number, any[]>();

async function upsertOrderLines(bookingId: number, lines: any[]) {
  if (!lines?.length) return;
  
  // First verify the booking exists
  const { data: bookingExists } = await sb
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .maybeSingle();
  
  if (!bookingExists) {
    console.log(`[order_lines] Booking ${bookingId} not found, deferring ${lines.length} lines`);
    failedOrderLines.set(bookingId, lines);
    return;
  }
  
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
  if (error) {
    console.error(`[order_lines] Error upserting for booking ${bookingId}:`, error);
    failedOrderLines.set(bookingId, lines);
  } else {
    console.log(`[order_lines] ✓ Inserted ${lines.length} lines for booking ${bookingId}`);
  }
}

// Retry failed order lines after bookings are synced
async function retryFailedOrderLines() {
  if (failedOrderLines.size === 0) return;
  
  console.log(`[order_lines] Retrying ${failedOrderLines.size} failed bookings...`);
  let retrySuccess = 0;
  
  for (const [bookingId, lines] of failedOrderLines.entries()) {
    await upsertOrderLines(bookingId, lines);
    if (!failedOrderLines.has(bookingId)) retrySuccess++;
  }
  
  console.log(`[order_lines] Retry complete: ${retrySuccess}/${failedOrderLines.size} succeeded`);
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
    
    // Page limits: In initial mode, fetch many pages per run to complete faster
    // In incremental mode, only need a few pages to catch up
    const customersMaxPages = customersSyncMode === 'initial' ? 300 : 3;
    const bookingsMaxPages = bookingsSyncMode === 'initial' ? 300 : 3;
    
    // Resume from last successful page
    const customersStartPage = customersSyncMode === 'initial' ? (customersState.current_page || 0) : 0;
    const bookingsStartPage = bookingsSyncMode === 'initial' ? (bookingsState.current_page || 0) : 0;
    
    console.log(`[sync] Customers: ${customersSyncMode} mode, starting page ${customersStartPage}, max ${customersMaxPages} pages, known max_id=${customersState.max_id_seen}`);
    console.log(`[sync] Bookings: ${bookingsSyncMode} mode, starting page ${bookingsStartPage}, max ${bookingsMaxPages} pages, known max_id=${bookingsState.max_id_seen}`);
    
    // Reset sync state for current run
    await setState("customers", { status: "running", error_message: null });
    await setState("bookings", { status: "running", error_message: null });

    // CUSTOMERS
    let usersFetched = 0;
    let customerPages = 0;
    let customersMaxIdSeen = customersState.max_id_seen || 0;
    let customersFoundNew = false;
    
    for await (const { rows, page_index, maxIdInPage, hasNewRecords, totalCount } of paged(
      "/v1/users/", 
      { page_size: 100 },
      customersMaxPages,
      customersState.max_id_seen || 0,
      customersSyncMode,
      customersStartPage
    )) {
      if (customerPages === 0 && rows.length > 0) {
        console.log("[sync] sample customer:", JSON.stringify(rows[0], null, 2));
        
        // Store Noddi total count from first page
        if (totalCount !== undefined) {
          await setState("customers", { estimated_total: totalCount });
        }
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
      
      // Update counters (this run only)
      const runFetched = usersFetched;
      const totalInDb = (customersState.total_records || 0) + rows.length;
      
      // Calculate progress for initial sync (estimate 10k total customers)
      const progress = customersSyncMode === 'initial' ? Math.min((page_index / 100) * 100, 99) : null;
      
      await setState("customers", { 
        high_watermark: maxUpdated, 
        max_id_seen: customersMaxIdSeen,
        rows_fetched: runFetched, // This run only
        total_records: totalInDb, // Cumulative
        current_page: page_index + 1, // Track where we are
        progress_percentage: progress
      });
      
      console.log(`[sync] customers page ${page_index}: ${rows.length} rows, max_id=${maxIdInPage}, new=${hasNewRecords}`);
    }
    console.log(`Synced ${usersFetched} customers across ${customerPages} pages`);
    
    // Switch to incremental ONLY if we fetched less than the max pages (hit end of data)
    // This means we got a 404 or empty page = all historical data is synced
    const customersReachedEnd = customerPages < customersMaxPages;
    const newCustomersMode = customersReachedEnd && customersSyncMode === 'initial' ? 'incremental' : customersSyncMode;
    
    if (customersReachedEnd && customersSyncMode === 'initial') {
      console.log(`[sync] ✓ Customers initial sync COMPLETE - switching to incremental mode`);
    }
    
    await setState("customers", { 
      status: customersReachedEnd ? 'completed' : 'running',
      sync_mode: newCustomersMode,
      progress_percentage: customersReachedEnd ? 100 : null
    });

    // BOOKINGS
    let bookingsFetched = 0;
    let bookingPages = 0;
    let bookingsMaxIdSeen = bookingsState.max_id_seen || 0;
    let bookingsFoundNew = false;
    
    for await (const { rows, page_index, maxIdInPage, hasNewRecords, totalCount } of paged(
      "/v1/bookings/", 
      { page_size: 100 },
      bookingsMaxPages,
      bookingsState.max_id_seen || 0,
      bookingsSyncMode,
      bookingsStartPage
    )) {
      if (bookingPages === 0 && rows.length > 0) {
        console.log("[sync] sample booking:", JSON.stringify(rows[0], null, 2));
        
        // Store Noddi total count from first page
        if (totalCount !== undefined) {
          await setState("bookings", { estimated_total: totalCount });
        }
      }
      
      if (hasNewRecords) bookingsFoundNew = true;
      
      await upsertBookings(rows);
      bookingsFetched += rows.length;
      
      // FIX: Extract order lines from booking_items[].sales_items[]
      for (const b of rows) {
        const orderLines = (b.booking_items || []).flatMap((item: any) => 
          (item.sales_items || []).map((si: any) => ({
            id: si.id,
            sales_item_id: si.id,
            description: si.name ?? si.name_internal ?? null,
            quantity: 1,
            amount_gross: { amount: si.price?.amount ?? 0, currency: si.price?.currency ?? 'NOK' },
            currency: si.price?.currency ?? 'NOK',
            is_discount: si.sales_item_type?.value === 2, // Addon type 2 might be discount
            is_delivery_fee: false,
            created_at: b.created_at
          }))
        );
        if (orderLines.length > 0) {
          await upsertOrderLines(b.id, orderLines);
        }
      }
      
      bookingPages++;
      bookingsMaxIdSeen = Math.max(bookingsMaxIdSeen, maxIdInPage);
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        bookingsState.high_watermark ?? "1970-01-01"
      );
      
      // Update counters (this run only)
      const runFetched = bookingsFetched;
      const totalInDb = (bookingsState.total_records || 0) + rows.length;
      
      // Calculate progress for initial sync (estimate 250 pages total)
      const progress = bookingsSyncMode === 'initial' ? Math.min((page_index / 250) * 100, 99) : null;
      
      await setState("bookings", { 
        high_watermark: maxUpdated,
        max_id_seen: bookingsMaxIdSeen,
        rows_fetched: runFetched, // This run only
        total_records: totalInDb, // Cumulative
        current_page: page_index + 1, // Track where we are
        progress_percentage: progress
      });
      
      console.log(`[sync] bookings page ${page_index}: ${rows.length} rows, max_id=${maxIdInPage}, new=${hasNewRecords}`);
    }
    console.log(`Synced ${bookingsFetched} bookings across ${bookingPages} pages`);
    
    // Switch to incremental ONLY if we fetched less than the max pages (hit end of data)
    const bookingsReachedEnd = bookingPages < bookingsMaxPages;
    const newBookingsMode = bookingsReachedEnd && bookingsSyncMode === 'initial' ? 'incremental' : bookingsSyncMode;
    
    if (bookingsReachedEnd && bookingsSyncMode === 'initial') {
      console.log(`[sync] ✓ Bookings initial sync COMPLETE - switching to incremental mode`);
    }
    
    await setState("bookings", { 
      status: bookingsReachedEnd ? 'completed' : 'running',
      sync_mode: newBookingsMode,
      progress_percentage: bookingsReachedEnd ? 100 : null
    });

    // PHASE 1: Retry failed order lines now that all bookings are synced
    await retryFailedOrderLines();
    
    // PHASE 5: Add sync health checks
    const [customersCount, bookingsCount, orderLinesCount, bookingsWithUser] = await Promise.all([
      sb.from("customers").select("id", { count: "exact", head: true }),
      sb.from("bookings").select("id", { count: "exact", head: true }),
      sb.from("order_lines").select("id", { count: "exact", head: true }),
      sb.from("bookings").select("id", { count: "exact", head: true }).not("user_id", "is", null)
    ]);
    
    const health = {
      customers_total: customersCount.count || 0,
      customers_with_bookings: bookingsWithUser.count || 0,
      bookings_total: bookingsCount.count || 0,
      order_lines_total: orderLinesCount.count || 0,
      avg_order_lines_per_booking: bookingsCount.count ? (orderLinesCount.count || 0) / bookingsCount.count : 0,
      orphaned_bookings: (bookingsCount.count || 0) - (bookingsWithUser.count || 0),
      failed_order_lines: failedOrderLines.size,
      synced_at: new Date().toISOString()
    };
    
    console.log("[sync] Health check:", health);
    
    // Store health metrics for UI display
    await sb.from("settings").upsert({
      key: "sync_health",
      value: health,
      updated_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        usersFetched, 
        bookingsFetched,
        customersMode: newCustomersMode,
        bookingsMode: newBookingsMode,
        customersComplete: customersReachedEnd,
        bookingsComplete: bookingsReachedEnd,
        health
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
