"""Auth verification endpoint."""
import json
import hashlib
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

KEY_HASH = os.environ.get("ACCESS_KEY_HASH", "")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        key = query.get("key", [""])[0]
        hashed = hashlib.sha256(key.encode()).hexdigest()[:24]

        if KEY_HASH and hashed == KEY_HASH:
            body = json.dumps({"valid": True})
        elif not KEY_HASH:
            body = json.dumps({"valid": True, "no_key": True})
        else:
            body = json.dumps({"valid": False})

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body.encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
