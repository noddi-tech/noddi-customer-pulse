import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Award, 
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface StatusCardProps {
  title: string;
  icon: React.ComponentType<any>;
  status: "completed" | "pending" | "error";
  count?: number;
  totalCount?: number;
  updatedAt?: Date;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function StatusCard({
  title,
  icon: Icon,
  status,
  count = 0,
  totalCount,
  updatedAt,
  description,
  actionLabel,
  onAction
}: StatusCardProps) {
  const statusConfig = {
    completed: {
      icon: CheckCircle2,
      iconColor: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-950/30",
      borderColor: "border-green-200 dark:border-green-900",
      badge: { variant: "default" as const, className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" }
    },
    pending: {
      icon: AlertCircle,
      iconColor: "text-yellow-600",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/30",
      borderColor: "border-yellow-200 dark:border-yellow-900",
      badge: { variant: "outline" as const, className: "border-yellow-600 text-yellow-700 dark:text-yellow-400" }
    },
    error: {
      icon: Clock,
      iconColor: "text-muted-foreground",
      bgColor: "bg-muted/30",
      borderColor: "border-muted",
      badge: { variant: "outline" as const, className: "border-muted-foreground/50 text-muted-foreground" }
    }
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card className={cn("border-2", config.borderColor, config.bgColor)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <span className="text-base">{title}</span>
          </div>
          <StatusIcon className={cn("h-4 w-4", config.iconColor)} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-3xl font-bold">
            {count.toLocaleString()}
            {totalCount && <span className="text-lg text-muted-foreground ml-1">/ {totalCount.toLocaleString()}</span>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        
        {updatedAt && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Updated {formatDistanceToNow(updatedAt, { addSuffix: true })}
          </div>
        )}

        {status !== "completed" && actionLabel && onAction && (
          <Button 
            onClick={onAction}
            size="sm"
            variant="outline"
            className="w-full mt-2"
          >
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface AnalysisStatusCardsProps {
  lifecycleCount: number;
  pyramidCount: number;
  valueTierCount: number;
  totalCustomers: number;
  lifecycleUpdatedAt?: Date;
  pyramidUpdatedAt?: Date;
  valueTierUpdatedAt?: Date;
  onRunAnalysis?: () => void;
}

export function AnalysisStatusCards({
  lifecycleCount,
  pyramidCount,
  valueTierCount,
  totalCustomers,
  lifecycleUpdatedAt,
  pyramidUpdatedAt,
  valueTierUpdatedAt,
  onRunAnalysis
}: AnalysisStatusCardsProps) {
  
  const getStatus = (count: number): "completed" | "pending" | "error" => {
    if (count === 0) return "error";
    if (count < totalCustomers) return "pending";
    return "completed";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatusCard
        title="Lifecycle Analysis"
        icon={TrendingUp}
        status={getStatus(lifecycleCount)}
        count={lifecycleCount}
        totalCount={totalCustomers}
        updatedAt={lifecycleUpdatedAt}
        description="Customers with lifecycle stages"
        actionLabel={lifecycleCount === 0 ? "Run Analysis" : "Update"}
        onAction={onRunAnalysis}
      />
      
      <StatusCard
        title="Value Tiers"
        icon={Layers}
        status={getStatus(valueTierCount)}
        count={valueTierCount}
        totalCount={totalCustomers}
        updatedAt={valueTierUpdatedAt}
        description="Customers with value tiers"
        actionLabel={valueTierCount === 0 ? "Run Analysis" : "Update"}
        onAction={onRunAnalysis}
      />
      
      <StatusCard
        title="Pyramid Tiers"
        icon={Award}
        status={getStatus(pyramidCount)}
        count={pyramidCount}
        totalCount={totalCustomers}
        updatedAt={pyramidUpdatedAt}
        description="Customers positioned in pyramid"
        actionLabel={pyramidCount === 0 ? "Run Analysis" : "Update"}
        onAction={onRunAnalysis}
      />
    </div>
  );
}
