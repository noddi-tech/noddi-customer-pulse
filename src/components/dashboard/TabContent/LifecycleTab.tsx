import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSegmentCounts, useInactiveCustomerCount } from "@/hooks/segmentation";
import { useLifecycleInsights } from "@/hooks/dashboardInsights";
import { EnhancedLifecycleCard } from "@/components/dashboard/EnhancedLifecycleCard";
import { ChurnTimeline } from "@/components/dashboard/ChurnTimeline";
import { TimePeriodSelector } from "@/components/dashboard/TimePeriodSelector";
import { CustomerDataTable } from "@/components/dashboard/CustomerDataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function LifecycleTab() {
  const navigate = useNavigate();
  const [timePeriod, setTimePeriod] = useState<12 | 24 | 36 | 48 | 0>(24);
  const { data: counts } = useSegmentCounts();
  const { data: inactiveCount } = useInactiveCustomerCount();
  const { data: insights } = useLifecycleInsights(timePeriod);

  const totalCustomers = counts 
    ? (counts.New || 0) + (counts.Active || 0) + (counts['At-risk'] || 0) + 
      (counts.Churned || 0) + (counts.Winback || 0) + (inactiveCount || 0)
    : 0;

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
      tooltip: "No bookings for 7-9 months. These customers can still be won back"
    },
    { 
      label: "Churned", 
      count: counts?.Churned || 0, 
      variant: "destructive" as const,
      tooltip: "No bookings for 9+ months. Requires re-engagement strategies"
    },
    { 
      label: "Winback", 
      count: counts?.Winback || 0, 
      variant: "default" as const,
      tooltip: "Previously churned customers who returned! High priority for retention"
    },
  ];

  const valueCards = [
    { label: "High Value", count: counts?.High || 0, variant: "default" as const },
    { label: "Mid Value", count: counts?.Mid || 0, variant: "secondary" as const },
    { label: "Low Value", count: counts?.Low || 0, variant: "outline" as const },
  ];

  return (
    <div className="space-y-6">
      {/* Lifecycle Distribution */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold">Lifecycle Stages</h2>
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

      <ChurnTimeline />

      {/* Value Tier Distribution */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold">Value Tiers</h2>
            <p className="text-sm text-muted-foreground">Customer spending levels</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {valueCards.map((card) => {
            const insight = getInsightForLifecycle(card.label.split(' ')[0]);
            const activeCustomers = (counts?.New || 0) + (counts?.Active || 0) + 
              (counts?.['At-risk'] || 0) + (counts?.Churned || 0) + (counts?.Winback || 0);
            
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
                    {activeCustomers > 0 ? Math.round((card.count / activeCustomers) * 100) : 0}% of active customers
                  </p>
                  {insight && (
                    <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                      <div>Avg revenue: {Math.round(insight.avg_revenue_per_booking || 0).toLocaleString()} NOK/booking</div>
                      <div>Avg bookings: {(insight.avg_frequency_24m || 0).toFixed(1)}/24mo</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Separator className="my-6" />

      <div>
        <h3 className="text-lg font-semibold mb-4">Customer Details</h3>
        <CustomerDataTable />
      </div>
    </div>
  );
}
