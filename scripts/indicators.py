#!/usr/bin/env python3
"""
TradingView Indicators Module
Fetches RSI, MACD, Bollinger Bands, EMA, SMA for crypto assets.
"""
from tradingview_ta import TA_Handler, Interval, Exchange
import time

ASSET_MAP = {
    "BTC":  {"symbol": "BTCUSDT", "exchange": "BINANCE"},
    "ETH":  {"symbol": "ETHUSDT", "exchange": "BINANCE"},
    "SOL":  {"symbol": "SOLUSDT", "exchange": "BINANCE"},
    "PAXG": {"symbol": "PAXGUSDT","exchange": "BINANCE"},
    "XRP":  {"symbol": "XRPUSDT", "exchange": "BINANCE"},
    "DOGE": {"symbol": "DOGEUSDT","exchange": "BINANCE"},
    "WLD":  {"symbol": "WLDUSDT", "exchange": "BINANCE"},
    "SUI":  {"symbol": "SUIUSDT", "exchange": "BINANCE"},
    "LINK": {"symbol": "LINKUSDT","exchange": "BINANCE"},
    "AVAX": {"symbol": "AVAXUSDT","exchange": "BINANCE"},
}

INTERVALS = {
    "15m": Interval.INTERVAL_15_MINUTES,
    "1h":  Interval.INTERVAL_1_HOUR,
    "4h":  Interval.INTERVAL_4_HOURS,
    "1d":  Interval.INTERVAL_1_DAY,
}


def get_indicators(symbol, interval="1h"):
    """Fetch full indicator set for a symbol."""
    asset = ASSET_MAP.get(symbol.upper())
    if not asset:
        return None

    try:
        handler = TA_Handler(
            symbol=asset["symbol"],
            screener="crypto",
            exchange=asset["exchange"],
            interval=INTERVALS.get(interval, Interval.INTERVAL_1_HOUR)
        )
        analysis = handler.get_analysis()
        ind = analysis.indicators
        summary = analysis.summary

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "close": ind.get("close", 0),
            "volume": ind.get("volume", 0),
            # Momentum
            "rsi": ind.get("RSI", 0),
            "rsi_1": ind.get("RSI[1]", 0),
            "stoch_k": ind.get("Stoch.K", 0),
            "stoch_d": ind.get("Stoch.D", 0),
            # MACD
            "macd": ind.get("MACD.macd", 0),
            "macd_signal": ind.get("MACD.signal", 0),
            "macd_hist": ind.get("MACD.macd", 0) - ind.get("MACD.signal", 0),
            # Bollinger Bands
            "bb_upper": ind.get("BB.upper", 0),
            "bb_lower": ind.get("BB.lower", 0),
            "bb_middle": ind.get("BB.median", ind.get("close", 0)),
            "bb_width": (ind.get("BB.upper", 0) - ind.get("BB.lower", 0)) / ind.get("close", 1) * 100,
            # Moving Averages
            "ema10": ind.get("EMA10", 0),
            "ema20": ind.get("EMA20", 0),
            "ema50": ind.get("EMA50", 0),
            "sma50": ind.get("SMA50", 0),
            "sma200": ind.get("SMA200", 0),
            # Trend
            "recommendation": summary.get("RECOMMENDATION", "NEUTRAL"),
            "buy_signals": summary.get("BUY", 0),
            "sell_signals": summary.get("SELL", 0),
            "neutral_signals": summary.get("NEUTRAL", 0),
        }
    except Exception as e:
        return {"error": str(e)}


def get_multi_tf(symbol):
    """Get indicators across multiple timeframes."""
    results = {}
    for tf in ["15m", "1h", "4h"]:
        results[tf] = get_indicators(symbol, tf)
        time.sleep(0.5)  # rate limit
    return results


