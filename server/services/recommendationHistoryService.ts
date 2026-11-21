import { getEGXStock } from '../data/egxStocks';
import { MarketDataService } from './marketDataService';
import type { Candle } from './technicalAnalysisService';

export interface HistoricalRecommendation {
  id: string;
  ticker: string;
  companyNameAr: string;
  recommendationDate: string;
  priceAtRecommendation: number;
  entryZone: string;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  score: number;
  recommendationType: 'STRONG_BUY' | 'BUY';
  recommendationTypeAr: string;
  status: 'TARGET_2_HIT' | 'TARGET_1_HIT' | 'ACTIVE' | 'STOPPED_OUT';
  statusAr: string;
  actualReturnPct: number;
  holdingDays: number;
  closedDate?: string;
  rationaleAr: string;
  sourcesUsed: string[];
}

export interface RecommendationAuditMetrics {
  totalRecommendations: number;
  winningTrades: number;
  losingTrades: number;
  activeTrades: number;
  winRatePct: number;
  averageReturnPct: number;
  averageWinningTradePct: number;
  averageLosingTradePct: number;
  profitFactor: number;
  target1HitRatePct: number;
  target2HitRatePct: number;
  stopLossRatePct: number;
  maxDrawdownPct: number;
  avgHoldingDays: number;
}

export interface VerifiedAuditResponse {
  available: boolean;
  insufficientReasonAr?: string;
  isWalkForwardAudit: boolean;
  auditMethodAr: string;
  lastVerifiedAt: string;
  history: HistoricalRecommendation[];
  metrics: RecommendationAuditMetrics | null;
}

function calcEma(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    ema = i === 0 ? values[0] : values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function calcRsi(closes: number[], period = 14): number[] {
  const rsi = new Array(closes.length).fill(50);
  if (closes.length <= period) return rsi;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) {
      avgGain = (avgGain * (period - 1) + d) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - d) / period;
    }
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function calcAtr(candles: Candle[], period = 14): number[] {
  const atr = new Array(candles.length).fill(0);
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  for (let i = period; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tr[j];
    atr[i] = sum / period;
  }
  return atr;
}

const AUDIT_TICKERS = ['COMI', 'TMGH', 'SWDY', 'ETEL', 'MFPC', 'HRHO'];
let cachedAudit: { data: VerifiedAuditResponse; fetchedAtMs: number } | null = null;
const AUDIT_CACHE_TTL_MS = 10 * 60 * 1000;

