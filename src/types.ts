export interface EGXStockSummary {
  ticker: string;
  yahooTicker: string;
  isin: string;
  nameAr: string;
  nameEn: string;
  sectorAr: string;
  sectorEn: string;
  industryAr: string;
  currency: 'EGP' | 'USD';
  index: 'EGX30' | 'EGX70' | 'EGX100';
  currentPrice: number;
  prevClose: number;
  changePct: number;
  volume: number;
  valueTraded: number;
  marketCapEgp: number;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
  fairValue: number | null;
  fairValueUpsidePct: number | null;
  rsi14: number | null;
  dailyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
  quickScore: number | null;
  recommendationBadge: 'STRONG_BUY' | 'BUY' | 'WAIT' | 'HOLD' | 'REDUCE' | 'INSUFFICIENT_DATA';
  recommendationBadgeAr: string;
  priceDate?: string | null;
  isLiveQuote?: boolean;
  isStaleQuote?: boolean;
  mathReasonAr?: string;
  screenerCategory?:
    | 'EARLY_LAUNCH_CANDIDATE'
    | 'NEAR_BREAKOUT'
    | 'CONFIRMED_BREAKOUT'
    | 'CONTINUING_UPTREND'
    | 'WATCHLIST'
    | 'WEAK_OR_HIGH_RISK'
    | 'INSUFFICIENT_DATA';
  screenerCategoryAr?: string;
  confidencePct?: number;
  relativeVolume?: number | null;
  accumulationDetected?: boolean;
  falseBreakoutWarning?: boolean;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SupportResistanceZone {
  priceLevel: number;
  type: 'SUPPORT' | 'RESISTANCE';
  strength: 'STRONG' | 'MODERATE' | 'TESTED';
  touches: number;
  description: string;
}

export interface FibonacciLevel {
  ratio: number;
  level: number;
  label: string;
}

export interface CandleBarReading {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePct: number;
  volumeRatio: number;
  candleTypeAr: string;
  candleSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  noteAr: string;
}

export interface LastCandlesAnalysis {
  candlesCount: number;
  recentBars: CandleBarReading[];
  dominantPriceActionAr: string;
  candlestickSummaryAr: string;
  shortTermBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  tradingViewRatingAr: string;
  dataSourceLabel: string;
}

export interface TechnicalScoreComponent {
  labelAr: string;
  conditionAr: string;
  points: number;
}

export interface TechnicalIndicatorsResult {
  isRealData: boolean;
  candlesCount: number;
  firstCandleDate: string;
  lastCandleDate: string;
  isStale: boolean;
  staleDays: number | null;
  staleReasonAr: string | null;
  currentPrice: number;
  previousClose: number;
  changePct: number;
  ema9: number;
  ema20: number;
  ema50: number;
  ema100: number;
  ema200: number;
  sma20: number;
  sma50: number;
  sma100: number;
  sma200: number;
  rsi14: number;
  rsiStatus: 'OVERSOLD' | 'BEARISH' | 'NEUTRAL' | 'BULLISH' | 'OVERBOUGHT';
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
    signal: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'BULLISH' | 'BEARISH';
  };
  stochastic: {
    k: number;
    d: number;
    status: 'OVERSOLD' | 'NEUTRAL' | 'OVERBOUGHT';
  };
  adx14: {
    adx: number;
    plusDI: number;
    minusDI: number;
    trendStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  };
  momentum10: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    bandwidthPct: number;
  };
  atr14: number;
  historicalVolatilityPct: number;
  obv: number;
  volumeSma20: number;
  relativeVolume: number;
  volumeSurge: boolean;
  dailyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  weeklyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  monthlyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendAlignmentScore: number;
  trendAlignmentStatusAr: string;
  supportZones: SupportResistanceZone[];
  resistanceZones: SupportResistanceZone[];
  fibonacciLevels: FibonacciLevel[];
  patternsDetected: string[];
  breakoutStatus: 'BREAKOUT_UP' | 'BREAKDOWN' | 'CONSOLIDATING' | 'NEAR_RESISTANCE' | 'NEAR_SUPPORT';
  technicalScore?: number;
  technicalScoreBreakdown?: TechnicalScoreComponent[];
  technicalScoreFormulaAr?: string;
  lastCandlesAnalysis?: LastCandlesAnalysis;
  higherHighsHigherLows?: boolean;
  volatilityContraction?: {
    detected: boolean;
    bandwidthPct: number | null;
    noteAr: string;
  };
  falseBreakoutDetected?: boolean;
  falseBreakoutNoteAr?: string | null;
  pivotPoints?: {
    classic: { s3: number; s2: number; s1: number; p: number; r1: number; r2: number; r3: number };
    high1M?: number;
    low1M?: number;
    high3M?: number;
    low3M?: number;
    high52W?: number;
    low52W?: number;
  };
}

