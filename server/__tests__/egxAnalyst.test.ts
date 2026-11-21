import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  EGX_STOCKS_UNIVERSE,
  EGXStock,
  getEGXStock
} from '../data/egxStocks';
import {
  EGYPT_PUBLIC_HOLIDAYS,
  extractTickerFromTradingViewRow,
  getLatestEgxSessionDate,
  isEgxTradingDay,
  validateQuoteAnomaly
} from '../services/liveMarketSyncService';
import {
  computeBusinessDaysBetween,
  parseCbeMacroHtml,
  parseTradingViewChartFrames,
  validateHistoricalCandles
} from '../services/marketDataService';
import { FundamentalAnalysisEngine } from '../services/fundamentalAnalysisService';
import { FairValueValuationEngine } from '../services/fairValueService';
import { Candle, TechnicalAnalysisEngine } from '../services/technicalAnalysisService';
import { scoreStockForScreener } from '../services/stockScreenerService';
import { AiRecommendationEngine } from '../services/aiRecommendationService';
import { runSimulationOnCandles } from '../services/backtestingService';
import { classifyNewsHeadline } from '../services/newsService';
import { parseSafeExternalJson } from '../utils/httpJson';
import { createApiApp } from '../../server';

function makeStockFixture(overrides: Partial<EGXStock> = {}): EGXStock {
  const base = getEGXStock('COMI')!;
  return {
    ...base,
    ...overrides
  };
}

