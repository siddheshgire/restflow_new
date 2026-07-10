import { useEffect, useState, FormEvent } from "react";
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { MenuItem } from "../../types";
import { Plus, Edit2, Trash2, ChevronDown } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export function MenuManager() {
  const { selectedOutletId } = useAuth();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", description: "", price: "", category: "Mains" });
  const [errors, setErrors] = useState<{name?: string; price?: string; general?: string}>({});
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isAddCatOpen, setIsAddCatOpen] = useState(false);
  const [isEditCatOpen, setIsEditCatOpen] = useState(false);

  const menuCategories = ["Starters", "Mains", "Main Course", "Rice", "Noodles", "Pizza", "Burgers", "Beverages", "Salads", "Desserts"];

  useEffect(() => {
    if (!selectedOutletId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "menu_items"), where("outletId", "==", selectedOutletId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })) as MenuItem[];
      setItems(fetchedItems);
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
    if (!newItem.price) {
      setErrors({ price: "Price is required" });
      return;
    }
    
    // Clear previous errors if all valid
    setErrors({});

    if (!selectedOutletId) return;
    
    const priceVal = parseFloat(newItem.price);
    if (isNaN(priceVal) || priceVal <= 0) {
      setErrors({ general: "Please enter a valid price greater than 0." });
      return;
    }

    await addDoc(collection(db, "menu_items"), {
      outletId: selectedOutletId,
      name: newItem.name.trim(),
      description: newItem.description,
      price: priceVal,
      category: newItem.category,
      available: true,
      recommended: false
    });
    setIsAdding(false);
    setNewItem({ name: "", description: "", price: "", category: "Mains" });
    setErrors({});
  };

  const handleDelete = async (id: string) => {
      if (id.startsWith('mock')) {
         setItems(items.filter(item => item.id !== id));
         return;
      }
      await deleteDoc(doc(db, "menu_items", id));
  };

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
      if (id.startsWith('mock')) {
         setItems(items.map(item => item.id === id ? { ...item, available: !currentStatus } : item));
         return;
      }
      await updateDoc(doc(db, "menu_items", id), { available: !currentStatus });
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.name || !editingItem.price) return;
    
    const priceVal = parseFloat(editingItem.price as any);
    if (isNaN(priceVal) || priceVal <= 0) {
      alert("Please enter a valid price greater than 0.");
      return;
    }

    if (editingItem.id.startsWith('mock')) {
      setItems(items.map(item => item.id === editingItem.id ? { ...editingItem, price: priceVal } : item));
      setEditingItem(null);
      return;
    }

    const itemRef = doc(db, "menu_items", editingItem.id);
    await updateDoc(itemRef, {
      name: editingItem.name,
      description: editingItem.description,
      price: priceVal,
      category: editingItem.category
    });
    setEditingItem(null);
  };


  const filterCategories = ["All", ...Array.from(new Set(items.map(item => item.category)))];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-zinc-200">
        <div>
           <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Menu Manager</h2>
           <p className="text-zinc-500 text-sm mt-1">Manage categories, items, and availability</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      {isAdding && (
        <form noValidate onSubmit={handleAdd} className="mb-8 p-6 bg-white border border-zinc-200 rounded-xl shadow-sm">
           <h3 className="text-lg font-semibold mb-4 text-zinc-900">Add New Menu Item</h3>
           {errors.general && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">{errors.general}</div>}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                <input type="text" value={newItem.name} onChange={e => { setNewItem({...newItem, name: e.target.value}); setErrors({...errors, name: undefined}); }} className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${errors.name ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`} />
                {errors.name && <span className="text-xs text-red-500 mt-1 block">{errors.name}</span>}
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Price (₹)</label>
                <input type="number" step="any" value={newItem.price} onChange={e => { setNewItem({...newItem, price: e.target.value}); setErrors({...errors, price: undefined}); }} className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${errors.price ? 'border-red-500 bg-red-50' : 'border-zinc-300'}`} />
                {errors.price && <span className="text-xs text-red-500 mt-1 block">{errors.price}</span>}
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Category</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAddCatOpen(!isAddCatOpen)}
                    className="flex w-full items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 bg-white shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {newItem.category || "Select Category"}
                    <ChevronDown className="w-4 h-4 text-zinc-400 pointer-events-none" />
                  </button>
                  {isAddCatOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsAddCatOpen(false)} />
                      <div className="absolute left-0 mt-1 top-full w-full bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-100">
                        {menuCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setNewItem({...newItem, category: cat});
                              setIsAddCatOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 ${
                              newItem.category === cat ? "text-orange-600 bg-orange-50/50" : "text-zinc-700"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
             </div>
             <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Description</label>
                <input type="text" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
             </div>
           </div>
           <div className="flex justify-end gap-2">
             <button type="button" onClick={() => { setIsAdding(false); setErrors({}); }} className="px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors">Cancel</button>
             <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md transition-colors">Save Item</button>
           </div>
        </form>
      )}

      {/* Category Filter Dropdown */}
      <div className="flex gap-3 items-center mb-6 bg-white border border-zinc-200 p-4 rounded-xl shadow-sm">
        <label className="text-sm font-bold text-zinc-700">Filter by Category:</label>
        <div className="relative flex items-center">
          <button
            onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white pl-3 pr-8 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 transition-colors cursor-pointer relative"
          >
            {selectedCategory}
            <ChevronDown className="absolute right-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
          </button>
          {isFilterDropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsFilterDropdownOpen(false)} />
              <div className="absolute left-0 mt-1 top-full w-44 bg-white border border-zinc-200 rounded-xl shadow-xl z-40 py-1.5 animate-in fade-in slide-in-from-top-1 duration-100">
                {filterCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors cursor-pointer hover:bg-zinc-50 ${
                      selectedCategory === cat ? "text-orange-600 bg-orange-50/30" : "text-zinc-650 hover:text-zinc-950"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="text-xs font-medium text-zinc-400 ml-auto">
          Showing {items.filter(item => selectedCategory === "All" || item.category === selectedCategory).length} items
        </span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
         <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Item Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Category</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Price</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
                {items
                  .filter(item => selectedCategory === "All" || item.category === selectedCategory)
                  .map(item => (
                  <tr key={item.id} className="hover:bg-zinc-50 transition-colors">
                     <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">{item.name}</div>
                        <div className="text-sm text-zinc-500">{item.description}</div>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800">
                           {item.category}
                        </span>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900">
                        ₹{item.price}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap">
                        <button
                           onClick={() => toggleAvailability(item.id, item.available !== false)}
                           className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${item.available !== false ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                        >
                           <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${item.available !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                        <span className={`ml-2 text-xs font-bold ${item.available !== false ? 'text-emerald-600' : 'text-zinc-400'}`}>
                           {item.available !== false ? 'Available' : 'Sold Out'}
                        </span>
                     </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => setEditingItem(item)} className="text-zinc-400 hover:text-zinc-900 mx-2 transition-colors cursor-pointer"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(item.id)} className="text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                      </td>
                  </tr>
                ))}
                {items.filter(item => selectedCategory === "All" || item.category === selectedCategory).length === 0 && !loading && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-zinc-500">No menu items found in this category.</td></tr>
                )}
            </tbody>
         </table>
       {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-zinc-200 shadow-2xl relative">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">Edit Menu Item</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Name</label>
                <input 
                  required 
                  type="text" 
                  value={editingItem.name} 
                  onChange={e => setEditingItem({...editingItem, name: e.target.value})} 
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Price (₹)</label>
                <input 
                  required 
                  type="number" 
                  value={editingItem.price} 
                  onChange={e => setEditingItem({...editingItem, price: parseFloat(e.target.value) || 0})} 
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Category</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsEditCatOpen(!isEditCatOpen)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 bg-white shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {editingItem.category || "Select Category"}
                    <ChevronDown className="w-4 h-4 text-zinc-400 pointer-events-none" />
                  </button>
                  {isEditCatOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsEditCatOpen(false)} />
                      <div className="absolute left-0 mt-1 top-full w-full bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-100">
                        {menuCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setEditingItem({...editingItem, category: cat});
                              setIsEditCatOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 ${
                              editingItem.category === cat ? "text-orange-600 bg-orange-50/50" : "text-zinc-700"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Description</label>
                <input 
                  type="text" 
                  value={editingItem.description} 
                  onChange={e => setEditingItem({...editingItem, description: e.target.value})} 
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white" 
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button type="button" onClick={() => setEditingItem(null)} className="px-4 py-2 text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-lg shadow-sm transition-colors cursor-pointer">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
     </div>
    </div>
  );
}
