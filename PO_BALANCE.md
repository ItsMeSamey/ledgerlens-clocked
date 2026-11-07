# Review the remaining purchase-order allowance

LedgerLens can compare the current invoice with a local ledger of earlier and pending commitments against the same PO. It performs this arithmetic locally using the facts already extracted from the documents. Recalculating the ledger makes no Clocked request.

Start `python app.py` and choose one of the three fictional PO balance examples. A 600 invoice fits an unused 1,000 PO. With 600 already committed, the same invoice exceeds the allowance by 200. A 400 invoice instead reaches the exact remaining balance.

Enter the supplier, PO, currency, as-of date and source context, then add invoice identifiers and final amounts in the commitment table. Confirm completeness only after checking all earlier and pending obligations. Choose **Recalculate balance locally** to reuse the reviewed document facts. For the first example, changing the prior amount from 600 to 400 makes room for the current 600 invoice without editing JSON.

Editing the ledger clears its previous result and hides export until recalculation. Scope/date changes, invoice identity changes and adding/removing rows clear the completeness confirmation. Correcting an amount preserves the existing coverage confirmation. The result shows prior commitments, the current invoice, remaining balances and the exact included or excluded invoice rows. The audit JSON retains the original ledger and its hash.

**Advanced: exact ledger JSON** remains available for imported or unusual records. Mixed scopes, credits, reversals, unsupported statuses and malformed values are preserved there; the table will not silently convert them. The balance check still requires review for unsupported input. This is the format used by the fictional examples:

```json
{
  "vendor": "Paperbark Office Co",
  "po_id": "PO-BALANCE",
  "currency": "AUD",
  "complete": true,
  "as_of": "2026-10-31",
  "context": "Fictional example: all earlier and pending commitments, including tax, through this date.",
  "rows": [
    {
      "invoice_id": "INV-PRIOR",
      "vendor": "Paperbark Office Co",
      "po_id": "PO-BALANCE",
      "currency": "AUD",
      "amount": "600.00",
      "kind": "invoice",
      "status": "committed"
    }
  ]
}
```

Only assert `complete: true` after checking that the ledger covers all earlier and pending obligations for the stated supplier, PO and currency. Here `committed` means reserved against that PO; it does not mean approved for payment. Use final amounts including tax. Do not relabel an unclear accounting status merely to make a row pass. The as-of date must be a valid date no later than the server's current date; describe the source and cutoff in `context`.

An empty `rows` array means confirmed zero history only when the scope, completeness, date and context are supplied. Missing or incomplete history remains unknown. Supplier, PO and invoice identifiers ignore case and whitespace; currencies must match exactly. No foreign-exchange conversion or mixed-PO aggregation occurs.

One row matching the current invoice ID and amount is excluded from prior spend, since the current amount is already counted separately. A conflicting amount or repeated invoice ID requires review. Credits, reversals, negative amounts and statuses other than `committed` also require review; this version does not net them against invoices.

The result depends on the ledger supplied. LedgerLens does not independently verify its completeness, freshness or accounting meaning, fetch account data, detect duplicates outside it, verify delivery or authorize payment. Its historical saved-live viewer predates this feature and asserts no ledger. The three new examples and focused tests are fictional offline demonstrations, not new provider validation.

To run only the new behavior checks:

```sh
python -m unittest -v test_po_balance
node tests/test_ledger_model.js
```
