import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Razorpay from "razorpay";
import fs from "fs/promises";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fsSync from "node:fs";

const dbPath = path.join(process.cwd(), "db.sqlite");
const sqliteDb = new DatabaseSync(dbPath);

const JWT_SECRET = process.env.JWT_SECRET || "cravecraft-super-secret-key-123";

// Initialise DB Schema
sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS document_store (
    collection_name TEXT,
    doc_id TEXT,
    data TEXT,
    PRIMARY KEY (collection_name, doc_id)
  );
  CREATE INDEX IF NOT EXISTS idx_collection ON document_store (collection_name);
`);

// Native Cryptographic Helpers
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateJWT(payload: any): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ 
    ...payload, 
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 Hours
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyJWT(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null; // Expired
    return payload;
  } catch (err) {
    return null;
  }
}

// Database Read/Write Utility Helpers (Direct SQL)
function getDocSql(colName: string, docId: string): any | null {
  const stmt = sqliteDb.prepare("SELECT data FROM document_store WHERE collection_name = ? AND doc_id = ?");
  const row = stmt.get(colName, docId) as { data: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

function setDocSql(colName: string, docId: string, data: any) {
  const stmt = sqliteDb.prepare("INSERT OR REPLACE INTO document_store (collection_name, doc_id, data) VALUES (?, ?, ?)");
  stmt.run(colName, docId, JSON.stringify(data));
}

function deleteDocSql(colName: string, docId: string) {
  const stmt = sqliteDb.prepare("DELETE FROM document_store WHERE collection_name = ? AND doc_id = ?");
  stmt.run(colName, docId);
}

function getCollectionSql(colName: string): Record<string, any> {
  const stmt = sqliteDb.prepare("SELECT doc_id, data FROM document_store WHERE collection_name = ?");
  const rows = stmt.all(colName) as Array<{ doc_id: string; data: string }>;
  const result: Record<string, any> = {};
  for (const row of rows) {
    try {
      result[row.doc_id] = JSON.parse(row.data);
    } catch {}
  }
  return result;
}

// Resolve Outlets owned by Owner UID
function getOwnerOutletIds(ownerId: string): string[] {
  // Get owner's restaurants
  const restData = getCollectionSql("restaurants");
  const restIds = Object.entries(restData)
    .filter(([_, r]) => r.ownerId === ownerId)
    .map(([id]) => id);
    
  if (restIds.length === 0) return [];

  // Get outlets associated with those restaurants
  const outletData = getCollectionSql("outlets");
  const outletIds = Object.entries(outletData)
    .filter(([_, o]) => restIds.includes(o.restaurantId))
    .map(([id]) => id);
    
  return outletIds;
}

// REST Route Tenant Isolation Filter
function filterTenantData(
  colName: string,
  colData: Record<string, any>,
  user: any | null,
  selectedOutletId: string
): Record<string, any> {
  // If not logged in, reject sensitive collections
  if (!user) {
    if (colName === "menu_items") {
      const filtered: Record<string, any> = {};
      Object.entries(colData).forEach(([id, item]) => {
        if (item.outletId === selectedOutletId) filtered[id] = item;
      });
      return filtered;
    }
    return {}; // Deny all other collections to unauthenticated guests
  }

  const { uid, role, outletId: userOutletId } = user;

  if (role === "owner") {
    const ownedOutletIds = getOwnerOutletIds(uid);
    if (colName === "restaurants") {
      const filtered: Record<string, any> = {};
      Object.entries(colData).forEach(([id, r]) => {
        if (r.ownerId === uid) filtered[id] = r;
      });
      return filtered;
    }
    if (colName === "outlets") {
      const filtered: Record<string, any> = {};
      Object.entries(colData).forEach(([id, o]) => {
        if (ownedOutletIds.includes(id)) filtered[id] = o;
      });
      return filtered;
    }
    if (colName === "users") {
      const filtered: Record<string, any> = {};
      Object.entries(colData).forEach(([id, u]) => {
        if (id === uid || ownedOutletIds.includes(u.outletId)) filtered[id] = u;
      });
      return filtered;
    }
    
    // Tenant scoped entities
    const tenantCols = ["orders", "employees", "inventory", "audit_logs", "menu_items", "attendance", "inventory_items"];
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

  // Staff (Manager, Cook, Waiter) Isolation
  const staffOutletId = userOutletId || selectedOutletId;
  if (!staffOutletId) return {};

  if (colName === "users") {
    const filtered: Record<string, any> = {};
    Object.entries(colData).forEach(([id, u]) => {
      if (id === uid || u.outletId === staffOutletId) filtered[id] = u;
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
    const targetOutlet = colData[staffOutletId];
    if (targetOutlet) {
      const restId = targetOutlet.restaurantId;
      const restData = getDocSql("restaurants", restId);
      return restData ? { [restId]: restData } : {};
    }
    return {};
  }

  const tenantCols = ["orders", "inventory", "audit_logs", "menu_items", "attendance", "inventory_items"];
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

// Server-Side Authorization for writes
function isWriteAuthorized(
  colName: string,
  docId: string | undefined,
  user: any | null,
  selectedOutletId: string,
  payloadData: any
): boolean {
  // Orders can be placed by guest users on QR catalog tables
  if (colName === "orders") {
    if (!user) {
      // Validate that guests only write pending orders to the selected outlet
      return payloadData && payloadData.outletId === selectedOutletId && payloadData.status === "pending";
    }
    const { role, outletId } = user;
    if (role === "owner") return true;
    return (outletId || selectedOutletId) === payloadData.outletId;
  }

  if (!user) return false;

  const { uid, role, outletId } = user;
  if (role === "owner") {
    // Confirm owner owns this outlet or restaurant
    const ownedOutlets = getOwnerOutletIds(uid);
    if (payloadData && payloadData.outletId && !ownedOutlets.includes(payloadData.outletId)) {
      return false;
    }
    return true;
  }

  // Staff Authorization checks
  if (colName === "users") {
    return docId === uid;
  }

  const staffOutletId = outletId || selectedOutletId;
  if (!staffOutletId) return false;

  if (colName === "inventory" || colName === "inventory_items") {
    return ["manager", "cook"].includes(role) && payloadData?.outletId === staffOutletId;
  }

  if (colName === "menu_items") {
    return role === "manager" && payloadData?.outletId === staffOutletId;
  }

  if (colName === "attendance") {
    return payloadData?.outletId === staffOutletId;
  }

  return false;
}

// SSE Connection Groups grouped by outletId
const sseClients = new Map<string, any[]>();

const notifyClientsOfOutlet = (outletId: string) => {
  const clients = sseClients.get(outletId) || [];
  clients.forEach(c => {
    c.write("data: update\n\n");
  });
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // JWT Middleware validation
  const authenticateJWT = (req: any, res: any, next: any) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    
    if (!token) {
      req.user = null;
      return next();
    }
    
    const user = verifyJWT(token);
    if (!user) {
      return res.status(401).json({ error: "Access Denied: Invalid or expired token." });
    }
    
    req.user = user;
    next();
  };

  // SSE Scoped Endpoint
  app.get("/api/live-updates", (req, res) => {
    const outletId = req.query.outletId as string || "global";
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    if (!sseClients.has(outletId)) {
      sseClients.set(outletId, []);
    }
    sseClients.get(outletId)!.push(res);
    console.log(`[SSE] Client connected to outlet: ${outletId}. Total: ${sseClients.get(outletId)!.length}`);

    req.on("close", () => {
      const list = sseClients.get(outletId) || [];
      sseClients.set(outletId, list.filter(c => c !== res));
      console.log(`[SSE] Client disconnected from outlet: ${outletId}.`);
    });
  });

  // Dedicated Secure Authenticator Routes
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const hash = hashPassword(password);
    let userId = "user-" + cleanEmail.replace(/[^a-z0-9]/g, "-");
    if (cleanEmail === "demo.owner@cravecraft.app") {
      userId = "mock-demo-owner-uid";
    } else if (cleanEmail === "google.user@example.com") {
      userId = "mock-google-user-uid";
    }

    const userDoc = getDocSql("users", userId);
    if (!userDoc) {
      // Check if employee is invited in database
      const employees = getCollectionSql("employees");
      const empEntry = Object.entries(employees).find(([_, emp]: any) => emp.email?.toLowerCase() === cleanEmail);
      if (empEntry) {
        const [_, empData]: any = empEntry;
        const newUserData = {
          email: cleanEmail,
          role: empData.role,
          outletId: empData.outletId,
          isPaid: true,
          hasCompletedOnboarding: true,
          passwordHash: hash,
          displayName: empData.name,
          createdAt: Date.now()
        };
        setDocSql("users", userId, newUserData);
        const token = generateJWT({ uid: userId, email: cleanEmail, role: empData.role, outletId: empData.outletId });
        return res.json({ token, user: { uid: userId, email: cleanEmail, displayName: empData.name } });
      }
      return res.status(400).json({ error: "auth/user-not-found" });
    }

    if (userDoc.passwordHash !== hash) {
      return res.status(401).json({ error: "auth/wrong-password" });
    }

    const token = generateJWT({ uid: userId, email: cleanEmail, role: userDoc.role, outletId: userDoc.outletId || "" });
    res.json({ token, user: { uid: userId, email: cleanEmail, displayName: userDoc.displayName || cleanEmail.split("@")[0] } });
  });

  app.post("/api/auth/register", (req, res) => {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const hash = hashPassword(password);
    let userId = "user-" + cleanEmail.replace(/[^a-z0-9]/g, "-");
    if (cleanEmail === "demo.owner@cravecraft.app") {
      userId = "mock-demo-owner-uid";
    } else if (cleanEmail === "google.user@example.com") {
      userId = "mock-google-user-uid";
    }

    const userDoc = getDocSql("users", userId);
    if (userDoc) {
      return res.status(400).json({ error: "auth/email-already-in-use" });
    }

    const newUserData = {
      email: cleanEmail,
      role: "owner",
      isPaid: false,
      hasCompletedOnboarding: false,
      passwordHash: hash,
      displayName: displayName || cleanEmail.split("@")[0],
      createdAt: Date.now()
    };
    setDocSql("users", userId, newUserData);

    const token = generateJWT({ uid: userId, email: cleanEmail, role: "owner", outletId: "" });
    res.json({ token, user: { uid: userId, email: cleanEmail, displayName: newUserData.displayName } });
  });

  app.post("/api/auth/pin-login", (req, res) => {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ error: "PIN is required." });
    }

    const employees = getCollectionSql("employees");
    const empEntry = Object.entries(employees).find(([_, emp]: any) => emp.pin === pin);
    if (!empEntry) {
      return res.status(401).json({ error: "auth/wrong-pin" });
    }

    const [_, empData]: any = empEntry;
    const userId = "user-" + empData.email.toLowerCase().replace(/[^a-z0-9]/g, "-");
    let userDoc = getDocSql("users", userId);

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
      setDocSql("users", userId, userDoc);
    }

    const token = generateJWT({ uid: userId, email: empData.email, role: empData.role, outletId: empData.outletId });
    res.json({ token, user: { uid: userId, email: empData.email, displayName: empData.name } });
  });

  app.post("/api/auth/change-password", authenticateJWT, (req: any, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!req.user) {
        return res.status(401).json({ error: "Access Denied: Unauthorized request." });
      }
      const userDoc = getDocSql("users", req.user.uid);
      if (!userDoc || userDoc.passwordHash !== hashPassword(oldPassword)) {
        return res.status(400).json({ error: "Incorrect current password." });
      }
      userDoc.passwordHash = hashPassword(newPassword);
      setDocSql("users", req.user.uid, userDoc);
      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DB Document APIs (Isolated & Authorized)
  app.get("/api/db/:collection", authenticateJWT, (req: any, res) => {
    try {
      const colName = req.params.collection;
      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      // Enforce white list checks
      const validCols = ["users", "restaurants", "outlets", "orders", "employees", "inventory", "audit_logs", "menu_items", "attendance", "inventory_items"];
      if (!validCols.includes(colName)) {
        return res.status(400).json({ error: "Invalid collection query." });
      }

      const colData = getCollectionSql(colName);
      const filtered = filterTenantData(colName, colData, req.user, selectedOutletId);
      console.log(`[API GET] Collection: ${colName}, User: ${JSON.stringify(req.user)}, Filtered Keys:`, Object.keys(filtered));
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/set", authenticateJWT, (req: any, res) => {
    try {
      const { path: docPath, data } = req.body;
      const parts = docPath.split("/");
      const colName = parts[0];
      const docId = parts[1];

      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      if (!isWriteAuthorized(colName, docId, req.user, selectedOutletId, data)) {
        return res.status(403).json({ error: "Access Denied: Unauthorized write request." });
      }

      setDocSql(colName, docId, data);
      
      const outletId = data?.outletId || selectedOutletId;
      if (outletId) notifyClientsOfOutlet(outletId);
      notifyClientsOfOutlet("global");

      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/update", authenticateJWT, (req: any, res) => {
    try {
      const { path: docPath, data } = req.body;
      const parts = docPath.split("/");
      const colName = parts[0];
      const docId = parts[1];

      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      const existingData = getDocSql(colName, docId);
      if (!existingData) {
        return res.status(404).json({ error: "Document not found." });
      }

      const mergedData = { ...existingData, ...data };

      if (!isWriteAuthorized(colName, docId, req.user, selectedOutletId, mergedData)) {
        return res.status(403).json({ error: "Access Denied: Unauthorized write request." });
      }

      // Block client-side billing / role updates for security hardening
      if (!req.user || req.user.role !== "owner") {
        delete mergedData.role;
        delete mergedData.isPaid;
      }

      setDocSql(colName, docId, mergedData);
      
      const outletId = mergedData?.outletId || selectedOutletId;
      if (outletId) notifyClientsOfOutlet(outletId);
      notifyClientsOfOutlet("global");

      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/delete", authenticateJWT, (req: any, res) => {
    try {
      const { path: docPath } = req.body;
      const parts = docPath.split("/");
      const colName = parts[0];
      const docId = parts[1];

      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";
      const existingData = getDocSql(colName, docId);

      if (!isWriteAuthorized(colName, docId, req.user, selectedOutletId, existingData)) {
        return res.status(403).json({ error: "Access Denied: Unauthorized write request." });
      }

      deleteDocSql(colName, docId);
      
      const outletId = existingData?.outletId || selectedOutletId;
      if (outletId) notifyClientsOfOutlet(outletId);
      notifyClientsOfOutlet("global");

      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/add", authenticateJWT, (req: any, res) => {
    try {
      const { path: colPath, data } = req.body;
      const colName = colPath;
      const docId = Math.random().toString(36).substring(2, 15);

      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";

      if (!isWriteAuthorized(colName, undefined, req.user, selectedOutletId, data)) {
        return res.status(403).json({ error: "Access Denied: Unauthorized write request." });
      }

      setDocSql(colName, docId, data);

      const outletId = data?.outletId || selectedOutletId;
      if (outletId) notifyClientsOfOutlet(outletId);
      notifyClientsOfOutlet("global");

      res.json({ id: docId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dedicated Analytics Aggregation (DB Performance Hardening)
  app.get("/api/dashboard-stats", authenticateJWT, async (req: any, res) => {
    try {
      const selectedOutletId = req.headers["x-selected-outlet-id"] as string || "";
      const dateFilter = req.query.dateFilter as string || "week";

      if (!req.user || !selectedOutletId) {
        return res.status(400).json({ error: "Authentication credentials and outlet ID headers required." });
      }

      // Check outlet authorization
      let isAuthorized = false;
      if (req.user.role === "owner") {
        const ownedOutletIds = getOwnerOutletIds(req.user.uid);
        isAuthorized = ownedOutletIds.includes(selectedOutletId);
      } else {
        isAuthorized = req.user.outletId === selectedOutletId;
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: "Access Denied: Unauthorized outlet." });
      }

      // Query database directly for statistics aggregations
      const ordersMap = getCollectionSql("orders");
      const allOrders = Object.entries(ordersMap)
        .filter(([_, o]: any) => o.outletId === selectedOutletId)
        .map(([id, o]) => ({ id, ...o }));

      const now = new Date();
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).setHours(0, 0, 0, 0);

      const filteredOrders = allOrders.filter(o => {
        if (!o.createdAt) return false;
        if (dateFilter === "today") return o.createdAt >= startOfToday;
        if (dateFilter === "yesterday") return o.createdAt >= startOfYesterday && o.createdAt < startOfToday;
        if (dateFilter === "week") {
          const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).setHours(0, 0, 0, 0);
          return o.createdAt >= sevenDaysAgo;
        }
        if (dateFilter === "month") {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).setHours(0, 0, 0, 0);
          return o.createdAt >= startOfMonth;
        }
        return true;
      });

      const totalRevenue = filteredOrders
        .filter(o => o.status === "paid")
        .reduce((sum, o) => sum + (o.total || 0), 0);

      const activeOrders = allOrders.filter(o => o.status !== "paid" && o.status !== "cancelled");
      const outletDoc = getDocSql("outlets", selectedOutletId);
      const tableCount = outletDoc?.tableCount || 12;

      const occupiedTablesCount = new Set(
        activeOrders
          .filter(o => o.orderType !== "takeaway" && o.orderType !== "delivery" && o.tableId !== "Takeaway" && o.tableId !== "Delivery")
          .map(o => o.tableId)
      ).size;
      const occupancyRate = Math.min(100, Math.round((occupiedTablesCount / tableCount) * 100));

      const avgTurnaround = filteredOrders.filter(o => o.status === "paid").length > 0 ? "26 min" : "32 min";
      const preparingOrdersCount = activeOrders.filter(o => o.status === "preparing").length;
      const readyOrdersCount = activeOrders.filter(o => o.status === "ready").length;

      const staleTables = activeOrders
        .filter(o => o.tableId && o.status !== "paid" && (Date.now() - o.createdAt) > 45 * 60 * 1000)
        .map(o => ({
          id: o.id,
          tableNumber: o.tableId,
          waiterName: o.waiterName || "Unassigned",
          createdAt: o.createdAt
        }));

      // Trend data calculations
      let chartData: any[] = [];
      if (dateFilter === "today" || dateFilter === "yesterday") {
        const baseTime = dateFilter === "today" ? startOfToday : startOfYesterday;
        chartData = Array.from({ length: 6 }).map((_, i) => {
          const hourStart = baseTime + i * 4 * 60 * 60 * 1000;
          const hourEnd = hourStart + 4 * 60 * 60 * 1000;
          const label = `${new Date(hourStart).getHours()}:00`;
          const chunkOrders = allOrders.filter(o => o.createdAt >= hourStart && o.createdAt < hourEnd);
          const rev = chunkOrders.filter(o => o.status === "paid").reduce((sum, o) => sum + (o.total || 0), 0);
          return { name: label, revenue: rev, orders: chunkOrders.length };
        });
      } else {
        const daysCount = dateFilter === "week" ? 7 : 30;
        const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        chartData = Array.from({ length: daysCount }).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (daysCount - 1 - i));
          const dayName = dateFilter === "week" ? daysOfWeek[d.getDay()] : `${d.getDate()} ${daysOfWeek[d.getDay()]}`;
          const dateStr = d.toDateString();
          const dayOrders = allOrders.filter(o => new Date(o.createdAt).toDateString() === dateStr);
          const revenue = dayOrders.filter(o => o.status === "paid").reduce((sum, o) => sum + (o.total || 0), 0);
          return { name: dayName, revenue, orders: dayOrders.length };
        });
      }

      // Category breakdown
      const tallyCategory: { [cat: string]: number } = {};
      filteredOrders.forEach(order => {
        if (order.status === "paid" && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const cat = item.category || "Other";
            tallyCategory[cat] = (tallyCategory[cat] || 0) + (item.price || 0) * (item.quantity || 1);
          });
        }
      });
      const categorySales = Object.entries(tallyCategory)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // Best sellers
      const tallyBestSellers: { [name: string]: { qty: number; total: number } } = {};
      filteredOrders.forEach(order => {
        if (order.status === "paid" && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const name = item.name;
            if (!tallyBestSellers[name]) tallyBestSellers[name] = { qty: 0, total: 0 };
            tallyBestSellers[name].qty += item.quantity || 1;
            tallyBestSellers[name].total += (item.price || 0) * (item.quantity || 1);
          });
        }
      });
      const bestSellers = Object.entries(tallyBestSellers)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      // Low stock items
      const inventoryMap = getCollectionSql("inventory_items");
      const lowStockItems = Object.entries(inventoryMap)
        .filter(([_, item]: any) => item.outletId === selectedOutletId && item.quantity <= item.threshold)
        .map(([id, item]) => ({ id, ...item }));

      // Active staff clockins
      const attendanceMap = getCollectionSql("attendance");
      const activeStaff = Object.entries(attendanceMap)
        .filter(([_, att]: any) => att.outletId === selectedOutletId && att.clockOut === null)
        .map(([id, att]) => ({ id, ...att }));

      // Audit security logs
      const auditMap = getCollectionSql("audit_logs");
      const securityLogs = Object.entries(auditMap)
        .filter(([_, log]: any) => log.outletId === selectedOutletId)
        .map(([id, log]) => ({ id, ...log }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5);

      const recentTransactions = filteredOrders
        .filter(o => o.status === "paid" || o.status === "cancelled")
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 15);

      res.json({
        totalRevenue,
        ordersCount: filteredOrders.length,
        avgTurnaround,
        occupancyRate,
        occupiedTablesCount,
        preparingOrdersCount,
        readyOrdersCount,
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

  // Razorpay Integration Endpoint
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
        amount: 4900 * 100, // $49
        currency: "INR",
        receipt: `receipt_${Date.now()}`
      };
      const order = await razorpay.orders.create(options);
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cloud/backup", authenticateJWT, (req: any, res) => {
    try {
      if (req.user.role !== "owner") {
        return res.status(403).json({ error: "Only owners can trigger database backups." });
      }

      const backupsDir = path.join(process.cwd(), "cloud_backups");
      if (!fsSync.existsSync(backupsDir)) {
        fsSync.mkdirSync(backupsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFilename = `db-backup-${timestamp}.sqlite`;
      const backupPath = path.join(backupsDir, backupFilename);

      // Copy database file
      fsSync.copyFileSync(path.join(process.cwd(), "db.sqlite"), backupPath);

      // Create log entry
      const auditLog = {
        type: "db_backup_success",
        message: `Database backup created successfully by ${req.user.email} (${backupFilename})`,
        createdAt: Date.now(),
        outletId: ""
      };
      
      const logId = "log_" + Math.random().toString(36).substr(2, 9);
      setDocSql("audit_logs", logId, auditLog);
      notifyClientsOfOutlet("global");

      res.json({
        success: true,
        message: "Database backup created successfully.",
        filename: backupFilename,
        path: `/cloud_backups/${backupFilename}`,
        createdAt: auditLog.createdAt
      });
    } catch (err: any) {
      res.status(500).json({ error: `Backup failed: ${err.message}` });
    }
  });

  app.use("/cloud_backups", express.static(path.join(process.cwd(), "cloud_backups")));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite development / Production Build Handlers
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
// Trigger restart to reload DB cache after data migration
