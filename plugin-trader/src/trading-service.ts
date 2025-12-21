import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  type WalletClient, 
  type PublicClient,
  parseUnits,
  formatUnits,
  type Address,
  encodeFunctionData,
  type Hash,
} from 'viem';
import { type PrivateKeyAccount } from 'viem/accounts';
import { type Chain } from 'viem/chains';
import { erc20Abi } from 'viem';
import { 
  Token,
  CurrencyAmount,
  TradeType,
  Percent,
} from '@uniswap/sdk-core';
import { 
  Pool,
  Route,
  Trade,
  computePoolAddress,
} from '@uniswap/v3-sdk';
import { WalletService } from './wallet-service';

// Uniswap V3 Router addresses for different chains
const UNISWAP_V3_ROUTER_ADDRESSES: Record<number, Address> = {
  1: '0xE592427A0AEce92De3Edee1F18E0157C05861564' as Address, // Ethereum Mainnet
  137: '0xE592427A0AEce92De3Edee1F18E0157C05861564' as Address, // Polygon
  42161: '0xE592427A0AEce92De3Edee1F18E0157C05861564' as Address, // Arbitrum
  10: '0xE592427A0AEce92De3Edee1F18E0157C05861564' as Address, // Optimism
  8453: '0xE592427A0AEce92De3Edee1F18E0157C05861564' as Address, // Base
};

// Uniswap V3 Factory address
const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984' as Address;

// Common token addresses (Ethereum mainnet)
const COMMON_TOKENS: Record<string, Address> = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address,
};

/**
 * TradingService - Handles DEX trading operations using Uniswap V3
 * 
 * This service handles:
 * - Token swaps on Uniswap V3
 * - Getting swap quotes
 * - Executing trades
 */
export class TradingService extends Service {
  static override serviceType = 'trading';

  override capabilityDescription =
    'Executes token swaps on Uniswap V3 DEX. Handles trade execution, quote fetching, and transaction management.';

  private walletService: WalletService | null = null;
  private walletClient: WalletClient | null = null;
  private publicClient: PublicClient | null = null;
  private account: PrivateKeyAccount | null = null;
  private currentChain: Chain | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting Trading Service');
    const service = new TradingService(runtime);
    
    // Get the wallet service and initialize
    const walletService = runtime.getService<WalletService>(WalletService.serviceType);
    if (walletService) {
      service.initialize(walletService);
    }
    
