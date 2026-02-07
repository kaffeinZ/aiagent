/// <reference path="./@elizaos-core.d.ts" />
import type { Plugin, Provider, ProviderResult } from '@elizaos/core';
import { type IAgentRuntime, type Memory, type State, logger } from '@elizaos/core';
import { TrendingService } from './trending-service.ts';
import { AutoPosterService } from './auto-poster.ts';

/**
 * Provider that returns trending token data when users ask about trending/hot tokens
 */
const trendingProvider: Provider = {
  name: 'TRENDING_PROVIDER',
  description: 'Provides trending cryptocurrency data when users ask about trending, hot, or top-gaining tokens',

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<ProviderResult> => {
    try {
      const text = message.content.text?.toLowerCase() || '';

      const trendingKeywords = [
        'trending', 'hot', 'top gainer', 'top mover', 'most active',
        'what\'s pumping', 'whats pumping', 'what is trending',
        'top coins', 'biggest gainer', 'mooning',
      ];

      const isTrendingQuery = trendingKeywords.some((kw) => text.includes(kw));
      if (!isTrendingQuery) {
        return { text: '', values: {}, data: {} };
      }

      const trendingService = runtime.getService<TrendingService>(TrendingService.serviceType);
      if (!trendingService) {
        return { text: '', values: {}, data: {} };
      }

      const trending = await trendingService.getTrending();
      if (trending.length === 0) {
        return { text: 'No trending data available right now.', values: {}, data: {} };
      }

      const formatted = trending.slice(0, 10).map((t, i) => {
        const sign = t.priceChangePercent >= 0 ? '+' : '';
        return `${i + 1}. ${t.symbol} (${t.name}) — ${sign}${t.priceChangePercent.toFixed(1)}% | $${t.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
      }).join('\n');

      return {
        text: `Trending Cryptocurrencies (live data):\n${formatted}`,
        values: { trendingCount: trending.length },
        data: { trending: trending.slice(0, 10) },
      };
    } catch (error) {
      logger.debug({ error }, 'Trending provider error (non-critical)');
      return { text: '', values: {}, data: {} };
    }
  },
};

export const trendingTAPlugin: Plugin = {
  name: 'plugin-trending-ta',
  description:
    'Fetches trending tokens, runs technical analysis, and auto-posts to Twitter and Telegram on a schedule.',

  async init(_config: Record<string, string>, _runtime: IAgentRuntime) {
    logger.info('Initializing plugin-trending-ta');
    logger.info({
      enabled: process.env.TRENDING_POST_ENABLED,
      twitterInterval: process.env.TRENDING_TWITTER_INTERVAL || '43200000',
      telegramInterval: process.env.TRENDING_TELEGRAM_INTERVAL || '14400000',
    }, 'Trending auto-poster config');
  },

  services: [TrendingService, AutoPosterService],
  providers: [trendingProvider],
};

export default trendingTAPlugin;
