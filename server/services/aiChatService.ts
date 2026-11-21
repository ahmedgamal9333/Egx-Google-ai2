import { Content, FunctionDeclaration, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { EGX_STOCKS_UNIVERSE, getEGXStock } from '../data/egxStocks';
import { getCachedStockBatches } from './stockScreenerService';
import { MarketDataService } from './marketDataService';
import { TechnicalAnalysisEngine } from './technicalAnalysisService';
import { FundamentalAnalysisEngine } from './fundamentalAnalysisService';
import { FairValueValuationEngine } from './fairValueService';
import { NewsDisclosureService } from './newsService';
import { AiRecommendationEngine } from './aiRecommendationService';
import { PortfolioService } from './portfolioService';
import { RecommendationHistoryService } from './recommendationHistoryService';
import { SourceIntelligenceService } from './sourceIntelligenceService';
import { WatchlistAlertService } from './watchlistAlertService';
import { BacktestingEngine } from './backtestingService';

export interface ChatHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

export interface ChatWebSource {
  title: string;
  uri: string;
}

export interface AiChatResponse {
  reply: string;
  usedTools: string[];
  webSources: ChatWebSource[];
  mentionedTickers: string[];
  modelUsed: string;
  timestamp: string;
}

const TOOL_LABELS_AR: Record<string, string> = {
  get_market_overview: 'نظرة السوق الكلية ومؤشرات EGX والمركزي',
  search_filter_stocks: 'الماسح الذكي للأسهم المصرية',
  get_full_stock_analysis: 'التحليل الفني والمالي والقيمة العادلة للسهم',
  compare_stocks: 'المقارنة الكمية بين الأسهم',
  get_sector_statistics: 'إحصائيات وأداء القطاعات',
  get_portfolio_summary: 'بيانات المحفظة الاستثمارية',
  get_recommendation_history_stats: 'سجل التوصيات وتدقيق الأداء التاريخي',
  get_news_and_events: 'الأخبار الحية عبر Google News RSS',
  get_data_sources_and_alerts: 'حالة مصادر البيانات والتنبيهات الذكية',
  run_backtest_summary: 'محرك الاختبار التاريخي للاستراتيجيات',
  google_search: 'بحث جوجل الحي (Web Search)'
};

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_market_overview',
    description:
      'Fetch EGX market overview including live sync status/errors/staleness timestamps, EGX30/EGX70/EGX100 values, turnover, breadth, FX USD/EGP, and dated CBE reference rates.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'search_filter_stocks',
    description:
      'Search, filter, and rank EGX stocks using live-synced TradingView metrics, real TTM fundamentals, and formula-based fair value. Stocks without sufficient live data carry INSUFFICIENT_DATA.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Optional text query matching ticker, Arabic name, English name, or sector.'
        },
        sector: {
          type: Type.STRING,
          description: 'Optional Arabic or English sector substring.'
        },
        index: {
          type: Type.STRING,
          description: 'Optional index filter: EGX30, EGX70, or EGX100.'
        },
        recommendation: {
          type: Type.STRING,
          description: 'Optional recommendation badge: STRONG_BUY, BUY, HOLD, WAIT, REDUCE, INSUFFICIENT_DATA.'
        },
        screenerCategory: {
          type: Type.STRING,
          description: 'Optional screener category: EARLY_LAUNCH_CANDIDATE, NEAR_BREAKOUT, CONFIRMED_BREAKOUT, CONTINUING_UPTREND, WATCHLIST, WEAK_OR_HIGH_RISK, INSUFFICIENT_DATA.'
        },
        dailyTrend: {
          type: Type.STRING,
          description: 'Optional trend filter: BULLISH, BEARISH, or NEUTRAL.'
        },
        minScore: {
          type: Type.NUMBER,
          description: 'Minimum quick overall score (0-100).'
        },
        minTurnoverEgp: {
          type: Type.NUMBER,
          description: 'Minimum daily value traded in EGP.'
        },
        maxPe: {
          type: Type.NUMBER,
          description: 'Maximum P/E ratio.'
        },
        minUpside: {
          type: Type.NUMBER,
          description: 'Minimum fair value upside percentage.'
        },
        minRsi: {
          type: Type.NUMBER,
          description: 'Minimum RSI(14).'
        },
        maxRsi: {
          type: Type.NUMBER,
          description: 'Maximum RSI(14).'
        },
        sortBy: {
          type: Type.STRING,
          description: 'Sort field: score, confidencePct, fairValueUpsidePct, changePct, valueTraded, peRatio, dividendYield, rsi14.'
        },
        sortOrder: {
          type: Type.STRING,
          description: 'Sort order: desc or asc.'
        },
        limit: {
          type: Type.NUMBER,
          description: 'Maximum number of results to return (default 15, max 30).'
        }
      }
    }
  },
  {
    name: 'get_full_stock_analysis',
    description:
      'Run verified deep-dive analysis for a specific EGX stock ticker: live TradingView snapshot, real Yahoo Finance historical candles (>=30 bars required), technical indicators, TradingView TTM financials, formula fair value, mathematical trading plan, and RSS news. Returns INSUFFICIENT_DATA if real candles or live quote data are lacking.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticker: {
          type: Type.STRING,
          description: 'EGX stock ticker symbol such as COMI, TMGH, SWDY, ETEL, MFPC, FWRY.'
        }
      },
      required: ['ticker']
    }
  },
  {
    name: 'compare_stocks',
    description:
      'Compare 2 to 5 EGX stocks side by side using real synced quotes, verified Yahoo candles, mathematical scores, and explicit availability flags.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tickers: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Array of 2 to 5 EGX ticker symbols to compare.'
        }
      },
      required: ['tickers']
    }
  },
  {
    name: 'get_sector_statistics',
    description:
      'Get aggregated statistics across EGX sectors from live-synced stocks, ignoring null/unavailable metrics.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sectorFilter: {
          type: Type.STRING,
          description: 'Optional Arabic or English sector name filter.'
        }
      }
    }
  },
  {
    name: 'get_portfolio_summary',
    description:
      'Get the current user portfolio summary valued at real prices with mathematical fair-value-based action logic.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'get_recommendation_history_stats',
    description:
      'Get genuine tracked recommendation history and performance metrics recorded during live platform operation.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'get_news_and_events',
    description:
      'Fetch live EGX or stock-specific headlines from Google News Arabic RSS with feed status and timestamps.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticker: {
          type: Type.STRING,
          description: 'Optional stock ticker to filter news.'
        }
      }
    }
  },
  {
    name: 'get_data_sources_and_alerts',
    description:
      'Get real data source health report (TradingView EGX, TradingView Indices, Yahoo Finance, Google News RSS, CBE Static Reference, Gemini AI), errors, timestamps, discrepancy logs, and alerts.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'run_backtest_summary',
    description:
      'Run walk-forward historical strategy backtest on real Yahoo Finance OHLCV candles (>=60 trading bars required). Returns INSUFFICIENT_DATA if real history is unavailable.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        strategyId: {
          type: Type.STRING,
          description: 'Strategy ID: SWING_TREND_PULLBACK, BREAKOUT_MOMENTUM, or VALUE_MOMENTUM.'
        },
        ticker: {
          type: Type.STRING,
          description: 'Focus ticker symbol (e.g. COMI, TMGH, SWDY).'
        }
      }
    }
  }
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

