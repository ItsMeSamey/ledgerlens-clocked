"""Consume actual JS-model edits and verify their local accounting consequence, offline."""
import json
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app

cases = json.loads(Path(sys.argv[1]).read_text())
previous = app.review(cases['invoice'], cases['order'])
rows = {}
with patch.object(app.ClockedClient, 'call', side_effect=AssertionError('No provider call')), \
     patch.object(app, 'urlopen', side_effect=AssertionError('No network')), \
     patch.object(app.Journal, 'write', side_effect=AssertionError('No journal write')):
    for name in ['edited','duplicate','mixed','credit','current']:
        result = app.refresh_balance(cases['invoice'], cases['order'], previous, cases[name])
        balance = result['balance']
        rows[name] = {'status': result['status'], 'balance_status': balance['status'],
                      'prior_committed': balance['prior_committed'], 'remaining_after': balance['remaining_after'],
                      'contributing_rows': balance['contributing_rows'], 'excluded_current_rows': balance['excluded_current_rows'],
                      'provider_trace': result['trace']}
        assert result['trace'] == []
        assert result['run_id'] == previous['run_id']
    assert rows['edited']['status'] == 'READY_FOR_REVIEW'
    assert rows['edited']['prior_committed'] == '400.00'
    assert rows['edited']['remaining_after'] == '0.00'  # 1000 - 400 prior - 600 current
    for name in ['duplicate','mixed','credit']:
        assert rows[name]['status'] == 'HOLD'
        assert rows[name]['balance_status'] == 'REVIEW_REQUIRED'
        assert rows[name]['remaining_after'] is None
    assert rows['current']['prior_committed'] == '600.00'
    assert rows['current']['remaining_after'] == '-200.00'
    assert len(rows['current']['excluded_current_rows']) == 1
print(json.dumps({'status':'PASS','cases':rows},indent=2))