function buildSyntheticCandles(count: number, opts?: {
  startPrice?: number;
  dailyStep?: number;
  upperWickLastBar?: boolean;
  squeezeTail?: boolean;
  wave?: boolean;
}): Candle[] {
  const startPrice = opts?.startPrice ?? 100;
  const dailyStep = opts?.dailyStep ?? 0.35;
  const candles: Candle[] = [];
  const start = new Date('2026-01-04T12:00:00Z');
  let cursor = new Date(start.getTime());
  let price = startPrice;

  while (candles.length < count) {
    const iso = cursor.toISOString().split('T')[0];
    if (isEgxTradingDay(iso)) {
      const i = candles.length;
      const delta = opts?.wave
        ? (i % 14 < 7 ? 1.1 : -0.95) + dailyStep * 0.25
        : dailyStep + Math.sin(i * 0.4) * 0.25;
      const open = Number(price.toFixed(2));
      const close = Number(Math.max(1, price + delta).toFixed(2));
      const isTailSqueeze = opts?.squeezeTail && i >= count - 12;
      const spread = isTailSqueeze ? 0.12 : 1.1;
      let high = Number((Math.max(open, close) + spread).toFixed(2));
      const low = Number(Math.max(0.5, Math.min(open, close) - spread * 0.8).toFixed(2));
      if (opts?.upperWickLastBar && i === count - 1) {
        // Huge upper wick closing weak below midpoint & below prior high
        high = Number((Math.max(open, close) + 8.5).toFixed(2));
      }
      candles.push({
        date: iso,
        open,
        high,
        low,
        close,
        volume: 1_200_000 + (i % 5) * 150_000
      });
      price = close;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return candles;
}

// =========================================================================
// Test 1: TradingView row.s symbol extraction (never trusts d[0])
// =========================================================================
test('1. TradingView ticker extraction uses row.s strictly and rejects non-EGX or unknown symbols', () => {
  // Even if d[0] contains misleading ticker string, row.s wins
  const comi = extractTickerFromTradingViewRow({
    s: 'EGX:COMI',
    d: ['SWDY_GARBAGE_NAME', 110]
  });
  assert.equal(comi.ticker, 'COMI');
  assert.ok(comi.stock);
  assert.equal(comi.stock?.ticker, 'COMI');

  // Non-EGX exchange prefix rejected
  const foreign = extractTickerFromTradingViewRow({ s: 'NASDAQ:AAPL', d: ['COMI'] });
  assert.equal(foreign.stock, null);
  assert.match(foreign.rejectionReason || '', /Non-EGX/);

  // Unknown EGX ticker rejected
  const unknown = extractTickerFromTradingViewRow({ s: 'EGX:FAKE999', d: ['Fake Co'] });
  assert.equal(unknown.stock, null);
  assert.match(unknown.rejectionReason || '', /not found/);
});

// =========================================================================
// Test 2: EGX listed stock universe lookup & integrity
// =========================================================================
test('2. EGX stocks universe lookup resolves valid tickers, strips .CA, and avoids duplicates', () => {
  assert.ok(EGX_STOCKS_UNIVERSE.length >= 40);
  const seen = new Set<string>();
  for (const s of EGX_STOCKS_UNIVERSE) {
    assert.ok(!seen.has(s.ticker), `Duplicate ticker in universe: ${s.ticker}`);
    seen.add(s.ticker);
    assert.ok(s.isin && s.isin.trim().length > 0, `Missing identifier for ${s.ticker}`);
    assert.ok(s.yahooTicker.endsWith('.CA'), `Invalid yahooTicker for ${s.ticker}`);
  }
  const tmgh = getEGXStock('tmgh.ca');
  assert.equal(tmgh?.ticker, 'TMGH');
  assert.equal(getEGXStock('UNKNOWN_TICKER_XYZ'), undefined);
});

// =========================================================================
// Test 3: Quote anomaly rejection & historical candle cleaning
// =========================================================================
test('3. Anomaly detection rejects negative prices, high < low, negative volume, >25% jumps, and malformed candles', () => {
  assert.equal(validateQuoteAnomaly({ close: -10 }).valid, false);
  assert.equal(validateQuoteAnomaly({ close: 0 }).valid, false);
  assert.equal(validateQuoteAnomaly({ close: 50, high: 48, low: 52 }).valid, false);
  assert.equal(validateQuoteAnomaly({ close: 50, volume: -100 }).valid, false);
  assert.equal(validateQuoteAnomaly({ close: 50, changePct: 35 }).valid, false);

  const rvolWarning = validateQuoteAnomaly({ close: 50, changePct: 3.2, high: 51, low: 49, volume: 100000, rvol: 220 });
  assert.equal(rvolWarning.valid, true);
  assert.ok(rvolWarning.warnings.length > 0);

  const rawCandles: Candle[] = [
    { date: '2026-10-01', open: 10, high: 11, low: 9.5, close: 10.5, volume: 1000 },
    { date: '2026-10-02', open: -5, high: 11, low: 9, close: 10, volume: 1000 },     // bad open
    { date: '2026-10-03', open: 10, high: 9, low: 11, close: 10, volume: 1000 },     // high < low
    { date: '2026-10-04', open: 10.5, high: 19, low: 10, close: 18, volume: 2000 }   // >35% unadjusted jump warning
  ];
  const cleaned = validateHistoricalCandles(rawCandles);
  assert.equal(cleaned.candles.length, 2);
  assert.equal(cleaned.rejectedBarsCount, 2);
  assert.equal(cleaned.anomalyWarnings.length, 1);
});

// =========================================================================
// Test 4: Egyptian Exchange calendar (Fri/Sat + public holidays) & staleness
// =========================================================================
test('4. Egyptian calendar handles Fri/Sat weekends, EGYPT_PUBLIC_HOLIDAYS, and business days accurately', () => {
  // 2026-11-13 is Friday, 2026-11-14 is Saturday, 2026-11-12 is Thursday
  assert.equal(isEgxTradingDay('2026-11-13'), false);
  assert.equal(isEgxTradingDay('2026-11-14'), false);
  assert.equal(isEgxTradingDay('2026-11-12'), true);

  // Official public holidays must be non-trading days even on weekdays
  assert.ok(EGYPT_PUBLIC_HOLIDAYS.has('2026-01-07'));
  assert.equal(isEgxTradingDay('2026-01-07'), false);
  assert.equal(isEgxTradingDay('2026-07-23'), false);

  // Session date on Friday 2026-11-13 afternoon Cairo time -> Thursday 2026-11-12
  const friSession = getLatestEgxSessionDate(new Date('2026-11-13T12:00:00Z'));
  assert.equal(friSession, '2026-11-12');

  // Business days between Thu 2026-11-12 and Sun 2026-11-15 = 1 (Sun only, skipping Fri & Sat)
  assert.equal(computeBusinessDaysBetween('2026-11-12', '2026-11-15'), 1);
});

// =========================================================================
// Test 5: Fundamental separation (published vs derived) & bank sector scoring
// =========================================================================
test('5. Fundamentals strictly separate published EPS/BVPS from derived metrics and do not penalize banks on D/E', () => {
  const realComi = getEGXStock('COMI')!;
  const origEps = realComi.tvEps;
  const origAnnualEps = realComi.tvLastAnnualEps;
  const origPe = realComi.tvPeRatio;
  const origDe = realComi.tvDebtToEquity;
  const origRoe = realComi.tvRoe;
  const origMargin = realComi.tvNetMargin;

  try {
    // Case A: Published EPS absent, only P/E present -> ratios.eps MUST stay null, derivedMetrics holds impliedEpsFromPe
    realComi.tvEps = null;
    realComi.tvLastAnnualEps = null;
    realComi.tvPeRatio = 8.0;
    realComi.tvDebtToEquity = 9.5; // High deposit-driven ratio in banks
    realComi.tvRoe = 28;
    realComi.tvNetMargin = 42;

    const fund = FundamentalAnalysisEngine.getFinancials('COMI', 100);
    assert.equal(fund.sectorProfile, 'BANK_FINANCIAL');
    assert.equal(fund.ratios.eps, null);
    assert.equal(fund.derivedMetrics.impliedEpsFromPe, 12.5);
    assert.equal(fund.metricProvenance.eps, 'COMPUTED_FROM_MULTIPLE');
    // Bank with D/E = 9.5 should NOT get a negative penalty component
    const deComp = fund.qualityScoreComponents.find((c) => c.labelAr.includes('المديونية'));
    assert.equal(deComp, undefined);
  } finally {
    realComi.tvEps = origEps;
    realComi.tvLastAnnualEps = origAnnualEps;
    realComi.tvPeRatio = origPe;
    realComi.tvDebtToEquity = origDe;
    realComi.tvRoe = origRoe;
    realComi.tvNetMargin = origMargin;
  }
});

// =========================================================================
// Test 6: Fair value refuses circular derivation (P / PE) when published EPS/BVPS missing
// =========================================================================
test('6. FairValueValuationEngine refuses valuation when published EPS and BVPS are missing even if P/E & P/B exist', () => {
  const realComi = getEGXStock('COMI')!;
  const origEps = realComi.tvEps;
  const origAnnualEps = realComi.tvLastAnnualEps;
  const origBvps = realComi.tvBvps;
  const origBook = realComi.tvBookValue;

  try {
    realComi.tvEps = null;
    realComi.tvLastAnnualEps = null;
    realComi.tvBvps = null;
    realComi.tvBookValue = null;

    const fair = FairValueValuationEngine.calculate('COMI', 100, 8.5, 2.2, 2.5, 28, null, null);
    assert.equal(fair.available, false);
    assert.equal(fair.estimatedFairValue, null);
    assert.equal(fair.valuationStatus, 'UNAVAILABLE');
    assert.match(fair.insufficientReasonAr || '', /المنشورة|الربحية/);
  } finally {
    realComi.tvEps = origEps;
    realComi.tvLastAnnualEps = origAnnualEps;
    realComi.tvBvps = origBvps;
    realComi.tvBookValue = origBook;
  }
});

// =========================================================================
// Test 7: TechnicalAnalysisEngine <30 candle refusal, squeeze, and false breakout detection
// =========================================================================
test('7. TechnicalAnalysisEngine refuses <30 candles and detects volatility squeeze & false breakout', () => {
  const tooShort = buildSyntheticCandles(20);
  const refused = TechnicalAnalysisEngine.calculateSafe(tooShort, null, { isRealData: true });
  assert.equal(refused.status, 'INSUFFICIENT_DATA');

  const upperWickBars = buildSyntheticCandles(45, { upperWickLastBar: true });
  const wickRes = TechnicalAnalysisEngine.calculateSafe(upperWickBars, null, { isRealData: true });
  assert.equal(wickRes.status, 'OK');
  assert.equal(wickRes.result?.falseBreakoutDetected, true);
  assert.ok(wickRes.result?.falseBreakoutNoteAr);

  const squeezedBars = buildSyntheticCandles(45, { dailyStep: 0.05, squeezeTail: true });
  const sqRes = TechnicalAnalysisEngine.calculateSafe(squeezedBars, null, { isRealData: true });
  assert.equal(sqRes.status, 'OK');
  assert.equal(sqRes.result?.volatilityContraction?.detected, true);
});

// =========================================================================
// Test 8: Stock Screener 100-pt rubric, zero-for-missing, and stale block
// =========================================================================
test('8. StockScreener scores missing indicators as 0, guards stale data, and classifies breakout/overextension', () => {
  const staleStock = makeStockFixture({
    isLiveQuote: true,
    isStaleQuote: true,
    priceDate: '2026-10-01'
  });
  const staleRes = scoreStockForScreener(staleStock, { tradingViewOnline: true });
  assert.equal(staleRes.screenerItem.screenerCategory, 'INSUFFICIENT_DATA');
  assert.equal(staleRes.screenerItem.score, null);
  assert.equal(staleRes.screenerItem.confidencePct, 0);

  // Stock with minimal indicators (EMA20/50 only, missing MACD/ADX/News/Mom) -> missing pillars stay 0!
  const sparseLive = makeStockFixture({
    isLiveQuote: true,
    isStaleQuote: false,
    priceDate: '2026-11-12',
    currentPrice: 50,
    prevClose: 49,
    valueTraded: 20_000_000,
    tvEma20: 48,
    tvEma50: 46,
    tvEma200: null,
    tvAdx: null,
    tvMacd: null,
    tvMacdSignal: null,
    tvMom: null,
    tvRsi: 58,
    tvRelVol: 1.6,
    tvRvol: 1.6,
    tvHigh1M: 51,
    tvHigh3M: 55,
    tvHigh52W: 60
  });
  const sparseScored = scoreStockForScreener(sparseLive, { tradingViewOnline: true });
  assert.equal(sparseScored.screenerItem.pillarBreakdown.news10, 0);
  assert.ok(sparseScored.screenerItem.confidencePct < 100);
  assert.ok((sparseScored.screenerItem.score ?? 0) > 0);
  assert.notEqual(sparseScored.screenerItem.screenerCategory, 'INSUFFICIENT_DATA');
});

// =========================================================================
// Test 9: AiRecommendationEngine blocks BUY on stale data & never fabricates target3
// =========================================================================
test('9. AiRecommendationEngine blocks BUY on stale data and leaves target3 null without genuine resistance', async () => {
  const candles = buildSyntheticCandles(50, { dailyStep: 0.4 });
  const techOut = TechnicalAnalysisEngine.calculateSafe(candles, null, { isRealData: true, isStale: false });
  assert.equal(techOut.status, 'OK');
  const tech = techOut.result!;
  // Strip pivot/52W highs above current price and restrict resistances to 1 level only
  tech.resistanceZones = [
    {
      priceLevel: Number((tech.currentPrice * 1.07).toFixed(2)),
      type: 'RESISTANCE',
      strength: 'STRONG',
      touches: 3,
      description: 'مقاومة حقيقية وحيدة'
    }
  ];
  tech.pivotPoints = undefined;

  const stockNoExtraRes = makeStockFixture({
    currentPrice: tech.currentPrice,
    prevClose: tech.previousClose,
    isLiveQuote: true,
    isStaleQuote: false,
    tvHigh1M: null,
    tvHigh3M: null,
    tvHigh52W: null,
    valueTraded: 40_000_000
  });

  const fund = FundamentalAnalysisEngine.getFinancials('COMI', stockNoExtraRes.currentPrice);
  const fair = FairValueValuationEngine.calculate('COMI', stockNoExtraRes.currentPrice, fund.ratios.peRatio, fund.ratios.pbRatio, fund.ratios.dividendYield, fund.ratios.roe, fund.ratios.eps, fund.ratios.bookValuePerShare);

  const plan = await AiRecommendationEngine.analyze(stockNoExtraRes, tech, fund, fair, [], {
    generateFreshAi: false,
    recordHistory: false
  });
  assert.equal(plan.available, true);
  assert.ok(plan.target1);
  assert.equal(plan.target3, null, 'Must NOT fabricate target3 when no 3rd resistance exists');
  assert.ok((plan.stopLossPrice ?? 0) < plan.currentPrice);
  assert.ok((plan.target1?.price ?? 0) > plan.currentPrice);

  // Now mark stock stale -> BUY must be strictly blocked (capped at WAIT)
  const staleStock = makeStockFixture({
    currentPrice: tech.currentPrice,
    prevClose: tech.previousClose,
    isLiveQuote: true,
    isStaleQuote: true,
    valueTraded: 40_000_000
  });
  const stalePlan = await AiRecommendationEngine.analyze(staleStock, tech, fund, fair, [], {
    generateFreshAi: false,
    recordHistory: false
  });
  assert.notEqual(stalePlan.recommendation, 'BUY');
  assert.notEqual(stalePlan.recommendation, 'STRONG_BUY');
  assert.equal(stalePlan.isStaleData, true);
});

// =========================================================================
// Test 10: Backtesting engine sizing, next-bar execution, conflict resolution, and VALUE_MOMENTUM block
// =========================================================================
test('10. Backtesting respects risk sizing without forced minimum shares, prevents look-ahead, and blocks VALUE_MOMENTUM', () => {
  const candles = buildSyntheticCandles(110, { dailyStep: 0.25, wave: true });

  // Case A: Small capital where risk budget cannot afford 1 share -> 0 trades (no forced 10 shares!)
  const tinyCap = runSimulationOnCandles({
    ticker: 'COMI',
    strategyId: 'SWING_TREND_PULLBACK',
    candles,
    initialCapital: 100, // 2% risk = 2 EGP, far too small for ~100 EGP stock stop distance
    maxRiskPct: 2,
    commissionRoundTripPct: 0.3,
    slippagePct: 0.1,
    sourceName: 'Fixture',
    isStaleData: false,
    lastCandleDate: candles[candles.length - 1].date
  });
  assert.equal(tinyCap.status, 'OK');
  assert.equal(tinyCap.totalTradesCount, 0);

  // Case B: Normal capital returns In-Sample, Out-of-Sample, Walk-Forward folds, and Regimes
  const normal = runSimulationOnCandles({
    ticker: 'COMI',
    strategyId: 'BREAKOUT_MOMENTUM',
    candles,
    initialCapital: 500_000,
    maxRiskPct: 2,
    commissionRoundTripPct: 0.3,
    slippagePct: 0.1,
    sourceName: 'Fixture',
    isStaleData: false,
    lastCandleDate: candles[candles.length - 1].date
  });
  assert.equal(normal.status, 'OK');
  assert.ok(normal.inSampleMetrics);
  assert.ok(normal.outOfSampleMetrics);
  assert.equal(normal.regimePerformance.length, 3);
  assert.ok(normal.walkForwardFolds.length >= 1);

  // Case C: VALUE_MOMENTUM blocked to prevent point-in-time look-ahead bias
  const valueBlocked = runSimulationOnCandles({
    ticker: 'COMI',
    strategyId: 'VALUE_MOMENTUM',
    candles,
    initialCapital: 500_000,
    maxRiskPct: 2,
    commissionRoundTripPct: 0.3,
    slippagePct: 0.1,
    sourceName: 'Fixture',
    isStaleData: false,
    lastCandleDate: candles[candles.length - 1].date
  });
  assert.equal(valueBlocked.status, 'INSUFFICIENT_DATA');
  assert.match(valueBlocked.errorAr || '', /تاريخية|نقطة زمنية/);
});

// =========================================================================
// Test 11: News classification & rumor/negation guard
// =========================================================================
test('11. News classifier marks Google News press unconfirmed, EGX domain confirmed, and guards rumors/negations', () => {
  const press = classifyNewsHeadline('البنك التجاري الدولي يحقق نمو أرباح بنسبة 30%', 'Al Mal', 'almalnews.com');
  assert.equal(press.isConfirmed, false);
  assert.equal(press.newsType, 'FINANCIAL_RESULTS');
  assert.equal(press.impact, 'POSITIVE');

  const official = classifyNewsHeadline('إفصاح رسمي: موافقة على توزيع كوبون نقدي للمساهمين', 'EGX', 'egx.com.eg');
  assert.equal(official.isConfirmed, true);
  assert.equal(official.newsType, 'EGX_OFFICIAL_DISCLOSURE');
  assert.equal(official.impact, 'POSITIVE');

  const rumor = classifyNewsHeadline('أنباء عن شائعة استحواذ محتمل رغم تراجع الأرباح', 'Portal', 'example.com');
  assert.equal(rumor.isConfirmed, false);
  assert.equal(rumor.newsType, 'RUMOR_OR_CIRCULATED');
  assert.equal(rumor.impact, 'NEUTRAL');

  const negation = classifyNewsHeadline('الشركة تنفي صحة توقيع عقد استحواذ جديد', 'Al Borsa', 'alborsaanews.com');
  assert.equal(negation.isConfirmed, false);
  assert.notEqual(negation.impact, 'POSITIVE');
});

// =========================================================================
// Test 12: HTTP API integration tests (validation, screener filters, health, 400/404)
// =========================================================================
test('12. Express API integration routes validate inputs cleanly and return expected JSON payloads', async () => {
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // Health
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, 'ONLINE');

    // Market overview
    const ovRes = await fetch(`${baseUrl}/api/market/overview`);
    assert.equal(ovRes.status, 200);
    const ov = await ovRes.json();
    assert.ok(ov.dataStatus);
    assert.ok(ov.cbeData);

    // Screener filtering
    const scrRes = await fetch(`${baseUrl}/api/screener?index=EGX30`);
    assert.equal(scrRes.status, 200);
    const scrList = await scrRes.json();
    assert.ok(Array.isArray(scrList));
    assert.ok(scrList.every((item: any) => item.index === 'EGX30'));

    // Invalid ticker format -> 400
    const badTickerRes = await fetch(`${baseUrl}/api/stocks/INVALID!$$`);
    assert.equal(badTickerRes.status, 400);

    // Unknown valid-format ticker -> 404
    const notFoundRes = await fetch(`${baseUrl}/api/stocks/ZZZZ99`);
    assert.equal(notFoundRes.status, 404);

    // Invalid portfolio add (negative shares) -> 400
    const badPortRes = await fetch(`${baseUrl}/api/portfolio/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: 'COMI', shares: -5, buyPrice: 80 })
    });
    assert.equal(badPortRes.status, 400);

    // Invalid backtest strategy -> 400
    const badBtRes = await fetch(`${baseUrl}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: 'COMI', strategyId: 'FAKE_STRAT' })
    });
    assert.equal(badBtRes.status, 400);

    // Chat empty message -> 400
    const badChatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' })
    });
    assert.equal(badChatRes.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// =========================================================================
// Test 13: CBE official HTML parser & TradingView WebSocket frame decoder
// =========================================================================
test('13. CBE HTML macro parser and TradingView WebSocket OHLCV frame decoder extract exact metrics', () => {
  const sampleHtml = `
    <div>Net International Reserves reached US$ 57,499.8 mn at the end of October 2026 (Provisional) 02 Nov 2026</div>
    <div><span>Overnight Deposit Rate</span><strong>20.00%</strong></div>
    <div><span>Overnight Lending Rate</span><strong>21.00%</strong></div>
    <div><span>CORE INFLATION RATE</span><strong>13.100%</strong></div>
    <div><span>HEADLINE INFLATION RATE</span><strong>12.700%</strong></div>
  `;
  const parsed = parseCbeMacroHtml(sampleHtml);
  assert.equal(parsed.overnightDepositRate, 20);
  assert.equal(parsed.overnightLendingRate, 21);
  assert.equal(parsed.coreInflationRate, 13.1);
  assert.equal(parsed.headlineInflationRate, 12.7);
  assert.equal(parsed.foreignReservesBillionUsd, 57.5);
  assert.equal(parsed.reservesDateText, '2026-11-02');

  const frameA = JSON.stringify({ m: 'timescale_update', p: ['cs_1', { sds_1: { s: [{ v: [1795046400, 8.89, 9.39, 8.89, 8.95, 3456124] }] } }] });
  const rawWire = `~m~4~m~~h~1~m~${frameA.length}~m~${frameA}`;
  const frames = parseTradingViewChartFrames(rawWire);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].m, 'timescale_update');
  assert.equal(frames[0].p[1].sds_1.s[0].v[4], 8.95);
});

