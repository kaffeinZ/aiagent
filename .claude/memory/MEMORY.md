# ElizaOS Agent Project Memory

## Project: Kaffein crypto analyst agent
- ElizaOS v1.7.2, Bun runtime
- Character: "kaffein" - crypto analyst
- LLM: OpenRouter (Claude Sonnet 4.5)
- Telegram bot: @kaffein_bot (1-on-1 chat)
- Telegram channel: @kaffein_ai (auto-post broadcasts)
- Twitter: keys commented out (rate limited), free tier 25 req/day

## Plugins installed
- plugin-pricefeed (CoinGecko + CoinMarketCap)
- plugin-ta (Binance OHLCV + technicalindicators) — custom built
- plugin-trending-ta (auto-poster: trending tokens + TA → Twitter/Telegram) — custom built
- plugin-trader (EVM Uniswap + Solana swaps)
- plugin-falai (image gen)
- @elizaos/plugin-twitter, plugin-telegram, plugin-discord, plugin-solana, plugin-web-search

## Key patterns
- Plugins follow: Service class + Actions + Provider pattern
- Type declarations need @elizaos-core.d.ts in each plugin
- Custom plugins go in project root (e.g., plugin-ta/, plugin-trending-ta/)
- Registered in src/index.ts plugins array
- Character plugins loaded conditionally via env var checks
- Twitter auto-post is fully LLM-driven (hardcoded prompt in node_modules), no hooks
- Built-in TWITTER_AUTO_POST disabled, replaced by plugin-trending-ta

## Known issues
- Twitter free tier: 25 req/day, auth check on startup burns requests
- Twitter keys currently commented out in .env (rate limited)
- @elizaos/plugin-web does NOT exist on npm (CLAUDE.md is wrong)
- Web UI is built into @elizaos/client + @elizaos/server, enabled via ELIZA_UI_ENABLE=true
- Telegram plugin-telegram only handles 1-on-1 chat, NOT channel posting
- Channel posting handled by plugin-trending-ta auto-poster via Telegram Bot API directly

## Next priorities
1. Telegram bot paywall (3 free queries → Stripe payment)
2. Cloud deployment (Oracle Cloud free tier)
3. Domain + HTTPS
4. See .claude/PROJECT_STATUS.md for full status
