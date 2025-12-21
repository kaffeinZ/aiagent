import { Service, type IAgentRuntime } from '@elizaos/core';
import { type WalletClient, type PublicClient } from 'viem';
import { type Chain } from 'viem/chains';
import { Keypair, Connection, Cluster } from '@solana/web3.js';
/**
 * WalletService - Manages cryptocurrency wallets and blockchain interactions
 *
 * This service handles:
 * - Creating and managing wallet accounts from private keys
 * - Connecting to blockchain networks (Ethereum, Polygon, etc.)
 * - Reading wallet balances
 * - Preparing transactions for signing
 */
export declare class WalletService extends Service {
    static serviceType: string;
    capabilityDescription: string;
    private walletClient;
    private publicClient;
    private account;
    private currentChain;
    private solanaKeypair;
    private solanaConnection;
    private solanaCluster;
    private rpcUrl;
    private blockchainType;
    private evmWalletInitialized;
    private solanaWalletInitialized;
    constructor(runtime: IAgentRuntime);
    /**
     * Initialize the wallet service
     * This is called when the plugin starts
     */
    static start(runtime: IAgentRuntime): Promise<Service>;
    /**
     * Cleanup when the service stops
     */
    static stop(runtime: IAgentRuntime): Promise<void>;
    /**
     * Detects if a private key is for EVM or Solana blockchain
     *
     * @param privateKey - The private key string
     * @returns 'evm' if it's an EVM key (starts with 0x), 'solana' if it's Solana (base58), or null if unknown
     */
    private detectBlockchainType;
    /**
     * Creates a Solana wallet from a private key (base58 encoded)
     *
     * @param privateKey - The private key as a base58 string
     * @param cluster - Optional: Solana cluster (mainnet-beta, devnet, testnet) - defaults to mainnet-beta
     * @param rpcUrl - Optional: Custom RPC endpoint URL
     *
     * @returns The wallet public key (address) as a string
     *
     * Example:
     *   const address = await walletService.createSolanaWallet('base58...', 'mainnet-beta');
     */
    createSolanaWallet(privateKey: string, cluster?: Cluster, rpcUrl?: string): Promise<string>;
    /**
     * Creates a wallet from a private key (supports both EVM and Solana)
     *
     * @param privateKey - The private key (hex string for EVM, base58 for Solana)
     * @param chain - Optional: For EVM - The blockchain network (defaults to mainnet). For Solana - ignored.
     * @param rpcUrl - Optional: Custom RPC endpoint URL
     * @param blockchainType - Optional: Force blockchain type ('evm' or 'solana'). If not provided, auto-detects.
     * @param solanaCluster - Optional: For Solana - The cluster (mainnet-beta, devnet, testnet). Defaults to mainnet-beta.
     *
     * @returns The wallet address (public address)
     *
     * Example:
     *   // EVM wallet
     *   const address = await walletService.createWallet('0x1234...', mainnet);
     *
     *   // Solana wallet
     *   const address = await walletService.createWallet('base58...', undefined, undefined, 'solana');
     */
    createWallet(privateKey: string, chain?: Chain, rpcUrl?: string, blockchainType?: 'evm' | 'solana', solanaCluster?: Cluster): Promise<string>;
    /**
     * Gets the current wallet address (for backward compatibility)
     * Returns EVM address if available, otherwise Solana address
     *
     * @returns The wallet address (EVM address or Solana public key), or null if no wallet is loaded
     */
    getAddress(): string | null;
    /**
     * Gets the EVM wallet address
     *
     * @returns The EVM wallet address, or null if not initialized
     */
    getEvmAddress(): string | null;
    /**
     * Gets the Solana wallet address
     *
     * @returns The Solana wallet public key (address), or null if not initialized
     */
    getSolanaAddress(): string | null;
    /**
     * Gets the blockchain type (for backward compatibility)
     * Returns the primary blockchain type (EVM if available, otherwise Solana)
     *
     * @returns 'evm', 'solana', or null if no wallet is loaded
     */
    getBlockchainType(): 'evm' | 'solana' | null;
    /**
     * Checks if EVM wallet is initialized
     */
    hasEvmWallet(): boolean;
    /**
     * Checks if Solana wallet is initialized
     */
    hasSolanaWallet(): boolean;
    /**
     * Gets the wallet client for blockchain interactions
     *
     * @returns The wallet client, or null if not initialized
     */
    getWalletClient(): WalletClient | null;
    /**
     * Gets the public client for reading from blockchain
     *
     * @returns The public client, or null if not initialized
     */
    getPublicClient(): PublicClient | null;
    /**
     * Gets the current chain (network)
     *
     * @returns The current chain
     */
    getChain(): Chain;
    /**
     * Gets the Solana SOL balance
     *
     * @param address - Optional: Solana public key to check. If not provided, uses current wallet
     * @returns The balance in SOL (as a string, e.g., "1.5")
     *
     * Example:
     *   const balance = await walletService.getSolanaBalance();
     *   console.log(`Balance: ${balance} SOL`);
     */
    getSolanaBalance(address?: string): Promise<string>;
    /**
     * Gets the native token balance (ETH on Ethereum, SOL on Solana, etc.)
     *
     * @param address - Optional: Wallet address to check. If not provided, uses current wallet
     * @returns The balance as a string (e.g., "1.5")
     *
     * Example:
     *   const balance = await walletService.getNativeBalance();
     *   console.log(`Balance: ${balance} ETH or SOL`);
     */
    getNativeBalance(address?: string): Promise<string>;
    /**
     * Gets the balance of an ERC-20 token
     *
     * @param tokenAddress - The contract address of the ERC-20 token
     * @param address - Optional: Wallet address to check. If not provided, uses current wallet
     * @param decimals - Optional: Token decimals (defaults to 18, most tokens use 18)
     * @returns The balance as a string (e.g., "100.5")
     *
     * Example:
     *   // USDC on Ethereum (6 decimals)
     *   const usdcBalance = await walletService.getTokenBalance(
     *     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
     *     undefined,
     *     6
     *   );
     */
    getTokenBalance(tokenAddress: string, address?: string, decimals?: number): Promise<string>;
    /**
     * Gets both native and token balances in one call
     *
     * @param tokenAddresses - Array of ERC-20 token addresses to check
     * @param address - Optional: Wallet address to check
     * @returns Object with native balance and token balances
     *
     * Example:
     *   const balances = await walletService.getAllBalances([
     *     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
     *   ]);
     */
    getAllBalances(tokenAddresses?: string[], address?: string): Promise<{
        native: string;
        tokens: Record<string, string>;
    }>;
    /**
     * Gets the Solana connection for blockchain interactions
     *
     * @returns The Solana connection, or null if not initialized
     */
    getSolanaConnection(): Connection | null;
    /**
     * Gets the Solana keypair
     *
     * @returns The Solana keypair, or null if not initialized
     */
    getSolanaKeypair(): Keypair | null;
    stop(): Promise<void>;
}
//# sourceMappingURL=wallet-service.d.ts.map