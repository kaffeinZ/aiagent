import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  type RouteRequest,
  type RouteResponse,
  Service,
  type State,
  logger,
  type MessagePayload,
  type WorldPayload,
  EventType,
} from '@elizaos/core';
import { z } from 'zod';
import { PriceFeedService } from './pricefeed-service.ts';

/**
 * Defines the configuration schema for the price feed plugin
 */
const configSchema = z.object({
  // Optional: CoinMarketCap API key (free tier available)
  // CoinGecko works without an API key
  COINMARKETCAP_API_KEY: z
    .string()
    .optional()
    .transform((val) => val?.trim() || undefined),
});

/**
 * Extract cryptocurrency symbol from text
 */
function extractSymbol(text: string): string | null {
  // Common cryptocurrency patterns
  const patterns = [
    /\b(bitcoin|btc)\b/i,
    /\b(ethereum|eth)\b/i,
    /\b(binancecoin|bnb)\b/i,
    /\b(solana|sol)\b/i,
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
    /\b(usdc|usdt|tether|usd coin)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const matched = match[1].toLowerCase();
      // Map common names to symbols
      const symbolMap: Record<string, string> = {
        bitcoin: 'bitcoin',
        btc: 'bitcoin',
        ethereum: 'ethereum',
        eth: 'ethereum',
        binancecoin: 'binancecoin',
        bnb: 'binancecoin',
        solana: 'solana',
        sol: 'solana',
        cardano: 'cardano',
        ada: 'cardano',
        ripple: 'ripple',
        xrp: 'ripple',
        polkadot: 'polkadot',
        dot: 'polkadot',
        dogecoin: 'dogecoin',
        doge: 'dogecoin',
        avalanche: 'avalanche-2',
        avax: 'avalanche-2',
        polygon: 'matic-network',
        matic: 'matic-network',
        chainlink: 'chainlink',
        link: 'chainlink',
        litecoin: 'litecoin',
        ltc: 'litecoin',
        uniswap: 'uniswap',
        uni: 'uniswap',
        cosmos: 'cosmos',
        atom: 'cosmos',
        usdc: 'usd-coin',
        'usd coin': 'usd-coin',
        usdt: 'tether',
        tether: 'tether',
      };
      return symbolMap[matched] || matched;
    }
  }

  // Try to find uppercase 3-5 letter symbol (e.g., BTC, ETH, SOL)
  const symbolMatch = text.match(/\b([A-Z]{3,5})\b/);
  if (symbolMatch) {
    const symbol = symbolMatch[1].toLowerCase();
    // Map common symbols
    const symbolMap: Record<string, string> = {
      btc: 'bitcoin',
      eth: 'ethereum',
      bnb: 'binancecoin',
      sol: 'solana',
      ada: 'cardano',
      xrp: 'ripple',
      dot: 'polkadot',
      doge: 'dogecoin',
      avax: 'avalanche-2',
      matic: 'matic-network',
      link: 'chainlink',
      ltc: 'litecoin',
      uni: 'uniswap',
      atom: 'cosmos',
    };
    return symbolMap[symbol] || symbol;
  }

  return null;
}

/**
 * Extract multiple symbols from text
 */
function extractSymbols(text: string): string[] {
  const symbols: string[] = [];
  const words = text.toLowerCase().split(/\s+/);

  // Common cryptocurrency symbols
  const commonSymbols = [
    'bitcoin',
    'btc',
    'ethereum',
    'eth',
    'binancecoin',
    'bnb',
    'solana',
    'sol',
    'cardano',
    'ada',
    'ripple',
    'xrp',
    'polkadot',
    'dot',
    'dogecoin',
    'doge',
    'avalanche',
    'avax',
    'polygon',
    'matic',
    'chainlink',
    'link',
    'litecoin',
    'ltc',
    'uniswap',
    'uni',
    'cosmos',
    'atom',
    'usdc',
    'usdt',
    'tether',
  ];

  for (const word of words) {
    if (commonSymbols.includes(word)) {
      const symbolMap: Record<string, string> = {
        btc: 'bitcoin',
        eth: 'ethereum',
        bnb: 'binancecoin',
        sol: 'solana',
        ada: 'cardano',
        xrp: 'ripple',
        dot: 'polkadot',
        doge: 'dogecoin',
        avax: 'avalanche-2',
        matic: 'matic-network',
        link: 'chainlink',
        ltc: 'litecoin',
        uni: 'uniswap',
        atom: 'cosmos',
        usdc: 'usd-coin',
        usdt: 'tether',
      };
      const mapped = symbolMap[word] || word;
      if (!symbols.includes(mapped)) {
        symbols.push(mapped);
      }
    }
  }

  return symbols;
}

