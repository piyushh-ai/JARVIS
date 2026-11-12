# JARVIS – AI Powered Smart Room Automation System

A futuristic, mobile-first web application for smart room automation and personal AI assistance, built with Next.js (App Router), JavaScript, Tailwind CSS, Lucide React, and GSAP.

## Project Structure

```text
jarvis/
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.js
│   │   │   │   ├── logout/route.js
│   │   │   │   ├── me/route.js
│   │   │   │   └── register/route.js
│   │   │   ├── commands/
│   │   │   │   ├── route.js
│   │   │   │   └── [id]/
│   │   │   │       └── route.js
│   │   │   ├── esp32/
│   │   │   │   ├── commands/
│   │   │   │   │   ├── [commandId]/ack/route.js
│   │   │   │   │   └── pending/route.js
│   │   │   │   ├── controllers/
│   │   │   │   │   ├── route.js
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.js
│   │   │   │   │       ├── revoke/route.js
│   │   │   │   │       └── rotate/route.js
│   │   │   │   ├── heartbeat/route.js
│   │   │   │   └── status/route.js
│   │   │   ├── diagnostics/
│   │   │   │   └── route.js
│   │   │   ├── health/
│   │   │   │   └── route.js
│   │   │   ├── homes/
│   │   │   │   ├── route.js
│   │   │   │   ├── switch/route.js
│   │   │   │   └── [id]/members/
│   │   │   │       ├── route.js
│   │   │   │       └── [memberId]/route.js
│   │   │   ├── rooms/
│   │   │   │   ├── route.js
│   │   │   │   └── [id]/
│   │   │   │       └── route.js
│   │   │   └── scenes/
│   │   │       ├── route.js
│   │   │       └── [sceneId]/execute/
│   │   │           └── route.js
│   │   ├── devices/
│   │   │   ├── route.js
│   │   │   └── [id]/
│   │   │       ├── route.js
│   │   │       └── toggle/route.js
│   │   ├── login/page.js
│   │   ├── register/page.js
│   │   ├── globals.css
│   │   ├── layout.js
│   │   └── page.js
│   ├── components/
│   │   ├── layout/
│   │   ├── dashboard/
│   │   └── ui/
│   ├── features/
│   │   ├── auth/
│   │   │   └── AuthFormView.jsx
│   │   ├── controllers/
│   │   │   ├── ControllerManagementSection.jsx
│   │   │   └── ControllerProvisionModal.jsx
│   │   ├── dashboard/
│   │   │   └── DashboardClient.jsx
│   │   ├── devices/
│   │   │   ├── DeviceFormModal.jsx
│   │   │   └── DeviceManagementSection.jsx
│   │   ├── rooms/
│   │   │   ├── RoomFormModal.jsx
│   │   │   └── RoomManagementSection.jsx
│   │   ├── scenes/
│   │   │   └── SmartScenesSection.jsx
│   │   ├── assistant/
│   │   └── automation/
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useCollectionResource.js
│   │   ├── useControllers.js
│   │   ├── useDevices.js
│   │   └── useRooms.js
│   ├── lib/
│   │   ├── api/
│   │   │   └── client.js
│   │   ├── auth/
│   │   │   ├── guards.js
│   │   │   ├── password.js
│   │   │   └── session.js
│   │   ├── db/
│   │   │   └── connect.js
│   │   ├── hardware/
│   │   │   └── relayModules.js
│   │   ├── scenes/
│   │   │   └── sceneDefinitions.js
│   │   ├── utils/
│   │   │   ├── apiResponse.js
│   │   │   ├── rateLimit.js
│   │   │   ├── telemetry.js
│   │   │   └── validation.js
│   │   └── motion.js
│   ├── models/
│   │   ├── AutomationRule.js
│   │   ├── Command.js
│   │   ├── Controller.js
│   │   ├── Home.js
│   │   ├── RateLimit.js
│   │   ├── Session.js
│   │   ├── User.js
│   │   ├── Room.js
│   │   └── Device.js
│   ├── scripts/
│   │   └── migrate-legacy-home.mjs
│   ├── services/
│   │   ├── ai/
│   │   │   ├── assistantService.js
│   │   │   ├── deviceTools.js
│   │   │   ├── homeContextService.js
│   │   │   └── roomTools.js
│   │   ├── automation/
│   │   │   └── automationService.js
│   │   ├── authApi.js
│   │   ├── authService.js
│   │   ├── commandService.js
│   │   ├── controllerApi.js
│   │   ├── deviceApi.js
│   │   ├── deviceService.js
│   │   ├── hardwareService.js
│   │   ├── roomApi.js
│   │   ├── roomService.js
│   │   ├── sceneApi.js
│   │   └── sceneService.js
│   ├── proxy.js
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

- **UI Design Highlights:** Compact sticky header showing real backend sync status (`API Ready` / `Syncing` / `Offline`), manual dashboard refresh button, interactive Account & Home switcher dropdown (with inline Create Home), and Logout button; circular concentric AI Core hero centerpiece (`SYSTEM STANDBY`, room/device summary pills); MongoDB-backed `RoomOverview` Dashboard Overview; room & device management grids; and a safe-area-aware fixed bottom navigation bar (`Home` active; `Assistant`, `Automation`, and `Settings` disabled placeholders). Dedicated `/login` and `/register` HUD views match the theme and GSAP animations.
- **Dashboard Metrics & Live Data Sources:** Server Component `src/app/page.js` verifies session auth inside `<Suspense>` and seeds `DashboardClient`, where `useAuth()`, `useRooms({ homeId })`, and `useDevices({ homeId })` scope data cleanly to the active authorized `Home`. Derives exact MongoDB counts (`Total Rooms`, `Devices`, `Desired ON`, `Connection Status` broken down into `HW Online` / `Offline` / `Unknown`, `Reported State` breakdown, `Device Types Summary` across `light`/`fan`/`led`/`other`, and rooms grouped with assigned devices including `0 Devices` rooms), provides room-to-device navigation links (`#rooms-section`, `#devices-section`), and renders loading, error+retry, empty, and manual-refresh states.
- **GSAP Animation Features:** Multi-speed concentric AI Core ring rotation (with stationary central `JARVIS` branding), soft core glow pulse, lightweight radial scanning sweep, coordinated landmark entrance, post-load device card stagger, and tactile desktop hover / mobile press / toggle state micro-interactions—all wrapped in `gsap.context()` with `prefers-reduced-motion` support.
- **Responsive Design Support:** Mobile-first layout tuned across small phones (`360px`, `390px`, `430px`), tablets (`768px`), and desktop (`1440px`) without horizontal overflow, transitioning from a single-column mobile stack into a balanced 2-column desktop HUD grid with a centered floating bottom dock.
- **MongoDB-Backed Room Management:** Lists all smart rooms in the active Home with name, description, accurate assigned device count, and per-room device chips (`RoomManagementSection`, `RoomFormModal`), supports room filtering into the devices grid, and enforces backend `409` safe deletion (blocking removal when devices remain assigned without silently deleting or reassigning devices).
- **MongoDB-Backed Device Management & Optimistic Command Wiring:** Lists persisted devices in the active Home (`name`, `type`, room name, `connectionStatus`, `desiredState`, `reportedState`, mapped ESP32 controller ID + relay `#` or unmapped indicator), prevents duplicate relay or cross-Home controller mapping in `DeviceFormModal`, and connects device ON/OFF toggles directly to `POST /api/devices/[id]/toggle` via `useDevices().toggleDevice()`. Toggling updates UI `desiredState` optimistically (`< 16 ms` perceived response) with per-device toggle queuing, rollback on error, explicit **Pending HW ACK** / **HW Synced** / **Cmd Failed** badges, and visibility-aware adaptive background reconciliation polling (`2s` -> `5s`, `0` idle polling when synced). Backend validates an active mapped ESP32 controller & relay, supersedes stale pending commands safely with total ordering, enforces `idempotencyKey` deduplication, updates `desiredState`, queues a `pending` `Command`, and leaves `reportedState` strictly hardware-ACK-driven.
- **ESP32 Controller Provisioning UI (`ControllerManagementSection`, `ControllerProvisionModal`):** Displays Home-scoped controllers with online/offline/awaiting-heartbeat/revoked status, `tokenPrefix`, `lastSeen`, `firmwareVersion`, Relay Channel 1 config (bench-verified reference `GPIO 13`, Active `LOW`, `safeBootState: "off"`), dual 4-channel expansion readiness (`Module A CH 1-4`, `Module B CH 5-8` unverified beyond CH 1), and mapped devices. Authorized Home owners/admins can provision controllers, view/copy the generated bearer token ONCE inside an ephemeral reveal modal, update config (`PATCH /api/esp32/controllers/[id]`), rotate tokens, or revoke compromised boards.
- **Smart Scenes (`SmartScenesSection`, `sceneService.js`, `/api/scenes/[sceneId]/execute`):** Provides one-tap HUD scene presets (**Good Morning**: Main Light ON & Mandir Light ON; **Good Night** / **Away Mode**: all devices OFF; **All Lights ON / OFF**: strictly filters `type === "light"` devices). Dynamically resolves devices from MongoDB scoped by authorized `Home`, dispatches all commands through `toggleDeviceById` (`Command` queue without modifying `reportedState`), handles HTTP `207` partial failures and `422` full failures cleanly, prevents duplicate execution via `idempotencyKey` replay + distributed `2500 ms` `RateLimit` cooldown (`409` on rapid re-triggers) + UI in-flight/cooldown locks, and feeds results into `useDevices().applySceneOutcome` for automatic ESP32 ACK reconciliation.
- **Current QA & Performance Status:** ESLint (`npm run lint`), production build (`npm run build`), `.next/static` bundle secret scan, HTTP security headers (`next.config.mjs`), `16 KB` payload limits (`413`), Home `owner`/`admin`/`member` RBAC + diagnostics (`GET /api/diagnostics`), ESR-indexed Command polling (`69.7 ms` p50 empty poll, `72.3 ms` p50 claim vs ~1200–1300 ms pre-audit baseline) and optimistic ACK (`106.3 ms` p50 vs ~1500–1700 ms baseline), Smart Scenes E2E suite (auth/cross-home isolation, dynamic target matching across 4+ relays, duplicate `409`/idempotency `200`, HTTP `207` partial failures, ESP32 ACK lifecycle), AI/Automation permissioned service seams (`src/services/ai/*`, `src/services/automation/*`), and full E2E hardware command lifecycle pass against `next start` + MongoDB Atlas. Remaining tasks: bench-verify channels 2–8, flash `ESP32-WROOM-32` firmware, live Chrome browser QA, and wire real LLM/Cron integrations.

