import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Order } from "../../types";
import { Utensils, IndianRupee, CheckCircle2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";

export function WaiterDashboard() {
  const { selectedOutletId, user, role } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [waiterName, setWaiterName] = useState("");
  const [notification, setNotification] = useState<{ show: boolean; tableId: string } | null>(null);
  const [readyNotification, setReadyNotification] = useState<{ show: boolean; tableId: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioAlertsUnlocked, setAudioAlertsUnlocked] = useState(false);

  useEffect(() => {
    try {
      const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (tempCtx.state === 'running') {
        setAudioAlertsUnlocked(true);
      }
      tempCtx.close();
    } catch (e) {
      console.warn("Initial AudioContext check failed:", e);
    }

    const unlock = () => {
      try {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (context.state === 'suspended') {
          context.resume().then(() => {
            setAudioAlertsUnlocked(true);
            window.removeEventListener('click', unlock);
          });
        } else {
          setAudioAlertsUnlocked(true);
          window.removeEventListener('click', unlock);
        }
      } catch (err) {
        console.warn("Audio Context unlock error:", err);
      }
    };
    window.addEventListener('click', unlock);
    return () => window.removeEventListener('click', unlock);
  }, []);

  const isInitializedRef = useRef(false);
  const prevAssignedOrderIds = useRef<Set<string>>(new Set());
  const prevReadyOrderIds = useRef<Set<string>>(new Set());
  const isReadyInitializedRef = useRef(false);

  // Reset tracking state on outlet or waiter name changes to prevent false notification chime spams
  useEffect(() => {
    isInitializedRef.current = false;
    isReadyInitializedRef.current = false;
    prevAssignedOrderIds.current = new Set();
    prevReadyOrderIds.current = new Set();
  }, [selectedOutletId, waiterName]);

  // Web Audio API synthesizer for premium double chime sound
  const playTingSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Chime note 1: A5 (880Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.5);

      // Chime note 2: E6 (1320Hz), slightly delayed for a pleasant ding-dong chime
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1320, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.7);
      }, 70);
    } catch (err) {
      console.warn("AudioContext not supported or allowed by browser autoplay restrictions:", err);
    }
  };

  // Listen for new table assignments to this waiter
  useEffect(() => {
    if (!waiterName) return;

    // Filter active orders assigned to the logged-in waiter
    const assigned = orders.filter(o => {
      if (o.status === "paid") return false;
      const assignedName = o.waiterName || "Unassigned";
      return assignedName.toLowerCase().trim() === waiterName.toLowerCase().trim();
    });

    const currentIds = new Set(assigned.map(o => o.id).filter(Boolean) as string[]);

    if (!isInitializedRef.current) {
      // First load: initialize the tracked IDs without triggering sound
      prevAssignedOrderIds.current = currentIds;
      isInitializedRef.current = true;
      return;
    }

    // Subsequent updates: check for newly added order IDs
    const newAssignments: string[] = [];
    currentIds.forEach(id => {
      if (!prevAssignedOrderIds.current.has(id)) {
        newAssignments.push(id);
      }
    });

    if (newAssignments.length > 0) {
      const newOrder = assigned.find(o => o.id === newAssignments[0]);
      if (newOrder) {
        setNotification({ show: true, tableId: newOrder.tableId });
        playTingSound();
      }
    }

    // Keep tracked IDs updated
    prevAssignedOrderIds.current = currentIds;
  }, [orders, waiterName]);

  // Detect when assigned order goes 'ready'
  useEffect(() => {
    if (!waiterName) return;
    const myReady = orders.filter(o =>
      o.status === 'ready' &&
      ((o.waiterName || 'Unassigned').toLowerCase().trim() === waiterName.toLowerCase().trim() ||
       (o.waiterName || 'Unassigned') === 'Unassigned')
    );
    const readyIds = new Set(myReady.map(o => o.id).filter(Boolean) as string[]);

    if (!isReadyInitializedRef.current) {
      prevReadyOrderIds.current = readyIds;
      isReadyInitializedRef.current = true;
      return;
    }

    readyIds.forEach(id => {
      if (!prevReadyOrderIds.current.has(id)) {
        const order = myReady.find(o => o.id === id);
        if (order) {
          setReadyNotification({ show: true, tableId: order.tableId });
          playTingSound();
        }
      }
    });
    prevReadyOrderIds.current = readyIds;
  }, [orders, waiterName]);

  // Auto-dismiss notification toast after 5 seconds
  useEffect(() => {
    if (notification?.show) {
      const timer = setTimeout(() => { setNotification(null); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (readyNotification?.show) {
      const timer = setTimeout(() => { setReadyNotification(null); }, 6000);
      return () => clearTimeout(timer);
    }
  }, [readyNotification]);

  useEffect(() => {
    if (!selectedOutletId || !user?.email) return;

    const fetchWaiterName = async () => {
      try {
        const { getDocs, query, collection, where } = await import("firebase/firestore");
        const q = query(
          collection(db, "employees"),
          where("outletId", "==", selectedOutletId),
          where("email", "==", user.email.toLowerCase().trim())
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setWaiterName(snap.docs[0].data().name);
        } else {
          setWaiterName(user.displayName || user.email.split('@')[0]);
        }
      } catch (err) {
        console.error("Error fetching waiter name:", err);
      }
    };
    fetchWaiterName();
  }, [selectedOutletId, user]);

  useEffect(() => {
    if (!selectedOutletId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const q = query(
       collection(db, "orders"), 
       where("outletId", "==", selectedOutletId),
       where("status", "in", ["pending", "preparing", "ready", "out-for-delivery", "delivered"])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      // Sort by creation time (newest first)
      fetched.sort((a, b) => b.createdAt - a.createdAt);
      setOrders(fetched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedOutletId]);

  const markPaid = async (orderId: string, method: string) => {
    if (isProcessing) return;
    const order = orders.find(o => o.id === orderId);
    const updates: any = { status: 'paid', paymentMethod: method };
    if (order && (!order.waiterName || order.waiterName === 'Unassigned') && waiterName) {
      updates.waiterName = waiterName;
    }
    try {
      setIsProcessing(true);
      await updateDoc(doc(db, "orders", orderId), updates);
    } finally {
      setIsProcessing(false);
    }
  };

  const markDelivered = async (orderId: string) => {
    if (isProcessing) return;
    const order = orders.find(o => o.id === orderId);
    const updates: any = { status: 'delivered' };
    if (order && (!order.waiterName || order.waiterName === 'Unassigned') && waiterName) {
      updates.waiterName = waiterName;
    }
    try {
      setIsProcessing(true);
      await updateDoc(doc(db, "orders", orderId), updates);
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (isProcessing) return;
    if (confirm("Are you sure you want to cancel this order?")) {
      try {
        setIsProcessing(true);
        await updateDoc(doc(db, "orders", orderId), { status: 'cancelled' });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const claimTable = async (orderId: string) => {
    if (!waiterName || isProcessing) return;
    try {
      setIsProcessing(true);
      await updateDoc(doc(db, "orders", orderId), { waiterName });
    } finally {
      setIsProcessing(false);
    }
  };

  const claimDelivery = async (orderId: string) => {
    if (!waiterName || isProcessing) return;
    try {
      setIsProcessing(true);
      await updateDoc(doc(db, "orders", orderId), { deliveryRider: waiterName });
    } finally {
      setIsProcessing(false);
    }
  };

  const startDelivery = async (orderId: string) => {
    if (isProcessing) return;
    try {
      setIsProcessing(true);
      await updateDoc(doc(db, "orders", orderId), { status: 'out-for-delivery' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-400">Loading Dashboard...</div>;
  }

  // Filter active orders based on role, type, and staff assignment
  const activeOrders = orders.filter(o => {
    // Owners and managers can view all active orders
    if (role === 'owner' || role === 'manager') return true;

    // Dine-In orders
    if (!o.orderType || o.orderType === 'dine-in') {
      const assignedName = o.waiterName || "Unassigned";
      const matchesWaiter = assignedName.toLowerCase().trim() === waiterName.toLowerCase().trim();
      const isUnassigned = assignedName === "Unassigned";
      return matchesWaiter || isUnassigned;
    }

    // Delivery orders
    if (o.orderType === 'delivery') {
      const assignedRider = o.deliveryRider || "Unassigned";
      const matchesRider = assignedRider.toLowerCase().trim() === waiterName.toLowerCase().trim();
      const isUnassigned = assignedRider === "Unassigned";
      return matchesRider || isUnassigned;
    }

    // Takeaway orders (visible to all staff to handle checkout)
    if (o.orderType === 'takeaway') {
      return true;
    }

    return false;
  });

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {!audioAlertsUnlocked && (
        <div className="bg-orange-600/10 border border-orange-500/20 text-orange-600 px-4 py-2.5 rounded-lg mb-6 text-xs font-semibold flex items-center justify-between animate-pulse">
          <span>🔊 Sound alerts are blocked by your browser. Click anywhere on this page to activate table assignment notifications.</span>
          <button 
            onClick={() => {
              const context = new (window.AudioContext || (window as any).webkitAudioContext)();
              context.resume().then(() => setAudioAlertsUnlocked(true));
            }}
            className="bg-orange-600 hover:bg-orange-500 text-white px-2.5 py-1 rounded font-bold cursor-pointer transition-colors"
          >
            Enable Sounds
          </button>
        </div>
      )}
      {/* Table allotment toast alert */}
      {notification && notification.show && (
        <div className="fixed top-5 right-5 z-50 animate-in fade-in slide-in-from-top duration-300">
          <div className="bg-white/95 backdrop-blur border border-orange-500/20 shadow-xl rounded-xl p-4 flex items-center gap-3.5 max-w-sm">
            <div className="bg-orange-500 text-white p-2.5 rounded-lg flex-shrink-0 animate-bounce">
              <Utensils className="w-5 h-5" />
            </div>
            <div className="flex-grow">
              <h4 className="font-bold text-zinc-900 text-sm">Table Allotted!</h4>
              <p className="text-zinc-500 text-xs mt-0.5">Table {notification.tableId} has been assigned to you.</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors p-1 rounded-md hover:bg-zinc-100 cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Order Ready toast alert */}
      {readyNotification && readyNotification.show && (
        <div className="fixed top-24 right-5 z-50 animate-in fade-in slide-in-from-top duration-300">
          <div className="bg-white/95 backdrop-blur border border-emerald-500/30 shadow-xl rounded-xl p-4 flex items-center gap-3.5 max-w-sm">
            <div className="bg-emerald-500 text-white p-2.5 rounded-lg flex-shrink-0 animate-bounce">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-grow">
              <h4 className="font-bold text-zinc-900 text-sm">Order Ready! 🍽️</h4>
              <p className="text-zinc-500 text-xs mt-0.5">Table {readyNotification.tableId} order is ready to serve.</p>
            </div>
            <button onClick={() => setReadyNotification(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors p-1 rounded-md hover:bg-zinc-100 cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-zinc-200">
        <div>
           <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Active Workboard</h2>
           <p className="text-zinc-500 text-sm mt-1">Manage dine-in tables, takeaway collections, and deliveries</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeOrders.map((order) => (
           <div key={order.id} className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                 <div className="flex justify-between items-start mb-4">
                    <div>
                       {order.orderType === 'takeaway' ? (
                          <h3 className="text-xl font-bold text-zinc-900">Takeaway 🛍️</h3>
                       ) : order.orderType === 'delivery' ? (
                          <h3 className="text-xl font-bold text-zinc-900">Delivery 🛵</h3>
                       ) : (
                          <h3 className="text-xl font-bold text-zinc-900">Table {order.tableId}</h3>
                       )}
                       <p className="text-xs text-zinc-500 mt-1">{formatDistanceToNow(order.createdAt, { addSuffix: true })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                          order.status === 'pending' ? 'bg-orange-100 text-orange-800' : 
                          order.status === 'preparing' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'ready' ? 'bg-emerald-100 text-emerald-800' :
                          order.status === 'out-for-delivery' ? 'bg-purple-100 text-purple-800' :
                          'bg-zinc-100 text-zinc-800'
                       }`}>
                          {order.status}
                       </span>
                       <button onClick={() => cancelOrder(order.id)} className="p-1 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer rounded bg-zinc-50 border border-transparent hover:border-red-100" title="Cancel Order">
                          <X className="w-4 h-4" />
                       </button>
                    </div>
                 </div>

                 {/* Customer Delivery info */}
                 {order.orderType === 'delivery' && (
                    <div className="text-xs text-zinc-650 bg-zinc-50 border border-zinc-100 p-3 rounded-xl mb-4 space-y-1">
                       <p className="font-bold text-zinc-400 uppercase tracking-wide text-[9px]">Deliver To:</p>
                       <p className="font-bold text-zinc-800">{order.customerName}</p>
                       <p className="font-medium">{order.customerPhone}</p>
                       <p className="text-zinc-600 italic font-medium">{order.deliveryAddress}</p>
                    </div>
                 )}

                 {order.orderType === 'takeaway' && (
                    <div className="text-xs text-zinc-650 bg-zinc-50 border border-zinc-100 p-3 rounded-xl mb-4 space-y-0.5">
                       <p className="font-bold text-zinc-400 uppercase tracking-wide text-[9px]">Guest:</p>
                       <p className="font-bold text-zinc-800">{order.customerName || "Walk-in"}</p>
                       <p className="font-medium">{order.customerPhone || "No Phone"}</p>
                    </div>
                 )}
                 
                 <ul className="space-y-2 mb-4">
                    {order.items
                       .filter((item: any) => item.menuItemId !== "starter-occupy")
                       .map((item, idx) => (
                       <li key={idx} className="flex justify-between text-sm">
                          <span className="text-zinc-700">{item.quantity}x {item.name}</span>
                          <span className="text-zinc-900 font-medium">₹{item.price * item.quantity}</span>
                       </li>
                    ))}
                 </ul>
                 <div className="border-t border-zinc-100 pt-4 flex justify-between items-center font-bold">
                    <span>Total</span>
                    <span className="text-lg">₹{order.total}</span>
                 </div>
              </div>

              <div className="mt-6 space-y-3 border-t border-zinc-100 pt-4">
                 {/* Dine-In Buttons */}
                 {(!order.orderType || order.orderType === 'dine-in') && (
                    <>
                       {(order.waiterName === "Unassigned" || !order.waiterName) && (
                          <button 
                            onClick={() => claimTable(order.id)} 
                            className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Utensils className="w-4 h-4" /> Claim Table & Assist
                          </button>
                       )}
                       {order.status === 'ready' && (
                         <button onClick={() => markDelivered(order.id)} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                            <CheckCircle2 className="w-4 h-4" /> Mark Served
                         </button>
                      )}
                      {order.status === 'delivered' && (
                         <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => markPaid(order.id, 'cash')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">Cash</button>
                            <button onClick={() => markPaid(order.id, 'card')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">Card</button>
                            <button onClick={() => markPaid(order.id, 'upi')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">UPI</button>
                         </div>
                      )}
                    </>
                 )}

                 {/* Takeaway Buttons */}
                 {order.orderType === 'takeaway' && order.status === 'ready' && (
                    <div className="grid grid-cols-3 gap-2">
                       <button onClick={() => markPaid(order.id, 'cash')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">Cash</button>
                       <button onClick={() => markPaid(order.id, 'card')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">Card</button>
                       <button onClick={() => markPaid(order.id, 'upi')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">UPI</button>
                    </div>
                 )}

                 {/* Delivery Buttons */}
                 {order.orderType === 'delivery' && (
                    <>
                       {(!order.deliveryRider || order.deliveryRider === 'Unassigned') && (
                          <button
                            onClick={() => claimDelivery(order.id)}
                            className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                             Claim Delivery 🛵
                          </button>
                       )}
                       {order.deliveryRider && order.deliveryRider !== 'Unassigned' && order.status === 'ready' && (
                          <button
                            onClick={() => startDelivery(order.id)}
                            className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                             Start Delivery Route
                          </button>
                       )}
                       {order.status === 'out-for-delivery' && (
                          <div className="grid grid-cols-3 gap-2">
                             <button onClick={() => markPaid(order.id, 'cash')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">Cash</button>
                             <button onClick={() => markPaid(order.id, 'card')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">Card</button>
                             <button onClick={() => markPaid(order.id, 'upi')} className="py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors">UPI</button>
                          </div>
                       )}
                    </>
                 )}
              </div>
           </div>
        ))}
        {activeOrders.length === 0 && (
           <div className="col-span-full py-12 text-center text-zinc-500">
              <Utensils className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p>No active orders currently.</p>
           </div>
        )}
      </div>
    </div>
  );
}
