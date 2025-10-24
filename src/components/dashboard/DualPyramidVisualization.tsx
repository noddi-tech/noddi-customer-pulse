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

type DualPyramidVisualizationProps = {
  selectedTier?: string;
  selectedCustomerType?: 'B2C' | 'B2B';
  onTierClick?: (tierName: string, customerType: 'B2C' | 'B2B') => void;
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

export function DualPyramidVisualization({ selectedTier, selectedCustomerType, onTierClick }: DualPyramidVisualizationProps) {
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

  const renderPyramid = (pyramidData: { Champion: number; Loyalist: number; Engaged: number; Prospect: number; customer_type: 'B2C' | 'B2B'; total: number; }, title: string, icon: any, customerType: 'B2C' | 'B2B') => {
    const Icon = icon;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <h3 className="font-semibold">{title}</h3>
          <Badge variant="outline">{pyramidData.total.toLocaleString()} customers</Badge>
        </div>

        <div className="flex flex-col items-center space-y-1 py-4">
          {tiers.map((tier) => {
            const TierIcon = tier.icon;
            const count = pyramidData[tier.name];
            const percentage = pyramidData.total > 0 
              ? (count / pyramidData.total) * 100 
              : 0;

            // Calculate dynamic height: min 40px, max 128px based on percentage
            const height = 40 + (percentage * 0.88); // 0.88 = (128-40)/100
            const layoutMode = height >= 70 ? 'tall' : height >= 50 ? 'medium' : 'compact';
            
            const isSelected = selectedTier === tier.name && selectedCustomerType === customerType;
            const isOtherSelected = selectedTier && !isSelected;

            return (
              <TooltipProvider key={tier.name}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className={`${tier.width} transition-all duration-300 cursor-pointer
                        ${isSelected ? 'ring-2 ring-primary ring-offset-2 scale-105' : ''}
                        ${isOtherSelected ? 'opacity-40' : 'hover:scale-105 hover:shadow-lg'}
                      `}
                      onClick={() => onTierClick?.(tier.name, customerType)}
                      style={{ height: `${height}px` }}
                    >
                      <div 
                        className={`h-full ${tier.color} rounded shadow-md 
                          flex flex-col items-center justify-center text-white
                          font-medium relative overflow-hidden ${layoutMode === 'compact' ? 'px-3' : 'px-2'}`}
                      >
                        {layoutMode === 'tall' && (
                          <>
                            <TierIcon className="h-5 w-5 mb-1" />
                            <span className="text-xs">{tier.name}</span>
                            <span className="text-lg font-bold">
                              {Math.round(percentage)}%
                            </span>
                            <span className="text-xs opacity-90">
                              {count.toLocaleString()}
                            </span>
                          </>
                        )}
                        
                        {layoutMode === 'medium' && (
                          <>
                            <TierIcon className="h-4 w-4" />
                            <span className="text-[10px] leading-tight">{tier.name}</span>
                            <span className="text-base font-bold">
                              {Math.round(percentage)}%
                            </span>
                            <span className="text-[10px] opacity-90">
                              {count.toLocaleString()}
                            </span>
                          </>
                        )}
                        
                        {layoutMode === 'compact' && (
                          <>
                            <TierIcon className="h-3 w-3" />
                            <span className="text-[9px] leading-none">{tier.name}</span>
                            <span className="text-sm font-bold leading-tight">
                              {Math.round(percentage)}%
                            </span>
                            <span className="text-[9px] opacity-90 leading-none">
                              {count.toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs font-semibold">{tier.name}</p>
                    <p className="text-xs">
                      {percentage.toFixed(1)}% ({count.toLocaleString()} customers)
                    </p>
                    <p className="text-xs opacity-70 mt-1">Click to filter</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
          {renderPyramid(b2c, "B2C Customers", User, 'B2C')}
          {renderPyramid(b2b, "B2B Organizations", Building2, 'B2B')}
        </div>
      </CardContent>
    </Card>
  );
}
