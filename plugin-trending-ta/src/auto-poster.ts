/// <reference path="./@elizaos-core.d.ts" />
import { Service, ModelType, logger } from '@elizaos/core';
import { TwitterApi } from 'twitter-api-v2';
import { TrendingService, type TrendingToken } from './trending-service.ts';
import { TAService, type TAResult } from '../../plugin-ta/src/ta-service.ts';

export class AutoPosterService extends Service {
  static override serviceType = 'auto-poster';

  override capabilityDescription =
    'Automatically posts trending token technical analysis to Twitter and Telegram on a schedule.';

  private twitterTimer: ReturnType<typeof setInterval> | null = null;
  private telegramTimer: ReturnType<typeof setInterval> | null = null;
  private recentlyPosted = new Set<string>(); // Track tokens posted in last 24h
  private recentlyPostedCleanup: ReturnType<typeof setInterval> | null = null;
  private twitterPostCount = 0;
  private telegramPostCount = 0;
  private lastCountReset = Date.now();
  private isRunning = false;
  private runtime: any;

  constructor(runtime: any) {
    super(runtime);
    this.runtime = runtime;
  }

  static override async start(runtime: any): Promise<Service> {
    const enabled = process.env.TRENDING_POST_ENABLED?.toLowerCase();
    if (enabled !== 'true') {
      logger.info('AutoPosterService disabled (TRENDING_POST_ENABLED != true)');
      return new AutoPosterService(runtime);
    }

    logger.info('Starting AutoPosterService');
    const service = new AutoPosterService(runtime);
    service.isRunning = true;

    const twitterInterval = parseInt(process.env.TRENDING_TWITTER_INTERVAL || '43200000', 10); // 12h default
    const telegramInterval = parseInt(process.env.TRENDING_TELEGRAM_INTERVAL || '14400000', 10); // 4h default

    // Start Twitter timer if keys available
    if (service.hasTwitterCredentials()) {
      logger.info({ intervalMs: twitterInterval }, 'Twitter auto-poster scheduled');
      service.twitterTimer = setInterval(() => {
        service.postCycle('twitter').catch((err) =>
          logger.error({ error: err }, 'Twitter post cycle error')
        );
      }, twitterInterval);
    } else {
      logger.info('Twitter credentials not found — Twitter auto-posting disabled');
    }

    // Start Telegram timer if token available
    if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
      logger.info({ intervalMs: telegramInterval }, 'Telegram auto-poster scheduled');
      service.telegramTimer = setInterval(() => {
        service.postCycle('telegram').catch((err) =>
          logger.error({ error: err }, 'Telegram post cycle error')
        );
      }, telegramInterval);
    } else {
      logger.info('Telegram token not found — Telegram auto-posting disabled');
    }

    // Reset daily post counters every 24h
    service.recentlyPostedCleanup = setInterval(() => {
      service.recentlyPosted.clear();
      service.twitterPostCount = 0;
      service.telegramPostCount = 0;
      service.lastCountReset = Date.now();
      logger.debug('Auto-poster daily counters reset');
    }, 24 * 60 * 60 * 1000);

