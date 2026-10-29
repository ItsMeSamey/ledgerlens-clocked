"""Unit and local HTTP tests. Scripted transport tests are NOT live integration tests."""
import io
import json
import tempfile
import threading
import unittest
import uuid
from copy import deepcopy
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import app

CASES = json.loads((app.ROOT / 'fixtures/cases.json').read_text())
BASE = CASES[0]


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.source, self.ranges = app.sources(BASE['invoice'], BASE['order'])
        self.fields = app.offline_extract(self.source, self.ranges)

    def test_exact_unicode_spans_and_line_endings(self):
        for name in ('unicode', 'crlf'):
            case = next(item for item in CASES if item['id'] == name)
            result = app.review(case['invoice'], case['order'])
            self.assertEqual(result['status'], 'READY_FOR_REVIEW')
            for field in result['fields'].values():
                if field['value'] is not None:
                    self.assertEqual(field['value'], result['source'][field['start']:field['end']])

    def test_wrong_document_span_rejected_even_when_text_matches(self):
        self.fields['vendor'] = self.fields['order_vendor']
        with self.assertRaisesRegex(app.ReviewError, 'unsupported evidence'):
            app.validate_fields(self.fields, self.source, self.ranges)

    def test_corrupted_offsets_rejected(self):
        self.fields['total']['end'] += 1
        with self.assertRaises(app.ReviewError):
            app.validate_fields(self.fields, self.source, self.ranges)

    def test_generated_value_is_not_verbatim_evidence(self):
        self.fields['total']['source'] = 'generated'
        with self.assertRaises(app.ReviewError):
            app.validate_fields(self.fields, self.source, self.ranges)

    def test_null_is_preserved(self):
        self.fields['tax'] = {'value': None, 'confidence': 1}
        fields = app.validate_fields(self.fields, self.source, self.ranges)
        self.assertIsNone(fields['tax']['value'])
        self.assertEqual(app.reconcile(fields, {'label':'invoice','confidence':1}, 'live')[0], 'HOLD')

    def test_confidence_missing_low_nan_and_boolean(self):
        for value in (float('nan'), True, -1, 1.1):
            fields = deepcopy(self.fields)
            fields['total']['confidence'] = value
            with self.assertRaises(app.ReviewError):
                app.validate_fields(fields, self.source, self.ranges)
        fields = app.validate_fields(self.fields, self.source, self.ranges)
        self.assertEqual(app.reconcile(fields, {'label':'invoice','confidence':1}, 'live')[0], 'HOLD')

    def test_boolean_offsets_rejected(self):
        self.fields['vendor']['start'] = True
        with self.assertRaises(app.ReviewError):
            app.validate_fields(self.fields, self.source, self.ranges)

    def test_payment_terms_cannot_be_borrowed_from_order(self):
        source, ranges = app.sources(BASE['invoice'], BASE['order'] + '\nPayment terms: Net 30 days')
        start = source.index('Net 30 days')
        result = {'fields': {'review_team': {'value':'Accounts payable'},
                            'review_note': {'value':'Review required.', 'source':'generated'},
                            'payment_terms': app.span(source, start, start + 11)}}
        with self.assertRaisesRegex(app.ReviewError, 'payment terms'):
            app.validate_handoff(result, source, ranges['invoice'])
        start = source.index('Net 14 days')
        result['fields']['payment_terms'] = app.span(source, start, start + 11)
        self.assertEqual(app.validate_handoff(result, source, ranges['invoice'])['payment_terms']['value'], 'Net 14 days')

    def test_missing_schema_field_rejected(self):
        del self.fields['total']
        with self.assertRaisesRegex(app.ReviewError, 'omitted'):
            app.validate_fields(self.fields, self.source, self.ranges)


class ReconciliationTests(unittest.TestCase):
    def test_template_case_decisions(self):
        for case in CASES:
            if case['id'] == 'freeform':
                continue
            with self.subTest(case=case['id']):
                result = app.review(case['invoice'], case['order'])
                self.assertEqual(result['status'], case['expected_status'])
                failed = {check['code'] for check in result['checks'] if not check['ok']}
                self.assertTrue(set(case['expected_failed_checks']) <= failed)
                for key, expected in case['expected_fields'].items():
                    self.assertEqual(result['fields'][key]['value'], expected)
                self.assertEqual(result['trace'], [])

    def test_freeform_limitation_is_a_hold_not_a_false_success(self):
        case = next(item for item in CASES if item['id'] == 'freeform')
        result = app.review(case['invoice'], case['order'])
        self.assertEqual(result['status'], 'HOLD')
        self.assertIsNone(result['fields']['total']['value'])

    def test_money_uses_exact_decimal(self):
        self.assertEqual(app.amount('0.10') + app.amount('0.20'), app.amount('0.30'))
        self.assertEqual(app.amount('999,999,999,999.99') - app.amount('999999999999.98'), app.amount('0.01'))
        for invalid in ('1.234,56', '$1.00', '1e4', 'NaN', '12,34.00', '1.001', '1000000000000000000000000000001'):
            with self.subTest(value=invalid), self.assertRaises(app.ReviewError):
                app.amount(invalid)

    def test_no_implicit_live_fallback(self):
        with self.assertRaisesRegex(app.ReviewError, 'configured backend'):
            app.review(BASE['invoice'], BASE['order'], mode='live')

    def test_input_limits(self):
        for invoice, order in [('', ''), (None, ''), ('x' * (app.MAX_TEXT + 1), '')]:
            with self.assertRaises(app.ReviewError):
                app.sources(invoice, order)


class Response(io.BytesIO):
    def __init__(self, payload):
        super().__init__(json.dumps(payload).encode())
        self.headers = {'X-Clocked-Credits':'3', 'X-Clocked-Transport':'direct'}


