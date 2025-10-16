// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
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
  let next: string | null = `${API}${path}?${new URLSearchParams(params as any)}`;
  while (next) {
    console.log(`Fetching: ${next}`);
    const res: Response = await fetch(next, { 
      headers: { Authorization: `Api-Key ${KEY}` } 
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fetch failed ${res.status}: ${text}`);
    }
    const body: any = await res.json();
    yield body;
    next = body?.next ?? null;
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
    const res = await fetch(`${API}/v1/bookings/${bookingId}/`, { 
      headers: { Authorization: `Api-Key ${KEY}` } 
    });
    if (!res.ok) return;
    const detail = await res.json();
    const lines = detail?.order?.order_lines ?? detail?.order_lines ?? detail?.lines ?? [];
    await upsertOrderLines(bookingId, lines);
  } catch (error) {
    console.error(`Error enriching booking ${bookingId}:`, error);
  }
}

serve(async (req) => {
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
    console.log(`Syncing customers since: ${sinceUsers ?? 'beginning'}`);
    
    for await (const page of paged("/v1/users/", sinceUsers ? { updated_since: sinceUsers } : {})) {
      const results = page.results ?? page;
      await upsertCustomers(results);
      usersFetched += results.length ?? 0;
      const maxUpdated = results.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        sinceUsers ?? "1970-01-01"
      );
      await setState("customers", { 
        high_watermark: maxUpdated, 
        rows_fetched: usersFetched, 
        status: "ok" 
      });
    }
    console.log(`Synced ${usersFetched} customers`);

    // BOOKINGS
    const sinceBookings = await getHWM("bookings");
    let bookingsFetched = 0;
    console.log(`Syncing bookings since: ${sinceBookings ?? 'beginning'}`);
    
    for await (const page of paged("/v1/bookings/", sinceBookings ? { updated_since: sinceBookings } : {})) {
      const rows = page.results ?? page;
      await upsertBookings(rows);
      bookingsFetched += rows.length ?? 0;
      
      // Fetch details in small parallel batches
      const ids = rows.map((b: any) => b.id).filter(Boolean);
      const chunks = Array.from(
        { length: Math.ceil(ids.length / 10) }, 
        (_, i) => ids.slice(i * 10, i * 10 + 10)
      );
      for (const chunk of chunks) {
        await Promise.all(chunk.map((id: number) => enrichAndPersistBooking(id)));
      }
      
      const maxUpdated = rows.reduce(
        (m: string, r: any) => (r.updated_at > m ? r.updated_at : m), 
        sinceBookings ?? "1970-01-01"
      );
      await setState("bookings", { 
        high_watermark: maxUpdated, 
        rows_fetched: bookingsFetched, 
        status: "ok" 
      });
    }
    console.log(`Synced ${bookingsFetched} bookings`);

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
