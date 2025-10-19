import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle } from "lucide-react";

interface SyncProgressBarProps {
  resource: string;
  progress: number;
  total?: number;
  inDb: number;
  status: string;
  estimatedTime?: number;
  syncMode?: string;
  currentPage?: number;
  lastRunAt?: Date | null;
}

export function SyncProgressBar({
  resource,
  progress,
  total,
  inDb,
  status,
  estimatedTime,
  syncMode,
  currentPage,
  lastRunAt,
}: SyncProgressBarProps) {
  // Get display name for resources
  const getDisplayName = () => {
    if (resource === 'user_groups') return 'User Groups (Primary Customers)';
    if (resource === 'customers') return 'Members (users)';
    if (resource === 'bookings') return 'Bookings';
    if (resource === 'order_lines') return 'Order Lines';
    return resource;
  };
  
  // STEP 1: Check if actively syncing (rows being fetched this run)
  const isActivelySyncing = status === 'running' || (status === 'pending' && progress > 0 && progress < 100);

  // STEP 2: Determine if waiting for previous phase
  // Only show "waiting" if NOT actively syncing AND not completed
  const isWaitingForPrevious = status === 'pending' && !isActivelySyncing && (
    (resource === 'customers') ||
    (resource === 'bookings') ||
    (resource === 'order_lines')
  );
  
  // Calculate actual progress with multiple fallbacks
  const getActualProgress = () => {
    // If status is 'completed' or 'success', show 100%
    if (status === 'completed' || status === 'success') return 100;

    // For order_lines, use currentPage (max_id_seen) vs total bookings
    if (resource === 'order_lines') {
      const calculated = total && total > 0 && currentPage
        ? Math.round((currentPage / total) * 100)
        : progress;
      return Math.min(100, calculated);
    }

    // For API resources (user_groups, customers, bookings)
    // Use the progress from sync state, NOT the database count
    const calculated = total && total > 0 && progress > 0
      ? Math.round((progress / total) * 100) 
      : progress;

    // Cap at 100%
    return Math.min(100, calculated);
  };

  const actualProgress = getActualProgress();
  const isComplete = actualProgress >= 100 || status === 'completed' || status === 'success';
  const isRunning = status === "running";
  
  // Only show "complete - waiting for next sync" if:
  // 1. Status is 'completed' OR
  // 2. NOT actively syncing AND database has significant data
  const isPendingButComplete = (status === 'completed') || 
    (status === 'pending' && !isActivelySyncing && inDb > 0 && total && total > 0 && inDb >= total * 0.9);

  const getBarColor = () => {
    if (isComplete) return "bg-green-500";
    if (isRunning) return "bg-blue-500";
    return "bg-primary";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{getDisplayName()}</span>
          {syncMode === "full" && (
            <Badge variant="destructive" className="text-xs">FULL SYNC</Badge>
          )}
          {isPendingButComplete && (
            <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-600 dark:border-green-400">
              ✓ Complete - waiting for next sync
            </Badge>
          )}
        </div>
        <span className={cn("font-semibold", (isComplete || isPendingButComplete) && "text-green-600 dark:text-green-400")}>
          {isPendingButComplete ? 100 : actualProgress}%
        </span>
      </div>

      <div className="relative">
        <Progress value={actualProgress} className="h-3" />
        <div
          className={cn("absolute inset-0 h-3 rounded-full transition-all", getBarColor())}
          style={{ width: `${actualProgress}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {resource === "order_lines" ? (
            <>
              {isPendingButComplete ? (
                <>
                  Extracted <span className="font-semibold text-green-600 dark:text-green-400">{inDb.toLocaleString()}</span> lines 
                  from {total?.toLocaleString()} bookings 
                  <span className="ml-2 text-muted-foreground">
                    (avg {total && total > 0 ? (inDb / total).toFixed(1) : '0'} per booking)
                  </span>
                </>
              ) : (
                <>
                  {inDb.toLocaleString()} order lines
                  {total && currentPage && (
                    <span className="ml-2">
                      from <span className="font-semibold">{currentPage.toLocaleString()}</span> of {total.toLocaleString()} bookings
                    </span>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {inDb.toLocaleString()} {total && `of ${total.toLocaleString()}`}
              {syncMode === "full" && currentPage !== undefined && total && total > 0 && (
                <span className="ml-2 text-blue-600 dark:text-blue-400">
                  (Page {currentPage}/{Math.ceil(total / 100)})
                </span>
              )}
            </>
          )}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          {estimatedTime && estimatedTime > 0 && !isComplete && !isPendingButComplete && (
            <span>~{Math.ceil(estimatedTime / 60)} min remaining</span>
          )}
          {lastRunAt && (
            <span className="text-[10px]">
              Last update: {formatDistanceToNow(lastRunAt, { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      
      {/* STEP 4: Add "Waiting for Previous Phase" Messages */}
      {isWaitingForPrevious && (
        <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {resource === 'customers' && 'Waiting for User Groups to complete (sequential sync)'}
          {resource === 'bookings' && 'Waiting for Members to complete (sequential sync)'}
          {resource === 'order_lines' && 'Waiting for Bookings to complete (sequential sync)'}
        </div>
      )}
    </div>
  );
}
