// @ts-expect-error - Type definitions may be incomplete but runtime exports work
import { logger } from '@elizaos/core';
// @ts-expect-error - Type definitions may be incomplete but runtime exports work
import type { IAgentRuntime, Project, ProjectAgent } from '@elizaos/core';
import starterPlugin from './plugin.ts';
import { character } from './character.ts';
import falaiPlugin from '../plugin-falai/src/plugin.ts';
import traderPlugin from '../plugin-trader/src/plugin.ts';

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing character');
  logger.info({ name: character.name }, 'Name:');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => {
    initCharacter({ runtime });
  },
  plugins: [starterPlugin, falaiPlugin, traderPlugin],
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './character.ts';

export default project;
