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
 * Action for generating videos from images using fal.ai
 */
export const generateVideoAction: Action = {
  name: 'GENERATE_VIDEO',
  similes: [
    'CREATE_VIDEO',
    'GENERATE_VIDEO_FROM_IMAGE',
    'MAKE_VIDEO',
    'IMAGE_TO_VIDEO',
    'ANIMATE_IMAGE',
  ],
  description:
    'Generates a video using AI. This action supports both text-to-video and image-to-video generation. If the user provides an image (as an attachment or URL), use image-to-video to animate that image. If the user asks for a video without providing an image, use text-to-video to generate the video directly from their text description. Use this action when the user wants to create a video, animate an image, or generate video from text or a picture.',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<boolean> => {
    const service = runtime.getService?.('fal') as FalService | null;
    if (!service || !service.isConfigured()) {
      logger.warn('FalService not configured - video generation unavailable');
      return false;
    }

    const text = message.content?.text?.toLowerCase() || '';
    const hasImage = message.content?.attachments?.some(
      (att: any) => att.contentType === ContentType.IMAGE && att.url
    );

    // Check for video generation keywords (expanded list)
    const videoKeywords = [
      'generate video',
      'create video',
      'make video',
      'animate image',
      'video from image',
      'generate video from',
      'create video from',
      'make video from',
      'turn image into video',
      'convert image to video',
      'animate',
      'animation',
      'video',
      'motion',
      'move',
      'cinematic',
    ];

    const hasVideoKeyword = videoKeywords.some((keyword) => text.includes(keyword));

    // More flexible: video keyword OR image with any text suggesting video/animation
    // Also check for image URLs in text
    const hasImageUrl = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/i.test(text);
    
    // Allow validation if there's a video keyword - we'll search for images in previous responses in the handler
    // This allows users to say "generate a video" after generating an image
    return hasVideoKeyword || (hasImage && (text.includes('video') || text.includes('animate') || text.includes('motion'))) || (hasImageUrl && hasVideoKeyword);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService?.('fal') as FalService | null;
      if (!service) {
        throw new Error('FalService not available');
      }

      if (!service.isConfigured()) {
        logger.error('FAL API key not configured for video generation');
        return {
          success: false,
          error: new Error(
            'Video generation is not available. FAL API key not configured. Please set FAL_KEY or FAL_API_KEY environment variable in your .env file.'
          ),
        };
      }

      // Extract image URL from attachments or message
      let imageUrl: string | undefined;
      
      // Debug: Log message structure to understand attachment format
      logger.debug({ 
        hasContent: !!message.content,
        hasAttachments: !!message.content?.attachments,
        attachmentsCount: message.content?.attachments?.length || 0,
        attachments: message.content?.attachments,
        messageKeys: Object.keys(message),
        rawMessage: (message as any).raw_message
      }, 'Checking for image in message');
      
      // First, try to get image from current message attachments
      if (message.content?.attachments && message.content.attachments.length > 0) {
        logger.debug({ attachments: message.content.attachments }, 'Found attachments in message.content');
        const imageAttachment = message.content.attachments.find(
          (att: any) => att.contentType === ContentType.IMAGE && att.url
        );
        if (imageAttachment?.url) {
          imageUrl = imageAttachment.url;
          logger.info({ imageUrl }, 'Found image in current message attachments');
        } else {
          // Try to find any attachment with a URL (might be mislabeled)
          const anyAttachmentWithUrl = message.content.attachments.find((att: any) => att.url);
          if (anyAttachmentWithUrl?.url) {
            // Check if URL looks like an image
            if (/\.(jpg|jpeg|png|gif|webp|webm)/i.test(anyAttachmentWithUrl.url)) {
              imageUrl = anyAttachmentWithUrl.url;
              logger.info({ imageUrl }, 'Found image URL in attachment (contentType may be missing)');
            }
          }
        }
      }
      
      // Also check raw_message if it exists (some platforms store attachments there)
      if (!imageUrl && (message as any).raw_message?.attachments) {
        logger.debug({ rawAttachments: (message as any).raw_message.attachments }, 'Checking raw_message attachments');
        const rawAttachments = (message as any).raw_message.attachments;
        const imageAttachment = Array.isArray(rawAttachments) 
          ? rawAttachments.find((att: any) => 
              att.contentType === ContentType.IMAGE || 
              att.type === 'image' ||
              /\.(jpg|jpeg|png|gif|webp|webm)/i.test(att.url || att.url || '')
            )
          : null;
        if (imageAttachment?.url) {
          imageUrl = imageAttachment.url;
          logger.info({ imageUrl }, 'Found image in raw_message attachments');
        }
      }

      // If no attachment, try to extract URL from current message text
      if (!imageUrl) {
        const text = message.content?.text || '';
        const urlMatch = text.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|webm)/i);
        if (urlMatch) {
          imageUrl = urlMatch[0];
        }
      }

      // If still no image, search through previous responses for images
      // This handles cases where user asks to generate video from a previously generated image
      if (!imageUrl && responses && responses.length > 0) {
        // Search in reverse order (most recent first)
        for (let i = responses.length - 1; i >= 0; i--) {
          const response = responses[i];

          // Check attachments in previous responses
          if (response.content?.attachments) {
            const imageAttachment = response.content.attachments.find(
              (att: any) => att.contentType === ContentType.IMAGE && att.url
            );
            if (imageAttachment?.url) {
              imageUrl = imageAttachment.url;
              logger.info({ imageUrl }, 'Found image from previous response attachments');
              break;
            }
          }
          
          // Check for image URLs in previous response text
          if (!imageUrl && response.content?.text) {
            const urlMatch = response.content.text.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|webm)/i);
            if (urlMatch) {
              imageUrl = urlMatch[0];
              logger.info({ imageUrl }, 'Found image URL in previous response text');
              break;
            }
          }
          
          // Check action results in previous responses (from GENERATE_IMAGE actions)
          if (!imageUrl && response.content?.data?.image_url) {
            imageUrl = response.content.data.image_url;
            logger.info({ imageUrl }, 'Found image from previous action result');
            break;
          }
        }
      }

      // Also check state for recently generated images
      if (!imageUrl && _state) {
        // Check if there's an image_url in the state from a previous GENERATE_IMAGE action
        const stateImageUrl = _state.image_url || _state.lastImageUrl;
        if (stateImageUrl) {
          imageUrl = stateImageUrl;
          logger.info({ imageUrl }, 'Found image from state');
        }
      }

      // Extract prompt from message
      const text = message.content?.text || '';
      
      // Remove command keywords to get the prompt
      let prompt = text
        .replace(/generate\s+video\s+of\s+/i, '')
        .replace(/create\s+video\s+of\s+/i, '')
        .replace(/make\s+video\s+of\s+/i, '')
        .replace(/generate\s+a\s+video\s+of\s+/i, '')
        .replace(/create\s+a\s+video\s+of\s+/i, '')
        .replace(/make\s+a\s+video\s+of\s+/i, '')
        .replace(/generate\s+video\s+from\s+/i, '')
        .replace(/create\s+video\s+from\s+/i, '')
        .replace(/make\s+video\s+from\s+/i, '')
        .replace(/animate\s+image\s+with\s+/i, '')
        .replace(/turn\s+image\s+into\s+video\s+with\s+/i, '')
        .replace(/convert\s+image\s+to\s+video\s+with\s+/i, '')
        .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
        .trim();

      // If no specific prompt, try to extract meaningful content
      if (!prompt || prompt.length < 3) {
        const words = text.toLowerCase().split(/\s+/);
        const videoKeywords = ['video', 'animate', 'animation', 'motion', 'generate', 'create', 'make', 'from', 'of', 'a', 'the'];
        const filteredWords = words.filter((w: string) => !videoKeywords.includes(w) && w.length > 2);
        prompt = filteredWords.join(' ') || text.trim() || 'a cinematic scene';
      }

      // If image is provided, use image-to-video. Otherwise, use text-to-video directly
      if (imageUrl) {
        // Convert local file paths to publicly accessible URLs
        // fal.ai needs URLs that are accessible from the internet
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          // It's a local path, need to convert to public URL
          const serverUrl = runtime.getSetting?.('SERVER_URL') || 
                           runtime.getSetting?.('API_URL') || 
                           runtime.getSetting?.('BASE_URL') ||
                           process.env.SERVER_URL ||
                           process.env.API_URL ||
                           process.env.BASE_URL ||
                           'http://localhost:3000';
          
          // Remove trailing slash from server URL if present
          const baseUrl = serverUrl.replace(/\/$/, '');
          
          // Ensure the path starts with /
          const path = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
          
          imageUrl = `${baseUrl}${path}`;
          logger.info({ originalPath: path, publicUrl: imageUrl }, 'Converted local file path to public URL');
          
          // Warn if using localhost - fal.ai won't be able to access it
          if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
            logger.warn('Using localhost URL - fal.ai may not be able to access this file. The server must be publicly accessible or use a public URL.');
          }
        }

        // If no specific prompt for image-to-video, use a default
        if (!prompt || prompt.length < 3) {
          prompt = 'A smooth, cinematic animation with subtle motion';
        }

        logger.info({ imageUrl, prompt }, 'Generating video from image using fal.ai');
        // Generate video from image
        var result = await service.generateVideo(prompt, imageUrl);
      } else {
        // No image provided - use text-to-video directly
        logger.info({ prompt }, 'Generating video directly from text using fal.ai');
        // Generate video from text
        var result = await service.generateVideo(prompt);
      }

      const videoUrl = result.video_url;

      if (!videoUrl) {
        throw new Error('No video URL returned from fal.ai');
      }

      // Create appropriate response text based on whether image was used
      const responseText = imageUrl 
        ? `I've generated a video from your image: ${videoUrl}`
        : `I've generated a video from your description: ${videoUrl}`;

      if (callback) {
        await callback({
          text: responseText,
          actions: ['GENERATE_VIDEO'],
          source: message.content.source,
          attachments: [
            {
              id: `video-${Date.now()}`,
              url: videoUrl,
              contentType: ContentType.VIDEO,
            },
          ],
        });
      }

      return {
        text: responseText,
        success: true,
        data: {
          video_url: videoUrl,
          image_url: imageUrl || undefined,
          prompt,
          actions: ['GENERATE_VIDEO'],
          source: message.content.source,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in generateVideo action');
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
          text: 'generate video from this image',
          actions: [],
          attachments: [
            {
              id: 'example-image-1',
              url: 'https://example.com/image.jpg',
              contentType: ContentType.IMAGE,
            },
          ],
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: "I've generated a video from your image: https://fal.media/files/...",
          actions: ['GENERATE_VIDEO'],
        },
      },
    ],
    [
      {
        name: '{{userName}}',
        content: {
          text: 'animate this image with a gentle breeze effect',
          actions: [],
          attachments: [
            {
              id: 'example-image-2',
              url: 'https://example.com/image.jpg',
              contentType: ContentType.IMAGE,
            },
          ],
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: "I've generated a video from your image: https://fal.media/files/...",
          actions: ['GENERATE_VIDEO'],
        },
      },
    ],
    [
      {
        name: '{{userName}}',
        content: {
          text: 'create video from https://example.com/image.jpg with cinematic motion',
          actions: [],
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: "I've generated a video from your image: https://fal.media/files/...",
          actions: ['GENERATE_VIDEO'],
        },
      },
    ],
  ],
};

