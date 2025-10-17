import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDatabaseCounts() {
  return useQuery({
    queryKey: ['database-counts'],
    queryFn: async () => {
      const [customers, bookings, bookingsWithUser, orderLines] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).not('user_id', 'is', null),
        supabase.from('order_lines').select('id', { count: 'exact', head: true }),
      ]);
      
      return {
        customers: customers.count || 0,
        bookings: bookings.count || 0,
        bookings_with_user: bookingsWithUser.count || 0,
        order_lines: orderLines.count || 0,
      };
    },
    refetchInterval: 5000, // Refresh every 5 seconds during sync
  });
}
