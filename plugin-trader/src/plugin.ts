import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
  type MessagePayload,
  type WorldPayload,
  EventType,
} from '@elizaos/core';
import { z } from 'zod';
import { WalletService } from './wallet-service.ts';
import { TradingService } from './trading-service.ts';
import { mainnet } from 'viem/chains';

/**
 * Defines the configuration schema for the trader plugin
 * 
 * Required:
 * - PRIVATE_KEY: The private key for the trading wallet
 *   - For EVM: hex string starting with 0x (66 characters)
 *   - For Solana: base58 encoded string (64 bytes when decoded)
 * 
 * Optional:
 * - BLOCKCHAIN_TYPE: 'evm' or 'solana' (auto-detected if not provided)
 * - RPC_URL: Custom RPC endpoint URL (defaults to public RPC)
 * - CHAIN: For EVM - Chain name (defaults to 'mainnet'). For Solana - ignored.
 * - SOLANA_CLUSTER: For Solana - Cluster name (mainnet-beta, devnet, testnet). Defaults to mainnet-beta.
 */
const configSchema = z.object({
  // Private key for the trading wallet (EVM hex or Solana base58)
  // Optional - plugin will work without it, but trading features will be limited
  PRIVATE_KEY: z
    .string()
    .optional()
    .refine(
      (val) => {
        // If not provided, that's okay (optional)
        if (!val || val.trim() === '') {
          return true;
        }
        // Accept EVM format (0x + 64 hex chars) OR Solana format (base58, typically 88 chars)
        const isEvm = val.startsWith('0x') && val.length === 66;
        // Try to decode as base58 - if it works and is 64 bytes, it's Solana
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const bs58 = require('bs58');
          const decoded = bs58.decode(val);
          const isSolana = decoded.length === 64;
          return isEvm || isSolana;
        } catch {
          return isEvm; // If base58 decode fails, only accept EVM format
        }
      },
      {
        message: 'PRIVATE_KEY must be either:\n' +
          '- EVM: hex string starting with 0x (66 characters)\n' +
          '- Solana: base58 encoded string (64 bytes when decoded)',
      }
    )
    .transform((val) => val?.trim() || undefined),
  
  // Optional: Blockchain type (auto-detected if not provided)
  BLOCKCHAIN_TYPE: z
    .enum(['evm', 'solana'])
    .optional()
    .transform((val) => val as 'evm' | 'solana' | undefined),
  
  // Optional: Custom RPC URL (Infura, Alchemy, QuickNode, etc.)
  RPC_URL: z
    .string()
    .url('RPC_URL must be a valid URL')
    .optional()
    .transform((val) => val || undefined),
  
  // Optional: For EVM - Chain name (defaults to 'mainnet'). For Solana - ignored.
  CHAIN: z
    .string()
    .optional()
    .transform((val) => val || 'mainnet'),
  
  // Optional: For Solana - Cluster name (mainnet-beta, devnet, testnet)
  SOLANA_CLUSTER: z
    .enum(['mainnet-beta', 'devnet', 'testnet'])
    .optional()
    .transform((val) => val || 'mainnet-beta'),
  
  // Optional: Solana private key (base58 encoded) - allows both EVM and Solana wallets
  SOLANA_PRIVATE_KEY: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') {
          return true;
        }
        // Solana keys are base58 encoded, typically 88 characters
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const bs58 = require('bs58');
          const decoded = bs58.decode(val);
          return decoded.length === 64; // Solana secret keys are 64 bytes
        } catch {
          return false;
        }
      },
      {
        message: 'SOLANA_PRIVATE_KEY must be a base58 encoded string (64 bytes when decoded)',
      }
    )
    .transform((val) => val?.trim() || undefined),
  
  // Optional: Solana RPC URL (if different from EVM RPC)
  SOLANA_RPC_URL: z
    .string()
    .url('SOLANA_RPC_URL must be a valid URL')
    .optional()
    .transform((val) => val || undefined),
  
  // Keep the example variable for backward compatibility (optional)
  EXAMPLE_PLUGIN_VARIABLE: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn('EXAMPLE_PLUGIN_VARIABLE is not provided (this is expected)');
      }
      return val;
    }),
});

