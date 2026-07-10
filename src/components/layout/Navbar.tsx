import { Link, useNavigate } from "react-router-dom";
import { ChefHat, MoveRight, LogOut, LayoutDashboard, User } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export function Navbar() {
  const { user, role, logout, outlets } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/", { replace: true });
    setTimeout(async () => {
      await logout();
    }, 100);
  };

  return (
    <nav className="border-b bg-white border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-orange-600 p-2 rounded-lg">
              <ChefHat className="h-6 w-6 text-white" />
            </div>
            <span className="font-bold text-xl text-zinc-900 tracking-tight">CraveCraft</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/pricing" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Pricing
            </Link>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-zinc-100 rounded-full border border-zinc-200 text-xs font-semibold text-zinc-700 capitalize">
                  <User className="w-3.5 h-3.5 text-zinc-500" />
                  {role === "owner" ? "Owner" : role}
                </div>
                {role === "owner" && outlets && outlets.length > 0 && (
                  <Link
                    to="/select-branch"
                    className="hidden md:flex text-sm font-semibold text-zinc-500 hover:text-zinc-800 transition-colors"
                  >
                    Switch Branch
                  </Link>
                )}
                
                <Link
                  to="/dashboard"
                  className="text-sm font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 group transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>

                <button
                  onClick={handleLogout}
                  className="text-sm font-semibold text-zinc-500 hover:text-red-600 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm font-semibold text-orange-600 hover:text-orange-700 flex flex-row items-center gap-1 group transition-colors"
              >
                Sign In <MoveRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
