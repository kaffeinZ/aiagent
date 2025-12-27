# Plugin x402 - x402 Payment Protocol for ElizaOS

A plugin for ElizaOS that enables on-chain payments using the x402 protocol. x402 is an open-source standard developed by Coinbase that utilizes the HTTP 402 "Payment Required" status code to facilitate seamless, pay-per-use transactions for APIs, websites, and autonomous agents.

## Overview

The x402 protocol enables:
- **Native Internet Payments**: No logins or sharing personal financial data required
- **Zero Protocol Fees**: Only minimal blockchain network fees (often <$0.0001 on L2s)
- **Fast Settlement**: Transactions settle in ~200ms vs days for credit cards
- **No Chargebacks**: On-chain settlements are final
- **Machine-Native**: Designed for autonomous agents and APIs

## What's Included

This plugin provides:
- ✅ **X402Service**: Manages x402 payment protocol operations
- ✅ **MAKE_PAYMENT Action**: Execute on-chain payments
- ✅ **REQUEST_PAYMENT Action**: Create payment requests (as merchant/service provider)
- ✅ **CHECK_PAYMENT_STATUS Action**: Check payment transaction status
- ✅ **API Routes**: REST endpoints for payment operations

## Required Configuration

### 1. Environment Variables

Add these to your `.env` file or environment:

#### Required for Payment Operations:
```bash
# Private key for x402 payment operations on Solana (REQUIRED for payment operations)
# Format: base58 encoded string (64 bytes when decoded) - Solana format
# Note: PRIVATE_KEY is reserved for EVM chains, use SOLANA_PRIVATE_KEY for Solana
SOLANA_PRIVATE_KEY=your_base58_encoded_solana_private_key_here
# OR (plugin-specific alias)
X402_PRIVATE_KEY=your_base58_encoded_solana_private_key_here
```

#### Optional Configuration:
```bash
# Optional: Solana RPC URL for blockchain interactions
# If not provided, will use default public RPC (may be rate-limited)
# Examples:
# - Public RPC: https://api.mainnet-beta.solana.com (rate-limited)
# - Helius: https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
# - QuickNode: https://YOUR_ENDPOINT.solana-mainnet.quiknode.pro/YOUR_KEY/
# - Alchemy: https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# OR (plugin-specific alias)
X402_RPC_URL=https://api.mainnet-beta.solana.com

# Optional: Solana cluster (defaults to 'mainnet-beta')
# Options: 'mainnet-beta', 'devnet', 'testnet'
SOLANA_CLUSTER=mainnet-beta
# OR (plugin-specific alias)
X402_SOLANA_CLUSTER=mainnet-beta
```

### 2. Plugin Registration

Register the plugin in your agent configuration:

```typescript
// src/index.ts or your character configuration
import { x402Plugin } from './plugin-x402';

export default {
  // ... other config
  plugins: [
    // ... other plugins
    x402Plugin,
  ],
};
```

## Security Best Practices

⚠️ **IMPORTANT**: x402 protocol requires secure private key management. Follow these security practices:

### 1. Use Latest SDK Version
- Always use `@coinbase/x402` version **2.1.0 or higher**
- Earlier versions (before 0.5.2) had vulnerabilities that could expose sensitive endpoints
- The plugin automatically uses the latest version from package.json

### 2. Secure Key Management
- **NEVER** commit private keys to version control
- Use environment variables or secure secret management systems
- Consider using Hardware Security Modules (HSMs) or secure enclaves for production
- For high-value operations, use hardware wallets or multi-sig solutions

### 3. Network Security
- Use secure RPC endpoints (not public rate-limited endpoints) in production
- Implement rate limiting on payment endpoints
- Monitor for suspicious activity
- Use HTTPS for all API communications

### 4. Testing
- Test thoroughly in a development/testnet environment first
- Use testnet private keys for development
- Never use production keys in development environments

### 5. Regular Updates
- Keep the x402 SDK updated to the latest version
- Monitor for security advisories
- Conduct periodic security audits

## How It Works

### 1. Service Initialization

When the plugin initializes:
1. It reads `SOLANA_PRIVATE_KEY` (or `X402_PRIVATE_KEY` as fallback) from environment
2. Validates the private key format (Solana: base58 encoded, 64 bytes when decoded)
3. Initializes the X402Service with the Solana private key
4. Connects to the specified Solana cluster (default: mainnet-beta)

### 2. Making Payments

The agent can make payments using natural language:
- "Pay 0.1 SOL to 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
- "Send 1000000 lamports to 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM using x402"

