# Find Beskyttelsesrum

Find Beskyttelsesrum is a Danish web app for finding registered shelter capacity and nearby shelter locations. The primary flow lets a user search by address through DAWA autocomplete or use browser geolocation, then shows nearby shelters on a map.

## Tech Stack

- Next.js App Router
- React and TypeScript
- Supabase for data access and RPC functions
- Leaflet and React Leaflet for maps
- Tailwind CSS for styling
- Vercel analytics and speed insights in production

## Local Development

Use Node.js 20.9.0 or newer. This repo includes an `.nvmrc` for local Node version alignment:

```bash
nvm use
```

Install dependencies:

```bash
npm install
```

Create a local `.env` with the required Supabase public values:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run lint
npm run build
npm run test-caching
npm run verify-assets
```

## Modernization Status

This repo is under active modernization. The current work is focused on removing legacy cache, search, and data-access abstractions before larger product or architecture changes.

## Documentation

- `docs/audit-baseline.md` contains the reverse engineering baseline.
- `docs/project-plan-2.0.md` and `docs/status-tracker.md` contain planning/status notes when present in the checkout.
