import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCronJobs() {
  return useQuery({
    queryKey: ["cron-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cron_jobs");
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useRecentCronRuns(limit = 5) {
  return useQuery({
    queryKey: ["recent-cron-runs", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_recent_cron_runs", { limit_count: limit });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

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
      // Frontend-controlled batch processing for bulletproof execution
      if (useOrchestration) {
        console.log('[FRONTEND] 🚀 Starting complete analysis pipeline');
        console.log('[FRONTEND] ⚙️ Architecture: Frontend-controlled batch processing');
        
        const startTime = Date.now();
        let offset = 0;
        let batchNumber = 0;
        let totalProcessed = 0;
        let totalCustomers = 0;
        
        try {
          // ============================================
          // STEP 1: Process ALL segment batches (70% of progress)
          // ============================================
          console.log('[FRONTEND] 📦 Step 1/3: Computing lifecycle segments (batched)');
          
          let hasMore = true;
          const MAX_BATCHES = 250; // Safety limit
          const BATCH_SIZE = 150; // Increased for better performance (2x faster)
          const MAX_RETRIES = 3;
          
          while (hasMore && batchNumber < MAX_BATCHES) {
            batchNumber++;
            console.log(`[FRONTEND] 🔄 Processing batch ${batchNumber}...`);
            
            // Retry logic for individual batch
            let retries = 0;
            let batchSuccess = false;
            let batchData: any;
            
            while (retries < MAX_RETRIES && !batchSuccess) {
              try {
                const { data, error } = await supabase.functions.invoke(
                  `compute-segments?offset=${offset}&batch_size=${BATCH_SIZE}`,
                  { body: {} }
                );
                
                if (error) throw error;
                
                batchData = data;
                batchSuccess = true;
                
              } catch (error) {
                retries++;
                console.warn(`[FRONTEND] ⚠️ Batch ${batchNumber} attempt ${retries} failed:`, error);
                
                if (retries >= MAX_RETRIES) {
                  console.error(`[FRONTEND] ❌ Batch ${batchNumber} failed after ${MAX_RETRIES} attempts`);
                  throw error;
                }
                
                // Exponential backoff
                const delayMs = Math.pow(2, retries) * 1000;
                console.log(`[FRONTEND] 🔄 Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
              }
            }
            
            // Update counters
            totalProcessed += batchData.batch.processed;
            totalCustomers = batchData.batch.total;
            hasMore = batchData.batch.hasMore;
            
            // Only override if backend is clearly wrong
            if (batchData.batch.nextOffset > totalCustomers && hasMore) {
              console.log('[FRONTEND] ⚠️ Backend error detected, correcting hasMore');
              hasMore = false;
            }
            
            // Update offset for next iteration
            offset = batchData.batch.nextOffset;
            
            // Calculate progress based on total user_groups checked (0-70% for segment batches)
            const segmentProgress = (offset / totalCustomers) * 70;
            const skippedCount = offset - totalProcessed;
            
            console.log(
              `[FRONTEND] 📊 Batch ${batchNumber}: ` +
              `${totalProcessed.toLocaleString()} with bookings, ` +
              `${skippedCount.toLocaleString()} skipped, ` +
              `${offset.toLocaleString()}/${totalCustomers.toLocaleString()} checked (${Math.round(segmentProgress)}%)`
            );
            
            // Update UI
            onProgress?.(segmentProgress, totalProcessed, totalCustomers);
            
            // Minimal delay to prevent overwhelming the backend
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          
          if (batchNumber >= MAX_BATCHES) {
            throw new Error('Safety limit reached - possible infinite loop');
          }
          
          const skippedTotal = offset - totalProcessed;
          console.log(
            `[FRONTEND] ✅ Step 1 complete: ` +
            `${totalProcessed.toLocaleString()} with bookings, ` +
            `${skippedTotal.toLocaleString()} skipped, ` +
            `${offset.toLocaleString()} total checked in ${batchNumber} batches`
          );
          
          // ============================================
          // STEP 2 & 3: Compute value tiers and pyramid tiers (70-100% progress)
          // ============================================
          console.log('[FRONTEND] 🎯 Step 2/3: Computing value tiers and pyramid tiers');
          onProgress?.(70, totalProcessed, totalCustomers);
          
          const { data: finalData, error: finalError } = await supabase.functions.invoke(
            'orchestrate-analysis'
          );
          
          if (finalError) {
            console.error('[FRONTEND] ❌ Final steps failed:', finalError);
            throw finalError;
          }
          
          console.log('[FRONTEND] ✅ Steps 2 & 3 complete:', finalData);
          onProgress?.(100, totalProcessed, totalCustomers);
          
          // ============================================
          // COMPLETE
          // ============================================
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[FRONTEND] 🎉 Analysis complete in ${duration}s`);
          console.log(
            `[FRONTEND] 📊 Final: ${totalProcessed.toLocaleString()} with bookings, ` +
            `${skippedTotal.toLocaleString()} skipped, ${offset.toLocaleString()} total`
          );
          
          return {
            success: true,
            totalCustomers: totalProcessed,
            totalChecked: offset,
            skipped: skippedTotal,
            batches: batchNumber,
            duration: parseFloat(duration)
          };
          
        } catch (error) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`[FRONTEND] ❌ Analysis failed after ${duration}s:`, error);
          throw error;
        }
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
      // Check response format and show appropriate success message
      if (data?.totalCustomers && data?.duration !== undefined) {
        // New frontend-controlled batch processing format with clear breakdown
        const skipped = data?.skipped || 0;
        const totalChecked = data?.totalChecked || data.totalCustomers;
        toast.success(
          `Analysis complete! ✅\n` +
          `${data.totalCustomers.toLocaleString()} customers with bookings processed\n` +
          `${skipped.toLocaleString()} user groups without bookings skipped\n` +
          `Total: ${totalChecked.toLocaleString()} checked in ${Math.round(data.duration)}s`,
          { duration: 8000 }
        );
      } else {
        // Legacy response
        toast.success(`Computed segments for ${data.users || 0} customers`);
      }
      
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["segment-counts"] });
      queryClient.invalidateQueries({ queryKey: ["customer"] });
      queryClient.invalidateQueries({ queryKey: ["pyramid-tier-distribution"] });
      queryClient.invalidateQueries({ queryKey: ["pyramid-tier-counts"] });
      queryClient.invalidateQueries({ queryKey: ["dormant-counts"] });
      queryClient.invalidateQueries({ queryKey: ["customer-segment-counts"] });
      queryClient.invalidateQueries({ queryKey: ["pyramid-validation"] });
      queryClient.invalidateQueries({ queryKey: ["pyramid-tier-total"] });
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
