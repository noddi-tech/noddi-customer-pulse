import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

type EnhancedLifecycleCardProps = {
  label: string;
  count: number;
  variant: "default" | "destructive" | "secondary" | "outline";
  totalCustomers: number;
  avgRecencyDays?: number;
  avgFrequency?: number;
  avgRevenue?: number;
  onClick: () => void;
  tooltipText: string;
  timePeriod?: number;
};

export function EnhancedLifecycleCard({
  label,
  count,
  variant,
  totalCustomers,
  avgRecencyDays,
  avgFrequency,
  avgRevenue,
  onClick,
  tooltipText,
  timePeriod = 24,
}: EnhancedLifecycleCardProps) {
  const percentage = totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0;

  const formatRecency = (days?: number) => {
    if (!days) return "N/A";
    if (days < 30) return `${Math.round(days)} days`;
    const months = Math.round(days / 30);
    return `${months} ${months === 1 ? "month" : "months"}`;
  };

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-lg"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            {label}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{tooltipText}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
          <Badge variant={variant}>{label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-bold">{count.toLocaleString()}</div>
        <p className="text-xs text-muted-foreground">{percentage}% of total</p>
        
        {(avgRecencyDays != null || avgFrequency != null || avgRevenue != null) && (
          <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
            {avgRecencyDays != null && (
              <div>Avg last booking: {formatRecency(avgRecencyDays)}</div>
            )}
            {avgFrequency != null && (
              <div>Avg bookings: {avgFrequency.toFixed(1)}/{timePeriod === 0 ? 'lifetime' : `${timePeriod}mo`}</div>
            )}
            {avgRevenue != null && (
              <div>Avg revenue: {avgRevenue.toLocaleString()} NOK/booking (ex VAT)</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
