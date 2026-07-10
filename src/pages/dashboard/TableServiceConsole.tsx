import { useEffect, useState, FormEvent } from "react";
import { collection, onSnapshot, query, where, updateDoc, doc, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Order } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { Utensils, CheckCircle2, User, HelpCircle, XCircle, Users, ChevronDown, Printer } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  role: string;
}

export function TableServiceConsole() {
  const { selectedOutletId, role } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableCount, setTableCount] = useState(12);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [selectedWaiter, setSelectedWaiter] = useState("");
  const [guestsCount, setGuestsCount] = useState("2");
  
  // Confirmation Modal State
  const [tableToClear, setTableToClear] = useState<string | null>(null);

  // Bill Print State
  const [billTableId, setBillTableId] = useState<string | null>(null);

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

  const adjustTableCount = async (change: number) => {
    if (!selectedOutletId) return;
    const nextCount = tableCount + change;
    if (nextCount < 1) return;

    // Safety check: if decreasing count, block if we are hiding active tables
    if (change < 0) {
      const activeTableNumbers = orders
        .map(o => parseInt(o.tableId))
        .filter(num => !isNaN(num));
      const highestActiveTable = activeTableNumbers.length > 0 ? Math.max(...activeTableNumbers) : 0;
      
      if (nextCount < highestActiveTable) {
        alert(`Cannot reduce table count to ${nextCount}. Table ${highestActiveTable} currently has active dining orders. Please checkout or clear that table first!`);
        return;
      }
    }

    try {
      await updateDoc(doc(db, "outlets", selectedOutletId), { tableCount: nextCount });
    } catch (err) {
      console.error("Failed to update table count in DB:", err);
      alert("Failed to update table count. Please try again.");
    }
  };

  useEffect(() => {
    if (!selectedOutletId) {
      setOrders([]);
      setStaff([]);
      setLoading(false);
      return;
    }

    // Subscribe to active orders (server-side filtered)
    const ordersQuery = query(
      collection(db, "orders"),
      where("outletId", "==", selectedOutletId),
      where("status", "in", ["pending", "preparing", "ready", "delivered"])
    );

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(fetched);
      setLoading(false);
    });

    // Subscribe to employees list
    const staffQuery = query(
      collection(db, "employees"),
      where("outletId", "==", selectedOutletId)
    );

    const unsubscribeStaff = onSnapshot(staffQuery, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        role: doc.data().role
      })) as Employee[];
      setStaff(fetched.filter(s => s.role === 'waiter'));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeStaff();
    };
  }, [selectedOutletId]);

  // Operations
  const handleAssign = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeTableId || !selectedOutletId) return;
    if (!selectedWaiter) {
      alert("Please select a Waiter before starting service.");
      return;
    }

    // Check if the table is already occupied
    const activeTableOrders = orders.filter(o => o.tableId === activeTableId);
    const isCurrentlyOccupied = activeTableOrders.length > 0;

    if (isCurrentlyOccupied) {
      // Reassign waiter and update guest count on all active orders of this table
      for (const order of activeTableOrders) {
        if (order.id) {
          await updateDoc(doc(db, "orders", order.id), {
            waiterName: selectedWaiter || "Unassigned",
            guests: parseInt(guestsCount) || 2
          });
        }
      }
    } else {
      // Start a Guest Table Service session by placing an empty/starter order
      await addDoc(collection(db, "orders"), {
        outletId: selectedOutletId,
        tableId: activeTableId,
        items: [
          {
            menuItemId: "starter-occupy",
            name: "Guest Table Service Started",
            price: 0,
            quantity: 1
          }
        ],
        total: 0,
        status: "pending",
        waiterName: selectedWaiter || "Unassigned",
        guests: parseInt(guestsCount) || 2,
        createdAt: Date.now()
      });
    }

    // Reset Modal
    setIsModalOpen(false);
    setActiveTableId(null);
    setSelectedWaiter("");
    setGuestsCount("2");
  };

  const handleCheckout = async (tableId: string, paymentMethod: string) => {
    // Find all active unpaid orders for this table
    const activeTableOrders = orders.filter(o => o.tableId === tableId);
    
    for (const order of activeTableOrders) {
      if (order.id) {
        await updateDoc(doc(db, "orders", order.id), {
          status: 'paid',
          paymentMethod
        });
      }
    }
  };

  const confirmClearTable = (tableId: string) => {
    setTableToClear(tableId);
  };

  const executeForceClear = async () => {
    if (!tableToClear) return;
    const activeTableOrders = orders.filter(o => o.tableId === tableToClear);
    for (const order of activeTableOrders) {
      if (order.id) {
        await updateDoc(doc(db, "orders", order.id), { status: 'cancelled' });
      }
    }
    setTableToClear(null);
  };

  const openAssignModal = (tableId: string) => {
    setActiveTableId(tableId);
    const tableOrders = orders.filter(o => o.tableId === tableId);
    if (tableOrders.length > 0) {
      setSelectedWaiter(tableOrders[0].waiterName || "");
      setGuestsCount(String(tableOrders[0].guests || 2));
    } else {
      setSelectedWaiter("");
      setGuestsCount("2");
    }
    setIsModalOpen(true);
  };

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-zinc-500">Loading Table Service Console...</div>;
  }

  // Define dynamic tables list based on active outlet configuration
  const totalTablesList = Array.from({ length: tableCount }).map((_, idx) => String(idx + 1));

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans pb-12">
      <div className="border-b border-zinc-200 pb-5 screen-only flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Table Service Console</h2>
          <p className="text-zinc-500 text-sm mt-1 font-medium">Directly manage customer occupancy, change waiters, accept cash/card payments, and free dining tables.</p>
        </div>
        {role === 'owner' && (
          <div className="flex items-center gap-3 bg-white border border-zinc-200 px-4 py-2 rounded-xl shadow-sm self-start md:self-auto">
             <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Tables</span>
             <div className="flex items-center gap-2">
                <button 
                  onClick={() => adjustTableCount(-1)} 
                  disabled={tableCount <= 1}
                  className="w-7 h-7 border border-zinc-200 rounded-lg hover:bg-zinc-100 flex items-center justify-center font-bold text-zinc-650 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                >-</button>
                <span className="font-mono font-bold text-zinc-900 text-sm w-6 text-center">{tableCount}</span>
                <button 
                  onClick={() => adjustTableCount(1)}
                  className="w-7 h-7 border border-zinc-200 rounded-lg hover:bg-zinc-100 flex items-center justify-center font-bold text-zinc-650 cursor-pointer"
                >+</button>
             </div>
          </div>
        )}
      </div>

      {/* Grid of Tables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 screen-only">
        {totalTablesList.map((tableId) => {
          const tableOrders = orders.filter(o => o.tableId === tableId);
          const isOccupied = tableOrders.length > 0;
          const items = tableOrders.flatMap(o => o.items || []);
          const totalAmount = tableOrders.reduce((sum, o) => sum + (o.total || 0), 0);
          
          // Get waiter and guests info from first active order
          const assignedWaiter = tableOrders[0]?.waiterName || "Unassigned";
          const guests = tableOrders[0]?.guests || 2;
          
          // Get overall status (prioritize pending > preparing > ready > delivered)
          let tableStatus = "Vacant";
          if (isOccupied) {
            const statuses = tableOrders.map(o => o.status);
            if (statuses.includes("pending")) tableStatus = "Pending Orders";
            else if (statuses.includes("preparing")) tableStatus = "Preparing Food";
            else if (statuses.includes("ready")) tableStatus = "Food Ready";
            else tableStatus = "Served / Dining";
          }

          return (
            <div
              key={tableId}
              className={`rounded-xl border p-5 flex flex-col justify-between shadow-sm transition-all duration-200 ${
                isOccupied
                  ? tableStatus === "Food Ready"
                    ? "border-emerald-500 bg-emerald-50/30"
                    : tableStatus === "Preparing Food"
                    ? "border-blue-500 bg-blue-50/20"
                    : "border-orange-500 bg-orange-50/20"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-950">Table {tableId}</h3>
                    <p className={`text-xs font-semibold uppercase mt-0.5 tracking-wider ${
                      isOccupied 
                        ? tableStatus === "Food Ready"
                          ? "text-emerald-700"
                          : tableStatus === "Preparing Food"
                          ? "text-blue-700"
                          : "text-orange-700"
                        : "text-zinc-400"
                    }`}>
                      {tableStatus}
                    </p>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${isOccupied ? "bg-orange-500" : "bg-emerald-500"}`} />
                </div>

                {isOccupied ? (
                  <div className="space-y-3 mt-4">
                    <div className="text-xs text-zinc-600 flex items-center justify-between font-medium">
                      <span 
                        onClick={() => openAssignModal(tableId)} 
                        className="flex items-center gap-1 text-orange-600 hover:text-orange-700 cursor-pointer font-bold hover:underline"
                        title="Change or assign waiter"
                      >
                        <User className="w-3.5 h-3.5 text-zinc-500" /> {assignedWaiter}
                      </span>
                      <span 
                        onClick={() => openAssignModal(tableId)} 
                        className="flex items-center gap-1 text-zinc-600 hover:text-orange-600 cursor-pointer font-semibold hover:underline"
                        title="Edit guest count"
                      >
                        <Users className="w-3.5 h-3.5" /> {guests} Guests
                      </span>
                    </div>

                    <div className="border-t border-zinc-200/60 pt-3">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Active Order Items</p>
                      <div className="max-h-24 overflow-y-auto space-y-1 pr-1 text-xs">
                        {items
                          .filter(item => item.menuItemId !== "starter-occupy")
                          .map((item, idx) => (
                            <div key={idx} className="flex justify-between font-medium text-zinc-800">
                              <span>{item.quantity}x {item.name}</span>
                              <span className="text-zinc-900">₹{item.price * item.quantity}</span>
                            </div>
                          ))}
                        {items.filter(item => item.menuItemId !== "starter-occupy").length === 0 && (
                          <p className="text-zinc-400 italic">No food items added yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-400 text-sm mt-4 italic">Ready to receive customers.</p>
                )}
              </div>

              <div className="mt-6 border-t border-zinc-200/60 pt-4 space-y-2">
                {isOccupied ? (
                  <>
                    <div className="flex justify-between items-center font-bold text-sm text-zinc-950 mb-3">
                      <span>Total Value:</span>
                      <span className="text-base text-orange-600">₹{totalAmount.toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => setBillTableId(tableId)}
                      className="w-full py-1.5 border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 mb-2 shadow-sm"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print Bill
                    </button>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => handleCheckout(tableId, "cash")}
                        className="py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center"
                      >
                        Cash
                      </button>
                      <button
                        onClick={() => handleCheckout(tableId, "upi")}
                        className="py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center"
                      >
                        UPI
                      </button>
                      <button
                        onClick={() => handleCheckout(tableId, "card")}
                        className="py-1.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center"
                      >
                        Card
                      </button>
                    </div>
                    <button
                      onClick={() => confirmClearTable(tableId)}
                      className="w-full mt-1 py-1.5 border border-dashed border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Force Free Table
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => openAssignModal(tableId)}
                    className="w-full py-2 border border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 text-orange-600 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Utensils className="w-4 h-4" /> Assign Table & Waiter
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Assign Waiter Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-zinc-200 animate-in fade-in zoom-in-95 duration-150">
            {(() => {
              const isOccupied = orders.some(o => o.tableId === activeTableId);
              return (
                <>
                  <h3 className="text-lg font-bold text-zinc-950">
                    {isOccupied ? `Reassign Table ${activeTableId}` : `Assign Table ${activeTableId}`}
                  </h3>
                  <p className="text-zinc-500 text-xs mt-1">
                    {isOccupied 
                      ? "Update the assigned waiter or guest count for this active session." 
                      : "Start dining service and assign an employee waiter."}
                  </p>
                </>
              );
            })()}

            <form onSubmit={handleAssign} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Assign Waiter</label>
                {staff.length === 0 ? (
                  <div className="text-sm text-zinc-500 italic p-3 bg-zinc-50 rounded-lg border border-zinc-100">No active waiter staff available.</div>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                    {staff.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setSelectedWaiter(emp.name)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 cursor-pointer ${
                          selectedWaiter === emp.name
                            ? 'bg-orange-600 border-orange-600 text-white shadow-md shadow-orange-600/20 scale-105'
                            : 'bg-white border-zinc-200 text-zinc-600 hover:border-orange-300 hover:bg-orange-50'
                        }`}
                      >
                        <User className={`w-4 h-4 ${selectedWaiter === emp.name ? 'text-orange-200' : 'text-zinc-400'}`} />
                        {emp.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Number of Guests</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  required
                  value={guestsCount}
                  onChange={(e) => setGuestsCount(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 text-zinc-700 rounded-lg text-sm font-semibold hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold cursor-pointer"
                >
                  Start Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Force Clear Confirmation Modal */}
      {tableToClear && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative scale-in-95">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 text-center mb-2">Clear Table {tableToClear}?</h3>
            <p className="text-sm text-zinc-500 text-center mb-6 leading-relaxed">
              This will forcefully delete all active orders for this table. <strong className="text-zinc-800">This action cannot be undone.</strong>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setTableToClear(null)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeForceClear}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-colors cursor-pointer"
              >
                Force Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Print Modal */}
      {billTableId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 font-sans print:relative print:block print:bg-white print:p-0">
          <div className="bg-white rounded-xl max-w-sm w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:rounded-none print:w-full print:max-w-none print:block print:relative">
            {/* Modal Header (Hidden in Print) */}
            <div className="bg-zinc-900 px-4 py-3 flex justify-between items-center print:hidden">
               <h3 className="text-white font-bold text-sm flex items-center gap-2"><Printer className="w-4 h-4" /> Print Preview</h3>
               <button onClick={() => setBillTableId(null)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer"><XCircle className="w-5 h-5" /></button>
            </div>
            
            {/* Scrollable Receipt Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white text-black" id="thermal-receipt">
               {(() => {
                 const tableOrders = orders.filter(o => o.tableId === billTableId);
                 const items = tableOrders.flatMap(o => o.items || []).filter(i => i.menuItemId !== "starter-occupy");
                 
                 // Deduplicate items
                 const mergedItems: any[] = [];
                 items.forEach(newItem => {
                    const idx = mergedItems.findIndex(existing => existing.menuItemId === newItem.menuItemId);
                    if (idx > -1) {
                       mergedItems[idx].quantity += newItem.quantity;
                    } else {
                       mergedItems.push({...newItem});
                    }
                 });

                 const subtotal = mergedItems.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
                 const cgst = subtotal * 0.025; // 2.5% CGST
                 const sgst = subtotal * 0.025; // 2.5% SGST
                 const total = subtotal + cgst + sgst;
                 const assignedWaiter = tableOrders[0]?.waiterName || "Unassigned";
                 const guests = tableOrders[0]?.guests || 2;
                 
                 const orderTimestamp = tableOrders.length > 0 && tableOrders[0].createdAt ? tableOrders[0].createdAt : Date.now();
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
                      </div>
                      <div className="border-t border-dashed border-gray-400 my-3"></div>
                      <div className="flex justify-between mb-1">
                         <span>Date: {formattedDate}</span>
                         <span>Time: {formattedTime}</span>
                      </div>
                      <div className="flex justify-between mb-1">
                         <span>Table: {billTableId}</span>
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

                      <div className="border-t border-dashed border-gray-400 my-3"></div>
                      <div className="text-center text-[10px] text-gray-500 mt-4 mb-2">
                         <p className="font-bold text-gray-800 mb-1">Thank you for dining with us!</p>
                         <p>Please visit again.</p>
                      </div>
                   </div>
                 );
               })()}
            </div>
            
            {/* Modal Footer (Hidden in Print) */}
            <div className="p-4 border-t border-zinc-100 bg-zinc-50 print:hidden flex gap-3">
               <button onClick={() => setBillTableId(null)} className="flex-1 py-2.5 border border-zinc-200 bg-white text-zinc-700 font-bold rounded-lg cursor-pointer">Cancel</button>
               <button onClick={() => { setTimeout(() => window.print(), 100); }} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-md shadow-orange-600/20 cursor-pointer">Print Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
