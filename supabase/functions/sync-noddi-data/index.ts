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

async function* paged(path: string, params: Record<string, any>) {
  const baseUrl = API.replace(/\/+$/, ""); // Remove trailing slashes
  const searchParams = new URLSearchParams({ ...params, page_size: "50" } as any);
  let next: string | null = `${baseUrl}${path}?${searchParams}`;
  let pageNumber = 1;
  
  while (next) {
    console.log(`Fetching page ${pageNumber}: ${next}`);
    try {
      const res: Response = await fetch(next, { 
        headers: { 
          Accept: "application/json",
          Authorization: `Api-Key ${KEY}` 
        } 
      });
      
      if (!res.ok) {
        const text = await res.text();
        
        // Handle 404 "Invalid page" gracefully (end of pagination)
        if (res.status === 404 && text.includes("Invalid page")) {
          console.log(`Reached end of pagination at page ${pageNumber}`);
          break;
        }
        
        // Fail soft on 500/502/503 errors - log and continue
        if (res.status >= 500) {
          console.warn(`[sync] Page ${pageNumber} -> ${res.status}, skipping this page`);
          // Try to get next URL from error body if available
          try {
            const errorBody = JSON.parse(text);
            next = errorBody?.next ?? null;
          } catch {
            next = null; // Can't parse, stop pagination
          }
          pageNumber++;
          continue; // Skip this page, move to next
        }
        
        // Other errors are fatal
        console.error(`Fetch failed [${res.status}] ${res.statusText}: ${text.slice(0, 500)}`);
        throw new Error(`Fetch failed ${res.status}: ${text}`);
      }
      
      const body: any = await res.json();
      yield body;
      next = body?.next ?? null;
      pageNumber++;
    } catch (error) {
      // Network errors - log and stop
      console.error(`Network error on page ${pageNumber}:`, error);
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
    user_id: b.user?.id ?? b.user_id,
    user_group_id: b.user_group?.id ?? b.user_group_id ?? null,
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

async function enrichAndPersistBooking(bookingId: number) {
  try {
    const baseUrl = API.replace(/\/+$/, ""); // Remove trailing slashes
    const res = await fetch(`${baseUrl}/v1/bookings/${bookingId}/`, { 
      headers: { 
        Accept: "application/json",
        Authorization: `Api-Key ${KEY}` 
      } 
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Failed to enrich booking ${bookingId} [${res.status}]: ${text.slice(0, 300)}`);
      return;
    }
    const detail = await res.json();
    const lines = detail?.order?.order_lines ?? detail?.order_lines ?? detail?.lines ?? [];
    await upsertOrderLines(bookingId, lines);
  } catch (error) {
    console.error(`Error enriching booking ${bookingId}:`, error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting sync...");
    await setState("customers", { status: "running" });
    await setState("bookings", { status: "running" });

    // CUSTOMERS
    const sinceUsers = await getHWM("customers");
    let usersFetched = 0;
    let customerPages = 0;
    console.log(`Syncing customers since: ${sinceUsers ?? 'beginning'}`);
    
    for await (const page of paged("/v1/users/", {})) {
      const results = page.results ?? page ?? [];
      await upsertCustomers(results);
      usersFetched += results.length;
      customerPages++;
      
      const maxUpdated = results.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        sinceUsers ?? "1970-01-01"
      );
      await setState("customers", { 
        high_watermark: maxUpdated, 
        rows_fetched: usersFetched, 
        status: "ok",
        pages_processed: customerPages
      });
      
      if (customerPages >= MAX_PAGES_PER_RESOURCE) {
        console.log(`Reached page limit for customers (${MAX_PAGES_PER_RESOURCE} pages)`);
        break;
      }
    }
    console.log(`Synced ${usersFetched} customers across ${customerPages} pages`);

    // BOOKINGS
    const sinceBookings = await getHWM("bookings");
    let bookingsFetched = 0;
    let bookingPages = 0;
    console.log(`Syncing bookings since: ${sinceBookings ?? 'beginning'}`);
    
    for await (const page of paged("/v1/bookings/", {})) {
      const rows = page.results ?? page ?? [];
      await upsertBookings(rows);
      bookingsFetched += rows.length;
      bookingPages++;
      
      // Extract order lines from the list response (if available)
      for (const booking of rows) {
        const lines = booking?.order?.order_lines ?? booking?.order_lines ?? [];
        if (Array.isArray(lines) && lines.length > 0) {
          await upsertOrderLines(booking.id, lines);
        }
      }
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        sinceBookings ?? "1970-01-01"
      );
      await setState("bookings", { 
        high_watermark: maxUpdated, 
        rows_fetched: bookingsFetched, 
        status: "ok",
        pages_processed: bookingPages
      });
      
      if (bookingPages >= MAX_PAGES_PER_RESOURCE) {
        console.log(`Reached page limit for bookings (${MAX_PAGES_PER_RESOURCE} pages)`);
        break;
      }
    }
    console.log(`Synced ${bookingsFetched} bookings across ${bookingPages} pages`);

    return new Response(
      JSON.stringify({ ok: true, usersFetched, bookingsFetched }), 
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
