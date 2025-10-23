import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface SyncEvent {
  timestamp: Date;
  type: "success" | "error" | "running" | "pending";
  resource: string;
  message: string;
}

interface SyncHistoryCardProps {
  events: SyncEvent[];
  onReExtractOrderLines?: () => void;
  onForceFullSync?: () => void;
  onViewLogs?: () => void;
  isLoading?: boolean;
}

export function SyncHistoryCard({
  events,
  onReExtractOrderLines,
  onForceFullSync,
  onViewLogs,
  isLoading = false,
}: SyncHistoryCardProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return CheckCircle;
      case "error":
        return XCircle;
      case "running":
        return RefreshCw;
      default:
        return Clock;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case "success":
        return "text-green-500";
      case "error":
        return "text-destructive";
      case "running":
        return "text-blue-500";
      default:
        return "text-muted-foreground";
    }
  };

  const hasRecentEvents = events.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync History & Advanced Actions</CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Recent Activity */}
        <div>
          <h4 className="text-sm font-medium mb-3">Recent Activity</h4>
          {!hasRecentEvents ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recent sync activity
            </p>
          ) : (
            <div className="space-y-2">
              {events.slice(0, 5).map((event, index) => {
                const Icon = getIcon(event.type);
                const iconColor = getIconColor(event.type);

                return (
                  <div key={index} className="flex items-start gap-3 text-sm pb-2 border-b last:border-0">
                    <Icon className={cn(
                      "h-4 w-4 mt-0.5 flex-shrink-0",
                      iconColor,
                      event.type === 'running' && 'animate-spin'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-muted-foreground truncate">{event.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Advanced Actions */}
        <details className="pt-4 border-t">
          <summary className="cursor-pointer text-sm font-medium mb-3 hover:text-primary flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Advanced Actions (Use with caution)
          </summary>
          
          <div className="space-y-2 mt-3 pl-6">
            {onReExtractOrderLines && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReExtractOrderLines}
                disabled={isLoading}
                className="w-full justify-start"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-2", isLoading && "animate-spin")} />
                Re-extract Order Lines
              </Button>
            )}
            
            {onForceFullSync && (
              <Button
                variant="outline"
                size="sm"
                onClick={onForceFullSync}
                disabled={isLoading}
                className="w-full justify-start"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-2", isLoading && "animate-spin")} />
                Force Full Sync
              </Button>
            )}
            
            {onViewLogs && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewLogs}
                className="w-full justify-start"
              >
                <Clock className="h-3.5 w-3.5 mr-2" />
                View Detailed Logs
              </Button>
            )}

            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
              ⚠️ Advanced actions may affect your data. Use only when necessary.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
