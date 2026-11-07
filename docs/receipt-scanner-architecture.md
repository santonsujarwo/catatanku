# CatatKu Universal Receipt Scanner

## Goal

Add a universal document-to-expense workflow to the existing PWA. The user can capture a photo or upload JPG, PNG, WebP, or PDF. The app classifies the document, extracts available fields and line items, lets the user review/correct the result, and only then creates one parent transaction plus receipt details.

This feature must not change the existing quick-text transaction workflow.

## Decisions

- No Gemini, OpenAI, or other paid hosted AI API in the initial version.
- OCR engine: PaddleOCR, self-hosted as a separate Python service.
- Fallback OCR: Tesseract, optional and only enabled if PaddleOCR cannot process a document.
- Interpretation: deterministic parser/rules first; no LLM dependency.
- PWA remains lightweight. OCR models and Python dependencies must never be bundled into Next.js.
- Next.js API routes act as the authenticated boundary between the browser and the private OCR service.
- Supabase Storage bucket `receipts` is private.
- Every upload and database row is scoped to `auth.uid()`.
- The user must confirm extracted data before any transaction is saved.
- One receipt creates one parent transaction; itemized lines are stored as children. This is the selected model C.

## Supported document classes

Initial classification labels:
- `grocery`: supermarket/minimarket and general shopping receipts.
- `restaurant`: food and beverage receipts.
- `electricity_prepaid`: PLN prepaid token purchase.
- `electricity_postpaid`: PLN postpaid bill/payment.
- `utility`: water, internet, phone, and other utility bills.
- `toll_transport`: toll, parking, and transport receipts.
- `vehicle_tax`: vehicle tax / STNK payment receipts.
- `healthcare`: clinic, hospital, pharmacy.
- `invoice`: general invoices and service bills.
- `other`: unknown or unsupported documents.

Classification is a best-effort suggestion, not a guarantee. Unknown documents must remain editable and must never be silently forced into a category.

## Extraction contract

The OCR service returns raw text, page count, text blocks with confidence and bounding boxes, plus a normalized draft. The parser must preserve uncertainty and source evidence.

Normalized draft shape (conceptual):
- document_type
- merchant_name
- transaction_date
- currency (IDR by default only when supported by evidence)
- subtotal, tax, service_fee, admin_fee, discount, total
- items[]: description, quantity, unit, unit_price, line_total, line_type
- utility fields: billing_period, usage_kwh, customer_reference
- prepaid electricity: purchased_value, received_kwh, admin_fee, token_detected (boolean)
- confidence per extracted field and warnings

Do not persist full electricity token numbers by default. The OCR result may flag that a token is present, but the review UI should mask it. Persisting/retrieving the actual token requires a separate explicit opt-in and a secure server-side encryption design.

## Flow

1. User taps Scan Nota and captures/selects a file.
2. Client validates file type and size, then uploads to the private Storage bucket using a path beginning with the authenticated user UUID.
3. Client requests OCR through an authenticated Next.js route.
4. Next.js verifies the Supabase session, ownership of the uploaded object, and file constraints before calling the private OCR service.
5. OCR service extracts text and applies deterministic classification/parsing.
6. Client displays a review screen with source image/PDF, editable fields, item rows, and confidence/warnings.
7. User confirms. A server route or carefully scoped Supabase transaction inserts the parent `transactions` row, `receipts` row, and `receipt_items` rows atomically.
8. User can open the parent transaction to inspect receipt details.

## Initial document constraints

- Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf.
- Initial maximum upload size: 10 MB (configurable).
- Reject SVG, HTML, archives, executables, and unknown MIME types.
- Treat OCR output as untrusted input. Never execute it, render as HTML, or use it as SQL.
- Do not cache receipt images, OCR results, or private transaction data in the PWA service worker.
- Do not log raw OCR text, customer numbers, vehicle identifiers, or token numbers.

## OCR service deployment

The OCR service is a separate Python/FastAPI container. It is not deployed as part of the Next.js/Vercel bundle. PaddleOCR model files are downloaded at service startup/build and need persistent cache or a baked model image. A free host may sleep, impose memory/CPU limits, or change its free tier; production availability and cost must be checked before selecting a host.

Required environment variables:
- `OCR_SERVICE_URL`: private URL reachable only by the Next.js server.
- `OCR_SERVICE_SECRET`: shared secret used for server-to-server authentication.
- Supabase credentials remain in Next.js and must never be exposed to the OCR container unless a specific storage access design requires them.

## Phased delivery

### Phase 1 — Foundation (completed in repository)
- Document the architecture and extraction contract.
- Add a separate, idempotent Supabase SQL migration for receipt metadata and line items.
- Create the private Storage bucket and owner-scoped policies.
- Do not alter the existing transactions table or UI.

### Phase 2 — OCR service and API (implementation added; deployment/testing pending)
- Add a separate PaddleOCR FastAPI service.
- Add sample fixtures with synthetic receipts (no real personal data).
- Test Indonesian thermal receipts, PLN prepaid/postpaid examples, toll and vehicle-tax examples.
- Record accuracy and failure cases; do not claim universal accuracy.

### Phase 3 — PWA capture and review (initial implementation added; end-to-end testing pending)
- Add camera/file/PDF input, progress/error states, OCR preview, and editable review.
- Keep all writes behind explicit user confirmation.
- Add atomic save and duplicate detection.

### Phase 4 — Hardening
- Validate storage quotas, upload limits, OCR timeouts, rate limits, malware/content validation, retention and deletion.
- Test RLS with multiple users and verify no cross-account access.
- Test offline and poor-network behavior. OCR itself requires connectivity in the initial version.

## Acceptance criteria

- Existing login and manual transaction entry continue to work unchanged.
- A user cannot read or mutate another user's receipts, items, or files.
- No receipt becomes a transaction before user confirmation.
- A grocery receipt can have multiple item rows but one parent expense.
- Prepaid and postpaid electricity documents use different document types and field sets.
- The app can save a document with no itemized lines.
- Low-confidence/missing fields are highlighted for manual correction.
- Failed OCR never blocks manual transaction entry.
