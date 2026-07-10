import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, onSnapshot, query, where, updateDoc, doc, getDoc, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Order } from "../types";
import { Clock, CheckCircle2, ChevronLeft, Utensils, Volume2, VolumeX, Bell, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "motion/react";

export function KitchenDisplay() {
  const { outletId } = useParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const checkAuth = () => {
    const raw = localStorage.getItem(`kds_auth_v2_${outletId}`);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return parsed.expiresAt > Date.now();
    } catch {
      return false;
    }
  };
  const [isAuthenticated, setIsAuthenticated] = useState(checkAuth);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem("kds_muted") === "true";
  });
  const [timeTick, setTimeTick] = useState(0);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const toggleItemCheck = (orderId: string, itemIdx: number) => {
    const key = `${orderId}-${itemIdx}`;
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);

  // Reset tracking and auth state on outlet ID changes to prevent false kitchen bell rings & security bypasses
  useEffect(() => {
    isInitializedRef.current = false;
    prevOrderIdsRef.current = new Set();
    setIsAuthenticated(checkAuth());
    setPinInput("");
    setPinError(false);
  }, [outletId]);

  // High pitch kitchen chime sound
  const playKitchenBell = () => {
    if (isMuted) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(987.77, audioCtx.currentTime); // B5 note
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (err) {
      console.warn("AudioContext blocked:", err);
    }
  };

  // Re-render elapsed time every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setTimeTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!outletId || !isAuthenticated) return;
    
    const q = query(
       collection(db, "orders"), 
       where("outletId", "==", outletId),
       where("status", "in", ["pending", "preparing", "ready"])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      fetched.sort((a, b) => a.createdAt - b.createdAt);
      
      const currentIds = new Set(fetched.map(o => o.id));
      if (!isInitializedRef.current) {
        prevOrderIdsRef.current = currentIds;
        isInitializedRef.current = true;
      } else {
        const hasNewPending = fetched.some(o => o.status === 'pending' && !prevOrderIdsRef.current.has(o.id));
        if (hasNewPending) {
          playKitchenBell();
        }
        prevOrderIdsRef.current = currentIds;
      }

      setOrders(fetched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [outletId, isMuted, isAuthenticated]);

  const updateStatus = async (orderId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'pending' ? 'preparing' : 'ready';
    await updateDoc(doc(db, "orders", orderId), { status: nextStatus });
  };

  const markDelivered = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), { status: 'delivered' });
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outletId) return;
    
    try {
      let realPin = "1234";
      try {
        // Fetch outlet doc to check real PIN
        const outletSnap = await getDoc(doc(db, "outlets", outletId));
        realPin = outletSnap.exists() ? (outletSnap.data().kitchenPin || "1234") : "1234";
      } catch (networkErr) {
        console.warn("Network error during getDoc, attempting offline PIN fallback");
        const cachedPin = localStorage.getItem(`kds_offline_pin_${outletId}`);
        if (cachedPin) {
          realPin = cachedPin;
        } else {
          throw new Error("Cannot verify PIN offline on first login.");
        }
      }

      if (pinInput === realPin) {
        setIsAuthenticated(true);
        // Valid for 12 hours (43200000 ms)
        localStorage.setItem(`kds_auth_v2_${outletId}`, JSON.stringify({
           expiresAt: Date.now() + 43200000,
           hash: "verified" 
        }));
        localStorage.setItem(`kds_offline_pin_${outletId}`, realPin);
        setPinError(false);
      } else {
        setPinError(true);
        setPinInput("");
      }
    } catch (err) {
      console.error("Error verifying PIN", err);
      setPinError(true);
    }
  };

  const getOrderColorClass = (order: Order) => {
    if (order.status === 'ready') return 'border-emerald-500/50 bg-emerald-500/20';
    
    const elapsedMinutes = (Date.now() - order.createdAt) / 60000;
    if (elapsedMinutes >= 15) {
      return 'border-red-500/70 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.3)]'; // Urgent Red
    } else if (elapsedMinutes >= 5) {
      return 'border-yellow-500/50 bg-yellow-500/10'; // Warning Yellow
    } else {
      return 'border-green-500/30 bg-green-500/10'; // Fresh Green
    }
  };

  const getBadgeColorClass = (order: Order) => {
    if (order.status === 'ready') return 'bg-emerald-500 text-emerald-950';
    
    const elapsedMinutes = (Date.now() - order.createdAt) / 60000;
    if (elapsedMinutes >= 15) {
      return 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/50';
    } else if (elapsedMinutes >= 5) {
      return 'bg-yellow-500 text-yellow-950';
    } else {
      return 'bg-green-500 text-green-950';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center font-sans text-white p-6">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl w-full max-w-sm text-center shadow-2xl animate-in zoom-in-95 duration-200">
          <Utensils className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-2xl font-bold tracking-tight mb-2">Kitchen Display</h2>
          <p className="text-zinc-500 text-sm mb-6">Enter the kitchen passcode to access operations.</p>
          
          <form onSubmit={handlePinSubmit}>
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              className={`w-full bg-zinc-950 border ${pinError ? 'border-red-500 focus:ring-red-500' : 'border-zinc-800 focus:ring-orange-500'} rounded-xl px-4 py-4 text-center text-2xl tracking-[1em] font-black focus:outline-none focus:ring-2 transition-colors mb-4`}
              placeholder="••••"
              autoFocus
            />
            {pinError && <p className="text-red-500 text-xs font-semibold mb-4">Incorrect passcode. Try again.</p>}
            <button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer"
            >
              Unlock KDS
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading KDS...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-white p-6">
      <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
        <div>
           <Link to="/dashboard" className="text-zinc-400 hover:text-white flex items-center gap-2 mb-2 text-sm transition-colors"><ChevronLeft className="w-4 h-4" /> Back to Dashboard</Link>
           <h1 className="text-3xl font-bold tracking-tight">Kitchen Display</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center">
            <button
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                localStorage.setItem("kds_muted", String(nextMuted));
              }}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer mr-2 shadow-sm"
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                  Muted
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-orange-500" />
                  Sound On
                </>
              )}
            </button>
            <button
              onClick={playKitchenBell}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer shadow-sm"
            >
              <Bell className="w-3.5 h-3.5 text-zinc-500" />
              Test
            </button>
            <button
              onClick={() => {
                localStorage.removeItem(`kds_auth_v2_${outletId}`);
                setIsAuthenticated(false);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer mr-2 shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock KDS
            </button>
          </div>
          <div className="flex gap-4 border-l border-zinc-850 pl-6">
             <div className="text-center">
                <div className="text-3xl font-bold text-orange-500">{orders.filter(o => o.status === 'pending').length}</div>
                <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium">Pending</div>
             </div>
             <div className="text-center">
                <div className="text-3xl font-bold text-blue-500">{orders.filter(o => o.status === 'preparing').length}</div>
                <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium">Preparing</div>
             </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
        <AnimatePresence>
          {orders
            .filter(order => {
              if (order.orderType === 'takeaway' || order.orderType === 'delivery') {
                return order.status !== 'ready' && order.status !== 'out-for-delivery' && order.status !== 'delivered' && order.status !== 'paid';
              }
              return true;
            })
            .map((order) => (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className={`rounded-xl border ${getOrderColorClass(order)} overflow-hidden flex flex-col justify-between transition-all duration-1000`}
              >
                <div className="p-5">
                   <div className="flex justify-between items-start mb-4">
                      <div>
                         {order.orderType === 'takeaway' ? (
                            <div className="text-xl font-black text-blue-400">Takeaway 🛍️</div>
                         ) : order.orderType === 'delivery' ? (
                            <div className="text-xl font-black text-purple-400">Delivery 🛵</div>
                         ) : (
                            <div className="text-3xl font-black tabular-nums tracking-tight">T-{order.tableId}</div>
                         )}
                         <div className="flex items-center gap-1.5 text-zinc-400 text-sm mt-1">
                            <Clock className="w-4 h-4" />
                            {formatDistanceToNow(order.createdAt, { addSuffix: true })}
                         </div>
                         {order.customerName && (
                            <div className="text-xs font-semibold text-zinc-400 mt-2">
                               Customer: {order.customerName}
                            </div>
                         )}
                      </div>
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-colors duration-1000 ${getBadgeColorClass(order)}`}>
                         {order.status}
                      </span>
                   </div>
                   
                   <ul className="space-y-3 mt-6">
                      {order.items
                         .filter((item: any) => item.menuItemId !== "starter-occupy")
                         .map((item, idx) => {
                            const isChecked = !!checkedItems[`${order.id}-${idx}`];
                            return (
                              <li 
                                 key={idx} 
                                 onClick={() => toggleItemCheck(order.id, idx)}
                                 className={`flex items-start gap-3.5 text-lg font-semibold cursor-pointer select-none transition-all ${
                                    isChecked ? 'opacity-35 line-through text-zinc-500' : 'text-zinc-100 hover:text-orange-200'
                                 }`}
                              >
                                 <span className={`flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-[10px] font-bold mt-1 transition-all ${
                                    isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-700 bg-zinc-900 text-transparent hover:border-orange-500'
                                 }`}>
                                    ✓
                                 </span>
                                 <div>
                                    <span className="text-orange-500 font-extrabold mr-2">{item.quantity}x</span>
                                    <span>{item.name}</span>
                                 </div>
                              </li>
                            );
                      })}
                   </ul>
                </div>
                
                <div className="p-4 mt-4 border-t border-zinc-800/50">
                   {order.status !== 'ready' ? (
                      <button
                        onClick={() => updateStatus(order.id, order.status)}
                        className={`w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors ${order.status === 'pending' ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                      >
                         {order.status === 'pending' ? 'Start Preparing' : 'Mark Ready'}
                      </button>
                   ) : (
                      <button
                        onClick={() => markDelivered(order.id)}
                        className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white flex justify-center items-center gap-2"
                      >
                         <CheckCircle2 className="w-5 h-5" /> Delivered to Table
                      </button>
                   )}
                </div>
              </motion.div>
            ))}
        </AnimatePresence>
        
        {orders.filter(order => {
          if (order.orderType === 'takeaway' || order.orderType === 'delivery') {
            return order.status !== 'ready' && order.status !== 'out-for-delivery' && order.status !== 'delivered' && order.status !== 'paid';
          }
          return true;
        }).length === 0 && (
           <div className="col-span-full py-24 text-center text-zinc-500">
              <Utensils className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-xl font-medium tracking-tight">Kitchen is clear. Waiting for orders...</p>
           </div>
        )}
      </div>
    </div>
  );
}
