#!/usr/bin/env python3
"""
Sports Auto Trader — Paper Trading untuk Soccer Betting
1. Load market snapshot (Polymarket odds)
2. Scan untuk value bets
3. Auto-place via trade CLI
4. Auto-close TP/SL

Usage:
  python3 sports_auto_trader.py scan     # Show suggestions
  python3 sports_auto_trader.py run      # Full cycle: scan → place → close
  python3 sports_auto_trader.py close    # Auto-close TP/SL only
"""

import json, os, sys, subprocess, argparse
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
BETS_FILE = os.path.join(DATA_DIR, "bets.json")
SNAPSHOT_FILE = os.path.join(DATA_DIR, "market_snapshot.json")
LOG_FILE = os.path.join(DATA_DIR, "sports_auto_trader.log")

# Strategy
MAX_PRICE = 0.60
MIN_PRICE = 0.15
MAX_OPEN = 5
TP_LOCK = 0.85   # Sell at 85¢ to lock profit
SL_CUT = 0.10    # Sell at 10¢ to cut loss
MIN_EV = 0.03

def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def load_json(fp):
    with open(fp) as f:
        return json.load(f)

def get_open_bets():
    data = load_json(BETS_FILE)
    return [b for b in data["bets"] if b["status"] == "open"]

def get_closed_bets():
    data = load_json(BETS_FILE)
    return [b for b in data["bets"] if b["status"] == "closed"]

def place_bet(market, outcome, price, size, notes="", agent="hermes1"):
    cmd = ["trade", "bet", "open", "--agent", agent,
           "--market", market, "--outcome", outcome,
           "--price", str(price), "--size", str(size),
           "--notes", notes]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        log(f"PLACE: {outcome} @ {price:.0f}¢ (${size}) — {r.stdout.strip()}")
        return True
    except Exception as e:
        log(f"ERROR: {e}")
        return False

def close_bet(bet_id, exit_price, reason):
    cmd = ["trade", "bet", "close", "--id", bet_id,
           "--exit", str(exit_price), "--reason", reason]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        log(f"CLOSE: {bet_id} @ {exit_price:.2f} ({reason}) — {r.stdout.strip()}")
        return True
    except Exception as e:
        log(f"ERROR: {e}")
        return False

def scan():
    """Scan market snapshot for value bets"""
    if not os.path.exists(SNAPSHOT_FILE):
        log("No market snapshot found!")
        return []

    snapshot = load_json(SNAPSHOT_FILE)
    open_bets = get_open_bets()
    existing = {b["market"] for b in open_bets}

    log(f"=== SCAN (snapshot: {snapshot['snapshot_time']}) ===")
    log(f"Open bets: {len(open_bets)}/{MAX_OPEN}")

    suggestions = []
    for match in snapshot["matches"]:
        market = f'{match["team1"]} vs {match["team2"]} — {match["league"]}'

        # Skip existing
        if any(match["team1"] in m or match["team2"] in m for m in existing):
            continue

        for o in match.get("outcomes", []):
            price = o["price"]
            if price > MAX_PRICE or price < MIN_PRICE:
                continue

            # Estimate true prob (home +5%, UCL adj)
            true_prob = price + 0.05
            if match["league"] == "UCL":
                if price > 0.50:
                    true_prob -= 0.03
                elif price < 0.35:
                    true_prob += 0.05

            ev = true_prob - price
            if ev >= MIN_EV:
                # Size by confidence
                size = 2.50 if price < 0.30 else 2.00 if price < 0.50 else 1.00
                suggestions.append({
                    "market": market, "outcome": o["name"],
                    "price": price, "ev": round(ev, 3),
                    "size": size, "date": match["date"],
                    "reason": f'EV +{ev:.0%}, {match["league"]}'
                })

    suggestions.sort(key=lambda x: x["ev"], reverse=True)
    return suggestions

def auto_close():
    """Auto-close bets hitting TP/SL (simulated)"""
    log("=== AUTO CLOSE ===")
    open_bets = get_open_bets()
    closed = 0

    # In paper trading, we check if the match has been played
    # For now, just log — real close needs live score data
    for b in open_bets:
        log(f"HOLD: {b['id']} {b['outcome']} @ {b['entry_price']:.0f}¢ (${b['size_usd']})")

    return closed

def run():
    """Full cycle"""
    log("=" * 50)
    log("SPORTS AUTO TRADER — FULL CYCLE")
    log("=" * 50)

    # 1. Close TP/SL
    auto_close()

    # 2. Scan
    suggestions = scan()

    # 3. Place
    slots = MAX_OPEN - len(get_open_bets())
    placed = 0
    for s in suggestions[:slots]:
        notes = f"Auto: {s['reason']}"
        if place_bet(s["market"], s["outcome"], s["price"], s["size"], notes):
            placed += 1

    # Summary
    open_bets = get_open_bets()
    closed_bets = get_closed_bets()
    pnl = sum(b.get("pnl_usd", 0) or 0 for b in closed_bets)

    log("=" * 50)
    log(f"RESULT: {placed} placed, {len(open_bets)} open, {len(closed_bets)} closed, PnL: ${pnl:.2f}")

    # Return summary for cron
    return {
        "placed": placed,
        "open": len(open_bets),
        "closed": len(closed_bets),
        "pnl": round(pnl, 2),
        "suggestions": len(suggestions)
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["scan", "run", "close"])
    args = p.parse_args()

    if args.action == "scan":
        suggestions = scan()
        if suggestions:
            print(f"\n{'='*50}")
            print(f"VALUE BETS ({len(suggestions)} found)")
            print(f"{'='*50}")
            for i, s in enumerate(suggestions, 1):
                print(f"\n{i}. {s['market']}")
                print(f"   {s['outcome']} @ {s['price']*100:.0f}¢ (${s['size']})")
                print(f"   EV: +{s['ev']:.0%} | {s['reason']}")
        else:
            print("No value bets found.")

    elif args.action == "run":
        run()

    elif args.action == "close":
        auto_close()

if __name__ == "__main__":
    main()
