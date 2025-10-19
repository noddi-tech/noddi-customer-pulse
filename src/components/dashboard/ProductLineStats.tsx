import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProductLineStats } from "@/hooks/dashboardInsights";
import { Wrench, Package, Truck, Star } from "lucide-react";

export function ProductLineStats() {
  const { data: stats, isLoading } = useProductLineStats();

  if (isLoading || !stats) {
    return null;
  }

  const productLines = [
    {
      label: "Tire Service Customers",
      count: stats.tire_service_customers,
      icon: Wrench,
      description: "Have used tire change services",
    },
    {
      label: "Storage Customers",
      count: stats.storage_customers,
      icon: Package,
      description: "Active or past storage program",
    },
    {
      label: "Fleet Customers",
      count: stats.fleet_customers,
      icon: Truck,
      description: "3+ car wash bookings",
    },
    {
      label: "Multi-Service",
      count: stats.multi_service_customers,
      icon: Star,
      description: "Using 2+ service categories",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Line Intelligence</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {productLines.map((line) => (
            <div
              key={line.label}
              className="flex flex-col space-y-2 rounded-lg border bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <line.icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{line.label}</span>
              </div>
              <div className="text-2xl font-bold">{line.count.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{line.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
