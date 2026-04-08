#!/usr/bin/env python3
"""
Polymarket Scanner — Fetch soccer match odds from Polymarket
Uses direct URL scraping since Gamma API is broken.

Usage:
  python3 polymarket_scanner.py scan              # Scan upcoming UCL + EPL matches
  python3 polymarket_scanner.py odds <slug>        # Get odds for specific match
  python3 polymarket_scanner.py suggest            # Get bet suggestions based on strategy
"""

import json, sys, os, re, argparse
from datetime import datetime, timezone

# Strategy thresholds
MAX_PRICE = 0.60    # Don't buy above 60¢
MIN_PRICE = 0.15    # Don't buy below 15¢
MIN_EV = 0.05       # Minimum 5% edge

# League configs
LEAGUES = {
    "ucl": {"name": "Champions League", "priority": 1},
    "epl": {"name": "Premier League", "priority": 2},
    "laliga": {"name": "La Liga", "priority": 3},
    "bundesliga": {"name": "Bundesliga", "priority": 4},
    "seriea": {"name": "Serie A", "priority": 5},
}

def estimate_ev(price, estimated_prob):
    """Estimate expected value: (prob * payout) - cost"""
    # On Polymarket, winning pays $1 per share
    return (estimated_prob * 1.0) - price

def implied_probability(price):
    """Convert price to implied probability"""
    return price

def estimate_true_prob(price, league, is_home, team_form="neutral"):
    """Estimate true probability with adjustments"""
    implied = price
    
    # Home advantage adjustment (~5% in soccer)
    if is_home:
        implied += 0.05
    
    # League-specific adjustments
    if league == "ucl":
        # UCL knockouts: favorites tend to underperform vs odds
        if price > 0.50:
            implied -= 0.03
        # Underdogs overperform in UCL
        elif price < 0.35:
            implied += 0.05
    
    # Form adjustment
    if team_form == "hot":
        implied += 0.03
    elif team_form == "cold":
        implied -= 0.03
    
    return min(max(implied, 0.01), 0.99)

def parse_match_from_url(url):
    """Parse match info from Polymarket event URL slug"""
    # Format: ucl-psg1-liv1-2026-04-08
    # or: epl-ars-bou-2026-04-11
    parts = url.replace('/event/', '').split('-')
    
    if len(parts) < 4:
        return None
    
    league = parts[0]
    team1_code = parts[1]
    team2_code = parts[2]
    date_str = '-'.join(parts[3:7]) if len(parts) >= 6 else parts[3]
    
    return {
        "league": league,
        "team1": team1_code,
        "team2": team2_code,
        "date": date_str,
        "slug": url.replace('/event/', '')
    }

def generate_suggestions(matches_with_odds):
    """Generate bet suggestions based on strategy"""
    suggestions = []
    
    for match in matches_with_odds:
        for outcome in match.get("outcomes", []):
            price = outcome["price"]
            
            # Skip if outside our range
            if price > MAX_PRICE or price < MIN_PRICE:
                continue
            
            # Estimate true probability
            is_home = outcome.get("is_home", False)
            true_prob = estimate_true_prob(
                price, 
                match.get("league", "unknown"),
                is_home
            )
            
            ev = estimate_ev(price, true_prob)
            
            if ev >= MIN_EV:
                suggestions.append({
                    "market": f'{match["team1"]} vs {match["team2"]} — {match.get("league", "").upper()}',
                    "outcome": outcome["name"],
                    "price": price,
                    "ev": round(ev, 3),
                    "true_prob": round(true_prob, 2),
                    "implied_prob": round(price, 2),
                    "reason": f'EV +{ev:.0%}, {"home" if is_home else "away"} advantage',
                    "date": match.get("date", "unknown")
                })
    
    # Sort by EV descending
    suggestions.sort(key=lambda x: x["ev"], reverse=True)
    return suggestions

def format_suggestions(suggestions):
    """Format suggestions for display"""
    if not suggestions:
        print("No value bets found.")
        return
    
    print(f"\n{'='*50}")
    print(f"VALUE BET SUGGESTIONS ({len(suggestions)} found)")
    print(f"{'='*50}")
    
    for i, s in enumerate(suggestions, 1):
        print(f"\n{i}. {s['market']}")
        print(f"   Bet: {s['outcome']} @ {s['price']:.0f}¢")
        print(f"   EV: +{s['ev']:.0%} | True: {s['true_prob']:.0%} | Implied: {s['implied_prob']:.0%}")
        print(f"   Reason: {s['reason']}")
        print(f"   Date: {s['date']}")

def main():
    p = argparse.ArgumentParser(description="Polymarket Scanner")
    p.add_argument("action", choices=["scan", "suggest"])
    p.add_argument("--data", help="JSON file with match data")
    args = p.parse_args()
    
    if args.action == "scan":
        print("Polymarket Scanner — Use browser integration for live data")
        print("Run from cron or agent for automated scanning")
    
    elif args.action == "suggest":
        if args.data:
            with open(args.data) as f:
                matches = json.load(f)
            suggestions = generate_suggestions(matches)
            format_suggestions(suggestions)
        else:
            print("Provide --data <matches.json> for suggestions")

if __name__ == "__main__":
    main()
