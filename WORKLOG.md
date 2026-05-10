# Worklog

## 2026-04-23 — Initial build + CSV parser fixes

### What was built
A static web app (no backend, no build step) for sorting shared expenses. Open `index.html` directly in any browser.

**Stack:** Vanilla HTML/CSS/JS across 4 files:
- `index.html` — app shell with two screens (upload, tagger)
- `css/style.css` — styles
- `js/csv-parser.js` — bank detection and CSV normalization
- `js/storage.js` — localStorage merchant memory
- `js/app.js` — UI logic and state

**Features:**
- Drag-and-drop CSV upload; accepts multiple files at once
- Auto-detects bank from column headers; shows bank label and transaction count per file
- Deduplicates transactions across files by (date + description + amount)
- Tag transactions as shared with a click or keyboard (`↑↓` navigate, `S`/`Space` toggle, `F` filter)
- Total shared amount updates live
- Merchant memory: choices are saved to `localStorage` and auto-applied on next session (marked with ★)
- "Copy to Sheet" copies tab-separated `Description | Date | Amount` + total row to clipboard, ready to paste into Google Sheets

**Banks supported:**
| Bank | Detection signature | Amount convention |
|------|--------------------|--------------------|
| Alliant Visa | `Date, Description, Amount, Balance, Post Date` | Positive = charge |
| Alliant Checking | `Date, Description, Amount, Balance` (no Post Date) | `($2.99)` parentheses = withdrawal |
| Bank of America (credit) | `Posted Date, Reference Number, Payee, Address, Amount` | Negative = charge |
| American Express | `Date, Description, Amount, Extended Details, ...` | Positive = charge |

### CSV parser fixes (same session)
Initial implementation had wrong detection and inverted amount logic for most banks. Fixed after inspecting actual sample CSVs:

- Alliant files don't use `Debit`/`Credit` columns — detection was completely wrong
- Alliant Checking uses `($2.99)` parentheses notation for withdrawals; `parseAmount` updated to handle this
- Alliant Visa and Alliant Checking share the same base columns (`Date, Description, Amount, Balance`) — disambiguated by presence of `Post Date` column in Visa exports
- BofA credit card uses `Posted Date, Reference Number, Payee, Address, Amount` — no `Description` column; `Payee` used for display
- BofA charges are negative; refunds are positive (opposite of initial assumption)
- Amex charges are positive; refunds/credits are negative (initial assumption was correct)

## 2026-05-09 — Normalize transaction signs and remove dedupe

### Canonical sign convention
- `amount > 0` = debit (charge/withdrawal)
- `amount < 0` = credit (refund/deposit)

### Per-bank normalization
Updated all five parseTransactions branches (Alliant Visa, Alliant Checking, BofA Credit, Amex, unknown fallback) to:
- Accept all transactions (removed filters that skipped credits/refunds)
- Apply per-bank sign transforms to canonical convention:

| Bank | CSV native | Transform |
|------|-----------|-----------|
| Alliant Visa | positive = charge | pass through |
| Alliant Checking | parens = withdrawal, positive = deposit | negate |
| BofA Credit | negative = charge, positive = refund | negate |
| Amex | positive = charge, negative = credit | pass through |
| Unknown fallback | as-is | pass through |

### Removed deduplication
Replaced `date|description|amount` dedupe with unique per-transaction id: `${filename}|${rowIndex}|${date}|${amount}`. Every row now visible, enabling side-by-side comparison of debits and matching credits.

### Display formatting
Added `formatAmount(n)` helper to normalize display: negative values show as `-$n.nn`, preserving sign visibility. Applied to row amounts, shared total, and clipboard total line. Per-row clipboard lines remain raw signed values (no $) for Sheets numeric parsing.
