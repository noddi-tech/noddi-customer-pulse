import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePyramidTierCounts, useDormantCounts } from "@/hooks/pyramidSegmentation";
import { TrendingUp, Users, Award, Target, Sparkles, Download, HelpCircle, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { exportPyramidAnalysis } from "@/utils/pyramidExport";

export function PyramidVisualization() {
  const { data: tierCounts, isLoading, refetch: refetchTiers } = usePyramidTierCounts();
  const { data: dormantCounts, refetch: refetchDormant } = useDormantCounts();

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchTiers(), refetchDormant()]);
      toast.success("Pyramid data refreshed");
    } catch (error) {
      console.error("Refresh error:", error);
      toast.error("Failed to refresh pyramid data");
    }
  };

  const handleExport = async () => {
    try {
      const count = await exportPyramidAnalysis();
      toast.success(`Exported ${count} customer records`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export pyramid data");
    }
  };

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

  // Check if pyramid tiers have been calculated
  if (totalTiered === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Customer Value Pyramid
            <Badge variant="outline" className="text-xs">Setup Required</Badge>
          </CardTitle>
          <CardDescription>4-tier engagement model</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Pyramid Segmentation Not Yet Calculated</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>To view pyramid tiers, complete these steps:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2 text-sm">
                <li>Go to <strong>Settings → Sync</strong> tab</li>
                <li>Click <strong>"Compute Segments"</strong> to analyze all customers</li>
                <li>Then click <strong>"Test Pyramid Calculation"</strong> to assign tiers</li>
              </ol>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => window.location.href = '/settings?tab=sync'}
                className="mt-2"
              >
                Go to Settings
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
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
      criteria: [
        "✓ Active lifecycle status",
        "✓ Composite score ≥0.75, OR",
        "✓ Storage contract active, OR",
        "✓ High-value tire purchaser (€8k+ order), OR",
        "✓ Enterprise customer segment"
      ],
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
      criteria: [
        "✓ Active AND composite score ≥0.5, OR",
        "✓ At-risk AND composite score ≥0.7",
        "Consistent performers who return regularly"
      ],
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
      criteria: [
        "✓ (Active OR At-risk) AND 2+ lifetime bookings, OR",
        "✓ Winback status AND composite score ≥0.5",
        "Building relationship with consistent engagement"
      ],
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
      criteria: [
        "✓ New or Winback lifecycle, OR",
        "✓ Single booking AND <180 days since last booking",
        "Early-stage relationship potential"
      ],
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Value Pyramid
            </CardTitle>
            <CardDescription>
              {totalTiered.toLocaleString()} tiered customers + {totalDormant.toLocaleString()} in dormant pool
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
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
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="text-muted-foreground hover:text-foreground transition-colors">
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-semibold">{tier.name} Tier Criteria:</p>
                            {tier.criteria.map((criterion, idx) => (
                              <p key={idx} className="text-xs">{criterion}</p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className="text-sm text-muted-foreground">{percentage}%</span>
                </div>
                
                {/* Pyramid Bar */}
                <div className="flex justify-center">
                  <div 
                    className={`${tier.width} transition-all duration-500 ease-out hover:scale-105`}
                    style={{ maxWidth: '100%' }}
                  >
                    <div 
                      className={`h-12 ${tier.color} rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 flex items-center justify-center text-white font-semibold border-2 ${tier.borderColor}`}
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
