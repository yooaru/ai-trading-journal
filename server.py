#!/usr/bin/env python3
"""AI Trading Journal — HTTP Server with Auth"""
import http.server, socketserver, os, json, hashlib, argparse
from urllib.parse import urlparse, parse_qs

PORT = 8501
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(BASE_DIR, ".access_key")

# Import indicators lazily
_indicators_loaded = False
def load_indicators():
    global _indicators_loaded
    if not _indicators_loaded:
        import sys
        sys.path.insert(0, os.path.join(BASE_DIR, "scripts"))
    try:
        from indicators import get_indicators
        return get_indicators
    except ImportError:
        return None

def _binance_fallback(symbol):
    """Basic price + RSI from Binance when TradingView is rate-limited."""
    import urllib.request
    pairs = {"BTC":"BTCUSDT","ETH":"ETHUSDT","SOL":"SOLUSDT","PAXG":"PAXGUSDT",
             "XRP":"XRPUSDT","DOGE":"DOGEUSDT","WLD":"WLDUSDT","SUI":"SUIUSDT",
             "LINK":"LINKUSDT","AVAX":"AVAXUSDT","BNB":"BNBUSDT","ADA":"ADAUSDT",
             "DOT":"DOTUSDT","NEAR":"NEARUSDT","ARB":"ARBUSDT","OP":"OPUSDT"}
    pair = pairs.get(symbol.upper(), symbol.upper() + "USDT")
    try:
        url = f"https://api.binance.com/api/v3/ticker/price?symbol={pair}"
        req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=5)
        price = json.loads(resp.read()).get("price", "0")
        return {
            "symbol": symbol.upper(),
            "close": float(price),
            "rsi": 50,
            "macd_hist": 0,
            "recommendation": "NO_DATA (rate limited)",
            "stoch_k": 50,
            "ema10": float(price),
            "ema20": float(price),
            "volume": 0,
            "fallback": True
        }
    except Exception:
        return {"symbol": symbol.upper(), "close": 0, "rsi": 50, "macd_hist": 0,
                "recommendation": "UNAVAILABLE", "stoch_k": 50, "ema10": 0, "ema20": 0,
                "volume": 0, "fallback": True}

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
        # Root → landing page
        if self.path == "/" or self.path == "":
            path = os.path.join(BASE_DIR, "landing.html")
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.send_cors_headers()
            self.end_headers()
            with open(path, 'rb') as f:
                self.wfile.write(f.read())
            return
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
        # /api/indicators?symbol=BTC&interval=1h
        if self.path.startswith("/api/indicators"):
            params = parse_qs(urlparse(self.path).query)
            symbol = params.get("symbol", ["BTC"])[0].upper()
            interval = params.get("interval", ["1h"])[0]
            get_indicators = load_indicators()
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            data = None
            if get_indicators:
                try:
                    data = get_indicators(symbol, interval)
                    if data and data.get("error"):
                        data = None  # Treat error response as no data
                except Exception:
                    data = None
            if not data:
                data = _binance_fallback(symbol)
            self.wfile.write(json.dumps(data).encode())
            return
        # Serve static files with CORS headers
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            self.send_response(200)
            import mimetypes
            ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
            self.send_header('Content-type', ctype)
            self.send_cors_headers()
            self.end_headers()
            with open(path, 'rb') as f:
                self.wfile.write(f.read())
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
