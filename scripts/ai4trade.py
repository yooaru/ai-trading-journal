#!/usr/bin/env python3
"""
AI4Trade Sim Trading Manager
Publish signals to ai4trade.ai platform.

Usage:
  python3 ai4trade.py buy BTC 0.001 --notes "Support bounce"
  python3 ai4trade.py sell BTC 0.001 --notes "Take profit"
  python3 ai4trade.py price BTC
  python3 ai4trade.py positions
  python3 ai4trade.py balance
  python3 ai4trade.py feed --limit 10
  python3 ai4trade.py strategy BTC "BTC breaking resistance" --content "Detailed analysis..."
"""
import requests, json, sys, argparse, os
from datetime import datetime, timezone

CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".ai4trade.json")

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)

def get_headers():
    config = load_config()
    token = config.get("token", "")
    return {"Authorization": f"Bearer {token}", "X-Claw-Token": token}

def now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

BASE = "https://ai4trade.ai/api"

def cmd_register(args):
    r = requests.post(f"{BASE}/claw/agents/selfRegister", json={
        "name": args.name, "email": args.email, "password": args.password
    })
    data = r.json()
    if r.status_code == 200:
        save_config({"token": data["token"], "agent_id": data["agent_id"], "name": data["name"]})
        print(f"✅ Registered: {data['name']} (ID: {data['agent_id']})")
        print(f"   Cash: ${data.get('initial_balance', 100000):,.2f}")
    else:
        print(f"❌ Error: {data}")

def cmd_login(args):
    r = requests.post(f"{BASE}/claw/agents/login", json={
        "name": args.name, "email": args.email, "password": args.password
    })
    data = r.json()
    if r.status_code == 200:
        save_config({"token": data["token"], "agent_id": data["agent_id"], "name": data["name"]})
        print(f"✅ Logged in: {data['name']} (ID: {data['agent_id']})")
    else:
        print(f"❌ Error: {data}")

def cmd_buy(args):
    H = get_headers()
    price = float(args.price) if args.price else 0
    if price == 0:
        r = requests.get(f"{BASE}/price?symbol={args.symbol}&market=crypto", headers=H)
        price = r.json().get("price", 0)
        print(f"📊 {args.symbol} price: ${price:,.2f}")
    
    r = requests.post(f"{BASE}/signals/realtime", headers=H, json={
        "market": "crypto", "action": "buy", "symbol": args.symbol.upper(),
        "price": price, "quantity": float(args.quantity),
        "content": args.notes or "", "executed_at": now_utc()
    })
    data = r.json()
    if r.status_code == 200:
        print(f"📈 BUY {args.symbol.upper()} {args.quantity} @ ${price:,.2f}")
        print(f"   Signal ID: {data.get('signal_id')} | Points: +{data.get('points_earned', 0)}")
    else:
        print(f"❌ Error: {data}")

def cmd_sell(args):
    H = get_headers()
    price = float(args.price) if args.price else 0
    if price == 0:
        r = requests.get(f"{BASE}/price?symbol={args.symbol}&market=crypto", headers=H)
        price = r.json().get("price", 0)
        print(f"📊 {args.symbol} price: ${price:,.2f}")
    
    r = requests.post(f"{BASE}/signals/realtime", headers=H, json={
        "market": "crypto", "action": "sell", "symbol": args.symbol.upper(),
        "price": price, "quantity": float(args.quantity),
        "content": args.notes or "", "executed_at": now_utc()
    })
    data = r.json()
    if r.status_code == 200:
        print(f"📉 SELL {args.symbol.upper()} {args.quantity} @ ${price:,.2f}")
        print(f"   Signal ID: {data.get('signal_id')} | Points: +{data.get('points_earned', 0)}")
    else:
        print(f"❌ Error: {data}")

def cmd_price(args):
    H = get_headers()
    r = requests.get(f"{BASE}/price?symbol={args.symbol}&market=crypto", headers=H)
    data = r.json()
    print(f"💰 {data.get('symbol')}: ${data.get('price', 0):,.2f}")

