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
    .select("high_watermark, max_id_seen, rows_fetched, sync_mode, total_records, current_page, status")
    .eq("resource", resource)
    .maybeSingle();
  return data ?? { high_watermark: null, max_id_seen: 0, rows_fetched: 0, sync_mode: 'initial', total_records: 0, current_page: 0, status: 'pending' };
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
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 10;
  const skippedPages: number[] = [];
  
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
        skippedPages.push(page_index);
        consecutiveFailures++;
        console.warn(`[sync] page ${page_index} -> ${res.status}; skipping (consecutive failures: ${consecutiveFailures})`);
        
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`[sync] Too many consecutive failures (${consecutiveFailures}), stopping sync`);
          throw new Error(`Too many consecutive 500 errors (${consecutiveFailures} pages failed). Skipped pages: [${skippedPages.join(', ')}]`);
        }
        
        // Yield skipped page so caller can update progress
        yield { rows: [], page_index, maxIdInPage: 0, hasNewRecords: false, totalCount, skipped: true, skippedPages: [...skippedPages] };
        page_index++;
        pagesProcessed++;
        
        if (pagesProcessed >= maxPages) {
          console.log(`[sync] Reached page limit for this run (${maxPages}), will resume next time`);
          break;
        }
        continue;
      }
      if (res.status === 404 && /Invalid page/i.test(body)) {
        console.log(`[sync] Reached end of data (404 on page ${page_index})`);
        break;
      }
      throw new Error(`Fetch failed ${res.status}: ${body.slice(0, 500)}`);
    }
    
    // Reset consecutive failures on success
    consecutiveFailures = 0;
    
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
    
    yield { rows, page_index, maxIdInPage, hasNewRecords, totalCount, skipped: false, skippedPages: [...skippedPages] };
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

