/// <reference path="./@elizaos-core.d.ts" />
import type { Plugin } from '@elizaos/core';
import { currentDataProvider } from './currentDataProvider';

/**
 * Current Data Plugin
 *
 * This plugin ensures the agent ALWAYS has current data for crypto queries.
 * It runs a provider that automatically fetches web search results BEFORE
 * the agent generates responses.
 *
 * This solves the critical issue where the agent was providing month-old data
 * even when users expected current analysis by default.
 */
export const currentDataPlugin: Plugin = {
  name: 'current-data-enforcement',
  description: 'Automatically fetches current crypto data for all analysis queries',
  providers: [currentDataProvider],

  // Set high priority so this runs early
  priority: 1000,
};

export default currentDataPlugin;
