import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ChefHat, Mail, Lock, ArrowRight, ShieldAlert, Users, Key, User } from "lucide-react";
import { motion } from "motion/react";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [loginMethod, setLoginMethod] = useState<'email' | 'pin'>('email');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { signInWithEmail, signInWithGoogle, signInWithPINCode } = useAuth();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (isSignUp && !fullName) {
      setError("Please enter your full name.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const user = await signInWithEmail(email, password, isSignUp ? fullName : undefined);
      setSuccess(true);
      
      const uid = user!.uid;
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      
      const userDocSnap = await getDoc(doc(db, "users", uid));
      let role = "owner";
      let userData: any = null;

      if (userDocSnap.exists()) {
        userData = userDocSnap.data();
        role = userData.role || "owner";
      }

      setTimeout(() => {
        if (role === "waiter") {
          navigate("/dashboard/waiter");
        } else if (role === "cook") {
          navigate("/dashboard/profile");
        } else if (role === "manager") {
          navigate("/dashboard");
        } else {
          // Owner
          if (userData?.isPaid) {
            if (userData?.hasCompletedOnboarding) {
              navigate("/dashboard");
            } else {
              navigate("/onboarding");
            }
          } else {
            navigate("/pricing");
          }
        }
      }, 1000);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("wrong-password")) {
        setError("Access Denied: Incorrect password. Please try again.");
      } else if (err.message?.includes("email-already-in-use")) {
        setError("This email address is already registered. Please Sign In instead.");
      } else {
        setError("Authentication failed. Please verify your email and try again.");
      }
      setLoading(false);
    }
  };

  const handlePinLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.length !== 4) {
      setError("Please enter a valid 4-digit PIN.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const user = await signInWithPINCode(pin);
      setSuccess(true);
      
      // Fetch user role from db to determine redirection
      const uid = user.uid;
      const usersRes = await fetch("/api/db/users");
      const users = await usersRes.json();
      const userDoc = users[uid];
      const role = userDoc?.role || "waiter";

      setTimeout(() => {
        if (role === "waiter") {
          navigate("/dashboard/waiter");
        } else if (role === "cook") {
          navigate("/dashboard/profile");
        } else if (role === "manager") {
          navigate("/dashboard");
        } else {
          navigate("/dashboard");
        }
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setError("Access Denied: Invalid passcode PIN. Please try again.");
      setPin("");
      setLoading(false);
    }
  };

  // Keyboard input support for passcode dialpad
  React.useEffect(() => {
    if (loginMethod !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        setPin(prev => prev.length < 4 ? prev + e.key : prev);
      } else if (e.key === "Backspace") {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === "Escape") {
        setPin("");
      } else if (e.key === "Enter") {
        if (pin.length === 4 && !loading) {
          handlePinLogin();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loginMethod, pin, loading]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      setSuccess(true);
      setTimeout(() => {
        navigate("/pricing"); // Google users start with subscription verification
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setError("Google authentication failed.");
      setLoading(false);
    }
  };

  const triggerQuickDemo = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setLoading(true);

    try {
      await signInWithEmail(demoEmail, demoPass);
      setSuccess(true);

      const role = demoEmail.split("@")[0];
      setTimeout(() => {
        if (role === "waiter") {
          navigate("/dashboard/waiter");
        } else if (role === "cook") {
          navigate("/dashboard/profile");
        } else if (role === "manager") {
          navigate("/dashboard");
        } else {
          navigate("/dashboard");
        }
      }, 1000);
    } catch (err) {
      console.error(err);
      setError("Demo authentication failed.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-orange-500/30 selection:text-orange-300 relative overflow-hidden">
      {/* Decorative Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-orange-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center items-center gap-3">
          <div className="bg-gradient-to-tr from-orange-600 to-amber-500 p-2.5 rounded-xl shadow-lg shadow-orange-600/20">
            <ChefHat className="h-7 w-7 text-white" />
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-200">
            CraveCraft <span className="text-orange-500 font-medium text-sm align-super ml-0.5">SaaS OS</span>
          </span>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
          {isSignUp ? "Create your SaaS Account" : "Sign in to your account"}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          {isSignUp 
            ? "Register as a Restaurant Owner and set up your branches" 
            : "Enter credentials or choose a quick-access role dashboard below"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg z-10 px-4 sm:px-0">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-slate-900/80 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl border border-slate-800/80 sm:px-10"
        >
          {!isSignUp && (
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 mb-6">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('email');
                  setError(null);
                }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  loginMethod === 'email'
                    ? "bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-md shadow-orange-600/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Email Credentials
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('pin');
                  setError(null);
                }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  loginMethod === 'pin'
                    ? "bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-md shadow-orange-600/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Quick PIN Sign In
              </button>
            </div>
          )}

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3"
            >
              <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-sm font-medium text-rose-300">{error}</div>
            </motion.div>
          )}

          {success && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3"
            >
              <Key className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-sm font-medium text-emerald-300">
                Credentials verified. Establishing secure connection...
              </div>
            </motion.div>
          )}

          {loginMethod === 'pin' && !isSignUp ? (
            <form onSubmit={handlePinLogin} className="space-y-6">
              <div className="text-center">
                <span className="text-xs font-semibold text-slate-400 block mb-2 uppercase tracking-widest">
                  Enter 4-Digit Passcode
                </span>
                
                {/* PIN Entry Indicators */}
                <div className="flex justify-center gap-4 my-6">
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                        pin.length > index
                          ? "bg-orange-500 border-orange-500 scale-110 shadow-lg shadow-orange-500/30"
                          : "bg-transparent border-slate-700"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Numeric Numpad Dialpad */}
              <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto pb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => pin.length < 4 && setPin(pin + num)}
                    className="h-14 w-14 rounded-full bg-slate-950 border border-slate-850 text-white font-bold text-lg flex items-center justify-center hover:bg-slate-900 active:bg-orange-500/20 active:border-orange-500/50 hover:border-slate-700 transition-all cursor-pointer select-none"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPin("")}
                  className="h-14 w-14 rounded-full bg-slate-950 border border-slate-850 text-slate-400 font-semibold text-xs flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all cursor-pointer select-none"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => pin.length < 4 && setPin(pin + "0")}
                  className="h-14 w-14 rounded-full bg-slate-950 border border-slate-850 text-white font-bold text-lg flex items-center justify-center hover:bg-slate-900 active:bg-orange-500/20 active:border-orange-500/50 hover:border-slate-700 transition-all cursor-pointer select-none"
                >
                  0
                </button>
                <button
                  type="submit"
                  disabled={loading || pin.length !== 4}
                  className="h-14 w-14 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white font-bold text-xs flex items-center justify-center hover:from-orange-500 hover:to-amber-400 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-md shadow-orange-600/10 cursor-pointer select-none"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "OK"
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleEmailLogin}>
              {isSignUp && (
                <div>
                  <label htmlFor="fullName" className="block text-sm font-semibold text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-slate-500" />
                    </div>
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-500" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    placeholder="name@restaurant.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-500" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-orange-500 disabled:opacity-50 transition-all shadow-lg shadow-orange-600/10 cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    <>
                      {isSignUp ? "Create Account" : "Sign In"} <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
              
              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                  }}
                  className="text-xs font-semibold text-slate-400 hover:text-orange-500 transition-colors cursor-pointer"
                >
                  {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Create one"}
                </button>
              </div>
            </form>
          )}

          {/* Social Sign-in Divider */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-y-0 flex items-center w-full">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase font-medium">
                <span className="bg-slate-900 px-3 text-slate-500">Or continue with</span>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-950 border border-slate-800 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-900 hover:border-slate-700 transition-all cursor-pointer"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 5.466 1 0 6.466 0 13.24s5.466 12.24 12.24 12.24c7.07 0 11.782-4.962 11.782-11.962 0-.805-.088-1.423-.198-2.233H12.24z"/>
                </svg>
                Google Authentication
              </button>
            </div>
          </div>

          {/* Staff & Demo Access Center */}
          <div className="mt-8 pt-6 border-t border-slate-850">
            <div className="flex items-center gap-2 text-slate-300 mb-4">
              <Users className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-bold uppercase tracking-wider">Demo / Multi-Role Dashboards</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => triggerQuickDemo("demo.owner@cravecraft.app", "demo123")}
                className="flex flex-col items-start p-3 bg-slate-950 border border-slate-850 hover:border-orange-500/40 rounded-xl transition-all hover:bg-slate-900 text-left group cursor-pointer"
              >
                <span className="text-xs font-semibold text-white group-hover:text-orange-400">Owner Portal</span>
                <span className="text-[10px] text-slate-500 truncate w-full">demo.owner@cravecraft.app</span>
              </button>

              <button
                type="button"
                onClick={() => triggerQuickDemo("manager@cravecraft.app", "manager123")}
                className="flex flex-col items-start p-3 bg-slate-950 border border-slate-850 hover:border-purple-500/40 rounded-xl transition-all hover:bg-slate-900 text-left group cursor-pointer"
              >
                <span className="text-xs font-semibold text-white group-hover:text-purple-400">Manager View</span>
                <span className="text-[10px] text-slate-500 truncate w-full">manager@cravecraft.app</span>
              </button>

              <button
                type="button"
                onClick={() => triggerQuickDemo("cook@cravecraft.app", "cook123")}
                className="flex flex-col items-start p-3 bg-slate-950 border border-slate-850 hover:border-emerald-500/40 rounded-xl transition-all hover:bg-slate-900 text-left group cursor-pointer"
              >
                <span className="text-xs font-semibold text-white group-hover:text-emerald-400">Cook Dashboard</span>
                <span className="text-[10px] text-slate-500 truncate w-full">cook@cravecraft.app</span>
              </button>

              <button
                type="button"
                onClick={() => triggerQuickDemo("waiter@cravecraft.app", "waiter123")}
                className="flex flex-col items-start p-3 bg-slate-950 border border-slate-850 hover:border-blue-500/40 rounded-xl transition-all hover:bg-slate-900 text-left group cursor-pointer"
              >
                <span className="text-xs font-semibold text-white group-hover:text-blue-400">Waiter View</span>
                <span className="text-[10px] text-slate-500 truncate w-full">waiter@cravecraft.app</span>
              </button>
            </div>
            
            <p className="mt-3 text-[10px] text-slate-500 text-center">
              * Choosing any staff role (Manager, Cook, Waiter) automatically registers and maps them to the Owner's live branch for synchronized testing.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
