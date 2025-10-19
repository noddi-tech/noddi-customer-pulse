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

    const now = new Date();
    
    // Preload storage flags
    const { data: storage } = await sb.from("storage_status").select("user_group_id, is_active, ended_at");
    const storageMap = new Map<number, { active: boolean; ended_at: string | null }>();
    (storage || []).forEach((r: any) => storageMap.set(r.user_group_id, { active: r.is_active, ended_at: r.ended_at }));

    // Helper function to process a batch of customer IDs
    async function processCustomerBatch(customerIds: number[], userGroupMap: Map<number, number>) {
      const ids = customerIds;

      // Fetch bookings & order_lines within last 24 months
      const cutoffDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
      const { data: bk } = await sb
        .from("bookings")
        .select("id,user_id,started_at,completed_at,date,status_label,is_fully_paid,is_partially_unable_to_complete,is_fully_unable_to_complete")
        .in("user_id", ids)
        .or(`started_at.gte.${cutoffDate},date.gte.${cutoffDate}`);

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

        // Recency/Frequency/Monetary - prefer started_at, fallback to date or completed_at
        const lastBookingAt = bookings.reduce((m: Date | null, b) => {
          const t = b.started_at 
            ? new Date(b.started_at) 
            : b.date 
              ? new Date(b.date) 
              : b.completed_at 
                ? new Date(b.completed_at) 
                : null;
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

        // Track metrics per product category
        const categoryMetrics: Record<string, {
          frequency_24m: number;
          revenue_24m: number;
          margin_24m: number;
          last_booking_at: Date | null;
          recency_days: number | null;
        }> = {};

        // Initialize all known categories
        const categories = ['WHEEL_CHANGE', 'WHEEL_STORAGE', 'CAR_WASH', 'CAR_REPAIR', 'SHOP_TIRE', 'SHOP_TIRE_GENERIC'];
        for (const cat of categories) {
          categoryMetrics[cat] = {
            frequency_24m: 0,
            revenue_24m: 0,
            margin_24m: 0,
            last_booking_at: null,
            recency_days: null
          };
        }

        // Process each booking's order lines for category metrics
        for (const booking of bookings) {
          const bookingDate = booking.started_at 
            ? new Date(booking.started_at) 
            : booking.date 
              ? new Date(booking.date) 
              : booking.completed_at 
                ? new Date(booking.completed_at) 
                : null;
          
          if (!bookingDate) continue;
          
          const bookingAge = (now.getTime() - bookingDate.getTime()) / 86400000;
          
          // Get booking_items from JSONB (if available in future)
          // For now, use order_lines descriptions to infer categories
          const lines = linesByBooking.get(booking.id) ?? [];
          
          for (const line of lines) {
            const desc = String(line.description ?? "").toLowerCase();
            const amount = Number(line.amount_gross || 0);
            
            // Skip discounts and fees (already tracked separately)
            if (line.is_discount) continue;
            
            // Categorize based on description keywords
            let category = null;
            if (/dekkskift|tire change|wheel change|felgvask|balanser|tpms|ventil/i.test(desc)) {
              category = 'WHEEL_CHANGE';
            } else if (/dekkhotell|tire storage|wheel storage|oppbevaring/i.test(desc)) {
              category = 'WHEEL_STORAGE';
            } else if (/vask|wash|rengjøring|clean/i.test(desc)) {
              category = 'CAR_WASH';
            } else if (/reparasjon|repair|punkter/i.test(desc)) {
              category = 'CAR_REPAIR';
            } else if (/dekk|tire|tyre/i.test(desc)) {
              category = 'SHOP_TIRE';
            }
            
            if (category && categoryMetrics[category]) {
              categoryMetrics[category].frequency_24m++;
              categoryMetrics[category].revenue_24m += amount;
              categoryMetrics[category].margin_24m += amount * (Number(th.default_margin_pct ?? 25) / 100);
              
              // Track most recent booking for this category
              if (!categoryMetrics[category].last_booking_at || 
                  bookingDate > categoryMetrics[category].last_booking_at!) {
                categoryMetrics[category].last_booking_at = bookingDate;
                categoryMetrics[category].recency_days = bookingAge;
              }
            }
          }
        }

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
              const t = b.started_at 
                ? new Date(b.started_at) 
                : b.date 
                  ? new Date(b.date) 
                  : b.completed_at 
                    ? new Date(b.completed_at) 
                    : null;
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
        const st = storageMap.get(userGroupMap.get(uid)!) ?? { active: false, ended_at: null };
        const storageActive = !!st.active;

        // Calculate product-line relationship types
        const productLineProfile = {
          is_wheel_change_customer: categoryMetrics.WHEEL_CHANGE.frequency_24m > 0,
          is_storage_customer: storageActive || categoryMetrics.WHEEL_STORAGE.frequency_24m > 0,
          is_fleet_customer: categoryMetrics.CAR_WASH.frequency_24m > 2, // 3+ washes = fleet
          is_tire_buyer: categoryMetrics.SHOP_TIRE.frequency_24m > 0,
          is_multi_service: categories.filter(c => categoryMetrics[c].frequency_24m > 0).length >= 2,
          
          // Engagement depth
          service_mix_count: categories.filter(c => categoryMetrics[c].frequency_24m > 0).length,
          primary_category: categories.reduce((max, cat) => 
            categoryMetrics[cat].revenue_24m > categoryMetrics[max].revenue_24m ? cat : max
          , 'WHEEL_CHANGE')
        };

        // Calculate tenure
        const firstBookingAt = bookings.reduce((m: Date | null, b) => {
          const t = b.started_at 
            ? new Date(b.started_at) 
            : b.date 
              ? new Date(b.date) 
              : b.completed_at 
                ? new Date(b.completed_at) 
                : null;
          return !t ? m : !m || t < m ? t : m;
        }, null);

        const tenureMonths = firstBookingAt 
          ? Math.floor((now.getTime() - firstBookingAt.getTime()) / (1000 * 60 * 60 * 24 * 30.4375))
          : 0;

        // Calculate seasonal status (Dekkskift-specific, now as supplementary indicator)
        const wheelChangeRecency = categoryMetrics.WHEEL_CHANGE.recency_days;
        const seasonalStatus = (() => {
          if (wheelChangeRecency === null) return "No Tire Service History";
          
          const monthsSinceTireService = wheelChangeRecency / 30.4375;
          if (monthsSinceTireService < 3) return "Recently Serviced";
          if (monthsSinceTireService > 6) return "Due for Seasonal Change";
          return "On Schedule";
        })();

        // SERVICE-AGNOSTIC LIFECYCLE: Based on ANY booking activity
        const daysSinceLastBooking = recencyDays ?? Infinity;
        const monthsSinceLastBooking = daysSinceLastBooking / 30.4375;
        const daysSinceFirstBooking = firstBookingAt 
          ? (now.getTime() - firstBookingAt.getTime()) / 86400000 
          : Infinity;

        let lifecycle = "Churned";

        // Lifecycle based on ANY booking activity
        if (daysSinceFirstBooking <= (th.new_days ?? 90)) {
          lifecycle = "New";
        } else if (storageActive) {
          lifecycle = "Active";  // Storage customers = recurring relationship
        } else if (monthsSinceLastBooking <= (th.active_months ?? 7)) {
          lifecycle = "Active";  // ANY recent booking
        } else if (monthsSinceLastBooking > (th.at_risk_from_months ?? 7) && 
                   monthsSinceLastBooking <= (th.at_risk_to_months ?? 9)) {
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
          
          // Product-line intelligence (stored in service_counts JSONB)
          service_counts: {
            // Category-specific metrics
            category_metrics: categoryMetrics,
            
            // Customer profile
            ...productLineProfile,
            
            // Supplementary indicators
            seasonal_status: seasonalStatus,
            tenure_months: tenureMonths
          },
          
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
    }

    // CRITICAL CHANGE: Process by user_group_id instead of user_id
    // Get all unique user_group_ids from bookings table
    console.log("[compute] Fetching unique user_group_ids from bookings...");
    
    const { data: userGroupIds } = await sb
      .from("bookings")
      .select("user_group_id")
      .not("user_group_id", "is", null);
    
    const uniqueUserGroupIds = [...new Set((userGroupIds || []).map(b => b.user_group_id))];
    console.log(`[compute] Found ${uniqueUserGroupIds.length} unique user_groups (customers)`);
    
    // Process in batches
    const BATCH = 100;
    let totalProcessed = 0;
    
    for (let i = 0; i < uniqueUserGroupIds.length; i += BATCH) {
      const batch = uniqueUserGroupIds.slice(i, i + BATCH);
      
      // For each user_group, fetch ALL bookings (all members combined)
      for (const userGroupId of batch) {
        const cutoffDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
        
        const { data: bk } = await sb
          .from("bookings")
          .select("id,user_id,user_group_id,started_at,completed_at,date,status_label,is_fully_paid,is_partially_unable_to_complete,is_fully_unable_to_complete")
          .eq("user_group_id", userGroupId)
          .or(`started_at.gte.${cutoffDate},date.gte.${cutoffDate}`);
        
        if (!bk || bk.length === 0) continue;
        
        const { data: ol } = await sb
          .from("order_lines")
          .select("booking_id,description,amount_gross,amount_vat,currency,is_discount,created_at")
          .in("booking_id", bk.map((b) => b.id));
        
        const linesByBooking = new Map<number, any[]>();
        (ol || []).forEach((l) => {
          const a = linesByBooking.get(l.booking_id) ?? [];
          a.push(l);
          linesByBooking.set(l.booking_id, a);
        });
        
        // Calculate features for this user_group (aggregated across all members)
        const bookings = bk;
        
        const lastBookingAt = bookings.reduce((m: Date | null, b) => {
          const t = b.started_at 
            ? new Date(b.started_at) 
            : b.date 
              ? new Date(b.date) 
              : b.completed_at 
                ? new Date(b.completed_at) 
                : null;
          return !t ? m : !m || t > m ? t : m;
        }, null);
        
        const recencyDays = lastBookingAt ? Math.floor((now.getTime() - lastBookingAt.getTime()) / 86400000) : null;
        
        const revenue24 = bookings.reduce((sum, b) => {
          const lines = linesByBooking.get(b.id) ?? [];
          return sum + lines.reduce((s, l) => s + Number(l.amount_gross || 0), 0);
        }, 0);
        
        const discountShare = (() => {
          const all = bookings.flatMap((b) => linesByBooking.get(b.id) ?? []);
          const disc = all.filter((l) => !!l.is_discount).reduce((s, l) => s + Number(l.amount_gross || 0), 0);
          const gross = all.reduce((s, l) => s + Number(l.amount_gross || 0), 0);
          return gross > 0 ? disc / gross : 0;
        })();
        
        const margin = revenue24 * Number(th.default_margin_pct ?? 25) / 100;
        
        // Extract service tags
        const allTags = [
          ...new Set(bookings.flatMap((b) => {
            const lines = linesByBooking.get(b.id) ?? [];
            return lines.flatMap((l) => extractTags(l.description || ""));
          }))
        ];
        
        // Calculate lifecycle
        const daysSinceLastBooking = recencyDays ?? Infinity;
        const monthsSinceLastBooking = daysSinceLastBooking / 30.4375;
        
        const st = storageMap.get(userGroupId) ?? { active: false, ended_at: null };
        const storageActive = !!st.active;
        
        let lifecycle = "Churned";
        const firstBookingAt = bookings.reduce((m: Date | null, b) => {
          const t = b.started_at ? new Date(b.started_at) : b.date ? new Date(b.date) : b.completed_at ? new Date(b.completed_at) : null;
          return !t ? m : !m || t < m ? t : m;
        }, null);
        
        const daysSinceFirstBooking = firstBookingAt ? (now.getTime() - firstBookingAt.getTime()) / 86400000 : Infinity;
        
        if (daysSinceFirstBooking <= (th.new_days ?? 90)) {
          lifecycle = "New";
        } else if (storageActive) {
          lifecycle = "Active";
        } else if (monthsSinceLastBooking <= (th.active_months ?? 7)) {
          lifecycle = "Active";
        } else if (monthsSinceLastBooking > (th.at_risk_from_months ?? 7) && monthsSinceLastBooking <= (th.at_risk_to_months ?? 9)) {
          lifecycle = "At-risk";
        }
        
        // Upsert features for this user_group
        await sb.from("features").upsert({
          user_group_id: userGroupId,
          computed_at: new Date().toISOString(),
          last_booking_at: lastBookingAt?.toISOString() ?? null,
          storage_active: storageActive,
          recency_days: recencyDays ?? null,
          frequency_24m: bookings.length,
          revenue_24m: revenue24,
          margin_24m: margin,
          discount_share_24m: discountShare,
          fully_paid_rate: bookings.length ? bookings.filter((b) => !!b.is_fully_paid).length / bookings.length : 0,
          service_tags_all: allTags,
          service_counts: null
        }, { onConflict: "user_group_id" });
        
        // Upsert segments for this user_group
        await sb.from("segments").upsert({
          user_group_id: userGroupId,
          lifecycle,
          value_tier: null,
          tags: allTags,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_group_id" });
        
        totalProcessed++;
      }
      
      console.log(`Processed ${totalProcessed}/${uniqueUserGroupIds.length} user_groups (customers)`);
    }
    
    console.log(`Total user_groups (customers) processed: ${totalProcessed}`)

    // RFM + STICKINESS VALUE TIERS
    console.log("[value_tier] Computing RFM + Stickiness scores...");

    // Fetch all features for RFM calculation
    const { data: allFeatures } = await sb
      .from("features")
      .select("user_group_id, recency_days, frequency_24m, margin_24m, service_counts");

    if (!allFeatures || allFeatures.length === 0) {
      console.log("[value_tier] No features found, skipping value tier calculation");
      return new Response(JSON.stringify({ ok: true, users: totalProcessed }), {
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Normalize RFM components (0-100 scale)
    const recencyValues = allFeatures.map(f => f.recency_days ?? 999999);
    const frequencyValues = allFeatures.map(f => f.frequency_24m ?? 0);
    const monetaryValues = allFeatures.map(f => f.margin_24m ?? 0);

    const maxRecency = Math.max(...recencyValues);
    const maxFrequency = Math.max(...frequencyValues);
    const maxMonetary = Math.max(...monetaryValues);

    // Calculate weighted scores
    const scoredCustomers = allFeatures.map(f => {
      const serviceCounts = (f.service_counts as any) || {};
      
      // Normalize: recency is inverted (lower = better)
      const recencyScore = maxRecency > 0 
        ? ((maxRecency - (f.recency_days ?? maxRecency)) / maxRecency) * 100 
        : 0;
      
      const frequencyScore = maxFrequency > 0 
        ? ((f.frequency_24m ?? 0) / maxFrequency) * 100 
        : 0;
      
      const monetaryScore = maxMonetary > 0 
        ? ((f.margin_24m ?? 0) / maxMonetary) * 100 
        : 0;
      
      // Weighted RFM: Recency=30%, Frequency=40%, Monetary=30%
      const rfmScore = (recencyScore * 0.3) + (frequencyScore * 0.4) + (monetaryScore * 0.3);
      
      // Stickiness boosts
      let stickinessBoost = 0;
      if (serviceCounts.is_storage_customer) stickinessBoost += rfmScore * 0.25; // +25% for storage
      if (serviceCounts.is_fleet_customer) stickinessBoost += rfmScore * 0.15;   // +15% for fleet
      if (serviceCounts.is_multi_service) stickinessBoost += rfmScore * 0.10;    // +10% for multi-service
      
      const finalScore = rfmScore + stickinessBoost;
      
      return {
        user_group_id: f.user_group_id,
        score: finalScore,
        rfm_components: { recencyScore, frequencyScore, monetaryScore, rfmScore, stickinessBoost }
      };
    });

    // Sort by score and apply percentile-based tiers
    scoredCustomers.sort((a, b) => b.score - a.score);

    const highThreshold = Math.floor(scoredCustomers.length * 0.2);  // Top 20%
    const midThreshold = Math.floor(scoredCustomers.length * 0.5);   // Next 30% (20-50%)

    const tierUpdates = scoredCustomers.map((sc, index) => ({
      user_group_id: sc.user_group_id,
      value_tier: index < highThreshold ? "High" 
                : index < midThreshold ? "Mid" 
                : "Low",
      updated_at: new Date().toISOString()
    }));

    // Batch upsert value tiers
    for (let i = 0; i < tierUpdates.length; i += 1000) {
      const batch = tierUpdates.slice(i, i + 1000);
      const { error } = await sb.from("segments").upsert(batch, { onConflict: "user_group_id" });
      if (error) {
        console.error(`[value_tier] Error upserting batch ${i}-${i + 1000}:`, error);
      }
    }

    console.log(`[value_tier] ✓ Updated ${tierUpdates.length} customers with RFM+stickiness tiers`);

    return new Response(
      JSON.stringify({ ok: true, users: totalProcessed }), 
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
