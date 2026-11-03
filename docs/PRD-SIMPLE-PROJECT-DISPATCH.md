# Ivaan Ops — Simple Project Dispatch PRD

**Document Type:** Product Requirements Document  
**Project:** Ivaan Ops  
**Status:** Implemented (initial)  
**Version:** 1.1  
**Date:** 2026-10-23  
**Company scope:** **Ivaan Solar Energy (ISE) only**  
**Primary users:** Projects Manager, Warehouse, Super Admin  
**Related:** `PRD-PROJECT-MATERIAL-DISPATCH.md` (legacy assignment-based flow — retained as history)

---

## 1. Purpose

Add a **simple, serial-first Project Dispatch** channel under Projects so Project Managers and Warehouse can record material going to a project site without the full material-assignment workflow.

The page creates a normal **Project Delivery Challan (`ProjectDispatch` / PDC)** that continues to feed **DCR Issuance (Documentation)** and **invoicing** unchanged.

Document / UI heading format:

**`Projects Dispatch - {Project Number} - {Customer Name}`**

---

## 2. Goals

1. One simple screen under **Projects → Project Dispatch** (`/projects` area).
2. Identify work by **Project Number** (from physical register); create a minimal project if missing.
3. Paste / scan mixed serials from **any warehouse / any company**; validate; confirm.
4. On confirm: **transfer into Projects WH (JAL-PRJ) first**, then mark serials **DISPATCHED** and remove from inventory.
5. Clear RBAC: Warehouse prepares; **only PM / Super Admin confirm** (and approve large DCs).
6. Support partial dispatches, cancel + restock with approval.
7. Keep legacy project dispatch UI available as **history only** (no need to remove records).

---

## 3. Non-Goals

- Material assignment, reservation, kit explosion, or purchase-request backfill on this path
- Non-serialized products
- Editing customer / project master details from the dispatch screen
- Vehicle number (receiver name only)
- Changing DCR / invoicing contracts (reuse existing PDC)
- Enabling this channel for non-ISE companies

---

## 4. Key Definitions

| Term | Meaning |
|------|---------|
| **Project Number** | Business key typed from the physical register; maps 1:1 to a `Project` |
| **Simple Project** | Minimal create: **Customer name** + **Project Number** only (no project amount) |
| **Draft → Validate → Confirm** | Prepare serials, review grouped products, then stock-out |
| **Large DC** | Total serial count on the challan **> 10** — requires PM/SA approval before / as confirm |
| **Projects WH** | Jalgaon Projects (`JAL-PRJ`) — always the dispatch-from warehouse after auto-transfer |

---

## 5. User flow

### 5.1 Entry
- Nav: **Project Dispatch** under Projects (ISE only).
- Roles: Warehouse, Projects Manager, Super Admin can open the page.
- Select existing project by Project Number, or **Create project** (Customer name + Project Number).

### 5.2 Prepare draft (Warehouse + PM + SA)
1. Open / create draft PDC for the project.
2. Paste or scan serial numbers (multi-product, any source WH/company).
3. System resolves each serial → product; builds validate view:
   - Product A — 6 Qty (serial list)
   - Product B — 1 Qty (serial list)
4. User may strike/remove serials and add/scan more.
5. Enter **Receiver name** (required on confirm).

### 5.3 Serial validation rules
| Condition | Behaviour |
|-----------|-----------|
| Unknown serial | Hard block + warning |
| Booked / damaged / already dispatched | Hard block + warning |
| Duplicate in paste | Auto-remove duplicates + warning |
| Available (any WH) | Accepted |

### 5.4 Confirm (Projects Manager + Super Admin only)
- **≤ 10 total serials:** PM/SA confirms → stock move → status `DISPATCHED`.
- **> 10 total serials:** Pending approval → PM/SA approves/confirms → same stock move.
- Warehouse cannot confirm.

### 5.5 Stock move on confirm
For each accepted serial:
1. If not already in Projects WH → **auto transfer** source WH → JAL-PRJ.
2. Set serial status **DISPATCHED**.
3. Write inventory transactions / events consistent with existing project dispatch.

No material-assignment balance check on this channel.

### 5.6 Cancel
- Cancel PDC + **restock** serials (reverse to available at Projects WH).
- Requires **Projects Manager or Super Admin** approval.

### 5.7 History
- Multiple PDCs per project allowed (partial dispatch over time).
- Existing / legacy project dispatches remain visible as history.

---

## 6. Permissions

| Action | Warehouse | Projects Manager | Super Admin |
|--------|:---------:|:----------------:|:-----------:|
| Open Simple Project Dispatch (ISE) | ✓ | ✓ | ✓ |
| Create minimal project | ✓ | ✓ | ✓ |
| Create draft / scan / validate | ✓ | ✓ | ✓ |
| Confirm (≤ 10 serials) | — | ✓ | ✓ |
| Approve + confirm (> 10 serials) | — | ✓ | ✓ |
| Cancel + restock (approval) | — | ✓ | ✓ |

---

## 7. UX requirements

- Page name: **Simple Project Dispatch** (nav label may be **Project Dispatch**).
- Clear B2B-style challan framing with heading  
  `Projects Dispatch - {Project Number} - {Customer Name}`.
- Validate view grouped by product with qty and serial list; remove + add serials before confirm.
- Mobile-friendly scan/paste; match existing design system.
- Do not expose project-amount or master-data edit on this screen.

---

## 8. Acceptance criteria

1. Feature visible only when company is **Ivaan Solar Energy**.
2. Project Number lookup finds existing project; missing → create with Customer name + Project Number only.
3. Mixed serial paste from any WH validates, groups by product, strips duplicates, hard-blocks invalid statuses.
4. Confirm by PM/SA only; > 10 serials requires approval step; Warehouse blocked from confirm.
5. Confirm transfers non-JAL-PRJ serials into Projects WH then dispatches; inventory reflects removal.
6. PDC is a normal `ProjectDispatch` usable by DCR Issuance and invoicing.
7. Cancel + restock works only with PM/SA approval.
8. Legacy project dispatch records remain available as history.

---

## 9. Open assumption (locked unless changed)

**“> 10” means total serials on that delivery challan**, not per product line.
