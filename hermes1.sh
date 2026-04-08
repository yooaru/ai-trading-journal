#!/bin/bash
# ============================================
# Hermes1 Helper — Quick commands for dashboard + trading data
# ============================================

# === DASHBOARD FILES ===
DASHBOARD_DIR="/home/ubuntu/ai-trading-journal"
HTML="$DASHBOARD_DIR/index.html"
JS="$DASHBOARD_DIR/js/dashboard.js"
DATA="$DASHBOARD_DIR/data"

# === EDIT DASHBOARD ===
# Edit HTML (layout, cards, tabs):
#   nano $HTML
# Edit JS (logic, stats, rendering):
#   nano $JS
# Changes live instantly (server serves from disk)

# === ADD TRADE DATA ===
# Trades: $DATA/trades.json
# Bets: $DATA/bets.json
# Auto Trader State: $DATA/auto_trader_state.json
# Daily PnL: $DATA/daily_pnl.json

# === QUICK COMMANDS ===
case "$1" in
  edit-html)   nano $HTML ;;
  edit-js)     nano $JS ;;
  edit-trades) nano $DATA/trades.json ;;
  edit-bets)   nano $DATA/bets.json ;;
  status)      python3 $DASHBOARD_DIR/scripts/auto_trader.py status ;;
  scan)        python3 $DASHBOARD_DIR/scripts/auto_trader.py ;;
  analyze)     python3 $DASHBOARD_DIR/scripts/indicators.py ${2:-BTC} ;;
  log)         tail -20 $DATA/auto_trader.log ;;
  *)
    echo "Usage: $0 {edit-html|edit-js|edit-trades|edit-bets|status|scan|analyze|log}"
    echo ""
    echo "Dashboard:  $HTML"
    echo "JS:         $JS"
    echo "Data:       $DATA/"
    echo "Scripts:    $DASHBOARD_DIR/scripts/"
  ;;
esac
