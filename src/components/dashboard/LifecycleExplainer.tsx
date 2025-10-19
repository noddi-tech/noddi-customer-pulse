import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export function LifecycleExplainer() {
  return (
    <Card className="border-primary/20 bg-muted/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          Understanding Customer Lifecycle Stages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <span className="font-semibold text-foreground">New:</span>
            <span className="text-muted-foreground"> First booking within 90 days</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Active:</span>
            <span className="text-muted-foreground"> Recent booking (last 7 months) or active storage</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">At-risk:</span>
            <span className="text-muted-foreground"> Inactive 7-9 months (potential to win back)</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Churned:</span>
            <span className="text-muted-foreground"> No booking for 9+ months (disengaged)</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Winback:</span>
            <span className="text-muted-foreground"> Previously churned, now returned</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
