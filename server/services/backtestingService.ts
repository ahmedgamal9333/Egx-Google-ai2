import { getEGXStock } from '../data/egxStocks';
import type { Candle } from './technicalAnalysisService';
import { MarketDataService } from './marketDataService';

export interface BacktestParams {
  strategyId: string;
  ticker: string;
  startDate: string;
  endDate: string;
  initialCapitalEgp: number;
  maxRiskPerTradePct: number;
  commissionPct: number;
  slippagePct: number;
  minRewardRiskRatio: number;
}

export interface BacktestTrade {
  tradeId: string;
  ticker: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  shares: number;
  grossReturnPct: number;
  netReturnPct: number;
  netProfitEgp: number;
  exitReason: 'TARGET_1' | 'TARGET_2' | 'STOP_LOSS' | 'TIME_EXPIRY' | 'END_OF_PERIOD';
  exitReasonAr: string;
  holdingDays: number;
  signalReasonAr: string;
  marketRegime: 'BULL' | 'BEAR' | 'SIDEWAYS';
  hadSameBarConflict?: boolean;
}

export interface RegimeMetrics {
  regime: 'BULL' | 'BEAR' | 'SIDEWAYS';
  regimeAr: string;
  tradesCount: number;
  winRatePct: number | null;
  totalReturnPct: number;
}

export interface ValidationSplitMetrics {
  periodLabel: string;
  candlesCount: number;
  tradesCount: number;
  totalReturnPct: number;
  winRatePct: number | null;
  maxDrawdownPct: number;
}

export interface BacktestResult {
  status: 'OK' | 'INSUFFICIENT_DATA';
  errorAr?: string;
  ticker: string;
  strategyId: string;
  strategyNameAr: string;
  strategyDescriptionAr: string;
  periodTested: string;
  candlesUsedCount: number;
  dataSourceAr: string;
  isStaleData: boolean;
  lastCandleDate: string | null;
  initialCapitalEgp: number;
  finalEquityEgp: number | null;
  totalNetProfitEgp: number | null;
  totalReturnPct: number | null;
  annualizedReturnPct: number | null;
  benchmarkStockBuyHoldPct: number | null;
  alphaGeneratedPct: number | null;
  totalTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  winRatePct: number | null;
  profitFactor: number | null;
  maxDrawdownPct: number | null;
  sharpeRatio: number | null;
  avgTradeReturnPct: number | null;
  avgWinningTradePct: number | null;
  avgLosingTradePct: number | null;
  commissionPaidTotalEgp: number;
  sameBarConflictsCount: number;
  executionModelAr: string;
  disclaimerAr: string;
  regimePerformance: RegimeMetrics[];
  inSampleMetrics: ValidationSplitMetrics | null;
  outOfSampleMetrics: ValidationSplitMetrics | null;
  walkForwardFolds: ValidationSplitMetrics[];
  recentTrades: BacktestTrade[];
}

