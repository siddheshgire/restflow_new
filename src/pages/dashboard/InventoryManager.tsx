import { useEffect, useState, FormEvent } from "react";
import { Utensils, AlertCircle, Plus, Minus, Trash2, ChevronDown } from "lucide-react";
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";

interface InventoryItem {
  id: string;
  outletId: string;
  name: string;
  quantity: number;
  unit: string;
  threshold: number;
}

export function InventoryManager() {
  const { selectedOutletId } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", quantity: "", unit: "kg", threshold: "" });
  const [errors, setErrors] = useState<{name?: string; quantity?: string; threshold?: string; general?: string}>({});
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const unitOptions = ["kg", "liters", "units", "gms"];

  useEffect(() => {
    if (!selectedOutletId) {
      setInventory([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "inventory_items"),
      where("outletId", "==", selectedOutletId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryItem[];
      setInventory(fetched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedOutletId]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    
    // Progressive validation (one field at a time)
    if (!newItem.name.trim()) {
      setErrors({ name: "Name is required" });
      return;
    }
    if (!newItem.quantity) {
      setErrors({ quantity: "Current stock is required" });
      return;
    }
    if (!newItem.threshold) {
      setErrors({ threshold: "Low stock threshold is required" });
      return;
    }
    
    // Clear previous errors if all valid
    setErrors({});

    if (!selectedOutletId) return;

    const qtyVal = parseFloat(newItem.quantity);
    const thresholdVal = parseFloat(newItem.threshold);

    if (isNaN(qtyVal) || qtyVal < 0 || isNaN(thresholdVal) || thresholdVal < 0) {
      setErrors({ general: "Please enter valid numbers greater than or equal to 0." });
      return;
    }

    await addDoc(collection(db, "inventory_items"), {
      outletId: selectedOutletId,
      name: newItem.name.trim(),
      quantity: qtyVal,
      unit: newItem.unit,
      threshold: thresholdVal
    });
    setIsAdding(false);
    setNewItem({ name: "", quantity: "", unit: "kg", threshold: "" });
    setErrors({});
  };

  const adjustQuantity = async (id: string, current: number, change: number) => {
    const nextQty = Math.max(0, current + change);
    await updateDoc(doc(db, "inventory_items", id), { quantity: nextQty });
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "inventory_items", id));
  };

  const lowStockItems = inventory.filter(item => item.quantity <= item.threshold);

  // loading check removed to prevent UI stutter

  return (
    <div className="max-w-6xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-zinc-200">
        <div>
           <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Inventory Monitor</h2>
           <p className="text-zinc-500 text-sm mt-1">Track raw materials and get low stock alerts</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Material
        </button>
      </div>

      {lowStockItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
               <div className="flex items-center gap-3 mb-2">
                  <AlertCircle className="h-5 w-5 text-red-600 animate-pulse" />
                  <h3 className="font-semibold text-red-900">Low Stock Alerts</h3>
               </div>
               <p className="text-sm text-red-700">
                 {lowStockItems.length} item(s) are below target threshold and require immediate restocking.
               </p>
            </div>
        </div>
      )}

      {isAdding && (
        <form noValidate onSubmit={handleAdd} className="mb-8 p-6 bg-white border border-zinc-200 rounded-xl shadow-sm">
           <h3 className="text-lg font-semibold mb-4 text-zinc-900">Add New Inventory Item</h3>
           {errors.general && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">{errors.general}</div>}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                <input type="text" value={newItem.name} onChange={e => { setNewItem({...newItem, name: e.target.value}); setErrors({...errors, name: undefined}); }} className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${errors.name ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`} />
                {errors.name && <span className="text-xs text-red-500 mt-1 block">{errors.name}</span>}
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Current Stock</label>
                <input type="number" step="any" value={newItem.quantity} onChange={e => { setNewItem({...newItem, quantity: e.target.value}); setErrors({...errors, quantity: undefined}); }} className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${errors.quantity ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`} />
                {errors.quantity && <span className="text-xs text-red-500 mt-1 block">{errors.quantity}</span>}
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Unit</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAddUnitOpen(!isAddUnitOpen)}
                    className="flex w-full items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 bg-white shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {newItem.unit || "Select Unit"}
                    <ChevronDown className="w-4 h-4 text-zinc-400 pointer-events-none" />
                  </button>
                  {isAddUnitOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsAddUnitOpen(false)} />
                      <div className="absolute left-0 mt-1 top-full w-full bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-100">
                        {unitOptions.map(u => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => {
                              setNewItem({...newItem, unit: u});
                              setIsAddUnitOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 ${
                              newItem.unit === u ? "text-orange-600 bg-orange-50/50" : "text-zinc-700"
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Low Stock Threshold</label>
                <input type="number" step="any" value={newItem.threshold} onChange={e => { setNewItem({...newItem, threshold: e.target.value}); setErrors({...errors, threshold: undefined}); }} className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${errors.threshold ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`} />
                {errors.threshold && <span className="text-xs text-red-500 mt-1 block">{errors.threshold}</span>}
             </div>
           </div>
           <div className="flex justify-end gap-2">
             <button type="button" onClick={() => { setIsAdding(false); setErrors({}); }} className="px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors">Cancel</button>
             <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md transition-colors">Save Material</button>
           </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
         <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ingredient Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Current Stock</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Threshold</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
               {inventory.map(item => {
                 const isLow = item.quantity <= item.threshold;
                 return (
                  <tr key={item.id} className="hover:bg-zinc-50 transition-colors">
                     <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900">
                        {item.name}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 font-mono flex items-center gap-3">
                        <button onClick={() => adjustQuantity(item.id, item.quantity, -1)} className="w-6 h-6 flex items-center justify-center border border-zinc-200 rounded hover:bg-zinc-50 text-zinc-500">-</button>
                        <span>{item.quantity} {item.unit}</span>
                        <button onClick={() => adjustQuantity(item.id, item.quantity, 1)} className="w-6 h-6 flex items-center justify-center border border-zinc-200 rounded hover:bg-zinc-50 text-zinc-500">+</button>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 font-mono">
                        {item.threshold} {item.unit}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isLow ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                           {isLow ? 'Low' : 'Healthy'}
                        </span>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => handleDelete(item.id)} className="text-zinc-400 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                     </td>
                  </tr>
                 );
               })}
               {inventory.length === 0 && (
                 <tr>
                   <td colSpan={5} className="px-6 py-8 text-center text-sm text-zinc-500">
                     No raw materials found in stock.
                   </td>
                 </tr>
               )}
            </tbody>
         </table>
      </div>
    </div>
  );
}
