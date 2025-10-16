import Papa from "papaparse";
import { Customer } from "@/hooks/segmentation";

export function exportCustomersToCSV(customers: Customer[], filename?: string) {
  const csvData = customers.map((customer) => ({
    Name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
    Email: customer.email || "",
    Lifecycle: customer.segments?.lifecycle || "",
    "Value Tier": customer.segments?.value_tier || "",
    Tags: (customer.features?.service_tags_all || []).join(", "),
    "Last Booking": customer.features?.last_booking_at || "",
    "Revenue (24m)": customer.features?.revenue_24m || 0,
    "Margin": customer.features?.margin_24m || 0,
    "Discount Share": customer.features?.discount_share_24m || 0,
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
