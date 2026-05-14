#!/usr/bin/env python3
"""
Local proxy for GitLab LOC Report tool.
Run this on your corporate network machine, then use the LOC Report
page with "Local Proxy" option pointing to http://localhost:8080/proxy

Usage:
    python gitlab-proxy.py [--port 8080]
"""
import http.server
import json
import urllib.request
import sys
from urllib.parse import urlparse, ParseResult

PROXY_PORT = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == '--port' else 8080


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self._json(200, {'ok': True, 'message': 'local proxy is alive'})
            return
        self._json(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path != '/proxy':
            self._json(404, {'error': 'Not found. Use POST /proxy'})
            return

        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except Exception:
            self._json(400, {'error': 'Invalid JSON'})
            return

        target = body.get('target')
        token = body.get('token')
        if not target or not token:
            self._json(400, {'error': 'Missing target or token'})
            return

        try:
            req = urllib.request.Request(target, headers={'PRIVATE-TOKEN': token})
            with urllib.request.urlopen(req, timeout=120) as resp:
                text = resp.read().decode()
                try:
                    data = json.loads(text)
                except Exception:
                    data = text
                self._json(200, {'status': resp.status, 'data': data})
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode())
            except Exception:
                err_body = str(e)
            self._json(e.code, {'status': e.code, 'data': err_body})
        except Exception as e:
            self._json(502, {'error': str(e)})

    def _json(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def log_message(self, format, *args):
        print(f"[proxy] {args[0]} {args[1]} {args[2]}")


if __name__ == '__main__':
    server = http.server.HTTPServer(('0.0.0.0', PROXY_PORT), ProxyHandler)
    print(f'GitLab proxy running on http://localhost:{PROXY_PORT}/proxy')
    print('The LOC Report page will auto-detect this proxy.')
    print('Connect to VPN, run this script, and open the webpage.')
    print('Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
