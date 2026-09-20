# Prompt 15C — Tighten PDF / Excel paths and function tracing

You are implementing **only this prompt**. Do not change dashboard caching or notification polling.

## Goal

1. Stop packing PDF fonts/branding into **every** `/api/*` serverless trace.
2. Stop rebuilding courier-sticker PDFs on every print when inputs have not changed.
3. Avoid loading `pdfkit` / `xlsx` on routes that never print or export.

User-visible PDFs and Excel files must stay the same.

## Out of scope

- Dashboard cache / Refresh
- Notification poll interval
- Moving PDF/Excel off Vercel, queues, or Pro plan
- Redesigning letterheads or report layouts
- Adding a new row cap UX on Reports (leave report filters as they are)
- Changing public share-token security beyond what is needed for cache keys

## Current behaviour

### Tracing (cold-start weight)

`next.config.ts` today:

```ts
outputFileTracingIncludes: {
  "/api/**": [
    "./assets/branding/**",
    "./assets/fonts/**",
    "./assets/installation-timeline/**",
    "./node_modules/pdfkit/js/data/**",
  ],
},
serverExternalPackages: ["pdfkit"],
```

That attaches print assets to notifications, stock checks, etc. Scope includes to routes that actually generate PDFs.

Keep `serverExternalPackages: ["pdfkit"]` — bundling pdfkit breaks font-metric `__dirname` reads.

### Stored PDFs (already good)

`src/lib/pdf-cache.ts` → `resolveStoredPdf`. Already used by:

- `/api/quotations/[id]/pdf`
- `/api/proforma-invoices/[id]/pdf`
- `/api/dispatches/[id]/pdf`
- `/api/project-dispatches/[id]/pdf`
- `/api/project-proposals/[id]/pdf`
- `/api/share/quotation`, `/api/share/proforma-invoice`, `/api/share/dispatch`, `/api/share/project-proposal`

Letters: `/api/letters/[id]/pdf` reads a stored file. `/api/letters/[id]/print` builds a print PDF via `buildPrintLetterPdf` — include this route in tracing; do not change letter layout in this prompt.

### Courier stickers (rebuild every time)

`src/app/api/dispatches/[id]/courier-stickers/route.ts` always calls `generateCourierStickerPdf`. GET (query `boxes`) and POST (boxes + optional address override) both need the same cache behaviour.

### Excel

`xlsx` / `buildExcelBuffer` (`src/lib/report-export.ts`) is used by reports (`src/lib/report-api.ts`), `/api/inventory/serials/available`, `/api/inventory/incoming/[id]/serials/export`, `/api/accounts/payments`, `/api/service/export`. Bank upload parsers import `xlsx` for statement files — keep that; do not parse statements on the client in this prompt.

## Required behaviour

### A. `outputFileTracingIncludes`

Replace `"/api/**"` with **explicit** route keys for every handler that needs branding, fonts, installation-timeline art, or pdfkit `.afm` files.

Include at least:

- `/api/quotations/[id]/pdf`
- `/api/proforma-invoices/[id]/pdf`
- `/api/dispatches/[id]/pdf`
- `/api/dispatches/[id]/courier-stickers`
- `/api/project-dispatches/[id]/pdf`
- `/api/project-proposals/[id]/pdf`
- `/api/letters/[id]/pdf`
- `/api/letters/[id]/print`
- `/api/share/quotation`
- `/api/share/proforma-invoice`
- `/api/share/dispatch`
- `/api/share/project-proposal`
- Every `/api/reports/*` route that can return `format=pdf` (all of them that use `respondWithReport`)

Use the same asset globs as today for each of those keys (or a shared `const` array in `next.config.ts` so the list cannot drift).

If Next.js tracing keys need a different shape than App Router paths, match this project’s Next 15.3 `outputFileTracingIncludes` docs — but **do not** fall back to `"/api/**"`.

After the change, `npm run build` must succeed and a quotation PDF, letter PDF, courier sticker PDF, and one report PDF must still generate (see QA).

### B. Courier sticker stored PDF

Use `resolveStoredPdf` like dispatch PDFs.

- `documentType`: reuse an existing `PdfDocumentType` if stickers already have one; otherwise add a Prisma enum value **and** migration (only if required).
- `documentId`: dispatch id.
- `variant`: must include box count **and** a stable hash of the printed address/invoice fields so GET vs edited POST do not collide.
- `contentVersion`: dispatch `updatedAt`, `dcNo`, invoice number, box count, customer/override fields used on the sticker.

If the user prints 3 boxes, then 4 boxes, that is two cached variants. Same 3 boxes + same address = cache hit (no pdfkit).

Keep filename and `attachment` disposition as today.

### C. Heavy libraries stay on print/export paths

- Do not add `import * as XLSX from "xlsx"` or `import PDFDocument from "pdfkit"` to non-print routes.
- Prefer existing helpers (`buildExcelBuffer`, `generateXyzPdf`) so imports stay in `src/lib/*-pdf.ts` and `report-export.ts`.
- If a non-PDF API file currently imports a pdf module at the top only for a rare branch, switch that branch to `await import(...)`. Do not do a repo-wide lazy-import refactor.

Do **not** change report Excel/PDF to a stored-cache (reports are on-demand snapshots). Do not add a new export row limit unless a route already unbounded-loads the whole table in a way that is trivial to cap without UX change — default is leave reports as they are.

## Files you will likely touch

| File | Why |
|------|-----|
| `next.config.ts` | Explicit tracing includes |
| `src/app/api/dispatches/[id]/courier-stickers/route.ts` | `resolveStoredPdf` |
| `prisma/schema.prisma` | Only if a new `PdfDocumentType` is required |
| `src/lib/courier-sticker-pdf.test.ts` | Cache key / variant behaviour if you extract a helper |
| New small helper next to `pdf-cache.ts` | Sticker variant + contentVersion builders (testable) |

## Tests

- Helper tests: same sticker inputs → same variant + contentVersion; different box count or address → different variant.
- Existing `src/lib/courier-sticker-pdf.test.ts` must still produce `%PDF-`.
- If you add a Prisma enum, run migrate locally; do not hand-edit old migrations.

## QA checklist

- [ ] `npm run build` succeeds with the new tracing keys (fonts still traced for PDF routes).
- [ ] Open a quotation PDF (logged-in) — fonts/logo look normal.
- [ ] Open a PI PDF and a dispatch PDF — same.
- [ ] Public share link PDF still opens (`/api/share/quotation?token=...`) if you have a valid token.
- [ ] Letter download and letter print PDF still work for Super Admin.
- [ ] Courier stickers: first print downloads; second print of the **same** dispatch + box count + address is still correct (and should hit stored PDF — no visual regression).
- [ ] Stickers with a different box count still show that many labels.
- [ ] One Reports Excel and one Reports PDF export still download.
- [ ] Available-serials xlsx and bank statement upload still work (do not “fix” parsers in this prompt).

## Done when

- Tracing is not `/api/**`.
- Sticker PDFs use `resolveStoredPdf`.
- No accidental pdfkit/xlsx imports on unrelated APIs.
- Tests, `npm run test`, and `npm run build` pass.
- You did not modify dashboard cache or notification polling.
