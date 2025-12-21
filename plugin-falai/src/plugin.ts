import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import { FalService } from './services';
import { generateImageAction, generateVideoAction } from './actions';

/**
 * Defines the configuration schema for the fal.ai plugin
 */
const configSchema = z.object({
  FAL_KEY: z
    .string()
    .min(1, 'FAL_KEY is required for fal.ai API access')
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn(
          'FAL_KEY not provided. The plugin will work but image/video generation will fail without an API key.'
        );
      }
      return val;
    }),
  FAL_API_KEY: z
    .string()
    .min(1, 'FAL_API_KEY is required for fal.ai API access')
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn(
          'FAL_API_KEY not provided. The plugin will work but image/video generation will fail without an API key.'
        );
      }
      return val;
    }),
});

/**
 * Fal.ai Plugin for ElizaOS
 * 
 * This plugin enables AI-powered image and video generation using fal.ai's API.
 * 
 * Features:
 * - Text-to-image generation using various models (FLUX, Stable Diffusion, etc.)
 * - Image-to-video generation for animating static images
 * 
 * Configuration:
 * - Set FAL_KEY or FAL_API_KEY environment variable with your fal.ai API key
 * - Get your API key from https://fal.ai/dashboard
 */
export const falPlugin: Plugin = {
  name: 'plugin-falai',
  description:
    'Plugin for generating images and videos using fal.ai API. Supports text-to-image and image-to-video generation.',
  config: {
    FAL_KEY: process.env.FAL_KEY,
    FAL_API_KEY: process.env.FAL_API_KEY,
  },
  async init(config: Record<string, string>) {
    logger.debug('Initializing fal.ai plugin');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }

      logger.info('Fal.ai plugin initialized successfully');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages =
          error.issues?.map((e) => e.message)?.join(', ') || 'Unknown validation error';
        throw new Error(`Invalid plugin configuration: ${errorMessages}`);
      }
      throw new Error(
        `Invalid plugin configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  services: [FalService],
  actions: [generateImageAction, generateVideoAction],
};

export default falPlugin;
