"""Focused new ledger behavior; hand-checkable fictional amounts, no provider/network."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import app
from po_balance import purchase_order_balance


CASES = json.loads((Path(__file__).parent / "fixtures" / "balance-cases.json").read_text())


def sample(index=0):
    case = copy.deepcopy(CASES[index])
    previous = app.review(case["invoice"], case["order"])
    return case, previous


class PurchaseOrderBalanceTests(unittest.TestCase):
    def test_individual_limit_passes_but_prior_commitments_exceed_balance(self):
        case, previous = sample()
        self.assertTrue(next(c["ok"] for c in previous["checks"] if c["code"] == "order_limit"))
        result = app.refresh_balance(case["invoice"], case["order"], previous, case["ledger"])
        self.assertEqual(result["status"], "HOLD")
        balance = result["balance"]
        self.assertEqual(balance["status"], "EXCEEDS_BALANCE")
        self.assertEqual((balance["prior_committed"], balance["current_invoice"], balance["remaining_before"], balance["remaining_after"]),
                         ("600.00", "600.00", "400.00", "-200.00"))
        self.assertEqual(balance["contributing_rows"][0]["invoice_id"], "INV-PRIOR")

    def test_explicit_zero_and_exact_boundary(self):
        for index, expected_prior, expected_after in [(1, "0.00", "400.00"), (2, "600.00", "0.00")]:
            with self.subTest(index=index):
                case, previous = sample(index)
                result = app.refresh_balance(case["invoice"], case["order"], previous, case["ledger"])
                self.assertEqual(result["status"], "READY_FOR_REVIEW")
                self.assertEqual(result["balance"]["prior_committed"], expected_prior)
                self.assertEqual(result["balance"]["remaining_after"], expected_after)

    def test_unknown_or_incomplete_history_never_means_zero(self):
        case, previous = sample()
        variants = [None, {}, {**case["ledger"], "complete": False}, {**case["ledger"], "as_of": ""},
                    {**case["ledger"], "as_of": "9999-01-01"}, {**case["ledger"], "context": ""}]
        for ledger in variants:
            with self.subTest(ledger=ledger):
                balance = purchase_order_balance(previous["fields"], ledger)
                self.assertEqual(balance["status"], "REVIEW_REQUIRED")
                self.assertIsNone(balance["prior_committed"])
                self.assertIsNone(balance["remaining_after"])

    def test_scope_and_row_identities_must_match(self):
        case, previous = sample()
        for key, value in [("currency", "USD"), ("vendor", "Another Supplier"), ("po_id", "OTHER-PO")]:
            for location in ["scope", "row"]:
                with self.subTest(key=key, location=location):
                    ledger = copy.deepcopy(case["ledger"])
                    target = ledger if location == "scope" else ledger["rows"][0]
                    target[key] = value
                    self.assertEqual(purchase_order_balance(previous["fields"], ledger)["status"], "REVIEW_REQUIRED")

    def test_current_invoice_excluded_and_recalculation_is_stateless(self):
        case, previous = sample()
        ledger = case["ledger"]
        ledger["rows"][0]["row_number"] = 999
        ledger["rows"].append({**ledger["rows"][0], "invoice_id": " inv-current "})
        untouched = copy.deepcopy(ledger)
        first = app.refresh_balance(case["invoice"], case["order"], previous, ledger)
        second = app.refresh_balance(case["invoice"], case["order"], first, ledger)
        self.assertEqual(first["balance"], second["balance"])
        self.assertEqual(second["balance"]["prior_committed"], "600.00")
        self.assertEqual(len(second["balance"]["contributing_rows"]), 1)
        self.assertEqual(second["balance"]["contributing_rows"][0]["row_number"], 1)
        self.assertEqual(len(second["balance"]["excluded_current_rows"]), 1)
        self.assertEqual(sum(c["code"] == "cumulative_po_balance" for c in second["checks"]), 1)
        self.assertEqual(ledger, untouched)
        self.assertNotIn("balance", previous)

    def test_duplicate_ids_and_conflicting_current_amount_require_review(self):
        case, previous = sample()
        duplicate = copy.deepcopy(case["ledger"])
        duplicate["rows"].append(dict(duplicate["rows"][0]))
        conflict = copy.deepcopy(case["ledger"])
        conflict["rows"].append({**conflict["rows"][0], "invoice_id": "INV-CURRENT", "amount": "599.00"})
        for ledger in [duplicate, conflict]:
            self.assertEqual(purchase_order_balance(previous["fields"], ledger)["status"], "REVIEW_REQUIRED")

    def test_credit_reversal_status_negative_and_numeric_amounts_require_review(self):
        case, previous = sample()
        for change in [{"kind": "credit_note"}, {"kind": "reversal"}, {"status": "cancelled"},
                       {"status": "pending"}, {"amount": "-100.00"}, {"amount": 600}]:
            with self.subTest(change=change):
                ledger = copy.deepcopy(case["ledger"])
                ledger["rows"][0].update(change)
                balance = purchase_order_balance(previous["fields"], ledger)
                self.assertEqual(balance["status"], "REVIEW_REQUIRED")
                self.assertIsNone(balance["prior_committed"])

    def test_decimal_cents_exact(self):
        case, previous = sample()
        fields = copy.deepcopy(previous["fields"])
        fields["total"]["value"] = "0.20"
        fields["order_total"]["value"] = "0.30"
        case["ledger"]["rows"][0]["amount"] = "0.10"
        balance = purchase_order_balance(fields, case["ledger"])
        self.assertEqual(balance["remaining_after"], "0.00")
        self.assertEqual(balance["status"], "WITHIN_BALANCE")

    def test_retained_facts_are_revalidated_without_provider_or_journal(self):
        case, previous = sample()
        with patch.object(app.ClockedClient, "call", side_effect=AssertionError("No provider call")) as client, \
             patch.object(app, "urlopen", side_effect=AssertionError("No network")) as network, \
             patch.object(app.Journal, "write", side_effect=AssertionError("No journal write")) as journal:
            result = app.refresh_balance(case["invoice"], case["order"], previous, case["ledger"])
            self.assertEqual(result["trace"], previous["trace"])
            self.assertEqual(result["run_id"], previous["run_id"])
            self.assertEqual(result["source_sha256"], previous["source_sha256"])
            with self.assertRaises(app.ReviewError):
                app.refresh_balance(case["invoice"] + " changed", case["order"], previous, case["ledger"])
            tampered = copy.deepcopy(previous)
            tampered["fields"]["total"]["value"] = "1.00"
            with self.assertRaises(app.ReviewError):
                app.refresh_balance(case["invoice"], case["order"], tampered, case["ledger"])
            client.assert_not_called(); network.assert_not_called(); journal.assert_not_called()

    def test_current_credit_note_cannot_establish_allowance(self):
        case, previous = sample()
        previous["classification"]["label"] = "credit_note"
        result = app.refresh_balance(case["invoice"], case["order"], previous, case["ledger"])
        self.assertEqual(result["status"], "HOLD")
        self.assertEqual(result["balance"]["status"], "REVIEW_REQUIRED")


if __name__ == "__main__":
    unittest.main()
