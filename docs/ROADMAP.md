# Roadmap

## Phase 1: Project Foundation

- [x] Bootstrap Next.js App Router project (`jarvis`)
- [x] Organize application source under `src/`
- [x] Establish documentation (`docs/ARCHITECTURE.md`, `docs/ROADMAP.md`) and `.env.example`

## Phase 2: Frontend HUD & Backend Architecture

### Frontend HUD & Animations

- [x] Global design system (`Orbitron` + `Inter`, cyan/navy HUD palette, Tailwind CSS v4 tokens)
- [x] Mobile-first dashboard foundation (`Header`, `AICore`, `RoomOverview`, `DeviceCard`, `BottomNav`)
- [x] Production UI redesign and responsive polish (`360px`–`1440px`)
- [x] GSAP animation foundation (ring rotation, core pulse, radial scan, entrance stagger, micro-interactions, reduced-motion support)
- [x] Dashboard QA code pass (CSS cascade/responsive `@utility` fixes, GSAP cleanup, accessibility contrast & touch target improvements, lint/build verification)
- [ ] Live Chrome viewport & interactive E2E QA (`360px`–`1440px`, device click/keyboard walkthrough in browser)

### Backend Architecture & Data Layer

- [x] Scaffold backend structure (`src/app/api/health/route.js`, `src/lib/db/connect.js`, `src/lib/utils/`, `src/models/{User,Room,Device}.js`, `src/services/`, `src/types/`)
- [x] Backend architecture & security planning (Next.js Route Handlers, layered service/model flow, env-based secret protection)
- [x] MongoDB Atlas connection (`mongoose` installed, `connect.js` caching & `GET /api/health` verified live against MongoDB Atlas)
- [x] Implement Mongoose data models (`User`, `Room`, `Device` schemas, indexes, validation, and model reuse verified)
- [x] Build shared response/validation utilities (`src/lib/utils/`), service layer (`src/services/`), and Room/Device CRUD API Route Handlers (`src/app/api/rooms`, `src/app/api/devices`) — verified live against MongoDB Atlas (dev-only pre-auth endpoints)
- [x] Backend API testing & MongoDB Atlas persistence QA (`GET /api/health` success/failure modes, Room/Device CRUD, filters, validation, index enforcement, and cleanup verified)
- [x] Frontend API integration foundation (Axios client `src/lib/api/client.js`, `deviceApi`/`roomApi` services, and `useDevices`/`useRooms` hooks verified against live backend)
- [x] Connect Device Management UI & Dashboard to MongoDB APIs (`DeviceManagementSection`, `DeviceFormModal`, `DeviceCard`, loading/empty/error-retry states, and live CRUD persistence verified)
- [x] Room Management UI (`RoomManagementSection`, `RoomFormModal`, per-room device counts & device listings, safe `409` deletion blocking, and refresh persistence verified)
- [x] Complete CRUD & full-stack integration verification (API security/validation, React `StrictMode` request deduplication, cross-room device reassignment sync, `.next/static` secret scan, and lint/build checks pass; manual live Chrome responsive/GSAP verification pending)
- [x] Main Dashboard integration with MongoDB (`RoomOverview`, `AICore`, `Header`, and `DeviceCard` connected to `useRooms`/`useDevices` with live room/device/type/connection summaries, separate `desiredState`/`reportedState`/`connectionStatus`, zero-device room drill-down, manual refresh, and Step 19 verification passed)
- [x] Phase 3 final testing & verification (Step 20: E2E Room/Device/Dashboard CRUD & persistence flows, DB error classification, duplicate `409`/mass-assignment/security guards, stale-filter recovery, `npm run lint`, and `npm run build` verified; live Chrome visual QA & auth remain pending)
## Phase 3 & 4: Hardware Integration & AI Roadmap

### Implemented (Through Step 20)
- Already verified: Next.js App Router HUD, MongoDB Atlas models (`User`, `Room`, `Device`), CRUD APIs, React hooks (`useDevices`, `useRooms`), Room & Device Management UI, and Main Dashboard integration.

### ESP32 Communication Architecture & Rollout

