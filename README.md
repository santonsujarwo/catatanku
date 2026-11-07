# CatatKu

Personal finance tracker built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features
- Record income and expenses using natural language, e.g. `nasi padang 45rb`, `parkir 5rb`, `gaji 5jt`.
- Monthly income, expense, and net balance summaries.
- Expense breakdown by category and largest expense category.
- Email/password authentication.
- Supabase PostgreSQL persistence with Row Level Security (RLS).
- Edit and delete transactions.

## Setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable (or anon) key.
4. Run `npm install` then `npm run dev`.
5. Open http://localhost:3000 and register an account.

Never expose the Supabase service_role key in the browser or commit secrets.

## Deploy
Import this repository into Vercel and configure:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Set the production URL in Supabase Authentication → URL Configuration (Site URL and Redirect URLs).

## Receipt Scanner (MVP implementation)

The PWA now includes a Scan Nota capture and review flow. Users can capture a photo or select JPG, PNG, WebP, or PDF. The OCR API is protected by the signed-in Supabase session and forwards files to a separate private PaddleOCR service. See [docs/receipt-scanner-architecture.md](./docs/receipt-scanner-architecture.md).

Before using receipt scanning, run [supabase/receipt-scanner-schema.sql](./supabase/receipt-scanner-schema.sql) in Supabase SQL Editor **after** the existing `supabase/schema.sql`. This creates owner-scoped receipt tables and a private `receipts` Storage bucket. The existing transaction workflow is unchanged.

The OCR engine is self-hosted PaddleOCR with deterministic parsing; no paid AI API is required. The OCR service lives in `ocr-service/` and must be deployed separately. Set `OCR_SERVICE_URL` and `OCR_SERVICE_SECRET` as server-only Vercel environment variables. For local OCR service development, build `ocr-service/Dockerfile` and run it with `OCR_SERVICE_SECRET`; expose its port 8000 only to the Next.js server. OCR requires an online connection. The scan UI is implemented, but the OCR service has not been deployed or production-tested yet.

## Local development
Requires Node.js 20.9+.

## Progressive Web App (PWA)

CatatKu is an installable PWA and the sole app delivery target. It can be installed from a supported browser on Android, iOS/iPadOS, Windows, and macOS without maintaining separate application codebases.

PWA assets and behavior:
- `public/manifest.webmanifest` — app name, display mode, colors, and icon.
- `public/icon.svg` — install icon.
- `public/sw.js` — app-shell caching for basic offline startup. Supabase/API responses and private transaction data are never cached.
- `app/pwa-register.tsx` — production service-worker registration.

The app remains online-first for authentication and transaction operations. Offline transaction creation/sync is not implemented yet.

For local installation testing, run `npm run build` and deploy over HTTPS. Open the deployed URL in a supported browser and choose Install app / Add to Home Screen.

