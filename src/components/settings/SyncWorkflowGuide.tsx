import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncWorkflowGuideProps {
  userGroupsComplete: boolean;
  customersComplete: boolean;
  bookingsComplete: boolean;
  orderLinesComplete: boolean;
  segmentsComputed?: boolean;
  isRunning: boolean;
  userGroupsStatus?: any;
  customersStatus?: any;
  bookingsStatus?: any;
  orderLinesStatus?: any;
  userGroupsInDb?: number;
  customersInDb?: number;
  bookingsInDb?: number;
  orderLinesInDb?: number;
}

export function SyncWorkflowGuide({
  userGroupsComplete,
  customersComplete,
  bookingsComplete,
  orderLinesComplete,
  segmentsComputed = false,
  isRunning,
  userGroupsStatus,
  customersStatus,
  bookingsStatus,
  orderLinesStatus,
  userGroupsInDb = 0,
  customersInDb = 0,
  bookingsInDb = 0,
  orderLinesInDb = 0,
}: SyncWorkflowGuideProps) {
  // STEP 8: Use actual status='completed', not percentages
  const allDataSynced = userGroupsComplete && customersComplete && bookingsComplete && orderLinesComplete;

  const steps = [
    {
      number: 1,
      title: "Sync Data",
      substeps: [
        { 
          label: `User Groups synced: ${userGroupsComplete ? '✓' : '⏳'} ${userGroupsInDb.toLocaleString()}`, 
          complete: userGroupsComplete,
          waiting: false,
        },
        { 
          label: `Members synced: ${customersComplete ? '✓' : '⏳'} ${customersInDb.toLocaleString()}`, 
          complete: customersComplete,
          waiting: !userGroupsComplete,
        },
        { 
          label: `Bookings synced: ${bookingsComplete ? '✓' : '⏳'} ${bookingsInDb.toLocaleString()}`, 
          complete: bookingsComplete,
          waiting: !customersComplete,
        },
        { 
          label: `Order lines extracted: ${orderLinesComplete ? '✓' : '⏳'} ${orderLinesInDb.toLocaleString()}`, 
          complete: orderLinesComplete,
          waiting: !bookingsComplete,
        },
      ],
      complete: allDataSynced,
      active: isRunning && !allDataSynced,
    },
    {
      number: 2,
      title: "Compute Segments",
      substeps: [
        { label: "Calculate customer lifecycle & value tiers", complete: segmentsComputed, waiting: !allDataSynced },
      ],
      complete: segmentsComputed,
      active: !isRunning && allDataSynced && !segmentsComputed,
    },
    {
      number: 3,
      title: "View Insights",
      substeps: [
        { label: "Analyze customer segments on Dashboard", complete: segmentsComputed, waiting: !segmentsComputed },
      ],
      complete: segmentsComputed,
      active: false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync Workflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step) => (
          <div key={step.number} className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  step.complete
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                    : step.active
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step.complete ? "✓" : step.number}
              </div>
              <h4
                className={cn(
                  "text-sm font-medium",
                  step.complete || step.active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.title}
              </h4>
              {step.active && <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />}
            </div>
            
            <div className="ml-8 space-y-1">
              {step.substeps.map((substep, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    {substep.complete ? (
                      <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                    ) : step.active && !substep.waiting ? (
                      <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                    ) : (
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        substep.complete
                          ? "text-foreground"
                          : step.active && !substep.waiting
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {substep.label}
                    </span>
                  </div>
                  {/* STEP 8: Add waiting indicators for sequential phases */}
                  {substep.waiting && !substep.complete && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 italic ml-5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Waiting for previous phase to complete...
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