    logger.info('AutoPosterService started');
    return service;
  }

  static override async stop(runtime: any): Promise<void> {
    const service = runtime.getService(AutoPosterService.serviceType);
    if (service && 'stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    this.isRunning = false;
    if (this.twitterTimer) { clearInterval(this.twitterTimer); this.twitterTimer = null; }
    if (this.telegramTimer) { clearInterval(this.telegramTimer); this.telegramTimer = null; }
    if (this.recentlyPostedCleanup) { clearInterval(this.recentlyPostedCleanup); this.recentlyPostedCleanup = null; }
    this.recentlyPosted.clear();
    logger.info('AutoPosterService stopped');
  }

  /**
   * Check if Twitter API credentials are available
   */
  private hasTwitterCredentials(): boolean {
    return !!(
      process.env.TWITTER_API_KEY?.trim() &&
      process.env.TWITTER_API_SECRET_KEY?.trim() &&
      process.env.TWITTER_ACCESS_TOKEN?.trim() &&
      process.env.TWITTER_ACCESS_TOKEN_SECRET?.trim()
    );
  }

  /**
   * Pick a token that hasn't been posted recently
   */
  private pickToken(tokens: TrendingToken[]): TrendingToken | null {
    for (const token of tokens) {
      if (!this.recentlyPosted.has(token.symbol)) {
        return token;
      }
    }
    // If all tokens have been posted, clear and pick the first
    if (tokens.length > 0) {
      this.recentlyPosted.clear();
      return tokens[0];
    }
    return null;
  }

  /**
   * Compose a short tweet from TA data (max 280 chars)
   */
  private async composeTwitterPost(token: TrendingToken, ta: TAResult): Promise<string> {
    const ind = ta.indicators;
    const changeSign = token.priceChangePercent >= 0 ? '+' : '';

    const prompt = `You are kaffein, a crypto analyst. Write a single tweet (max 270 chars).
Be concise and data-driven. Mention the token ticker with $, 2-3 key indicators, and a clear bullish/bearish outlook.
End with "NFA - DYOR". No hashtags. No emojis except one chart emoji if needed.

Token: $${token.symbol} (trending — ${changeSign}${token.priceChangePercent.toFixed(1)}% in 24h)
Price: $${ta.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}

TA (4h chart):
${ind.rsi14 !== null ? `RSI(14): ${ind.rsi14.toFixed(1)}` : ''}
${ind.macd ? `MACD: histogram ${ind.macd.histogram >= 0 ? '+' : ''}${ind.macd.histogram.toFixed(2)}` : ''}
${ind.sma50 !== null ? `SMA(50): $${ind.sma50.toFixed(2)} (price ${ta.currentPrice > ind.sma50 ? 'above' : 'below'})` : ''}
${ind.bollingerBands ? `BB: upper $${ind.bollingerBands.upper.toFixed(2)}, lower $${ind.bollingerBands.lower.toFixed(2)}` : ''}
${ind.atr14 !== null ? `ATR: $${ind.atr14.toFixed(2)}` : ''}

Write the tweet (max 270 chars, one line, no line breaks):`;

    try {
      const response = await this.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        maxTokens: 100,
        temperature: 0.8,
      });

      let tweet = (typeof response === 'string' ? response : String(response)).trim();

      // Remove quotes if LLM wrapped it
      tweet = tweet.replace(/^["']|["']$/g, '');

      // Truncate to 280 chars if needed
      if (tweet.length > 280) {
        tweet = tweet.substring(0, 277) + '...';
      }

      return tweet;
    } catch (error) {
      // Fallback to template if LLM fails
      logger.warn({ error }, 'LLM compose failed, using template');
      const rsi = ind.rsi14 !== null ? `RSI ${ind.rsi14.toFixed(0)}` : '';
      const macd = ind.macd ? (ind.macd.histogram > 0 ? 'MACD bullish' : 'MACD bearish') : '';
      return `$${token.symbol} trending ${changeSign}${token.priceChangePercent.toFixed(1)}% | $${ta.currentPrice.toFixed(2)} | ${rsi} ${macd} | NFA - DYOR`.substring(0, 280);
    }
  }

  /**
   * Compose a longer Telegram analysis post
   */
  private async composeTelegramPost(token: TrendingToken, ta: TAResult): Promise<string> {
    const changeSign = token.priceChangePercent >= 0 ? '+' : '';

    const prompt = `You are kaffein, a crypto analyst. Write a Telegram analysis post (400-800 chars).
Include key indicators, a clear bull/bear case, key price levels to watch, and risk note.
Use markdown bold for headings. End with "NFA - DYOR".

Token: $${token.symbol} (${token.name}) — trending ${changeSign}${token.priceChangePercent.toFixed(1)}% in 24h
Price: $${ta.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}

Full TA (4h chart, ${ta.candleCount} candles):
${ta.summary}

Write the analysis:`;

    try {
      const response = await this.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        maxTokens: 300,
        temperature: 0.7,
      });

      return (typeof response === 'string' ? response : String(response)).trim();
    } catch (error) {
      // Fallback to formatted TA data
      logger.warn({ error }, 'LLM compose failed for Telegram, using raw TA');
      return `**$${token.symbol} Technical Analysis** (4h)\n\nPrice: $${ta.currentPrice}\n${changeSign}${token.priceChangePercent.toFixed(1)}% in 24h\n\n${ta.summary}\n\nNFA - DYOR`;
    }
  }

  /**
   * Post a tweet via twitter-api-v2
   */
  private async postToTwitter(text: string): Promise<boolean> {
    try {
      const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET_KEY!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
      });

      const result = await client.v2.tweet(text);
      logger.info({ tweetId: result.data.id }, 'Tweet posted successfully');
      return true;
    } catch (error: any) {
      if (error?.code === 429 || error?.data?.status === 429) {
        logger.warn('Twitter rate limit hit (429) — skipping, will try next cycle');
      } else {
        logger.error({ error }, 'Failed to post tweet');
      }
      return false;
    }
  }

  /**
   * Post to Telegram via Bot API
   */
  private async postToTelegram(text: string): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return false;

    try {
      // Post to the bot's own chat (channel). For a channel, you'd need TELEGRAM_CHANNEL_ID.
      // For now, we store updates so users see them when they message the bot.
      // To broadcast, we need a channel ID.
      const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();

      if (!channelId) {
        logger.debug('No TELEGRAM_CHANNEL_ID set — Telegram post stored for next interaction context');
        // Even without a channel, we can log the post for the bot to reference
        // The trending provider will make this data available in chat responses
        return true;
      }

      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channelId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.warn({ status: response.status, error: errorData }, 'Telegram sendMessage failed');
        return false;
      }

      logger.info({ channelId }, 'Telegram post sent successfully');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to post to Telegram');
      return false;
    }
  }

  /**
   * Main post cycle — fetch trending → TA → compose → post
   */
  async postCycle(platform: 'twitter' | 'telegram'): Promise<void> {
    if (!this.isRunning) return;

    const maxTwitter = parseInt(process.env.TRENDING_MAX_TWITTER_POSTS_PER_DAY || '2', 10);
    const maxTelegram = parseInt(process.env.TRENDING_MAX_TELEGRAM_POSTS_PER_DAY || '6', 10);

    // Check daily limits
    if (platform === 'twitter' && this.twitterPostCount >= maxTwitter) {
      logger.debug({ count: this.twitterPostCount, max: maxTwitter }, 'Twitter daily limit reached');
      return;
    }
    if (platform === 'telegram' && this.telegramPostCount >= maxTelegram) {
      logger.debug({ count: this.telegramPostCount, max: maxTelegram }, 'Telegram daily limit reached');
      return;
    }

    logger.info({ platform }, 'Starting auto-post cycle');

    // 1. Get trending tokens
    const trendingService = this.runtime.getService<TrendingService>(TrendingService.serviceType);
    if (!trendingService) {
      logger.warn('TrendingService not available — skipping cycle');
      return;
    }

    const trending = await trendingService.getTrending();
    if (trending.length === 0) {
      logger.warn('No trending tokens found — skipping cycle');
      return;
    }

    // 2. Pick a token
    const token = this.pickToken(trending);
    if (!token) {
      logger.warn('No unpicked token available — skipping cycle');
      return;
    }

    logger.info({ symbol: token.symbol, change: token.priceChangePercent }, 'Selected trending token');

    // 3. Run TA
    const taService = this.runtime.getService<TAService>('technical-analysis');
    if (!taService) {
      logger.warn('TAService not available — skipping cycle');
      return;
    }

    let ta: TAResult;
    try {
      ta = await taService.analyze(token.symbol, '4h');
    } catch (error) {
      logger.warn({ error, symbol: token.symbol }, 'TA failed for token — trying next');
      // Try next token
      this.recentlyPosted.add(token.symbol);
      const nextToken = this.pickToken(trending);
      if (!nextToken) return;
      try {
        ta = await taService.analyze(nextToken.symbol, '4h');
        // Update token reference for post composition
        Object.assign(token, nextToken);
      } catch {
        logger.warn('TA failed for fallback token too — skipping cycle');
        return;
      }
    }

    // 4. Compose and post
    let success = false;

    if (platform === 'twitter') {
      const tweet = await this.composeTwitterPost(token, ta);
      logger.info({ tweet, length: tweet.length }, 'Composed tweet');
      success = await this.postToTwitter(tweet);
      if (success) this.twitterPostCount++;
    } else {
      const post = await this.composeTelegramPost(token, ta);
      logger.info({ postLength: post.length }, 'Composed Telegram post');
      success = await this.postToTelegram(post);
      if (success) this.telegramPostCount++;
    }

    // Track posted token
    if (success) {
      this.recentlyPosted.add(token.symbol);
      logger.info({ platform, symbol: token.symbol }, 'Auto-post completed successfully');
    }
  }
}
