import { createContext, useContext, useEffect, useState, ReactNode } from "react";
// @ts-ignore
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut, signInWithEmailAndPassword, signInWithPIN } from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

interface AuthContextType {
  user: User | null;
  role: 'owner' | 'manager' | 'waiter' | 'cook' | null;
  loading: boolean;
  signInWithGoogle: () => Promise<User | null>;
  signInAsDemoOwner: () => Promise<User | null>;
  signInWithEmail: (email: string, password: string, displayName?: string) => Promise<User | null>;
  signInWithPINCode: (pin: string) => Promise<User | null>;
  logout: () => Promise<void>;
  changePassword: (oldPass: string, newPass: string) => Promise<void>;
  isPaid: boolean;
  hasCompletedOnboarding: boolean;
  checkOnboardingStatus: () => Promise<void>;
  outlets: Array<{ id: string; name: string; location: string; restaurantId: string }>;
  selectedOutletId: string;
  setSelectedOutletId: (id: string) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  signInWithGoogle: async () => null,
  signInAsDemoOwner: async () => null,
  signInWithEmail: async () => null,
  signInWithPINCode: async () => null,
  logout: async () => {},
  changePassword: async () => {},
  isPaid: false,
  hasCompletedOnboarding: false,
  checkOnboardingStatus: async () => {},
  outlets: [],
  selectedOutletId: "",
  setSelectedOutletId: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'owner' | 'manager' | 'waiter' | 'cook' | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [outlets, setOutlets] = useState<Array<{ id: string; name: string; location: string; restaurantId: string }>>([]);
  const [selectedOutletId, setSelectedOutletIdState] = useState<string>(() => {
    return localStorage.getItem("selectedOutletId") || "";
  });

  const setSelectedOutletId = (id: string) => {
    setSelectedOutletIdState(id);
    localStorage.setItem("selectedOutletId", id);
  };

  const loadOutletInfo = async (uid: string, currentRole: string, email: string | null) => {
    try {
      if (currentRole === 'owner') {
        // Fallback to ownerId directly for backward compatibility with older DB structures
        const outletQuery = query(
          collection(db, "outlets"),
          where("ownerId", "==", uid)
        );
        const outletSnap = await getDocs(outletQuery);
        let fetchedOutlets = outletSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Array<{ id: string; name: string; location: string; restaurantId: string }>;

        // If no outlets found by ownerId, try the restaurantId relationship (new structure)
        if (fetchedOutlets.length === 0) {
          const restQuery = query(
            collection(db, "restaurants"),
            where("ownerId", "==", uid)
          );
          const restSnap = await getDocs(restQuery);
          const restaurantIds = restSnap.docs.map(d => d.id);
          
          if (restaurantIds.length > 0) {
            const nestedOutletQuery = query(
              collection(db, "outlets"),
              where("restaurantId", "in", restaurantIds)
            );
            const nestedSnap = await getDocs(nestedOutletQuery);
            fetchedOutlets = nestedSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
            })) as Array<{ id: string; name: string; location: string; restaurantId: string }>;
          }
        }
          
        setOutlets(fetchedOutlets);
          