## Screenshots

_Screenshots will be added once additional feature views (Assistant, Automation, and Settings) are implemented. Run `npm run dev` locally to preview the live mobile and desktop HUD._

## Backend Architecture

JARVIS uses **Next.js App Router Route Handlers** (`src/app/api/`) instead of a separate Express server, paired with **MongoDB Atlas** via **Mongoose**:

- **Layered separation:** Connection caching lives in `src/lib/db/connect.js`, route handlers in `src/app/api/`, Mongoose schemas in `src/models/`, business logic in `src/services/`, and shared helpers in `src/lib/utils/`.
- **Database Models (`src/models/`):**
  - `User` — User identity (`name`, unique normalized `email`, `passwordHash` hidden by default via `select: false`, `role`, `status`, `currentHomeId`, UI `preferences`, timestamps).
  - `Session` — Database-backed opaque sessions (`userId`, unique hashed `tokenHash`, `currentHomeId`, `expiresAt` with MongoDB TTL cleanup, `lastUsedAt`, `revokedAt`, timestamps).
  - `Home` — Home workspaces (`name`, `ownerId`, `members: [{ userId, role ("owner" | "admin" | "member"), joinedAt }]`, timestamps).
  - `RateLimit` — Distributed MongoDB-backed fixed-window counters (`key`, `count`, `expiresAt` TTL).
  - `Room` — Smart rooms (`name`, `description`, `homeId` -> `Home`, `ownerId` -> `User`, partial unique `{ homeId: 1, name: 1 }` index, timestamps).
  - `Device` — Smart-room endpoints (`name`, `type`, `roomId`, `homeId`, `ownerId`, optional ESP32 hardware mapping `esp32DeviceId` + `relayNumber`, `connectionStatus`, `lastSeen`, and separate `desiredState` vs. `reportedState` tracking).
  - `Command` — Persistent hardware command queue (`commandId` UUID, `deviceId`, `esp32DeviceId`, `homeId`, `ownerId`, `relayNumber`, `action` `on`/`off`, `status` `pending | processing | success | failed | expired`, `attemptCount`/`maxAttempts`, `processingStartedAt`/`processingUntil` lease, `expiresAt`, `retainUntil` 30-day TTL cleanup, `executedAt`, `result`, `errorReason`, partial unique `idempotencyKey`, timestamps).
  - `Controller` — Physical ESP32 controller identity (`esp32DeviceId`, optional `homeId` & `ownerId`, peppered SHA-256 `tokenHash` + `previousTokenHash` with `select: false`, `tokenPrefix`, `tokenVersion`, `status` `provisioning | active | revoked`, `relayConfig`, `firmwareVersion`, `lastRssi`, `lastBootReason`, `freeHeapBytes`, `uptimeSeconds`, `lastSeen`, timestamps).
  - `AutomationRule` — Foundation schema for future external cron/sensor rules (`homeId`, `ownerId`, `name`, `enabled`, `triggerType`, `scheduleCron`, `offsetMinutes`, `timezone`, `manualOverrideUntil`, `actions`, `nextRunAt`, `lastTriggeredAt`, bounded `recentExecutions`, timestamps).
