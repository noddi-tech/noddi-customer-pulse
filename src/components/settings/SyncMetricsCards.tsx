import { Card } from "@/components/ui/card";
import { Users, Calendar, ShoppingCart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SyncMetricsCardsProps {
  customersCount: number;
  customersTotal: number;
  bookingsCount: number;
  bookingsTotal: number;
  bookingsWithUser: number;
  orderLines: number;
  orderLinesTotal: number;
  expectedOrderLines: number;
  lastSync: string | null;
}

export function SyncMetricsCards({
  customersCount,
  customersTotal,
  bookingsCount,
  bookingsTotal,
  bookingsWithUser,
  orderLines,
  orderLinesTotal,
  expectedOrderLines,
  lastSync,
}: SyncMetricsCardsProps) {
  const orderLinesComplete = orderLines >= expectedOrderLines * 0.9;
  const metrics = [
    {
      label: "Active Customers",
      value: customersCount.toLocaleString(),
      total: customersTotal,
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
      tooltip: "Customers with at least one active booking (excludes cancelled/unable-to-complete)",
    },
    {
      label: "Active Bookings",
      value: bookingsCount.toLocaleString(),
      total: bookingsTotal,
      icon: Calendar,
      color: "text-green-600 dark:text-green-400",
      subtitle: `${bookingsWithUser.toLocaleString()} with user mapping`,
      tooltip: "Bookings in Draft/Confirmed/Assigned/Completed status (excludes cancelled/unable-to-complete)",
    },
    {
      label: "Active Order Lines",
      value: orderLines.toLocaleString(),
      total: orderLinesTotal,
      icon: ShoppingCart,
      color: orderLinesComplete ? "text-purple-600 dark:text-purple-400" : "text-orange-600 dark:text-orange-400",
      subtitle: orderLinesComplete 
        ? `✓ From ${expectedOrderLines.toLocaleString()} bookings` 
        : `Processing ${expectedOrderLines.toLocaleString()} bookings...`,
      tooltip: "Order lines from active bookings with positive amounts",
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
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-bold">{metric.value}</p>
                    {metric.total && metric.total !== parseInt(metric.value.replace(/,/g, '')) && (
                      <p className="text-xs text-muted-foreground">
                        / {metric.total.toLocaleString()} total
                      </p>
                    )}
                  </div>
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
