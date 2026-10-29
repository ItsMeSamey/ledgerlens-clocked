#!/usr/bin/env python3
"""Transparent synthetic-case evaluation. Offline is the default; never implies API performance."""
import argparse
import json
import os
import time
from pathlib import Path
import app


def evaluate(cases, mode='offline', client=None, journal=None):
    outcomes = []
    total_labels = correct_labels = extracted_labels = correct_extracted = 0
    for case in cases:
        started = time.perf_counter()
        try:
            result = app.review(case['invoice'], case['order'], mode, client, journal)
            expected = case.get('expected_fields', {})
            actual = {key: result['fields'][key]['value'] for key in expected}
            for key, value in expected.items():
                total_labels += 1
                correct_labels += actual[key] == value
                if actual[key] is not None:
                    extracted_labels += 1
                    correct_extracted += actual[key] == value
            failed = {check['code'] for check in result['checks'] if not check['ok']}
            outcomes.append({'id':case['id'], 'expected_status':case['expected_status'], 'actual_status':result['status'],
                             'status_correct':result['status'] == case['expected_status'],
                             'required_issues_found':set(case['expected_failed_checks']) <= failed,
                             'expected_fields':expected, 'actual_fields':actual,
                             'latency_ms':round((time.perf_counter()-started)*1000,3),
                             'trace':result['trace']})
        except (app.ReviewError, ValueError) as exc:
            outcomes.append({'id':case['id'],'error':str(exc),'status_correct':False})
    correct = sum(item['status_correct'] for item in outcomes)
    unsafe = sum(item.get('actual_status') == 'READY_FOR_REVIEW' and item.get('expected_status') == 'HOLD' for item in outcomes)
    return {'mode':mode, 'dataset':'20 author-written synthetic cases; not independent or held-out; one intentionally unsupported free-form case',
            'claim_limit':'Offline metrics measure the label parser and deterministic policy only. No API accuracy, latency or cost claims can be drawn from offline results.',
            'case_count':len(cases), 'status_correct':correct, 'status_accuracy':correct/len(cases),
            'unsafe_ready_count':unsafe, 'labelled_fields':total_labels, 'exact_field_accuracy':correct_labels/total_labels if total_labels else None,
            'non_null_exact_precision':correct_extracted/extracted_labels if extracted_labels else None,
            'api_calls':sum(len(item.get('trace',[])) for item in outcomes), 'cases':outcomes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases',type=Path,default=app.ROOT/'fixtures/cases.json')
    parser.add_argument('--output',type=Path,default=app.ROOT/'evaluation/offline-report.json')
    args = parser.parse_args()
    # Real API benchmarking is deliberately a separate manual workflow: no bulk-call flag.
    report = evaluate(json.loads(args.cases.read_text()))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({key:value for key,value in report.items() if key != 'cases'},indent=2))


if __name__ == '__main__':
    main()
