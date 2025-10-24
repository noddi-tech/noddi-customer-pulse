import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ValidationResult {
  check: string;
  status: "pass" | "warning" | "fail";
  message: string;
  details?: any;
}

export interface PyramidValidation {
  overall_status: "pass" | "warning" | "fail";
  checks: ValidationResult[];
  summary: {
    total_customers: number;
    customers_with_segments: number;
    customers_with_pyramid: number;
    customers_with_features: number;
    coverage_percentage: number;
  };
}

export function usePyramidValidation() {
  return useQuery({
    queryKey: ["pyramid-validation"],
    queryFn: async (): Promise<PyramidValidation> => {
      const checks: ValidationResult[] = [];

      // Check 1: Verify all customers have features calculated
      // Count only customers with bookings (segments table = active customers)
      const { count: totalCustomers } = await supabase
        .from("segments")
        .select("*", { count: "exact", head: true });

      const { count: customersWithFeatures } = await supabase
        .from("features")
        .select("*", { count: "exact", head: true });

      const featureCoverage = totalCustomers ? (customersWithFeatures || 0) / totalCustomers * 100 : 0;
      
      checks.push({
        check: "Feature Coverage",
        status: featureCoverage >= 95 ? "pass" : featureCoverage >= 80 ? "warning" : "fail",
        message: `${customersWithFeatures}/${totalCustomers} customers have features (${featureCoverage.toFixed(1)}%)`,
        details: { customersWithFeatures, totalCustomers, coverage: featureCoverage }
      });

      // Check 2: Verify customer segments are assigned
      const { data: segmentData } = await supabase
        .from("segments")
        .select("customer_segment")
        .not("customer_segment", "is", null);

      const customersWithSegment = segmentData?.length || 0;
      const segmentCoverage = totalCustomers ? customersWithSegment / totalCustomers * 100 : 0;

      checks.push({
        check: "Customer Segment Assignment",
        status: segmentCoverage >= 90 ? "pass" : segmentCoverage >= 70 ? "warning" : "fail",
        message: `${customersWithSegment}/${totalCustomers} customers have customer_segment assigned (${segmentCoverage.toFixed(1)}%)`,
        details: { customersWithSegment, segmentCoverage }
      });

      // Check 3: Verify pyramid tiers are distributed correctly
      const { data: pyramidData } = await supabase
        .from("segments")
        .select("pyramid_tier, pyramid_tier_name");

      const tieredCustomers = pyramidData?.filter(s => s.pyramid_tier !== null).length || 0;
      const dormantCustomers = pyramidData?.filter(s => s.pyramid_tier === null).length || 0;
      const pyramidCoverage = totalCustomers ? tieredCustomers / totalCustomers * 100 : 0;

      checks.push({
        check: "Pyramid Tier Distribution",
        status: pyramidCoverage >= 50 ? "pass" : pyramidCoverage >= 30 ? "warning" : "fail",
        message: `${tieredCustomers} tiered, ${dormantCustomers} dormant (${pyramidCoverage.toFixed(1)}% of ${totalCustomers} active customers)`,
        details: { tieredCustomers, dormantCustomers, pyramidCoverage }
      });

      // Check 4: Verify tire/service revenue separation
      const { data: revenueData } = await supabase
        .from("features")
        .select("tire_revenue_24m, service_revenue_24m, revenue_24m")
        .limit(100);

      const validRevenueSplit = revenueData?.filter(f => 
        f.tire_revenue_24m !== null && 
        f.service_revenue_24m !== null &&
        Math.abs((f.tire_revenue_24m + f.service_revenue_24m) - f.revenue_24m) < 0.01
      ).length || 0;

      const revenueSplitAccuracy = revenueData ? validRevenueSplit / revenueData.length * 100 : 0;

      checks.push({
        check: "Tire/Service Revenue Split",
        status: revenueSplitAccuracy >= 95 ? "pass" : revenueSplitAccuracy >= 80 ? "warning" : "fail",
        message: `${validRevenueSplit}/${revenueData?.length || 0} sampled records have accurate revenue split (${revenueSplitAccuracy.toFixed(1)}%)`,
        details: { validRevenueSplit, sampleSize: revenueData?.length }
      });

      // Check 5: Verify fleet sizes for B2B
      const { data: b2bData } = await supabase
        .from("segments")
        .select("customer_segment, fleet_size")
        .in("customer_segment", ["SMB", "Large", "Enterprise"]);

      const b2bWithFleetSize = b2bData?.filter(s => s.fleet_size > 0).length || 0;
      const b2bTotal = b2bData?.length || 0;
      const fleetCoverage = b2bTotal ? b2bWithFleetSize / b2bTotal * 100 : 100;

      checks.push({
        check: "B2B Fleet Size Tracking",
        status: fleetCoverage >= 90 ? "pass" : fleetCoverage >= 70 ? "warning" : "fail",
        message: `${b2bWithFleetSize}/${b2bTotal} B2B customers have fleet_size > 0 (${fleetCoverage.toFixed(1)}%)`,
        details: { b2bWithFleetSize, b2bTotal, fleetCoverage }
      });

      // Check 6: Verify composite scores are calculated
      const { data: scoreData } = await supabase
        .from("segments")
        .select("composite_score, pyramid_tier")
        .not("pyramid_tier", "is", null);

      const tieredWithScore = scoreData?.filter(s => s.composite_score !== null).length || 0;
      const tieredTotal = scoreData?.length || 0;
      const scoreCoverage = tieredTotal ? tieredWithScore / tieredTotal * 100 : 0;

      checks.push({
        check: "Composite Score Calculation",
        status: scoreCoverage >= 95 ? "pass" : scoreCoverage >= 80 ? "warning" : "fail",
        message: `${tieredWithScore}/${tieredTotal} tiered customers have composite_score (${scoreCoverage.toFixed(1)}%)`,
        details: { tieredWithScore, tieredTotal, scoreCoverage }
      });

      // Check 7: Verify high-value tire purchaser flagging
      const { data: highValueData } = await supabase
        .from("segments")
        .select("high_value_tire_purchaser")
        .eq("high_value_tire_purchaser", true);

      const highValueCount = highValueData?.length || 0;

      checks.push({
        check: "High-Value Tire Purchasers",
        status: "pass",
        message: `${highValueCount} customers flagged as high-value tire purchasers (€8k+ single order)`,
        details: { highValueCount }
      });

      // Determine overall status
      const failCount = checks.filter(c => c.status === "fail").length;
      const warningCount = checks.filter(c => c.status === "warning").length;
      const overall_status = failCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";

      return {
        overall_status,
        checks,
        summary: {
          total_customers: totalCustomers || 0,
          customers_with_segments: customersWithSegment,
          customers_with_pyramid: tieredCustomers,
          customers_with_features: customersWithFeatures || 0,
          coverage_percentage: Math.round(
            ((customersWithFeatures || 0) / (totalCustomers || 1)) * 100
          ),
        },
      };
    },
    staleTime: 30 * 1000, // 30 seconds (faster cache refresh)
  });
}

