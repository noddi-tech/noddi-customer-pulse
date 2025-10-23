import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export function PyramidExplainer() {
  return (
    <Card className="border-primary/20 bg-muted/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          Understanding the Customer Pyramid
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          The pyramid segments customers into 4 tiers based on lifecycle stage, engagement metrics (RFM), and business value indicators. Each segment receives a composite score with boosts for storage contracts, multi-service usage, and fleet size.
        </p>
        
        <div className="space-y-2">
          <div className="border-l-4 border-yellow-500 pl-3">
            <span className="font-semibold text-foreground">Tier 1 - Champions:</span>
            <span className="text-muted-foreground"> Active customers with composite score ≥0.75, OR storage active, OR high-value tire purchasers (€8k+ order), OR enterprise customers. These are your VIPs.</span>
          </div>
          
          <div className="border-l-4 border-blue-500 pl-3">
            <span className="font-semibold text-foreground">Tier 2 - Loyalists:</span>
            <span className="text-muted-foreground"> Active customers with score ≥0.5, OR at-risk with score ≥0.7. Consistent performers who keep coming back.</span>
          </div>
          
          <div className="border-l-4 border-green-500 pl-3">
            <span className="font-semibold text-foreground">Tier 3 - Engaged:</span>
            <span className="text-muted-foreground"> Active/At-risk with 2+ lifetime bookings, OR winback customers with score ≥0.5. Building relationship.</span>
          </div>
          
          <div className="border-l-4 border-purple-500 pl-3">
            <span className="font-semibold text-foreground">Tier 4 - Prospects:</span>
            <span className="text-muted-foreground"> New customers, winbacks, or single-booking customers &lt;180 days old. Early-stage relationship.</span>
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Dormant Pool:</span> Customers outside the pyramid are classified as either <span className="font-medium">Salvageable</span> (churned ≤2 years) or <span className="font-medium">Transient</span> (one-time visitors). The composite score uses segment-specific quantiles to compare customers fairly within their B2C/SMB/Large/Enterprise group.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
