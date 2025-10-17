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
  const isComplete = progress >= 99;
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
          {Math.round(progress)}%
        </span>
      </div>

      <div className="relative">
        <Progress value={progress} className="h-3" />
        <div
          className={cn("absolute inset-0 h-3 rounded-full transition-all", getBarColor())}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {inDb.toLocaleString()} {total && `of ${total.toLocaleString()}`}
        </span>
        {estimatedTime && estimatedTime > 0 && (
          <span className="flex items-center gap-1">
            ~{Math.ceil(estimatedTime / 60)} min remaining
          </span>
        )}
      </div>
    </div>
  );
}
