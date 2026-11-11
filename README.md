# jarvis

A [Next.js](https://nextjs.org) application structured with `src/`, static assets in `public/`, and project documentation in `docs/`.

## Project Structure

```text
jarvis/
├── public/
├── src/
├── docs/
│   ├── ROADMAP.md
│   └── ARCHITECTURE.md
├── README.md
├── .env.example
├── .gitignore
└── package.json
```

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

   Open [http://localhost:3000](http://localhost:3000) in your browser and start editing `src/app/page.js`.

## Available Scripts

- `npm run dev` — Start the Next.js development server
- `npm run build` — Create a production build
- `npm run start` — Serve the production build
- `npm run lint` — Run ESLint checks

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
