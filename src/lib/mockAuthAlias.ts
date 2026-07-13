// mockAuthAlias.ts

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

const mockAuthObj = {
  currentUser: null as User | null
};

// Cryptographic hash function using native Web Crypto API (SHA-256)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export const getAuth = () => {
  const storedUser = localStorage.getItem("mock_auth_user");
  mockAuthObj.currentUser = storedUser ? JSON.parse(storedUser) : null;
  return mockAuthObj;
};

const authListeners: Array<(user: User | null) => void> = [];

const notifyAuthListeners = (user: User | null) => {
  mockAuthObj.currentUser = user;
  for (const listener of authListeners) {
    listener(user);
  }
};

export const onAuthStateChanged = (auth: any, callback: (user: User | null) => void) => {
  authListeners.push(callback);
  const storedUser = localStorage.getItem("mock_auth_user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  callback(user);
  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx !== -1) authListeners.splice(idx, 1);
  };
};

export const signInAnonymously = async (auth: any) => {
  const uid = "mock-demo-owner-uid";
  const user = {
    uid,
    email: "demo.owner@cravecraft.app",
    displayName: "Demo Owner"
  };
  localStorage.setItem("mock_auth_user", JSON.stringify(user));
  
  try {
    const passHash = await hashPassword("demo123");
    // Create/set owner document in backend database
    await fetch("/api/db/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: `users/${uid}`,
        data: {
          email: "demo.owner@cravecraft.app",
          role: "owner",
          isPaid: true,
          hasCompletedOnboarding: true,
          passwordHash: passHash,
          createdAt: Date.now()
        }
      })
    });
  } catch (err) {
    console.error("Error setting mock user doc:", err);
  }

  notifyAuthListeners(user);
  return { user };
};

export const signInWithPopup = async (auth: any, provider: any) => {
  const uid = "mock-google-user-uid";
  const user = {
    uid,
    email: "google.user@example.com",
    displayName: "Google User"
  };
  localStorage.setItem("mock_auth_user", JSON.stringify(user));
  notifyAuthListeners(user);
  return { user };
};

const logSecurityEvent = async (type: string, email: string, role: string, outletId: string, message: string) => {
  try {
    await fetch("/api/db/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "audit_logs",
        data: {
          type,
          email,
          role,
          outletId,
          message,
          createdAt: Date.now()
        }
      })
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
};

