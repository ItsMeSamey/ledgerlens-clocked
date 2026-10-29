# LedgerLens implementation

A new invoice review application written on 28 October 2026 for the Clocked Build Challenge. All application code was authored for this project; no earlier challenge application was reused.

## Run locally

Requires Python 3.11+; no package installation or API key is needed for the demo.

```sh
python app.py
```

Open http://127.0.0.1:8765. The default is visibly labelled **OFFLINE TEMPLATE DEMO**. Choose a fictional example, run the review, select any fact to highlight its exact original source, then export the audit JSON. The server listens only on loopback. There is no payment action, signup, submission, deployment or messaging integration.

## What is implemented

1. Clocked Decide classifies the submitted document as invoice, quote, credit note or not established. Quotes, credits and uncertain classifications remain on hold.
2. Clocked Extract reads twelve invoice/order facts verbatim. Every non-null fact must have exact Unicode character offsets within the correct document. Missing, inferred, generated, wrong-document and offset-mismatched facts cannot become accepted evidence.
3. Deterministic application checks reconcile supplier and PO references, explicit currency, source-read confidence, nonnegative amounts, subtotal plus tax, and the invoice total against the order's authorized total. Decimal arithmetic never uses floats; amounts with more than twelve integer digits or ambiguous notation are rejected. Supported currencies are AUD, USD, EUR, GBP, NZD, CAD and SGD.
4. Clocked Fill extracts invoice payment terms with `infer: false`, routes the review to one of three teams and produces a clearly labelled draft handoff. The generated handoff cannot change any arithmetic check or the application status. Payment terms must come from the invoice range.
5. The UI shows checks, source-linked facts, the original unmodified source, generated-versus-template notes, model/request/timing/credit trace, and an exportable JSON audit record.

`READY_FOR_REVIEW` means only that the implemented checks are consistent. It never means approved for payment. `HOLD` means a person needs to resolve missing, uncertain or conflicting information.

## Real API mode: implemented, not live-verified

No Clocked credentials were available during development. **No real API request was sent.** The transport was checked against official public docs and exercised with scripted contract fixtures, which are unit tests, not live integration evidence.

To enable live mode later, provide `CLOCKED_API_KEY` to the backend environment, independently confirm that sufficient free credits remain, set `CLOCKED_FREE_CREDITS_CONFIRMED=1`, and run:

```sh
python app.py --live
```

The extra environment flag is an operator assertion, not an account balance check or a spending cap. The program cannot verify whether a request consumes free or paid credits. Leave live mode disabled until the account's free-credit balance has been confirmed. Each live review normally requests Decide, Extract and Fill; retries may repeat an existing idempotent attempt. The API key never goes to the browser.

Do not claim this implementation is submission-ready until a funded-free live run has been inspected. Check the actual response shapes, evidence placement, latency and per-request credit headers; collect a representative invoice evaluation set and calibrate the provisional 0.75 classification / 0.85 source-confidence thresholds. The included public examples are fictional.

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

`fixtures/cases.json` contains 20 author-written synthetic cases. It is neither independent nor held-out. Nineteen use the offline template; one deliberately uses a natural-language invoice that the offline parser cannot read. The latter is scored against the desired application result and therefore honestly reduces the aggregate score. `evaluation/offline-report.json` records 19/20 correct statuses, zero unsafe-ready results, 20/28 labelled field matches and 100% exact precision among non-null labelled reads. These figures describe only the offline parser and policy, not Clocked quality. The CLI evaluator has no bulk live-call switch.

No visual browser validation was performed because the connected browser was unavailable. Static JavaScript syntax and local HTTP serving were verified; the CSS includes a mobile breakpoint and reduced-motion handling.

## Limits

Text only; no OCR/PDF upload, line-item matching, tax-law interpretation, delivery verification, duplicate-invoice detection, cumulative order spend, exchange-rate conversion or bank-detail verification. Supported monetary notation is `1,234.56` or `1234.56`; other locale conventions stay on hold. Supplier matching ignores case and repeated whitespace but does not resolve aliases or legal entities. Author-written fixtures cannot establish production reliability. The local stdlib server is a development/demo server, not a hosted production deployment.

## Official contract sources

Public documentation inspected 28 October 2026:

- https://clocked.rezolve.ai/docs/decide
- https://clocked.rezolve.ai/docs/extract
- https://clocked.rezolve.ai/docs/fill
- https://clocked.rezolve.ai/docs/authentication
- https://clocked.rezolve.ai/docs/responses
- https://clocked.rezolve.ai/docs/errors

The adapter uses direct HTTP JSON responses (no SDK `data` wrapper), HTTPS bearer authentication, required UUID `Idempotency-Key` headers, and Unicode code-point spans with exclusive ends. Browser evidence slicing uses `Array.from`, not UTF-16 `String.slice` offsets.
