/// <reference path="./@elizaos-core.d.ts" />
import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  type WalletClient, 
  type PublicClient,
  formatEther,
  formatUnits,
} from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { mainnet, type Chain } from 'viem/chains';
import { erc20Abi } from 'viem';
// Solana imports
import { 
  Keypair, 
  Connection, 
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  Cluster,
} from '@solana/web3.js';
// bs58 for Solana key encoding/decoding
// The module exports as { default: { decode, encode } }
function getBs58Sync() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bs58Raw = require('bs58');
  
  // bs58 exports as { default: { decode, encode } } in some module systems
  if (bs58Raw.default && typeof bs58Raw.default.decode === 'function') {
    return bs58Raw.default;
  } else if (typeof bs58Raw.decode === 'function') {
    return bs58Raw;
  } else {
    throw new Error('bs58 module format not recognized. Available keys: ' + Object.keys(bs58Raw).join(', '));
  }
}

/**
 * WalletService - Manages cryptocurrency wallets and blockchain interactions
 * 
 * This service handles:
 * - Creating and managing wallet accounts from private keys
 * - Connecting to blockchain networks (Ethereum, Polygon, etc.)
 * - Reading wallet balances
 * - Preparing transactions for signing
 */
export class WalletService extends Service {
  static override serviceType = 'wallet';

  override capabilityDescription =
    'Manages cryptocurrency wallets, handles blockchain connections, and prepares transactions for trading.';

  // ===== EVM (Ethereum) Properties =====
  // Store the wallet client for blockchain interactions (for sending transactions)
  private walletClient: WalletClient | null = null;
  
  // Store the public client for reading from blockchain (for checking balances)
  private publicClient: PublicClient | null = null;
  
  // Store the current EVM account (wallet)
  private account: PrivateKeyAccount | null = null;
  
  // Store the current EVM chain (network) we're connected to
  private currentChain: Chain = mainnet;
  
  // ===== Solana Properties =====
  // Store the Solana keypair (wallet)
  private solanaKeypair: Keypair | null = null;
  
  // Store the Solana connection
  private solanaConnection: Connection | null = null;
  
  // Store the Solana cluster (mainnet-beta, devnet, testnet)
  private solanaCluster: Cluster = 'mainnet-beta';
  
  // ===== Common Properties =====
  // Store the RPC URL for creating clients
  private rpcUrl: string | undefined = undefined;
  
  // Store the blockchain type (evm or solana) - for backward compatibility
  // Note: We now support both wallets simultaneously
  private blockchainType: 'evm' | 'solana' | null = null;
  
  // Track which wallets are initialized
  private evmWalletInitialized: boolean = false;
  private solanaWalletInitialized: boolean = false;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * Initialize the wallet service
   * This is called when the plugin starts
   */
  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('[plugin-trader] Starting Wallet Service');
    const service = new WalletService(runtime);
    
    const mainnet = (await import('viem/chains')).mainnet;
    
    // Initialize EVM wallet if PRIVATE_KEY is provided (EVM format)
    const evmPrivateKey = process.env.PRIVATE_KEY?.trim();
    if (evmPrivateKey && evmPrivateKey.startsWith('0x') && evmPrivateKey.length === 66) {
      try {
        logger.info('[plugin-trader] Auto-initializing EVM wallet from PRIVATE_KEY');
        
        // Validate RPC URL - skip if it contains placeholder text
        let rpcUrl = process.env.RPC_URL?.trim();
        if (rpcUrl && (
          rpcUrl.includes('YOUR_PROJECT_ID') || 
          rpcUrl.includes('YOUR_API_KEY') ||
          rpcUrl.includes('YOUR_ENDPOINT') ||
          rpcUrl.includes('placeholder')
        )) {
          logger.warn({ 
            rpcUrl,
            reason: 'RPC URL contains placeholder text, will use default public RPC'
          }, '[plugin-trader] Invalid RPC URL detected, using default');
          rpcUrl = undefined; // Use default public RPC
        }
        
        await service.createWallet(
          evmPrivateKey,
          mainnet,
          rpcUrl,
          'evm',
          'mainnet-beta' // Ignored for EVM
        );
        
        const address = service.getEvmAddress();
        logger.info({ 
          address,
          blockchainType: 'evm'
        }, '[plugin-trader] EVM wallet auto-initialized successfully');
      } catch (error) {
        logger.warn({ 
          error: error instanceof Error ? error.message : String(error)
        }, '[plugin-trader] Failed to auto-initialize EVM wallet, will continue without EVM wallet');
      }
    }
    
