import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsNextCalloutProps {
  type: "syncing" | "compute" | "complete" | "initial";
}

export function WhatsNextCallout({ type }: WhatsNextCalloutProps) {
  const configs = {
    initial: {
      title: "💡 Getting Started",
      message: "Click 'Start First Sync' above to import your customer data. This will fetch customers, bookings, and order lines from the Noddi API.",
      bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
    },
    syncing: {
      title: "💡 What's Next?",
      message: "Your data is syncing automatically every 2 minutes. You can leave this page and return later, or watch the real-time progress below.",
      bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
    },
    compute: {
      title: "✅ Next Step: Compute Segments",
      message: "Your data is ready! Click 'Recompute Segments' to analyze your customers and calculate lifecycle stages and value tiers.",
      bgClass: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
    },
    complete: {
      title: "🎉 You're All Set!",
      message: "Your customer insights are ready. Click 'View Dashboard' to explore lifecycle distribution, value tier breakdown, revenue trends, and predictions.",
      bgClass: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900",
    },
  };

  const config = configs[type];

  return (
    <div className={cn("p-3 rounded-lg border", config.bgClass)}>
      <div className="flex items-start gap-2">
        <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{config.title}</h4>
          <p className="text-sm opacity-90">{config.message}</p>
        </div>
      </div>
    </div>
  );
}
