import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: "default" | "destructive" | "warning";
  details?: string[];
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel = "Continue",
  cancelLabel = "Cancel",
  onConfirm,
  variant = "default",
  details = []
}: ConfirmationDialogProps) {
  
  const variantConfig = {
    default: {
      icon: Info,
      iconClass: "text-blue-600",
      actionClass: ""
    },
    destructive: {
      icon: AlertTriangle,
      iconClass: "text-red-600",
      actionClass: "bg-red-600 hover:bg-red-700"
    },
    warning: {
      icon: AlertTriangle,
      iconClass: "text-yellow-600",
      actionClass: "bg-yellow-600 hover:bg-yellow-700"
    }
  };

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", config.iconClass)} />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>{description}</p>
            {details.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="font-semibold text-foreground text-sm">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={config.actionClass}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
