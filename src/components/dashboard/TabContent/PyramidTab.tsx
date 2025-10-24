import { PyramidExplainer } from "@/components/dashboard/PyramidExplainer";
import { DualPyramidVisualization } from "@/components/dashboard/DualPyramidVisualization";
import { CustomerSegmentBreakdown } from "@/components/dashboard/CustomerSegmentBreakdown";
import { PyramidHealthCard } from "@/components/dashboard/PyramidHealthCard";
import { CustomerDataTable } from "@/components/dashboard/CustomerDataTable";
import { Separator } from "@/components/ui/separator";

export function PyramidTab() {
  return (
    <div className="space-y-6">
      <PyramidExplainer />
      
      <DualPyramidVisualization />
      
      <div className="grid gap-6 lg:grid-cols-2">
        <CustomerSegmentBreakdown />
        <PyramidHealthCard />
      </div>

      <Separator className="my-6" />

      <div>
        <h3 className="text-lg font-semibold mb-4">Customer Details</h3>
        <CustomerDataTable />
      </div>
    </div>
  );
}
