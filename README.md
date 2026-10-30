# LedgerLens

Source-linked invoice review for the Clocked Build Challenge. Newly authored during the October 21–November 10, 2026 building period.

## Run

Python 3.11+, no third-party packages:

```sh
python app.py
```

Open http://127.0.0.1:8765. Choose a fictional example, review the checks, select a fact to highlight the original evidence, then export the audit JSON. Default mode is visibly labelled **offline template demo** and makes no API calls.

The real backend uses Clocked Decide, Extract and Fill. One fictional three-endpoint workflow was verified on October 30, 2026. Read [IMPLEMENTATION.md](IMPLEMENTATION.md) before enabling live mode; use your own account/key and independently confirm free credits. Never place keys in the repository.

## Open the saved live example without a key

```sh
python recorded_demo.py
```

Open http://127.0.0.1:8766/recorded/ and choose **Load saved review**. This separate loopback viewer uses the original renderer and retained fictional Clocked result. It reads no API key, creates no provider client and rejects all new review POSTs. Its banner and exported display metadata identify the response as recorded. The ordinary application above remains unchanged. Stop the viewer with Ctrl+C.

## Watch the recorded demonstration

[Open the static demo page](docs/demo/index.html) or play [the MP4](docs/demo/ledgerlens-edited-demo.mp4). It is a silent 90-second edited walkthrough of four genuine saved-result UI captures plus factual captions, not continuous browser footage or a new API run. Captions and a transcript accompany it. Owner and independent critic inspected six representative decoded frames. The no-key viewer above lets you inspect the actual saved review yourself. See [video provenance](evidence/edited-demo-provenance-20261030.json).

## What the application does

- Decide classifies the invoice; uncertain or unsupported documents remain on hold.
- Extract reads eight invoice facts and payment terms from the invoice alone.
- Fill reads four purchase-order facts with inference disabled and drafts a clearly labelled purchase-order review note. The prompt and label restrict the draft to the purchase order; its generated wording still requires human verification.
- Document-local Unicode spans are validated before fixed-prefix rebasing. A second ownership gate checks all twelve original facts against the combined source.
- Explicit checks compare supplier, PO reference, currency, subtotal/tax/total and order limit using bounded Decimal amounts.
- Facts link to original evidence; the JSON export retains checks, source, model usage and request identifiers.

**Checks consistent — human review next** means only that these checks passed. A person must still confirm the documents and fulfillment. Generated notes cannot change the checks or authorize payment. The application does not verify delivery, duplicates, tax law, bank details or cumulative order spend.

## Measured evidence

The first live run returned exact value text but anchored four PO values to duplicate invoice text. The application correctly rejected it before Fill. That failed two-request attempt used nine free credits and remains in [the original diagnostic](evidence/clocked-first-run-failure-20261030.json).

After separating API document inputs, one actual Decide/Extract/Fill run returned all twelve expected facts with correct document ownership, invoice payment terms and 13/13 deterministic checks. It used nineteen free credits and took 2.252 seconds in the driver. Cumulative usage across both attempts was **five requests, twenty-eight free credits, zero paid charge**. See [the measured summary](evidence/clocked-live-summary-20261030.json) and [the retained fictional review](evidence/clocked-recorded-review-20261030.json). This is one author-written case, not general accuracy or a production benchmark.

Twenty-three local tests passed on October 28. The historical offline evaluation matched 19/20 statuses and 20/28 labelled facts, with zero unsafe-ready results; a free-form invoice deliberately exposes the template parser limitation. After the document-scoping change, one focused regression passed, covering separate payloads, duplicated values, rebased ownership, replay and rejection of the original bad span. The full suite was not rerun. Recorded-result UI QA passed at1280px and390px CSS iframe widths without horizontal overflow. The PO highlight belongs to the order; human-review and PO-draft labels were clear in two viewed captures. One genuine new JSON download matched the full saved review. No new provider request occurred. This was not physical-device or full accessibility testing; see [the UI summary](evidence/clocked-offline-ui-summary-20261030.json).

```sh
python -m unittest discover -s tests -v
python evaluate.py
node --check static/app.js
```

## Provenance and limits

AI-assisted implementation created specifically for this challenge; no earlier application code was reused. All included documents are fictional. Python standard library and browser platform APIs are used; no vendored application code or third-party application runtime dependencies. The separate edited video was encoded with FFmpeg/libx264 and rendered DejaVu Sans/Mono text; tool and font binaries are not bundled. Confidence thresholds are provisional and uncalibrated. The stdlib server is for local development/demo use.

[DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) records actual work and limitations. The first local Git checkpoint was made on October 29; earlier work was not recorded in Git and history is not backdated. No public repository, demo upload or contest submission is implied by this private package.

Official [challenge rules](https://clocked.rezolve.ai/build-challenge/rules) and endpoint contracts: [Decide](https://clocked.rezolve.ai/docs/decide), [Extract](https://clocked.rezolve.ai/docs/extract), [Fill](https://clocked.rezolve.ai/docs/fill).
