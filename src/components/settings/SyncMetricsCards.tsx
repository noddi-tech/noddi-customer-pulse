import { Card } from "@/components/ui/card";
import { Users, Calendar, ShoppingCart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SyncMetricsCardsProps {
  userGroupsActive: number;
  userGroupsTotal: number;
  userGroupsB2B: number;
  userGroupsB2C: number;
  bookingsCount: number;
  bookingsTotal: number;
  bookingsWithUser: number;
  orderLines: number;
  orderLinesTotal: number;
  expectedOrderLines: number;
  lastSync: string | null;
}

export function SyncMetricsCards({
  userGroupsActive,
  userGroupsTotal,
  userGroupsB2B,
  userGroupsB2C,
  bookingsCount,
  bookingsTotal,
  bookingsWithUser,
  orderLines,
  orderLinesTotal,
  expectedOrderLines,
  lastSync,
}: SyncMetricsCardsProps) {
  // STEP 6: Fix Metrics Cards Terminology - clarify "synced from API" vs "active (computed)"
  const orderLinesComplete = orderLines >= expectedOrderLines * 0.9;
  const metrics = [
    {
      label: "User Groups Synced",
      value: userGroupsTotal.toLocaleString(),
      subtitle: `${userGroupsB2B} B2B, ${userGroupsB2C.toLocaleString()} B2C`,
      tooltip: "Total user groups (primary customers) synced from Noddi API",
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Bookings Synced",
      value: bookingsTotal.toLocaleString(),
      subtitle: `${bookingsWithUser.toLocaleString()} mapped to users`,
      tooltip: "Total bookings synced from Noddi API (includes all statuses)",
      icon: Calendar,
      color: "text-green-600 dark:text-green-400",
    },
    {
      label: "Order Lines Extracted",
      value: orderLines.toLocaleString(),
      subtitle: orderLinesComplete 
        ? `✓ From ${expectedOrderLines.toLocaleString()} bookings` 
        : `⏳ Processing ${expectedOrderLines.toLocaleString()} bookings...`,
      tooltip: "Order lines extracted from bookings (1+ per booking)",
      icon: ShoppingCart,
      color: orderLinesComplete ? "text-purple-600 dark:text-purple-400" : "text-orange-600 dark:text-orange-400",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Database Metrics</h3>
        {lastSync && (
          <p className="text-xs text-muted-foreground">
            Last sync: {new Date(lastSync).toLocaleString()}
          </p>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Tooltip key={metric.label}>
              <TooltipTrigger asChild>
                <Card className="p-3 cursor-help">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-4 w-4 ${metric.color}`} />
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                  </div>
                  <p className="text-lg font-bold">{metric.value}</p>
                  {metric.subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">{metric.subtitle}</p>
                  )}
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{metric.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
