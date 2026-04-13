#!/usr/bin/env python3
"""
Update market_snapshot.json with fresh Polymarket odds via Gamma API.
Runs every hour via cron. Daemon reads this file for scanning.
"""

import json
import os
import sys
import requests
from datetime import datetime, timezone, timedelta

DATA_DIR = "/home/ubuntu/ai-trading-journal/data"
SNAPSHOT_FILE = os.path.join(DATA_DIR, "market_snapshot.json")

# Team abbreviation mapping: ESPN name -> Polymarket slug abbreviation
TEAM_ABBREV = {
    # EPL
    "Arsenal": "ars", "Aston Villa": "avl", "Bournemouth": "bou", "Brentford": "bre",
    "Brighton & Hove Albion": "bri", "Burnley": "bur", "Chelsea": "che", "Crystal Palace": "cry",
    "Everton": "eve", "Fulham": "ful", "Leeds United": "lee", "Leicester City": "lei",
    "Liverpool": "liv", "Manchester City": "mci", "Manchester United": "mun", "Newcastle United": "new",
    "Nottingham Forest": "nfo", "Southampton": "sou", "Tottenham Hotspur": "tot", "West Ham United": "whu",
    "Wolverhampton Wanderers": "wol", "Ipswich Town": "ips", "Luton Town": "lut",
    # Bundesliga
    "Bayern Munich": "bay", "Borussia Dortmund": "dor", "Bayer Leverkusen": "b04",
    "RB Leipzig": "lei", "Eintracht Frankfurt": "ein", "VfL Wolfsburg": "wol",
    "SC Freiburg": "fre", "Union Berlin": "uni", "Stuttgart": "stu", "Augsburg": "aug",
    "Werder Bremen": "wer", "Mainz 05": "mai", "Borussia Monchengladbach": "gla",
    "Hoffenheim": "hof", "Heidenheim": "hei", "St. Pauli": "pau", "Holstein Kiel": "kie",
    "Bochum": "boc",
    # La Liga
    "Barcelona": "bar", "Real Madrid": "rea", "Atletico Madrid": "atm", "Real Sociedad": "soc",
    "Athletic Club": "ath", "Villarreal": "vil", "Real Betis": "bet", "Sevilla": "sev",
    "Valencia": "val", "Celta Vigo": "cel", "Osasuna": "osa", "Girona": "gir",
    "Mallorca": "mal", "Las Palmas": "lpa", "Getafe": "get", "Espanyol": "esp",
    "Alaves": "ala", "Rayo Vallecano": "ray", "Valladolid": "vld", "Leganes": "leg",
    # Serie A
    "Inter Milan": "int", "AC Milan": "mil", "Juventus": "juv", "Napoli": "nap",
    "AS Roma": "rom", "Lazio": "laz", "Atalanta": "ata", "Fiorentina": "fio",
    "Bologna": "bol", "Torino": "tor", "Udinese": "udi", "Monza": "mon",
    "Empoli": "emp", "Cagliari": "cag", "Hellas Verona": "ver", "Lecce": "lec",
    "Parma": "par", "Genoa": "gen", "Como": "com", "Venezia": "ven",
    # Ligue 1
    "Paris Saint-Germain": "psg", "Monaco": "mon", "Lyon": "lyo", "Lille": "lil",
    "Marseille": "mar", "Nice": "nic", "Lens": "len", "Rennes": "ren",
    "Nantes": "nan", "Strasbourg": "str", "Toulouse": "tou", "Montpellier": "mtp",
    "Reims": "rei", "Brest": "bre", "Le Havre": "hav", "Auxerre": "aux",
    "Angers": "ang", "Saint-Etienne": "ste",
}

LEAGUE_SLUG = {
    "eng.1": "epl", "eng.2": "epl",
    "ger.1": "bun", "ger.2": "bun",
    "esp.1": "lal", "esp.2": "lal",
    "ita.1": "sea", "ita.2": "sea",
    "fra.1": "l1",
    "uefa.champions": "ucl", "uefa.europa": "uel", "uefa.europa.conf": "uec",
}

def get_espn_matches(dates):
    """Fetch matches from ESPN for given dates."""
    all_matches = []
    for date_str in dates:
        url = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard"
        params = {"dates": date_str}
        try:
            resp = requests.get(url, params=params, timeout=15)
            data = resp.json()
            for e in data.get("events", []):
                comp = e.get("competitions", [{}])[0]
                league_id = e.get("league", {}).get("id", "")
                league_name = e.get("league", {}).get("name", "")
                teams = comp.get("competitors", [])
                status = comp.get("status", {}).get("type", {}).get("shortDetail", "")
                
                if len(teams) < 2:
                    continue
                if "FT" in status or "Postponed" in status:
                    continue  # skip finished/postponed
                
                home = teams[0].get("team", {}).get("displayName", "")
                away = teams[1].get("team", {}).get("displayName", "")
                
                # Parse date from event
                event_date = e.get("date", "")[:10]
                
                all_matches.append({
                    "home": home,
                    "away": away,
                    "league_id": league_id,
                    "league_name": league_name,
                    "date": event_date,
                    "status": status,
                })
        except Exception as ex:
            print(f"  ESPN error for {date_str}: {ex}", file=sys.stderr)
    return all_matches

