# Solana Data Capabilities - Current Plugin Analysis

## Summary

Your current `@elizaos/plugin-solana` plugin provides **direct blockchain data access** via RPC, but **does NOT browse or search Solana explorer websites** like Solscan or Solana FM. However, it can access much of the same data through Solana RPC calls.

## ✅ What Data IS Available (via RPC/APIs)

### 1. **Wallet & Balance Data**
- ✅ **SOL Balance**: Get SOL balance for any wallet address
- ✅ **Token Balances**: Get balances for all SPL tokens in a wallet
- ✅ **Portfolio Data**: Complete portfolio with all tokens and their values
- ✅ **Multi-wallet Queries**: Query balances for multiple addresses at once
- ✅ **Token Account Info**: Detailed token account information

**Available via:**
- `getPortfolio(owner)` - Full portfolio for a wallet
- `getBalance(assetAddress, owner)` - Specific token balance
- `getBalancesByAddrs(walletAddressArr)` - Batch balance queries
- `getTokenAccountsByKeypair(walletAddress)` - All token accounts

### 2. **Token Information**
- ✅ **Token Metadata**: Name, symbol, decimals, supply
- ✅ **Token Decimals**: Decimal places for any token
- ✅ **Token Symbols**: Get symbol from mint address
- ✅ **Circulating Supply**: Token supply information
- ✅ **Token Creation**: Create new tokens (pump.fun, fomo.fund)

**Available via:**
- `getTokenSymbol(mint)` - Get token symbol
- `getDecimals(mints)` - Get token decimals
- `getSupply(CAs)` - Get token supply
- `getCirculatingSupply(mint)` - Get circulating supply
- `getMetadataAddress(mint)` - Get metadata address

### 3. **Transaction Operations** (Write, not Read)
- ✅ **Send SOL**: Transfer SOL between wallets
- ✅ **Send Tokens**: Transfer SPL tokens
- ✅ **Execute Swaps**: Token swaps via Jupiter
- ✅ **Create Tokens**: Deploy new tokens

**Note**: The plugin can **execute** transactions but doesn't have built-in actions to **query transaction history** from the blockchain.

### 4. **Price & Market Data** (via Birdeye API - optional)
- ✅ **Price Feeds**: Token prices (if BIRDEYE_API_KEY is configured)
- ✅ **Market Analytics**: Price analytics and trends

### 5. **Address Validation & Detection**
- ✅ **Address Validation**: Validate Solana addresses
- ✅ **Address Type Detection**: Detect if address is wallet, token, program, etc.
- ✅ **Public Key Detection**: Extract Solana addresses from text
- ✅ **Private Key Detection**: Detect private keys in text (for security)

**Available via:**
- `isValidAddress(address)` - Validate address
- `getAddressType(address)` - Get address type
- `detectPubkeysFromString(input)` - Extract addresses from text

### 6. **Account Subscriptions** (Real-time)
- ✅ **Account Monitoring**: Subscribe to account changes
- ✅ **Real-time Updates**: Get notified when accounts change

**Available via:**
- `subscribeToAccount(accountAddress, handler)` - Subscribe to changes
- `unsubscribeFromAccount(accountAddress)` - Unsubscribe

## ❌ What Data is NOT Available

### Missing Explorer-Specific Features:

1. **Transaction History Queries**
   - ❌ Cannot query transaction history for a wallet
   - ❌ Cannot search transactions by signature
   - ❌ Cannot get transaction details by signature
   - ❌ Cannot browse transaction history pages

2. **Explorer-Specific Data**
   - ❌ Cannot access Solscan's UI/visualizations
   - ❌ Cannot access Solana FM's analytics dashboards
   - ❌ Cannot search tokens by name/symbol on explorers
   - ❌ Cannot access explorer-specific features (charts, graphs, etc.)

3. **Web Browsing**
   - ❌ Cannot browse explorer websites
   - ❌ Cannot scrape or parse explorer HTML pages
   - ❌ Cannot interact with explorer web interfaces

## 🔧 How to Get Missing Data

### Option 1: Use Solana RPC Directly (Recommended)
You can extend the plugin to query transaction history using Solana RPC:

```typescript
// Example: Get transaction signatures for an address
const connection = solanaService.getConnection();
const signatures = await connection.getSignaturesForAddress(
  new PublicKey(walletAddress),
  { limit: 10 }
);

// Get transaction details
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0
});
```

### Option 2: Use Helius Enhanced APIs
If you have `HELIUS_API_KEY`, you can use Helius's enhanced APIs:
- Transaction history
- Parsed transaction data
- NFT metadata
- Token metadata

### Option 3: Use Explorer APIs Directly
- **Solscan API**: `https://public-api.solscan.io/` (may require API key)
- **Solana FM API**: Check their documentation for API endpoints

### Option 4: Add Web Search Plugin
Install `@elizaos/plugin-web-search` to enable general web search, which could search explorer websites.

## 📊 Comparison: Plugin vs Explorers

| Feature | Plugin (RPC) | Solscan/Solana FM |
|---------|-------------|-------------------|
| Wallet Balance | ✅ Direct | ✅ Via web |
| Token Balances | ✅ Direct | ✅ Via web |
| Transaction History | ❌ Not built-in | ✅ Full history |
| Transaction Details | ❌ Not built-in | ✅ Detailed view |
| Token Search | ❌ By address only | ✅ By name/symbol |
| Price Data | ✅ Via Birdeye | ✅ Built-in |
| Real-time Updates | ✅ Subscriptions | ✅ Web updates |
| Visual Charts | ❌ No | ✅ Yes |
| NFT Data | ⚠️ Limited | ✅ Full support |

## 🎯 Recommendations

### For Your Use Case:

1. **If you need transaction history**: 
   - Extend the plugin to use `connection.getSignaturesForAddress()` and `connection.getTransaction()`
   - Or use Helius enhanced APIs with your `HELIUS_API_KEY`

2. **If you need explorer-specific features**:
   - Install `@elizaos/plugin-web-search` for general web search
   - Or create a custom plugin that uses Solscan/Solana FM APIs directly

3. **If you just need basic blockchain data**:
   - Your current plugin is sufficient! It can get balances, token info, and execute transactions

## 💡 Quick Test

Try asking your agent:
- ✅ "What's my Solana wallet balance?" → Should work
- ✅ "Check my token balances" → Should work
- ✅ "What tokens do I have?" → Should work
- ❌ "Show me my transaction history" → Won't work (needs extension)
- ❌ "Search for token BONK on Solscan" → Won't work (needs web search plugin)

