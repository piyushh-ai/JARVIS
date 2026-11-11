# Architecture

## Overview

`JARVIS` is an AI-powered smart room automation and personal assistant web application built with Next.js App Router, JavaScript, Tailwind CSS, Lucide React, and GSAP.

## Tech Stack

- **Framework:** Next.js (`16.4.6`) with App Router & Turbopack
- **UI Library:** React (`19.3.0`)
- **Language:** JavaScript (ES6+)
- **Styling:** Tailwind CSS (`4.3.3`) via `@tailwindcss/turbopack`
- **Icons:** Lucide React (`1.71.0`)
- **Animation:** GSAP (`3.15.1`)
- **Linting:** ESLint (`eslint-config-next`)

## Directory Structure

```text
jarvis/
├── public/                 # Static assets served from /
├── src/
│   ├── app/                # App Router layout, pages, and global design system CSS
│   ├── components/         # Reusable layout, dashboard, and UI primitives
│   ├── features/           # Domain modules (devices, assistant, automation)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Shared helpers and utilities
│   └── services/           # External/API client integrations
├── docs/
│   ├── ROADMAP.md          # Planned milestones and task tracking
│   └── ARCHITECTURE.md     # System, folder, and design system architecture
├── README.md               # Project overview and setup instructions
├── .env.example            # Template for environment variables
├── .gitignore              # Git ignore rules
└── package.json            # Dependencies and npm scripts
```

## Configuration Notes

- **Source directory (`src/`):** Application code lives under `src/`, with the `@/*` path alias mapped to `./src/*` in `jsconfig.json`.
- **Next.js features (`next.config.mjs`):** `cacheComponents`, `partialPrefetching`, and `experimental.agentFeedback` are enabled alongside Turbopack CSS handling.
- **Environment variables:** Copy `.env.example` to `.env.local` for local overrides; `.env*` files except `.env.example` are gitignored.

---

## Frontend Design System

### Design Philosophy

The JARVIS interface draws inspiration from futuristic Iron Man HUD systems while staying minimal, crisp, and practical for everyday smart-room control. Contrast, clear visual hierarchy, and touch ergonomics take priority over heavy visual effects—cyan accents and subtle glows highlight active states and telemetry without overwhelming readability.

### Color Palette

Defined as global CSS custom properties in `src/app/globals.css` and mapped to Tailwind theme tokens via `@theme inline`:

| Token | CSS Variable | Hex Value | Usage |
| --- | --- | --- | --- |
| Background | `--bg-primary` | `#05080F` | App canvas and viewport base |
| Surface | `--bg-surface` | `#0B1220` | Cards, panels, navigation containers |
| Primary Cyan | `--accent-cyan` | `#00E5FF` | Active states, focus rings, subtle HUD glows |
| Secondary Blue | `--accent-blue` | `#1677FF` | Secondary actions, supportive accents |
| Primary Text | `--text-primary` | `#EAFBFF` | Headings and primary body copy |
| Muted Text | `--text-muted` | `#8295A8` | Secondary labels, metadata, timestamps |

### Typography

Loaded and self-hosted in `src/app/layout.js` via `next/font/google` with CSS variables:

- **Headings & Branding (`Orbitron` / `--font-orbitron`):** Exposed as `--font-display` / `.font-display` and applied to `h1`–`h4` for technical HUD headers and JARVIS branding.
- **Body & Interface Text (`Inter` / `--font-inter`):** Exposed as `--font-sans` and applied globally to `body` for high legibility on small mobile screens and dense controls.

### Styling Approach

- **Tailwind CSS v4 (`@import "tailwindcss";`):** Primary styling layer for components and layout utilities, extended through `@theme inline` tokens (`bg-background`, `bg-surface`, `text-foreground`, `text-muted`, `font-sans`, `font-display`).
- **Global Reset & Accessibility (`@layer base`):** Box-sizing reset, dark `color-scheme`, smooth scrolling (honoring `prefers-reduced-motion: reduce`), custom thin scrollbars, cyan text selection, and high-contrast `:focus-visible` outlines.
- **Reusable HUD Utilities (`@layer utilities`):** Subtle surface and border helpers (`.hud-surface`, `.hud-surface-elevated`, `.hud-border`, `.hud-border-active`, `.hud-divider`), restrained glow classes (`.glow-cyan-sm`, `.glow-cyan`, `.glow-cyan-text`), and a lightweight CSS grid background (`.bg-hud-grid`).

### Responsive Design Strategy

