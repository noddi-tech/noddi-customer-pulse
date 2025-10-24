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

console.log('[DEPLOY-CHECK] compute-segments v2.1.0 - WITH ROW LIMITS - deployed successfully');

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

// Helper function to determine customer segment (B2C, SMB, Large, Enterprise)
function determineCustomerSegment(userGroupType: string, orgId: number | null, fleetSize: number): string {
  // Use fleet size as primary indicator (most reliable)
  if (fleetSize >= 50) return 'Enterprise';
  if (fleetSize >= 20) return 'Large';
  if (fleetSize >= 2) return 'SMB';
  
  // Fallback: if type is business but fleet=1, classify as SMB
  if (userGroupType === 'organization' || userGroupType === 'group') {
    return 'SMB';
  }
  
  return 'B2C';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse batch parameters from request
    const url = new URL(req.url);
    const batchOffset = parseInt(url.searchParams.get('offset') || '0');
    const batchSize = parseInt(url.searchParams.get('batch_size') || '100');
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
    
    // Fetch existing pyramid tier data for this batch to preserve it
    const { data: existingSegments } = await sb
      .from("segments")
      .select("user_group_id, pyramid_tier, pyramid_tier_name, composite_score, dormant_segment, next_tier_requirements")
      .in("user_group_id", batchUserGroupIds);
    
    const pyramidDataMap = new Map();
    (existingSegments || []).forEach(seg => {
      pyramidDataMap.set(seg.user_group_id, {
        pyramid_tier: seg.pyramid_tier,
        pyramid_tier_name: seg.pyramid_tier_name,
        composite_score: seg.composite_score,
        dormant_segment: seg.dormant_segment,
        next_tier_requirements: seg.next_tier_requirements
      });
    });
    console.log(`[BATCH] Preserved pyramid data for ${pyramidDataMap.size} customers`);
    
    // Fetch user_groups data for customer segmentation
    const { data: userGroupsData } = await sb
      .from("user_groups")
      .select("id, type, org_id")
      .in("id", batchUserGroupIds);
    
    const userGroupMap = new Map(userGroupsData?.map(ug => [ug.id, { type: ug.type || 'personal', org_id: ug.org_id }]) || []);
    
    // Optimize: Fetch ALL bookings for the batch at once (for complete CLV history) - with booking_items for fleet size
    const { data: allBookings } = await sb
      .from("bookings")
      .select("id,user_id,user_group_id,started_at,completed_at,date,status_label,is_fully_paid,is_partially_unable_to_complete,is_fully_unable_to_complete,booking_items")
      .in("user_group_id", batchUserGroupIds)
      .limit(250000);
    
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
      .select("booking_id,description,amount_gross,amount_vat,currency,category,is_discount,created_at")
      .in("booking_id", allBookingIds)
      .limit(400000);
    
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
        
        // SKIP user groups without any bookings - they are not customers yet
        if (!bk || bk.length === 0) {
          skippedNoBookings++;
          if (skippedNoBookings <= 10) {
            console.log(`[NO BOOKINGS] user_group ${userGroupId}: Skipped - no purchase history`);
          }
          continue; // Skip to next user_group
        }
        
        processedWithBookings++;
        const bookings = bk;
        
        // Calculate fleet size for B2B customers (count unique car IDs from booking_items)
        const uniqueCarIds = new Set<number>();
        if (bookings && bookings.length > 0) {
          for (const booking of bookings) {
            if (booking.booking_items && Array.isArray(booking.booking_items)) {
              for (const item of booking.booking_items) {
                if (item?.car?.id) {
                  uniqueCarIds.add(item.car.id);
                }
              }
            }
          }
        }
        const fleetSize = uniqueCarIds.size;
        
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
        
        // Calculate metrics for each interval - now separating tire vs service revenue
        const calcMetrics = (bks: any[]) => {
          const freq = bks.length;
          let tireRev = 0;
          let serviceRev = 0;
          let largestTireOrderInPeriod = 0;
          let tireOrderCount = 0;
          const tireOrdersByBooking = new Map<number, number>();
          
          for (const b of bks) {
            const lines = linesByBooking.get(b.id) ?? [];
            let bookingTireTotal = 0;
            
            for (const l of lines) {
              // Multiply by 0.8 to exclude 25% VAT
              const amount = Number(l.amount_gross || 0) * 0.8;
              
              // Check if this is a tire purchase
              const tireCategories = ['SHOP_TIRE', 'SHOP_TIRE_GENERIC', 'CAR_TIRE'];
              if (tireCategories.includes(l.category)) {
                tireRev += amount;
                bookingTireTotal += amount;
              } else if (!l.is_discount && !l.is_delivery_fee) {
                serviceRev += amount;
              }
            }
            
            // Track per-booking tire order totals
            if (bookingTireTotal > 0) {
              tireOrdersByBooking.set(b.id, bookingTireTotal);
              if (bookingTireTotal > largestTireOrderInPeriod) {
                largestTireOrderInPeriod = bookingTireTotal;
              }
            }
          }
          
          tireOrderCount = tireOrdersByBooking.size;
          const totalRev = tireRev + serviceRev;
          const margin = totalRev * Number(th.default_margin_pct ?? 25) / 100;
          
          return { freq, rev: totalRev, margin, tireRev, serviceRev, largestTireOrder: largestTireOrderInPeriod, tireOrderCount };
        };
        
        const metrics12m = calcMetrics(bookings12m);
        const metrics24m = calcMetrics(bookings24m);
        const metrics36m = calcMetrics(bookings36m);
        const metrics48m = calcMetrics(bookings48m);
        const metricsLifetime = calcMetrics(bookings);
        
        // Determine customer segment (B2C, SMB, Large, Enterprise)
        const userGroup = userGroupMap.get(userGroupId);
        const customerSegment = determineCustomerSegment(
          userGroup?.type || 'personal', 
          userGroup?.org_id || null, 
          fleetSize
        );
        
        // Flag high-value tire purchasers (€8k+ single order)
        const highValueTirePurchaser = metricsLifetime.largestTireOrder >= 8000;
        
        const discountShare = (() => {
          const all = bookings24m.flatMap((b) => linesByBooking.get(b.id) ?? []);
          // Multiply by 0.8 to exclude 25% VAT
          const disc = all.filter((l) => !!l.is_discount).reduce((s, l) => s + (Number(l.amount_gross || 0) * 0.8), 0);
          const gross = all.reduce((s, l) => s + (Number(l.amount_gross || 0) * 0.8), 0);
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
        // Now using actual category field from Noddi API instead of keyword matching!
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
            // Skip discounts (already tracked separately)
            if (line.is_discount) continue;
            
            // Use actual category from Noddi API
            const apiCategory = line.category;
            if (!apiCategory) continue;
            
            // Multiply by 0.8 to exclude 25% VAT
            const amount = Number(line.amount_gross || 0) * 0.8;
            
            // Map Noddi API categories to our service category buckets
            let mappedCategory = null;
            if (apiCategory === 'WHEEL_CHANGE') {
              mappedCategory = 'WHEEL_CHANGE';
            } else if (apiCategory === 'WHEEL_STORAGE') {
              mappedCategory = 'WHEEL_STORAGE';
            } else if (apiCategory === 'CAR_WASH') {
              mappedCategory = 'CAR_WASH';
            } else if (apiCategory === 'CAR_REPAIR') {
              mappedCategory = 'CAR_REPAIR';
            } else if (apiCategory === 'SHOP_TIRE') {
              mappedCategory = 'SHOP_TIRE';
            }
            
            if (mappedCategory && categoryMetrics[mappedCategory]) {
              categoryMetrics[mappedCategory].frequency_24m++;
              categoryMetrics[mappedCategory].revenue_24m += amount;
              categoryMetrics[mappedCategory].margin_24m += amount * (Number(th.default_margin_pct ?? 25) / 100);
              
              // Track most recent booking for this category
              if (!categoryMetrics[mappedCategory].last_booking_at || 
                  bookingDate > categoryMetrics[mappedCategory].last_booking_at!) {
                categoryMetrics[mappedCategory].last_booking_at = bookingDate;
                categoryMetrics[mappedCategory].recency_days = bookingAge;
              }
            }
          }
        }

        // Extract service tags from all bookings (for backward compatibility in features table)
        const allTags = [
          ...new Set(bookings.flatMap((b) => {
            const lines = linesByBooking.get(b.id) ?? [];
            return lines.map((l) => l.category).filter(Boolean);
          }))
        ];

        // Detect Dekkskift & last_dekkskift_at using category field
        const lastDekkskiftAt = (() => {
          let latest: Date | null = null;
          for (const b of bookings) {
            const lines = linesByBooking.get(b.id) ?? [];
            if (lines.some((l) => l.category === 'WHEEL_CHANGE')) {
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
        
        // Calculate lifecycle - using recencyDays for precision to align with churn timeline
        const daysSinceLastBooking = recencyDays ?? Infinity;
        const daysSinceFirstBooking = firstBookingAt 
          ? (now.getTime() - firstBookingAt.getTime()) / 86400000 
          : Infinity;
        
        let lifecycle = "Churned";
        
        // NEW: Detect Winback customers first (highest priority for re-engagement)
        // Winback = customers who were churned (270+ days gap between bookings) but recently returned
        const isWinback = (() => {
          if (metricsLifetime.freq < 2) return false; // Need 2+ bookings to winback
          if (daysSinceLastBooking > (th.winback_days ?? 60)) return false; // Must have booked recently
          
          // Check if previous booking gap was ≥270 days (churned threshold)
          const sortedBookings = bookings
            .map(b => {
              const t = b.started_at 
                ? new Date(b.started_at) 
                : b.date 
                  ? new Date(b.date) 
                  : b.completed_at 
                    ? new Date(b.completed_at) 
                    : null;
              return t;
            })
            .filter((t): t is Date => t !== null)
            .sort((a, b) => b.getTime() - a.getTime());
          
          // Need at least 2 bookings to calculate gap
          if (sortedBookings.length < 2) return false;
          
          // Calculate gap between most recent and second-most recent booking
          const mostRecent = sortedBookings[0];
          const secondMostRecent = sortedBookings[1];
          const gapDays = (mostRecent.getTime() - secondMostRecent.getTime()) / 86400000;
          
          // If gap was ≥270 days (churned threshold), this is a winback
          return gapDays >= 270;
        })();
        
        // Lifecycle based on booking activity (all customers now have bookings)
        // Thresholds: Active ≤213 days (7 months), At-risk 213-269 days, Churned ≥270 days (9 months)
        if (isWinback) {
          lifecycle = "Winback";  // Previously churned, now returned 🎉
        } else if (daysSinceFirstBooking <= (th.new_days ?? 90)) {
          lifecycle = "New";
        } else if (storageActive) {
          lifecycle = "Active";  // Storage customers = recurring relationship
        } else if (daysSinceLastBooking <= 213) {  // 7 months = 213 days
          lifecycle = "Active";  // Recent booking activity
        } else if (daysSinceLastBooking > 213 && daysSinceLastBooking < 270) {  // 213-269 days
          lifecycle = "At-risk";  // Inactive 7-9 months
        } else {
          lifecycle = "Churned";  // 270+ days inactive (aligns with churn timeline)
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
          
          // NEW FIELDS - Tire vs Service revenue split
          tire_revenue_24m: metrics24m.tireRev,
          service_revenue_24m: metrics24m.serviceRev,
          tire_revenue_lifetime: metricsLifetime.tireRev,
          service_revenue_lifetime: metricsLifetime.serviceRev,
          largest_tire_order: metricsLifetime.largestTireOrder,
          tire_order_count_24m: metrics24m.tireOrderCount,
          fleet_size: fleetSize,
          
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
          value_tier: null, // Will be calculated by compute_value_tiers
          tags: allTags,
          updated_at: new Date().toISOString(),
          
          // NEW FIELDS - Customer segmentation (Phase 2)
          customer_segment: customerSegment,
          high_value_tire_purchaser: highValueTirePurchaser,
          fleet_size: fleetSize,
          // Preserve existing pyramid tier data (calculated by compute_pyramid_tiers_v3)
          pyramid_tier: pyramidDataMap.get(userGroupId)?.pyramid_tier ?? null,
          pyramid_tier_name: pyramidDataMap.get(userGroupId)?.pyramid_tier_name ?? null,
          composite_score: pyramidDataMap.get(userGroupId)?.composite_score ?? null,
          dormant_segment: pyramidDataMap.get(userGroupId)?.dormant_segment ?? null,
          next_tier_requirements: pyramidDataMap.get(userGroupId)?.next_tier_requirements ?? null
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

    console.log(`[BATCH STATS] Customers with bookings: ${processedWithBookings}, User groups without bookings (skipped): ${skippedNoBookings}, Total user_groups in batch: ${batchProcessed}\n`);
    
    // CRITICAL: Use nextOffset to check if there are more customers remaining
    const nextOffset = batchOffset + batchSize;
    const hasMore = nextOffset < totalCustomers;
    const progressPercent = Math.round((nextOffset / totalCustomers) * 100);

    console.log(`[BATCH STATS] Processed: ${processedWithBookings}, Skipped (no bookings): ${skippedNoBookings}, Total in batch: ${batchUserGroupIds.length}`);

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