    // Initialize Solana wallet if SOLANA_PRIVATE_KEY is provided
    const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY?.trim();
    if (solanaPrivateKey) {
      try {
        logger.info('[plugin-trader] Auto-initializing Solana wallet from SOLANA_PRIVATE_KEY');
        
        const solanaCluster = (process.env.SOLANA_CLUSTER?.trim() || 'mainnet-beta') as 'mainnet-beta' | 'devnet' | 'testnet';
        const solanaRpcUrl = process.env.SOLANA_RPC_URL?.trim();
        
        await service.createWallet(
          solanaPrivateKey,
          mainnet, // Ignored for Solana
          solanaRpcUrl,
          'solana',
          solanaCluster
        );
        
        const address = service.getSolanaAddress();
        logger.info({ 
          address,
          blockchainType: 'solana',
          cluster: solanaCluster
        }, '[plugin-trader] Solana wallet auto-initialized successfully');
      } catch (error) {
        logger.warn({ 
          error: error instanceof Error ? error.message : String(error)
        }, '[plugin-trader] Failed to auto-initialize Solana wallet, will continue without Solana wallet');
      }
    }
    
      // Also check if PRIVATE_KEY is Solana format (for backward compatibility)
      if (evmPrivateKey && !evmPrivateKey.startsWith('0x')) {
        try {
          // Try to decode as base58 - if it works, it might be Solana
          const bs58 = getBs58Sync();
          const decoded = bs58.decode(evmPrivateKey);
          if (decoded.length === 64 && !service.hasSolanaWallet()) {
          logger.info('[plugin-trader] PRIVATE_KEY appears to be Solana format, initializing Solana wallet');
          const solanaCluster = (process.env.SOLANA_CLUSTER?.trim() || 'mainnet-beta') as 'mainnet-beta' | 'devnet' | 'testnet';
          await service.createWallet(
            evmPrivateKey,
            mainnet,
            undefined,
            'solana',
            solanaCluster
          );
          logger.info({ 
            address: service.getSolanaAddress()
          }, '[plugin-trader] Solana wallet initialized from PRIVATE_KEY');
        }
      } catch {
        // Not Solana format, ignore
      }
    }
    
    if (!service.hasEvmWallet() && !service.hasSolanaWallet()) {
      logger.info('[plugin-trader] No wallets initialized. Configure PRIVATE_KEY (EVM) or SOLANA_PRIVATE_KEY (Solana) to enable wallet features.');
    }
    
