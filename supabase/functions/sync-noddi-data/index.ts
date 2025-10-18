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

// PHASE 2: Rewrite with correct user_id mapping and store booking_items
async function upsertBookings(rows: any[]) {
  if (!rows.length) return;
  
  // Log first booking to check if it contains nested booking_items/sales_items
  if (rows.length > 0) {
    const sample = rows[0];
    console.log(`[bookings] Checking data structure...`);
    console.log(`[bookings] Has booking_items: ${!!sample?.booking_items}`);
    console.log(`[bookings] Has order: ${!!sample?.order}`);
    console.log(`[bookings] Sample keys:`, Object.keys(sample).join(', '));
  }
  
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
        booking_items: b?.booking_items || [], // Store booking_items JSONB
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
  console.log(`[bookings] ✓ Upserted ${mapped.length} bookings with booking_items${skippedCount > 0 ? ` (skipped ${skippedCount} orphaned)` : ''}`);
}

// Extract order lines from booking_items JSONB (passed directly from batch query)
async function upsertOrderLinesFromDbBookings(bookingsBatch: any[]): Promise<number> {
  // bookingsBatch now contains { id, booking_items } - no additional fetch needed!
  console.log(`[order_lines] Processing batch of ${bookingsBatch.length} bookings...`);
  
  // Use the bookings data passed directly (no second fetch!)
  const bookingsWithItems = bookingsBatch;

  // Extract all order lines from booking_items JSONB
  const allLines: any[] = [];
  let successCount = 0;
  let emptyCount = 0;

  for (const booking of bookingsWithItems || []) {
    const bookingItems = booking.booking_items;
    
    // Handle case where booking_items might be missing or empty
    if (!Array.isArray(bookingItems) || bookingItems.length === 0) {
      emptyCount++;
      continue;
    }

    // Parse each booking item's sales_items
    for (const bookingItem of bookingItems) {
      const salesItems = bookingItem.sales_items;
      
      if (!Array.isArray(salesItems)) continue;

      for (const salesItem of salesItems) {
        const salesItemId = toNum(salesItem?.id);
        if (!salesItemId) continue;

        // Map to order_lines structure with unique UUID (using direct field access)
        allLines.push({
          id: crypto.randomUUID(), // Generate unique UUID for each instance
          booking_id: booking.id,
          sales_item_id: salesItemId,
          description: salesItem.name || salesItem.name_internal || null,
          quantity: Number(salesItem.quantity || 1),
          amount_gross: Number(salesItem.price?.amount || 0),
          amount_vat: 0, // Not provided in Noddi API, would need to calculate from VAT rate
          currency: salesItem.price?.currency || 'NOK',
          is_discount: salesItem.category === 'DISCOUNT',
          is_delivery_fee: salesItem.category === 'DELIVERY_FEE',
          created_at: salesItem.created_at || bookingItem.created_at || new Date().toISOString()
        });
      }
    }
    
    successCount++;
  }

  // Insert order lines in chunks of 500 (no upsert needed with UUIDs)
  if (allLines.length > 0) {
    for (let i = 0; i < allLines.length; i += 500) {
      const chunk = allLines.slice(i, i + 500);
      const { error: insertError } = await sb
        .from("order_lines")
        .insert(chunk);

      if (insertError) {
        console.error(`[order_lines] Error inserting chunk ${i}-${i + chunk.length}:`, insertError);
      }
    }
  }

  console.log(`[order_lines] ✓ Extracted ${allLines.length} lines from ${successCount} bookings (${emptyCount} had no items)`);
  
  return allLines.length;
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

    // ===== PHASE 3: SYNC ORDER LINES (Process ALL bookings from DB) =====
    console.log("\n[PHASE 3] === Syncing Order Lines ===");
    
    const orderLinesState = await getState('order_lines');
    const startBatch = orderLinesState.current_page || 0;
    const batchSize = 100; // Process 100 bookings at a time
    let totalOrderLinesExtracted = 0; // Track actual order lines extracted
    let totalBookingsProcessed = 0;
    let currentBatch = startBatch;
    
    // Query total bookings count (only bookings WITH items)
    const { count: totalBookingsCount } = await sb
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .not('booking_items', 'is', null);
    
    const totalBatches = Math.ceil((totalBookingsCount || 0) / batchSize);
    
    console.log(`[order_lines] Starting batch extraction: batch ${currentBatch}/${totalBatches}`);
    
    // Update state to running
    await setState('order_lines', {
      status: 'running',
      total_records: totalBookingsCount,
    });
    
    // Process bookings in batches
    while (currentBatch < totalBatches) {
      // Fetch next batch of bookings WITH items from database (skip legacy bookings)
      const { data: bookingsBatch, error: fetchError } = await sb
        .from('bookings')
        .select('id, booking_items')
        .not('booking_items', 'is', null)
        .range(currentBatch * batchSize, (currentBatch + 1) * batchSize - 1)
        .order('id', { ascending: true });
      
      if (fetchError) {
        console.error(`[order_lines] Error fetching batch ${currentBatch}:`, fetchError);
        await setState('order_lines', {
          status: 'error',
          error_message: fetchError.message,
        });
        throw fetchError;
      }
      
      if (!bookingsBatch || bookingsBatch.length === 0) {
        console.log(`[order_lines] No more bookings to process at batch ${currentBatch}`);
        break;
      }
      
      // Log how many bookings actually contain items
      const withItems = bookingsBatch.filter(b => b.booking_items?.length > 0);
      console.log(`[order_lines] Batch ${currentBatch}: ${withItems.length}/${bookingsBatch.length} bookings have items`);
      
      // Extract order lines from this batch
      const linesExtracted = await upsertOrderLinesFromDbBookings(bookingsBatch);
      totalOrderLinesExtracted += linesExtracted;
      totalBookingsProcessed += bookingsBatch.length;
      
      currentBatch++;
      
      // Update progress - track actual order lines extracted, not bookings
      const progressPct = Math.min(100, (currentBatch / totalBatches) * 100);
      await setState('order_lines', {
        current_page: currentBatch,
        rows_fetched: totalOrderLinesExtracted, // Track lines, not bookings
        progress_percentage: progressPct,
        status: 'running',
      });
      
      console.log(`[order_lines] Batch ${currentBatch}/${totalBatches} complete: ${linesExtracted} lines extracted (${totalOrderLinesExtracted} total), ${progressPct.toFixed(1)}% done`);
    }
    
    // Mark order_lines as complete
    await setState('order_lines', {
      status: 'success',
      progress_percentage: 100,
      rows_fetched: totalOrderLinesExtracted,
    });
    
    console.log(`[PHASE 3] ✓ Order lines complete: ${totalOrderLinesExtracted} lines extracted from ${totalBookingsProcessed} bookings in ${currentBatch} batches`);
    
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
