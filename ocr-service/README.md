# CatatKu PaddleOCR service

Private OCR service for the CatatKu PWA. This service is separate from Next.js so OCR models do not increase the PWA bundle size.

## Run locally with Docker

From this directory:

```bash
docker build -t catatku-ocr .
docker run --rm -p 8000:8000 -e OCR_SERVICE_SECRET="use-a-long-random-secret" catatku-ocr
```

Health check: `http://localhost:8000/health`.

The `/scan` endpoint requires the same secret in the `X-OCR-Secret` header. Do not expose this service publicly without a strong secret and network-level restrictions. In production, only allow the Next.js server to reach it.

## Connect Next.js

Set these server-side environment variables in Vercel (and in `.env.local` for local Next.js development):

- `OCR_SERVICE_URL`: base URL of this service, e.g. `https://your-private-ocr-host.example`.
- `OCR_SERVICE_SECRET`: the same random secret used by the service.

The browser never receives the OCR service secret. The Next.js API route validates the Supabase access token and verifies the uploaded object belongs to the current user before forwarding the file.

## Hosting and free-tier note

PaddleOCR is a comparatively large Python dependency and downloads model weights. A free container host may sleep, have low RAM/CPU, or remove free tiers. Cold starts can be slow and a small instance may run out of memory. The PWA remains usable for manual transaction entry if OCR is unavailable. Do not assume the OCR endpoint is production-ready until deployed and tested with real device uploads.

## Supported inputs

- JPEG, PNG, WebP
- PDF up to 8 pages
- 10 MB maximum upload

The parser is deliberately conservative and may miss or misread fields. Every result must be checked in the review screen before saving.
