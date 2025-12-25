# Price Feed Plugin

A cryptocurrency price feed plugin for ElizaOS that fetches real-time prices from CoinGecko and CoinMarketCap free APIs.

## Overview

This plugin enables your ElizaOS agent to:
- ✅ Fetch real-time cryptocurrency prices
- ✅ Get 24-hour price changes and market data
- ✅ Query multiple cryptocurrencies at once
- ✅ Works with free APIs (CoinGecko requires no API key)
- ✅ Optional CoinMarketCap integration for additional data sources

## Features

- **Free Tier Support**: CoinGecko works without an API key
- **Multiple Data Sources**: Supports both CoinGecko and CoinMarketCap
- **Smart Symbol Recognition**: Automatically detects cryptocurrency symbols from natural language
- **Batch Queries**: Fetch prices for multiple cryptocurrencies efficiently
- **Rate Limiting**: Built-in rate limiting to respect API limits
- **REST API**: Exposes HTTP endpoints for programmatic access

## Installation

1. **Navigate to the plugin directory:**
   ```bash
   cd plugin-pricefeed
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Build the plugin:**
   ```bash
   bun run build
   ```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Optional: CoinMarketCap API key (free tier available)
# Get one at: https://coinmarketcap.com/api/
COINMARKETCAP_API_KEY=your_api_key_here
```

**Note**: CoinGecko works without an API key, so the plugin will function even if `COINMARKETCAP_API_KEY` is not set.

### Getting API Keys (Optional)

#### CoinMarketCap (Optional)
1. Sign up at [CoinMarketCap](https://coinmarketcap.com/api/)
2. Get your free API key from the developer portal
3. Free tier includes 10,000 requests per month

#### CoinGecko
- No API key required for basic price data
- Free tier has generous rate limits

## Usage

### Actions

The plugin provides two main actions:

#### 1. GET_PRICE
Fetches the current price for a single cryptocurrency.

**Examples:**
- "What is the price of Bitcoin?"
- "How much is ETH worth?"
- "What's the current price of Solana?"

#### 2. GET_MULTIPLE_PRICES
Fetches prices for multiple cryptocurrencies at once.

**Examples:**
- "What are the prices of Bitcoin, Ethereum, and Solana?"
- "Compare prices for BTC, ETH, and BNB"
- "Show me prices for the top cryptocurrencies"

### Supported Cryptocurrencies

The plugin recognizes common cryptocurrencies including:
- Bitcoin (BTC)
- Ethereum (ETH)
- Binance Coin (BNB)
- Solana (SOL)
- Cardano (ADA)
- Ripple (XRP)
- Polkadot (DOT)
- Dogecoin (DOGE)
- Avalanche (AVAX)
- Polygon (MATIC)
- Chainlink (LINK)
- Litecoin (LTC)
- Uniswap (UNI)
- Cosmos (ATOM)
- USD Coin (USDC)
- Tether (USDT)

And many more! The plugin uses CoinGecko's coin IDs, which supports thousands of cryptocurrencies.

### API Endpoints

The plugin exposes REST API endpoints:

#### GET `/api/pricefeed/status`
Returns plugin status and API availability.

**Response:**
```json
{
  "status": "ok",
  "plugin": "plugin-pricefeed",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "apis": {
    "coingecko": "available (free)",
    "coinmarketcap": "available"
  }
}
```

#### GET `/api/pricefeed/price/:symbol`
Fetches price for a specific cryptocurrency.

**Example:**
```
GET /api/pricefeed/price/bitcoin
```

**Response:**
```json
{
  "symbol": "bitcoin",
  "name": "bitcoin",
  "price": 43250.50,
  "priceChange24h": 1050.00,
  "priceChangePercent24h": 2.5,
  "marketCap": 850000000000,
  "volume24h": 25000000000,
  "source": "coingecko",
  "timestamp": 1704067200000
}
```

## Plugin Structure

```
plugin-pricefeed/
├── src/
│   ├── pricefeed-service.ts  # Service for API calls
│   ├── plugin.ts             # Main plugin implementation
│   └── index.ts              # Plugin exports
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Start Development Mode
```bash
bun run dev
```

### Build
```bash
bun run build
```

### Format Code
```bash
bun run format
```

### Run Tests
```bash
bun test
```

## How It Works

1. **Symbol Extraction**: The plugin uses natural language processing to extract cryptocurrency symbols from user messages.

2. **API Selection**: 
   - First tries CoinGecko (free, no API key)
   - Falls back to CoinMarketCap if CoinGecko fails and API key is configured

3. **Rate Limiting**: Built-in rate limiting (1 second between requests) to respect API limits.

4. **Data Formatting**: Prices are formatted with market data including:
   - Current price
   - 24-hour change (absolute and percentage)
   - Market capitalization
   - 24-hour trading volume

## Rate Limits

- **CoinGecko Free Tier**: ~50 calls/minute
- **CoinMarketCap Free Tier**: 10,000 calls/month

The plugin includes built-in rate limiting to help stay within these limits.

## Error Handling

The plugin gracefully handles:
- Missing API keys (falls back to available APIs)
- Network errors
- Invalid cryptocurrency symbols
- API rate limit errors
- Temporary API unavailability

## Examples

### Example 1: Single Price Query
**User**: "What's the price of Bitcoin?"

**Agent**: 
```
**BITCOIN** (bitcoin)
Price: $43,250.50
📈 24h Change: +2.5% (+$1,050.00)
Market Cap: $850,000,000,000
24h Volume: $25,000,000,000
Source: coingecko
Updated: 1/1/2024, 12:00:00 PM
```

### Example 2: Multiple Prices
**User**: "Show me prices for BTC, ETH, and SOL"

**Agent**: Returns formatted prices for all three cryptocurrencies.

## Troubleshooting

### Plugin Not Responding
- Check that the plugin is properly installed and built
- Verify the service is initialized in the runtime
- Check logs for error messages

### Prices Not Found
- Verify the cryptocurrency symbol is supported
- Check API availability (CoinGecko may be temporarily unavailable)
- Ensure rate limits haven't been exceeded

### API Key Issues
- CoinGecko works without an API key
- CoinMarketCap API key is optional but recommended for better reliability
- Verify API key format if using CoinMarketCap

## Contributing

Contributions are welcome! Please ensure:
- Code follows the existing style
- Tests are added for new features
- Documentation is updated

## License

This plugin is part of the ElizaOS project.

## Credits

This plugin integrates with:
- **CoinGecko** - Free cryptocurrency price data API
- **CoinMarketCap** - Comprehensive cryptocurrency market data API