- **Mobile-first baseline (`360px`, `390px`, `430px`):** Styles, `16px` root typography, `100dvh` height, `touch-action: manipulation`, safe-area bottom insets, and `.hud-container` (`1rem` horizontal padding) prioritize smartphones without horizontal clipping or overflow.
- **Tablet & Desktop scaling (`768px`, `1440px`):** At `md` (`768px`), device cards expand to a 4-column row and `BottomNav` floats as a centered `max-w-md` dock. At `lg` (`1024px`–`1440px+`), `.hud-container` caps at `80rem` and renders a balanced 12-column cockpit (`AICore` on the left 5 columns; `RoomOverview` and a `2x2` `DeviceCard` matrix on the right 7 columns).

### GSAP Animation Architecture

Global CSS avoids heavy keyframe animations and conflicting CSS `transform` transitions on GSAP-managed nodes. Client components orchestrate all HUD motion via **GSAP**:

- **Dashboard Entrance (`src/app/page.js`):** A coordinated `gsap.timeline()` animates `[data-gsap="header"]`, `[data-gsap="ai-core"]`, `[data-gsap="room-overview"]`, and staggered `[data-gsap="device-card"]` elements (`clearProps: "transform,opacity"`).
- **AI Core (`src/components/dashboard/AICore.jsx`):** Infinite multi-speed concentric ring rotations (`outerRingRef` 34s, `middleRingRef` -22s, `innerRingRef` 15s) keeping central `JARVIS` branding stationary, combined with a gentle glow breathing pulse (`glowRef`) and a lightweight radial conic-gradient scanning sweep (`scanBeamRef`).
- **Device Card Micro-Interactions (`src/components/dashboard/DeviceCard.jsx`):** Pointer-gated desktop hover lift (`supportsHover()`), mobile press scale feedback, and toggle-triggered icon badge/status dot pops.

#### Lifecycle, Cleanup & Reduced Motion

- Every animation block runs inside `useEffect` wrapped in `gsap.context(..., containerRef)` and reverts cleanly on unmount via `return () => ctx.revert()` to prevent memory leaks or duplicate timelines under React Strict Mode.
- `src/lib/motion.js` exposes `prefersReducedMotion()` and `supportsHover()`. When `prefers-reduced-motion: reduce` is enabled, GSAP timelines and tweens are skipped while `globals.css` disables smooth scrolling.

---

## Dashboard Component Architecture

The mobile-first dashboard (`src/app/page.js`) composes focused layout and HUD components backed by local mock React state (with no backend API, MongoDB, AI engine, or ESP32 communication):

```text
src/app/page.js (Mock State & Entrance Timeline)
├── components/layout/Header.jsx
├── components/dashboard/AICore.jsx
├── components/dashboard/RoomOverview.jsx
├── components/dashboard/DeviceCard.jsx (x4 demo devices)
├── components/layout/BottomNav.jsx
└── lib/motion.js (Motion capability helpers)
```

### Component Responsibilities

- **`src/app/page.js`:** Owns the local `useState` array for the four mock devices (`Main Light`, `Fan`, `LED Strip`, `Night Light`), computes active device count, coordinates the staggered GSAP entrance timeline, and arranges the responsive layout grid.
- **`src/components/layout/Header.jsx`:** Compact sticky HUD header displaying the `JARVIS` wordmark, `SMART ROOM OS · DEMO` subtitle, mock `Online`/`Offline` connectivity indicator, and a disabled profile preview button.
- **`src/components/layout/BottomNav.jsx`:** Fixed bottom navigation bar with safe-area padding and floating dock styling at `md+`. Only `Home` (`/`) is interactive; `Assistant`, `Automation`, and `Settings` render as disabled placeholders.
- **`src/components/dashboard/AICore.jsx`:** Hero circular HUD centerpiece with concentric cyan/blue rings, stationary `JARVIS` branding, `SYSTEM STANDBY` indicator, compact node count chip, and GSAP rotation/pulse/scan loops.
- **`src/components/dashboard/RoomOverview.jsx`:** Compact telemetry summary card presenting `Smart Room 01`, `Nominal` status badge, and a 3-column hairline summary (`Connected`, `Active`, `Status`).
- **`src/components/dashboard/DeviceCard.jsx`:** Reusable card with Lucide device icon, consistent dimensions, distinct active/inactive HUD styling, accessible toggle button (`aria-pressed` + `aria-label`), local `useState` fallback, and GSAP micro-interactions.
- **`src/lib/motion.js`:** Minimal shared helpers (`prefersReducedMotion`, `supportsHover`) preventing duplicated media-query checks across animated components.
