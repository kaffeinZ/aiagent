import { Service, type IAgentRuntime } from '@elizaos/core';
import { type Address, type Hash } from 'viem';
import { WalletService } from './wallet-service';
/**
 * TradingService - Handles DEX trading operations using Uniswap V3
 *
 * This service handles:
 * - Token swaps on Uniswap V3
 * - Getting swap quotes
 * - Executing trades
 */
export declare class TradingService extends Service {
    static serviceType: string;
    capabilityDescription: string;
    private walletService;
    private walletClient;
    private publicClient;
    private account;
    private currentChain;
    constructor(runtime: IAgentRuntime);
    static start(runtime: IAgentRuntime): Promise<Service>;
    static stop(runtime: IAgentRuntime): Promise<void>;
    /**
     * Initializes the trading service with wallet service
     */
    initialize(walletService: WalletService): void;
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
    getSwapQuote(tokenInAddress: string, tokenOutAddress: string, amountIn: string, tokenInDecimals?: number, tokenOutDecimals?: number): Promise<{
        amountOut: string;
        amountOutMin: string;
        priceImpact: string;
    }>;
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
    executeSwap(tokenInAddress: string, tokenOutAddress: string, amountIn: string, amountOutMin: string, recipient?: string, tokenInDecimals?: number, tokenOutDecimals?: number): Promise<Hash>;
    /**
     * Gets common token addresses by symbol
     */
    getTokenAddress(symbol: string): Address | null;
    stop(): Promise<void>;
}
//# sourceMappingURL=trading-service.d.ts.map