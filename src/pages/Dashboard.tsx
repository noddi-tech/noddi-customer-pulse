import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSegmentCounts } from "@/hooks/segmentation";
import { useSyncNow, useComputeSegments } from "@/hooks/edgeFunctions";
import { RefreshCw } from "lucide-react";
import { CacheIndicator } from "@/components/CacheIndicator";
import { OverviewTab } from "@/components/dashboard/TabContent/OverviewTab";
import { PyramidTab } from "@/components/dashboard/TabContent/PyramidTab";
import { LifecycleTab } from "@/components/dashboard/TabContent/LifecycleTab";
import { SegmentsTab } from "@/components/dashboard/TabContent/SegmentsTab";

export default function Dashboard() {
  const { refetch, isRefetching, dataUpdatedAt } = useSegmentCounts();
  const syncMutation = useSyncNow();
  const computeMutation = useComputeSegments();

  const handleRefresh = async () => {
    await syncMutation.mutateAsync();
    await computeMutation.mutateAsync({});
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive customer intelligence</p>
        </div>
        <div className="flex items-center gap-4">
          <CacheIndicator
            lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined}
            onRefresh={handleRefresh}
            isRefreshing={syncMutation.isPending || computeMutation.isPending}
          />
          <Button onClick={handleRefresh} disabled={syncMutation.isPending || computeMutation.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending || computeMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pyramid">Value Pyramid</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="pyramid" className="space-y-6">
          <PyramidTab />
        </TabsContent>

        <TabsContent value="lifecycle" className="space-y-6">
          <LifecycleTab />
        </TabsContent>

        <TabsContent value="segments" className="space-y-6">
          <SegmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
