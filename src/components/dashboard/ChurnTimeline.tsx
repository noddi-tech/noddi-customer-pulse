import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useChurnTimeline } from "@/hooks/dashboardInsights";
import { TrendingDown } from "lucide-react";

export function ChurnTimeline() {
  const { data: timeline, isLoading } = useChurnTimeline();

  if (isLoading || !timeline || timeline.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-destructive" />
          Churned Customer Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {timeline.map((period) => (
            <div
              key={period.churn_period}
              className="flex flex-col space-y-2 rounded-lg border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{period.churn_period}</span>
                <Badge variant={period.period_order === 1 ? "default" : "secondary"}>
                  {period.period_order === 1 ? "Recent" : "Long-term"}
                </Badge>
              </div>
              <div className="text-2xl font-bold">{period.customer_count.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {period.period_order === 1 ? "Higher win-back potential" : "Needs stronger incentives"}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
