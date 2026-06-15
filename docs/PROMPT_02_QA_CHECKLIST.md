# Prompt 02 — Manual QA Checklist

## Setup

- [ ] Run `npm run db:migrate` for customers migration
- [ ] Run `npm run db:seed` for sample customers and sales executive user

## Permissions

- [ ] Sales Executive can create/edit customers
- [ ] Sales Manager can reassign customers in bulk
- [ ] Warehouse/Accounts/Purchase can view customers only
- [ ] Sales Executive cannot access bulk reassignment

## Customer CRUD

- [ ] Create customer with Dealer type
- [ ] Create customer with Project type
- [ ] Duplicate GST in same company is blocked
- [ ] Same GST in different company is allowed
- [ ] Invalid GST format is rejected
- [ ] Customer code auto-generates (e.g. ISE-CUST-00001)
- [ ] Edit customer updates fields and optional contacts
- [ ] Deactivate customer via status INACTIVE

## Assignment

- [ ] Assigned sales executive is required on create
- [ ] Bulk reassignment updates selected customers
- [ ] Reassignment writes audit log entry

## Search & list

- [ ] Search by customer name works
- [ ] Search by GST works
- [ ] Filter by city works
- [ ] Filter by customer type works
- [ ] Filter by sales executive works
- [ ] Outstanding column shows ₹0 placeholder

## Customer profile

- [ ] Overview tab shows customer data
- [ ] Contacts tab shows optional contacts
- [ ] Quotations/PI/Payments/Dispatches tabs show placeholders
- [ ] Edit tab allows updates for authorized roles

## Excel import

- [ ] Upload Excel/CSV file
- [ ] Preview shows valid and invalid rows with errors
- [ ] Import creates only valid rows
- [ ] Duplicate GST in file is flagged
- [ ] Unknown assigned sales email is flagged
- [ ] Import writes audit logs

## Tests

- [ ] `npm run test` passes customer and permission tests
