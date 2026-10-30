#!/usr/bin/env python3
"""Serve the retained fictional live review locally, with all review POSTs disabled."""
import argparse
from pathlib import Path
import threading

import app

ROOT = Path(__file__).resolve().parent


class RecordedHandler(app.Handler):
    def do_GET(self):
        routes = {
            '/recorded/': ('demo/replay.html', 'text/html; charset=utf-8'),
            '/recorded/replay.js': ('demo/replay.js', 'text/javascript; charset=utf-8'),
            '/recorded/result.json': ('evidence/clocked-recorded-review-20261030.json', 'application/json'),
        }
        if self.path in routes:
            relative, content_type = routes[self.path]
            return self.respond(200, (ROOT / relative).read_bytes(), content_type)
        return super().do_GET()

    def do_POST(self):
        self.respond(405, {'error': 'Saved example only. This server cannot start a review or call Clocked.'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('port must be between 0 and 65535')
    server = app.ThreadingHTTPServer(('127.0.0.1', args.port), RecordedHandler)
    server.live_enabled = False
    server.client = server.journal = None
    server.review_lock = threading.Lock()
    print(f'Saved fictional review: http://127.0.0.1:{server.server_port}/recorded/', flush=True)
    print('No API key is read. New review requests are disabled. Stop with Ctrl+C.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
