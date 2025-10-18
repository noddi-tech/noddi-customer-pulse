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
    // If status is explicitly 'completed', show 100%
    if (status === 'completed') return 100;

    // Calculate from actual counts
    const calculated = total && total > 0 
      ? Math.round((inDb / total) * 100) 
      : progress;

    // Cap at 100%
    return Math.min(100, calculated);
  };

  const actualProgress = getActualProgress();
  const isComplete = actualProgress >= 100 || status === 'completed';
  const isRunning = status === "running";

  // PART 3: Detect order lines incomplete status (shows 100% but clearly wrong)
  const isOrderLinesIncomplete = 
    resource === "order_lines" && 
    status === "success" && 
    total && 
    inDb < total * 0.5; // Less than 50% of expected

  const getBarColor = () => {
    if (isComplete) return "bg-green-500";
    if (isRunning) return "bg-blue-500";
    return "bg-primary";
  };

  // Show warning if order lines appear incomplete
  if (isOrderLinesIncomplete) {
    return (
      <Alert variant="default" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
        <AlertCircle className="h-4 w-4 text-yellow-600" />
        <AlertTitle>⚠️ Order Lines Incomplete</AlertTitle>
        <AlertDescription className="text-sm">
          Extracted {inDb.toLocaleString()} lines but {total.toLocaleString()} expected.
          This sync was interrupted. Will resume on next sync cycle.
        </AlertDescription>
      </Alert>
    );
  }

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