- **Implemented now:** HTTP-only DB session authentication (`scrypt` + `timingSafeEqual`), multi-home role authorization (`owner` / `admin` / `member`), CSRF same-origin enforcement on state-changing routes, MongoDB distributed rate limiting, `GET /api/health`, `/api/auth/*`, `/api/homes*`, scoped `/api/rooms*` + `/api/devices*` + `/api/commands*`, Home owner/admin ESP32 controller provisioning UI (`ControllerManagementSection`, one-time token reveal), dashboard toggle-to-command queue wiring (`POST /api/devices/[id]/toggle`), and machine-authenticated ESP32 Hardware APIs (`/api/esp32/{heartbeat,commands/*,status}`).
- **Pending Future Work:** Bench GPIO/polarity verification on physical relay modules, `ESP32-WROOM-32` Arduino/ESP-IDF C++ firmware, and hardware-in-the-loop QA. See [Architecture](docs/ARCHITECTURE.md).
- **Auth & Home APIs (`/api/auth/*`, `/api/homes*`):**
  - `POST /api/auth/register` — Validate user input (`password >= 8`), hash password with `scrypt`, create User + default Home + DB Session + `HttpOnly` `jarvis_session` cookie (rate-limited).
  - `POST /api/auth/login` — Generic-error credential check (`scrypt`), create DB Session + set `HttpOnly` cookie (rate-limited per IP & email).
  - `POST /api/auth/logout` — Revoke DB session (`revokedAt`) and clear `jarvis_session` cookie.
  - `GET /api/auth/me` — Verify active DB session cookie and return authenticated user, authorized Homes, and `currentHome`.
  - `GET / POST /api/homes` & `POST /api/homes/switch` — List authorized Homes, create a new Home (making caller `"owner"`), or switch active Home.
  - `GET / POST /api/homes/[id]/members` & `PATCH / DELETE /api/homes/[id]/members/[memberId]` — Manage Home members and roles (enforcing `owner`/`admin` boundaries and anti-self-escalation).
