import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { usePyramidValidation } from "@/hooks/pyramidValidation";
import { usePyramidTierCounts, useDormantCounts } from "@/hooks/pyramidSegmentation";
import { Lightbulb, TrendingUp, Target, Users, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function PyramidActionableInsights() {
  const { data: validation, isLoading: validationLoading } = usePyramidValidation();
  const { data: tierCounts, isLoading: tierLoading } = usePyramidTierCounts();
  const { data: dormantCounts, isLoading: dormantLoading } = useDormantCounts();

  if (validationLoading || tierLoading || dormantLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Actionable Insights
          </CardTitle>
          <CardDescription>Loading recommendations...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!validation || !tierCounts || !dormantCounts) return null;

  const insights: Array<{
    icon: any;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    metric?: string;
  }> = [];

  // Total customers for calculations
  const totalTiered = Object.values(tierCounts).reduce((sum, count) => sum + count, 0);
  const totalDormant = dormantCounts.salvageable + dormantCounts.transient;

  // Insight 1: Champion tier health
  const championPercentage = totalTiered > 0 ? (tierCounts.Champion / totalTiered) * 100 : 0;
  if (championPercentage < 10) {
    insights.push({
      icon: TrendingUp,
      title: "Grow Your Champion Tier",
      description: `Only ${championPercentage.toFixed(1)}% of tiered customers are Champions. Focus on upselling storage contracts and high-value tire purchases to current Loyalists.`,
      priority: "high",
      metric: `${tierCounts.Champion} Champions`,
    });
  } else if (championPercentage > 20) {
    insights.push({
      icon: TrendingUp,
      title: "Strong Champion Base",
      description: `${championPercentage.toFixed(1)}% Champions is excellent. Maintain this by ensuring high-value customers receive premium service and retention campaigns.`,
      priority: "low",
      metric: `${tierCounts.Champion} Champions`,
    });
  }

  // Insight 2: Prospect conversion opportunity
  const prospectPercentage = totalTiered > 0 ? (tierCounts.Prospect / totalTiered) * 100 : 0;
  if (prospectPercentage > 30) {
    insights.push({
      icon: Target,
      title: "Convert Prospects to Engaged",
      description: `${prospectPercentage.toFixed(1)}% of customers are Prospects. Launch targeted campaigns to encourage 2nd booking within 180 days to move them up.`,
      priority: "high",
      metric: `${tierCounts.Prospect} Prospects`,
    });
  }

  // Insight 3: Dormant recovery opportunity
  const dormantPercentage = validation.summary.total_customers > 0 
    ? (totalDormant / validation.summary.total_customers) * 100 
    : 0;
  if (dormantPercentage > 20 && dormantCounts.salvageable > 0) {
    insights.push({
      icon: Users,
      title: "Reactivate Salvageable Customers",
      description: `${dormantCounts.salvageable} customers churned within 2 years. Create win-back campaigns with special offers to re-engage them.`,
      priority: "medium",
      metric: `${dormantCounts.salvageable} Salvageable`,
    });
  }

  // Insight 4: Engaged tier stability
  const engagedPercentage = totalTiered > 0 ? (tierCounts.Engaged / totalTiered) * 100 : 0;
  if (engagedPercentage < 15) {
    insights.push({
      icon: ArrowUpRight,
      title: "Strengthen Engaged Segment",
      description: `Only ${engagedPercentage.toFixed(1)}% in Engaged tier. Encourage repeat bookings among Prospects to build this crucial mid-tier base.`,
      priority: "medium",
      metric: `${tierCounts.Engaged} Engaged`,
    });
  }

  // Insight 5: Data quality issues
  const failedChecks = validation.checks.filter(c => c.status === "fail");
  if (failedChecks.length > 0) {
    insights.push({
      icon: Lightbulb,
      title: "Improve Data Quality",
      description: `${failedChecks.length} validation check(s) failing. Address feature coverage and segment assignments to ensure accurate tiering.`,
      priority: "high",
      metric: `${failedChecks.length} Issues`,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const priorityConfig = {
    high: {
      bg: "bg-red-50 dark:bg-red-950/20",
      border: "border-red-200 dark:border-red-800",
      badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    },
    medium: {
      bg: "bg-yellow-50 dark:bg-yellow-950/20",
      border: "border-yellow-200 dark:border-yellow-800",
      badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
    },
    low: {
      bg: "bg-green-50 dark:bg-green-950/20",
      border: "border-green-200 dark:border-green-800",
      badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Actionable Insights
        </CardTitle>
        <CardDescription>
          Data-driven recommendations based on your pyramid health
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.length === 0 ? (
          <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <AlertDescription>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="font-medium">All systems optimal!</span>
              </div>
              <p className="text-sm mt-1 text-muted-foreground">
                Your customer pyramid is well-balanced and data quality is excellent. Continue monitoring for changes.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          insights.slice(0, 4).map((insight, index) => {
            const Icon = insight.icon;
            const config = priorityConfig[insight.priority];
            
            return (
              <Alert key={index} className={`${config.bg} ${config.border} transition-all duration-300 hover:shadow-md`}>
                <AlertDescription>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Icon className="h-5 w-5 mt-0.5 text-foreground" />
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{insight.title}</span>
                          {insight.metric && (
                            <Badge variant="outline" className="text-xs">
                              {insight.metric}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{insight.description}</p>
                      </div>
                    </div>
                    <Badge className={config.badge + " text-xs uppercase"}>
                      {insight.priority}
                    </Badge>
                  </div>
                </AlertDescription>
              </Alert>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