// Upsert bookings - validate user_group_id exists, keep ALL bookings
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
  
  // Check which user_group_ids exist in user_groups table
  const userGroupIds = [...new Set(rows.map(r => r?.user_group?.id).filter(Boolean))];
  const { data: existingUserGroups } = await sb
    .from('user_groups')
    .select('id')
    .in('id', userGroupIds);
  
  const existingGroupIds = new Set(existingUserGroups?.map(ug => ug.id) || []);
  
  // Check which user_ids exist in customers table
  const userIds = [...new Set(rows.flatMap(r => r?.user_group?.users || []).map(u => u?.id).filter(Boolean))];
  const { data: existingUsers } = await sb
    .from('customers')
    .select('id')
    .in('id', userIds);
  
  const existingUserIds = new Set(existingUsers?.map(u => u.id) || []);
  
  // Map all bookings - filter out ones with invalid user references
  const validBookings = rows
    .map((b: any) => {
      const ug = b?.user_group ?? {};
      const userGroupId = toNum(ug?.id);
      const primaryUserId = ug?.users && Array.isArray(ug.users) && ug.users.length > 0
        ? toNum(ug.users[0]?.id)
        : null;

      // Validate foreign key references
      if (!userGroupId || !existingGroupIds.has(userGroupId)) {
        console.warn(`[bookings] Skipping booking ${b.id}: missing/invalid user_group_id ${userGroupId}`);
        return null;
      }
      
      if (primaryUserId && !existingUserIds.has(primaryUserId)) {
        console.warn(`[bookings] Skipping booking ${b.id}: user_id ${primaryUserId} not found in customers table`);
        return null;
      }

      return {
        id: toNum(b?.id),
        user_group_id: userGroupId,
        user_id: primaryUserId,
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
    .filter((b): b is NonNullable<typeof b> => b !== null);

  // Upsert valid bookings in batches
  const BATCH_SIZE = 50;
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < validBookings.length; i += BATCH_SIZE) {
    const batch = validBookings.slice(i, i + BATCH_SIZE);
    
    try {
      const { error } = await sb.from("bookings").upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error(`[bookings] Batch ${i}-${i + batch.length} failed:`, error);
        failureCount += batch.length;
        
        // Try inserting one-by-one to identify problematic records
        for (const booking of batch) {
          const { error: singleError } = await sb.from("bookings").upsert(booking, { onConflict: 'id' });
          if (singleError) {
            console.warn(`[bookings] Skipping booking ${booking.id}:`, singleError.message);
          } else {
            successCount++;
          }
        }
      } else {
        successCount += batch.length;
      }
    } catch (err) {
      console.error(`[bookings] Batch error:`, err);
      failureCount += batch.length;
    }
  }
  
  const skippedCount = rows.length - validBookings.length;
  console.log(`[bookings] ✓ Upserted ${successCount}/${validBookings.length} valid bookings (${skippedCount} skipped, ${failureCount} failed)`);
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
    
    // Get all phase states
    const userGroupsState = await getState("user_groups");
    const membersState = await getState("customers");
    const bookingsState = await getState("bookings");
    const orderLinesState = await getState("order_lines");
    
    console.log('[SYNC ORDER] Phase 0: User Groups → Phase 1: Members → Phase 2: Bookings → Phase 3: Order Lines');
    console.log(`[STATUS] user_groups: ${userGroupsState.sync_mode || 'initial'} (${userGroupsState.status || 'pending'})`);
    console.log(`[STATUS] members: ${membersState.sync_mode || 'initial'} (${membersState.status || 'pending'})`);
    console.log(`[STATUS] bookings: ${bookingsState.sync_mode || 'initial'} (${bookingsState.status || 'pending'})`);
    console.log(`[STATUS] order_lines: ${orderLinesState.status || 'pending'}`);

    // Clear ALL error messages AND reset error statuses at the start of every sync run
    // This ensures only current run errors are displayed, not stale ones from previous failed runs
    console.log('[CLEANUP] Clearing all stale error messages and error statuses from previous runs');
    await sb.from('sync_state')
      .update({ 
        error_message: null,
        status: 'pending'
      })
      .in('resource', ['customers', 'bookings', 'order_lines'])
      .eq('status', 'error');
    console.log('[CLEANUP] ✓ All error messages and error statuses cleared');

    // ===== PHASE 0: SYNC USER GROUPS (PRIMARY CUSTOMERS) - MUST COMPLETE FIRST =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 0/4] === Syncing User Groups (Primary Customers) ===`);
    
    if (userGroupsState.status === 'completed') {
      console.log('[PHASE 0] User Groups already completed, proceeding to Phase 1');
    } else {
      await setState("user_groups", { status: "running", error_message: null });
      
      const userGroupsSyncMode = userGroupsState.sync_mode || 'initial';
      const userGroupsStartPage = userGroupsState.current_page || 0;
      const userGroupsMaxPages = 10; // Process 10 pages max per invocation
      
      let userGroupsFetched = 0;
      let userGroupsPages = 0;
      let userGroupsMaxIdSeen = userGroupsState.max_id_seen || 0;
      
      console.log(`[PHASE 0] Starting from page ${userGroupsStartPage}, mode: ${userGroupsSyncMode}`);
      
      for await (const { rows, page_index, maxIdInPage, totalCount } of paged(
        "/v1/user-groups/",
        { page_size: 100 },
        userGroupsMaxPages,
        userGroupsMaxIdSeen,
        userGroupsSyncMode,
        userGroupsStartPage,
        userGroupsState.high_watermark
      )) {
        if (page_index === 0 && totalCount !== undefined) {
          await setState("user_groups", { estimated_total: totalCount });
        }
        
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
        userGroupsPages++;
        userGroupsMaxIdSeen = Math.max(userGroupsMaxIdSeen, maxIdInPage);
        
        const maxUpdated = rows.reduce(
          (m: string, r: any) => (r.updated_at > m ? r.updated_at : m),
          userGroupsState.high_watermark ?? "1970-01-01"
        );
        
        const totalToSync = totalCount || (userGroupsState as any).estimated_total || 0;
        const progressPct = totalToSync > 0 
          ? Math.min(100, Math.round(((page_index + 1) * 100 / totalToSync) * 100))
          : 0;
        
        await setState("user_groups", {
          current_page: page_index + 1,
          rows_fetched: userGroupsFetched,
          max_id_seen: userGroupsMaxIdSeen,
          progress_percentage: progressPct,
          display_count: (page_index + 1) * 100,
          display_total: totalToSync,
          high_watermark: maxUpdated,
          status: 'running'
        });
        
        console.log(`[PHASE 0] page ${page_index}: ${rows.length} user groups`);
      }
      
      const userGroupsReachedEnd = userGroupsPages < userGroupsMaxPages;
      
      if (userGroupsReachedEnd) {
        await setState("user_groups", { 
          status: 'completed',
          sync_mode: 'incremental',
          progress_percentage: 100
        });
        console.log(`[PHASE 0] ✓ User Groups COMPLETED: ${userGroupsFetched} synced`);
      } else {
        await setState("user_groups", { status: 'pending' });
        console.log(`[PHASE 0] User Groups in progress, will resume next invocation`);
        return new Response(JSON.stringify({ 
          ok: true, 
          phase: 0,
          message: 'User Groups sync in progress...',
          userGroupsFetched
        }), {
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }
    
    // GATE: Re-fetch User Groups state to check completion
    const freshUserGroupsState = await getState("user_groups");
    if (freshUserGroupsState.status !== 'completed') {
      console.log('[GATE] User Groups not complete, stopping here');
      return new Response(JSON.stringify({ 
        ok: true, 
        phase: 0,
        message: 'Waiting for User Groups to complete...' 
      }), {
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    console.log('[GATE] ✓ User Groups completed, proceeding to Phase 1');
    
    // ===== PHASE 1: SYNC MEMBERS (INDIVIDUAL USERS) - MUST COMPLETE BEFORE BOOKINGS =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 1/4] === Syncing Members (users) ===`);
    
    if (membersState.status === 'completed') {
      console.log('[PHASE 1] Members already completed, proceeding to Phase 2');
    } else {
      await setState("customers", { status: "running", error_message: null });
      
      // FIX #3: Force members to run in full mode if bookings are in full mode
      // This ensures all user references exist before bookings are processed
      let membersSyncMode = membersState.sync_mode || 'initial';
      let membersCurrentPage = membersState.current_page || 0;
      
      if (bookingsState.sync_mode === 'full') {
        console.log('[PHASE 1] Forcing full sync because bookings are in full mode');
        membersSyncMode = 'full';
        // Resume from saved progress, don't reset to 0
        membersCurrentPage = membersState.current_page || 0;
        console.log(`[PHASE 1] Resuming full sync from page ${membersCurrentPage}`);
      }
      
      const membersMaxPages = 10;
      
      let membersFetched = 0;
      let membersPages = 0;
      let membersMaxIdSeen = membersState.max_id_seen || 0;
      const membersSkippedPages: number[] = [];
      
      console.log(`[PHASE 1] Starting from page ${membersCurrentPage}, mode: ${membersSyncMode}`);
    
      for await (const { rows, page_index, maxIdInPage, totalCount, skipped, skippedPages } of paged(
        "/v1/users/", 
        { page_size: 100 },
        membersMaxPages,
        membersMaxIdSeen,
        membersSyncMode,
        membersCurrentPage,
        membersState.high_watermark
      )) {
        if (skippedPages && skippedPages.length > 0) {
          skippedPages.forEach(p => {
            if (!membersSkippedPages.includes(p)) membersSkippedPages.push(p);
          });
        }
        
        if (membersPages === 0 && totalCount !== undefined) {
          await setState("customers", { estimated_total: totalCount });
        }
        
        if (!skipped) {
          await upsertCustomers(rows);
          membersFetched += rows.length;
          membersMaxIdSeen = Math.max(membersMaxIdSeen, maxIdInPage);
          
          const maxUpdated = rows.reduce(
            (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
            membersState.high_watermark ?? "1970-01-01"
          );
          
          const totalToSync = totalCount || (membersState as any).estimated_total || 0;
          const progressPct = totalToSync > 0 
            ? Math.min(100, Math.round(((page_index + 1) * 100 / totalToSync) * 100))
            : 0;
          
          await setState("customers", { 
            high_watermark: maxUpdated, 
            max_id_seen: membersMaxIdSeen,
            rows_fetched: membersFetched,
            current_page: page_index + 1,
            status: 'running',
            progress_percentage: progressPct,
            display_count: (page_index + 1) * 100,
            display_total: totalToSync
          });
          
          console.log(`[PHASE 1] members page ${page_index}: ${rows.length} rows`);
        } else {
          console.log(`[PHASE 1] members page ${page_index}: SKIPPED (500 error)`);
        }
        
        membersPages++;
      }
      
      const membersReachedEnd = membersPages < membersMaxPages;
      
      if (membersReachedEnd) {
        await setState("customers", { 
          status: 'completed',
          sync_mode: 'incremental',
          progress_percentage: 100,
          error_message: membersSkippedPages.length > 0 ? JSON.stringify({
            type: "partial_failure",
            message: `Sync completed with ${membersSkippedPages.length} pages skipped`,
            skipped_pages: membersSkippedPages
          }) : null
        });
        console.log(`[PHASE 1] ✓ Members COMPLETED: ${membersFetched} synced${membersSkippedPages.length > 0 ? ` (${membersSkippedPages.length} pages skipped)` : ''}`);
      } else {
        await setState("customers", { status: 'pending' });
        console.log(`[PHASE 1] Members in progress, will resume next invocation`);
        return new Response(JSON.stringify({ 
          ok: true, 
          phase: 1,
          message: 'Members sync in progress...',
          membersFetched
        }), {
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }
    
    // GATE: Re-fetch Members state to check completion
    const freshMembersState = await getState("customers");
    if (freshMembersState.status !== 'completed') {
      console.log('[GATE] Members not complete, stopping here');
      return new Response(JSON.stringify({ 
        ok: true, 
        phase: 1,
        message: 'Waiting for Members to complete...' 
      }), {
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    console.log('[GATE] ✓ Members completed, proceeding to Phase 2');
    
    // ===== PHASE 2: SYNC BOOKINGS - MUST COMPLETE BEFORE ORDER LINES =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 2/4] === Syncing Bookings ===`);
    
    if (bookingsState.status === 'completed') {
      console.log('[PHASE 2] Bookings already completed, proceeding to Phase 3');
    } else {
      await setState("bookings", { status: "running", error_message: null });
      
      const bookingsSyncMode = bookingsState.sync_mode || 'initial';
      const bookingsCurrentPage = bookingsState.current_page || 0;
      const bookingsMaxPages = 10;
      
      let bookingsFetched = 0;
      let bookingPages = 0;
      let bookingsMaxIdSeen = bookingsState.max_id_seen || 0;
      const bookingsSkippedPages: number[] = [];
      
      console.log(`[PHASE 2] Starting from page ${bookingsCurrentPage}, mode: ${bookingsSyncMode}`);
      
      for await (const { rows, page_index, maxIdInPage, totalCount, skipped, skippedPages } of paged(
        "/v1/bookings/", 
        { page_size: 100 },
        bookingsMaxPages,
        bookingsMaxIdSeen,
        bookingsSyncMode,
        bookingsCurrentPage,
        bookingsState.high_watermark
      )) {
        if (skippedPages && skippedPages.length > 0) {
          skippedPages.forEach(p => {
            if (!bookingsSkippedPages.includes(p)) bookingsSkippedPages.push(p);
          });
        }
        
        if (bookingPages === 0 && totalCount !== undefined) {
          await setState("bookings", { estimated_total: totalCount });
        }
        
        if (!skipped) {
          await upsertBookings(rows);
          bookingsFetched += rows.length;
          bookingsMaxIdSeen = Math.max(bookingsMaxIdSeen, maxIdInPage);
          
          const maxUpdated = rows.reduce(
            (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
            bookingsState.high_watermark ?? "1970-01-01"
          );
          
          const totalToSync = totalCount || (bookingsState as any).estimated_total || 0;
          const progressPct = totalToSync > 0 
            ? Math.min(100, Math.round(((page_index + 1) * 100 / totalToSync) * 100))
            : 0;
          
          await setState("bookings", { 
            high_watermark: maxUpdated, 
            max_id_seen: bookingsMaxIdSeen,
            rows_fetched: bookingsFetched,
            current_page: page_index + 1,
            status: 'running',
            progress_percentage: progressPct,
            display_count: (page_index + 1) * 100,
            display_total: totalToSync
          });
          
          console.log(`[PHASE 2] bookings page ${page_index}: ${rows.length} rows`);
        } else {
          console.log(`[PHASE 2] bookings page ${page_index}: SKIPPED (500 error)`);
        }
        
        bookingPages++;
      }
      
      const bookingsReachedEnd = bookingPages < bookingsMaxPages;
      
      if (bookingsReachedEnd) {
        await setState("bookings", { 
          status: 'completed',
          sync_mode: 'incremental',
          progress_percentage: 100,
          error_message: bookingsSkippedPages.length > 0 ? JSON.stringify({
            type: "partial_failure",
            message: `Sync completed with ${bookingsSkippedPages.length} pages skipped`,
            skipped_pages: bookingsSkippedPages
          }) : null
        });
        console.log(`[PHASE 2] ✓ Bookings COMPLETED: ${bookingsFetched} synced${bookingsSkippedPages.length > 0 ? ` (${bookingsSkippedPages.length} pages skipped)` : ''}`);
      } else {
        await setState("bookings", { status: 'pending' });
        console.log(`[PHASE 2] Bookings in progress, will resume next invocation`);
        return new Response(JSON.stringify({ 
          ok: true, 
          phase: 2,
          message: 'Bookings sync in progress...',
          bookingsFetched
        }), {
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }
    
    // GATE: Re-fetch Bookings state to check completion
    const freshBookingsState = await getState("bookings");
    if (freshBookingsState.status !== 'completed') {
      console.log('[GATE] Bookings not complete, stopping here');
      return new Response(JSON.stringify({ 
        ok: true, 
        phase: 2,
        message: 'Waiting for Bookings to complete...' 
      }), {
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    console.log('[GATE] ✓ Bookings completed, proceeding to Phase 3');

    // ===== PHASE 3: EXTRACT ORDER LINES FROM ALL BOOKINGS =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 3/4] === Extracting Order Lines from ALL Bookings ===`);
    
    if (orderLinesState.status === 'completed') {
      console.log('[PHASE 3] Order lines already extracted, proceeding to health check');
    } else {
      await setState("order_lines", { status: "running", error_message: null });
      
      const batchSize = 100;
      let totalOrderLinesExtracted = 0;
      let totalBookingsProcessed = 0;
      
      // Use max_id_seen to track last processed booking_id (resumable across runs)
      const lastProcessedBookingId = orderLinesState.max_id_seen || 0;
      console.log(`[order_lines] Resuming from booking_id > ${lastProcessedBookingId}`);
      
      // Get total count of ALL bookings in database for progress calculation
      const { count: totalBookingsInDb } = await sb
        .from('bookings')
        .select('*', { count: 'exact', head: true });
      
      // Query database for ALL bookings that haven't been processed yet
      const { data: bookingsToProcess, error: bookingsQueryError } = await sb
        .from('bookings')
        .select('id, booking_items')
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
        console.log('[order_lines] No more bookings to process, extraction complete');
        await setState('order_lines', {
          status: 'completed',
          progress_percentage: 100,
          estimated_total: totalBookingsInDb || 0
        });
        console.log(`[PHASE 3] ✓ Order lines extraction COMPLETED`);
      } else {
        const totalBookingsCount = bookingsToProcess.length;
        console.log(`[order_lines] Found ${totalBookingsCount} bookings to process (id range: ${bookingsToProcess[0].id} - ${bookingsToProcess[totalBookingsCount - 1].id})`);
        console.log(`[order_lines] Total bookings in DB: ${totalBookingsInDb || 'unknown'}`);
        
        // Process ALL bookings (don't filter by booking_items, we'll extract what we can)
        const totalBatches = Math.ceil(totalBookingsCount / batchSize);
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
              estimated_total: totalBookingsInDb || 0
            });
            return new Response(JSON.stringify({ 
              ok: true, 
              phase: 3,
              timeout: true, 
              totalOrderLinesExtracted,
              lastProcessedBookingId: maxBookingIdProcessed 
            }), {
              headers: { ...corsHeaders, "content-type": "application/json" }
            });
          }
          
          const batchStart = currentBatch * batchSize;
          const batchEnd = Math.min((currentBatch + 1) * batchSize, totalBookingsCount);
          const bookingsBatch = bookingsToProcess.slice(batchStart, batchEnd);
          
          console.log(`[order_lines] Batch ${currentBatch + 1}/${totalBatches}: Processing ${bookingsBatch.length} bookings`);
          
          // Extract order lines from this batch
          const linesExtracted = await upsertOrderLinesFromDbBookings(bookingsBatch);
          totalOrderLinesExtracted += linesExtracted;
          totalBookingsProcessed += bookingsBatch.length;
          
          // Track highest booking_id in this batch
          const batchMaxId = Math.max(...bookingsBatch.map(b => b.id));
          maxBookingIdProcessed = Math.max(maxBookingIdProcessed, batchMaxId);
          
          currentBatch++;
          
          // Update progress
          const progressPct = totalBookingsInDb && totalBookingsInDb > 0
            ? Math.min(100, Math.round((totalBookingsProcessed / totalBookingsInDb) * 100))
            : 0;
          
          await setState('order_lines', {
            max_id_seen: maxBookingIdProcessed,
            rows_fetched: totalOrderLinesExtracted,
            status: 'running',
            estimated_total: totalBookingsInDb || 0,
            progress_percentage: progressPct,
            display_count: totalOrderLinesExtracted,
            display_total: totalBookingsInDb
          });
          
          console.log(`[order_lines] Batch ${currentBatch}/${totalBatches} complete: ${linesExtracted} lines extracted (${totalOrderLinesExtracted} total), max_id=${maxBookingIdProcessed}`);
        }
        
        // Check if there are more bookings to process
        const { count: remainingCount } = await sb
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .gt('id', maxBookingIdProcessed);
        
        if (remainingCount && remainingCount > 0) {
          console.log(`[order_lines] ${remainingCount} more bookings remaining, will continue next run`);
          await setState('order_lines', {
            status: 'pending',
            max_id_seen: maxBookingIdProcessed,
            rows_fetched: totalOrderLinesExtracted,
            estimated_total: totalBookingsInDb || 0
          });
          return new Response(JSON.stringify({ 
            ok: true, 
            phase: 3,
            message: 'Order lines extraction in progress...',
            totalOrderLinesExtracted 
          }), {
            headers: { ...corsHeaders, "content-type": "application/json" }
          });
        } else {
          console.log(`[order_lines] All bookings processed, extraction complete`);
          await setState('order_lines', {
            status: 'completed',
            max_id_seen: maxBookingIdProcessed,
            progress_percentage: 100,
            rows_fetched: totalOrderLinesExtracted,
            estimated_total: totalBookingsInDb || 0
          });
          console.log(`[PHASE 3] ✓ Order lines extraction COMPLETED: ${totalOrderLinesExtracted} lines from ${totalBookingsProcessed} bookings`);
        }
      }
    }
    
    // ===== PHASE 4: HEALTH CHECK =====
    console.log(`\n[DEPLOYMENT ${DEPLOYMENT_VERSION}] [PHASE 4/4] === Health Check ===`);
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

    console.log("=== ALL PHASES COMPLETE ===\n");
    
    // Get final counts for reporting
    const finalUserGroupsState = await getState("user_groups");
    const finalMembersState = await getState("customers");
    const finalBookingsState = await getState("bookings");
    const finalOrderLinesState = await getState("order_lines");
    
    const healthReport = {
      ...health,
      user_groups_synced: finalUserGroupsState.rows_fetched || 0,
      members_synced: finalMembersState.rows_fetched || 0,
      bookings_synced: finalBookingsState.rows_fetched || 0,
      order_lines_extracted: finalOrderLinesState.rows_fetched || 0
    };

    return new Response(
      JSON.stringify({ 
        ok: true,
        phase: 4,
        message: 'All sync phases complete',
        userGroupsFetched: finalUserGroupsState.rows_fetched || 0,
        membersFetched: finalMembersState.rows_fetched || 0,
        bookingsFetched: finalBookingsState.rows_fetched || 0,
        orderLinesExtracted: finalOrderLinesState.rows_fetched || 0,
        health: healthReport,
        deployment: DEPLOYMENT_VERSION 
      }), 
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
    
  } catch (e) {
    console.error("Sync error:", e);
    
    // FIX #1: Properly serialize error message
    const errorMessage = e instanceof Error 
      ? e.message 
      : typeof e === 'object' && e !== null
        ? JSON.stringify(e)
        : String(e);
    
    await setState("customers", { status: "error", error_message: errorMessage });
    await setState("bookings", { status: "error", error_message: errorMessage });
    
    // Always return CORS headers on error
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }), 
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
