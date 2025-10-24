import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PyramidTierDistribution {
  customer_segment: string;
  total: number;
  tier1_champion: number;
  tier2_loyalist: number;
  tier3_engaged: number;
  tier4_prospect: number;
  dormant: number;
}

export interface PyramidTierCounts {
  Champion: number;
  Loyalist: number;
  Engaged: number;
  Prospect: number;
}

export interface DormantCounts {
  salvageable: number;
  transient: number;
}

export function usePyramidTierDistribution() {
  return useQuery({
    queryKey: ["pyramid-tier-distribution"],
    queryFn: async () => {
      // Use server-side aggregation - bypasses PostgREST row limits!
      const { data, error } = await supabase.rpc('get_pyramid_tier_distribution');

      if (error) throw error;

      // Transform to expected format
      const distribution: PyramidTierDistribution[] = data?.map((row: any) => ({
        customer_segment: row.customer_segment,
        total: Number(row.total),
        tier1_champion: Number(row.tier1_champion),
        tier2_loyalist: Number(row.tier2_loyalist),
        tier3_engaged: Number(row.tier3_engaged),
        tier4_prospect: Number(row.tier4_prospect),
        dormant: Number(row.dormant),
      })) || [];

      // Sort B2C first, then B2B
      return distribution.sort((a, b) => {
        const order = { 'B2C': 1, 'B2B': 2 };
        return (order[a.customer_segment as keyof typeof order] || 99) - 
               (order[b.customer_segment as keyof typeof order] || 99);
      });
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function usePyramidTierCounts() {
  return useQuery({
    queryKey: ["pyramid-tier-counts"],
    queryFn: async () => {
      // Use database aggregation instead of fetching all rows
      const { data, error } = await supabase.rpc('get_pyramid_tier_counts');

      if (error) {
        console.error('Pyramid tier counts error:', error);
        throw error;
      }

      // Transform RPC result into the expected format
      const counts: PyramidTierCounts = {
        Champion: 0,
        Loyalist: 0,
        Engaged: 0,
        Prospect: 0,
      };

      data?.forEach((row: any) => {
        if (row.pyramid_tier_name in counts) {
          counts[row.pyramid_tier_name as keyof PyramidTierCounts] = row.count;
        }
      });

      return counts;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useDormantCounts() {
  return useQuery({
    queryKey: ["dormant-counts"],
    queryFn: async () => {
      // Use database aggregation
      const { data, error } = await supabase.rpc('get_dormant_counts');

      if (error) {
        console.error('Dormant counts error:', error);
        throw error;
      }

      const counts: DormantCounts = {
        salvageable: 0,
        transient: 0,
      };

      data?.forEach((row: any) => {
        if (row.dormant_segment in counts) {
          counts[row.dormant_segment as keyof DormantCounts] = row.count;
        }
      });

      return counts;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useCustomerSegmentCounts() {
  return useQuery({
    queryKey: ["customer-segment-counts"],
    queryFn: async () => {
      // Use database aggregation
      const { data, error } = await supabase.rpc('get_customer_segment_counts');

      if (error) {
        console.error('Customer segment counts error:', error);
        throw error;
      }

      const counts: Record<string, number> = {};

      data?.forEach((row: any) => {
        counts[row.customer_segment] = row.count;
      });

      return counts;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}
