# Architecture

## Overview

`jarvis` is a Next.js App Router web application built with React and Tailwind CSS.

## Tech Stack

- **Framework:** Next.js (`16.4.6`) with App Router & Turbopack
- **UI Library:** React (`19.3.0`)
- **Styling:** Tailwind CSS (`4.3.3`) via `@tailwindcss/turbopack`
- **Linting:** ESLint (`eslint-config-next`)

## Directory Structure

```text
jarvis/
├── public/                 # Static assets served from /
├── src/
│   └── app/                # App Router pages, layouts, and global styles
├── docs/
│   ├── ROADMAP.md          # Planned milestones and task tracking
│   └── ARCHITECTURE.md     # System and repository architecture
├── README.md               # Project overview and setup instructions
├── .env.example            # Template for environment variables
├── .gitignore              # Git ignore rules
└── package.json            # Dependencies and npm scripts
```

## Configuration Notes

- **Source directory (`src/`):** Application routes and UI code live under `src/app/`, with the `@/*` path alias mapped to `./src/*` in `jsconfig.json`.
- **Next.js features (`next.config.mjs`):** `cacheComponents`, `partialPrefetching`, and `experimental.agentFeedback` are enabled alongside Turbopack CSS handling.
- **Environment variables:** Copy `.env.example` to `.env.local` for local overrides; `.env*` files except `.env.example` are gitignored.

