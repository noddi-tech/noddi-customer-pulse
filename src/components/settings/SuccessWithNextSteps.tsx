import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface NextStep {
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
  recommended?: boolean;
}

interface SuccessWithNextStepsProps {
  title: string;
  description: string;
  nextSteps?: NextStep[];
  stats?: Record<string, string | number>;
}

export function SuccessWithNextSteps({
  title,
  description,
  nextSteps = [],
  stats = {}
}: SuccessWithNextStepsProps) {
  return (
    <Card className="border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
          <CheckCircle2 className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription className="text-green-700 dark:text-green-300">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(stats).map(([key, value]) => (
              <div
                key={key}
                className="bg-white dark:bg-green-950/50 p-3 rounded-lg border border-green-200 dark:border-green-900"
              >
                <div className="text-xs text-green-700 dark:text-green-400">{key}</div>
                <div className="text-lg font-bold text-green-900 dark:text-green-100">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
              </div>
            ))}
          </div>
        )}

        {nextSteps.length > 0 && (
          <div className="space-y-3">
            <p className="font-semibold text-sm text-green-800 dark:text-green-200">
              What's next:
            </p>
            {nextSteps.map((step, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-white dark:bg-green-950/50 rounded-lg border border-green-200 dark:border-green-900"
              >
                {step.recommended && (
                  <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-2">
                  <p className="font-medium text-sm text-green-900 dark:text-green-100">
                    {step.title}
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {step.description}
                  </p>
                  {step.action && step.actionLabel && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={step.action}
                      className="border-green-300 hover:bg-green-100 dark:border-green-800 dark:hover:bg-green-900"
                    >
                      <ArrowRight className="h-3 w-3 mr-1" />
                      {step.actionLabel}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