def cmd_positions(args):
    H = get_headers()
    r = requests.get(f"{BASE}/positions", headers=H)
    data = r.json()
    print(f"📊 Positions (Cash: ${data.get('cash', 0):,.2f}):")
    for p in data.get("positions", []):
        pnl = p.get("pnl")
        pnl_str = f" | P&L: {'+'if pnl and pnl>0 else ''}${pnl:,.2f}" if pnl else ""
        print(f"   {p['side'].upper()} {p['symbol']} {p['quantity']} @ ${p['entry_price']:,.2f}{pnl_str}")

def cmd_balance(args):
    H = get_headers()
    r = requests.get(f"{BASE}/claw/agents/me", headers=H)
    data = r.json()
    print(f"💰 {data.get('name')}:")
    print(f"   Cash: ${data.get('cash', 0):,.2f}")
    print(f"   Points: {data.get('points', 0)}")
    print(f"   Reputation: {data.get('reputation_score', 0)}")

def cmd_feed(args):
    H = get_headers()
    r = requests.get(f"{BASE}/signals/feed?limit={args.limit}", headers=H)
    for s in r.json().get("signals", []):
        print(f"[{s.get('agent_name')}] {s.get('symbol','')} {s.get('side','')} @ ${s.get('entry_price','')} — {s.get('content','')[:50]}")

def cmd_strategy(args):
    H = get_headers()
    r = requests.post(f"{BASE}/signals/strategy", headers=H, json={
        "market": "crypto", "title": args.title,
        "content": args.content or args.title,
        "symbols": [args.symbol.upper()], "tags": [args.symbol.lower(), "analysis"]
    })
    data = r.json()
    if r.status_code == 200:
        print(f"📝 Strategy published: {args.title}")
        print(f"   Signal ID: {data.get('signal_id')} | Points: +{data.get('points_earned', 0)}")
    else:
        print(f"❌ Error: {data}")

def cmd_heartbeat(args):
    H = get_headers()
    config = load_config()
    r = requests.post(f"{BASE}/claw/agents/heartbeat", headers=H, json={
        "agent_id": config.get("agent_id"), "status": "alive"
    })
    data = r.json()
    msgs = data.get("messages", [])
    tasks = data.get("tasks", [])
    print(f"💓 Heartbeat: {len(msgs)} messages, {len(tasks)} tasks")
    for m in msgs:
        print(f"   [{m['type']}] {m.get('content', '')[:80]}")

def main():
    p = argparse.ArgumentParser(description="AI4Trade Sim Trading")
    sp = p.add_subparsers(dest="cmd")

    reg = sp.add_parser("register"); reg.add_argument("--name", required=True); reg.add_argument("--email", required=True); reg.add_argument("--password", required=True)
    login = sp.add_parser("login"); login.add_argument("--name", required=True); login.add_argument("--email", required=True); login.add_argument("--password", required=True)
    buy = sp.add_parser("buy"); buy.add_argument("symbol"); buy.add_argument("quantity"); buy.add_argument("--price"); buy.add_argument("--notes")
    sell = sp.add_parser("sell"); sell.add_argument("symbol"); sell.add_argument("quantity"); sell.add_argument("--price"); sell.add_argument("--notes")
    sp.add_parser("positions")
    sp.add_parser("balance")
    sp.add_parser("heartbeat")
    pr = sp.add_parser("price"); pr.add_argument("symbol")
    fd = sp.add_parser("feed"); fd.add_argument("--limit", type=int, default=10)
    st = sp.add_parser("strategy"); st.add_argument("symbol"); st.add_argument("title"); st.add_argument("--content")

    args = p.parse_args()
    if args.cmd == "register": cmd_register(args)
    elif args.cmd == "login": cmd_login(args)
    elif args.cmd == "buy": cmd_buy(args)
    elif args.cmd == "sell": cmd_sell(args)
    elif args.cmd == "positions": cmd_positions(args)
    elif args.cmd == "balance": cmd_balance(args)
    elif args.cmd == "price": cmd_price(args)
    elif args.cmd == "feed": cmd_feed(args)
    elif args.cmd == "strategy": cmd_strategy(args)
    elif args.cmd == "heartbeat": cmd_heartbeat(args)
    else: p.print_help()

if __name__ == "__main__":
    main()
