import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSegmentCounts, useInactiveCustomerCount } from "@/hooks/segmentation";
import { useSyncNow, useComputeSegments } from "@/hooks/edgeFunctions";
import { useLifecycleInsights } from "@/hooks/dashboardInsights";
import { usePyramidTierCounts, useDormantCounts } from "@/hooks/pyramidSegmentation";
import { Users, RefreshCw, UserX, Info } from "lucide-react";
import { CacheIndicator } from "@/components/CacheIndicator";
import { EnhancedLifecycleCard } from "@/components/dashboard/EnhancedLifecycleCard";
import { ChurnTimeline } from "@/components/dashboard/ChurnTimeline";
import { ProductLineStats } from "@/components/dashboard/ProductLineStats";
import { ActionableInsights } from "@/components/dashboard/ActionableInsights";
import { TimePeriodSelector } from "@/components/dashboard/TimePeriodSelector";
import { PyramidVisualization } from "@/components/dashboard/PyramidVisualization";
import { CustomerSegmentBreakdown } from "@/components/dashboard/CustomerSegmentBreakdown";
import { PyramidExplainer } from "@/components/dashboard/PyramidExplainer";
import { PyramidHealthCard } from "@/components/dashboard/PyramidHealthCard";
import { PyramidActionableInsights } from "@/components/dashboard/PyramidActionableInsights";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Dashboard() {
  const navigate = useNavigate();
  const [timePeriod, setTimePeriod] = useState<12 | 24 | 36 | 48 | 0>(24);
  const { data: counts, refetch, isRefetching, dataUpdatedAt } = useSegmentCounts();
  const { data: inactiveCount } = useInactiveCustomerCount();
  const { data: insights } = useLifecycleInsights(timePeriod);
  const { data: tierCounts } = usePyramidTierCounts();
  const { data: dormantCounts } = useDormantCounts();
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
      tooltip: "🎉 Previously churned customers who returned! High priority for retention campaigns - they've given you a second chance"
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
          <p className="text-muted-foreground">Customer insights at a glance</p>
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

      {/* KPI Summary Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCustomers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeCustomers.toLocaleString()} with bookings
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Champions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{tierCounts?.Champion || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Your best customers</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">At-Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{counts?.['At-risk'] || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Need attention soon</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Salvageable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{dormantCounts?.salvageable || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Win-back opportunity</p>
          </CardContent>
        </Card>
      </div>

      {/* Actionable Insights - MOVED TO TOP */}
      <ActionableInsights />
      <PyramidActionableInsights />

      {/* Lifecycle Distribution */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold">Customer Lifecycle</h2>
            <p className="text-sm text-muted-foreground">Where customers are in their journey</p>
          </div>
          <div className="flex items-center gap-3">
            <TimePeriodSelector selected={timePeriod} onChange={setTimePeriod} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-sm">
                  <p className="font-semibold mb-2">Lifecycle Stages:</p>
                  <ul className="space-y-1 text-xs">
                    <li><strong>New:</strong> First booking &lt;90 days ago</li>
                    <li><strong>Active:</strong> Booked within last 7 months</li>
                    <li><strong>At-risk:</strong> 7-9 months since last booking</li>
                    <li><strong>Churned:</strong> 9+ months inactive</li>
                    <li><strong>Winback:</strong> Returned after being churned</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
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
                timePeriod={timePeriod}
              />
            );
          })}
        </div>
      </div>

      {/* Churn Timeline */}
      <ChurnTimeline />

      {/* Value Tier Distribution */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold">Value Tiers</h2>
            <p className="text-sm text-muted-foreground">Customer spending levels</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-sm">
                <p className="text-xs">Based on 24-month revenue and lifetime value</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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

      {/* Pyramid Segmentation */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold">Customer Value Pyramid</h2>
            <p className="text-sm text-muted-foreground">4-tier engagement model for targeted marketing</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-md">
                <p className="font-semibold mb-2">How the pyramid works:</p>
                <ul className="space-y-1 text-xs">
                  <li>🏆 <strong>Champions:</strong> Best customers - high value, frequent visits</li>
                  <li>💙 <strong>Loyalists:</strong> Regular repeat customers</li>
                  <li>✨ <strong>Engaged:</strong> Building relationship</li>
                  <li>🌱 <strong>Prospects:</strong> New or one-time visitors</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        <PyramidExplainer />
        
        <div className="grid gap-6 lg:grid-cols-3 mt-6">
          <PyramidVisualization />
          <CustomerSegmentBreakdown />
          <PyramidHealthCard />
        </div>
      </div>
    </div>
  );
}
