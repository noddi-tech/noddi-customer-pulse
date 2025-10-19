import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useSyncNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-noddi-data");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Sync complete! Fetched ${data.userGroupsFetched || 0} user groups, ${data.membersFetched || data.usersFetched || 0} members, and ${data.bookingsFetched} bookings`
      );
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["segment-counts"] });
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
    },
  });
}

export function useComputeSegments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-segments");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Computed segments for ${data.users} customers`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["segment-counts"] });
      queryClient.invalidateQueries({ queryKey: ["customer"] });
    },
    onError: (error) => {
      toast.error(`Segment computation failed: ${error.message}`);
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "test-noddi-connection"
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success("Connection successful!");
      } else {
        toast.error(`Connection failed (status: ${data.status})`);
      }
    },
    onError: (error) => {
      toast.error(`Connection test failed: ${error.message}`);
    },
  });
}

export function useResetDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("reset-database", {
        body: { confirm: "DELETE" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const deletedCount = data.total_deleted || 0;
      toast.success(
        `Database reset complete! Deleted ${deletedCount.toLocaleString()} total records. Ready for fresh sync.`
      );
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["database-counts"] });
      queryClient.invalidateQueries({ queryKey: ["segment-counts"] });
    },
    onError: (error) => {
      toast.error(`Database reset failed: ${error.message}`);
    },
  });
}
