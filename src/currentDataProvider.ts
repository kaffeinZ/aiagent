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

      // Extract crypto mentions for targeted search
      const cryptoMentions = [];
      const coinMap = {
        'btc': 'Bitcoin',
        'bitcoin': 'Bitcoin',
        'eth': 'Ethereum',
        'ethereum': 'Ethereum',
        'sol': 'Solana',
        'solana': 'Solana',
        'ada': 'Cardano',
        'bnb': 'BNB',
        'xrp': 'XRP',
        'doge': 'Dogecoin',
      };

      for (const [key, name] of Object.entries(coinMap)) {
        if (text.includes(key)) {
          cryptoMentions.push(name);
        }
      }

      // Build search query
      let searchQuery: string;
      if (cryptoMentions.length > 0) {
        // Specific crypto mentioned
        searchQuery = `${cryptoMentions[0]} cryptocurrency price today ${new Date().toISOString().split('T')[0]}`;
      } else if (text.includes('market')) {
        // General market query
        searchQuery = `cryptocurrency market today ${new Date().toISOString().split('T')[0]}`;
      } else {
        // Extract the user's question for a more targeted search
        const questionMatch = text.match(/what|how|why|when|where|analyze|tell|explain/);
        if (questionMatch) {
          searchQuery = `${text.slice(0, 100)} cryptocurrency today`;
        } else {
          searchQuery = `cryptocurrency ${text.slice(0, 50)} today ${new Date().toISOString().split('T')[0]}`;
        }
      }

      logger.info(`🔍 Searching: "${searchQuery}"`);

      // Execute search with finance-optimized settings
      const searchResults = await tavilyService.search(searchQuery, {
        topic: 'finance',
        search_depth: 'advanced',
        max_results: 5,
        time_range: 'day', // Only today's data
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

      if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
        logger.warn('⚠️ CURRENT_DATA_PROVIDER: No search results found');
        return {
          text: '⚠️ WARNING: Could not fetch current data from web search. Results may be outdated.',
          values: {
            dataFreshness: 'failed',
            warning: true,
          },
          data: {},
        };
      }

      // Format results for context injection
      const formattedResults = searchResults.results
        .slice(0, 3)
        .map((result: any, i: number) => {
          return `**Source ${i + 1}: ${result.title}** (${result.url})
${result.content}
${result.publishedDate ? `Published: ${result.publishedDate}` : ''}`;
        })
        .join('\n\n---\n\n');

      const contextText = `
📊 CURRENT DATA (Retrieved ${new Date().toISOString()}):

${searchResults.answer ? `**Summary:** ${searchResults.answer}\n\n` : ''}

**Sources:**
${formattedResults}

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
