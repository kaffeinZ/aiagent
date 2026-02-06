# Chart Generation Guide for kaffein Bot

## ✅ What's Now Enabled

Your bot can now **generate and share price charts** in two ways:

### 1. **Automatic Chart Generation** (via chartPlugin)
- When users ask for charts, your bot will automatically generate CoinGecko chart URLs
- Supports: Bitcoin, Ethereum, Solana, Cardano, BNB, XRP, DOGE, AVAX, MATIC, LINK, DOT
- Timeframes: 1d, 7d, 30d, 90d, 1y

### 2. **Manual Chart URLs** (for Twitter posts)
- Your bot can include chart URLs in its analysis tweets
- Twitter automatically displays them as image previews

---

## 🎯 How to Use Charts

### Example 1: User Asks for Chart
```
User: "Show me a Bitcoin chart"
Bot: "Here's the 7d price chart for Bitcoin:
      https://www.coingecko.com/coins/bitcoin/sparkline?timeframe=7d"
```

### Example 2: Bot Includes Chart in Analysis
```
Bot: "SOL is trading at $142.35, up 3.2% in 24h.

**Bullish factors:**
- Holding above $140 support
- DEX volume up 45%

Chart: https://www.coingecko.com/coins/solana/sparkline?timeframe=7d

NFA - DYOR"
```

---

## 📊 Supported Cryptocurrencies

| Mention | CoinGecko ID | Example |
|---------|--------------|---------|
| BTC / Bitcoin | `bitcoin` | https://www.coingecko.com/coins/bitcoin/sparkline?timeframe=7d |
| ETH / Ethereum | `ethereum` | https://www.coingecko.com/coins/ethereum/sparkline?timeframe=7d |
| SOL / Solana | `solana` | https://www.coingecko.com/coins/solana/sparkline?timeframe=7d |
| ADA / Cardano | `cardano` | https://www.coingecko.com/coins/cardano/sparkline?timeframe=7d |
| BNB | `binancecoin` | https://www.coingecko.com/coins/binancecoin/sparkline?timeframe=7d |
| XRP | `ripple` | https://www.coingecko.com/coins/ripple/sparkline?timeframe=7d |
| DOGE | `dogecoin` | https://www.coingecko.com/coins/dogecoin/sparkline?timeframe=7d |
| AVAX | `avalanche-2` | https://www.coingecko.com/coins/avalanche-2/sparkline?timeframe=7d |
| MATIC / Polygon | `matic-network` | https://www.coingecko.com/coins/matic-network/sparkline?timeframe=7d |
| LINK / Chainlink | `chainlink` | https://www.coingecko.com/coins/chainlink/sparkline?timeframe=7d |
| DOT / Polkadot | `polkadot` | https://www.coingecko.com/coins/polkadot/sparkline?timeframe=7d |

---

## ⏰ Supported Timeframes

| Mention | Timeframe | Example |
|---------|-----------|---------|
| 24h / today / 1d | 1 day | `?timeframe=1d` |
| 7d / week | 7 days | `?timeframe=7d` |
| 30d / month | 30 days | `?timeframe=30d` |
| 90d / 3m | 90 days | `?timeframe=90d` |
| 1y / year | 1 year | `?timeframe=1y` |

---

## 🚀 Testing Chart Generation

### Test 1: Ask for a chart directly
```bash
bun run dev
```

Then ask:
```
"Show me a Solana chart"
"Generate a 30d chart for Bitcoin"
"I want to see Ethereum price chart"
```

### Test 2: Include charts in analysis
Ask your bot:
```
"Analyze Bitcoin and show me a chart"
"What's happening with SOL? Show me the price chart"
```

---

## 🎨 Advanced: Custom Chart URLs

If you want more control, you can manually construct chart URLs:

### CoinGecko Format:
```
https://www.coingecko.com/coins/{coin-id}/sparkline?timeframe={period}
```

