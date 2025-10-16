import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/hooks/segmentation";
import { useSyncNow, useComputeSegments, useTestConnection } from "@/hooks/edgeFunctions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSyncStatus } from "@/hooks/segmentation";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, XCircle, RefreshCw, Clock } from "lucide-react";

export default function Settings() {
  const { data: thresholds, refetch } = useSettings();
  const { data: syncStatus } = useSyncStatus();
  const syncMutation = useSyncNow();
  const computeMutation = useComputeSegments();
  const testMutation = useTestConnection();
  const queryClient = useQueryClient();

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
      await supabase.from('sync_state').update({
        high_watermark: null,
        rows_fetched: 0,
        sync_mode: 'initial',
        progress_percentage: 0,
        status: 'pending'
      }).in('resource', ['customers', 'bookings']);
      
      toast.success('Sync reset! Auto-sync will start on next cron run (every 2 min).');
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    } catch (error) {
      toast.error('Failed to reset sync');
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
          <Card>
            <CardHeader>
              <CardTitle>Data Sync</CardTitle>
              <CardDescription>
                Automated sync runs every 2 minutes via cron job
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h3 className="text-sm font-medium">Auto-Sync Active</h3>
                      <p className="text-xs text-muted-foreground">
                        Runs every 2 minutes until initial sync completes
                      </p>
                    </div>
                  </div>
                </div>

                {syncStatus && syncStatus.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Sync Progress</h3>
                    {syncStatus.map((status) => (
                      <div key={status.resource} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium capitalize">{status.resource}</p>
                            <p className="text-sm text-muted-foreground">
                              Mode: <span className="font-mono">{status.sync_mode || 'initial'}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {status.status === "completed" && <CheckCircle className="h-5 w-5 text-green-500" />}
                            {status.status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
                            {status.status === "running" && <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />}
                            <span className="text-sm font-medium">{status.status}</span>
                          </div>
                        </div>

                        {status.sync_mode === 'initial' && status.progress_percentage != null && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Progress</span>
                              <span>{Math.round(status.progress_percentage)}%</span>
                            </div>
                            <Progress value={status.progress_percentage} className="h-2" />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-muted-foreground">Records Synced</p>
                            <p className="font-medium text-base">{status.rows_fetched?.toLocaleString() || 0}</p>
                          </div>
                          {status.last_run_at && (
                            <div>
                              <p className="text-muted-foreground">Last Run</p>
                              <p className="font-medium text-sm">
                                {formatDistanceToNow(new Date(status.last_run_at), { addSuffix: true })}
                              </p>
                            </div>
                          )}
                        </div>

                        {status.error_message && (
                          <p className="text-xs text-red-500 bg-red-50 p-2 rounded">
                            {status.error_message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap pt-4 border-t">
                  <Button 
                    onClick={() => syncMutation.mutate()} 
                    disabled={syncMutation.isPending}
                    size="sm"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                    Manual Sync Now
                  </Button>

                  <Button 
                    variant="outline" 
                    onClick={() => computeMutation.mutate()} 
                    disabled={computeMutation.isPending}
                    size="sm"
                  >
                    Recompute Segments
                  </Button>

                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={handleResetSync}
                  >
                    Force Full Re-Sync
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
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
