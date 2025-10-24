import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RefreshCw, CheckCircle2, AlertCircle, Info, Clock } from "lucide-react";
import { useCronJobs, useRecentCronRuns } from "@/hooks/edgeFunctions";
import { getNextCronRunTime } from "@/utils/cronUtils";
import { formatDistanceToNow } from "date-fns";

interface AutoSyncStatusCardProps {
  onManualSync: () => void;
  isSyncing: boolean;
}

export function AutoSyncStatusCard({ onManualSync, isSyncing }: AutoSyncStatusCardProps) {
  const { data: cronJobs, isLoading: jobsLoading } = useCronJobs();
  const { data: recentRuns, isLoading: runsLoading } = useRecentCronRuns(5);
  
  // Find the sync job
  const syncJob = cronJobs?.find(job => job.jobname === 'auto-sync-noddi-data');
  const analysisJob = cronJobs?.find(job => job.jobname === 'auto-run-analysis');
  
  // Calculate next run time
  const nextRunTime = syncJob?.schedule ? getNextCronRunTime(syncJob.schedule) : null;
  
  // Get last run from sync job
  const lastSyncRun = recentRuns?.find(run => run.jobid === syncJob?.jobid);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Automated Sync
        </CardTitle>
        <CardDescription>
          Automatic data synchronization runs every 2 hours
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <Badge variant={syncJob?.active ? "default" : "destructive"}>
            {syncJob?.active ? "Active" : "Inactive"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Runs every 2 hours
          </span>
        </div>
        
        {/* Next Run Info */}
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Next Sync
            </Label>
            <p className="text-sm font-medium">
              {nextRunTime ? formatDistanceToNow(nextRunTime, { addSuffix: true }) : 'Not scheduled'}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Last Auto-Run</Label>
            <p className="text-sm font-medium">
              {lastSyncRun?.start_time ? formatDistanceToNow(new Date(lastSyncRun.start_time), { addSuffix: true }) : 'Never'}
            </p>
          </div>
        </div>
        
        {/* Manual Trigger Button */}
        <Button 
          onClick={onManualSync}
          disabled={isSyncing}
          variant="outline"
          className="w-full"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? "Syncing..." : "Trigger Sync Now"}
        </Button>
        
        {/* Recent Execution History */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Recent Auto-Runs</Label>
          <div className="space-y-2">
            {recentRuns && recentRuns.length > 0 ? (
              recentRuns.map((run) => (
                <div key={run.runid} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    {run.status === 'succeeded' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(run.start_time), { addSuffix: true })}
                      </span>
                      {run.status !== 'succeeded' && run.return_message && (
                        <span className="text-xs text-destructive">{run.return_message}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {run.end_time ? 
                      `${((new Date(run.end_time).getTime() - new Date(run.start_time).getTime()) / 1000).toFixed(1)}s` 
                      : 'Running...'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground p-2">No execution history yet</p>
            )}
          </div>
        </div>
        
        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>How it works</AlertTitle>
          <AlertDescription className="text-xs">
            Automated sync runs every 2 hours to fetch new/updated data from Noddi. 
            Analysis pipeline runs 10 minutes after each sync completes. 
            You can trigger a manual sync anytime using the button above.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
