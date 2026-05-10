# Architecture

## Purpose
Static web app for sorting shared expenses across personal CSV exports from
multiple banks. The user uploads bank CSVs, tags transactions as "shared"
(individually or remembered per merchant), and copies a tab-separated list
into Google Sheets. No backend, no build, no dependencies — open `index.html`
in a browser.

## File map
| File | Role |
|---|---|
| `index.html` | App shell. Two screens (upload / tagger) toggled with the `hidden` attribute. Loads scripts as plain `<script>` tags in order: `storage.js`, `csv-parser.js`, `app.js`. |
| `css/style.css` | All styles. |
| `js/storage.js` | `localStorage` merchant memory. Key: `expense-tagger-merchants`, value: `{ [merchantKey]: bool }`. |
| `js/csv-parser.js` | CSV tokenizer, bank detection, per-bank parsing, sign normalization, merchant key derivation. |
| `js/app.js` | DOM/UI logic, global `state` object, event wiring, keyboard nav, clipboard export. |
| `sample-data/` | Real CSV exports used to validate parser logic. Treat as fixtures. |
| `WORKLOG.md` | Append-only history of build sessions and notable fixes. |

## Module boundaries (no actual modules — globals)
Scripts attach functions to the global scope. Calls flow one direction:

```
app.js  ──▶  csv-parser.js  (parseTransactions, bankLabel)
app.js  ──▶  storage.js     (getMerchantMemory, setMerchantShared)
```

`csv-parser.js` and `storage.js` know nothing about each other or about the DOM.

## Data flow
1. User drops CSVs → `handleFiles()` reads each via `FileReader` and calls
   `parseTransactions(text, filename)` → stores result in `state.pendingFiles`.
2. `parseTransactions` runs `parseCSVText` → `detectBank(headers)` → routes
   to a per-bank branch that extracts `{date, description, amount, merchantKey, source}`
   with **sign normalized to canonical: `amount > 0 = debit (charge), amount < 0 = credit (refund/deposit)`**.
3. User clicks "Load" → `loadTransactions()` flattens all files, attaches
   `id` / `isShared` / `autoTagged` (consulting merchant memory), sorts by
   date desc, switches to tagger screen.
4. User toggles a row → `toggleShared(idx)` flips `isShared`, persists the
   merchant decision via `setMerchantShared`, re-renders.
5. "Copy to Sheet" → tab-separated `description \t date \t amount` lines plus
   a `Total` line, written via `navigator.clipboard` (textarea fallback).

## Bank detection & sign convention
Detection is by header signature in `detectBank()` (`csv-parser.js:32`).
Each bank has a dedicated branch in `parseTransactions()` because column
names AND sign conventions differ:

| Bank | Header signature | CSV native sign | Transform |
|---|---|---|---|
| Alliant Visa | has `Date` + `Post Date` + `Description` | positive = charge | pass through |
| Alliant Checking | has `Date` + `Description` + `Amount` + `Balance`, no `Post Date` | `($x)` parens = withdrawal | negate |
| BofA Credit | has `Reference Number` + `Payee` | negative = charge | negate |
| Amex | has `Extended Details` | positive = charge | pass through |
| Unknown | fallback | as-is | pass through |

Detection order matters: Amex is checked first (unique column), then BofA,
then Alliant Visa (the `Post Date` column disambiguates from Checking),
then Alliant Checking.

`parseAmount()` strips `$ , ( )` and treats parens as negative — this is
how Alliant Checking encodes withdrawals.

## Merchant key
`normalizeMerchant(desc)` lowercases, trims, strips known prefixes
(`SQ *`, `TST*`, `PAYPAL *`, `AMZN MKTP US*`, …) and trailing
store/order numbers. The result is the key under which the
"shared / not shared" decision is remembered.

## State (app.js)
Single global `state` object:
- `transactions` — the loaded, normalized, decorated list
- `pendingFiles` — files added on the upload screen, not yet loaded
- `filter` — `'all' | 'shared'`
- `focusedIdx` — index into `state.transactions` for keyboard navigation

## Transaction id
`${filename}|${rowIndex}|${date}|${amount}` — guarantees uniqueness even
when the same charge appears in two exports. There is **no deduplication**;
showing every row deliberately enables debit/credit pair comparison.

## Keyboard
`↑/↓` move focus, `S` or `Space` toggle shared. Wired
in `setupKeyboard()`; ignored when focus is in `INPUT`/`TEXTAREA`/`BUTTON`.
