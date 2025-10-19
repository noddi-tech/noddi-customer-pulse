import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSegmentCounts } from "@/hooks/segmentation";
import { useChurnTimeline } from "@/hooks/dashboardInsights";
import { Lightbulb, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ActionableInsights() {
  const { data: counts } = useSegmentCounts();
  const { data: timeline } = useChurnTimeline();
  const navigate = useNavigate();

  const atRiskCount = counts?.["At-risk"] || 0;
  const newCount = counts?.New || 0;
  const recentlyChurned = timeline?.find((p) => p.period_order === 1)?.customer_count || 0;

  const insights = [
    {
      condition: atRiskCount > 0,
      title: `${atRiskCount} At-risk customers need attention`,
      description: "7-9 months inactive",
      action: "Send re-engagement campaign",
      onClick: () => navigate("/customers?lifecycle=At-risk"),
    },
    {
      condition: recentlyChurned > 0,
      title: `${recentlyChurned} recently churned customers`,
      description: "9-12 months inactive",
      action: "High win-back potential with seasonal offer",
      onClick: () => navigate("/customers?lifecycle=Churned"),
    },
    {
      condition: newCount > 0,
      title: `${newCount} new customers to nurture`,
      description: "First booking within 90 days",
      action: "Introduce storage program (upsell)",
      onClick: () => navigate("/customers?lifecycle=New"),
    },
  ];

  const visibleInsights = insights.filter((i) => i.condition);

  if (visibleInsights.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Recommended Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleInsights.map((insight, index) => (
          <div
            key={index}
            className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4"
          >
            <div className="flex-1 space-y-1">
              <div className="font-semibold">{insight.title}</div>
              <div className="text-sm text-muted-foreground">{insight.description}</div>
              <div className="text-sm text-primary">→ {insight.action}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={insight.onClick}
              className="shrink-0"
            >
              View <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
