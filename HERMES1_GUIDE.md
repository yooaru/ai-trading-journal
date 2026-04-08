# ClawTrader Dashboard — Hermes1 Guide

## Quick Start

Edit files, then push. Changes live instantly via tunnel.

```bash
cd ~/ai-trading-journal   # or clone: git clone https://github.com/yooaru/ai-trading-journal.git
# edit files
git add -A && git commit -m "your change" && git push origin main
```

## File Structure

```
ai-trading-journal/
├── index.html          ← Dashboard (Tailwind CSS)
├── css/style.css       ← OLD (not used, Tailwind handles everything)
├── js/dashboard.js     ← All dashboard logic
├── data/
│   ├── trades.json     ← Trade history (auto_trader writes here)
│   ├── bets.json       ← Bet history (Polymarket)
│   ├── auto_trader_state.json  ← Current positions
│   └── daily_pnl.json  ← Daily P&L tracker
├── scripts/
│   ├── auto_trader.py  ← Main auto trader (cron every 30m)
│   └── indicators.py   ← TradingView indicators
└── server.py           ← HTTP server (port 8501)
```

## Architecture

```
User Browser
    ↓
Cloudflare Tunnel (https://ready-concentrate-...trycloudflare.com)
    ↓
VPS server.py (port 8501) — serves HTML + JS + data JSON
    ↓
data/*.json files (private on VPS)
```

- Frontend: Tailwind CSS CDN (no build step)
- Data: served from VPS via tunnel
- GitHub: version control only (not GitHub Pages)

## How to Edit

### Change colors/theme
Edit Tailwind classes in index.html directly.
Colors used:
- Background: `#08090a`
- Surface: `#191a1b`
- Accent: `#7132f5` (purple)
- Green: `text-green-400`
- Red: `text-red-400`

### Add a new stat card
In index.html, add a card in the `grid grid-cols-2 lg:grid-cols-4` section:
```html
<div class="bg-[#191a1b] border border-white/5 rounded-xl p-4">
  <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Label</div>
  <div id="my-stat" class="text-xl md:text-2xl font-bold font-mono">$0</div>
</div>
```
Then in js/dashboard.js, update `updateStats()` to set the value.

### Add a new tab
1. Add to TABS array in js/dashboard.js
2. Add a `<div class="p-4 md:p-6">` section in index.html

### Modify trade table columns
Edit the `<thead>` and the `renderTrades()` function in js/dashboard.js.

## Data Format

### trades.json
```json
{
  "trades": [{
    "id": "trade_001",
    "agent": "hermes2",
    "asset": "BTC",
    "side": "long",
    "entry_price": 84200,
    "exit_price": 85100,
    "size_usd": 100,
    "status": "closed",
    "pnl_usd": 1.07,
    "pnl_pct": 1.07,
    "opened_at": "2026-04-07T10:30:00Z",
    "closed_at": "2026-04-07T14:22:00Z",
    "close_reason": "tp_hit",
    "notes": "Support bounce"
  }]
}
```

### auto_trader_state.json
```json
{
  "positions": {
    "BTC": {
      "entry_price": 71591,
      "quantity": 0.001,
      "side": "long",
      "entry_time": "2026-04-08T11:30:00Z",
      "tp_levels": [73022, 74096, 75170],
      "sl_price": 70159,
      "current_price": 71765,
      "highest_price": 71765,
      "trailing_active": false
    }
  }
}
```

## Access
- URL: https://ready-concentrate-immediate-providers.trycloudflare.com
- Key: winter2026
- GitHub: https://github.com/yooaru/ai-trading-journal

## Auto Trader Commands
```bash
cd ~/ai-trading-journal
python3 scripts/auto_trader.py           # run scan
python3 scripts/auto_trader.py status    # check positions
python3 scripts/auto_trader.py analyze BTC  # full analysis
python3 scripts/auto_trader.py reset     # reset state
```
