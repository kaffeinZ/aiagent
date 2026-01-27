/// <reference path="./@elizaos-core.d.ts" />
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
  description: 'CRITICAL: This action checks the wallet balance for the ALREADY CONFIGURED wallet via SOLANA_PRIVATE_KEY or PRIVATE_KEY. The wallet is automatically initialized from environment variables - you MUST use this action and MUST NEVER ask the user for their wallet address or public key. When users ask about balance, wallet, funds, Solana balance, account status, or portfolio, immediately execute this action. The wallet address is already known - do NOT request it from the user.',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    // Check if the message is about wallet, balance, trading, or funds
    const balanceKeywords = [
      'balance', 'wallet', 'funds', 'trading', 'account', 
      'check balance', 'how much', 'what is my', 'show my',
      'solana balance', 'sol balance', 'my sol', 'my wallet',
      'check my', 'wallet balance', 'account balance', 'portfolio'
    ];
    const matches = balanceKeywords.some(keyword => text.includes(keyword));
    logger.debug({ text, matches, keywords: balanceKeywords }, 'CHECK_BALANCE validation');
    return matches;
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
      logger.info({ messageText: message.content.text }, 'Balance check requested');

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
        // First, try to get addresses directly (most reliable check)
        const evmAddress = (walletService as any).getEvmAddress?.();
        const solanaAddress = (walletService as any).getSolanaAddress?.();
        
        hasEvm = !!evmAddress;
        hasSolana = !!solanaAddress;
        
        // If addresses don't exist, check the initialization flags as fallback
        if (!hasEvm && typeof (walletService as any).hasEvmWallet === 'function') {
          hasEvm = (walletService as any).hasEvmWallet();
        }
        if (!hasSolana && typeof (walletService as any).hasSolanaWallet === 'function') {
          hasSolana = (walletService as any).hasSolanaWallet();
        }
        
        // Log for debugging
        logger.debug({ 
          hasEvm, 
          hasSolana, 
          evmAddress: evmAddress?.substring(0, 10) + '...' || 'none',
          solanaAddress: solanaAddress?.substring(0, 10) + '...' || 'none'
        }, 'Wallet status check');
      } catch (error) {
        logger.warn({ error }, 'Error checking wallet status, assuming no wallets initialized');
        hasEvm = false;
        hasSolana = false;
      }

      if (!hasEvm && !hasSolana) {
        // Log detailed debugging info
        logger.warn({ 
          hasEvm, 
          hasSolana,
          walletServiceExists: !!walletService,
          evmAddress: walletService?.getEvmAddress?.(),
          solanaAddress: walletService?.getSolanaAddress?.(),
          hasEvmWalletMethod: typeof (walletService as any)?.hasEvmWallet === 'function',
          hasSolanaWalletMethod: typeof (walletService as any)?.hasSolanaWallet === 'function',
          evmWalletFlag: (walletService as any)?.hasEvmWallet?.(),
          solanaWalletFlag: (walletService as any)?.hasSolanaWallet?.(),
        }, 'No wallets detected - detailed debug info');
        
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
          text: 'Your Solana Wallet:\nAddress: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\nBalance: 2.5 SOL\nBlockchain: Solana',
          actions: ['CHECK_BALANCE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Check my Solana balance',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Your Solana Wallet:\nAddress: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\nBalance: 1.2 SOL\nBlockchain: Solana',
          actions: ['CHECK_BALANCE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Show me my wallet',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Your Solana Wallet:\nAddress: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\nBalance: 0.8 SOL\nBlockchain: Solana',
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

/**
 * Helper: Merge plugin config with environment variables (env takes precedence)
 */
function mergeConfig(config: Record<string, string>): Record<string, string | undefined> {
  return {
    ...config,
    PRIVATE_KEY: process.env.PRIVATE_KEY?.trim() || config.PRIVATE_KEY?.trim() || undefined,
    BLOCKCHAIN_TYPE: process.env.BLOCKCHAIN_TYPE?.trim() || config.BLOCKCHAIN_TYPE?.trim() || undefined,
    RPC_URL: process.env.RPC_URL?.trim() || config.RPC_URL?.trim() || undefined,
    CHAIN: process.env.CHAIN?.trim() || config.CHAIN?.trim() || undefined,
    SOLANA_CLUSTER: process.env.SOLANA_CLUSTER?.trim() || config.SOLANA_CLUSTER?.trim() || undefined,
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY?.trim() || config.SOLANA_PRIVATE_KEY?.trim() || undefined,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL?.trim() || config.SOLANA_RPC_URL?.trim() || undefined,
    EXAMPLE_PLUGIN_VARIABLE: process.env.EXAMPLE_PLUGIN_VARIABLE?.trim() || config.EXAMPLE_PLUGIN_VARIABLE?.trim() || undefined,
  };
}

/**
 * Helper: Remove empty/undefined values from config
 */
function cleanConfig(config: Record<string, string | undefined>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && value !== null && value.trim() !== '') {
      cleaned[key] = value.trim();
    }
  }
  return cleaned;
}

/**
 * Helper: Validate configuration with explicit error handling
 */
async function validateConfig(config: Record<string, string>): Promise<Record<string, any>> {
  try {
    const validated = await configSchema.parseAsync(config);
    logger.info({ keys: Object.keys(validated) }, '[plugin-trader] Config validation successful');
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      logger.warn({ errors: errorMessages }, '[plugin-trader] Config validation warnings');

      // For wallet keys, allow graceful degradation
      const hasWalletErrors = error.issues.some(issue =>
        issue.path.includes('PRIVATE_KEY') || issue.path.includes('SOLANA_PRIVATE_KEY')
      );

      if (hasWalletErrors) {
        logger.info('[plugin-trader] Wallet key validation issues - will continue without wallet');
      }

      // Return config as-is for non-critical errors
      return config as any;
    }
    throw error;
  }
}

