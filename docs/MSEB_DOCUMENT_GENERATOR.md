# MSEB Document Generator — Admin runbook

ISE-only feature for generating customer-specific MSEB Solar Rooftop PDFs from published templates and document sets.

## Scope and roles

| Role | Access |
|------|--------|
| Super Admin | Fields, templates, document sets, publish, generate, history |
| Documentation Executive | Generate + history + download |
| Accounts | Generate + history + download |
| Other roles (e.g. Sales) | No access |

**Company gate:** Active company must be **Ivaan Solar Energy (ISE)**. PCMV and “All companies” are blocked with an ISE-only message.

## URL map

| Path | Purpose |
|------|---------|
| `/documentation/document-generator` | Hub |
| `/documentation/document-generator/generate` | Wizard: set → customer → data → review → preview → download |
| `/documentation/document-generator/history` | Past generations (filters, re-download) |
| `/documentation/document-generator/history/[id]` | Detail + version pins + preview |
| `/documentation/document-generator/admin/fields` | Field catalog |
| `/documentation/document-generator/admin/templates` | Template designer / publish |
| `/documentation/document-generator/admin/sets` | Document set designer / publish |

## Operational flow (happy path)

1. **Fields** — Create stable field keys (`Customer_Name`, `Mobile_Number`, …). Keys are PascalCase with underscores.
2. **Templates** — Design each MSEB form (PDF background, canvas, or rich text). Validate → preview → **Publish** (creates published version + new draft).
3. **Document sets** — Create a set, add **published** template versions in print order, refresh/reorder shared fields, mark required overrides, Validate → **Publish set**.
4. **Generate** — User picks a published set, searches profile / service request / sales customer (or enters once), fills shared fields, reviews, generates.
5. **History** — Re-open any generation; PDFs remain pinned to the set and template versions used at that time.

Generation never silently overwrites ERP customer/service data. Optional “Save to DocGen profile” stores field values only in `DocGenProfile`.

## Version traceability

Each `DocGenGeneration` stores:

- `documentSetId` + `documentSetVersionId` (pinned set version)
- Per document: `templateId` + `templateVersionId` (pinned template version)
- `customerSnapshotJson` (what was entered for that run)
- `combinedStoredPdfId` + per-doc `storedPdfId` (`StoredPdf` types `DOC_GEN_OUTPUT` / `DOC_GEN_COMBINED`)

Re-downloading from history always uses those stored PDFs — not the latest published template.

## Audit hooks

Writable via Admin → Audit (filter by table name):

| Event | `tableName` | When |
|-------|-------------|------|
| `GENERATION_CREATED` | `doc_gen_generations` | After a generate run finishes |
| `TEMPLATE_PUBLISHED` | `doc_gen_template_versions` | Template version published |
| `SET_PUBLISHED` | `doc_gen_document_set_versions` | Document set version published |
| `FIELD_CREATED` / `FIELD_UPDATED` | `doc_gen_fields` | Field catalog changes |
| `PROFILE_UPSERTED` | `doc_gen_profiles` | Optional profile save on generate |

`newValue` includes version numbers and ids — not PDF bytes.

## Database / deploy

- Migration: `prisma/migrations/20261015120000_doc_gen_foundation`
- Local / each environment: ensure migrations are applied (`npm run db:migrate` for disposable local DBs; `npx prisma migrate deploy` for shared Neon after checksums are clean).
- Prefer `DIRECT_URL` (non-pooler) for migrate against Neon.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Generate button / no published sets | Super Admin must publish a **document set** (templates alone are not enough) |
| `DOC_GEN_ISE_ONLY` | Switch active company to ISE |
| Forbidden on admin pages | Only Super Admin can manage fields/templates/sets |
| Status `PARTIAL` | Some docs failed and/or combined PDF merge failed — download individuals; see `errorMessage` |
| Status `FAILED` | No successful document PDFs — fix template/render errors and regenerate |
| Prefill missing | Field keys must match aliases (e.g. `Customer_Name`, `Installation_Address`) |
| History empty for other firm | History is company-scoped to ISE |

## Manual PDF UAT checklist

Use real MSEB forms after publishing at least one document set.

### Admin setup
- [ ] Create fields used on forms; keys match designer tokens
- [ ] Publish each template (background alignment looks correct in template preview)
- [ ] Create set; add published versions in the intended print order
- [ ] Shared field list compiles; required toggles and field order saved
- [ ] Validate set → Publish set succeeds

### Generate (Documentation / Accounts)
- [ ] Select set → search service request / profile / sales customer → values prefill where keys match
- [ ] One-time manual entry works without ERP write-back
- [ ] Required field client validation blocks Review
- [ ] Server validation returns field issues if forced
- [ ] Generate produces individual PDFs + combined PDF (order matches set)
- [ ] Preview step shows combined and each document
- [ ] Download / open-for-print works
- [ ] Optional “Save to DocGen profile” resurfaces values on next search

### History & versions
- [ ] Generation appears in history with customer, set vN, status, user
- [ ] Detail page shows template name + version per document
- [ ] After publishing a **new** template/set version, old history downloads still match the old layout
- [ ] Combined PDF unavailable on PARTIAL still allows individual downloads

### Security smoke
- [ ] Sales cannot open document-generator hub (redirect)
- [ ] Documentation cannot open admin templates/sets/fields (forbidden)
- [ ] PCMV active company shows ISE-only message
- [ ] Admin Audit shows generation / publish events for the run

### Visual PDF checks (per form)
- [ ] Background / stamp alignment
- [ ] Field values land in correct boxes
- [ ] Long text / flowing sections paginate without clipping
- [ ] Dates and numbers format as expected
- [ ] Combined packet page order matches set designer order