- [x] **Step 21 – ESP32 Communication Architecture Design:** Finalized HTTPS REST polling + heartbeat design, hashed `Controller` token provisioning/rotation/revocation, 5-state `Command` lifecycle (`pending`/`processing`/`success`/`failed`/`expired`), atomic lease claiming & RAM/server idempotency, network/power failure recovery, 8-channel dual-relay safety mapping, and `/api/esp32/*` API & schema specifications in `docs/ARCHITECTURE.md` (design only; no firmware or command routes created yet)
- [x] **Step 22 – Command Queue + MongoDB Implementation:** Implemented `Command` Mongoose model (`src/models/Command.js`), `commandService.js` (`enqueueCommand`, `listCommands`, `getCommandById`, `expireStaleCommands`, `claimPendingCommands`, `acknowledgeCommand`), and dev-only `GET/POST /api/commands` + `GET /api/commands/[id]` (guarded `403 Forbidden` in production until auth lands); verified idempotency (`200`/`409`), relay validation, lifecycle state guards, expiry, retries, ESLint, and build
- [x] **Step 23 – Vercel Deployment Readiness Audit:** Audited `next build`, serverless Node runtime Route Handlers, `.gitignore`/`.env.example` secret isolation, and static client bundles; hardened `src/lib/db/connect.js` for serverless (`maxPoolSize: 10` + stale disconnected socket reset); documented manual Vercel deployment & Atlas egress setup; verified `/api/commands*` `403` production lock and flagged unauthenticated `/api/rooms*` + `/api/devices*` endpoints as pre-public-launch auth blockers
- [x] **ESP32 Backend Communication API Implementation:** Implemented `Controller` model (`src/models/Controller.js`), `hardwareService.js` (`X-Device-Id` Bearer token constant-time auth + non-loopback HTTPS enforcement + controller token lifecycle), MongoDB distributed `rateLimit.js` (`429` burst limiting), and `/api/esp32/{controllers*,heartbeat,commands/pending,commands/[commandId]/ack,status}` routes; verified against live `next start` + MongoDB Atlas
- [x] **Multi-User Authentication & Home Authorization:** Implemented `Session`, `Home`, and `RateLimit` models, `scrypt` password hashing, HTTP-only DB session cookies, `/api/auth/{register,login,logout,me}` and `/api/homes*` APIs, cross-home IDOR + `owner | admin | member` RBAC enforcement across `/api/rooms*`, `/api/devices*`, and `/api/commands*`, protected `/`, `/login`, `/register` routes with Header Home switcher & Logout, CSRF protection, MongoDB-backed distributed rate limiting, and `src/scripts/migrate-legacy-home.mjs`
- [x] **Step 24A – ESP32 Controller Provisioning UI + Command Wiring:** Unified controller provisioning (`GET/POST /api/esp32/controllers`, `rotate`, `revoke`) on authenticated Home `owner`/`admin` sessions (no client secret exposure), built `ControllerManagementSection` & `ControllerProvisionModal` with Relay Channel 1 unassumed-polarity config + ephemeral one-time token reveal/copy, enforced same-Home controller + unique relay mapping in `DeviceFormModal` & `deviceService.js`, wired device ON/OFF toggles via `POST /api/devices/[id]/toggle` (`useDevices().toggleDevice`) to supersede stale pending commands & enqueue `Command` items with `idempotencyKey` while keeping `reportedState` strictly hardware-ACK-driven, and verified via ESLint, Next build, bundle scan, and live E2E tests against `next start` + MongoDB Atlas
- [ ] **Step 25:** Bench-verify GPIO pinout/relay polarity (`2 × 4-channel` relays) and implement modular `ESP32-WROOM-32` firmware (Wi-Fi TLS, NVS token storage, safe boot init, polling/ack)
- [ ] **Step 26:** Hardware-in-the-loop E2E QA (outages, reboots, expiry, rate limiting, audit logs) and optional MQTT/WebSocket transport readiness
- [ ] AI assistant and voice command integration
- [ ] Automation rules engine and sub-page routes (`Assistant`, `Automation`, `Settings`)
- [ ] CI checks and production deployment
