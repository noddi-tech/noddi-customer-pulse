import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePyramidTierDistribution } from "@/hooks/pyramidSegmentation";
import { Building2, User, Building, Landmark } from "lucide-react";

export function CustomerSegmentBreakdown() {
  const { data: distribution, isLoading } = usePyramidTierDistribution();

  if (isLoading || !distribution) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer Segments</CardTitle>
          <CardDescription>B2C & B2B breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading segment data...</div>
        </CardContent>
      </Card>
    );
  }

  const segmentConfig = {
    'B2C': {
      icon: User,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-950/30",
      description: "Individual consumers",
    },
    'SMB': {
      icon: Building2,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-950/30",
      description: "Small/medium business (1-19 cars)",
    },
    'Large': {
      icon: Building,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-950/30",
      description: "Large business (20-49 cars)",
    },
    'Enterprise': {
      icon: Landmark,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-950/30",
      description: "Enterprise (50+ cars)",
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Segments</CardTitle>
        <CardDescription>Distribution across B2C and B2B categories</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {distribution.map((segment) => {
          const config = segmentConfig[segment.customer_segment as keyof typeof segmentConfig];
          if (!config) return null;
          
          const Icon = config.icon;
          const activeCustomers = segment.tier1_champion + segment.tier2_loyalist + 
                                   segment.tier3_engaged + segment.tier4_prospect;
          
          return (
            <div key={segment.customer_segment} className={`p-4 rounded-lg border ${config.bgColor}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${config.color}`} />
                  <span className="font-semibold">{segment.customer_segment}</span>
                </div>
                <Badge variant="outline">{segment.total.toLocaleString()} total</Badge>
              </div>
              
              <p className="text-sm text-muted-foreground mb-3">{config.description}</p>
              
              {/* Tier Distribution */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-background/50 p-2 rounded">
                  <div className="font-medium text-yellow-600 dark:text-yellow-400">Champions</div>
                  <div className="text-lg font-semibold">{segment.tier1_champion}</div>
                </div>
                <div className="bg-background/50 p-2 rounded">
                  <div className="font-medium text-blue-600 dark:text-blue-400">Loyalists</div>
                  <div className="text-lg font-semibold">{segment.tier2_loyalist}</div>
                </div>
                <div className="bg-background/50 p-2 rounded">
                  <div className="font-medium text-green-600 dark:text-green-400">Engaged</div>
                  <div className="text-lg font-semibold">{segment.tier3_engaged}</div>
                </div>
                <div className="bg-background/50 p-2 rounded">
                  <div className="font-medium text-purple-600 dark:text-purple-400">Prospects</div>
                  <div className="text-lg font-semibold">{segment.tier4_prospect}</div>
                </div>
              </div>
              
              {/* Dormant */}
              {segment.dormant > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  + {segment.dormant} in dormant pool
                </div>
              )}
              
              {/* Active Rate */}
              <div className="mt-2 text-xs">
                <span className="font-medium">Active Rate:</span>{' '}
                <span className="text-muted-foreground">
                  {segment.total > 0 ? Math.round((activeCustomers / segment.total) * 100) : 0}% 
                  ({activeCustomers}/{segment.total})
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
