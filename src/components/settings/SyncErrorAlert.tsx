import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncErrorAlertProps {
  resource: string;
  errorMessage: string;
  lastRunAt: Date | null;
}

export function SyncErrorAlert({ resource, errorMessage, lastRunAt }: SyncErrorAlertProps) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="capitalize">
        {resource} Sync Failed
        {lastRunAt && (
          <span className="text-xs ml-2 font-normal">
            ({formatDistanceToNow(lastRunAt, { addSuffix: true })})
          </span>
        )}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <code className="text-xs bg-destructive/20 px-2 py-1 rounded block mb-2">
          {errorMessage}
        </code>
        <p className="text-xs">
          Auto-sync will retry in 2 minutes. If this persists, check the{' '}
          <a 
            href="https://supabase.com/dashboard/project/wylrkmtpjodunmnwncej/functions/sync-noddi-data/logs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-destructive-foreground"
          >
            edge function logs
          </a>.
        </p>
      </AlertDescription>
    </Alert>
  );
}
