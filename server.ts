import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Razorpay from "razorpay";
import fs from "fs/promises";

const DB_FILE = path.join(process.cwd(), "db.json");

async function readDB(): Promise<Record<string, Record<string, any>>> {
  try {
    const data = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeDB(data: Record<string, Record<string, any>>) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for body parsing
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

  // DB API endpoints
  app.get("/api/db/:collection", async (req, res) => {
    const dbData = await readDB();
    res.json(dbData[req.params.collection] || {});
  });

  app.post("/api/db/set", async (req, res) => {
    try {
      const { path: docPath, data } = req.body;
      const parts = docPath.split("/");
      const colName = parts[0];
      const docId = parts[1];

      const dbData = await readDB();
      if (!dbData[colName]) dbData[colName] = {};
      dbData[colName][docId] = data;
      await writeDB(dbData);
      
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

      const dbData = await readDB();
      if (dbData[colName]?.[docId]) {
        dbData[colName][docId] = {
          ...dbData[colName][docId],
          ...data
        };
        await writeDB(dbData);
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

      const dbData = await readDB();
      if (dbData[colName]?.[docId]) {
        delete dbData[colName][docId];
        await writeDB(dbData);
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

      const dbData = await readDB();
      if (!dbData[colName]) dbData[colName] = {};
      dbData[colName][docId] = data;
      await writeDB(dbData);

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