          if (fetchedOutlets.length > 0) {
            const storedOutletId = localStorage.getItem("selectedOutletId");
            const isValidStored = fetchedOutlets.some(o => o.id === storedOutletId);
            if (storedOutletId && isValidStored) {
              setSelectedOutletIdState(storedOutletId);
            } else {
              setSelectedOutletIdState(""); // Leave empty to force selection screen
            }
          } else {
            setSelectedOutletIdState("");
          }
      } else {
        // For employee roles, fetch the user record to get outletId
        const userDocRef = doc(db, "users", uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const lockedOutletId = userData.outletId || "";
          setSelectedOutletIdState(lockedOutletId);
          
          if (lockedOutletId) {
            const outletRef = doc(db, "outlets", lockedOutletId);
            const outletSnap = await getDoc(outletRef);
            if (outletSnap.exists()) {
              setOutlets([{
                id: outletSnap.id,
                ...outletSnap.data()
              } as any]);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error loading outlet info:", err);
    }
  };

  const checkOnboardingStatus = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const currentRole = data.role || 'owner';
          setRole(currentRole);
          setIsPaid(data.isPaid || false);
          setHasCompletedOnboarding(data.hasCompletedOnboarding || false);
          await loadOutletInfo(currentUser.uid, currentRole, currentUser.email);
        }
      } catch (err) {
        console.error("Error checking onboarding status:", err);
      }
    }
  };

  useEffect(() => {
    let userDocUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
        userDocUnsubscribe = null;
      }

      if (currentUser) {
        setLoading(true); // Fix race condition: prevent router from navigating before user data loads
      }
      
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, "users", currentUser.uid);
          let docSnap = await getDoc(docRef);
          
          let localSessionToken = localStorage.getItem("active_session_token");
          if (!localSessionToken) {
            localSessionToken = Math.random().toString(36).substring(2) + Date.now();
            localStorage.setItem("active_session_token", localSessionToken);
          }

          if (!docSnap.exists()) {
            // Check if this user's email is invited as an employee
            const empQuery = query(
              collection(db, "employees"),
              where("email", "==", currentUser.email)
            );
            const empSnap = await getDocs(empQuery);
            
            if (!empSnap.empty) {
              const empData = empSnap.docs[0].data();
              const employeeRole = empData.role;
              const employeeOutletId = empData.outletId;
              
              await setDoc(docRef, {
                email: currentUser.email,
                role: employeeRole,
                outletId: employeeOutletId,
                isPaid: true, // owner paid
                hasCompletedOnboarding: true,
                createdAt: Date.now(),
                currentSessionToken: localSessionToken
              });
              docSnap = await getDoc(docRef);
            } else {
              // Initialize as basic owner
              await setDoc(docRef, {
                email: currentUser.email,
                role: 'owner',
                isPaid: false,
                hasCompletedOnboarding: false,
                createdAt: Date.now(),
                currentSessionToken: localSessionToken
              });
              docSnap = await getDoc(docRef);
            }
          } else {
            // Update token in DB on new session initiation
            await updateDoc(docRef, {
              currentSessionToken: localSessionToken
            });
          }
          
          const userData = docSnap.data();
          if (userData) {
            const currentRole = userData.role || 'owner';
            setRole(currentRole);
            setIsPaid(userData.isPaid || false);
            setHasCompletedOnboarding(userData.hasCompletedOnboarding || false);
            await loadOutletInfo(currentUser.uid, currentRole, currentUser.email);
          }

          // Subscribe to real-time changes of current user document
          userDocUnsubscribe = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              
              // LIVE UPDATE: Role changes reflect instantly without refresh
              if (data.role && data.role !== role) {
                setRole(data.role);
              }
              
              if (data.isPaid !== undefined) {
                setIsPaid(data.isPaid);
              }

              if (data.hasCompletedOnboarding !== undefined) {
                setHasCompletedOnboarding(data.hasCompletedOnboarding);
              }

              const dbSessionToken = data.currentSessionToken;
              const curLocalSessionToken = localStorage.getItem("active_session_token");
              if (dbSessionToken && curLocalSessionToken && dbSessionToken !== curLocalSessionToken) {
                if (userDocUnsubscribe) {
                  userDocUnsubscribe();
                  userDocUnsubscribe = null;
                }
                signOut(auth).then(() => {
                  localStorage.removeItem("active_session_token");
                  alert("Access Blocked: You have been logged out because this account was logged in from another device/browser.");
                  window.location.href = "/login";
                });
              }
            }
          });
        } catch (err) {
          console.error("Error fetching user data on auth state change:", err);
          setRole('owner');
        }
      } else {
        setRole(null);
        setIsPaid(false);
        setHasCompletedOnboarding(false);
        setOutlets([]);
        setSelectedOutletIdState("");
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
      }
    };
  }, []);

  const signInAsDemoOwner = async () => {
    try {
      const { signInAnonymously } = await import("firebase/auth");
      const result = await signInAnonymously(auth);
      
      const docRef = doc(db, "users", result.user.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, {
          email: "demo.owner@cravecraft.app",
          role: 'owner',
          isPaid: false,
          hasCompletedOnboarding: false,
          createdAt: Date.now()
        });
      }
      return result.user;
    } catch (err) {
      console.error("Demo login failed:", err);
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  };

  const signInWithEmail = async (email: string, password: string, displayName?: string) => {
    try {
      const result = await (signInWithEmailAndPassword as any)(auth, email, password, displayName);
      // Wait for local state trigger or check status manually
      await checkOnboardingStatus();
      return result.user;
    } catch (err) {
      console.error("Email login failed:", err);
      throw err;
    }
  };

  const signInWithPINCode = async (pin: string) => {
    try {
      const result = await (signInWithPIN as any)(auth, pin);
      await checkOnboardingStatus();
      return result.user;
    } catch (err) {
      console.error("PIN login failed:", err);
      throw err;
    }
  };

  const logout = async () => {
    localStorage.removeItem("active_session_token");
    localStorage.removeItem("selectedOutletId");
    await signOut(auth);
  };

  const changePassword = async (oldPass: string, newPass: string) => {
    if (!user?.email) throw new Error("No active user session.");
    const { updateUserPassword } = await import("../lib/mockAuthAlias");
    await updateUserPassword(user.email, oldPass, newPass);
  };

  return (
    <AuthContext.Provider value={{
      user,
      role,
      loading,
      signInWithGoogle,
      signInAsDemoOwner,
      signInWithEmail,
      signInWithPINCode,
      logout,
      changePassword,
      isPaid,
      hasCompletedOnboarding,
      checkOnboardingStatus,
      outlets,
      selectedOutletId,
      setSelectedOutletId
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
