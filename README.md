# JARVIS – AI Powered Smart Room Automation System

A futuristic, mobile-first web application for smart room automation and personal AI assistance, built with Next.js (App Router), JavaScript, Tailwind CSS, Lucide React, and GSAP.

## Project Structure

```text
jarvis/
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── commands/
│   │   │   │   ├── route.js
│   │   │   │   └── [id]/
│   │   │   │       └── route.js
│   │   │   ├── health/
│   │   │   │   └── route.js
│   │   │   ├── rooms/
│   │   │   │   ├── route.js
│   │   │   │   └── [id]/
│   │   │   │       └── route.js
│   │   │   └── devices/
│   │   │       ├── route.js
│   │   │       └── [id]/
│   │   │           └── route.js
│   │   ├── globals.css
│   │   ├── layout.js
│   │   └── page.js
│   ├── components/
│   │   ├── layout/
│   │   ├── dashboard/
│   │   └── ui/
│   ├── features/
│   │   ├── devices/
│   │   │   ├── DeviceFormModal.jsx
│   │   │   └── DeviceManagementSection.jsx
│   │   ├── rooms/
│   │   │   ├── RoomFormModal.jsx
│   │   │   └── RoomManagementSection.jsx
│   │   ├── assistant/
│   │   └── automation/
│   ├── hooks/
│   │   ├── useCollectionResource.js
│   │   ├── useDevices.js
│   │   └── useRooms.js
│   ├── lib/
│   │   ├── api/
│   │   │   └── client.js
│   │   ├── db/
│   │   │   └── connect.js
│   │   ├── utils/
│   │   │   ├── apiResponse.js
│   │   │   └── validation.js
│   │   └── motion.js
│   ├── models/
│   │   ├── Command.js
│   │   ├── User.js
│   │   ├── Room.js
│   │   └── Device.js
│   ├── services/
│   │   ├── commandService.js
│   │   ├── deviceApi.js
│   │   ├── deviceService.js
│   │   ├── roomApi.js
│   │   └── roomService.js
│   └── types/
├── docs/
│   ├── ROADMAP.md
│   └── ARCHITECTURE.md
├── README.md
├── .env.example
├── .gitignore
└── package.json
```

## Design System / UI

JARVIS uses a **futuristic, mobile-first HUD visual direction** inspired by Iron Man's interface while keeping controls clean, readable, and accessible across phones, tablets, and desktops:

- **Palette:** Deep space background (`#05080F`), dark slate surfaces (`#0B1220`), primary cyan (`#00E5FF`) and secondary blue (`#1677FF`) accents, with crisp light-cyan (`#EAFBFF`) and muted (`#8295A8`) typography.
- **Typography:** `Orbitron` for futuristic headings and branding paired with `Inter` for clean UI legibility, self-hosted via `next/font/google`.
- **Styling & Motion:** Tailwind CSS v4 tokens and subtle HUD surface/grid/glow utilities in `src/app/globals.css`, with component structure ready for GSAP animations.

## Dashboard

The primary route (`/`) delivers a mobile-first smart room HUD connected to the live MongoDB Atlas backend:

