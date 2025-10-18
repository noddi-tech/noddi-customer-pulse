import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, BarChart3, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncActionButtonsProps {
  syncState: "initial" | "running" | "phase3-running" | "complete" | "computed" | "error";
  onSyncNow: () => void;
  onComputeSegments: () => void;
  onViewDashboard: () => void;
  onResetSync: () => void;
  onReExtractOrderLines: () => void;
  isSyncing: boolean;
  isComputing: boolean;
  phase3Progress?: number;
  estimatedTime?: number;
}

export function SyncActionButtons({
  syncState,
  onSyncNow,
  onComputeSegments,
  onViewDashboard,
  onResetSync,
  onReExtractOrderLines,
  isSyncing,
  isComputing,
  phase3Progress = 0,
  estimatedTime = 0,
}: SyncActionButtonsProps) {
  const renderButtons = () => {
    switch (syncState) {
      case "initial":
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button onClick={onSyncNow} disabled={isSyncing} className="flex-1">
                <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                Start First Sync
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Click to begin importing your customer data from Noddi API
            </p>
          </div>
        );

      case "running":
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button disabled className="flex-1">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Sync Running...
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Auto-sync in progress. Refreshes every 5 seconds.
            </p>
            <details className="mt-4 pt-4 border-t">
              <summary className="cursor-pointer text-sm font-medium mb-2 hover:text-primary">
                Advanced Actions
              </summary>
              <div className="space-y-2 mt-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Re-extract all order lines from existing bookings? This will clear existing order lines.')) {
                      onReExtractOrderLines();
                    }
                  }}
                  className="w-full"
                >
                  Re-extract Order Lines
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Force a complete re-sync of all data from the beginning?')) {
                      onResetSync();
                    }
                  }}
                  className="w-full"
                >
                  Reset Full Sync
                </Button>
              </div>
            </details>
          </div>
        );

      case "phase3-running":
        const timeStr = estimatedTime > 0 
          ? `~${Math.ceil(estimatedTime / 60)} min remaining`
          : "Processing...";
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button disabled className="flex-1">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Processing Order Lines...
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {Math.round(phase3Progress)}% complete. {timeStr}
            </p>
            <details className="mt-4 pt-4 border-t">
              <summary className="cursor-pointer text-sm font-medium mb-2 hover:text-primary">
                Advanced Actions
              </summary>
              <div className="space-y-2 mt-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Re-extract all order lines from existing bookings? This will clear existing order lines.')) {
                      onReExtractOrderLines();
                    }
                  }}
                  className="w-full"
                >
                  Re-extract Order Lines
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Force a complete re-sync of all data from the beginning?')) {
                      onResetSync();
                    }
                  }}
                  className="w-full"
                >
                  Reset Full Sync
                </Button>
              </div>
            </details>
          </div>
        );

      case "complete":
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button 
                onClick={onComputeSegments} 
                disabled={isComputing} 
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <TrendingUp className={cn("mr-2 h-4 w-4", isComputing && "animate-spin")} />
                {isComputing ? "Computing..." : "Recompute Segments"}
              </Button>
              <Button variant="outline" onClick={onSyncNow} disabled={isSyncing}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                Re-sync Data
              </Button>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
              <p className="text-sm text-green-800 dark:text-green-200">
                ✅ Data synced! Click "Recompute Segments" to calculate insights.
              </p>
            </div>
            <details className="mt-4 pt-4 border-t">
              <summary className="cursor-pointer text-sm font-medium mb-2 hover:text-primary">
                Advanced Actions
              </summary>
              <div className="space-y-2 mt-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Re-extract all order lines from existing bookings? This will clear existing order lines.')) {
                      onReExtractOrderLines();
                    }
                  }}
                  className="w-full"
                >
                  Re-extract Order Lines
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Force a complete re-sync of all data from the beginning?')) {
                      onResetSync();
                    }
                  }}
                  className="w-full"
                >
                  Reset Full Sync
                </Button>
              </div>
            </details>
          </div>
        );

      case "computed":
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button onClick={onViewDashboard} className="flex-1">
                <BarChart3 className="mr-2 h-4 w-4" />
                View Dashboard
              </Button>
              <Button variant="outline" onClick={onSyncNow} disabled={isSyncing}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                Re-sync Data
              </Button>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                🎉 You're all set! View your customer insights on the Dashboard.
              </p>
            </div>
            <details className="mt-4 pt-4 border-t">
              <summary className="cursor-pointer text-sm font-medium mb-2 hover:text-primary">
                Advanced Actions
              </summary>
              <div className="space-y-2 mt-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Re-extract all order lines from existing bookings? This will clear existing order lines.')) {
                      onReExtractOrderLines();
                    }
                  }}
                  className="w-full"
                >
                  Re-extract Order Lines
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('Force a complete re-sync of all data from the beginning?')) {
                      onResetSync();
                    }
                  }}
                  className="w-full"
                >
                  Reset Full Sync
                </Button>
              </div>
            </details>
          </div>
        );

      case "error":
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button onClick={onSyncNow} disabled={isSyncing} variant="destructive" className="flex-1">
                <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                Retry Sync
              </Button>
              <Button variant="outline" onClick={onResetSync}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Reset & Re-sync
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Sync failed. Click to retry or reset the sync state.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="border-t pt-4">
      <h3 className="text-sm font-medium mb-3">Actions</h3>
      {renderButtons()}
    </div>
  );
}
