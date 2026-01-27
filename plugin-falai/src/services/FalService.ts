/// <reference path="../@elizaos-core.d.ts" />
import { Service, logger } from '@elizaos/core';
import type { IAgentRuntime } from '@elizaos/core';
import { fal } from '@fal-ai/client';

/**
 * FalService handles all interactions with the fal.ai API
 * for generating images and videos
 */
export class FalService extends Service {
  static serviceType = 'fal';
  capabilityDescription =
    'Service for generating images and videos using fal.ai API. Supports text-to-image and image-to-video generation.';

  private apiKey: string | null = null;

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<FalService> {
    logger.info('Starting FalService');
    const service = new FalService(runtime);
    
    // Get API key from multiple sources (in order of priority)
    // 1. Runtime settings
    const runtimeKey = runtime.getSetting?.('FAL_KEY') || runtime.getSetting?.('FAL_API_KEY');
    // 2. Environment variables
    const envKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    // 3. Use whichever is available
    const apiKey = runtimeKey || envKey;
    
    if (!apiKey) {
      logger.warn('FAL_KEY or FAL_API_KEY not found in environment variables or runtime settings');
      logger.warn('Please set FAL_KEY or FAL_API_KEY in your .env file');
      logger.debug(`Checked: FAL_KEY=${!!process.env.FAL_KEY}, FAL_API_KEY=${!!process.env.FAL_API_KEY}`);
    } else {
      service.apiKey = apiKey;
      fal.config({
        credentials: apiKey,
      });
      const keySource = runtimeKey ? 'runtime settings' : (process.env.FAL_KEY ? 'FAL_KEY env var' : 'FAL_API_KEY env var');
      logger.info(`FalService initialized with API key (source: ${keySource})`);
    }

    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping FalService');
    const service = runtime.getService<FalService>(FalService.serviceType);
    if (!service) {
      logger.warn('FalService not found');
      return;
    }
    service.stop();
  }

  async stop(): Promise<void> {
    logger.info('Stopping FalService');
  }

