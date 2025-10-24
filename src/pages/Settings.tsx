import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "@/hooks/segmentation";
import { useSyncNow, useComputeSegments, useTestConnection, useResetDatabase, useResetOrderLines, useForceFullSync, useSyncDiagnostics } from "@/hooks/edgeFunctions";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSyncStatus } from "@/hooks/segmentation";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { RefreshCw, Lightbulb, TrendingUp, ArrowRight } from "lucide-react";
import { useDatabaseCounts } from "@/hooks/useDatabaseCounts";
import { useInterval } from "@/hooks/useInterval";
import { SyncErrorAlert } from "@/components/settings/SyncErrorAlert";
import { PyramidTestPanel } from "@/components/settings/PyramidTestPanel";
import { ConfirmationDialog } from "@/components/settings/ConfirmationDialog";
import { ConsolidatedSyncStatusCard } from "@/components/settings/ConsolidatedSyncStatusCard";
import { ConsolidatedAnalysisPipelineCard } from "@/components/settings/ConsolidatedAnalysisPipelineCard";
import { SyncHistoryCard } from "@/components/settings/SyncHistoryCard";
import { AutoSyncStatusCard } from "@/components/settings/AutoSyncStatusCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertCircle, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: thresholds, refetch } = useSettings();
  const { data: syncStatus, refetch: refetchSyncStatus } = useSyncStatus();
  const { data: dbCounts, refetch: refetchDbCounts } = useDatabaseCounts();
  const syncMutation = useSyncNow();
  const computeMutation = useComputeSegments();
  const testMutation = useTestConnection();
  const resetDatabaseMutation = useResetDatabase();
  const resetOrderLinesMutation = useResetOrderLines();
  const forceFullSyncMutation = useForceFullSync();
  const { data: syncDiagnostics } = useSyncDiagnostics();
  const queryClient = useQueryClient();
  
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isReExtractDialogOpen, setIsReExtractDialogOpen] = useState(false);
  const [isRecomputeDialogOpen, setIsRecomputeDialogOpen] = useState(false);
  
  // Get active tab from URL params or default to "thresholds"
  const activeTab = searchParams.get("tab") || "thresholds";
  
  // Track compute-specific state
  const [isComputingSegments, setIsComputingSegments] = useState(false);
  const [lastComputeTime, setLastComputeTime] = useState<Date | null>(null);
  const [activePhaseRef, setActivePhaseRef] = useState<HTMLDivElement | null>(null);

  // Query for segment counts to power status cards
  const { data: segmentCounts } = useQuery({
    queryKey: ["segment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_segment_counts");
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Query for pyramid tier count
  const { data: pyramidCountData } = useQuery({
    queryKey: ["pyramid-tier-total"],
    queryFn: async () => {
      const { count } = await supabase
        .from("segments")
        .select("*", { count: 'exact', head: true })
        .not("pyramid_tier", "is", null);
      return count || 0;
    },
    refetchInterval: 30000,
  });

  // Auto-refresh when sync is running
  const isAnySyncRunning = syncStatus?.some((s) => s.status === "running") ?? false;
  
  useInterval(
    () => {
      refetchSyncStatus();
      refetchDbCounts();
    },
    isAnySyncRunning ? 5000 : 30000 // Poll every 5s when running, 30s when idle
  );

  // Track sync events for timeline
  const [syncEvents, setSyncEvents] = useState<Array<{
    timestamp: Date;
    type: "success" | "error" | "running" | "pending";
    resource: string;
    message: string;
  }>>([]);
  
  // Increase stalled threshold from 5 to 15 minutes
  const STALLED_THRESHOLD_MS = 15 * 60 * 1000;

  useEffect(() => {
    if (syncStatus) {
      const newEvents = syncStatus.map((status) => {
        // Better message for order_lines
        let message = '';
        if (status.resource === 'order_lines') {
          const lines = status.rows_fetched || 0;
          const bookings = status.total_records || 0;
          message = `${status.resource}: ${status.status} - ${lines.toLocaleString()} lines from ${bookings.toLocaleString()} bookings`;
        } else {
          message = `${status.resource}: ${status.status} - ${(status.rows_fetched || 0).toLocaleString()} rows`;
        }
        
        return {
          timestamp: status.last_run_at ? new Date(status.last_run_at) : new Date(),
          type: status.status as any,
          resource: status.resource,
          message,
        };
      });
      setSyncEvents((prev) => {
        const combined = [...newEvents, ...prev];
        const unique = combined.filter((event, index, self) =>
          index === self.findIndex((e) => 
            e.timestamp.getTime() === event.timestamp.getTime() && 
            e.resource === event.resource
          )
        );
        return unique.slice(0, 10);
      });
    }
  }, [syncStatus]);

  const [localThresholds, setLocalThresholds] = useState({
    new_days: 90,
    active_months: 7,
    at_risk_from_months: 7,
    at_risk_to_months: 9,
    winback_days: 60,
    default_margin_pct: 25,
    value_high_percentile: 0.80,
    value_mid_percentile: 0.50,
  });

  // Update local state when data loads
  useState(() => {
    if (thresholds && typeof thresholds === 'object' && !Array.isArray(thresholds)) {
      const th = thresholds as any;
      setLocalThresholds({
        new_days: th.new_days || 90,
        active_months: th.active_months || 7,
        at_risk_from_months: th.at_risk_from_months || 7,
        at_risk_to_months: th.at_risk_to_months || 9,
        winback_days: th.winback_days || 60,
        default_margin_pct: th.default_margin_pct || 25,
        value_high_percentile: th.value_high_percentile || 0.80,
        value_mid_percentile: th.value_mid_percentile || 0.50,
      });
    }
  });

  const handleSaveThresholds = async () => {
    try {
      const { error } = await supabase
        .from("settings")
        .upsert({
          key: "thresholds",
          value: localThresholds,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.success("Thresholds saved successfully");
      refetch();
      
      // Trigger recomputation
      await computeMutation.mutateAsync({});
    } catch (error) {
      toast.error("Failed to save thresholds");
    }
  };

  const handleResetSync = async () => {
    if (!confirm('This will force a complete re-sync of all data from the beginning. Continue?')) return;
    
    try {
      // PART 3 FIX: Reset to full sync mode (epoch watermark ensures all records are fetched)
      const { error } = await supabase.from('sync_state').update({
        sync_mode: 'full',
        max_id_seen: 0,
        current_page: 0,
        rows_fetched: 0,
        high_watermark: '1970-01-01T00:00:00.000Z', // Epoch timestamp
        progress_percentage: 0,
        status: 'pending',
        error_message: null
      }).in('resource', ['customers', 'bookings', 'order_lines']);

      if (error) {
        console.error('Reset sync error:', error);
        toast.error(`Failed to reset sync: ${error.message}`);
        return;
      }
      
      toast.success('Full re-sync initiated! All data will be fetched from scratch. Click "Manual Sync Now" to begin.');
      
      // Immediately invalidate cache to show cleared errors
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      refetchSyncStatus();
    } catch (error: any) {
      console.error('Reset sync exception:', error);
      toast.error(`Failed to reset sync: ${error.message || 'Unknown error'}`);
    }
  };

            const handleReExtractOrderLines = () => {
              setIsReExtractDialogOpen(true);
            };

            const confirmReExtractOrderLines = () => {
              setIsReExtractDialogOpen(false);
              resetOrderLinesMutation.mutate();
            };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure segmentation thresholds and API settings</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })} className="w-full">
        <TabsList>
          <TabsTrigger value="thresholds">Lifecycle Thresholds</TabsTrigger>
          <TabsTrigger value="value">Value Model</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="api">API Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle Thresholds</CardTitle>
              <CardDescription>
                Configure the time windows for customer lifecycle states
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new_days">New Customer Window (days)</Label>
                  <Input
                    id="new_days"
                    type="number"
                    value={localThresholds.new_days}
                    onChange={(e) =>
                      setLocalThresholds({ ...localThresholds, new_days: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="active_months">Active Dekkskift Window (months)</Label>
                  <Input
                    id="active_months"
                    type="number"
                    value={localThresholds.active_months}
                    onChange={(e) =>
                      setLocalThresholds({ ...localThresholds, active_months: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="at_risk_from">At-risk From (months)</Label>
                  <Input
                    id="at_risk_from"
                    type="number"
                    value={localThresholds.at_risk_from_months}
                    onChange={(e) =>
                      setLocalThresholds({ ...localThresholds, at_risk_from_months: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="at_risk_to">At-risk To (months)</Label>
                  <Input
                    id="at_risk_to"
                    type="number"
                    value={localThresholds.at_risk_to_months}
                    onChange={(e) =>
                      setLocalThresholds({ ...localThresholds, at_risk_to_months: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="winback_days">Winback Window (days)</Label>
                  <Input
                    id="winback_days"
                    type="number"
                    value={localThresholds.winback_days}
                    onChange={(e) =>
                      setLocalThresholds({ ...localThresholds, winback_days: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <Button onClick={handleSaveThresholds} disabled={computeMutation.isPending}>
                {computeMutation.isPending ? "Saving & Recomputing..." : "Save & Recompute"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="value" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Value Model</CardTitle>
              <CardDescription>
                Configure value tier percentiles and margin calculations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="high_pct">High Value Percentile</Label>
                  <Input
                    id="high_pct"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={localThresholds.value_high_percentile}
                    onChange={(e) =>
                      setLocalThresholds({ ...localThresholds, value_high_percentile: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">0.80 = 80th percentile</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mid_pct">Mid Value Percentile</Label>
                  <Input
                    id="mid_pct"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={localThresholds.value_mid_percentile}
                    onChange={(e) =>
                      setLocalThresholds({ ...localThresholds, value_mid_percentile: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">0.50 = 50th percentile</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="margin_pct">Default Margin %</Label>
                  <Input
                    id="margin_pct"
                    type="number"
                    value={localThresholds.default_margin_pct}
                    onChange={(e) =>
                      setLocalThresholds({ ...localThresholds, default_margin_pct: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">Used when line-level margins are missing</p>
                </div>
              </div>

              <Button onClick={handleSaveThresholds} disabled={computeMutation.isPending}>
                {computeMutation.isPending ? "Saving & Recomputing..." : "Save & Recompute"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="space-y-4">
          {/* Calculate metrics */}
          {(() => {
            const userGroupsStatus = syncStatus?.find((s) => s.resource === "user_groups");
            const customersStatus = syncStatus?.find((s) => s.resource === "customers");
            const bookingsStatus = syncStatus?.find((s) => s.resource === "bookings");
            const orderLinesStatus = syncStatus?.find((s) => s.resource === "order_lines");
            
            // Use backend-calculated progress percentages (scalable solution)
            const userGroupsProgress = (userGroupsStatus as any)?.progress_percentage || 0;
            const customersProgress = (customersStatus as any)?.progress_percentage || 0;
            const bookingsProgress = (bookingsStatus as any)?.progress_percentage || 0;
            const orderLinesProgress = (orderLinesStatus as any)?.progress_percentage || 0;

            // STEP 7: Fix Order Lines status - must be extracted from ALL bookings
            const expectedOrderLines = dbCounts?.bookings_total || 0;
            const orderLinesActuallyComplete = 
              orderLinesStatus?.status === "completed" && 
              bookingsStatus?.status === "completed" &&
              (dbCounts?.order_lines_total || 0) >= expectedOrderLines * 0.9; // At least 90% coverage

            const isRunning = syncStatus?.some((s) => s.status === "running" || 
              (s.resource === 'order_lines' && s.status === 'pending' && s.sync_mode === 'full' && (s as any).progress_percentage > 0)) ?? false;
            const hasError = syncStatus?.some((s) => s.status === "error") ?? false;
            
            // STEP 3: Fix Phase Completion Logic - only trust actual status='completed'
            const allSyncsComplete = 
              userGroupsStatus?.status === "completed" && 
              customersStatus?.status === "completed" && 
              bookingsStatus?.status === "completed" && 
              orderLinesStatus?.status === "completed";
            
            const isSyncComplete = allSyncsComplete; // Don't use percentage fallback
            
            // STEP 1 & 2: Calculate weighted overall progress + active phase
            const totalExpected = {
              userGroups: userGroupsStatus?.estimated_total || 11266,
              members: customersStatus?.estimated_total || 11052,
              bookings: bookingsStatus?.estimated_total || 21411,
              orderLines: bookingsStatus?.estimated_total || 21411 // 1:1 with bookings
            };

            const totalRecords = totalExpected.userGroups + totalExpected.members + totalExpected.bookings + totalExpected.orderLines;

            const weightedProgress = (
              (userGroupsProgress / 100) * totalExpected.userGroups +
              (customersProgress / 100) * totalExpected.members +
              (bookingsProgress / 100) * totalExpected.bookings +
              (orderLinesProgress / 100) * totalExpected.orderLines
            ) / totalRecords;

            const overallProgress = Math.round(weightedProgress * 100);

            // STEP 2: Determine which phase is actually running
            const activePhase = 
              userGroupsStatus?.status === 'running' ? '0: User Groups' :
              userGroupsStatus?.status !== 'completed' ? '0: User Groups (waiting)' :
              customersStatus?.status === 'running' ? '1: Members' :
              customersStatus?.status !== 'completed' ? '1: Members (waiting)' :
              bookingsStatus?.status === 'running' ? '2: Bookings' :
              bookingsStatus?.status !== 'completed' ? '2: Bookings (waiting)' :
              orderLinesStatus?.status === 'running' ? '3: Order Lines' :
              orderLinesStatus?.status !== 'completed' ? '3: Order Lines (waiting)' :
              'All Complete';
            
            // Determine current step for help panel
            const getCurrentStep = (): 1 | 2 | 3 | 4 => {
              if (!isSyncComplete) return isRunning ? 2 : 1;
              if (lastComputeTime) return 4; // Computed, ready to view
              return 3; // Ready to recompute
            };

            // Estimate time remaining for order lines
            const estimateOrderLinesTime = () => {
              if (expectedOrderLines === 0) return 0;
              const remaining = expectedOrderLines - (dbCounts?.order_lines || 0);
              const rate = 750; // order lines per minute
              return (remaining / rate) * 60; // in seconds
            };

            // PART 5: Fix bookings time estimate to show "per-run" instead of total
            const estimateBookingsTime = () => {
              if (bookingsStatus?.sync_mode !== "full") return null;
              const currentPage = bookingsStatus.current_page || 0;
              const pagesPerRun = 5; // Max pages in 2-min auto-sync window
              const remainingInRun = Math.min(pagesPerRun - (currentPage % pagesPerRun), pagesPerRun);
              const secondsPerPage = 24; // Actual observed: ~24s per page
              return remainingInRun * secondsPerPage;
            };

            // Detect stalled sync (no activity for >15 minutes)
            const isSyncStalled = (status: any) => {
              if (status?.status !== "running") return false;
              if (!status.last_run_at) return false;
              const minutesSinceLastRun = (Date.now() - new Date(status.last_run_at).getTime()) / 60000;
              return minutesSinceLastRun > 15;
            };
            
            const isCustomersStalled = isSyncStalled(customersStatus);
            const isBookingsStalled = isSyncStalled(bookingsStatus);
            const isOrderLinesStalled = isSyncStalled(orderLinesStatus);

            // Determine sync state
            const getSyncState = (): "initial" | "running" | "phase3-running" | "complete" | "computed" | "error" => {
              if (hasError) return "error";
              if (customersProgress === 0 && bookingsProgress === 0) return "initial";
              if (isRunning && (customersProgress < 100 || bookingsProgress < 100)) return "running";
              if (isRunning && customersProgress >= 100 && bookingsProgress >= 100) return "phase3-running";
              if (isSyncComplete && lastComputeTime) return "computed";
              if (isSyncComplete) return "complete";
              return "running";
            };

            const syncState = getSyncState();

            // PHASE 7: Auto-scroll to active phase
            useEffect(() => {
              if (activePhaseRef && isRunning) {
                activePhaseRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, [customersProgress, bookingsProgress, orderLinesProgress, isRunning]);

            // Determine What's Next callout type
            const getWhatsNextType = (): "syncing" | "compute" | "complete" | "initial" | "ready_to_compute" => {
              if (syncState === "initial") return "initial";
              if (syncState === "running" || syncState === "phase3-running") return "syncing";
              if (syncState === "complete" && !lastComputeTime) return "ready_to_compute";
              if (syncState === "complete") return "compute";
              if (syncState === "computed") return "complete";
              return "initial";
            };

            const handleComputeSegments = async () => {
              // Show confirmation dialog first
              setIsRecomputeDialogOpen(true);
            };

            const confirmComputeSegments = async () => {
              setIsRecomputeDialogOpen(false);
              setIsComputingSegments(true);
              const startTime = Date.now();
              
              toast.info('Starting complete analysis pipeline...', {
                id: 'compute-start',
                duration: 2000
              });
              
              try {
                const result = await computeMutation.mutateAsync({
                  onProgress: (progress, processed, total) => {
                    toast.info(`Analyzing: ${processed.toLocaleString()}/${total.toLocaleString()} customers (${progress}%)`, {
                      id: 'compute-progress',
                      duration: 1000
                    });
                  }
                });
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                setLastComputeTime(new Date());
                toast.dismiss('compute-start');
                toast.dismiss('compute-progress');
                
                // Show success message with next steps
                if (result?.totalCustomers && result?.duration !== undefined) {
                  toast.success(
                    `✓ Analysis complete! Processed ${result.totalCustomers.toLocaleString()} customers in ${duration}s`,
                    { duration: 5000 }
                  );
                } else {
                  toast.success(`✓ Processed ${(result.users || 0).toLocaleString()} customers in ${duration}s`);
                }
              } catch (error: any) {
                toast.dismiss('compute-start');
                toast.dismiss('compute-progress');
                toast.error(`Analysis failed: ${error.message}`, { duration: 10000 });
              } finally {
                setIsComputingSegments(false);
              }
            };

            return (
              <>
                {/* Confirmation Dialogs */}
                <ConfirmationDialog
                  open={isRecomputeDialogOpen}
                  onOpenChange={setIsRecomputeDialogOpen}
                  title="Run Complete Analysis?"
                  description="This will recalculate lifecycle stages, value tiers, and pyramid positioning for all customers."
                  variant="default"
                  details={[
                    "Compute lifecycle stages (Active, At-risk, Churned, etc.)",
                    "Calculate value tiers (High, Mid, Low)",
                    "Assign pyramid tier positioning (Champion, Loyalist, Engaged, Prospect)",
                    "Takes approximately 1-2 minutes for 10,000+ customers"
                  ]}
                  actionLabel="Run Analysis"
                  onConfirm={confirmComputeSegments}
                />

                <ConfirmationDialog
                  open={isReExtractDialogOpen}
                  onOpenChange={setIsReExtractDialogOpen}
                  title="Re-extract Order Lines?"
                  description="This will clear all existing order lines and re-extract them from bookings."
                  variant="warning"
                  details={[
                    "Delete all existing order line records",
                    "Re-extract line items from all bookings",
                    "This process takes several minutes",
                    "Order line extraction runs automatically - only use this if you're experiencing data issues"
                  ]}
                  actionLabel="Re-extract"
                  onConfirm={confirmReExtractOrderLines}
                />

                 {/* Error alerts for any failed syncs */}
                {syncStatus?.filter(s => s.error_message).map(status => (
                  <SyncErrorAlert
                    key={status.resource}
                    resource={status.resource}
                    errorMessage={status.error_message!}
                    lastRunAt={status.last_run_at ? new Date(status.last_run_at) : null}
                  />
                ))}

          {/* Auto-Sync Management Card */}
          <AutoSyncStatusCard 
            onManualSync={() => syncMutation.mutate()}
            isSyncing={syncMutation.isPending || isRunning}
          />

          {/* Consolidated Sync Status - Single source of truth for sync progress */}
          <ConsolidatedSyncStatusCard
            customerStatus={userGroupsStatus}
            memberStatus={customersStatus}
            bookingStatus={bookingsStatus}
            orderLineStatus={orderLinesStatus}
            userGroupsTotal={dbCounts?.user_groups_total || 0}
            userGroupsB2B={dbCounts?.user_groups_b2b || 0}
            userGroupsB2C={dbCounts?.user_groups_b2c || 0}
            bookingsTotal={dbCounts?.bookings_total || 0}
            bookingsWithUser={dbCounts?.bookings_with_user || 0}
            orderLinesTotal={dbCounts?.order_lines_total || 0}
            expectedOrderLines={Math.round(expectedOrderLines)}
            isAutoSyncing={isRunning}
          />

          {/* Consolidated Analysis Pipeline - Single source for analysis workflow */}
          <ConsolidatedAnalysisPipelineCard
            syncComplete={isSyncComplete}
            customersInDb={dbCounts?.customers_total || 0}
            segmentsComputed={
              Object.values((segmentCounts as any)?.lifecycle || {})
                .reduce((sum: number, count: any) => sum + (Number(count) || 0), 0) as number
            }
            valueTiersComputed={
              Object.values((segmentCounts as any)?.value_tier || {})
                .reduce((sum: number, count: any) => sum + (Number(count) || 0), 0) as number
            }
            pyramidTiersComputed={pyramidCountData || 0}
            isComputing={isComputingSegments}
            onRunAnalysis={handleComputeSegments}
            onViewDashboard={() => window.location.href = "/"}
            onViewSegments={() => window.location.href = "/segments"}
            computingProgress={0}
            bookingsCount={dbCounts?.bookings_total || 0}
            orderLinesCount={dbCounts?.order_lines_total || 0}
          />

          {/* Sync History & Advanced Actions */}
          <SyncHistoryCard
            events={syncEvents}
            onReExtractOrderLines={handleReExtractOrderLines}
            onForceFullSync={handleResetSync}
            onViewLogs={() => window.open('https://supabase.com/dashboard/project/wylrkmtpjodunmnwncej/functions/sync-noddi-data/logs', '_blank')}
            isLoading={syncMutation.isPending || isRunning}
          />
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <PyramidTestPanel />
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Configuration</CardTitle>
              <CardDescription>
                Noddi API connection settings (managed via Supabase secrets)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>NODDI_API_BASE_URL</Label>
                <p className="text-sm text-muted-foreground">
                  Configured via Supabase secrets (e.g., https://api.noddi.no)
                </p>
              </div>

              <div className="space-y-2">
                <Label>NODDI_API_KEY</Label>
                <p className="text-sm text-muted-foreground">
                  Configured via Supabase secrets (hidden for security)
                </p>
              </div>

              <Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                {testMutation.isPending ? "Testing..." : "Test Connection"}
              </Button>
            </CardContent>
          </Card>
          
          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible actions that permanently delete data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Complete Database Reset</AlertTitle>
                <AlertDescription>
                  This will permanently delete ALL synced data from your database:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>All members ({(dbCounts?.members_total || 0).toLocaleString()})</li>
                    <li>All bookings ({(dbCounts?.bookings_total || 0).toLocaleString()})</li>
                    <li>All order lines ({(dbCounts?.order_lines_total || 0).toLocaleString()})</li>
                    <li>All customers ({(dbCounts?.customers_total || 0).toLocaleString()})</li>
                    <li>All features and segments</li>
                  </ul>
                  <p className="mt-2 font-semibold">You will need to run a full sync afterward to repopulate the database.</p>
                </AlertDescription>
              </Alert>

              <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    disabled={resetDatabaseMutation.isPending}
                    onClick={() => setConfirmDeleteText("")}
                  >
                    {resetDatabaseMutation.isPending ? "Resetting..." : "Complete Database Reset"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p className="font-semibold">This action cannot be undone.</p>
                      <p>
                        This will permanently delete all synced data including:
                      </p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>{(dbCounts?.members_total || 0).toLocaleString()} members</li>
                        <li>{(dbCounts?.bookings_total || 0).toLocaleString()} bookings</li>
                        <li>{(dbCounts?.order_lines_total || 0).toLocaleString()} order lines</li>
                        <li>{(dbCounts?.customers_total || 0).toLocaleString()} customers</li>
                        <li>All features and segments</li>
                      </ul>
                      <p className="mt-4">
                        Type <span className="font-mono font-bold">DELETE</span> to confirm:
                      </p>
                      <Input
                        value={confirmDeleteText}
                        onChange={(e) => setConfirmDeleteText(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="font-mono"
                      />
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmDeleteText("")}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={confirmDeleteText !== "DELETE" || resetDatabaseMutation.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirmDeleteText === "DELETE") {
                          resetDatabaseMutation.mutate();
                          setIsResetDialogOpen(false);
                          setConfirmDeleteText("");
                        }
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {resetDatabaseMutation.isPending ? "Resetting..." : "Confirm Reset"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
