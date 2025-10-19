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
  // Calculate actual progress with multiple fallbacks
  const getActualProgress = () => {
    // If status is 'completed' or 'success', show 100%
    if (status === 'completed' || status === 'success') return 100;

    // For order_lines, compare against total_records (bookings count) if no estimated_total
    // For other resources, use estimated total from API if available
    const calculated = total && total > 0 
      ? Math.round((inDb / total) * 100) 
      : progress;

    // Cap at 100%
    return Math.min(100, calculated);
  };

  const actualProgress = getActualProgress();
  const isComplete = actualProgress >= 100 || status === 'completed' || status === 'success';
  const isRunning = status === "running";

  const getBarColor = () => {
    if (isComplete) return "bg-green-500";
    if (isRunning) return "bg-blue-500";
    return "bg-primary";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium capitalize">{resource}</span>
          {syncMode === "full" && (
            <Badge variant="destructive" className="text-xs">FULL SYNC</Badge>
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
          {inDb.toLocaleString()} {total && `of ${total.toLocaleString()}`}
          {syncMode === "full" && currentPage !== undefined && total && total > 0 && (
            <span className="ml-2 text-blue-600 dark:text-blue-400">
              {/* PART 2: Fix page number display - different for order_lines vs API resources */}
              {resource === "order_lines" 
                ? `(Processing batch ${currentPage})`
                : `(Page ${currentPage}/${Math.ceil(total / 100)})`
              }
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
    </div>
  );
}
