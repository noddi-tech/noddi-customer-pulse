import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "@/hooks/segmentation";
import { useSyncNow, useComputeSegments, useTestConnection } from "@/hooks/edgeFunctions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSyncStatus } from "@/hooks/segmentation";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Lightbulb, TrendingUp, ArrowRight } from "lucide-react";
import { useDatabaseCounts } from "@/hooks/useDatabaseCounts";
import { useInterval } from "@/hooks/useInterval";
import { SyncStatusCard } from "@/components/settings/SyncStatusCard";
import { SyncProgressBar } from "@/components/settings/SyncProgressBar";
import { SyncMetricsCards } from "@/components/settings/SyncMetricsCards";
import { SyncWorkflowGuide } from "@/components/settings/SyncWorkflowGuide";
import { SyncActionButtons } from "@/components/settings/SyncActionButtons";
import { WhatsNextCallout } from "@/components/settings/WhatsNextCallout";
import { SyncTimeline } from "@/components/settings/SyncTimeline";
import { SyncCompleteAlert } from "@/components/settings/SyncCompleteAlert";
import { SyncErrorAlert } from "@/components/settings/SyncErrorAlert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertCircle, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { data: thresholds, refetch } = useSettings();
  const { data: syncStatus, refetch: refetchSyncStatus } = useSyncStatus();
  const { data: dbCounts, refetch: refetchDbCounts } = useDatabaseCounts();
  const syncMutation = useSyncNow();
  const computeMutation = useComputeSegments();
  const testMutation = useTestConnection();
  const queryClient = useQueryClient();
  
  // Track compute-specific state
  const [isComputingSegments, setIsComputingSegments] = useState(false);
  const [lastComputeTime, setLastComputeTime] = useState<Date | null>(null);
  const [activePhaseRef, setActivePhaseRef] = useState<HTMLDivElement | null>(null);

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
      await computeMutation.mutateAsync();
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
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    } catch (error: any) {
      console.error('Reset sync exception:', error);
      toast.error(`Failed to reset sync: ${error.message || 'Unknown error'}`);
    }
  };

  const handleReExtractOrderLines = async () => {
    try {
      // First, delete all existing order lines
      const { error: deleteError } = await supabase
        .from('order_lines')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (deleteError) {
        console.error('Delete order lines error:', deleteError);
        toast.error(`Failed to clear order lines: ${deleteError.message}`);
        return;
      }
      
      // Then reset sync state to force re-extraction
      const { error } = await supabase.from('sync_state').upsert({
        resource: 'order_lines',
        sync_mode: 'full',
        current_page: 0,
        rows_fetched: 0,
        progress_percentage: 0,
        status: 'pending',
        error_message: null,
        last_run_at: new Date().toISOString(),
      }, { onConflict: 'resource' });

      if (error) {
        console.error('Re-extract order lines error:', error);
        toast.error(`Failed to reset order lines: ${error.message}`);
        return;
      }
      
      toast.success('Order lines cleared! Auto-sync will re-extract in ~2 minutes.');
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["database-counts"] });
    } catch (error: any) {
      console.error('Re-extract exception:', error);
      toast.error(`Failed to reset: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure segmentation thresholds and API settings</p>
      </div>

      <Tabs defaultValue="thresholds" className="w-full">
        <TabsList>
          <TabsTrigger value="thresholds">Lifecycle Thresholds</TabsTrigger>
          <TabsTrigger value="value">Value Model</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
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
            const customersStatus = syncStatus?.find((s) => s.resource === "customers");
            const bookingsStatus = syncStatus?.find((s) => s.resource === "bookings");
            const orderLinesStatus = syncStatus?.find((s) => s.resource === "order_lines");
            
            const customersProgress = customersStatus?.estimated_total && dbCounts?.customers
              ? Math.min(100, (dbCounts.customers / customersStatus.estimated_total) * 100)
              : 0;
            const bookingsProgress = bookingsStatus?.estimated_total && dbCounts?.bookings
              ? Math.min(100, (dbCounts.bookings / bookingsStatus.estimated_total) * 100)
              : 0;

            // Use actual database bookings count for order lines (1:1 minimum ratio)
            const expectedOrderLines = dbCounts?.bookings || 0;
            const orderLinesProgress = expectedOrderLines > 0
              ? Math.min(100, ((dbCounts?.order_lines || 0) / expectedOrderLines) * 100)
              : 0;

            const isRunning = syncStatus?.some((s) => s.status === "running") ?? false;
            const hasError = syncStatus?.some((s) => s.status === "error") ?? false;
            // Consider sync complete if all are "completed" or "success" status, OR if progress is sufficient
            const allSyncsComplete = customersStatus?.status === "completed" && 
                                     bookingsStatus?.status === "completed" && 
                                     (orderLinesStatus?.status === "completed" || orderLinesStatus?.status === "success");
            const isSyncComplete = allSyncsComplete || (customersProgress >= 100 && bookingsProgress >= 100 && orderLinesProgress >= 90);
            
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
              setIsComputingSegments(true);
              const startTime = Date.now();
              try {
                const result = await computeMutation.mutateAsync();
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                setLastComputeTime(new Date());
                toast.success(`Processed ${result.users || 0} customers in ${duration}s`);
              } catch (error: any) {
                toast.error(`Computation failed: ${error.message}`);
              } finally {
                setIsComputingSegments(false);
              }
            };

            return (
              <>
                {/* Error alerts for any failed syncs */}
                {syncStatus?.filter(s => s.error_message).map(status => (
                  <SyncErrorAlert
                    key={status.resource}
                    resource={status.resource}
                    errorMessage={status.error_message!}
                    lastRunAt={status.last_run_at ? new Date(status.last_run_at) : null}
                  />
                ))}

          {/* CONSOLIDATED STATUS - Show once at top */}
          <Card className="mb-6 border-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {(isCustomersStalled || isBookingsStalled || isOrderLinesStalled) ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : isRunning ? (
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                )}
                Sync Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(isCustomersStalled || isBookingsStalled || isOrderLinesStalled) ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>⚠️ Sync Appears Stalled</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      No database updates in {Math.max(
                        isCustomersStalled && customersStatus?.last_run_at ? Math.ceil((Date.now() - new Date(customersStatus.last_run_at).getTime()) / 60000) : 0,
                        isBookingsStalled && bookingsStatus?.last_run_at ? Math.ceil((Date.now() - new Date(bookingsStatus.last_run_at).getTime()) / 60000) : 0,
                        isOrderLinesStalled && orderLinesStatus?.last_run_at ? Math.ceil((Date.now() - new Date(orderLinesStatus.last_run_at).getTime()) / 60000) : 0
                      )} minutes. The sync might need a manual restart.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={async () => {
                        await supabase.functions.invoke('sync-noddi-data');
                        toast.info("Attempting to resume sync...");
                      }}>
                        Resume Sync
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        window.open('https://supabase.com/dashboard/project/wylrkmtpjodunmnwncej/functions/sync-noddi-data/logs', '_blank');
                      }}>
                        View Logs
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : isRunning ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    ✅ Syncing automatically every 2 minutes
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Overall progress: {Math.round((customersProgress + bookingsProgress + orderLinesProgress) / 3)}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You can safely leave this page - sync continues in background.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sync is idle. {syncStatus?.some(s => s.status === 'pending') ? 'Next sync in ~2 minutes.' : 'Enable auto-sync to keep data updated.'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Full Re-Sync Progress - Visual only, no duplicate messages */}
          {bookingsStatus?.sync_mode === "full" && bookingsStatus?.status === "running" && bookingsStatus.estimated_total && (
            <Card className="mb-4 border-blue-500">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Full Re-Sync Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Progress 
                    value={Math.round(((bookingsStatus.rows_fetched || 0) / bookingsStatus.estimated_total) * 100)} 
                    className="h-3"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {bookingsStatus.rows_fetched || 0} of {bookingsStatus.estimated_total} bookings
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {Math.round(((bookingsStatus.rows_fetched || 0) / bookingsStatus.estimated_total) * 100)}%
                      </span>
                      {bookingsStatus.last_run_at && (
                        <span className={cn(
                          "text-[10px]",
                          isBookingsStalled && "text-red-600 dark:text-red-400 font-semibold"
                        )}>
                          Last: {formatDistanceToNow(new Date(bookingsStatus.last_run_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  {estimateBookingsTime() && (
                    <p className="text-xs text-muted-foreground">
                      ~{Math.ceil((estimateBookingsTime() || 0) / 60)} minutes remaining (this run)
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

                <SyncStatusCard
                  customersProgress={customersProgress}
                  bookingsProgress={bookingsProgress}
                  orderLinesProgress={orderLinesProgress}
                  customersTotal={customersStatus?.estimated_total}
                  bookingsTotal={bookingsStatus?.estimated_total}
                  customersInDb={dbCounts?.customers || 0}
                  bookingsInDb={dbCounts?.bookings || 0}
                  orderLinesInDb={dbCounts?.order_lines || 0}
                  expectedOrderLines={Math.round(expectedOrderLines)}
                  isRunning={isRunning}
                  hasError={hasError}
                  isComputingSegments={isComputingSegments}
                  lastComputeTime={lastComputeTime}
                  customersStatus={customersStatus}
                  bookingsStatus={bookingsStatus}
                  orderLinesStatus={orderLinesStatus}
                />

                {/* Show sync complete alert when sync is done but segments not computed */}
                {isSyncComplete && !lastComputeTime && (
                  <SyncCompleteAlert
                    activeCustomers={dbCounts?.customers || 0}
                    activeBookings={dbCounts?.bookings || 0}
                    activeOrderLines={dbCounts?.order_lines || 0}
                  />
                )}

                <WhatsNextCallout type={getWhatsNextType()} />

                <div className="grid md:grid-cols-2 gap-4">
                  <SyncWorkflowGuide
                    customersComplete={customersProgress >= 100}
                    bookingsComplete={bookingsProgress >= 100}
                    orderLinesComplete={orderLinesProgress >= 90}
                    segmentsComputed={!!lastComputeTime}
                    isRunning={isRunning}
                  />
                  <SyncTimeline events={syncEvents} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Sync Progress</CardTitle>
                    <CardDescription>
                      Real-time progress tracking - Auto-refreshes every 5 seconds
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      <div ref={customersProgress < 100 && isRunning ? setActivePhaseRef : null}>
                        <SyncProgressBar
                          resource="customers"
                          progress={customersProgress}
                          total={customersStatus?.estimated_total || dbCounts?.customers}
                          inDb={dbCounts?.customers || 0}
                          status={customersStatus?.status || "pending"}
                          syncMode={customersStatus?.sync_mode}
                          currentPage={customersStatus?.current_page}
                          lastRunAt={customersStatus?.last_run_at ? new Date(customersStatus.last_run_at) : null}
                        />
                      </div>
                      
                      <div ref={bookingsProgress < 100 && customersProgress >= 100 && isRunning ? setActivePhaseRef : null}>
                        <SyncProgressBar
                          resource="bookings"
                          progress={bookingsProgress}
                          total={bookingsStatus?.estimated_total || dbCounts?.bookings}
                          inDb={dbCounts?.bookings || 0}
                          status={bookingsStatus?.status || "pending"}
                          syncMode={bookingsStatus?.sync_mode}
                          currentPage={bookingsStatus?.current_page}
                          lastRunAt={bookingsStatus?.last_run_at ? new Date(bookingsStatus.last_run_at) : null}
                          estimatedTime={bookingsStatus?.sync_mode === "full" ? estimateBookingsTime() : undefined}
                        />
                      </div>

                      <div ref={orderLinesProgress < 90 && bookingsProgress >= 100 && isRunning ? setActivePhaseRef : null}>
                        <SyncProgressBar
                          resource="order_lines"
                          progress={orderLinesProgress}
                          total={Math.round(expectedOrderLines)}
                          inDb={dbCounts?.order_lines || 0}
                          status={orderLinesStatus?.status || "pending"}
                          syncMode={orderLinesStatus?.sync_mode}
                          currentPage={orderLinesStatus?.current_page}
                          lastRunAt={orderLinesStatus?.last_run_at ? new Date(orderLinesStatus.last_run_at) : null}
                          estimatedTime={estimateOrderLinesTime()
                          }
                        />
                      </div>
                    </div>

                    <SyncMetricsCards
                      customersCount={dbCounts?.customers || 0}
                      customersTotal={dbCounts?.customers_total || 0}
                      bookingsCount={dbCounts?.bookings || 0}
                      bookingsTotal={dbCounts?.bookings_total || 0}
                      bookingsWithUser={dbCounts?.bookings_with_user || 0}
                      orderLines={dbCounts?.order_lines || 0}
                      orderLinesTotal={dbCounts?.order_lines_total || 0}
                      expectedOrderLines={Math.round(expectedOrderLines)}
                      lastSync={customersStatus?.last_run_at || null}
                    />

                    <SyncActionButtons
                      syncState={syncState}
                      onSyncNow={() => syncMutation.mutate()}
                      onComputeSegments={handleComputeSegments}
                      onViewDashboard={() => window.location.href = "/"}
                      onResetSync={handleResetSync}
                      onReExtractOrderLines={handleReExtractOrderLines}
                      isSyncing={syncMutation.isPending || isRunning}
                      isComputing={isComputingSegments}
                      phase3Progress={orderLinesProgress}
                      estimatedTime={estimateOrderLinesTime()}
                    />
                  </CardContent>
                </Card>
              </>
            );
          })()}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
