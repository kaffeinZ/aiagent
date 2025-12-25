import { Service, logger } from '@elizaos/core';

/**
 * Price data structure
 */
export interface PriceData {
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  marketCap?: number;
  volume24h?: number;
  source: 'coingecko' | 'coinmarketcap';
  timestamp: number;
}

/**
 * Service for fetching cryptocurrency prices from CoinGecko and CoinMarketCap APIs
 */
export class PriceFeedService extends Service {
  static override serviceType = 'pricefeed';

  override capabilityDescription =
    'Fetches real-time cryptocurrency prices from CoinGecko and CoinMarketCap APIs.';

  private coingeckoBaseUrl = 'https://api.coingecko.com/api/v3';
  private coinmarketcapBaseUrl = 'https://pro-api.coinmarketcap.com/v1';
  private coinmarketcapApiKey: string | undefined;
  private rateLimitDelay = 2000; // 2 second delay between requests to respect rate limits (CoinGecko free tier: 10-50 calls/minute)
  private lastRequestTime = 0;

  constructor(runtime: any) {
    super(runtime);
    this.coinmarketcapApiKey = process.env.COINMARKETCAP_API_KEY?.trim();
  }

  static override async start(runtime: any): Promise<Service> {
    logger.info('Starting PriceFeedService');
    const service = new PriceFeedService(runtime);
    return service;
  }

