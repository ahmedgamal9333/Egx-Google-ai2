import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import { EGX_STOCKS_UNIVERSE, getEGXStock } from './server/data/egxStocks';
import { MarketDataService } from './server/services/marketDataService';
import { TechnicalAnalysisEngine } from './server/services/technicalAnalysisService';
import { FundamentalAnalysisEngine } from './server/services/fundamentalAnalysisService';
import { FairValueValuationEngine } from './server/services/fairValueService';
import { NewsDisclosureService } from './server/services/newsService';
import { AiRecommendationEngine } from './server/services/aiRecommendationService';
import { PortfolioService } from './server/services/portfolioService';
import { RecommendationHistoryService } from './server/services/recommendationHistoryService';
import { BacktestingEngine } from './server/services/backtestingService';
import { SourceIntelligenceService } from './server/services/sourceIntelligenceService';
import { WatchlistAlertService } from './server/services/watchlistAlertService';
import { LiveMarketSyncService } from './server/services/liveMarketSyncService';
import { getCachedStockBatches } from './server/services/stockScreenerService';
import { AiChatService } from './server/services/aiChatService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_TICKER_REGEX = /^[A-Z0-9]{2,12}$/;
const ALLOWED_STRATEGIES = new Set(['SWING_TREND_PULLBACK', 'BREAKOUT_MOMENTUM', 'VALUE_MOMENTUM']);

function normalizeAndValidateTicker(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const norm = raw.toUpperCase().replace(/\.CA$/i, '').trim();
  if (!VALID_TICKER_REGEX.test(norm)) return null;
  return norm;
}

function parseFiniteQueryNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function normalizeProxySafeErrorStatus(rawStatus: unknown): number {
  const num = typeof rawStatus === 'number' ? rawStatus : 500;
  if (num < 400 || num >= 600) return 500;
  // Nginx reverse proxy enables `proxy_intercept_errors on` for 403 and 502/503/504,
  // replacing JSON API responses with HTML error/warmup pages at HTTP 200.
  if (num === 403) return 401;
  if (num === 502 || num === 503 || num === 504) return 500;
  return num;
}