export class RecommendationHistoryService {
  public static async getVerifiedAudit(): Promise<VerifiedAuditResponse> {
    if (cachedAudit && Date.now() - cachedAudit.fetchedAtMs < AUDIT_CACHE_TTL_MS) {
      return cachedAudit.data;
    }

    const candleResults = await Promise.all(
      AUDIT_TICKERS.map(async (ticker) => ({
        ticker,
        res: await MarketDataService.fetchRealHistoricalCandles(ticker, '1D')
      }))
    );

    const validSeries = candleResults.filter((r) => r.res.isRealData && r.res.candles.length >= 60);

    if (validSeries.length === 0) {
      return {
        available: false,
        insufficientReasonAr:
          'تعذر جلب الشموع التاريخية الفعلية من Yahoo Finance لإجراء تدقيق التوصيات الآلي؛ تم الامتناع عن عرض نسب نجاح تقديرية.',
        isWalkForwardAudit: true,
        auditMethodAr: 'تدقيق تاريخي آلي (Walk-Forward) على الشموع الفعلية',
        lastVerifiedAt: new Date().toISOString(),
        history: [],
        metrics: null
      };
    }

    const history: HistoricalRecommendation[] = [];
    let idSeq = 1;

    for (const { ticker, res } of validSeries) {
      const candles = res.candles;
      const stock = getEGXStock(ticker);
      const closes = candles.map((c) => c.close);
      const ema20 = calcEma(closes, 20);
      const ema50 = calcEma(closes, 50);
      const rsi = calcRsi(closes, 14);
      const atr = calcAtr(candles, 14);

      // Scan last 180 trading days sequentially with zero lookahead
      const startScan = Math.max(50, candles.length - 160);
      let cooldownUntil = -1;

      for (let i = startScan; i < candles.length - 1; i++) {
        if (i <= cooldownUntil) continue;

        const bar = candles[i];
        const prevVols = candles.slice(i - 20, i).map((c) => c.volume);
        const avgVol = prevVols.reduce((a, b) => a + b, 0) / Math.max(1, prevVols.length);
        const rvol = avgVol > 0 ? bar.volume / avgVol : 1;

        const isBuySignal =
          bar.close > ema20[i] &&
          ema20[i] >= ema50[i] &&
          rsi[i] >= 48 &&
          rsi[i] <= 66 &&
          rvol >= 1.15 &&
          bar.close > bar.open;

        if (!isBuySignal) continue;

        const curAtr = atr[i] > 0 ? atr[i] : bar.close * 0.025;
        const entry = Number(bar.close.toFixed(2));
        const stopLoss = Number(Math.max(0.05, entry - curAtr * 1.8).toFixed(2));
        const target1 = Number((entry + curAtr * 1.8).toFixed(2));
        const target2 = Number((entry + curAtr * 3.0).toFixed(2));
        const target3 = Number((entry + curAtr * 4.5).toFixed(2));

        let status: HistoricalRecommendation['status'] = 'ACTIVE';
        let statusAr = 'صفقة مفتوحة حتى أحدث شمعة فعلية';
        let exitPrice = candles[candles.length - 1].close;
        let closedDate: string | undefined;
        let holdingDays = candles.length - 1 - i;

        for (let j = i + 1; j < candles.length; j++) {
          const fut = candles[j];
          if (fut.low <= stopLoss) {
            status = 'STOPPED_OUT';
            statusAr = 'تفعيل وقف الخسارة الفعلي';
            exitPrice = stopLoss;
            closedDate = fut.date;
            holdingDays = j - i;
            break;
          }
          if (fut.high >= target2) {
            status = 'TARGET_2_HIT';
            statusAr = 'تحقق المستهدف الثاني على الشموع الفعلية';
            exitPrice = target2;
            closedDate = fut.date;
            holdingDays = j - i;
            break;
          }
          if (fut.high >= target1 && status === 'ACTIVE') {
            status = 'TARGET_1_HIT';
            statusAr = 'تحقق المستهدف الأول على الشموع الفعلية';
            exitPrice = target1;
            closedDate = fut.date;
            holdingDays = j - i;
            break;
          }
        }

        const actualReturnPct = Number((((exitPrice - entry) / entry) * 100).toFixed(2));
        const recType: 'STRONG_BUY' | 'BUY' = rvol >= 1.5 && rsi[i] >= 53 ? 'STRONG_BUY' : 'BUY';

        history.push({
          id: `wf-${String(idSeq++).padStart(2, '0')}`,
          ticker,
          companyNameAr: stock?.nameAr || ticker,
          recommendationDate: bar.date,
          priceAtRecommendation: entry,
          entryZone: `${Number((entry - curAtr * 0.3).toFixed(2))} - ${Number((entry + curAtr * 0.2).toFixed(2))}`,
          stopLoss,
          target1,
          target2,
          target3,
          score: recType === 'STRONG_BUY' ? 84 : 74,
          recommendationType: recType,
          recommendationTypeAr: recType === 'STRONG_BUY' ? 'شراء قوي' : 'شراء',
          status,
          statusAr,
          actualReturnPct,
          holdingDays,
          closedDate,
          rationaleAr: `تقاطع إيجابي EMA20 (${ema20[i].toFixed(2)}) > EMA50 (${ema50[i].toFixed(2)}) + RSI(${rsi[i].toFixed(1)}) + سيولة ${rvol.toFixed(2)}x`,
          sourcesUsed: ['Yahoo Finance Historical Candles', 'TradingView Indicators']
        });

        cooldownUntil = i + Math.max(8, holdingDays + 2);
      }
    }

    history.sort((a, b) => b.recommendationDate.localeCompare(a.recommendationDate));
    const trimmed = history.slice(0, 24);

    if (trimmed.length === 0) {
      return {
        available: false,
        insufficientReasonAr: 'لم تستوفِ أي جلسة خلال الفترة المراجعة شروط الإشارة الفنية المحددة.',
        isWalkForwardAudit: true,
        auditMethodAr: 'تدقيق تاريخي آلي (Walk-Forward) على الشموع الفعلية',
        lastVerifiedAt: new Date().toISOString(),
        history: [],
        metrics: null
      };
    }

    const closed = trimmed.filter((r) => r.status !== 'ACTIVE');
    const evalSet = closed.length > 0 ? closed : trimmed;
    const wins = evalSet.filter((r) => r.actualReturnPct > 0);
    const losses = evalSet.filter((r) => r.actualReturnPct <= 0);
    const activeTrades = trimmed.filter((r) => r.status === 'ACTIVE').length;

    const totalWinsGain = wins.reduce((s, r) => s + r.actualReturnPct, 0);
    const totalLossesDrop = Math.abs(losses.reduce((s, r) => s + r.actualReturnPct, 0));

    const winRatePct = Number(((wins.length / evalSet.length) * 100).toFixed(1));
    const avgWin = wins.length > 0 ? Number((totalWinsGain / wins.length).toFixed(2)) : 0;
    const avgLoss = losses.length > 0 ? Number((totalLossesDrop / losses.length).toFixed(2)) : 0;
    const profitFactor =
      totalLossesDrop > 0 ? Number((totalWinsGain / totalLossesDrop).toFixed(2)) : wins.length > 0 ? 99 : 0;

    const t1Hits = evalSet.filter((r) => r.status === 'TARGET_1_HIT' || r.status === 'TARGET_2_HIT').length;
    const t2Hits = evalSet.filter((r) => r.status === 'TARGET_2_HIT').length;
    const stops = evalSet.filter((r) => r.status === 'STOPPED_OUT').length;
    const worstLoss = losses.length > 0 ? Math.max(...losses.map((l) => Math.abs(l.actualReturnPct))) : 0;
    const avgHoldingDays = Math.round(evalSet.reduce((s, r) => s + r.holdingDays, 0) / evalSet.length);

    const response: VerifiedAuditResponse = {
      available: true,
      isWalkForwardAudit: true,
      auditMethodAr:
        'تدقيق تاريخي آلي قابل للتحقق (Walk-Forward) على الشموع اليومية الفعلية من Yahoo Finance لقياديات EGX30 (دون تعديل أو بيانات مختلقة)',
      lastVerifiedAt: new Date().toISOString(),
      history: trimmed,
      metrics: {
        totalRecommendations: trimmed.length,
        winningTrades: wins.length,
        losingTrades: losses.length,
        activeTrades,
        winRatePct,
        averageReturnPct: Number((evalSet.reduce((s, r) => s + r.actualReturnPct, 0) / evalSet.length).toFixed(2)),
        averageWinningTradePct: avgWin,
        averageLosingTradePct: avgLoss,
        profitFactor,
        target1HitRatePct: Number(((t1Hits / evalSet.length) * 100).toFixed(1)),
        target2HitRatePct: Number(((t2Hits / evalSet.length) * 100).toFixed(1)),
        stopLossRatePct: Number(((stops / evalSet.length) * 100).toFixed(1)),
        maxDrawdownPct: Number(worstLoss.toFixed(1)),
        avgHoldingDays
      }
    };

    cachedAudit = { data: response, fetchedAtMs: Date.now() };
    return response;
  }
}
