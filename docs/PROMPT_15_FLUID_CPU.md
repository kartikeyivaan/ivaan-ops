# Prompt 15 — Reduce Vercel Fluid Active CPU

Hand **one** of the child prompts to **one** new agent. Do not combine them in a single session.

Hobby Fluid Active CPU for `ivaan-ops-47zo` is ~4 hours / 30 days (the included cap). These three changes cut repeat server work. They are independent. Expected combined saving is roughly 70–100 CPU minutes/month, not a rewrite of the app.

## How to use

1. Open a **new agent chat** with a clean context.
2. Paste **only one** child prompt file (or say “Implement `docs/PROMPT_15A_DASHBOARD_CACHE.md` exactly”).
3. Tell the agent: do not start the other two prompts.
4. After that agent finishes, run its QA checklist, then start the next prompt in a **new** chat.

## Child prompts (run separately)

| Order | File | What it does | Likely CPU save / month |
|-------|------|----------------|-------------------------|
| 1 (highest ROI) | [PROMPT_15A_DASHBOARD_CACHE.md](./PROMPT_15A_DASHBOARD_CACHE.md) | Cache sales dashboards; Refresh button busts cache | ~40–70 min |
| 2 | [PROMPT_15B_NOTIFICATION_POLLING.md](./PROMPT_15B_NOTIFICATION_POLLING.md) | Bell poll 60s → 5 min | ~15–25 min |
| 3 | [PROMPT_15C_PDF_XLSX_TRACING.md](./PROMPT_15C_PDF_XLSX_TRACING.md) | Store sticker PDFs; pack fonts only on print/export routes | ~10–20 min |

## Shared rules for every agent

- Implement **only** the assigned prompt. Do not “while I’m here” the others.
- Do not upgrade the Vercel plan, add Redis/KV, or move jobs off Vercel unless the prompt says so.
- Do not add dashboard auto-refresh / polling.
- Match existing UI (Tailwind, shadcn-style). No new design system.
- Add or update tests for the behaviour you change.
- Run `npm run test` for affected files and `npm run build` before calling it done.
- Verify in the browser if the change is user-visible (dashboard Refresh, notification bell, PDF/Excel download).
- Do not commit unless the user asks.

## Product intent (do not reverse)

- Dashboard numbers may be slightly stale until the user clicks **Refresh**.
- Notification badge may lag up to ~5 minutes while a tab sits idle; opening the bell stays fresh.
- PDFs and Excel files must look and download the same.