export const signInWithEmailAndPassword = async (auth: any, email: string, password: string, displayName?: string) => {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }
  
  const cleanEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  let uid = "user-" + cleanEmail.replace(/[^a-z0-9]/g, "-");

  if (cleanEmail === "demo.owner@cravecraft.app") {
    uid = "mock-demo-owner-uid";
  } else if (cleanEmail === "google.user@example.com") {
    uid = "mock-google-user-uid";
  }

  // Auto-resolve Demo Owner's active outlet ID to synchronize Cook/Waiter/Manager demos
  let demoOutletId = "";
  if (["manager@cravecraft.app", "waiter@cravecraft.app", "cook@cravecraft.app"].includes(cleanEmail)) {
    try {
      const restRes = await fetch("/api/db/restaurants");
      const restaurants = await restRes.json();
      const demoRestEntry = Object.entries(restaurants).find(([_, r]: [string, any]) => r.ownerId === "mock-demo-owner-uid");
      if (demoRestEntry) {
        const outletsRes = await fetch("/api/db/outlets");
        const outlets = await outletsRes.json();
        const demoOutletEntry = Object.entries(outlets).find(([_, o]: [string, any]) => o.restaurantId === demoRestEntry[0]);
        if (demoOutletEntry) {
          demoOutletId = demoOutletEntry[0];
        }
      }
    } catch (err) {
      console.error("Failed to lookup demo owner outlet:", err);
    }
  }

  // Auto-provision demo staff accounts dynamically to mapping outlet
  if (["manager@cravecraft.app", "waiter@cravecraft.app", "cook@cravecraft.app"].includes(cleanEmail)) {
    try {
      const empRes = await fetch("/api/db/employees");
      const employees = await empRes.json();
      const empDocEntry = Object.entries(employees).find(([_, e]: [string, any]) => e.email?.toLowerCase() === cleanEmail);

      if (!empDocEntry) {
        // Resolve outlet to assign them
        let outletId = demoOutletId;
        if (!outletId) {
          const outletsRes = await fetch("/api/db/outlets");
          const outlets = await outletsRes.json();
          outletId = Object.keys(outlets)[0] || "demo-outlet-id";
        }
        
        const role = cleanEmail.split("@")[0] as "manager" | "waiter" | "cook";
        const name = role.charAt(0).toUpperCase() + role.slice(1) + " Demo";
        const pin = role === "manager" ? "1111" : role === "cook" ? "2222" : "3333";
        const activationCode = role === "manager" ? "MNG111" : role === "cook" ? "COK222" : "WTR333";

        await fetch("/api/db/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "employees",
            data: {
              outletId,
              name,
              email: cleanEmail,
              role,
              salary: 35000,
              pin,
              activationCode
            }
          })
        });
      } else {
        // If employee exists but has a mismatched outletId, heal it
        const [empId, empData]: [string, any] = empDocEntry;
        if (demoOutletId && empData.outletId !== demoOutletId) {
          await fetch("/api/db/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: `employees/${empId}`,
              data: { outletId: demoOutletId }
            })
          });
        }
      }
    } catch (err) {
      console.error("Failed to auto-provision demo staff employee:", err);
    }
  }

  // Fetch users collection
  const usersRes = await fetch("/api/db/users");
  const users = await usersRes.json();
  const userDoc = users[uid];

  if (userDoc) {
    if (displayName && userDoc.passwordHash) {
      throw new Error("auth/email-already-in-use");
    }
    // User doc exists - verify password hash
    if (userDoc.passwordHash && userDoc.passwordHash !== passwordHash) {
      await logSecurityEvent("login_failed", cleanEmail, userDoc.role, userDoc.outletId || "", `Failed login attempt for ${cleanEmail} (wrong password).`);
      throw new Error("auth/wrong-password");
    }
    
    // Auto-update missing password hash, heal mismatched outletId or sync role modifications
    const updates: any = {};
    if (!userDoc.passwordHash) {
      updates.passwordHash = passwordHash;
    }
    if (demoOutletId && userDoc.outletId !== demoOutletId) {
      updates.outletId = demoOutletId;
      userDoc.outletId = demoOutletId;
    }
    
    // Ensure Demo Owner always has access
    if (uid === "mock-demo-owner-uid" && (!userDoc.isPaid || !userDoc.hasCompletedOnboarding)) {
      updates.isPaid = true;
      updates.hasCompletedOnboarding = true;
      userDoc.isPaid = true;
      userDoc.hasCompletedOnboarding = true;
    }

    // Sync role from employees collection
    try {
      const empRes = await fetch("/api/db/employees");
      const employees = await empRes.json();
      const empDocEntry = Object.entries(employees).find(([_, emp]: [string, any]) => emp.email?.toLowerCase() === cleanEmail);
      if (empDocEntry) {
        const [_, empData]: [string, any] = empDocEntry;
        if (userDoc.role !== empData.role) {
          updates.role = empData.role;
          userDoc.role = empData.role;
        }
      }
    } catch (err) {
      console.error("Failed to sync employee role on login:", err);
    }

    if (Object.keys(updates).length > 0) {
      try {
        await fetch("/api/db/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: `users/${uid}`,
            data: updates
          })
        });
      } catch (err) {
        console.error("Failed to update user doc updates:", err);
      }
    }

    const user = {
      uid,
      email: userDoc.email,
      displayName: userDoc.displayName || cleanEmail.split("@")[0]
    };
    localStorage.setItem("mock_auth_user", JSON.stringify(user));
    notifyAuthListeners(user);
    await logSecurityEvent("login_success", cleanEmail, userDoc.role, userDoc.outletId || "", `${user.displayName} signed in via Email.`);
    return { user };
  }

  // If user doesn't exist in users, check if they are an invited employee
  const empRes = await fetch("/api/db/employees");
  const employees = await empRes.json();
  const empDocEntry = Object.entries(employees).find(([_, emp]: [string, any]) => emp.email?.toLowerCase() === cleanEmail);

  if (empDocEntry) {
    const [_, empData]: [string, any] = empDocEntry;
    // Provision new user record using employee's details
    const newUserData = {
      email: cleanEmail,
      role: empData.role,
      outletId: demoOutletId || empData.outletId,
      isPaid: true, // Owner paid for the SaaS subscription
      hasCompletedOnboarding: true,
      passwordHash,
      displayName: empData.name,
      createdAt: Date.now()
    };

    await fetch("/api/db/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: `users/${uid}`,
        data: newUserData
      })
    });

    const user = {
      uid,
      email: cleanEmail,
      displayName: empData.name
    };
    localStorage.setItem("mock_auth_user", JSON.stringify(user));
    notifyAuthListeners(user);
    await logSecurityEvent("login_success", cleanEmail, empData.role, empData.outletId, `${empData.name} registered and signed in.`);
    return { user };
  }

  // Brand new owner sign-up
  const isDemoAccount = [
    "demo.owner@cravecraft.app",
    "manager@cravecraft.app",
    "waiter@cravecraft.app",
    "cook@cravecraft.app"
  ].includes(cleanEmail);

  const newUserData = {
    email: cleanEmail,
    role: "owner",
    isPaid: isDemoAccount ? true : false,
    hasCompletedOnboarding: isDemoAccount ? true : false,
    passwordHash,
    displayName: displayName || cleanEmail.split("@")[0],
    createdAt: Date.now()
  };

  await fetch("/api/db/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: `users/${uid}`,
      data: newUserData
    })
  });

  const user = {
    uid,
    email: cleanEmail,
    displayName: displayName || cleanEmail.split("@")[0]
  };
  localStorage.setItem("mock_auth_user", JSON.stringify(user));
  notifyAuthListeners(user);
  await logSecurityEvent("login_success", cleanEmail, "owner", "", `New Owner ${user.displayName} registered and signed in.`);
  return { user };
};

