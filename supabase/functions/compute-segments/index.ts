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

type Thresholds = {
  new_days: number;
  active_months: number;
  at_risk_from_months: number;
  at_risk_to_months: number;
  winback_days: number;
  default_margin_pct: number;
  value_high_percentile: number;
  value_mid_percentile: number;
};

function extractTags(text: string): string[] {
  const t = (text || "").normalize("NFKD").toLowerCase();
  const rules: [string, RegExp][] = [
    ["Dekkskift", /\bdekkskift\b|tire change|wheel change|dekk skift/gi],
    ["Dekkhotell", /\bdekkhotell\b|tire storage|wheel storage/gi],
    ["Hjemlevering", /\bhjemlever|home delivery/gi],
    ["Henting", /\bhenting\b|pickup/gi],
    ["Felgvask", /\bfelgvask\b|rim wash/gi],
    ["Balansering", /\bbalanser/gi],
    ["TPMS", /\btpms\b|ventil|valve|sensor/gi],
    ["Tires", /\b(dekk|tires?|tyres?)\b/gi]
  ];
  const out = new Set<string>();
  for (const [label, rx] of rules) {
    if (rx.test(t)) out.add(label);
  }
  return [...out].sort();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting segment computation...");
    
    // Load thresholds
    const { data: s } = await sb
      .from("settings")
      .select("*")
      .eq("key", "thresholds")
      .maybeSingle();
    const th = (s?.value || {}) as Thresholds;
    console.log("Thresholds:", th);

    // Pull customers to recompute
    const { data: users } = await sb.from("customers").select("id, user_group_id");
    const now = new Date();
    console.log(`Computing segments for ${users?.length ?? 0} customers`);

    // Preload storage flags
    const { data: storage } = await sb.from("storage_status").select("user_group_id, is_active, ended_at");
    const storageMap = new Map<number, { active: boolean; ended_at: string | null }>();
    (storage || []).forEach((r: any) => storageMap.set(r.user_group_id, { active: r.is_active, ended_at: r.ended_at }));

    // Compute features in batches
    const BATCH = 400;
    for (let i = 0; i < (users?.length ?? 0); i += BATCH) {
      const slice = users!.slice(i, i + BATCH);
      const ids = slice.map((u) => u.id);

      // Fetch bookings & order_lines within last 24 months
      const { data: bk } = await sb
        .from("bookings")
        .select("id,user_id,started_at,completed_at,status_label,is_fully_paid,is_partially_unable_to_complete,is_fully_unable_to_complete")
        .in("user_id", ids)
        .gte("started_at", new Date(now.getTime() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString());

      const { data: ol } = await sb
        .from("order_lines")
        .select("booking_id,description,amount_gross,amount_vat,currency,is_discount,created_at")
        .in("booking_id", (bk || []).map((b) => b.id));

      const linesByBooking = new Map<number, any[]>();
      (ol || []).forEach((l) => {
        const a = linesByBooking.get(l.booking_id) ?? [];
        a.push(l);
        linesByBooking.set(l.booking_id, a);
      });

      // Aggregate per user
      const byUser = new Map<number, any>();
      (bk || []).forEach((b) => {
        const u = (byUser.get(b.user_id) ?? { bookings: [] });
        u.bookings.push(b);
        byUser.set(b.user_id, u);
      });

      const feats: any[] = [];
      const segs: any[] = [];

      for (const uid of ids) {
        const uData = byUser.get(uid) ?? { bookings: [] };
        const bookings = uData.bookings as any[];

        // Recency/Frequency/Monetary
        const lastBookingAt = bookings.reduce((m: Date | null, b) => {
          const t = b.started_at ? new Date(b.started_at) : null;
          return !t ? m : !m || t > m ? t : m;
        }, null);

        const revenue24 = bookings.reduce((sum, b) => {
          const lines = linesByBooking.get(b.id) ?? [];
          return sum + lines.reduce((s, l) => s + Number(l.amount_gross || 0), 0);
        }, 0);

        const discountShare = (() => {
          const all = (bookings || []).flatMap((b) => linesByBooking.get(b.id) ?? []);
          const disc = all.filter((l) => !!l.is_discount).reduce((s, l) => s + Number(l.amount_gross || 0), 0);
          const gross = all.reduce((s, l) => s + Number(l.amount_gross || 0), 0);
          return gross > 0 ? disc / gross : 0;
        })();

        const margin = revenue24 * Number(th.default_margin_pct ?? 25) / 100;

        // Detect Dekkskift & last_dekkskift_at
        const allText = (bookings || []).flatMap((b) =>
          (linesByBooking.get(b.id) ?? []).map((l) => String(l.description ?? "")).join(" • ")
        ).join(" • ");

        const allTags = extractTags(allText);
        const lastDekkskiftAt = (() => {
          let latest: Date | null = null;
          for (const b of bookings) {
            const lines = linesByBooking.get(b.id) ?? [];
            if (lines.some((l) => /dekkskift|tire change|wheel change/i.test(String(l.description ?? "")))) {
              const t = b.started_at ? new Date(b.started_at) : null;
              if (t && (!latest || t > latest)) latest = t;
            }
          }
          return latest;
        })();

        // Seasonal due ~ 6 months after last dekkskift
        const due = (() => {
          const anchor = lastDekkskiftAt ?? lastBookingAt;
          if (!anchor) return null;
          const d = new Date(anchor);
          d.setMonth(d.getMonth() + 6);
          return d;
        })();

        const recencyDays = lastBookingAt ? Math.floor((now.getTime() - lastBookingAt.getTime()) / 86400000) : null;

        // Storage logic
        const st = storageMap.get((users!.find((u) => u.id === uid)!.user_group_id)) ?? { active: false, ended_at: null };
        const storageActive = !!st.active;

        // Lifecycle
        const monthsSinceDekkskift = lastDekkskiftAt ? (now.getTime() - lastDekkskiftAt.getTime()) / (1000 * 60 * 60 * 24 * 30.4375) : Infinity;
        const firstBookingAt = bookings.reduce((m: Date | null, b) => {
          const t = b.started_at ? new Date(b.started_at) : null;
          return !t ? m : !m || t < m ? t : m;
        }, null);
        let lifecycle = "Churned";

        if (firstBookingAt && (now.getTime() - firstBookingAt.getTime()) / 86400000 <= (th.new_days ?? 90)) {
          lifecycle = "New";
        } else if (storageActive) {
          lifecycle = "Active";
        } else if (monthsSinceDekkskift <= (th.active_months ?? 7)) {
          lifecycle = "Active";
        } else if (monthsSinceDekkskift > (th.at_risk_from_months ?? 7) && monthsSinceDekkskift <= (th.at_risk_to_months ?? 9)) {
          lifecycle = "At-risk";
        } else {
          lifecycle = "Churned";
        }

        feats.push({
          user_id: uid,
          computed_at: new Date().toISOString(),
          last_booking_at: lastBookingAt?.toISOString() ?? null,
          last_dekkskift_at: lastDekkskiftAt?.toISOString() ?? null,
          seasonal_due_at: due?.toISOString() ?? null,
          storage_active: storageActive,
          recency_days: recencyDays ?? null,
          frequency_24m: bookings.length,
          revenue_24m: revenue24,
          margin_24m: margin,
          discount_share_24m: discountShare,
          fully_paid_rate: bookings.length
            ? bookings.filter((b) => !!b.is_fully_paid).length / bookings.length
            : 0,
          service_counts: null,
          service_tags_all: allTags
        });

        segs.push({
          user_id: uid,
          lifecycle,
          value_tier: null,
          tags: allTags,
          updated_at: new Date().toISOString()
        });
      }

      await sb.from("features").upsert(feats, { onConflict: "user_id" });
      await sb.from("segments").upsert(segs, { onConflict: "user_id" });
      console.log(`Processed batch ${i / BATCH + 1}`);
    }

    // Value tiers: compute percentiles on margin_24m
    const { data: margins } = await sb.from("features").select("user_id, margin_24m");
    const vals = (margins || []).map((m) => Number(m.margin_24m || 0)).sort((a, b) => a - b);
    const p = (q: number) => {
      if (!vals.length) return 0;
      const i = Math.floor(q * (vals.length - 1));
      return vals[i];
    };
    const hi = p(Number((s?.value?.value_high_percentile ?? 0.8)));
    const mid = p(Number((s?.value?.value_mid_percentile ?? 0.5)));

    const updates = (margins || []).map((m) => ({
      user_id: m.user_id,
      value_tier: m.margin_24m >= hi ? "High" : m.margin_24m >= mid ? "Mid" : "Low",
      updated_at: new Date().toISOString()
    }));
    
    for (let i = 0; i < updates.length; i += 1000) {
      await sb.from("segments").upsert(updates.slice(i, i + 1000), { onConflict: "user_id" });
    }
    console.log(`Computed value tiers for ${updates.length} customers`);

    return new Response(
      JSON.stringify({ ok: true, users: users?.length ?? 0 }), 
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("Segment computation error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }), 
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
