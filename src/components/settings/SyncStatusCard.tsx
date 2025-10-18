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
}: SyncStatusCardProps) {
  // Determine overall sync state
  const getSyncState = (): SyncState => {
    if (isComputingSegments) return "computing";
    if (hasError) return "error";
    if (isRunning) return "syncing";
    if (customersProgress >= 100 && bookingsProgress >= 100) return "ready-to-compute";
    if (customersProgress > 0 || bookingsProgress > 0) return "complete";
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
        
        if (customersProgress < 100) {
          currentPhase = `Phase 1/3: Syncing customers... (${Math.round(customersProgress)}%)`;
          message = `${customersInDb.toLocaleString()} customers synced`;
        } else if (bookingsProgress < 100) {
          currentPhase = `Phase 2/3: Syncing bookings... (${Math.round(bookingsProgress)}%)`;
          message = `${bookingsInDb.toLocaleString()} bookings synced`;
        } else {
          currentPhase = `Phase 3/3: Extracting order lines... (${Math.round(orderLinesProgress)}%)`;
          message = `${orderLinesInDb.toLocaleString()} / ${expectedOrderLines.toLocaleString()} order lines extracted`;
        }
        
        return {
          icon: RefreshCw,
          iconClass: "text-blue-500 animate-spin",
          bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
          title: currentPhase,
          message: message,
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
          {isRunning && (
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ Auto-sync will continue every 2 minutes until complete
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
