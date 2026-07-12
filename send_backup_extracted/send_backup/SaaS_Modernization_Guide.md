# CraveCraft SaaS OS - Security & Performance Integration Guide

This guide is for implementing the JWT security, server-side database querying, and scoped live updates in the main project.

---

## 🛠️ Step-by-Step Implementation Guide

Follow these steps to merge the refactored code into your main project branch:

### Step 1: Replace Server Logic (`server.ts`)
* **What to do**: Replace your entire `server.ts` file in the root of the project with the updated code from **`send_backup/server.ts`**.
* **Key Changes Implemented**:
  * Removed the global `dbCache` object to prevent RAM overflow.
  * Added `hashPassword`, `generateJWT`, and `verifyJWT` cryptographic helpers using Node's native `node:crypto`.
  * Added `/api/auth/login`, `/api/auth/register`, `/api/auth/pin-login`, and `/api/auth/change-password` endpoints.
  * Secured `/api/db/:collection` endpoints using the `authenticateJWT` middleware.
  * Refactored `/api/live-updates` SSE handler to accept `?outletId=xyz` and scope notifications.

---

### Step 2: Replace Database Client Adapter (`src/lib/mockFirestoreAlias.ts`)
* **What to do**: Replace your current `src/lib/mockFirestoreAlias.ts` with the file from **`send_backup/src/lib/mockFirestoreAlias.ts`**.
* **Key Changes Implemented**:
  * Updated `getHeaders()` to fetch the token from `localStorage.getItem("mock_auth_jwt")` and send it as a secure `Authorization: Bearer <token>` header.
  * Removed client-side asserted `X-User-UID` headers.
  * Scoped the `EventSource` connection in `getSSEConnection()` to use the current `selectedOutletId` in the query string.

---

### Step 3: Replace Authentication Client Adapter (`src/lib/mockAuthAlias.ts`)
* **What to do**: Replace your current `src/lib/mockAuthAlias.ts` with the file from **`send_backup/src/lib/mockAuthAlias.ts`**.
* **Key Changes Implemented**:
  * Rewrote `signInWithEmailAndPassword`, `signInWithPIN`, and `signInAnonymously` to call the new `/api/auth/...` server endpoints.
  * Programmed the adapters to save both the `mock_auth_user` payload and the `mock_auth_jwt` token in `localStorage`.
  * Removed all client-side password hash matching and raw user list fetching.

---

### Step 4: Replace Dashboard Overview Component (`src/pages/dashboard/DashboardOverview.tsx`)
* **What to do**: Replace your current `src/pages/dashboard/DashboardOverview.tsx` with the file from **`send_backup/src/pages/dashboard/DashboardOverview.tsx`**.
* **Key Changes Implemented**:
  * Updated the stats fetch headers to read from `localStorage.getItem("mock_auth_jwt")` and send it as a secure `Authorization: Bearer <token>` header.
  * Scoped the `EventSource` connection to include `?outletId=selectedOutletId` to fetch scoped live updates.

---

### Step 5: Verify Database Compatibility
* **Prerequisites**: No external npm packages (like `jsonwebtoken` or `bcrypt`) are required. The code runs entirely on Node's native `node:crypto` and `node:sqlite` modules.
* **Important Database Records**: Ensure your `db.sqlite` users collection has the mock admin/demo accounts. (Note: These were automatically recreated in your sqlite database during this patch).

---

### Step 6: Test and Start Dev Server
1. Restart the project server to ensure the watch process compiles the new routes:
   ```bash
   npm run dev
   ```
2. Clear your browser storage/cookies and refresh the browser page.
3. Test logging in via the **Owner Portal** button or using `demo.owner@cravecraft.app` with `demo123`.

---

### Step 7: Install Progressive Web App (PWA) Assets
* **What to do**:
  * Copy **`send_backup/public/manifest.json`** and **`send_backup/public/sw.js`** (along with the logo icons) into your project's `public/` directory.
  * Replace your root **`index.html`** with the updated version from **`send_backup/index.html`** to register the PWA service worker on app startup.
* **Key Changes Implemented**:
  * Configured standalone installable layout with app icons for iOS/Android home screens.
  * Service worker cached assets for offline-first boot and network dropout shell resilience.

---

### Step 8: Replace Waiter, Kitchen, and Profile Views for Alerts & App Installation
* **What to do**:
  * Replace **`src/pages/dashboard/WaiterDashboard.tsx`** with the file from **`send_backup/src/pages/dashboard/WaiterDashboard.tsx`**.
  * Replace **`src/pages/KitchenDisplay.tsx`** with the file from **`send_backup/src/pages/KitchenDisplay.tsx`**.
  * Replace **`src/pages/dashboard/EmployeeProfile.tsx`** with the file from **`send_backup/src/pages/dashboard/EmployeeProfile.tsx`**.
* **Key Changes Implemented**:
  * Integrates the native browser `Notification` API to alert waiters and cooks of incoming orders and ready-to-serve plates, even when the browser or mobile app is minimized.
  * Adds an in-app "Install App" prompt integration inside **My Profile** control center to make standalone installation easy across all browsers (including Opera GX).

---

## 💡 Important Deployment & Verification Tips

Make sure your friend reads these three critical recommendations:

1. **Clear Browser Storage**:
   * *Why*: Old browser sessions might still have the legacy `X-User-UID` in local storage without the new `mock_auth_jwt` token, which will trigger unauthorized API errors.
   * *Action*: Instruct your friend to clear browser cookies/localStorage (or open in Incognito) during the first test.

2. **Configure JWT Secret**:
   * *Why*: The server has a default fallback secret `cravecraft-super-secret-key-123`.
   * *Action*: For production, add `JWT_SECRET=your_secret_hash` to the `.env` file so sessions are securely encrypted.

3. **Recreate Demo Accounts**:
   * *Why*: If the SQLite database on your friend's system does not have the demo accounts matching the new password hashes, login will fail.
   * *Action*: Use the `scratch/recreate_demo_user.js` script to sync the accounts in the database files.
