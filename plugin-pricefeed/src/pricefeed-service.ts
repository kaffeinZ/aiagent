/// <reference path="./@elizaos-core.d.ts" />
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
 * Cached price data with timestamp
 */
interface CachedPriceData {
  data: PriceData;
  cachedAt: number;
}

/**
 * Service for fetching cryptocurrency prices from CoinGecko and CoinMarketCap APIs
 * Includes in-memory caching to reduce API calls and improve performance
 */
export class PriceFeedService extends Service {
  static override serviceType = 'pricefeed';

  override capabilityDescription =
    'Fetches real-time cryptocurrency prices from CoinGecko and CoinMarketCap APIs with intelligent caching.';

  private coingeckoBaseUrl = 'https://api.coingecko.com/api/v3';
  private coinmarketcapBaseUrl = 'https://pro-api.coinmarketcap.com/v1';
  private coinmarketcapApiKey: string | undefined;
  private rateLimitDelay = 2000; // 2 second delay between requests to respect rate limits (CoinGecko free tier: 10-50 calls/minute)
  private lastRequestTime = 0;

  // Cache configuration
  private readonly CACHE_TTL = 60000; // Cache TTL: 60 seconds (1 minute)
  private priceCache = new Map<string, CachedPriceData>(); // In-memory cache: symbol -> cached price data
  private cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

  // CoinGecko coin ID lookup cache (long-lived, coin IDs rarely change)
  private coinIdCache = new Map<string, string>(); // symbol/name -> coingecko ID
  private coinListLoaded = false;

  constructor(runtime: any) {
    super(runtime);
    this.coinmarketcapApiKey = process.env.COINMARKETCAP_API_KEY?.trim();
  }

  static override async start(runtime: any): Promise<Service> {
    logger.info('Starting PriceFeedService with caching enabled');
    const service = new PriceFeedService(runtime);

    // Start cache cleanup interval (run every 5 minutes)
    service.cacheCleanupInterval = setInterval(() => {
      service.cleanupExpiredCache();
    }, 5 * 60 * 1000); // 5 minutes

    logger.info({ cacheTTL: service.CACHE_TTL / 1000 + 's' }, 'PriceFeedService cache initialized');

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
    logger.info('Stopping PriceFeedService and clearing cache');

    // Clear cache cleanup interval
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }

    // Clear price cache
    this.priceCache.clear();

