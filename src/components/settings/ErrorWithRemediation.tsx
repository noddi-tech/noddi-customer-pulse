import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ExternalLink, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface RemediationStep {
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
  externalLink?: string;
}

interface ErrorWithRemediationProps {
  title: string;
  description: string;
  errorCode?: string;
  remediationSteps: RemediationStep[];
  technicalDetails?: string;
}

export function ErrorWithRemediation({
  title,
  description,
  errorCode,
  remediationSteps,
  technicalDetails
}: ErrorWithRemediationProps) {
  return (
    <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200">
          <AlertCircle className="h-5 w-5" />
          {title}
          {errorCode && (
            <span className="text-xs font-mono bg-red-100 dark:bg-red-900 px-2 py-1 rounded">
              {errorCode}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-red-700 dark:text-red-300">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <p className="font-semibold text-sm text-red-800 dark:text-red-200">
            How to fix this:
          </p>
          {remediationSteps.map((step, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 bg-white dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-900"
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 flex items-center justify-center text-sm font-semibold">
                {index + 1}
              </div>
              <div className="flex-1 space-y-2">
                <p className="font-medium text-sm text-red-900 dark:text-red-100">
                  {step.title}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {step.description}
                </p>
                {(step.action || step.externalLink) && (
                  <div className="pt-1">
                    {step.action && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={step.action}
                        className="border-red-300 hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        {step.actionLabel || "Fix Now"}
                      </Button>
                    )}
                    {step.externalLink && (
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        className="border-red-300 hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
                      >
                        <a href={step.externalLink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Learn More
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {technicalDetails && (
          <details className="mt-4 pt-4 border-t border-red-200 dark:border-red-900">
            <summary className="cursor-pointer text-sm font-medium text-red-800 dark:text-red-200 hover:underline">
              Technical Details
            </summary>
            <pre className="mt-2 p-3 bg-red-100 dark:bg-red-950/80 rounded text-xs overflow-x-auto text-red-900 dark:text-red-100 font-mono">
              {technicalDetails}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
