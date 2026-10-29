# Development log

## 2026-10-28

- Verified official challenge eligibility/rules with the parent research worker before creating the application. Entrant checks and prize/deadline evidence remain in the parent-owned README, challenge manifest and sources.
- Read the official Decide, Extract, Fill, authentication, response and retry contracts. Confirmed `CLOCKED_API_KEY` was absent through a presence-only check performed by the parent. No live requests, registration or payment actions followed.
- Authored the new standard-library Python application, three-endpoint HTTP adapter, deterministic invoice-to-order checks, source evidence validation, local run recovery journal, and responsive review desk from scratch.
- Added 20 synthetic documents/scenarios, 23 focused tests, local HTTP workflow coverage and an offline evaluation harness. Explicitly labelled scripted transports as contract/unit tests.
- Independent code review found three edge cases: cross-document payment terms, Decimal precision on unbounded numbers, and accepting arbitrary uppercase currency strings. Fixed all three and added regressions.
- Added per-field Unicode source highlights, generated-note labelling, audit JSON export, model/credit/timing trace and browser session run recovery. Disabled real API operation by default.
- Offline evaluation intentionally includes an unsupported free-form invoice: 19/20 status matches, no unsafe-ready classifications, 20/28 labelled field matches. Real model performance remains unmeasured.

This log is contemporaneous development evidence; it is not a replacement for repository history or real API execution evidence.

## 2026-10-29

- Reverified official rules section 10 and current pricing: 4,000 free credits plus 16,000 from CLOCKEDHACKATHON, one redemption per account; trial never incurs paid overage or automatically converts. Actual signed-in entitlement remains unverified.
- Sent the exact private account/key checklist to the sole browser controller. No browser actions, API calls or billing changes were made by the implementation owner.
- Corrected the obsolete creative-browser queue in the scoped README, retained prior tests unchanged, and prepared a concrete local entry/source review package. Public URLs, genuine integration evidence, visual QA and final entrant declarations remain pending.