    logger.info('PriceFeedService stopped');
  }

  /**
   * Get cached price data if available and not expired
   * @param symbol - Normalized symbol to check
   * @returns Cached price data or null if not found/expired
   */
  private getCachedPrice(symbol: string): PriceData | null {
    const cached = this.priceCache.get(symbol);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const age = now - cached.cachedAt;

    // Check if cache is still valid
    if (age < this.CACHE_TTL) {
      logger.debug({
        symbol,
        age: Math.round(age / 1000) + 's',
        ttl: this.CACHE_TTL / 1000 + 's'
      }, 'Cache hit - returning cached price');
      return cached.data;
    }

    // Cache expired - remove it
    this.priceCache.delete(symbol);
    logger.debug({ symbol }, 'Cache expired - will fetch fresh data');
    return null;
  }

  /**
   * Store price data in cache
   * @param symbol - Normalized symbol
   * @param data - Price data to cache
   */
  private setCachedPrice(symbol: string, data: PriceData): void {
    this.priceCache.set(symbol, {
      data,
      cachedAt: Date.now(),
    });

    logger.debug({
      symbol,
      price: data.price,
      cacheSize: this.priceCache.size
    }, 'Price data cached');
  }

  /**
   * Clean up expired cache entries to prevent memory leaks
   * Called periodically by cleanup interval
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [symbol, cached] of this.priceCache.entries()) {
      const age = now - cached.cachedAt;
      if (age >= this.CACHE_TTL) {
        this.priceCache.delete(symbol);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug({
        removedCount,
        remainingSize: this.priceCache.size
      }, 'Cache cleanup completed');
    }
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
   * Load the full CoinGecko coin list for dynamic lookup.
   * Called once on first unknown token, then cached in memory.
   */
  private async loadCoinList(): Promise<void> {
    if (this.coinListLoaded) return;

    try {
      await this.rateLimit();
      const response = await fetch(`${this.coingeckoBaseUrl}/coins/list`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Failed to load CoinGecko coin list');
        return;
      }

      const coins: Array<{ id: string; symbol: string; name: string }> = await response.json();

      for (const coin of coins) {
        // Map by symbol (lowercase) — prefer higher market cap coins (listed first by CoinGecko)
        const sym = coin.symbol.toLowerCase();
        if (!this.coinIdCache.has(sym)) {
          this.coinIdCache.set(sym, coin.id);
        }
        // Also map by full name
        const name = coin.name.toLowerCase();
        if (!this.coinIdCache.has(name)) {
          this.coinIdCache.set(name, coin.id);
        }
        // Map by ID itself
        this.coinIdCache.set(coin.id, coin.id);
      }

      this.coinListLoaded = true;
      logger.info({ coinCount: coins.length }, 'CoinGecko coin list loaded for dynamic lookup');
    } catch (error) {
      logger.error({ error }, 'Error loading CoinGecko coin list');
    }
  }

  /**
   * Search CoinGecko for a token by name/symbol.
   * Uses the search API for fuzzy matching when the coin list doesn't have an exact match.
   */
  async searchCoin(query: string): Promise<{ id: string; name: string; symbol: string; marketCapRank: number | null } | null> {
    try {
      await this.rateLimit();
      const response = await fetch(
        `${this.coingeckoBaseUrl}/search?query=${encodeURIComponent(query)}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!response.ok) {
        logger.warn({ status: response.status, query }, 'CoinGecko search failed');
        return null;
      }

      const data = await response.json();
      const coins = data.coins;

      if (!coins || coins.length === 0) {
        return null;
      }

      // Return the top result (highest relevance)
      const top = coins[0];
      const result = {
        id: top.id,
        name: top.name,
        symbol: top.symbol,
        marketCapRank: top.market_cap_rank || null,
      };

      // Cache for future lookups
      this.coinIdCache.set(top.symbol.toLowerCase(), top.id);
      this.coinIdCache.set(top.name.toLowerCase(), top.id);
      this.coinIdCache.set(top.id, top.id);

      logger.info({ query, found: result }, 'CoinGecko search result');
      return result;
    } catch (error) {
      logger.error({ error, query }, 'Error searching CoinGecko');
      return null;
    }
  }

  /**
   * Normalize cryptocurrency symbol (e.g., BTC, btc, bitcoin -> bitcoin)
   * Maps common names to CoinGecko IDs, with dynamic lookup fallback
   */
  normalizeSymbol(symbol: string): string {
    const normalized = symbol.toLowerCase().trim();

    // Map common names to CoinGecko IDs (fast path for popular tokens)
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

    if (symbolMap[normalized]) {
      return symbolMap[normalized];
    }

    // Check the dynamic coin ID cache (populated from CoinGecko coin list)
    if (this.coinIdCache.has(normalized)) {
      return this.coinIdCache.get(normalized)!;
    }

    return normalized;
  }

  /**
   * Resolve any token input to a CoinGecko ID.
   * Tries: hardcoded map → coin list cache → CoinGecko search API
   */
  async resolveTokenId(input: string): Promise<string> {
    const normalized = this.normalizeSymbol(input);

    // If the normalized result is different from input, we found it in hardcoded or cache
    if (normalized !== input.toLowerCase().trim()) {
      return normalized;
    }

    // Try loading the full coin list first
    if (!this.coinListLoaded) {
      await this.loadCoinList();
      const fromList = this.coinIdCache.get(input.toLowerCase().trim());
      if (fromList) return fromList;
    }

    // Last resort: search API (fuzzy match)
    const searchResult = await this.searchCoin(input);
    if (searchResult) {
      return searchResult.id;
    }

    // Return as-is and let the API call fail gracefully
    return normalized;
  }

  /**
   * Fetch price from CoinGecko (free tier, no API key required)
   */
  private async fetchFromCoinGecko(
    coinId: string
  ): Promise<PriceData | null> {
    try {
      await this.rateLimit();

      const normalizedSymbol = coinId;
      const url = `${this.coingeckoBaseUrl}/simple/price?ids=${normalizedSymbol}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;

      logger.debug({ url, coinId }, 'Fetching price from CoinGecko');

      // Add cache-busting to ensure fresh data
      const urlWithCacheBuster = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      
      const response = await fetch(urlWithCacheBuster, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        // Handle rate limiting (429) with a more informative message
        if (response.status === 429) {
          logger.warn(
            { status: response.status, coinId },
            'CoinGecko API rate limit exceeded - will retry with longer delay'
          );
          // Increase delay for next request
          this.rateLimitDelay = Math.min(this.rateLimitDelay * 2, 10000); // Max 10 seconds
          return null;
        }
        logger.warn(
          { status: response.status, coinId },
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
        logger.warn({ coinId, data }, 'Coin not found in CoinGecko response');
        return null;
      }

      const priceData = {
        symbol: normalizedSymbol,
        name: normalizedSymbol,
        price: coinData.usd || 0,
        priceChange24h: coinData.usd_24h_change || 0,
        priceChangePercent24h: coinData.usd_24h_change || 0,
        marketCap: coinData.usd_market_cap || undefined,
        volume24h: coinData.usd_24h_vol || undefined,
        source: 'coingecko' as const,
        timestamp: Date.now(),
      };

      logger.info({
        coinId,
        price: priceData.price,
        timestamp: new Date(priceData.timestamp).toISOString(),
        fetchedAt: new Date().toISOString()
      }, 'Fetched fresh price data from CoinGecko');

      return priceData;
    } catch (error) {
      logger.error({ error, coinId }, 'Error fetching from CoinGecko');
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

      // Add cache-busting to ensure fresh data
      const urlWithCacheBuster = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      
      const response = await fetch(urlWithCacheBuster, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-CMC_PRO_API_KEY': this.coinmarketcapApiKey,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
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

      const priceData = {
        symbol: cmcSymbol,
        name: coinData.name || cmcSymbol,
        price: quote.price || 0,
        priceChange24h: quote.price_change_24h || 0,
        priceChangePercent24h: quote.percent_change_24h || 0,
        marketCap: quote.market_cap || undefined,
        volume24h: quote.volume_24h || undefined,
        source: 'coinmarketcap' as const,
        timestamp: Date.now(),
      };
      
      logger.info({ 
        symbol, 
        price: priceData.price, 
        timestamp: new Date(priceData.timestamp).toISOString(),
        fetchedAt: new Date().toISOString()
      }, 'Fetched fresh price data from CoinMarketCap');
      
      return priceData;
    } catch (error) {
      logger.error({ error, symbol }, 'Error fetching from CoinMarketCap');
      return null;
    }
  }

  /**
   * Get price for a single cryptocurrency
   * Checks cache first, then tries CoinGecko first (free, no API key), then CoinMarketCap if available
   * Caches successful results for improved performance
   */
  async getPrice(symbol: string): Promise<PriceData | null> {
    // Resolve to CoinGecko ID (uses hardcoded map, coin list, then search API)
    const resolvedId = await this.resolveTokenId(symbol);

    // Check cache first
    const cachedPrice = this.getCachedPrice(resolvedId);
    if (cachedPrice) {
      logger.info({ symbol, resolvedId }, 'Returning cached price');
      return cachedPrice;
    }

    logger.info({ symbol, resolvedId }, 'Cache miss - fetching fresh price');

    // Try CoinGecko first (free, no API key required)
    const coingeckoPrice = await this.fetchFromCoinGecko(resolvedId);
    if (coingeckoPrice) {
      this.setCachedPrice(resolvedId, coingeckoPrice);
      return coingeckoPrice;
    }

    // Fallback to CoinMarketCap if API key is available
    if (this.coinmarketcapApiKey) {
      const cmcPrice = await this.fetchFromCoinMarketCap(symbol);
      if (cmcPrice) {
        this.setCachedPrice(resolvedId, cmcPrice);
        return cmcPrice;
      }
    }

    logger.warn({ symbol, resolvedId }, 'Failed to fetch price from all sources');
    return null;
  }

  /**
   * Get prices for multiple cryptocurrencies
   * Checks cache first, then uses CoinGecko's batch endpoint for efficiency
   * Caches all successful results
   */
  async getMultiplePrices(symbols: string[]): Promise<PriceData[]> {
    logger.info({ count: symbols.length }, 'Fetching multiple prices');

    const results: PriceData[] = [];
    const uncachedSymbols: string[] = [];

    // Check cache for each symbol first
    for (const symbol of symbols) {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const cachedPrice = this.getCachedPrice(normalizedSymbol);

      if (cachedPrice) {
        results.push(cachedPrice);
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    logger.info({
      total: symbols.length,
      cached: results.length,
      uncached: uncachedSymbols.length
    }, 'Cache check completed');

    // If all prices are cached, return immediately
    if (uncachedSymbols.length === 0) {
      logger.info('All prices served from cache');
      return results;
    }

    // Fetch uncached symbols from CoinGecko batch endpoint
    try {
      await this.rateLimit();

      const normalizedSymbols = uncachedSymbols.map((s) => this.normalizeSymbol(s));
      const ids = normalizedSymbols.join(',');
      const url = `${this.coingeckoBaseUrl}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;

      logger.debug({ url, symbols: uncachedSymbols }, 'Fetching batch prices from CoinGecko');

      // Add cache-busting to ensure fresh data
      const urlWithCacheBuster = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      
      const response = await fetch(urlWithCacheBuster, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (response.ok) {
        const data = await response.json();

        for (const symbol of normalizedSymbols) {
          const coinData = data[symbol];
          if (coinData) {
            const priceData: PriceData = {
              symbol,
              name: symbol,
              price: coinData.usd || 0,
              priceChange24h: coinData.usd_24h_change || 0,
              priceChangePercent24h: coinData.usd_24h_change || 0,
              marketCap: coinData.usd_market_cap || undefined,
              volume24h: coinData.usd_24h_vol || undefined,
              source: 'coingecko',
              timestamp: Date.now(),
            };

            // Cache the result
            this.setCachedPrice(symbol, priceData);

            results.push(priceData);
          }
        }
      }
    } catch (error) {
      logger.error({ error, symbols }, 'Error in batch price fetch');
    }

    // If CoinGecko fails or returns incomplete results, try individual fetches
    // Check against total expected results (including cached)
    const totalExpected = symbols.length;
    if (results.length < totalExpected) {
      const missingSymbols = symbols.filter(
        (s) => !results.find((r) => r.symbol === this.normalizeSymbol(s))
      );

      logger.debug({
        total: totalExpected,
        fetched: results.length,
        missing: missingSymbols.length
      }, 'Some prices missing, trying individual fetches');

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

