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
import { SyncHelpPanel } from "@/components/settings/SyncHelpPanel";
import { SyncTimeline } from "@/components/settings/SyncTimeline";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";

export default function Settings() {
  const { data: thresholds, refetch } = useSettings();
  const { data: syncStatus, refetch: refetchSyncStatus } = useSyncStatus();
  const { data: dbCounts, refetch: refetchDbCounts } = useDatabaseCounts();
  const syncMutation = useSyncNow();
  const computeMutation = useComputeSegments();
  const testMutation = useTestConnection();
  const queryClient = useQueryClient();

  // Auto-refresh when sync is running
  const isAnySyncRunning = syncStatus?.some((s) => s.status === "running") ?? false;
  
  useInterval(
    () => {
      refetchSyncStatus();
      refetchDbCounts();
    },
    isAnySyncRunning ? 5000 : null // Poll every 5 seconds when running
  );

  // Track sync events for timeline
  const [syncEvents, setSyncEvents] = useState<Array<{
    timestamp: Date;
    type: "success" | "error" | "running" | "pending";
    resource: string;
    message: string;
  }>>([]);

  useEffect(() => {
    if (syncStatus) {
      const newEvents = syncStatus.map((status) => ({
        timestamp: status.last_run_at ? new Date(status.last_run_at) : new Date(),
        type: status.status as any,
        resource: status.resource,
        message: `${status.resource}: ${status.status} - ${status.rows_fetched || 0} rows`,
      }));
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
    if (!confirm('This will force a complete re-sync of all data. Continue?')) return;
    
    try {
      const { error } = await supabase.from('sync_state').update({
        sync_mode: 'initial',
        max_id_seen: 0,
        current_page: 0,
        rows_fetched: 0,
        high_watermark: null,
        progress_percentage: 0,
        status: 'pending',
        error_message: null
      }).in('resource', ['customers', 'bookings']);

      if (error) {
        console.error('Reset sync error:', error);
        toast.error(`Failed to reset sync: ${error.message}`);
        return;
      }
      
      toast.success('Sync reset to initial mode! Click "Manual Sync Now" to start full re-sync.');
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    } catch (error: any) {
      console.error('Reset sync exception:', error);
      toast.error(`Failed to reset sync: ${error.message || 'Unknown error'}`);
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
            
            const customersProgress = customersStatus?.estimated_total && dbCounts?.customers
              ? Math.min(100, (dbCounts.customers / customersStatus.estimated_total) * 100)
              : 0;
            const bookingsProgress = bookingsStatus?.estimated_total && dbCounts?.bookings
              ? Math.min(100, (dbCounts.bookings / bookingsStatus.estimated_total) * 100)
              : 0;

            const isRunning = syncStatus?.some((s) => s.status === "running") ?? false;
            const hasError = syncStatus?.some((s) => s.status === "error") ?? false;
            const isSyncComplete = customersProgress >= 99 && bookingsProgress >= 99;
            
            // Determine current step for help panel
            const getCurrentStep = (): 1 | 2 | 3 | 4 => {
              if (!isSyncComplete) return isRunning ? 2 : 1;
              return 3; // Ready to recompute
            };

            // Estimate time remaining (rough calculation based on bookings)
            const estimateTimeRemaining = () => {
              if (!bookingsStatus?.estimated_total || !dbCounts?.bookings) return 0;
              const remaining = bookingsStatus.estimated_total - dbCounts.bookings;
              const rate = 300; // rows per minute (rough estimate with 300 page limit)
              return (remaining / rate) * 60; // in seconds
            };

            return (
              <>
                <SyncStatusCard
                  customersProgress={customersProgress}
                  bookingsProgress={bookingsProgress}
                  customersTotal={customersStatus?.estimated_total}
                  bookingsTotal={bookingsStatus?.estimated_total}
                  customersInDb={dbCounts?.customers || 0}
                  bookingsInDb={dbCounts?.bookings || 0}
                  isRunning={isRunning}
                  hasError={hasError}
                />

                <div className="grid md:grid-cols-2 gap-4">
                  <SyncHelpPanel currentStep={getCurrentStep()} />
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
                      <SyncProgressBar
                        resource="customers"
                        progress={customersProgress}
                        total={customersStatus?.estimated_total}
                        inDb={dbCounts?.customers || 0}
                        status={customersStatus?.status || "pending"}
                      />
                      
                      <SyncProgressBar
                        resource="bookings"
                        progress={bookingsProgress}
                        total={bookingsStatus?.estimated_total}
                        inDb={dbCounts?.bookings || 0}
                        status={bookingsStatus?.status || "pending"}
                        estimatedTime={estimateTimeRemaining()}
                      />
                    </div>

                    <SyncMetricsCards
                      customersTotal={dbCounts?.customers || 0}
                      bookingsTotal={dbCounts?.bookings || 0}
                      bookingsWithUser={dbCounts?.bookings_with_user || 0}
                      orderLines={dbCounts?.order_lines || 0}
                      lastSyncAt={
                        customersStatus?.last_run_at
                          ? new Date(customersStatus.last_run_at)
                          : undefined
                      }
                    />

                    <div className="border-t pt-4 space-y-3">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        Actions
                      </h3>

                      <div className="flex gap-2 flex-wrap">
                        <TooltipProvider>
                          {!isSyncComplete && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => syncMutation.mutate()}
                                  disabled={syncMutation.isPending || isRunning}
                                  size="sm"
                                >
                                  <RefreshCw
                                    className={`mr-2 h-4 w-4 ${
                                      syncMutation.isPending ? "animate-spin" : ""
                                    }`}
                                  />
                                  {isRunning ? "Sync Running..." : "Manual Sync Now"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Trigger an immediate sync. Auto-sync runs every 2 minutes.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {isSyncComplete && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => computeMutation.mutate()}
                                  disabled={computeMutation.isPending}
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <TrendingUp className="mr-2 h-4 w-4" />
                                  {computeMutation.isPending
                                    ? "Computing..."
                                    : "Recompute Segments"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Recalculate customer segments after data sync completes
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {!isSyncComplete && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  onClick={() => computeMutation.mutate()}
                                  disabled={computeMutation.isPending}
                                  size="sm"
                                >
                                  <TrendingUp className="mr-2 h-4 w-4" />
                                  Recompute Segments
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Recalculate customer segments after data sync completes
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleResetSync}
                              >
                                Force Full Re-Sync
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                ⚠️ Reset and re-fetch all data from Noddi API. This will take
                                several minutes.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {isSyncComplete && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                          <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="text-sm text-green-800 dark:text-green-200">
                            ✅ All up to date! Click "Recompute Segments" then view results in
                          </span>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-green-700 dark:text-green-300"
                            onClick={() => (window.location.href = "/")}
                          >
                            Dashboard
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
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