The plugin will:
1. Extract amount and recipient Solana address from the message
2. Create a payment transaction on Solana
3. Sign and send the transaction using the Solana private key
4. Return payment ID and transaction signature

### 3. Requesting Payments

As a service provider, you can create payment requests:
- "Create a payment request for $10"
- "Request payment for 0.1 SOL"

The plugin will:
1. Generate a payment request
2. Return a payment request URL/data
3. Clients can fulfill the payment and retry the original request

### 4. Checking Payment Status

Check the status of any payment:
- "Check payment status for x402_1234567890_abc123"

The plugin will:
1. Query the Solana blockchain for payment status
2. Return current status, transaction signature, and details

## API Endpoints

The plugin exposes REST API endpoints:

### GET `/api/x402/status`
Get plugin and service status.

**Response:**
```json
{
  "status": "ok",
  "plugin": "plugin-x402",
  "service": {
    "initialized": true,
    "blockchain": "solana",
    "cluster": "mainnet-beta",
    "hasRpc": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET `/api/x402/payment/:paymentId`
Get payment status by payment ID.

**Response:**
```json
{
  "success": true,
  "payment": {
    "paymentId": "x402_1234567890_abc123",
    "amount": "100000000000000000",
    "currency": "native",
    "recipient": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "status": "completed",
    "transactionHash": "5j7s8K9L...", // Solana transaction signature
    "timestamp": 1234567890
  }
}
```

## Development Commands

```bash
# Install dependencies
bun install

# Start in development mode with hot reload
bun run dev

# Start in production mode
bun run start

# Build the plugin
bun run build

# Run tests
bun test

# Format code
bun run format
```

## Testing

The plugin includes comprehensive tests:

```bash
# Run all tests
bun test

# Run component tests
bun test src/__tests__/plugin.test.ts

# Run E2E tests
elizaos test e2e
```

## Troubleshooting

### Service Not Initialized
**Error**: "X402 service not initialized"

**Solution**: 
- Ensure `SOLANA_PRIVATE_KEY` is set in your environment (or `X402_PRIVATE_KEY` as fallback)
- Verify the private key format (Solana: base58 encoded, 64 bytes when decoded)
- Note: `PRIVATE_KEY` is reserved for EVM chains - use `SOLANA_PRIVATE_KEY` for Solana
- Check that the plugin is properly registered in your agent configuration

### Payment Failed
**Error**: "Failed to make payment"

**Solutions**:
- Check that you have sufficient balance for the payment
- Verify the recipient Solana address is valid (base58 format)
- Ensure the Solana RPC endpoint is accessible and not rate-limited
- Check network connectivity
- Verify you have sufficient SOL balance for the payment and transaction fees

### Invalid Configuration
**Error**: "Invalid plugin configuration"

**Solutions**:
- Verify all environment variables are set correctly
- Check that `X402_RPC_URL` or `SOLANA_RPC_URL` is a valid URL (if provided)
- Ensure `X402_SOLANA_CLUSTER` or `SOLANA_CLUSTER` is one of: 'mainnet-beta', 'devnet', 'testnet' (if provided)

## Limitations and Notes

1. **SDK Integration**: The current implementation includes placeholder code for x402 SDK integration on Solana. You may need to update the `X402Service` methods (`makePayment`, `requestPayment`, `checkPaymentStatus`) with the actual SDK API calls once you verify the exact SDK API.

2. **Blockchain**: This plugin is configured specifically for Solana blockchain. The x402 protocol on Solana enables fast, low-cost payments with ~200ms settlement times.

3. **Token Support**: The current implementation focuses on native SOL payments. SPL token support may require additional implementation.

## Resources

- [x402 Protocol Documentation](https://x402.gitbook.io/x402/)
- [x402 SDK (npm)](https://www.npmjs.com/package/@coinbase/x402)
- [Solana Documentation](https://docs.solana.com/)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [ElizaOS Documentation](https://elizaos.ai)

## License

This plugin is part of the ElizaOS project.

## Security Advisories

- **CVE-2023-xxx**: x402 SDK versions before 0.5.2 had vulnerabilities. Always use version 2.1.0+.
- Monitor [GitHub Security Advisories](https://github.com/coinbase/x402/security/advisories) for updates.

## Support

For issues and questions:
- Open an issue on the plugin repository
- Check the [ElizaOS Discord](https://discord.gg/elizaos)
- Review the [x402 Protocol FAQ](https://x402.gitbook.io/x402/faq)
