// mockAuthAlias.ts

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

const mockAuthObj = {
  currentUser: null as User | null
};

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
  // Demo Owner Login via Registration API
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "demo.owner@cravecraft.app", password: "demo123" })
    });
    
    if (!res.ok) {
      throw new Error("Demo credentials validation failed on server.");
    }
    
    const data = await res.json();
    localStorage.setItem("mock_auth_user", JSON.stringify(data.user));
    localStorage.setItem("mock_auth_jwt", data.token);
    notifyAuthListeners(data.user);
    return { user: data.user };
  } catch (err) {
    console.error("Demo login failed:", err);
    throw err;
  }
};

export const signInWithPopup = async (auth: any, provider: any) => {
  // Mock Google sign in
  const uid = "mock-google-user-uid";
  const user = {
    uid,
    email: "google.user@example.com",
    displayName: "Google User"
  };
  
  // Register or login Google user on the server
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "googleAuthPassword123", displayName: user.displayName })
    });
    const data = await res.json();
    const token = data.token || "mock-google-jwt-token";
    localStorage.setItem("mock_auth_user", JSON.stringify(user));
    localStorage.setItem("mock_auth_jwt", token);
  } catch (e) {
    localStorage.setItem("mock_auth_user", JSON.stringify(user));
  }
  
  notifyAuthListeners(user);
  return { user };
};

export const signInWithEmailAndPassword = async (auth: any, email: string, password: string, displayName?: string) => {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }
  
  const cleanEmail = email.trim().toLowerCase();
  
  // If displayName is supplied, it is a sign-up action
  const url = displayName ? "/api/auth/register" : "/api/auth/login";
  const payload = displayName 
    ? { email: cleanEmail, password, displayName }
    : { email: cleanEmail, password };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Authentication failed.");
  }

  const data = await res.json();
  localStorage.setItem("mock_auth_user", JSON.stringify(data.user));
  localStorage.setItem("mock_auth_jwt", data.token);
  
  notifyAuthListeners(data.user);
  return { user: data.user };
};

export const signInWithPIN = async (auth: any, pin: string) => {
  if (!pin) {
    throw new Error("PIN is required.");
  }
  
  const res = await fetch("/api/auth/pin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Invalid PIN code.");
  }

  const data = await res.json();
  localStorage.setItem("mock_auth_user", JSON.stringify(data.user));
  localStorage.setItem("mock_auth_jwt", data.token);
  
  notifyAuthListeners(data.user);
  return { user: data.user };
};

export const signOut = async (auth: any) => {
  localStorage.removeItem("mock_auth_user");
  localStorage.removeItem("mock_auth_jwt");
  localStorage.removeItem("selectedOutletId");
  notifyAuthListeners(null);
};

export const updateUserPassword = async (email: string, oldPassword: string, newPassword: string) => {
  const token = localStorage.getItem("mock_auth_jwt") || "";
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ oldPassword, newPassword })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Password change failed.");
  }
};

export class GoogleAuthProvider {
  constructor() {}
}
