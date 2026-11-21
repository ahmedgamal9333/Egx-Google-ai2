import { EGX_STOCKS_UNIVERSE, EGXStock } from '../data/egxStocks';
import { FundamentalAnalysisEngine } from './fundamentalAnalysisService';
import { FairValueValuationEngine } from './fairValueService';
import { LiveMarketSyncService } from './liveMarketSyncService';
import { MarketDataService } from './marketDataService';
import { NewsDisclosureService } from './newsService';

export type ScreenerCategory =
  | 'EARLY_LAUNCH_CANDIDATE'
  | 'NEAR_BREAKOUT'
  | 'CONFIRMED_BREAKOUT'
  | 'CONTINUING_UPTREND'
  | 'WATCHLIST'
  | 'WEAK_OR_HIGH_RISK'
  | 'INSUFFICIENT_DATA';

export interface ScreenerPillarBreakdown {
  trend25: number;
  momentum15: number;
  liquidity20: number;
  breakout15: number;
  financial15: number;
  news10: number;
}

export interface ScreenerCandidateResult {
  ticker: string;
  nameAr: string;
  nameEn: string;
  sectorAr: string;
  sectorEn: string;
  index: 'EGX30' | 'EGX70' | 'EGX100';
  currentPrice: number;
  changePct: number;
  volume: number;
  valueTraded: number;
  score: number | null;
  confidencePct: number;
  screenerCategory: ScreenerCategory;
  screenerCategoryAr: string;
  recommendation: 'STRONG_BUY' | 'BUY' | 'WAIT' | 'HOLD' | 'REDUCE' | 'INSUFFICIENT_DATA';
  recommendationAr: string;
  pillarBreakdown: ScreenerPillarBreakdown;
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  dividendYield: number | null;
  rsi14: number | null;
  dailyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
  fairValue: number | null;
  fairValueUpsidePct: number | null;
  breakoutStatus: string;
  relativeVolume: number | null;
  supportLevel: number | null;
  resistanceLevel: number | null;
  accumulationDetected: boolean;
  accumulationNoteAr: string;
  falseBreakoutWarning: boolean;
  reasonsAr: string[];
  risksAr: string[];
  invalidationConditionsAr: string[];
  priceDate: string | null;
  isLiveQuote: boolean;
  isStaleQuote: boolean;
  mathReasonAr: string;
}

export const SCREENER_CATEGORY_LABELS: Record<ScreenerCategory, string> = {
  EARLY_LAUNCH_CANDIDATE: 'مرشح لانطلاقة مبكرة',
  NEAR_BREAKOUT: 'قريب من الاختراق',
  CONFIRMED_BREAKOUT: 'اختراق مؤكد',
  CONTINUING_UPTREND: 'اتجاه صاعد مستمر',
  WATCHLIST: 'سهم يحتاج مراقبة',
  WEAK_OR_HIGH_RISK: 'سهم ضعيف أو عالي المخاطر',
  INSUFFICIENT_DATA: 'بيانات غير كافية'
};