/**
 * Helper: Initialize wallet if private key is available
 */
async function initializeWallet(
  validatedConfig: Record<string, any>,
  runtime: IAgentRuntime
): Promise<void> {
  const walletService = runtime.getService<WalletService>(WalletService.serviceType);
  if (!walletService) {
    logger.info('[plugin-trader] WalletService not available - skipping wallet init');
    return;
  }

  // Determine which key to use (PRIVATE_KEY or SOLANA_PRIVATE_KEY)
  const privateKey = validatedConfig.PRIVATE_KEY;
  const solanaPrivateKey = validatedConfig.SOLANA_PRIVATE_KEY;
  const keyToUse = privateKey || solanaPrivateKey;

  if (!keyToUse) {
    logger.info('[plugin-trader] No wallet keys configured - wallet features disabled');
    return;
  }

  const isSolanaKey = !privateKey && !!solanaPrivateKey;
  const blockchainType = isSolanaKey ? 'solana' : validatedConfig.BLOCKCHAIN_TYPE;
  const rpcUrl = isSolanaKey
    ? (validatedConfig.SOLANA_RPC_URL || validatedConfig.RPC_URL)
    : validatedConfig.RPC_URL;

  logger.info({
    blockchainType: blockchainType || 'auto-detect',
    hasRpcUrl: !!rpcUrl,
    keyLength: keyToUse.length
  }, '[plugin-trader] Initializing wallet');

  try {
    const walletAddress = await walletService.createWallet(
      keyToUse,
      mainnet, // EVM chain (ignored for Solana)
      rpcUrl,
      blockchainType,
      validatedConfig.SOLANA_CLUSTER as 'mainnet-beta' | 'devnet' | 'testnet'
    );

    logger.info({
      address: walletAddress,
      blockchain: walletService.getBlockchainType()
    }, '[plugin-trader] Wallet initialized successfully');

    // Initialize trading service if EVM
    if (walletService.getBlockchainType() === 'evm') {
      await initializeTradingService(runtime, walletService);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, '[plugin-trader] Wallet initialization failed');
    throw new Error(`Wallet initialization failed: ${errorMsg}`);
  }
}

/**
 * Helper: Initialize trading service with wallet
 */
async function initializeTradingService(
  runtime: IAgentRuntime,
  walletService: WalletService
): Promise<void> {
  const tradingService = runtime.getService<TradingService>(TradingService.serviceType);
  if (tradingService) {
    (tradingService as any).initialize(walletService);
    logger.info('[plugin-trader] Trading service initialized');
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
    try {
      logger.info('[plugin-trader] Initializing trader plugin');

      // Step 1: Merge config with environment variables
      const mergedConfig = mergeConfig(config);

      // Step 2: Clean config (remove empty values)
      const cleanedConfig = cleanConfig(mergedConfig);

      logger.info({
        configKeys: Object.keys(cleanedConfig),
        hasPrivateKey: !!cleanedConfig.PRIVATE_KEY,
        hasSolanaKey: !!cleanedConfig.SOLANA_PRIVATE_KEY
      }, '[plugin-trader] Configuration prepared');

      // Step 3: Validate configuration
      const validatedConfig = await validateConfig(cleanedConfig);

      // Step 4: Set environment variables for services to use
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }

      // Step 5: Initialize wallet if credentials are provided
      try {
        await initializeWallet(validatedConfig, runtime);
      } catch (walletError) {
        // Wallet errors are logged but don't fail the plugin
        logger.warn(
          { error: walletError instanceof Error ? walletError.message : String(walletError) },
          '[plugin-trader] Wallet initialization failed - continuing without wallet'
        );
      }

      logger.info('[plugin-trader] Plugin initialization complete');
    } catch (error) {
      // Log critical errors but don't break the agent
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        },
        '[plugin-trader] Plugin initialization failed'
      );
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
