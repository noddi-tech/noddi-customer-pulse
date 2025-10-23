import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    mutationFn: async ({ 
      onProgress,
      useOrchestration = true
    }: { 
      onProgress?: (progress: number, processed: number, total: number) => void;
      useOrchestration?: boolean;
    } = {}) => {
      // Use the unified orchestration function by default for simplicity
      if (useOrchestration) {
        console.log('[FRONTEND] 🚀 Using orchestration function for complete analysis...');
        const { data, error } = await supabase.functions.invoke("orchestrate-analysis");
        
        if (error) throw error;
        if (!data.success) {
          throw new Error(data.error || "Analysis pipeline failed");
        }
        
        return data;
      }
      
      // Legacy batch processing (kept for backwards compatibility / debugging)
      let offset = 0;
      const batchSize = 100;
      let totalProcessed = 0;
      let totalCustomers = 0;
      let batchCount = 0;
      const MAX_BATCHES = 120; // Prevent infinite loop (120 batches * 100 = 12,000 max customers)
      
      // Step 1: Clear old segments and features before recomputation
      console.log('[FRONTEND] 🗑️ Clearing old segments and features...');
      const { data: clearData, error: clearError } = await supabase.functions.invoke('clear-segments');
      
      if (clearError) {
        throw new Error(`Failed to clear data: ${clearError.message}`);
      }
      
      console.log('[FRONTEND] ✓ Old data cleared:', clearData);
      
      // Step 2: Start compute-segments batching loop
      console.log('[FRONTEND] 🚀 Starting compute-segments batching loop');
      
      while (batchCount < MAX_BATCHES) {
        batchCount++;
        console.log(`[FRONTEND] 📦 Batch ${batchCount}/${MAX_BATCHES}: Calling edge function with offset=${offset}, batchSize=${batchSize}`);
        
        try {
          // Call edge function with query parameters
          const response = await fetch(
            `https://wylrkmtpjodunmnwncej.supabase.co/functions/v1/compute-segments?offset=${offset}&batch_size=${batchSize}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bHJrbXRwam9kdW5tbnduY2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzA1ODAsImV4cCI6MjA3NjIwNjU4MH0.L0tBvJ5tCfKiclLo6q35TIC8gOrxUiQ2tVmk5V2RQpo`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log(`[FRONTEND] 📡 Batch ${batchCount}: Response status=${response.status}, ok=${response.ok}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[FRONTEND] ❌ Batch ${batchCount}: Response failed:`, errorText);
            throw new Error(`Batch processing failed: ${errorText}`);
          }
          
          const data = await response.json();
          console.log(`[FRONTEND] 📊 Batch ${batchCount}: Received data:`, JSON.stringify(data, null, 2));
          
          totalProcessed += data.batch.processed;
          totalCustomers = data.batch.total;
          
          console.log(`[FRONTEND] 📈 Batch ${batchCount}: totalProcessed=${totalProcessed}, totalCustomers=${totalCustomers}, hasMore=${data.batch.hasMore}`);
          
          onProgress?.(data.batch.progress, totalProcessed, totalCustomers);
          
          if (!data.batch.hasMore) {
            console.log(`[FRONTEND] ✅ Segment batches complete! Processed ${batchCount} batches, ${totalProcessed} customers total`);
            
            // Step 3: Compute value tiers in separate function
            console.log('[FRONTEND] 🎯 Starting value tier computation...');
            onProgress?.(95, totalProcessed, totalCustomers); // Show 95% while computing value tiers
            
            const valueTierResponse = await fetch(
              `https://wylrkmtpjodunmnwncej.supabase.co/functions/v1/compute-value-tiers`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bHJrbXRwam9kdW5tbnduY2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzA1ODAsImV4cCI6MjA3NjIwNjU4MH0.L0tBvJ5tCfKiclLo6q35TIC8gOrxUiQ2tVmk5V2RQpo`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            if (!valueTierResponse.ok) {
              const errorText = await valueTierResponse.text();
              console.error('[FRONTEND] ❌ Value tier computation failed:', errorText);
              throw new Error(`Value tier computation failed: ${errorText}`);
            }
            
            const valueTierData = await valueTierResponse.json();
            console.log('[FRONTEND] ✅ Value tier computation complete:', valueTierData);
            
            // Step 4: Compute pyramid tiers (NEW - Phase 2)
            console.log('[FRONTEND] 🏔️ Starting pyramid tier computation...');
            onProgress?.(97, totalProcessed, totalCustomers); // Show 97% while computing pyramid tiers
            
            const pyramidTierResponse = await fetch(
              `https://wylrkmtpjodunmnwncej.supabase.co/functions/v1/compute-pyramid-tiers`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bHJrbXRwam9kdW5tbnduY2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzA1ODAsImV4cCI6MjA3NjIwNjU4MH0.L0tBvJ5tCfKiclLo6q35TIC8gOrxUiQ2tVmk5V2RQpo`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            if (!pyramidTierResponse.ok) {
              const errorText = await pyramidTierResponse.text();
              console.error('[FRONTEND] ❌ Pyramid tier computation failed:', errorText);
              throw new Error(`Pyramid tier computation failed: ${errorText}`);
            }
            
            const pyramidTierData = await pyramidTierResponse.json();
            console.log('[FRONTEND] ✅ Pyramid tier computation complete:', pyramidTierData);
            
            onProgress?.(100, totalProcessed, totalCustomers);
            
            return { 
              users: totalProcessed, 
              total: totalCustomers,
              valueTiers: valueTierData.updated,
              distribution: valueTierData.distribution,
              pyramidTiers: pyramidTierData.total_tiered,
              pyramidDormant: pyramidTierData.total_dormant
            };
          }
          
          offset = data.batch.nextOffset;
          console.log(`[FRONTEND] ⏭️  Batch ${batchCount}: Continuing to next batch with offset=${offset}`);
          
        } catch (error) {
          console.error(`[FRONTEND] 💥 Batch ${batchCount}: Error during processing:`, error);
          throw error;
        }
      }
      
      // If we hit MAX_BATCHES, throw error with diagnostic info
      throw new Error(`Exceeded maximum batch count (${MAX_BATCHES}). Last offset: ${offset}, total processed: ${totalProcessed}/${totalCustomers}. This indicates a batching loop issue in the edge function.`);
    },
    onSuccess: (data) => {
      // Check if using orchestration or legacy batch processing
      if (data?.steps) {
        // Orchestration response
        const successSteps = data.steps.filter((s: any) => s.success).length;
        toast.success(
          `Analysis complete! Successfully ran ${successSteps}/3 steps in ${data.totalDuration}s`
        );
      } else {
        // Legacy response
        toast.success(`Computed segments for ${data.users} customers`);
      }
      
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["segment-counts"] });
      queryClient.invalidateQueries({ queryKey: ["customer"] });
      queryClient.invalidateQueries({ queryKey: ["pyramid-tier-distribution"] });
      queryClient.invalidateQueries({ queryKey: ["pyramid-tier-counts"] });
      queryClient.invalidateQueries({ queryKey: ["dormant-counts"] });
      queryClient.invalidateQueries({ queryKey: ["customer-segment-counts"] });
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