class AdapterContractTests(unittest.TestCase):
    def test_unknown_network_outcome_reuses_identical_request(self):
        seen = []
        def transport(request, timeout):
            seen.append((request.full_url, request.data, dict(request.header_items()), timeout))
            if len(seen) == 1:
                raise URLError('scripted unknown outcome')
            return Response({'model':'contract-test-only','answers':{}})
        client = app.ClockedClient('test-only-key', transport, lambda _: None)
        result = client.call('decide', {'state':'test','questions':{}}, str(uuid.uuid4()))
        self.assertEqual(seen[0], seen[1])
        self.assertEqual(result['credits'], '3')
        self.assertNotIn('Authorization', json.dumps(result))
        self.assertIn('/clocked/decide', seen[0][0])
        self.assertEqual(seen[0][3], 130)

    def test_stop_when_server_requires_new_attempt(self):
        calls = []
        def transport(request, timeout):
            calls.append(request)
            raise HTTPError(request.full_url, 503, 'scripted', {}, io.BytesIO(b'{"retryAsNew":true}'))
        with self.assertRaisesRegex(app.ReviewError, 'No new billable attempt'):
            app.ClockedClient('test-only-key', transport, lambda _: None).call('extract', {}, str(uuid.uuid4()))
        self.assertEqual(len(calls), 1)

    def test_auth_credit_conflict_and_invalid_requests_are_not_retried(self):
        for status in (400, 401, 402, 403, 409, 422):
            calls = []
            def transport(request, timeout):
                calls.append(request)
                raise HTTPError(request.full_url, status, 'scripted', {}, io.BytesIO(b'{}'))
            with self.subTest(status=status), self.assertRaises(app.ReviewError):
                app.ClockedClient('test-only-key', transport, lambda _: None).call('extract', {}, str(uuid.uuid4()))
            self.assertEqual(len(calls), 1)

    def test_retry_budget(self):
        calls = []
        def transport(request, timeout):
            calls.append(request)
            raise URLError('scripted')
        with self.assertRaises(app.ReviewError):
            app.ClockedClient('test-only-key', transport, lambda _: None).call('extract', {}, str(uuid.uuid4()))
        self.assertEqual(len(calls), 3)

    def test_unsupported_endpoint_never_dispatched(self):
        with self.assertRaises(app.ReviewError):
            app.ClockedClient('test-only-key', lambda *_: self.fail('dispatched')).call('unknown', {}, str(uuid.uuid4()))

    def test_three_endpoint_orchestration_and_journal_recovery(self):
        calls = []
        source, ranges = app.sources(BASE['invoice'], BASE['order'])
        def transport(request, timeout):
            endpoint = request.full_url.rsplit('/',1)[-1]
            calls.append(endpoint)
            payload = json.loads(request.data)
            if endpoint == 'decide':
                result = {'answers':{'document_type':{'choice':'invoice','confidence':.99}}}
            elif endpoint == 'extract':
                self.assertEqual(payload['text'], source)
                fields = app.offline_extract(source, ranges)
                for field in fields.values():
                    field['confidence'] = .99
                result = {'fields':fields}
            else:
                self.assertFalse(payload['fields']['payment_terms']['infer'])
                start = source.index('Net 14 days')
                result = {'fields':{'review_team':{'value':'Accounts payable'},
                                    'review_note':{'value':'Review this invoice.','source':'generated'},
                                    'payment_terms': app.span(source,start,start+11)}}
            return Response(result)
        with tempfile.TemporaryDirectory() as directory:
            journal = app.Journal(directory)
            run_id = str(uuid.uuid4())
            client = app.ClockedClient('test-only-key', transport, lambda _:None)
            result = app.review(BASE['invoice'], BASE['order'], 'live', client, journal, run_id)
            self.assertEqual(result['status'], 'READY_FOR_REVIEW')
            self.assertEqual(calls, ['decide','extract','fill'])
            replay = app.review(BASE['invoice'], BASE['order'], 'live', client, journal, run_id)
            self.assertEqual(len(calls), 3)
            self.assertTrue(all(stage['local_replay'] for stage in replay['trace']))
            self.assertNotIn('test-only-key', Path(directory,run_id+'.json').read_text())
            with self.assertRaisesRegex(app.ReviewError, 'different documents'):
                app.review(BASE['invoice']+'\nChanged', BASE['order'], 'live', client, journal, run_id)


class LocalHTTPTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1',0), app.Handler)
        self.server.live_enabled = False
        self.server.client = self.server.journal = None
        self.server.review_lock = threading.Lock()
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_local_workflow_and_static_assets(self):
        for path in ('/', '/app.js', '/style.css', '/api/config', '/api/examples'):
            with urlopen(self.url+path) as response:
                self.assertEqual(response.status,200)
                self.assertGreater(len(response.read()),10)
        request = Request(self.url+'/api/review',data=json.dumps(BASE | {'mode':'offline'}).encode(),headers={'Content-Type':'application/json'})
        with urlopen(request) as response:
            result = json.load(response)
        self.assertEqual(result['status'],'READY_FOR_REVIEW')
        self.assertEqual(result['mode'],'offline')

    def test_live_cannot_be_selected_when_disabled(self):
        request = Request(self.url+'/api/review',data=json.dumps(BASE | {'mode':'live'}).encode())
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code,400)
        self.assertIn('Live mode is disabled',error.exception.read().decode())
        error.exception.close()

    def test_concurrent_review_is_rejected(self):
        self.server.review_lock.acquire()
        try:
            request = Request(self.url+'/api/review',data=json.dumps(BASE).encode())
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code,409)
            error.exception.close()
        finally:
            self.server.review_lock.release()


if __name__ == '__main__':
    unittest.main()
