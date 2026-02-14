/// <reference path="./@elizaos-core.d.ts" />
import type { Provider, IAgentRuntime, Memory, State, ProviderResult } from '@elizaos/core';
import { logger } from '@elizaos/core';

/**
 * Current Data Provider
 *
 * This provider FORCES web search for crypto-related queries to ensure
 * the agent ALWAYS has current data before responding.
 *
 * It runs BEFORE the agent generates responses and injects current data
 * into the context, solving the "old data" problem.
 */
export const currentDataProvider: Provider = {
  name: 'CURRENT_DATA_PROVIDER',
  description: 'Automatically fetches current crypto data for all analysis queries',
  dynamic: true,  // Make this provider run automatically
  position: -1000,  // Run early (negative = before others)

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    try {
      const text = message.content.text.toLowerCase();

      // Check if this is a crypto-related query
      const cryptoKeywords = [
        'btc', 'bitcoin', 'eth', 'ethereum', 'sol', 'solana', 'crypto',
        'price', 'token', 'coin', 'market', 'trading', 'defi',
        'analyze', 'analysis', 'trending', 'what\'s happening',
        'tell me about', 'should i buy', 'thoughts on'
      ];

      const isCryptoQuery = cryptoKeywords.some(keyword => text.includes(keyword));

      if (!isCryptoQuery) {
        // Not a crypto query, no need to fetch data
        return {
          text: '',
          values: {},
          data: {},
        };
      }

      logger.info('🔍 CURRENT_DATA_PROVIDER: Detected crypto query, fetching current data...');

      // Get the Tavily service
      const tavilyService = runtime.getService<any>('TAVILY');

      if (!tavilyService) {
        logger.warn('⚠️ CURRENT_DATA_PROVIDER: Tavily service not available');
        return {
          text: '⚠️ WARNING: Cannot fetch current data - web search service unavailable. Using knowledge cutoff data only.',
          values: {
            dataFreshness: 'unavailable',
            warning: true,
          },
          data: {},
        };
      }

      // Extract crypto mentions from the message (detect ANY token name/symbol)
      const cryptoMentions: string[] = [];

      // Common token map for fast matching
      const coinMap: Record<string, string> = {
        'btc': 'Bitcoin', 'bitcoin': 'Bitcoin',
        'eth': 'Ethereum', 'ethereum': 'Ethereum',
        'sol': 'Solana', 'solana': 'Solana',
        'ada': 'Cardano', 'cardano': 'Cardano',
        'bnb': 'BNB', 'binancecoin': 'BNB',
        'xrp': 'XRP', 'ripple': 'XRP',
        'doge': 'Dogecoin', 'dogecoin': 'Dogecoin',
        'dot': 'Polkadot', 'polkadot': 'Polkadot',
        'avax': 'Avalanche', 'avalanche': 'Avalanche',
        'matic': 'Polygon', 'polygon': 'Polygon',
        'link': 'Chainlink', 'chainlink': 'Chainlink',
        'ltc': 'Litecoin', 'litecoin': 'Litecoin',
        'uni': 'Uniswap', 'uniswap': 'Uniswap',
        'atom': 'Cosmos', 'cosmos': 'Cosmos',
      };

      for (const [key, name] of Object.entries(coinMap)) {
        if (text.includes(key) && !cryptoMentions.includes(name)) {
          cryptoMentions.push(name);
        }
      }

      // Detect unknown tokens: extract capitalized words or $ prefixed tokens
      // e.g., "what about PEPE" or "analyze $WIF" or "how is render doing"
      const words = message.content.text.split(/\s+/);
      const unknownTokens: string[] = [];
      for (const word of words) {
        const cleaned = word.replace(/[^a-zA-Z0-9$]/g, '');
        // $TOKEN pattern
        if (cleaned.startsWith('$') && cleaned.length > 1) {
          const token = cleaned.slice(1);
          if (!coinMap[token.toLowerCase()]) {
            unknownTokens.push(token);
          }
        }
        // ALL CAPS token (3-10 chars, not common words)
        else if (/^[A-Z]{3,10}$/.test(cleaned) && !['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'HAS', 'HOW', 'WHO', 'WHAT', 'WHEN', 'WHERE', 'WHY', 'THIS', 'THAT', 'WITH', 'FROM', 'WILL', 'ABOUT', 'NFA', 'DYOR'].includes(cleaned)) {
          if (!coinMap[cleaned.toLowerCase()]) {
            unknownTokens.push(cleaned);
          }
        }
      }

      // Fetch structured price data from PriceFeedService for all detected tokens
      let priceDataText = '';
      const priceFeedService = runtime.getService<any>('pricefeed');

      if (priceFeedService) {
        const allTokens = [
          ...cryptoMentions.map(name => {
            // Reverse lookup to get the symbol
            const entry = Object.entries(coinMap).find(([, v]) => v === name);
            return entry ? entry[0] : name;
          }),
          ...unknownTokens,
        ];

        // Deduplicate
        const uniqueTokens = [...new Set(allTokens)];

        if (uniqueTokens.length > 0) {
          logger.info({ tokens: uniqueTokens }, 'Fetching price data from CoinGecko/CoinMarketCap');

          const priceResults = [];
          for (const token of uniqueTokens.slice(0, 5)) { // Max 5 tokens per query
            try {
              const price = await priceFeedService.getPrice(token);
              if (price) {
                priceResults.push(priceFeedService.formatPriceData(price));
              }
            } catch (err) {
              logger.debug({ token, err }, 'Price fetch failed for token');
            }
          }

          if (priceResults.length > 0) {
            priceDataText = `\n\n💰 LIVE PRICE DATA (CoinGecko/CoinMarketCap):\n${priceResults.join('\n\n')}`;
          }
        }
      }

      // Build search query
      const allMentions = [...cryptoMentions, ...unknownTokens];
      let searchQuery: string;
      if (allMentions.length > 0) {
        searchQuery = `${allMentions.slice(0, 3).join(' ')} cryptocurrency price analysis today ${new Date().toISOString().split('T')[0]}`;
      } else if (text.includes('market')) {
        searchQuery = `cryptocurrency market today ${new Date().toISOString().split('T')[0]}`;
      } else {
        const questionMatch = text.match(/what|how|why|when|where|analyze|tell|explain/);
        if (questionMatch) {
          searchQuery = `${text.slice(0, 100)} cryptocurrency today`;
        } else {
          searchQuery = `cryptocurrency ${text.slice(0, 50)} today ${new Date().toISOString().split('T')[0]}`;
        }
      }

      logger.info(`🔍 Searching: "${searchQuery}"`);

      // Execute search with finance-optimized settings
      let searchResults: any = null;
      try {
        searchResults = await tavilyService.search(searchQuery, {
          topic: 'finance',
          search_depth: 'advanced',
          max_results: 5,
          time_range: 'day',
          include_answer: 'advanced',
          include_domains: [
            'coingecko.com',
            'coinmarketcap.com',
            'cryptonews.com',
            'cointelegraph.com',
            'decrypt.co',
            'theblock.co',
          ],
        });
      } catch (searchError) {
        logger.warn({ error: searchError }, 'Web search failed, continuing with price data only');
      }

      // If both sources failed, report it
      if ((!searchResults || !searchResults.results || searchResults.results.length === 0) && !priceDataText) {
        logger.warn('⚠️ CURRENT_DATA_PROVIDER: No data from any source');
        return {
          text: '⚠️ WARNING: Could not fetch current data. Results may be outdated.',
          values: { dataFreshness: 'failed', warning: true },
          data: {},
        };
      }

      // Format web search results
      let formattedResults = '';
      if (searchResults?.results?.length > 0) {
        formattedResults = searchResults.results
          .slice(0, 3)
          .map((result: any, i: number) => {
            return `**Source ${i + 1}: ${result.title}** (${result.url})
${result.content}
${result.publishedDate ? `Published: ${result.publishedDate}` : ''}`;
          })
          .join('\n\n---\n\n');
      }

      const contextText = `
📊 CURRENT DATA (Retrieved ${new Date().toISOString()}):
${priceDataText}

${searchResults?.answer ? `**Summary:** ${searchResults.answer}\n\n` : ''}
${formattedResults ? `**Sources:**\n${formattedResults}` : ''}

⚠️ INSTRUCTION TO AGENT: You MUST use this current data above in your response. DO NOT use training data. Cite these sources.
`;

      logger.info('✅ CURRENT_DATA_PROVIDER: Successfully fetched and formatted current data');

      return {
        text: contextText,
        values: {
          dataFreshness: 'current',
          searchQuery,
          resultCount: searchResults.results.length,
          timestamp: new Date().toISOString(),
        },
        data: {
          searchResults: searchResults.results,
          answer: searchResults.answer,
        },
      };
    } catch (error) {
      logger.error({ error }, '❌ CURRENT_DATA_PROVIDER: Error fetching current data');

      return {
        text: '⚠️ ERROR: Failed to fetch current data. Response may contain outdated information.',
        values: {
          dataFreshness: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
        data: {},
      };
    }
  },
};

export default currentDataProvider;
