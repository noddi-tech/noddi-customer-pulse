import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, RefreshCw, WrenchIcon } from "lucide-react";
import { useForceFullSync, useSyncDiagnostics } from "@/hooks/edgeFunctions";
import { Skeleton } from "@/components/ui/skeleton";

export function SyncDiagnosticPanel() {
  const { data: diagnostics, isLoading, error, refetch, failureCount } = useSyncDiagnostics();
  const forceFullSync = useForceFullSync();
  const [fixingResource, setFixingResource] = useState<string | null>(null);

  // Detect if this is a deployment issue
  const isDeploymentIssue = error && (error as any)?.isDeploymentIssue;
  const isRetrying = failureCount > 0 && failureCount < 3;

  const handleFix = async (resource: string) => {
    setFixingResource(resource);
    try {
      await forceFullSync.mutateAsync({ resource, trigger_sync: true });
      // Refetch diagnostics after fix
      setTimeout(() => refetch(), 2000);
    } finally {
      setFixingResource(null);
    }
  };

  // Deployment status UI
  if (isDeploymentIssue || isRetrying) {
    return (
      <Card className="border-yellow-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />
            Deploying Sync Diagnostics...
          </CardTitle>
          <CardDescription>
            {isRetrying 
              ? `Checking deployment status (attempt ${failureCount}/3)...`
              : 'Edge functions are being deployed. This usually takes 2-3 minutes.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p>The sync health dashboard is currently deploying.</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>Waiting for edge function deployment...</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="mt-2"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Check Again
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync Health Dashboard</CardTitle>
          <CardDescription>Checking data coverage...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!diagnostics?.ok || error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2">
            <p>Failed to load sync diagnostics: {(error as any)?.message || 'Unknown error'}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'incomplete':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const resources = [
    { key: 'user_groups', label: 'User Groups' },
    { key: 'customers', label: 'Customers' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'order_lines', label: 'Order Lines' }
  ];

  return (
    <Card className={diagnostics.action_required ? 'border-destructive' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Sync Health Dashboard
              {diagnostics.overall_health === 'healthy' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </CardTitle>
            <CardDescription>
              Data coverage analysis • Last checked: {new Date(diagnostics.timestamp).toLocaleTimeString()}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {resources.map(({ key, label }) => {
          const resource = diagnostics.resources[key];
          if (!resource) return null;

          const showFix = resource.fix && resource.status === 'incomplete';
          const isFixing = fixingResource === key;

          return (
            <div
              key={key}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                {getStatusIcon(resource.status)}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{label}</span>
                    {resource.sync_mode && (
                      <span className="text-xs text-muted-foreground">
                        ({resource.sync_mode})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    {resource.api_total > 0 && (
                      <span>
                        {resource.db_total.toLocaleString()} / {resource.api_total.toLocaleString()}
                      </span>
                    )}
                    {!resource.api_total && (
                      <span>{resource.db_total.toLocaleString()} records</span>
                    )}
                    <span
                      className={
                        resource.coverage >= 98
                          ? 'text-green-500 font-medium'
                          : resource.coverage >= 90
                          ? 'text-yellow-500 font-medium'
                          : 'text-destructive font-medium'
                      }
                    >
                      {resource.coverage}%
                    </span>
                  </div>
                  {resource.missing && resource.missing > 0 && (
                    <p className="text-sm text-destructive mt-1">
                      ⚠️ {resource.missing.toLocaleString()} records missing
                    </p>
                  )}
                  {resource.watermark_age_hours && resource.watermark_age_hours > 24 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last incremental: {Math.round(resource.watermark_age_hours)} hours ago
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {resource.status === 'healthy' && (
                  <span className="text-xs text-green-500">✓</span>
                )}
                {showFix && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleFix(key)}
                    disabled={isFixing || forceFullSync.isPending}
                  >
                    {isFixing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Fixing...
                      </>
                    ) : (
                      <>
                        <WrenchIcon className="h-4 w-4 mr-2" />
                        Fix Now
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {diagnostics.action_required && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Action Required:</strong> Some resources have incomplete data coverage. 
              Click "Fix Now" to run a full historical sync and recover missing records.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
