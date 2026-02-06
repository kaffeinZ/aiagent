# Twitter Autonomous Posting Guide

## 🤖 How Your Bot Posts

Your bot has **two modes of operation**:

### 1. **Autonomous Posting** (Now Enabled)
Your bot will automatically post crypto analysis on a schedule:
- ✅ Posts every 4 hours (configurable)
- ✅ Maximum 6 posts per day (safety limit)
- ✅ Generates original market analysis
- ✅ Includes charts, data, and insights
- ✅ Always includes "NFA - DYOR" disclaimers

### 2. **Reactive Responses** (Always Active)
Your bot responds to interactions:
- ✅ Replies to @mentions
- ❌ DM responses disabled (rate limit protection)
- ❌ Search/monitoring disabled (rate limit protection)

---

## 📅 Default Posting Schedule

With current settings ([.env:102-111](.env#L102-L111)):

```
Posts every 4 hours = 6 posts per day

Example schedule:
- 00:00 - Post 1 (Market analysis)
- 04:00 - Post 2 (Token analysis)
- 08:00 - Post 3 (Technical update)
- 12:00 - Post 4 (DeFi insights)
- 16:00 - Post 5 (Market sentiment)
- 20:00 - Post 6 (Trading levels)
```

---

## 🎯 What Your Bot Will Post

Your bot generates **original crypto analysis** based on:

### Post Types:
1. **Market Analysis**
   - Current BTC/ETH/SOL prices
   - 24h price movements
   - Key support/resistance levels
   - Market sentiment

2. **Token Deep Dives**
   - Specific token analysis
   - On-chain metrics
   - Fundamental analysis
   - Risk assessment

3. **Technical Updates**
   - Chart patterns
   - Technical indicators
   - Price predictions with levels

4. **DeFi Insights**
   - Protocol updates
   - Yield opportunities
   - Risk warnings

5. **Market Sentiment**
   - Fear & Greed Index
   - Social metrics
   - News analysis

6. **Trading Levels**
   - Key levels to watch
   - Entry/exit suggestions
   - Risk management tips

### Example Post:
```
🔍 #Bitcoin Analysis

BTC holding $64,200 support. Here's what I'm watching:

**Bullish if:**
- Breaks $65,500 with volume
- Target: $68,000

**Bearish if:**
- Loses $64,000
- Watch: $62,500 support

Chart: [CoinGecko link]

NFA - DYOR 🔍
```

---

## ⚙️ Configuring Posting Frequency

Edit your [.env:102-111](.env#L102-L111) file:

### Conservative (3 posts/day):
```bash
TWITTER_POST_INTERVAL=28800000     # Every 8 hours
TWITTER_MAX_POSTS_PER_DAY=3
```

### Moderate (6 posts/day) - **Current Setting**:
```bash
TWITTER_POST_INTERVAL=14400000     # Every 4 hours
TWITTER_MAX_POSTS_PER_DAY=6
```

### Aggressive (12 posts/day):
```bash
TWITTER_POST_INTERVAL=7200000      # Every 2 hours
TWITTER_MAX_POSTS_PER_DAY=12
```

**⚠️ Warning:** More posts ≠ better. Quality > quantity. Start conservative!

---

## 🚀 Starting Your Bot

### Start with Autonomous Posting:
```bash
bun run start
```

Your bot will:
1. Connect to Twitter
2. Wait for the next scheduled post time
3. Generate crypto analysis
4. Search web for current data
5. Post tweet with analysis
6. Wait for next interval
7. Repeat

### You'll see logs like:
```
[Twitter] Bot started
[Twitter] Next post scheduled in 4 hours
[Twitter] Searching web for current BTC price...
[Twitter] Generating market analysis...
[Twitter] Posted tweet: [tweet ID]
[Twitter] Next post in 4 hours
```

---

## 🎛️ Control Options

### Option 1: Full Autonomous (Set & Forget)
```bash
TWITTER_AUTO_POST=true
TWITTER_POST_INTERVAL=14400000
```

**Pro:** Hands-off, consistent posting
**Con:** Less control over content

### Option 2: Manual Mode (You Trigger)
```bash
TWITTER_AUTO_POST=false
```

**Pro:** Full control over when/what to post
**Con:** Requires manual intervention

### Option 3: Hybrid (Scheduled + Manual)
```bash
TWITTER_AUTO_POST=true
TWITTER_POST_INTERVAL=28800000    # Every 8 hours
```

**Pro:** Consistent schedule + you can manually post too
**Con:** Need to monitor for quality

---

## 📊 Testing Your Bot

### Test 1: Check Auto-Posting is Enabled
```bash
cat .env | grep "TWITTER_AUTO_POST"
# Should show: TWITTER_AUTO_POST=true
```

### Test 2: Start Bot and Watch Logs
```bash
bun run start

# Watch for:
# [Twitter] Auto-posting enabled
# [Twitter] Next post in X hours
```

### Test 3: Trigger Manual Post (Optional)
You can still manually ask your bot to post:
```
# In another terminal or Discord/Telegram:
"Post a Bitcoin analysis to Twitter"
```

### Test 4: Check Twitter
Go to your Twitter account and verify posts appear.

---

## ⚠️ Important Notes

### Rate Limits (Free Tier):
Your **free Twitter API** allows:
- ✅ **Posting**: 50 tweets per day (plenty)
- ❌ **Reading**: Very limited (1-2 requests)

**This is fine!** Your bot will:
- Post 6 times per day (well under limit)
- Not try to read/search (to avoid rate limits)
- Only respond to direct mentions (limited)

### What Happens if Rate Limited:
```
[Twitter] Rate limit hit, waiting...
[Twitter] Next attempt in 15 minutes
```

Bot will automatically retry later.

---

## 🎯 Recommended Strategy

### Week 1: Conservative Testing
```bash
TWITTER_AUTO_POST=true
TWITTER_POST_INTERVAL=28800000     # Every 8 hours
TWITTER_MAX_POSTS_PER_DAY=3
```

**Goal:** Test quality, monitor engagement

### Week 2-3: Moderate Posting
```bash
TWITTER_POST_INTERVAL=14400000     # Every 4 hours
TWITTER_MAX_POSTS_PER_DAY=6
```

**Goal:** Build consistent presence

### Week 4+: Optimize
Adjust based on:
- Which posts get most engagement
- What times work best
- Follower feedback

---

## 💡 Pro Tips

### DO:
- ✅ Start with 3 posts/day to test quality
- ✅ Monitor first 24 hours closely
- ✅ Check tweets manually for quality
- ✅ Adjust based on engagement
- ✅ Keep "NFA - DYOR" in all posts

### DON'T:
- ❌ Start with 12 posts/day (looks spammy)
- ❌ Leave bot running unmonitored
- ❌ Post without testing first
- ❌ Ignore low engagement (adjust strategy)
- ❌ Remove risk disclaimers

---

## 🔧 Troubleshooting

### Bot not posting?

**Check 1:** Is auto-post enabled?
```bash
cat .env | grep TWITTER_AUTO_POST
# Should be: true
```

**Check 2:** Are credentials correct?
```bash
cat .env | grep TWITTER_API_KEY
# Should show your keys
```

**Check 3:** Check logs
```bash
bun run start
# Look for errors in output
```

### Posts are low quality?

**Solution 1:** Improve character system prompt
Edit [character.ts:55-120](src/character.ts#L55-L120)

**Solution 2:** Reduce posting frequency
Give bot more time to generate quality analysis

**Solution 3:** Add more specific guidance
Add examples of great posts to character

### Getting rate limited?

**Solution:** Increase post interval
```bash
TWITTER_POST_INTERVAL=28800000  # 8 hours instead of 4
```

---

## 📋 Quick Start Checklist

- [x] Twitter credentials configured in .env
- [x] Auto-posting enabled
- [x] Posting interval set (4 hours)
- [x] Max posts per day set (6)
- [x] Character configured with advanced analysis
- [ ] Start bot with `bun run start`
- [ ] Monitor first 24 hours
- [ ] Check Twitter for quality
- [ ] Adjust settings as needed
- [ ] Scale up after successful testing

---

## 🚀 Launch Command

Ready to start your autonomous crypto analyst bot?

```bash
# Start the bot
bun run start

# Keep terminal open to see logs
# Bot will post every 4 hours
# Maximum 6 posts per day
# All posts include charts and analysis
```

**Your bot is now configured for autonomous posting!** 🎉

Check your Twitter account in 4 hours for the first post.

---

## 🎬 Next Steps

1. **Now:** Start bot with `bun run start`
2. **Hour 1:** Watch logs, verify bot is running
3. **Hour 4:** Check Twitter for first post
4. **Hour 24:** Review all posts, check engagement
5. **Week 1:** Adjust frequency based on quality/engagement
6. **Week 2+:** Scale up as you refine

**Good luck with your crypto analyst bot!** 📊🚀
