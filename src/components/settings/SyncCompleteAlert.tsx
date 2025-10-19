import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";

interface SyncCompleteAlertProps {
  activeCustomers: number;
  activeBookings: number;
  activeOrderLines: number;
}

export function SyncCompleteAlert({ activeCustomers, activeBookings, activeOrderLines }: SyncCompleteAlertProps) {
  return (
    <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900">
      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      <AlertTitle className="text-green-900 dark:text-green-100">Data Sync Complete!</AlertTitle>
      <AlertDescription className="text-green-800 dark:text-green-200">
        <p>
          You now have <span className="font-semibold">{activeCustomers.toLocaleString()}</span> active customers 
          with <span className="font-semibold">{activeBookings.toLocaleString()}</span> bookings 
          and <span className="font-semibold">{activeOrderLines.toLocaleString()}</span> order lines ready for analysis.
        </p>
        <p className="mt-2 font-medium">
          <span className="text-green-700 dark:text-green-300">Next step:</span> Click 'Recompute Segments' below to analyze customer lifecycles and value tiers.
        </p>
      </AlertDescription>
    </Alert>
  );
}
