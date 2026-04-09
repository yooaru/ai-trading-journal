#!/usr/bin/env python3
"""
WaifuTrader Universal Daemon
- Crypto auto trader: every CRYPTO_INTERVAL sec (default 5 min)
- Sports auto trader: every SPORTS_INTERVAL sec (default 30 min)
- Data sync to GitHub: every SYNC_INTERVAL sec (default 15 min)
- Runs as background daemon, logs to data/waifu_daemon.log

Usage:
  python3 waifu_daemon.py          # Start daemon (foreground)
  python3 waifu_daemon.py status   # Show last scan times
  python3 waifu_daemon.py stop     # Write stop signal
"""

import os, sys, time, json, subprocess, signal, traceback
from datetime import datetime, timezone, timedelta

# === PATHS ===
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, "scripts")
DATA_DIR = os.path.join(BASE_DIR, "data")
LOG_FILE = os.path.join(DATA_DIR, "waifu_daemon.log")
PID_FILE = os.path.join(DATA_DIR, "waifu_daemon.pid")
STATE_FILE = os.path.join(DATA_DIR, "waifu_daemon_state.json")
STOP_FLAG = os.path.join(DATA_DIR, ".waifu_stop")

# === CONFIG ===
CRYPTO_INTERVAL = int(os.environ.get("WAIFU_CRYPTO_INTERVAL", 300))   # 5 min
SPORTS_INTERVAL = int(os.environ.get("WAIFU_SPORTS_INTERVAL", 1800))  # 30 min
SYNC_INTERVAL = int(os.environ.get("WAIFU_SYNC_INTERVAL", 900))       # 15 min

WIB = timezone(timedelta(hours=7))

running = True

def log(msg):
    ts = datetime.now(WIB).strftime("%Y-%m-%d %H:%M:%S WIB")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"last_crypto": 0, "last_sports": 0, "last_sync": 0, "cycles": 0, "errors": 0}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

def handle_signal(sig, frame):
    global running
    log(f"🛑 Received signal {sig}, shutting down...")
    running = False

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

def run_crypto():
    """Run one crypto auto trader cycle."""
    log("💹 Crypto scan starting...")
    try:
        r = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS_DIR, "auto_trader.py")],
            capture_output=True, text=True, timeout=120,
            cwd=BASE_DIR
        )
        if r.returncode == 0:
            # Log last few lines
            lines = r.stdout.strip().split("\n")
            for line in lines[-5:]:
                log(f"  💹 {line}")
            return True
        else:
            log(f"  ❌ Crypto error: {r.stderr[-200:]}")
            return False
    except subprocess.TimeoutExpired:
        log("  ⏰ Crypto scan timeout (120s)")
        return False
    except Exception as e:
        log(f"  ❌ Crypto exception: {e}")
        return False

def run_sports():
    """Run one sports auto trader cycle."""
    log("⚽ Sports scan starting...")
    try:
        r = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS_DIR, "sports_auto_trader.py"), "run"],
            capture_output=True, text=True, timeout=120,
            cwd=BASE_DIR
        )
        if r.returncode == 0:
            lines = r.stdout.strip().split("\n")
            for line in lines[-5:]:
                log(f"  ⚽ {line}")
            return True
        else:
            log(f"  ❌ Sports error: {r.stderr[-200:]}")
            return False
    except subprocess.TimeoutExpired:
        log("  ⏰ Sports scan timeout (120s)")
        return False
    except Exception as e:
        log(f"  ❌ Sports exception: {e}")
        return False