/**
 * Action to get price for a single cryptocurrency
 */
const getPriceAction: Action = {
  name: 'GET_PRICE',
  similes: ['PRICE', 'CRYPTO_PRICE', 'TOKEN_PRICE', 'COIN_PRICE'],
  description:
    'Fetches the current price and 24h change for a cryptocurrency. Use this when users ask about cryptocurrency prices, token prices, or coin values.',

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    const priceKeywords = [
      'price',
      'cost',
      'value',
      'worth',
      'how much',
      'what is the price',
      'current price',
      'token price',
      'coin price',
      'crypto price',
    ];
    const hasPriceKeyword = priceKeywords.some((keyword) =>
      text.includes(keyword)
    );

    // Check if there's a cryptocurrency mentioned
    const hasCrypto = extractSymbol(text || '') !== null;

    return hasPriceKeyword && hasCrypto;
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
      logger.info('Handling GET_PRICE action from pricefeed plugin');

      const priceFeedService = runtime.getService<PriceFeedService>(
        PriceFeedService.serviceType
      );

      if (!priceFeedService) {
        const errorMsg =
          'Price feed service not available. Please ensure the plugin is properly initialized.';
        logger.error(errorMsg);

        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['GET_PRICE'],
            source: message.content.source,
          });
        }

        return {
          text: errorMsg,
          success: false,
          error: new Error('Price feed service not initialized'),
        };
      }

      const text = message.content.text || '';
      const symbol = extractSymbol(text);

      if (!symbol) {
        const errorMsg =
          'Could not identify a cryptocurrency in your message. Please specify a coin (e.g., Bitcoin, BTC, Ethereum, ETH).';
        logger.warn({ text }, 'No cryptocurrency symbol found');

        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['GET_PRICE'],
            source: message.content.source,
          });
        }

        return {
          text: errorMsg,
          success: false,
          error: new Error('Cryptocurrency symbol not found'),
        };
      }

      logger.info({ symbol }, 'Fetching price');

      const priceData = await priceFeedService.getPrice(symbol);

      if (!priceData) {
        // Still return a helpful message instead of failing completely
        const errorMsg = `I couldn't fetch the current price for ${symbol} right now. The price APIs may be temporarily unavailable or rate-limited. You can try asking again in a moment, or check the price on a cryptocurrency exchange directly.`;
        logger.warn({ symbol }, 'Failed to fetch price - returning helpful message');

        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['GET_PRICE'],
            source: message.content.source,
          });
        }

        // Return success: true so the agent still responds
        return {
          text: errorMsg,
          success: true, // Changed to true so agent still responds
          data: {
            actions: ['GET_PRICE'],
            symbol,
            source: message.content.source,
            note: 'Price fetch failed but user was informed',
          },
        };
      }

      // Return structured data for LLM analysis instead of pre-formatted text
      // The LLM will analyze this data and provide insights
      const fetchTime = new Date(priceData.timestamp).toLocaleString();
      const dataSummary = `Price data retrieved for ${symbol} at ${fetchTime}: Current price $${priceData.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}, 24h change ${priceData.priceChangePercent24h >= 0 ? '+' : ''}${priceData.priceChangePercent24h.toFixed(2)}% (${priceData.priceChange24h >= 0 ? '+' : ''}$${priceData.priceChange24h.toFixed(2)}), Market Cap: ${priceData.marketCap ? '$' + priceData.marketCap.toLocaleString('en-US') : 'N/A'}, 24h Volume: ${priceData.volume24h ? '$' + priceData.volume24h.toLocaleString('en-US') : 'N/A'}`;

      logger.info({ 
        symbol, 
        price: priceData.price, 
        timestamp: priceData.timestamp,
        fetchTime: new Date(priceData.timestamp).toISOString(),
        isRecent: Date.now() - priceData.timestamp < 60000 // Less than 1 minute old
      }, 'Price fetched successfully - fresh data');

      // Don't use callback here - let the LLM process the data and generate analysis
      // The LLM will receive this data and can provide insights, opinions, and analysis

      return {
        text: dataSummary, // Provide data summary, but LLM should analyze it
        success: true,
        data: {
          actions: ['GET_PRICE'],
          symbol,
          priceData,
          source: message.content.source,
          // Include raw data for LLM analysis
          analysisContext: {
            price: priceData.price,
            change24h: priceData.priceChange24h,
            changePercent24h: priceData.priceChangePercent24h,
            marketCap: priceData.marketCap,
            volume24h: priceData.volume24h,
            timestamp: priceData.timestamp,
          },
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in GET_PRICE action');
      const errorMsg = `Failed to get price: ${error instanceof Error ? error.message : String(error)}`;

      if (callback) {
        await callback({
          text: errorMsg,
          actions: ['GET_PRICE'],
          source: message.content.source,
        });
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
        content: {
          text: 'What is the price of Bitcoin?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '**BITCOIN** (bitcoin)\nPrice: $43,250.50\n📈 24h Change: +2.5% (+$1,050.00)\nMarket Cap: $850,000,000,000\n24h Volume: $25,000,000,000\nSource: coingecko',
          actions: ['GET_PRICE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'How much is ETH worth?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '**ETHEREUM** (ethereum)\nPrice: $2,450.75\n📉 24h Change: -1.2% (-$30.00)\nMarket Cap: $295,000,000,000\n24h Volume: $12,000,000,000\nSource: coingecko',
          actions: ['GET_PRICE'],
        },
      },
    ],
  ],
};

