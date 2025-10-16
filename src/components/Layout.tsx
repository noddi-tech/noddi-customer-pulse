import { Link, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Target, Settings, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useSyncStatus } from "@/hooks/segmentation";
import { formatDistanceToNow } from "date-fns";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/segments", label: "Segments", icon: Target },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { data: syncStatus } = useSyncStatus();

  const latestSync = syncStatus?.[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold">Noddi Segmentation</h1>
            <nav className="hidden md:flex gap-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path}>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      className="gap-2"
                      size="sm"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <GlobalSearch />
            
            {latestSync && (
              <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`h-2 w-2 rounded-full ${
                  latestSync.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                  latestSync.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span>
                  {latestSync.status === 'running' ? 'Syncing...' :
                   latestSync.last_run_at ? 
                   `Synced ${formatDistanceToNow(new Date(latestSync.last_run_at), { addSuffix: true })}` :
                   'Not synced'}
                </span>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
