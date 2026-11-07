# LedgerLens implementation

A new invoice review application written on 28 October 2026 for the Clocked Build Challenge. All application code was authored for this project; no earlier challenge application was reused.

## Run locally

Requires Python 3.11+; no package installation or API key is needed for the demo.

```sh
python app.py
```

Open http://127.0.0.1:8765. The default is visibly labelled **OFFLINE TEMPLATE DEMO**. Choose a fictional example, run the review, select any fact to highlight its exact original source, then export the audit JSON. The server listens only on loopback. There is no payment action, signup, submission, deployment or messaging integration.

## Open the actual saved result without a key

```sh
python recorded_demo.py
```

Open http://127.0.0.1:8766/recorded/ and select **Load saved review**. This separate loopback viewer loads the actual retained fictional response through the original application renderer. It reads no API key, creates no provider client and rejects every review POST. Its recorded banner is explicit; only display provenance is added to the exported audit. The normal live application behavior is unchanged. Stop with Ctrl+C. The portable viewer was subsequently exercised in the original browser: the introduction, loaded review, correct PO highlight and human-review draft were captured as four genuine stills. No new model request or export was made. See evidence/recorded-viewer-capture-20261030.json.

## What is implemented

1. Clocked Decide classifies the submitted document as invoice, quote, credit note or not established. Quotes, credits and uncertain classifications remain on hold.
2. Clocked Extract receives only the invoice, reading eight original facts and invoice payment terms. Every non-null read must exactly match document-local Unicode offsets.
3. Clocked Fill receives only the purchase order, reading four facts with `infer: false`, suggesting a reviewer team and drafting a clearly labelled purchase-order note. Its prompt and UI label restrict the draft to the purchase order; a person must still verify that the generated prose does not claim unsupported reconciliation. Reads are validated locally, then shifted by the known document prefix into the combined source; the original ownership validator checks the merged twelve-fact record again.
4. Deterministic checks reconcile supplier and PO references, explicit currency, source confidence, nonnegative amounts, subtotal plus tax and the order limit. Decimal arithmetic never uses floats; amounts above twelve integer digits and ambiguous notation are rejected. Supported currencies are AUD, USD, EUR, GBP, NZD, CAD and SGD. Generated notes cannot change these checks or authorize payment.
5. The UI shows checks, source-linked facts, the original unmodified source, generated-versus-template notes, model/request/timing/credit trace, and an exportable JSON audit record.

`READY_FOR_REVIEW` means only that the implemented checks are consistent. It never means approved for payment. `HOLD` means a person needs to resolve missing, uncertain or conflicting information.

## Real API mode: one synthetic workflow verified

Initial development used no credentials. On October 30, actual free account access and protected key custody were established. The first two-request run failed closed because Extract anchored all four PO values to duplicate invoice text. After separating the documents at request boundaries, one actual three-endpoint run passed all twelve expected facts and strict source ownership. Total usage across both attempts: five requests, twenty-eight trial credits, zero paid charge. The original failure is preserved. See `evidence/clocked-live-summary-20261030.json`; this single author-written fixture does not establish general accuracy or calibrated thresholds.

To enable live mode later, provide `CLOCKED_API_KEY` to the backend environment, independently confirm that sufficient free credits remain, set `CLOCKED_FREE_CREDITS_CONFIRMED=1`, and run:

```sh
python app.py --live
```

The extra environment flag is an operator assertion, not an account balance check or a spending cap. The program cannot verify whether a request consumes free or paid credits. Leave live mode disabled until the account's free-credit balance has been confirmed. Each live review normally requests Decide, Extract and Fill; retries may repeat an existing idempotent attempt. The API key never goes to the browser.

The actual response shapes, evidence placement, model identifiers and credit headers were inspected for this one fixture. The private 90-second silent edited video uses genuine saved-result UI captures and factual captions; six decoded representative frames were independently inspected. It is not continuous browser capture or a new live provider journey. Public hosting and representative invoice validation remain outstanding. The 0.75 classification / 0.85 source-confidence thresholds remain provisional and uncalibrated. All included examples are fictional. No further provider requests are implied by the completed proof.

## Recovering interrupted runs

Each run has a UUID. Each endpoint receives a deterministic UUID derived from the run; the same payload is retried under the same idempotency key. The adapter makes at most three attempts with bounded backoff, stops on `retryAsNew: true`, and does not automatically create a new billable attempt. Authentication, credit, invalid-request and ordinary conflict failures are not retried.

