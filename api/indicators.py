"""TradingView indicators endpoint — Vercel serverless."""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Add scripts to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

ASSET_MAP = {
    "BTC": {"symbol": "BTCUSDT", "exchange": "BINANCE"},
    "ETH": {"symbol": "ETHUSDT", "exchange": "BINANCE"},
    "SOL": {"symbol": "SOLUSDT", "exchange": "BINANCE"},
    "PAXG": {"symbol": "PAXGUSDT", "exchange": "BINANCE"},
    "XRP": {"symbol": "XRPUSDT", "exchange": "BINANCE"},
    "DOGE": {"symbol": "DOGEUSDT", "exchange": "BINANCE"},
    "WLD": {"symbol": "WLDUSDT", "exchange": "BINANCE"},
    "SUI": {"symbol": "SUIUSDT", "exchange": "BINANCE"},
    "LINK": {"symbol": "LINKUSDT", "exchange": "BINANCE"},
    "AVAX": {"symbol": "AVAXUSDT", "exchange": "BINANCE"},
    "BNB": {"symbol": "BNBUSDT", "exchange": "BINANCE"},
    "ADA": {"symbol": "ADAUSDT", "exchange": "BINANCE"},
    "DOT": {"symbol": "DOTUSDT", "exchange": "BINANCE"},
    "NEAR": {"symbol": "NEARUSDT", "exchange": "BINANCE"},
    "ARB": {"symbol": "ARBUSDT", "exchange": "BINANCE"},
    "OP": {"symbol": "OPUSDT", "exchange": "BINANCE"},
}

INTERVALS = {"15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d"}


def get_indicators(symbol, interval="1h"):
    """Fetch indicators from TradingView."""
    try:
        from tradingview_ta import TA_Handler, Interval
    except ImportError:
        return None

    interval_map = {
        "15m": Interval.INTERVAL_15_MINUTES,
        "1h": Interval.INTERVAL_1_HOUR,
        "4h": Interval.INTERVAL_4_HOURS,
        "1d": Interval.INTERVAL_1_DAY,
    }

    asset = ASSET_MAP.get(symbol.upper())
    if not asset:
        return None

    try:
        handler = TA_Handler(
            symbol=asset["symbol"],
            screener="crypto",
            exchange=asset["exchange"],
            interval=interval_map.get(interval, Interval.INTERVAL_1_HOUR),
        )
        analysis = handler.get_analysis()
        ind = analysis.indicators

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "close": ind.get("close", 0),
            "volume": ind.get("volume", 0),
            "rsi": ind.get("RSI", 0),
            "rsi_1": ind.get("RSI[1]", 0),
            "stoch_k": ind.get("Stoch.K", 0),
            "stoch_d": ind.get("Stoch.D", 0),
            "macd": ind.get("MACD.macd", 0),
            "macd_signal": ind.get("MACD.signal", 0),
            "macd_hist": ind.get("MACD.macd", 0) - ind.get("MACD.signal", 0),
            "bb_upper": ind.get("BB.upper", 0),
            "bb_lower": ind.get("BB.lower", 0),
            "bb_middle": ind.get("BB basis", 0),
            "bb_position": (ind.get("close", 0) - ind.get("BB.lower", 0)) / max(ind.get("BB.upper", 1) - ind.get("BB.lower", 0), 0.01),
            "ema10": ind.get("EMA10", 0),
            "ema20": ind.get("EMA20", 0),
            "ema50": ind.get("EMA50", 0),
            "sma50": ind.get("SMA50", 0),
            "recommendation": analysis.summary.get("RECOMMENDATION", "NEUTRAL"),
        }
    except Exception:
        return None


def binance_fallback(symbol):
    """Binance price fallback when TradingView fails."""
    import urllib.request
    pair = ASSET_MAP.get(symbol.upper(), {}).get("symbol", symbol.upper() + "USDT")
    try:
        url = f"https://api.binance.com/api/v3/ticker/price?symbol={pair}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=5)
        price = json.loads(resp.read()).get("price", "0")
        return {
            "symbol": symbol.upper(), "close": float(price), "rsi": 50, "macd_hist": 0,
            "recommendation": "NO_DATA (rate limited)", "stoch_k": 50,
            "ema10": float(price), "ema20": float(price), "volume": 0, "fallback": True,
        }
    except Exception:
        return {
            "symbol": symbol.upper(), "close": 0, "rsi": 50, "macd_hist": 0,
            "recommendation": "UNAVAILABLE", "stoch_k": 50, "ema10": 0, "ema20": 0,
            "volume": 0, "fallback": True,
        }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        symbol = query.get("symbol", ["BTC"])[0].upper()
        interval = query.get("interval", ["1h"])[0]

        data = get_indicators(symbol, interval)
        if not data or data.get("error"):
            data = binance_fallback(symbol)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "s-maxage=60, stale-while-revalidate=120")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
