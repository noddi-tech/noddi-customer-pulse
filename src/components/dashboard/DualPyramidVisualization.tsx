import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePyramidByCustomerType } from "@/hooks/pyramidByType";
import { Award, Sparkles, TrendingUp, Target, HelpCircle, Building2, User } from "lucide-react";

type TierConfig = {
  name: "Champion" | "Loyalist" | "Engaged" | "Prospect";
  color: string;
  textColor: string;
  icon: any;
  width: string;
};

const tiers: TierConfig[] = [
  {
    name: "Champion",
    color: "bg-gradient-to-r from-yellow-500 to-orange-500",
    textColor: "text-yellow-600 dark:text-yellow-400",
    icon: Award,
    width: "w-1/4",
  },
  {
    name: "Loyalist",
    color: "bg-gradient-to-r from-blue-500 to-cyan-500",
    textColor: "text-blue-600 dark:text-blue-400",
    icon: Sparkles,
    width: "w-2/5",
  },
  {
    name: "Engaged",
    color: "bg-gradient-to-r from-green-500 to-emerald-500",
    textColor: "text-green-600 dark:text-green-400",
    icon: TrendingUp,
    width: "w-3/5",
  },
  {
    name: "Prospect",
    color: "bg-gradient-to-r from-purple-500 to-pink-500",
    textColor: "text-purple-600 dark:text-purple-400",
    icon: Target,
    width: "w-4/5",
  },
];

export function DualPyramidVisualization() {
  const { data, isLoading } = usePyramidByCustomerType();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer Value Pyramids</CardTitle>
          <CardDescription>B2C and B2B segmentation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading pyramid data...</div>
        </CardContent>
      </Card>
    );
  }

  const { b2c, b2b } = data;

  const renderPyramid = (pyramidData: { Champion: number; Loyalist: number; Engaged: number; Prospect: number; customer_type: 'B2C' | 'B2B'; total: number; }, title: string, icon: any) => {
    const Icon = icon;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <h3 className="font-semibold">{title}</h3>
          <Badge variant="outline">{pyramidData.total.toLocaleString()} customers</Badge>
        </div>

        <div className="space-y-3">
          {tiers.map((tier) => {
            const TierIcon = tier.icon;
            const count = pyramidData[tier.name];
            const percentage = pyramidData.total > 0 
              ? Math.round((count / pyramidData.total) * 100) 
              : 0;

            return (
              <div key={tier.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <TierIcon className={`h-4 w-4 ${tier.textColor}`} />
                    <span className="font-medium">{tier.name}</span>
                    <Badge variant="outline" className={`${tier.textColor} text-xs`}>
                      {count.toLocaleString()}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">{percentage}%</span>
                </div>
                
                <div className="flex justify-center">
                  <div className={`${tier.width} transition-all duration-300`}>
                    <div 
                      className={`h-8 ${tier.color} rounded shadow-md flex items-center justify-center text-white text-sm font-medium`}
                    >
                      {percentage}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Customer Value Pyramids
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p className="text-xs">
                      Separate pyramid analysis for B2C consumers and B2B organizations,
                      showing engagement levels across both customer types.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Compare engagement distribution across customer types
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-8">
          {renderPyramid(b2c, "B2C Customers", User)}
          {renderPyramid(b2b, "B2B Organizations", Building2)}
        </div>
      </CardContent>
    </Card>
  );
}