async function executeToolCall(name: string, args: Record<string, any>): Promise<Record<string, any>> {
  switch (name) {
    case 'get_market_overview': {
      const overview = MarketDataService.getMarketOverview();
      const { stocksList } = getCachedStockBatches();
      const strongBuys = stocksList.filter((s) => s.recommendationBadge === 'STRONG_BUY').length;
      const buys = stocksList.filter((s) => s.recommendationBadge === 'BUY').length;
      const syncedOnly = stocksList.filter((s) => s.isLiveQuote);
      const topGainers = [...syncedOnly]
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 5)
        .map((s) => ({
          ticker: s.ticker,
          nameAr: s.nameAr,
          price: s.currentPrice,
          changePct: s.changePct,
          volume: s.volume,
          priceDate: s.priceDate
        }));
      const topTurnover = [...syncedOnly]
        .sort((a, b) => b.valueTraded - a.valueTraded)
        .slice(0, 5)
        .map((s) => ({
          ticker: s.ticker,
          nameAr: s.nameAr,
          price: s.currentPrice,
          changePct: s.changePct,
          valueTradedM: Number((s.valueTraded / 1e6).toFixed(1)),
          priceDate: s.priceDate
        }));
      return {
        ...overview,
        strongBuyCount: strongBuys,
        buyCount: buys,
        topGainers,
        topTurnover
      };
    }

    case 'search_filter_stocks': {
      const overview = MarketDataService.getMarketOverview();
      const { screenerList } = getCachedStockBatches();
      let results = [...screenerList];

      if (args.query) {
        const q = normalizeText(String(args.query));
        results = results.filter(
          (s) =>
            normalizeText(s.ticker).includes(q) ||
            normalizeText(s.nameAr).includes(q) ||
            normalizeText(s.nameEn || '').includes(q) ||
            normalizeText(s.sectorAr).includes(q)
        );
      }
      if (args.sector) {
        const sec = normalizeText(String(args.sector));
        results = results.filter(
          (s) => normalizeText(s.sectorAr).includes(sec) || normalizeText(s.sectorEn || '').includes(sec)
        );
      }
      if (args.index && args.index !== 'ALL') {
        results = results.filter((s) => s.index === String(args.index).toUpperCase());
      }
      if (args.recommendation && args.recommendation !== 'ALL') {
        results = results.filter((s) => s.recommendation === String(args.recommendation).toUpperCase());
      }
      if (args.screenerCategory && args.screenerCategory !== 'ALL') {
        results = results.filter((s) => s.screenerCategory === String(args.screenerCategory).toUpperCase());
      }
      if (args.dailyTrend) {
        results = results.filter((s) => s.dailyTrend === String(args.dailyTrend).toUpperCase());
      }
      if (typeof args.minScore === 'number') {
        results = results.filter((s) => s.score !== null && s.score >= args.minScore);
      }
      if (typeof args.minTurnoverEgp === 'number') {
        results = results.filter((s) => s.valueTraded >= args.minTurnoverEgp);
      }
      if (typeof args.maxPe === 'number') {
        results = results.filter((s) => s.peRatio !== null && s.peRatio > 0 && s.peRatio <= args.maxPe);
      }
      if (typeof args.minUpside === 'number') {
        results = results.filter((s) => s.fairValueUpsidePct !== null && s.fairValueUpsidePct >= args.minUpside);
      }
      if (typeof args.minRsi === 'number') {
        results = results.filter((s) => s.rsi14 !== null && s.rsi14 >= args.minRsi);
      }
      if (typeof args.maxRsi === 'number') {
        results = results.filter((s) => s.rsi14 !== null && s.rsi14 <= args.maxRsi);
      }

      const sortField = typeof args.sortBy === 'string' ? args.sortBy : 'score';
      const sortAsc = args.sortOrder === 'asc';
      results.sort((a: any, b: any) => {
        const rawA = a[sortField];
        const rawB = b[sortField];
        const nullA = rawA === null || rawA === undefined;
        const nullB = rawB === null || rawB === undefined;
        if (nullA && nullB) return 0;
        if (nullA) return 1;
        if (nullB) return -1;
        return sortAsc ? Number(rawA) - Number(rawB) : Number(rawB) - Number(rawA);
      });

      const limit = Math.min(30, Math.max(1, Number(args.limit) || 15));
      return {
        dataStatus: overview.dataStatus,
        totalMatched: results.length,
        returned: Math.min(limit, results.length),
        stocks: results.slice(0, limit).map((s) => ({
          ticker: s.ticker,
          nameAr: s.nameAr,
          sectorAr: s.sectorAr,
          index: s.index,
          price: s.currentPrice,
          changePct: s.changePct,
          valueTradedM: Number((s.valueTraded / 1e6).toFixed(2)),
          score: s.score,
          confidencePct: s.confidencePct,
          screenerCategory: s.screenerCategory,
          screenerCategoryAr: s.screenerCategoryAr,
          pillarBreakdown: s.pillarBreakdown,
          recommendation: s.recommendation,
          recommendationAr: s.recommendationAr,
          mathReasonAr: s.mathReasonAr,
          reasonsAr: s.reasonsAr,
          risksAr: s.risksAr,
          invalidationConditionsAr: s.invalidationConditionsAr,
          supportLevel: s.supportLevel,
          resistanceLevel: s.resistanceLevel,
          accumulationDetected: s.accumulationDetected,
          falseBreakoutWarning: s.falseBreakoutWarning,
          peRatio: s.peRatio,
          pbRatio: s.pbRatio,
          roe: s.roe,
          dividendYield: s.dividendYield,
          fairValue: s.fairValue,
          fairValueUpsidePct: s.fairValueUpsidePct,
          rsi14: s.rsi14,
          dailyTrend: s.dailyTrend,
          relativeVolume: s.relativeVolume,
          priceDate: s.priceDate,
          isLiveQuote: s.isLiveQuote,
          isStaleQuote: s.isStaleQuote
        }))
      };
    }

    case 'get_full_stock_analysis': {
      const rawTicker = String(args.ticker || '').toUpperCase().replace('.CA', '').trim();
      let stock = getEGXStock(rawTicker);
      if (!stock && rawTicker) {
        const q = normalizeText(rawTicker);
        stock = EGX_STOCKS_UNIVERSE.find(
          (s) => normalizeText(s.nameAr).includes(q) || normalizeText(s.nameEn).includes(q)
        );
      }
      if (!stock) {
        return { error: `Stock "${args.ticker}" was not found in the EGX universe.` };
      }

      const [dailyRes, tvSnapshot, newsRes] = await Promise.all([
        MarketDataService.fetchRealHistoricalCandles(stock.ticker, '1D'),
        MarketDataService.fetchTradingViewTechnicalSnapshot(stock.ticker),
        NewsDisclosureService.fetchNewsForTicker(stock.ticker)
      ]);

      const techSafe = TechnicalAnalysisEngine.calculateSafe(dailyRes.candles, tvSnapshot, {
        isRealData: dailyRes.isRealData,
        isStale: dailyRes.isStale,
        staleDays: dailyRes.staleDays,
        staleReasonAr: dailyRes.staleReasonAr,
        error: dailyRes.error
      });
      const tech = techSafe.result || null;

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

      const multiSource = MarketDataService.compareMultiSources(stock.ticker, tvSnapshot, dailyRes);
      const aiDecision = await AiRecommendationEngine.analyze(stock, tech, fund, fair, newsRes.news, {
        generateFreshAi: false,
        techErrorAr: techSafe.reasonAr,
        discrepancyNoticeAr: multiSource.notesAr
      });

      const peers = EGX_STOCKS_UNIVERSE.filter((s) => s.sectorAr === stock!.sectorAr && s.ticker !== stock!.ticker)
        .slice(0, 4)
        .map((p) => {
          const pFund = FundamentalAnalysisEngine.getFinancials(p.ticker, p.currentPrice);
          return {
            ticker: p.ticker,
            nameAr: p.nameAr,
            currentPrice: p.currentPrice,
            isLiveQuote: !!p.isLiveQuote,
            priceDate: p.priceDate || null,
            peRatio: pFund.ratios.peRatio,
            pbRatio: pFund.ratios.pbRatio,
            roe: pFund.ratios.roe
          };
        });

      return {
        dataProvenance: {
          priceDate: stock.priceDate || null,
          lastSyncedAt: stock.lastSyncedAt || null,
          isLiveQuote: !!stock.isLiveQuote,
          yahooIsRealData: dailyRes.isRealData,
          yahooLastCandleDate: dailyRes.lastCandleDate,
          yahooIsStale: dailyRes.isStale,
          yahooStaleDays: dailyRes.staleDays,
          yahooStaleReasonAr: dailyRes.staleReasonAr,
          yahooError: dailyRes.error,
          newsOnline: newsRes.sourceOnline,
          newsError: newsRes.error,
          multiSourceComparison: multiSource
        },
        stock: {
          ticker: stock.ticker,
          yahooTicker: stock.yahooTicker,
          isin: stock.isin,
          nameAr: stock.nameAr,
          nameEn: stock.nameEn,
          sectorAr: stock.sectorAr,
          industryAr: stock.industryAr,
          index: stock.index,
          currency: stock.currency,
          currentPrice: stock.currentPrice,
          prevClose: stock.prevClose,
          volume: stock.volume,
          valueTradedM: Number((stock.valueTraded / 1e6).toFixed(2)),
          marketCapEgp: fund.ratios.marketCapEgp
        },
        technical: tech
          ? {
              available: true,
              candlesCount: tech.candlesCount,
              lastCandleDate: tech.lastCandleDate,
              isStale: tech.isStale,
              staleReasonAr: tech.staleReasonAr,
              technicalScore: tech.technicalScore,
              technicalScoreFormulaAr: tech.technicalScoreFormulaAr,
              technicalScoreBreakdown: tech.technicalScoreBreakdown,
              dailyTrend: tech.dailyTrend,
              weeklyTrend: tech.weeklyTrend,
              monthlyTrend: tech.monthlyTrend,
              trendAlignmentStatusAr: tech.trendAlignmentStatusAr,
              rsi14: tech.rsi14,
              rsiStatus: tech.rsiStatus,
              macd: tech.macd,
              adx14: tech.adx14,
              ema20: tech.ema20,
              ema50: tech.ema50,
              ema200: tech.ema200,
              atr14: tech.atr14,
              relativeVolume: tech.relativeVolume,
              supportZones: tech.supportZones,
              resistanceZones: tech.resistanceZones,
              volatilityContraction: tech.volatilityContraction || null,
              falseBreakoutDetected: !!tech.falseBreakoutDetected,
              falseBreakoutNoteAr: tech.falseBreakoutNoteAr || null,
              lastCandlesAnalysis: tech.lastCandlesAnalysis
            }
          : {
              available: false,
              reasonAr: techSafe.reasonAr || 'لا تتوفر شموع تاريخية كافية لإجراء التحليل الفني.'
            },
        fundamental: {
          available: fund.available,
          insufficientReasonAr: fund.insufficientReasonAr,
          sectorProfile: fund.sectorProfile,
          sectorProfileAr: fund.sectorProfileAr,
          fundamentalConfidence: fund.fundamentalConfidence,
          availableMetricsCount: fund.availableMetricsCount,
          dataCompletenessPct: fund.dataCompletenessPct,
          reportingPeriod: fund.reportingPeriod,
          fiscalPeriodEndDate: fund.fiscalPeriodEndDate,
          earningsReleaseDate: fund.earningsReleaseDate,
          publishedMetrics: fund.publishedMetrics,
          derivedMetrics: fund.derivedMetrics,
          unavailableMetrics: fund.unavailableMetrics,
          qualityScoreFormulaAr: fund.qualityScoreFormulaAr,
          qualityScoreComponents: fund.qualityScoreComponents,
          ratios: fund.ratios
        },
        fairValue: {
          available: fair.available,
          insufficientReasonAr: fair.insufficientReasonAr,
          valuationDate: fair.valuationDate,
          estimatedFairValue: fair.estimatedFairValue,
          conservativeValuation: fair.conservativeValuation,
          optimisticValuation: fair.optimisticValuation,
          upsideDownsidePct: fair.upsideDownsidePct,
          valuationStatusAr: fair.valuationStatusAr,
          formulaExplanationAr: fair.formulaExplanationAr,
          methods: fair.methods,
          modelInputs: fair.modelInputs
        },
        tradingPlan: {
          available: aiDecision.available,
          insufficientReasonAr: aiDecision.insufficientReasonAr,
          isStaleData: aiDecision.isStaleData,
          dataDate: aiDecision.dataDate,
          recommendation: aiDecision.recommendation,
          recommendationAr: aiDecision.recommendationAr,
          overallScore: aiDecision.overallScore,
          confidenceScore: aiDecision.confidenceScore,
          mathematicalRationaleAr: aiDecision.mathematicalRationaleAr,
          scoreFormulaAr: aiDecision.scoreFormulaAr,
          pillars: aiDecision.pillars,
          preferredEntryZone: aiDecision.preferredEntryZone,
          alternativeEntryZone: aiDecision.alternativeEntryZone,
          breakoutTriggerPrice: aiDecision.breakoutTriggerPrice,
          entryConfirmationAr: aiDecision.entryConfirmationAr,
          stopLossPrice: aiDecision.stopLossPrice,
          stopLossPct: aiDecision.stopLossPct,
          stopLossLogicAr: aiDecision.stopLossLogicAr,
          target1: aiDecision.target1,
          target2: aiDecision.target2,
          target3: aiDecision.target3 || null,
          targetNotesAr: aiDecision.targetNotesAr,
          expectedUpsidePct: aiDecision.expectedUpsidePct,
          rewardRiskRatio: aiDecision.rewardRiskRatio,
          selectionReasonsAr: aiDecision.selectionReasonsAr,
          potentialRisksAr: aiDecision.potentialRisksAr,
          invalidationConditionsAr: aiDecision.invalidationConditionsAr,
          allGatesPassed: aiDecision.allGatesPassed,
          riskGates: aiDecision.riskGates
        },
        news: newsRes.news,
        peers
      };
    }

    case 'compare_stocks': {
      const tickers: string[] = Array.isArray(args.tickers) ? args.tickers.slice(0, 5) : [];
      const comparisons = [];

      for (const raw of tickers) {
        const norm = String(raw).toUpperCase().replace('.CA', '').trim();
        const stock = getEGXStock(norm);
        if (!stock) continue;

        const [dailyRes, tvSnapshot, newsRes] = await Promise.all([
          MarketDataService.fetchRealHistoricalCandles(stock.ticker, '1D'),
          MarketDataService.fetchTradingViewTechnicalSnapshot(stock.ticker),
          NewsDisclosureService.fetchNewsForTicker(stock.ticker)
        ]);

        const techSafe = TechnicalAnalysisEngine.calculateSafe(dailyRes.candles, tvSnapshot, {
          isRealData: dailyRes.isRealData,
          isStale: dailyRes.isStale,
          staleDays: dailyRes.staleDays,
          staleReasonAr: dailyRes.staleReasonAr,
          error: dailyRes.error
        });
        const tech = techSafe.result || null;
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
        const plan = await AiRecommendationEngine.analyze(stock, tech, fund, fair, newsRes.news, {
          generateFreshAi: false,
          techErrorAr: techSafe.reasonAr,
          recordHistory: false
        });

        comparisons.push({
          ticker: stock.ticker,
          nameAr: stock.nameAr,
          sectorAr: stock.sectorAr,
          index: stock.index,
          price: stock.currentPrice,
          priceDate: stock.priceDate || null,
          isLiveQuote: !!stock.isLiveQuote,
          lastCandleDate: dailyRes.lastCandleDate,
          available: plan.available,
          insufficientReasonAr: plan.insufficientReasonAr || null,
          peRatio: fund.ratios.peRatio,
          pbRatio: fund.ratios.pbRatio,
          roe: fund.ratios.roe,
          netProfitMargin: fund.ratios.netProfitMargin,
          debtToEquity: fund.ratios.debtToEquity,
          dividendYield: fund.ratios.dividendYield,
          fairValue: fair.estimatedFairValue,
          fairValueUpsidePct: fair.upsideDownsidePct,
          rsi14: tech?.rsi14 ?? stock.tvRsi ?? null,
          dailyTrend: tech?.dailyTrend ?? 'UNAVAILABLE',
          technicalScore: tech?.technicalScore ?? null,
          fundamentalScore: fund.ratios.fundamentalQualityScore,
          overallScore: plan.overallScore,
          recommendation: plan.recommendation,
          recommendationAr: plan.recommendationAr,
          mathematicalRationaleAr: plan.mathematicalRationaleAr,
          rewardRiskRatio: plan.rewardRiskRatio,
          preferredEntry: plan.preferredEntryZone?.labelAr ?? null,
          stopLoss: plan.stopLossPrice,
          target1: plan.target1?.price ?? null,
          target2: plan.target2?.price ?? null,
          target3: plan.target3?.price ?? null,
          sectorProfileAr: fund.sectorProfileAr,
          fundamentalConfidence: fund.fundamentalConfidence
        });
      }

      return { comparedCount: comparisons.length, comparisons };
    }

    case 'get_sector_statistics': {
      const overview = MarketDataService.getMarketOverview();
      const { screenerList } = getCachedStockBatches();
      const sectorMap = new Map<string, any[]>();
      for (const s of screenerList) {
        if (!sectorMap.has(s.sectorAr)) sectorMap.set(s.sectorAr, []);
        sectorMap.get(s.sectorAr)!.push(s);
      }

      let sectors = Array.from(sectorMap.entries()).map(([sectorAr, items]) => {
        const count = items.length;
        const synced = items.filter((i) => i.isLiveQuote);
        const advancing = synced.filter((i) => i.changePct > 0).length;
        const declining = synced.filter((i) => i.changePct < 0).length;
        const avgChangePct =
          synced.length > 0
            ? Number((synced.reduce((a, b) => a + b.changePct, 0) / synced.length).toFixed(2))
            : null;
        const validPe = items.filter((i) => i.peRatio !== null && i.peRatio > 0 && i.peRatio < 80);
        const avgPe =
          validPe.length > 0
            ? Number((validPe.reduce((a, b) => a + b.peRatio, 0) / validPe.length).toFixed(1))
            : null;
        const validUpside = items.filter((i) => i.fairValueUpsidePct !== null);
        const avgUpside =
          validUpside.length > 0
            ? Number((validUpside.reduce((a, b) => a + b.fairValueUpsidePct, 0) / validUpside.length).toFixed(1))
            : null;
        const validScores = items.filter((i) => i.score !== null);
        const avgScore =
          validScores.length > 0
            ? Number((validScores.reduce((a, b) => a + b.score, 0) / validScores.length).toFixed(1))
            : null;
        const totalTurnoverM = Number((synced.reduce((a, b) => a + b.valueTraded, 0) / 1e6).toFixed(1));
        const topStocks = [...items]
          .filter((t) => t.score !== null)
          .sort((a, b) => (b.score ?? -999) - (a.score ?? -999))
          .slice(0, 3)
          .map((t) => ({
            ticker: t.ticker,
            nameAr: t.nameAr,
            price: t.currentPrice,
            score: t.score,
            upsidePct: t.fairValueUpsidePct,
            recommendation: t.recommendation
          }));

        return {
          sectorAr,
          sectorEn: items[0]?.sectorEn || '',
          stockCount: count,
          syncedCount: synced.length,
          advancing,
          declining,
          avgChangePct,
          avgPe,
          avgUpsidePct: avgUpside,
          avgScore,
          totalTurnoverM,
          topStocks
        };
      });

      if (args.sectorFilter) {
        const q = normalizeText(String(args.sectorFilter));
        sectors = sectors.filter(
          (sec) => normalizeText(sec.sectorAr).includes(q) || normalizeText(sec.sectorEn).includes(q)
        );
      }

      sectors.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
      return {
        dataStatus: overview.dataStatus,
        totalSectors: sectors.length,
        sectors
      };
    }

    case 'get_portfolio_summary': {
      return PortfolioService.getPortfolio();
    }

    case 'get_recommendation_history_stats': {
      return await RecommendationHistoryService.getVerifiedAudit();
    }

    case 'get_news_and_events': {
      const ticker = args.ticker ? String(args.ticker).toUpperCase().replace('.CA', '').trim() : undefined;
      const newsRes = ticker
        ? await NewsDisclosureService.fetchNewsForTicker(ticker)
        : await NewsDisclosureService.fetchAllNews();
      return {
        ...newsRes,
        upcomingEvents: [],
        upcomingEventsNoteAr: 'لا يتوفر مصدر رسمي مربوط تلقائياً لأجندة الجمعيات العمومية القادمة؛ لا تُصدر مواعيد افتراضية.'
      };
    }

    case 'get_data_sources_and_alerts': {
      return {
        sourcesReport: SourceIntelligenceService.getReport(),
        watchlist: WatchlistAlertService.getWatchlist(),
        alerts: WatchlistAlertService.getAlerts()
      };
    }

    case 'run_backtest_summary': {
      return await BacktestingEngine.runBacktest({
        strategyId: args.strategyId || 'SWING_TREND_PULLBACK',
        ticker: args.ticker || 'COMI'
      });
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function extractTickersFromText(text: string): string[] {
  const knownTickers = new Set(EGX_STOCKS_UNIVERSE.map((s) => s.ticker));
  const matches = text.match(/\b[A-Z]{3,6}\b/g) || [];
  const found: string[] = [];
  for (const m of matches) {
    if (knownTickers.has(m) && !found.includes(m)) {
      found.push(m);
    }
  }
  return found.slice(0, 8);
}

export class AiChatService {
  private static geminiClient: GoogleGenAI | null = null;

  private static getAi(): GoogleGenAI | null {
    if (!this.geminiClient && process.env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return this.geminiClient;
  }

  public static async chat(params: {
    message: string;
    history?: ChatHistoryTurn[];
    activeTicker?: string;
    activeTab?: string;
    lang?: 'ar' | 'en';
  }): Promise<AiChatResponse> {
    const ai = this.getAi();
    if (!ai) {
      throw new Error(
        params.lang === 'en'
          ? 'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
          : 'مفتاح GEMINI_API_KEY غير مضبوط حالياً. يرجى إضافته في لوحة Settings > Secrets لتفعيل المحلل الذكي.'
      );
    }

    const lang = params.lang === 'en' ? 'en' : 'ar';
    const activeTicker = params.activeTicker ? params.activeTicker.toUpperCase().replace('.CA', '') : 'COMI';
    const activeStock = getEGXStock(activeTicker);
    const overview = MarketDataService.getMarketOverview();

    const syncBanner = !overview.dataStatus.tradingViewOnline
      ? `تنبيه حرج: مصدر الأسعار المباشر متوقف/فاشل حالياً (${overview.dataStatus.lastSyncError || 'لم يكتمل الاتصال بعد'}).`
      : overview.dataStatus.isStale
      ? `تنبيه حداثة: آخر مزامنة للأسعار كانت بتاريخ ${overview.dataStatus.lastSyncedAt} (منذ ${overview.dataStatus.dataAgeMinutes} دقيقة).`
      : `مزامن لحظياً بتاريخ ${overview.dataStatus.lastSyncedAt}.`;

    const systemInstruction = `
أنت "كبير محللي البورصة المصرية والمستشار الاستثماري الذكي" في منصة EGX AI Analyst.
حالة مصادر البيانات الآن: ${syncBanner}
تاريخ الجلسة: ${overview.lastMarketSessionDate} | EGX30: ${overview.egx30.value ?? 'غير متاح'} | الدولار/الجنيه: ${overview.cbeData.fxUsdEgpRate ?? 'غير متاح'} | الفائدة المرجعية (${overview.cbeData.lastCbeMeetingDate}): ${overview.cbeData.overnightLendingRate}%/${overview.cbeData.overnightDepositRate}%.
السهم النشط: ${activeTicker}${activeStock ? ` (${activeStock.nameAr} — السعر ${activeStock.currentPrice} ${activeStock.currency}، تاريخه ${activeStock.priceDate || 'غير محدد'})` : ''}.

قواعد النزاهة والمنهجية الصارمة (مخالفتها مرفوضة تماماً):
1. **دورك التفسير فقط — لا تخترع أسعاراً أو مؤشرات**: استدعِ أدوات المنصة أولاً، واذكر الأرقام والنسب كما وردت حرفياً من الأدوات. يُمنع منعاً باتاً اختراع أي سعر دخول أو وقف خسارة أو مستهدف أو نسبة مالية غير موجودة في مخرجات الأداة.
2. **تنبيه فشل مصدر الأسعار**: إذا أظهرت الأداة فشل مصدر الأسعار (TradingView أو Yahoo Finance أو News RSS) يجب أن تبدأ بتنبيه المستخدم فوراً بوضوح وذكر سبب الفشل.
3. **إظهار تاريخ البيانات القديمة/المرجعية**: إذا كانت الشموع أو الأسعار قديمة (isStale) أو من مرجع ثابت مثل فائدة البنك المركزي (${overview.cbeData.lastCbeMeetingDate})، اذكر التاريخ الفعلي صراحةً للمستخدم.
4. **الامتناع عن إصدار تحليل عند نقص البيانات**: إذا أعادت الأداة \`available: false\` أو \`INSUFFICIENT_DATA\` أو \`status: 'INSUFFICIENT_DATA'\`، امتنع عن إصدار أي توصية شراء/بيع أو أهداف سعرية واشرح ما هي البيانات الناقصة بالضبط.
5. **السبب الحسابي لكل توصية**: عند شرح أي توصية أو تقييم (سهم أو محفظة)، اعرض المعادلة والأوزان والأرقام الحقيقية (\`mathematicalRationaleAr\` / \`scoreFormulaAr\` / \`formulaExplanationAr\`) التي بُني عليها القرار.
6. **بحث جوجل الحي (\`googleSearch\`)**: استخدمه فقط للأخبار الاقتصادية الحديثة أو قرارات المركزي أو الإفصاحات المنشورة على الويب، ولا تستخدمه لاختلاق مستويات فنية غير محسوبة.
`.trim();

    const contents: Content[] = [];
    if (Array.isArray(params.history)) {
      for (const turn of params.history.slice(-10)) {
        if (!turn.text?.trim()) continue;
        contents.push({
          role: turn.role === 'model' ? 'model' : 'user',
          parts: [{ text: turn.text }]
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: params.message }]
    });

    const toolsWithSearch = [{ googleSearch: {} }, { functionDeclarations }];
    const toolsPlatformOnly = [{ functionDeclarations }];

    const usedToolsSet = new Set<string>();
    const webSourcesMap = new Map<string, ChatWebSource>();
    const mentionedTickersSet = new Set<string>();

    let finalReply = '';
    const maxRounds = 5;
    // Enable Google Search hybrid mode selectively when query asks about external news/macro/web facts,
    // keeping standard EGX platform/stock queries fast on dedicated function tools.
    const needsWebSearch = /(أخبار|خبر|إفصاح|المركزي|فائدة|تضخم|دولار|بحث|جوجل|اليوم|مؤخرا|مؤخراً|آخر|news|macro|cbe|inflation|rate|search|today|latest)/i.test(
      params.message
    );
    let useGoogleSearch = needsWebSearch;

    let activeModel = 'gemini-4-hydrogen';
    const GEMINI_CALL_TIMEOUT_MS = 30000;
    const PLAIN_FALLBACK_TIMEOUT_MS = 28000;
    let lastUpstreamStatus: number | undefined;
    let lastUpstreamReason = '';

    const callModelWithRetry = async () => {
      const delays = [0, 400];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
        }
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => {
              const tErr: any = new Error('Gemini API call timed out');
              tErr.status = 504;
              reject(tErr);
            }, GEMINI_CALL_TIMEOUT_MS)
          );

          const callPromise = ai.models.generateContent({
            model: activeModel,
            contents,
            config: {
              systemInstruction,
              tools: useGoogleSearch ? toolsWithSearch : toolsPlatformOnly,
              toolConfig: useGoogleSearch ? { includeServerSideToolInvocations: true } : undefined,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
            }
          });

          return await Promise.race([callPromise, timeoutPromise]);
        } catch (err: any) {
          const msg = String(err?.message || '');
          const status = err?.status;
          lastUpstreamStatus = typeof status === 'number' ? status : lastUpstreamStatus;
          lastUpstreamReason = msg.slice(0, 160);
          console.warn(`[AiChatService] Gemini tool-call attempt ${attempt} failed (model=${activeModel}, search=${useGoogleSearch}, status=${status}): ${lastUpstreamReason}`);

          // If primary free model hits 429 rate limit, switch once to free-tier high-throughput gemini-3.1-flash-lite
          if ((status === 429 || msg.includes('RESOURCE_EXHAUSTED')) && activeModel !== 'gemini-3.1-flash-lite') {
            activeModel = 'gemini-3.1-flash-lite';
            useGoogleSearch = false;
            continue;
          }

          // If combined Google Search grounding + custom tools failed/timed out, retry once with platform tools only
          if (useGoogleSearch && attempt === 0) {
            useGoogleSearch = false;
            continue;
          }

          // Don't burn another 30s waiting on a full tool timeout — break directly to fast platform-context synthesis
          if (status === 504 || msg.includes('timed out')) {
            throw err;
          }

          const isTransient =
            status === 503 ||
            status === 500 ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('ECONNRESET');
          if (!isTransient || attempt === delays.length - 1) {
            throw err;
          }
        }
      }
      throw new Error('Gemini API retry attempts exhausted');
    };

    try {
      for (let round = 0; round < maxRounds; round++) {
        const response = await callModelWithRetry();

        const groundingMetadata: any = response.candidates?.[0]?.groundingMetadata;
        const groundingChunks = groundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks)) {
          for (const chunk of groundingChunks) {
            const uri = chunk?.web?.uri;
            const title = chunk?.web?.title;
            if (uri && !webSourcesMap.has(uri)) {
              webSourcesMap.set(uri, { uri, title: title || uri });
            }
          }
        }
        if (Array.isArray(groundingMetadata?.webSearchQueries) && groundingMetadata.webSearchQueries.length > 0) {
          usedToolsSet.add(TOOL_LABELS_AR.google_search);
        }

        const functionCalls = response.functionCalls;
        const candidateContent = response.candidates?.[0]?.content;

        if (functionCalls && functionCalls.length > 0 && candidateContent) {
          contents.push(candidateContent);

          const toolParts = await Promise.all(
            functionCalls.map(async (call) => {
              const toolName = call.name || 'unknown';
              usedToolsSet.add(TOOL_LABELS_AR[toolName] || toolName);

              const callArgs = (call.args || {}) as Record<string, any>;
              if (callArgs.ticker) {
                const t = String(callArgs.ticker).toUpperCase().replace('.CA', '').trim();
                if (getEGXStock(t)) mentionedTickersSet.add(t);
              }
              if (Array.isArray(callArgs.tickers)) {
                for (const raw of callArgs.tickers) {
                  const t = String(raw).toUpperCase().replace('.CA', '').trim();
                  if (getEGXStock(t)) mentionedTickersSet.add(t);
                }
              }

              let toolResult: Record<string, any>;
              try {
                toolResult = await executeToolCall(toolName, callArgs);
              } catch (err: any) {
                toolResult = { error: err?.message || 'Tool execution error' };
              }

              return {
                functionResponse: {
                  id: call.id,
                  name: toolName,
                  response: toolResult
                }
              };
            })
          );

          contents.push({
            role: 'user',
            parts: toolParts
          });
          continue;
        }

        finalReply = (response.text || '').trim();
        break;
      }
    } catch (err: any) {
      const rawMsg = String(err?.message || '');
      const status = err?.status || lastUpstreamStatus;

      if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        const quotaErr: any = new Error(
          lang === 'en'
            ? 'Gemini API quota exceeded (429). Please wait a few seconds or select a billing-enabled API key in Settings > Secrets.'
            : 'تم تجاوز حد الاستخدام المتاح لمفتاح Gemini API حالياً (429). يرجى الانتظار بضع ثوانٍ أو مراجعة المفتاح والحصة في لوحة Settings > Secrets.'
        );
        quotaErr.status = 429;
        throw quotaErr;
      }
      if (status === 403 || status === 400 || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('API_KEY_INVALID')) {
        const authErr: any = new Error(
          lang === 'en'
            ? 'Invalid or unauthorized Gemini API key. Please check your key in Settings > Secrets.'
            : 'مفتاح Gemini API غير صالح أو يفتقر للصلاحيات. يرجى مراجعة المفتاح في لوحة Settings > Secrets.'
        );
        authErr.status = status || 401;
        throw authErr;
      }

      // If hybrid tool-calling timed out or returned 503, execute verified platform context server-side
      // and call lightweight Gemini generateContent with ThinkingLevel.LOW.
      if (status === 503 || status === 504 || rawMsg.includes('UNAVAILABLE') || rawMsg.includes('timed out')) {
        try {
          const detectedTickers = extractTickersFromText(params.message.toUpperCase());
          const focusTicker = detectedTickers[0] || (activeStock ? activeStock.ticker : 'COMI');
          if (getEGXStock(focusTicker)) mentionedTickersSet.add(focusTicker);

          const [marketCtx, stockCtx, sourcesCtx] = await Promise.all([
            executeToolCall('get_market_overview', {}),
            executeToolCall('get_full_stock_analysis', { ticker: focusTicker }),
            executeToolCall('get_data_sources_and_alerts', {})
          ]);
          usedToolsSet.add(TOOL_LABELS_AR.get_market_overview);
          usedToolsSet.add(TOOL_LABELS_AR.get_full_stock_analysis);

          const compactContext = JSON.stringify({
            market: {
              egx30: marketCtx.egx30,
              egx70: marketCtx.egx70,
              cbeData: marketCtx.cbeData,
              dataStatus: marketCtx.dataStatus,
              topGainers: Array.isArray(marketCtx.topGainers) ? marketCtx.topGainers.slice(0, 3) : [],
              topTurnover: Array.isArray(marketCtx.topTurnover) ? marketCtx.topTurnover.slice(0, 3) : []
            },
            focusStock: {
              dataProvenance: stockCtx.dataProvenance,
              stock: stockCtx.stock,
              technical: stockCtx.technical
                ? {
                    ...stockCtx.technical,
                    lastCandlesAnalysis: stockCtx.technical.lastCandlesAnalysis
                      ? {
                          candlestickSummaryAr: stockCtx.technical.lastCandlesAnalysis.candlestickSummaryAr,
                          recentBars: Array.isArray(stockCtx.technical.lastCandlesAnalysis.recentBars)
                            ? stockCtx.technical.lastCandlesAnalysis.recentBars.slice(-5)
                            : []
                        }
                      : undefined
                  }
                : null,
              fundamental: stockCtx.fundamental
                ? {
                    available: stockCtx.fundamental.available,
                    insufficientReasonAr: stockCtx.fundamental.insufficientReasonAr,
                    ratios: stockCtx.fundamental.ratios
                  }
                : null,
              fairValue: stockCtx.fairValue
                ? {
                    available: stockCtx.fairValue.available,
                    estimatedFairValue: stockCtx.fairValue.estimatedFairValue,
                    upsideDownsidePct: stockCtx.fairValue.upsideDownsidePct,
                    formulaExplanationAr: stockCtx.fairValue.formulaExplanationAr
                  }
                : null,
              tradingPlan: stockCtx.tradingPlan
            },
            sourcesSummary: {
              overallStatus: sourcesCtx?.sourcesReport?.overallStatus,
              failedCount: sourcesCtx?.sourcesReport?.failedProvidersCount
            }
          });

          const callPlain = async (modelName: string) => {
            const plainTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => {
                const tErr: any = new Error('Plain Gemini fallback timed out');
                tErr.status = 504;
                reject(tErr);
              }, PLAIN_FALLBACK_TIMEOUT_MS)
            );
            const plainCall = ai.models.generateContent({
              model: modelName,
              contents: `بيانات المنصة المحسوبة والموثقة حالياً:\n${compactContext}\n\nسؤال المستخدم: ${params.message}`,
              config: {
                systemInstruction,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
              }
            });
            return await Promise.race([plainCall, plainTimeout]);
          };

          let plainRes;
          try {
            plainRes = await callPlain(activeModel);
          } catch (firstPlainErr: any) {
            const fStatus = firstPlainErr?.status;
            const fMsg = String(firstPlainErr?.message || '');
            const shouldTryLite =
              activeModel !== 'gemini-3.1-flash-lite' &&
              (fStatus === 429 ||
                fStatus === 503 ||
                fStatus === 504 ||
                fMsg.includes('RESOURCE_EXHAUSTED') ||
                fMsg.includes('UNAVAILABLE') ||
                fMsg.includes('timed out'));
            if (shouldTryLite) {
              activeModel = 'gemini-3.1-flash-lite';
              plainRes = await callPlain(activeModel);
            } else {
              throw firstPlainErr;
            }
          }
          finalReply = (plainRes.text || '').trim();
        } catch (plainErr: any) {
          const pStatus = plainErr?.status || status || 500;
          const pMsg = String(plainErr?.message || lastUpstreamReason || rawMsg).slice(0, 160);
          console.warn('[AiChatService] Plain Gemini fallback failed:', pStatus, pMsg);
          if (pStatus === 429 || pMsg.includes('RESOURCE_EXHAUSTED')) {
            const quotaErr: any = new Error(
              lang === 'en'
                ? 'Gemini API quota/rate limit exceeded (429). Please wait a few seconds or select a billing-enabled API key in Settings > Secrets.'
                : 'تم تجاوز حد الطلبات المتاح لمفتاح Gemini API مؤقتاً (429). يرجى الانتظار بضع ثوانٍ أو مراجعة الحصة في لوحة Settings > Secrets.'
            );
            quotaErr.status = 429;
            throw quotaErr;
          }
          const busyErr: any = new Error(
            lang === 'en'
              ? `The Gemini AI service is temporarily experiencing high demand or timed out (${pStatus}). Please try again in a few moments.`
              : `خدمة الذكاء الاصطناعي (Gemini) مزدحمة أو استغرقت وقتاً أطول من المعتاد مؤقتاً (${pStatus}). يرجى إعادة المحاولة بعد لحظات.`
          );
          busyErr.status = 500;
          throw busyErr;
        }
      } else {
        throw err;
      }
    }

    if (!finalReply) {
      finalReply =
        lang === 'en'
          ? 'I retrieved the platform metrics, but could not synthesize a final response. Please try asking again with a more specific question.'
          : 'تم جلب البيانات من محرك المنصة لكن تعذر صياغة الرد النهائي. يرجى إعادة المحاولة بسؤال أكثر تحديداً.';
    }

    for (const t of extractTickersFromText(finalReply)) {
      mentionedTickersSet.add(t);
    }

    return {
      reply: finalReply,
      usedTools: Array.from(usedToolsSet),
      webSources: Array.from(webSourcesMap.values()).slice(0, 8),
      mentionedTickers: Array.from(mentionedTickersSet),
      modelUsed: activeModel,
      timestamp: new Date().toISOString()
    };
  }
}
