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
  const getDisplayName = () => {
    if (resource === 'user_groups') return 'User Groups (Primary Customers)';
    if (resource === 'customers') return 'Members (users)';
    if (resource === 'bookings') return 'Bookings';
    if (resource === 'order_lines') return 'Order Lines';
    return resource;
  };
  
  // Backend calculates everything - UI just displays
  const actualProgress = progress || 0;
  const isComplete = status === 'completed' || status === 'success';
  const isRunning = status === 'running' || 
    (status === 'pending' && syncMode === 'full' && actualProgress > 0);
  const isWaiting = status === 'pending' && actualProgress === 0 && 
    (resource === 'customers' || resource === 'bookings' || resource === 'order_lines');

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
          {isComplete && (
            <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-600 dark:border-green-400">
              ✓ Complete
            </Badge>
          )}
        </div>
        <span className={cn("font-semibold", isComplete && "text-green-600 dark:text-green-400")}>
          {actualProgress}%
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
          {inDb.toLocaleString()} {total ? `of ${total.toLocaleString()}` : ''}
          {syncMode === "full" && currentPage && (
            <span className="ml-2 text-blue-600 dark:text-blue-400">
              (Page {currentPage})
            </span>
          )}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          {estimatedTime && estimatedTime > 0 && !isComplete && (
            <span>~{Math.ceil(estimatedTime / 60)} min remaining</span>
          )}
          {lastRunAt && (
            <span className="text-[10px]">
              Last update: {formatDistanceToNow(lastRunAt, { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      
      {isWaiting && (
        <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Waiting for previous phase to complete
        </div>
      )}
    </div>
  );
}
