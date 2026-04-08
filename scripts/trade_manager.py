#!/usr/bin/env python3
"""
AI Trading Journal — Trade/Bet Manager
Usage:
  python3 trade_manager.py trade open --agent hermes2 --asset BTC --side long --entry 84200 --size 100 --tp 85500 --sl 83000 --notes "Support bounce"
  python3 trade_manager.py trade close --id trade_001 --exit 85100 --reason tp_hit
  python3 trade_manager.py trade update --id trade_001 --tp 86000 --sl 83500
  python3 trade_manager.py bet open --agent hermes2 --market "Real Madrid vs Arsenal" --outcome "Real Madrid ML" --price 0.37 --size 2.50
  python3 trade_manager.py bet close --id bet_001 --exit 0.85 --reason won
"""
import json, sys, os, argparse, subprocess
from datetime import datetime, timezone

BASE_DIR = os.environ.get("JOURNAL_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
TRADES_FILE = os.path.join(DATA_DIR, "trades.json")
BETS_FILE = os.path.join(DATA_DIR, "bets.json")

def load_json(fp):
    with open(fp, "r") as f:
        return json.load(f)

def save_json(fp, data):
    data["metadata"]["last_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(fp, "w") as f:
        json.dump(data, f, indent=2)

def git_push(msg):
    try:
        os.chdir(BASE_DIR)
        subprocess.run(["git", "add", "data/"], check=True, capture_output=True)
        subprocess.run(["git", "commit", "-m", msg], check=True, capture_output=True)
        subprocess.run(["git", "push"], check=True, capture_output=True)
        print(f"✅ Git push: {msg}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"⚠️ Git push failed: {e.stderr.decode() if e.stderr else str(e)}")
        return False

def gen_id(prefix, items):
    existing = [int(i["id"].split("_")[1]) for i in items if i["id"].startswith(prefix)]
    return f"{prefix}_{max(existing, default=0) + 1:03d}"

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def trade_open(args):
    data = load_json(TRADES_FILE)
    t = {
        "id": gen_id("trade", data["trades"]),
        "agent": args.agent, "asset": args.asset.upper(), "side": args.side.lower(),
        "entry_price": float(args.entry), "exit_price": None, "size_usd": float(args.size),
        "leverage": int(args.leverage) if args.leverage else 1,
        "tp_price": float(args.tp) if args.tp else None,
        "sl_price": float(args.sl) if args.sl else None,
        "status": "open", "pnl_usd": None, "pnl_pct": None,
        "opened_at": now_iso(), "closed_at": None, "close_reason": None,
        "notes": args.notes or "", "tags": args.tags.split(",") if args.tags else []
    }
    data["trades"].append(t)
    data["metadata"]["total_trades"] = len(data["trades"])
    save_json(TRADES_FILE, data)
    print(f"📈 OPENED: {t['side'].upper()} {t['asset']} @ ${t['entry_price']} (${t['size_usd']})")
    print(f"   ID: {t['id']} | Agent: {t['agent']}")
    git_push(f"open {t['side']} {t['asset']} @ ${t['entry_price']} ({t['agent']})")
    return t

def trade_close(args):
    data = load_json(TRADES_FILE)
    t = next((x for x in data["trades"] if x["id"] == args.id), None)
    if not t: print(f"❌ Trade {args.id} not found"); return None
    if t["status"] == "closed": print(f"⚠️ Already closed"); return t
    exit_p = float(args.exit)
    t["exit_price"] = exit_p; t["status"] = "closed"; t["closed_at"] = now_iso()
    t["close_reason"] = args.reason or "manual"
    pnl_pct = ((exit_p - t["entry_price"]) / t["entry_price"]) * 100 if t["side"] == "long" else ((t["entry_price"] - exit_p) / t["entry_price"]) * 100
    t["pnl_pct"] = round(pnl_pct, 2); t["pnl_usd"] = round(t["size_usd"] * (pnl_pct / 100), 2)
    save_json(TRADES_FILE, data)
    e = "🎯" if t["close_reason"] == "tp_hit" else "🛑" if t["close_reason"] == "sl_hit" else "✅"
    print(f"{e} CLOSED: {t['asset']} — P&L: {'+' if t['pnl_usd']>=0 else ''}${t['pnl_usd']} ({t['pnl_pct']}%)")
    git_push(f"close {t['asset']} P&L {'+' if t['pnl_usd']>=0 else ''}${t['pnl_usd']} ({t['agent']})")
    return t

def trade_update(args):
    data = load_json(TRADES_FILE)
    t = next((x for x in data["trades"] if x["id"] == args.id), None)
    if not t: print(f"❌ Trade {args.id} not found"); return None
    changes = []
    if args.tp: t["tp_price"] = float(args.tp); changes.append(f"TP→${args.tp}")
    if args.sl: t["sl_price"] = float(args.sl); changes.append(f"SL→${args.sl}")
    if args.notes: t["notes"] = args.notes; changes.append("Notes updated")
    save_json(TRADES_FILE, data)
    print(f"📝 UPDATED {t['asset']}: {', '.join(changes)}")
    git_push(f"update {t['asset']}: {', '.join(changes)}")
    return t

def bet_open(args):
    data = load_json(BETS_FILE)
    b = {
        "id": gen_id("bet", data["bets"]),
        "agent": args.agent, "platform": args.platform or "polymarket",
        "market": args.market, "outcome": args.outcome, "side": args.side or "yes",
        "entry_price": float(args.price), "exit_price": None, "size_usd": float(args.size),
        "status": "open", "pnl_usd": None, "pnl_pct": None,
        "opened_at": now_iso(), "closed_at": None, "close_reason": None,
        "notes": args.notes or "", "tags": args.tags.split(",") if args.tags else []
    }
    data["bets"].append(b)
    data["metadata"]["total_bets"] = len(data["bets"])
    save_json(BETS_FILE, data)
    print(f"🎯 BET: {b['outcome']} on \"{b['market']}\" @ {b['entry_price']*100:.0f}¢ (${b['size_usd']})")
    git_push(f"bet {b['outcome']} on {b['market']} ({b['agent']})")
    return b

def bet_close(args):
    data = load_json(BETS_FILE)
    b = next((x for x in data["bets"] if x["id"] == args.id), None)
    if not b: print(f"❌ Bet {args.id} not found"); return None
    exit_p = float(args.exit)
    b["exit_price"] = exit_p; b["status"] = "closed"; b["closed_at"] = now_iso()
    b["close_reason"] = args.reason or "resolved"
    pnl_pct = ((exit_p - b["entry_price"]) / b["entry_price"]) * 100
    b["pnl_pct"] = round(pnl_pct, 2); b["pnl_usd"] = round(b["size_usd"] * (pnl_pct / 100), 2)
    save_json(BETS_FILE, data)
    e = "💰" if b["pnl_usd"] > 0 else "❌"
    print(f"{e} BET CLOSED: {b['outcome']} — P&L: {'+' if b['pnl_usd']>=0 else ''}${b['pnl_usd']} ({b['pnl_pct']}%)")
    git_push(f"bet close {b['outcome']} P&L {'+' if b['pnl_usd']>=0 else ''}${b['pnl_usd']} ({b['agent']})")
    return b

def main():
    p = argparse.ArgumentParser(description="AI Trading Journal Manager")
    sp = p.add_subparsers(dest="command")
    tp = sp.add_parser("trade"); ts = tp.add_subparsers(dest="action")
    to = ts.add_parser("open")
    to.add_argument("--agent", required=True, choices=["hermes1","hermes2"])
    to.add_argument("--asset", required=True); to.add_argument("--side", required=True, choices=["long","short"])
    to.add_argument("--entry", required=True); to.add_argument("--size", required=True)
    to.add_argument("--tp"); to.add_argument("--sl"); to.add_argument("--leverage", default=1)
    to.add_argument("--notes"); to.add_argument("--tags")
    tc = ts.add_parser("close"); tc.add_argument("--id", required=True); tc.add_argument("--exit", required=True)
    tc.add_argument("--reason", choices=["tp_hit","sl_hit","manual","trailing"])
    tu = ts.add_parser("update"); tu.add_argument("--id", required=True); tu.add_argument("--tp"); tu.add_argument("--sl"); tu.add_argument("--notes")
    bp = sp.add_parser("bet"); bs = bp.add_subparsers(dest="action")
    bo = bs.add_parser("open"); bo.add_argument("--agent", required=True, choices=["hermes1","hermes2"])
    bo.add_argument("--market", required=True); bo.add_argument("--outcome", required=True)
    bo.add_argument("--price", required=True); bo.add_argument("--size", required=True)
    bo.add_argument("--platform", default="polymarket"); bo.add_argument("--side", default="yes")
    bo.add_argument("--notes"); bo.add_argument("--tags")
    bc = bs.add_parser("close"); bc.add_argument("--id", required=True); bc.add_argument("--exit", required=True)
    bc.add_argument("--reason", choices=["won","lost","sold"])
    args = p.parse_args()
    if args.command == "trade":
        if args.action == "open": trade_open(args)
        elif args.action == "close": trade_close(args)
        elif args.action == "update": trade_update(args)
        else: tp.print_help()
    elif args.command == "bet":
        if args.action == "open": bet_open(args)
        elif args.action == "close": bet_close(args)
        else: bp.print_help()
    else: p.print_help()

if __name__ == "__main__":
    main()
