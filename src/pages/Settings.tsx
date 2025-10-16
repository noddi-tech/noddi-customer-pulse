import { useState } from "react";
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
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";

export default function Settings() {
  const { data: thresholds, refetch } = useSettings();
  const { data: syncStatus } = useSyncStatus();
  const syncMutation = useSyncNow();
  const computeMutation = useComputeSegments();
  const testMutation = useTestConnection();

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
                Manage data synchronization with Noddi API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                  {syncMutation.isPending ? "Syncing..." : "Sync Now"}
                </Button>

                <Button variant="outline" onClick={() => computeMutation.mutate()} disabled={computeMutation.isPending}>
                  {computeMutation.isPending ? "Recomputing..." : "Recompute Segments"}
                </Button>
              </div>

              {syncStatus && syncStatus.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Sync Status</h3>
                  {syncStatus.map((status) => (
                    <div key={status.resource} className="flex items-center justify-between border rounded p-3">
                      <div>
                        <p className="font-medium">{status.resource}</p>
                        <p className="text-sm text-muted-foreground">
                          {status.last_run_at
                            ? `Last run: ${formatDistanceToNow(new Date(status.last_run_at), { addSuffix: true })}`
                            : "Never run"}
                        </p>
                        {status.rows_fetched && (
                          <p className="text-xs text-muted-foreground">
                            Rows fetched: {status.rows_fetched.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {status.status === "ok" && <CheckCircle className="h-5 w-5 text-green-500" />}
                        {status.status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
                        {status.status === "running" && <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />}
                        <span className="text-sm font-medium">{status.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
