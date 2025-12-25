# Solana Plugin Setup Guide

This guide explains how to configure and use the `@elizaos/plugin-solana` plugin to enable your agent to interact with the Solana blockchain.

## What's Included

The Solana plugin provides:
- ✅ **Token Operations**: Create, transfer, and manage tokens
- ✅ **Trading Operations**: Execute swaps using Jupiter aggregator
- ✅ **Portfolio Management**: Track balances and portfolio analytics
- ✅ **DeFi Integration**: Liquidity analysis, market making, yield optimization
- ✅ **Trust & Security**: Trust scoring, risk assessment, simulation mode
- ✅ **Token Creation**: Create tokens on pump.fun and fomo.fund

## Required Configuration

### 1. Environment Variables

Add these to your `.env` file:

#### Required:
```bash
# Wallet secret key (base58 encoded private key)
# This is your Solana wallet's private key in base58 format
WALLET_SECRET_KEY=your_base58_encoded_private_key_here

# Wallet public key (your Solana wallet address)
WALLET_PUBLIC_KEY=your_solana_wallet_address_here

# SOL address (same as WALLET_PUBLIC_KEY, your wallet address)
SOL_ADDRESS=your_solana_wallet_address_here

# Solana RPC URL (required for blockchain interactions)
# Options:
# - Public RPC: https://api.mainnet-beta.solana.com (rate-limited)
# - Helius: https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
# - QuickNode: https://YOUR_ENDPOINT.solana-mainnet.quiknode.pro/YOUR_KEY/
# - Other providers: Alchemy, Triton, etc.
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

#### Optional:
```bash
# Wallet secret salt (for additional key derivation security)
WALLET_SECRET_SALT=optional_salt_value

# Slippage tolerance (default: 1%)
# Format: "1" means 1%, "0.5" means 0.5%
SLIPPAGE=1

# Helius API key (for enhanced RPC services)
# Get one at: https://www.helius.dev/
HELIUS_API_KEY=your_helius_api_key_here

# Birdeye API key (for price feeds and analytics - OPTIONAL)
# ⚠️ NOTE: This is optional. The plugin works fine without it, but you may see 401 errors in logs.
# If you see "HTTP error! status: 401" from birdeye, you can safely ignore it.
# The agent will still function normally - you just won't get enhanced price data.
# To get an API key (if available):
# 1. Visit https://birdeye.so/
# 2. Sign up/login and look for Developer/API section in dashboard
# 3. Note: API access may require paid plan or be invite-only
# BIRDEYE_API_KEY=your_birdeye_api_key_here
```

### 2. Plugin Registration

The plugin is automatically loaded when the required environment variables are set. It's configured in `src/character.ts`:

```typescript
// Blockchain plugins
...(process.env.WALLET_SECRET_KEY?.trim() &&
process.env.WALLET_PUBLIC_KEY?.trim() &&
process.env.SOL_ADDRESS?.trim() &&
process.env.SOLANA_RPC_URL?.trim()
  ? ['@elizaos/plugin-solana']
  : []),