def sync_data():
    """Push data to GitHub → triggers Vercel rebuild."""
    log("🔄 Syncing data to GitHub...")
    try:
        # Only push data/ files (trades.json, bets.json, state)
        r = subprocess.run(
            ["git", "add", "data/trades.json", "data/bets.json",
             "data/auto_trader_state.json", "data/daily_pnl.json"],
            capture_output=True, text=True, timeout=15, cwd=BASE_DIR
        )
        # Check if there's anything to commit
        r2 = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            capture_output=True, text=True, timeout=10, cwd=BASE_DIR
        )
        if r2.returncode != 0:
            # There are staged changes
            ts = datetime.now(WIB).strftime("%Y-%m-%d %H:%M WIB")
            subprocess.run(
                ["git", "commit", "-m", f"auto-sync: {ts}", "--quiet"],
                capture_output=True, text=True, timeout=15, cwd=BASE_DIR
            )
            r3 = subprocess.run(
                ["git", "push", "origin", "main", "--quiet"],
                capture_output=True, text=True, timeout=30, cwd=BASE_DIR
            )
            if r3.returncode == 0:
                log("  ✅ Data pushed to GitHub")
                return True
            else:
                log(f"  ❌ Push failed: {r3.stderr[-200:]}")
                return False
        else:
            log("  ℹ️ No data changes to sync")
            return True
    except Exception as e:
        log(f"  ❌ Sync exception: {e}")
        return False

def main():
    global running

    if len(sys.argv) > 1:
        if sys.argv[1] == "status":
            state = load_state()
            now = time.time()
            print(f"📊 WaifuTrader Daemon Status")
            print(f"  Cycles: {state['cycles']} | Errors: {state['errors']}")
            if state['last_crypto']:
                ago = int(now - state['last_crypto'])
                print(f"  Last crypto: {ago}s ago")
            if state['last_sports']:
                ago = int(now - state['last_sports'])
                print(f"  Last sports: {ago}s ago")
            if state['last_sync']:
                ago = int(now - state['last_sync'])
                print(f"  Last sync: {ago}s ago")
            # Check if running
            if os.path.exists(PID_FILE):
                with open(PID_FILE) as f:
                    pid = f.read().strip()
                try:
                    os.kill(int(pid), 0)
                    print(f"  Status: 🟢 Running (PID {pid})")
                except:
                    print(f"  Status: 🔴 Not running (stale PID)")
            else:
                print(f"  Status: 🔴 No PID file")
            return

        if sys.argv[1] == "stop":
            with open(STOP_FLAG, "w") as f:
                f.write("stop")
            print("🛑 Stop signal written. Daemon will stop within 60s.")
            return

    # Write PID
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    # Remove old stop flag
    if os.path.exists(STOP_FLAG):
        os.remove(STOP_FLAG)

    log(f"🚀 WaifuTrader Daemon started (PID {os.getpid()})")
    log(f"  Crypto: every {CRYPTO_INTERVAL}s | Sports: every {SPORTS_INTERVAL}s | Sync: every {SYNC_INTERVAL}s")

    state = load_state()
    cycle = 0

    while running:
        # Check stop flag
        if os.path.exists(STOP_FLAG):
            log("🛑 Stop flag detected, shutting down...")
            os.remove(STOP_FLAG)
            break

        now = time.time()
        cycle += 1
        did_work = False

        # === CRYPTO ===
        if now - state.get("last_crypto", 0) >= CRYPTO_INTERVAL:
            ok = run_crypto()
            state["last_crypto"] = now
            did_work = True
            if not ok:
                state["errors"] = state.get("errors", 0) + 1

        # === SPORTS ===
        if now - state.get("last_sports", 0) >= SPORTS_INTERVAL:
            ok = run_sports()
            state["last_sports"] = now
            did_work = True
            if not ok:
                state["errors"] = state.get("errors", 0) + 1

        # === SYNC ===
        if now - state.get("last_sync", 0) >= SYNC_INTERVAL:
            ok = sync_data()
            state["last_sync"] = now
            did_work = True
            if not ok:
                state["errors"] = state.get("errors", 0) + 1

        if did_work:
            state["cycles"] = state.get("cycles", 0) + 1
            save_state(state)

        # Sleep 60s between checks (wake up for signals)
        for _ in range(60):
            if not running:
                break
            time.sleep(1)

    # Cleanup
    if os.path.exists(PID_FILE):
        os.remove(PID_FILE)
    log("👋 WaifuTrader Daemon stopped")

if __name__ == "__main__":
    main()
