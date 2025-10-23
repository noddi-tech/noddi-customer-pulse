import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";

export async function exportPyramidAnalysis() {
  const { data, error } = await supabase
    .from("segments")
    .select(`
      user_group_id,
      customer_segment,
      pyramid_tier,
      pyramid_tier_name,
      dormant_segment,
      composite_score,
      lifecycle,
      fleet_size,
      high_value_tire_purchaser,
      next_tier_requirements,
      features!inner(
        frequency_24m,
        frequency_lifetime,
        revenue_24m,
        revenue_lifetime,
        tire_revenue_24m,
        service_revenue_24m,
        recency_days,
        storage_active,
        largest_tire_order
      ),
      user_groups!inner(
        name,
        is_personal,
        org_id
      )
    `)
    .order("composite_score", { ascending: false, nullsFirst: false });

  if (error) throw error;

  const csvData = data?.map((row: any) => ({
    "Customer ID": row.user_group_id,
    "Customer Name": row.user_groups?.name || "N/A",
    "Customer Type": row.user_groups?.is_personal ? "B2C" : "B2B",
    "Customer Segment": row.customer_segment || "N/A",
    "Pyramid Tier": row.pyramid_tier || "Dormant",
    "Tier Name": row.pyramid_tier_name || row.dormant_segment || "N/A",
    "Composite Score": row.composite_score?.toFixed(3) || "N/A",
    "Lifecycle Stage": row.lifecycle,
    "Fleet Size": row.fleet_size,
    "High-Value Tire Purchaser": row.high_value_tire_purchaser ? "Yes" : "No",
    "Largest Tire Order (NOK)": row.features?.largest_tire_order || 0,
    "Frequency 24m": row.features?.frequency_24m || 0,
    "Frequency Lifetime": row.features?.frequency_lifetime || 0,
    "Revenue 24m (NOK)": Math.round(row.features?.revenue_24m || 0),
    "Revenue Lifetime (NOK)": Math.round(row.features?.revenue_lifetime || 0),
    "Tire Revenue 24m (NOK)": Math.round(row.features?.tire_revenue_24m || 0),
    "Service Revenue 24m (NOK)": Math.round(row.features?.service_revenue_24m || 0),
    "Recency Days": row.features?.recency_days || 0,
    "Storage Active": row.features?.storage_active ? "Yes" : "No",
    "Next Tier": row.next_tier_requirements?.next_tier || "N/A",
    "Next Tier Requirement": row.next_tier_requirements?.requirement || "N/A",
  })) || [];

  const csv = Papa.unparse(csvData);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `pyramid-analysis-${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return csvData.length;
}
