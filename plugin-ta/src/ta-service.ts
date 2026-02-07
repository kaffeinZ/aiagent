/// <reference path="./@elizaos-core.d.ts" />
import { Service, logger } from '@elizaos/core';
import { RSI, MACD, SMA, EMA, BollingerBands, Stochastic, ATR, ADX, OBV, VWAP } from 'technicalindicators';

/**
 * OHLCV candle data from Binance
 */
export interface OHLCVCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/**
 * Technical analysis result
 */
export interface TAResult {
  symbol: string;
  interval: string;
  candleCount: number;
  currentPrice: number;
  timestamp: number;
  indicators: {
    rsi14: number | null;
    macd: { line: number; signal: number; histogram: number } | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    ema9: number | null;
    ema21: number | null;
    bollingerBands: { upper: number; middle: number; lower: number } | null;
    stochastic: { k: number; d: number } | null;
    atr14: number | null;
    adx14: number | null;
    obv: number | null;
    vwap: number | null;
  };
  summary: string;
}

/**
 * Cached TA result
 */
interface CachedTA {
  data: TAResult;
  cachedAt: number;
}

/**
 * Maps coin names/symbols to Binance trading pairs
 */
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  bitcoin: 'BTCUSDT', btc: 'BTCUSDT',
  ethereum: 'ETHUSDT', eth: 'ETHUSDT',
  solana: 'SOLUSDT', sol: 'SOLUSDT',
  binancecoin: 'BNBUSDT', bnb: 'BNBUSDT',
  cardano: 'ADAUSDT', ada: 'ADAUSDT',
  ripple: 'XRPUSDT', xrp: 'XRPUSDT',
  polkadot: 'DOTUSDT', dot: 'DOTUSDT',
  dogecoin: 'DOGEUSDT', doge: 'DOGEUSDT',
  'avalanche-2': 'AVAXUSDT', avalanche: 'AVAXUSDT', avax: 'AVAXUSDT',
  'matic-network': 'MATICUSDT', polygon: 'MATICUSDT', matic: 'MATICUSDT',
  chainlink: 'LINKUSDT', link: 'LINKUSDT',
  litecoin: 'LTCUSDT', ltc: 'LTCUSDT',
  uniswap: 'UNIUSDT', uni: 'UNIUSDT',
  cosmos: 'ATOMUSDT', atom: 'ATOMUSDT',
  'usd-coin': 'USDCUSDT', usdc: 'USDCUSDT',
  tether: 'USDTDAI', usdt: 'USDTDAI',
  sui: 'SUIUSDT',
  pepe: 'PEPEUSDT',
  shiba: 'SHIBUSDT', shib: 'SHIBUSDT',
  aptos: 'APTUSDT', apt: 'APTUSDT',
  arbitrum: 'ARBUSDT', arb: 'ARBUSDT',
  optimism: 'OPUSDT', op: 'OPUSDT',
  near: 'NEARUSDT',
  injective: 'INJUSDT', inj: 'INJUSDT',
  render: 'RENDERUSDT', rndr: 'RENDERUSDT',
  jupiter: 'JUPUSDT', jup: 'JUPUSDT',
  sei: 'SEIUSDT',
  celestia: 'TIAUSDT', tia: 'TIAUSDT',
  fetch: 'FETUSDT', fet: 'FETUSDT',
};

const VALID_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
type Interval = typeof VALID_INTERVALS[number];

export class TAService extends Service {
  static override serviceType = 'technical-analysis';

  override capabilityDescription =
    'Fetches OHLCV data from Binance and computes technical indicators (RSI, MACD, SMA, EMA, Bollinger Bands, Stochastic, ATR, ADX, OBV, VWAP).';

  private readonly CACHE_TTL = 120000; // 2 minutes
  private taCache = new Map<string, CachedTA>();
  private cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(runtime: any) {
    super(runtime);
  }

  static override async start(runtime: any): Promise<Service> {
    logger.info('Starting TAService');
    const service = new TAService(runtime);

    service.cacheCleanupInterval = setInterval(() => {
      service.cleanupExpiredCache();
    }, 5 * 60 * 1000);

    logger.info('TAService started');
    return service;
  }

  static override async stop(runtime: any): Promise<void> {
    logger.info('Stopping TAService');
    const service = runtime.getService(TAService.serviceType);
    if (service && 'stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.taCache.clear();
    logger.info('TAService stopped');
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.taCache.entries()) {
      if (now - cached.cachedAt >= this.CACHE_TTL) {
        this.taCache.delete(key);
      }
    }
  }

  /**
   * Resolve a coin name/symbol to a Binance trading pair
   */
  resolveBinanceSymbol(input: string): string | null {
    const normalized = input.toLowerCase().trim();
    const mapped = BINANCE_SYMBOL_MAP[normalized];
    if (mapped) return mapped;

    // Try appending USDT
    const upper = input.toUpperCase().trim();
    if (/^[A-Z]{2,10}$/.test(upper)) {
      return upper + 'USDT';
    }

    return null;
  }

