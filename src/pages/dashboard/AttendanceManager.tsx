import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { AttendanceItem } from "../../types";
import { Clock, LogIn, LogOut, Users, Calendar, ChevronRight } from "lucide-react";

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function AttendanceManager() {
  const { selectedOutletId } = useAuth();
  const [records, setRecords] = useState<AttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>(
    new Date().toLocaleDateString('en-CA')
  );

  const pastDays = Array.from({length: 7}).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d;
  }).reverse();

  useEffect(() => {
    if (!selectedOutletId) { setLoading(false); return; }
    const q = query(
      collection(db, "attendance"),
      where("outletId", "==", selectedOutletId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AttendanceItem[];
      setRecords(all);
      setLoading(false);
    });
    return () => unsub();
  }, [selectedOutletId]);

  const todayDateStr = new Date().toLocaleDateString('en-CA');

  // 1. Get records for the selected date
  const dateRecords = records.filter(r => r.date === dateFilter);
  
  // 3. Merge them uniquely by ID. If viewing Today, also include any active shifts (Night Shift Bug Fix)
  const displayMap = new Map<string, AttendanceItem>();
  dateRecords.forEach(r => displayMap.set(r.id, r));
  
  if (dateFilter === todayDateStr) {
    const activeRecords = records.filter(r => r.clockOut === null);
    activeRecords.forEach(r => displayMap.set(r.id, r));
  }
  
  const displayRecords = Array.from(displayMap.values());
  const clockedInCount = records.filter(r => r.clockOut === null).length; // Global active count

  // loading check removed to prevent UI stutter

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-black text-zinc-900 tracking-tight">Attendance Calendar</h2>
          <p className="text-zinc-500 text-sm mt-1 font-medium">Manage daily staff clock-ins, clock-outs, and active shifts.</p>
        </div>
      </div>

      {/* Premium Horizontal Date Slider */}
      <div className="flex items-center gap-3 overflow-x-auto pt-4 pb-6 mb-2 custom-scrollbar">
         {pastDays.map((date, idx) => {
           const dStr = date.toLocaleDateString('en-CA');
           const isSelected = dateFilter === dStr;
           const isToday = idx === 6;
           return (
             <button 
               key={dStr}
               onClick={() => setDateFilter(dStr)}
               className={`relative flex flex-col items-center justify-center min-w-[85px] h-24 rounded-2xl border transition-all duration-200 cursor-pointer ${isSelected ? 'bg-orange-600 border-orange-600 text-white shadow-[0_8px_20px_rgba(234,88,12,0.3)] scale-105 z-10' : 'bg-white border-zinc-200 text-zinc-600 hover:border-orange-300 hover:bg-orange-50'}`}
             >
               {isToday && !isSelected && (
                 <span className="absolute -top-3 bg-orange-100 text-orange-800 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-orange-200">Today</span>
               )}
               {isToday && isSelected && (
                 <span className="absolute -top-3 bg-white text-orange-600 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">Today</span>
               )}
               <span className={`text-xs font-bold uppercase tracking-widest ${isSelected ? 'text-orange-200' : 'text-zinc-400'}`}>
                 {date.toLocaleDateString('en-US', { weekday: 'short' })}
               </span>
               <span className={`text-3xl font-black mt-0.5 tracking-tighter ${isSelected ? 'text-white' : 'text-zinc-900'}`}>
                 {date.getDate()}
               </span>
             </button>
           );
         })}
         
         <div 
           className="flex items-center justify-center min-w-[85px] h-24 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 text-zinc-500 hover:bg-zinc-100 hover:border-zinc-400 transition-colors relative cursor-pointer group ml-2"
           onClick={(e) => {
             const inp = e.currentTarget.querySelector('input');
             if (inp && inp.showPicker) inp.showPicker();
           }}
         >
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
              title="Select any date"
            />
            <div className="flex flex-col items-center group-hover:scale-110 transition-transform">
               <Calendar className="w-6 h-6 mb-1.5 text-zinc-400 group-hover:text-zinc-600" />
               <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-zinc-700">Custom</span>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5"><Users className="w-24 h-24" /></div>
          <div className="flex items-center gap-3 mb-3 relative z-10">
            <div className="bg-blue-100/50 p-2.5 rounded-xl"><Users className="w-5 h-5 text-blue-600" /></div>
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Total Shifts</span>
          </div>
          <p className="text-4xl font-black text-zinc-900 tracking-tight relative z-10">{displayRecords.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5"><LogIn className="w-24 h-24" /></div>
          <div className="flex items-center gap-3 mb-3 relative z-10">
            <div className="bg-emerald-100/50 p-2.5 rounded-xl"><LogIn className="w-5 h-5 text-emerald-600" /></div>
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Clocked In</span>
          </div>
          <p className="text-4xl font-black text-emerald-600 tracking-tight relative z-10">{clockedInCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5"><LogOut className="w-24 h-24" /></div>
          <div className="flex items-center gap-3 mb-3 relative z-10">
            <div className="bg-zinc-100 p-2.5 rounded-xl"><LogOut className="w-5 h-5 text-zinc-500" /></div>
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Clocked Out</span>
          </div>
          <p className="text-4xl font-black text-zinc-700 tracking-tight relative z-10">{displayRecords.filter(r => r.clockOut !== null).length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-zinc-100">
          <thead className="bg-zinc-50">
            <tr>
              {["Employee", "Role", "Clock In", "Clock Out", "Duration", "Status"].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {displayRecords.map(r => {
              const duration = r.clockOut ? formatDuration(r.clockOut - r.clockIn) : null;
              const isActive = r.clockOut === null;
              return (
                <tr key={r.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-700 text-xs">
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-zinc-900">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                      r.role === "manager" ? "bg-purple-100 text-purple-800" :
                      r.role === "waiter" ? "bg-blue-100 text-blue-800" :
                      "bg-orange-100 text-orange-800"
                    }`}>{r.role}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-700 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      {new Date(r.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-700 font-medium">
                    {r.clockOut
                      ? new Date(r.clockOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : <span className="text-zinc-400">-</span>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-900">
                    {duration ?? <span className="text-zinc-400">-</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                      isActive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`} />
                      {isActive ? "Active" : "Clocked Out"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {displayRecords.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-zinc-400">
                  No attendance records for {dateFilter}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