export const signInWithPIN = async (auth: any, pin: string) => {
  if (!pin) {
    throw new Error("PIN is required.");
  }
  
  const empRes = await fetch("/api/db/employees");
  const employees = await empRes.json();
  const empDocEntry = Object.entries(employees).find(([_, emp]: [string, any]) => emp.pin === pin);
  
  if (!empDocEntry) {
    await logSecurityEvent("login_failed", "unknown-pin", "unknown", "", `Failed PIN login attempt: Invalid PIN code entered.`);
    throw new Error("auth/wrong-pin");
  }
  
  const [_, empData]: [string, any] = empDocEntry;
  const uid = "user-" + empData.email.toLowerCase().replace(/[^a-z0-9]/g, "-");
  
  const usersRes = await fetch("/api/db/users");
  const users = await usersRes.json();
  let userDoc = users[uid];
  
  if (!userDoc) {
    userDoc = {
      email: empData.email,
      role: empData.role,
      outletId: empData.outletId,
      isPaid: true,
      hasCompletedOnboarding: true,
      displayName: empData.name,
      createdAt: Date.now()
    };
    await fetch("/api/db/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: `users/${uid}`,
        data: userDoc
      })
    });
  } else if (userDoc.role !== empData.role) {
    userDoc.role = empData.role;
    await fetch("/api/db/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: `users/${uid}`,
        data: { role: empData.role }
      })
    });
  }
  
  const user = {
    uid,
    email: empData.email,
    displayName: empData.name
  };
  localStorage.setItem("mock_auth_user", JSON.stringify(user));
  notifyAuthListeners(user);
  await logSecurityEvent("login_success", empData.email, empData.role, empData.outletId, `${empData.name} signed in via PIN.`);
  return { user };
};

export const signOut = async (auth: any) => {
  localStorage.removeItem("mock_auth_user");
  notifyAuthListeners(null);
};

export const updateUserPassword = async (email: string, oldPassword: string, newPassword: string) => {
  if (!email || !oldPassword || !newPassword) {
    throw new Error("All fields are required.");
  }
  
  const cleanEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(oldPassword);
  let uid = "user-" + cleanEmail.replace(/[^a-z0-9]/g, "-");
  if (cleanEmail === "demo.owner@cravecraft.app") {
    uid = "mock-demo-owner-uid";
  }
  
  const usersRes = await fetch("/api/db/users");
  const users = await usersRes.json();
  const userDoc = users[uid];
  
  if (!userDoc) {
    throw new Error("User record not found.");
  }
  
  if (userDoc.passwordHash && userDoc.passwordHash !== passwordHash) {
    throw new Error("Incorrect current password.");
  }
  
  const newHash = await hashPassword(newPassword);
  
  await fetch("/api/db/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: `users/${uid}`,
      data: { passwordHash: newHash }
    })
  });
  
  await logSecurityEvent("password_changed", cleanEmail, userDoc.role, userDoc.outletId || "", `${userDoc.displayName || cleanEmail.split("@")[0]} successfully changed their account password.`);
};

export class GoogleAuthProvider {
  constructor() {}
}

