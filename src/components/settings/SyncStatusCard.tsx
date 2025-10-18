import { CheckCircle, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type SyncState = "idle" | "syncing" | "complete" | "error" | "ready-to-compute" | "computing";

interface SyncStatusCardProps {
  customersProgress: number;
  bookingsProgress: number;
  orderLinesProgress: number;
  customersTotal?: number;
  bookingsTotal?: number;
  customersInDb: number;
  bookingsInDb: number;
  orderLinesInDb: number;
  expectedOrderLines: number;
  isRunning: boolean;
  hasError?: boolean;
  errorMessage?: string;
  isComputingSegments?: boolean;
  lastComputeTime?: Date | null;
  customersStatus?: any;
  bookingsStatus?: any;
  orderLinesStatus?: any;
}

export function SyncStatusCard({
  customersProgress,
  bookingsProgress,
  orderLinesProgress,
  customersTotal,
  bookingsTotal,
  customersInDb,
  bookingsInDb,
  orderLinesInDb,
  expectedOrderLines,
  isRunning,
  hasError,
  errorMessage,
  isComputingSegments,
  lastComputeTime,
  customersStatus,
  bookingsStatus,
  orderLinesStatus,
}: SyncStatusCardProps) {
  // Determine overall sync state
  const getSyncState = (): SyncState => {
    if (isComputingSegments) return "computing";
    if (hasError) return "error";
    
    // Special case: order_lines complete but bookings full sync still running
    if (orderLinesStatus?.status === "success" && 
        bookingsStatus?.sync_mode === "full" && 
        bookingsStatus?.status === "running") {
      return "syncing"; // Keep showing as syncing with special message
    }
    
    if (isRunning) return "syncing";
    
    // Check if all phases are complete
    const allPhasesComplete = customersProgress >= 100 && bookingsProgress >= 100 && orderLinesProgress >= 100;
    if (allPhasesComplete && customersInDb > 0 && bookingsInDb > 0) return "ready-to-compute";
    
    if (customersProgress > 0 || bookingsProgress > 0 || orderLinesProgress > 0) return "complete";
    return "idle";
  };

  const state = getSyncState();

  const getStateConfig = () => {
    switch (state) {
      case "computing":
        return {
          icon: RefreshCw,
          iconClass: "text-purple-500 animate-spin",
          bgClass: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900",
          title: "Computing Segments",
          message: "Analyzing customer data and calculating segments...",
        };
      case "syncing":
        // Detect current phase based on what's actually running
        let currentPhase = "";
        let message = "";
        let lastRunAt: Date | null = null;
        
        // Special case: order_lines complete but bookings full sync still running
        if (orderLinesStatus?.status === "success" && 
            bookingsStatus?.sync_mode === "full" && 
            bookingsStatus?.status === "running") {
          currentPhase = `Order Lines Extracted`;
          message = `✓ Extracted ${orderLinesInDb.toLocaleString()} lines from ${orderLinesStatus?.total_records || 0} bookings. ⏳ More bookings syncing... Re-extract after completion for all data.`;
          lastRunAt = bookingsStatus?.last_run_at ? new Date(bookingsStatus.last_run_at) : null;
        } else if (customersProgress < 100 && customersStatus?.status === "running") {
          currentPhase = `Phase 1/3: Syncing customers... (${Math.round(customersProgress)}%)`;
          message = `${customersInDb.toLocaleString()} customers synced`;
          lastRunAt = customersStatus?.last_run_at ? new Date(customersStatus.last_run_at) : null;
        } else if (bookingsProgress < 100 && bookingsStatus?.status === "running") {
          const mode = bookingsStatus?.sync_mode === "full" ? "FULL RE-SYNC" : "incremental";
          const currentPage = bookingsStatus?.current_page || 0;
          const estimatedPages = bookingsStatus?.estimated_total 
            ? Math.ceil(bookingsStatus.estimated_total / 100) 
            : 300;
          
          currentPhase = `Phase 2/3: Syncing bookings (${mode})... (${Math.round(bookingsProgress)}%)`;
          message = `Page ${currentPage} of ~${estimatedPages} | ${bookingsInDb.toLocaleString()} bookings synced`;
          lastRunAt = bookingsStatus?.last_run_at ? new Date(bookingsStatus.last_run_at) : null;
        } else if (orderLinesStatus?.status === "running") {
          currentPhase = `Phase 3/3: Extracting order lines... (${Math.round(orderLinesProgress)}%)`;
          message = `${orderLinesInDb.toLocaleString()} / ${expectedOrderLines.toLocaleString()} order lines extracted`;
          lastRunAt = orderLinesStatus?.last_run_at ? new Date(orderLinesStatus.last_run_at) : null;
        }
        
        // Check for stalled sync (no activity for 3+ minutes)
        const timeSinceLastRun = lastRunAt ? Date.now() - lastRunAt.getTime() : null;
        const isStalled = timeSinceLastRun && timeSinceLastRun > 180000;
        
        return {
          icon: RefreshCw,
          iconClass: "text-blue-500 animate-spin",
          bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
          title: currentPhase,
          message: message + (lastRunAt ? ` | Last activity ${formatDistanceToNow(lastRunAt, { addSuffix: true })}` : ''),
          isStalled,
        };
      case "ready-to-compute":
        const needsCompute = !lastComputeTime || (customersProgress >= 100 && bookingsProgress >= 100);
        return {
          icon: Sparkles,
          iconClass: "text-green-500",
          bgClass: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
          title: needsCompute ? "✅ Ready to Compute Segments" : "✅ All Up to Date",
          message: needsCompute 
            ? `Data synced. Click 'Recompute Segments' to update insights.`
            : `Last computed ${lastComputeTime ? formatDistanceToNow(lastComputeTime, { addSuffix: true }) : 'recently'}`,
        };
      case "error":
        return {
          icon: AlertCircle,
          iconClass: "text-destructive",
          bgClass: "bg-destructive/10 border-destructive/30",
          title: "Sync Error",
          message: errorMessage || "An error occurred during sync",
        };
      case "complete":
        return {
          icon: CheckCircle,
          iconClass: "text-green-500",
          bgClass: "bg-muted border-border",
          title: "Sync Progress Saved",
          message: `${customersInDb.toLocaleString()} customers, ${bookingsInDb.toLocaleString()} bookings synced`,
        };
      default:
        return {
          icon: RefreshCw,
          iconClass: "text-muted-foreground",
          bgClass: "bg-muted border-border",
          title: "Sync Ready",
          message: "Auto-sync runs every 2 minutes",
        };
    }
  };

  const config = getStateConfig();
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border p-4 transition-colors", config.bgClass)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 mt-0.5", config.iconClass)} />
        <div className="flex-1 space-y-1">
          <h3 className="text-sm font-semibold">{config.title}</h3>
          <p className="text-sm text-muted-foreground">{config.message}</p>
          {(config as any).isStalled && (
            <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              ⚠️ No activity for 3+ minutes. Auto-sync may be delayed or stuck.
            </p>
          )}
          {isRunning && !(config as any).isStalled && (
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ Auto-sync will continue every 2 minutes until complete
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
