import { CheckCircle, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type SyncState = "idle" | "syncing" | "complete" | "error" | "ready-to-compute";

interface SyncStatusCardProps {
  customersProgress: number;
  bookingsProgress: number;
  customersTotal?: number;
  bookingsTotal?: number;
  customersInDb: number;
  bookingsInDb: number;
  isRunning: boolean;
  hasError?: boolean;
  errorMessage?: string;
}

export function SyncStatusCard({
  customersProgress,
  bookingsProgress,
  customersTotal,
  bookingsTotal,
  customersInDb,
  bookingsInDb,
  isRunning,
  hasError,
  errorMessage,
}: SyncStatusCardProps) {
  // Determine overall sync state
  const getSyncState = (): SyncState => {
    if (hasError) return "error";
    if (isRunning) return "syncing";
    if (customersProgress >= 99 && bookingsProgress >= 99) return "ready-to-compute";
    if (customersProgress > 0 || bookingsProgress > 0) return "complete";
    return "idle";
  };

  const state = getSyncState();

  const getStateConfig = () => {
    switch (state) {
      case "syncing":
        return {
          icon: RefreshCw,
          iconClass: "text-blue-500 animate-spin",
          bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
          title: "Sync in Progress",
          message: `Syncing bookings... ${bookingsInDb.toLocaleString()} of ${bookingsTotal?.toLocaleString() || "~21,000"} (${Math.round(bookingsProgress)}%)`,
        };
      case "ready-to-compute":
        return {
          icon: Sparkles,
          iconClass: "text-green-500",
          bgClass: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
          title: "✅ Sync Complete!",
          message: `All data synced. ${customersInDb.toLocaleString()} customers and ${bookingsInDb.toLocaleString()} bookings ready.`,
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