export interface FinancialYearData {
  year: number;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  totalAssets: number;
  totalEquity: number;
  totalDebt: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  dividendPerShare: number;
}

export interface FinancialRatios {
  grossProfitMargin: number | null;
  operatingMargin: number | null;
  netProfitMargin: number | null;
  roe: number | null;
  roa: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
  dividendPayoutRatio?: number | null;
  debtToEquity: number | null;
  currentRatio?: number | null;
  freeCashFlow?: number | null;
  operatingCashFlow?: number | null;
  revenueGrowthPct?: number | null;
  epsGrowthPct?: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  marketCapEgp: number | null;
  high52W: number | null;
  low52W: number | null;
  fundamentalQualityScore: number | null;
  earningsQualityStatusAr: string;
  financialRiskStatusAr: string;
  dividendSustainabilityAr?: string;
}

export interface FundamentalDataResult {
  ticker: string;
  available: boolean;
  insufficientReasonAr?: string;
  sectorProfile?: string;
  sectorProfileAr?: string;
  fundamentalConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
  availableMetricsCount: number;
  dataCompletenessPct: number;
  reportingPeriod: string;
  fiscalPeriodEndDate?: string | null;
  earningsReleaseDate?: string | null;
  nextEarningsDate?: string | null;
  dataSourceLabel: string;
  publicationDate: string | null;
  publishedMetrics?: Record<string, number | string | null>;
  derivedMetrics?: {
    impliedEpsFromPe: number | null;
    impliedBvpsFromPb: number | null;
    marketCapFromListedShares: number | null;
    fcfToNetIncomeRatio: number | null;
    noteAr: string;
  };
  unavailableMetrics?: string[];
  historicalYears: FinancialYearData[];
  historicalStatementsNoteAr: string;
  qualityScoreFormulaAr: string;
  qualityScoreComponents: { labelAr: string; points: number; detailAr: string }[];
  ratios: FinancialRatios;
}

export interface ValuationMethodItem {
  methodNameAr: string;
  methodNameEn: string;
  weightPct: number;
  calculatedValue: number;
  formulaAr: string;
  descriptionAr: string;
}

export interface FairValueResult {
  ticker: string;
  available: boolean;
  insufficientReasonAr?: string;
  valuationConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
  currentPrice: number;
  estimatedFairValue: number | null;
  conservativeValuation: number | null;
  optimisticValuation: number | null;
  upsideDownsidePct: number | null;
  marginOfSafetyPct: number | null;
  valuationStatus: 'UNDERVALUED' | 'FAIRLY_VALUED' | 'OVERVALUED' | 'UNAVAILABLE';
  valuationStatusAr: string;
  valuationDate: string;
  dataCompletenessPct: number;
  methods: ValuationMethodItem[];
  modelInputs: {
    eps: number | null;
    bookValuePerShare: number | null;
    roePct: number | null;
    sectorMedianPe: number | null;
    sectorMedianPb?: number | null;
    sectorPeersCount: number;
    costOfEquityPct: number;
    cbeReferenceRatePct: number;
    cbeReferenceDate: string;
  };
  formulaExplanationAr: string;
  summaryAr: string;
}

export interface NewsItem {
  id: string;
  ticker: string;
  titleAr: string;
  titleEn: string;
  source: string;
  sourceUrl: string;
  originalSourceDomain?: string | null;
  publishedAt: string;
  isConfirmed: boolean;
  newsType?: string;
  newsTypeAr?: string;
  sourceCredibilityAr?: string;
  category: string;
  categoryAr: string;
  impact: 'VERY_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'VERY_NEGATIVE';
  impactAr: string;
  impactHorizon: string;
  impactMechanismAr?: string;
  classificationConfidencePct?: number;
  summaryAr: string;
  significanceScore: number;
}

export interface UpcomingEvent {
  id: string;
  ticker: string;
  eventNameAr: string;
  eventDate: string;
  category: string;
  status: string;
  detailsAr: string;
}

