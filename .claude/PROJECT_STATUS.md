# Project Status & Decisions

## What's been done
- **TA Plugin built** (`plugin-ta/`) — Binance OHLCV + technicalindicators library (RSI, MACD, SMA, EMA, BB, Stochastic, ATR, ADX, OBV, VWAP)
- **Trending TA Auto-Poster built** (`plugin-trending-ta/`) — fetches trending tokens from CoinGecko + Binance, runs TA, LLM composes post, publishes to Twitter (2x/day) + Telegram channel (6x/day)
- **Telegram bot configured** — `@kaffein_bot` for 1-on-1 chat, `@kaffein_ai` channel for broadcasts
- **Twitter rate limits fixed** — poll interval 2hrs, max 2 posts/day, built-in auto-post disabled (replaced by trending TA poster)
- **Twitter keys commented out** — 24hr rate limit exhausted, uncomment when reset
- **Web UI enabled** — ELIZA_UI_ENABLE=true on port 3000

## Next steps (not yet done)
1. **Telegram bot paywall** — free tier (3 queries) then Stripe payment for unlimited
2. **Cloud deployment** — Oracle Cloud free tier (ARM, 4 CPU, 24GB RAM)
3. **Domain + HTTPS** — cheap domain + Let's Encrypt
4. **User accounts / login** for web UI

## Business model
- **Free channel** (`@kaffein_ai`) — auto-posted TA analysis as marketing
- **Paid bot** (`@kaffein_bot`) — unlimited on-demand analysis via Telegram Stripe payments
- Subscription $5-10/mo or per-query model
- Token-gated access possible later once there's an audience
- OpenRouter LLM costs scale with users ($5-20+/mo)

## Technical notes
- Free tier Twitter API: 25 req/day — barely usable for bots, $100/mo Basic tier needed
- Telegram bot API: free, unlimited — best free platform
- Binance public API: free OHLCV data, no key needed
- CoinGecko trending API: free, no key needed
- technicalindicators npm: free, MIT license
- twitter-api-v2 npm: already installed via @elizaos/plugin-twitter
