import { useState } from "react";
import { PyramidExplainer } from "@/components/dashboard/PyramidExplainer";
import { DualPyramidVisualization } from "@/components/dashboard/DualPyramidVisualization";
import { CustomerSegmentBreakdown } from "@/components/dashboard/CustomerSegmentBreakdown";
import { PyramidHealthCard } from "@/components/dashboard/PyramidHealthCard";
import { CustomerDataTable } from "@/components/dashboard/CustomerDataTable";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export function PyramidTab() {
  const [selectedPyramidTier, setSelectedPyramidTier] = useState<{
    tier: string;
    customerType: 'B2C' | 'B2B';
  } | null>(null);

  const handleTierClick = (tierName: string, customerType: 'B2C' | 'B2B') => {
    setSelectedPyramidTier({ tier: tierName, customerType });
  };

  const handleClearFilter = () => {
    setSelectedPyramidTier(null);
  };

  return (
    <div className="space-y-6">
      <PyramidExplainer />
      
      <DualPyramidVisualization 
        selectedTier={selectedPyramidTier?.tier}
        selectedCustomerType={selectedPyramidTier?.customerType}
        onTierClick={handleTierClick}
      />
      
      <div className="grid gap-6 lg:grid-cols-2">
        <CustomerSegmentBreakdown />
        <PyramidHealthCard />
      </div>

      <Separator className="my-6" />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Customer Details</h3>
          {selectedPyramidTier && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
              <span className="text-sm">
                Filtering: <Badge variant="secondary">{selectedPyramidTier.tier}</Badge> tier
                <span className="text-muted-foreground ml-1">({selectedPyramidTier.customerType})</span>
              </span>
              <Button variant="ghost" size="sm" onClick={handleClearFilter} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <CustomerDataTable 
          pyramidTierFilter={selectedPyramidTier?.tier}
          customerTypeFilter={selectedPyramidTier?.customerType}
        />
      </div>
    </div>
  );
}
