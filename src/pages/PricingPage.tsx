import { useState, useEffect } from "react";
import { Navbar } from "../components/layout/Navbar";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export function PricingPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, signInWithGoogle, signInAsDemoOwner, isPaid, hasCompletedOnboarding, checkOnboardingStatus } = useAuth();

  // Redirect loop trap removed to prevent browser back button blockages

  const handleSubscribe = async (useDemo: boolean = false) => {
    setLoading(true);
    try {
      let currentUser = user;
      if (!currentUser) {
        try {
           if (useDemo) {
             currentUser = await signInAsDemoOwner();
           } else {
             currentUser = await signInWithGoogle();
           }
        } catch (authErr: any) {
           console.error("Auth error:", authErr);
           alert(`Authentication failed: ${authErr.message || authErr}\n\nIf you are using Demo Mode, please verify that Anonymous Sign-in is enabled in your Firebase Console Authentication settings.`);
           setLoading(false);
           return;
        }
      }
      
      if (currentUser) {
         // Simulated payment step - in real life this happens after payment succeeds
         await updateDoc(doc(db, "users", currentUser.uid), {
           isPaid: true
         });
         await checkOnboardingStatus();
         // navigate happens via useEffect or we can force it here
         if (!hasCompletedOnboarding) {
            navigate('/onboarding');
         } else {
            navigate('/dashboard');
         }
      }
      
    } catch (e) {
      console.error("Subscription error:", e);
      alert("An error occurred during subscription. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      <Navbar />
      <div className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-base/7 font-semibold text-orange-600">Pricing</h2>
            <p className="mt-2 text-balance text-5xl font-bold tracking-tight text-zinc-900 sm:text-6xl">
              Simple, transparent pricing
            </p>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-center text-lg font-medium text-zinc-600 sm:text-xl/8">
            One flat subscription for unlimited outlets, tables, and staff members.
          </p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-16 max-w-2xl rounded-3xl ring-1 ring-zinc-200 lg:mx-0 lg:flex lg:max-w-none bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="p-8 sm:p-10 lg:flex-auto">
              <h3 className="text-3xl font-bold tracking-tight text-zinc-900">Pro License</h3>
              <p className="mt-6 text-base/7 text-zinc-600">
                Get full access to the QR ordering system, live kitchen displays, detailed revenue analytics, and inventory management templates.
              </p>
              <div className="mt-10 flex items-center gap-x-4">
                <h4 className="flex-none text-sm font-semibold text-orange-600">What’s included</h4>
                <div className="h-px flex-auto bg-zinc-100" />
              </div>
              <ul className="mt-8 grid grid-cols-1 gap-4 text-sm/6 text-zinc-600 sm:grid-cols-2 sm:gap-6">
                {['Unlimited Outlets', 'QR Code generation for tables', 'Live Kitchen Display (KDS)', 'Real-time table turnover tracking', 'Staff performance metrics', 'Customizable Digital Menu'].map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <Check aria-hidden="true" className="h-6 w-5 flex-none text-orange-600" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="-mt-2 p-2 lg:mt-0 lg:w-full lg:max-w-md lg:shrink-0">
              <div className="rounded-2xl bg-zinc-50 py-10 text-center ring-1 ring-inset ring-zinc-900/5 lg:flex lg:flex-col lg:justify-center lg:py-16 h-full">
                <div className="mx-auto max-w-xs px-8">
                  <p className="text-base font-semibold text-zinc-600">Pay monthly, cancel anytime</p>
                  <p className="mt-6 flex items-baseline justify-center gap-x-2">
                    <span className="text-5xl font-bold tracking-tight text-zinc-900">$49</span>
                    <span className="text-sm font-semibold text-zinc-600">/m</span>
                  </p>
                  {isPaid ? (
                    <button
                      onClick={() => navigate(hasCompletedOnboarding ? '/dashboard' : '/onboarding')}
                      className="mt-10 block w-full rounded-md bg-zinc-900 px-3 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      Go to Dashboard (Active License)
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSubscribe(false)}
                        disabled={loading}
                        className="mt-10 block w-full rounded-md bg-orange-600 px-3 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {loading ? 'Processing...' : 'Subscribe'}
                      </button>
                      <button
                        onClick={() => handleSubscribe(true)}
                        disabled={loading}
                        className="mt-3 block w-full rounded-md bg-white border border-zinc-200 px-3 py-3 text-center text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        Try Demo (No Account Needed)
                      </button>
                    </>
                  )}
                  <p className="mt-6 text-xs/5 text-zinc-600">
                    Invoices and receipts available for easy company reimbursement.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
