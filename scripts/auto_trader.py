#!/usr/bin/env python3
"""
Hermes2 Crypto Auto Trader — Scalp & Day Trading
- 2% max risk per trade
- TradingView indicators: RSI, MACD, Bollinger, EMA (multi-TF)
- Assets: BTC, ETH, SOL, PAXG, WLD, SUI, DOGE, XRP, LINK, AVAX
"""
import requests, json, time, os, sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from indicators import get_indicators, analyze_signal

# Config
BASE = "https://ai4trade.ai/api"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_FILE = os.path.join(BASE_DIR, ".ai4trade.json")
STATE_FILE = os.path.join(BASE_DIR, "data", "auto_trader_state.json")
LOG_FILE = os.path.join(BASE_DIR, "data", "auto_trader.log")
DAILY_LOG_FILE = os.path.join(BASE_DIR, "data", "daily_pnl.json")

RISK_PCT = 0.02
MAX_POSITIONS = 5
TP_LEVELS = [0.02, 0.035, 0.05]
SL_LEVEL = -0.02
WATCHLIST = ["BTC", "ETH", "SOL", "PAXG", "WLD", "SUI", "DOGE", "XRP", "LINK", "AVAX"]

# === NEW: Trailing Stop Config ===
TRAILING_STOP_CONFIG = {
    "enabled": True,
    "activation_pct": 0.015,    # Start trailing after +1.5% profit
    "trail_pct": 0.01,          # Trail 1% below highest point
    "min_profit_lock": 0.005,   # Always lock at least +0.5% profit once trailing starts
}

# === NEW: Volatility-Based Position Sizing ===
VOLATILITY_CONFIG = {
    "enabled": True,
    "base_risk_pct": 0.02,      # Normal risk: 2%
    "low_vol_risk_pct": 0.025,  # Low vol (BB width < 2%): 2.5%
    "high_vol_risk_pct": 0.01,  # High vol (BB width > 6%): 1%
    "extreme_vol_risk_pct": 0.005,  # Extreme vol (BB width > 10%): 0.5%
    "bb_width_thresholds": {"low": 2.0, "high": 6.0, "extreme": 10.0},
}

# === NEW: Daily Loss Limit ===
DAILY_LOSS_CONFIG = {
    "enabled": True,
    "max_daily_loss_pct": 0.05,  # Stop trading if -5% daily loss
    "max_daily_trades": 10,      # Max 10 trades per day
    "cooldown_hours": 4,         # 4h cooldown after hitting loss limit
}

def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def load_config():
    with open(CONFIG_FILE) as f:
        return json.load(f)

def get_headers():
    t = load_config()["token"]
    return {"Authorization": f"Bearer {t}", "X-Claw-Token": t}

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"positions": {}, "closed_trades": [], "last_scan": None}

def save_state(s):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(s, f, indent=2, default=str)

def get_price(symbol):
    try:
        r = requests.get(f"{BASE}/price?symbol={symbol}&market=crypto", headers=get_headers(), timeout=15)
        return r.json().get("price", 0)
    except:
        return 0

