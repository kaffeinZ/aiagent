/// <reference path="./@elizaos-core.d.ts" />
import type { Plugin, Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State, Content } from '@elizaos/core';
import { logger } from '@elizaos/core';

/**
 * Chart Generation Action for Crypto Analysis
 * Generates chart URLs from CoinGecko and QuickChart APIs
 */
const generateChartAction: Action = {
  name: 'GENERATE_CHART',
  similes: ['CREATE_CHART', 'SHOW_CHART', 'CHART', 'GRAPH', 'VISUALIZE'],
  description: 'Generates price charts for cryptocurrencies using CoinGecko sparklines',

  validate: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<boolean> => {
    // Validate if message mentions chart/graph or price visualization
    const text = message.content.text.toLowerCase();
    return (
      text.includes('chart') ||
      text.includes('graph') ||
      text.includes('visualize') ||
      text.includes('show price') ||
      text.includes('price chart')
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback,
    responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling GENERATE_CHART action');

      const text = message.content.text.toLowerCase();

      // Extract coin mention from message
      let coinId = 'bitcoin'; // default
      let coinName = 'Bitcoin';
      let timeframe = '7d'; // default

      // Map common mentions to CoinGecko IDs
      const coinMap: Record<string, { id: string; name: string }> = {
        'btc': { id: 'bitcoin', name: 'Bitcoin' },
        'bitcoin': { id: 'bitcoin', name: 'Bitcoin' },
        'eth': { id: 'ethereum', name: 'Ethereum' },
        'ethereum': { id: 'ethereum', name: 'Ethereum' },
        'sol': { id: 'solana', name: 'Solana' },
        'solana': { id: 'solana', name: 'Solana' },
        'ada': { id: 'cardano', name: 'Cardano' },
        'cardano': { id: 'cardano', name: 'Cardano' },
        'bnb': { id: 'binancecoin', name: 'BNB' },
        'xrp': { id: 'ripple', name: 'XRP' },
        'doge': { id: 'dogecoin', name: 'Dogecoin' },
        'avax': { id: 'avalanche-2', name: 'Avalanche' },
        'matic': { id: 'matic-network', name: 'Polygon' },
        'link': { id: 'chainlink', name: 'Chainlink' },
        'dot': { id: 'polkadot', name: 'Polkadot' },
      };

      // Detect coin from message
      for (const [key, value] of Object.entries(coinMap)) {
        if (text.includes(key)) {
          coinId = value.id;
          coinName = value.name;
          break;
        }
      }

      // Detect timeframe
      if (text.includes('24h') || text.includes('today') || text.includes('1d')) {
        timeframe = '1d';
      } else if (text.includes('7d') || text.includes('week')) {
        timeframe = '7d';
      } else if (text.includes('30d') || text.includes('month')) {
        timeframe = '30d';
      } else if (text.includes('90d') || text.includes('3m')) {
        timeframe = '90d';
      } else if (text.includes('1y') || text.includes('year')) {
        timeframe = '1y';
      }

      // Generate CoinGecko chart URL
      const chartUrl = `https://www.coingecko.com/coins/${coinId}/sparkline?timeframe=${timeframe}`;

      // Response with chart
      const responseContent: Content = {
        text: `Here's the ${timeframe} price chart for ${coinName}:\n\n${chartUrl}\n\nThis chart shows the price movement over the selected timeframe. Include this URL in your analysis tweets for visual context!`,
        actions: ['GENERATE_CHART'],
        source: message.content.source,
        attachments: [
          {
            url: chartUrl,
            title: `${coinName} ${timeframe} Chart`,
            description: `Price chart for ${coinName} over ${timeframe}`,
            text: `${coinName} ${timeframe} price chart from CoinGecko`,
          },
        ],
      };

      await callback(responseContent);

      return {
        text: `Generated ${timeframe} chart for ${coinName}`,
        values: {
          success: true,
          coinId,
          coinName,
          timeframe,
          chartUrl,
        },
        data: {
          actionName: 'GENERATE_CHART',
          chartUrl,
          coinId,
          timeframe,
        },
        success: true,
      };
    } catch (error) {
      logger.error({ error }, 'Error in GENERATE_CHART action');

      return {
        text: 'Failed to generate chart',
        values: {
          success: false,
        },
        data: {
          actionName: 'GENERATE_CHART',
          error: error instanceof Error ? error.message : String(error),
        },
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
          text: 'Show me a Bitcoin price chart',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "Here's the 7d price chart for Bitcoin:\n\nhttps://www.coingecko.com/coins/bitcoin/sparkline?timeframe=7d",
          actions: ['GENERATE_CHART'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you show me a 30d chart for Solana?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "Here's the 30d price chart for Solana:\n\nhttps://www.coingecko.com/coins/solana/sparkline?timeframe=30d",
          actions: ['GENERATE_CHART'],
        },
      },
    ],
  ],
};

/**
 * Chart Plugin
 * Provides chart generation capabilities for crypto analysis
 */
export const chartPlugin: Plugin = {
  name: 'chart-generator',
  description: 'Generates price charts for cryptocurrency analysis',
  actions: [generateChartAction],
};

export default chartPlugin;