def analyze_signal(indicators):
    """
    Analyze indicators and generate trading signal.
    Returns: {"signal": "BUY"|"SELL"|"HOLD", "strength": 0-100, "reasons": [...]}
    """
    if not indicators or "error" in indicators:
        return {"signal": "HOLD", "strength": 0, "reasons": ["No data"]}

    i = indicators
    buy_score = 0
    sell_score = 0
    reasons = []

    # === RSI ===
    rsi = i["rsi"]
    if rsi < 30:
        buy_score += 25
        reasons.append(f"RSI oversold ({rsi:.0f})")
    elif rsi < 40:
        buy_score += 15
        reasons.append(f"RSI low ({rsi:.0f})")
    elif rsi > 70:
        sell_score += 25
        reasons.append(f"RSI overbought ({rsi:.0f})")
    elif rsi > 60:
        sell_score += 10
        reasons.append(f"RSI high ({rsi:.0f})")

    # RSI divergence (RSI going up while price flat/down)
    rsi_1 = i.get("rsi_1", rsi)
    if rsi > rsi_1 + 3 and i["close"] < i["ema10"]:
        buy_score += 10
        reasons.append("RSI bullish divergence")

    # === MACD ===
    macd_hist = i["macd_hist"]
    if macd_hist > 0 and i["macd"] > i["macd_signal"]:
        buy_score += 20
        reasons.append(f"MACD bullish (hist: {macd_hist:.2f})")
    elif macd_hist < 0 and i["macd"] < i["macd_signal"]:
        sell_score += 20
        reasons.append(f"MACD bearish (hist: {macd_hist:.2f})")

    # MACD crossover
    if i["macd"] > i["macd_signal"] and macd_hist > 0:
        buy_score += 5
    elif i["macd"] < i["macd_signal"] and macd_hist < 0:
        sell_score += 5

    # === Bollinger Bands ===
    close = i["close"]
    bb_upper = i["bb_upper"]
    bb_lower = i["bb_lower"]
    bb_middle = i["bb_middle"]
    bb_pos = (close - bb_lower) / (bb_upper - bb_lower) if bb_upper != bb_lower else 0.5

    if bb_pos < 0.2:  # Near lower band
        buy_score += 20
        reasons.append(f"Near BB lower ({bb_pos:.0%})")
    elif bb_pos < 0.35:
        buy_score += 10
        reasons.append(f"Below BB middle ({bb_pos:.0%})")
    elif bb_pos > 0.8:  # Near upper band
        sell_score += 20
        reasons.append(f"Near BB upper ({bb_pos:.0%})")
    elif bb_pos > 0.65:
        sell_score += 10
        reasons.append(f"Above BB middle ({bb_pos:.0%})")

    # === EMA Trend ===
    if close > i["ema10"] > i["ema20"] > i["ema50"]:
        buy_score += 15
        reasons.append("EMA bullish alignment")
    elif close < i["ema10"] < i["ema20"] < i["ema50"]:
        sell_score += 15
        reasons.append("EMA bearish alignment")

    # Price vs EMA20
    ema20_dist = (close - i["ema20"]) / i["ema20"] * 100
    if ema20_dist < -2:
        buy_score += 10
        reasons.append(f"Below EMA20 by {abs(ema20_dist):.1f}%")
    elif ema20_dist > 2:
        sell_score += 10
        reasons.append(f"Above EMA20 by {ema20_dist:.1f}%")

    # === Stochastic ===
    stoch_k = i.get("stoch_k", 50)
    if stoch_k < 20:
        buy_score += 10
        reasons.append(f"Stoch oversold ({stoch_k:.0f})")
    elif stoch_k > 80:
        sell_score += 10
        reasons.append(f"Stoch overbought ({stoch_k:.0f})")

    # === Volume Confirmation ===
    if i["volume"] > 0:
        # Can't compare without historical, but flag high volume
        reasons.append(f"Vol: {i['volume']:,.0f}")

    # === Recommendation from TradingView ===
    rec = i["recommendation"]
    if "STRONG_BUY" in rec:
        buy_score += 20
        reasons.append("TradingView: STRONG BUY")
    elif "BUY" in rec:
        buy_score += 10
        reasons.append("TradingView: BUY")
    elif "STRONG_SELL" in rec:
        sell_score += 20
        reasons.append("TradingView: STRONG SELL")
    elif "SELL" in rec:
        sell_score += 10
        reasons.append("TradingView: SELL")

    # === Final Signal ===
    total = buy_score + sell_score
    if total == 0:
        strength = 50
    else:
        strength = int((buy_score / total) * 100) if buy_score > sell_score else int((sell_score / total) * 100)

    if buy_score >= 40 and buy_score > sell_score * 1.3:
        signal = "BUY"
    elif sell_score >= 40 and sell_score > buy_score * 1.3:
        signal = "SELL"
    else:
        signal = "HOLD"
        strength = 50

    return {"signal": signal, "strength": min(strength, 95), "reasons": reasons,
            "buy_score": buy_score, "sell_score": sell_score}


def print_analysis(symbol):
    """Pretty print analysis for a symbol."""
    multi = get_multi_tf(symbol)
    print(f"\n{'='*50}")
    print(f"📊 {symbol} Analysis")
    print(f"{'='*50}")

    for tf, ind in multi.items():
        if not ind or "error" in ind:
            print(f"\n⏱ {tf}: Error - {ind.get('error', 'No data')}")
            continue

        sig = analyze_signal(ind)
        emoji = "🟢" if sig["signal"] == "BUY" else "🔴" if sig["signal"] == "SELL" else "⚪"

        print(f"\n⏱ {tf} | {emoji} {sig['signal']} ({sig['strength']}%) | ${ind['close']:,.2f}")
        print(f"   RSI: {ind['rsi']:.0f} | MACD: {ind['macd_hist']:.2f} | BB: {ind['bb_width']:.1f}%")
        print(f"   EMA: {ind['ema10']:,.0f} > {ind['ema20']:,.0f} > {ind['ema50']:,.0f}")
        for r in sig["reasons"][:4]:
            print(f"   → {r}")


if __name__ == "__main__":
    import sys
    symbol = sys.argv[1] if len(sys.argv) > 1 else "BTC"
    print_analysis(symbol.upper())
