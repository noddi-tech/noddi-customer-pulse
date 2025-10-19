import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SegmentCounts = {
  New?: number;
  Active?: number;
  "At-risk"?: number;
  Churned?: number;
  Winback?: number;
  High?: number;
  Mid?: number;
  Low?: number;
};

export type Customer = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  segments: {
    lifecycle: string | null;
    value_tier: string | null;
    tags: any;
  } | null;
  features: {
    last_booking_at: string | null;
    revenue_24m: number | null;
    margin_24m: number | null;
    frequency_24m: number | null;
    service_tags_all: any;
    storage_active: boolean | null;
    discount_share_24m: number | null;
    recency_days: number | null;
  } | null;
};

export function useSegmentCounts() {
  return useQuery({
    queryKey: ["segment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_segment_counts');
      
      if (error) throw error;
      
      // TypeScript needs explicit casting since RPC returns Json type
      const result = data as { lifecycle?: Record<string, number>; value_tier?: Record<string, number> } | null;
      
      // Transform from { lifecycle: {...}, value_tier: {...} } to flat counts
      const counts: SegmentCounts = {
        ...(result?.lifecycle || {}),
        ...(result?.value_tier || {}),
      };
      
      return counts;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useCustomers(params?: {
  lifecycle?: string;
  value_tier?: string;
  tag?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: async () => {
      // PHASE 2: Fetch ALL customers with pagination
      let allCustomers: Customer[] = [];
      let from = 0;
      const pageSize = 1000;
      
      while (true) {
        let query = supabase
          .from("customers")
          .select(
            `id,
            first_name,
            last_name,
            email,
            segments!inner(lifecycle,value_tier,tags),
            features!inner(last_booking_at,revenue_24m,margin_24m,frequency_24m,service_tags_all,storage_active,discount_share_24m,recency_days)`
          )
          .range(from, from + pageSize - 1)
          .order("id");

        if (params?.lifecycle) {
          query = query.eq("segments.lifecycle", params.lifecycle);
        }

        if (params?.value_tier) {
          query = query.eq("segments.value_tier", params.value_tier);
        }

        if (params?.tag) {
          query = query.contains("features.service_tags_all", [params.tag]);
        }

        if (params?.search) {
          query = query.or(
            `email.ilike.%${params.search}%,first_name.ilike.%${params.search}%,last_name.ilike.%${params.search}%`
          );
        }

        const { data, error } = await query;

        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allCustomers = allCustomers.concat(data as Customer[]);
        
        if (data.length < pageSize) break; // Last page
        from += pageSize;
      }

      return allCustomers;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnMount: false,
  });
}

export function useCustomerDetails(userId: number) {
  return useQuery({
    queryKey: ["customer", userId],
    queryFn: async () => {
      const [customerData, bookingsData, featuresData, segmentsData] =
        await Promise.all([
          supabase.from("customers").select("*").eq("id", userId).maybeSingle(),
          supabase
            .from("bookings")
            .select("*")
            .eq("user_id", userId)
            .order("started_at", { ascending: false }),
          supabase.from("features").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("segments").select("*").eq("user_id", userId).maybeSingle(),
        ]);

      // Fetch order lines for each booking
      const bookingIds = bookingsData.data?.map((b) => b.id) || [];
      const { data: orderLinesData } = await supabase
        .from("order_lines")
        .select("*")
        .in("booking_id", bookingIds);

      // Group order lines by booking_id
      const orderLinesByBooking: Record<number, any[]> = {};
      orderLinesData?.forEach((line) => {
        if (!orderLinesByBooking[line.booking_id]) {
          orderLinesByBooking[line.booking_id] = [];
        }
        orderLinesByBooking[line.booking_id].push(line);
      });

      // Add order lines to bookings
      const bookingsWithLines =
        bookingsData.data?.map((booking) => ({
          ...booking,
          order_lines: orderLinesByBooking[booking.id] || [],
        })) || [];

      return {
        customer: customerData.data,
        bookings: bookingsWithLines,
        features: featuresData.data,
        segments: segmentsData.data,
      };
    },
    enabled: !!userId,
  });
}

export function useSyncStatus() {
  return useQuery({
    queryKey: ["sync-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_state")
        .select("*")
        .order("resource");
      return data || [];
    },
    staleTime: 5 * 1000, // 5 seconds during active sync
    refetchInterval: 5 * 1000, // Poll every 5 seconds to monitor active syncs
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("*")
        .eq("key", "thresholds")
        .maybeSingle();
      return data?.value || {};
    },
    staleTime: 5 * 60 * 1000,
  });
}
