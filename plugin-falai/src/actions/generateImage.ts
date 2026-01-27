/// <reference path="../@elizaos-core.d.ts" />
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger, ContentType } from '@elizaos/core';
import { FalService } from '../services';

/**
 * Action for generating images from text prompts using fal.ai
 */
export const generateImageAction: Action = {
  name: 'GENERATE_IMAGE',
  similes: [
    'CREATE_IMAGE',
    'GENERATE_PICTURE',
    'MAKE_IMAGE',
    'DRAW_IMAGE',
    'IMAGE_GENERATION',
    'TEXT_TO_IMAGE',
  ],
  description:
    'Generates an image from a text prompt using AI. Use this when the user wants to create, generate, or make an image from a description.',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<boolean> => {
    const service = runtime.getService?.('fal') as FalService | null;
    if (!service || !service.isConfigured()) {
      logger.warn('FalService not configured');
      return false;
    }

    const text = message.content?.text?.toLowerCase() || '';
    
    // Check for image generation keywords
    const imageKeywords = [
      'generate image',
      'create image',
      'make image',
      'draw image',
      'image of',
      'picture of',
      'generate a picture',
      'create a picture',
      'make a picture',
      'show me an image',
      'show me a picture',
    ];

    return imageKeywords.some((keyword) => text.includes(keyword));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService?.('fal') as FalService | null;
      if (!service) {
        throw new Error('FalService not available');
      }

      if (!service.isConfigured()) {
        return {
          success: false,
          error: new Error(
            'FAL API key not configured. Please set FAL_KEY or FAL_API_KEY environment variable.'
          ),
        };
      }

      // Extract prompt from message
      const text = message.content?.text || '';
      
      // Remove command keywords to get the actual prompt
      let prompt = text
        .replace(/generate\s+image\s+of\s+/i, '')
        .replace(/create\s+image\s+of\s+/i, '')
        .replace(/make\s+image\s+of\s+/i, '')
        .replace(/draw\s+image\s+of\s+/i, '')
        .replace(/generate\s+an?\s+image\s+of\s+/i, '')
        .replace(/create\s+an?\s+image\s+of\s+/i, '')
        .replace(/make\s+an?\s+image\s+of\s+/i, '')
        .replace(/generate\s+a?\s?picture\s+of\s+/i, '')
        .replace(/create\s+a?\s?picture\s+of\s+/i, '')
        .replace(/make\s+a?\s?picture\s+of\s+/i, '')
        .replace(/show\s+me\s+an?\s+image\s+of\s+/i, '')
        .replace(/show\s+me\s+a?\s?picture\s+of\s+/i, '')
        .replace(/image\s+of\s+/i, '')
        .replace(/picture\s+of\s+/i, '')
        .trim();

      // If prompt is empty, use the full text
      if (!prompt || prompt.length < 3) {
        prompt = text.trim();
      }

      if (!prompt || prompt.length < 3) {
        return {
          success: false,
          error: new Error('Please provide a description of the image you want to generate.'),
        };
      }

      logger.debug({ prompt }, 'Generating image');

      // Generate image
      const result = await service.generateImage(prompt);

      const imageUrl = result.image_url || result.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error('No image URL returned from fal.ai');
      }

      const responseText = `I've generated an image for you: ${imageUrl}`;

      if (callback) {
        await callback({
          text: responseText,
          actions: ['GENERATE_IMAGE'],
          source: message.content.source,
          attachments: [
            {
              id: `image-${Date.now()}`,
              url: imageUrl,
              contentType: ContentType.IMAGE,
            },
          ],
        });
      }

      return {
        text: responseText,
        success: true,
        data: {
          image_url: imageUrl,
          prompt,
          actions: ['GENERATE_IMAGE'],
          source: message.content.source,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in generateImage action');
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{userName}}',
        content: {
          text: 'generate image of a cute puppy playing in a garden',
          actions: [],
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: "I've generated an image for you: https://fal.media/files/...",
          actions: ['GENERATE_IMAGE'],
        },
      },
    ],
    [
      {
        name: '{{userName}}',
        content: {
          text: 'create a picture of a futuristic city at night',
          actions: [],
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: "I've generated an image for you: https://fal.media/files/...",
          actions: ['GENERATE_IMAGE'],
        },
      },
    ],
    [
      {
        name: '{{userName}}',
        content: {
          text: 'show me an image of a sunset over mountains',
          actions: [],
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: "I've generated an image for you: https://fal.media/files/...",
          actions: ['GENERATE_IMAGE'],
        },
      },
    ],
  ],
};

