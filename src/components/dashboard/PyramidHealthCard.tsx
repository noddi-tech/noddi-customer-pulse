import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePyramidValidation } from "@/hooks/pyramidValidation";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export function PyramidHealthCard() {
  const { data: validation, isLoading } = usePyramidValidation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pyramid Health</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!validation) return null;

  const statusConfig = {
    pass: {
      icon: CheckCircle2,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-950/30",
      label: "Healthy",
    },
    warning: {
      icon: AlertTriangle,
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-100 dark:bg-yellow-950/30",
      label: "Needs Attention",
    },
    fail: {
      icon: XCircle,
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-950/30",
      label: "Issues Detected",
    },
  };

  const config = statusConfig[validation.overall_status];
  const Icon = config.icon;

  const failedChecks = validation.checks.filter(c => c.status === "fail").length;
  const warningChecks = validation.checks.filter(c => c.status === "warning").length;
  const passedChecks = validation.checks.filter(c => c.status === "pass").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span>Pyramid Health</span>
          <Badge className={config.bgColor + " " + config.color}>
            {config.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex items-center gap-3 p-3 rounded-lg ${config.bgColor}`}>
          <Icon className={`h-8 w-8 ${config.color}`} />
          <div className="flex-1">
            <div className="font-semibold">{config.label}</div>
            <div className="text-sm text-muted-foreground">
              {validation.summary.customers_with_pyramid.toLocaleString()} customers tiered
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{passedChecks}</div>
            <div className="text-xs text-muted-foreground">Passed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{warningChecks}</div>
            <div className="text-xs text-muted-foreground">Warnings</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{failedChecks}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Coverage</span>
            <span className="font-medium">{validation.summary.coverage_percentage}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Customers</span>
            <span className="font-medium">{validation.summary.total_customers.toLocaleString()}</span>
          </div>
        </div>

        <Button 
          variant="outline" 
          className="w-full" 
          onClick={() => navigate('/settings?tab=validation')}
        >
          View Full Report
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
