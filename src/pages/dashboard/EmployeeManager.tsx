import { useEffect, useState, FormEvent } from "react";
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Plus, UserCog, Trash2, Mail, ChevronDown, Trophy, TrendingUp } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

interface Employee {
  id: string;
  outletId: string;
  name: string;
  email: string;
  role: 'manager' | 'waiter' | 'cook';
  salary: number;
  pin?: string;
  activationCode?: string;
}

export function EmployeeManager() {
  const { selectedOutletId, outlets, user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const logAudit = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, "audit_logs"), {
        action,
        details,
        outletId: selectedOutletId,
        ownerId: user?.uid || "UnknownOwner",
        timestamp: Date.now(),
        performedBy: user?.email || "Unknown User"
      });
    } catch (err) {
      console.warn("Audit logging failed:", err);
    }
  };
  const [newEmp, setNewEmp] = useState({ name: "", email: "", role: "waiter", salary: "", outletId: "" });
  const [emailError, setEmailError] = useState<string | null>(null);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState<'staff' | 'performance'>('staff');
  const [onDutyNames, setOnDutyNames] = useState<Set<string>>(new Set());
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [isAddOutletOpen, setIsAddOutletOpen] = useState(false);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [isEditOutletOpen, setIsEditOutletOpen] = useState(false);

  // Performance data
  const [perfFilter, setPerfFilter] = useState<'today' | 'week' | 'month'>('week');
  const [perfData, setPerfData] = useState<{name: string; orders: number; revenue: number; avgOrder: number}[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'performance' || !selectedOutletId) return;
    const fetchPerf = async () => {
      setPerfLoading(true);
      const now = Date.now();
      const today = new Date();
      const cutoff = perfFilter === 'today'
        ? new Date().setHours(0,0,0,0)
        : perfFilter === 'week' ? now - 7 * 86400000
        : new Date(today.getFullYear(), today.getMonth(), 1).setHours(0,0,0,0);

      const q = query(collection(db, 'orders'), where('outletId', '==', selectedOutletId));
      const snap = await getDocs(q);
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const paid = orders.filter(o => o.status === 'paid' && o.createdAt >= cutoff);

      const map: Record<string, { orders: number; revenue: number }> = {};
      for (const o of paid) {
        // Skip orders that have no waiter assigned (Self-service/QR)
        if (!o.waiterName || o.waiterName === 'Unassigned') continue;
        
        const name = o.waiterName;
        if (!map[name]) map[name] = { orders: 0, revenue: 0 };
        map[name].orders++;
        map[name].revenue += o.total || 0;
      }

      const result = Object.entries(map).map(([name, d]) => ({
        name,
        orders: d.orders,
        revenue: d.revenue,
        avgOrder: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0
      })).sort((a, b) => b.orders - a.orders);

      setPerfData(result);
      setPerfLoading(false);
    };
    fetchPerf();
  }, [activeTab, perfFilter, selectedOutletId]);

  useEffect(() => {
    if (selectedOutletId) {
      setNewEmp(prev => ({ ...prev, outletId: selectedOutletId }));
    }
  }, [selectedOutletId]);

  useEffect(() => {
    if (!selectedOutletId) {
      setEmployees([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "employees"), where("outletId", "==", selectedOutletId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Employee[]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedOutletId]);

  useEffect(() => {
    if (!selectedOutletId) {
      setOnDutyNames(new Set());
      return;
    }
    const q = query(
      collection(db, "attendance"),
      where("outletId", "==", selectedOutletId),
      where("clockOut", "==", null)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeNames = new Set<string>();
      snapshot.docs.forEach(doc => {
        activeNames.add(doc.data().name);
      });
      setOnDutyNames(activeNames);
    });
    return () => unsubscribe();
  }, [selectedOutletId]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmp.name || !newEmp.email || !newEmp.salary || !newEmp.outletId) return;

    const salaryVal = parseFloat(newEmp.salary);
    if (isNaN(salaryVal) || salaryVal <= 0) {
      alert("Please enter a valid monthly salary greater than 0.");
      return;
    }

    const cleanEmail = newEmp.email.trim().toLowerCase();

    // Check if an employee with this email already exists across the system
    try {
      const qCheck = query(collection(db, "employees"), where("email", "==", cleanEmail));
      const querySnapshot = await getDocs(qCheck);
      if (!querySnapshot.empty) {
        setEmailError("This email address is already registered in the system.");
        return;
      }
    } catch (err) {
      console.error("Error checking employee email uniqueness:", err);
    }

    // Loop to ensure PIN is unique
    const existingPins = employees.map(emp => emp.pin);
    let pin = Math.floor(1000 + Math.random() * 9000).toString();
    let attempts = 0;
    while (existingPins.includes(pin) && attempts < 100) {
      pin = Math.floor(1000 + Math.random() * 9000).toString();
      attempts++;
    }

    const activationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    await addDoc(collection(db, "employees"), {
      outletId: newEmp.outletId,
      name: newEmp.name,
      email: newEmp.email.trim().toLowerCase(),
      role: newEmp.role,
      salary: salaryVal,
      pin,
      activationCode
    });
    await logAudit("Invite Employee", `Invited employee ${newEmp.name} (${newEmp.email}) as role ${newEmp.role}`);
    setIsAdding(false);
    setNewEmp({ name: "", email: "", role: "waiter", salary: "", outletId: selectedOutletId });
    setEmailError(null);
  };

  const handleDelete = async (id: string) => {
    let empName = "Unknown";
    try {
      const { getDoc } = await import("firebase/firestore");
      const empSnap = await getDoc(doc(db, "employees", id));
      if (empSnap.exists()) {
        const empData = empSnap.data();
        empName = empData.name || "Unknown";
        const cleanEmail = empData.email?.trim().toLowerCase();
        if (cleanEmail) {
          const uid = "user-" + cleanEmail.replace(/[^a-z0-9]/g, "-");
          await deleteDoc(doc(db, "users", uid));
        }
      }
    } catch (err) {
      console.error("Failed to clean up user record on employee delete:", err);
    }
    await deleteDoc(doc(db, "employees", id));
    await logAudit("Delete Employee", `Deleted employee ${empName} (ID: ${id})`);
  };

  const handleSaveEditEmp = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingEmp || !editingEmp.name || !editingEmp.salary) return;

    const salaryVal = parseFloat(editingEmp.salary as any);
    if (isNaN(salaryVal) || salaryVal < 0) {
      alert("Please enter a valid salary.");
      return;
    }

    const empRef = doc(db, "employees", editingEmp.id);
    await updateDoc(empRef, {
      name: editingEmp.name,
      role: editingEmp.role,
      salary: salaryVal,
      outletId: editingEmp.outletId
    });

    if (editingEmp.email) {
      try {
        const cleanEmail = editingEmp.email.trim().toLowerCase();
        const uid = "user-" + cleanEmail.replace(/[^a-z0-9]/g, "-");
        await updateDoc(doc(db, "users", uid), { role: editingEmp.role });
      } catch (err) {
        console.error("Could not update user record role, maybe it does not exist yet.", err);
      }
    }

    await logAudit("Edit Employee Details", `Updated details/role for employee ${editingEmp.name} (Role: ${editingEmp.role}, Salary: ₹${salaryVal})`);
    setEditingEmp(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-zinc-200">
        <div>
           <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Staff Management</h2>
           <p className="text-zinc-500 text-sm mt-1">Manage employees, roles, and payroll</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-zinc-200 bg-white overflow-hidden">
            <button onClick={() => setActiveTab('staff')} className={`px-4 py-2 text-xs font-bold transition-colors ${activeTab === 'staff' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>Staff</button>
            <button onClick={() => setActiveTab('performance')} className={`px-4 py-2 text-xs font-bold transition-colors flex items-center gap-1.5 ${activeTab === 'performance' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}><Trophy className="w-3 h-3" /> Performance</button>
          </div>
          {activeTab === 'staff' && (
            <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors">
              <Plus className="h-4 w-4" /> Invite Employee
            </button>
          )}
        </div>
      </div>

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            {(['today','week','month'] as const).map(f => (
              <button key={f} onClick={() => setPerfFilter(f)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                perfFilter === f ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}>{f === 'today' ? 'Today' : f === 'week' ? 'Last 7 Days' : 'This Month'}</button>
            ))}
          </div>
          {perfLoading ? (
            <div className="py-12 text-center text-zinc-400 text-sm">Loading performance data...</div>
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-zinc-100">
                <thead className="bg-zinc-50">
                  <tr>
                    {['Rank','Waiter','Orders Handled','Total Revenue Served','Avg Order Value'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {perfData.map((row, i) => (
                    <tr key={row.name} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`text-lg font-black ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-orange-400' : 'text-zinc-300'}`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-700 text-xs">{row.name[0]?.toUpperCase()}</div>
                          <span className="text-sm font-semibold text-zinc-900">{row.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-zinc-900">{row.orders}</td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-700">₹{row.revenue.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm font-medium text-zinc-600">₹{row.avgOrder.toLocaleString()}</td>
                    </tr>
                  ))}
                  {perfData.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-zinc-400">No completed orders found for this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'staff' && (<>

      {isAdding && (
        <form onSubmit={handleAdd} className="mb-8 p-6 bg-white border border-zinc-200 rounded-xl shadow-sm">
           <h3 className="text-lg font-semibold mb-4 text-zinc-900">Invite New Employee</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                <input required type="text" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                     <Mail className="h-4 w-4 text-zinc-400" />
                   </div>
                   <input 
                      required 
                      type="email" 
                      value={newEmp.email} 
                      onChange={e => {
                        setNewEmp({...newEmp, email: e.target.value});
                        if (emailError) setEmailError(null);
                      }} 
                      className={`w-full pl-9 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        emailError 
                          ? 'border-red-500 focus:ring-red-500 focus:ring-offset-0 focus:border-red-500' 
                          : 'border-zinc-300 focus:ring-orange-500'
                      }`} 
                    />
                </div>
                {emailError && (
                  <p className="text-red-500 text-xs mt-1.5 font-medium">{emailError}</p>
                )}
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Role</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAddRoleOpen(!isAddRoleOpen)}
                    className="flex w-full items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 bg-white shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-orange-500 capitalize"
                  >
                    {newEmp.role}
                    <ChevronDown className="w-4 h-4 text-zinc-400 pointer-events-none" />
                  </button>
                  {isAddRoleOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsAddRoleOpen(false)} />
                      <div className="absolute left-0 mt-1 top-full w-full bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-100">
                        {['manager', 'waiter', 'cook'].map(role => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => {
                              setNewEmp({...newEmp, role: role});
                              setIsAddRoleOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm font-medium capitalize transition-colors hover:bg-zinc-50 ${
                              newEmp.role === role ? "text-orange-600 bg-orange-50/50" : "text-zinc-700"
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Salary (Monthly ₹)</label>
                <input required type="number" value={newEmp.salary} onChange={e => setNewEmp({...newEmp, salary: e.target.value})} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Assign to Outlet</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAddOutletOpen(!isAddOutletOpen)}
                    className="flex w-full items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 bg-white shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {outlets.find(o => o.id === newEmp.outletId)?.name || "Select Outlet"}
                    <ChevronDown className="w-4 h-4 text-zinc-400 pointer-events-none" />
                  </button>
                  {isAddOutletOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsAddOutletOpen(false)} />
                      <div className="absolute left-0 mt-1 top-full w-full bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-100">
                        {outlets.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => {
                              setNewEmp({...newEmp, outletId: o.id});
                              setIsAddOutletOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 flex justify-between items-center ${
                              newEmp.outletId === o.id ? "text-orange-600 bg-orange-50/50" : "text-zinc-700"
                            }`}
                          >
                            <span>{o.name}</span>
                            <span className="text-xs text-zinc-400">{o.location}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
             </div>
           </div>
           <div className="flex justify-end gap-2">
             <button 
                type="button" 
                onClick={() => {
                  setIsAdding(false);
                  setEmailError(null);
                }} 
                className="px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
              >
                Cancel
              </button>
             <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md transition-colors">Send Invite</button>
           </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
         <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
               <tr>
                 <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Employee</th>
                 <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Role</th>
                 <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Salary</th>
                 <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Login PIN & Code</th>
                 <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Actions</th>
               </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
               {employees.map(emp => (
                 <tr key={emp.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                       <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 font-bold text-xs">
                             {emp.name.charAt(0)}
                          </div>
                          <div className="ml-3">
                             <div className="text-sm font-medium text-zinc-900 flex items-center gap-2">
                                {emp.name}
                                {onDutyNames.has(emp.name) && (
                                  <span className="flex h-2 w-2 relative" title="On Duty">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                  </span>
                                )}
                             </div>
                             <div className="text-sm text-zinc-500">{emp.email}</div>
                          </div>
                       </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                         emp.role === 'manager' ? 'bg-purple-100 text-purple-800' :
                         emp.role === 'waiter' ? 'bg-blue-100 text-blue-800' :
                         'bg-orange-100 text-orange-800'
                       }`}>
                          {emp.role}
                       </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900">
                       ₹{emp.salary.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600">
                       <div className="flex flex-col">
                          <span className="font-bold text-zinc-900">PIN: {emp.pin || "N/A"}</span>
                          <span className="text-zinc-500 text-xs mt-0.5">Code: {emp.activationCode || "N/A"}</span>
                       </div>
                    </td>
                     <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => setEditingEmp(emp)} className="text-zinc-400 hover:text-zinc-900 mx-2 transition-colors cursor-pointer"><UserCog className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(emp.id)} className="text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                     </td>
                 </tr>
               ))}
               {employees.length === 0 && !loading && (
                 <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-zinc-500">No employees found. Invite your staff to get started.</td></tr>
               )}
            </tbody>
           </table>
       </div>

      {/* Edit Employee Modal */}
      {editingEmp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-zinc-200 shadow-2xl relative">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Edit Staff Employee</h3>
            <form onSubmit={handleSaveEditEmp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Name</label>
                <input required type="text" value={editingEmp.name} onChange={e => setEditingEmp({...editingEmp, name: e.target.value})} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Role</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsEditRoleOpen(!isEditRoleOpen)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 bg-white shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-orange-500 capitalize"
                  >
                    {editingEmp.role}
                    <ChevronDown className="w-4 h-4 text-zinc-400 pointer-events-none" />
                  </button>
                  {isEditRoleOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsEditRoleOpen(false)} />
                      <div className="absolute left-0 mt-1 top-full w-full bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-100">
                        {['manager', 'waiter', 'cook'].map(role => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => {
                              setEditingEmp({...editingEmp, role: role as any});
                              setIsEditRoleOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm font-medium capitalize transition-colors hover:bg-zinc-50 ${
                              editingEmp.role === role ? "text-orange-600 bg-orange-50/50" : "text-zinc-700"
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Salary (Monthly ₹)</label>
                <input required type="number" value={editingEmp.salary} onChange={e => setEditingEmp({...editingEmp, salary: parseFloat(e.target.value) || 0})} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Assign to Outlet</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsEditOutletOpen(!isEditOutletOpen)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 bg-white shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {outlets.find(o => o.id === editingEmp.outletId)?.name || "Select Outlet"}
                    <ChevronDown className="w-4 h-4 text-zinc-400 pointer-events-none" />
                  </button>
                  {isEditOutletOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsEditOutletOpen(false)} />
                      <div className="absolute left-0 mt-1 top-full w-full bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-100">
                        {outlets.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => {
                              setEditingEmp({...editingEmp, outletId: o.id});
                              setIsEditOutletOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 flex justify-between items-center ${
                              editingEmp.outletId === o.id ? "text-orange-600 bg-orange-50/50" : "text-zinc-700"
                            }`}
                          >
                            <span>{o.name}</span>
                            <span className="text-xs text-zinc-400">{o.location}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button type="button" onClick={() => setEditingEmp(null)} className="px-4 py-2 text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-lg shadow-sm transition-colors cursor-pointer">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
