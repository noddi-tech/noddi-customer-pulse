import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSegmentCounts } from "@/hooks/segmentation";
import { CustomerDataTable } from "@/components/dashboard/CustomerDataTable";

const segments = [
  { label: "New", type: "lifecycle", variant: "default" as const, color: "bg-blue-500" },
  { label: "Active", type: "lifecycle", variant: "default" as const, color: "bg-green-500" },
  { label: "At-risk", type: "lifecycle", variant: "default" as const, color: "bg-yellow-500" },
  { label: "Churned", type: "lifecycle", variant: "destructive" as const, color: "bg-red-500" },
  { label: "Winback", type: "lifecycle", variant: "default" as const, color: "bg-purple-500" },
  { label: "High", type: "value_tier", variant: "default" as const, color: "bg-amber-500" },
  { label: "Mid", type: "value_tier", variant: "secondary" as const, color: "bg-gray-500" },
  { label: "Low", type: "value_tier", variant: "outline" as const, color: "bg-stone-500" },
];

export function SegmentsTab() {
  const { data: counts } = useSegmentCounts();
  const [selectedSegment, setSelectedSegment] = useState<{ label: string; type: string } | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Customer Segments</h2>
        <p className="text-sm text-muted-foreground">
          Click a segment to view detailed customer list
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {segments.map((segment) => {
          const count = counts?.[segment.label] || 0;
          const isSelected = selectedSegment?.label === segment.label;
          
          return (
            <Card
              key={segment.label}
              className={`cursor-pointer hover:shadow-lg transition-all ${
                isSelected ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => 
                setSelectedSegment(
                  isSelected ? null : { label: segment.label, type: segment.type }
                )
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center justify-between">
                  {segment.label}
                  <Badge variant={segment.variant}>{count.toLocaleString()}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`h-2 rounded-full ${segment.color} opacity-60`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedSegment && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{selectedSegment.label} Customers</h3>
            <Badge>{counts?.[selectedSegment.label]?.toLocaleString() || 0}</Badge>
          </div>
          
          <CustomerDataTable
            defaultFilters={
              selectedSegment.type === "lifecycle"
                ? { lifecycle: selectedSegment.label }
                : { value_tier: selectedSegment.label }
            }
          />
        </div>
      )}
    </div>
  );
}