export function useResetOrderLines() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("reset-order-lines");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Order lines cleared! Auto-sync will re-extract in ~2 minutes.");
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["database-counts"] });
    },
    onError: (error) => {
      toast.error(`Order lines reset failed: ${error.message}`);
    },
  });
}

export function useForceFullSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ resource, trigger_sync }: { resource: string; trigger_sync: boolean }) => {
      const { data, error } = await supabase.functions.invoke("force-full-sync", {
        body: { resource, trigger_sync },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Full sync initiated for ${data.resource}. Estimated time: ${data.estimated_time_minutes} minutes.`
      );
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["sync-diagnostics"] });
    },
    onError: (error) => {
      toast.error(`Force full sync failed: ${error.message}`);
    },
  });
}

export function useSyncDiagnostics() {
  return useQuery({
    queryKey: ["sync-diagnostics"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-diagnostics");
      if (error) {
        // Check if it's a deployment issue (404 or fetch failed)
        const errorMessage = error.message?.toLowerCase() || '';
        const isDeploymentIssue = 
          errorMessage.includes('404') || 
          errorMessage.includes('not found') ||
          errorMessage.includes('failed to fetch') ||
          errorMessage.includes('functionnotfounderror');
        
        throw { 
          message: error.message, 
          isDeploymentIssue 
        };
      }
      return data;
    },
    retry: 3, // Retry 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
    refetchInterval: 30000, // Refresh every 30 seconds once working
    staleTime: 20000,
  });
}