- **Room APIs (`/api/rooms` — Session + Home Scoped):**
  - `GET /api/rooms` — List rooms in the caller's active/authorized Home (`?homeId=`).
  - `POST /api/rooms` — Create a room (`owner` / `admin` only; `homeId` and `ownerId` derived server-side).
  - `GET /api/rooms/[id]` — Fetch a room within an authorized Home (`403` cross-home).
  - `PATCH /api/rooms/[id]` — Update `name` or `description` (`owner` / `admin` only).
  - `DELETE /api/rooms/[id]` — Delete an empty room (`owner` / `admin` only; `409 Conflict` if devices remain attached).
- **Device APIs (`/api/devices` — Session + Home Scoped):**
  - `GET /api/devices` — List devices in the authorized Home (`?homeId=`, `?roomId=`, `?type=`).
  - `POST /api/devices` — Create a device (`owner` / `admin` only; verifies target room & optional ESP32 controller belong to same Home and blocks duplicate relays).
  - `GET /api/devices/[id]` — Fetch a device within an authorized Home (`403` cross-home).
  - `PATCH /api/devices/[id]` — Update device details (`owner` / `admin`, enforcing same-Home controller ownership and unique `(esp32DeviceId, relayNumber)`), or toggle `desiredState` metadata (`member`).
  - `POST /api/devices/[id]/toggle` — Authenticated toggle-to-command flow (`owner` / `admin` / `member`): verifies active mapped ESP32 controller & relay, supersedes stale pending commands, honors `idempotencyKey`, updates `desiredState`, enqueues `pending` `Command`, and preserves `reportedState` until verified ESP32 ACK.
  - `DELETE /api/devices/[id]` — Delete a device (`owner` / `admin` only).
