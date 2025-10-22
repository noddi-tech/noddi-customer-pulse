import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSegmentCounts, useInactiveCustomerCount } from "@/hooks/segmentation";
import { useSyncNow, useComputeSegments } from "@/hooks/edgeFunctions";
import { useLifecycleInsights } from "@/hooks/dashboardInsights";
import { Users, RefreshCw, UserX } from "lucide-react";
import { CacheIndicator } from "@/components/CacheIndicator";
import { LifecycleExplainer } from "@/components/dashboard/LifecycleExplainer";
import { EnhancedLifecycleCard } from "@/components/dashboard/EnhancedLifecycleCard";
import { ChurnTimeline } from "@/components/dashboard/ChurnTimeline";
import { ProductLineStats } from "@/components/dashboard/ProductLineStats";
import { ActionableInsights } from "@/components/dashboard/ActionableInsights";
import { 
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: counts, refetch, isRefetching, dataUpdatedAt } = useSegmentCounts();
  const { data: inactiveCount } = useInactiveCustomerCount();
  const { data: insights } = useLifecycleInsights();
  const syncMutation = useSyncNow();
  const computeMutation = useComputeSegments();

  const activeCustomers = counts 
    ? (counts.New || 0) + (counts.Active || 0) + (counts['At-risk'] || 0) + 
      (counts.Churned || 0) + (counts.Winback || 0)
    : 0;
  
  const totalCustomers = activeCustomers + (inactiveCount || 0);
  
  const getInsightForLifecycle = (lifecycle: string) => {
    return insights?.find((i) => i.lifecycle === lifecycle);
  };
  const lifecycleCards = [
    { 
      label: "New", 
      count: counts?.New || 0, 
      variant: "default" as const,
      tooltip: "Customers who made their first booking within the last 90 days"
    },
    { 
      label: "Active", 
      count: counts?.Active || 0, 
      variant: "default" as const,
      tooltip: "Customers with any booking in last 7 months, or active storage relationship"
    },
    { 
      label: "At-risk", 
      count: counts?.["At-risk"] || 0, 
      variant: "secondary" as const,
      tooltip: "No bookings for 7-9 months. These customers can still be won back with targeted campaigns"
    },
    { 
      label: "Churned", 
      count: counts?.Churned || 0, 
      variant: "destructive" as const,
      tooltip: "No bookings for 9+ months. Requires stronger re-engagement strategies"
    },
    { 
      label: "Winback", 
      count: counts?.Winback || 0, 
      variant: "default" as const,
      tooltip: "Previously churned customers who have returned"
    },
  ];

  const valueCards = [
    { label: "High Value", count: counts?.High || 0, variant: "default" as const },
    { label: "Mid Value", count: counts?.Mid || 0, variant: "secondary" as const },
    { label: "Low Value", count: counts?.Low || 0, variant: "outline" as const },
  ];

  const handleRefresh = async () => {
    await syncMutation.mutateAsync();
    await computeMutation.mutateAsync({});
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

      {/* Lifecycle Explainer */}
      <LifecycleExplainer />

      {/* Total Customers Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Total Customers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-4xl font-bold">{totalCustomers.toLocaleString()}</div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Users className="h-4 w-4" />
                With Bookings
              </div>
              <div className="text-2xl font-semibold">{activeCustomers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0}% of total
              </p>
            </div>
            
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <UserX className="h-4 w-4" />
                <span>Inactive</span>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="text-xs cursor-help">ℹ️</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Registered but never booked</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-2xl font-semibold">{(inactiveCount || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalCustomers > 0 ? Math.round(((inactiveCount || 0) / totalCustomers) * 100) : 0}% of total
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lifecycle Distribution */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Lifecycle Distribution</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {lifecycleCards.map((card) => {
            const insight = getInsightForLifecycle(card.label);
            return (
              <EnhancedLifecycleCard
                key={card.label}
                label={card.label}
                count={card.count}
                variant={card.variant}
                totalCustomers={totalCustomers}
                avgRecencyDays={insight?.avg_recency_days}
                avgFrequency={insight?.avg_frequency_24m}
                avgRevenue={insight?.avg_revenue_per_booking}
                onClick={() => navigate(`/customers?lifecycle=${card.label}`)}
                tooltipText={card.tooltip}
              />
            );
          })}
        </div>
      </div>

      {/* Churn Timeline */}
      <ChurnTimeline />

      {/* Actionable Insights */}
      <ActionableInsights />

      {/* Value Tier Distribution */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Value Tier Distribution</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {valueCards.map((card) => {
            const insight = getInsightForLifecycle(card.label.split(' ')[0]);
            return (
              <Card
                key={card.label}
                className="cursor-pointer transition-shadow hover:shadow-lg"
                onClick={() => navigate(`/customers?value_tier=${card.label.split(' ')[0]}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    {card.label}
                    <Badge variant={card.variant}>{card.label.split(' ')[0]}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-bold">{card.count.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    {activeCustomers > 0 ? Math.round((card.count / activeCustomers) * 100) : 0}% of customers with bookings
                  </p>
                  {insight && (
                    <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                      <div>Avg revenue: {Math.round(insight.avg_frequency_24m > 0 ? insight.avg_revenue_per_booking : 0).toLocaleString()} NOK/booking</div>
                      <div>Avg bookings: {insight.avg_frequency_24m.toFixed(1)}/24mo</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Product Line Intelligence */}
      <ProductLineStats />
    </div>
  );
}