```

✅ **Already configured** - just add the environment variables!

## Available Actions

### Token Operations

#### `EXECUTE_SWAP`
Execute a token swap using Jupiter aggregator.

**Example usage:**
- "Swap 0.1 SOL for USDC"
- "Trade SOL for BONK"
- "Convert 10 USDC to SOL"

**Parameters:**
- `inputTokenSymbol`: Token symbol to swap from (e.g., "SOL", "USDC")
- `outputTokenSymbol`: Token symbol to swap to (e.g., "USDC", "BONK")
- `amount`: Amount to swap (in input token units)

#### `SEND_TOKEN`
Transfer tokens between wallets.

**Example usage:**
- "Send 100 USDC to [address]"
- "Transfer 50 BONK to [address]"

**Parameters:**
- `tokenAddress`: SPL token mint address
- `recipient`: Recipient wallet address
- `amount`: Amount to transfer (in token units)

#### `SEND_SOL`
Transfer SOL between wallets.

**Example usage:**
- "Send 1 SOL to [address]"
- "Transfer 0.5 SOL to [address]"

**Parameters:**
- `recipient`: Recipient wallet address
- `amount`: Amount to transfer (in SOL)

### Trading Operations

#### `TAKE_ORDER`
Place a buy order based on conviction level.

**Example usage:**
- "Buy SOL with high conviction"
- "Take an order for BONK"

**Parameters:**
- `ticker`: Token symbol (e.g., "SOL", "BONK")
- `contractAddress`: Token contract address

### Token Creation

#### `CREATE_AND_BUY_TOKEN` (pump.fun)
Create and buy tokens on pump.fun.

**Example usage:**
- "Create a token called MyToken on pump.fun"
- "Create token SYMBOL with 0.1 SOL on pump.fun"

**Parameters:**
- `tokenMetadata`:
  - `name`: Token name
  - `symbol`: Token symbol
  - `description`: Token description
  - `image_description`: Image description for generation
- `buyAmountSol`: Amount of SOL to buy with (e.g., 0.1)

#### `CREATE_AND_BUY_TOKEN` (fomo.fund)
Create and buy tokens on fomo.fund.

**Example usage:**
- "Create a token on fomo.fund"
- "Create token with 0.1 SOL and 1000 liquidity on fomo"

**Parameters:**
- `tokenMetadata`: Same as pump.fun
- `buyAmountSol`: Amount of SOL to buy with
- `requiredLiquidity`: Required liquidity amount

### DAO Operations

#### `EXECUTE_SWAP_DAO`
Execute token swaps for DAO operations.

**Example usage:**
- "Swap tokens for the DAO"
- "Execute DAO swap: 100 SOL to USDC"

**Parameters:**
- `inputTokenSymbol`: Token to swap from
- `outputTokenSymbol`: Token to swap to
- `amount`: Amount to swap

## Services

### TokenProvider
Manages token operations and information retrieval.

### WalletProvider
Handles wallet operations and portfolio management.

### TrustScoreProvider
Evaluates and manages trust scores for tokens and trading activities.

## Testing the Plugin

### 1. Check if Plugin is Loaded

Start your agent and check logs for Solana plugin initialization. The plugin will only load if all required environment variables are set.

### 2. Test Balance Check

Ask your agent:
- "What's my Solana wallet balance?"
- "Check my SOL balance"
- "Show my portfolio"

### 3. Test Token Swap

Ask your agent:
- "Swap 0.1 SOL for USDC"
- "Trade SOL for BONK"

### 4. Test Token Transfer

Ask your agent:
- "Send 1 SOL to [address]"
- "Transfer 100 USDC to [address]"

## Troubleshooting

### "Plugin not loading"
- **Cause**: Missing required environment variables
- **Fix**: Ensure `WALLET_SECRET_KEY`, `WALLET_PUBLIC_KEY`, `SOL_ADDRESS`, and `SOLANA_RPC_URL` are all set

### "Wallet connection failed"
- **Cause**: Invalid wallet keys or RPC endpoint issues
- **Fix**: 
  - Verify `WALLET_SECRET_KEY` is a valid base58 encoded private key
  - Check `WALLET_PUBLIC_KEY` matches the private key
  - Ensure `SOLANA_RPC_URL` is accessible and valid

### "Transaction simulation failed"
- **Cause**: Insufficient balance, invalid parameters, or network issues
- **Fix**:
  - Check account has sufficient SOL for fees
  - Verify transaction parameters are correct
  - Try a different RPC endpoint

### "Unable to fetch price data" or "HTTP error! status: 401" from Birdeye
- **Cause**: Missing or invalid `BIRDEYE_API_KEY`, or API access not available
- **Fix**:
  - ⚠️ **This is safe to ignore** - The plugin works fine without Birdeye API key
  - The 401 errors are non-critical and won't affect core functionality (swaps, transfers, etc.)
  - If you want to suppress the errors, you can either:
    - Get a Birdeye API key from https://birdeye.so/ (may require paid plan)
    - Or simply ignore the error messages - they're just warnings about missing price feed data

## Security Notes

⚠️ **IMPORTANT**:
- Never commit `WALLET_SECRET_KEY` to version control
- Use environment variables or secure secret management
- Start with devnet for testing (`SOLANA_RPC_URL=https://api.devnet.solana.com`)
- Use a dedicated trading wallet (not your main wallet)
- Set appropriate slippage tolerance
- Enable simulation mode for testing strategies

## Performance Optimization

### Cache Management
- Token data is cached for performance
- Cache TTL can be configured
- Monitor cache hit rates

### RPC Optimization
- Use connection pooling
- Implement request batching
- Monitor RPC usage and rate limits

### Transaction Management
- Optimize transaction bundling
- Implement retry strategies
- Monitor transaction success rates

## Example Configuration

```bash
# .env file
WALLET_SECRET_KEY=5KJvsngHeMoo884z3HzPS6v1hy5q5Jy6Zf6C8n4sB4X2vJ8xY9z
WALLET_PUBLIC_KEY=7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
SOL_ADDRESS=7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SLIPPAGE=1
HELIUS_API_KEY=your_helius_key_here
BIRDEYE_API_KEY=your_birdeye_key_here
```

## Network Options

### Mainnet
- `SOLANA_RPC_URL=https://api.mainnet-beta.solana.com` (public, rate-limited)
- `SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` (Helius)

### Devnet (for testing)
- `SOLANA_RPC_URL=https://api.devnet.solana.com`

### Testnet
- `SOLANA_RPC_URL=https://api.testnet.solana.com`

## Need Help?

- Check the logs for detailed error messages
- Review the [official plugin documentation](https://github.com/elizaos/elizaos/tree/main/packages/plugin-solana)
- Check existing GitHub issues
- Submit a new issue with:
  - System information
  - Error logs
  - Steps to reproduce
  - Transaction IDs (if applicable)

## Credits

This plugin integrates with:
- **Solana** - The core blockchain platform
- **Solana Web3.js** - Core Solana interactions
- **SPL Token** - Token program interactions
- **Jupiter** - Token swap aggregation
- **Birdeye** - Price feeds and analytics
- **Helius** - Enhanced RPC services
- **FOMO** - Token creation and trading
- **Pump.fun** - Token creation and trading

