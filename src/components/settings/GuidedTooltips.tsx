import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuidedTooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  children?: React.ReactNode;
}

export function GuidedTooltip({ content, side = "top", className, children }: GuidedTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children || (
            <HelpCircle className={cn("h-4 w-4 text-muted-foreground cursor-help", className)} />
          )}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <p className="text-sm">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface InfoBoxProps {
  title: string;
  description: string;
  tips?: string[];
  variant?: "info" | "warning" | "success";
}

export function InfoBox({ title, description, tips = [], variant = "info" }: InfoBoxProps) {
  const variantStyles = {
    info: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
    warning: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900",
    success: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"
  };

  const variantTextStyles = {
    info: "text-blue-900 dark:text-blue-100",
    warning: "text-yellow-900 dark:text-yellow-100",
    success: "text-green-900 dark:text-green-100"
  };

  return (
    <div className={cn("rounded-lg border p-4", variantStyles[variant])}>
      <div className={cn("font-semibold mb-2", variantTextStyles[variant])}>
        {title}
      </div>
      <p className={cn("text-sm mb-2", variantTextStyles[variant])}>
        {description}
      </p>
      {tips.length > 0 && (
        <ul className={cn("text-sm space-y-1 list-disc list-inside", variantTextStyles[variant])}>
          {tips.map((tip, index) => (
            <li key={index}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