/**
 * Action to get prices for multiple cryptocurrencies
 */
const getMultiplePricesAction: Action = {
  name: 'GET_MULTIPLE_PRICES',
  similes: ['PRICES', 'MULTIPLE_PRICES', 'COMPARE_PRICES'],
  description:
    'Fetches prices for multiple cryptocurrencies at once. Use this when users ask about multiple coins or want to compare prices.',

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    const priceKeywords = [
      'prices',
      'compare',
      'multiple',
      'several',
      'list prices',
      'all prices',
    ];
    const hasPriceKeyword = priceKeywords.some((keyword) =>
      text.includes(keyword)
    );

    // Check if there are multiple cryptocurrencies mentioned
    const symbols = extractSymbols(text);
    const hasMultipleCrypto = symbols.length > 1;

    return hasPriceKeyword || hasMultipleCrypto;
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
      logger.info('Handling GET_MULTIPLE_PRICES action from pricefeed plugin');

      const priceFeedService = runtime.getService<PriceFeedService>(
        PriceFeedService.serviceType
      );

      if (!priceFeedService) {
        const errorMsg =
          'Price feed service not available. Please ensure the plugin is properly initialized.';
        logger.error(errorMsg);

        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['GET_MULTIPLE_PRICES'],
            source: message.content.source,
          });
        }

        return {
          text: errorMsg,
          success: false,
          error: new Error('Price feed service not initialized'),
        };
      }

      const text = message.content.text || '';
      const symbols = extractSymbols(text);

      // If no symbols found, try to extract at least one
      if (symbols.length === 0) {
        const singleSymbol = extractSymbol(text);
        if (singleSymbol) {
          symbols.push(singleSymbol);
        }
      }

      // Default to top cryptocurrencies if none specified
      if (symbols.length === 0) {
        symbols.push('bitcoin', 'ethereum', 'binancecoin', 'solana', 'cardano');
      }

      // Limit to 10 symbols to avoid rate limits
      const symbolsToFetch = symbols.slice(0, 10);

      logger.info({ symbols: symbolsToFetch }, 'Fetching multiple prices');

      const priceDataList = await priceFeedService.getMultiplePrices(
        symbolsToFetch
      );

      if (priceDataList.length === 0) {
        // Still return a helpful message instead of failing completely
        const errorMsg =
          'I couldn\'t fetch the cryptocurrency prices right now. The price APIs may be temporarily unavailable or rate-limited. You can try asking again in a moment, or check prices on a cryptocurrency exchange directly.';
        logger.warn('Failed to fetch any prices - returning helpful message');

        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['GET_MULTIPLE_PRICES'],
            source: message.content.source,
          });
        }

        // Return success: true so the agent still responds
        return {
          text: errorMsg,
          success: true, // Changed to true so agent still responds
          data: {
            actions: ['GET_MULTIPLE_PRICES'],
            symbols: symbolsToFetch,
            source: message.content.source,
            note: 'Price fetch failed but user was informed',
          },
        };
      }

      // Return structured data for LLM analysis instead of pre-formatted text
      // The LLM will analyze this data and provide insights, comparisons, and opinions
      const dataSummary = `Retrieved price data for ${priceDataList.length} cryptocurrencies:\n\n` +
        priceDataList.map((pd) => 
          `${pd.symbol.toUpperCase()}: $${pd.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} (${pd.priceChangePercent24h >= 0 ? '+' : ''}${pd.priceChangePercent24h.toFixed(2)}% in 24h)`
        ).join('\n');

      logger.info(
        { count: priceDataList.length },
        'Multiple prices fetched successfully'
      );

      // Don't use callback here - let the LLM process the data and generate analysis
      // The LLM will receive this data and can provide insights, comparisons, and market analysis

      return {
        text: dataSummary, // Provide data summary, but LLM should analyze it
        success: true,
        data: {
          actions: ['GET_MULTIPLE_PRICES'],
          symbols: symbolsToFetch,
          priceDataList,
          source: message.content.source,
          // Include raw data for LLM analysis
          analysisContext: {
            prices: priceDataList.map((pd) => ({
              symbol: pd.symbol,
              price: pd.price,
              change24h: pd.priceChange24h,
              changePercent24h: pd.priceChangePercent24h,
              marketCap: pd.marketCap,
              volume24h: pd.volume24h,
            })),
          },
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in GET_MULTIPLE_PRICES action');
      const errorMsg = `Failed to get prices: ${error instanceof Error ? error.message : String(error)}`;

      if (callback) {
        await callback({
          text: errorMsg,
          actions: ['GET_MULTIPLE_PRICES'],
          source: message.content.source,
        });
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
        content: {
          text: 'What are the prices of Bitcoin, Ethereum, and Solana?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '**Cryptocurrency Prices**\n\n**BITCOIN** (bitcoin)\nPrice: $43,250.50\n...\n\n---\n\n**ETHEREUM** (ethereum)\nPrice: $2,450.75\n...',
          actions: ['GET_MULTIPLE_PRICES'],
        },
      },
    ],
  ],
};

