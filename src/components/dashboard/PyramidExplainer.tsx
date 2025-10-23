import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export function PyramidExplainer() {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-muted/50 to-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Info className="h-5 w-5 text-primary animate-pulse" />
          Understanding the Customer Pyramid
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Customers are organized into 4 value tiers based on their engagement and spending patterns. This helps you identify who needs attention and who deserves VIP treatment.
        </p>
        
        <div className="space-y-2">
          <div className="border-l-4 border-yellow-500 pl-3 py-2 bg-yellow-50 dark:bg-yellow-950/20 rounded-r transition-all duration-300 hover:bg-yellow-100 dark:hover:bg-yellow-950/30">
            <span className="font-semibold text-foreground">🏆 Champions:</span>
            <span className="text-muted-foreground"> Your best customers! High spenders, storage customers, or large fleets. Keep them happy with premium service.</span>
          </div>
          
          <div className="border-l-4 border-blue-500 pl-3 py-2 bg-blue-50 dark:bg-blue-950/20 rounded-r transition-all duration-300 hover:bg-blue-100 dark:hover:bg-blue-950/30">
            <span className="font-semibold text-foreground">💙 Loyalists:</span>
            <span className="text-muted-foreground"> Regular visitors who consistently return. Reward their loyalty with special offers and reminders.</span>
          </div>
          
          <div className="border-l-4 border-green-500 pl-3 py-2 bg-green-50 dark:bg-green-950/20 rounded-r transition-all duration-300 hover:bg-green-100 dark:hover:bg-green-950/30">
            <span className="font-semibold text-foreground">✨ Engaged:</span>
            <span className="text-muted-foreground"> Building a relationship. Encourage them to try more services to become Loyalists.</span>
          </div>
          
          <div className="border-l-4 border-purple-500 pl-3 py-2 bg-purple-50 dark:bg-purple-950/20 rounded-r transition-all duration-300 hover:bg-purple-100 dark:hover:bg-purple-950/30">
            <span className="font-semibold text-foreground">🌱 Prospects:</span>
            <span className="text-muted-foreground"> New or one-time visitors. Focus on getting them to book again soon!</span>
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">💤 Dormant Pool:</span> Inactive customers who haven't booked recently. <span className="font-medium">Salvageable</span> customers (lost ≤2 years ago) can be won back with campaigns. <span className="font-medium">Transient</span> customers were one-time visitors.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