Live runs save stage metadata and completed responses under `.ledgerlens/` with private file permissions. This local directory contains returned invoice facts and generated text, so treat it as document data. It never stores the API key or full submitted source text. Payload/source hashes prevent a run identifier being reused for changed documents or changed request schemas. Completed stages replay locally. Browser session storage retains only the latest run ID and document digest, allowing recovery after reload when the same documents are supplied again. Changes to the document pair create a different run. The UI serializes reviews; the backend rejects concurrent runs.

## Verification and honest evaluation

```sh
python -m unittest discover -s tests -v
python evaluate.py
node --check static/app.js
```

`tests/test_app.py` covers source ownership, Unicode/CRLF offsets, null facts, invented/generated evidence, malformed confidence, unsupported monetary formats and precision bounds, all template scenarios, same-key retries, retry budgets, authentication/credit/conflict errors, stage recovery, journal binding, actual local HTTP routes and concurrent review rejection.

The original 23-test pass is historical. After the document-separation change, one allocated regression passed: separate invoice/order payloads, all duplicated values with correct rebased ownership, journal replay and rejection of the original bad span. The full suite was not repeated. Policy version2 binds both journals and browser session digests to the revised schema.

`fixtures/cases.json` contains 20 author-written synthetic cases. It is neither independent nor held-out. Nineteen use the offline template; one deliberately uses a natural-language invoice that the offline parser cannot read. The latter is scored against the desired application result and therefore honestly reduces the aggregate score. `evaluation/offline-report.json` records 19/20 correct statuses, zero unsafe-ready results, 20/28 labelled field matches and 100% exact precision among non-null labelled reads. These figures describe only the offline parser and policy, not Clocked quality. The CLI evaluator has no bulk live-call switch.

On October30, the actual retained successful result was rendered offline through the unchanged application UI.1280px and390px CSS iframe viewports showed no horizontal overflow; the PO highlight belonged to the purchase order. Human-review and PO-only-draft labels were understandable in two viewed screenshots. One genuine new browser JSON download matched the full retained review plus explicit recorded-display metadata. The owned local service finished and was cleaned up; zero provider requests or credential reads occurred. This is not physical mobile-device or full accessibility testing. See evidence/clocked-offline-ui-summary-20261030.json.

## Limits

Text only; no OCR/PDF upload, line-item matching, tax-law interpretation, delivery verification, cross-system duplicate-invoice detection, independently verified ledger completeness, exchange-rate conversion or bank-detail verification. Supported monetary notation is `1,234.56` or `1234.56`; other locale conventions stay on hold. Supplier matching ignores case and repeated whitespace but does not resolve aliases or legal entities. Author-written fixtures cannot establish production reliability. The local stdlib server is a development/demo server, not a hosted production deployment.

## Official contract sources

Public documentation inspected 28 October 2026:

- https://clocked.rezolve.ai/docs/decide
- https://clocked.rezolve.ai/docs/extract
- https://clocked.rezolve.ai/docs/fill
- https://clocked.rezolve.ai/docs/authentication
- https://clocked.rezolve.ai/docs/responses
- https://clocked.rezolve.ai/docs/errors

The adapter uses direct HTTP JSON responses (no SDK `data` wrapper), HTTPS bearer authentication, required UUID `Idempotency-Key` headers, and Unicode code-point spans with exclusive ends. Browser evidence slicing uses `Array.from`, not UTF-16 `String.slice` offsets.

## November 1–2: explicit cumulative PO ledger

`po_balance.py` uses Decimal arithmetic over a caller-supplied ledger with explicit supplier, PO, currency, as-of date, source/cutoff and completeness assertion. The reviewed current invoice is counted once; a matching ledger row is excluded only when its ID and amount agree. Duplicate identifiers, current-invoice amount conflicts, mixed scope, credits/reversals and unsupported statuses keep the balance unknown/review-required. This is a narrow local commitment check, not reconciliation with an accounting system or evidence that a human completeness assertion is true.

The compact editor presents supported single-scope committed-invoice rows. Advanced JSON is canonical and preserves unsupported imports without coercion. All ledger edits stale the displayed decision and hide export. `/api/balance` recalculates from the retained source-owned facts without a provider call or new run ID. The outbound request omits the old unused balance to avoid duplicating its ledger/audit payload. Amounts include tax; no FX conversion occurs. See `PO_BALANCE.md`.

The backend's ten focused cases and the editor's ten model groups/five cross-language balance cases passed. No historical broad suite or provider run was repeated. Actual background-browser table editing, stale-export hiding, zero-allowance recalculation and incomplete-history handling passed. The download acknowledgement timed out. Exact export data was later retained through read-only page inspection and checked for source ownership, document fingerprint, run identity, checks and balance parity. Successful browser download and new-layout verification remain pending. Historical recorded-viewer evidence is separate.
