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

## GitHub Actions

This repo includes a scheduled workflow at `.github/workflows/datafordeler-importer.yml` that runs the Datafordeler importer.

### Required repository secrets

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `DATAFORDELER_API_KEY`

### Optional repository secrets

These can be set to tune the importer behavior (defaults are applied in code when omitted):

- `DATAFORDELER_BBR_GRAPHQL_URL`
- `DATAFORDELER_DAR_GRAPHQL_URL`
- `DATAFORDELER_MUNICIPALITY_CODES`
- `DATAFORDELER_MUNICIPALITY_METADATA`
- `DATAFORDELER_BBR_SHELTER_USAGE_CODES`
- `DATAFORDELER_BBR_USAGE_CODES`
- `DATAFORDELER_PAGE_SIZE`
- `DATAFORDELER_REQUEST_TIMEOUT_MS`
- `DATAFORDELER_BITEMPORAL_TIMESTAMP`
- `DATAFORDELER_DAR_ACTIVE_STATUSES`

## Modernization Status

This repo is under active modernization. The current work is focused on removing legacy cache, search, and data-access abstractions before larger product or architecture changes.

## Documentation

- `docs/archive/cutover-2025/audit-baseline.md` contains the reverse engineering baseline.
- `docs/archive/cutover-2025/project-plan-2.0.md` and `docs/archive/cutover-2025/status-tracker.md` contain planning/status notes when present in the checkout.
