import { CheckCircle, XCircle, RefreshCw, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";

interface SyncEvent {
  timestamp: Date;
  type: "success" | "error" | "running" | "pending";
  resource: string;
  message: string;
}

interface SyncTimelineProps {
  events: SyncEvent[];
}

export function SyncTimeline({ events }: SyncTimelineProps) {
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

  if (events.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground text-center">No recent sync activity</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
      <div className="space-y-3">
        {events.slice(0, 5).map((event, index) => {
          const Icon = getIcon(event.type);
          const iconColor = getIconColor(event.type);

          return (
            <div key={index} className="flex items-start gap-3 text-sm">
              <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconColor} ${event.type === 'running' ? 'animate-spin' : ''}`} />
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
    </Card>
  );
}
