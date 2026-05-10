# CLAUDE.md

## Read first
`ARCHITECTURE.md` is the canonical overview of this codebase — read it
before exploring files. It covers purpose, file map, data flow, bank
detection, sign conventions, and the merchant-memory model.

`WORKLOG.md` is an append-only record of build sessions; use it for
historical context but trust the current code over old entries.

## Keep ARCHITECTURE.md current
When you make changes that affect anything documented in `ARCHITECTURE.md`,
update it in the same change. Specifically:

- A file is added, removed, renamed, or its role changes → update the **File map**.
- A new bank is supported, detection logic changes, or a sign convention
  flips → update the **Bank detection & sign convention** table and the
  description in `csv-parser.js`.
- A new field is added to transactions, or the transaction `id` shape
  changes → update **Transaction id** and **Data flow**.
- A new field is added to `state`, or screens/flow change → update **State** and **Data flow**.
- The merchant-key normalization rules change → update **Merchant key**.
- New keyboard shortcuts or UI affordances → update **Keyboard**.
- A build step, dependency, or backend is introduced → update **Purpose**
  (the "no backend, no build, no dependencies" claim is load-bearing).

If a change makes part of `ARCHITECTURE.md` wrong, fix it; do not leave
stale text. If you are unsure whether the doc needs updating, err on the
side of updating it — its value comes from staying accurate.
