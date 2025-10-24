import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSegmentCounts, useInactiveCustomerCount } from "@/hooks/segmentation";
import { usePyramidTierCounts, useDormantCounts } from "@/hooks/pyramidSegmentation";
import { useSyncStatus } from "@/hooks/segmentation";
import { ActionableInsights } from "@/components/dashboard/ActionableInsights";
import { PyramidActionableInsights } from "@/components/dashboard/PyramidActionableInsights";
import { ProductLineStats } from "@/components/dashboard/ProductLineStats";
import { formatDistanceToNow } from "date-fns";

export function OverviewTab() {
  const { data: counts } = useSegmentCounts();
  const { data: inactiveCount } = useInactiveCustomerCount();
  const { data: tierCounts } = usePyramidTierCounts();
  const { data: dormantCounts } = useDormantCounts();
  const { data: syncStatus } = useSyncStatus();

  const activeCustomers = counts 
    ? (counts.New || 0) + (counts.Active || 0) + (counts['At-risk'] || 0) + 
      (counts.Churned || 0) + (counts.Winback || 0)
    : 0;
  
  const totalCustomers = activeCustomers + (inactiveCount || 0);

  const latestSync = syncStatus?.[0];

  return (
    <div className="space-y-6">
      {/* KPI Summary Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCustomers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeCustomers.toLocaleString()} with bookings
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Champions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
              {tierCounts?.Champion || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Your best customers</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">At-Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {counts?.['At-risk'] || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Need attention soon</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Salvageable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {dormantCounts?.salvageable || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Win-back opportunity</p>
          </CardContent>
        </Card>
      </div>

      {/* Sync Status */}
      {latestSync && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${
                latestSync.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                latestSync.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <div>
                <p className="text-sm font-medium">
                  {latestSync.status === 'running' ? 'Data sync in progress...' :
                   latestSync.status === 'ok' ? 'Data is up to date' :
                   'Sync error'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last synced{' '}
                  {latestSync.last_run_at
                    ? formatDistanceToNow(new Date(latestSync.last_run_at), { addSuffix: true })
                    : 'never'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actionable Insights */}
      <ActionableInsights />
      <PyramidActionableInsights />

      {/* Product Line Stats */}
      <ProductLineStats />
    </div>
  );
}