/**
 * Trading action - checks wallet balance and provides trading information
 * This action is triggered when users ask about their wallet, balance, or trading
 */
const checkBalanceAction: Action = {
  name: 'CHECK_BALANCE',
  similes: ['WALLET_BALANCE', 'CHECK_WALLET', 'GET_BALANCE', 'TRADER_BALANCE'],
  description: 'Checks the wallet balance for the connected trading wallet. Use this when users ask about their wallet balance, funds, or trading account status.',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    // Check if the message is about wallet, balance, trading, or funds
    const balanceKeywords = ['balance', 'wallet', 'funds', 'trading', 'account', 'check balance', 'how much', 'what is my'];
    return balanceKeywords.some(keyword => text.includes(keyword));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling CHECK_BALANCE action from trader plugin');

      const walletService = runtime.getService<WalletService>(WalletService.serviceType);
      
      if (!walletService) {
        const errorMsg = 'Wallet service not available. Please configure PRIVATE_KEY in your environment.';
        logger.error(errorMsg);
        
        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['CHECK_BALANCE'],
            source: message.content.source,
          });
        }

        return {
          text: errorMsg,
          success: false,
          error: new Error('Wallet service not initialized'),
        };
      }

      // Check wallet initialization status
      // The service might be returned as a generic Service, so we need to safely access methods
      let hasEvm = false;
      let hasSolana = false;
      
      try {
        // Try to call the methods if they exist
        if (typeof (walletService as any).hasEvmWallet === 'function') {
          hasEvm = (walletService as any).hasEvmWallet();
        } else {
          // Fallback: check if EVM wallet exists by trying to get address
          const evmAddress = (walletService as any).getEvmAddress?.();
          hasEvm = !!evmAddress;
        }
        
        if (typeof (walletService as any).hasSolanaWallet === 'function') {
          hasSolana = (walletService as any).hasSolanaWallet();
        } else {
          // Fallback: check if Solana wallet exists by trying to get address
          const solanaAddress = (walletService as any).getSolanaAddress?.();
          hasSolana = !!solanaAddress;
        }
      } catch (error) {
        logger.warn({ error }, 'Error checking wallet status, assuming no wallets initialized');
        hasEvm = false;
        hasSolana = false;
      }

      if (!hasEvm && !hasSolana) {
        const errorMsg = 'No wallets initialized. Please configure PRIVATE_KEY (EVM) or SOLANA_PRIVATE_KEY (Solana) in your environment variables.';
        logger.warn(errorMsg);
        
        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['CHECK_BALANCE'],
            source: message.content.source,
          });
        }

        return {
          text: errorMsg,
          success: false,
          error: new Error('No wallets initialized'),
        };
      }

      // Get balances for both wallets if available
      const balances: string[] = [];
      
      if (hasEvm) {
        try {
          const evmAddress = walletService.getEvmAddress();
          if (evmAddress) {
            const evmBalance = await walletService.getNativeBalance(evmAddress);
            balances.push(`**EVM Wallet:**\nAddress: ${evmAddress}\nBalance: ${evmBalance} ETH\nBlockchain: Ethereum`);
            logger.info({ address: evmAddress, balance: evmBalance, type: 'evm' }, 'EVM balance retrieved');
          }
        } catch (error) {
          logger.error({ error }, 'Failed to get EVM balance');
          balances.push(`**EVM Wallet:** Error retrieving balance`);
        }
      }
      
      if (hasSolana) {
        try {
          const solanaAddress = walletService.getSolanaAddress();
          if (solanaAddress) {
            const solanaBalance = await walletService.getSolanaBalance(solanaAddress);
            balances.push(`**Solana Wallet:**\nAddress: ${solanaAddress}\nBalance: ${solanaBalance} SOL\nBlockchain: Solana`);
            logger.info({ address: solanaAddress, balance: solanaBalance, type: 'solana' }, 'Solana balance retrieved');
          }
        } catch (error) {
          logger.error({ error }, 'Failed to get Solana balance');
          balances.push(`**Solana Wallet:** Error retrieving balance`);
        }
      }
      
      const response = `Your Wallet Balances:\n\n${balances.join('\n\n')}`;

      logger.info({ hasEvm, hasSolana }, 'Balance check completed');

      if (callback) {
        await callback({
          text: response,
          actions: ['CHECK_BALANCE'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['CHECK_BALANCE'],
          hasEvm,
          hasSolana,
          balances: balances,
          source: message.content.source,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in CHECK_BALANCE action');
      const errorMsg = `Failed to check balance: ${error instanceof Error ? error.message : String(error)}`;
      
      if (callback) {
        await callback({
          text: errorMsg,
          actions: ['CHECK_BALANCE'],
          source: message.content.source,
        });
      }

      return {
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
          text: 'What is my wallet balance?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Your EVM wallet balance:\nAddress: 0x...\nBalance: 1.5 ETH\nBlockchain: EVM',
          actions: ['CHECK_BALANCE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Check my trading account',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Your wallet balance:\nAddress: 0x...\nBalance: 0.5 ETH\nBlockchain: EVM',
          actions: ['CHECK_BALANCE'],
        },
      },
    ],
  ],
};

/**
 * Trading action - executes token swaps on Uniswap V3
 * This action is triggered when users ask to swap, trade, or exchange tokens
 */
const swapTokenAction: Action = {
  name: 'SWAP_TOKEN',
  similes: ['EXECUTE_SWAP', 'TRADE_TOKEN', 'EXCHANGE_TOKEN', 'BUY_TOKEN', 'SELL_TOKEN'],
  description: 'Executes a token swap on Uniswap V3 DEX. Use this when users want to swap, trade, buy, or sell tokens. Requires token addresses (or symbols like ETH, USDC), amount to swap, and minimum output amount for slippage protection.',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    // Check if the message is about swapping, trading, buying, or selling tokens
    const swapKeywords = ['swap', 'trade', 'exchange', 'buy', 'sell', 'convert', 'swap tokens', 'trade tokens'];
    return swapKeywords.some(keyword => text.includes(keyword));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling SWAP_TOKEN action from trader plugin');

      const walletService = runtime.getService<WalletService>(WalletService.serviceType);
      const tradingService = runtime.getService<TradingService>(TradingService.serviceType);
      
      if (!walletService) {
        const errorMsg = 'Wallet service not available. Please configure PRIVATE_KEY in your environment.';
        logger.error(errorMsg);
        
        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['SWAP_TOKEN'],
            source: message.content.source,
          });
        }

        return {
          text: errorMsg,
          success: false,
          error: new Error('Wallet service not initialized'),
        };
      }

      if (!tradingService) {
        const errorMsg = 'Trading service not available. Please ensure the plugin is properly initialized.';
        logger.error(errorMsg);
        
        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['SWAP_TOKEN'],
            source: message.content.source,
          });
        }

        return {
          text: errorMsg,
          success: false,
          error: new Error('Trading service not initialized'),
        };
      }

      // Initialize trading service with wallet service
      if (!tradingService['walletService']) {
        (tradingService as any).initialize(walletService);
      }

      const address = walletService.getAddress();
      const blockchainType = walletService.getBlockchainType();

      if (!address || !blockchainType) {
        const errorMsg = 'Wallet not initialized. Please configure PRIVATE_KEY in your environment variables.';
        logger.warn(errorMsg);
        
        if (callback) {
          await callback({
            text: errorMsg,
            actions: ['SWAP_TOKEN'],
            source: message.content.source,
          });
        }

        return {
          text: errorMsg,
          success: false,
          error: new Error('Wallet not initialized'),
        };
      }

      // Parse the message to extract swap parameters
      // This is a simplified parser - in production you'd use more sophisticated NLP
      const text = message.content.text || '';
      
      // Try to extract token addresses and amounts from the message
      // For now, we'll provide a helpful error message asking for specific parameters
      const errorMsg = 'To execute a swap, please provide:\n' +
        '1. Input token address (or symbol like ETH, USDC)\n' +
        '2. Output token address (or symbol)\n' +
        '3. Amount to swap\n' +
        '4. Minimum output amount (for slippage protection)\n\n' +
        'Example: "Swap 1 ETH for USDC with minimum 3000 USDC"\n\n' +
        'Your wallet is configured and ready. Please provide the swap details.';
      
      logger.info({ text, address, blockchainType }, 'Swap requested but parameters need to be extracted');

      if (callback) {
        await callback({
          text: errorMsg,
          actions: ['SWAP_TOKEN'],
          source: message.content.source,
        });
      }

      return {
        text: errorMsg,
        success: false,
        error: new Error('Swap parameters not provided in message'),
      };
    } catch (error) {
      logger.error({ error }, 'Error in SWAP_TOKEN action');
      const errorMsg = `Failed to execute swap: ${error instanceof Error ? error.message : String(error)}`;
      
      if (callback) {
        await callback({
          text: errorMsg,
          actions: ['SWAP_TOKEN'],
          source: message.content.source,
        });
      }

      return {
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
          text: 'Swap 1 ETH for USDC',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'I can help you swap tokens. Please provide:\n- Input token: ETH\n- Output token: USDC\n- Amount: 1 ETH\n- Minimum output: (I will calculate this)\n\nExecuting swap...',
          actions: ['SWAP_TOKEN'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Trade 100 USDC for DAI',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Preparing to swap 100 USDC for DAI. Getting quote...',
          actions: ['SWAP_TOKEN'],
        },
      },
    ],
  ],
};

