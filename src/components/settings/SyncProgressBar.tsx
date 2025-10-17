import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface SyncProgressBarProps {
  resource: string;
  progress: number;
  total?: number;
  inDb: number;
  status: string;
  estimatedTime?: number;
}

export function SyncProgressBar({
  resource,
  progress,
  total,
  inDb,
  status,
  estimatedTime,
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

  const getBarColor = () => {
    if (isComplete) return "bg-green-500";
    if (isRunning) return "bg-blue-500";
    return "bg-primary";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium capitalize">{resource}</span>
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
        </span>
        {estimatedTime && estimatedTime > 0 && !isComplete && (
          <span className="flex items-center gap-1">
            ~{Math.ceil(estimatedTime / 60)} min remaining
          </span>
        )}
      </div>
    </div>
  );
}