export interface SmartAlert {
  id: string;
  ticker: string;
  companyNameAr: string;
  type: string;
  typeAr: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
  triggerPrice: number | null;
  messageAr: string;
  timestamp: string;
  isRead: boolean;
}

export interface ScorePillarBreakdown {
  key: string;
  labelAr: string;
  weightPct: number;
  score: number;
  weightedContribution: number;
  formulaAr: string;
}

export interface ScenarioPlan {
  directionAr: string;
  supportingConditionsAr: string[];
  keyLevelsAr: string;
  invalidationTriggerAr: string;
}

export interface InvestmentPlanResult {
  ticker: string;
  companyNameAr: string;
  currentPrice: number;
  available: boolean;
  insufficientReasonAr?: string;
  isStaleData: boolean;
  dataDate: string | null;
  recommendation: 'STRONG_BUY' | 'BUY' | 'WAIT' | 'HOLD' | 'REDUCE' | 'SELL' | 'AVOID' | 'INSUFFICIENT_DATA';
  recommendationAr: string;
  recommendationBadgeColor: string;
  holdingPeriodAr: string;
  overallScore: number | null;
  confidenceScore: number | null;
  mathematicalRationaleAr: string;
  scoreFormulaAr: string;
  pillars: ScorePillarBreakdown[];
  scoreBreakdown: {
    technicalWeight: number;
    technicalScore: number | null;
    fundamentalWeight: number;
    fundamentalScore: number | null;
    liquidityWeight: number;
    liquidityScore: number | null;
    valuationWeight: number;
    valuationScore: number | null;
    marketWeight: number;
    marketScore: number | null;
  };
  preferredEntryZone: { min: number; max: number; labelAr: string } | null;
  alternativeEntryZone: { min: number; max: number; labelAr: string } | null;
  breakoutTriggerPrice: number | null;
  entryConfirmationAr?: string;
  entryConditionsAr: string[];
  invalidationConditionsAr: string[];
  stopLossPrice: number | null;
  stopLossPct: number | null;
  stopLossLogicAr: string;
  target1: { price: number; upsidePct: number; rationaleAr: string } | null;
  target2: { price: number; upsidePct: number; rationaleAr: string } | null;
  target3: { price: number; upsidePct: number; rationaleAr: string } | null;
  targetNotesAr?: string;
  rewardRiskRatio: number | null;
  expectedUpsidePct?: number | null;
  nearestSupport?: number | null;
  nearestResistance?: number | null;
  relativeVolume?: number | null;
  selectionReasonsAr?: string[];
  potentialRisksAr?: string[];
  estimatedFairValue: number | null;
  fairValueUpsidePct: number | null;
  marginOfSafetyPct: number | null;
  currentTrendAr: string;
  expectedTrendAr: string;
  riskGates: { passed: boolean; gateName: string; gateNameAr: string; detailsAr: string }[];
  allGatesPassed: boolean;
  bullishScenario: ScenarioPlan | null;
  bearishScenario: ScenarioPlan | null;
  neutralScenario: ScenarioPlan | null;
  positiveFactorsAr: string[];
  negativeFactorsAr: string[];
  thingsToMonitorAr: string[];
  arabicAiReport: string;
  reportGeneratedAt: string;
  modelUsed: string;
}

export interface DetailedStockPayload {
  stock: any;
  candlesDaily: Candle[];
  candlesWeekly: Candle[];
  candlesMonthly: Candle[];
  candleStatus?: {
    dailyReal: boolean;
    dailyCount: number;
    dailyLastDate: string | null;
    dailyIsStale?: boolean;
    dailyStaleDays?: number | null;
    dailyStaleReasonAr?: string | null;
    dailyError: string | null;
    weeklyReal: boolean;
    monthlyReal: boolean;
  };
  technicalStatus?: {
    available: boolean;
    reasonAr: string | null;
  };
  multiSourceComparison: any;
  technicalAnalysis: TechnicalIndicatorsResult | null;
  fundamentalAnalysis: FundamentalDataResult;
  fairValueValuation: FairValueResult;
  newsDisclosures: NewsItem[];
  newsStatus?: {
    online: boolean;
    lastFetchedAt: string | null;
    error: string | null;
  };
  upcomingEvents: UpcomingEvent[];
  aiDecision: InvestmentPlanResult;
  peers: any[];
}

export interface ChatWebSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  usedTools?: string[];
  webSources?: ChatWebSource[];
  mentionedTickers?: string[];
  isError?: boolean;
}