    return service;
  }

  /**
   * Cleanup when the service stops
   */
  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping Wallet Service');
    const service = runtime.getService<WalletService>(WalletService.serviceType);
    if (service) {
      await service.stop();
    }
  }

  /**
   * Detects if a private key is for EVM or Solana blockchain
   * 
   * @param privateKey - The private key string
   * @returns 'evm' if it's an EVM key (starts with 0x), 'solana' if it's Solana (base58), or null if unknown
   */
  private detectBlockchainType(privateKey: string): 'evm' | 'solana' | null {
    // EVM keys start with 0x and are 66 characters (0x + 64 hex chars)
    if (privateKey.startsWith('0x') && privateKey.length === 66) {
      return 'evm';
    }
    
    // Solana keys are base58 encoded, typically 88 characters
    // Try to decode it - if it works, it's likely Solana
    try {
      const bs58 = getBs58Sync();
      const decoded = bs58.decode(privateKey.trim());
      // Solana secret keys are 64 bytes
      if (decoded.length === 64) {
        return 'solana';
      }
    } catch {
      // Not valid base58, so not Solana
    }
    
    return null;
  }

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
  async createSolanaWallet(
    privateKey: string,
    cluster: Cluster = 'mainnet-beta',
    rpcUrl?: string
  ): Promise<string> {
    try {
      logger.info('Creating Solana wallet from private key');

      // Step 1: Try to parse the private key in different formats
      let secretKey: Uint8Array;
      const trimmedKey = privateKey.trim();
      
      // Try parsing as JSON array first (some wallets export keys this way)
      try {
        const parsed = JSON.parse(trimmedKey);
        if (Array.isArray(parsed) && parsed.length === 64) {
          secretKey = new Uint8Array(parsed);
          logger.info('Parsed Solana key as JSON array');
        } else {
          throw new Error('Not a valid JSON array');
        }
      } catch {
        // Not JSON, try base58
        try {
          const bs58 = getBs58Sync();
          secretKey = bs58.decode(trimmedKey);
          logger.info({ 
            keyLength: trimmedKey.length,
            decodedLength: secretKey.length 
          }, 'Parsed Solana key as base58');
        } catch (error) {
          logger.error({ 
            privateKeyLength: trimmedKey.length,
            privateKeyPrefix: trimmedKey.substring(0, 20),
            privateKeySuffix: trimmedKey.substring(trimmedKey.length - 10),
            error: error instanceof Error ? error.message : String(error)
          }, 'Failed to decode Solana private key');
          throw new Error(
            'Invalid Solana private key format. ' +
            'Expected one of:\n' +
            '1. Base58 encoded string (typically 87-88 characters, decodes to 64 bytes)\n' +
            '2. JSON array format: [1,2,3,...] with 64 numbers\n\n' +
            `Your key length: ${trimmedKey.length} characters\n` +
            `Key preview: ${trimmedKey.substring(0, 30)}...\n\n` +
            'Please verify your SOLANA_PRIVATE_KEY is correct.'
          );
        }
      }

      // Step 2: Validate secret key length (Solana keys are 64 bytes)
      if (secretKey.length !== 64) {
        throw new Error(
          `Solana private key must be 64 bytes when decoded, got ${secretKey.length} bytes. ` +
          'Please check your SOLANA_PRIVATE_KEY format.'
        );
      }

      // Step 3: Create the keypair from secret key
      this.solanaKeypair = Keypair.fromSecretKey(secretKey);

      logger.info({ 
        publicKey: this.solanaKeypair.publicKey.toBase58() 
      }, 'Solana wallet keypair created');

      // Step 4: Set the cluster
      this.solanaCluster = cluster;

      // Step 5: Create the Solana connection
      // Use custom RPC URL if provided, otherwise use cluster API URL
      const connectionUrl = rpcUrl || clusterApiUrl(cluster);
      this.solanaConnection = new Connection(connectionUrl, 'confirmed');

      logger.info({ 
        publicKey: this.solanaKeypair.publicKey.toBase58(),
        cluster: this.solanaCluster,
        rpcUrl: connectionUrl
      }, 'Solana wallet initialized');

      this.solanaWalletInitialized = true;

      // Return the public key (address) as a string
      return this.solanaKeypair.publicKey.toBase58();
    } catch (error) {
      logger.error({ error }, 'Failed to create Solana wallet');
      throw new Error(
        `Failed to create Solana wallet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

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
  async createWallet(
    privateKey: string,
    chain: Chain = mainnet,
    rpcUrl?: string,
    blockchainType?: 'evm' | 'solana',
    solanaCluster: Cluster = 'mainnet-beta'
  ): Promise<string> {
    try {
      logger.info('Creating wallet from private key');

      // Step 1: Detect blockchain type if not explicitly provided
      const detectedType = blockchainType || this.detectBlockchainType(privateKey);
      
      if (!detectedType) {
        throw new Error(
          'Could not detect blockchain type. Private key must be either:\n' +
          '- EVM: hex string starting with 0x (66 characters)\n' +
          '- Solana: base58 encoded string (64 bytes when decoded)'
        );
      }

      // Step 2: Route to appropriate wallet creation method
      if (detectedType === 'solana') {
        // Don't overwrite blockchainType if EVM is already initialized
        if (!this.evmWalletInitialized) {
          this.blockchainType = 'solana';
        }
        const address = await this.createSolanaWallet(privateKey, solanaCluster, rpcUrl);
        this.solanaWalletInitialized = true;
        return address;
      } else {
        // EVM wallet creation
        // Don't overwrite blockchainType if Solana is already initialized
        if (!this.solanaWalletInitialized) {
          this.blockchainType = 'evm';
        }
        
        // Validate the private key format for EVM
        if (!privateKey.startsWith('0x')) {
          throw new Error('EVM private key must start with 0x');
        }
        if (privateKey.length !== 66) {
          // 0x + 64 hex characters = 66 total
          throw new Error('EVM private key must be 64 hex characters (32 bytes)');
        }

        // Convert private key to an account
        // This creates a wallet account with address and signing capabilities
        this.account = privateKeyToAccount(privateKey as `0x${string}`);

        logger.info({ address: this.account.address }, 'EVM wallet account created');

        // Set the current chain
        this.currentChain = chain;

        // Store RPC URL
        this.rpcUrl = rpcUrl;

        // Validate RPC URL - if it contains placeholder text, use default public RPC
        const isValidRpcUrl = rpcUrl && 
          !rpcUrl.includes('YOUR_PROJECT_ID') && 
          !rpcUrl.includes('YOUR_API_KEY') &&
          !rpcUrl.includes('YOUR_ENDPOINT') &&
          !rpcUrl.includes('placeholder');
        
        const effectiveRpcUrl = isValidRpcUrl ? rpcUrl : undefined;
        
        if (rpcUrl && !isValidRpcUrl) {
          logger.warn({ 
            rpcUrl,
            reason: 'RPC URL contains placeholder text, using default public RPC'
          }, '[plugin-trader] Invalid RPC URL detected');
        }

        // Create the wallet client (for sending transactions)
        // This is what we use to send transactions and sign
        this.walletClient = createWalletClient({
          account: this.account,
          chain: this.currentChain,
          transport: effectiveRpcUrl ? http(effectiveRpcUrl) : http(), // Use custom RPC or default
        });

        // Create the public client (for reading from blockchain)
        // This is what we use to read balances and query the chain
        this.publicClient = createPublicClient({
          chain: this.currentChain,
          transport: effectiveRpcUrl ? http(effectiveRpcUrl) : http(),
        });

        logger.info({ 
          address: this.account.address,
          chain: this.currentChain.name 
        }, 'EVM wallet client initialized');

        this.evmWalletInitialized = true;
        
        // Return the wallet address so we know what address was created
        return this.account.address;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to create wallet');
      throw new Error(
        `Failed to create wallet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gets the current wallet address (for backward compatibility)
   * Returns EVM address if available, otherwise Solana address
   * 
   * @returns The wallet address (EVM address or Solana public key), or null if no wallet is loaded
   */
  getAddress(): string | null {
    // Prefer EVM if available, otherwise Solana
    if (this.evmWalletInitialized && this.account) {
      return this.account.address;
    }
    if (this.solanaWalletInitialized && this.solanaKeypair) {
      return this.solanaKeypair.publicKey.toBase58();
    }
    return null;
  }

  /**
   * Gets the EVM wallet address
   * 
   * @returns The EVM wallet address, or null if not initialized
   */
  getEvmAddress(): string | null {
    return this.account?.address ?? null;
  }

  /**
   * Gets the Solana wallet address
   * 
   * @returns The Solana wallet public key (address), or null if not initialized
   */
  getSolanaAddress(): string | null {
    return this.solanaKeypair?.publicKey.toBase58() ?? null;
  }

  /**
   * Gets the blockchain type (for backward compatibility)
   * Returns the primary blockchain type (EVM if available, otherwise Solana)
   * 
   * @returns 'evm', 'solana', or null if no wallet is loaded
   */
  getBlockchainType(): 'evm' | 'solana' | null {
    if (this.evmWalletInitialized) return 'evm';
    if (this.solanaWalletInitialized) return 'solana';
    return null;
  }

  /**
   * Checks if EVM wallet is initialized
   */
  hasEvmWallet(): boolean {
    return this.evmWalletInitialized;
  }

  /**
   * Checks if Solana wallet is initialized
   */
  hasSolanaWallet(): boolean {
    return this.solanaWalletInitialized;
  }

  /**
   * Gets the wallet client for blockchain interactions
   * 
   * @returns The wallet client, or null if not initialized
   */
  getWalletClient(): WalletClient | null {
    return this.walletClient;
  }

  /**
   * Gets the public client for reading from blockchain
   * 
   * @returns The public client, or null if not initialized
   */
  getPublicClient(): PublicClient | null {
    return this.publicClient;
  }

  /**
   * Gets the current chain (network)
   * 
   * @returns The current chain
   */
  getChain(): Chain {
    return this.currentChain;
  }

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
  async getSolanaBalance(address?: string): Promise<string> {
    try {
      if (!this.solanaConnection) {
        throw new Error('Solana connection not initialized. Call createWallet() first.');
      }

      // Use provided address or current wallet public key
      if (!this.solanaKeypair && !address) {
        throw new Error('No Solana wallet available. Call createWallet() first or provide an address.');
      }
      
      const targetPublicKey = address 
        ? new PublicKey(address)
        : this.solanaKeypair!.publicKey;

      logger.info({ 
        publicKey: targetPublicKey.toBase58() 
      }, 'Checking Solana SOL balance');

      // Get the balance from Solana
      // getBalance returns the balance in lamports (smallest unit)
      const balanceInLamports = await this.solanaConnection.getBalance(targetPublicKey);

      // Convert from lamports to SOL
      // LAMPORTS_PER_SOL = 1,000,000,000 (1 billion lamports = 1 SOL)
      const balanceInSol = (balanceInLamports / LAMPORTS_PER_SOL).toFixed(9);

      logger.info({ 
        publicKey: targetPublicKey.toBase58(),
        balance: balanceInSol,
        cluster: this.solanaCluster 
      }, 'Solana balance retrieved');

      return balanceInSol;
    } catch (error) {
      logger.error({ error }, 'Failed to get Solana balance');
      throw new Error(
        `Failed to get Solana balance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

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
  async getNativeBalance(address?: string): Promise<string> {
    // Route to appropriate method based on blockchain type
    if (this.blockchainType === 'solana') {
      return await this.getSolanaBalance(address);
    }
    
    // EVM balance checking
    try {
      if (!this.publicClient) {
        throw new Error('Public client not initialized. Call createWallet() first.');
      }

      // Use provided address or current wallet address
      if (!this.account && !address) {
        throw new Error('No wallet address available. Call createWallet() first or provide an address.');
      }
      const targetAddress = (address || this.account!.address) as `0x${string}`;

      logger.info({ address: targetAddress }, 'Checking native token balance');

      // Read the balance from the blockchain
      // getBalance returns the balance in wei (smallest unit)
      const balance = await this.publicClient.getBalance({
        address: targetAddress,
      });

      // Convert from wei to ETH (or native token)
      // formatEther converts: 1000000000000000000 wei → "1.0" ETH
      const balanceInEth = formatEther(balance);

      logger.info({ 
        address: targetAddress,
        balance: balanceInEth,
        chain: this.currentChain.name 
      }, 'Native balance retrieved');

      return balanceInEth;
    } catch (error) {
      logger.error({ error }, 'Failed to get native balance');
      throw new Error(
        `Failed to get native balance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

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
  async getTokenBalance(
    tokenAddress: string,
    address?: string,
    decimals: number = 18
  ): Promise<string> {
    try {
      if (!this.publicClient) {
        throw new Error('Public client not initialized. Call createWallet() first.');
      }

      // Use provided address or current wallet address
      if (!this.account && !address) {
        throw new Error('No wallet address available. Call createWallet() first or provide an address.');
      }
      const targetAddress = (address || this.account!.address) as `0x${string}`;

      logger.info({ 
        tokenAddress,
        address: targetAddress 
      }, 'Checking ERC-20 token balance');

      // Call the ERC-20 contract's balanceOf function
      // This reads the token balance from the smart contract
      const balance = await this.publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi, // Standard ERC-20 ABI (Application Binary Interface)
        functionName: 'balanceOf',
        args: [targetAddress],
      });

      // Convert from token's smallest unit to human-readable format
      // formatUnits converts based on decimals: 1000000 (6 decimals) → "1.0"
      const balanceFormatted = formatUnits(balance, decimals);

      logger.info({ 
        tokenAddress,
        address: targetAddress,
        balance: balanceFormatted,
        decimals 
      }, 'Token balance retrieved');

      return balanceFormatted;
    } catch (error) {
      logger.error({ error }, 'Failed to get token balance');
      throw new Error(
        `Failed to get token balance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

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
  async getAllBalances(
    tokenAddresses: string[] = [],
    address?: string
  ): Promise<{
    native: string;
    tokens: Record<string, string>;
  }> {
    try {
      // Get native balance
      const nativeBalance = await this.getNativeBalance(address);

      // Get all token balances in parallel (faster)
      const tokenBalances: Record<string, string> = {};
      
      if (tokenAddresses.length > 0) {
        const balancePromises = tokenAddresses.map(async (tokenAddress) => {
          try {
            const balance = await this.getTokenBalance(tokenAddress, address);
            return { tokenAddress, balance };
          } catch (error) {
            logger.warn({ tokenAddress, error }, 'Failed to get token balance');
            return { tokenAddress, balance: '0' };
          }
        });

        const results = await Promise.all(balancePromises);
        results.forEach(({ tokenAddress, balance }) => {
          tokenBalances[tokenAddress] = balance;
        });
      }

      return {
        native: nativeBalance,
        tokens: tokenBalances,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get all balances');
      throw error;
    }
  }

  /**
   * Gets the Solana connection for blockchain interactions
   * 
   * @returns The Solana connection, or null if not initialized
   */
  getSolanaConnection(): Connection | null {
    return this.solanaConnection;
  }

  /**
   * Gets the Solana keypair
   * 
   * @returns The Solana keypair, or null if not initialized
   */
  getSolanaKeypair(): Keypair | null {
    return this.solanaKeypair;
  }

  override async stop(): Promise<void> {
    logger.info('Wallet Service stopped');
    // Clean up EVM connections
    this.walletClient = null;
    this.publicClient = null;
    this.account = null;
    // Clean up Solana connections
    this.solanaConnection = null;
    this.solanaKeypair = null;
    // Clean up common properties
    this.rpcUrl = undefined;
    this.blockchainType = null;
  }
}
