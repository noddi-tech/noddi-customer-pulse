import { Progress } from "@/components/ui/progress";
import { Clock, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProgressIndicatorWithETAProps {
  progress: number;
  currentStep: string;
  estimatedTimeRemaining?: number; // in seconds
  startedAt?: Date;
  details?: string;
}

export function ProgressIndicatorWithETA({
  progress,
  currentStep,
  estimatedTimeRemaining,
  startedAt,
  details
}: ProgressIndicatorWithETAProps) {
  
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    return `${Math.ceil(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="font-medium text-sm">{currentStep}</span>
        </div>
        <span className="text-sm font-semibold">{Math.round(progress)}%</span>
      </div>
      
      <Progress value={progress} className="h-2" />
      
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {details && <span>{details}</span>}
        </div>
        <div className="flex items-center gap-4">
          {startedAt && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Started {formatDistanceToNow(startedAt, { addSuffix: true })}
            </div>
          )}
          {estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{formatTime(estimatedTimeRemaining)} remaining
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
