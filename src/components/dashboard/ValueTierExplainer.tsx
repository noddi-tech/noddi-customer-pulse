import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export function ValueTierExplainer() {
  return (
    <Card className="border-primary/20 bg-muted/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          Understanding Value Tier Segmentation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground mb-3">
          Value tiers use an RFM model (Recency, Frequency, Monetary) with stickiness boosts for strategic customer segments.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <span className="font-semibold text-foreground">High Value (Top 20%):</span>
            <span className="text-muted-foreground"> Score ≥ 0.8. Strong recent activity, frequent bookings, and high revenue. Includes +15% boost for storage, +10% for fleet, +5% for multi-service customers.</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Mid Value (Middle 30%):</span>
            <span className="text-muted-foreground"> Score 0.5-0.8. Moderate engagement across recency, frequency, and spending with growth potential.</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Low Value (Bottom 50%):</span>
            <span className="text-muted-foreground"> Score &lt; 0.5. Less frequent booking patterns or lower spending. May be new or occasional users.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