  static override async stop(runtime: any): Promise<void> {
    logger.info('Stopping PriceFeedService');
    const service = runtime.getService(PriceFeedService.serviceType);
    if (!service) {
      throw new Error('PriceFeedService not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('PriceFeedService stopped');
  }

  /**
   * Rate limiting helper to respect API limits
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Normalize cryptocurrency symbol (e.g., BTC, btc, bitcoin -> bitcoin)
   * Maps common names to CoinGecko IDs
   */
  private normalizeSymbol(symbol: string): string {
    const normalized = symbol.toLowerCase().trim();
    
    // Map common names to CoinGecko IDs
    const symbolMap: Record<string, string> = {
      'solana': 'solana',
      'sol': 'solana',
      'bitcoin': 'bitcoin',
      'btc': 'bitcoin',
      'ethereum': 'ethereum',
      'eth': 'ethereum',
      'binancecoin': 'binancecoin',
      'bnb': 'binancecoin',
      'cardano': 'cardano',
      'ada': 'cardano',
      'ripple': 'ripple',
      'xrp': 'ripple',
      'polkadot': 'polkadot',
      'dot': 'polkadot',
      'dogecoin': 'dogecoin',
      'doge': 'dogecoin',
      'avalanche': 'avalanche-2',
      'avax': 'avalanche-2',
      'polygon': 'matic-network',
      'matic': 'matic-network',
      'chainlink': 'chainlink',
      'link': 'chainlink',
      'litecoin': 'litecoin',
      'ltc': 'litecoin',
      'uniswap': 'uniswap',
      'uni': 'uniswap',
      'cosmos': 'cosmos',
      'atom': 'cosmos',
      'usdc': 'usd-coin',
      'usdt': 'tether',
    };
    
    return symbolMap[normalized] || normalized;
  }

  /**
   * Fetch price from CoinGecko (free tier, no API key required)
   */
  private async fetchFromCoinGecko(
    symbol: string
  ): Promise<PriceData | null> {
    try {
      await this.rateLimit();

      const normalizedSymbol = this.normalizeSymbol(symbol);
      const url = `${this.coingeckoBaseUrl}/simple/price?ids=${normalizedSymbol}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;

      logger.debug({ url, symbol }, 'Fetching price from CoinGecko');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        // Handle rate limiting (429) with a more informative message
        if (response.status === 429) {
          logger.warn(
            { status: response.status, symbol },
            'CoinGecko API rate limit exceeded - will retry with longer delay'
          );
          // Increase delay for next request
          this.rateLimitDelay = Math.min(this.rateLimitDelay * 2, 10000); // Max 10 seconds
          return null;
        }
        logger.warn(
          { status: response.status, symbol },
          'CoinGecko API request failed'
        );
        return null;
      }
      
      // Reset rate limit delay on success
      if (this.rateLimitDelay > 2000) {
        this.rateLimitDelay = 2000;
      }

      const data = await response.json();

      // CoinGecko returns data with coin ID as key
      const coinData = data[normalizedSymbol];
      if (!coinData) {
        logger.warn({ symbol, data }, 'Coin not found in CoinGecko response');
        return null;
      }

      return {
        symbol: normalizedSymbol,
        name: normalizedSymbol,
        price: coinData.usd || 0,
        priceChange24h: coinData.usd_24h_change || 0,
        priceChangePercent24h: coinData.usd_24h_change || 0,
        marketCap: coinData.usd_market_cap || undefined,
        volume24h: coinData.usd_24h_vol || undefined,
        source: 'coingecko',
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error({ error, symbol }, 'Error fetching from CoinGecko');
      return null;
    }
  }

  /**
   * Fetch price from CoinMarketCap (requires free API key)
   */
  private async fetchFromCoinMarketCap(
    symbol: string
  ): Promise<PriceData | null> {
    if (!this.coinmarketcapApiKey) {
      logger.debug('CoinMarketCap API key not configured, skipping');
      return null;
    }

    try {
      await this.rateLimit();

      // Map symbols to CoinMarketCap symbols (handle special cases)
      const cmcSymbolMap: Record<string, string> = {
        'solana': 'SOL',
        'sol': 'SOL',
        'bitcoin': 'BTC',
        'btc': 'BTC',
        'ethereum': 'ETH',
        'eth': 'ETH',
        'binancecoin': 'BNB',
        'bnb': 'BNB',
        'cardano': 'ADA',
        'ada': 'ADA',
        'ripple': 'XRP',
        'xrp': 'XRP',
        'polkadot': 'DOT',
        'dot': 'DOT',
        'dogecoin': 'DOGE',
        'doge': 'DOGE',
        'avalanche': 'AVAX',
        'avax': 'AVAX',
        'polygon': 'MATIC',
        'matic': 'MATIC',
        'chainlink': 'LINK',
        'link': 'LINK',
        'litecoin': 'LTC',
        'ltc': 'LTC',
        'uniswap': 'UNI',
        'uni': 'UNI',
        'cosmos': 'ATOM',
        'atom': 'ATOM',
        'usdc': 'USDC',
        'usdt': 'USDT',
      };

      const normalizedSymbol = symbol.toLowerCase().trim();
      const cmcSymbol = cmcSymbolMap[normalizedSymbol] || symbol.toUpperCase().trim();
      const url = `${this.coinmarketcapBaseUrl}/cryptocurrency/quotes/latest?symbol=${cmcSymbol}`;

      logger.debug({ url, symbol, cmcSymbol }, 'Fetching price from CoinMarketCap');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-CMC_PRO_API_KEY': this.coinmarketcapApiKey,
        },
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, symbol },
          'CoinMarketCap API request failed'
        );
        return null;
      }

      const data = await response.json();

      if (
        !data.data ||
        !data.data[cmcSymbol] ||
        !data.data[cmcSymbol][0]
      ) {
        logger.warn(
          { symbol, cmcSymbol, data },
          'Coin not found in CoinMarketCap response'
        );
        return null;
      }

      const coinData = data.data[cmcSymbol][0];
      
      // Validate that we got the right token (check platform for Solana)
      if (normalizedSymbol === 'solana' || normalizedSymbol === 'sol') {
        // Solana should not be on Ethereum platform
        if (coinData.platform && coinData.platform.name === 'Ethereum') {
          logger.warn(
            { symbol, coinData: coinData.name },
            'Found wrong token on CoinMarketCap (Ethereum token instead of Solana blockchain)'
          );
          return null;
        }
      }

      const quote = coinData.quote?.USD;

      if (!quote) {
        logger.warn({ symbol }, 'USD quote not available in CoinMarketCap');
        return null;
      }

      return {
        symbol: cmcSymbol,
        name: coinData.name || cmcSymbol,
        price: quote.price || 0,
        priceChange24h: quote.price_change_24h || 0,
        priceChangePercent24h: quote.percent_change_24h || 0,
        marketCap: quote.market_cap || undefined,
        volume24h: quote.volume_24h || undefined,
        source: 'coinmarketcap',
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error({ error, symbol }, 'Error fetching from CoinMarketCap');
      return null;
    }
  }

  /**
   * Get price for a single cryptocurrency
   * Tries CoinGecko first (free, no API key), then CoinMarketCap if available
   */
  async getPrice(symbol: string): Promise<PriceData | null> {
    logger.info({ symbol }, 'Fetching price');

    // Try CoinGecko first (free, no API key required)
    const coingeckoPrice = await this.fetchFromCoinGecko(symbol);
    if (coingeckoPrice) {
      return coingeckoPrice;
    }

    // Fallback to CoinMarketCap if API key is available
    if (this.coinmarketcapApiKey) {
      const cmcPrice = await this.fetchFromCoinMarketCap(symbol);
      if (cmcPrice) {
        return cmcPrice;
      }
    }

    logger.warn({ symbol }, 'Failed to fetch price from all sources');
    return null;
  }

  /**
   * Get prices for multiple cryptocurrencies
   * Uses CoinGecko's batch endpoint for efficiency
   */
  async getMultiplePrices(symbols: string[]): Promise<PriceData[]> {
    logger.info({ count: symbols.length }, 'Fetching multiple prices');

    const results: PriceData[] = [];

    // CoinGecko supports batch requests
    try {
      await this.rateLimit();

      const normalizedSymbols = symbols.map((s) => this.normalizeSymbol(s));
      const ids = normalizedSymbols.join(',');
      const url = `${this.coingeckoBaseUrl}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;

      logger.debug({ url, symbols }, 'Fetching batch prices from CoinGecko');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();

        for (const symbol of normalizedSymbols) {
          const coinData = data[symbol];
          if (coinData) {
            results.push({
              symbol,
              name: symbol,
              price: coinData.usd || 0,
              priceChange24h: coinData.usd_24h_change || 0,
              priceChangePercent24h: coinData.usd_24h_change || 0,
              marketCap: coinData.usd_market_cap || undefined,
              volume24h: coinData.usd_24h_vol || undefined,
              source: 'coingecko',
              timestamp: Date.now(),
            });
          }
        }
      }
    } catch (error) {
      logger.error({ error, symbols }, 'Error in batch price fetch');
    }

    // If CoinGecko fails or returns incomplete results, try individual fetches
    if (results.length < symbols.length) {
      const missingSymbols = symbols.filter(
        (s) => !results.find((r) => r.symbol === this.normalizeSymbol(s))
      );

      for (const symbol of missingSymbols) {
        const price = await this.getPrice(symbol);
        if (price) {
          results.push(price);
        }
      }
    }

    return results;
  }

  /**
   * Format price data for display
   */
  formatPriceData(priceData: PriceData): string {
    const changeEmoji =
      priceData.priceChangePercent24h >= 0 ? '📈' : '📉';
    const changeSign = priceData.priceChangePercent24h >= 0 ? '+' : '';

    let formatted = `**${priceData.name.toUpperCase()}** (${priceData.symbol})\n`;
    formatted += `Price: $${priceData.price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    })}\n`;
    formatted += `${changeEmoji} 24h Change: ${changeSign}${priceData.priceChangePercent24h.toFixed(2)}% (${changeSign}$${priceData.priceChange24h.toFixed(2)})\n`;

    if (priceData.marketCap) {
      formatted += `Market Cap: $${priceData.marketCap.toLocaleString('en-US')}\n`;
    }

    if (priceData.volume24h) {
      formatted += `24h Volume: $${priceData.volume24h.toLocaleString('en-US')}\n`;
    }

    formatted += `Source: ${priceData.source}\n`;
    formatted += `Updated: ${new Date(priceData.timestamp).toLocaleString()}`;

    return formatted;
  }
}

