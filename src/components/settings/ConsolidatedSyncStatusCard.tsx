import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, RefreshCw, Clock, Users, Calendar, ShoppingCart, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhaseStatus {
  resource: string;
  status: string;  // Accept any status string from DB
  total_records: number;
  last_run_at: string | null;
  estimated_total?: number;
}

interface ConsolidatedSyncStatusCardProps {
  customerStatus: PhaseStatus;
  memberStatus: PhaseStatus;
  bookingStatus: PhaseStatus;
  orderLineStatus: PhaseStatus;
  userGroupsTotal: number;
  userGroupsB2B: number;
  userGroupsB2C: number;
  bookingsTotal: number;
  bookingsWithUser: number;
  orderLinesTotal: number;
  expectedOrderLines: number;
  isAutoSyncing: boolean;
}

export function ConsolidatedSyncStatusCard({
  customerStatus,
  memberStatus,
  bookingStatus,
  orderLineStatus,
  userGroupsTotal,
  userGroupsB2B,
  userGroupsB2C,
  bookingsTotal,
  bookingsWithUser,
  orderLinesTotal,
  expectedOrderLines,
  isAutoSyncing,
}: ConsolidatedSyncStatusCardProps) {
  
  const phases = [
    { 
      id: 0, 
      label: "Customers", 
      status: customerStatus,
      icon: Users,
      metric: `${userGroupsTotal.toLocaleString()} synced`,
      detail: `${userGroupsB2B} B2B, ${userGroupsB2C.toLocaleString()} B2C`
    },
    { 
      id: 1, 
      label: "Members", 
      status: memberStatus,
      icon: Users,
      metric: `${memberStatus.total_records.toLocaleString()} synced`,
      detail: null
    },
    { 
      id: 2, 
      label: "Bookings", 
      status: bookingStatus,
      icon: Calendar,
      metric: `${bookingsTotal.toLocaleString()} synced`,
      detail: `${bookingsWithUser.toLocaleString()} mapped to users`
    },
    { 
      id: 3, 
      label: "Order Lines", 
      status: orderLineStatus,
      icon: ShoppingCart,
      metric: orderLineStatus.status === "completed" 
        ? `${orderLinesTotal.toLocaleString()} extracted`
        : `${orderLinesTotal.toLocaleString()} / ${expectedOrderLines.toLocaleString()}`,
      detail: orderLineStatus.status === "running" 
        ? `Processing ${expectedOrderLines.toLocaleString()} bookings...`
        : orderLineStatus.status === "completed"
        ? `From ${expectedOrderLines.toLocaleString()} bookings`
        : null
    },
  ];

  const getActivePhase = () => {
    const running = phases.find(p => p.status.status === "running");
    return running ? running.label : null;
  };

  const getOverallProgress = () => {
    const completedCount = phases.filter(p => p.status.status === "completed").length;
    const runningPhase = phases.find(p => p.status.status === "running");
    
    if (runningPhase && runningPhase.status.estimated_total) {
      const phaseProgress = (runningPhase.status.total_records / runningPhase.status.estimated_total) * 25;
      return (completedCount * 25) + phaseProgress;
    }
    
    return completedCount * 25;
  };

  const activePhase = getActivePhase();
  const overallProgress = getOverallProgress();
  const allComplete = phases.every(p => p.status.status === "completed");
  const hasError = phases.some(p => p.status.status === "error");

  const getLastUpdate = () => {
    const timestamps = phases
      .map(p => p.status.last_run_at)
      .filter(Boolean)
      .map(ts => new Date(ts!));
    
    if (timestamps.length === 0) return null;
    
    const latest = new Date(Math.max(...timestamps.map(d => d.getTime())));
    return latest.toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <RefreshCw className={cn("h-5 w-5", isAutoSyncing && "animate-spin")} />
            Data Sync Status
          </span>
          {isAutoSyncing && (
            <span className="text-xs font-normal text-muted-foreground">
              Auto-sync every 2 min
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Sequential sync from Noddi API: Customers → Members → Bookings → Order Lines
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {allComplete ? "✓ Sync Complete" : activePhase ? `Active: ${activePhase}` : "Waiting to start..."}
            </span>
            <span className="text-muted-foreground">
              {Math.round(overallProgress)}%
            </span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          {getLastUpdate() && (
            <p className="text-xs text-muted-foreground">
              Last updated: {getLastUpdate()}
            </p>
          )}
        </div>

        {/* Phase Details */}
        <div className="space-y-3">
          {phases.map((phase, index) => {
            const Icon = phase.icon;
            const isLast = index === phases.length - 1;
            const isRunning = phase.status.status === "running";
            const isCompleted = phase.status.status === "completed";
            const isError = phase.status.status === "error";
            const isPending = phase.status.status === "pending";
            
            return (
              <div key={phase.id} className="relative">
                {/* Connector line */}
                {!isLast && (
                  <div 
                    className={cn(
                      "absolute left-[19px] top-10 w-0.5 h-8",
                      isCompleted ? "bg-green-500" : "bg-muted"
                    )}
                  />
                )}
                
                <div className="flex items-start gap-3">
                  {/* Status Icon */}
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 border-2",
                    isCompleted && "bg-green-50 dark:bg-green-950/30 border-green-500",
                    isRunning && "bg-primary/10 border-primary",
                    isPending && "bg-muted border-muted-foreground/20",
                    isError && "bg-destructive/10 border-destructive"
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : isRunning ? (
                      <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                    ) : isError ? (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  {/* Phase Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <h4 className="font-semibold text-sm">Phase {phase.id}: {phase.label}</h4>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        isCompleted && "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
                        isRunning && "bg-primary/10 text-primary",
                        isPending && "bg-muted text-muted-foreground",
                        isError && "bg-destructive/10 text-destructive"
                      )}>
                        {phase.status.status}
                      </span>
                    </div>
                    
                    <p className="text-sm text-foreground">{phase.metric}</p>
                    {phase.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5">{phase.detail}</p>
                    )}
                    
                    {/* Running Progress */}
                    {isRunning && phase.status.estimated_total && (
                      <div className="mt-2">
                        <Progress 
                          value={(phase.status.total_records / phase.status.estimated_total) * 100} 
                          className="h-1.5"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Data Health Summary */}
        {allComplete && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-800 dark:text-green-200">
                All resources synced successfully
              </span>
            </div>
          </div>
        )}

        {hasError && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="font-medium text-destructive">
                Sync errors detected - check logs for details
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
