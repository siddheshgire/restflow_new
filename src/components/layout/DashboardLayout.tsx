import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Package, Settings, LogOut, Users, Utensils, UserCircle, ChefHat, ChevronDown, ClipboardList } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, logout, outlets, selectedOutletId, setSelectedOutletId } = useAuth();

  const allNavItems = [
    { name: "Overview", icon: LayoutDashboard, path: "/dashboard", roles: ['owner', 'manager'] },
    { name: "Table Service", icon: Utensils, path: "/dashboard/service", roles: ['owner', 'manager'] },
    { name: "Menu", icon: FileText, path: "/dashboard/menu", roles: ['owner', 'manager'] },
    { name: "Inventory", icon: Package, path: "/dashboard/inventory", roles: ['owner', 'manager'] },
    { name: "Staff", icon: Users, path: "/dashboard/employees", roles: ['owner'] },
    { name: "Attendance", icon: ClipboardList, path: "/dashboard/attendance", roles: ['owner'] },
    { name: "Waiter View", icon: Utensils, path: "/dashboard/waiter", roles: ['owner', 'manager', 'waiter'] },
    { name: "Kitchen Display", icon: ChefHat, path: `/kitchen/${selectedOutletId}`, roles: ['owner', 'manager', 'cook'], external: true },
    { name: "My Profile", icon: UserCircle, path: "/dashboard/profile", roles: ['owner', 'manager', 'waiter', 'cook'] },
  ];

  const handleLogout = () => {
    navigate('/', { replace: true });
    setTimeout(async () => {
      try {
        await logout();
      } catch (error) {
        console.error("Logout failed:", error);
      }
    }, 100);
  };

  const navItems = allNavItems.filter(item => item.roles.includes(role || ''));

  return (
    <div className="flex h-screen bg-zinc-50 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-950 text-zinc-400 flex flex-col justify-between border-r border-zinc-800 screen-only">
        <div className="py-6 px-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-orange-600 p-2 rounded-xl shadow-lg shadow-orange-600/10">
              <Utensils className="h-5 w-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="text-white font-black text-lg tracking-tight uppercase">RestFlow</span>
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-wider leading-none">Console</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.filter(item => !item.external).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-zinc-800 text-white font-bold"
                      : "hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-orange-500" : ""}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-6 border-t border-zinc-800 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-extrabold text-orange-500">
              {user?.displayName ? user.displayName[0].toUpperCase() : user?.email ? user.email[0].toUpperCase() : "U"}
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-200 leading-none">{user?.displayName || "Restaurant Partner"}</p>
              <p className="text-[10px] text-zinc-500 mt-1 capitalize font-medium">{role} account</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-zinc-400 hover:bg-red-950/20 hover:text-red-400 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-8 justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-zinc-900 mr-4">
              {navItems.find(i => i.path === location.pathname)?.name || "Dashboard"}
            </h1>
            
            {/* Outlet Switcher for Owners */}
            {role === 'owner' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Outlet:</span>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 shadow-sm flex items-center gap-2">
                    {outlets.find(o => o.id === selectedOutletId)?.name || "Not Selected"}
                  </div>
                  <Link
                    to="/select-branch"
                    onClick={() => {
                      setSelectedOutletId("");
                      localStorage.removeItem("selectedOutletId");
                    }}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 transition-colors"
                  >
                    Switch Branch
                  </Link>
                </div>
              </div>
            )}

            {/* Locked outlet display for Manager/Cook/Waiter */}
            {role !== 'owner' && outlets.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 border border-zinc-200 text-xs font-medium text-zinc-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-zinc-700">{outlets[0].name} ({outlets[0].location})</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                 <span className="text-sm font-medium text-zinc-900 leading-none">{user?.displayName || user?.email?.split('@')[0]}</span>
                 <span className="text-xs text-zinc-500 capitalize">{role} Account</span>
              </div>
              <div className="h-8 w-8 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center text-sm font-bold text-orange-700">
                {user?.email?.[0].toUpperCase() || 'U'}
              </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