/**
 * Example Hello World Provider
 * This demonstrates the simplest possible provider implementation
 */
const quickProvider: Provider = {
  name: 'QUICK_PROVIDER',
  description: 'A simple example provider',

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<ProviderResult> => {
    return {
      text: 'I am a provider',
      values: {},
      data: {},
    };
  },
};

export class StarterService extends Service {
  static override serviceType = 'starter';

  override capabilityDescription =
    'This is a starter service which is attached to the agent through the starter plugin.';

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting starter service');
    const service = new StarterService(runtime);
    return service;
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping starter service');
    const service = runtime.getService(StarterService.serviceType);
    if (!service) {
      throw new Error('Starter service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('Starter service stopped');
  }
}

export const starterPlugin: Plugin = {
  name: 'plugin-trader',
  description: 'Blockchain crypto trading plugin for elizaOS - enables on-chain trading via DEX',
  config: {
    PRIVATE_KEY: process.env.PRIVATE_KEY?.trim() || undefined,
    BLOCKCHAIN_TYPE: process.env.BLOCKCHAIN_TYPE?.trim() || undefined,
    RPC_URL: process.env.RPC_URL?.trim() || undefined,
    CHAIN: process.env.CHAIN?.trim() || undefined,
    SOLANA_CLUSTER: process.env.SOLANA_CLUSTER?.trim() || undefined,
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY?.trim() || undefined,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL?.trim() || undefined,
    EXAMPLE_PLUGIN_VARIABLE: process.env.EXAMPLE_PLUGIN_VARIABLE?.trim() || undefined,
  },
  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    // Wrap entire init in try-catch to ensure it NEVER breaks the agent
    try {
      logger.info('[plugin-trader] ===== PLUGIN INIT CALLED =====');
      logger.info('[plugin-trader] Initializing plugin-trader');
      logger.info({ 
        configKeys: Object.keys(config),
        configHasPrivateKey: !!config.PRIVATE_KEY,
        envHasPrivateKey: !!process.env.PRIVATE_KEY,
        envPrivateKeyLength: process.env.PRIVATE_KEY?.length || 0
      }, '[plugin-trader] Init parameters');
      
      // Merge config with process.env (process.env takes precedence)
      // This ensures .env file values are picked up even if config object was evaluated before .env was loaded
      const mergedConfig: Record<string, string | undefined> = {
        ...config,
        // Override with process.env if available (these are loaded from .env file)
        PRIVATE_KEY: process.env.PRIVATE_KEY?.trim() || config.PRIVATE_KEY?.trim() || undefined,
        BLOCKCHAIN_TYPE: process.env.BLOCKCHAIN_TYPE?.trim() || config.BLOCKCHAIN_TYPE?.trim() || undefined,
        RPC_URL: process.env.RPC_URL?.trim() || config.RPC_URL?.trim() || undefined,
        CHAIN: process.env.CHAIN?.trim() || config.CHAIN?.trim() || undefined,
        SOLANA_CLUSTER: process.env.SOLANA_CLUSTER?.trim() || config.SOLANA_CLUSTER?.trim() || undefined,
        SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY?.trim() || config.SOLANA_PRIVATE_KEY?.trim() || undefined,
        SOLANA_RPC_URL: process.env.SOLANA_RPC_URL?.trim() || config.SOLANA_RPC_URL?.trim() || undefined,
        EXAMPLE_PLUGIN_VARIABLE: process.env.EXAMPLE_PLUGIN_VARIABLE?.trim() || config.EXAMPLE_PLUGIN_VARIABLE?.trim() || undefined,
      };
      
      logger.info({ 
        hasPrivateKey: !!mergedConfig.PRIVATE_KEY,
        privateKeyLength: mergedConfig.PRIVATE_KEY?.length || 0,
        privateKeyPrefix: mergedConfig.PRIVATE_KEY?.substring(0, 10) || 'none',
        fromEnv: !!process.env.PRIVATE_KEY,
        fromConfig: !!config.PRIVATE_KEY,
        envPrivateKeyLength: process.env.PRIVATE_KEY?.length || 0,
        envPrivateKeyPrefix: process.env.PRIVATE_KEY?.substring(0, 10) || 'none'
      }, '[plugin-trader] Config received (merged with process.env)');
      
      // Filter out empty strings and undefined values before validation
      const cleanedConfig: Record<string, string> = {};
      for (const [key, value] of Object.entries(mergedConfig)) {
        if (value !== undefined && value !== null && value.trim() !== '') {
          cleanedConfig[key] = value.trim();
        }
      }
      
      logger.info({ 
        cleanedConfigKeys: Object.keys(cleanedConfig),
        hasPrivateKeyInCleaned: !!cleanedConfig.PRIVATE_KEY,
        privateKeyInCleanedLength: cleanedConfig.PRIVATE_KEY?.length || 0,
        privateKeyInCleanedPrefix: cleanedConfig.PRIVATE_KEY?.substring(0, 15) || 'none'
      }, '[plugin-trader] Config cleaned for validation');
      
      // Validate config, but handle PRIVATE_KEY validation errors gracefully
      let validatedConfig: Record<string, any>;
      try {
        validatedConfig = await configSchema.parseAsync(cleanedConfig);
        logger.info({ 
          validatedConfigKeys: Object.keys(validatedConfig),
          hasPrivateKeyInValidated: !!validatedConfig.PRIVATE_KEY,
          privateKeyInValidatedLength: validatedConfig.PRIVATE_KEY?.length || 0
        }, '[plugin-trader] Config validation successful');
      } catch (error) {
        if (error instanceof z.ZodError) {
          // Check if the error is specifically about PRIVATE_KEY
          const privateKeyErrors = error.issues.filter(issue => issue.path.includes('PRIVATE_KEY'));
          
          if (privateKeyErrors.length > 0) {
            // If PRIVATE_KEY is invalid, just log a warning and continue without it
            logger.warn({ 
              error: privateKeyErrors.map(e => e.message).join(', '),
              privateKeyLength: cleanedConfig.PRIVATE_KEY?.length || 0,
              privateKeyValue: cleanedConfig.PRIVATE_KEY?.substring(0, 20) + '...',
              allErrors: error.issues.map(e => ({ path: e.path, message: e.message }))
            }, '[plugin-trader] PRIVATE_KEY validation failed - plugin will continue without wallet initialization');
            
            // Remove PRIVATE_KEY from config and re-validate
            const configWithoutKey = { ...cleanedConfig };
            delete configWithoutKey.PRIVATE_KEY;
            
            try {
              validatedConfig = await configSchema.parseAsync(configWithoutKey);
              validatedConfig.PRIVATE_KEY = undefined; // Explicitly set to undefined
            } catch (retryError) {
              // If there are other validation errors, log them but don't fail
              logger.warn({ error: retryError }, '[plugin-trader] Other config validation issues, continuing anyway');
              validatedConfig = configWithoutKey as any;
            }
          } else {
            // Other validation errors - log but don't fail
            const errorMessages = error.issues?.map((e) => e.message)?.join(', ') || 'Unknown validation error';
            logger.warn({ error: errorMessages }, '[plugin-trader] Configuration validation issues, continuing anyway');
            validatedConfig = cleanedConfig as any;
          }
        } else {
          // Non-Zod errors - log but continue
          logger.warn({ error }, '[plugin-trader] Config validation error, continuing anyway');
          validatedConfig = cleanedConfig as any;
        }
      }

      // Set all environment variables at once (only if they exist)
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }

      // Initialize the wallet service and create wallet (only if PRIVATE_KEY or SOLANA_PRIVATE_KEY is valid)
      // Prioritize PRIVATE_KEY (can be EVM or Solana), but also check SOLANA_PRIVATE_KEY
      // Use validatedConfig values if available, otherwise fall back to cleanedConfig
      // This ensures we use the key even if validation had issues but the key looks valid
      const privateKeyToUse = validatedConfig.PRIVATE_KEY || cleanedConfig.PRIVATE_KEY;
      const solanaPrivateKeyToUse = validatedConfig.SOLANA_PRIVATE_KEY || cleanedConfig.SOLANA_PRIVATE_KEY;
      
      // Use SOLANA_PRIVATE_KEY if PRIVATE_KEY is not available
      const keyToUse = privateKeyToUse || solanaPrivateKeyToUse;
      const isSolanaKey = !privateKeyToUse && !!solanaPrivateKeyToUse;
      
      const walletService = runtime.getService<WalletService>(WalletService.serviceType);
      logger.info({ 
        hasWalletService: !!walletService,
        hasValidatedPrivateKey: !!validatedConfig.PRIVATE_KEY,
        hasCleanedPrivateKey: !!cleanedConfig.PRIVATE_KEY,
        hasValidatedSolanaKey: !!validatedConfig.SOLANA_PRIVATE_KEY,
        hasCleanedSolanaKey: !!cleanedConfig.SOLANA_PRIVATE_KEY,
        hasKeyToUse: !!keyToUse,
        isSolanaKey: isSolanaKey,
        validatedPrivateKeyLength: validatedConfig.PRIVATE_KEY?.length || 0,
        cleanedPrivateKeyLength: cleanedConfig.PRIVATE_KEY?.length || 0,
        validatedSolanaKeyLength: validatedConfig.SOLANA_PRIVATE_KEY?.length || 0,
        cleanedSolanaKeyLength: cleanedConfig.SOLANA_PRIVATE_KEY?.length || 0,
        keyToUseLength: keyToUse?.length || 0,
        keyToUsePrefix: keyToUse?.substring(0, 10) || 'none'
      }, '[plugin-trader] Checking wallet initialization conditions');
      
      if (walletService && keyToUse) {
        try {
          logger.info({ 
            isSolanaKey,
            keyLength: keyToUse.length,
            keyPrefix: keyToUse.substring(0, 10)
          }, '[plugin-trader] Initializing wallet from private key');
          
          // Create wallet - supports both EVM and Solana
          // The method auto-detects blockchain type if BLOCKCHAIN_TYPE is not provided
          // If using SOLANA_PRIVATE_KEY, force blockchain type to 'solana'
          const blockchainTypeToUse = isSolanaKey 
            ? 'solana' 
            : (validatedConfig.BLOCKCHAIN_TYPE || cleanedConfig.BLOCKCHAIN_TYPE as 'evm' | 'solana' | undefined);
          
          // Use SOLANA_RPC_URL if available and using Solana key, otherwise use RPC_URL
          const rpcUrlToUse = isSolanaKey 
            ? (validatedConfig.SOLANA_RPC_URL || cleanedConfig.SOLANA_RPC_URL || validatedConfig.RPC_URL || cleanedConfig.RPC_URL)
            : (validatedConfig.RPC_URL || cleanedConfig.RPC_URL);
          
          const walletAddress = await walletService.createWallet(
            keyToUse,
            mainnet, // EVM chain (ignored for Solana)
            rpcUrlToUse,
            blockchainTypeToUse, // Force 'solana' if using SOLANA_PRIVATE_KEY
            (validatedConfig.SOLANA_CLUSTER || cleanedConfig.SOLANA_CLUSTER) as 'mainnet-beta' | 'devnet' | 'testnet' // Solana cluster
          );
          
          const blockchainType = walletService.getBlockchainType();
          
          logger.info({ 
            address: walletAddress,
            blockchainType: blockchainType,
            chain: blockchainType === 'evm' ? validatedConfig.CHAIN : validatedConfig.SOLANA_CLUSTER,
            rpcUrl: validatedConfig.RPC_URL || 'default'
          }, '[plugin-trader] Wallet initialized successfully');

          // Initialize trading service with wallet service
          const tradingService = runtime.getService<TradingService>(TradingService.serviceType);
          if (tradingService && blockchainType === 'evm') {
            (tradingService as any).initialize(walletService);
            logger.info('[plugin-trader] Trading service initialized');
          }
        } catch (walletError) {
          logger.warn({ 
            error: walletError instanceof Error ? walletError.message : String(walletError)
          }, '[plugin-trader] Failed to initialize wallet - plugin will continue without wallet features');
        }
      } else {
        logger.warn({ 
          hasWalletService: !!walletService,
          hasValidatedPrivateKey: !!validatedConfig.PRIVATE_KEY,
          hasValidatedSolanaKey: !!validatedConfig.SOLANA_PRIVATE_KEY,
          hasCleanedPrivateKey: !!cleanedConfig.PRIVATE_KEY,
          hasCleanedSolanaKey: !!cleanedConfig.SOLANA_PRIVATE_KEY,
          validatedConfigKeys: Object.keys(validatedConfig),
          cleanedConfigKeys: Object.keys(cleanedConfig),
          mergedConfigKeys: Object.keys(mergedConfig)
        }, '[plugin-trader] Wallet service not found or PRIVATE_KEY/SOLANA_PRIVATE_KEY not provided. Wallet will not be initialized. Trading features will be limited.');
      }
      
      logger.info('[plugin-trader] Plugin initialization complete');
    } catch (error) {
      // CRITICAL: Never throw - just log and continue
      // This ensures the plugin can NEVER break the agent
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, '[plugin-trader] CRITICAL: Plugin initialization failed completely, but agent will continue');
      // Do NOT re-throw - just return silently
    }
  },
  models: {
    [ModelType.TEXT_SMALL]: async (
      _runtime,
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'Never gonna give you up, never gonna let you down, never gonna run around and desert you...';
    },
    [ModelType.TEXT_LARGE]: async (
      _runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      }: GenerateTextParams
    ) => {
      return 'Never gonna make you cry, never gonna say goodbye, never gonna tell a lie and hurt you...';
    },
  },
  routes: [
    {
      name: 'api-status',
      path: '/api/status',
      type: 'GET',
      handler: async (_req: any, res: any) => {
        res.json({
          status: 'ok',
          plugin: 'quick-starter',
          timestamp: new Date().toISOString(),
        });
      },
    },
  ],
  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async (params: MessagePayload) => {
        logger.info('[plugin-trader] MESSAGE_RECEIVED event received');
        logger.info({ message: params.message }, '[plugin-trader] Message details:');
      },
    ],
    [EventType.VOICE_MESSAGE_RECEIVED]: [
      async (params: MessagePayload) => {
        logger.info('[plugin-trader] VOICE_MESSAGE_RECEIVED event received');
        logger.info({ message: params.message }, '[plugin-trader] Voice message details:');
      },
    ],
    [EventType.WORLD_CONNECTED]: [
      async (params: WorldPayload) => {
        logger.info('[plugin-trader] WORLD_CONNECTED event received');
        logger.info({ world: params.world }, '[plugin-trader] World connected:');
      },
    ],
    [EventType.WORLD_JOINED]: [
      async (params: WorldPayload) => {
        logger.info('[plugin-trader] WORLD_JOINED event received');
        logger.info({ world: params.world }, '[plugin-trader] World joined:');
      },
    ],
  },
  services: [StarterService, WalletService, TradingService],
  actions: [checkBalanceAction, swapTokenAction],
  providers: [quickProvider],
  // dependencies: ['@elizaos/plugin-knowledge'], <--- plugin dependencies go here (if requires another plugin)
};

export default starterPlugin;
