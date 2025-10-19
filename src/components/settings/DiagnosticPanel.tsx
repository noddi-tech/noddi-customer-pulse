import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function DiagnosticPanel() {
  const [loading, setLoading] = useState(false);
  const [userGroupsResult, setUserGroupsResult] = useState<any>(null);
  const [orgsResult, setOrgsResult] = useState<any>(null);

  const testUserGroups = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-user-groups');
      if (error) throw error;
      setUserGroupsResult(data);
      toast.success("User groups diagnostic complete");
    } catch (error: any) {
      toast.error(`User groups test failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testOrganizations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-organizations');
      if (error) throw error;
      setOrgsResult(data);
      toast.success("Organizations diagnostic complete");
    } catch (error: any) {
      toast.error(`Organizations test failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Diagnostics</CardTitle>
        <CardDescription>
          Test API endpoints to investigate organization-user_group linking
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={testUserGroups} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test User Groups API
          </Button>
          <Button onClick={testOrganizations} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test Organizations API
          </Button>
        </div>

        {userGroupsResult && (
          <div className="space-y-2">
            <h3 className="font-semibold">User Groups Results:</h3>
            <div className="bg-muted p-3 rounded-md overflow-auto max-h-96">
              <pre className="text-xs">{JSON.stringify(userGroupsResult, null, 2)}</pre>
            </div>
          </div>
        )}

        {orgsResult && (
          <div className="space-y-2">
            <h3 className="font-semibold">Organizations Results:</h3>
            <div className="bg-muted p-3 rounded-md overflow-auto max-h-96">
              <pre className="text-xs">{JSON.stringify(orgsResult, null, 2)}</pre>
            </div>
          </div>
        )}

        {(userGroupsResult || orgsResult) && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-md">
            <h4 className="font-semibold mb-2">Analysis:</h4>
            {userGroupsResult?.organizationFields && (
              <div className="text-sm space-y-1">
                <p>User Groups → Org Link:</p>
                <ul className="list-disc list-inside ml-4">
                  <li>Has org: {userGroupsResult.organizationFields.hasOrg ? "✅" : "❌"}</li>
                  <li>Has org_id: {userGroupsResult.organizationFields.hasOrgId ? "✅" : "❌"}</li>
                  <li>Has organization: {userGroupsResult.organizationFields.hasOrganization ? "✅" : "❌"}</li>
                  <li>Has organization_id: {userGroupsResult.organizationFields.hasOrganizationId ? "✅" : "❌"}</li>
                  <li>Has service_organization: {userGroupsResult.organizationFields.hasServiceOrganization ? "✅" : "❌"}</li>
                </ul>
              </div>
            )}
            {orgsResult?.userGroupFields && (
              <div className="text-sm space-y-1 mt-3">
                <p>Organizations → User Groups Link:</p>
                <ul className="list-disc list-inside ml-4">
                  <li>Has user_group: {orgsResult.userGroupFields.hasUserGroup ? "✅" : "❌"}</li>
                  <li>Has user_group_id: {orgsResult.userGroupFields.hasUserGroupId ? "✅" : "❌"}</li>
                  <li>Has user_members: {orgsResult.userGroupFields.hasUserMembers ? "✅" : "❌"}</li>
                  {orgsResult.userMembersCount > 0 && (
                    <li>User members count: {orgsResult.userMembersCount}</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
