# JARVIS – AI Powered Smart Room Automation System

A futuristic, mobile-first web application for smart room automation and personal AI assistance, built with Next.js (App Router), JavaScript, Tailwind CSS, Lucide React, and GSAP.

## Project Structure

```text
jarvis/
├── public/
├── src/
│   ├── app/
│   ├── components/
│   │   ├── layout/
│   │   ├── dashboard/
│   │   └── ui/
│   ├── features/
│   │   ├── devices/
│   │   ├── assistant/
│   │   └── automation/
│   ├── hooks/
│   ├── lib/
│   └── services/
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

The primary route (`/`) delivers a redesigned, mobile-first smart room HUD built around the existing color palette and typography:

- **UI Design Highlights:** Compact sticky header with mock connectivity state (`Online` / `Offline`) and preview profile icon, a circular concentric AI Core hero centerpiece (`SYSTEM STANDBY`), a compact `Smart Room 01` telemetry overview bar, consistent glassmorphic device cards, and a safe-area-aware fixed bottom navigation bar (`Home` active; `Assistant`, `Automation`, and `Settings` disabled placeholders).
- **GSAP Animation Features:** Multi-speed concentric AI Core ring rotation (with stationary central `JARVIS` branding), soft core glow pulse, lightweight radial scanning sweep, staggered dashboard entrance, and tactile desktop hover / mobile press / toggle state micro-interactions—all wrapped in `gsap.context()` with `prefers-reduced-motion` support.
- **Responsive Design Support:** Mobile-first layout tuned across small phones (`360px`, `390px`, `430px`), tablets (`768px`), and desktop (`1440px`) without horizontal overflow, transitioning from a single-column mobile stack into a balanced 2-column desktop HUD grid with a centered floating bottom dock.
- **Demo-Only Device Controls:** Toggle switches for **Main Light**, **Fan**, **LED Strip**, and **Night Light** operate strictly via local React `useState` mock data—no ESP32 hardware, backend API, MongoDB, or AI engine is connected yet.

## Screenshots

_Screenshots will be added once additional feature views (Assistant, Automation, and Settings) are implemented. Run `npm run dev` locally to preview the live mobile and desktop HUD._

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables (optional):**

   ```bash
   cp .env.example .env.local
   ```

3. **Run the development server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` — Start the Next.js development server
- `npm run build` — Create a production build
- `npm run start` — Serve the production build
- `npm run lint` — Run ESLint checks

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
