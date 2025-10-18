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

// PHASE 1: Type safety helper
function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
  startPage: number = 0,
  highWatermark: string | null = null
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
    
    // PART 1 FIX: Use timestamp-based incremental sync instead of ID-based
    let hasNewRecords = true;
    if (syncMode === 'incremental' && highWatermark && page_index > 0) {
      const watermarkTime = new Date(highWatermark).getTime();
      const maxUpdatedInPage = rows.reduce((max: number, r: any) => {
        const recordTime = new Date(r.updated_at || r.created_at).getTime();
        return Math.max(max, recordTime);
      }, 0);
      
      hasNewRecords = maxUpdatedInPage > watermarkTime;
      
      if (!hasNewRecords) {
        console.log(`[sync] No new records (all older than ${highWatermark}), stopping`);
        break;
      }
    }
    
    yield { rows, page_index, maxIdInPage, hasNewRecords, totalCount };
    page_index++;
    pagesProcessed++;
    
    if (pagesProcessed >= maxPages) {
      console.log(`[sync] Reached page limit for this run (${maxPages}), will resume next time`);
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

// PHASE 2: Rewrite with correct user_id mapping
async function upsertBookings(rows: any[]) {
  if (!rows.length) return;
  
  // PART 2A FIX: Filter out orphaned bookings (skip bookings with missing customers)
  const userIds = [...new Set(rows.map(r => {
    const ug = r?.user_group ?? {};
    return ug?.users && Array.isArray(ug.users) && ug.users.length > 0 ? ug.users[0]?.id : null;
  }).filter(Boolean))];
  
  const { data: existingCustomers } = await sb
    .from('customers')
    .select('id')
    .in('id', userIds);
  
  const existingIds = new Set(existingCustomers?.map(c => c.id) || []);
  
  const mapped = rows
    .map((b: any) => {
      const ug = b?.user_group ?? {};
      const primaryUserId =
        ug?.users && Array.isArray(ug.users) && ug.users.length > 0
          ? ug.users[0]?.id
          : null;

      return {
        id: toNum(b?.id),
        user_group_id: toNum(ug?.id),
        user_id: toNum(primaryUserId),
        status_label: b?.status?.label ?? null,
        started_at: b?.started_at ?? b?.estimated_service_start ?? null,
        completed_at: b?.completed_at ?? null,
        date: b?.date ?? null,
        is_cancelled: Boolean(b?.is_cancelled),
        is_fully_paid: b?.order?.is_fully_paid ?? null,
        is_partially_unable_to_complete: Boolean(b?.is_partially_unable_to_complete),
        is_fully_unable_to_complete: Boolean(b?.is_fully_unable_to_complete),
        updated_at: b?.updated_at ?? null,
      };
    })
    .filter(b => {
      if (!b.user_id || !existingIds.has(b.user_id)) {
        console.warn(`[bookings] Skipping booking ${b.id}: customer ${b.user_id} not found`);
        return false;
      }
      return true;
    });

  if (mapped.length === 0) {
    console.log(`[bookings] ⚠️ All ${rows.length} bookings skipped (orphaned)`);
    return;
  }

  const { error } = await sb.from('bookings').upsert(mapped, { onConflict: 'id' });
  if (error) {
    console.error('[bookings] Error upserting:', error);
    throw error;
  }
  
  const skippedCount = rows.length - mapped.length;
  console.log(`[bookings] ✓ Upserted ${mapped.length} bookings${skippedCount > 0 ? ` (skipped ${skippedCount} orphaned)` : ''}`);
}

// PHASE 3: Flatten booking_items[].sales_items[] into order_lines
async function upsertOrderLinesForBookings(bookingsPage: any[]) {
  const lines: any[] = [];

  for (const b of bookingsPage) {
    const bookingId = toNum(b?.id);
    if (!bookingId) continue;
    
    const items = Array.isArray(b?.booking_items) ? b.booking_items : [];

    for (const bi of items) {
      const sales = Array.isArray(bi?.sales_items) ? bi.sales_items : [];
      for (const si of sales) {
        const id = toNum(si?.id);
        if (!id) continue;

        lines.push({
          id,
          booking_id: bookingId,
          sales_item_id: id,
          description: si?.name ?? si?.name_internal ?? bi?.title ?? null,
          quantity: Number(si?.quantity ?? 1),
          amount_gross: Number(si?.price?.amount ?? si?.amount_gross?.amount ?? 0),
          amount_vat: Number(si?.amount_vat?.amount ?? 0),
          currency: si?.price?.currency ?? si?.currency ?? 'NOK',
          is_discount: Boolean(si?.is_discount ?? false),
          is_delivery_fee: Boolean(si?.is_delivery_fee ?? false),
          created_at: si?.created_at ?? b?.created_at ?? null,
        });
      }
    }
  }

  if (lines.length === 0) return;

  // Deduplicate by ID
  const seen = new Set<number>();
  const uniqueLines = lines.filter(l => {
    if (seen.has(l.id)) {
      console.log(`[order_lines] Duplicate ID ${l.id}, skipping`);
      return false;
    }
    seen.add(l.id);
    return true;
  });

  if (uniqueLines.length !== lines.length) {
    console.log(`[order_lines] Deduped ${lines.length} → ${uniqueLines.length} lines`);
  }

  const { error } = await sb.from('order_lines').upsert(uniqueLines, { onConflict: 'id' });
  if (error) {
    console.error('[order_lines] Error upserting:', error);
    throw error;
  }
  
  console.log(`[order_lines] ✓ Upserted ${uniqueLines.length} lines`);
}


// PHASE 4: Restructure main sync flow - Sequential phasing
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== SYNC START ===");
    
    const customersState = await getState("customers");
    const bookingsState = await getState("bookings");
    
    const customersSyncMode = customersState.sync_mode || 'initial';
    const bookingsSyncMode = bookingsState.sync_mode || 'initial';
    
    // Bounded work per invocation (5 pages max to avoid timeouts)
    const customersMaxPages = 5;
    const bookingsMaxPages = 5;
    
    const customersStartPage = customersSyncMode === 'initial' ? (customersState.current_page || 0) : 0;
    const bookingsStartPage = bookingsSyncMode === 'initial' ? (bookingsState.current_page || 0) : 0;
    
    console.log(`[PHASE 1] Customers: ${customersSyncMode} mode, page ${customersStartPage}`);
    console.log(`[PHASE 2] Bookings: ${bookingsSyncMode} mode, page ${bookingsStartPage}`);
    
    await setState("customers", { status: "running", error_message: null });
    await setState("bookings", { status: "running", error_message: null });

    // ===== PHASE 1: SYNC CUSTOMERS COMPLETELY =====
    console.log("\n[PHASE 1] === Syncing Customers ===");
    let usersFetched = 0;
    let customerPages = 0;
    let customersMaxIdSeen = customersState.max_id_seen || 0;
    
    for await (const { rows, page_index, maxIdInPage, totalCount } of paged(
      "/v1/users/", 
      { page_size: 100 },
      customersMaxPages,
      customersState.max_id_seen || 0,
      customersSyncMode,
      customersStartPage,
      customersState.high_watermark
    )) {
      if (customerPages === 0 && totalCount !== undefined) {
        await setState("customers", { estimated_total: totalCount });
      }
      
      await upsertCustomers(rows);
      usersFetched += rows.length;
      customerPages++;
      customersMaxIdSeen = Math.max(customersMaxIdSeen, maxIdInPage);
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        customersState.high_watermark ?? "1970-01-01"
      );
      
      await setState("customers", { 
        high_watermark: maxUpdated, 
        max_id_seen: customersMaxIdSeen,
        rows_fetched: usersFetched,
        current_page: page_index + 1,
      });
      
      console.log(`[PHASE 1] customers page ${page_index}: ${rows.length} rows`);
    }
    
    const customersReachedEnd = customerPages < customersMaxPages;
    await setState("customers", { 
      status: customersReachedEnd ? 'completed' : 'running',
      sync_mode: customersReachedEnd && customersSyncMode === 'initial' ? 'incremental' : customersSyncMode,
    });
    
    console.log(`[PHASE 1] ✓ Customers complete: ${usersFetched} synced`);

    // ===== PHASE 2: SYNC BOOKINGS COMPLETELY (WITHOUT order_lines) =====
    console.log("\n[PHASE 2] === Syncing Bookings ===");
    let bookingsFetched = 0;
    let bookingPages = 0;
    let bookingsMaxIdSeen = bookingsState.max_id_seen || 0;
    const allBookingsForOrderLines: any[] = []; // Collect for Phase 3
    
    for await (const { rows, page_index, maxIdInPage, totalCount } of paged(
      "/v1/bookings/", 
      { page_size: 100 },
      bookingsMaxPages,
      bookingsState.max_id_seen || 0,
      bookingsSyncMode,
      bookingsStartPage,
      bookingsState.high_watermark
    )) {
      if (bookingPages === 0 && totalCount !== undefined) {
        await setState("bookings", { estimated_total: totalCount });
      }
      
      await upsertBookings(rows); // Just bookings, no order_lines yet
      allBookingsForOrderLines.push(...rows); // Save for Phase 3
      bookingsFetched += rows.length;
      bookingPages++;
      bookingsMaxIdSeen = Math.max(bookingsMaxIdSeen, maxIdInPage);
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        bookingsState.high_watermark ?? "1970-01-01"
      );
      
      await setState("bookings", { 
        high_watermark: maxUpdated,
        max_id_seen: bookingsMaxIdSeen,
        rows_fetched: bookingsFetched,
        current_page: page_index + 1,
      });
      
      console.log(`[PHASE 2] bookings page ${page_index}: ${rows.length} rows`);
    }
    
    const bookingsReachedEnd = bookingPages < bookingsMaxPages;
    await setState("bookings", { 
      status: bookingsReachedEnd ? 'completed' : 'running',
      sync_mode: bookingsReachedEnd && bookingsSyncMode === 'initial' ? 'incremental' : bookingsSyncMode,
    });
    
    console.log(`[PHASE 2] ✓ Bookings complete: ${bookingsFetched} synced`);

    // ===== PHASE 3: SYNC ORDER LINES (AFTER bookings exist) =====
    console.log("\n[PHASE 3] === Syncing Order Lines ===");
    await upsertOrderLinesForBookings(allBookingsForOrderLines);
    console.log(`[PHASE 3] ✓ Order lines complete`);
    
    // ===== PHASE 4: HEALTH CHECK =====
    console.log("\n[PHASE 4] === Health Check ===");
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
      synced_at: new Date().toISOString()
    };
    
    console.log("[PHASE 4] Health:", health);
    
    await sb.from("settings").upsert({
      key: "sync_health",
      value: health,
      updated_at: new Date().toISOString()
    });

    console.log("=== SYNC COMPLETE ===\n");

    return new Response(
      JSON.stringify({ ok: true, health, usersFetched, bookingsFetched }), 
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
    
  } catch (e) {
    console.error("Sync error:", e);
    await setState("customers", { status: "error", error_message: String(e) });
    await setState("bookings", { status: "error", error_message: String(e) });
    
    // Always return CORS headers on error
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }), 
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
