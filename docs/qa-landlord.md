# Landlord QA checklist

Manual test matrix for vacancy, portfolio, billing, proofs, notifications, RBAC, and UX regressions.

## A. Vacancy / end lease

| ID | Case | Expected | Pass |
|----|------|----------|------|
| A1 | End lease on occupied unit | Status Vacant; assign form appears | x |
| A2 | End lease twice | Second call 409; still Vacant | x |
| A3 | End lease on already vacant unit | Clear error; no crash | x |
| A4 | After end, Generate invoices | No new invoice for that unit | x |
| A5 | Unpaid DUE/OVERDUE invoices exist when ending | Still on tracker under old renter | x |
| A6 | Pending proof exists when ending | Still in Payment proofs; Confirm/Reject works | x |
| A7 | Assign new renter after end | Succeeds; unit Leased again | x |
| A8 | Assign while still active | Conflict: already has an active lease | x |
| A9 | Renter portal after end | Lease gone from My lease; unpaid invoices still visible | x |
| A10 | Same renter reassigned later | Allowed; new lease; new invoice period | x |

_A1–A10 verified via API smoke against local Nest on 2026-11-23._

## B. Portfolio basics

| ID | Case | Expected | Pass |
|----|------|----------|------|
| B1 | Create property / unit | Appears under portfolio | |
| B2 | Assign unknown email | Error: renter must be registered RENTER | |
| B3 | Assign landlord email | Rejected (role check) | |
| B4 | Two units, one vacant one leased | Mixed badges correct | |
| B5 | Delete not supported | N/A for now — no accidental cascade UX | |

## C. Billing / tracker

| ID | Case | Expected | Pass |
|----|------|----------|------|
| C1 | Generate with 0 active leases | Info toast; nothing created | |
| C2 | Generate twice same month | Skipped existing; no duplicates | |
| C3 | Mix of DUE/OVERDUE/PAID/PENDING | Filters + clickable stats match counts | |
| C4 | Mark paid on DUE | Paid; toast; confirm dialog | |
| C5 | Mark paid on already PAID | Blocked / no-op error | |
| C6 | Vacant unit never appears as new tracker row after end | Only historical invoices if any | |

## D. Payment proofs

| ID | Case | Expected | Pass |
|----|------|----------|------|
| D1 | Renter submits with image | Landlord Review proof modal shows image | |
| D2 | Renter submits PDF | Modal PDF viewer | |
| D3 | Submit without file (note only) | Pending; Review says no file | |
| D4 | Confirm paid | Invoice PAID; removed from pending | |
| D5 | Reject | Invoice unpaid again; renter can resubmit | |
| D6 | Confirm after lease ended | Still succeeds (A6) | |

## E. Notifications

| ID | Case | Expected | Pass |
|----|------|----------|------|
| E1 | Unread vs Earlier grouping | Hierarchy correct | |
| E2 | Click PAYMENT_SUBMITTED | Scrolls/opens proof | |
| E3 | Click RENT_DUE/OVERDUE | Highlights invoice | |
| E4 | Mark one / mark all read | Counts update | |
| E5 | Reminder run with vacant-only portfolio | Sensible empty message | |

## F. Auth / RBAC

| ID | Case | Expected | Pass |
|----|------|----------|------|
| F1 | Renter cannot end lease / open landlord APIs | 403 | |
| F2 | Landlord cannot submit renter payment as renter | Role routing | |
| F3 | Logout clears session | Redirect login | |

## G. UX regressions

| ID | Case | Expected | Pass |
|----|------|----------|------|
| G1 | Mobile &lt;800px tracker | Cards, not broken table | |
| G2 | Destructive actions | Confirm dialog required | |
| G3 | Success/error | Toast appears | |
| G4 | First-run empty guide | Steps advance as property→unit→lease→invoices | |

## End-lease rules (product defaults)

- Unit shows **Vacant** immediately after end.
- Invoice generation only considers `ACTIVE` leases.
- Existing unpaid invoices remain on the tracker until collected.
- Pending payment proofs remain reviewable.
- Renter “My lease” lists only `ACTIVE` leases; invoices may still appear.
- A new renter can be assigned only after the previous lease is ended.
