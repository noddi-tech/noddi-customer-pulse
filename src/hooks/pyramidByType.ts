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
      // Use server-side aggregation - bypasses PostgREST row limits!
      const { data, error } = await supabase.rpc('get_pyramid_by_customer_type');

      if (error) throw error;

      const b2cCounts = { Champion: 0, Loyalist: 0, Engaged: 0, Prospect: 0 };
      const b2bCounts = { Champion: 0, Loyalist: 0, Engaged: 0, Prospect: 0 };
      let b2cTotal = 0;
      let b2bTotal = 0;

      data?.forEach((row: any) => {
        const isB2B = row.customer_segment === 'B2B';
        
        if (isB2B) {
          b2bCounts.Champion = Number(row.champion_count);
          b2bCounts.Loyalist = Number(row.loyalist_count);
          b2bCounts.Engaged = Number(row.engaged_count);
          b2bCounts.Prospect = Number(row.prospect_count);
          b2bTotal = Number(row.total_count);
        } else {
          b2cCounts.Champion = Number(row.champion_count);
          b2cCounts.Loyalist = Number(row.loyalist_count);
          b2cCounts.Engaged = Number(row.engaged_count);
          b2cCounts.Prospect = Number(row.prospect_count);
          b2cTotal = Number(row.total_count);
        }
      });

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