def build_slug(match):
    """Build Polymarket slug from match info."""
    league_prefix = LEAGUE_SLUG.get(match["league_id"], None)
    if not league_prefix:
        return None
    
    home_abbr = TEAM_ABBREV.get(match["home"], None)
    away_abbr = TEAM_ABBREV.get(match["away"], None)
    
    if not home_abbr or not away_abbr:
        return None
    
    date = match["date"]
    return f"{league_prefix}-{home_abbr}-{away_abbr}-{date}"

def fetch_gamma_odds(slug):
    """Fetch odds from Gamma API for a slug."""
    results = {}
    
    # ML odds
    try:
        resp = requests.get(f"https://gamma-api.polymarket.com/events?slug={slug}", timeout=10)
        data = resp.json()
        if data and isinstance(data, list) and len(data) > 0:
            event = data[0]
            markets = event.get("markets", [])
            if len(markets) >= 3:
                results["ml"] = {
                    "home": {"price": float(markets[0].get("bestAsk", 0)), "outcome": markets[0].get("outcome", "Home")},
                    "draw": {"price": float(markets[1].get("bestAsk", 0)), "outcome": "Draw"},
                    "away": {"price": float(markets[2].get("bestAsk", 0)), "outcome": markets[2].get("outcome", "Away")},
                }
    except Exception:
        pass
    
    # More markets (totals, spreads, BTTS)
    try:
        resp = requests.get(f"https://gamma-api.polymarket.com/events?slug={slug}-more-markets", timeout=10)
        data = resp.json()
        if data and isinstance(data, list) and len(data) > 0:
            event = data[0]
            for m in event.get("markets", []):
                q = (m.get("question", "") or "").lower()
                price = float(m.get("bestAsk", 0))
                if "over 2.5" in q:
                    results["o2.5"] = price
                elif "over 3.5" in q:
                    results["o3.5"] = price
                elif "under 2.5" in q:
                    results["u2.5"] = price
                elif "both teams" in q and "yes" in q:
                    results["btts_yes"] = price
                elif "both teams" in q and "no" in q:
                    results["btts_no"] = price
                elif "-1.5" in q and "spread" in q:
                    results["home_-1.5"] = price
    except Exception:
        pass
    
    return results

def main():
    # Get today and tomorrow dates (UTC)
    now = datetime.now(timezone.utc)
    dates = [
        now.strftime("%Y%m%d"),
        (now + timedelta(days=1)).strftime("%Y%m%d"),
    ]
    
    print(f"Fetching matches for {dates[0]} and {dates[1]}...")
    matches = get_espn_matches(dates)
    print(f"Found {len(matches)} upcoming matches")
    
    # Build snapshot in daemon-compatible format
    snapshot_matches = []
    for m in matches:
        slug = build_slug(m)
        if not slug:
            continue
        
        odds = fetch_gamma_odds(slug)
        if not odds or "ml" not in odds:
            continue
        
        ml = odds["ml"]
        outcomes = []
        for key in ["home", "draw", "away"]:
            price = ml[key]["price"]
            if price > 0:
                outcomes.append({"outcome": ml[key]["outcome"], "price": price})
        
        extra = {}
        for k in ["o2.5", "o3.5", "u2.5", "btts_yes", "btts_no", "home_-1.5"]:
            if k in odds:
                extra[k] = odds[k]
        
        snapshot_matches.append({
            "team1": m["home"],
            "team2": m["away"],
            "league": m["league_name"],
            "date": m["date"],
            "slug": slug,
            "outcomes": outcomes,
            "markets": extra,
            "volume": 0,
        })
        print(f"  ✓ {m['home']} vs {m['away']} ({m['league_name']})")
    
    # Build snapshot
    snapshot = {
        "snapshot_time": now.isoformat(),
        "matches": snapshot_matches,
    }
    
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SNAPSHOT_FILE, "w") as f:
        json.dump(snapshot, f, indent=2)
    
    print(f"\n✅ Updated {SNAPSHOT_FILE}")
    print(f"   {len(snapshot_matches)} matches with odds")
    print(f"   Snapshot time: {now.isoformat()}")

if __name__ == "__main__":
    main()
