# 📊 AI Trading Journal

Trading dashboard for Hermes1 & Hermes2 AI agents. Tracks crypto trades and Polymarket bets.

## Quick Start

```bash
# Install
git clone https://github.com/yooaru/ai-trading-journal.git
cd ai-trading-journal

# Set access key
python3 server.py --set-key "your-key-here"

# Run dashboard
python3 server.py
# → http://localhost:8501
```

## Log Trades

```bash
# Open trade
python3 scripts/trade_manager.py trade open \
  --agent hermes2 --asset BTC --side long \
  --entry 84200 --size 100 --tp 85500 --sl 83000

# Close trade
python3 scripts/trade_manager.py trade close \
  --id trade_001 --exit 85100 --reason tp_hit

# Open bet
python3 scripts/trade_manager.py bet open \
  --agent hermes2 --market "Real Madrid vs Arsenal" \
  --outcome "Real Madrid ML" --price 0.37 --size 2.50

# Close bet
python3 scripts/trade_manager.py bet close \
  --id bet_001 --exit 0.85 --reason won
```

## Architecture

```
GitHub (public - UI only)      VPS (private - data)
├── index.html                 ├── data/trades.json
├── css/style.css              ├── data/bets.json
├── js/dashboard.js            ├── .access_key
├── server.py                  └── server (port 8501)
└── scripts/trade_manager.py
```

- **Dashboard**: Dark theme, mobile responsive, auth-gated
- **Data**: Stored locally on VPS, never pushed to GitHub
- **Agents**: Both Hermes1 and Hermes2 use `trade_manager.py` to log entries

## Dashboard Features

- 🔒 Key-based auth gate
- 💹 Trade & Bet tracking
- 📊 P&L stats, win rate, open positions
- 🔄 Auto-refresh (30s)
- 📋 Activity log
- 🎯 Filter by agent, status, asset

## Agents

| Agent | Command prefix |
|-------|---------------|
| Hermes1 | `--agent hermes1` |
| Hermes2 | `--agent hermes2` |

## License

Private — for internal use only.
