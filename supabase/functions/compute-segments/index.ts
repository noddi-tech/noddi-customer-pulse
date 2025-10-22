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
    // Parse batch parameters from request
    const url = new URL(req.url);
    const batchOffset = parseInt(url.searchParams.get('offset') || '0');
    const batchSize = parseInt(url.searchParams.get('batch_size') || '1000');
    const shouldCalculateValueTiers = url.searchParams.get('calculate_tiers') !== 'false';
    
    console.log(`[BATCH] Starting batch computation: offset=${batchOffset}, size=${batchSize}`);
    
    // Load thresholds
    const { data: s } = await sb
      .from("settings")
      .select("*")
      .eq("key", "thresholds")
      .maybeSingle();
    const th = (s?.value || {}) as Thresholds;

    const now = new Date();
    
    // Preload storage flags (only once, cached for all batches)
    const { data: storage } = await sb.from("storage_status").select("user_group_id, is_active, ended_at");
    const storageMap = new Map<number, { active: boolean; ended_at: string | null }>();
    (storage || []).forEach((r: any) => storageMap.set(r.user_group_id, { active: r.is_active, ended_at: r.ended_at }));

    // Get all unique user_group_ids - PAGINATE through ALL customers
    const allUserGroupIds: number[] = [];
    let fetchPage = 0;
    const fetchPageSize = 1000;
    let hasMoreToFetch = true;

    console.log('[compute] Fetching all user_groups from database...');
    while (hasMoreToFetch) {
      const { data: userGroupIds } = await sb
        .from("user_groups")
        .select("id")
        .range(fetchPage * fetchPageSize, (fetchPage + 1) * fetchPageSize - 1);
      
      if (userGroupIds && userGroupIds.length > 0) {
        allUserGroupIds.push(...userGroupIds.map(ug => ug.id));
        console.log(`[compute] Fetched page ${fetchPage + 1}: ${userGroupIds.length} customers (total so far: ${allUserGroupIds.length})`);
        fetchPage++;
        if (userGroupIds.length < fetchPageSize) {
          hasMoreToFetch = false;
        }
      } else {
        hasMoreToFetch = false;
      }
    }

    const uniqueUserGroupIds = [...new Set(allUserGroupIds)];
    const totalCustomers = uniqueUserGroupIds.length;
    console.log(`[compute] ✓ Found ${totalCustomers} unique user_groups (customers)`);
    
    // Process only the current batch
    const batchUserGroupIds = uniqueUserGroupIds.slice(batchOffset, batchOffset + batchSize);
    console.log(`[BATCH] Processing ${batchUserGroupIds.length} customers (${batchOffset} to ${batchOffset + batchUserGroupIds.length})`);
    
    // Optimize: Fetch ALL bookings for the batch at once (for complete CLV history)
    const { data: allBookings } = await sb
      .from("bookings")
      .select("id,user_id,user_group_id,started_at,completed_at,date,status_label,is_fully_paid,is_partially_unable_to_complete,is_fully_unable_to_complete")
      .in("user_group_id", batchUserGroupIds);
    
    // Group bookings by user_group_id
    const bookingsByUserGroup = new Map<number, any[]>();
    (allBookings || []).forEach(b => {
      const arr = bookingsByUserGroup.get(b.user_group_id) || [];
      arr.push(b);
      bookingsByUserGroup.set(b.user_group_id, arr);
    });
    
    // Fetch all order lines for these bookings at once
    const allBookingIds = (allBookings || []).map(b => b.id);
    const { data: allOrderLines } = await sb
      .from("order_lines")
      .select("booking_id,description,amount_gross,amount_vat,currency,is_discount,created_at")
      .in("booking_id", allBookingIds);
    
    // Group order lines by booking_id
    const linesByBooking = new Map<number, any[]>();
    (allOrderLines || []).forEach(l => {
      const arr = linesByBooking.get(l.booking_id) || [];
      arr.push(l);
      linesByBooking.set(l.booking_id, arr);
    });
    
    // Process in smaller sub-batches for upserts
    const SUBBATCH = 100;
    let batchProcessed = 0;
    let skippedNoBookings = 0;
    let processedWithBookings = 0;
    
    for (let i = 0; i < batchUserGroupIds.length; i += SUBBATCH) {
      const subbatch = batchUserGroupIds.slice(i, i + SUBBATCH);
      
      const feats: any[] = [];
      const segs: any[] = [];
      
      // Process each user_group using pre-fetched data
      for (const userGroupId of subbatch) {
        const bk = bookingsByUserGroup.get(userGroupId);
        
        // PROCESS ALL CUSTOMERS (even without bookings)
        const bookings = bk || [];
        
        if (bookings.length === 0) {
          skippedNoBookings++;
          if (skippedNoBookings <= 10) {
            console.log(`[NO BOOKINGS] user_group ${userGroupId}: Will be assigned lifecycle based on creation date`);
          }
        } else {
          processedWithBookings++;
        }
        
        // Calculate features for this user_group (aggregated across all members)
        
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
        
        // Define time cutoffs for multi-interval analysis
        const cutoff12m = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        const cutoff24m = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
        const cutoff36m = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
        const cutoff48m = new Date(now.getTime() - 4 * 365 * 24 * 60 * 60 * 1000);
        
        // Filter bookings for each interval
        const getBookingDate = (b: any) => b.date ? new Date(b.date) : b.started_at ? new Date(b.started_at) : b.completed_at ? new Date(b.completed_at) : null;
        const bookings12m = bookings.filter(b => { const d = getBookingDate(b); return d && d >= cutoff12m; });
        const bookings24m = bookings.filter(b => { const d = getBookingDate(b); return d && d >= cutoff24m; });
        const bookings36m = bookings.filter(b => { const d = getBookingDate(b); return d && d >= cutoff36m; });
        const bookings48m = bookings.filter(b => { const d = getBookingDate(b); return d && d >= cutoff48m; });
        
        // Calculate metrics for each interval
        const calcMetrics = (bks: any[]) => {
          const freq = bks.length;
          const rev = bks.reduce((sum, b) => {
            const lines = linesByBooking.get(b.id) ?? [];
            return sum + lines.reduce((s, l) => s + Number(l.amount_gross || 0), 0);
          }, 0);
          const margin = rev * Number(th.default_margin_pct ?? 25) / 100;
          return { freq, rev, margin };
        };
        
        const metrics12m = calcMetrics(bookings12m);
        const metrics24m = calcMetrics(bookings24m);
        const metrics36m = calcMetrics(bookings36m);
        const metrics48m = calcMetrics(bookings48m);
        const metricsLifetime = calcMetrics(bookings);
        
        const discountShare = (() => {
          const all = bookings24m.flatMap((b) => linesByBooking.get(b.id) ?? []);
          const disc = all.filter((l) => !!l.is_discount).reduce((s, l) => s + Number(l.amount_gross || 0), 0);
          const gross = all.reduce((s, l) => s + Number(l.amount_gross || 0), 0);
          return gross > 0 ? disc / gross : 0;
        })();
        
        // Track metrics per product category (using 24m bookings for consistency)
        const categoryMetrics: Record<string, {
          frequency_24m: number;
          revenue_24m: number;
          margin_24m: number;
          last_booking_at: Date | null;
          recency_days: number | null;
        }> = {};

        // Initialize all known categories
        const categories = ['WHEEL_CHANGE', 'WHEEL_STORAGE', 'CAR_WASH', 'CAR_REPAIR', 'SHOP_TIRE'];
        for (const cat of categories) {
          categoryMetrics[cat] = {
            frequency_24m: 0,
            revenue_24m: 0,
            margin_24m: 0,
            last_booking_at: null,
            recency_days: null
          };
        }

        // Process each booking's order lines for category metrics (24m window)
        for (const booking of bookings24m) {
          const bookingDate = booking.started_at 
            ? new Date(booking.started_at) 
            : booking.date 
              ? new Date(booking.date) 
              : booking.completed_at 
                ? new Date(booking.completed_at) 
                : null;
          
          if (!bookingDate) continue;
          
          const bookingAge = (now.getTime() - bookingDate.getTime()) / 86400000;
          
          const lines = linesByBooking.get(booking.id) ?? [];
          
          for (const line of lines) {
            const desc = String(line.description ?? "").toLowerCase();
            const amount = Number(line.amount_gross || 0);
            
            // Skip discounts (already tracked separately)
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

        // Extract service tags
        const allTags = [
          ...new Set(bookings.flatMap((b) => {
            const lines = linesByBooking.get(b.id) ?? [];
            return lines.flatMap((l) => extractTags(l.description || ""));
          }))
        ];

        // Detect Dekkskift & last_dekkskift_at
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

        // Storage logic
        const st = storageMap.get(userGroupId) ?? { active: false, ended_at: null };
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

        // Calculate seasonal status
        const wheelChangeRecency = categoryMetrics.WHEEL_CHANGE.recency_days;
        const seasonalStatus = (() => {
          if (wheelChangeRecency === null) return "No Tire Service History";
          
          const monthsSinceTireService = wheelChangeRecency / 30.4375;
          if (monthsSinceTireService < 3) return "Recently Serviced";
          if (monthsSinceTireService > 6) return "Due for Seasonal Change";
          return "On Schedule";
        })();
        
        // Calculate lifecycle - handle customers without bookings
        const daysSinceLastBooking = recencyDays ?? Infinity;
        const monthsSinceLastBooking = daysSinceLastBooking / 30.4375;
        const daysSinceFirstBooking = firstBookingAt 
          ? (now.getTime() - firstBookingAt.getTime()) / 86400000 
          : Infinity;

        let lifecycle = "Churned";

        // For customers without bookings, check user_group creation date
        if (bookings.length === 0) {
          // Query user_group creation date to determine if "New" or "Churned"
          const { data: userGroupData } = await sb
            .from("user_groups")
            .select("created_at")
            .eq("id", userGroupId)
            .single();
          
          const createdAt = userGroupData?.created_at ? new Date(userGroupData.created_at) : null;
          const daysSinceCreation = createdAt 
            ? (now.getTime() - createdAt.getTime()) / 86400000 
            : Infinity;
          
          lifecycle = daysSinceCreation <= (th.new_days ?? 90) ? "New" : "Churned";
        } else {
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
        }
        
        feats.push({
          user_id: null, // User-group level data, not individual user
          user_group_id: userGroupId,
          computed_at: new Date().toISOString(),
          last_booking_at: lastBookingAt?.toISOString() ?? null,
          last_dekkskift_at: lastDekkskiftAt?.toISOString() ?? null,
          seasonal_due_at: due?.toISOString() ?? null,
          storage_active: storageActive,
          recency_days: recencyDays ?? null,
          
          // Multi-interval RFM metrics for CLV analysis
          frequency_12m: metrics12m.freq,
          revenue_12m: metrics12m.rev,
          margin_12m: metrics12m.margin,
          
          frequency_24m: metrics24m.freq,
          revenue_24m: metrics24m.rev,
          margin_24m: metrics24m.margin,
          
          frequency_36m: metrics36m.freq,
          revenue_36m: metrics36m.rev,
          margin_36m: metrics36m.margin,
          
          frequency_48m: metrics48m.freq,
          revenue_48m: metrics48m.rev,
          margin_48m: metrics48m.margin,
          
          frequency_lifetime: metricsLifetime.freq,
          revenue_lifetime: metricsLifetime.rev,
          margin_lifetime: metricsLifetime.margin,
          
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
          user_id: null, // User-group level data, not individual user
          user_group_id: userGroupId,
          lifecycle,
          value_tier: null, // Will be calculated in phase 2
          tags: allTags,
          updated_at: new Date().toISOString()
        });
      }

      // Upsert sub-batch
      if (feats.length > 0) {
        await sb.from("features").upsert(feats, { onConflict: "user_group_id" });
      }
      if (segs.length > 0) {
        await sb.from("segments").upsert(segs, { onConflict: "user_group_id" });
      }

      batchProcessed += subbatch.length;
      if (batchProcessed % 200 === 0) {
        console.log(`[BATCH] Processed ${batchProcessed}/${batchUserGroupIds.length} in current batch`);
      }
    }

    console.log(`[BATCH] Completed: ${batchProcessed} customers in this batch`);
    
    const hasMore = (batchOffset + batchSize) < totalCustomers;
    const nextOffset = batchOffset + batchSize;
    const progressPercent = Math.round(((batchOffset + batchProcessed) / totalCustomers) * 100);

    // === PHASE 2: Calculate Value Tiers (only on final batch or if explicitly requested) ===
    if (shouldCalculateValueTiers && !hasMore) {
      console.log("[value_tier] Computing RFM + Stickiness scores for ALL customers...");

      console.log(`[BATCH STATS] Processed: ${processedWithBookings}, Skipped (no bookings): ${skippedNoBookings}, Total in batch: ${batchUserGroupIds.length}`);
      
      const { data: allFeats } = await sb.from("features").select("*");

      if (!allFeats || allFeats.length === 0) {
        console.log("[value_tier] No features found, skipping value tier calculation");
        return new Response(
          JSON.stringify({ 
            success: true, 
            batch: {
              processed: processedWithBookings,
              skipped: skippedNoBookings,
              offset: batchOffset,
              total: totalCustomers,
              hasMore: false,
              nextOffset,
              progress: 100
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Calculate RFM scores
      const recencies = allFeats.map((f) => f.recency_days ?? 999999).sort((a, b) => a - b);
      const frequencies = allFeats.map((f) => f.frequency_24m ?? 0).sort((a, b) => a - b);
      const revenues = allFeats.map((f) => f.revenue_24m ?? 0).sort((a, b) => a - b);

      const percentile = (arr: number[], val: number) => {
        const idx = arr.filter((x) => x <= val).length;
        return idx / arr.length;
      };

      const valueUpdates = allFeats.map((f) => {
        const R = 1 - percentile(recencies, f.recency_days ?? 999999);
        const F = percentile(frequencies, f.frequency_24m ?? 0);
        const M = percentile(revenues, f.revenue_24m ?? 0);

        // Stickiness boosts
        const sc = f.service_counts || {};
        let boost = 0;
        if (sc.is_storage_customer) boost += 0.15;
        if (sc.is_fleet_customer) boost += 0.10;
        if (sc.service_mix_count >= 3) boost += 0.05;

        const finalScore = (R + F + M) / 3 + boost;

        const tier =
          finalScore >= (th.value_high_percentile ?? 0.8)
            ? "High"
            : finalScore >= (th.value_mid_percentile ?? 0.5)
            ? "Mid"
            : "Low";

        return {
          user_id: null,
          user_group_id: f.user_group_id,
          value_tier: tier,
        };
      });

      // Update segments with value tiers
      for (const upd of valueUpdates) {
        await sb
          .from("segments")
          .update({ value_tier: upd.value_tier })
          .eq("user_group_id", upd.user_group_id);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        batch: {
          processed: processedWithBookings,
          skipped: skippedNoBookings,
          offset: batchOffset,
          total: totalCustomers,
          hasMore,
          nextOffset,
          progress: progressPercent
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Segment computation failed:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