/**
 * Price feed provider - provides contextual cryptocurrency price data
 */
const priceFeedProvider: Provider = {
  name: 'PRICE_FEED_PROVIDER',
  description:
    'Provides real-time cryptocurrency price data and market information',

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<ProviderResult> => {
    try {
      const priceFeedService = runtime.getService<PriceFeedService>(
        PriceFeedService.serviceType
      );

      if (!priceFeedService) {
        return {
          text: 'Price feed service not available',
          values: {},
          data: {},
        };
      }

      const text = message.content.text?.toLowerCase() || '';
      const symbol = extractSymbol(text);

      if (symbol) {
        const priceData = await priceFeedService.getPrice(symbol);
        if (priceData) {
          return {
            text: priceFeedService.formatPriceData(priceData),
            values: {
              symbol: priceData.symbol,
              price: priceData.price,
              change24h: priceData.priceChangePercent24h,
            },
            data: {
              symbol: priceData.symbol,
              name: priceData.name,
              price: priceData.price,
              priceChange24h: priceData.priceChange24h,
              priceChangePercent24h: priceData.priceChangePercent24h,
              marketCap: priceData.marketCap,
              volume24h: priceData.volume24h,
              source: priceData.source,
              timestamp: priceData.timestamp,
            },
          };
        }
      }

      // Default: provide top cryptocurrencies
      const topSymbols = ['bitcoin', 'ethereum', 'binancecoin'];
      const priceDataList = await priceFeedService.getMultiplePrices(
        topSymbols
      );

      if (priceDataList.length > 0) {
        return {
          text: `Top Cryptocurrency Prices:\n${priceDataList
            .map(
              (p) =>
                `${p.symbol.toUpperCase()}: $${p.price.toFixed(2)} (${p.priceChangePercent24h >= 0 ? '+' : ''}${p.priceChangePercent24h.toFixed(2)}%)`
            )
            .join('\n')}`,
          values: {
            prices: priceDataList.map((p) => ({
              symbol: p.symbol,
              price: p.price,
            })),
          },
          data: { priceDataList },
        };
      }

      return {
        text: 'Cryptocurrency price data available',
        values: {},
        data: {},
      };
    } catch (error) {
      logger.error({ error }, 'Error in price feed provider');
      return {
        text: 'Error fetching price data',
        values: {},
        data: {},
      };
    }
  },
};


