import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LifecycleInsight = {
  lifecycle: string;
  customer_count: number;
  avg_recency_days: number;
  avg_frequency_24m: number;
  avg_revenue_per_booking: number;
  avg_margin_per_booking: number;
};

export type ChurnPeriod = {
  churn_period: string;
  customer_count: number;
  period_order: number;
};

export type ProductLineStats = {
  tire_service_customers: number;
  storage_customers: number;
  fleet_customers: number;
  multi_service_customers: number;
};

export function useLifecycleInsights() {
  return useQuery({
    queryKey: ["lifecycle-insights"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_lifecycle_insights");
      if (error) throw error;
      return (data || []) as LifecycleInsight[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useChurnTimeline() {
  return useQuery({
    queryKey: ["churn-timeline"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_churn_timeline");
      if (error) throw error;
      return (data || []) as ChurnPeriod[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useProductLineStats() {
  return useQuery({
    queryKey: ["product-line-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_line_stats");
      if (error) throw error;
      return data as ProductLineStats;
    },
    staleTime: 5 * 60 * 1000,
  });
}
