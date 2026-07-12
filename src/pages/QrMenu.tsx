import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { collection, onSnapshot, query, where, addDoc, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { MenuItem, Order } from "../types";
import { SearchTrie } from "../lib/trie";
import { globalRestaurantCache } from "../lib/lru";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Minus, ShoppingBag, Utensils, CheckCircle2, Search, Sparkles } from "lucide-react";

export function QrMenu() {
  const { outletId, tableId } = useParams();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<{item: MenuItem, qty: number}[]>(() => {
    try {
      const saved = localStorage.getItem(`qrmenu_cart_${outletId}_${tableId}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    if (outletId && tableId) {
      localStorage.setItem(`qrmenu_cart_${outletId}_${tableId}`, JSON.stringify(cart));
    }
  }, [cart, outletId, tableId]);
  const [isOrdering, setIsOrdering] = useState(false);
  const [showSessionBlockedModal, setShowSessionBlockedModal] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [restaurantName, setRestaurantName] = useState("The Spice Garden");
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // Initialize secure local QR session token
  const qrSessionToken = useMemo(() => {
    let token = localStorage.getItem("qr_session_token");
    if (!token) {
      token = "QS-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem("qr_session_token", token);
    }
    return token;
  }, []);

  // Subscribe to live order session status for this table
  useEffect(() => {
    if (!outletId || !tableId) return;
    const q = query(
      collection(db, "orders"),
      where("outletId", "==", outletId),
      where("tableId", "==", tableId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const active = snapshot.docs.find(d => {
        const s = d.data().status;
        return s !== 'paid' && s !== 'cancelled';
      });
      if (active) {
        setActiveOrder({ id: active.id, ...active.data() } as Order);
      } else {
        setActiveOrder(null);
      }
    });
    return () => unsubscribe();
  }, [outletId, tableId]);
  
  // Search & Category filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'non-veg'>('all');

  useEffect(() => {
    if (!outletId) return;
    
    const fetchRestaurantName = async () => {
      // 1. Check LRU Cache (Instant O(1) read)
      const cachedName = globalRestaurantCache.get(outletId);
      if (cachedName) {
        setRestaurantName(cachedName);
        return;
      }

      // 2. Fetch from Firebase if not in cache
      try {
        const outletRef = doc(db, "outlets", outletId);
        const outletSnap = await getDoc(outletRef);
        if (outletSnap.exists()) {
          const outletData = outletSnap.data();
          const restId = outletData.restaurantId;
          if (restId) {
            const restRef = doc(db, "restaurants", restId);
            const restSnap = await getDoc(restRef);
            if (restSnap.exists()) {
              const fetchedName = restSnap.data().name;
              setRestaurantName(fetchedName);
              // Save to LRU Cache
              globalRestaurantCache.put(outletId, fetchedName);
            }
          }
        }
      } catch (err) {
        console.error("Error loading restaurant info for QR menu:", err);
      }
    };
    
    fetchRestaurantName();
  }, [outletId]);

  useEffect(() => {
    if (!outletId) return;
    const q = query(collection(db, "menu_items"), where("outletId", "==", outletId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMenu(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MenuItem[]);
    });
    return () => unsubscribe();
  }, [outletId]);

  const addToCart = (item: MenuItem) => {
     const existing = cart.find(c => c.item.id === item.id);
     if (existing) {
        setCart(cart.map(c => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c));
     } else {
        setCart([...cart, { item, qty: 1 }]);
     }
  };

  const removeFromCart = (itemId: string) => {
     const existing = cart.find(c => c.item.id === itemId);
     if (existing && existing.qty > 1) {
        setCart(cart.map(c => c.item.id === itemId ? { ...c, qty: c.qty - 1 } : c));
     } else {
        setCart(cart.filter(c => c.item.id !== itemId));
     }
  };

  const cartTotal = cart.reduce((acc, curr) => acc + (curr.item.price * curr.qty), 0);

  const handlePlaceOrder = async () => {
      if (cart.length === 0 || !outletId || !tableId || isOrdering) return;
      setIsOrdering(true);
      
      try {
         // SECURITY CHECK: Fetch fresh menu items directly from DB to prevent fake price manipulation
         const menuRef = collection(db, "menu_items");
         const qMenu = query(menuRef, where("outletId", "==", outletId));
         const menuSnap = await getDocs(qMenu);
         const freshMenu = new Map();
         menuSnap.forEach(doc => {
           const data = doc.data();
           freshMenu.set(doc.id, { price: data.price, name: data.name, available: data.available !== false });
         });

         let secureTotal = 0;
         const orderItems: any[] = [];

         for (const c of cart) {
            const realItem = freshMenu.get(c.item.id);
            if (realItem && realItem.available) {
               secureTotal += (realItem.price * c.qty);
               orderItems.push({
                  menuItemId: c.item.id,
                  name: realItem.name,   // Always use server-verified name
                  price: realItem.price, // Always use server-verified price
                  quantity: c.qty
               });
            }
         }

         if (orderItems.length === 0) {
            alert("Your items are currently out of stock or unavailable. Please refresh the menu.");
            return;
         }

         // SECURITY CHECK: Validate that the tableId exists in this outlet's actual table configuration
         // Prevents fake/tampered URLs from placing orders on non-existent tables
         const outletSnap = await getDoc(doc(db, "outlets", outletId));
         if (!outletSnap.exists()) {
            alert("Invalid outlet. Please scan the QR code again.");
            return;
         }
         const configuredTableCount: number = outletSnap.data().tableCount || 12;
         const tableNumber = parseInt(tableId, 10);
         const isValidTable = !isNaN(tableNumber) && tableNumber >= 1 && tableNumber <= configuredTableCount;
         if (!isValidTable) {
            alert("Invalid table. Please scan the QR code at your table again.");
            return;
         }

         // Query active unpaid orders for this table
         const q = query(
            collection(db, "orders"),
            where("outletId", "==", outletId),
            where("tableId", "==", tableId)
         );

         const snapshot = await getDocs(q);
          const activeOrderDoc = snapshot.docs.find(d => {
             const s = d.data().status;
             return s !== 'paid' && s !== 'cancelled';
          });

          const secureSubtotal = secureTotal;
          const secureTax = secureSubtotal * 0.05;
          const secureGrandTotal = secureSubtotal + secureTax;

          if (activeOrderDoc) {
             const activeOrderData = activeOrderDoc.data();
             
             // Anti-Tamper: Verify that the device matches the active table session
             if (activeOrderData.qrSessionToken && activeOrderData.qrSessionToken !== qrSessionToken) {
                setShowSessionBlockedModal(true);
                setIsOrdering(false);
                return;
             }

             // Bind session token if started from POS (no token bound yet)
             const finalSessionToken = activeOrderData.qrSessionToken || qrSessionToken;

             const existingItems = activeOrderData.items || [];
             
             // Merge items: if item already exists, sum quantities, otherwise push
             const mergedItems = [...existingItems];
             orderItems.forEach(newItem => {
                const idx = mergedItems.findIndex(existing => existing.menuItemId === newItem.menuItemId);
                if (idx > -1) {
                   mergedItems[idx].quantity += newItem.quantity;
                } else {
                   mergedItems.push(newItem);
                }
             });

             const prevSubtotal = activeOrderData.subtotal || activeOrderData.total || 0;
             const cumulativeSubtotal = prevSubtotal + secureSubtotal;
             const cumulativeTax = cumulativeSubtotal * 0.05;
             const cumulativeGrandTotal = cumulativeSubtotal + cumulativeTax;

             await updateDoc(doc(db, "orders", activeOrderDoc.id), {
                items: mergedItems,
                subtotal: cumulativeSubtotal,
                tax: cumulativeTax,
                total: cumulativeGrandTotal,
                status: 'pending', // Reset status to pending so kitchen cook & waiters are notified
                qrSessionToken: finalSessionToken,
                updatedAt: Date.now()
             });
          } else {
             // Place brand-new order session
             await addDoc(collection(db, "orders"), {
                outletId,
                tableId,
                items: orderItems,
                subtotal: secureSubtotal,
                tax: secureTax,
                total: secureGrandTotal,
                status: 'pending',
                qrSessionToken,
                createdAt: Date.now(),
                waiterName: "Unassigned",
                guests: 2
             });
          }
      } catch (err) {
         console.error("Error placing order:", err);
         alert("Failed to place order. Please try again.");
      } finally {
         setIsOrdering(false);
      }

      setCart([]);
      if (outletId && tableId) {
         localStorage.removeItem(`qrmenu_cart_${outletId}_${tableId}`);
      }
      setOrderPlaced(true);
      
      // Reset after 5s
      setTimeout(() => setOrderPlaced(false), 5000);
  };

  const categories = Array.from(new Set(menu.map(m => m.category)));

  // Helper to detect veg/non-veg from name
  const isVegItem = (name: string) => {
    const lower = name.toLowerCase();
    const nonVegWords = [
      'chicken', 'mutton', 'fish', 'prawn', 'seafood', 'pepperoni', 'meat', 
      'pork', 'beef', 'bacon', 'ham', 'lamb', 'duck', 'turkey', 'crab', 
      'lobster', 'shrimp', 'squid', 'octopus', 'tuna', 'salmon', 'salami'
    ];
    
    // If it has non-veg words, it's definitely non-veg
    if (nonVegWords.some(word => lower.includes(word))) {
      return false;
    }
    
    // If it contains "egg" (but not "eggless"), it's non-veg
    if (lower.includes('egg') && !lower.includes('eggless')) {
      return false;
    }
    
    return true;
  };

  // Group by category
  const menuByCategory = categories.map(category => ({
      category,
      items: menu.filter(m => m.category === category)
  }));

  const searchTrie = useMemo(() => {
    const trie = new SearchTrie();
    menu.forEach(item => {
      trie.insert(item.name, item.id);
      if (item.description) trie.insert(item.description, item.id);
    });
    return trie;
  }, [menu]);

  const searchMatchIds = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return searchTrie.search(searchQuery);
    }
    return null;
  }, [searchQuery, searchTrie]);

  // Apply filters
  const displayedGroups = menuByCategory
    .map(group => ({
      category: group.category,
      items: group.items.filter(item => {
        if (item.available === false) return false;
        if (item.availableForDineIn === false) return false;
        
        const matchesCategory = activeCategory === "All" || item.category === activeCategory;
        const matchesSearch = searchMatchIds === null || (searchMatchIds.size > 0 && searchMatchIds.has(item.id));
        const isVeg = isVegItem(item.name);
        const matchesDiet = dietFilter === 'all' || 
                            (dietFilter === 'veg' && isVeg) || 
                            (dietFilter === 'non-veg' && !isVeg);
        return matchesCategory && matchesSearch && matchesDiet;
      })
    }))
    .filter(group => group.items.length > 0);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans pb-32">
      {/* Premium Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30 px-4 py-4 flex flex-col gap-3.5 border-b border-zinc-100">
         <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-3">
               <div className="bg-orange-600 p-2 rounded-xl shadow-md shadow-orange-600/10">
                  <Utensils className="h-5 w-5 text-white" />
               </div>
               <div>
                  <h1 className="font-black text-base tracking-tight text-zinc-950 uppercase leading-none">{restaurantName}</h1>
                  <p className="text-xs text-zinc-500 font-bold mt-1">Table Allotted: <span className="text-orange-600">{tableId}</span></p>
               </div>
            </div>
         </div>

         {/* Search Filter Bar & Diet Switcher */}
         <div className="space-y-2.5">
            <div className="relative">
               <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
               <input 
                 type="text" 
                 placeholder="Search dishes, drinks, starters..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full bg-zinc-100/80 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 border border-transparent focus:bg-white transition-all font-semibold text-zinc-800 placeholder-zinc-400"
               />
            </div>

            {/* Diet Segment Filter */}
            <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200/50">
               {[
                 { id: 'all', label: 'All Dishes' },
                 { id: 'veg', label: 'Veg 🌱' },
                 { id: 'non-veg', label: 'Non-Veg 🍗' }
               ].map((pref) => (
                  <button
                    key={pref.id}
                    onClick={() => setDietFilter(pref.id as any)}
                    className={`flex-1 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                      dietFilter === pref.id
                        ? "bg-white text-zinc-950 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-850"
                    }`}
                  >
                     {pref.label}
                  </button>
               ))}
            </div>
         </div>
      </header>

      {/* Sticky Horizontal Categories Selector */}
      <div className="flex gap-2.5 overflow-x-auto pb-3.5 pt-3 px-4 scrollbar-none sticky top-[148px] bg-zinc-50/95 backdrop-blur z-20 border-b border-zinc-200/50">
        <button
          onClick={() => setActiveCategory("All")}
          className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer shadow-sm ${
            activeCategory === "All"
              ? "bg-orange-600 text-white shadow-md shadow-orange-600/20 scale-105"
              : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200"
          }`}
        >
          All Categories
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer shadow-sm ${
              activeCategory === cat
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/20 scale-105"
                : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main Container */}
      <main className="px-4 py-6 max-w-lg mx-auto">
          {orderPlaced && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                     <h3 className="font-extrabold text-emerald-950 text-sm">Order Placed Successfully!</h3>
                     <p className="text-xs text-emerald-700 mt-1 leading-relaxed">The kitchen has received your order. We'll start preparing it right away.</p>
                  </div>
              </motion.div>
          )}

          {/* Live Order Status Panel */}
          {activeOrder && (
             <motion.div 
               initial={{ opacity: 0, y: 15 }}
               animate={{ opacity: 1, y: 0 }}
               className="mb-8 bg-zinc-950 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden border border-zinc-800"
             >
                {/* Visual Gradient Spot */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-orange-600/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex justify-between items-start border-b border-zinc-800 pb-3.5 mb-3.5">
                   <div>
                      <span className="text-[9px] uppercase tracking-[0.2em] font-black text-orange-500">Live Session Status</span>
                      <h4 className="font-extrabold text-sm text-zinc-100 mt-0.5">Active Table Bill</h4>
                   </div>
                   <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      activeOrder.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      activeOrder.status === 'preparing' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse' :
                      activeOrder.status === 'ready' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-bounce' :
                      'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                   }`}>
                      {activeOrder.status === 'pending' ? 'Pending Cook' :
                       activeOrder.status === 'preparing' ? 'Preparing Food' :
                       activeOrder.status === 'ready' ? 'Ready to Serve' :
                       'Served / Dining'}
                   </span>
                </div>
                
                {/* Items List */}
                <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                   {activeOrder.items?.filter((i: any) => i.menuItemId !== "starter-occupy").map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs text-zinc-300 font-semibold">
                         <span>{item.name} <span className="text-zinc-500 text-[10px] font-normal">x{item.quantity}</span></span>
                         <span className="text-zinc-100 font-bold">₹{item.price * item.quantity}</span>
                      </div>
                   ))}
                </div>
                
                {/* running total */}
                <div className="flex justify-between items-center border-t border-zinc-800 pt-3.5 mt-3.5">
                   <span className="text-xs font-bold text-zinc-400">Current Running Total</span>
                   <span className="text-base font-black text-orange-500">₹{activeOrder.total}</span>
                </div>
             </motion.div>
          )}

         {displayedGroups.length === 0 && (
             <div className="text-center py-20 text-zinc-400 text-sm font-semibold">
                 No items found matching your filters.
             </div>
         )}

         <div className="space-y-10">
            {displayedGroups.map(group => (
                <div key={group.category} className="space-y-4">
                   <h2 className="text-lg font-black tracking-tight text-zinc-900 border-l-4 border-orange-600 pl-2.5 uppercase">{group.category}</h2>
                   <div className="space-y-4">
                      {group.items.map(item => {
                         const isVeg = isVegItem(item.name);
                         const cartItem = cart.find(c => c.item.id === item.id);
                         const isSoldOut = item.available === false;
                         
                         return (
                           <div key={item.id} className={`bg-white border border-zinc-200/80 rounded-2xl p-4 flex justify-between items-center shadow-sm hover:shadow-md transition-all duration-200 gap-4 ${isSoldOut ? 'opacity-60 grayscale-[0.5] bg-zinc-50' : ''}`}>
                              <div className="flex-1 space-y-1">
                                 <div className="flex items-center gap-2">
                                    {/* Veg / Non-Veg Indicator */}
                                    <span className={`w-3.5 h-3.5 flex items-center justify-center border rounded flex-shrink-0 ${isVeg ? "border-green-600 bg-green-50/10" : "border-red-600 bg-red-50/10"}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`} />
                                    </span>
                                    {item.recommended && !isSoldOut && (
                                      <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse flex items-center gap-0.5">
                                        <Sparkles className="w-2.5 h-2.5" /> Bestseller
                                      </span>
                                    )}
                                    {isSoldOut && (
                                      <span className="bg-zinc-200 text-zinc-600 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                         Sold Out
                                      </span>
                                    )}
                                 </div>
                                 <h3 className="font-extrabold text-zinc-900 text-sm leading-snug">{item.name}</h3>
                                 <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{item.description}</p>
                                 <p className="font-black text-sm text-zinc-950 pt-1">₹{item.price}</p>
                              </div>
                              <div className="flex-shrink-0">
                                 {isSoldOut ? (
                                    <button disabled className="px-4 py-2 bg-zinc-200 text-zinc-500 font-extrabold text-xs rounded-xl shadow-none cursor-not-allowed">
                                       SOLD OUT
                                    </button>
                                 ) : cartItem ? (
                                     <div className="flex items-center gap-2 bg-zinc-950 text-white rounded-xl p-1 shadow-md">
                                        <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 transition-colors cursor-pointer"><Minus className="w-3.5 h-3.5" /></button>
                                        <span className="font-bold text-xs w-4 text-center">{cartItem.qty}</span>
                                        <button onClick={() => addToCart(item)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 transition-colors cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
                                     </div>
                                 ) : (
                                     <button 
                                        onClick={() => addToCart(item)}
                                        className="px-5 py-2.5 bg-orange-600 text-white font-extrabold text-xs rounded-xl hover:bg-orange-500 transition-all shadow-md shadow-orange-600/10 cursor-pointer active:scale-95"
                                     >
                                        ADD
                                     </button>
                                 )}
                              </div>
                           </div>
                         );
                      })}
                   </div>
                </div>
            ))}
         </div>
      </main>

      {/* Premium Sliding Cart Sheet */}
      <AnimatePresence>
         {cart.length > 0 && (
             <motion.div 
               initial={{ y: 100, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: 100, opacity: 0 }}
               className="fixed bottom-0 inset-x-0 bg-white border-t border-zinc-200/80 p-4 shadow-2xl z-40 rounded-t-3xl backdrop-blur-md"
             >
                <div className="max-w-md mx-auto space-y-4">
                   <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-sm uppercase tracking-wide">
                         <div className="bg-orange-100 p-1.5 rounded-lg">
                            <ShoppingBag className="w-4 h-4 text-orange-600" />
                         </div>
                         <span>{cart.reduce((acc, curr) => acc + curr.qty, 0)} items added</span>
                      </div>
                      <div className="font-black text-base text-zinc-950">Subtotal: ₹{cartTotal}</div>
                   </div>
                   <button 
                     disabled={isOrdering}
                     onClick={handlePlaceOrder}
                     className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 rounded-2xl text-white font-extrabold tracking-wide text-xs shadow-lg shadow-orange-600/15 disabled:opacity-50 transition-all cursor-pointer active:scale-98 text-center"
                   >
                     {isOrdering ? 'PLACING TICKET...' : 'PLACE ORDER (SEND TO KITCHEN)'}
                   </button>
                </div>
             </motion.div>
         )}
      </AnimatePresence>
      {/* Session Blocked / Anti-Tamper Warning Modal */}
      {showSessionBlockedModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 font-sans animate-in fade-in duration-200">
          <motion.div 
            initial={{ scale: 0.9, y: 15 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-zinc-200 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mb-4 text-red-500 shadow-sm shadow-red-100">
               <span className="text-2xl font-bold">⚠️</span>
            </div>
            <h3 className="text-zinc-900 font-extrabold text-lg tracking-tight mb-2">Table Session Locked</h3>
            <p className="text-zinc-500 text-xs leading-relaxed mb-6">
              This table's active bill is already locked to another device. If you are part of the same dining group, please request your waiter to update the bill or add items directly from the POS console.
            </p>
            <button 
              onClick={() => setShowSessionBlockedModal(false)}
              className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs tracking-wider transition-colors cursor-pointer"
            >
              UNDERSTOOD
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