export function scoreStockForScreener(
  stock: EGXStock,
  options?: {
    tradingViewOnline?: boolean;
    minLiquidityEgp?: number;
    hasConfirmedNewsCatalyst?: boolean;
    hasNegativeNews?: boolean;
  }
): { stockSummary: any; screenerItem: ScreenerCandidateResult } {
  const tvOnline = options?.tradingViewOnline ?? true;
  const minLiquidityEgp = options?.minLiquidityEgp ?? 1_500_000;

  const fund = FundamentalAnalysisEngine.getFinancials(stock.ticker, stock.currentPrice);
  const fair = FairValueValuationEngine.calculate(
    stock.ticker,
    stock.currentPrice,
    fund.ratios.peRatio,
    fund.ratios.pbRatio,
    fund.ratios.dividendYield,
    fund.ratios.roe,
    fund.ratios.eps,
    fund.ratios.bookValuePerShare
  );

  const changePct =
    stock.prevClose > 0
      ? Number((((stock.currentPrice - stock.prevClose) / stock.prevClose) * 100).toFixed(2))
      : 0;

  // Daily trend strictly from real TV moving averages
  let dailyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE' = 'UNAVAILABLE';
  if (
    stock.tvEma20 !== null &&
    stock.tvEma20 !== undefined &&
    stock.tvEma50 !== null &&
    stock.tvEma50 !== undefined
  ) {
    if (stock.currentPrice > stock.tvEma20 && stock.tvEma20 >= stock.tvEma50 * 0.995) {
      dailyTrend = 'BULLISH';
    } else if (stock.currentPrice < stock.tvEma20 && stock.tvEma20 < stock.tvEma50) {
      dailyTrend = 'BEARISH';
    } else {
      dailyTrend = 'NEUTRAL';
    }
  }

  // Evaluate available real inputs
  const hasPrice = stock.currentPrice > 0 && stock.isLiveQuote && !stock.isStaleQuote && tvOnline;
  const tvMetricsAvailable = [
    stock.tvRsi,
    stock.tvEma20,
    stock.tvEma50,
    stock.tvMacd,
    stock.tvRecommendAll
  ].filter((v) => v !== null && v !== undefined).length;

  const pillars: ScreenerPillarBreakdown = {
    trend25: 0,
    momentum15: 0,
    liquidity20: 0,
    breakout15: 0,
    financial15: 0,
    news10: 0
  };

  const reasonsAr: string[] = [];
  const risksAr: string[] = [];
  const invalidationConditionsAr: string[] = [];

  // Track evidence coverage for Confidence % (separate from Score)
  let availableWeight = 0;

  // Support/Resistance reference levels from real TV High/Low + MAs
  const resistanceLevel =
    stock.tvHigh1M && stock.tvHigh1M > stock.currentPrice * 0.99
      ? Number(stock.tvHigh1M.toFixed(2))
      : stock.tvHigh3M ?? stock.tvHigh52W ?? null;
  const supportLevel =
    stock.tvEma20 && stock.tvEma20 < stock.currentPrice
      ? Number(stock.tvEma20.toFixed(2))
      : stock.tvLow1M ?? stock.tvEma50 ?? null;

  // Volatility contraction / Bollinger squeeze check (pure price/volume — no institutional claims)
  let accumulationDetected = false;
  let accumulationNoteAr = 'لا تتوفر إشارة تضيق تذبذب أو تجميع سعري مؤكدة حالياً (بدون الادعاء ببيانات ملكية مؤسسية).';
  if (
    stock.tvBbUpper &&
    stock.tvBbLower &&
    stock.tvBbUpper > stock.tvBbLower &&
    stock.currentPrice > 0
  ) {
    const bbMid = (stock.tvBbUpper + stock.tvBbLower) / 2;
    const bbWidthPct = ((stock.tvBbUpper - stock.tvBbLower) / bbMid) * 100;
    const rvol = stock.tvRelVol ?? stock.tvRvol ?? 0;
    if (bbWidthPct <= 12 && dailyTrend !== 'BEARISH' && rvol >= 0.9) {
      accumulationDetected = true;
      accumulationNoteAr = `تضيق نطاق التذبذب السعري (عرض بولينجر ${bbWidthPct.toFixed(1)}%) أعلى الدعوم مع حجم نسبي ${rvol}x دون الجزم بملكية مؤسسية غير معلنة.`;
    }
  }

  // False breakout / upper-wick rejection check on latest session bar
  const barRange = stock.highPrice > stock.lowPrice ? stock.highPrice - stock.lowPrice : 0;
  const upperWick = barRange > 0 ? stock.highPrice - Math.max(stock.openPrice || stock.currentPrice, stock.currentPrice) : 0;
  const falseBreakoutWarning =
    barRange > 0 &&
    ((upperWick / barRange >= 0.5 && changePct <= 0.3) ||
      (resistanceLevel !== null && stock.highPrice > resistanceLevel && stock.currentPrice < resistanceLevel * 0.995));

  if (falseBreakoutWarning) {
    risksAr.push('تم رصد ذيل علوي بيعي أو تراجع دون مقاومة مخترقة لحظياً (احتمال اختراق كاذب)');
  }

  // Hard insufficient-data check (stale quote, offline feed, anomaly flag, or < 2 real TV indicators)
  const hasAnomaly = Array.isArray(stock.anomalyFlags) && stock.anomalyFlags.length > 0;
  if (!hasPrice || tvMetricsAvailable < 2 || hasAnomaly) {
    const reason = !tvOnline
      ? 'تعذر الاتصال بمصدر الأسعار الحي TradingView — لا تصدر توصيات شراء.'
      : !stock.isLiveQuote || stock.isStaleQuote
      ? `البيانات قديمة بتاريخ ${stock.priceDate || 'غير محدد'} — موقوفة عن إصدار توصيات تداول.`
      : hasAnomaly
      ? `قيم شاذة مرصودة في البيانات: ${stock.anomalyFlags?.join('، ')}`
      : `نقص مؤشرات التحليل الفني من المصدر (متاح ${tvMetricsAvailable} مؤشر فقط).`;

    const screenerCategory: ScreenerCategory = 'INSUFFICIENT_DATA';
    const screenerCategoryAr = SCREENER_CATEGORY_LABELS[screenerCategory];

    return {
      stockSummary: {
        ticker: stock.ticker,
        yahooTicker: stock.yahooTicker,
        isin: stock.isin,
        nameAr: stock.nameAr,
        nameEn: stock.nameEn,
        sectorAr: stock.sectorAr,
        sectorEn: stock.sectorEn,
        industryAr: stock.industryAr,
        currency: stock.currency,
        index: stock.index,
        currentPrice: stock.currentPrice,
        prevClose: stock.prevClose,
        changePct,
        volume: stock.volume,
        valueTraded: stock.valueTraded,
        marketCapEgp: fund.ratios.marketCapEgp ?? 0,
        peRatio: fund.ratios.peRatio,
        pbRatio: fund.ratios.pbRatio,
        dividendYield: fund.ratios.dividendYield,
        fairValue: fair.estimatedFairValue,
        fairValueUpsidePct: fair.upsideDownsidePct,
        rsi14: stock.tvRsi ?? null,
        dailyTrend,
        quickScore: null,
        recommendationBadge: 'INSUFFICIENT_DATA',
        recommendationBadgeAr: screenerCategoryAr,
        screenerCategory,
        screenerCategoryAr,
        confidencePct: 0,
        priceDate: stock.priceDate || null,
        isLiveQuote: !!stock.isLiveQuote,
        isStaleQuote: !!stock.isStaleQuote,
        mathReasonAr: reason
      },
      screenerItem: {
        ticker: stock.ticker,
        nameAr: stock.nameAr,
        nameEn: stock.nameEn,
        sectorAr: stock.sectorAr,
        sectorEn: stock.sectorEn,
        index: stock.index,
        currentPrice: stock.currentPrice,
        changePct,
        volume: stock.volume,
        valueTraded: stock.valueTraded,
        score: null,
        confidencePct: 0,
        screenerCategory,
        screenerCategoryAr,
        recommendation: 'INSUFFICIENT_DATA',
        recommendationAr: screenerCategoryAr,
        pillarBreakdown: pillars,
        peRatio: fund.ratios.peRatio,
        pbRatio: fund.ratios.pbRatio,
        roe: fund.ratios.roe,
        dividendYield: fund.ratios.dividendYield,
        rsi14: stock.tvRsi ?? null,
        dailyTrend,
        fairValue: fair.estimatedFairValue,
        fairValueUpsidePct: fair.upsideDownsidePct,
        breakoutStatus: 'UNAVAILABLE',
        relativeVolume: stock.tvRelVol ?? stock.tvRvol ?? null,
        supportLevel,
        resistanceLevel,
        accumulationDetected,
        accumulationNoteAr,
        falseBreakoutWarning,
        reasonsAr: [],
        risksAr: [reason],
        invalidationConditionsAr: ['إعادة التقييم فقط بعد عودة المزامنة الحية واكتمال المؤشرات'],
        priceDate: stock.priceDate || null,
        isLiveQuote: !!stock.isLiveQuote,
        isStaleQuote: !!stock.isStaleQuote,
        mathReasonAr: reason
      }
    };
  }

  // --- PILLAR 1: TECHNICAL TREND (Max 25 pts — Missing = 0 pts!) ---
  if (stock.tvEma20 !== null && stock.tvEma20 !== undefined) {
    availableWeight += 8;
    if (stock.currentPrice > stock.tvEma20) {
      pillars.trend25 += 8;
      reasonsAr.push(`السعر (${stock.currentPrice}) أعلى EMA20 (${stock.tvEma20})`);
    } else {
      risksAr.push(`تداول السعر دون EMA20 (${stock.tvEma20})`);
    }
  }
  if (stock.tvEma50 !== null && stock.tvEma50 !== undefined) {
    availableWeight += 7;
    if (stock.currentPrice > stock.tvEma50) {
      pillars.trend25 += 5;
      if (stock.tvEma20 && stock.tvEma20 >= stock.tvEma50) pillars.trend25 += 2;
      reasonsAr.push(`ترتيب متوسطات صاعد فوق EMA50 (${stock.tvEma50})`);
    }
  }
  if (stock.tvEma200 !== null && stock.tvEma200 !== undefined) {
    availableWeight += 5;
    if (stock.currentPrice > stock.tvEma200) {
      pillars.trend25 += 5;
    } else {
      risksAr.push(`السعر لا يزال أسفل متوسط الاتجاه طويل الأجل EMA200 (${stock.tvEma200})`);
    }
  }
  if (stock.tvAdx !== null && stock.tvAdx !== undefined) {
    availableWeight += 5;
    const plusDi = stock.tvAdxPlusDI ?? 0;
    const minusDi = stock.tvAdxMinusDI ?? 0;
    if (stock.tvAdx >= 20 && plusDi > minusDi) {
      pillars.trend25 += 5;
      reasonsAr.push(`قوة اتجاه ADX (${stock.tvAdx}) بتفوق المشترين (+DI > -DI)`);
    } else if (stock.tvAdx >= 18 && stock.tvEma20 && stock.currentPrice > stock.tvEma20) {
      pillars.trend25 += 3;
    }
  }
  pillars.trend25 = Math.min(25, pillars.trend25);

  // --- PILLAR 2: MOMENTUM (Max 15 pts — Anti-chasing overextension rule!) ---
  const rsi = stock.tvRsi ?? null;
  if (rsi !== null && rsi !== undefined) {
    availableWeight += 7;
    if (rsi >= 48 && rsi <= 65) {
      pillars.momentum15 += 7;
      reasonsAr.push(`زخم RSI صحي في نطاق الانطلاقة (${rsi})`);
    } else if (rsi > 65 && rsi <= 72) {
      pillars.momentum15 += 4;
    } else if (rsi > 72) {
      pillars.momentum15 += 1; // Do not reward extreme parabolic chasing!
      risksAr.push(`تشبع شرائي مرتفع (RSI=${rsi}) — لا يفضل المطاردة قبل تصحيح`);
    } else if (rsi >= 38 && rsi < 48) {
      pillars.momentum15 += 3;
    }
  }
  if (stock.tvMacd !== null && stock.tvMacd !== undefined && stock.tvMacdSignal !== null && stock.tvMacdSignal !== undefined) {
    availableWeight += 5;
    if (stock.tvMacd > stock.tvMacdSignal) {
      pillars.momentum15 += 5;
      reasonsAr.push('تقاطع إيجابي لمؤشر MACD فوق خط الإشارة');
    }
  }
  if (stock.tvMom !== null && stock.tvMom !== undefined) {
    availableWeight += 3;
    if (stock.tvMom > 0) pillars.momentum15 += 3;
  }
  pillars.momentum15 = Math.min(15, pillars.momentum15);

  // --- PILLAR 3: LIQUIDITY (Max 20 pts) ---
  const rvol = stock.tvRelVol ?? stock.tvRvol ?? null;
  const valTraded = stock.valueTraded || 0;
  availableWeight += 10;
  if (valTraded >= 30_000_000) pillars.liquidity20 += 10;
  else if (valTraded >= 10_000_000) pillars.liquidity20 += 8;
  else if (valTraded >= 3_000_000) pillars.liquidity20 += 6;
  else if (valTraded >= minLiquidityEgp) pillars.liquidity20 += 3;
  else risksAr.push(`سيولة منخفضة (${(valTraded / 1_000_000).toFixed(2)} مليون جم دون الحد الأدنى)`);

  if (rvol !== null) {
    availableWeight += 10;
    if (rvol >= 1.5 && changePct >= 0) {
      pillars.liquidity20 += 10;
      reasonsAr.push(`طفرة سيولة صاعدة بحجم نسبي ${rvol}x`);
    } else if (rvol >= 1.2 && changePct >= -0.5) {
      pillars.liquidity20 += 7;
    } else if (rvol >= 0.85) {
      pillars.liquidity20 += 4;
    }
  }
  pillars.liquidity20 = Math.min(20, pillars.liquidity20);

  // --- PILLAR 4: BREAKOUT & READINESS (Max 15 pts) ---
  let breakoutStatus = 'CONSOLIDATING';
  const distToResPct =
    resistanceLevel && resistanceLevel > 0
      ? ((resistanceLevel - stock.currentPrice) / stock.currentPrice) * 100
      : null;

  if (resistanceLevel !== null) {
    availableWeight += 15;
    if (!falseBreakoutWarning && distToResPct !== null && distToResPct <= 0.5 && (rvol ?? 0) >= 1.5 && changePct >= 1.0) {
      pillars.breakout15 += 15;
      breakoutStatus = 'BREAKOUT_UP';
      reasonsAr.push(`اختراق مؤكد للمقاومة (${resistanceLevel}) بإغلاق وحجم نسبي ${rvol}x`);
    } else if (!falseBreakoutWarning && distToResPct !== null && distToResPct > 0 && distToResPct <= 3.5 && dailyTrend !== 'BEARISH') {
      pillars.breakout15 += accumulationDetected ? 13 : 10;
      breakoutStatus = 'NEAR_RESISTANCE';
      reasonsAr.push(`قريب من اختراق المقاومة (${resistanceLevel} — بفارق ${distToResPct.toFixed(1)}%)`);
    } else if (accumulationDetected) {
      pillars.breakout15 += 10;
    } else if (dailyTrend === 'BEARISH') {
      breakoutStatus = 'BREAKDOWN';
    } else if (!falseBreakoutWarning && dailyTrend === 'BULLISH') {
      pillars.breakout15 += 7;
    }
  } else if (accumulationDetected) {
    availableWeight += 8;
    pillars.breakout15 += 8;
  }
  if (falseBreakoutWarning) {
    pillars.breakout15 = Math.max(0, pillars.breakout15 - 6);
  }
  pillars.breakout15 = Math.min(15, pillars.breakout15);

  // --- PILLAR 5: FINANCIAL QUALITY (Max 15 pts — NEVER positive when unavailable!) ---
  if (fund.available && fund.ratios.fundamentalQualityScore !== null) {
    availableWeight += 15;
    pillars.financial15 = Math.round((fund.ratios.fundamentalQualityScore / 100) * 15);
    if (pillars.financial15 >= 10) {
      reasonsAr.push(`جودة مالية قوية (${fund.ratios.fundamentalQualityScore}/100 وفق معيار القطاع)`);
    }
  } else {
    risksAr.push('بيانات القوائم المالية ناقصة (تم احتساب 0 نقطة للجودة المالية دون افتراض)');
  }

  // --- PILLAR 6: NEWS & VERIFIED CATALYSTS (Max 10 pts — 0 pts if unconfirmed or absent!) ---
  if (options?.hasConfirmedNewsCatalyst) {
    availableWeight += 10;
    pillars.news10 = 10;
    reasonsAr.push('يوجد إفصاح رسمي / محفز جوهري مؤكد');
  } else if (
    (fund.ratios.epsGrowthPct !== null && fund.ratios.epsGrowthPct >= 20) ||
    (fund.ratios.revenueGrowthPct !== null && fund.ratios.revenueGrowthPct >= 20)
  ) {
    availableWeight += 6;
    pillars.news10 = 6;
    reasonsAr.push(
      `نمو منشور في النتائج (${fund.ratios.epsGrowthPct ?? fund.ratios.revenueGrowthPct}% سنوياً)`
    );
  }
  if (options?.hasNegativeNews) {
    pillars.news10 = 0;
    risksAr.push('إشارة سلبية حادة في الأخبار المتابعة');
  }

  const totalScore = Math.max(
    0,
    Math.min(
      100,
      pillars.trend25 +
        pillars.momentum15 +
        pillars.liquidity20 +
        pillars.breakout15 +
        pillars.financial15 +
        pillars.news10
    )
  );

  // Separate Confidence % (how much of the 100-pt rubric had real live inputs)
  const confidencePct = Math.max(15, Math.min(100, Math.round(availableWeight)));

  // Determine exact 7 Classifications
  let screenerCategory: ScreenerCategory = 'WATCHLIST';
  const lowLiquidity = valTraded < minLiquidityEgp;
  const extremeOverbought = rsi !== null && rsi > 74;

  if (lowLiquidity || dailyTrend === 'BEARISH' || falseBreakoutWarning || totalScore < 42 || options?.hasNegativeNews) {
    screenerCategory = 'WEAK_OR_HIGH_RISK';
  } else if (
    breakoutStatus === 'BREAKOUT_UP' &&
    totalScore >= 65 &&
    !extremeOverbought &&
    (rvol ?? 0) >= 1.5
  ) {
    screenerCategory = 'CONFIRMED_BREAKOUT';
  } else if (
    distToResPct !== null &&
    distToResPct > 0 &&
    distToResPct <= 3.5 &&
    totalScore >= 58 &&
    (rvol ?? 0) >= 1.05
  ) {
    screenerCategory = 'NEAR_BREAKOUT';
  } else if (
    dailyTrend === 'BULLISH' &&
    (accumulationDetected || (rsi !== null && rsi >= 45 && rsi <= 64)) &&
    totalScore >= 60 &&
    (rvol ?? 0) >= 1.0 &&
    !extremeOverbought
  ) {
    screenerCategory = 'EARLY_LAUNCH_CANDIDATE';
  } else if (dailyTrend === 'BULLISH' && totalScore >= 58 && !extremeOverbought) {
    screenerCategory = 'CONTINUING_UPTREND';
  } else if (totalScore >= 45) {
    screenerCategory = 'WATCHLIST';
  } else {
    screenerCategory = 'WEAK_OR_HIGH_RISK';
  }

  const screenerCategoryAr = SCREENER_CATEGORY_LABELS[screenerCategory];

  // Backward-compatible action badge
  let recommendation: ScreenerCandidateResult['recommendation'] = 'WAIT';
  if (screenerCategory === 'CONFIRMED_BREAKOUT' && totalScore >= 72) recommendation = 'STRONG_BUY';
  else if (
    (screenerCategory === 'EARLY_LAUNCH_CANDIDATE' ||
      screenerCategory === 'NEAR_BREAKOUT' ||
      screenerCategory === 'CONFIRMED_BREAKOUT' ||
      screenerCategory === 'CONTINUING_UPTREND') &&
    totalScore >= 62 &&
    confidencePct >= 55
  ) {
    recommendation = 'BUY';
  } else if (screenerCategory === 'WEAK_OR_HIGH_RISK') {
    recommendation = 'REDUCE';
  } else if (totalScore >= 50) {
    recommendation = 'WAIT';
  } else {
    recommendation = 'HOLD';
  }

  if (supportLevel) {
    invalidationConditionsAr.push(`إغلاق يومي مؤكد أسفل الدعم ${supportLevel}`);
  }
  if (resistanceLevel && screenerCategory === 'NEAR_BREAKOUT') {
    invalidationConditionsAr.push(`فشل اختراق ${resistanceLevel} أو ظهور ذيل علوي بيعي طويل`);
  }
  if (invalidationConditionsAr.length === 0) {
    invalidationConditionsAr.push('كسر متوسط EMA20 بحجم تداول مرتفع أو هبوط RSI دون 40');
  }

  const mathReasonAr =
    `اتجاه ${pillars.trend25}/25 + زخم ${pillars.momentum15}/15 + سيولة ${pillars.liquidity20}/20 + اختراق ${pillars.breakout15}/15 + مالي ${pillars.financial15}/15 + محفزات ${pillars.news10}/10 = ${totalScore}/100 (ثقة البيانات ${confidencePct}%)`;

  const marketCapEgp =
    fund.ratios.marketCapEgp ??
    (stock.listedShares > 0 ? Math.round(stock.listedShares * stock.currentPrice * 1_000_000) : 0);

  return {
    stockSummary: {
      ticker: stock.ticker,
      yahooTicker: stock.yahooTicker,
      isin: stock.isin,
      nameAr: stock.nameAr,
      nameEn: stock.nameEn,
      sectorAr: stock.sectorAr,
      sectorEn: stock.sectorEn,
      industryAr: stock.industryAr,
      currency: stock.currency,
      index: stock.index,
      currentPrice: stock.currentPrice,
      prevClose: stock.prevClose,
      changePct,
      volume: stock.volume,
      valueTraded: stock.valueTraded,
      marketCapEgp,
      peRatio: fund.ratios.peRatio,
      pbRatio: fund.ratios.pbRatio,
      dividendYield: fund.ratios.dividendYield,
      fairValue: fair.estimatedFairValue,
      fairValueUpsidePct: fair.upsideDownsidePct,
      rsi14: stock.tvRsi ?? null,
      dailyTrend,
      quickScore: totalScore,
      confidencePct,
      screenerCategory,
      screenerCategoryAr,
      recommendationBadge: recommendation,
      recommendationBadgeAr: screenerCategoryAr,
      priceDate: stock.priceDate || null,
      isLiveQuote: !!stock.isLiveQuote,
      isStaleQuote: !!stock.isStaleQuote,
      mathReasonAr
    },
    screenerItem: {
      ticker: stock.ticker,
      nameAr: stock.nameAr,
      nameEn: stock.nameEn,
      sectorAr: stock.sectorAr,
      sectorEn: stock.sectorEn,
      index: stock.index,
      currentPrice: stock.currentPrice,
      changePct,
      volume: stock.volume,
      valueTraded: stock.valueTraded,
      score: totalScore,
      confidencePct,
      screenerCategory,
      screenerCategoryAr,
      recommendation,
      recommendationAr: screenerCategoryAr,
      pillarBreakdown: pillars,
      peRatio: fund.ratios.peRatio,
      pbRatio: fund.ratios.pbRatio,
      roe: fund.ratios.roe,
      dividendYield: fund.ratios.dividendYield,
      rsi14: stock.tvRsi ?? null,
      dailyTrend,
      fairValue: fair.estimatedFairValue,
      fairValueUpsidePct: fair.upsideDownsidePct,
      breakoutStatus,
      relativeVolume: rvol,
      supportLevel,
      resistanceLevel,
      accumulationDetected,
      accumulationNoteAr,
      falseBreakoutWarning,
      reasonsAr,
      risksAr,
      invalidationConditionsAr,
      priceDate: stock.priceDate || null,
      isLiveQuote: !!stock.isLiveQuote,
      isStaleQuote: !!stock.isStaleQuote,
      mathReasonAr
    }
  };
}

