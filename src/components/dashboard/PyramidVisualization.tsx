import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePyramidTierCounts, useDormantCounts } from "@/hooks/pyramidSegmentation";
import { TrendingUp, Users, Award, Target, Sparkles } from "lucide-react";

export function PyramidVisualization() {
  const { data: tierCounts, isLoading } = usePyramidTierCounts();
  const { data: dormantCounts } = useDormantCounts();

  if (isLoading || !tierCounts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer Value Pyramid</CardTitle>
          <CardDescription>4-tier engagement model</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading pyramid data...</div>
        </CardContent>
      </Card>
    );
  }

  const totalTiered = Object.values(tierCounts).reduce((sum, count) => sum + count, 0);
  const totalDormant = dormantCounts 
    ? dormantCounts.salvageable + dormantCounts.transient 
    : 0;

  const tiers = [
    {
      name: "Champion",
      count: tierCounts.Champion,
      color: "bg-gradient-to-r from-yellow-500 to-orange-500",
      textColor: "text-yellow-600 dark:text-yellow-400",
      borderColor: "border-yellow-500",
      icon: Award,
      description: "Top-tier customers: Active + (high composite score OR storage OR high-value tire OR enterprise)",
      width: "w-1/4",
    },
    {
      name: "Loyalist",
      count: tierCounts.Loyalist,
      color: "bg-gradient-to-r from-blue-500 to-cyan-500",
      textColor: "text-blue-600 dark:text-blue-400",
      borderColor: "border-blue-500",
      icon: Sparkles,
      description: "Active with mid+ score OR At-risk with high score",
      width: "w-2/5",
    },
    {
      name: "Engaged",
      count: tierCounts.Engaged,
      color: "bg-gradient-to-r from-green-500 to-emerald-500",
      textColor: "text-green-600 dark:text-green-400",
      borderColor: "border-green-500",
      icon: TrendingUp,
      description: "Active/At-risk with 2+ lifetime bookings OR Winback with mid+ score",
      width: "w-3/5",
    },
    {
      name: "Prospect",
      count: tierCounts.Prospect,
      color: "bg-gradient-to-r from-purple-500 to-pink-500",
      textColor: "text-purple-600 dark:text-purple-400",
      borderColor: "border-purple-500",
      icon: Target,
      description: "New customers, winbacks, or single booking <180 days old",
      width: "w-4/5",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Customer Value Pyramid
        </CardTitle>
        <CardDescription>
          {totalTiered.toLocaleString()} tiered customers + {totalDormant.toLocaleString()} in dormant pool
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pyramid Visual */}
        <div className="space-y-3">
          {tiers.map((tier, index) => {
            const Icon = tier.icon;
            const percentage = totalTiered > 0 
              ? Math.round((tier.count / totalTiered) * 100) 
              : 0;
            
            return (
              <div key={tier.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${tier.textColor}`} />
                    <span className="font-semibold">{tier.name}</span>
                    <Badge variant="outline" className={tier.textColor}>
                      {tier.count.toLocaleString()}
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">{percentage}%</span>
                </div>
                
                {/* Pyramid Bar */}
                <div className="flex justify-center">
                  <div 
                    className={`${tier.width} transition-all duration-300`}
                    style={{ maxWidth: '100%' }}
                  >
                    <div 
                      className={`h-12 ${tier.color} rounded-lg shadow-md flex items-center justify-center text-white font-semibold border-2 ${tier.borderColor}`}
                    >
                      {percentage}%
                    </div>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
                  {tier.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Dormant Pool */}
        {totalDormant > 0 && (
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-muted-foreground">Dormant Pool</span>
              <Badge variant="secondary">{totalDormant.toLocaleString()}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted/50 p-2 rounded">
                <div className="font-medium">Salvageable</div>
                <div className="text-muted-foreground">{dormantCounts?.salvageable.toLocaleString() || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">Churned ≤2 years</div>
              </div>
              <div className="bg-muted/50 p-2 rounded">
                <div className="font-medium">Transient</div>
                <div className="text-muted-foreground">{dormantCounts?.transient.toLocaleString() || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">One-time visitors</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
