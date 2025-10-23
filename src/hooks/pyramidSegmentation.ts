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
      // Get distribution by customer segment
      const { data, error } = await supabase
        .from("segments")
        .select("customer_segment, pyramid_tier, pyramid_tier_name, dormant_segment")
        .not("customer_segment", "is", null)
        .limit(50000);

      if (error) throw error;

      // Group by customer segment
      const segmentMap = new Map<string, PyramidTierDistribution>();
      
      data?.forEach((row) => {
        const segment = row.customer_segment!;
        if (!segmentMap.has(segment)) {
          segmentMap.set(segment, {
            customer_segment: segment,
            total: 0,
            tier1_champion: 0,
            tier2_loyalist: 0,
            tier3_engaged: 0,
            tier4_prospect: 0,
            dormant: 0,
          });
        }
        
        const dist = segmentMap.get(segment)!;
        dist.total++;
        
        if (row.pyramid_tier === 1) dist.tier1_champion++;
        else if (row.pyramid_tier === 2) dist.tier2_loyalist++;
        else if (row.pyramid_tier === 3) dist.tier3_engaged++;
        else if (row.pyramid_tier === 4) dist.tier4_prospect++;
        else if (row.dormant_segment) dist.dormant++;
      });

      return Array.from(segmentMap.values()).sort((a, b) => {
        const order = { 'B2C': 1, 'SMB': 2, 'Large': 3, 'Enterprise': 4 };
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
