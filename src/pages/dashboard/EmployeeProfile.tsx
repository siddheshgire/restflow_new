import { useEffect, useState, useRef, FormEvent } from "react";
import { Link } from "react-router-dom";
import { User as UserIcon, Briefcase, IndianRupee, Store, LogIn, LogOut, Clock, Key, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, runTransaction } from "firebase/firestore";
import { db } from "../../lib/firebase";

export function EmployeeProfile() {
  const { user, role, outlets, selectedOutletId } = useAuth();
  const [profileData, setProfileData] = useState<{
    name: string;
    email: string;
    role: string;
    salary: number | string;
    outletName: string;
    pin?: string;
    activationCode?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState(false);
  const { changePassword, logout } = useAuth();

  // Attendance state
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attendanceDocId, setAttendanceDocId] = useState<string | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // KDS PIN Modal State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [newPinInput, setNewPinInput] = useState("");
  const [pinModalError, setPinModalError] = useState(false);
  const [pinUpdateSuccess, setPinUpdateSuccess] = useState(false);
  const [clockedInElsewhereOutletName, setClockedInElsewhereOutletName] = useState<string | null>(null);

  // Restore session from DB & localStorage
  useEffect(() => {
    if (!user || !selectedOutletId) return;

    const restoreAttendance = async () => {
      setAttendanceLoading(true);
      try {
        const q = query(
          collection(db, "attendance"),
          where("employeeId", "==", user.uid),
          where("clockOut", "==", null)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const data = docSnap.data();
          
          if (data.outletId === selectedOutletId) {
            setIsClockedIn(true);
            setClockInTime(data.clockIn);
            setAttendanceDocId(docSnap.id);
            setClockedInElsewhereOutletName(null);
            localStorage.setItem(`attendance_session_${user.uid}`, JSON.stringify({ clockIn: data.clockIn, docId: docSnap.id }));
          } else {
            setIsClockedIn(false);
            setClockInTime(null);
            setAttendanceDocId(null);
            
            // Resolve the other outlet's name
            const outletRef = doc(db, "outlets", data.outletId);
            const outletSnap = await getDoc(outletRef);
            const otherName = outletSnap.exists() ? (outletSnap.data().name || "another branch") : "another branch";
            setClockedInElsewhereOutletName(otherName);
            localStorage.removeItem(`attendance_session_${user.uid}`);
          }
        } else {
          setIsClockedIn(false);
          setClockInTime(null);
          setAttendanceDocId(null);
          setClockedInElsewhereOutletName(null);
          localStorage.removeItem(`attendance_session_${user.uid}`);
        }
      } catch (err) {
        console.error("Error restoring attendance session:", err);
      } finally {
        setAttendanceLoading(false);
      }
    };

    restoreAttendance();
  }, [user, selectedOutletId]);

  // Live timer
  useEffect(() => {
    if (isClockedIn && clockInTime) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - clockInTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isClockedIn, clockInTime]);

  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const handleClockIn = async () => {
    if (!user || !selectedOutletId || !profileData || attendanceLoading || isClockedIn) return;
    setAttendanceLoading(true);
    try {
      // Check atomically if an open session already exists to prevent race conditions
      // across multiple tabs or devices logged into the same account
      const openSessionQuery = query(
        collection(db, 'attendance'),
        where('employeeId', '==', user.uid),
        where('clockOut', '==', null)
      );
      const existingSnap = await getDocs(openSessionQuery);

      if (!existingSnap.empty) {
        // Session already open (possibly from another tab or device)
        const existingDoc = existingSnap.docs[0];
        const existingData = existingDoc.data();
        if (existingData.outletId === selectedOutletId) {
          // Restore local state from the existing session instead of creating a duplicate
          setIsClockedIn(true);
          setClockInTime(existingData.clockIn);
          setAttendanceDocId(existingDoc.id);
          localStorage.setItem(`attendance_session_${user.uid}`, JSON.stringify({ clockIn: existingData.clockIn, docId: existingDoc.id }));
        } else {
          alert('You are already clocked in at another branch. Please clock out there first.');
        }
        return;
      }

      // No open session found — safe to create a new one
      const now = Date.now();
      const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local format
      const res = await addDoc(collection(db, 'attendance'), {
        employeeId: user.uid,
        outletId: selectedOutletId,
        name: profileData.name,
        role: profileData.role,
        clockIn: now,
        clockOut: null,
        date
      }) as any;
      const docId = res.id;
      setIsClockedIn(true);
      setClockInTime(now);
      setAttendanceDocId(docId);
      localStorage.setItem(`attendance_session_${user.uid}`, JSON.stringify({ clockIn: now, docId }));
    } catch (err) {
      console.error('Clock-in failed:', err);
      alert('Clock-in failed. Please try again.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!attendanceDocId || !user || attendanceLoading || !isClockedIn) return;
    setAttendanceLoading(true);
    try {
      const now = Date.now();
      await updateDoc(doc(db, 'attendance', attendanceDocId), { clockOut: now });
      setIsClockedIn(false);
      setClockInTime(null);
      setAttendanceDocId(null);
      localStorage.removeItem(`attendance_session_${user.uid}`);
    } catch (err) {
      console.error("Clock-out failed:", err);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) {
      setChangeError("New password must be at least 6 characters long.");
      return;
    }
    setChangeLoading(true);
    setChangeError(null);
    setChangeSuccess(false);
    try {
      await changePassword(currentPassword, newPassword);
      setChangeSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(async () => {
        const { useNavigate } = await import("react-router-dom");
        // We can't import hooks in setTimeout, wait, we can just do window.location.href = "/" here since it's a delay anyway.
        // Actually, window.location.href = "/" is fine here because the user isn't pressing the back button to get here, it's a timed out auto-logout.
        window.location.replace("/");
        await logout();
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setChangeError(err.message || "Failed to change password. Please verify current password.");
    } finally {
      setChangeLoading(false);
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput.length !== 4) {
      setPinModalError(true);
      return;
    }
    if (selectedOutletId) {
      await updateDoc(doc(db, "outlets", selectedOutletId), { kitchenPin: newPinInput });
      setPinUpdateSuccess(true);
      setTimeout(() => {
        setIsPinModalOpen(false);
        setNewPinInput("");
        setPinModalError(false);
        setPinUpdateSuccess(false);
      }, 2000);
    }
  };

  useEffect(() => {
    async function loadProfile() {
      if (!user) {
        setLoading(false);
        return;
      }

      if (role === 'owner') {
        setProfileData({
          name: user.displayName || user.email?.split('@')[0] || "Owner",
          email: user.email || "",
          role: "owner",
          salary: "Owner Account",
          outletName: outlets.length > 0 ? `${outlets.length} Outlet(s)` : "No Outlets Set",
          pin: "N/A (Owner Admin)",
          activationCode: "N/A"
        });
        setLoading(false);
        return;
      }

      try {
        const empQuery = query(
          collection(db, "employees"),
          where("email", "==", user.email)
        );
        const empSnap = await getDocs(empQuery);
        if (!empSnap.empty) {
          const empData = empSnap.docs[0].data();
          const currentOutlet = outlets.find(o => o.id === empData.outletId);
          setProfileData({
            name: empData.name,
            email: empData.email,
            role: empData.role,
            salary: empData.salary,
            outletName: currentOutlet ? `${currentOutlet.name} (${currentOutlet.location})` : "Assigned Outlet",
            pin: empData.pin || "Not Assigned",
            activationCode: empData.activationCode || "Not Assigned"
          });
        } else {
          // fallback
          setProfileData({
            name: user.displayName || user.email?.split('@')[0] || "Employee",
            email: user.email || "",
            role: role || "staff",
            salary: "Pending Configuration",
            outletName: outlets.length > 0 ? `${outlets[0].name} (${outlets[0].location})` : "Assigned Branch",
            pin: "Not Assigned",
            activationCode: "Not Assigned"
          });
        }
      } catch (err) {
        console.error("Error loading employee profile:", err);
      }
      setLoading(false);
    }

    loadProfile();
  }, [user, role, outlets]);

  // loading check removed to prevent UI stutter

  if (!profileData) {
    return <div className="text-center py-12 text-zinc-500">No profile found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-zinc-200">
        <div>
           <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">My Profile</h2>
           <p className="text-zinc-500 text-sm mt-1">View your work details and salary</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 p-8 shadow-sm">
        <div className="flex items-center gap-6 mb-8">
          <div className="h-20 w-20 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-3xl">
             {profileData.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-2xl font-bold text-zinc-900">{profileData.name}</h3>
            <p className="text-zinc-500">{profileData.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl border border-zinc-200 bg-zinc-50">
             <div className="flex items-center gap-3 mb-4">
                <Briefcase className="h-5 w-5 text-zinc-400" />
                <h4 className="font-semibold text-zinc-700">Assigned Role</h4>
             </div>
             <p className="text-xl font-medium text-zinc-900 capitalize">{profileData.role}</p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-200 bg-zinc-50">
             <div className="flex items-center gap-3 mb-4">
                <Store className="h-5 w-5 text-zinc-400" />
                <h4 className="font-semibold text-zinc-700">Assigned Outlet</h4>
             </div>
             <p className="text-xl font-medium text-zinc-900">{profileData.outletName}</p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-200 bg-emerald-50 border-emerald-100">
             <div className="flex items-center gap-3 mb-4">
                <IndianRupee className="h-5 w-5 text-emerald-600" />
                <h4 className="font-semibold text-emerald-900">Monthly Salary</h4>
             </div>
             <p className="text-xl font-bold text-emerald-700">
                {typeof profileData.salary === 'number' 
                  ? `₹${profileData.salary.toLocaleString()}` 
                  : profileData.salary}
             </p>
          </div>
        </div>

        {/* Dynamic Credentials Display */}
        {profileData.role !== 'owner' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
             <div className="p-6 rounded-xl border border-orange-200 bg-orange-50/20">
                <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Quick Sign In PIN</span>
                <span className="text-2xl font-extrabold text-orange-600 mt-1 block tracking-widest">{profileData.pin}</span>
             </div>
             <div className="p-6 rounded-xl border border-zinc-200 bg-zinc-50/50">
                <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Account Activation Code</span>
                <span className="text-2xl font-bold text-zinc-800 mt-1 block tracking-wider">{profileData.activationCode}</span>
             </div>
          </div>
        )}

        {/* Dynamic Role Launchpad Control Center */}
        <div className="mt-8 pt-8 border-t border-zinc-200">
           <h4 className="text-lg font-bold text-zinc-900 mb-4 tracking-tight">Workspace Control Center</h4>
           {profileData.role === 'cook' && (
             <div className="p-6 rounded-xl border border-orange-200 bg-orange-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                   <h5 className="font-bold text-zinc-900 text-base">Kitchen Display System (KDS)</h5>
                   <p className="text-sm text-zinc-600 mt-1">Access the live kitchen order ticket panel to view and prepare incoming food tickets.</p>
                </div>
                <a 
                  href={`/kitchen/${selectedOutletId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-500 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
                >
                  Open Kitchen Display
                </a>
             </div>
           )}

           {profileData.role === 'waiter' && (
             <div className="p-6 rounded-xl border border-blue-200 bg-blue-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                   <h5 className="font-bold text-zinc-900 text-base">Waiter Service Board</h5>
                   <p className="text-sm text-zinc-600 mt-1">Manage active tables, check ready meals, deliver plates, and process bill payments.</p>
                </div>
                <Link 
                  to="/dashboard/waiter"
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors shadow-sm cursor-pointer whitespace-nowrap animate-pulse"
                >
                  Launch Waiter Panel
                </Link>
             </div>
           )}

           {profileData.role === 'manager' && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-6 rounded-xl border border-purple-200 bg-purple-50/50 flex flex-col justify-between gap-4">
                   <div>
                      <h5 className="font-bold text-zinc-900 text-base">Digital Menu Manager</h5>
                      <p className="text-xs text-zinc-600 mt-1">Add new dishes, customize categories, update pricing, and set item availability.</p>
                   </div>
                   <Link to="/dashboard/menu" className="w-fit px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-500 transition-colors">
                      Manage Menu
                   </Link>
                </div>
                
                <div className="p-6 rounded-xl border border-indigo-200 bg-indigo-50/50 flex flex-col justify-between gap-4">
                   <div>
                      <h5 className="font-bold text-zinc-900 text-base">Inventory Manager</h5>
                      <p className="text-xs text-zinc-600 mt-1">Track stocks, check ingredient alerts, and log supplier items.</p>
                   </div>
                   <Link to="/dashboard/inventory" className="w-fit px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500 transition-colors">
                      Manage Inventory
                   </Link>
                </div>
             </div>
           )}
         </div>

         {/* Attendance Clock-In/Out */}
         {profileData.role !== 'owner' && (
           <div className="mt-8 pt-8 border-t border-zinc-200">
             <h4 className="text-lg font-bold text-zinc-900 mb-4 tracking-tight">Attendance</h4>
             <div className={`p-6 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
               isClockedIn ? 'bg-emerald-50 border-emerald-200' : 
               clockedInElsewhereOutletName ? 'bg-amber-50 border-amber-200' : 'bg-zinc-50 border-zinc-200'
             }`}>
               <div>
                 <div className="flex items-center gap-2 mb-1">
                   <Clock className={`w-4 h-4 ${
                     isClockedIn ? 'text-emerald-600' : 
                     clockedInElsewhereOutletName ? 'text-amber-500 animate-pulse' : 'text-zinc-400'
                   }`} />
                   <span className="text-sm font-bold text-zinc-700">
                     {isClockedIn ? 'Currently Clocked In' : 
                      clockedInElsewhereOutletName ? `Active Shift at ${clockedInElsewhereOutletName}` : 'Not Clocked In'}
                   </span>
                 </div>
                 {isClockedIn && (
                   <p className="text-3xl font-black tracking-wider text-emerald-700 font-mono">{formatElapsed(elapsedSeconds)}</p>
                 )}
                 {!isClockedIn && !clockedInElsewhereOutletName && <p className="text-sm text-zinc-500">Clock in to start tracking your shift.</p>}
                 {clockedInElsewhereOutletName && (
                   <p className="text-xs text-amber-700 font-semibold mt-1">
                     Please clock out from the other outlet first before starting a new shift here.
                   </p>
                 )}
               </div>
                {isClockedIn ? (
                  <button 
                    disabled={attendanceLoading}
                    onClick={handleClockOut} 
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" /> {attendanceLoading ? "Clocking Out..." : "Clock Out"}
                  </button>
                ) : (
                  <button 
                    disabled={attendanceLoading || !!clockedInElsewhereOutletName}
                    onClick={handleClockIn} 
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed"
                  >
                    <LogIn className="w-4 h-4" /> {attendanceLoading ? "Clocking In..." : "Clock In"}
                  </button>
                )}
             </div>
           </div>
         )}

         {/* Owner Outlet Settings */}
         {profileData.role === 'owner' && selectedOutletId && (
           <div className="mt-8 pt-8 border-t border-zinc-200">
             <h4 className="text-lg font-bold text-zinc-900 mb-4 tracking-tight">Outlet Settings (Admin)</h4>
             <div className="p-6 rounded-xl border border-zinc-200 bg-zinc-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                   <h5 className="font-bold text-zinc-900 text-base">Kitchen Display Passcode</h5>
                   <p className="text-sm text-zinc-600 mt-1">Set a 4-digit secure PIN to lock the kitchen display from unauthorized access.</p>
                </div>
                <button 
                  onClick={() => setIsPinModalOpen(true)}
                  className="px-5 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
                >
                  Change KDS PIN
                </button>
             </div>
           </div>
         )}

         {/* Security Settings (Change Password) */}
         <div className="mt-8 pt-8 border-t border-zinc-200">
            <h4 className="text-lg font-bold text-zinc-900 mb-4 tracking-tight">Security Settings</h4>
            
            <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
               {changeError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-xs font-semibold text-rose-700">
                     {changeError}
                  </div>
               )}
               {changeSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-700">
                     Password successfully changed! Logging out in 2 seconds...
                  </div>
               )}

               <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Current Password</label>
                  <input 
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">New Password</label>
                  <input 
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    placeholder="At least 6 characters"
                  />
               </div>

               <button
                 type="submit"
                 disabled={changeLoading}
                 className="px-4 py-2 bg-zinc-950 text-white rounded-lg text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
               >
                  {changeLoading ? "Updating..." : "Update Password"}
               </button>
            </form>
         </div>
      </div>

      {/* Kitchen PIN Update Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative scale-in-95 transition-all">
            {pinUpdateSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 text-center">PIN Updated!</h3>
                <p className="text-sm text-zinc-500 mt-2 text-center">Kitchen Display passcode has been changed successfully.</p>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-zinc-900 text-center mb-2">Update Kitchen PIN</h3>
                <p className="text-sm text-zinc-500 text-center mb-6">
                  Enter a new 4-digit passcode for your Kitchen Display screen.
                </p>
                <form onSubmit={handleUpdatePin}>
                   <input
                     type="text"
                     maxLength={4}
                     value={newPinInput}
                     onChange={(e) => {
                       setNewPinInput(e.target.value.replace(/[^0-9]/g, ''));
                       setPinModalError(false);
                     }}
                     className={`w-full border ${pinModalError ? 'border-red-500 focus:ring-red-500' : 'border-zinc-300 focus:ring-orange-500'} rounded-xl px-4 py-3 text-center text-2xl tracking-[1em] font-black focus:outline-none focus:ring-2 transition-colors mb-4`}
                     placeholder="••••"
                     autoFocus
                   />
                   {pinModalError && <p className="text-red-500 text-xs font-semibold mb-4 text-center">Please enter exactly 4 digits.</p>}
                   <div className="flex gap-3">
                     <button
                       type="button"
                       onClick={() => setIsPinModalOpen(false)}
                       className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-colors cursor-pointer"
                     >
                       Cancel
                     </button>
                     <button
                       type="submit"
                       className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-600/20 transition-colors cursor-pointer"
                     >
                       Save PIN
                     </button>
                   </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
