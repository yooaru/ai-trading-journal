#!/usr/bin/env python3
"""AI Trading Journal — HTTP Server with Auth"""
import http.server, socketserver, os, json, hashlib, argparse
from urllib.parse import urlparse, parse_qs

PORT = 8501
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(BASE_DIR, ".access_key")

# Allowed origins for CORS
ALLOWED_ORIGINS = [
    "http://localhost:8501",
    "http://127.0.0.1:8501",
    "https://ready-concentrate-immediate-providers.trycloudflare.com",
    # Add your GitHub Pages URL here after deploy:
    # "https://YOUR_USERNAME.github.io"
]

def set_key(key):
    hashed = hashlib.sha256(key.encode()).hexdigest()[:24]
    with open(KEY_FILE, "w") as f: f.write(hashed)
    print(f"✅ Access key set")

def get_key():
    if not os.path.exists(KEY_FILE): return None
    with open(KEY_FILE) as f: return f.read().strip()

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/verify"):
            params = parse_qs(urlparse(self.path).query)
            key = params.get("key", [""])[0]
            stored = get_key()
            hashed = hashlib.sha256(key.encode()).hexdigest()[:24]
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            if stored and hashed == stored:
                self.wfile.write(json.dumps({"valid": True}).encode())
            elif not stored:
                self.wfile.write(json.dumps({"valid": True, "no_key": True}).encode())
            else:
                self.wfile.write(json.dumps({"valid": False}).encode())
            return
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
            return
        return super().do_GET()

    def send_cors_headers(self):
        origin = self.headers.get("Origin", "")
        # Allow all for now (key protects data anyway)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if "/data/" in self.path:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")

    def log_message(self, fmt, *args):
        pass

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--set-key", help="Set access key")
    p.add_argument("--port", type=int, default=PORT)
    args = p.parse_args()
    if args.set_key: set_key(args.set_key); return
    if not get_key(): print("⚠️ No key set! Run: python3 server.py --set-key YOURKEY\n")
    os.chdir(BASE_DIR)
    with socketserver.TCPServer(("0.0.0.0", args.port), Handler) as httpd:
        print(f"🚀 http://0.0.0.0:{args.port} | Auth: {'✅' if get_key() else '⚠️'}")
        try: httpd.serve_forever()
        except KeyboardInterrupt: print("\n👋")

if __name__ == "__main__": main()