- **Command APIs (`/api/commands` — Session + Home Scoped):**
  - `GET /api/commands` — Expire stale pending/timed-out commands and list filtered history scoped to authorized Home (`?homeId=`, `?deviceId=`, `?esp32DeviceId=`, `?status=`, `?limit=`).
  - `POST /api/commands` — Queue a `pending` command for a device mapped to an active controller in the authorized Home (`owner` / `admin` / `member`).
  - `GET /api/commands/[id]` — Fetch command details belonging to the authorized Home (`403` cross-home).
- **ESP32 Controller Management & Hardware APIs (`/api/esp32/*`):**
  - `GET / POST /api/esp32/controllers` *(Authenticated Session + Home Scope)* — List sanitized controllers in caller's Home (`tokenHash`/`previousTokenHash` excluded) or provision a controller (`owner`/`admin` only, rate-limited, returns `rawToken` ONCE).
  - `POST /api/esp32/controllers/[id]/rotate` & `.../revoke` *(Authenticated Home `owner`/`admin` Session)* — Rotate controller secret with optional overlap (`graceMinutes`) returning new `rawToken` ONCE, or immediately revoke (`status: "revoked"` + mark bound Home devices `"offline"`).
  - `POST /api/esp32/heartbeat` *(`X-Device-Id` + `Authorization: Bearer <token>`)* — Updates `Controller.lastSeen`/diagnostics, marks bound devices `"online"`, expires overdue commands, and returns `pendingCommandCount`.
  - `GET /api/esp32/commands/pending` *(`X-Device-Id` + `Authorization: Bearer <token>`)* — Atomically claims pending/retryable commands scoped strictly to that `esp32DeviceId`.
  - `POST /api/esp32/commands/[commandId]/ack` *(`X-Device-Id` + `Authorization: Bearer <token>`)* — Idempotent completion (`success` / `failed`) updating `Device.reportedState` strictly from verified hardware outcomes.
  - `POST /api/esp32/status` *(`X-Device-Id` + `Authorization: Bearer <token>`)* — Boot/recovery channel reconciliation updating `Device.reportedState` + `connectionStatus: "online"` without altering user `desiredState`.
- **Security Notice:** User & controller provisioning routes enforce verified database sessions (`HttpOnly`, `SameSite=Lax`, `Secure` in production), same-origin CSRF checks on mutations, Home-membership IDOR checks, `owner`/`admin`/`member` RBAC, and MongoDB-backed distributed rate limiting. Device runtime routes (`/api/esp32/{heartbeat,commands/*,status}`) strictly retain independent `X-Device-Id` + peppered Bearer token authentication.

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

