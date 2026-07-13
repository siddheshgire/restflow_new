import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Razorpay from "razorpay";
import fs from "fs/promises";
import { DatabaseSync } from "node:sqlite";

const dbPath = path.join(process.cwd(), "db.sqlite");
const sqliteDb = new DatabaseSync(dbPath);

let dbCache: Record<string, Record<string, any>> = {};
let dbLoaded = false;

async function ensureDBLoaded(): Promise<Record<string, Record<string, any>>> {
  if (dbLoaded) return dbCache;
  try {
    // Verify schema tables & indexes are present
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS document_store (
        collection_name TEXT,
        doc_id TEXT,
        data TEXT,
        PRIMARY KEY (collection_name, doc_id)
      );
      CREATE INDEX IF NOT EXISTS idx_collection ON document_store (collection_name);
    `);

    // Fetch all documents from SQLite
    const query = sqliteDb.prepare("SELECT collection_name, doc_id, data FROM document_store");
    const rows = query.all() as Array<{ collection_name: string, doc_id: string, data: string }>;
    
    dbCache = {};
    for (const row of rows) {
      if (!dbCache[row.collection_name]) {
        dbCache[row.collection_name] = {};
      }
      try {
        dbCache[row.collection_name][row.doc_id] = JSON.parse(row.data);
      } catch (e) {
        console.error("Failed to parse document data in SQLite:", row.data);
      }
    }
  } catch (err: any) {
    console.error("Critical error reading SQLite database:", err);
    throw err;
  }
  dbLoaded = true;
  return dbCache;
}

// Incremental SQLite persistence helper
function persistDoc(colName: string, docId: string, data: any | null) {
  try {
    if (data === null) {
      const deleteStmt = sqliteDb.prepare("DELETE FROM document_store WHERE collection_name = ? AND doc_id = ?");
      deleteStmt.run(colName, docId);
    } else {
      const insertStmt = sqliteDb.prepare("INSERT OR REPLACE INTO document_store (collection_name, doc_id, data) VALUES (?, ?, ?)");
      insertStmt.run(colName, docId, JSON.stringify(data));
    }
  } catch (err) {
    console.error("Failed to persist document to SQLite:", err);
  }
}

// Tenant Data Filtering Logic
function filterTenantData(
  colName: string,
  colData: Record<string, any>,
  outletId: string,
  userUid: string
): Record<string, any> {
  if (!userUid) {
    if (outletId) {
      if (colName === "menu_items" || colName === "inventory") {
        const filtered: Record<string, any> = {};
        Object.entries(colData).forEach(([id, item]) => {
          if (item.outletId === outletId) filtered[id] = item;
        });
        return filtered;
      }
      if (colName === "outlets") {
        return colData[outletId] ? { [outletId]: colData[outletId] } : {};
      }
      if (colName === "orders") {
        const filtered: Record<string, any> = {};
        Object.entries(colData).forEach(([id, item]) => {
          if (item.outletId === outletId) filtered[id] = item;
        });
        return filtered;
      }
    }
    if (["users", "employees", "restaurants", "outlets"].includes(colName)) {
      return colData;
    }
    return {};
  }

  const user = dbCache.users?.[userUid];
  const userRole = user?.role || "waiter";

  if (userRole === "owner") {
    const ownedRestaurantIds = Object.entries(dbCache.restaurants || {})
      .filter(([_, r]: [string, any]) => r.ownerId === userUid)
      .map(([id]) => id);

    const ownedOutletIds = Object.entries(dbCache.outlets || {})
      .filter(([_, o]: [string, any]) => ownedRestaurantIds.includes(o.restaurantId))
      .map(([id]) => id);

    if (colName === "restaurants") {
      const filtered: Record<string, any> = {};
      Object.entries(colData).forEach(([id, r]) => {
        if (r.ownerId === userUid) filtered[id] = r;
      });
      return filtered;
    }
    if (colName === "outlets") {
      const filtered: Record<string, any> = {};
      Object.entries(colData).forEach(([id, o]) => {
        if (ownedRestaurantIds.includes(o.restaurantId)) filtered[id] = o;
      });
      return filtered;
    }
    if (colName === "users") {
      const filtered: Record<string, any> = {};
      Object.entries(colData).forEach(([id, u]) => {
        if (id === userUid || ownedOutletIds.includes(u.outletId)) filtered[id] = u;
      });
      return filtered;
    }
    
    const tenantCols = ["orders", "employees", "inventory", "audit_logs", "menu_items", "attendance"];
    if (tenantCols.includes(colName)) {
      const filtered: Record<string, any> = {};
      Object.entries(colData).forEach(([id, item]) => {
        if (ownedOutletIds.includes(item.outletId)) {
          filtered[id] = item;
        }
      });
      return filtered;
    }
    return colData;
  }

  const staffOutletId = user?.outletId || outletId;
  if (!staffOutletId) return {};

  if (colName === "users") {
    const filtered: Record<string, any> = {};
    Object.entries(colData).forEach(([id, u]) => {
      if (id === userUid || u.outletId === staffOutletId) filtered[id] = u;
    });
    return filtered;
  }
  if (colName === "employees") {
    const filtered: Record<string, any> = {};
    Object.entries(colData).forEach(([id, e]) => {
      if (e.outletId === staffOutletId) filtered[id] = e;
    });
    return filtered;
  }
  if (colName === "outlets") {
    return colData[staffOutletId] ? { [staffOutletId]: colData[staffOutletId] } : {};
  }
  if (colName === "restaurants") {
    const targetOutlet = dbCache.outlets?.[staffOutletId];
    if (targetOutlet) {
      const restId = targetOutlet.restaurantId;
      return colData[restId] ? { [restId]: colData[restId] } : {};
    }
    return {};
  }

  const tenantCols = ["orders", "inventory", "audit_logs", "menu_items", "attendance"];
  if (tenantCols.includes(colName)) {
    const filtered: Record<string, any> = {};
    Object.entries(colData).forEach(([id, item]) => {
      if (item.outletId === staffOutletId) {
        filtered[id] = item;
      }
    });
    return filtered;
  }
  return {};
}

// Server-Side Authorization for write requests
function isWriteAuthorized(
  colName: string,
  docId: string | undefined,
  userUid: string,
  selectedOutletId: string
): boolean {
  if (colName === "users" && (!docId || !dbCache.users?.[docId])) {
    return true; // Allow signup
  }
  if (!userUid) return false;

  const user = dbCache.users?.[userUid];
  const userRole = user?.role || "waiter";

  if (userRole === "owner") return true;

  if (colName === "users") {
    return docId === userUid;
  }

  const staffOutletId = user?.outletId || selectedOutletId;
  if (!staffOutletId) return false;

  if (colName === "orders") return true;

  if (colName === "inventory") {
    return ["manager", "cook"].includes(userRole);
  }

  if (colName === "menu_items") {
    return userRole === "manager";
  }

  if (colName === "attendance") {
    return true; // Allow clock-in/out
  }

  return false;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Pre-load database on server boot
  await ensureDBLoaded();

  app.use(express.json());

  // SSE active clients
  let sseClients: any[] = [];

  app.get("/api/live-updates", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sseClients.push(res);
    console.log(`[SSE] Client connected. Total clients: ${sseClients.length}`);

    req.on("close", () => {
      sseClients = sseClients.filter(c => c !== res);
      console.log(`[SSE] Client disconnected. Total clients: ${sseClients.length}`);
    });
  });

  const notifyClients = () => {
    sseClients.forEach(c => {
      c.write("data: update\n\n");
    });
  };

  // Dashboard stats aggregated endpoint for performance hardening
  app.get("/api/dashboard-stats", async (req, res) => {
    try {
      const dbData = await ensureDBLoaded();
      const userUid = req.headers["x-user-uid"] as string || "";
      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";
      const dateFilter = req.query.dateFilter as string || "week";

      if (!userUid || !selectedOutletId) {
        return res.status(400).json({ error: "Missing required headers." });
      }

      // Authorize access to selected outlet
      const user = dbData.users?.[userUid];
      const userRole = user?.role || "waiter";
      let isAuthorized = false;

      if (userRole === "owner") {
        const ownedRestaurantIds = Object.entries(dbData.restaurants || {})
          .filter(([_, r]: [string, any]) => r.ownerId === userUid)
          .map(([id]) => id);
        const ownedOutletIds = Object.entries(dbData.outlets || {})
          .filter(([_, o]: [string, any]) => ownedRestaurantIds.includes(o.restaurantId))
          .map(([id]) => id);
        isAuthorized = ownedOutletIds.includes(selectedOutletId);
      } else {
        isAuthorized = user?.outletId === selectedOutletId;
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: "Access Denied: Unauthorized outlet access." });
      }

      const allOrders = Object.entries(dbData.orders || {})
        .filter(([_, o]: [string, any]) => o.outletId === selectedOutletId)
        .map(([id, o]) => ({ id, ...o }));

      // Calculations matching DashboardOverview calculations
      const now = new Date();
      const startOfToday    = new Date().setHours(0, 0, 0, 0);
      const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).setHours(0, 0, 0, 0);

      const filteredOrders = allOrders.filter(o => {
        if (!o.createdAt) return false;
        if (dateFilter === 'today')     return o.createdAt >= startOfToday;
        if (dateFilter === 'yesterday') return o.createdAt >= startOfYesterday && o.createdAt < startOfToday;
        if (dateFilter === 'week') {
          const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).setHours(0, 0, 0, 0);
          return o.createdAt >= sevenDaysAgo;
        }
        if (dateFilter === 'month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).setHours(0, 0, 0, 0);
          return o.createdAt >= startOfMonth;
        }
        return true;
      });

      const totalRevenue = filteredOrders
        .filter(o => o.status === 'paid')
        .reduce((sum, o) => sum + (o.total || 0), 0);

      const activeOrders = allOrders.filter(o => o.status !== 'paid' && o.status !== 'delivered');

      const outletDoc = dbData.outlets?.[selectedOutletId];
      const tableCount = outletDoc?.tableCount || 12;

      const occupiedTablesCount = new Set(
        activeOrders
          .filter(o => o.orderType !== 'takeaway' && o.orderType !== 'delivery' && o.tableId !== 'Takeaway' && o.tableId !== 'Delivery')
          .map(o => o.tableId)
      ).size;
      const occupancyRate = Math.min(100, Math.round((occupiedTablesCount / tableCount) * 100));

      const paidOrders = filteredOrders.filter(o => o.status === 'paid');
      const avgTurnaround = paidOrders.length > 0 ? "26 min" : "32 min";

      const preparingOrders = activeOrders.filter(o => o.status === 'preparing');
      const readyOrders     = activeOrders.filter(o => o.status === 'ready');
      
      const staleTables = activeOrders
        .filter(o => o.tableId && o.status !== 'paid' && (Date.now() - o.createdAt) > 45 * 60 * 1000)
        .map(o => ({
          id: o.id,
          tableNumber: o.tableId,
          waiterName: o.waiterName || 'Unassigned',
          createdAt: o.createdAt
        }));

      // Chart trend calculations
      let chartData: any[] = [];
      if (dateFilter === 'today' || dateFilter === 'yesterday') {
        const baseTime = dateFilter === 'today' ? startOfToday : startOfYesterday;
        chartData = Array.from({ length: 6 }).map((_, i) => {
          const hourStart = baseTime + i * 4 * 60 * 60 * 1000;
          const hourEnd   = hourStart + 4 * 60 * 60 * 1000;
          const label = `${new Date(hourStart).getHours()}:00`;
          const chunkOrders = allOrders.filter(o => o.createdAt >= hourStart && o.createdAt < hourEnd);
          const rev = chunkOrders.filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.total || 0), 0);
          return { name: label, revenue: rev, orders: chunkOrders.length };
        });
      } else {
        const daysCount = dateFilter === 'week' ? 7 : 30;
        const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        chartData = Array.from({ length: daysCount }).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (daysCount - 1 - i));
          const dayName  = dateFilter === 'week' ? daysOfWeek[d.getDay()] : `${d.getDate()} ${daysOfWeek[d.getDay()]}`;
          const dateStr  = d.toDateString();
          const dayOrders = allOrders.filter(o => new Date(o.createdAt).toDateString() === dateStr);
          const revenue   = dayOrders.filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.total || 0), 0);
          return { name: dayName, revenue, orders: dayOrders.length };
        });
      }

      // Category breakdown
      const tallyCategory: { [cat: string]: number } = {};
      filteredOrders.forEach(order => {
        if (order.status === 'paid' && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const cat = item.category || 'Other';
            if (!tallyCategory[cat]) tallyCategory[cat] = 0;
            tallyCategory[cat] += (item.price || 0) * (item.quantity || 1);
          });
        }
      });
      const categorySales = Object.entries(tallyCategory)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // Best sellers
      const tallyBestSellers: { [name: string]: { qty: number; total: number } } = {};
      filteredOrders.forEach(order => {
        if (order.status === 'paid' && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const name = item.name;
            if (!tallyBestSellers[name]) tallyBestSellers[name] = { qty: 0, total: 0 };
            tallyBestSellers[name].qty   += item.quantity || 1;
            tallyBestSellers[name].total += (item.price || 0) * (item.quantity || 1);
          });
        }
      });
      const bestSellers = Object.entries(tallyBestSellers)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      // Low Stock
      const lowStockItems = Object.entries(dbData.inventory_items || {})
        .filter(([_, item]: [string, any]) => item.outletId === selectedOutletId && item.quantity <= item.threshold)
        .map(([id, item]) => ({ id, ...item }));

      // Active clocked-in staff
      const activeStaff = Object.entries(dbData.attendance || {})
        .filter(([_, att]: [string, any]) => att.outletId === selectedOutletId && att.clockOut === null)
        .map(([id, att]) => ({ id, ...att }));

      // Security Logs
      const securityLogs = Object.entries(dbData.audit_logs || {})
        .filter(([_, log]: [string, any]) => log.outletId === selectedOutletId)
        .map(([id, log]) => ({ id, ...log }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5);

      // Sliced Transaction history
      const recentTransactions = filteredOrders
        .filter(o => o.status === 'paid' || o.status === 'cancelled')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 15);

      res.json({
        totalRevenue,
        ordersCount: filteredOrders.length,
        avgTurnaround,
        occupancyRate,
        occupiedTablesCount,
        preparingOrdersCount: preparingOrders.length,
        readyOrdersCount: readyOrders.length,
        staleTables,
        chartData,
        categorySales,
        bestSellers,
        lowStockItems,
        activeStaff,
        securityLogs,
        recentTransactions
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DB API endpoints
  app.get("/api/db/:collection", async (req, res) => {
    try {
      const dbData = await ensureDBLoaded();
      const colName = req.params.collection;
      const userUid = req.headers["x-user-uid"] as string || "";
      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      const colData = dbData[colName] || {};
      const filtered = filterTenantData(colName, colData, selectedOutletId, userUid);
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/set", async (req, res) => {
    try {
      const { path: docPath, data } = req.body;
      const parts = docPath.split("/");
      const colName = parts[0];
      const docId = parts[1];

      const userUid = req.headers["x-user-uid"] as string || "";
      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      if (!isWriteAuthorized(colName, docId, userUid, selectedOutletId)) {
        return res.status(403).json({ error: "Access Denied: Unauthorized write request." });
      }

      const dbData = await ensureDBLoaded();
      if (!dbData[colName]) dbData[colName] = {};
      dbData[colName][docId] = data;
      persistDoc(colName, docId, data);
      
      notifyClients();
      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/update", async (req, res) => {
    try {
      const { path: docPath, data } = req.body;
      const parts = docPath.split("/");
      const colName = parts[0];
      const docId = parts[1];

      const userUid = req.headers["x-user-uid"] as string || "";
      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      if (!isWriteAuthorized(colName, docId, userUid, selectedOutletId)) {
        return res.status(403).json({ error: "Access Denied: Unauthorized write request." });
      }

      const dbData = await ensureDBLoaded();
      if (dbData[colName]?.[docId]) {
        dbData[colName][docId] = {
          ...dbData[colName][docId],
          ...data
        };
        persistDoc(colName, docId, dbData[colName][docId]);
        notifyClients();
      }
      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/delete", async (req, res) => {
    try {
      const { path: docPath } = req.body;
      const parts = docPath.split("/");
      const colName = parts[0];
      const docId = parts[1];

      const userUid = req.headers["x-user-uid"] as string || "";
      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      if (!isWriteAuthorized(colName, docId, userUid, selectedOutletId)) {
        return res.status(403).json({ error: "Access Denied: Unauthorized write request." });
      }

      const dbData = await ensureDBLoaded();
      if (dbData[colName]?.[docId]) {
        delete dbData[colName][docId];
        persistDoc(colName, docId, null);
        notifyClients();
      }
      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/add", async (req, res) => {
    try {
      const { path: colPath, data } = req.body;
      const colName = colPath;
      const docId = Math.random().toString(36).substring(2, 15);

      const userUid = req.headers["x-user-uid"] as string || "";
      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      if (!isWriteAuthorized(colName, undefined, userUid, selectedOutletId)) {
        return res.status(403).json({ error: "Access Denied: Unauthorized write request." });
      }

      const dbData = await ensureDBLoaded();
      if (!dbData[colName]) dbData[colName] = {};
      dbData[colName][docId] = data;
      persistDoc(colName, docId, data);

      notifyClients();
      res.json({ id: docId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  let razorpayClient: Razorpay | null = null;
  const getRazorpay = () => {
    if (!razorpayClient && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      razorpayClient = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
    }
    return razorpayClient;
  };

  app.post("/api/create-razorpay-order", async (req, res) => {
    try {
      const razorpay = getRazorpay();
      if (!razorpay) {
        return res.status(500).json({ error: "Razorpay not configured on server." });
      }

      const options = {
        amount: 4900 * 100, // $49 in cents/paise (actually Razorpay uses INR but we'll assume standard 4900 format for testing)
        currency: "INR",
        receipt: `receipt_${Date.now()}`
      };

      const order = await razorpay.orders.create(options);
      res.json(order);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