def publish_signal(action, symbol, price, qty, notes=""):
    try:
        r = requests.post(f"{BASE}/signals/realtime", headers=get_headers(), json={
            "market": "crypto", "action": action, "symbol": symbol,
            "price": round(price, 2), "quantity": round(qty, 6),
            "content": notes, "executed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        }, timeout=30)
        d = r.json()
        if r.status_code == 200:
            log(f"  ✅ {action.upper()} {symbol} — Signal #{d.get('signal_id')} (+{d.get('points_earned',0)} pts)")
            return True
        else:
            log(f"  ❌ Failed: {d}")
            return False
    except Exception as e:
        log(f"  ❌ Error: {e}")
        return False

def calc_qty(cash, price):
    risk = cash * RISK_PCT
    max_notion = min(risk, cash * 0.3)
    return round(max_notion / price, 6) if price > 0 else 0

# ============================================================
# NEW FEATURE 1: Volatility-Based Position Sizing
# ============================================================
def get_volatility_risk(symbol):
    """Get adjusted risk % based on current volatility (BB width)."""
    if not VOLATILITY_CONFIG["enabled"]:
        return VOLATILITY_CONFIG["base_risk_pct"]
    
    ind = get_indicators(symbol, "1h")
    if not ind or "error" in ind:
        return VOLATILITY_CONFIG["base_risk_pct"]
    
    bb_width = ind.get("bb_width", 3.0)  # Default medium vol
    cfg = VOLATILITY_CONFIG
    thresholds = cfg["bb_width_thresholds"]
    
    if bb_width > thresholds["extreme"]:
        risk = cfg["extreme_vol_risk_pct"]
        vol_label = "EXTREME"
    elif bb_width > thresholds["high"]:
        risk = cfg["high_vol_risk_pct"]
        vol_label = "HIGH"
    elif bb_width < thresholds["low"]:
        risk = cfg["low_vol_risk_pct"]
        vol_label = "LOW"
    else:
        risk = cfg["base_risk_pct"]
        vol_label = "NORMAL"
    
    log(f"  📐 {symbol} volatility: {vol_label} (BB width: {bb_width:.1f}%) → risk: {risk*100:.1f}%")
    return risk

def calc_qty_volatility(cash, price, symbol):
    """Position sizing adjusted for volatility."""
    risk_pct = get_volatility_risk(symbol)
    risk = cash * risk_pct
    max_notion = min(risk, cash * 0.3)
    return round(max_notion / price, 6) if price > 0 else 0

# ============================================================
# NEW FEATURE 2: Trailing Stop
# ============================================================
def check_trailing_stop(symbol, pos, current_price):
    """Check and update trailing stop. Returns 'trailing_hit' if SL triggered."""
    if not TRAILING_STOP_CONFIG["enabled"]:
        return None
    
    entry = pos["entry_price"]
    pnl = (current_price - entry) / entry
    cfg = TRAILING_STOP_CONFIG
    
    # Track highest price seen
    highest = pos.get("highest_price", entry)
    if current_price > highest:
        pos["highest_price"] = current_price
        highest = current_price
    
    highest_pnl = (highest - entry) / entry
    
    # Only activate trailing after reaching activation threshold
    if highest_pnl < cfg["activation_pct"]:
        return None
    
    # Calculate trailing SL
    trailing_sl = highest * (1 - cfg["trail_pct"])
    
    # Also ensure minimum profit lock
    min_lock_sl = entry * (1 + cfg["min_profit_lock"])
    effective_sl = max(trailing_sl, min_lock_sl)
    
    # Update SL if trailing SL is higher than current SL
    current_sl = pos.get("sl_price", entry * (1 + SL_LEVEL))
    if effective_sl > current_sl:
        pos["sl_price"] = effective_sl
        pos["trailing_active"] = True
        log(f"  📈 Trailing SL updated: {symbol} → ${effective_sl:,.2f} (highest: ${highest:,.2f})")
    
    # Check if trailing SL hit
    if current_price <= effective_sl:
        return "trailing_hit"
    
    return None

# ============================================================
# NEW FEATURE 3: Daily Loss Limit
# ============================================================
def load_daily_log():
    """Load daily P&L tracking."""
    if os.path.exists(DAILY_LOG_FILE):
        with open(DAILY_LOG_FILE) as f:
            return json.load(f)
    return {"date": None, "trades": [], "total_pnl_pct": 0, "cooldown_until": None}

def save_daily_log(data):
    os.makedirs(os.path.dirname(DAILY_LOG_FILE), exist_ok=True)
    with open(DAILY_LOG_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)

def check_daily_loss_limit():
    """Check if we've hit daily loss limit. Returns (can_trade, reason)."""
    if not DAILY_LOSS_CONFIG["enabled"]:
        return True, "Daily limit disabled"
    
    daily = load_daily_log()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Reset if new day
    if daily.get("date") != today:
        daily = {"date": today, "trades": [], "total_pnl_pct": 0, "cooldown_until": None}
        save_daily_log(daily)
        return True, "New day, fresh start"
    
    # Check cooldown
    cooldown = daily.get("cooldown_until")
    if cooldown:
        cooldown_dt = datetime.fromisoformat(cooldown.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) < cooldown_dt:
            remaining = (cooldown_dt - datetime.now(timezone.utc)).total_seconds() / 60
            return False, f"Cooldown active ({remaining:.0f}min remaining)"
    
    # Check daily loss
    if daily["total_pnl_pct"] <= -DAILY_LOSS_CONFIG["max_daily_loss_pct"] * 100:
        # Set cooldown
        cooldown_until = datetime.now(timezone.utc) + timedelta(hours=DAILY_LOSS_CONFIG["cooldown_hours"])
        daily["cooldown_until"] = cooldown_until.isoformat()
        save_daily_log(daily)
        return False, f"Daily loss limit hit ({daily['total_pnl_pct']:.1f}%)"
    
    # Check trade count
    if len(daily["trades"]) >= DAILY_LOSS_CONFIG["max_daily_trades"]:
        return False, f"Max daily trades ({DAILY_LOSS_CONFIG['max_daily_trades']}) reached"
    
    return True, "OK"

def log_daily_trade(symbol, pnl_pct, trade_type="closed"):
    """Log a trade to daily tracker."""
    daily = load_daily_log()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    if daily.get("date") != today:
        daily = {"date": today, "trades": [], "total_pnl_pct": 0, "cooldown_until": None}
    
    daily["trades"].append({
        "symbol": symbol,
        "pnl_pct": round(pnl_pct, 2),
        "type": trade_type,
        "time": datetime.now(timezone.utc).isoformat()
    })
    daily["total_pnl_pct"] = sum(t["pnl_pct"] for t in daily["trades"])
    save_daily_log(daily)
    log(f"  📋 Daily: {len(daily['trades'])} trades, P&L: {daily['total_pnl_pct']:+.2f}%")

def get_signal(symbol):
    """Multi-TF indicator signal with TP/SL/early-exit for existing positions."""
    price = get_price(symbol)
    if price == 0:
        return None, price

    state = load_state()
    positions = state.get("positions", {})

    # Existing position: manage TP/SL (with 15-min hold before TP/SL check)
    if symbol in positions:
        pos = positions[symbol]
        entry = pos["entry_price"]
        pnl = (price - entry) / entry
        
        # 15-minute hold: skip TP/SL checks for first 15 min after entry
        entry_time = pos.get("entry_time")
        if entry_time:
            try:
                entry_dt = datetime.fromisoformat(entry_time.replace("Z", "+00:00"))
                now_dt = datetime.now(timezone.utc)
                elapsed_min = (now_dt - entry_dt).total_seconds() / 60
                
                # SL exception: always check SL even during hold period (risk management)
                sl = pos.get("sl_price", entry * (1 + SL_LEVEL))
                if price <= sl:
                    pass  # Fall through to SL check below
                elif elapsed_min < 15:
                    log(f"  ⏳ {symbol}: Hold period ({elapsed_min:.0f}/15 min) — skipping TP/SL")
                    positions[sym]["current_price"] = price
                    return "hold", price
            except:
                pass  # If time parsing fails, proceed normally

        for tp in TP_LEVELS:
            if pnl >= tp:
                return "tp_hit", price
        sl = pos.get("sl_price", entry * (1 + SL_LEVEL))
        if price <= sl:
            return "sl_hit", price
        if pnl >= 0.015 and pos.get("sl_moved") != "breakeven":
            return "move_sl", price

        # Trailing stop check (before TP/SL)
        trail_result = check_trailing_stop(symbol, pos, price)
        if trail_result == "trailing_hit":
            return "trailing_hit", price
        
        # Early exit on strong signal flip
        ind = get_indicators(symbol, "1h")
        if ind and "error" not in ind:
            sig = analyze_signal(ind)
            if sig["signal"] == "SELL" and sig["strength"] >= 75 and pnl > 0.005:
                return "early_sell", price
        return "hold", price

    # New entry: multi-TF scan
    signals = {}
    for tf in ["15m", "1h", "4h"]:
        ind = get_indicators(symbol, tf)
        if ind and "error" not in ind:
            signals[tf] = analyze_signal(ind)
        time.sleep(0.3)

    if not signals:
        return "no_signal", price

    h1 = signals.get("1h", {})
    m15 = signals.get("15m", {})
    h4 = signals.get("4h", {})

    # BUY scoring
    bc, br = 0, []
    if h1.get("signal") == "BUY":
        bc += 2; br.append(f"1H BUY ({h1.get('strength',0)}%)")
    if h4.get("signal") in ["BUY","HOLD"] and h4.get("buy_score",0) > h4.get("sell_score",0):
        bc += 1; br.append("4H trend OK")
    if m15.get("signal") == "BUY":
        bc += 1; br.append("15M up")
    for r in h1.get("reasons",[]):
        if "oversold" in r.lower() or "low" in r.lower():
            bc += 1; br.append(r); break
    for r in h1.get("reasons",[]):
        if "macd bullish" in r.lower():
            bc += 1; br.append(r); break
    for r in h1.get("reasons",[]):
        if "bb lower" in r.lower():
            bc += 1; br.append(r); break

    # SELL scoring
    sc, sr = 0, []
    if h1.get("signal") == "SELL":
        sc += 2; sr.append(f"1H SELL ({h1.get('strength',0)}%)")
    if h4.get("signal") == "SELL":
        sc += 1; sr.append("4H bearish")
    if m15.get("signal") == "SELL":
        sc += 1; sr.append("15M down")

    if bc >= 4 or (bc >= 3 and h1.get("strength",0) >= 65):
        log(f"  🟢 {symbol}: BUY ({bc} conds) — {' | '.join(br[:3])}")
        return "buy", price
    if sc >= 3:
        log(f"  🔴 {symbol}: SELL — {' | '.join(sr[:3])}")

    # Fallback: round number support (only if 1H not bearish)
    rounds = {"BTC":[70000,71000,72000,73000,74000,75000],"ETH":[2200,2300,2400,2500],
              "SOL":[80,85,90,95,100],"PAXG":[3200,3250,3300,3350,3400]}
    if symbol in rounds:
        for lv in rounds[symbol]:
            if abs(price-lv)/lv < 0.005 and price < lv and h1.get("signal") != "SELL":
                return "buy_support", price
    return "no_signal", price

def run_scan():
    state = load_state()
    positions = state.get("positions", {})

    # Get cash
    try:
        r = requests.get(f"{BASE}/positions", headers=get_headers(), timeout=20)
        cash = r.json().get("cash", 0)
    except:
        cash = 99000

    log(f"🔍 Scan | Cash: ${cash:,.2f} | Pos: {len(positions)}")

    # Check daily loss limit
    can_trade, reason = check_daily_loss_limit()
    if not can_trade:
        log(f"  🚫 Trading blocked: {reason}")
    else:
        log(f"  ✅ Daily status: {reason}")

    # Manage existing
    for sym in list(positions.keys()):
        signal, price = get_signal(sym)
        pos = positions[sym]

        if signal == "tp_hit":
            pnl = (price - pos["entry_price"]) / pos["entry_price"]
            if publish_signal("sell", sym, price, pos["quantity"], f"TP +{pnl*100:.1f}%"):
                state["closed_trades"].append({"symbol":sym,"entry":pos["entry_price"],"exit":price,
                    "pnl_pct":round(pnl*100,2),"closed_at":datetime.now(timezone.utc).isoformat()})
                log_daily_trade(sym, pnl*100, "tp_hit")
                del positions[sym]; save_state(state)
                log(f"🎯 TP: {sym} +{pnl*100:.1f}%")

        elif signal == "sl_hit":
            pnl = (price - pos["entry_price"]) / pos["entry_price"]
            if publish_signal("sell", sym, price, pos["quantity"], f"SL {pnl*100:.1f}%"):
                state["closed_trades"].append({"symbol":sym,"entry":pos["entry_price"],"exit":price,
                    "pnl_pct":round(pnl*100,2),"closed_at":datetime.now(timezone.utc).isoformat()})
                log_daily_trade(sym, pnl*100, "sl_hit")
                del positions[sym]; save_state(state)
                log(f"🛑 SL: {sym} {pnl*100:.1f}%")

        elif signal == "trailing_hit":
            pnl = (price - pos["entry_price"]) / pos["entry_price"]
            if publish_signal("sell", sym, price, pos["quantity"], f"Trailing SL +{pnl*100:.1f}%"):
                state["closed_trades"].append({"symbol":sym,"entry":pos["entry_price"],"exit":price,
                    "pnl_pct":round(pnl*100,2),"closed_at":datetime.now(timezone.utc).isoformat()})
                log_daily_trade(sym, pnl*100, "trailing_hit")
                del positions[sym]; save_state(state)
                log(f"📈🎯 Trailing SL: {sym} +{pnl*100:.1f}%")

        elif signal == "move_sl":
            positions[sym]["sl_moved"] = "breakeven"
            positions[sym]["sl_price"] = pos["entry_price"]
            save_state(state)
            log(f"🔒 SL→breakeven: {sym}")

        elif signal == "early_sell":
            pnl = (price - pos["entry_price"]) / pos["entry_price"]
            if publish_signal("sell", sym, price, pos["quantity"], f"Early exit +{pnl*100:.1f}%"):
                state["closed_trades"].append({"symbol":sym,"entry":pos["entry_price"],"exit":price,
                    "pnl_pct":round(pnl*100,2),"closed_at":datetime.now(timezone.utc).isoformat()})
                log_daily_trade(sym, pnl*100, "early_exit")
                del positions[sym]; save_state(state)
                log(f"⚡ Early exit: {sym} +{pnl*100:.1f}%")

        else:
            positions[sym]["current_price"] = price
            save_state(state)

    # New entries (only if daily loss limit allows)
    if can_trade and len(positions) < MAX_POSITIONS and cash > 500:
        for sym in WATCHLIST:
            if sym in positions:
                continue
            signal, price = get_signal(sym)
            if signal in ["buy","buy_support"] and price > 0:
                # Use volatility-adjusted position sizing
                qty = calc_qty_volatility(cash, price, sym)
                if qty * price < 50:
                    continue
                notes = f"{'Indicator signal' if signal=='buy' else 'Support level'}"
                if publish_signal("buy", sym, price, qty, notes):
                    positions[sym] = {
                        "entry_price": price, "quantity": qty, "side": "long",
                        "entry_time": datetime.now(timezone.utc).isoformat(),
                        "tp_levels": [price*(1+tp) for tp in TP_LEVELS],
                        "sl_price": price*(1+SL_LEVEL), "current_price": price,
                        "highest_price": price,  # For trailing stop
                        "trailing_active": False,
                    }
                    save_state(state)
                    log(f"📈 NEW: LONG {sym} {qty} @ ${price:,.2f}")
                    break

    state["last_scan"] = datetime.now(timezone.utc).isoformat()
    state["positions"] = positions
    save_state(state)

    # Summary
    if positions:
        total = 0
        for s, p in positions.items():
            c = p.get("current_price", p["entry_price"])
            pnl = ((c - p["entry_price"]) / p["entry_price"]) * 100
            total += pnl
            trail = " 📈trail" if p.get("trailing_active") else ""
            log(f"  {'🟢' if pnl>0 else '🔴'} {s}: {pnl:+.2f}% (${p['entry_price']:,.0f}→${c:,.0f}){trail}")
        log(f"  📊 Avg: {total/len(positions):+.2f}%")

def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "status":
            s = load_state()
            p = s.get("positions",{})
            c = s.get("closed_trades",[])
            w = len([t for t in c if t["pnl_pct"]>0])
            print(f"📊 Open: {len(p)} | Closed: {len(c)} (W:{w} L:{len(c)-w})")
            for sym, pos in p.items():
                trail = " 📈trailing" if pos.get("trailing_active") else ""
                print(f"  📈 LONG {sym} {pos['quantity']} @ ${pos['entry_price']:,.2f}{trail}")
            # Daily status
            daily = load_daily_log()
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if daily.get("date") == today:
                print(f"📋 Today: {len(daily['trades'])} trades, P&L: {daily['total_pnl_pct']:+.2f}%")
            can_trade, reason = check_daily_loss_limit()
            print(f"{'✅' if can_trade else '🚫'} Trading: {reason}")
            return
        if sys.argv[1] == "reset":
            save_state({"positions":{},"closed_trades":[],"last_scan":None})
            print("🔄 Reset"); return
        if sys.argv[1] == "analyze":
            from indicators import print_analysis
            sym = sys.argv[2].upper() if len(sys.argv) > 2 else "BTC"
            print_analysis(sym); return

    log("🤖 Auto Trader started")
    run_scan()

if __name__ == "__main__":
    main()