4. **Sign in & Migrate Pre-Auth Data (if upgrading an existing database):**

   Open [http://localhost:3000/register](http://localhost:3000/register) to create an account and your initial Home.

   If you have pre-existing un-scoped rooms/devices (for example created with the legacy development owner ID before authentication), assign them safely to your registered account without losing data:

   ```bash
   # Preview legacy records without modifying MongoDB
   node src/scripts/migrate-legacy-home.mjs --email=you@example.com --dry-run

   # Attach legacy rooms/devices/commands/controllers to your account's Home and sync indexes
   node src/scripts/migrate-legacy-home.mjs --email=you@example.com
   ```

5. **Test the authenticated backend APIs:**

   With `.env.local` configured and the dev server running (`npm run dev`), verify health and session-protected endpoints using a cookie jar (`cookies.txt`):

   ```bash
   # 1. Health check (expect HTTP 200 and database: "connected")
   curl http://localhost:3000/api/health

   # 2. Register or log in (stores jarvis_session HTTP-only cookie)
   curl -c cookies.txt -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Operator","email":"operator@example.com","password":"StrongPassword123","homeName":"Main Home"}'

   # 3. Create and list rooms inside your active Home
   curl -b cookies.txt -X POST http://localhost:3000/api/rooms \
     -H "Content-Type: application/json" \
     -d '{"name":"Smart Room 01","description":"Primary bedroom"}'
   curl -b cookies.txt http://localhost:3000/api/rooms

   # 4. Create and filter devices (replace <ROOM_ID> with the _id returned above)
   curl -b cookies.txt -X POST http://localhost:3000/api/devices \
     -H "Content-Type: application/json" \
     -d '{"name":"Main Light","type":"light","roomId":"<ROOM_ID>","desiredState":"on"}'
   curl -b cookies.txt "http://localhost:3000/api/devices?roomId=<ROOM_ID>&type=light"
   ```

   **Verified endpoints:** `GET /api/health`, `/api/auth/*`, `/api/homes*`, `/api/rooms*`, `/api/devices*`, `/api/scenes*`, `/api/commands*`, `/api/diagnostics`, and `/api/esp32/*` are verified against MongoDB Atlas for authentication, cross-home IDOR isolation (`403`), role enforcement, validation (`400`), missing records (`404`), conflicts (`409`), partial scenes (`207`), and distributed rate limiting (`429`).

## Available Scripts

- `npm run dev` — Start the Next.js development server
- `npm run build` — Create a production build
- `npm run start` — Serve the production build
- `npm run lint` — Run ESLint checks

## Vercel Deployment Guide (Manual Readiness Checklist)

JARVIS builds cleanly for Vercel's Node.js Serverless runtime without local disk storage, long-running background daemons, or hardcoded `localhost` URLs:

1. **Prerequisites:** Push this repository cleanly to GitHub (`.env.local` is gitignored via `.env*`; never commit secrets) and verify your MongoDB Atlas cluster **Network Access** allows Vercel's dynamic serverless egress IPs with strong DB user credentials.
2. **Import to Vercel:** In the Vercel dashboard, choose **Add New Project -> Import Git Repository**, select this GitHub repo, keep the **Next.js** framework preset and repository root (`./`), and leave default build/install commands (`npm run build`, `npm install`).
3. **Configure Environment Variables (Project Settings -> Environment Variables):**
   - `MONGODB_URI` *(Required, server-only)* — Your MongoDB Atlas connection string. **Never** prefix with `NEXT_PUBLIC_`.
   - `SESSION_SECRET` *(Recommended, server-only)* — HMAC pepper for hashing `jarvis_session` cookies in MongoDB.
   - `ESP32_TOKEN_PEPPER` *(Recommended, server-only)* — HMAC pepper for hashing per-device ESP32 Bearer tokens.
   - `NEXT_PUBLIC_API_BASE_URL` *(Optional)* — Leave unset so client requests use same-origin `/api` (`src/lib/api/client.js`).
4. **Deploy & Verify:**
   - Trigger **Deploy** and inspect build logs.
   - Verify `GET https://<your-app>.vercel.app/api/health` returns HTTP `200` with `{ "success": true, "database": "connected" }`.
   - Verify unauthenticated `GET https://<your-app>.vercel.app/api/rooms` returns HTTP `401 Unauthorized` and unauthenticated visits to `/` redirect cleanly to `/login?next=%2F`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