// =========================================================================
// Test 14: JSON Content-Type / HTML guard (both backend parser & /api routing)
// =========================================================================
test('14. HTML responses on /api/* and upstream feeds are handled safely without Unexpected token < crashes', async () => {
  // Upstream HTML response (e.g. WAF/CDN returning HTTP 200 <!doctype html>...)
  const htmlRes = new Response('<!doctype html><html><body>WAF Challenge</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
  await assert.rejects(
    () => parseSafeExternalJson(htmlRes, 'TestFeed'),
    /HTML\/حماية بدلاً من JSON/
  );

  // Empty response body guard
  const emptyRes = new Response('   ', {
    status: 502,
    headers: { 'content-type': 'application/json' }
  });
  await assert.rejects(
    () => parseSafeExternalJson(emptyRes, 'TestFeed'),
    /استجابة فارغة/
  );

  // Express /api/* unknown path and malformed JSON body MUST return application/json, NEVER HTML
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const unknownApi = await fetch(`${baseUrl}/api/nonexistent-route`);
    assert.equal(unknownApi.status, 404);
    assert.match(unknownApi.headers.get('content-type') || '', /application\/json/i);
    const unknownBody = await unknownApi.json();
    assert.match(unknownBody.error || '', /API endpoint not found/);

    const malformedReq = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json'
    });
    assert.equal(malformedReq.status, 400);
    assert.match(malformedReq.headers.get('content-type') || '', /application\/json/i);
    const malformedBody = await malformedReq.json();
    assert.match(malformedBody.error || '', /Invalid JSON/);

    const chatErrReq = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'اختبار', lang: 'ar' })
    });
    assert.ok(![403, 502, 503, 504].includes(chatErrReq.status), `Unexpected nginx-intercepted status ${chatErrReq.status}`);
    assert.match(chatErrReq.headers.get('content-type') || '', /application\/json/i);
    const chatErrBody = await chatErrReq.json();
    assert.ok(typeof chatErrBody.reply === 'string' || typeof chatErrBody.error === 'string');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
