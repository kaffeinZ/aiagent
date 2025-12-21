# Plugin Trader Setup Guide

This guide explains how to configure and use the plugin-trader to enable your agent to execute trades.

## What's Included

The plugin now includes:
- ✅ **WalletService**: Manages EVM and Solana wallets
- ✅ **TradingService**: Executes token swaps on Uniswap V3
- ✅ **CHECK_BALANCE Action**: Check wallet balances
- ✅ **SWAP_TOKEN Action**: Execute token swaps

## Required Configuration

### 1. Environment Variables

Add these to your `.env` file or environment:

#### Required for Trading:
```bash
# Private key for your trading wallet (REQUIRED for trading)
# EVM format: 0x followed by 64 hex characters (66 total)
# Solana format: base58 encoded 64-byte key
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# Optional: Blockchain type (auto-detected if not provided)
# Options: 'evm' or 'solana'
BLOCKCHAIN_TYPE=evm

# Optional: Custom RPC URL (recommended for production)
# If not provided or contains placeholder text, will use default public RPC (may be rate-limited)
# Examples:
# - Infura: https://mainnet.infura.io/v3/YOUR_ACTUAL_PROJECT_ID
# - Alchemy: https://eth-mainnet.g.alchemy.com/v2/YOUR_ACTUAL_API_KEY
# - QuickNode: https://YOUR_ACTUAL_ENDPOINT.quiknode.pro/YOUR_ACTUAL_KEY/
# - Public RPC (free but rate-limited): Leave RPC_URL unset or comment it out
# RPC_URL=https://mainnet.infura.io/v3/YOUR_ACTUAL_PROJECT_ID

# Optional: For EVM - Chain name (defaults to 'mainnet')
# Options: 'mainnet', 'polygon', 'arbitrum', 'optimism', 'base', etc.
CHAIN=mainnet

# Optional: For Solana - Cluster name (defaults to 'mainnet-beta')
# Options: 'mainnet-beta', 'devnet', 'testnet'
SOLANA_CLUSTER=mainnet-beta
```

### 2. Plugin Registration

The plugin is already registered in `src/index.ts`:
```typescript
plugins: [starterPlugin, falaiPlugin, traderPlugin],
```

✅ **Already configured** - no changes needed!

## How It Works

### 1. Wallet Initialization

When the plugin initializes:
1. It reads `PRIVATE_KEY` from environment
2. Detects blockchain type (EVM or Solana) automatically
3. Creates wallet client and connects to blockchain
4. Initializes trading service

### 2. Available Actions

#### CHECK_BALANCE
- **Trigger**: "What's my wallet balance?", "Check my account", "Show my funds"
- **Function**: Displays wallet address and native token balance (ETH/SOL)

#### SWAP_TOKEN
- **Trigger**: "Swap tokens", "Trade ETH for USDC", "Buy tokens", "Sell tokens"
- **Function**: Executes token swaps on Uniswap V3
- **Note**: Currently requires manual parameter extraction. Full NLP parsing coming soon.

### 3. Trading Flow

When a user requests a swap:
1. Agent recognizes the request via `SWAP_TOKEN` action
2. Trading service gets swap quote
3. Checks token allowance (approves if needed)
4. Executes swap transaction
5. Returns transaction hash

## Testing the Plugin

### 1. Check if Plugin is Loaded

Start your agent and check logs for:
```
[plugin-trader] Initializing plugin-trader
[plugin-trader] Wallet initialized successfully
[plugin-trader] Trading service initialized
```

### 2. Test Balance Check

Ask your agent:
- "What's my wallet balance?"
- "Check my account"
- "Show my funds"

Expected response:
```
Your EVM wallet balance:
Address: 0x...
Balance: 1.5 ETH
Blockchain: EVM
```

### 3. Test Trading (Manual)

Currently, the swap action requires parameters to be extracted from the message. You can test by:

1. Ensuring wallet has funds
2. Asking: "Swap 0.1 ETH for USDC"
3. The agent will respond with instructions

## Troubleshooting

### "Wallet service not available"
- **Cause**: `PRIVATE_KEY` not set or invalid
- **Fix**: Add valid `PRIVATE_KEY` to environment

### "Trading service not initialized"
- **Cause**: Plugin initialization failed
- **Fix**: Check logs for initialization errors

### "Chain ID not available"
- **Cause**: Wallet not initialized or wrong chain
- **Fix**: Ensure `PRIVATE_KEY` and `CHAIN` are correct

### "Uniswap V3 router not available for chain"
- **Cause**: Unsupported chain
- **Fix**: Use supported chain (Ethereum, Polygon, Arbitrum, Optimism, Base)

## Security Notes

⚠️ **IMPORTANT**:
- Never commit `PRIVATE_KEY` to version control
- Use environment variables or secure secret management
- Start with testnet for testing
- Use a dedicated trading wallet (not your main wallet)
- Set appropriate slippage tolerance

## Next Steps

To fully enable trading:

1. ✅ Plugin is registered
2. ✅ Trading service implemented
3. ✅ Actions created
4. ⚠️ **Add PRIVATE_KEY to environment**
5. ⚠️ **Add RPC_URL (recommended)**
6. ⚠️ **Test on testnet first**

## Supported Chains

### EVM Chains:
- Ethereum Mainnet
- Polygon
- Arbitrum
- Optimism
- Base

### Solana:
- Mainnet-beta
- Devnet
- Testnet

## Example Configuration

```bash
# .env file
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
BLOCKCHAIN_TYPE=evm
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
CHAIN=mainnet
```

## Need Help?

Check the logs for detailed error messages. The plugin logs all operations with the `[plugin-trader]` prefix.

