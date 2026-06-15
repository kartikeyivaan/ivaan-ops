[00_README_Index_v3.md](https://github.com/user-attachments/files/28896804/00_README_Index_v3.md)
# ivaan-ops

IvaanOps v3.0 — operational web app for ISE and PCMV.

## Quick start (after Neon is ready)

```bash
cp .env.example .env
# Add DATABASE_URL and AUTH_SECRET to .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

See [docs/PROMPT_01_FOUNDATION.md](docs/PROMPT_01_FOUNDATION.md) for foundation setup.

Prompt 02 (Customers) docs: [docs/PROMPT_02_CUSTOMERS.md](docs/PROMPT_02_CUSTOMERS.md)

Prompt 03 (Products) docs: [docs/PROMPT_03_PRODUCTS.md](docs/PROMPT_03_PRODUCTS.md)

## PRD

Place all specification documents in `/PRD`. Reference the relevant PRD file before each Cursor prompt.

| File | Description |
|------|-------------|
| 01_Business_Rules_Specification_v3.docx | Business rules |
| 02_Functional_Requirements_Specification_v3.docx | Functional requirements |
| 03_Database_Design_ERD_Specification_v3.docx | Database design |
| 04_Permissions_Matrix_v3.docx | Permissions |
| 05_Workflow_Diagrams_State_Specifications_v3.docx | Workflows |
| 06_UI_UX_Screen_Specifications_v3.docx | UI/UX screens |
| 07_API_Specifications_v3.docx | API specs |
| 08_Reports_KPI_Definitions_v3.docx | Reports |
| 09_UAT_Test_Cases_v3.docx | UAT tests |
| 10_Cursor_Prompt_Library_v3.docx | Cursor prompts |
| 11_Deployment_DevOps_Guide_v3.docx | Deployment |
