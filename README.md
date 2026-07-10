# CraveCraft - Modern SaaS Restaurant OS 🍽️🚀

CraveCraft is a premium, high-performance SaaS operating system designed for modern restaurant chains. It integrates real-time digital ordering, kitchen management, waiter coordination, staff tracking, and financial analytics into a single unified platform.

---

## 🌟 Key Features

* **📲 Customer QR Menu & Live Bill Tracker:** Customers scan a table QR code to view a dynamic, categorized menu (with automatic veg/non-veg classification). They can order items, monitor real-time preparation states ("Preparing", "Ready to Serve", "Served"), view their running subtotal, and request checkout.
* **🪑 Real-Time Table Service Console:** Owners and managers can view dining table layouts, assign waiters, process Card/UPI/Cash payments, and free tables dynamically. Table count settings can be changed live, with integrated guards preventing the deletion of occupied tables.
* **🍳 Digital Kitchen Display (KDS):** Active food tickets are pushed in real-time. Kitchen staff can update dish progress, view elapsed preparation timers with warnings for delayed orders, and chime notifications. Access is protected by a secure KDS PIN.
* **🛎️ Waiter Service Board:** Waiters receive live chime alerts for newly assigned tables or ready-to-serve dishes (including unassigned ready orders).
* **📊 Business Intelligence Dashboard:** Rich analytics detailing peak busy times, revenue/order trajectories, low stock alerts, and security audit logs. Reports can be exported as printable PDFs.
* **🕒 Workforce Shift & Attendance Manager:** Employees can register, log shifts (protected by cross-branch double clock-in detection), and managers can audit performance.

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** React, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Motion.
* **Database & Auth:** Firebase Firestore (with local mock server integrations), Firebase Auth.
* **Server-Side API:** Node.js, Express, Server-Sent Events (SSE) for real-time synchronization.

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+)
* npm

### Local Setup & Run

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Database & Credentials:**
   Initialize a local `.env` file (copied from `.env.example`).

3. **Start Dev Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` to access the application.
