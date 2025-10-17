import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SyncHelpPanelProps {
  currentStep: 1 | 2 | 3 | 4;
  syncComplete?: boolean;
  computeComplete?: boolean;
}

export function SyncHelpPanel({ currentStep, syncComplete, computeComplete }: SyncHelpPanelProps) {
  const getRecommendedAction = () => {
    if (!syncComplete) {
      return "⏳ Wait for data sync to complete (auto-sync runs every 2 minutes)";
    }
    if (!computeComplete && syncComplete) {
      return "▶️ Click 'Recompute Segments' to update customer insights";
    }
    if (computeComplete) {
      return "✅ All set! View results in Dashboard or Segments pages";
    }
    return "🔄 Keep this page open to monitor progress";
  };

  const steps = [
    {
      number: 1,
      title: "Auto-sync is running",
      description: "Data syncs every 2 minutes automatically",
      isComplete: currentStep > 1,
      isCurrent: currentStep === 1,
    },
    {
      number: 2,
      title: "Wait for sync completion",
      description: "Monitor progress bars until they reach 100%",
      isComplete: currentStep > 2,
      isCurrent: currentStep === 2,
    },
    {
      number: 3,
      title: "Recompute segments",
      description: "Click 'Recompute Segments' to process the synced data",
      isComplete: currentStep > 3,
      isCurrent: currentStep === 3,
    },
    {
      number: 4,
      title: "View results",
      description: "Navigate to Dashboard or Segments page to see insights",
      isComplete: currentStep > 4,
      isCurrent: currentStep === 4,
    },
  ];

  return (
    <Card className="p-4 bg-primary/5 border-primary/20">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span>📋</span>
        Sync Workflow
      </h3>

      <div className="mb-4 p-2 bg-background/50 rounded border border-primary/20">
        <p className="text-xs font-medium text-primary">
          {getRecommendedAction()}
        </p>
      </div>
      
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-start gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              {step.isComplete ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : step.isCurrent ? (
                <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                </div>
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40" />
              )}
            </div>
            
            <div className={cn("flex-1", !step.isCurrent && !step.isComplete && "opacity-50")}>
              <div className="flex items-center gap-2">
                <p className={cn(
                  "text-sm font-medium",
                  step.isCurrent && "text-primary"
                )}>
                  {step.title}
                </p>
                {step.isCurrent && (
                  <ArrowRight className="h-3 w-3 text-primary animate-pulse" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