  /**
   * Fetch OHLCV candles from Binance public API
   */
  async fetchCandles(binanceSymbol: string, interval: Interval = '1h', limit: number = 200): Promise<OHLCVCandle[]> {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;

    logger.debug({ url, binanceSymbol, interval, limit }, 'Fetching candles from Binance');

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, errorText, binanceSymbol }, 'Binance API request failed');
      throw new Error(`Binance API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any[][];

    return data.map((candle) => ({
      openTime: candle[0] as number,
      open: parseFloat(candle[1] as string),
      high: parseFloat(candle[2] as string),
      low: parseFloat(candle[3] as string),
      close: parseFloat(candle[4] as string),
      volume: parseFloat(candle[5] as string),
      closeTime: candle[6] as number,
    }));
  }

  /**
   * Compute all technical indicators from OHLCV data
   */
  computeIndicators(candles: OHLCVCandle[]): TAResult['indicators'] {
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const volumes = candles.map((c) => c.volume);

    // RSI(14)
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const rsi14 = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

    // MACD(12,26,9)
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const lastMacd = macdValues.length > 0 ? macdValues[macdValues.length - 1] : null;
    const macd = lastMacd && lastMacd.MACD !== undefined
      ? { line: lastMacd.MACD, signal: lastMacd.signal ?? 0, histogram: lastMacd.histogram ?? 0 }
      : null;

    // SMA(20, 50, 200)
    const sma20Values = SMA.calculate({ values: closes, period: 20 });
    const sma50Values = SMA.calculate({ values: closes, period: 50 });
    const sma200Values = SMA.calculate({ values: closes, period: 200 });
    const sma20 = sma20Values.length > 0 ? sma20Values[sma20Values.length - 1] : null;
    const sma50 = sma50Values.length > 0 ? sma50Values[sma50Values.length - 1] : null;
    const sma200 = sma200Values.length > 0 ? sma200Values[sma200Values.length - 1] : null;

    // EMA(9, 21)
    const ema9Values = EMA.calculate({ values: closes, period: 9 });
    const ema21Values = EMA.calculate({ values: closes, period: 21 });
    const ema9 = ema9Values.length > 0 ? ema9Values[ema9Values.length - 1] : null;
    const ema21 = ema21Values.length > 0 ? ema21Values[ema21Values.length - 1] : null;

    // Bollinger Bands(20, 2)
    const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
    const lastBB = bbValues.length > 0 ? bbValues[bbValues.length - 1] : null;
    const bollingerBands = lastBB
      ? { upper: lastBB.upper, middle: lastBB.middle, lower: lastBB.lower }
      : null;

    // Stochastic(14, 3, 3)
    const stochValues = Stochastic.calculate({
      high: highs, low: lows, close: closes,
      period: 14, signalPeriod: 3,
    });
    const lastStoch = stochValues.length > 0 ? stochValues[stochValues.length - 1] : null;
    const stochastic = lastStoch && lastStoch.k !== undefined
      ? { k: lastStoch.k, d: lastStoch.d }
      : null;

    // ATR(14)
    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
    const atr14 = atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;

    // ADX(14)
    const adxValues = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
    const lastAdx = adxValues.length > 0 ? adxValues[adxValues.length - 1] : null;
    const adx14 = lastAdx ? lastAdx.adx : null;

    // OBV
    const obvValues = OBV.calculate({ close: closes, volume: volumes });
    const obv = obvValues.length > 0 ? obvValues[obvValues.length - 1] : null;

    // VWAP (calculated from OHLCV)
    let vwap: number | null = null;
    try {
      const vwapValues = VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes });
      vwap = vwapValues.length > 0 ? vwapValues[vwapValues.length - 1] : null;
    } catch {
      // VWAP may not work for all timeframes
    }

    return { rsi14, macd, sma20, sma50, sma200, ema9, ema21, bollingerBands, stochastic, atr14, adx14, obv, vwap };
  }

  /**
   * Generate a human-readable summary of the TA results
   */
  generateSummary(indicators: TAResult['indicators'], currentPrice: number): string {
    const lines: string[] = [];

    // RSI
    if (indicators.rsi14 !== null) {
      const rsi = indicators.rsi14;
      let rsiLabel = 'Neutral';
      if (rsi >= 70) rsiLabel = 'Overbought';
      else if (rsi >= 60) rsiLabel = 'Neutral-Bullish';
      else if (rsi <= 30) rsiLabel = 'Oversold';
      else if (rsi <= 40) rsiLabel = 'Neutral-Bearish';
      lines.push(`RSI(14): ${rsi.toFixed(1)} (${rsiLabel})`);
    }

    // MACD
    if (indicators.macd) {
      const { line, signal, histogram } = indicators.macd;
      const crossover = histogram > 0 ? 'Bullish' : 'Bearish';
      lines.push(`MACD(12,26,9): Line: ${line.toFixed(2)}, Signal: ${signal.toFixed(2)}, Histogram: ${histogram >= 0 ? '+' : ''}${histogram.toFixed(2)} (${crossover})`);
    }

    // Moving Averages
    const maLines: string[] = [];
    if (indicators.ema9 !== null) {
      const pos = currentPrice > indicators.ema9 ? 'above' : 'below';
      maLines.push(`EMA(9): $${indicators.ema9.toFixed(2)} (price ${pos})`);
    }
    if (indicators.sma20 !== null) {
      const pos = currentPrice > indicators.sma20 ? 'above' : 'below';
      maLines.push(`SMA(20): $${indicators.sma20.toFixed(2)} (price ${pos})`);
    }
    if (indicators.sma50 !== null) {
      const pos = currentPrice > indicators.sma50 ? 'above' : 'below';
      maLines.push(`SMA(50): $${indicators.sma50.toFixed(2)} (price ${pos})`);
    }
    if (indicators.sma200 !== null) {
      const pos = currentPrice > indicators.sma200 ? 'above' : 'below';
      maLines.push(`SMA(200): $${indicators.sma200.toFixed(2)} (price ${pos})`);
    }
    if (maLines.length > 0) {
      lines.push('Moving Averages:');
      maLines.forEach((l) => lines.push(`  ${l}`));
    }

    // Bollinger Bands
    if (indicators.bollingerBands) {
      const bb = indicators.bollingerBands;
      let bbPos = 'Middle';
      const range = bb.upper - bb.lower;
      if (range > 0) {
        const pctPos = (currentPrice - bb.lower) / range;
        if (pctPos > 0.8) bbPos = 'Near upper band (overbought zone)';
        else if (pctPos < 0.2) bbPos = 'Near lower band (oversold zone)';
        else bbPos = 'Mid-range';
      }
      lines.push(`Bollinger Bands(20,2): Upper: $${bb.upper.toFixed(2)}, Middle: $${bb.middle.toFixed(2)}, Lower: $${bb.lower.toFixed(2)} — ${bbPos}`);
    }

    // Stochastic
    if (indicators.stochastic) {
      const { k, d } = indicators.stochastic;
      let stochLabel = 'Neutral';
      if (k > 80) stochLabel = 'Overbought';
      else if (k < 20) stochLabel = 'Oversold';
      lines.push(`Stochastic(14,3,3): K: ${k.toFixed(1)}, D: ${d.toFixed(1)} (${stochLabel})`);
    }

    // ATR
    if (indicators.atr14 !== null) {
      const atrPct = (indicators.atr14 / currentPrice) * 100;
      let vol = 'Low';
      if (atrPct > 5) vol = 'Very High';
      else if (atrPct > 3) vol = 'High';
      else if (atrPct > 1.5) vol = 'Moderate';
      lines.push(`ATR(14): $${indicators.atr14.toFixed(2)} (${atrPct.toFixed(1)}% — ${vol} volatility)`);
    }

    // ADX
    if (indicators.adx14 !== null) {
      let trend = 'Weak/No trend';
      if (indicators.adx14 > 50) trend = 'Very strong trend';
      else if (indicators.adx14 > 25) trend = 'Strong trend';
      lines.push(`ADX(14): ${indicators.adx14.toFixed(1)} (${trend})`);
    }

    // VWAP
    if (indicators.vwap !== null) {
      const pos = currentPrice > indicators.vwap ? 'above' : 'below';
      lines.push(`VWAP: $${indicators.vwap.toFixed(2)} (price ${pos})`);
    }

    return lines.join('\n');
  }

  /**
   * Run full technical analysis for a coin
   */
  async analyze(symbol: string, interval: Interval = '1h'): Promise<TAResult> {
    const binanceSymbol = this.resolveBinanceSymbol(symbol);
    if (!binanceSymbol) {
      throw new Error(`Cannot resolve "${symbol}" to a Binance trading pair. Try using the ticker symbol (e.g., BTC, ETH, SOL).`);
    }

    // Check cache
    const cacheKey = `${binanceSymbol}:${interval}`;
    const cached = this.taCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      logger.debug({ cacheKey }, 'TA cache hit');
      return cached.data;
    }

    logger.info({ binanceSymbol, interval }, 'Running technical analysis');

    const candles = await this.fetchCandles(binanceSymbol, interval, 200);

    if (candles.length < 30) {
      throw new Error(`Not enough candle data for ${binanceSymbol} (got ${candles.length}, need at least 30)`);
    }

    const currentPrice = candles[candles.length - 1].close;
    const indicators = this.computeIndicators(candles);
    const summary = this.generateSummary(indicators, currentPrice);

    const result: TAResult = {
      symbol: binanceSymbol,
      interval,
      candleCount: candles.length,
      currentPrice,
      timestamp: Date.now(),
      indicators,
      summary,
    };

    // Cache result
    this.taCache.set(cacheKey, { data: result, cachedAt: Date.now() });

    logger.info({ binanceSymbol, interval, currentPrice }, 'Technical analysis complete');
    return result;
  }

  /**
   * Format TA result as text for the LLM to interpret
   */
  formatResult(result: TAResult): string {
    return [
      `Technical Analysis for ${result.symbol} (${result.interval} candles, ${result.candleCount} periods):`,
      `Current Price: $${result.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`,
      `Timestamp: ${new Date(result.timestamp).toISOString()}`,
      '',
      result.summary,
    ].join('\n');
  }
}
