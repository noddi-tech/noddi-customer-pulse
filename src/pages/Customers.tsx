import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCustomers } from "@/hooks/segmentation";
import { exportCustomersToCSV } from "@/utils/csvExport";
import { Download, Search, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Customers() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [localSearch, setLocalSearch] = useState(searchParams.get("search") || "");
  
  const lifecycle = searchParams.get("lifecycle") || undefined;
  const value_tier = searchParams.get("value_tier") || undefined;
  const search = searchParams.get("search") || undefined;

  const { data: customers, isLoading, dataUpdatedAt } = useCustomers({
    lifecycle,
    value_tier,
    search,
  });

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: customers?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 10,
  });

  const handleFilterChange = (key: string, value: string | undefined) => {
    if (value) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
    setSearchParams(searchParams);
  };

  const handleSearch = () => {
    if (localSearch) {
      searchParams.set("search", localSearch);
    } else {
      searchParams.delete("search");
    }
    setSearchParams(searchParams);
  };

  const lifecycleOptions = ["New", "Active", "At-risk", "Churned", "Winback"];
  const valueTierOptions = ["High", "Mid", "Low"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Customers</h1>
          <p className="text-muted-foreground">
            {customers?.length || 0} customers
            {dataUpdatedAt && (
              <span className="ml-2 text-xs">
                • Updated {formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => customers && exportCustomersToCSV(customers)}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium">Lifecycle:</span>
              {["All", ...lifecycleOptions].map((option) => (
                <Button
                  key={option}
                  variant={lifecycle === option || (!lifecycle && option === "All") ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleFilterChange("lifecycle", option === "All" ? undefined : option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium">Value:</span>
              {["All", ...valueTierOptions].map((option) => (
                <Button
                  key={option}
                  variant={value_tier === option || (!value_tier && option === "All") ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleFilterChange("value_tier", option === "All" ? undefined : option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch}>Search</Button>
            {search && (
              <Button variant="outline" onClick={() => {
                setLocalSearch("");
                handleFilterChange("search", undefined);
              }}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Virtualized Table */}
      <Card>
        {/* Header Row */}
        <div className="border-b bg-muted/50 p-4 flex items-center justify-between font-medium text-sm sticky top-0 z-10">
          <div className="flex-1 min-w-0">Customer</div>
          <div className="flex items-center gap-6 ml-4">
            <div className="min-w-[140px]">Status</div>
            <div className="min-w-[80px] text-right">Orders</div>
            <div className="min-w-[100px] text-right">Avg Order</div>
            <div className="min-w-[120px] text-right">24m Revenue</div>
          </div>
        </div>
        
        <div
          ref={parentRef}
          className="h-[600px] overflow-auto"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const customer = customers?.[virtualRow.index];
              if (!customer) return null;

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="border-b p-4 hover:bg-accent cursor-pointer flex items-center justify-between"
                  onClick={() => navigate(`/customers/${customer.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {customer.first_name} {customer.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{customer.email}</p>
                  </div>
                  
                  <div className="flex items-center gap-6 ml-4">
                    <div className="flex gap-2 min-w-[140px]">
                      <Badge variant={
                        customer.segments?.lifecycle === "Churned" ? "destructive" :
                        customer.segments?.lifecycle === "At-risk" ? "default" :
                        "default"
                      }>
                        {customer.segments?.lifecycle}
                      </Badge>
                      <Badge variant="secondary">{customer.segments?.value_tier}</Badge>
                    </div>
                    
                    <div className="text-sm min-w-[80px] text-right">
                      <div className="font-medium">{customer.features?.frequency_24m || 0}</div>
                    </div>
                    
                    <div className="text-sm min-w-[100px] text-right">
                      <div className="font-medium">
                        {customer.features?.revenue_24m && customer.features?.frequency_24m
                          ? `${Math.round(customer.features.revenue_24m / customer.features.frequency_24m).toLocaleString()} kr`
                          : '-'}
                      </div>
                    </div>
                    
                    <div className="text-sm min-w-[120px] text-right">
                      <div className="font-medium">
                        {customer.features?.revenue_24m 
                          ? `${Number(customer.features.revenue_24m).toLocaleString()} kr`
                          : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">Loading customers...</div>
      )}

      {!isLoading && customers?.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">No customers found</div>
      )}
    </div>
  );
}