  /**
   * Generate an image from text prompt
   * @param prompt - Text description of the image to generate
   * @param model - Model ID to use (default: 'fal-ai/flux/dev')
   * @param options - Additional options for image generation
   */
  async generateImage(
    prompt: string,
    model: string = 'fal-ai/flux/dev',
    options?: {
      seed?: number;
      image_size?: string;
      num_images?: number;
      [key: string]: any;
    }
  ): Promise<{ image_url: string; [key: string]: any }> {
    if (!this.apiKey) {
      throw new Error('FAL API key not configured. Please set FAL_KEY or FAL_API_KEY environment variable.');
    }

    try {
      logger.debug({ prompt, model, options }, 'Generating image with fal.ai');

      const input: Record<string, any> = {
        prompt,
        ...options,
      };

      const result = await fal.subscribe(model, {
        input,
      });

      logger.debug({ result }, 'Image generation result');

      // Handle different response formats
      if (result.data?.images && Array.isArray(result.data.images)) {
        return {
          image_url: result.data.images[0].url,
          images: result.data.images,
          ...result.data,
        };
      } else if (result.data?.image?.url) {
        return {
          image_url: result.data.image.url,
          ...result.data,
        };
      } else if (result.data?.image_url) {
        return result.data;
      } else {
        // Fallback: try to find any URL in the response
        const responseStr = JSON.stringify(result.data);
        const urlMatch = responseStr.match(/https?:\/\/[^\s"']+/);
        if (urlMatch) {
          return {
            image_url: urlMatch[0],
            ...result.data,
          };
        }
        throw new Error('Unexpected response format from fal.ai');
      }
    } catch (error) {
      logger.error({ error, prompt, model }, 'Error generating image');
      throw error;
    }
  }

  /**
   * Generate a video from text prompt (text-to-video)
   * @param prompt - Text description for video generation
   * @param model - Model ID to use (default: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video')
   * @param options - Additional options for video generation
   */
  async generateVideoFromText(
    prompt: string,
    model: string = 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    options?: {
      [key: string]: any;
    }
  ): Promise<{ video_url: string; [key: string]: any }> {
    if (!this.apiKey) {
      throw new Error('FAL API key not configured. Please set FAL_KEY or FAL_API_KEY environment variable.');
    }

    try {
      logger.debug({ prompt, model, options }, 'Generating video from text with fal.ai');

      const input: Record<string, any> = {
        prompt,
        ...options,
      };

      const result = await fal.subscribe(model, {
        input,
      });

      logger.debug({ result }, 'Text-to-video generation result');

      // Handle different response formats
      if (result.data?.video?.url) {
        return {
          video_url: result.data.video.url,
          ...result.data,
        };
      } else if (result.data?.video_url) {
        return result.data;
      } else {
        // Fallback: try to find any URL in the response
        const responseStr = JSON.stringify(result.data);
        const urlMatch = responseStr.match(/https?:\/\/[^\s"']+\.(mp4|webm|mov)/i);
        if (urlMatch) {
          return {
            video_url: urlMatch[0],
            ...result.data,
          };
        }
        throw new Error('Unexpected response format from fal.ai');
      }
    } catch (error) {
      logger.error({ error, prompt, model }, 'Error generating video from text');
      throw error;
    }
  }

  /**
   * Generate a video from an image (image-to-video)
   * @param imageUrl - URL of the source image
   * @param prompt - Text description for video generation
   * @param model - Model ID to use (default: 'fal-ai/minimax-video/image-to-video')
   * @param options - Additional options for video generation
   */
  async generateVideoFromImage(
    imageUrl: string,
    prompt: string,
    model: string = 'fal-ai/minimax-video/image-to-video',
    options?: {
      [key: string]: any;
    }
  ): Promise<{ video_url: string; [key: string]: any }> {
    if (!this.apiKey) {
      throw new Error('FAL API key not configured. Please set FAL_KEY or FAL_API_KEY environment variable.');
    }

    try {
      logger.debug({ imageUrl, prompt, model, options }, 'Generating video from image with fal.ai');

      const input: Record<string, any> = {
        image_url: imageUrl,
        prompt,
        ...options,
      };

      const result = await fal.subscribe(model, {
        input,
      });

      logger.debug({ result }, 'Image-to-video generation result');

      // Handle different response formats
      if (result.data?.video?.url) {
        return {
          video_url: result.data.video.url,
          ...result.data,
        };
      } else if (result.data?.video_url) {
        return result.data;
      } else {
        // Fallback: try to find any URL in the response
        const responseStr = JSON.stringify(result.data);
        const urlMatch = responseStr.match(/https?:\/\/[^\s"']+\.(mp4|webm|mov)/i);
        if (urlMatch) {
          return {
            video_url: urlMatch[0],
            ...result.data,
          };
        }
        throw new Error('Unexpected response format from fal.ai');
      }
    } catch (error) {
      logger.error({ error, imageUrl, prompt, model }, 'Error generating video from image');
      throw error;
    }
  }

  /**
   * Generate a video - automatically chooses text-to-video or image-to-video based on whether imageUrl is provided
   * @param prompt - Text description for video generation
   * @param imageUrl - Optional URL of the source image. If provided, uses image-to-video, otherwise uses text-to-video
   * @param imageToVideoModel - Model ID for image-to-video (default: 'fal-ai/minimax-video/image-to-video')
   * @param textToVideoModel - Model ID for text-to-video (default: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video')
   * @param options - Additional options for video generation
   */
  async generateVideo(
    prompt: string,
    imageUrl?: string,
    imageToVideoModel: string = 'fal-ai/minimax-video/image-to-video',
    textToVideoModel: string = 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    options?: {
      [key: string]: any;
    }
  ): Promise<{ video_url: string; [key: string]: any }> {
    if (imageUrl) {
      return this.generateVideoFromImage(imageUrl, prompt, imageToVideoModel, options);
    } else {
      return this.generateVideoFromText(prompt, textToVideoModel, options);
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }
}

