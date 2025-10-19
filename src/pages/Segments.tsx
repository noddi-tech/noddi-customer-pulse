import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSegmentCounts, useCustomers } from "@/hooks/segmentation";
import { Download, Copy } from "lucide-react";
import { exportCustomersToCSV } from "@/utils/csvExport";
import { copyEmailsToClipboard } from "@/utils/clipboard";

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

export default function Segments() {
  const { data: counts } = useSegmentCounts();
  const [selectedSegment, setSelectedSegment] = useState<{ label: string; type: string } | null>(null);
  
  const { data: customers } = useCustomers(
    selectedSegment
      ? selectedSegment.type === "lifecycle"
        ? { lifecycle: selectedSegment.label }
        : { value_tier: selectedSegment.label }
      : undefined
  );

  const handleExport = () => {
    if (customers) {
      exportCustomersToCSV(customers, `noddi-${selectedSegment?.label}-${new Date().toISOString().split('T')[0]}.csv`);
    }
  };

  const handleCopyEmails = () => {
    if (customers) {
      copyEmailsToClipboard(customers);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Segments</h1>
        <p className="text-muted-foreground">Customer segmentation by lifecycle and value</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {segments.map((segment) => {
          const count = counts?.[segment.label] || 0;
          return (
            <Card
              key={segment.label}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedSegment(segment)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center justify-between">
                  {segment.label}
                  <Badge variant={segment.variant}>{count}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`h-2 rounded-full ${segment.color} opacity-60`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selectedSegment} onOpenChange={() => setSelectedSegment(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedSegment?.label} Customers</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyEmails}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Emails
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {customers && customers.length > 0 ? (
              <div className="space-y-2">
                {customers.map((customer) => (
                  <div
                    key={customer.user_group_id}
                    className="flex items-center justify-between border rounded-lg p-3 hover:bg-accent"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {customer.user_group_name}
                        </p>
                        <Badge variant={customer.customer_type === 'B2C' ? 'default' : 'secondary'} className="text-xs">
                          {customer.customer_type}
                        </Badge>
                      </div>
                      {customer.customer_type === 'B2B' && customer.member_count > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {customer.member_count} {customer.member_count === 1 ? 'member' : 'members'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{customer.segments?.lifecycle}</Badge>
                      <Badge variant="secondary">{customer.segments?.value_tier}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No customers in this segment</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
