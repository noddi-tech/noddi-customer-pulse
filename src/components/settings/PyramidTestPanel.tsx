import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePyramidValidation, useSegmentExamples } from "@/hooks/pyramidValidation";
import { useComputeSegments } from "@/hooks/edgeFunctions";
import { useQueryClient } from "@tanstack/react-query";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  TestTube2, 
  TrendingUp,
  Users,
  Award,
  Target,
  Sparkles
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function PyramidTestPanel() {
  const queryClient = useQueryClient();
  const { data: validation, isLoading, refetch, isRefetching } = usePyramidValidation();
  const { data: examples, isLoading: examplesLoading } = useSegmentExamples();
  const computeMutation = useComputeSegments();

  const handleRecompute = async () => {
    await computeMutation.mutateAsync({});
    // Force cache invalidation to show fresh data immediately
    queryClient.invalidateQueries({ queryKey: ['pyramid-validation'] });
    queryClient.invalidateQueries({ queryKey: ['segment-examples'] });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube2 className="h-5 w-5" />
            Pyramid Segmentation Validation
          </CardTitle>
          <CardDescription>Running validation checks...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!validation) return null;

  const statusIcon = {
    pass: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    fail: <XCircle className="h-5 w-5 text-red-600" />,
  };

  const statusBadge = {
    pass: <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Pass</Badge>,
    warning: <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">Warning</Badge>,
    fail: <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">Fail</Badge>,
  };

  const tierIcons: Record<string, any> = {
    'Champion': Award,
    'Loyalist': Sparkles,
    'Engaged': TrendingUp,
    'Prospect': Target,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TestTube2 className="h-5 w-5" />
              Pyramid Segmentation Validation
            </CardTitle>
            <CardDescription>
              Phase 2 implementation testing & diagnostics
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isRefetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Status */}
        <Alert className={
          validation.overall_status === "pass" 
            ? "border-green-500 bg-green-50 dark:bg-green-950/30"
            : validation.overall_status === "warning"
            ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30"
            : "border-red-500 bg-red-50 dark:bg-red-950/30"
        }>
          {statusIcon[validation.overall_status]}
          <AlertTitle>
            Overall Status: {validation.overall_status === "pass" ? "✓ Healthy" : validation.overall_status === "warning" ? "⚠️ Needs Attention" : "❌ Issues Detected"}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <div>
              {validation.summary.customers_with_pyramid} / {validation.summary.total_customers} customers have pyramid tiers assigned 
              ({validation.summary.coverage_percentage}% feature coverage)
            </div>
            {validation.overall_status !== "pass" && (
              <div className="pt-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleRecompute}
                  disabled={computeMutation.isPending}
                >
                  {computeMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <TrendingUp className="h-4 w-4 mr-2" />
                  )}
                  Run Analysis to Fix
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground">Total Customers</div>
            <div className="text-2xl font-bold">{validation.summary.total_customers.toLocaleString()}</div>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground">With Features</div>
            <div className="text-2xl font-bold">{validation.summary.customers_with_features.toLocaleString()}</div>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground">With Segments</div>
            <div className="text-2xl font-bold">{validation.summary.customers_with_segments.toLocaleString()}</div>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-sm text-muted-foreground">Pyramid Tiered</div>
            <div className="text-2xl font-bold">{validation.summary.customers_with_pyramid.toLocaleString()}</div>
          </div>
        </div>

        {/* Validation Checks */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Validation Checks</h4>
          {validation.checks.map((check, index) => (
            <div 
              key={index} 
              className="flex items-start gap-3 p-3 border rounded-lg bg-card"
            >
              {statusIcon[check.status]}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{check.check}</span>
                  {statusBadge[check.status]}
                </div>
                <p className="text-sm text-muted-foreground">{check.message}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Example Customers by Segment */}
        {!examplesLoading && examples && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="examples">
              <AccordionTrigger className="text-sm font-semibold">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  View Example Customers by Segment
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                {Object.entries(examples).map(([segment, customers]) => (
                  <div key={segment}>
                    <h5 className="font-semibold text-sm mb-2">{segment} Segment (Top 5)</h5>
                    <div className="space-y-2">
                      {customers.map((customer: any, idx: number) => {
                        const TierIcon = tierIcons[customer.pyramid_tier_name] || Target;
                        return (
                          <div key={idx} className="text-xs p-2 bg-muted/50 rounded border">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <TierIcon className="h-3 w-3" />
                                <span className="font-medium">
                                  {customer.pyramid_tier_name} (Tier {customer.pyramid_tier})
                                </span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                Score: {customer.composite_score?.toFixed(2) || "N/A"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-muted-foreground">
                              <div>Fleet: {customer.fleet_size}</div>
                              <div>Lifecycle: {customer.lifecycle}</div>
                              <div>Freq: {customer.features?.frequency_24m}/24m</div>
                              <div>Rev: {Math.round(customer.features?.revenue_24m || 0).toLocaleString()} NOK</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-1 text-muted-foreground">
                              <div>Tire: {Math.round(customer.features?.tire_revenue_24m || 0).toLocaleString()} NOK</div>
                              <div>Service: {Math.round(customer.features?.service_revenue_24m || 0).toLocaleString()} NOK</div>
                            </div>
                            {customer.high_value_tire_purchaser && (
                              <Badge className="mt-1 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                                High-Value Tire Purchaser
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                      {customers.length === 0 && (
                        <div className="text-xs text-muted-foreground italic">
                          No tiered customers in this segment yet
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
