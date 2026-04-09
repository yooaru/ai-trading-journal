# Agent-2 Result: Caching + Reduce API Calls

## Approach
Added a caching layer with TTL-based expiration to eliminate redundant API calls in `scripts/auto_trader.py`. The script was fetching prices and indicators independently for each symbol per scan cycle with no caching, causing unnecessary network overhead and sleep delays.

## Files Changed
- `scripts/auto_trader.py` — main target file

## Key Changes
- **Price caching with 30s TTL**: `cached_get_price(symbol)` wraps `get_price()` and caches results for 30 seconds. Repeated calls within the same scan cycle return instantly from cache.
- **Indicator caching with 60s TTL**: `cached_get_indicators(symbol, interval)` wraps `get_indicators()` and caches results for 60 seconds. Trading indicators (RSI, MACD, Bollinger) change slowly so 60s TTL is appropriate.
- **Batch multi-TF fetch** (`get_multi_tf_cached`): Fetches 15m/1h/4h indicators using cache where possible. Only makes API calls for uncached timeframes. Sleep reduced from 0.3s to 0.1s between actual API calls (no sleep for cache hits).
- **Batch price pre-fetch** (`prefetch_prices_batch`): Uses Binance's `/api/v3/ticker/price` endpoint to fetch ALL prices in a single API call at the start of each scan, warming the cache for all 10 watchlist symbols.
- **Skip indicator fetch during hold period**: Existing positions in the 15-min hold period no longer fetch indicators for early-exit checks (they return "hold" immediately after the SL check).
- **Volatility risk uses cached indicators**: `get_volatility_risk()` now calls `cached_get_indicators()` instead of raw `get_indicators()`, reusing cached data from the scan loop.
- **Thread-safe cache**: Uses `threading.Lock` for cache access to prevent race conditions.

## Estimated Speedup
- **Before**: ~4-5 API calls per symbol (1 price + 3 indicators with 0.3s sleep each + 1 volatility indicator) = ~1.2s sleep per symbol + API latency. For 10 symbols: ~12s+ of sleep alone.
- **After**: 1 batch price call for all symbols + cached indicators. After first scan, prices hit cache (30s TTL), indicators hit cache (60s TTL). Sleep reduced to 0.1s only for uncached API calls. Expected ~60-80% reduction in scan time for subsequent scans (cache hits), ~30-40% for first scan (batch price pre-fetch).
- **Typical scan after warmup**: 0 price API calls + 0 indicator calls (all cached) = near-instant scan.
