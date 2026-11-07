# Receipt Scanner deployment checklist

## 1. Apply database migration

In Supabase SQL Editor, run in this order:

1. Existing `supabase/schema.sql` (only if not already applied).
2. `supabase/receipt-scanner-schema.sql`.

The second script creates the private `receipts` bucket, receipt tables, RLS policies, and the atomic save RPC `create_transaction_with_receipt`.

## 2. Deploy OCR service separately

Build and deploy the container in `ocr-service/`. Configure `OCR_SERVICE_SECRET` on the OCR host. Keep the endpoint private where possible; otherwise use HTTPS and a long random secret, strict request limits, and host-level access controls.

The OCR service is not part of the Vercel Next.js deployment. It requires Python dependencies and PaddleOCR model files, so a small free tier may be insufficient or slow.

## 3. Configure Vercel

Add server-side environment variables:

- `OCR_SERVICE_URL`
- `OCR_SERVICE_SECRET`

Keep these variables unprefixed. Never use `NEXT_PUBLIC_` for the OCR secret.

## 4. Test

- Install the latest PWA build on Android Chrome.
- Open Scan Nota and capture a grocery receipt.
- Upload a PDF utility bill.
- Test a PLN prepaid token receipt and confirm the token digits are not stored.
- Test a postpaid PLN bill, toll receipt, and vehicle-tax proof.
- Correct the merchant, date, total, and items before saving.
- Confirm the dashboard shows one parent expense per receipt.
- Sign in with a second account and verify it cannot access the first account's receipt rows or Storage objects.
- Turn off the OCR service and confirm manual transaction entry still works.

## Current limitations

- OCR parser is heuristic; it is not guaranteed to recognize every Indonesian receipt layout.
- Duplicate receipt detection and a receipt detail viewer are not yet implemented.
- OCR requires an internet connection.
- Full 20-digit electricity token values are intentionally not saved.
- Deployment and production build validation must be completed before calling the feature production-ready.
