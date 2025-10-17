import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDatabaseCounts() {
  return useQuery({
    queryKey: ['database-counts'],
    queryFn: async () => {
      const [customers, bookings] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true })
      ]);
      
      return {
        customers: customers.count || 0,
        bookings: bookings.count || 0
      };
    },
    refetchInterval: 5000, // Refresh every 5 seconds during sync
  });
}