export function useSegmentExamples() {
  return useQuery({
    queryKey: ["segment-examples"],
    queryFn: async () => {
      // Get example customers from each segment
      const examples: Record<string, any[]> = {};

      for (const segment of ["B2C", "SMB", "Large", "Enterprise"]) {
        // Fetch segments first
        const { data: segmentData } = await supabase
          .from("segments")
          .select("user_group_id, customer_segment, pyramid_tier, pyramid_tier_name, composite_score, fleet_size, lifecycle, high_value_tire_purchaser")
          .eq("customer_segment", segment)
          .not("pyramid_tier", "is", null)
          .order("composite_score", { ascending: false })
          .limit(5);

        if (segmentData && segmentData.length > 0) {
          // Fetch corresponding features
          const userGroupIds = segmentData.map(s => s.user_group_id);
          const { data: featuresData } = await supabase
            .from("features")
            .select("user_group_id, frequency_24m, revenue_24m, tire_revenue_24m, service_revenue_24m, recency_days")
            .in("user_group_id", userGroupIds);

          // Merge data
          examples[segment] = segmentData.map(seg => ({
            ...seg,
            features: featuresData?.find(f => f.user_group_id === seg.user_group_id) || null
          }));
        } else {
          examples[segment] = [];
        }
      }

      return examples;
    },
    staleTime: 5 * 60 * 1000,
  });
}