function calcEMA(series: number[], period: number): number {
  if (series.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = series[0];
  for (let i = 1; i < series.length; i++) {
    ema = series[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) {
      avgGain = (avgGain * (period - 1) + d) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - d) / period;
    }
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  return slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
}

function classifyBarRegime(slice: Candle[]): 'BULL' | 'BEAR' | 'SIDEWAYS' {
  if (slice.length < 50) return 'SIDEWAYS';
  const closes = slice.map((c) => c.close);
  const ema50Now = calcEMA(closes, 50);
  const ema50Prev = calcEMA(closes.slice(0, -10), 50);
  const curClose = closes[closes.length - 1];
  const ret20 = closes.length >= 21 ? (curClose - closes[closes.length - 21]) / closes[closes.length - 21] : 0;

  if (curClose > ema50Now && ema50Now >= ema50Prev * 1.003 && ret20 >= 0.02) return 'BULL';
  if (curClose < ema50Now && ema50Now <= ema50Prev * 0.997 && ret20 <= -0.02) return 'BEAR';
  return 'SIDEWAYS';
}

/**
 * Pure zero-look-ahead simulation on validated historical candles:
 * - Signal evaluated strictly on candles[0..i] close
 * - Entry executed at NEXT bar open (candles[i+1].open) + slippage (models gaps honestly)
 * - Position sizing strictly respects risk budget (NEVER forces minimum shares >= budget)
 * - Gap exits & same-bar Stop+Target conflict resolved conservatively (STOP_LOSS first)
 */
export function runSimulationOnCandles(input: {
  ticker: string;
  strategyId: string;
  candles: Candle[];
  initialCapital: number;
  maxRiskPct: number;
  commissionRoundTripPct: number;
  slippagePct: number;
  warmupBars?: number;
  sourceName: string;
  isStaleData: boolean;
  lastCandleDate: string | null;
}): BacktestResult {
  const {
    ticker,
    strategyId: strat,
    candles,
    initialCapital,
    maxRiskPct,
    commissionRoundTripPct,
    slippagePct,
    sourceName,
    isStaleData,
    lastCandleDate
  } = input;

  let strategyNameAr = 'استراتيجية التداول المتأرجح مع الاتجاه (EMA20/50 + RSI Pullback)';
  let strategyDesc =
    'إشارة ارتداد فوق EMA50 قرب EMA20 مع RSI بين 40 و64؛ تنفيذ الدخول عند افتتاح الجلسة التالية مع احتساب فجوات الافتتاح والعمولات دون تحيز مستقبلي.';
  if (strat === 'BREAKOUT_MOMENTUM') {
    strategyNameAr = 'استراتيجية اختراق القمم مع طفرة السيولة (Breakout Momentum)';
    strategyDesc =
      'اختراق قمة 20 جلسة سابقة بحجم نسبي RVOL >= 1.25x وRSI بين 50 و78؛ الدخول عند افتتاح الجلسة التالية.';
  } else if (strat === 'VALUE_MOMENTUM') {
    strategyNameAr = 'استراتيجية القيمة العادلة المزدوجة (موقوفة تاريخياً لمنع التحيز المستقبلي)';
    strategyDesc =
      'تتطلب بيانات مالية تاريخية منشورة لحظة بلحظة (Point-in-Time Fundamentals) لمنع استخدام نسب مالية حالية على سنوات سابقة.';
  }

  const disclaimerAr =
    'إخلاء مسؤولية: النتائج التاريخية للاختبار تُظهر سلوك الاستراتيجية على بيانات سابقة فقط ولا تمثل ضماناً للأداء المستقبلي. تم التنفيذ بافتتاح الجلسة التالية مع احتساب العمولات والانزلاق السعري وتطبيق سياسة الترجيح التحفظي لوقف الخسارة عند تداخل الأهداف في نفس الشمعة.';

  if (strat === 'VALUE_MOMENTUM') {
    return {
      status: 'INSUFFICIENT_DATA',
      errorAr:
        'تم إيقاف اختبار استراتيجية القيمة العادلة تاريخياً التزاماً بقاعدة منع التحيز المستقبلي (Zero Look-Ahead Bias): لا تتوفر قوائم مالية تاريخية نقطة-بنقطة (Point-in-Time EPS/BVPS) في التغذية المجانية، ولا يجوز تطبيق مضاعفات P/E الحالية على جلسات ماضية.',
      ticker,
      strategyId: strat,
      strategyNameAr,
      strategyDescriptionAr: strategyDesc,
      periodTested: candles.length > 0 ? `${candles[0].date} حتى ${candles[candles.length - 1].date}` : 'غير متاح',
      candlesUsedCount: candles.length,
      dataSourceAr: sourceName,
      isStaleData,
      lastCandleDate,
      initialCapitalEgp: initialCapital,
      finalEquityEgp: null,
      totalNetProfitEgp: null,
      totalReturnPct: null,
      annualizedReturnPct: null,
      benchmarkStockBuyHoldPct: null,
      alphaGeneratedPct: null,
      totalTradesCount: 0,
      winningTradesCount: 0,
      losingTradesCount: 0,
      winRatePct: null,
      profitFactor: null,
      maxDrawdownPct: null,
      sharpeRatio: null,
      avgTradeReturnPct: null,
      avgWinningTradePct: null,
      avgLosingTradePct: null,
      commissionPaidTotalEgp: 0,
      sameBarConflictsCount: 0,
      executionModelAr: 'متوقف لمنع التحيز المستقبلي',
      disclaimerAr,
      regimePerformance: [],
      inSampleMetrics: null,
      outOfSampleMetrics: null,
      walkForwardFolds: [],
      recentTrades: []
    };
  }

  const warmup = input.warmupBars ?? 50;
  if (candles.length < warmup + 15) {
    return {
      status: 'INSUFFICIENT_DATA',
      errorAr: `عدد الشموع التاريخية المتوفرة (${candles.length}) أقل من الحد الأدنى المطلوب للاختبار العادل (${warmup + 15} شمعة).`,
      ticker,
      strategyId: strat,
      strategyNameAr,
      strategyDescriptionAr: strategyDesc,
      periodTested: candles.length > 0 ? `${candles[0].date} حتى ${candles[candles.length - 1].date}` : 'غير متاح',
      candlesUsedCount: candles.length,
      dataSourceAr: sourceName,
      isStaleData: true,
      lastCandleDate,
      initialCapitalEgp: initialCapital,
      finalEquityEgp: null,
      totalNetProfitEgp: null,
      totalReturnPct: null,
      annualizedReturnPct: null,
      benchmarkStockBuyHoldPct: null,
      alphaGeneratedPct: null,
      totalTradesCount: 0,
      winningTradesCount: 0,
      losingTradesCount: 0,
      winRatePct: null,
      profitFactor: null,
      maxDrawdownPct: null,
      sharpeRatio: null,
      avgTradeReturnPct: null,
      avgWinningTradePct: null,
      avgLosingTradePct: null,
      commissionPaidTotalEgp: 0,
      sameBarConflictsCount: 0,
      executionModelAr: 'غير متاح',
      disclaimerAr,
      regimePerformance: [],
      inSampleMetrics: null,
      outOfSampleMetrics: null,
      walkForwardFolds: [],
      recentTrades: []
    };
  }

  const simulateSlice = (sliceStart: number, sliceEnd: number) => {
    let equity = initialCapital;
    let peakEquity = initialCapital;
    let maxDrawdownPct = 0;
    let totalCommissionsPaid = 0;
    let sameBarConflictsCount = 0;
    const trades: BacktestTrade[] = [];

    interface OpenPos {
      entryIdx: number;
      entryDate: string;
      entryPrice: number;
      shares: number;
      stopLoss: number;
      target1: number;
      target2: number;
      signalReasonAr: string;
      marketRegime: 'BULL' | 'BEAR' | 'SIDEWAYS';
    }
    interface PendingSignal {
      stopDist: number;
      signalReasonAr: string;
      marketRegime: 'BULL' | 'BEAR' | 'SIDEWAYS';
    }

    let openPos: OpenPos | null = null;
    let pendingSignal: PendingSignal | null = null;
    const singleSideSlip = slippagePct / 100;
    const roundTripCommRate = commissionRoundTripPct / 100;

    for (let i = sliceStart; i < sliceEnd; i++) {
      const bar = candles[i];

      // 1. Execute any pending signal from prior bar's close at TODAY'S OPEN (Zero intra-bar look-ahead!)
      if (!openPos && pendingSignal) {
        const entryPrice = Number((bar.open * (1 + singleSideSlip)).toFixed(3));
        if (entryPrice > 0 && pendingSignal.stopDist > 0) {
          const stopLoss = Number((entryPrice - pendingSignal.stopDist).toFixed(2));
          const target1 = Number((entryPrice + pendingSignal.stopDist * 1.5).toFixed(2));
          const target2 = Number((entryPrice + pendingSignal.stopDist * 2.5).toFixed(2));

          const maxRiskBudget = equity * (maxRiskPct / 100);
          const riskShares = Math.floor(maxRiskBudget / pendingSignal.stopDist);
          const maxAffordShares = Math.floor((equity * 0.95) / entryPrice);
          // Strict risk-budget position sizing: NEVER force >= 10 shares!
          const shares = Math.min(riskShares, maxAffordShares);

          if (shares > 0 && shares * entryPrice <= equity) {
            openPos = {
              entryIdx: i,
              entryDate: bar.date,
              entryPrice,
              shares,
              stopLoss,
              target1,
              target2,
              signalReasonAr: pendingSignal.signalReasonAr,
              marketRegime: pendingSignal.marketRegime
            };
          }
        }
        pendingSignal = null;
      }

      // 2. Manage open position on today's OHLC (modeling gap-opens & conservative same-bar conflict)
      if (openPos) {
        let exitPrice: number | null = null;
        let exitReason: BacktestTrade['exitReason'] | null = null;
        let exitReasonAr = '';
        let hadConflict = false;
        const holdingDays = i - openPos.entryIdx;

        // Gap-down at open executes immediately at open * (1 - slippage)
        if (bar.open <= openPos.stopLoss) {
          exitPrice = Number((bar.open * (1 - singleSideSlip)).toFixed(3));
          exitReason = 'STOP_LOSS';
          exitReasonAr = `فجوة هابطة كسرت وقف الخسارة (${openPos.stopLoss})`;
        } else if (bar.open >= openPos.target2) {
          exitPrice = Number((bar.open * (1 - singleSideSlip)).toFixed(3));
          exitReason = 'TARGET_2';
          exitReasonAr = `فجوة صاعدة حققت المستهدف الثاني (${openPos.target2})`;
        } else if (bar.low <= openPos.stopLoss && bar.high >= openPos.target2) {
          // Conservative intra-bar ambiguity resolution: STOP_LOSS triggers first
          hadConflict = true;
          sameBarConflictsCount++;
          exitPrice = Number((openPos.stopLoss * (1 - singleSideSlip)).toFixed(3));
          exitReason = 'STOP_LOSS';
          exitReasonAr = `تضارب داخل الجلسة (مرتفع ومنخفض بلغا الوقف والهدف) — تم اعتماد وقف الخسارة تحفظياً (${openPos.stopLoss})`;
        } else if (bar.low <= openPos.stopLoss) {
          exitPrice = Number((openPos.stopLoss * (1 - singleSideSlip)).toFixed(3));
          exitReason = 'STOP_LOSS';
          exitReasonAr = `تفعيل وقف الخسارة (${openPos.stopLoss})`;
        } else if (bar.high >= openPos.target2) {
          exitPrice = Number((openPos.target2 * (1 - singleSideSlip)).toFixed(3));
          exitReason = 'TARGET_2';
          exitReasonAr = `تحقق المستهدف الثاني (${openPos.target2})`;
        } else if (holdingDays >= 25) {
          exitPrice = Number((bar.close * (1 - singleSideSlip)).toFixed(3));
          exitReason = bar.close >= openPos.target1 ? 'TARGET_1' : 'TIME_EXPIRY';
          exitReasonAr =
            exitReason === 'TARGET_1'
              ? `إغلاق ربحي قرب المستهدف (${bar.close})`
              : 'انتهاء المهلة الزمنية للمتأرجح (25 جلسة)';
        } else if (i === sliceEnd - 1) {
          exitPrice = bar.close;
          exitReason = 'END_OF_PERIOD';
          exitReasonAr = `إقفال آخر جلسة في الفترة (${bar.date})`;
        }

        if (exitPrice !== null && exitReason !== null) {
          const grossValueEntry = openPos.shares * openPos.entryPrice;
          const grossValueExit = openPos.shares * exitPrice;
          const fees = Math.round((grossValueEntry + grossValueExit) * (roundTripCommRate / 2));
          totalCommissionsPaid += fees;
          const netProfit = Math.round(grossValueExit - grossValueEntry - fees);
          const grossReturnPct = Number((((exitPrice - openPos.entryPrice) / openPos.entryPrice) * 100).toFixed(2));
          const netReturnPct = Number(((netProfit / grossValueEntry) * 100).toFixed(2));

          equity += netProfit;
          if (equity > peakEquity) peakEquity = equity;
          const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
          if (dd > maxDrawdownPct) maxDrawdownPct = dd;

          trades.push({
            tradeId: `T-${String(trades.length + 1).padStart(2, '0')}`,
            ticker,
            entryDate: openPos.entryDate,
            entryPrice: Number(openPos.entryPrice.toFixed(2)),
            exitDate: bar.date,
            exitPrice: Number(exitPrice.toFixed(2)),
            shares: openPos.shares,
            grossReturnPct,
            netReturnPct,
            netProfitEgp: netProfit,
            exitReason,
            exitReasonAr,
            holdingDays: Math.max(1, holdingDays),
            signalReasonAr: openPos.signalReasonAr,
            marketRegime: openPos.marketRegime,
            hadSameBarConflict: hadConflict
          });
          openPos = null;
        }
        continue;
      }

      // 3. Evaluate entry signal strictly from candles[0..i] (to execute at candles[i+1].open)
      if (i >= sliceEnd - 2) continue;

      const slice = candles.slice(0, i + 1);
      const closes = slice.map((c) => c.close);
      const ema20 = calcEMA(closes, 20);
      const ema50 = calcEMA(closes, 50);
      const rsi14 = calcRSI(closes, 14);
      const atr14 = calcATR(slice, 14);
      if (atr14 <= 0 || bar.close <= 0) continue;

      const volSlice = slice.slice(-21, -1);
      const avgVol20 = volSlice.length > 0 ? volSlice.reduce((s, c) => s + c.volume, 0) / volSlice.length : 0;
      const rvol = avgVol20 > 0 ? bar.volume / avgVol20 : 1;
      const high20Prev = Math.max(...slice.slice(-21, -1).map((c) => c.high));

      let triggered = false;
      let signalReasonAr = '';

      if (strat === 'SWING_TREND_PULLBACK') {
        if (
          bar.close > ema50 &&
          ema20 >= ema50 * 0.992 &&
          bar.low <= ema20 * 1.02 &&
          bar.close >= ema20 * 0.985 &&
          rsi14 >= 40 &&
          rsi14 <= 64 &&
          bar.close > bar.open
        ) {
          triggered = true;
          signalReasonAr = `إشارة إغلاق ${bar.date}: ارتداد فوق EMA50 (${ema50.toFixed(2)}) قرب EMA20 (${ema20.toFixed(2)}) وRSI=${rsi14.toFixed(1)}`;
        }
      } else if (strat === 'BREAKOUT_MOMENTUM') {
        if (bar.close > high20Prev && rvol >= 1.25 && rsi14 >= 50 && rsi14 <= 78) {
          triggered = true;
          signalReasonAr = `إشارة إغلاق ${bar.date}: اختراق قمة 20 جلسة (${high20Prev.toFixed(2)}) بحجم نسبي ${rvol.toFixed(2)}x`;
        }
      }

      if (triggered) {
        const stopDist = Math.max(atr14 * 1.5, bar.close * 0.025);
        pendingSignal = {
          stopDist,
          signalReasonAr,
          marketRegime: classifyBarRegime(slice)
        };
      }
    }

    return { equity, maxDrawdownPct, totalCommissionsPaid, sameBarConflictsCount, trades };
  };

  const fullSim = simulateSlice(warmup, candles.length);
  const trades = fullSim.trades;
  const equity = fullSim.equity;

  const benchmarkStartClose = candles[warmup].close;
  const benchmarkEndClose = candles[candles.length - 1].close;
  const benchmarkStockBuyHoldPct =
    benchmarkStartClose > 0
      ? Number((((benchmarkEndClose - benchmarkStartClose) / benchmarkStartClose) * 100).toFixed(2))
      : null;

  const totalNetProfitEgp = Math.round(equity - initialCapital);
  const totalReturnPct = Number(((totalNetProfitEgp / initialCapital) * 100).toFixed(2));
  const totalDaysCalendar = Math.max(
    1,
    Math.round(
      (new Date(`${candles[candles.length - 1].date}T00:00:00Z`).getTime() -
        new Date(`${candles[warmup].date}T00:00:00Z`).getTime()) /
        86400000
    )
  );
  const annualizedReturnPct = Number(
    (((Math.pow(Math.max(0.01, equity / initialCapital), 365 / totalDaysCalendar)) - 1) * 100).toFixed(2)
  );
  const alphaGeneratedPct =
    benchmarkStockBuyHoldPct !== null
      ? Number((totalReturnPct - benchmarkStockBuyHoldPct).toFixed(2))
      : null;

  const wins = trades.filter((t) => t.netProfitEgp > 0);
  const losses = trades.filter((t) => t.netProfitEgp <= 0);
  const winRatePct = trades.length > 0 ? Number(((wins.length / trades.length) * 100).toFixed(1)) : null;

  const grossWinSum = wins.reduce((s, t) => s + t.netProfitEgp, 0);
  const grossLossSum = Math.abs(losses.reduce((s, t) => s + t.netProfitEgp, 0));
  const profitFactor =
    trades.length === 0
      ? null
      : grossLossSum > 0
      ? Number((grossWinSum / grossLossSum).toFixed(2))
      : wins.length > 0
      ? 99.0
      : 0;

  const avgTradeReturnPct =
    trades.length > 0 ? Number((trades.reduce((s, t) => s + t.netReturnPct, 0) / trades.length).toFixed(2)) : null;
  const avgWinningTradePct =
    wins.length > 0 ? Number((wins.reduce((s, t) => s + t.netReturnPct, 0) / wins.length).toFixed(2)) : null;
  const avgLosingTradePct =
    losses.length > 0 ? Number((losses.reduce((s, t) => s + t.netReturnPct, 0) / losses.length).toFixed(2)) : null;

  let sharpeRatio: number | null = null;
  if (trades.length >= 2) {
    const rets = trades.map((t) => t.netReturnPct);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (rets.length - 1);
    const std = Math.sqrt(variance);
    sharpeRatio = std > 0 ? Number(((mean / std) * Math.sqrt(Math.max(1, trades.length))).toFixed(2)) : null;
  }

  // Market Regime Performance Breakdown
  const regimeMap: { key: 'BULL' | 'BEAR' | 'SIDEWAYS'; labelAr: string }[] = [
    { key: 'BULL', labelAr: 'سوق صاعد (Bull Regime)' },
    { key: 'SIDEWAYS', labelAr: 'سوق عرضي (Sideways Regime)' },
    { key: 'BEAR', labelAr: 'سوق هابط (Bear Regime)' }
  ];
  const regimePerformance: RegimeMetrics[] = regimeMap.map(({ key, labelAr }) => {
    const sub = trades.filter((t) => t.marketRegime === key);
    const subWins = sub.filter((t) => t.netProfitEgp > 0).length;
    return {
      regime: key,
      regimeAr: labelAr,
      tradesCount: sub.length,
      winRatePct: sub.length > 0 ? Number(((subWins / sub.length) * 100).toFixed(1)) : null,
      totalReturnPct: Number(sub.reduce((s, t) => s + t.netReturnPct, 0).toFixed(2))
    };
  });

  // In-Sample (first 70%) vs Out-of-Sample (last 30%) + 3 Walk-Forward Windows
  const buildSplitMetrics = (label: string, sIdx: number, eIdx: number): ValidationSplitMetrics => {
    const sim = simulateSlice(sIdx, eIdx);
    const wCount = sim.trades.filter((t) => t.netProfitEgp > 0).length;
    return {
      periodLabel: `${label} (${candles[sIdx].date} → ${candles[eIdx - 1].date})`,
      candlesCount: eIdx - sIdx,
      tradesCount: sim.trades.length,
      totalReturnPct: Number((((sim.equity - initialCapital) / initialCapital) * 100).toFixed(2)),
      winRatePct: sim.trades.length > 0 ? Number(((wCount / sim.trades.length) * 100).toFixed(1)) : null,
      maxDrawdownPct: Number(sim.maxDrawdownPct.toFixed(2))
    };
  };

  const activeLen = candles.length - warmup;
  let inSampleMetrics: ValidationSplitMetrics | null = null;
  let outOfSampleMetrics: ValidationSplitMetrics | null = null;
  const walkForwardFolds: ValidationSplitMetrics[] = [];

  if (activeLen >= 60) {
    const splitIdx = warmup + Math.floor(activeLen * 0.7);
    inSampleMetrics = buildSplitMetrics('عينة داخلية In-Sample (70%)', warmup, splitIdx);
    outOfSampleMetrics = buildSplitMetrics('خارج العينة Out-of-Sample (30%)', splitIdx, candles.length);

    const foldSize = Math.floor(activeLen / 3);
    for (let f = 0; f < 3; f++) {
      const fStart = warmup + f * foldSize;
      const fEnd = f === 2 ? candles.length : warmup + (f + 1) * foldSize;
      if (fEnd - fStart >= 15) {
        walkForwardFolds.push(buildSplitMetrics(`نافذة Walk-Forward #${f + 1}`, fStart, fEnd));
      }
    }
  }

  return {
    status: 'OK',
    ticker,
    strategyId: strat,
    strategyNameAr,
    strategyDescriptionAr: strategyDesc,
    periodTested: `${candles[warmup].date} حتى ${candles[candles.length - 1].date}`,
    candlesUsedCount: candles.length - warmup,
    dataSourceAr: sourceName,
    isStaleData,
    lastCandleDate,
    initialCapitalEgp: initialCapital,
    finalEquityEgp: Math.round(equity),
    totalNetProfitEgp,
    totalReturnPct,
    annualizedReturnPct,
    benchmarkStockBuyHoldPct,
    alphaGeneratedPct,
    totalTradesCount: trades.length,
    winningTradesCount: wins.length,
    losingTradesCount: losses.length,
    winRatePct,
    profitFactor,
    maxDrawdownPct: Number(fullSim.maxDrawdownPct.toFixed(2)),
    sharpeRatio,
    avgTradeReturnPct,
    avgWinningTradePct,
    avgLosingTradePct,
    commissionPaidTotalEgp: fullSim.totalCommissionsPaid,
    sameBarConflictsCount: fullSim.sameBarConflictsCount,
    executionModelAr:
      'تنفيذ افتتاح الجلسة التالية (Next-Bar Open) + انزلاق سعري وعمولة + فجوات افتتاح + ترجيح تحفظي لوقف الخسارة عند تضارب الشمعة',
    disclaimerAr,
    regimePerformance,
    inSampleMetrics,
    outOfSampleMetrics,
    walkForwardFolds,
    recentTrades: [...trades].reverse()
  };
}

export class BacktestingEngine {
  public static async runBacktest(params: Partial<BacktestParams>): Promise<BacktestResult> {
    const initialCapital = Math.max(10000, Number(params.initialCapitalEgp) || 1000000);
    const strat = params.strategyId || 'SWING_TREND_PULLBACK';
    const rawRisk = params.maxRiskPerTradePct !== undefined ? Number(params.maxRiskPerTradePct) : 2.0;
    const maxRiskPct = Math.max(0.5, Math.min(5, Number.isFinite(rawRisk) ? rawRisk : 2.0));
    const rawComm = params.commissionPct !== undefined ? Number(params.commissionPct) : 0.3;
    const commissionRoundTripPct = Math.max(0, Number.isFinite(rawComm) ? rawComm : 0.3);
    const rawSlip = params.slippagePct !== undefined ? Number(params.slippagePct) : 0.1;
    const slippagePct = Math.max(0, Number.isFinite(rawSlip) ? rawSlip : 0.1);
    const requestedTicker = (params.ticker || 'COMI').toUpperCase().replace('.CA', '').trim();
    const focusStock = getEGXStock(requestedTicker);

    if (!focusStock) {
      return runSimulationOnCandles({
        ticker: requestedTicker,
        strategyId: strat,
        candles: [],
        initialCapital,
        maxRiskPct,
        commissionRoundTripPct,
        slippagePct,
        sourceName: 'غير متاح',
        isStaleData: true,
        lastCandleDate: null
      });
    }

    const dailyRes = await MarketDataService.fetchRealHistoricalCandles(focusStock.ticker, '1D');
    if (!dailyRes.isRealData || dailyRes.candles.length < 65) {
      const res = runSimulationOnCandles({
        ticker: focusStock.ticker,
        strategyId: strat,
        candles: dailyRes.candles,
        initialCapital,
        maxRiskPct,
        commissionRoundTripPct,
        slippagePct,
        sourceName: dailyRes.sourceName,
        isStaleData: true,
        lastCandleDate: dailyRes.lastCandleDate
      });
      if (dailyRes.error) res.errorAr = dailyRes.error;
      return res;
    }

    return runSimulationOnCandles({
      ticker: focusStock.ticker,
      strategyId: strat,
      candles: dailyRes.candles,
      initialCapital,
      maxRiskPct,
      commissionRoundTripPct,
      slippagePct,
      sourceName: dailyRes.sourceName,
      isStaleData: dailyRes.isStale,
      lastCandleDate: dailyRes.lastCandleDate
    });
  }
}
