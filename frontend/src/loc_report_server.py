#!/usr/bin/env python3
"""
Lightweight HTTP server that wraps gitlab_loc_report.py logic.
Run this locally while connected to VPN, then use the LOC Report page.

Usage:
    pip install requests
    python loc_report_server.py [--port 8081]
"""
import http.server
import json
import sys
from datetime import datetime, date

from gitlab_loc_report import (
    generate_loc_report,
    GitLabClient,
    GitLabClientConfig,
    GitLabAPIError,
)

PORT = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == '--port' else 8081


class LocReportHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"[locr] {args[0]} {args[1]} {args[2]}")

    def _send(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()

    def do_POST(self):
        if self.path != '/loc-report':
            self._send(404, {'error': 'Use POST /loc-report'})
            return

        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except Exception:
            self._send(400, {'error': 'Invalid JSON'})
            return

        base_url = body.get('baseUrl', '').rstrip('/')
        token = body.get('token', '')
        user_id = body.get('userId', '')
        start = body.get('startDate', '')
        end = body.get('endDate', '')

        if not base_url or not token or not user_id or not start or not end:
            self._send(400, {'error': 'Missing required fields: baseUrl, token, userId, startDate, endDate'})
            return

        try:
            start_date = datetime.strptime(start, '%Y-%m-%d').date()
            end_date = datetime.strptime(end, '%Y-%m-%d').date()
        except ValueError:
            self._send(400, {'error': 'Invalid date format. Use YYYY-MM-DD.'})
            return

        if end_date < start_date:
            self._send(400, {'error': 'End date must be >= start date.'})
            return

        try:
            client = GitLabClient(GitLabClientConfig(
                base_url=base_url,
                private_token=token,
                timeout_seconds=120,
                max_retries=3,
                retry_backoff_seconds=1.5,
            ))
            mr_rows, file_rows, totals = generate_loc_report(
                client=client,
                user_identifier=user_id,
                start_date=start_date,
                end_date=end_date,
                membership_only=True,
            )
            self._send(200, {
                'ok': True,
                'mr_rows': mr_rows,
                'file_rows': file_rows,
                'totals': totals,
                'projects': list({r['project_name'] for r in mr_rows}),
            })
        except GitLabAPIError as e:
            self._send(502, {
                'error': f'GitLab API error: {e}',
                'status_code': e.status_code,
                'detail': str(e.body)[:500] if e.body else None,
            })
        except Exception as e:
            self._send(500, {'error': f'Unexpected error: {e}'})


if __name__ == '__main__':
    server = http.server.HTTPServer(('127.0.0.1', PORT), LocReportHandler)
    print(f'LOC Report server running on http://localhost:{PORT}/loc-report')
    print('Keep this running while using the LOC Report page.')
    print('Make sure requests is installed: pip install requests')
    print('Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
