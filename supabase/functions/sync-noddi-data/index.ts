// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEPLOYMENT_VERSION = 'v6-fix-count-2025-10-18';

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
  let skippedZeroAmount = 0;

  for (const booking of bookingsWithItems || []) {
    const bookingItems = booking.booking_items;
    
    // Handle case where booking_items might be missing or empty
    if (!Array.isArray(bookingItems) || bookingItems.length === 0) {
      emptyCount++;
      continue;
    }

    // Log first booking's structure for debugging
    if (booking.id === bookingsBatch[0]?.id && bookingItems.length > 0) {
      console.log('[order_lines] SAMPLE booking_items structure:', JSON.stringify(bookingItems[0], null, 2));
    }

    // Parse each booking item's sales_items
    for (const bookingItem of bookingItems) {
      const salesItems = bookingItem.sales_items;
      
      if (!Array.isArray(salesItems)) continue;

      for (const salesItem of salesItems) {
        const salesItemId = toNum(salesItem?.id);
        if (!salesItemId) continue;

        // Validate amount before creating order line
        const amount = Number(salesItem.price?.amount || 0);
        
        // Log mapping for debugging (first 3 items only)
        if (allLines.length < 3) {
          console.log(`[order_lines] Mapping salesItem ${salesItemId}: name="${salesItem.name}", amount=${amount}, category=${salesItem.category}`);
        }
        
        if (amount === 0) {
          console.log(`[order_lines] ⚠️ Skipping salesItem ${salesItemId}: zero amount`);
          skippedZeroAmount++;
          continue;
        }

        // Map to order_lines structure with unique UUID (using direct field access)
        allLines.push({
          id: crypto.randomUUID(), // Generate unique UUID for each instance
          booking_id: booking.id,
          sales_item_id: salesItemId,
          description: salesItem.name || salesItem.name_internal || null,
          quantity: Number(salesItem.quantity || 1),
          amount_gross: amount,
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

  console.log(`[order_lines] ✓ Extracted ${allLines.length} lines from ${successCount} bookings (${emptyCount} had no items, ${skippedZeroAmount} skipped zero amount)`);
  
  return allLines.length;
}


// PHASE 4: Restructure main sync flow - Sequential phasing
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== SYNC START ===");
    
    // RECOVERY: Reset stuck "running" states older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckStates } = await sb
      .from('sync_state')
      .select('resource, last_run_at, status, sync_mode')
      .eq('status', 'running')
      .lt('last_run_at', tenMinutesAgo);
    
    if (stuckStates && stuckStates.length > 0) {
      console.log(`[RECOVERY] Found ${stuckStates.length} stuck running states, resetting to pending`);
      for (const state of stuckStates) {
        await setState(state.resource, { status: 'pending' });
        console.log(`[RECOVERY] Reset ${state.resource} to pending (stuck since ${state.last_run_at})`);
      }
    }
    
    // Also reset completed incremental syncs to pending (they should run again)
    const { data: completedIncrementals } = await sb
      .from('sync_state')
      .select('resource, sync_mode, status')
      .eq('status', 'completed')
      .eq('sync_mode', 'incremental');
    
    if (completedIncrementals && completedIncrementals.length > 0) {
      console.log(`[RECOVERY] Found ${completedIncrementals.length} completed incrementals, scheduling next run`);
      for (const state of completedIncrementals) {
        await setState(state.resource, { status: 'pending' });
        console.log(`[RECOVERY] Scheduled ${state.resource} for incremental sync`);
      }
    }
    
    const functionStartTime = Date.now();
    const MAX_RUNTIME_MS = 8 * 60 * 1000; // 8 minutes (leave 2min buffer before 10min timeout)
    
    const customersState = await getState("customers");
    const bookingsState = await getState("bookings");
    
    const customersSyncMode = customersState.sync_mode || 'initial';
    const bookingsSyncMode = bookingsState.sync_mode || 'initial';
    
    // Bounded work per invocation (5 pages max to avoid timeouts)
    const customersMaxPages = 5;
    const bookingsMaxPages = 5;
    
    // Read starting page from database (resume from where we left off)
    let customersCurrentPage = customersState.current_page || 0;
    let bookingsCurrentPage = bookingsState.current_page || 0;
    
    console.log(`[PHASE 1] Customers: ${customersSyncMode} mode, page ${customersCurrentPage}`);
    console.log(`[PHASE 2] Bookings: ${bookingsSyncMode} mode, page ${bookingsCurrentPage}`);
    
    await setState("customers", { status: "running", error_message: null });
    await setState("bookings", { status: "running", error_message: null });

    // Check timeout before starting
    if (Date.now() - functionStartTime > MAX_RUNTIME_MS) {
      console.log('[TIMEOUT] Function approaching time limit before Phase 1, exiting');
      await setState("customers", { status: "pending", current_page: customersCurrentPage });
      await setState("bookings", { status: "pending", current_page: bookingsCurrentPage });
      return new Response(JSON.stringify({ ok: true, timeout: true }), {
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    
    // ===== PHASE 1: SYNC CUSTOMERS COMPLETELY =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 1] === Syncing Customers ===`);
    let usersFetched = 0;
    let customerPages = 0;
    let customersMaxIdSeen = customersState.max_id_seen || 0;
    
    for await (const { rows, page_index, maxIdInPage, totalCount } of paged(
      "/v1/users/", 
      { page_size: 100 },
      customersMaxPages,
      customersState.max_id_seen || 0,
      customersSyncMode,
      customersCurrentPage, // Resume from saved page
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
      
      // Update page tracking immediately after successful fetch
      customersCurrentPage = page_index + 1;
      
      await setState("customers", { 
        high_watermark: maxUpdated, 
        max_id_seen: customersMaxIdSeen,
        rows_fetched: usersFetched,
        current_page: customersCurrentPage,
      });
      
      console.log(`[PHASE 1] customers page ${page_index}: ${rows.length} rows`);
    }
    
    const customersReachedEnd = customerPages < customersMaxPages;
    // Only update sync_mode, don't set status yet (will be set at end)
    if (customersReachedEnd && customersSyncMode === 'initial') {
      await setState("customers", { sync_mode: 'incremental' });
    }
    
    console.log(`[PHASE 1] ✓ Customers complete: ${usersFetched} synced`);

    // Check timeout before Phase 2
    if (Date.now() - functionStartTime > MAX_RUNTIME_MS) {
      console.log('[TIMEOUT] Function approaching time limit after Phase 1, exiting');
      await setState("customers", { status: customersReachedEnd ? 'completed' : 'pending' });
      await setState("bookings", { status: "pending", current_page: bookingsCurrentPage });
      return new Response(JSON.stringify({ ok: true, timeout: true, usersFetched }), {
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    
    // ===== PHASE 2: SYNC BOOKINGS COMPLETELY (WITHOUT order_lines) =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 2] === Syncing Bookings ===`);
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
      bookingsCurrentPage, // Resume from saved page
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
      
      // Update page tracking immediately after successful fetch
      bookingsCurrentPage = page_index + 1;
      
      await setState("bookings", { 
        high_watermark: maxUpdated,
        max_id_seen: bookingsMaxIdSeen,
        rows_fetched: bookingsFetched,
        current_page: bookingsCurrentPage,
      });
      
      console.log(`[PHASE 2] bookings page ${page_index}: ${rows.length} rows`);
    }
    
    const bookingsReachedEnd = bookingPages < bookingsMaxPages;
    // Only update sync_mode, don't set status yet (will be set at end)
    if (bookingsReachedEnd && bookingsSyncMode === 'initial') {
      await setState("bookings", { sync_mode: 'incremental' });
    }
    
    console.log(`[PHASE 2] ✓ Bookings complete: ${bookingsFetched} synced`);

    // Check timeout before Phase 3
    if (Date.now() - functionStartTime > MAX_RUNTIME_MS) {
      console.log('[TIMEOUT] Function approaching time limit after Phase 2, exiting');
      await setState("customers", { status: customersReachedEnd ? 'completed' : 'pending' });
      await setState("bookings", { status: bookingsReachedEnd ? 'completed' : 'pending' });
      return new Response(JSON.stringify({ ok: true, timeout: true, usersFetched, bookingsFetched }), {
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    
    // ===== PHASE 2.5: SYNC USER GROUPS =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 2.5] === Syncing User Groups ===`);
    
    const userGroupsState = await getState('user_groups');
    const userGroupsSyncMode = userGroupsState.sync_mode || 'initial';
    const userGroupsStartPage = userGroupsState.current_page || 0;
    const userGroupsMaxId = userGroupsState.max_id_seen || 0;
    const userGroupsHighWatermark = userGroupsState.high_watermark || null;
    const userGroupsMaxPages = 999;
    
    let userGroupsFetched = 0;
    let userGroupsPages = 0;
    
    const userGroupsGenerator = paged(
      "/v1/user-groups/",
      { page_size: 100 },
      userGroupsMaxPages,
      userGroupsMaxId,
      userGroupsSyncMode,
      userGroupsStartPage,
      userGroupsHighWatermark
    );
    
    for await (const { rows, page_index, maxIdInPage, totalCount } of userGroupsGenerator) {
      if (!rows.length) break;
      
      const userGroupsData = rows.map((ug: any) => ({
        id: ug.id,
        name: ug.name || `User Group ${ug.id}`,
        org_id: ug.org?.id || null,
        is_personal: ug.is_personal ?? null,
        type: ug.type ?? null,
        created_at: ug.created_at,
        updated_at: ug.updated_at
      }));
      
      const { error: userGroupsErr } = await sb.from("user_groups").upsert(userGroupsData, { onConflict: "id" });
      if (userGroupsErr) console.error("Error upserting user_groups:", userGroupsErr);
      
      userGroupsFetched += userGroupsData.length;
      userGroupsPages = page_index;
      
      await setState("user_groups", {
        current_page: page_index,
        rows_fetched: userGroupsFetched,
        max_id_seen: maxIdInPage,
        total_records: totalCount || 0
      });
    }
    
    const userGroupsReachedEnd = userGroupsPages < userGroupsMaxPages;
    if (userGroupsReachedEnd && userGroupsSyncMode === 'initial') {
      await setState("user_groups", { sync_mode: 'incremental' });
    }
    
    console.log(`[PHASE 2.5] ✓ User Groups complete: ${userGroupsFetched} synced`);

    // ===== PHASE 3: SYNC ORDER LINES (Database-driven, fully resumable) =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 3] === Syncing Order Lines ===`);
    
    const orderLinesState = await getState('order_lines');
    const batchSize = 50;
    let totalOrderLinesExtracted = 0;
    let totalBookingsProcessed = 0;
    
    // Use max_id_seen to track last processed booking_id (resumable across runs)
    const lastProcessedBookingId = orderLinesState.max_id_seen || 0;
    console.log(`[order_lines] Resuming from booking_id > ${lastProcessedBookingId}`);
    
    // Query database for bookings with items that haven't been processed yet
    const { data: bookingsToProcess, error: bookingsQueryError } = await sb
      .from('bookings')
      .select('id, booking_items')
      .not('booking_items', 'is', null)
      .gt('id', lastProcessedBookingId)
      .order('id', { ascending: true })
      .limit(500); // Process up to 500 bookings per run
    
    if (bookingsQueryError) {
      console.error('[order_lines] Error querying bookings:', bookingsQueryError);
      await setState('order_lines', {
        status: 'error',
        error_message: `Failed to query bookings: ${bookingsQueryError.message}`,
      });
    } else if (!bookingsToProcess || bookingsToProcess.length === 0) {
      console.log('[order_lines] No more bookings to process, all caught up');
      await setState('order_lines', {
        status: 'success',
        progress_percentage: 100,
      });
    } else {
      const totalBookingsCount = bookingsToProcess.length;
      console.log(`[order_lines] Found ${totalBookingsCount} bookings to process (id range: ${bookingsToProcess[0].id} - ${bookingsToProcess[totalBookingsCount - 1].id})`);
      
      // Filter bookings that actually have items
      const bookingsWithItems = bookingsToProcess.filter(b => 
        Array.isArray(b.booking_items) && b.booking_items.length > 0
      );
      
      console.log(`[order_lines] ${bookingsWithItems.length} of ${totalBookingsCount} bookings have items`);
      
      // Update state to running
      await setState('order_lines', {
        status: 'running',
        total_records: bookingsWithItems.length,
      });
      
      // Process bookings in batches
      const totalBatches = Math.ceil(bookingsWithItems.length / batchSize);
      let currentBatch = 0;
      let maxBookingIdProcessed = lastProcessedBookingId;
      
      console.log(`[order_lines] Processing ${totalBatches} batches of ${batchSize} bookings each`);
      
      while (currentBatch < totalBatches) {
        // Check timeout before processing batch
        if (Date.now() - functionStartTime > MAX_RUNTIME_MS) {
          console.log(`[TIMEOUT] Saving order_lines progress at booking_id ${maxBookingIdProcessed}`);
          await setState('order_lines', {
            status: 'pending',
            max_id_seen: maxBookingIdProcessed,
            rows_fetched: totalOrderLinesExtracted,
            progress_percentage: Math.min(100, (currentBatch / totalBatches) * 100),
          });
          return new Response(JSON.stringify({ 
            ok: true, 
            timeout: true, 
            totalOrderLinesExtracted,
            lastProcessedBookingId: maxBookingIdProcessed 
          }), {
            headers: { ...corsHeaders, "content-type": "application/json" }
          });
        }
        
        const batchStart = currentBatch * batchSize;
        const batchEnd = Math.min((currentBatch + 1) * batchSize, bookingsWithItems.length);
        const bookingsBatch = bookingsWithItems.slice(batchStart, batchEnd);
        
        if (!bookingsBatch || bookingsBatch.length === 0) {
          console.log(`[order_lines] No more bookings to process at batch ${currentBatch}`);
          break;
        }
        
        console.log(`[order_lines] Batch ${currentBatch + 1}/${totalBatches}: Processing ${bookingsBatch.length} bookings`);
        
        // Extract order lines from this batch
        const linesExtracted = await upsertOrderLinesFromDbBookings(bookingsBatch);
        totalOrderLinesExtracted += linesExtracted;
        totalBookingsProcessed += bookingsBatch.length;
        
        // Track highest booking_id in this batch
        const batchMaxId = Math.max(...bookingsBatch.map(b => b.id));
        maxBookingIdProcessed = Math.max(maxBookingIdProcessed, batchMaxId);
        
        currentBatch++;
        
        // Update progress - track actual order lines extracted and last processed ID
        const progressPct = Math.min(100, (currentBatch / totalBatches) * 100);
        await setState('order_lines', {
          max_id_seen: maxBookingIdProcessed,
          rows_fetched: totalOrderLinesExtracted,
          progress_percentage: progressPct,
          status: 'running',
        });
        
        console.log(`[order_lines] Batch ${currentBatch}/${totalBatches} complete: ${linesExtracted} lines extracted (${totalOrderLinesExtracted} total), max_id=${maxBookingIdProcessed}, ${progressPct.toFixed(1)}% done`);
      }
      
      // Check if there are more bookings to process
      const { count: remainingCount } = await sb
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .not('booking_items', 'is', null)
        .gt('id', maxBookingIdProcessed);
      
      if (remainingCount && remainingCount > 0) {
        console.log(`[order_lines] ${remainingCount} more bookings remaining, will continue next run`);
        await setState('order_lines', {
          status: 'pending',
          max_id_seen: maxBookingIdProcessed,
          rows_fetched: totalOrderLinesExtracted,
          progress_percentage: 50, // Arbitrary - more work to do
        });
      } else {
        console.log(`[order_lines] All bookings processed, marking complete`);
        await setState('order_lines', {
          status: 'success',
          max_id_seen: maxBookingIdProcessed,
          progress_percentage: 100,
          rows_fetched: totalOrderLinesExtracted,
        });
      }
      
      console.log(`[PHASE 3] ✓ Order lines progress: ${totalOrderLinesExtracted} lines extracted from ${totalBookingsProcessed} bookings, last_id=${maxBookingIdProcessed}`);
    }
    
    // ===== PHASE 4: HEALTH CHECK =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 4] === Health Check ===`);
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

    // Reset status before final return - 'completed' if all done, 'pending' if more pages remain
    await setState("customers", { 
      status: customersReachedEnd ? 'completed' : 'pending' 
    });
    await setState("bookings", { 
      status: bookingsReachedEnd ? 'completed' : 'pending' 
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