let cachedSyncVersion = -1;
let cachedStocksList: any[] = [];
let cachedScreenerList: ScreenerCandidateResult[] = [];

export function getCachedStockBatches() {
  const currentVersion = LiveMarketSyncService.getSyncVersion();
  const liveState = LiveMarketSyncService.getLiveState();
  if (cachedSyncVersion === currentVersion && cachedStocksList.length > 0) {
    return { stocksList: cachedStocksList, screenerList: cachedScreenerList };
  }

  const stocksList: any[] = [];
  const screenerList: ScreenerCandidateResult[] = [];

  for (const stock of EGX_STOCKS_UNIVERSE) {
    // Check non-blocking cached news sentiment/official disclosure hints if already loaded
    const cachedNews = NewsDisclosureService.getCachedTickerNewsHints(stock.ticker);
    const { stockSummary, screenerItem } = scoreStockForScreener(stock, {
      tradingViewOnline: liveState.tradingViewOnline,
      hasConfirmedNewsCatalyst: cachedNews.hasConfirmedPositive,
      hasNegativeNews: cachedNews.hasSevereNegative
    });
    stocksList.push(stockSummary);
    screenerList.push(screenerItem);
  }

  cachedSyncVersion = currentVersion;
  cachedStocksList = stocksList;
  cachedScreenerList = screenerList;
  return { stocksList, screenerList };
}

/**
 * Background optional OHLCV enrichment for top active stocks (concurrency capped at 4, non-blocking).
 */
export async function enrichTopCandidatesWithCandles(limit = 8): Promise<void> {
  const { screenerList } = getCachedStockBatches();
  const candidates = [...screenerList]
    .filter((s) => s.score !== null && s.valueTraded >= 3_000_000)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  const concurrency = 4;
  for (let i = 0; i < candidates.length; i += concurrency) {
    const chunk = candidates.slice(i, i + concurrency);
    await Promise.allSettled(chunk.map((c) => MarketDataService.fetchRealHistoricalCandles(c.ticker, '1D')));
  }
}
