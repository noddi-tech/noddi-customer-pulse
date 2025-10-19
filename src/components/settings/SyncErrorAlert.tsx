import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncErrorAlertProps {
  resource: string;
  errorMessage: string;
  lastRunAt: Date | null;
}

export function SyncErrorAlert({ resource, errorMessage, lastRunAt }: SyncErrorAlertProps) {
  // Try to parse structured error message
  let parsedError: any = null;
  try {
    parsedError = JSON.parse(errorMessage);
  } catch {
    // Not JSON, use as plain text
  }

  const isPartialFailure = parsedError?.type === "partial_failure";
  const isFatalError = parsedError?.type === "fatal_error";

  return (
    <Alert variant={isPartialFailure ? "default" : "destructive"} className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="capitalize flex items-center gap-2">
        <span>{isPartialFailure ? `${resource} Sync Completed with Warnings` : `${resource} Sync Failed`}</span>
        {lastRunAt && (
          <span className="text-xs font-normal bg-destructive/20 px-2 py-0.5 rounded">
            {formatDistanceToNow(lastRunAt, { addSuffix: true })}
          </span>
        )}
      </AlertTitle>
      <AlertDescription className="mt-2">
        {parsedError ? (
          <div className="space-y-2">
            <p className="text-sm">{parsedError.message}</p>
            
            {isPartialFailure && parsedError.skipped_pages && (
              <div className="text-xs bg-muted/50 px-3 py-2 rounded">
                <p className="font-medium mb-1">⚠️ Skipped Pages (500 errors from API):</p>
                <code className="text-xs">[{parsedError.skipped_pages.join(', ')}]</code>
                {parsedError.successful_records && (
                  <p className="mt-2">✓ Successfully synced: <strong>{parsedError.successful_records.toLocaleString()}</strong> records</p>
                )}
              </div>
            )}
            
            {isFatalError && (
              <code className="text-xs bg-destructive/20 px-2 py-1 rounded block">
                {parsedError.message}
              </code>
            )}
          </div>
        ) : (
          <code className="text-xs bg-destructive/20 px-2 py-1 rounded block mb-2">
            {errorMessage}
          </code>
        )}
        
        <p className="text-xs mt-2">
          {isPartialFailure 
            ? "Some pages failed due to API errors. Data from successful pages has been synced." 
            : "Auto-sync will retry in 2 minutes."
          } Check the{' '}
          <a 
            href="https://supabase.com/dashboard/project/wylrkmtpjodunmnwncej/functions/sync-noddi-data/logs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-destructive-foreground"
          >
            edge function logs
          </a> for details.
        </p>
      </AlertDescription>
    </Alert>
  );
}
