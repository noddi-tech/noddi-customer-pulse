import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PyramidByType = {
  customer_type: 'B2C' | 'B2B';
  Champion: number;
  Loyalist: number;
  Engaged: number;
  Prospect: number;
  total: number;
};

export function usePyramidByCustomerType() {
  return useQuery({
    queryKey: ["pyramid-by-customer-type"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("segments")
        .select(`
          pyramid_tier_name,
          user_groups!inner(org_id)
        `)
        .not("pyramid_tier_name", "is", null);

      if (error) throw error;

      // Separate B2C and B2B counts
      const b2cCounts = { Champion: 0, Loyalist: 0, Engaged: 0, Prospect: 0 };
      const b2bCounts = { Champion: 0, Loyalist: 0, Engaged: 0, Prospect: 0 };

      data?.forEach((record: any) => {
        const isB2B = record.user_groups.org_id !== null;
        const tierName = record.pyramid_tier_name as keyof typeof b2cCounts;
        
        if (tierName && (tierName in b2cCounts)) {
          if (isB2B) {
            b2bCounts[tierName]++;
          } else {
            b2cCounts[tierName]++;
          }
        }
      });

      const b2cTotal = Object.values(b2cCounts).reduce((sum, count) => sum + count, 0);
      const b2bTotal = Object.values(b2bCounts).reduce((sum, count) => sum + count, 0);

      return {
        b2c: {
          customer_type: 'B2C' as const,
          ...b2cCounts,
          total: b2cTotal,
        },
        b2b: {
          customer_type: 'B2B' as const,
          ...b2bCounts,
          total: b2bTotal,
        },
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
}
