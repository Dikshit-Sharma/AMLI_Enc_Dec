#!/usr/bin/env python3
"""
Internal corporate server for the AMLI AES / LOC Report app.

Serves the built React frontend and a GitLab proxy endpoint (/proxy)
from a single process. Deploy this on any machine INSIDE the corporate
network / VPN so it can reach the internal GitLab instance.

Usage:
    # 1. Build the React frontend first:
    cd frontend && npm run build

    # 2. Run this server:
    python internal-server.py [--port 8080] [--host 127.0.0.1] [--dist-dir dist]

    # 3. Open in browser:
    http://localhost:8080/
    The LOC Report page uses the proxy at /proxy (same origin, no CORS issues).
"""
import http.server
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROXY_PORT = 8080
HOST = "127.0.0.1"
DIST_DIR = "dist"

for i, arg in enumerate(sys.argv[1:], 1):
    if arg == "--port" and i < len(sys.argv):
        PROXY_PORT = int(sys.argv[i + 1])
    elif arg == "--host" and i < len(sys.argv):
        HOST = sys.argv[i + 1]
    elif arg == "--dist-dir" and i < len(sys.argv):
        DIST_DIR = sys.argv[i + 1]

BASE_DIR = Path(__file__).resolve().parent
DIST_PATH = (BASE_DIR / DIST_DIR).resolve()


class InternalHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"[server] {args[0]} {args[1]} {args[2]}")

    # ---- CORS helpers (for proxy endpoint) ----

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json_response(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, path):
        if path == "" or path == "/":
            path = "/index.html"
        file_path = DIST_PATH / path.lstrip("/")
        file_path = file_path.resolve()
        if not str(file_path).startswith(str(DIST_PATH)):
            self._json_response(403, {"error": "Forbidden"})
            return
        if not file_path.is_file():
            file_path = DIST_PATH / "index.html"
        if not file_path.is_file():
            self._json_response(404, {"error": "Not found"})
            return
        content_type, _ = mimetypes.guess_type(str(file_path))
        if content_type is None:
            content_type = "application/octet-stream"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    # ---- HTTP method handlers ----

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._json_response(200, {"ok": True, "message": "internal-server is alive"})
            return
        self._serve_static(self.path)

    def do_POST(self):
        if self.path != "/proxy":
            self._json_response(404, {"error": "Not found. Use POST /proxy"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except Exception:
            self._json_response(400, {"error": "Invalid JSON body"})
            return

        target = body.get("target")
        token = body.get("token")
        if not target or not token:
            self._json_response(400, {"error": 'Missing "target" or "token"'})
            return

        try:
            req = urllib.request.Request(
                target,
                headers={"PRIVATE-TOKEN": token},
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                text = resp.read().decode("utf-8")
                try:
                    data = json.loads(text)
                except Exception:
                    data = text
                self._json_response(200, {"status": resp.status, "data": data})
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
            except Exception:
                err_body = str(e)
            self._json_response(502, {"error": f"GitLab API HTTP {e.code}", "status": e.code, "data": err_body})
        except urllib.error.URLError as e:
            self._json_response(502, {"error": f"GitLab unreachable: {e.reason}"})
        except Exception as e:
            self._json_response(502, {"error": str(e)})


if __name__ == "__main__":
    if not DIST_PATH.is_dir():
        print(f"ERROR: Built frontend not found at {DIST_PATH}", file=sys.stderr)
        print("Run 'npm run build' in the frontend directory first.", file=sys.stderr)
        sys.exit(1)

    server = http.server.HTTPServer((HOST, PROXY_PORT), InternalHandler)
    print(f"Internal server running at http://{HOST}:{PROXY_PORT}")
    print(f"  Frontend:  http://{HOST}:{PROXY_PORT}/")
    print(f"  Proxy:     http://{HOST}:{PROXY_PORT}/proxy")
    print(f"  Serving static files from: {DIST_PATH}")
    print("Users on corporate VPN can access the full app via the URL above.")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(0)
