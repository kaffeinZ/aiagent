/// <reference path="./@elizaos-core.d.ts" />
import { logger } from '@elizaos/core';
import type { IAgentRuntime, Project, ProjectAgent } from '@elizaos/core';
import starterPlugin from './plugin.ts';
import { character } from './character.ts';
import falaiPlugin from '../plugin-falai/src/plugin.ts';
import traderPlugin from '../plugin-trader/src/plugin.ts';
import priceFeedPlugin from '../plugin-pricefeed/src/plugin.ts';

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing character');
  logger.info({ name: character.name }, 'Name:');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => {
    initCharacter({ runtime });
  },
  plugins: [starterPlugin, falaiPlugin, traderPlugin, priceFeedPlugin],
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './character.ts';

export default project;