- **UI Design Highlights:** Compact sticky header showing real backend sync status (`API Ready` / `Syncing` / `Offline`), manual dashboard refresh button, and preview profile icon; circular concentric AI Core hero centerpiece (`SYSTEM STANDBY`, room/device summary pills); MongoDB-backed `RoomOverview` Dashboard Overview; room & device management grids; and a safe-area-aware fixed bottom navigation bar (`Home` active; `Assistant`, `Automation`, and `Settings` disabled placeholders).
- **Dashboard Metrics & Live Data Sources:** Powered once by `useRooms()` and `useDevices()` in `src/app/page.js` with zero mock data or duplicate initial requests. Derives exact MongoDB counts (`Total Rooms`, `Devices`, `Desired ON`, `Connection Status` broken down into `HW Online` / `Offline` / `Unknown`, `Reported State` breakdown, `Device Types Summary` across `light`/`fan`/`led`/`other`, and rooms grouped with assigned devices including `0 Devices` rooms), provides room-to-device navigation links (`#rooms-section`, `#devices-section`), and renders loading, error+retry, empty, and manual-refresh states.
- **GSAP Animation Features:** Multi-speed concentric AI Core ring rotation (with stationary central `JARVIS` branding), soft core glow pulse, lightweight radial scanning sweep, coordinated landmark entrance, post-load device card stagger, and tactile desktop hover / mobile press / toggle state micro-interactions—all wrapped in `gsap.context()` with `prefers-reduced-motion` support.
- **Responsive Design Support:** Mobile-first layout tuned across small phones (`360px`, `390px`, `430px`), tablets (`768px`), and desktop (`1440px`) without horizontal overflow, transitioning from a single-column mobile stack into a balanced 2-column desktop HUD grid with a centered floating bottom dock.
- **MongoDB-Backed Room Management:** Lists all smart rooms with name, description, accurate assigned device count, and per-room device chips (`RoomManagementSection`, `RoomFormModal`), supports room filtering into the devices grid, and enforces backend `409` safe deletion (blocking removal when devices remain assigned without silently deleting or reassigning devices).
- **MongoDB-Backed Device Management:** Lists persisted devices (name, type, room name, `connectionStatus`, `desiredState`, `reportedState`, optional ESP32 ID/relay), supports room/type filtering, modal creation/editing (`DeviceFormModal`), inline delete confirmation, loading/empty/error-retry states, and `desiredState` toggling via `useDevices` and `useRooms`. Toggling `desiredState` saves user intent in MongoDB only and never displays a device as physically ON or online without confirmed `reportedState`/`connectionStatus`.
- **Current QA & Testing Status (Steps 20–23 Verified):** ESLint (`npm run lint`), production build (`npm run build`), client bundle secret scan (`.next/static` JS chunks), Vercel serverless deployment readiness audit (`connect.js` stale-socket reset + `maxPoolSize: 10`, zero hardcoded `localhost`/`fs` APIs, `await connection()` dynamic route checks), backend security/validation/conflict/DB error-classification checks (`400`/`403`/`404`/`409`/`503`), and full-stack React 19 + Command Queue integration suites pass. Remaining blockers before open public production launch: user/device authentication (`ownerId` session enforcement on `/api/rooms*` & `/api/devices*`, `/api/esp32/*` tokens) and live ESP32 hardware actuation; live Chrome visual responsive/GSAP checks require manual browser QA.

## Screenshots

_Screenshots will be added once additional feature views (Assistant, Automation, and Settings) are implemented. Run `npm run dev` locally to preview the live mobile and desktop HUD._

## Backend Architecture

JARVIS uses **Next.js App Router Route Handlers** (`src/app/api/`) instead of a separate Express server, paired with **MongoDB Atlas** via **Mongoose**:

- **Layered separation:** Connection caching lives in `src/lib/db/connect.js`, route handlers in `src/app/api/`, Mongoose schemas in `src/models/`, business logic in `src/services/`, and shared helpers in `src/lib/utils/`.
- **Database Models (`src/models/`):**
  - `User` — User identity (`name`, unique normalized `email`, optional `passwordHash` hidden by default, safe UI `preferences` defaults, timestamps).
  - `Room` — Smart rooms (`name`, `description`, `ownerId` referencing `User`, unique per-owner room name index, timestamps).
  - `Device` — Smart-room endpoints (`name`, `type`, `roomId`, `ownerId`, optional ESP32 hardware mapping `esp32DeviceId` + `relayNumber`, `connectionStatus`, `lastSeen`, and separate `desiredState` vs. `reportedState` tracking).
  - `Command` — Persistent hardware command queue (`commandId` UUID, `deviceId`, `esp32DeviceId`, `ownerId`, `relayNumber`, `action` `on`/`off`, `status` `pending | processing | success | failed | expired`, `attemptCount`/`maxAttempts`, `processingStartedAt`/`processingUntil` lease, `expiresAt`, `retainUntil` 30-day TTL cleanup, `executedAt`, `result`, `errorReason`, partial unique `idempotencyKey`, timestamps).