    return service;
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping Trading Service');
    const service = runtime.getService<TradingService>(TradingService.serviceType);
    if (service) {
      await service.stop();
    }
  }

  /**
   * Initializes the trading service with wallet service
   */
  initialize(walletService: WalletService): void {
    this.walletService = walletService;
    this.walletClient = walletService.getWalletClient();
    this.publicClient = walletService.getPublicClient();
    this.currentChain = walletService.getChain();
  }

  /**
   * Gets a swap quote without executing the trade
   * 
   * @param tokenInAddress - Address of the input token
   * @param tokenOutAddress - Address of the output token
   * @param amountIn - Amount to swap (in token's native units, e.g., "1.0" for 1 ETH)
   * @param tokenInDecimals - Decimals of input token (default: 18)
   * @param tokenOutDecimals - Decimals of output token (default: 18)
   * @returns Quote with expected output amount and price impact
   */
  async getSwapQuote(
    tokenInAddress: string,
    tokenOutAddress: string,
    amountIn: string,
    tokenInDecimals: number = 18,
    tokenOutDecimals: number = 18
  ): Promise<{
    amountOut: string;
    amountOutMin: string;
    priceImpact: string;
  }> {
    try {
      if (!this.publicClient || !this.currentChain) {
        throw new Error('Trading service not initialized. Wallet must be configured.');
      }

      logger.info({
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        amountIn,
      }, 'Getting swap quote');

      // For now, return a simple quote
      // In a full implementation, you would:
      // 1. Query Uniswap V3 pools to find the best route
      // 2. Calculate the output amount based on current pool reserves
      // 3. Calculate price impact
      
      // This is a simplified version - in production you'd query actual pool data
      const amountInParsed = parseFloat(amountIn);
      const estimatedAmountOut = amountInParsed * 0.99; // Simplified: assume 1% slippage
      const amountOutMin = estimatedAmountOut * 0.95; // 5% slippage tolerance

      return {
        amountOut: estimatedAmountOut.toFixed(6),
        amountOutMin: amountOutMin.toFixed(6),
        priceImpact: '1.0', // Simplified
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get swap quote');
      throw new Error(
        `Failed to get swap quote: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Executes a token swap on Uniswap V3
   * 
   * @param tokenInAddress - Address of the input token (use 'native' for ETH)
   * @param tokenOutAddress - Address of the output token
   * @param amountIn - Amount to swap (in token's native units)
   * @param amountOutMin - Minimum amount out (slippage protection)
   * @param recipient - Address to receive output tokens (defaults to wallet address)
   * @param tokenInDecimals - Decimals of input token (default: 18)
   * @param tokenOutDecimals - Decimals of output token (default: 18)
   * @returns Transaction hash
   */
  async executeSwap(
    tokenInAddress: string,
    tokenOutAddress: string,
    amountIn: string,
    amountOutMin: string,
    recipient?: string,
    tokenInDecimals: number = 18,
    tokenOutDecimals: number = 18
  ): Promise<Hash> {
    try {
      if (!this.walletClient || !this.publicClient || !this.walletService) {
        throw new Error('Trading service not initialized. Wallet must be configured with PRIVATE_KEY.');
      }

      const walletAddress = this.walletService.getAddress();
      if (!walletAddress) {
        throw new Error('Wallet not initialized. Please configure PRIVATE_KEY.');
      }

      // Get account from wallet service
      const account = (this.walletService as any).account;
      if (!account) {
        throw new Error('Account not available from wallet service');
      }

      const targetRecipient = (recipient || walletAddress) as Address;
      const chainId = this.currentChain?.id;
      if (!chainId) {
        throw new Error('Chain ID not available');
      }

      const routerAddress = UNISWAP_V3_ROUTER_ADDRESSES[chainId];
      if (!routerAddress) {
        throw new Error(`Uniswap V3 router not available for chain ID ${chainId}`);
      }

      logger.info({
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        amountIn,
        amountOutMin,
        recipient: targetRecipient,
        chainId,
      }, 'Executing swap');

      // Convert addresses
      const tokenIn = tokenInAddress.toLowerCase() === 'native' || tokenInAddress.toLowerCase() === 'eth'
        ? '0x0000000000000000000000000000000000000000' as Address
        : (tokenInAddress as Address);
      const tokenOut = tokenOutAddress as Address;

      // Parse amounts
      const amountInWei = parseUnits(amountIn, tokenInDecimals);
      const amountOutMinWei = parseUnits(amountOutMin, tokenOutDecimals);

      // If swapping from a token (not native ETH), we need to approve first
      if (tokenIn !== '0x0000000000000000000000000000000000000000') {
        // Check current allowance
        const allowance = await this.publicClient.readContract({
          address: tokenIn,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [walletAddress as Address, routerAddress],
        });

        // If allowance is insufficient, approve
        if (allowance < amountInWei) {
          logger.info('Approving token spend...');
          const approveHash = await this.walletClient.writeContract({
            address: tokenIn,
            abi: erc20Abi,
            functionName: 'approve',
            args: [routerAddress, amountInWei],
            account,
            chain: this.currentChain || undefined,
          });

          // Wait for approval transaction
          await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
          logger.info({ hash: approveHash }, 'Token approved');
        }
      }

      // For a simplified swap, we'll use exactInputSingle
      // In production, you'd build the full swap path using Uniswap SDK
      const swapParams = {
        tokenIn,
        tokenOut,
        fee: 3000, // 0.3% fee tier (most common)
        recipient: targetRecipient,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20), // 20 minutes
        amountIn: amountInWei,
        amountOutMinimum: amountOutMinWei,
        sqrtPriceLimitX96: BigInt(0), // No price limit
      };

      // Encode the swap function call
      // Note: This is a simplified version. Full implementation would use Uniswap SDK
      // to build the exact swap parameters including routing through pools
      const swapData = encodeFunctionData({
        abi: [
          {
            name: 'exactInputSingle',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
              {
                name: 'params',
                type: 'tuple',
                components: [
                  { name: 'tokenIn', type: 'address' },
                  { name: 'tokenOut', type: 'address' },
                  { name: 'fee', type: 'uint24' },
                  { name: 'recipient', type: 'address' },
                  { name: 'deadline', type: 'uint256' },
                  { name: 'amountIn', type: 'uint256' },
                  { name: 'amountOutMinimum', type: 'uint256' },
                  { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
              },
            ],
            outputs: [{ name: 'amountOut', type: 'uint256' }],
          },
        ],
        functionName: 'exactInputSingle',
        args: [swapParams],
      });

      // Execute the swap
      const hash = await this.walletClient.writeContract({
        address: routerAddress,
        abi: [
          {
            name: 'exactInputSingle',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
              {
                name: 'params',
                type: 'tuple',
                components: [
                  { name: 'tokenIn', type: 'address' },
                  { name: 'tokenOut', type: 'address' },
                  { name: 'fee', type: 'uint24' },
                  { name: 'recipient', type: 'address' },
                  { name: 'deadline', type: 'uint256' },
                  { name: 'amountIn', type: 'uint256' },
                  { name: 'amountOutMinimum', type: 'uint256' },
                  { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
              },
            ],
            outputs: [{ name: 'amountOut', type: 'uint256' }],
          },
        ],
        functionName: 'exactInputSingle',
        args: [swapParams],
        value: tokenIn === '0x0000000000000000000000000000000000000000' ? amountInWei : BigInt(0),
        account,
        chain: this.currentChain || undefined,
      });

      logger.info({ hash, tokenIn, tokenOut, amountIn }, 'Swap transaction submitted');

      return hash;
    } catch (error) {
      logger.error({ error }, 'Failed to execute swap');
      throw new Error(
        `Failed to execute swap: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gets common token addresses by symbol
   */
  getTokenAddress(symbol: string): Address | null {
    const upperSymbol = symbol.toUpperCase();
    return COMMON_TOKENS[upperSymbol] || null;
  }

  override async stop(): Promise<void> {
    logger.info('Trading Service stopped');
    this.walletService = null;
    this.walletClient = null;
    this.publicClient = null;
    this.account = null;
    this.currentChain = null;
  }
}