function safeServerError(res: Response, status: number, fallbackMessage: string) {
  res.status(normalizeProxySafeErrorStatus(status)).json({ error: fallbackMessage });
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    const live = LiveMarketSyncService.getLiveState();
    res.json({
      status: 'ONLINE',
      system: 'EGX AI Analyst Server',
      timestamp: new Date().toISOString(),
      version: '3.1.0-pro',
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      tradingViewOnline: live.tradingViewOnline
    });
  });

  // Market overview & macro data
  app.get('/api/market/overview', (_req: Request, res: Response) => {
    try {
      const overview = MarketDataService.getMarketOverview();
      res.json(overview);
    } catch {
      safeServerError(res, 500, 'Failed to retrieve market overview');
    }
  });

  // Manual or automated live market sync trigger
  app.post('/api/market/sync', async (_req: Request, res: Response) => {
    try {
      const [syncResult] = await Promise.all([
        LiveMarketSyncService.syncFromProviders(),
        MarketDataService.probeOfficialMacroAndEgxFeeds().catch(() => null)
      ]);
      const overview = MarketDataService.getMarketOverview();
      const sources = SourceIntelligenceService.getReport();
      res.json({ syncResult, overview, sources });
    } catch {
      safeServerError(res, 500, 'Market sync operation failed');
    }
  });

  // Stock universe list with verified metrics & real math badges
  app.get('/api/stocks', (_req: Request, res: Response) => {
    try {
      const { stocksList } = getCachedStockBatches();
      res.json(stocksList);
    } catch {
      safeServerError(res, 500, 'Failed to load stock universe');
    }
  });

  // Deep-dive analysis for a single stock
  app.get('/api/stocks/:ticker', async (req: Request, res: Response) => {
    try {
      const ticker = normalizeAndValidateTicker(req.params.ticker);
      if (!ticker) {
        res.status(400).json({ error: 'Invalid EGX ticker format' });
        return;
      }
      const stock = getEGXStock(ticker);
      if (!stock) {
        res.status(404).json({ error: `Stock ${ticker} not found in Egyptian stock universe` });
        return;
      }

      const [dailyRes, weeklyRes, monthlyRes, tvSnapshot, newsRes] = await Promise.all([
        MarketDataService.fetchRealHistoricalCandles(ticker, '1D'),
        MarketDataService.fetchRealHistoricalCandles(ticker, '1W'),
        MarketDataService.fetchRealHistoricalCandles(ticker, '1M'),
        MarketDataService.fetchTradingViewTechnicalSnapshot(ticker),
        NewsDisclosureService.fetchNewsForTicker(ticker)
      ]);

      const candlesDaily = dailyRes.candles;
      const candlesWeekly = weeklyRes.candles;
      const candlesMonthly = monthlyRes.candles;

      const techSafe = TechnicalAnalysisEngine.calculateSafe(candlesDaily, tvSnapshot, {
        isRealData: dailyRes.isRealData,
        isStale: dailyRes.isStale,
        staleDays: dailyRes.staleDays,
        staleReasonAr: dailyRes.staleReasonAr,
        error: dailyRes.error
      });
      const tech = techSafe.result || null;

      const fund = FundamentalAnalysisEngine.getFinancials(ticker, stock.currentPrice);
      const fair = FairValueValuationEngine.calculate(
        ticker,
        stock.currentPrice,
        fund.ratios.peRatio,
        fund.ratios.pbRatio,
        fund.ratios.dividendYield,
        fund.ratios.roe,
        fund.ratios.eps,
        fund.ratios.bookValuePerShare
      );
      const upcomingEvents = NewsDisclosureService.getUpcomingEvents();
      const multiSource = MarketDataService.compareMultiSources(ticker, tvSnapshot, dailyRes);

      const aiDecision = await AiRecommendationEngine.analyze(
        stock,
        tech,
        fund,
        fair,
        newsRes.news,
        {
          techErrorAr: techSafe.reasonAr,
          discrepancyNoticeAr: multiSource.notesAr
        }
      );

      const peers = EGX_STOCKS_UNIVERSE
        .filter(s => s.sectorAr === stock.sectorAr && s.ticker !== stock.ticker)
        .slice(0, 4)
        .map(p => {
          const pFund = FundamentalAnalysisEngine.getFinancials(p.ticker, p.currentPrice);
          return {
            ticker: p.ticker,
            nameAr: p.nameAr,
            currentPrice: p.currentPrice,
            priceDate: p.priceDate || null,
            isStaleQuote: !!p.isStaleQuote,
            peRatio: pFund.ratios.peRatio,
            pbRatio: pFund.ratios.pbRatio,
            roe: pFund.ratios.roe,
            netProfitMargin: pFund.ratios.netProfitMargin
          };
        });

      res.json({
        stock,
        candlesDaily,
        candlesWeekly,
        candlesMonthly,
        candleStatus: {
          dailyReal: dailyRes.isRealData,
          dailyCount: candlesDaily.length,
          dailyLastDate: dailyRes.lastCandleDate,
          dailyIsStale: dailyRes.isStale,
          dailyStaleDays: dailyRes.staleDays,
          dailyStaleReasonAr: dailyRes.staleReasonAr,
          dailyError: dailyRes.error || null,
          weeklyReal: weeklyRes.isRealData,
          monthlyReal: monthlyRes.isRealData
        },
        technicalStatus: {
          available: techSafe.status === 'OK',
          reasonAr: techSafe.reasonAr || dailyRes.error || null
        },
        multiSourceComparison: multiSource,
        technicalAnalysis: tech,
        fundamentalAnalysis: fund,
        fairValueValuation: fair,
        newsDisclosures: newsRes.news,
        newsStatus: {
          online: newsRes.sourceOnline,
          lastFetchedAt: newsRes.lastFetchedAt,
          error: newsRes.error
        },
        upcomingEvents,
        aiDecision,
        peers
      });
    } catch (err: any) {
      console.error('Error analyzing stock:', err?.message || err);
      safeServerError(res, 500, 'Failed to analyze stock');
    }
  });

  // On-demand AI interpretation report
  app.post('/api/stocks/:ticker/ai-report', async (req: Request, res: Response) => {
    try {
      const ticker = normalizeAndValidateTicker(req.params.ticker);
      if (!ticker) {
        res.status(400).json({ error: 'Invalid EGX ticker format' });
        return;
      }
      const stock = getEGXStock(ticker);
      if (!stock) {
        res.status(404).json({ error: `Stock ${ticker} not found` });
        return;
      }

      const [dailyRes, tvSnapshot, newsRes] = await Promise.all([
        MarketDataService.fetchRealHistoricalCandles(ticker, '1D'),
        MarketDataService.fetchTradingViewTechnicalSnapshot(ticker),
        NewsDisclosureService.fetchNewsForTicker(ticker)
      ]);
      const techSafe = TechnicalAnalysisEngine.calculateSafe(dailyRes.candles, tvSnapshot, {
        isRealData: dailyRes.isRealData,
        isStale: dailyRes.isStale,
        staleDays: dailyRes.staleDays,
        staleReasonAr: dailyRes.staleReasonAr,
        error: dailyRes.error
      });
      const tech = techSafe.result || null;
      const fund = FundamentalAnalysisEngine.getFinancials(ticker, stock.currentPrice);
      const fair = FairValueValuationEngine.calculate(
        ticker,
        stock.currentPrice,
        fund.ratios.peRatio,
        fund.ratios.pbRatio,
        fund.ratios.dividendYield,
        fund.ratios.roe,
        fund.ratios.eps,
        fund.ratios.bookValuePerShare
      );
      const multiSource = MarketDataService.compareMultiSources(ticker, tvSnapshot, dailyRes);

      const aiDecision = await AiRecommendationEngine.analyze(
        stock,
        tech,
        fund,
        fair,
        newsRes.news,
        {
          generateFreshAi: true,
          techErrorAr: techSafe.reasonAr,
          discrepancyNoticeAr: multiSource.notesAr
        }
      );

      res.json(aiDecision);
    } catch (err: any) {
      console.error('Error generating fresh AI report:', err?.message || err);
      safeServerError(res, 500, 'Failed to generate AI interpretation report');
    }
  });

  // AI Stock Screener endpoint (null-safe filters + 7 categories + liquidity floor)
  app.get('/api/screener', (req: Request, res: Response) => {
    try {
      const {
        recommendation,
        screenerCategory,
        sector,
        index,
        minScore,
        minUpside,
        maxPe,
        maxRsi,
        minRsi,
        minLiquidity
      } = req.query;

      let results = [...getCachedStockBatches().screenerList];

      if (typeof recommendation === 'string' && recommendation !== 'ALL') {
        results = results.filter(r => r.recommendation === recommendation.toUpperCase());
      }
      if (typeof screenerCategory === 'string' && screenerCategory !== 'ALL') {
        results = results.filter(r => r.screenerCategory === screenerCategory.toUpperCase());
      }
      if (typeof sector === 'string' && sector !== 'ALL') {
        results = results.filter(r => r.sectorAr === sector);
      }
      if (typeof index === 'string' && index !== 'ALL') {
        results = results.filter(r => r.index === index.toUpperCase());
      }
      const minScoreNum = parseFiniteQueryNumber(minScore);
      if (minScoreNum !== null) {
        results = results.filter(r => typeof r.score === 'number' && r.score >= minScoreNum);
      }
      const minUpsideNum = parseFiniteQueryNumber(minUpside);
      if (minUpsideNum !== null) {
        results = results.filter(r => typeof r.fairValueUpsidePct === 'number' && r.fairValueUpsidePct >= minUpsideNum);
      }
      const maxPeNum = parseFiniteQueryNumber(maxPe);
      if (maxPeNum !== null && maxPeNum > 0) {
        results = results.filter(r => typeof r.peRatio === 'number' && r.peRatio > 0 && r.peRatio <= maxPeNum);
      }
      const minRsiNum = parseFiniteQueryNumber(minRsi);
      if (minRsiNum !== null) {
        results = results.filter(r => typeof r.rsi14 === 'number' && r.rsi14 >= minRsiNum);
      }
      const maxRsiNum = parseFiniteQueryNumber(maxRsi);
      if (maxRsiNum !== null) {
        results = results.filter(r => typeof r.rsi14 === 'number' && r.rsi14 <= maxRsiNum);
      }
      const minLiquidityNum = parseFiniteQueryNumber(minLiquidity);
      if (minLiquidityNum !== null && minLiquidityNum >= 0) {
        results = results.filter(r => r.valueTraded >= minLiquidityNum);
      }

      results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      res.json(results);
    } catch {
      safeServerError(res, 500, 'Failed to filter screener stocks');
    }
  });

  // Live Google News RSS endpoint
  app.get('/api/news', async (_req: Request, res: Response) => {
    try {
      const newsRes = await NewsDisclosureService.fetchAllNews();
      const events = NewsDisclosureService.getUpcomingEvents();
      res.json({
        news: newsRes.news,
        events,
        eventsNoteAr: 'لا يتوفر مصدر خارجي معتمد لجدول الجمعيات والكوبونات المستقبلية للبورصة المصرية حالياً، ولذلك لا تعرض المنصة تواريخ تقديرية.',
        sourceOnline: newsRes.sourceOnline,
        lastFetchedAt: newsRes.lastFetchedAt,
        error: newsRes.error
      });
    } catch {
      safeServerError(res, 500, 'Failed to fetch market news');
    }
  });

  // Portfolio endpoints
  app.get('/api/portfolio', (_req: Request, res: Response) => {
    try {
      const port = PortfolioService.getPortfolio();
      res.json(port);
    } catch {
      safeServerError(res, 500, 'Failed to retrieve portfolio');
    }
  });

  app.post('/api/portfolio/add', (req: Request, res: Response) => {
    try {
      const { ticker, shares, buyPrice } = req.body || {};
      const normTicker = normalizeAndValidateTicker(ticker);
      if (!normTicker) {
        res.status(400).json({ error: 'Invalid ticker symbol' });
        return;
      }
      if (!getEGXStock(normTicker)) {
        res.status(404).json({ error: `Stock ${normTicker} not found in EGX universe` });
        return;
      }

      const sharesNum = Number(shares);
      const buyPriceNum = Number(buyPrice);
      if (!Number.isFinite(sharesNum) || sharesNum <= 0 || sharesNum > 100_000_000) {
        res.status(400).json({ error: 'shares must be a finite positive number' });
        return;
      }
      if (!Number.isFinite(buyPriceNum) || buyPriceNum <= 0 || buyPriceNum > 1_000_000) {
        res.status(400).json({ error: 'buyPrice must be a finite positive number' });
        return;
      }

      PortfolioService.addHolding(normTicker, sharesNum, buyPriceNum);
      res.json(PortfolioService.getPortfolio());
    } catch {
      safeServerError(res, 500, 'Failed to add portfolio holding');
    }
  });

  app.post('/api/portfolio/remove', (req: Request, res: Response) => {
    try {
      const normTicker = normalizeAndValidateTicker(req.body?.ticker);
      if (!normTicker) {
        res.status(400).json({ error: 'Invalid or missing ticker symbol' });
        return;
      }
      PortfolioService.removeHolding(normTicker);
      res.json(PortfolioService.getPortfolio());
    } catch {
      safeServerError(res, 500, 'Failed to remove portfolio holding');
    }
  });

  // Recommendation tracking & verifiable walk-forward audit
  app.get('/api/recommendations/history', async (_req: Request, res: Response) => {
    try {
      const audit = await RecommendationHistoryService.getVerifiedAudit();
      res.json(audit);
    } catch {
      safeServerError(res, 500, 'Failed to load recommendation audit');
    }
  });

  // Real-candle Backtesting endpoint
  app.post('/api/backtest', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const rawTicker = body.ticker !== undefined ? normalizeAndValidateTicker(body.ticker) : 'COMI';
      if (!rawTicker) {
        res.status(400).json({ error: 'Invalid ticker format' });
        return;
      }
      const strategyId = typeof body.strategyId === 'string' ? body.strategyId.trim() : 'SWING_TREND_PULLBACK';
      if (!ALLOWED_STRATEGIES.has(strategyId)) {
        res.status(400).json({ error: 'Unsupported strategyId' });
        return;
      }

      const initialCapitalEgp = body.initialCapitalEgp !== undefined ? Number(body.initialCapitalEgp) : 1_000_000;
      if (!Number.isFinite(initialCapitalEgp) || initialCapitalEgp < 1000 || initialCapitalEgp > 1_000_000_000) {
        res.status(400).json({ error: 'initialCapitalEgp must be between 1,000 and 1,000,000,000' });
        return;
      }

      const maxRiskPerTradePct = body.maxRiskPerTradePct !== undefined ? Number(body.maxRiskPerTradePct) : 2.0;
      const commissionPct = body.commissionPct !== undefined ? Number(body.commissionPct) : 0.3;
      const slippagePct = body.slippagePct !== undefined ? Number(body.slippagePct) : 0.1;

      if (
        !Number.isFinite(maxRiskPerTradePct) || maxRiskPerTradePct <= 0 || maxRiskPerTradePct > 10 ||
        !Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 5 ||
        !Number.isFinite(slippagePct) || slippagePct < 0 || slippagePct > 5
      ) {
        res.status(400).json({ error: 'Backtest risk/cost parameters out of valid range' });
        return;
      }

      const result = await BacktestingEngine.runBacktest({
        ...body,
        ticker: rawTicker,
        strategyId,
        initialCapitalEgp,
        maxRiskPerTradePct,
        commissionPct,
        slippagePct
      });
      res.json(result);
    } catch {
      safeServerError(res, 500, 'Failed to execute historical backtest');
    }
  });

  // Data sources and health (with real cached official EGX/CBE/CAPMAS probe)
  app.get('/api/sources/status', async (_req: Request, res: Response) => {
    try {
      await MarketDataService.probeOfficialMacroAndEgxFeeds().catch(() => null);
      const report = SourceIntelligenceService.getReport();
      res.json(report);
    } catch {
      safeServerError(res, 500, 'Failed to read data source status');
    }
  });

  // Watchlist & Alerts
  app.get('/api/watchlist', (_req: Request, res: Response) => {
    try {
      const tickers = WatchlistAlertService.getWatchlist();
      const fullList = tickers.map(t => {
        const stock = getEGXStock(t);
        return stock
          ? {
              ticker: stock.ticker,
              nameAr: stock.nameAr,
              currentPrice: stock.currentPrice,
              changePct:
                stock.prevClose > 0
                  ? Number((((stock.currentPrice - stock.prevClose) / stock.prevClose) * 100).toFixed(2))
                  : 0,
              volume: stock.volume,
              sectorAr: stock.sectorAr,
              priceDate: stock.priceDate || null,
              isLiveQuote: !!stock.isLiveQuote,
              isStaleQuote: !!stock.isStaleQuote
            }
          : { ticker: t, nameAr: t, currentPrice: 0, changePct: 0, volume: 0, sectorAr: '', priceDate: null, isLiveQuote: false, isStaleQuote: true };
      });
      res.json(fullList);
    } catch {
      safeServerError(res, 500, 'Failed to load watchlist');
    }
  });

  app.post('/api/watchlist/toggle', (req: Request, res: Response) => {
    try {
      const norm = normalizeAndValidateTicker(req.body?.ticker);
      if (!norm) {
        res.status(400).json({ error: 'Invalid or missing ticker symbol' });
        return;
      }
      if (!getEGXStock(norm)) {
        res.status(404).json({ error: `Stock ${norm} not found in EGX universe` });
        return;
      }
      const list = WatchlistAlertService.getWatchlist();
      if (list.includes(norm)) {
        WatchlistAlertService.removeFromWatchlist(norm);
      } else {
        WatchlistAlertService.addToWatchlist(norm);
      }
      res.json({ watchlist: WatchlistAlertService.getWatchlist() });
    } catch {
      safeServerError(res, 500, 'Failed to update watchlist');
    }
  });

  app.get('/api/alerts', (_req: Request, res: Response) => {
    try {
      const alerts = WatchlistAlertService.getAlerts();
      res.json(alerts);
    } catch {
      safeServerError(res, 500, 'Failed to load smart alerts');
    }
  });

  app.post('/api/alerts/mark-read', (req: Request, res: Response) => {
    try {
      const id = req.body?.id;
      if (typeof id === 'string' && id.trim().length > 0 && id.length <= 128) {
        WatchlistAlertService.markAsRead(id.trim());
      }
      res.json({ success: true });
    } catch {
      safeServerError(res, 500, 'Failed to mark alert read');
    }
  });

  // AI Financial Analyst Chat (Interprets Verified Platform Data + Google Search Grounding)
  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const { message, history, activeTicker, activeTab, lang } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }
      if (message.trim().length > 2500) {
        res.status(400).json({ error: 'Message exceeds maximum allowed length (2500 chars)' });
        return;
      }

      const validTicker = activeTicker ? normalizeAndValidateTicker(activeTicker) || undefined : undefined;
      const safeLang: 'ar' | 'en' = lang === 'en' ? 'en' : 'ar';

      const result = await AiChatService.chat({
        message: message.trim(),
        history: Array.isArray(history) ? history.slice(-12) : [],
        activeTicker: validTicker,
        activeTab: typeof activeTab === 'string' ? activeTab.slice(0, 40) : undefined,
        lang: safeLang
      });
      res.json(result);
    } catch (err: any) {
      const rawStatus = typeof err?.status === 'number' ? err.status : 500;
      const safeStatus = normalizeProxySafeErrorStatus(rawStatus);
      const safeMessage =
        typeof err?.message === 'string' && err.message.trim().length > 0 && !err.message.includes('{')
          ? err.message
          : 'تعذر معالجة طلب المحلل الذكي حالياً، يرجى إعادة المحاولة.';
      console.warn('AI Chat handled status', safeStatus, ':', safeMessage);
      res.status(safeStatus).json({
        error: safeMessage
      });
    }
  });

  // Guarantee unmatched /api/* routes ALWAYS return JSON 404 (never fall through to Vite/SPA index.html)
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`
    });
  });

  // Guarantee Express middleware errors (e.g. malformed JSON request bodies) return JSON, never HTML
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (req.path.startsWith('/api') || req.headers.accept?.includes('application/json')) {
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: 'Invalid JSON request payload' });
        return;
      }
      if (err?.type === 'entity.too.large') {
        res.status(413).json({ error: 'Request payload exceeds 256kb limit' });
        return;
      }
      console.error('Unhandled API middleware error:', err?.message || err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    next(err);
  });

  return app;
}

async function startServer() {
  const app = createApiApp();
  // In AI Studio Build, the dev server must run on port 3000 (nginx proxy runs on PORT=8080)
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 EGX AI Analyst Server running on http://0.0.0.0:${PORT}`);
    setTimeout(() => {
      LiveMarketSyncService.syncFromProviders().catch(() => {});
      MarketDataService.syncOfficialCbeMacroData().catch(() => {});
      MarketDataService.probeOfficialMacroAndEgxFeeds().catch(() => {});
    }, 300);
    setInterval(() => {
      LiveMarketSyncService.syncFromProviders().catch(() => {});
    }, 5 * 60 * 1000);
    setInterval(() => {
      MarketDataService.syncOfficialCbeMacroData(true).catch(() => {});
    }, 6 * 60 * 60 * 1000);
  });
}

const isExecutedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isExecutedDirectly) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
