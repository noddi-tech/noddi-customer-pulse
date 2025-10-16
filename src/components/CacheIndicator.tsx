import { formatDistanceToNow } from "date-fns";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type CacheIndicatorProps = {
  lastUpdated?: Date;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

export function CacheIndicator({
  lastUpdated,
  onRefresh,
  isRefreshing,
}: CacheIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>
        {lastUpdated
          ? `Refreshed ${formatDistanceToNow(lastUpdated, { addSuffix: true })}`
          : "Cached"}
      </span>
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="h-6 px-2"
        >
          <RefreshCw
            className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>
      )}
    </div>
  );
}
