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
    if (!newItem.name || !newItem.quantity || !newItem.threshold || !selectedOutletId) return;

    const qtyVal = parseFloat(newItem.quantity);
    const thresholdVal = parseFloat(newItem.threshold);

    if (isNaN(qtyVal) || qtyVal < 0 || isNaN(thresholdVal) || thresholdVal < 0) {
      alert("Please enter a valid stock quantity and warning threshold greater than or equal to 0.");
      return;
    }

    await addDoc(collection(db, "inventory_items"), {
      outletId: selectedOutletId,
      name: newItem.name,
      quantity: qtyVal,
      unit: newItem.unit,
      threshold: thresholdVal
    });
    setIsAdding(false);
    setNewItem({ name: "", quantity: "", unit: "kg", threshold: "" });
  };

  const adjustQuantity = async (id: string, current: number, change: number) => {
    const nextQty = Math.max(0, current + change);
    await updateDoc(doc(db, "inventory_items", id), { quantity: nextQty });
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "inventory_items", id));
  };

  const lowStockItems = inventory.filter(item => item.quantity <= item.threshold);

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-zinc-500 font-sans">Loading inventory...</div>;
  }

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
        <form onSubmit={handleAdd} className="mb-8 p-6 bg-white border border-zinc-200 rounded-xl shadow-sm">
           <h3 className="text-lg font-semibold mb-4 text-zinc-900">Add New Inventory Item</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                <input required type="text" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Current Stock</label>
                <input required type="number" step="any" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Unit</label>
                <div className="relative flex items-center">
                  <select value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} className="w-full appearance-none rounded-md border border-zinc-300 pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                     <option>kg</option>
                     <option>liters</option>
                     <option>units</option>
                     <option>gms</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
                </div>
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Low Stock Threshold</label>
                <input required type="number" step="any" value={newItem.threshold} onChange={e => setNewItem({...newItem, threshold: e.target.value})} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
             </div>
           </div>
           <div className="flex justify-end gap-2">
             <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors">Cancel</button>
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
