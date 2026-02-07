/// <reference path="./@elizaos-core.d.ts" />
import { Service, logger } from '@elizaos/core';

/**
 * Trending token data
 */
export interface TrendingToken {
  symbol: string;        // e.g. 'BTC', 'ETH', 'SOL'
  name: string;          // e.g. 'Bitcoin', 'Ethereum'
  priceChangePercent: number;
  volume24h: number;
  currentPrice: number;
  marketCapRank: number | null;
  source: 'coingecko' | 'binance';
}

interface CachedTrending {
  data: TrendingToken[];
  cachedAt: number;
}

/**
 * Major USDT pairs on Binance to filter for meaningful tokens
 */
const BINANCE_USDT_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT',
  'ARBUSDT', 'OPUSDT', 'INJUSDT', 'SUIUSDT', 'SEIUSDT',
  'TIAUSDT', 'FETUSDT', 'JUPUSDT', 'RENDERUSDT', 'PEPEUSDT',
  'SHIBUSDT', 'MATICUSDT', 'FILUSDT', 'ICPUSDT', 'HBARUSDT',
  'AAVEUSDT', 'MKRUSDT', 'SNXUSDT', 'CRVUSDT', 'LDOUSDT',
  'RUNEUSDT', 'GMXUSDT', 'DYDXUSDT', 'ALGOUSDT', 'XLMUSDT',
  'VETUSDT', 'EGLDUSDT', 'SANDUSDT', 'MANAUSDT', 'AXSUSDT',
  'GRTUSDT', 'ENAUSDT', 'WIFUSDT', 'BONKUSDT', 'FLOKIUSDT',
];

/**
 * Reverse map: Binance symbol → short symbol
 */
function binanceToShort(binanceSymbol: string): string {
  return binanceSymbol.replace('USDT', '');
}

export class TrendingService extends Service {
  static override serviceType = 'trending';

  override capabilityDescription =
    'Fetches trending cryptocurrency tokens from CoinGecko and Binance for analysis.';

  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private cache: CachedTrending | null = null;

  constructor(runtime: any) {
    super(runtime);
  }

  static override async start(runtime: any): Promise<Service> {
    logger.info('Starting TrendingService');
    const service = new TrendingService(runtime);
    logger.info('TrendingService started');
    return service;
  }

  static override async stop(runtime: any): Promise<void> {
    logger.info('Stopping TrendingService');
  }

  override async stop(): Promise<void> {
    this.cache = null;
    logger.info('TrendingService stopped');
  }

  /**
   * Fetch trending coins from CoinGecko (free, no key)
   */
  private async fetchCoinGeckoTrending(): Promise<TrendingToken[]> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/search/trending', {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'CoinGecko trending API failed');
        return [];
      }

      const data = await response.json() as any;
      const coins = data.coins || [];

      return coins.map((entry: any) => {
        const item = entry.item || entry;
        return {
          symbol: (item.symbol || '').toUpperCase(),
          name: item.name || item.symbol || 'Unknown',
          priceChangePercent: item.data?.price_change_percentage_24h?.usd || 0,
          volume24h: item.data?.total_volume?.usd || 0,
          currentPrice: item.data?.price || 0,
          marketCapRank: item.market_cap_rank || null,
          source: 'coingecko' as const,
        };
      }).filter((t: TrendingToken) => t.symbol && t.symbol !== 'UNKNOWN');
    } catch (error) {
      logger.error({ error }, 'Error fetching CoinGecko trending');
      return [];
    }
  }

  /**
   * Fetch top gainers from Binance 24hr ticker (free, no key)
   */
  private async fetchBinanceTopGainers(): Promise<TrendingToken[]> {
    try {
      // Fetch only our curated list of meaningful pairs
      const symbols = JSON.stringify(BINANCE_USDT_PAIRS);
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Binance 24hr ticker API failed');
        return [];
      }

      const data = await response.json() as any[];

      // Sort by price change percent descending, take top 10
      const sorted = data
        .filter((t: any) => parseFloat(t.priceChangePercent) > 0) // Only gainers
        .sort((a: any, b: any) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
        .slice(0, 10);

      return sorted.map((ticker: any) => ({
        symbol: binanceToShort(ticker.symbol),
        name: binanceToShort(ticker.symbol), // Binance doesn't provide full names
        priceChangePercent: parseFloat(ticker.priceChangePercent) || 0,
        volume24h: parseFloat(ticker.quoteVolume) || 0,
        currentPrice: parseFloat(ticker.lastPrice) || 0,
        marketCapRank: null,
        source: 'binance' as const,
      }));
    } catch (error) {
      logger.error({ error }, 'Error fetching Binance top gainers');
      return [];
    }
  }

  /**
   * Get merged trending tokens from both sources
   */
  async getTrending(): Promise<TrendingToken[]> {
    // Check cache
    if (this.cache && Date.now() - this.cache.cachedAt < this.CACHE_TTL) {
      logger.debug('Returning cached trending tokens');
      return this.cache.data;
    }

    logger.info('Fetching fresh trending tokens');

    // Fetch from both sources in parallel
    const [coingecko, binance] = await Promise.all([
      this.fetchCoinGeckoTrending(),
      this.fetchBinanceTopGainers(),
    ]);

    // Merge and deduplicate (prefer CoinGecko data when duplicate)
    const seen = new Set<string>();
    const merged: TrendingToken[] = [];

    // CoinGecko first (higher quality metadata)
    for (const token of coingecko) {
      if (!seen.has(token.symbol)) {
        seen.add(token.symbol);
        merged.push(token);
      }
    }

    // Then Binance gainers
    for (const token of binance) {
      if (!seen.has(token.symbol)) {
        seen.add(token.symbol);
        merged.push(token);
      }
    }

    // Sort by absolute price change (most interesting first)
    merged.sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));

    logger.info(
      { total: merged.length, coingecko: coingecko.length, binance: binance.length },
      'Fetched trending tokens'
    );

    // Cache
    this.cache = { data: merged, cachedAt: Date.now() };

    return merged;
  }
}
