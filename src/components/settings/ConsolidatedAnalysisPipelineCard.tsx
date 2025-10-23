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
  Sparkles,
  AlertCircle,
  Lightbulb,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConsolidatedAnalysisPipelineCardProps {
  syncComplete: boolean;
  customersInDb: number;
  segmentsComputed: number;
  valueTiersComputed: number;
  pyramidTiersComputed: number;
  isComputing: boolean;
  onRunAnalysis: () => void;
  onViewDashboard: () => void;
  onViewSegments: () => void;
  computingProgress?: number;
  bookingsCount?: number;
  orderLinesCount?: number;
}

export function ConsolidatedAnalysisPipelineCard({
  syncComplete,
  customersInDb,
  segmentsComputed,
  valueTiersComputed,
  pyramidTiersComputed,
  isComputing,
  onRunAnalysis,
  onViewDashboard,
  onViewSegments,
  computingProgress = 0,
  bookingsCount = 0,
  orderLinesCount = 0,
}: ConsolidatedAnalysisPipelineCardProps) {
  
  const allAnalysisComplete = segmentsComputed > 0 && valueTiersComputed > 0 && pyramidTiersComputed > 0;
  const analysisNeeded = syncComplete && !allAnalysisComplete;

  const steps = [
    {
      id: "sync",
      title: "Sync Data",
      status: syncComplete ? "completed" : "pending",
      icon: Database,
      description: syncComplete
        ? `${customersInDb.toLocaleString()} customers • ${bookingsCount.toLocaleString()} bookings • ${orderLinesCount.toLocaleString()} lines`
        : "Waiting for data sync to complete...",
    },
    {
      id: "analyze",
      title: "Analyze Customers",
      status: isComputing ? "running" : allAnalysisComplete ? "completed" : syncComplete ? "ready" : "pending",
      icon: TrendingUp,
      description: allAnalysisComplete
        ? "All customer insights calculated"
        : isComputing
        ? `Computing lifecycle stages, value tiers, and pyramid positioning...`
        : syncComplete
        ? "Ready to analyze customer data"
        : "Waiting for sync to complete...",
      analyses: [
        { label: "Lifecycle Stages", count: segmentsComputed },
        { label: "Value Tiers", count: valueTiersComputed },
        { label: "Pyramid Tiers", count: pyramidTiersComputed },
      ],
    },
    {
      id: "view",
      title: "View Dashboard",
      status: allAnalysisComplete ? "ready" : "pending",
      icon: BarChart3,
      description: allAnalysisComplete
        ? "Explore customer insights and trends"
        : "Complete analysis to unlock dashboard",
    },
  ];

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Customer Analysis Pipeline
        </CardTitle>
        <CardDescription>
          Automated workflow: Sync → Analyze → Explore insights
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === steps.length - 1;
            const isCompleted = step.status === "completed";
            const isRunning = step.status === "running";
            const isReady = step.status === "ready";
            const isPending = step.status === "pending";
            
            return (
              <div key={step.id} className="relative">
                {/* Connector line */}
                {!isLast && (
                  <div 
                    className={cn(
                      "absolute left-[19px] top-10 w-0.5 h-8",
                      isCompleted ? "bg-green-500" : "bg-muted"
                    )}
                  />
                )}
                
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 border-2",
                    isCompleted && "bg-green-50 dark:bg-green-950/30 border-green-500",
                    isRunning && "bg-primary/10 border-primary",
                    isReady && "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-500",
                    isPending && "bg-muted border-muted-foreground/20"
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : isRunning ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    ) : isReady ? (
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-sm">Step {index + 1}: {step.title}</h4>
                      {(isCompleted || isReady) && (
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          isCompleted && "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
                          isReady && "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300"
                        )}>
                          {isCompleted ? "Complete" : "Ready"}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-2">
                      {step.description}
                    </p>
                    
                    {/* Analysis breakdown */}
                    {step.id === "analyze" && (isCompleted || isReady || isRunning) && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {step.analyses?.map((analysis) => (
                          <div 
                            key={analysis.label}
                            className="bg-muted/50 p-2 rounded text-center"
                          >
                            <div className="text-xs text-muted-foreground">{analysis.label}</div>
                            <div className="text-sm font-bold">
                              {analysis.count.toLocaleString()} / {
                                (Math.max(
                                  segmentsComputed || 0,
                                  valueTiersComputed || 0,
                                  customersInDb
                                )).toLocaleString()
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Status Messages */}
        {!syncComplete && (
          <Alert className="border-muted bg-muted/30">
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">Waiting for data sync</p>
              <p className="text-sm text-muted-foreground mt-1">
                Complete the data sync above before running customer analysis.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {isComputing && (
          <Alert className="border-primary/50 bg-primary/5">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              <div className="space-y-3">
                <div>
                  <p className="font-medium">Analysis in progress...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {computingProgress < 70 ? 'Step 1/3: Computing lifecycle segments' :
                     computingProgress < 85 ? 'Step 2/3: Computing value tiers' :
                     'Step 3/3: Computing pyramid tiers'}
                  </p>
                </div>
                
                <Progress value={computingProgress} className="h-2" />
                
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{Math.round(computingProgress)}% complete</span>
                  <span className="text-muted-foreground">
                    {segmentsComputed.toLocaleString()} / {customersInDb.toLocaleString()} customers
                  </span>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  ⏱️ Estimated time: 6-8 minutes • Check browser console for detailed progress
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {analysisNeeded && !isComputing && (
          <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/30">
            <Lightbulb className="h-4 w-4 text-yellow-600" />
            <AlertDescription>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Ready to analyze
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Your data is synced. Run complete analysis to calculate customer lifecycle stages, value tiers, and pyramid positioning. This typically takes ~2 minutes.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {allAnalysisComplete && !isComputing && (
          <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/30">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-green-800 dark:text-green-200">
                    🎉 Analysis complete!
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    All {customersInDb.toLocaleString()} customers have been analyzed. Your insights are ready to explore.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-green-200 dark:border-green-900">
                  <div className="bg-white dark:bg-green-950/50 p-2 rounded">
                    <div className="text-xs text-green-700 dark:text-green-400">Lifecycle Stages</div>
                    <div className="text-lg font-bold text-green-900 dark:text-green-100">
                      {segmentsComputed.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-green-950/50 p-2 rounded">
                    <div className="text-xs text-green-700 dark:text-green-400">Value Tiers</div>
                    <div className="text-lg font-bold text-green-900 dark:text-green-100">
                      {valueTiersComputed.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-green-950/50 p-2 rounded">
                    <div className="text-xs text-green-700 dark:text-green-400">Pyramid Tiers</div>
                    <div className="text-lg font-bold text-green-900 dark:text-green-100">
                      {pyramidTiersComputed.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-green-950/50 p-2 rounded">
                    <div className="text-xs text-green-700 dark:text-green-400">Data Points</div>
                    <div className="text-lg font-bold text-green-900 dark:text-green-100">
                      {orderLinesCount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {allAnalysisComplete ? (
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
                onClick={onViewSegments}
                variant="outline"
                size="lg"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                View Segments
              </Button>
            </>
          ) : (
            <Button
              onClick={onRunAnalysis}
              disabled={!syncComplete || isComputing}
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
                  <Sparkles className="mr-2 h-4 w-4" />
                  Run Complete Analysis
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
