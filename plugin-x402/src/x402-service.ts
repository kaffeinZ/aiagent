import { Service, logger, type IAgentRuntime } from '@elizaos/core';

/**
 * x402 Payment data structure
 */
export interface X402PaymentData {
  paymentId: string;
  amount: string;
  currency: string;
  recipient: string;
  status: 'pending' | 'completed' | 'failed';
  transactionHash?: string;
  timestamp: number;
}

/**
 * Service for managing x402 payment protocol operations on Solana blockchain
 * 
 * x402 is an open-source standard that uses HTTP 402 "Payment Required" 
 * status code to facilitate on-chain payments for APIs and autonomous agents.
 * 
 * This implementation is configured for Solana blockchain, enabling fast,
 * low-cost payments with ~200ms settlement times.
 * 
 * Security Note: This service requires secure private key management.
 * Use version 2.1.0+ of the x402 SDK to avoid known vulnerabilities.
 */
export class X402Service extends Service {
  static override serviceType = 'x402';

  override capabilityDescription =
    'Manages x402 payment protocol operations on Solana blockchain, enabling fast on-chain payments via HTTP 402 status code.';

  private privateKey: string | undefined;
  private rpcUrl: string | undefined;
  private cluster: 'mainnet-beta' | 'devnet' | 'testnet' = 'mainnet-beta'; // Solana cluster
  private initialized: boolean = false;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    // Prioritize SOLANA_PRIVATE_KEY (standard) over X402_PRIVATE_KEY (plugin-specific)
    // PRIVATE_KEY is reserved for EVM chains
    this.privateKey = process.env.SOLANA_PRIVATE_KEY?.trim() || process.env.X402_PRIVATE_KEY?.trim();
    this.rpcUrl = process.env.SOLANA_RPC_URL?.trim() || process.env.X402_RPC_URL?.trim();
    
    // Set Solana cluster (default: mainnet-beta)
    // Prioritize SOLANA_CLUSTER (standard) over X402_SOLANA_CLUSTER (plugin-specific)
    const clusterEnv = process.env.SOLANA_CLUSTER?.trim() || process.env.X402_SOLANA_CLUSTER?.trim();
    if (clusterEnv && ['mainnet-beta', 'devnet', 'testnet'].includes(clusterEnv)) {
      this.cluster = clusterEnv as 'mainnet-beta' | 'devnet' | 'testnet';
    }
    
    // Default RPC URL if not provided
    if (!this.rpcUrl) {
      this.rpcUrl = this.cluster === 'mainnet-beta' 
        ? 'https://api.mainnet-beta.solana.com'
        : `https://api.${this.cluster}.solana.com`;
    }
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting X402Service');
    const service = new X402Service(runtime);
    
    // Initialize x402 SDK if private key is available
    if (service.privateKey) {
      try {
        // TODO: Initialize x402 SDK with private key and RPC URL
        // This will be implemented once we verify the exact SDK API
        service.initialized = true;
        logger.info('X402Service initialized with private key');
      } catch (error) {
        logger.warn({ 
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to initialize X402Service - will continue without payment capabilities');
      }
    } else {
      logger.warn('X402Service started without private key - payment operations will be unavailable');
    }
    
    return service;
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping X402Service');
    const service = runtime.getService(X402Service.serviceType);
    if (!service) {
      throw new Error('X402Service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('X402Service stopped');
    this.initialized = false;
  }

  /**
   * Check if the service is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized && !!this.privateKey;
  }

  /**
   * Make a payment using x402 protocol on Solana
   * @param amount - Amount to pay (in lamports or smallest unit)
   * @param recipient - Recipient Solana address (base58)
   * @param currency - Currency/token address (default: native SOL)
   * @returns Payment data with transaction signature
   */
  async makePayment(
    amount: string,
    recipient: string,
    currency?: string
  ): Promise<X402PaymentData> {
    if (!this.isInitialized()) {
      throw new Error('X402Service not initialized. Please configure SOLANA_PRIVATE_KEY (or X402_PRIVATE_KEY) for Solana operations.');
    }

    try {
      // TODO: Implement actual x402 payment using SDK
      // This is a placeholder structure
      logger.info({ amount, recipient, currency }, 'Making x402 payment');
      
      // Placeholder implementation
      const paymentData: X402PaymentData = {
        paymentId: `x402_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        amount,
        currency: currency || 'native',
        recipient,
        status: 'pending',
        timestamp: Date.now(),
      };

      // In real implementation, this would:
      // 1. Create payment request using x402 SDK for Solana
      // 2. Sign transaction with Solana private key (base58)
      // 3. Send transaction to Solana network
      // 4. Wait for confirmation
      // 5. Return transaction signature

      return paymentData;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        amount,
        recipient
      }, 'Failed to make x402 payment');
      throw error;
    }
  }

  /**
   * Request a payment (as a merchant/service provider)
   * @param amount - Amount to request
   * @param currency - Currency/token address
   * @param description - Payment description
   * @returns Payment request data
   */
  async requestPayment(
    amount: string,
    currency: string,
    description?: string
  ): Promise<{ paymentRequest: string; paymentId: string }> {
    if (!this.isInitialized()) {
      throw new Error('X402Service not initialized. Please configure SOLANA_PRIVATE_KEY (or X402_PRIVATE_KEY) for Solana operations.');
    }

    try {
      logger.info({ amount, currency, description }, 'Creating x402 payment request');
      
      // TODO: Implement actual x402 payment request using SDK for Solana
      // This would generate a payment request that can be sent to clients
      // The client would then make the payment on Solana and retry the original request

      const paymentId = `x402_req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // In real implementation, this would:
      // 1. Create payment request using x402 SDK
      // 2. Generate payment instructions
      // 3. Return payment request URL/data

      return {
        paymentRequest: `x402://payment/${paymentId}?amount=${amount}&currency=${currency}`,
        paymentId,
      };
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        amount,
        currency
      }, 'Failed to create x402 payment request');
      throw error;
    }
  }

  /**
   * Check payment status
   * @param paymentId - Payment ID to check
   * @returns Payment status data
   */
  async checkPaymentStatus(paymentId: string): Promise<X402PaymentData> {
    if (!this.isInitialized()) {
      throw new Error('X402Service not initialized. Please configure SOLANA_PRIVATE_KEY (or X402_PRIVATE_KEY) for Solana operations.');
    }

    try {
      logger.info({ paymentId }, 'Checking x402 payment status');
      
      // TODO: Implement actual payment status check using SDK
      // This would query the Solana blockchain or x402 service for payment status

      // Placeholder implementation
      const paymentData: X402PaymentData = {
        paymentId,
        amount: '0',
        currency: 'native',
        recipient: '',
        status: 'pending',
        timestamp: Date.now(),
      };

      return paymentData;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        paymentId
      }, 'Failed to check x402 payment status');
      throw error;
    }
  }

  /**
   * Get service configuration info (without exposing sensitive data)
   */
  getConfigInfo(): { initialized: boolean; blockchain: string; cluster: string; hasRpc: boolean } {
    return {
      initialized: this.isInitialized(),
      blockchain: 'solana',
      cluster: this.cluster,
      hasRpc: !!this.rpcUrl,
    };
  }
  
  /**
   * Get the Solana cluster being used
   */
  getCluster(): 'mainnet-beta' | 'devnet' | 'testnet' {
    return this.cluster;
  }
  
  /**
   * Get the RPC URL being used
   */
  getRpcUrl(): string | undefined {
    return this.rpcUrl;
  }
}

