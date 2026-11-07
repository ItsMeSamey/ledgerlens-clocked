"""Local PO commitment ledger. No network, persistence, or inferred account data."""
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re


CURRENCIES = {"AUD", "USD", "EUR", "GBP", "NZD", "CAD", "SGD"}


def identity(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Supplier, PO and invoice identifiers must be explicit text.")
    return " ".join(value.casefold().split())


def money(value):
    if not isinstance(value, str) or not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?", value):
        raise ValueError("Amounts must be nonnegative decimal strings; credits/reversals require review.")
    if len(value.split(".")[0].replace(",", "")) > 12:
        raise ValueError("Amount exceeds the supported range.")
    return Decimal(value.replace(",", ""))


def purchase_order_balance(fields, ledger):
    """Count explicit commitments once. Completeness is a human assertion, not verified."""
    result = {"status": "REVIEW_REQUIRED", "prior_committed": None, "current_invoice": None,
              "remaining_before": None, "remaining_after": None, "contributing_rows": [],
              "excluded_current_rows": [], "ledger": ledger, "ledger_sha256": None,
              "description": "Prior PO commitments are unknown. Supply a complete, dated local ledger."}
    if ledger is None:
        return result
    try:
        if not isinstance(ledger, dict):
            raise ValueError("Ledger must be a JSON object.")
        result["ledger_sha256"] = hashlib.sha256(json.dumps(ledger, sort_keys=True, ensure_ascii=False,
                                                            allow_nan=False).encode()).hexdigest()
        if ledger.get("complete") is not True:
            raise ValueError("Confirm the ledger includes all prior and pending commitments; unknown history is not zero.")
        as_of = ledger.get("as_of")
        if not isinstance(as_of, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", as_of):
            raise ValueError("Supply the ledger as-of date as YYYY-MM-DD.")
        if date.fromisoformat(as_of) > date.today():
            raise ValueError("A future as-of date cannot establish current history.")
        if not isinstance(ledger.get("context"), str) or not ledger["context"].strip():
            raise ValueError("Describe the ledger's source and completeness/as-of context.")
        value = lambda name: fields[name]["value"]
        vendor, po, invoice = identity(value("vendor")), identity(value("purchase_order_id")), identity(value("invoice_id"))
        if vendor != identity(value("order_vendor")) or po != identity(value("order_id")):
            raise ValueError("Current invoice and PO supplier/identifier must agree before aggregating history.")
        currency = value("currency")
        if currency not in CURRENCIES or currency != value("order_currency"):
            raise ValueError("Current invoice and PO must share a supported explicit currency.")
        if (identity(ledger.get("vendor")) != vendor or identity(ledger.get("po_id")) != po
                or ledger.get("currency") != currency):
            raise ValueError("Ledger scope must match the current supplier, PO and currency; no conversion or cross-PO aggregation.")
        total, limit = money(value("total")), money(value("order_total"))
        rows = ledger.get("rows")
        if not isinstance(rows, list) or len(rows) > 500:
            raise ValueError("Supply an explicit rows array with at most 500 commitments, including an empty array for verified zero history.")
        committed, seen, contributors, excluded = Decimal("0"), set(), [], []
        for index, row in enumerate(rows, 1):
            if not isinstance(row, dict):
                raise ValueError(f"Ledger row {index} must be an object.")
            if row.get("kind") != "invoice" or row.get("status") != "committed":
                raise ValueError(f"Ledger row {index}: only committed invoices are supported; credits, reversals and other statuses require review.")
            if (identity(row.get("vendor")) != vendor or identity(row.get("po_id")) != po
                    or row.get("currency") != currency):
                raise ValueError(f"Ledger row {index} has a different supplier, PO or currency; resolve it explicitly.")
            row_id = identity(row.get("invoice_id"))
            if row_id in seen:
                raise ValueError(f"Ledger row {index} duplicates an invoice identifier; resolve duplicate ledger rows.")
            seen.add(row_id)
            row_amount = money(row.get("amount"))
            item = {**row, "row_number": index}
            if row_id == invoice:
                if row_amount != total:
                    raise ValueError(f"Ledger row {index} matches the current invoice ID but has a different amount; review the identity conflict.")
                excluded.append(item)
            else:
                contributors.append(item)
                committed += row_amount
        remaining = limit - committed
        after = remaining - total
        result.update(status="WITHIN_BALANCE" if after >= 0 else "EXCEEDS_BALANCE",
                      currency=currency, as_of=as_of, prior_committed=f"{committed:.2f}",
                      current_invoice=f"{total:.2f}", authorized_total=f"{limit:.2f}",
                      remaining_before=f"{remaining:.2f}", remaining_after=f"{after:.2f}",
                      contributing_rows=contributors, excluded_current_rows=excluded,
                      description=f"{currency} {committed:.2f} prior commitments + {total:.2f} current invoice against {limit:.2f} PO; remaining {after:.2f}. Based only on the declared complete ledger as of {as_of}; current invoice excluded from prior spend.")
    except (ValueError, TypeError, KeyError, InvalidOperation) as exc:
        result["description"] = str(exc) or "Ledger or current facts need review."
    return result
