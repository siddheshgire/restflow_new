import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { Store, Plus, MapPin, ChefHat, LogOut, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";

export function BranchSelector() {
  const { user, outlets, setSelectedOutletId, logout } = useAuth();
  const navigate = useNavigate();

  const handleSelectBranch = (outletId: string) => {
    setSelectedOutletId(outletId);
    localStorage.setItem("selectedOutletId", outletId);
    navigate("/dashboard");
  };

  const [isAdding, setIsAdding] = useState(false);

  const handleLogout = () => {
    navigate("/", { replace: true });
    setTimeout(async () => {
      await logout();
    }, 100);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center font-sans relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-800/30 via-zinc-950 to-zinc-950"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 text-center mb-16"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-orange-600/20 p-4 rounded-2xl ring-1 ring-orange-500/30">
            <ChefHat className="w-12 h-12 text-orange-500" />
          </div>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-3">
          Which branch are you managing?
        </h1>
        <p className="text-zinc-400 text-lg">
          Select an outlet to access its dashboard, or create a new one.
        </p>
      </motion.div>

      {/* Branch Cards */}
      <div className="z-10 flex flex-wrap justify-center gap-6 max-w-5xl px-6">
        {outlets.map((outlet, index) => (
          <motion.button
            key={outlet.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSelectBranch(outlet.id)}
            className="group relative flex flex-col items-center justify-center w-56 h-64 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 transition-all hover:border-orange-500/50 hover:bg-zinc-800/80 hover:shadow-2xl hover:shadow-orange-900/20"
          >
            <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mb-6 group-hover:bg-orange-500/20 transition-colors ring-1 ring-zinc-700 group-hover:ring-orange-500/50">
              <Store className="w-10 h-10 text-zinc-400 group-hover:text-orange-500 transition-colors" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 text-center leading-tight">
              {outlet.name}
            </h3>
            <div className="flex items-center gap-1.5 text-zinc-500 text-sm">
              <MapPin className="w-3.5 h-3.5" />
              <span className="truncate max-w-[140px]">{outlet.location}</span>
            </div>
            
            {/* Hover overlay indicator */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-orange-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
          </motion.button>
        ))}

        {/* Add New Branch Card */}
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: outlets.length * 0.1 }}
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsAdding(true)}
          className="group relative flex flex-col items-center justify-center w-56 h-64 bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 border-dashed rounded-3xl p-6 transition-all hover:border-zinc-500 hover:bg-zinc-800/50"
        >
          <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 transition-colors ring-1 ring-zinc-800 group-hover:ring-zinc-600">
            <Plus className="w-10 h-10 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
          </div>
          <h3 className="text-lg font-bold text-zinc-500 group-hover:text-zinc-300 transition-colors text-center leading-tight">
            Add New Branch
          </h3>
        </motion.button>
      </div>

      {/* User Info & Actions */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute top-6 right-8 flex items-center gap-4"
      >
        <div className="text-right">
          <p className="text-white text-sm font-bold">{user?.email}</p>
          <p className="text-zinc-500 text-xs">Owner Account</p>
        </div>
        <button 
          onClick={handleLogout}
          className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 transition-all"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </motion.div>

      {/* Add Branch Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsAdding(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mb-6 ring-1 ring-orange-500/50">
                <Store className="w-8 h-8 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Multi-Branch Creation</h2>
              <p className="text-zinc-400 text-sm mb-8 px-4">
                We're currently building a powerful multi-branch management experience. This feature will be available in the upcoming enterprise update!
              </p>
              
              <button
                onClick={() => setIsAdding(false)}
                className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-orange-900/20"
              >
                Got it, Thanks!
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
