import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDatabaseCounts() {
  return useQuery({
    queryKey: ['database-counts'],
    queryFn: async () => {
      // Query both total and active counts using the business logic views
      const [
        customersTotal,
        customersActive,
        bookingsTotal,
        bookingsActive,
        bookingsWithUser,
        orderLinesTotal,
        orderLinesActive,
        syncHealth
      ] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('active_customers').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }),
        supabase.from('active_bookings').select('id', { count: 'exact', head: true }),
        supabase.from('active_bookings').select('id', { count: 'exact', head: true }).not('user_id', 'is', null),
        supabase.from('order_lines').select('id', { count: 'exact', head: true }),
        supabase.from('active_order_lines').select('id', { count: 'exact', head: true }),
        supabase.from('settings').select('value').eq('key', 'sync_health').maybeSingle()
      ]);
      
      const bookingsTotalCount = bookingsTotal.count || 0;
      const bookingsActiveCount = bookingsActive.count || 0;
      const orderLinesTotalCount = orderLinesTotal.count || 0;
      const orderLinesActiveCount = orderLinesActive.count || 0;
      const avgLinesPerBooking = bookingsActiveCount > 0 ? orderLinesActiveCount / bookingsActiveCount : 0;
      const health = syncHealth?.data?.value as any;
      
      return {
        // Total counts (all data imported)
        customers_total: customersTotal.count || 0,
        bookings_total: bookingsTotalCount,
        order_lines_total: orderLinesTotalCount,
        
        // Active counts (business logic filtered)
        customers: customersActive.count || 0,
        bookings: bookingsActiveCount,
        bookings_with_user: bookingsWithUser.count || 0,
        order_lines: orderLinesActiveCount,
        avg_lines_per_booking: avgLinesPerBooking,
        
        // Health metrics
        orphaned_bookings: health?.orphaned_bookings || 0,
        failed_order_lines: health?.failed_order_lines || 0,
        last_health_check: health?.synced_at || null
      };
    },
    refetchInterval: 5000, // Refresh every 5 seconds during sync
  });
}
