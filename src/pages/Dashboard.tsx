import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSegmentCounts, useCustomers } from "@/hooks/segmentation";
import { useSyncNow, useComputeSegments } from "@/hooks/edgeFunctions";
import { Users, TrendingUp, AlertTriangle, X, RefreshCw } from "lucide-react";
import { CacheIndicator } from "@/components/CacheIndicator";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: counts, refetch, isRefetching, dataUpdatedAt } = useSegmentCounts();
  const { data: allCustomers } = useCustomers();
  const syncMutation = useSyncNow();
  const computeMutation = useComputeSegments();

  const totalCustomers = allCustomers?.length || 0;
  const lifecycleCards = [
    { label: "New", count: counts?.New || 0, color: "bg-blue-500", variant: "default" as const },
    { label: "Active", count: counts?.Active || 0, color: "bg-green-500", variant: "default" as const },
    { label: "At-risk", count: counts?.["At-risk"] || 0, color: "bg-yellow-500", variant: "default" as const },
    { label: "Churned", count: counts?.Churned || 0, color: "bg-red-500", variant: "destructive" as const },
    { label: "Winback", count: counts?.Winback || 0, color: "bg-purple-500", variant: "default" as const },
  ];

  const valueCards = [
    { label: "High Value", count: counts?.High || 0, variant: "default" as const },
    { label: "Mid Value", count: counts?.Mid || 0, variant: "secondary" as const },
    { label: "Low Value", count: counts?.Low || 0, variant: "outline" as const },
  ];

  const handleRefresh = async () => {
    await syncMutation.mutateAsync();
    await computeMutation.mutateAsync();
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Customer segmentation overview</p>
        </div>
        <div className="flex items-center gap-4">
          <CacheIndicator
            lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined}
            onRefresh={handleRefresh}
            isRefreshing={syncMutation.isPending || computeMutation.isPending}
          />
          <Button onClick={handleRefresh} disabled={syncMutation.isPending || computeMutation.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending || computeMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Total Customers Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Total Customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{totalCustomers.toLocaleString()}</div>
        </CardContent>
      </Card>

      {/* Lifecycle Distribution */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Lifecycle Distribution</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {lifecycleCards.map((card) => (
            <Card
              key={card.label}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/customers?lifecycle=${card.label}`)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  {card.label}
                  <Badge variant={card.variant}>{card.label}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{card.count.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalCustomers > 0 ? Math.round((card.count / totalCustomers) * 100) : 0}% of total
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Value Tier Distribution */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Value Tier Distribution</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {valueCards.map((card) => (
            <Card
              key={card.label}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/customers?value_tier=${card.label.split(' ')[0]}`)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  {card.label}
                  <Badge variant={card.variant}>{card.label.split(' ')[0]}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{card.count.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalCustomers > 0 ? Math.round((card.count / totalCustomers) * 100) : 0}% of total
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
