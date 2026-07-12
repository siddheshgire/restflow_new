import { useEffect, useState, useMemo } from "react";
import { motion } from "motion/react";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Users, ShoppingBag, Utensils, IndianRupee, MapPin, FileDown, CheckCircle2, ChevronDown, AlertCircle, Clock, ChefHat, Printer, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-zinc-200 p-4 rounded-xl shadow-xl min-w-[150px]">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 pb-2 border-b border-zinc-100">{label}</p>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center gap-4">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-600"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Revenue</span>
            <span className="text-sm font-black text-orange-600">₹{payload[0].value.toLocaleString()}</span>
          </div>
          {payload[1] && (
            <div className="flex justify-between items-center gap-4">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-600"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Orders</span>
              <span className="text-sm font-black text-purple-600">{payload[1].value}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg shadow-xl text-white">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">{data.name}</p>
        <p className="text-sm font-black text-white">₹{data.value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
};

export function DashboardOverview() {
  const { user, selectedOutletId, outlets, role } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month'>(() => {
    return (localStorage.getItem("dashboard_date_filter") as any) || 'week';
  });
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [billReprintOrder, setBillReprintOrder] = useState<any>(null);
  const [tableCount, setTableCount] = useState(12);

  // Subscribe to live tableCount from outlet document
  useEffect(() => {
    if (!selectedOutletId) return;
    const unsubscribeOutlet = onSnapshot(doc(db, "outlets", selectedOutletId), (docSnap) => {
      if (docSnap.exists()) {
        setTableCount(docSnap.data().tableCount || 12);
      }
    });
    return () => unsubscribeOutlet();
  }, [selectedOutletId]);

  useEffect(() => {
    if (role === 'manager') {
      setDateFilter('today');
    }
  }, [role]);

  const currentOutlet = outlets.find(o => o.id === selectedOutletId);
  const outletName = currentOutlet ? currentOutlet.name : "Select or create an outlet";
  const outletLocation = currentOutlet ? currentOutlet.location : "";

  // Dynamic server-side stats fetcher
  useEffect(() => {
    if (!selectedOutletId) {
      setStats(null);
      setLoading(false);
      return;
    }

    let isCancelled = false;
    const loadStats = async () => {
      setLoading(true);
      try {
        const storedUser = localStorage.getItem("mock_auth_user");
        const userObj = storedUser ? JSON.parse(storedUser) : null;

        const token = localStorage.getItem("mock_auth_jwt") || "";
        const res = await fetch(`/api/dashboard-stats?dateFilter=${dateFilter}`, {
          headers: {
            "Authorization": token ? `Bearer ${token}` : "",
            "X-Selected-Outlet-ID": selectedOutletId
          }
        });
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadStats();

    // SSE update listener triggers instant re-fetch on database changes
    const connection = new EventSource(`/api/live-updates?outletId=${selectedOutletId || "global"}`);
    connection.onmessage = (event) => {
      if (event.data === "update") {
        loadStats();
      }
    };

    return () => {
      isCancelled = true;
      connection.close();
    };
  }, [selectedOutletId, dateFilter]);

  // Server-side pre-calculated stats bindings
  const totalRevenue = stats?.totalRevenue || 0;
  const filteredOrdersLength = stats?.ordersCount || 0;
  const avgTurnaround = stats?.avgTurnaround || "32 min";
  const occupancyRate = stats?.occupancyRate || 0;
  const occupiedTablesCount = stats?.occupiedTablesCount || 0;
  
  const preparingOrdersCount = stats?.preparingOrdersCount || 0;
  const readyOrdersCount = stats?.readyOrdersCount || 0;
  const staleTables = stats?.staleTables || [];
  
  const finalChartData = stats?.chartData || [];
  const categorySales = stats?.categorySales || [];
  const finalBestSellers = stats?.bestSellers || [];
  const lowStockItems = stats?.lowStockItems || [];
  const activeStaff = stats?.activeStaff || [];
  const finalSecurityLogs = stats?.securityLogs || [];
  const recentTransactions = stats?.recentTransactions || [];
  const PIE_COLORS = ['#f97316', '#8b5cf6', '#10b981', '#3b82f6', '#f43f5e', '#f59e0b', '#64748b'];

  const welcomeName = user?.displayName || user?.email?.split('@')[0] || "Owner";

  // Financial breakdown calculations
  const netValue = totalRevenue;
  const subtotal = Math.round(totalRevenue / 1.23); 
  const mockGst = Math.round(subtotal * 0.18);
  const mockServiceCharge = Math.round(subtotal * 0.05);
  const reportToken = "REP-" + Math.floor(100000 + Math.random() * 900000) + "-INTEGRITY";

  const getRevenueLabel = () => {
    if (dateFilter === 'today') return "Today's Revenue";
    if (dateFilter === 'yesterday') return "Yesterday's Revenue";
    if (dateFilter === 'week') return "7 Days Revenue";
    return "Month's Revenue";
  };

  const getOrdersLabel = () => {
    if (dateFilter === 'today') return "Today's Orders";
    if (dateFilter === 'yesterday') return "Yesterday's Orders";
    if (dateFilter === 'week') return "7 Days Orders";
    return "Month's Orders";
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      {/* Low Stock Alert Banner — shown to owner & manager when any inventory item is below threshold */}
      {lowStockItems.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">
              ⚠️ {lowStockItems.length} inventory item{lowStockItems.length > 1 ? 's are' : ' is'} running low!
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              {lowStockItems.slice(0, 3).map(i => `${i.name} (${i.quantity} ${i.unit} left)`).join(' • ')}
              {lowStockItems.length > 3 ? ` • +${lowStockItems.length - 3} more` : ''}
            </p>
          </div>
          <Link to="/dashboard/inventory" className="shrink-0 text-xs font-bold text-red-600 hover:text-red-800 underline underline-offset-2 transition-colors">
            View Inventory
          </Link>
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200 pb-6 screen-only">
        <div>
           <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Good morning, {welcomeName}</h2>
           <p className="text-zinc-500 text-sm">Here's your revenue summary for {outletName} {outletLocation ? `(${outletLocation})` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex items-center">
              <button
                onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white pl-3 pr-8 py-2 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 transition-colors cursor-pointer relative"
              >
                {dateFilter === 'today' ? "Today" : dateFilter === 'yesterday' ? "Yesterday" : dateFilter === 'week' ? "Last 7 Days" : "This Month"}
                <ChevronDown className="absolute right-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
              </button>
              {isDateDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsDateDropdownOpen(false)} />
                  <div className="absolute right-0 mt-1 top-full w-40 bg-white border border-zinc-200 rounded-xl shadow-xl z-40 py-1.5 animate-in fade-in slide-in-from-top-1 duration-100">
                    {[
                      { value: 'today', label: 'Today' },
                      { value: 'yesterday', label: 'Yesterday' },
                      { value: 'week', label: 'Last 7 Days' },
                      { value: 'month', label: 'This Month' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setDateFilter(opt.value as any);
                          localStorage.setItem("dashboard_date_filter", opt.value);
                          setIsDateDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors cursor-pointer hover:bg-zinc-50 ${
                          dateFilter === opt.value ? "text-orange-600 bg-orange-50/30" : "text-zinc-650 hover:text-zinc-950"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:ring-offset-2 transition-all cursor-pointer animate-pulse"
            >
              <FileDown className="mr-2 h-4 w-4" /> Export PDF Report
            </button>
            <Link to={`/kitchen/${selectedOutletId}`} target="_blank" className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 transition-all">
                <Utensils className="mr-2 h-4 w-4" /> Open Kitchen Display
            </Link>
            <Link to={`/table/${selectedOutletId}/1`} target="_blank" className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 transition-all">
                Simulate QR Menu (Table 1)
            </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 screen-only">
        {[
          { name: getRevenueLabel(), value: `₹${totalRevenue.toLocaleString()}`, change: totalRevenue > 0 ? "Live" : "+0.0%", icon: IndianRupee },
          { name: getOrdersLabel(), value: `${filteredOrdersLength}`, change: filteredOrdersLength > 0 ? "Live" : "+0.0%", icon: ShoppingBag },
          { name: "Avg. Turnaround", value: avgTurnaround, change: "-0.0%", icon: TrendingUp },
          { name: "Table Occupancy", value: `${occupancyRate}%`, change: occupiedTablesCount > 0 ? "Live" : "+0.0%", icon: Users },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
             <motion.div
                key={stat.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:-translate-y-1.5 hover:shadow-xl hover:border-zinc-300 transition-all duration-300 cursor-default"
              >
                 <div className="flex items-center justify-between">
                   <div className="text-sm font-medium text-zinc-500">{stat.name}</div>
                   <Icon className="h-5 w-5 text-zinc-400" />
                 </div>
                 <div className="mt-2 flex items-baseline gap-2">
                   <div className="text-3xl font-bold text-zinc-900 tracking-tight">{stat.value}</div>
                   <div className={`text-sm font-medium ${stat.change.includes('Live') || stat.change.startsWith('+') ? 'text-emerald-600' : 'text-red-600'}`}>
                     {stat.change}
                   </div>
                 </div>
              </motion.div>
          )
        })}
      </div>

      {/* Row 2: Charts (Owner gets Dual Metric + Donut, Manager gets Kitchen Load) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 screen-only">
          {role === 'owner' ? (
            <>
              {/* Dual-Metric Revenue & Orders Chart */}
              <div className="lg:col-span-2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-zinc-300 transition-all duration-300">
                 <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-semibold text-zinc-900 tracking-tight">Revenue & Orders Trend</h3>
                 </div>
                 <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                       <ComposedChart data={finalChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#a1a1aa', fontWeight: 600 }} dy={10} />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#a1a1aa', fontWeight: 600 }} dx={-10} />
                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={false} />
                        <Tooltip content={CustomChartTooltip} cursor={{ stroke: '#f4f4f5', strokeWidth: 2, fill: 'transparent' }} />
                        <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                        <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#8b5cf6', strokeWidth: 0 }} />
                       </ComposedChart>
                    </ResponsiveContainer>
                 </div>
              </div>
              
              {/* Sales By Category Donut Chart */}
              <div className="lg:col-span-1 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-zinc-300 transition-all duration-300 flex flex-col">
                 <h3 className="text-base font-semibold text-zinc-900 tracking-tight mb-4">Sales by Category</h3>
                 {categorySales.length > 0 ? (
                   <div className="h-64 w-full flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie
                             data={categorySales}
                             cx="50%"
                             cy="45%"
                             innerRadius={60}
                             outerRadius={85}
                             paddingAngle={4}
                             dataKey="value"
                             stroke="none"
                           >
                             {categorySales.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                             ))}
                           </Pie>
                           <Tooltip content={CustomPieTooltip} />
                           <Legend 
                             verticalAlign="bottom" 
                             height={36} 
                             iconType="circle"
                             formatter={(value) => <span className="text-xs font-semibold text-zinc-600">{value}</span>}
                           />
                         </PieChart>
                      </ResponsiveContainer>
                   </div>
                 ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
                     <Utensils className="w-10 h-10 mb-2 opacity-20" />
                     <p className="text-sm font-semibold">No category data</p>
                   </div>
                 )}
              </div>
            </>
          ) : (
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col">
                  <h3 className="text-base font-semibold text-zinc-900 tracking-tight mb-6">Live Kitchen Load</h3>
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex flex-col items-center justify-center">
                      <ChefHat className="w-8 h-8 text-orange-600 mb-2" />
                      <span className="text-3xl font-black text-zinc-900">{preparingOrdersCount}</span>
                      <span className="text-xs font-bold text-orange-600 uppercase tracking-wider mt-1">Preparing</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex flex-col items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
                      <span className="text-3xl font-black text-zinc-900">{readyOrdersCount}</span>
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider mt-1">Ready</span>
                    </div>
                  </div>
               </div>
               <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col">
                  <h3 className="text-base font-semibold text-zinc-900 tracking-tight mb-6">Tables Needing Attention</h3>
                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px]">
                    {staleTables.map(order => (
                      <div key={order.id} className="p-3 bg-red-50/50 border border-red-100 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertCircle className="w-5 h-5 text-red-500" />
                          <div>
                            <p className="font-bold text-zinc-900 text-sm">Table {order.tableNumber}</p>
                            <p className="text-xs text-zinc-500">Waiter: {order.waiterName || 'Unassigned'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-md">
                            <Clock className="w-3 h-3" />
                            {Math.floor((Date.now() - order.createdAt) / 60000)}m
                          </span>
                        </div>
                      </div>
                    ))}
                    {staleTables.length === 0 && (
                       <div className="text-center py-8 text-zinc-400 text-sm">
                          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                          <p className="font-semibold text-zinc-700">All tables are fine</p>
                          <p className="text-xs mt-1 text-zinc-500">No table has been occupied for over 45 minutes.</p>
                       </div>
                    )}
                  </div>
               </div>
            </div>
          )}
      </div>

      {/* Row 3: Security Logs & Active Staff */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 screen-only">
          <div className="lg:col-span-1 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col">
              <h3 className="text-base font-semibold text-zinc-900 tracking-tight mb-6 flex items-center gap-2">
                {role === 'owner' ? "Security Audit Logs" : "Operational Stock Alerts"}
              </h3>
              <div className="space-y-6 flex-1 overflow-y-auto max-h-[300px]">
                  {role === 'owner' ? (
                     finalSecurityLogs.map((log, idx) => (
                        <div key={log.id || idx} className="flex gap-4 animate-in fade-in duration-200">
                           <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                             log.type?.includes("fail") ? "bg-rose-500 shadow-md shadow-rose-500/20" :
                             log.type?.includes("change") ? "bg-amber-500 shadow-md shadow-amber-500/20" :
                             "bg-emerald-500 shadow-md shadow-emerald-500/20"
                           }`} />
                           <div>
                              <p className="text-sm font-medium text-zinc-900 leading-none">{log.message}</p>
                              <p className="text-xs text-zinc-500 mt-1.5">
                                 {log.createdAt ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true }) : "recently"}
                              </p>
                           </div>
                        </div>
                     ))
                  ) : (
                     <div className="space-y-4">
                        {lowStockItems.map((item, idx) => (
                           <div key={item.id || idx} className="p-3 bg-rose-50/50 border border-rose-100 rounded-lg flex items-start gap-3 animate-in fade-in duration-200">
                              <span className="h-2 w-2 rounded-full bg-rose-500 mt-1.5 shrink-0 animate-pulse" />
                              <div className="flex-1 text-xs">
                                 <p className="font-bold text-zinc-900 text-sm">{item.name}</p>
                                 <p className="text-zinc-500 mt-1">Current Stock: <span className="font-bold text-rose-600">{item.quantity} {item.unit}</span></p>
                                 <p className="text-zinc-400 mt-0.5">Warning Threshold: {item.threshold} {item.unit}</p>
                              </div>
                           </div>
                        ))}
                        {lowStockItems.length === 0 && (
                           <div className="text-center py-8 text-zinc-400 text-sm">
                              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                              <p className="font-semibold text-zinc-700">All stocks are safe</p>
                              <p className="text-xs mt-1 text-zinc-500">No items are currently below low threshold margins.</p>
                           </div>
                        )}
                     </div>
                  )}
              </div>
          </div>
          
          <div className="lg:col-span-2 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col">
              <h3 className="text-base font-semibold text-zinc-900 tracking-tight mb-6">Staff on Duty (Live)</h3>
              <div className="flex-1 space-y-4 overflow-y-auto max-h-[300px]">
                 {activeStaff.map(staff => (
                    <div key={staff.id} className="flex justify-between items-center p-3 bg-zinc-50 border border-zinc-100 rounded-xl hover:bg-zinc-100 transition-colors">
                       <div className="flex gap-3 items-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/30 animate-pulse" />
                          <div>
                             <p className="font-bold text-zinc-900 text-sm">{staff.name}</p>
                             <p className="text-xs text-zinc-500 capitalize">{staff.role}</p>
                          </div>
                       </div>
                       <span className="text-xs font-semibold text-zinc-500 bg-white px-2.5 py-1 rounded-md border border-zinc-200">
                         Clocked in: <span className="text-zinc-900">{staff.clockIn ? formatDistanceToNow(new Date(staff.clockIn), {addSuffix: true}) : "recently"}</span>
                       </span>
                    </div>
                 ))}
                 {activeStaff.length === 0 && (
                    <div className="text-center py-6 text-zinc-400 text-sm italic">
                       <Users className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                       No staff currently clocked in.
                    </div>
                 )}
              </div>
          </div>
      </div>

           {/* Order History / Recent Transactions */}
           <div className="mb-8 border-t border-zinc-200 pt-8 mt-8 screen-only">
              <h3 className="text-xl font-bold text-zinc-900 mb-4">Recent Transactions</h3>
              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                   <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                         <th className="px-4 py-3">Order ID / Time</th>
                         <th className="px-4 py-3">Table</th>
                         <th className="px-4 py-3">Status</th>
                         <th className="px-4 py-3">Amount</th>
                         <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-100">
                      {recentTransactions.map((order, idx) => (
                         <tr key={order.id || idx} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3">
                               <div className="font-mono text-zinc-900 font-semibold uppercase">{(order.id || "").slice(-6)}</div>
                               <div className="text-xs text-zinc-500">{new Date(order.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</div>
                            </td>
                            <td className="px-4 py-3 font-medium text-zinc-700">T-{order.tableId}</td>
                            <td className="px-4 py-3">
                               <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                                  order.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                               }`}>
                                  {order.status}
                               </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-zinc-900">₹{(order.total || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                               <button
                                 onClick={() => setBillReprintOrder(order)}
                                 className="px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                               >
                                 <Printer className="w-3.5 h-3.5" /> Reprint
                               </button>
                            </td>
                         </tr>
                      ))}
                      {recentTransactions.length === 0 && (
                         <tr>
                           <td colSpan={5} className="px-6 py-12 text-center bg-zinc-50/50">
                             <div className="flex flex-col items-center justify-center space-y-3">
                               <div className="w-12 h-12 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-sm">
                                 <IndianRupee className="w-5 h-5 text-zinc-300" />
                               </div>
                               <h4 className="text-sm font-bold text-zinc-900">No transactions found</h4>
                               <p className="text-xs text-zinc-500 max-w-sm mx-auto">No past transactions have been recorded for this period yet.</p>
                             </div>
                           </td>
                         </tr>
                      )}
                   </tbody>
                </table>
              </div>
           </div>

      {/* ========================================================================= */}
      {/* PROFESSIONAL PDF EXPORTER LAYOUT (HIDDEN ON SCREEN, RENDERED ON PRINT) */}
      {/* ========================================================================= */}
      {!billReprintOrder && (
         <div className="print-only font-sans p-8 text-zinc-950 bg-white relative overflow-hidden min-h-[1056px] border border-zinc-200">
         {/* Background Watermark */}
         <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none z-0">
            <h1 className="text-[120px] font-black tracking-widest transform -rotate-45">CONFIDENTIAL</h1>
         </div>

         <div className="relative z-10 flex flex-col h-full">
           {/* Header */}
           <div className="border-b-4 border-zinc-950 pb-6 mb-6">
              <div className="flex justify-between items-end">
                 <div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-zinc-950 uppercase">CraveCraft SaaS OS</h1>
                    <p className="text-[11px] text-zinc-500 font-bold tracking-[0.2em] uppercase mt-2">Executive Business Intelligence Report</p>
                 </div>
                 <div className="text-right">
                    <p className="text-lg font-black text-zinc-950 uppercase tracking-wide">{outletName}</p>
                    <p className="text-xs text-zinc-500 mt-1 uppercase font-semibold">{outletLocation || "HQ Branch"}</p>
                 </div>
              </div>
              <div className="flex justify-between mt-6 text-[10px] text-zinc-400 font-bold tracking-wider uppercase bg-zinc-50 px-3 py-2 rounded">
                 <span>RUN DATE: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })} • {new Date().toLocaleTimeString()}</span>
                 <span className="text-zinc-600">SYSTEM INTEGRITY: SECURE / STABLE</span>
              </div>
           </div>

           {/* Executive Summary */}
           <div className="mb-6">
              <h3 className="text-[11px] font-extrabold tracking-widest text-zinc-900 uppercase border-b border-zinc-200 pb-2 mb-3">01. Executive Summary</h3>
              <p className="text-xs text-zinc-600 leading-relaxed font-medium text-justify">
                This document serves as the official, system-generated operational report for the specified period. It aggregates real-time POS data, inventory levels, and workforce attendance logs to provide a unified snapshot of the outlet's performance. All financial figures are automatically verified against the encrypted Firestore ledger.
              </p>
           </div>

           {/* Stats Grid */}
           <div className="mb-8">
             <h3 className="text-[11px] font-extrabold tracking-widest text-zinc-900 uppercase border-b border-zinc-200 pb-2 mb-4">02. Key Performance Indicators</h3>
             <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "Total Revenue", val: `₹${totalRevenue.toLocaleString()}` },
                  { label: "Total Orders", val: `${filteredOrdersLength}` },
                  { label: "Avg Order Val", val: `₹${filteredOrdersLength > 0 ? Math.round(totalRevenue / filteredOrdersLength).toLocaleString() : 0}` },
                  { label: "Occupancy", val: `${occupancyRate}%` },
                  { label: "Avg Time", val: avgTurnaround }
                ].map((stat, i) => (
                   <div key={i} className="border-l-2 border-zinc-800 bg-zinc-50 p-3">
                      <p className="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">{stat.label}</p>
                      <p className="text-xl font-black text-zinc-950 mt-1">{stat.val}</p>
                   </div>
                ))}
             </div>
           </div>

           {/* Vector Revenue Chart */}
           <div className="mb-8">
              <h3 className="text-[11px] font-extrabold tracking-widest text-zinc-900 uppercase border-b border-zinc-200 pb-2 mb-4">03. Financial Trajectory</h3>
              <div className="border border-zinc-200 rounded p-4 bg-zinc-50/30">
                <svg viewBox="0 0 500 120" className="w-full h-28">
                   {/* Grid Lines */}
                   <line x1="30" y1="10" x2="480" y2="10" stroke="#f4f4f5" strokeWidth="1" />
                   <line x1="30" y1="50" x2="480" y2="50" stroke="#f4f4f5" strokeWidth="1" />
                   <line x1="30" y1="90" x2="480" y2="90" stroke="#d4d4d8" strokeWidth="1.5" />
                   
                   {/* Draw bars based on active date filter */}
                   {finalChartData.map((day, idx) => {
                     const usableWidth = 435; // 480 - 45
                     const barSpacing = usableWidth / Math.max(finalChartData.length, 1);
                     const barWidth = Math.min(36, barSpacing * 0.7); // scale width based on spacing
                     const x = idx * barSpacing + 45 + (barSpacing - barWidth)/2;
                     const currentMax = Math.max(...finalChartData.map(d => d.revenue), 1000);
                     const height = Math.max(5, (day.revenue / currentMax) * 75);
                     const y = 90 - height;
                     
                     // If too many items (e.g. Month view), only show some labels
                     const showLabel = finalChartData.length <= 7 || idx % 4 === 0;

                     return (
                       <g key={idx}>
                         <rect x={x} y={y} width={barWidth} height={height} fill="#18181b" rx="2" ry="2" />
                         {showLabel && (
                           <text x={x + barWidth / 2} y={y - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#09090b">
                             {day.revenue > 0 ? `₹${day.revenue}` : "-"}
                           </text>
                         )}
                         {showLabel && (
                           <text x={x + barWidth / 2} y="105" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#52525b">
                             {day.name}
                           </text>
                         )}
                       </g>
                     );
                   })}
                </svg>
              </div>
           </div>

           {/* Two Column Layout for the rest */}
           <div className="grid grid-cols-2 gap-8 mb-8 flex-1">
              {/* Left Column: Top Sellers & Financial Breakdown */}
              <div>
                 <h3 className="text-[11px] font-extrabold tracking-widest text-zinc-900 uppercase border-b border-zinc-200 pb-2 mb-4">04. Product Performance</h3>
                 <table className="w-full text-left text-xs mb-6">
                    <thead>
                       <tr className="border-b-2 border-zinc-900 text-[10px] uppercase tracking-wider text-zinc-600">
                          <th className="py-2">Item Name</th>
                          <th className="py-2 text-right">Qty</th>
                          <th className="py-2 text-right">Revenue</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                       {finalBestSellers.length > 0 ? finalBestSellers.slice(0,5).map((item, idx) => (
                          <tr key={idx}>
                             <td className="py-2.5 font-semibold text-zinc-900">{item.name}</td>
                             <td className="py-2.5 text-right font-medium text-zinc-600">{item.qty}</td>
                             <td className="py-2.5 text-right font-bold text-zinc-900">₹{item.total.toLocaleString()}</td>
                          </tr>
                       )) : (
                          <tr><td colSpan={3} className="py-4 text-center text-zinc-400 italic font-medium">No sales data recorded.</td></tr>
                       )}
                    </tbody>
                 </table>

                 <h3 className="text-[11px] font-extrabold tracking-widest text-zinc-900 uppercase border-b border-zinc-200 pb-2 mb-4">05. Financial Breakdown</h3>
                 <div className="bg-zinc-50 p-4 border border-zinc-200 rounded text-[11px] font-bold text-zinc-600 space-y-2">
                    <div className="flex justify-between"><span>Subtotal:</span><span className="text-zinc-900">₹{subtotal.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>GST (18%):</span><span className="text-zinc-900">₹{mockGst.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Service Charge (5%):</span><span className="text-zinc-900">₹{mockServiceCharge.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm font-black text-zinc-950 border-t border-zinc-300 pt-2 mt-2">
                       <span>Total Net Value:</span><span>₹{netValue.toLocaleString()}</span>
                    </div>
                 </div>
              </div>

              {/* Right Column: Security/Inventory & Staff */}
              <div>
                 <h3 className="text-[11px] font-extrabold tracking-widest text-zinc-900 uppercase border-b border-zinc-200 pb-2 mb-4">
                    {role === 'owner' ? "06. Security Audit Trail" : "06. Inventory Alerts"}
                 </h3>
                 <div className="space-y-3 text-[11px] font-medium mb-8">
                    {role === 'owner' ? (
                       finalSecurityLogs.length > 0 ? finalSecurityLogs.slice(0,5).map((log, idx) => (
                          <div key={idx} className="flex gap-2">
                             <span className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${log.type?.includes("fail") ? "bg-rose-600" : "bg-zinc-900"}`} />
                             <div>
                                <p className="text-zinc-900 font-bold">{log.message}</p>
                                <p className="text-zinc-500 text-[9px] uppercase mt-0.5">{formatDistanceToNow(log.createdAt, { addSuffix: true })}</p>
                             </div>
                          </div>
                       )) : (<p className="text-zinc-500 italic">System secure. No alerts.</p>)
                    ) : (
                       lowStockItems.length > 0 ? lowStockItems.slice(0, 5).map((item, idx) => (
                          <div key={idx} className="flex gap-2 text-[10px]">
                             <span className="h-1.5 w-1.5 rounded-full bg-rose-600 mt-1.5 shrink-0" />
                             <div>
                                <p className="font-bold text-zinc-950">{item.name}</p>
                                <p className="text-zinc-500">Stock: {item.quantity} {item.unit} (Threshold: {item.threshold})</p>
                             </div>
                          </div>
                       )) : (<p className="text-zinc-500 italic">Inventory optimal.</p>)
                    )}
                 </div>

                 <h3 className="text-[11px] font-extrabold tracking-widest text-zinc-900 uppercase border-b border-zinc-200 pb-2 mb-4">07. Workforce Snapshot</h3>
                 <div className="bg-zinc-50 p-4 border border-zinc-200 rounded">
                    <div className="flex justify-between items-center mb-3">
                       <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Active Staff on Duty</span>
                       <span className="text-sm font-black text-zinc-900">{activeStaff.length} Members</span>
                    </div>
                    <div className="space-y-2">
                       {activeStaff.length > 0 ? activeStaff.slice(0,4).map(staff => (
                          <div key={staff.id} className="flex justify-between text-[11px]">
                             <span className="font-bold text-zinc-800">{staff.name} <span className="text-zinc-400 font-normal capitalize">({staff.role})</span></span>
                             <span className="text-zinc-500">{new Date(staff.clockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                       )) : (
                          <p className="text-[10px] text-zinc-500 italic">No active shifts.</p>
                       )}
                    </div>
                 </div>
              </div>
           </div>

           {/* Document Footer */}
           <div className="border-t-2 border-zinc-950 pt-4 mt-auto flex justify-between items-center text-[9px] text-zinc-500 font-bold tracking-widest uppercase">
              <div><span>VERIFICATION TOKEN: </span><span className="text-zinc-950">{reportToken}</span></div>
              <span>ISSUED BY: {user?.email || "SYSTEM"} / PG 1/1</span>
           </div>
          </div>
       </div>
      )}

      {/* Bill Reprint Modal */}
      {billReprintOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 font-sans print:relative print:block print:bg-white print:p-0">
          <div className="bg-white rounded-xl max-w-sm w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:rounded-none print:w-full print:max-w-none print:block print:relative">
            {/* Modal Header */}
            <div className="bg-zinc-900 px-4 py-3 flex justify-between items-center print:hidden">
               <h3 className="text-white font-bold text-sm flex items-center gap-2"><Printer className="w-4 h-4" /> Bill Reprint</h3>
               <button onClick={() => setBillReprintOrder(null)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer"><XCircle className="w-5 h-5" /></button>
            </div>
            
            {/* Scrollable Receipt Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white text-black" id="thermal-receipt">
               {(() => {
                 const order = billReprintOrder;
                 const items = order.items || [];
                 
                 const mergedItems: any[] = [];
                 items.forEach((newItem: any) => {
                    if (newItem.menuItemId === "starter-occupy") return;
                    const idx = mergedItems.findIndex(existing => existing.menuItemId === newItem.menuItemId);
                    if (idx > -1) {
                       mergedItems[idx].quantity += newItem.quantity;
                    } else {
                       mergedItems.push({...newItem});
                    }
                 });

                 const subtotal = mergedItems.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
                 const cgst = subtotal * 0.025; 
                 const sgst = subtotal * 0.025;
                 const total = subtotal + cgst + sgst;
                 const assignedWaiter = order.waiterName || "Unassigned";
                 const guests = order.guests || 2;
                 
                 const orderTimestamp = order.createdAt || Date.now();
                 const orderDateObj = new Date(orderTimestamp);
                 const formattedDate = orderDateObj.toLocaleDateString('en-IN');
                 const formattedTime = orderDateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                 const billNo = String(orderTimestamp).slice(-6);

                 return (
                   <div className="text-[12px] leading-tight font-mono">
                      <div className="text-center mb-4">
                         <h2 className="text-xl font-black uppercase mb-1">Restflow</h2>
                         <p className="text-[10px] text-gray-500 mb-1">123 Culinary Avenue, Food District</p>
                         <p className="text-[10px] text-gray-500">Ph: +91 9876543210</p>
                         <div className="text-[10px] font-bold border border-zinc-900 inline-block px-2 py-0.5 mt-2 uppercase tracking-widest rounded-full">Reprint</div>
                      </div>
                      <div className="border-t border-dashed border-gray-400 my-3"></div>
                      <div className="flex justify-between mb-1">
                         <span>Date: {formattedDate}</span>
                         <span>Time: {formattedTime}</span>
                      </div>
                      <div className="flex justify-between mb-1">
                         <span>Table: {order.tableId}</span>
                         <span>Guests: {guests}</span>
                      </div>
                      <div className="flex justify-between mb-3">
                         <span>Waiter: {assignedWaiter}</span>
                         <span>Bill No: #{billNo}</span>
                      </div>
                      
                      <div className="border-t border-dashed border-gray-400 my-3"></div>
                      
                      <table className="w-full mb-3 text-left">
                         <thead>
                            <tr className="border-b border-gray-300">
                               <th className="pb-1 font-bold">Item</th>
                               <th className="pb-1 text-center font-bold">Qty</th>
                               <th className="pb-1 text-right font-bold">Amount</th>
                            </tr>
                         </thead>
                         <tbody>
                            {mergedItems.map((item, idx) => (
                               <tr key={idx} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1.5 pr-2 truncate max-w-[120px]">{item.name}</td>
                                  <td className="py-1.5 text-center">{item.quantity}</td>
                                  <td className="py-1.5 text-right font-medium">{(item.price * item.quantity).toFixed(2)}</td>
                               </tr>
                            ))}
                         </tbody>
                      </table>

                      <div className="border-t border-dashed border-gray-400 my-3"></div>

                      <div className="flex justify-between mb-1">
                         <span>Subtotal</span>
                         <span>{subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between mb-1 text-[10px] text-gray-600">
                         <span>CGST (2.5%)</span>
                         <span>{cgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between mb-3 text-[10px] text-gray-600">
                         <span>SGST (2.5%)</span>
                         <span>{sgst.toFixed(2)}</span>
                      </div>
                      
                      <div className="border-t border-dashed border-gray-400 my-2"></div>
                      
                      <div className="flex justify-between text-sm font-black mt-2">
                         <span>Grand Total</span>
                         <span>₹{total.toFixed(2)}</span>
                      </div>
                   </div>
                 );
               })()}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-100 bg-zinc-50 print:hidden flex gap-3">
               <button onClick={() => setBillReprintOrder(null)} className="flex-1 py-2.5 border border-zinc-200 bg-white text-zinc-700 font-bold rounded-lg cursor-pointer">Close</button>
               <button onClick={() => { setTimeout(() => window.print(), 100); }} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-md shadow-orange-600/20 cursor-pointer">Print Again</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
