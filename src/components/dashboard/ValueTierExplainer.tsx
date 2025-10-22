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
          Customers are grouped by their booking patterns, spending, and engagement level.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <span className="font-semibold text-foreground">High Value (Top 20%):</span>
            <span className="text-muted-foreground"> Your best customers who book frequently, visited recently, and spend well. Storage and fleet customers automatically qualify for high-value status.</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Mid Value (Middle 30%):</span>
            <span className="text-muted-foreground"> Regular customers with good potential. Consistent bookings and moderate spending.</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Low Value (Bottom 50%):</span>
            <span className="text-muted-foreground"> Occasional customers or newer users. Less frequent visits or lower spending so far.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
