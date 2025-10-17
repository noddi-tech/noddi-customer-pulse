import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDatabaseCounts() {
  return useQuery({
    queryKey: ['database-counts'],
    queryFn: async () => {
      // PHASE 3: Add enhanced order lines metrics
      const [customers, bookings, bookingsWithUser, orderLines, syncHealth] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).not('user_id', 'is', null),
        supabase.from('order_lines').select('id', { count: 'exact', head: true }),
        supabase.from('settings').select('value').eq('key', 'sync_health').maybeSingle()
      ]);
      
      const bookingsCount = bookings.count || 0;
      const orderLinesCount = orderLines.count || 0;
      const avgLinesPerBooking = bookingsCount > 0 ? orderLinesCount / bookingsCount : 0;
      const health = syncHealth?.data?.value as any;
      
      return {
        customers: customers.count || 0,
        bookings: bookingsCount,
        bookings_with_user: bookingsWithUser.count || 0,
        order_lines: orderLinesCount,
        avg_lines_per_booking: avgLinesPerBooking,
        orphaned_bookings: health?.orphaned_bookings || 0,
        failed_order_lines: health?.failed_order_lines || 0,
        last_health_check: health?.synced_at || null
      };
    },
    refetchInterval: 5000, // Refresh every 5 seconds during sync
  });
}
