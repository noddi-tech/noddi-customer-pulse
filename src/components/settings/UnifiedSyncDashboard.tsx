import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, RefreshCw, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface PhaseStatus {
  resource: string;
  status?: string;
  sync_mode?: string;
  current_page?: number;
  estimated_total?: number;
  rows_fetched?: number;
  last_run_at?: string;
  progress_percentage?: number;
}

interface DiagnosticResource {
  name: string;
  status: string;
  coverage_pct?: number;
  db_count?: number;
  api_count?: number;
  missing_count?: number;
}

interface UnifiedSyncDashboardProps {
  userGroupsStatus?: PhaseStatus;
  customersStatus?: PhaseStatus;
  bookingsStatus?: PhaseStatus;
  orderLinesStatus?: PhaseStatus;
  userGroupsInDb: number;
  customersInDb: number;
  bookingsInDb: number;
  orderLinesInDb: number;
  expectedOrderLines: number;
  isRunning: boolean;
  diagnostics?: {
    resources?: DiagnosticResource[];
    overallHealth?: string;
  };
  onFixNow?: () => void;
  onViewLogs?: () => void;
}

export function UnifiedSyncDashboard({
  userGroupsStatus,
  customersStatus,
  bookingsStatus,
  orderLinesStatus,
  userGroupsInDb,
  customersInDb,
  bookingsInDb,
  orderLinesInDb,
  expectedOrderLines,
  isRunning,
  diagnostics,
  onFixNow,
  onViewLogs
}: UnifiedSyncDashboardProps) {
  
  // Determine active phase
  const getActivePhase = (): string => {
    if (userGroupsStatus?.status === 'running') return 'Phase 0: User Groups';
    if (customersStatus?.status === 'running') return 'Phase 1: Members';
    if (bookingsStatus?.status === 'running') return 'Phase 2: Bookings';
    if (orderLinesStatus?.status === 'running') return 'Phase 3: Order Lines';
    
    // Check for active full sync in pending state
    if (orderLinesStatus?.status === 'pending' && 
        orderLinesStatus?.sync_mode === 'full' && 
        (orderLinesStatus?.progress_percentage || 0) > 0) {
      return 'Phase 3: Order Lines';
    }
    
    return 'Idle';
  };

  // Calculate overall progress based on actual database counts vs estimated totals
  const getOverallProgress = (): number => {
    // Each phase contributes 25% to the overall progress
    const phase0Progress = userGroupsStatus?.estimated_total 
      ? (userGroupsInDb / userGroupsStatus.estimated_total) * 25 
      : 25; // If no estimate, assume complete
    
    const phase1Progress = customersStatus?.estimated_total 
      ? (customersInDb / customersStatus.estimated_total) * 25 
      : 25; // If no estimate, assume complete
    
    const phase2Progress = bookingsStatus?.estimated_total 
      ? (bookingsInDb / bookingsStatus.estimated_total) * 25 
      : 0; // If no estimate, assume 0
    
    const phase3Progress = expectedOrderLines > 0
      ? (orderLinesInDb / expectedOrderLines) * 25
      : 0; // If no expected lines, assume 0
    
    return Math.round(Math.min(phase0Progress + phase1Progress + phase2Progress + phase3Progress, 100));
  };

  // Get last update time
  const getLastUpdate = (): Date | null => {
    const times = [
      userGroupsStatus?.last_run_at,
      customersStatus?.last_run_at,
      bookingsStatus?.last_run_at,
      orderLinesStatus?.last_run_at
    ].filter(Boolean).map(t => new Date(t!));
    
    return times.length > 0 ? new Date(Math.max(...times.map(t => t.getTime()))) : null;
  };

  // Estimate time remaining for active phase
  const getEstimatedTime = (status?: PhaseStatus): string | null => {
    if (!status || status.status !== 'running') return null;
    if (!status.estimated_total || !status.rows_fetched) return null;
    
    const remaining = status.estimated_total - status.rows_fetched;
    // Assuming ~1000 records per 2 minutes
    const minutes = Math.ceil((remaining / 1000) * 2);
    
    if (minutes < 1) return '< 1 minute';
    if (minutes === 1) return '1 minute';
    return `~${minutes} minutes`;
  };

  const activePhase = getActivePhase();
  const overallProgress = getOverallProgress();
  const lastUpdate = getLastUpdate();

  // Check for coverage issues
  const hasCoverageIssues = Array.isArray(diagnostics?.resources) && diagnostics.resources.some(r => 
    r.status === 'missing_data' || (r.coverage_pct && r.coverage_pct < 95)
  );

  return (
    <Card className="border-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            )}
            Unified Sync Dashboard
          </div>
          {lastUpdate && (
            <span className="text-xs text-muted-foreground font-normal">
              Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Overall Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall Status:</span>
            <span className={cn(
              "font-semibold",
              isRunning ? "text-primary" : "text-muted-foreground"
            )}>
              {isRunning ? `Syncing (${overallProgress}% complete)` : 'Idle'}
            </span>
          </div>
          
          <Progress value={overallProgress} className="h-2" />
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Active Phase: {activePhase}</span>
            {isRunning && (
              <span className="text-green-600 dark:text-green-400">
                ✓ Auto-syncing every 2 minutes
              </span>
            )}
          </div>
        </div>

        {/* Phase Progress */}
        <div className="space-y-4 pt-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Phase Progress (Sequential):</h4>
          
          {/* Phase 0: User Groups */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {userGroupsStatus?.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : userGroupsStatus?.status === 'running' ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">Phase 0: User Groups</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {userGroupsStatus?.sync_mode === 'full' ? 'Full sync' : 'Incremental'}
              </span>
            </div>
            
            {userGroupsStatus?.status === 'completed' ? (
              <div className="text-xs text-muted-foreground pl-6">
                ✓ {userGroupsInDb.toLocaleString()} records in database
              </div>
            ) : userGroupsStatus?.status === 'running' ? (
              <>
                <Progress value={(userGroupsStatus as any)?.progress_percentage || 0} className="h-2" />
                <div className="text-xs text-muted-foreground pl-6">
                  {userGroupsInDb.toLocaleString()} / {userGroupsStatus.estimated_total?.toLocaleString() || 0} records
                  {getEstimatedTime(userGroupsStatus) && (
                    <span className="ml-2">• {getEstimatedTime(userGroupsStatus)} remaining</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground pl-6 opacity-70">
                  Current run: +{userGroupsStatus.rows_fetched?.toLocaleString() || 0} fetched (page {userGroupsStatus.current_page})
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground pl-6">Pending</div>
            )}
          </div>

          {/* Phase 1: Members - Only show if Phase 0 is completed */}
          {userGroupsStatus?.status === 'completed' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {customersStatus?.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : customersStatus?.status === 'running' ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">Phase 1: Members</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {customersStatus?.sync_mode === 'full' ? 'Full sync' : 'Incremental'}
                </span>
              </div>
              
              {customersStatus?.status === 'completed' ? (
                <div className="text-xs text-muted-foreground pl-6">
                  ✓ {customersInDb.toLocaleString()} records in database
                </div>
              ) : customersStatus?.status === 'running' ? (
                <>
                  <Progress value={(customersStatus as any)?.progress_percentage || 0} className="h-2" />
                  <div className="text-xs text-muted-foreground pl-6">
                    {customersInDb.toLocaleString()} / {customersStatus.estimated_total?.toLocaleString() || 0} records
                    {getEstimatedTime(customersStatus) && (
                      <span className="ml-2">• {getEstimatedTime(customersStatus)} remaining</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground pl-6 opacity-70">
                    Current run: +{customersStatus.rows_fetched?.toLocaleString() || 0} fetched (page {customersStatus.current_page})
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground pl-6">
                  Will start after User Groups complete
                </div>
              )}
            </div>
          )}

          {/* Phase 2: Bookings - Only show if Phase 1 is completed */}
          {customersStatus?.status === 'completed' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {bookingsStatus?.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : bookingsStatus?.status === 'running' ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">Phase 2: Bookings</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {bookingsStatus?.sync_mode === 'full' ? 'Full sync' : 'Incremental'}
                  {bookingsStatus?.current_page && ` from page ${bookingsStatus.current_page}`}
                </span>
              </div>
              
              {bookingsStatus?.status === 'completed' ? (
                <div className="text-xs text-muted-foreground pl-6">
                  ✓ {bookingsInDb.toLocaleString()} records in database
                </div>
              ) : bookingsStatus?.status === 'running' ? (
                <>
                  <Progress value={(bookingsStatus as any)?.progress_percentage || 0} className="h-2" />
                  <div className="text-xs text-muted-foreground pl-6">
                    {bookingsInDb.toLocaleString()} / {bookingsStatus.estimated_total?.toLocaleString() || 0} records
                    {getEstimatedTime(bookingsStatus) && (
                      <span className="ml-2">• {getEstimatedTime(bookingsStatus)} remaining</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground pl-6 opacity-70">
                    Current run: +{bookingsStatus.rows_fetched?.toLocaleString() || 0} fetched (page {bookingsStatus.current_page})
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground pl-6">
                  Will start after Members complete
                </div>
              )}
            </div>
          )}

          {/* Phase 3: Order Lines - Only show if Phase 2 is completed */}
          {bookingsStatus?.status === 'completed' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {orderLinesStatus?.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : orderLinesStatus?.status === 'running' ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">Phase 3: Order Lines</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Extracted from bookings
                </span>
              </div>
              
              {orderLinesStatus?.status === 'completed' ? (
                <div className="text-xs text-muted-foreground pl-6">
                  ✓ {orderLinesInDb.toLocaleString()} records in database
                </div>
              ) : orderLinesStatus?.status === 'running' ? (
                <>
                  <Progress value={(orderLinesStatus as any)?.progress_percentage || 0} className="h-2" />
                  <div className="text-xs text-muted-foreground pl-6">
                    {orderLinesInDb.toLocaleString()} / {expectedOrderLines.toLocaleString()} records
                    {getEstimatedTime(orderLinesStatus) && (
                      <span className="ml-2">• {getEstimatedTime(orderLinesStatus)} remaining</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground pl-6">
                  Will start after Bookings complete
                </div>
              )}
            </div>
          )}
        </div>

        {/* Data Health Summary */}
        {Array.isArray(diagnostics?.resources) && diagnostics.resources.length > 0 && (
          <div className="pt-4 border-t space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Data Health:</h4>
            
            <div className="space-y-2">
              {diagnostics.resources.map((resource) => (
                <div key={resource.name} className="flex items-center justify-between text-xs">
                  <span className="font-medium">{resource.name}:</span>
                  <div className="flex items-center gap-2">
                    {resource.status === 'healthy' ? (
                      <span className="text-green-600 dark:text-green-400">
                        ✓ {resource.coverage_pct?.toFixed(1)}% coverage ({resource.db_count?.toLocaleString()})
                      </span>
                    ) : resource.status === 'missing_data' ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        ⚠️ {resource.coverage_pct?.toFixed(1)}% coverage ({resource.db_count?.toLocaleString()}/{resource.api_count?.toLocaleString()})
                        <span className="ml-1 text-destructive">
                          Missing {resource.missing_count?.toLocaleString()}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Checking...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hasCoverageIssues && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Data Coverage Issues Detected</AlertTitle>
                <AlertDescription className="text-xs">
                  Some resources have missing records. This may be due to API errors during sync.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {hasCoverageIssues && onFixNow && (
            <Button size="sm" onClick={onFixNow} variant="default">
              Fix Coverage Issues
            </Button>
          )}
          {onViewLogs && (
            <Button size="sm" variant="outline" onClick={onViewLogs}>
              <ExternalLink className="h-3 w-3 mr-1" />
              View Logs
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