### TradingView Format (for more detailed charts):
```
https://www.tradingview.com/x/{symbol}USD/
```

**Example:**
```
https://www.tradingview.com/x/SOLUSD/  # Solana chart
https://www.tradingview.com/x/BTCUSD/  # Bitcoin chart
```

---

## 💡 Best Practices for Twitter

### DO:
- ✅ Include chart URL at the end of your analysis
- ✅ Mention the timeframe (e.g., "7d chart shows...")
- ✅ Use charts to support your analysis points
- ✅ Test chart URLs before posting

### DON'T:
- ❌ Post chart without context or analysis
- ❌ Use broken or expired chart links
- ❌ Overload tweet with multiple charts (1 per tweet is best)
- ❌ Forget to mention what the chart shows

---

## 📝 Example Twitter Thread with Charts

**Tweet 1:**
```
🔍 #Solana Analysis Thread 🧵

SOL is trading at $142.35, up 3.2% in 24h.

Let me break down what's happening... 👇

1/5
```

**Tweet 2:**
```
📊 Technical Picture:

- Holding strong above $140 support (tested 3x this week)
- Resistance at $150 rejected twice
- RSI at 63 on 4H - approaching overbought

Chart: https://www.coingecko.com/coins/solana/sparkline?timeframe=7d

2/5
```

**Tweet 3:**
```
⛓️ On-Chain Data:

- DEX volume up 45% week-over-week (per Solscan)
- Network activity: 3,200+ TPS sustained
- Strong network fundamentals

3/5
```

**Tweet 4:**
```
🎯 Outlook:

**Bullish if**: Breaks $150 with volume → next target $165
**Bearish if**: Loses $140 → retest $130

Watch BTC correlation (0.85) for broader market direction

4/5
```

**Tweet 5:**
```
⚠️ Risk Management:

- Don't chase at resistance
- Wait for confirmed breakout
- Position size accordingly

NFA - DYOR 🔍

Chart: https://www.coingecko.com/coins/solana/sparkline?timeframe=30d

5/5
```

---

## 🔧 Adding More Coins

To add support for more cryptocurrencies, edit [chartPlugin.ts](src/chartPlugin.ts):

```typescript
// Around line 40, add to coinMap:
const coinMap: Record<string, { id: string; name: string }> = {
  // ... existing coins
  'atom': { id: 'cosmos', name: 'Cosmos' },
  'algo': { id: 'algorand', name: 'Algorand' },
  'near': { id: 'near', name: 'NEAR Protocol' },
  // Add more coins here
};
```

**Find CoinGecko IDs:**
1. Go to https://www.coingecko.com
2. Search for your coin
3. URL will be: `https://www.coingecko.com/en/coins/{coin-id}`
4. Use that `coin-id`

---

## 🎯 Next Level: Custom Chart API (Optional)

For more advanced charts with indicators, consider:

### QuickChart API (Free)
```javascript
// Generate custom candlestick chart
const chartConfig = {
  type: 'line',
  data: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr'],
    datasets: [{
      label: 'Price',
      data: [100, 120, 110, 140]
    }]
  }
};

const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
```

### TradingView Widgets
Embed TradingView advanced charts:
```
https://www.tradingview.com/chart/?symbol=BINANCE:SOLUSDT
```

---

## ✅ Chart Generation Checklist

- [x] Chart plugin installed and configured
- [x] Supports major cryptocurrencies (BTC, ETH, SOL, etc.)
- [x] Multiple timeframes (1d, 7d, 30d, 90d, 1y)
- [x] Automatic chart generation when users ask
- [ ] Test chart generation with `bun run dev`
- [ ] Practice including charts in analysis
- [ ] Add more coins if needed
- [ ] Test chart URLs in Twitter posts

---

**Your bot can now visualize crypto data!** 📊🚀

Test it with: `bun run dev` and ask "Show me a Bitcoin chart"
