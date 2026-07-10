import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ReactNode, lazy, Suspense } from "react";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Lazy-loaded page components for bundle size optimization
const LandingPage = lazy(() => import("./pages/LandingPage").then(m => ({ default: m.LandingPage })));
const PricingPage = lazy(() => import("./pages/PricingPage").then(m => ({ default: m.PricingPage })));
const Onboarding = lazy(() => import("./pages/Onboarding").then(m => ({ default: m.Onboarding })));
const Login = lazy(() => import("./pages/Login").then(m => ({ default: m.Login })));
const DashboardOverview = lazy(() => import("./pages/dashboard/DashboardOverview").then(m => ({ default: m.DashboardOverview })));
const MenuManager = lazy(() => import("./pages/dashboard/MenuManager").then(m => ({ default: m.MenuManager })));
const InventoryManager = lazy(() => import("./pages/dashboard/InventoryManager").then(m => ({ default: m.InventoryManager })));
const EmployeeManager = lazy(() => import("./pages/dashboard/EmployeeManager").then(m => ({ default: m.EmployeeManager })));
const EmployeeProfile = lazy(() => import("./pages/dashboard/EmployeeProfile").then(m => ({ default: m.EmployeeProfile })));
const WaiterDashboard = lazy(() => import("./pages/dashboard/WaiterDashboard").then(m => ({ default: m.WaiterDashboard })));
const TableServiceConsole = lazy(() => import("./pages/dashboard/TableServiceConsole").then(m => ({ default: m.TableServiceConsole })));
const KitchenDisplay = lazy(() => import("./pages/KitchenDisplay").then(m => ({ default: m.KitchenDisplay })));
const QrMenu = lazy(() => import("./pages/QrMenu").then(m => ({ default: m.QrMenu })));
const AttendanceManager = lazy(() => import("./pages/dashboard/AttendanceManager").then(m => ({ default: m.AttendanceManager })));

const BranchSelector = lazy(() => import("./pages/BranchSelector").then(m => ({ default: m.BranchSelector })));

function ProtectedRoute({ children, requireRole, skipOnboardingCheck = false, skipBranchCheck = false }: { children: ReactNode, requireRole?: string[], skipOnboardingCheck?: boolean, skipBranchCheck?: boolean }) {
  const { user, loading, role, hasCompletedOnboarding, isPaid, selectedOutletId, outlets } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (role === 'owner') {
    if (!isPaid) {
      return <Navigate to="/pricing" replace />;
    }
    if (!skipOnboardingCheck && !hasCompletedOnboarding) {
      return <Navigate to="/onboarding" replace />;
    }
    // If onboarding is complete, but no branch is selected, force selection
    if (!skipBranchCheck && hasCompletedOnboarding && !selectedOutletId && outlets.length > 0) {
      return <Navigate to="/select-branch" replace />;
    }
  }

  if (requireRole && role && !requireRole.includes(role)) {
     // fallback to their specific dashboard based on role
     if (role === 'waiter') return <Navigate to="/dashboard/waiter" replace />;
     if (role === 'cook') return <Navigate to="/dashboard/profile" replace />;
     return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={
          <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center font-sans">
             <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
             <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-4">Loading restflow...</p>
          </div>
        }>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<ProtectedRoute skipOnboardingCheck requireRole={['owner']}><Onboarding /></ProtectedRoute>} />
            <Route path="/select-branch" element={<ProtectedRoute skipBranchCheck requireRole={['owner']}><BranchSelector /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<ProtectedRoute requireRole={['owner', 'manager']}><DashboardOverview /></ProtectedRoute>} />
              <Route path="service" element={<ProtectedRoute requireRole={['owner', 'manager']}><TableServiceConsole /></ProtectedRoute>} />
              <Route path="menu" element={<ProtectedRoute requireRole={['owner', 'manager']}><MenuManager /></ProtectedRoute>} />
              <Route path="inventory" element={<ProtectedRoute requireRole={['owner', 'manager']}><InventoryManager /></ProtectedRoute>} />
              <Route path="employees" element={<ProtectedRoute requireRole={['owner']}><EmployeeManager /></ProtectedRoute>} />
              <Route path="attendance" element={<ProtectedRoute requireRole={['owner', 'manager']}><AttendanceManager /></ProtectedRoute>} />
              <Route path="profile" element={<ProtectedRoute requireRole={['owner', 'manager', 'waiter', 'cook']}><EmployeeProfile /></ProtectedRoute>} />
              <Route path="waiter" element={<ProtectedRoute requireRole={['owner', 'manager', 'waiter']}><WaiterDashboard /></ProtectedRoute>} />
            </Route>
            <Route path="/kitchen/:outletId" element={<KitchenDisplay />} />
            <Route path="/table/:outletId/:tableId" element={<QrMenu />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