export const priceFeedPlugin: Plugin = {
  name: 'plugin-pricefeed',
  description:
    'Cryptocurrency price feed plugin for ElizaOS - fetches real-time prices from CoinGecko and CoinMarketCap',
  config: {
    COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY?.trim() || undefined,
  },
  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    logger.info('Initializing plugin-pricefeed');
    try {
      // Merge config with process.env
      const mergedConfig: Record<string, string | undefined> = {
        ...config,
        COINMARKETCAP_API_KEY:
          process.env.COINMARKETCAP_API_KEY?.trim() ||
          config.COINMARKETCAP_API_KEY?.trim() ||
          undefined,
      };

      // Filter out empty strings
      const cleanedConfig: Record<string, string> = {};
      for (const [key, value] of Object.entries(mergedConfig)) {
        if (value !== undefined && value !== null && value.trim() !== '') {
          cleanedConfig[key] = value.trim();
        }
      }

      const validatedConfig = await configSchema.parseAsync(cleanedConfig);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }

      logger.info(
        {
          hasCoinMarketCapKey: !!validatedConfig.COINMARKETCAP_API_KEY,
        },
        'Price feed plugin initialized'
      );
    } catch (error) {
      // Don't fail plugin initialization if config validation fails
      logger.warn(
        { error },
        'Configuration validation issues, continuing anyway'
      );
    }
  },
  models: {
    [ModelType.TEXT_SMALL]: async (_runtime: IAgentRuntime, params: unknown) => {
      const { prompt, stopSequences = [] } = params as GenerateTextParams;
      return 'Never gonna give you up, never gonna let you down, never gonna run around and desert you...';
    },
    [ModelType.TEXT_LARGE]: async (_runtime: IAgentRuntime, params: unknown) => {
      const {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      } = params as GenerateTextParams;
      return 'Never gonna make you cry, never gonna say goodbye, never gonna tell a lie and hurt you...';
    },
  },
  routes: [
    {
      name: 'api-status',
      path: '/api/pricefeed/status',
      type: 'GET',
      handler: async (_req: RouteRequest, res: RouteResponse) => {
        res.json({
          status: 'ok',
          plugin: 'plugin-pricefeed',
          timestamp: new Date().toISOString(),
          apis: {
            coingecko: 'available (free)',
            coinmarketcap: process.env.COINMARKETCAP_API_KEY
              ? 'available'
              : 'not configured',
          },
        });
      },
    },
    {
      name: 'api-price',
      path: '/api/pricefeed/price/:symbol',
      type: 'GET',
      handler: async (req: RouteRequest, res: RouteResponse) => {
        try {
          const symbol = req.params?.symbol;
          if (!symbol) {
            res.status(400).json({ error: 'Symbol parameter required' });
            return;
          }

          // Get runtime from request context (if available)
          const runtime = (req as any).runtime as IAgentRuntime | undefined;
          if (!runtime) {
            res.status(500).json({ error: 'Runtime not available' });
            return;
          }

          const priceFeedService = runtime.getService<PriceFeedService>(
            PriceFeedService.serviceType
          );

          if (!priceFeedService) {
            res.status(500).json({ error: 'Price feed service not available' });
            return;
          }

          const priceData = await priceFeedService.getPrice(symbol);
          if (!priceData) {
            res.status(404).json({ error: 'Price not found for symbol' });
            return;
          }

          res.json(priceData);
        } catch (error) {
          logger.error({ error }, 'Error in price API route');
          res.status(500).json({
            error:
              error instanceof Error ? error.message : 'Internal server error',
          });
        }
      },
    },
  ],
  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async (params: MessagePayload) => {
        logger.debug('MESSAGE_RECEIVED event received');
        logger.debug({ message: params.message }, 'Message:');
      },
    ],
    [EventType.VOICE_MESSAGE_RECEIVED]: [
      async (params: MessagePayload) => {
        logger.debug('VOICE_MESSAGE_RECEIVED event received');
        logger.debug({ message: params.message }, 'Message:');
      },
    ],
    [EventType.WORLD_CONNECTED]: [
      async (params: WorldPayload) => {
        logger.debug('WORLD_CONNECTED event received');
        logger.debug({ world: params.world }, 'World:');
      },
    ],
    [EventType.WORLD_JOINED]: [
      async (params: WorldPayload) => {
        logger.debug('WORLD_JOINED event received');
        logger.debug({ world: params.world }, 'World:');
      },
    ],
  },
  services: [PriceFeedService],
  actions: [getPriceAction, getMultiplePricesAction],
  providers: [priceFeedProvider],
};

export default priceFeedPlugin;
