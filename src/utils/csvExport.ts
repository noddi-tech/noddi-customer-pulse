import Papa from "papaparse";
import { Customer } from "@/hooks/segmentation";

export function exportCustomersToCSV(customers: Customer[], filename?: string) {
  const csvData = customers.map((customer) => ({
    "Customer Name": customer.user_group_name,
    "Type": customer.customer_type,
    "Members": customer.member_count || 1,
    "Lifecycle": customer.segments?.lifecycle || "",
    "Value Tier": customer.segments?.value_tier || "",
    "Orders (24m)": customer.features?.frequency_24m || 0,
    "Revenue per Order (NOK)": customer.features?.revenue_24m && customer.features?.frequency_24m
      ? Math.round(customer.features.revenue_24m / customer.features.frequency_24m)
      : 0,
    "Total Revenue 24m (NOK)": customer.features?.revenue_24m || 0,
    "Margin 24m (NOK)": customer.features?.margin_24m || 0,
    "Last Booking": customer.features?.last_booking_at || "",
    "Days Since Booking": customer.features?.recency_days || "",
    "Storage Active": customer.features?.storage_active ? "Yes" : "No",
  }));

  const csv = Papa.unparse(csvData);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    filename || `noddi-customers-${new Date().toISOString().split("T")[0]}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
