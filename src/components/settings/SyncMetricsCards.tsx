import { Card } from "@/components/ui/card";
import { Users, Calendar, DollarSign, Database } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncMetricsCardsProps {
  customersTotal: number;
  bookingsTotal: number;
  bookingsWithUser: number;
  orderLines: number;
  lastSyncAt?: Date;
}

export function SyncMetricsCards({
  customersTotal,
  bookingsTotal,
  bookingsWithUser,
  orderLines,
  lastSyncAt,
}: SyncMetricsCardsProps) {
  const metrics = [
    {
      label: "Total Customers",
      value: customersTotal.toLocaleString(),
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Total Bookings",
      value: bookingsTotal.toLocaleString(),
      icon: Calendar,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      label: "Mapped Bookings",
      value: bookingsWithUser.toLocaleString(),
      icon: DollarSign,
      color: "text-green-600 dark:text-green-400",
    },
    {
      label: "Order Lines",
      value: orderLines.toLocaleString(),
      icon: Database,
      color: "text-orange-600 dark:text-orange-400",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Database Metrics</h3>
        {lastSyncAt && (
          <p className="text-xs text-muted-foreground">
            Updated {formatDistanceToNow(lastSyncAt, { addSuffix: true })}
          </p>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${metric.color}`} />
                <p className="text-xs text-muted-foreground">{metric.label}</p>
              </div>
              <p className="text-lg font-bold">{metric.value}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
