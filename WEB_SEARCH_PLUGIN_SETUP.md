# Web Search Plugin Setup Guide

This guide explains how to configure and use the `@elizaos/plugin-web-search` plugin to enable your agent to search the web, including Solana explorer websites.

## What's Included

The Web Search plugin provides:
- ✅ **Web Search**: Search the internet for current information
- ✅ **Explorer Search**: Search Solana explorer websites (Solscan, Solana FM, etc.)
- ✅ **Real-time Information**: Get up-to-date data from the web
- ✅ **Multiple Search Actions**: Various ways to trigger web searches

## Required Configuration

### 1. Get Tavily API Key

The plugin uses [Tavily API](https://tavily.com/) for web search. You need to:

1. Visit [https://tavily.com/](https://tavily.com/)
2. Sign up for a free account
3. Get your API key from the dashboard
4. The free tier includes:
   - 1,000 searches per month
   - Basic search capabilities
   - Perfect for development and testing

### 2. Environment Variables

Add this to your `.env` file:

```bash
# Tavily API key (required for web search)
# Get one at: https://tavily.com/
TAVILY_API_KEY=your_tavily_api_key_here
```

### 3. Plugin Registration

The plugin is automatically loaded when `TAVILY_API_KEY` is set. It's configured in `src/character.ts`:

```typescript
// Web search plugin
...(process.env.TAVILY_API_KEY?.trim() ? ['@elizaos/plugin-web-search'] : []),
```

✅ **Already configured** - just add the `TAVILY_API_KEY` environment variable!

## Available Actions

The plugin provides multiple search actions that can be triggered by various phrases:

### `WEB_SEARCH`
Main web search action.

**Example usage:**
- "Search the web for latest Solana news"
- "Look up information about BONK token"
- "Find transaction history on Solscan for address [address]"
- "Search Solana FM for token [token name]"

**Trigger phrases:**
- "search the web"
- "look up"
- "find information"
- "search for"
- "query the web"
- "internet search"

## How It Works

### 1. Search Capabilities

The plugin can search:
- ✅ General web content
- ✅ Solana explorer websites (Solscan, Solana FM)
- ✅ News articles
- ✅ Documentation
- ✅ Any publicly accessible web content

### 2. Search Results

When you ask the agent to search, it will:
1. Execute the search query via Tavily API
2. Process and format the results
3. Return relevant information with source URLs
4. Automatically handle token limits (max 4000 tokens)

### 3. Example Queries

**Solana Explorer Searches:**
- "Search Solscan for wallet address 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
- "Find transaction history on Solana FM for [address]"
- "Look up token BONK on Solscan"
- "Search Solana explorer for token [token name]"

**General Web Searches:**
- "Search for latest Solana price"
- "Find information about Jupiter aggregator"
- "Look up DeFi protocols on Solana"

## Testing the Plugin

### 1. Check if Plugin is Loaded

Start your agent and check logs for web search plugin initialization. The plugin will only load if `TAVILY_API_KEY` is set.

### 2. Test Basic Web Search

Ask your agent:
- "Search the web for latest Solana news"
- "Look up information about cryptocurrency"
- "Find recent developments in DeFi"

### 3. Test Solana Explorer Search

Ask your agent:
- "Search Solscan for wallet address [your address]"
- "Find transaction history on Solana FM"
- "Look up token information on Solscan"

## Troubleshooting

### "Plugin not loading"
- **Cause**: Missing `TAVILY_API_KEY` environment variable
- **Fix**: Ensure `TAVILY_API_KEY` is set in your `.env` file

### "API Authentication Failures"
- **Cause**: Invalid or missing Tavily API key
- **Fix**: 
  - Verify your API key is correct
  - Check that the key is active in your Tavily dashboard
  - Ensure there are no extra spaces in the `.env` file

### "Search Rate Limiting"
- **Cause**: Too many requests in short time
- **Fix**: 
  - Free tier: 1,000 searches/month
  - Upgrade to paid plan for higher limits
  - Implement request throttling if needed

### "No search results"
- **Cause**: Search query too specific or API issue
- **Fix**: 
  - Try rephrasing the search query
  - Check Tavily API status
  - Verify your API key has remaining quota

## Security Notes

⚠️ **IMPORTANT**:
- Never commit `TAVILY_API_KEY` to version control
- Use environment variables or secure secret management
- Monitor API usage to avoid unexpected charges
- The free tier is sufficient for development and testing

## API Limits

### Free Tier
- 1,000 searches per month
- Basic search capabilities
- Good for development and testing

### Paid Plans
- Higher search limits
- Advanced search features
- Priority support
- Check [Tavily Pricing](https://tavily.com/pricing) for details

## Example Configuration

```bash
# .env file
TAVILY_API_KEY=tvly-your-api-key-here
```

## Integration with Solana Plugin

The web search plugin works alongside your Solana plugin:

1. **Direct Blockchain Data** (via Solana plugin):
   - Wallet balances
   - Token information
   - Portfolio data
   - Execute transactions

2. **Explorer Web Search** (via Web Search plugin):
   - Transaction history
   - Explorer-specific features
   - Historical data
   - Visual charts and analytics

Together, they provide comprehensive Solana blockchain access!

## Need Help?

- Check the logs for detailed error messages
- Review the [Tavily API Documentation](https://docs.tavily.com/)
- Check existing GitHub issues
- Submit a new issue with:
  - System information
  - Error logs
  - Steps to reproduce
  - API key status (masked)

## Credits

This plugin integrates with:
- **Tavily API** - Advanced search and content analysis API
- **js-tiktoken** - Token counting for API responses

For more information:
- [Tavily API Documentation](https://docs.tavily.com/)
- [Search API Best Practices](https://docs.tavily.com/docs/guides/best-practices)

