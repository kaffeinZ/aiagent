/// <reference path="./@elizaos-core.d.ts" />
import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
  logger,
} from '@elizaos/core';
import { TAService } from './ta-service.ts';

/**
 * Extract cryptocurrency symbol from text
 */
function extractSymbol(text: string): string | null {
  const patterns = [
    /\b(bitcoin|btc)\b/i,
    /\b(ethereum|eth)\b/i,
    /\b(solana|sol)\b/i,
    /\b(binancecoin|bnb)\b/i,
    /\b(cardano|ada)\b/i,
    /\b(ripple|xrp)\b/i,
    /\b(polkadot|dot)\b/i,
    /\b(dogecoin|doge)\b/i,
    /\b(avalanche|avax)\b/i,
    /\b(polygon|matic)\b/i,
    /\b(chainlink|link)\b/i,
    /\b(litecoin|ltc)\b/i,
    /\b(uniswap|uni)\b/i,
    /\b(cosmos|atom)\b/i,
    /\b(sui)\b/i,
    /\b(pepe)\b/i,
    /\b(shiba|shib)\b/i,
    /\b(aptos|apt)\b/i,
    /\b(arbitrum|arb)\b/i,
    /\b(optimism|op)\b/i,
    /\b(near)\b/i,
    /\b(injective|inj)\b/i,
    /\b(render|rndr)\b/i,
    /\b(jupiter|jup)\b/i,
    /\b(sei)\b/i,
    /\b(celestia|tia)\b/i,
    /\b(fetch|fet)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  // Try uppercase 2-5 letter symbol
  const symbolMatch = text.match(/\b([A-Z]{2,5})\b/);
  if (symbolMatch) {
    return symbolMatch[1].toLowerCase();
  }

  return null;
}

/**
 * Extract timeframe/interval from text
 */
function extractInterval(text: string): string {
  const lower = text.toLowerCase();

  if (/\b(1\s*min(ute)?|1m)\b/.test(lower)) return '1m';
  if (/\b(5\s*min(ute)?s?|5m)\b/.test(lower)) return '5m';
  if (/\b(15\s*min(ute)?s?|15m)\b/.test(lower)) return '15m';
  if (/\b(30\s*min(ute)?s?|30m)\b/.test(lower)) return '30m';
  if (/\b(1\s*h(our)?|1h|hourly)\b/.test(lower)) return '1h';
  if (/\b(4\s*h(our)?s?|4h)\b/.test(lower)) return '4h';
  if (/\b(1?\s*d(ay)?|daily|1d)\b/.test(lower)) return '1d';
  if (/\b(1?\s*w(eek)?|weekly|1w)\b/.test(lower)) return '1w';

  // Default to 1h
  return '1h';
}

/**
 * Action to perform technical analysis on a cryptocurrency
 */
const analyzeChartAction: Action = {
  name: 'ANALYZE_CHART',
  similes: ['TECHNICAL_ANALYSIS', 'TA', 'CHART_ANALYSIS', 'INDICATORS', 'RSI', 'MACD'],
  description:
    'Performs technical analysis on a cryptocurrency using indicators like RSI, MACD, SMA, EMA, Bollinger Bands, Stochastic, ATR, ADX, OBV, and VWAP. Use when users ask about chart analysis, technical indicators, or trading signals.',

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    const taKeywords = [
      'technical analysis', 'ta ', 'chart', 'rsi', 'macd', 'bollinger',
      'moving average', 'sma', 'ema', 'stochastic', 'atr', 'adx',
      'indicators', 'indicator', 'support', 'resistance', 'overbought',
      'oversold', 'trend', 'momentum', 'analyze', 'analysis',
      'bearish', 'bullish', 'signal', 'crossover', 'vwap', 'obv',
    ];

    const hasTA = taKeywords.some((kw) => text.includes(kw));
    const hasCrypto = extractSymbol(text) !== null;

    return hasTA && hasCrypto;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling ANALYZE_CHART action');

      const taService = runtime.getService<TAService>(TAService.serviceType);

      if (!taService) {
        const errorMsg = 'Technical analysis service not available. Please ensure the plugin is properly initialized.';
        logger.error(errorMsg);
        if (callback) {
          await callback({ text: errorMsg, actions: ['ANALYZE_CHART'], source: message.content.source });
        }
        return { text: errorMsg, success: false, error: new Error('TA service not initialized') };
      }

      const text = message.content.text || '';
      const symbol = extractSymbol(text);

      if (!symbol) {
        const errorMsg = 'Could not identify a cryptocurrency. Please specify a coin (e.g., BTC, ETH, SOL).';
        if (callback) {
          await callback({ text: errorMsg, actions: ['ANALYZE_CHART'], source: message.content.source });
        }
        return { text: errorMsg, success: false, error: new Error('Symbol not found') };
      }

      const interval = extractInterval(text) as any;

      logger.info({ symbol, interval }, 'Running technical analysis');

      const result = await taService.analyze(symbol, interval);
      const formatted = taService.formatResult(result);

      logger.info({ symbol: result.symbol, interval, price: result.currentPrice }, 'TA completed');

      // Return data for LLM to interpret
      return {
        text: formatted,
        success: true,
        data: {
          actions: ['ANALYZE_CHART'],
          symbol: result.symbol,
          interval,
          currentPrice: result.currentPrice,
          indicators: result.indicators,
          summary: result.summary,
          timestamp: result.timestamp,
          source: message.content.source,
        },
      };
    } catch (error) {
      const errorMsg = `Technical analysis failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error({ error }, 'Error in ANALYZE_CHART action');

      if (callback) {
        await callback({ text: errorMsg, actions: ['ANALYZE_CHART'], source: message.content.source });
      }

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'Can you do a technical analysis on BTC?' },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Technical Analysis for BTCUSDT (1h candles, 200 periods):\nCurrent Price: $43,250.50\n\nRSI(14): 62.3 (Neutral-Bullish)\nMACD(12,26,9): Line: 145.2, Signal: 130.8, Histogram: +14.4 (Bullish)\nSMA(20): $43,120 (price above)\nSMA(50): $42,800 (price above)\nBollinger Bands: Near middle band\nATR(14): $380 (Moderate volatility)\n\nNFA - DYOR',
          actions: ['ANALYZE_CHART'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: { text: 'What does the RSI look like for SOL on the 4h chart?' },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Technical Analysis for SOLUSDT (4h candles):\nRSI(14): 71.2 (Overbought)\nPrice is approaching overbought territory. Watch for potential pullback.\n\nNFA - DYOR',
          actions: ['ANALYZE_CHART'],
        },
      },
    ],
  ],
};

/**
 * Provider that enriches crypto queries with TA context when relevant
 */
const taProvider: Provider = {
  name: 'TA_PROVIDER',
  description: 'Provides technical analysis data when crypto trading or analysis is discussed',

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<ProviderResult> => {
    try {
      const text = message.content.text?.toLowerCase() || '';

      // Only trigger for TA-relevant queries
      const taKeywords = [
        'technical analysis', 'ta ', 'chart', 'rsi', 'macd', 'bollinger',
        'moving average', 'sma', 'ema', 'indicator', 'overbought', 'oversold',
        'trend', 'momentum', 'analyze', 'analysis', 'signal', 'vwap',
      ];

      const hasTA = taKeywords.some((kw) => text.includes(kw));
      if (!hasTA) {
        return { text: '', values: {}, data: {} };
      }

      const symbol = extractSymbol(text);
      if (!symbol) {
        return { text: '', values: {}, data: {} };
      }

      const taService = runtime.getService<TAService>(TAService.serviceType);
      if (!taService) {
        return { text: '', values: {}, data: {} };
      }

      const interval = extractInterval(text) as any;
      const result = await taService.analyze(symbol, interval);

      return {
        text: taService.formatResult(result),
        values: {
          symbol: result.symbol,
          currentPrice: result.currentPrice,
          rsi: result.indicators.rsi14,
        },
        data: {
          taResult: result,
        },
      };
    } catch (error) {
      logger.debug({ error }, 'TA provider error (non-critical)');
      return { text: '', values: {}, data: {} };
    }
  },
};

export const taPlugin: Plugin = {
  name: 'plugin-ta',
  description:
    'Technical analysis plugin - fetches OHLCV data from Binance and computes RSI, MACD, SMA, EMA, Bollinger Bands, Stochastic, ATR, ADX, OBV, VWAP indicators',

  async init(_config: Record<string, string>, _runtime: IAgentRuntime) {
    logger.info('Initializing plugin-ta (Technical Analysis)');
    logger.info('Using Binance public API for OHLCV data (no API key required)');
  },

  services: [TAService],
  actions: [analyzeChartAction],
  providers: [taProvider],
};

export default taPlugin;
