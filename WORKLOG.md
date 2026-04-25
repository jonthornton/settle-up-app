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
