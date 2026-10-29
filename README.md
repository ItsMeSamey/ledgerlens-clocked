# LedgerLens

Source-linked invoice review for the Clocked Build Challenge. Newly authored during the October 21-November 10, 2026 building period.

## Run

Python 3.11+, no third-party packages:

```sh
python app.py
```

Open http://127.0.0.1:8765. Choose a fictional example, review the checks, select a fact to highlight the original evidence, then export the audit JSON. Default mode is visibly labelled **offline template demo**. It makes no API calls.

The real backend adapter uses Clocked Decide, Extract and Fill. Read [IMPLEMENTATION.md](IMPLEMENTATION.md) before enabling live mode: a verified free account/key is required, and no live integration has yet been demonstrated in this snapshot. Never place keys in the repository.

## What the application does

- Classifies documents and keeps unsupported or uncertain types on hold.
- Reads exact invoice/order facts, validates Unicode source positions and document ownership, and preserves missing values.
- Reconciles supplier, purchase-order reference, currency, subtotal/tax/total and order limit using bounded Decimal amounts.
- Extracts payment terms and drafts a labelled reviewer handoff. Generated notes cannot approve a payment or override the checks.
- Exports source-linked audit records and retains request IDs for recovery.

The application is a review aid, not a payment approver. It does not verify delivery, duplicates, tax law, bank details or cumulative order spend. See the implementation guide for the supported currencies and notation.

## Verification evidence

23 local tests passed on October 28, 2026. These include scripted transport contract tests and real loopback HTTP behavior, not real Clocked integration. The author-written synthetic evaluation matched19/20 statuses and20/28 labelled facts, with zero unsafe-ready results. One free-form invoice intentionally exposes the offline parser limitation. No held-out accuracy, service performance or visual QA is claimed.

```sh
python -m unittest discover -s tests -v
python evaluate.py
node --check static/app.js
```

## Provenance

AI-assisted implementation created for this challenge; no earlier application code was reused. All examples are fictional. Python standard library and browser platform APIs are used; no vendored application code, external assets or runtime dependencies. [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) records work and limitations. The first local Git checkpoint is dated October29,2026; earlier work was not recorded in Git, and this is not backdated development history.

Official challenge rules: https://clocked.rezolve.ai/build-challenge/rules
