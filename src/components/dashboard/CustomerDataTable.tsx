import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCustomers } from "@/hooks/segmentation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Copy, Search } from "lucide-react";
import { exportCustomersToCSV } from "@/utils/csvExport";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type CustomerDataTableProps = {
  defaultFilters?: {
    lifecycle?: string;
    value_tier?: string;
    customer_type?: string;
    pyramid_tier?: string;
  };
};

export function CustomerDataTable({ defaultFilters }: CustomerDataTableProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState(defaultFilters?.lifecycle || "");
  const [valueTier, setValueTier] = useState(defaultFilters?.value_tier || "");
  const [customerType, setCustomerType] = useState(defaultFilters?.customer_type || "");

  const { data: customers, isLoading } = useCustomers({
    lifecycle: lifecycle || undefined,
    value_tier: valueTier || undefined,
    customer_type: customerType || undefined,
    search: search || undefined,
  });

  const handleExport = () => {
    if (customers) {
      exportCustomersToCSV(
        customers,
        `customers-${new Date().toISOString().split('T')[0]}.csv`
      );
      toast.success(`Exported ${customers.length} customers`);
    }
  };

  const handleCopyEmails = () => {
    toast.info("Email export not available for user groups");
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Select value={customerType || undefined} onValueChange={(val) => setCustomerType(val === "all" ? "" : val)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Customer Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="B2C">B2C</SelectItem>
            <SelectItem value="B2B">B2B</SelectItem>
          </SelectContent>
        </Select>

        <Select value={lifecycle || undefined} onValueChange={(val) => setLifecycle(val === "all" ? "" : val)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Lifecycles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lifecycles</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="At-risk">At-risk</SelectItem>
            <SelectItem value="Churned">Churned</SelectItem>
            <SelectItem value="Winback">Winback</SelectItem>
          </SelectContent>
        </Select>

        <Select value={valueTier || undefined} onValueChange={(val) => setValueTier(val === "all" ? "" : val)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Value Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Value Tiers</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Mid">Mid</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyEmails}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Emails
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Value Tier</TableHead>
              <TableHead>Last Booking</TableHead>
              <TableHead>Members</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading customers...
                </TableCell>
              </TableRow>
            ) : customers && customers.length > 0 ? (
              customers.map((customer) => (
                <TableRow
                  key={customer.user_group_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/customers/${customer.user_group_id}`)}
                >
                  <TableCell className="font-medium">
                    {customer.user_group_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.customer_type === 'B2C' ? 'default' : 'secondary'}>
                      {customer.customer_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {customer.segments?.lifecycle || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {customer.segments?.value_tier || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.features?.last_booking_at
                      ? formatDistanceToNow(new Date(customer.features.last_booking_at), {
                          addSuffix: true,
                        })
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.member_count || 0}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No customers found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {customers && customers.length > 0 && (
        <div className="text-sm text-muted-foreground text-center">
          Showing {customers.length} customers
        </div>
      )}
    </div>
  );
}
