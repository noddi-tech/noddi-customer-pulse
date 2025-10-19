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
  user_group_id: number;
  user_group_name: string;
  org_id: number | null;
  customer_type: 'B2C' | 'B2B';
  member_count?: number;
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
  customer_type?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: async () => {
      let query = supabase
        .from("segments")
        .select(`
          user_group_id,
          lifecycle,
          value_tier,
          user_groups!inner(id, name, org_id),
          features!inner(
            last_booking_at,
            revenue_24m,
            margin_24m,
            frequency_24m,
            service_tags_all,
            storage_active,
            discount_share_24m,
            recency_days
          )
        `)
        .order("user_group_id");

      if (params?.lifecycle) {
        query = query.eq("lifecycle", params.lifecycle);
      }

      if (params?.value_tier) {
        query = query.eq("value_tier", params.value_tier);
      }

      if (params?.customer_type === 'B2C') {
        query = query.is("user_groups.org_id", null);
      } else if (params?.customer_type === 'B2B') {
        query = query.not("user_groups.org_id", "is", null);
      }

      if (params?.search) {
        query = query.ilike("user_groups.name", `%${params.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Enrich with member count
      const enriched = await Promise.all(
        (data || []).map(async (record: any) => {
          const { count } = await supabase
            .from("bookings")
            .select("user_id", { count: 'exact', head: true })
            .eq("user_group_id", record.user_group_id);

          return {
            user_group_id: record.user_group_id,
            user_group_name: record.user_groups.name || `Customer ${record.user_group_id}`,
            org_id: record.user_groups.org_id,
            customer_type: record.user_groups.org_id ? 'B2B' as const : 'B2C' as const,
            member_count: count || 0,
            segments: {
              lifecycle: record.lifecycle,
              value_tier: record.value_tier,
              tags: null,
            },
            features: record.features,
          };
        })
      );

      return enriched;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnMount: false,
  });
}

export function useCustomerDetails(userGroupId: number) {
  return useQuery({
    queryKey: ["customer", userGroupId],
    queryFn: async () => {
      const [userGroupData, featuresData, segmentsData] =
        await Promise.all([
          supabase.from("user_groups").select("*").eq("id", userGroupId).maybeSingle(),
          supabase.from("features").select("*").eq("user_group_id", userGroupId).maybeSingle(),
          supabase.from("segments").select("*").eq("user_group_id", userGroupId).maybeSingle(),
        ]);

      // Fetch ALL bookings for this user_group (all members)
      const bookingsData = await supabase
        .from("bookings")
        .select("*")
        .eq("user_group_id", userGroupId)
        .order("started_at", { ascending: false });

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

      // Fetch unique members of this user_group
      const { data: membersData } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email, phone")
        .in("id", [...new Set((bookingsData.data || []).map(b => b.user_id).filter(Boolean))]);

      return {
        userGroup: userGroupData.data,
        customer_type: userGroupData.data?.org_id ? 'B2B' as const : 'B2C' as const,
        bookings: bookingsWithLines,
        features: featuresData.data,
        segments: segmentsData.data,
        members: membersData || [],
      };
    },
    enabled: !!userGroupId,
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
