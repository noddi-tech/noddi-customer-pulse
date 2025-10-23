import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle2, 
  Clock, 
  Loader2, 
  TrendingUp,
  Database,
  BarChart3,
  Pyramid,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface AnalysisStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "error";
  icon: React.ComponentType<any>;
  count?: number;
  updatedAt?: Date;
}

interface AnalysisPipelineCardProps {
  syncComplete: boolean;
  customersInDb: number;
  segmentsComputed: number;
  pyramidTiersAssigned: number;
  isComputing: boolean;
  onRunAnalysis: () => void;
  onViewDashboard: () => void;
  computingProgress?: number;
}

export function AnalysisPipelineCard({
  syncComplete,
  customersInDb,
  segmentsComputed,
  pyramidTiersAssigned,
  isComputing,
  onRunAnalysis,
  onViewDashboard,
  computingProgress = 0
}: AnalysisPipelineCardProps) {
  
  // Determine step statuses
  const getStepStatus = (stepId: string): "pending" | "running" | "completed" | "error" => {
    if (isComputing) return "running";
    
    switch (stepId) {
      case "sync":
        return syncComplete ? "completed" : "pending";
      case "segments":
        return segmentsComputed > 0 ? "completed" : syncComplete ? "pending" : "pending";
      case "analysis":
        return pyramidTiersAssigned > 0 ? "completed" : segmentsComputed > 0 ? "pending" : "pending";
      default:
        return "pending";
    }
  };

  const steps: AnalysisStep[] = [
    {
      id: "sync",
      title: "Data Sync",
      description: syncComplete 
        ? `${customersInDb.toLocaleString()} customers synchronized`
        : "Sync customer data from API",
      status: getStepStatus("sync"),
      icon: Database,
      count: customersInDb,
    },
    {
      id: "segments",
      title: "Compute Analysis",
      description: segmentsComputed > 0
        ? `Lifecycle stages and value tiers calculated`
        : "Calculate customer segments and tiers",
      status: getStepStatus("segments"),
      icon: TrendingUp,
      count: segmentsComputed,
    },
    {
      id: "analysis",
      title: "Pyramid Tiers",
      description: pyramidTiersAssigned > 0
        ? `${pyramidTiersAssigned.toLocaleString()} customers tiered`
        : "Assign pyramid tier positioning",
      status: getStepStatus("analysis"),
      icon: Pyramid,
      count: pyramidTiersAssigned,
    },
  ];

  const allComplete = steps.every(step => step.status === "completed");
  const canRunAnalysis = syncComplete;
  const analysisNeeded = syncComplete && (segmentsComputed === 0 || pyramidTiersAssigned === 0);

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Customer Analysis Pipeline
        </CardTitle>
        <CardDescription>
          Automated workflow to compute lifecycle stages, value tiers, and pyramid positioning
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === steps.length - 1;
            
            return (
              <div key={step.id} className="relative">
                {/* Connector line */}
                {!isLast && (
                  <div 
                    className={cn(
                      "absolute left-[19px] top-10 w-0.5 h-8 -mb-8",
                      step.status === "completed" ? "bg-green-500" : "bg-muted"
                    )}
                  />
                )}
                
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 border-2",
                    step.status === "completed" 
                      ? "bg-green-50 dark:bg-green-950/30 border-green-500" 
                      : step.status === "running"
                      ? "bg-primary/10 border-primary"
                      : "bg-muted border-muted-foreground/20"
                  )}>
                    {step.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : step.status === "running" ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    ) : (
                      <Icon className={cn(
                        "h-5 w-5",
                        step.status === "pending" ? "text-muted-foreground" : "text-primary"
                      )} />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pt-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-sm">{step.title}</h4>
                      {step.status === "completed" && step.count !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {step.count.toLocaleString()} records
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Status Messages */}
        {isComputing && (
          <Alert className="border-primary/50 bg-primary/5">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Analysis in progress...</p>
                <Progress value={computingProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Computing lifecycle stages, value tiers, and pyramid positioning
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {analysisNeeded && !isComputing && (
          <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/30">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Analysis needed
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Data is synced. Run complete analysis to calculate customer insights.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {allComplete && !isComputing && (
          <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/30">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <p className="font-medium text-green-800 dark:text-green-200">
                Analysis complete
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                All customer insights have been calculated. View your dashboard to explore the data.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {allComplete ? (
            <>
              <Button
                onClick={onViewDashboard}
                className="flex-1"
                size="lg"
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                View Dashboard
              </Button>
              <Button
                onClick={onRunAnalysis}
                disabled={isComputing}
                variant="outline"
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", isComputing && "animate-spin")} />
                Re-run
              </Button>
            </>
          ) : (
            <Button
              onClick={onRunAnalysis}
              disabled={!canRunAnalysis || isComputing}
              className="flex-1"
              size="lg"
            >
              {isComputing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Analysis... {computingProgress > 0 && `${Math.round(computingProgress)}%`}
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Run Complete Analysis
                </>
              )}
            </Button>
          )}
        </div>

        {/* Help Text */}
        {!canRunAnalysis && (
          <p className="text-xs text-muted-foreground text-center">
            Complete the data sync before running analysis
          </p>
        )}
      </CardContent>
    </Card>
  );
}