- **Implemented now:** `mongoose` connection utility (`src/lib/db/connect.js`), `GET /api/health`, Mongoose models (`User`, `Room`, `Device`, `Command`), service layer (`roomService.js`, `deviceService.js`, `commandService.js`), validation/response utilities (`src/lib/utils/`), Room/Device REST CRUD endpoints, and dev-only Command Queue APIs (`GET`/`POST /api/commands`, `GET /api/commands/[id]`).
- **Designed (Step 21 — Still Pending Steps 23–26):** Controller provisioning & hashed-token auth (`Controller` model), authenticated `/api/esp32/*` HTTP polling/heartbeat/ACK routes, `deviceService` command auto-enqueue wiring, ESP32-WROOM-32 firmware, and physical relay execution. See [Architecture](docs/ARCHITECTURE.md#esp32-communication-architecture-step-21-design--not-yet-implemented).
- **Room APIs (`/api/rooms`):**
  - `GET /api/rooms` — List rooms (optional `?ownerId=`).
  - `POST /api/rooms` — Create a room (`name`, optional `description`, optional `ownerId`).
  - `GET /api/rooms/[id]` — Fetch a room by valid `ObjectId`.
  - `PATCH /api/rooms/[id]` — Update permitted fields (`name`, `description`).
  - `DELETE /api/rooms/[id]` — Delete an empty room (`409 Conflict` if devices remain attached).
- **Device APIs (`/api/devices`):**
  - `GET /api/devices` — List devices with optional `?roomId=` and `?type=` filters.
  - `POST /api/devices` — Create a device (`name`, valid existing `roomId`, optional `type`, `esp32DeviceId`, `relayNumber`, `desiredState`).
  - `GET /api/devices/[id]` — Fetch a device by valid `ObjectId`.
  - `PATCH /api/devices/[id]` — Update permitted fields (`name`, `type`, `roomId`, `esp32DeviceId`, `relayNumber`, `desiredState`). Updating `desiredState` records target intent only and does not physically toggle an ESP32 relay.
  - `DELETE /api/devices/[id]` — Delete a device safely.
- **Command APIs (`/api/commands` — Dev-Only / `403` in Production):**
  - `GET /api/commands` — Expire stale pending/timed-out commands and list filtered history (`?deviceId=`, `?esp32DeviceId=`, `?status=`, `?limit=`).
  - `POST /api/commands` — Queue a `pending` command (`deviceId` mapped to an ESP32 relay, `action` `on`/`off`, optional `relayNumber`, `ttlSeconds`, `idempotencyKey`) with idempotent replay (`200`) vs conflict (`409`); never alters physical `reportedState`.
  - `GET /api/commands/[id]` — Fetch command details by `commandId` UUID or MongoDB `_id`.
- **Security Notice (Development Only):** User authentication and ESP32 controller token auth are **not yet implemented**. `/api/commands` and `/api/commands/[id]` explicitly return `403 Forbidden` whenever `NODE_ENV === "production"`, and `/api/rooms` / `/api/devices` remain strictly local pre-auth endpoints—do **not** deploy publicly without authentication and session scoping.

## Frontend API Communication Architecture

A reusable client API layer connects future UI views to the Next.js Route Handlers without mixing backend database code into browser components:

- **Axios Client (`src/lib/api/client.js`):** Configured with environment-aware `baseURL` (`NEXT_PUBLIC_API_BASE_URL || "/api"`), JSON headers, `10s` timeout, and centralized error normalization (`ApiError` distinguishing HTTP errors, timeouts, network failures, and `AbortController` cancellations).
- **API Services (`src/services/deviceApi.js`, `src/services/roomApi.js`):** Typed-like JSDoc wrappers for all 10 Room and Device REST operations (`get*`, `get*ById`, `create*`, `update*`, `delete*`), kept cleanly separate from server-only Mongoose services (`deviceService.js`, `roomService.js`).
- **Custom React Hooks (`src/hooks/useDevices.js`, `src/hooks/useRooms.js`):** Manage `loading`, `mutating`, `error`, `lastFetchedAt`, data state, `refresh`, and CRUD operations using `AbortController` cancellation, microtask Strict Mode deduplication, and stale-fetch invalidation via `src/hooks/useCollectionResource.js`, powering the Main Dashboard, Room Management, and Device Management views.

## Getting Started

1. **Install dependencies (includes `mongoose`):**

   ```bash
   npm install
   ```

2. **Configure MongoDB Atlas (`.env.local`):**

   Copy `.env.example` to `.env.local` (already ignored by Git via `.gitignore`) and replace the placeholder with your real MongoDB Atlas connection string:

   ```bash
   cp .env.example .env.local
   ```

   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/jarvis?retryWrites=true&w=majority
   ```

   Never commit `.env.local` or put real credentials inside `.env.example`.

3. **Run the development server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Test the backend APIs:**

   With `.env.local` configured and the dev server running (`npm run dev`), verify the health and CRUD endpoints:

   ```bash
   # 1. Health check (expect HTTP 200 and database: "connected")
   curl http://localhost:3000/api/health

   # 2. Create and list rooms
   curl -X POST http://localhost:3000/api/rooms \
     -H "Content-Type: application/json" \
     -d '{"name":"Smart Room 01","description":"Primary bedroom"}'
   curl http://localhost:3000/api/rooms

   # 3. Create and filter devices (replace <ROOM_ID> with the _id returned above)
   curl -X POST http://localhost:3000/api/devices \
     -H "Content-Type: application/json" \
     -d '{"name":"Main Light","type":"light","roomId":"<ROOM_ID>","desiredState":"on"}'
   curl "http://localhost:3000/api/devices?roomId=<ROOM_ID>&type=light"
   ```

   **Verified endpoints & current limitations:** `GET /api/health`, `/api/rooms`, `/api/rooms/[id]`, `/api/devices`, and `/api/devices/[id]` are verified against MongoDB Atlas for CRUD persistence, validation (`400`), missing records (`404`), and duplicate/delete-conflict guards (`409`), and the main dashboard (`/`) consumes these live endpoints via `useRooms` and `useDevices`. Authentication, role/owner authorization, and live ESP32 relay telemetry/actuation remain pending.

## Available Scripts

- `npm run dev` — Start the Next.js development server
- `npm run build` — Create a production build
- `npm run start` — Serve the production build
- `npm run lint` — Run ESLint checks

## Vercel Deployment Guide (Manual Readiness Checklist)

JARVIS builds cleanly for Vercel's Node.js Serverless runtime without local disk storage, long-running background daemons, or hardcoded `localhost` URLs. Because user authentication is **not yet implemented**, only deploy publicly after enabling authentication—or restrict access using **Vercel Deployment Protection** on private previews:

1. **Prerequisites:** Push this repository cleanly to GitHub (`.env.local` is gitignored via `.env*`; never commit secrets) and verify your MongoDB Atlas cluster **Network Access** allows Vercel's dynamic serverless egress IPs with strong DB user credentials.
2. **Import to Vercel:** In the Vercel dashboard, choose **Add New Project -> Import Git Repository**, select this GitHub repo, keep the **Next.js** framework preset and repository root (`./`), and leave default build/install commands (`npm run build`, `npm install`).
3. **Configure Environment Variables (Project Settings -> Environment Variables):**
   - `MONGODB_URI` *(Required, server-only)* — Your MongoDB Atlas connection string. **Never** prefix with `NEXT_PUBLIC_`.
   - `NEXT_PUBLIC_API_BASE_URL` *(Optional)* — Leave unset so client requests use same-origin `/api` (`src/lib/api/client.js`).
4. **Deploy & Verify:**
   - Trigger **Deploy** and inspect build logs.
   - Verify `GET https://<your-app>.vercel.app/api/health` returns HTTP `200` with `{ "success": true, "database": "connected" }`.
   - Verify `GET https://<your-app>.vercel.app/api/commands` returns HTTP `403 Forbidden` (production safety lock active until authentication is added).
   - Enable Vercel Deployment Protection for private access until user auth and `/api/devices` + `/api/rooms` session scoping land.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
