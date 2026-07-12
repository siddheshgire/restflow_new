// mockFirestoreAlias.ts

class MockDocRef {
  constructor(public path: string) {}
}

class MockCollectionRef {
  constructor(public path: string) {}
}

class MockQuery {
  constructor(public collectionRef: MockCollectionRef, public constraints: any[]) {}
}

export const getFirestore = () => {
  return {};
};

export const doc = (db: any, path: string, ...segments: string[]) => {
  const fullPath = [path, ...segments].filter(Boolean).join("/");
  return new MockDocRef(fullPath);
};

export const collection = (db: any, path: string) => {
  return new MockCollectionRef(path);
};

const getHeaders = (baseHeaders: Record<string, string> = {}) => {
  const token = localStorage.getItem("mock_auth_jwt") || "";
  const selectedOutletId = localStorage.getItem("selectedOutletId") || "";
  
  return {
    "Authorization": token ? `Bearer ${token}` : "",
    "X-Selected-Outlet-ID": selectedOutletId,
    ...baseHeaders
  };
};

// Fetch collection from server
const fetchCollection = async (colName: string): Promise<Record<string, any>> => {
  try {
    const res = await fetch(`/api/db/${colName}`, {
      headers: getHeaders()
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error(`Error fetching collection ${colName}:`, err);
  }
  return {};
};

export const getDoc = async (docRef: MockDocRef) => {
  const parts = docRef.path.split("/");
  const collectionName = parts[0];
  const docId = parts[1];
  
  const colData = await fetchCollection(collectionName);
  const data = colData[docId];
  return {
    exists: () => !!data,
    data: () => data || null,
    id: docId
  };
};

export const setDoc = async (docRef: MockDocRef, data: any) => {
  try {
    await fetch("/api/db/set", {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: docRef.path, data })
    });
  } catch (err) {
    console.error("Error in setDoc:", err);
  }
};

export const updateDoc = async (docRef: MockDocRef, data: any) => {
  try {
    await fetch("/api/db/update", {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: docRef.path, data })
    });
  } catch (err) {
    console.error("Error in updateDoc:", err);
  }
};

export const deleteDoc = async (docRef: MockDocRef) => {
  try {
    await fetch("/api/db/delete", {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: docRef.path })
    });
  } catch (err) {
    console.error("Error in deleteDoc:", err);
  }
};

export const addDoc = async (collectionRef: MockCollectionRef, data: any) => {
  try {
    const res = await fetch("/api/db/add", {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: collectionRef.path, data })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error("Error in addDoc:", err);
  }
  return { id: Math.random().toString(36).substring(2, 15) };
};

export const where = (field: string, op: string, value: any) => {
  return { field, op, value };
};

export const query = (collectionRef: MockCollectionRef, ...constraints: any[]) => {
  return new MockQuery(collectionRef, constraints);
};

const executeQuery = (colData: Record<string, any>, queryRef: MockQuery | MockCollectionRef) => {
  const constraints = queryRef instanceof MockQuery ? queryRef.constraints : [];
  
  let results = Object.entries(colData).map(([id, data]) => ({
    id,
    ...(data as any)
  }));
  
  for (const c of constraints) {
    if (c && c.field) {
      results = results.filter(item => {
        const val = item[c.field];
        if (c.op === "==") return val === c.value;
        if (c.op === ">=") return val >= c.value;
        if (c.op === "<=") return val <= c.value;
        if (c.op === "in") return Array.isArray(c.value) && c.value.includes(val);
        return true;
      });
    }
  }
  return results;
};

export const getDocs = async (queryRef: MockQuery | MockCollectionRef) => {
  const collectionName = queryRef instanceof MockQuery ? queryRef.collectionRef.path : queryRef.path;
  const colData = await fetchCollection(collectionName);
  const results = executeQuery(colData, queryRef);
  const docs = results.map(item => ({
    id: item.id,
    data: () => {
      const { id, ...data } = item;
      return data;
    }
  }));
  return {
    empty: results.length === 0,
    docs,
    forEach(callback: (doc: any, index: number) => void) {
      docs.forEach(callback);
    }
  };
};

// Global EventSource client singleton scoped to selectedOutletId
let sseConnection: EventSource | null = null;
let currentSseOutletId = "";
const sseListeners = new Set<() => void>();

const getSSEConnection = () => {
  const selectedOutletId = localStorage.getItem("selectedOutletId") || "global";
  
  if (sseConnection && currentSseOutletId !== selectedOutletId) {
    sseConnection.close();
    sseConnection = null;
  }
  
  if (!sseConnection) {
    currentSseOutletId = selectedOutletId;
    sseConnection = new EventSource(`/api/live-updates?outletId=${selectedOutletId}`);
    sseConnection.onmessage = (event) => {
      if (event.data === "update") {
        sseListeners.forEach(listener => listener());
      }
    };
    sseConnection.onerror = () => {
      console.warn("SSE connection error, attempting reconnect...");
    };
  }
  return sseConnection;
};

export const onSnapshot = (ref: MockQuery | MockCollectionRef | MockDocRef, callback: (snapshot: any) => void) => {
  if (ref instanceof MockDocRef) {
    const parts = ref.path.split("/");
    const collectionName = parts[0];
    const docId = parts[1];

    const updateCallback = async () => {
      const colData = await fetchCollection(collectionName);
      const data = colData[docId];
      callback({
        exists: () => !!data,
        data: () => data || null,
        id: docId
      });
    };

    getSSEConnection();
    sseListeners.add(updateCallback);
    updateCallback();

    return () => {
      sseListeners.delete(updateCallback);
    };
  } else {
    const collectionName = ref instanceof MockQuery ? ref.collectionRef.path : ref.path;
    
    const updateCallback = async () => {
      const colData = await fetchCollection(collectionName);
      const results = executeQuery(colData, ref);
      const docs = results.map(item => ({
        id: item.id,
        data: () => {
          const { id, ...data } = item;
          return data;
        }
      }));
      callback({
        empty: results.length === 0,
        docs,
        forEach(cb: (doc: any, index: number) => void) {
          docs.forEach(cb);
        }
      } as any);
    };

    getSSEConnection();
    sseListeners.add(updateCallback);
    updateCallback();

    return () => {
      sseListeners.delete(updateCallback);
    };
  }
};
