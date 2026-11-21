import { Candle } from './technicalAnalysisService';
import { EGX_STOCKS_UNIVERSE, getEGXStock } from '../data/egxStocks';
import {
  LiveMarketSyncService,
  DataFreshnessStatus,
  IndexQuote,
  isEgxTradingDay
} from './liveMarketSyncService';
import { parseSafeExternalJson } from '../utils/httpJson';

export const CBE_POLICY_REFERENCE_DATE = '2026-10-29';
export const CAPMAS_INFLATION_REFERENCE_DATE = '2026-10-10';

export interface SourcePriceQuote {
  sourceName: string;
  price: number | null;
  currency: 'EGP' | 'USD';
  timestamp: string | null;
  status: 'LIVE' | 'STALE' | 'FAILED' | 'UNFETCHED';
  statusAr: string;
  latencyMs: number | null;
  error?: string;
}

export interface MultiSourceComparison {
  ticker: string;
  bestPrice: number | null;
  primarySource: string;
  quotes: SourcePriceQuote[];
  hasDiscrepancy: boolean;
  maxDiscrepancyPct: number | null;
  allSourcesFailed: boolean;
  notesAr: string;
}

export interface MarketMoverRow {
  ticker: string;
  nameAr: string;
  sectorAr: string;
  currency: 'EGP' | 'USD';
  currentPrice: number;
  changePct: number;
  volume: number;
  valueTraded: number;
  relativeVolume: number | null;
  priceDate: string | null;
}

export interface MarketMacroOverview {
  egx30: IndexQuote;
  egx70: IndexQuote;
  egx100: IndexQuote;
  totalTurnoverEgp: number | null;
  totalVolume: number | null;
  totalTrades: number | null;
  advancingStocks: number;
  decliningStocks: number;
  unchangedStocks: number;
  syncedStocksCount: number;
  marketBreadthRatio: number | null;
  marketStatusAr: string;
  topGainers: MarketMoverRow[];
  topLosers: MarketMoverRow[];
  topLiquidity: MarketMoverRow[];
  unusualVolumeStocks: MarketMoverRow[];
  cbeData: {
    overnightLendingRate: number;
    overnightDepositRate: number;
    headlineInflationRate: number;
    coreInflationRate: number;
    fxUsdEgpRate: number | null;
    fxStatus: 'LIVE' | 'FAILED' | 'UNSYNCED';
    fxUpdatedAt: string | null;
    foreignReservesBillionUsd: number;
    lastCbeMeetingDate: string;
    capmasReferenceDate: string;
    isMacroReferenceOnly: boolean;
    macroNoteAr: string;
  };
  dataStatus: {
    freshnessStatus: DataFreshnessStatus;
    tradingViewOnline: boolean;
    indicesOnline: boolean;
    hasAttemptedSync: boolean;
    lastSyncedAt: string | null;
    lastSyncAttemptAt: string | null;
    indicesLastSyncedAt: string | null;
    lastSyncError: string | null;
    indicesSyncError: string | null;
    dataAgeMinutes: number | null;
    referenceSnapshotDate: string;
    actualLastSessionDate: string;
    isStale: boolean;
    staleNoticeAr: string | null;
  };
  lastMarketSessionDate: string;
  lastSyncedAt: string | null;
  totalListedStocksCount: number;
  isMarketOpenNow: boolean;
}

export interface TradingViewChartSnapshot {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  recommendAll: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  atr14: number | null;
  adx: number | null;
  adxPlusDI: number | null;
  adxMinusDI: number | null;
  stochK: number | null;
  stochD: number | null;
  mom: number | null;
  pivotClassic: {
    s3: number | null;
    s2: number | null;
    s1: number | null;
    p: number | null;
    r1: number | null;
    r2: number | null;
    r3: number | null;
  };
  pivotFib: {
    s2: number | null;
    s1: number | null;
    p: number | null;
    r1: number | null;
    r2: number | null;
  };
  high1M: number | null;
  low1M: number | null;
  high3M: number | null;
  low3M: number | null;
  high52W: number | null;
  low52W: number | null;
  fetchedAt: string;
}

export interface HistoricalCandlesResult {
  candles: Candle[];
  isRealData: boolean;
  lastCandleDate: string | null;
  firstCandleDate: string | null;
  isStale: boolean;
  staleDays: number | null;
  staleReasonAr: string | null;
  fetchedAt: string | null;
  error: string | null;
  sourceName: string;
  anomalyWarnings?: string[];
  rejectedBarsCount?: number;
}

export interface OfficialProbeStatus {
  egx: { reachable: boolean; statusCode: number | null; latencyMs: number | null; lastCheckedAt: string | null; error: string | null };
  cbe: { reachable: boolean; statusCode: number | null; latencyMs: number | null; lastCheckedAt: string | null; error: string | null };
  capmas: { reachable: boolean; statusCode: number | null; latencyMs: number | null; lastCheckedAt: string | null; error: string | null };
}

export interface CbeParsedMacroData {
  overnightDepositRate: number | null;
  overnightLendingRate: number | null;
  headlineInflationRate: number | null;
  coreInflationRate: number | null;
  foreignReservesBillionUsd: number | null;
  reservesDateText: string | null;
}

const realCandleCache = new Map<string, { result: HistoricalCandlesResult; fetchedAtMs: number }>();
const yahooInFlightMap = new Map<string, Promise<HistoricalCandlesResult>>();
const tvSnapshotCache = new Map<string, { snapshot: TradingViewChartSnapshot; fetchedAtMs: number; error?: string }>();
const tvSnapInFlightMap = new Map<string, Promise<TradingViewChartSnapshot | null>>();

const QUOTES_TTL_MS = 5 * 60 * 1000;       // 5 minutes for TradingView technical snapshot
const OHLCV_TTL_MS = 15 * 60 * 1000;       // 15 minutes for historical OHLCV bars
const PROBE_TTL_MS = 20 * 60 * 1000;       // 20 minutes for EGX/CBE/CAPMAS connectivity probe
const CBE_MACRO_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours for official CBE macro page

const yahooFeedStatus: {
  tested: boolean;
  online: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  totalAttempts: number;
  successfulAttempts: number;
  successRatePct: number;
  updatedSymbols: Set<string>;
} = {
  tested: false,
  online: false,
  lastSuccessAt: null,
  lastError: null,
  lastLatencyMs: null,
  totalAttempts: 0,
  successfulAttempts: 0,
  successRatePct: 0,
  updatedSymbols: new Set<string>()
};

const tvHistoryFallbackStatus: {
  usedCount: number;
  lastSuccessAt: string | null;
  lastLatencyMs: number | null;
  updatedSymbols: Set<string>;
} = {
  usedCount: 0,
  lastSuccessAt: null,
  lastLatencyMs: null,
  updatedSymbols: new Set<string>()
};

const cbeMacroState: {
  liveSynced: boolean;
  lastFetchedMs: number;
  lastFetchedAt: string | null;
  latencyMs: number | null;
  lastError: string | null;
  overnightDepositRate: number;
  overnightLendingRate: number;
  headlineInflationRate: number;
  coreInflationRate: number;
  foreignReservesBillionUsd: number;
  policyDateLabel: string;
  capmasDateLabel: string;
} = {
  liveSynced: false,
  lastFetchedMs: 0,
  lastFetchedAt: null,
  latencyMs: null,
  lastError: null,
  overnightDepositRate: 20.0,
  overnightLendingRate: 21.0,
  headlineInflationRate: 12.7,
  coreInflationRate: 13.1,
  foreignReservesBillionUsd: 57.5,
  policyDateLabel: CBE_POLICY_REFERENCE_DATE,
  capmasDateLabel: CAPMAS_INFLATION_REFERENCE_DATE
};

let cbeInFlightPromise: Promise<void> | null = null;

const officialProbeState: OfficialProbeStatus & { lastProbeMs: number } = {
  lastProbeMs: 0,
  egx: { reachable: false, statusCode: null, latencyMs: null, lastCheckedAt: null, error: 'لم يتم الفحص بعد' },
  cbe: { reachable: false, statusCode: null, latencyMs: null, lastCheckedAt: null, error: 'لم يتم الفحص بعد' },
  capmas: { reachable: false, statusCode: null, latencyMs: null, lastCheckedAt: null, error: 'لم يتم الفحص بعد' }
};

/**
 * Parses official CBE SSR HTML (`https://www.cbe.org.eg/en`) to extract live policy rates,
 * core & CAPMAS headline inflation, and net international reserves.
 */
export function parseCbeMacroHtml(html: string): CbeParsedMacroData {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  const matchRate = (pattern: RegExp, min = 0.5, max = 95): number | null => {
    const m = plain.match(pattern);
    if (!m?.[1]) return null;
    const val = Number(m[1]);
    return Number.isFinite(val) && val >= min && val <= max ? Number(val.toFixed(2)) : null;
  };

  const overnightDepositRate = matchRate(/Overnight Deposit Rate\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const overnightLendingRate = matchRate(/Overnight Lending Rate\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const coreInflationRate = matchRate(/CORE INFLATION RATE\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const headlineInflationRate = matchRate(/HEADLINE INFLATION RATE\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);

  let foreignReservesBillionUsd: number | null = null;
  let reservesDateText: string | null = null;
  const resMatch = plain.match(
    /Net International Reserves reached US\$\s*([0-9,]+(?:\.[0-9]+)?)\s*mn(?:\s+at\s+the\s+end\s+of\s+[^()]+(?:\([^)]*\))?\s*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4}))?/i
  );
  if (resMatch?.[1]) {
    const millions = Number(resMatch[1].replace(/,/g, ''));
    if (Number.isFinite(millions) && millions > 5000 && millions < 300000) {
      foreignReservesBillionUsd = Number((millions / 1000).toFixed(2));
    }
  }
  const datePart = resMatch?.[2] || plain.match(/Net International Reserves[\s\S]{0,160}?([0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i)?.[1];
  if (datePart) {
    const parsed = new Date(`${datePart} UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      reservesDateText = parsed.toISOString().split('T')[0];
    }
  }

  return {
    overnightDepositRate,
    overnightLendingRate,
    headlineInflationRate,
    coreInflationRate,
    foreignReservesBillionUsd,
    reservesDateText
  };
}

/**
 * Decodes TradingView WebSocket socket.io-style length-prefixed frames (~m~LEN~m~PAYLOAD).
 */
export function parseTradingViewChartFrames(raw: string): any[] {
  const frames: any[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw.slice(i, i + 3) !== '~m~') break;
    i += 3;
    const next = raw.indexOf('~m~', i);
    if (next === -1) break;
    const len = Number(raw.slice(i, next));
    if (!Number.isFinite(len) || len <= 0) break;
    i = next + 3;
    const payload = raw.slice(i, i + len);
    i += len;
    if (!payload.startsWith('~h~')) {
      try {
        frames.push(JSON.parse(payload));
      } catch {
        // skip non-JSON frame
      }
    }
  }
  return frames;
}

/**
 * Computes actual Egyptian trading sessions between two YYYY-MM-DD dates (skipping Fri/Sat & EGYPT_PUBLIC_HOLIDAYS).
 */
export function computeBusinessDaysBetween(olderDateStr: string, newerDateStr: string): number {
  const older = new Date(`${olderDateStr}T12:00:00Z`);
  const newer = new Date(`${newerDateStr}T12:00:00Z`);
  if (Number.isNaN(older.getTime()) || Number.isNaN(newer.getTime()) || newer <= older) return 0;

  let count = 0;
  const cursor = new Date(older.getTime());
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  for (let guard = 0; guard < 1200 && cursor <= newer; guard++) {
    const iso = cursor.toISOString().split('T')[0];
    if (isEgxTradingDay(iso)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Validates and cleans historical OHLCV bars from Yahoo Finance:
 * - Rejects negative/zero O/H/L/C, high < low, negative volume
 * - Flags extreme unadjusted jump bars (> 35% daily gap without split context)
 */
export function validateHistoricalCandles(rawCandles: Candle[]): {
  candles: Candle[];
  rejectedBarsCount: number;
  anomalyWarnings: string[];
} {
  const cleaned: Candle[] = [];
  let rejectedBarsCount = 0;
  const anomalyWarnings: string[] = [];

  for (const bar of rawCandles) {
    if (
      !bar ||
      typeof bar.date !== 'string' ||
      !Number.isFinite(bar.open) || bar.open <= 0 ||
      !Number.isFinite(bar.high) || bar.high <= 0 ||
      !Number.isFinite(bar.low) || bar.low <= 0 ||
      !Number.isFinite(bar.close) || bar.close <= 0 ||
      bar.high < bar.low ||
      !Number.isFinite(bar.volume) || bar.volume < 0
    ) {
      rejectedBarsCount++;
      continue;
    }

    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      const jumpPct = Math.abs((bar.close - prev.close) / prev.close) * 100;
      if (jumpPct > 35) {
        anomalyWarnings.push(
          `قفزة سعرية غير اعتيادية (${jumpPct.toFixed(1)}%) في شمعة ${bar.date} — يُحتمل وجود تجزئة سهم أو توزيع مجاني غير معدل`
        );
      }
    }

    cleaned.push(bar);
  }

  return { candles: cleaned, rejectedBarsCount, anomalyWarnings };
}

const TV_SNAPSHOT_COLUMNS = [
  'name', 'close', 'open', 'high', 'low', 'volume',
  'Recommend.All', 'RSI', 'MACD.macd', 'MACD.signal',
  'EMA10', 'EMA20', 'EMA50', 'EMA100', 'EMA200',
  'SMA20', 'SMA50', 'SMA200', 'BB.upper', 'BB.lower', 'ATR',
  'ADX', 'ADX+DI', 'ADX-DI', 'Stoch.K', 'Stoch.D', 'Mom',
  'Pivot.M.Classic.S3', 'Pivot.M.Classic.S2', 'Pivot.M.Classic.S1',
  'Pivot.M.Classic.Middle', 'Pivot.M.Classic.R1', 'Pivot.M.Classic.R2', 'Pivot.M.Classic.R3',
  'Pivot.M.Fibonacci.S2', 'Pivot.M.Fibonacci.S1', 'Pivot.M.Fibonacci.Middle',
  'Pivot.M.Fibonacci.R1', 'Pivot.M.Fibonacci.R2',
  'High.1M', 'Low.1M', 'High.3M', 'Low.3M',
  'price_52_week_high', 'price_52_week_low'
] as const;

const TV_SNAP_IDX = new Map<string, number>(TV_SNAPSHOT_COLUMNS.map((c, i) => [c, i]));

export class MarketDataService {
  public static getYahooFeedHealth() {
    return {
      tested: yahooFeedStatus.tested,
      online: yahooFeedStatus.online,
      lastSuccessAt: yahooFeedStatus.lastSuccessAt,
      lastError: yahooFeedStatus.lastError,
      lastLatencyMs: yahooFeedStatus.lastLatencyMs,
      totalAttempts: yahooFeedStatus.totalAttempts,
      successfulAttempts: yahooFeedStatus.successfulAttempts,
      successRatePct: yahooFeedStatus.successRatePct,
      updatedStocksCount: yahooFeedStatus.updatedSymbols.size,
      tvFallbackCount: tvHistoryFallbackStatus.usedCount,
      tvFallbackSymbolsCount: tvHistoryFallbackStatus.updatedSymbols.size,
      tvFallbackLastLatencyMs: tvHistoryFallbackStatus.lastLatencyMs
    };
  }

  public static getCbeMacroFeedHealth() {
    return { ...cbeMacroState };
  }

  public static getOfficialProbeStatus(): OfficialProbeStatus {
    return {
      egx: { ...officialProbeState.egx },
      cbe: { ...officialProbeState.cbe },
      capmas: { ...officialProbeState.capmas }
    };
  }

  public static async syncOfficialCbeMacroData(force = false): Promise<void> {
    if (!force && cbeMacroState.liveSynced && Date.now() - cbeMacroState.lastFetchedMs < CBE_MACRO_TTL_MS) {
      return;
    }
    if (cbeInFlightPromise) return cbeInFlightPromise;

    cbeInFlightPromise = (async () => {
      const start = Date.now();
      const nowIso = new Date().toISOString();
      try {
        const res = await fetch('https://www.cbe.org.eg/en', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          signal: AbortSignal.timeout(6500)
        });
        const latencyMs = Math.max(15, Date.now() - start);
        const html = await res.text();
        if (!res.ok || /Request Rejected|Access Denied/i.test(html)) {
          throw new Error(`رفض خادم البنك المركزي الطلب (${res.status})`);
        }
        const parsed = parseCbeMacroHtml(html);
        if (parsed.overnightDepositRate === null || parsed.overnightLendingRate === null) {
          throw new Error('لم يتطابق هيكل صفحة البنك المركزي مع مؤشرات الفائدة الرسمية');
        }

        cbeMacroState.liveSynced = true;
        cbeMacroState.lastFetchedMs = Date.now();
        cbeMacroState.lastFetchedAt = nowIso;
        cbeMacroState.latencyMs = latencyMs;
        cbeMacroState.lastError = null;
        cbeMacroState.overnightDepositRate = parsed.overnightDepositRate;
        cbeMacroState.overnightLendingRate = parsed.overnightLendingRate;
        if (parsed.coreInflationRate !== null) cbeMacroState.coreInflationRate = parsed.coreInflationRate;
        if (parsed.headlineInflationRate !== null) cbeMacroState.headlineInflationRate = parsed.headlineInflationRate;
        if (parsed.foreignReservesBillionUsd !== null) cbeMacroState.foreignReservesBillionUsd = parsed.foreignReservesBillionUsd;
        if (parsed.reservesDateText) {
          cbeMacroState.policyDateLabel = parsed.reservesDateText;
          cbeMacroState.capmasDateLabel = parsed.reservesDateText;
        } else {
          const todayCairo = nowIso.split('T')[0];
          cbeMacroState.policyDateLabel = todayCairo;
          cbeMacroState.capmasDateLabel = todayCairo;
        }

        officialProbeState.cbe = {
          reachable: true,
          statusCode: res.status,
          latencyMs,
          lastCheckedAt: nowIso,
          error: null
        };
      } catch (err: any) {
        cbeMacroState.liveSynced = false;
        cbeMacroState.lastError = err?.message || 'تعذر جلب بيانات البنك المركزي المباشرة';
        officialProbeState.cbe = {
          reachable: false,
          statusCode: null,
          latencyMs: Math.max(15, Date.now() - start),
          lastCheckedAt: nowIso,
          error: cbeMacroState.lastError
        };
      } finally {
        cbeInFlightPromise = null;
      }
    })();

    return cbeInFlightPromise;
  }

  public static async probeOfficialMacroAndEgxFeeds(force = false): Promise<OfficialProbeStatus> {
    if (!force && Date.now() - officialProbeState.lastProbeMs < PROBE_TTL_MS) {
      return this.getOfficialProbeStatus();
    }
    officialProbeState.lastProbeMs = Date.now();
    const nowIso = new Date().toISOString();

    const checkOne = async (url: string, labelAr: string) => {
      const start = Date.now();
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(4500)
        });
        const latencyMs = Math.max(15, Date.now() - start);
        const body = await res.text();
        if (!res.ok || /Request Rejected|Access Denied/i.test(body)) {
          return {
            reachable: false,
            statusCode: res.status,
            latencyMs,
            lastCheckedAt: nowIso,
            error: `رفض الخادم الوصول الآلي (${res.status} / WAF Protection) — ${labelAr}`
          };
        }
        if (/window\.|no-cache|CacheControl/i.test(body) && body.length < 15000) {
          return {
            reachable: false,
            statusCode: res.status,
            latencyMs,
            lastCheckedAt: nowIso,
            error: `بوابة حماية Anti-Bot JS Challenge (${res.status}) تمنع الجلب الآلي بدون ترخيص EGX`
          };
        }
        return {
          reachable: false,
          statusCode: res.status,
          latencyMs,
          lastCheckedAt: nowIso,
          error: `بوابة ويب HTML فقط بدون واجهة JSON/RSS رسمية مفتوحة للربط الآلي`
        };
      } catch (err: any) {
        return {
          reachable: false,
          statusCode: null,
          latencyMs: Math.max(15, Date.now() - start),
          lastCheckedAt: nowIso,
          error: `تعذر الوصول من بيئة التشغيل (${err?.message || 'Network/DNS block'})`
        };
      }
    };

    const [egxRes, , capmasRes] = await Promise.all([
      checkOne('https://www.egx.com.eg/ar/news.aspx', 'إفصاحات البورصة المصرية'),
      this.syncOfficialCbeMacroData(force),
      checkOne('https://www.capmas.gov.eg/', 'الجهاز المركزي للتعبئة العامة والإحصاء')
    ]);

    officialProbeState.egx = egxRes;
    officialProbeState.capmas = cbeMacroState.liveSynced
      ? {
          reachable: true,
          statusCode: 200,
          latencyMs: cbeMacroState.latencyMs,
          lastCheckedAt: cbeMacroState.lastFetchedAt || nowIso,
          error: null
        }
      : capmasRes;
    return this.getOfficialProbeStatus();
  }

  public static getMarketOverview(): MarketMacroOverview {
    const live = LiveMarketSyncService.getLiveState();
    const sessionDate = LiveMarketSyncService.getLatestEgxSessionDate();

    let advancing = 0;
    let declining = 0;
    let unchanged = 0;
    let totalTurnoverEgp = 0;
    let totalVolume = 0;
    let totalTrades = 0;
    let syncedCount = 0;

    const fxForConversion = live.fxUsdEgp ?? 50;
    const syncedMovers: MarketMoverRow[] = [];

    for (const stock of EGX_STOCKS_UNIVERSE) {
      if (!stock.syncedFromLive) continue;
      syncedCount++;
      const diff = stock.currentPrice - stock.prevClose;
      if (diff > 0.0001) advancing++;
      else if (diff < -0.0001) declining++;
      else unchanged++;
      totalTurnoverEgp += stock.currency === 'USD' ? stock.valueTraded * fxForConversion : stock.valueTraded;
      totalVolume += stock.volume;
      totalTrades += stock.tradesCount;

      const changePct =
        stock.prevClose > 0
          ? Number((((stock.currentPrice - stock.prevClose) / stock.prevClose) * 100).toFixed(2))
          : 0;

      syncedMovers.push({
        ticker: stock.ticker,
        nameAr: stock.nameAr,
        sectorAr: stock.sectorAr,
        currency: stock.currency,
        currentPrice: stock.currentPrice,
        changePct,
        volume: stock.volume,
        valueTraded: stock.valueTraded,
        relativeVolume: stock.tvRelVol ?? null,
        priceDate: stock.priceDate ?? null
      });
    }

    const topGainers = [...syncedMovers]
      .filter((m) => m.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 5);
    const topLosers = [...syncedMovers]
      .filter((m) => m.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 5);
    const topLiquidity = [...syncedMovers]
      .sort((a, b) => b.valueTraded - a.valueTraded)
      .slice(0, 5);
    const unusualVolumeStocks = [...syncedMovers]
      .filter((m) => typeof m.relativeVolume === 'number' && m.relativeVolume >= 1.5 && m.valueTraded >= 1_000_000)
      .sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0))
      .slice(0, 6);

    const breadthRatio =
      syncedCount === 0
        ? null
        : declining > 0
        ? Number((advancing / declining).toFixed(2))
        : Number(advancing.toFixed(2));

    let marketStatusAr = 'في انتظار مزامنة بيانات السوق الحية';
    if (!live.hasAttemptedSync) {
      marketStatusAr = 'جاري تهيئة الاتصال بمصدر الأسعار...';
    } else if (!live.tradingViewOnline && live.lastSyncError) {
      marketStatusAr = 'تنبيه: تعذر تحديث أسعار السوق المباشرة';
    } else if (breadthRatio !== null) {
      const egx30Chg = live.egx30.changePct ?? 0;
      const egx70Chg = live.egx70.changePct ?? 0;
      if (breadthRatio >= 1.8 && egx30Chg >= 0.4) {
        marketStatusAr = 'سوق صاعد قوي (Strong Bullish)';
      } else if (breadthRatio >= 1.15 || egx70Chg > 0.2) {
        marketStatusAr = 'سوق صاعد متوازن (Bullish)';
      } else if (breadthRatio < 0.7 && egx30Chg < -0.8) {
        marketStatusAr = 'سوق هابط حذر (Bearish)';
      } else {
        marketStatusAr = 'سوق عرضي محايد (Neutral)';
      }
    }

    const isStale = live.dataFreshnessStatus === 'STALE';
    let staleNoticeAr: string | null = null;
    if (live.dataFreshnessStatus === 'FAILED') {
      staleNoticeAr = `فشل الاتصال بمزود الأسعار المباشر: ${live.lastSyncError || 'خطأ شبكة'}. ${
        live.lastSyncedAt
          ? `آخر بيانات سابقة محفوظة بتاريخ ${live.lastSyncedAt.replace('T', ' ').substring(0, 16)} (موقوفة عن إصدار توصيات شراء).`
          : 'لا تتوفر أسعار محدثة حالياً.'
      }`;
    } else if (isStale && live.lastSyncedAt) {
      staleNoticeAr = `البيانات قديمة ولم تُحدث منذ ${live.dataAgeMinutes} دقيقة — آخر جلسة فعلية ${live.actualLastSessionDate}.`;
    }

    return {
      egx30: live.egx30,
      egx70: live.egx70,
      egx100: live.egx100,
      totalTurnoverEgp: syncedCount > 0 ? Math.round(totalTurnoverEgp) : null,
      totalVolume: syncedCount > 0 ? Math.round(totalVolume) : null,
      totalTrades: syncedCount > 0 ? totalTrades : null,
      advancingStocks: advancing,
      decliningStocks: declining,
      unchangedStocks: unchanged,
      syncedStocksCount: syncedCount,
      marketBreadthRatio: breadthRatio,
      marketStatusAr,
      topGainers,
      topLosers,
      topLiquidity,
      unusualVolumeStocks,
      cbeData: {
        overnightLendingRate: cbeMacroState.overnightLendingRate,
        overnightDepositRate: cbeMacroState.overnightDepositRate,
        headlineInflationRate: cbeMacroState.headlineInflationRate,
        coreInflationRate: cbeMacroState.coreInflationRate,
        fxUsdEgpRate: live.fxUsdEgp,
        fxStatus: live.fxUsdEgp !== null ? 'LIVE' : live.indicesSyncError ? 'FAILED' : 'UNSYNCED',
        fxUpdatedAt: live.indicesLastSyncedAt,
        foreignReservesBillionUsd: cbeMacroState.foreignReservesBillionUsd,
        lastCbeMeetingDate: cbeMacroState.policyDateLabel,
        capmasReferenceDate: cbeMacroState.capmasDateLabel,
        isMacroReferenceOnly: !cbeMacroState.liveSynced,
        macroNoteAr: cbeMacroState.liveSynced
          ? `تمت مزامنة الفائدة والاحتياطي والتضخم العام (CAPMAS) والتضخم الأساسي آلياً من الموقع الرسمي للبنك المركزي المصري (تحديث ${cbeMacroState.policyDateLabel}).`
          : `أسعار الفائدة (CBE ${CBE_POLICY_REFERENCE_DATE}) ومعدل التضخم (CAPMAS ${CAPMAS_INFLATION_REFERENCE_DATE}) بيانات مرجعية مؤرخة وليست بثاً آلياً؛ سعر الصرف USD/EGP من المزود الحي.`
      },
      dataStatus: {
        freshnessStatus: live.dataFreshnessStatus,
        tradingViewOnline: live.tradingViewOnline,
        indicesOnline: live.indicesOnline,
        hasAttemptedSync: live.hasAttemptedSync,
        lastSyncedAt: live.lastSyncedAt,
        lastSyncAttemptAt: live.lastSyncAttemptAt,
        indicesLastSyncedAt: live.indicesLastSyncedAt,
        lastSyncError: live.lastSyncError,
        indicesSyncError: live.indicesSyncError,
        dataAgeMinutes: live.dataAgeMinutes,
        referenceSnapshotDate: live.referenceSnapshotDate,
        actualLastSessionDate: live.actualLastSessionDate,
        isStale,
        staleNoticeAr
      },
      lastMarketSessionDate: sessionDate,
      lastSyncedAt: live.lastSyncedAt,
      totalListedStocksCount: EGX_STOCKS_UNIVERSE.length,
      isMarketOpenNow: LiveMarketSyncService.isEgxMarketOpenNow()
    };
  }

  public static async fetchTradingViewTechnicalSnapshot(ticker: string): Promise<TradingViewChartSnapshot | null> {
    const stock = getEGXStock(ticker);
    if (!stock) return null;

    const tvCode = (stock.tvTicker || stock.ticker).toUpperCase();
    const symbol = `EGX:${tvCode}`;
    const cached = tvSnapshotCache.get(symbol);
    if (cached && Date.now() - cached.fetchedAtMs < QUOTES_TTL_MS && !cached.error) {
      return cached.snapshot;
    }

    const existing = tvSnapInFlightMap.get(symbol);
    if (existing) return existing;

    const promise = (async (): Promise<TradingViewChartSnapshot | null> => {
      const colVal = (d: unknown[], col: (typeof TV_SNAPSHOT_COLUMNS)[number]): number | null => {
        const idx = TV_SNAP_IDX.get(col);
        if (idx === undefined || idx >= d.length) return null;
        const v = d[idx];
        return typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(4)) : null;
      };

      try {
        const res = await fetch('https://scanner.tradingview.com/egypt/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5500),
          body: JSON.stringify({
            symbols: { tickers: [symbol] },
            columns: [...TV_SNAPSHOT_COLUMNS]
          })
        });

        if (!res.ok) return null;
        const json: any = await parseSafeExternalJson(res, 'TradingView Snapshot');
        const row = json?.data?.[0];
        const d = row?.d;
        if (!Array.isArray(d)) return null;

        const closeVal = colVal(d, 'close');
        if (closeVal === null || closeVal <= 0) return null;

        const openVal = colVal(d, 'open');
        const highVal = colVal(d, 'high');
        const lowVal = colVal(d, 'low');
        if (highVal !== null && lowVal !== null && highVal < lowVal) return null;

        const nowIso = new Date().toISOString();
        const volRaw = colVal(d, 'volume');
        const snapshot: TradingViewChartSnapshot = {
          symbol: typeof row?.s === 'string' ? row.s : symbol,
          close: closeVal,
          open: openVal && openVal > 0 ? openVal : closeVal,
          high: highVal && highVal > 0 ? highVal : closeVal,
          low: lowVal && lowVal > 0 ? lowVal : closeVal,
          volume: volRaw !== null && volRaw >= 0 ? Math.round(volRaw) : 0,
          recommendAll: colVal(d, 'Recommend.All'),
          rsi14: colVal(d, 'RSI'),
          macd: colVal(d, 'MACD.macd'),
          macdSignal: colVal(d, 'MACD.signal'),
          ema9: colVal(d, 'EMA10'),
          ema20: colVal(d, 'EMA20'),
          ema50: colVal(d, 'EMA50'),
          ema100: colVal(d, 'EMA100'),
          ema200: colVal(d, 'EMA200'),
          sma20: colVal(d, 'SMA20'),
          sma50: colVal(d, 'SMA50'),
          sma200: colVal(d, 'SMA200'),
          bbUpper: colVal(d, 'BB.upper'),
          bbLower: colVal(d, 'BB.lower'),
          atr14: colVal(d, 'ATR'),
          adx: colVal(d, 'ADX'),
          adxPlusDI: colVal(d, 'ADX+DI'),
          adxMinusDI: colVal(d, 'ADX-DI'),
          stochK: colVal(d, 'Stoch.K'),
          stochD: colVal(d, 'Stoch.D'),
          mom: colVal(d, 'Mom'),
          pivotClassic: {
            s3: colVal(d, 'Pivot.M.Classic.S3'),
            s2: colVal(d, 'Pivot.M.Classic.S2'),
            s1: colVal(d, 'Pivot.M.Classic.S1'),
            p: colVal(d, 'Pivot.M.Classic.Middle'),
            r1: colVal(d, 'Pivot.M.Classic.R1'),
            r2: colVal(d, 'Pivot.M.Classic.R2'),
            r3: colVal(d, 'Pivot.M.Classic.R3')
          },
          pivotFib: {
            s2: colVal(d, 'Pivot.M.Fibonacci.S2'),
            s1: colVal(d, 'Pivot.M.Fibonacci.S1'),
            p: colVal(d, 'Pivot.M.Fibonacci.Middle'),
            r1: colVal(d, 'Pivot.M.Fibonacci.R1'),
            r2: colVal(d, 'Pivot.M.Fibonacci.R2')
          },
          high1M: colVal(d, 'High.1M'),
          low1M: colVal(d, 'Low.1M'),
          high3M: colVal(d, 'High.3M'),
          low3M: colVal(d, 'Low.3M'),
          high52W: colVal(d, 'price_52_week_high'),
          low52W: colVal(d, 'price_52_week_low'),
          fetchedAt: nowIso
        };

        // Update stock record safely without overwriting existing non-null fields on missing snapshot values
        stock.currentPrice = Number(snapshot.close.toFixed(3));
        if (snapshot.open > 0) stock.openPrice = Number(snapshot.open.toFixed(3));
        if (snapshot.high > 0) stock.highPrice = Number(snapshot.high.toFixed(3));
        if (snapshot.low > 0) stock.lowPrice = Number(snapshot.low.toFixed(3));
        if (snapshot.volume > 0) stock.volume = snapshot.volume;
        if (snapshot.rsi14 !== null) stock.tvRsi = Number(snapshot.rsi14.toFixed(2));
        if (snapshot.ema20 !== null) stock.tvEma20 = Number(snapshot.ema20.toFixed(2));
        if (snapshot.ema50 !== null) stock.tvEma50 = Number(snapshot.ema50.toFixed(2));
        if (snapshot.ema200 !== null) stock.tvEma200 = Number(snapshot.ema200.toFixed(2));
        if (snapshot.atr14 !== null) {
          stock.tvAtr14 = Number(snapshot.atr14.toFixed(2));
          stock.tvAtr = stock.tvAtr14;
        }
        if (snapshot.recommendAll !== null) stock.tvRecommendAll = Number(snapshot.recommendAll.toFixed(3));
        stock.syncedFromLive = true;
        stock.isLiveQuote = true;
        stock.isStaleQuote = false;
        stock.dataSource = 'TRADINGVIEW_LIVE';
        stock.priceDate = LiveMarketSyncService.getLatestEgxSessionDate();
        stock.receivedAt = nowIso;
        stock.lastSyncedAt = nowIso;

        tvSnapshotCache.set(symbol, { snapshot, fetchedAtMs: Date.now() });
        return snapshot;
      } catch {
        return null;
      } finally {
        tvSnapInFlightMap.delete(symbol);
      }
    })();

    tvSnapInFlightMap.set(symbol, promise);
    return promise;
  }

  public static getCachedRealCandles(
    ticker: string,
    timeframe: '1D' | '1W' | '1M' = '1D'
  ): HistoricalCandlesResult | null {
    const stock = getEGXStock(ticker);
    if (!stock) return null;
    const cached = realCandleCache.get(`${stock.ticker}:${timeframe}`);
    return cached ? cached.result : null;
  }

  /**
   * Real historical OHLCV fallback via TradingView Chart WebSocket (`EGX:TICKER`, split-adjusted)
   * when Yahoo Finance `.CA` does not list an EGX ticker (e.g., AMII and several EGX70/100 stocks).
   */
  public static async fetchTradingViewChartCandles(
    tvSymbol: string,
    timeframe: '1D' | '1W' | '1M' = '1D'
  ): Promise<{ candles: Candle[]; latencyMs: number; error: string | null }> {
    const start = Date.now();
    if (typeof WebSocket === 'undefined') {
      return { candles: [], latencyMs: 0, error: 'WebSocket غير مدعوم في بيئة التشغيل' };
    }

    const barCount = timeframe === '1D' ? 260 : timeframe === '1W' ? 160 : 60;
    const resolution = timeframe === '1D' ? '1D' : timeframe === '1W' ? '1W' : '1M';

    return new Promise((resolve) => {
      let settled = false;
      const done = (candles: Candle[], error: string | null) => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve({ candles, latencyMs: Math.max(20, Date.now() - start), error });
      };

      const timeout = setTimeout(() => done([], 'انتهت مهلة جلب الشموع التاريخية من TradingView'), 6000);
      let ws: WebSocket;
      try {
        // Node 22 Undici WebSocket supports custom headers via options object
        ws = new (WebSocket as any)('wss://data.tradingview.com/socket.io/websocket', {
          headers: { Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0' }
        });
      } catch (err: any) {
        clearTimeout(timeout);
        done([], err?.message || 'تعذر فتح اتصال WebSocket مع TradingView');
        return;
      }

      const pack = (m: string, p: any[]) => {
        const s = JSON.stringify({ m, p });
        return `~m~${s.length}~m~${s}`;
      };

      ws.onopen = () => {
        const session = `cs_${Math.random().toString(36).slice(2, 10)}`;
        ws.send(pack('set_auth_token', ['unauthorized_user_token']));
        ws.send(pack('chart_create_session', [session, '']));
        ws.send(pack('resolve_symbol', [session, 'sds_sym_1', `={"symbol":"${tvSymbol}","adjustment":"splits"}`]));
        ws.send(pack('create_series', [session, 'sds_1', 's1', 'sds_sym_1', resolution, barCount, '']));
      };

      ws.onmessage = (ev) => {
        const frames = parseTradingViewChartFrames(String(ev.data));
        for (const msg of frames) {
          if (msg?.m === 'symbol_error') {
            clearTimeout(timeout);
            done([], `الرمز ${tvSymbol} غير متاح على TradingView Chart`);
            return;
          }
          if (msg?.m === 'timescale_update') {
            const series = msg?.p?.[1]?.sds_1?.s;
            if (Array.isArray(series) && series.length > 0) {
              const rawBars: Candle[] = [];
              for (const item of series) {
                const v = item?.v;
                if (!Array.isArray(v) || v.length < 6) continue;
                const ts = Number(v[0]);
                const open = Number(v[1]);
                const high = Number(v[2]);
                const low = Number(v[3]);
                const close = Number(v[4]);
                const volume = Number(v[5]);
                if (!Number.isFinite(ts) || ts <= 946684800) continue;
                rawBars.push({
                  date: new Date(ts * 1000).toISOString().split('T')[0],
                  open: Number(open.toFixed(3)),
                  high: Number(high.toFixed(3)),
                  low: Number(low.toFixed(3)),
                  close: Number(close.toFixed(3)),
                  volume: Number.isFinite(volume) && volume >= 0 ? Math.round(volume) : 0
                });
              }
              clearTimeout(timeout);
              done(rawBars, null);
              return;
            }
          }
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        done([], 'خطأ اتصال WebSocket مع TradingView');
      };
    });
  }

  /**
   * Fetches authentic OHLCV candles from Yahoo Finance (.CA) with automatic fallback to
   * TradingView Real Historical OHLCV (`EGX:TICKER`) when Yahoo does not cover an EGX stock (HTTP 404).
   */
  public static async fetchRealHistoricalCandles(
    ticker: string,
    timeframe: '1D' | '1W' | '1M' = '1D'
  ): Promise<HistoricalCandlesResult> {
    const stock = getEGXStock(ticker);
    if (!stock) {
      return {
        candles: [],
        isRealData: false,
        lastCandleDate: null,
        firstCandleDate: null,
        isStale: true,
        staleDays: null,
        staleReasonAr: null,
        fetchedAt: new Date().toISOString(),
        error: `السهم ${ticker} غير موجود في قائمة البورصة المصرية`,
        sourceName: 'Yahoo Finance'
      };
    }

    const cacheKey = `${stock.ticker}:${timeframe}`;
    const cached = realCandleCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAtMs < OHLCV_TTL_MS && cached.result.isRealData) {
      return cached.result;
    }

    const existing = yahooInFlightMap.get(cacheKey);
    if (existing) return existing;

    const promise = (async (): Promise<HistoricalCandlesResult> => {
      const yahooTicker = stock.yahooTicker || `${stock.ticker}.CA`;
      const tvSymbol = `EGX:${(stock.tvTicker || stock.ticker).toUpperCase()}`;
      const range = timeframe === '1D' ? '1y' : timeframe === '1W' ? '3y' : '5y';
      const interval = timeframe === '1D' ? '1d' : timeframe === '1W' ? '1wk' : '1mo';
      const start = Date.now();
      yahooFeedStatus.totalAttempts++;

      let yahooFailureReason = '';
      let isSingleTickerNotFoundOnYahoo = false;

      const tryBuildResult = (
        sortedRaw: Candle[],
        sourceName: string
      ): HistoricalCandlesResult | null => {
        const { candles, rejectedBarsCount, anomalyWarnings } = validateHistoricalCandles(sortedRaw);
        const nowIso = new Date().toISOString();
        if (candles.length < 30) {
          return null;
        }

        const sessionDate = LiveMarketSyncService.getLatestEgxSessionDate();
        const lastBarDate = candles[candles.length - 1].date;
        const staleDays = timeframe === '1D' ? computeBusinessDaysBetween(lastBarDate, sessionDate) : 0;
        const isStale = timeframe === '1D' && staleDays > 2;
        const staleReasonAr = isStale
          ? `أحدث شمعة تاريخية متاحة من ${sourceName} تعود لتاريخ ${lastBarDate} (متأخرة ${staleDays} جلسة تداول عن جلسة ${sessionDate}).`
          : null;

        if (
          timeframe === '1D' &&
          stock.syncedFromLive &&
          !stock.isStaleQuote &&
          stock.currentPrice > 0 &&
          stock.openPrice > 0 &&
          staleDays <= 2
        ) {
          const last = candles[candles.length - 1];
          const liveClose = stock.currentPrice;
          const liveOpen = stock.openPrice;
          const liveHigh = Math.max(stock.highPrice || liveClose, liveOpen, liveClose);
          const liveLow = Math.min(stock.lowPrice > 0 ? stock.lowPrice : liveClose, liveOpen, liveClose);
          const liveVol = stock.volume > 0 ? stock.volume : last.volume;

          if (last.date === sessionDate) {
            candles[candles.length - 1] = {
              date: last.date,
              open: Number(liveOpen.toFixed(3)),
              high: Number(liveHigh.toFixed(3)),
              low: Number(liveLow.toFixed(3)),
              close: Number(liveClose.toFixed(3)),
              volume: liveVol
            };
          } else if (sessionDate > last.date && Math.abs(liveClose - last.close) / last.close < 0.25) {
            candles.push({
              date: sessionDate,
              open: Number(liveOpen.toFixed(3)),
              high: Number(liveHigh.toFixed(3)),
              low: Number(liveLow.toFixed(3)),
              close: Number(liveClose.toFixed(3)),
              volume: liveVol
            });
          }
        }

        return {
          candles,
          isRealData: true,
          lastCandleDate: candles[candles.length - 1].date,
          firstCandleDate: candles[0].date,
          isStale,
          staleDays,
          staleReasonAr,
          fetchedAt: nowIso,
          error: null,
          sourceName,
          anomalyWarnings,
          rejectedBarsCount
        };
      };

      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=${range}&interval=${interval}`;
        let res: Response | null = null;
        let lastErr: any = null;
        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            res = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(6500)
            });
            if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) break;
            lastErr = new Error(`HTTP ${res.status}`);
          } catch (err) {
            lastErr = err;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 350 * Math.pow(3, attempt)));
        }

        if (!res) throw lastErr || new Error('Yahoo network request failed');

        const latency = Math.max(20, Date.now() - start);
        yahooFeedStatus.tested = true;
        yahooFeedStatus.lastLatencyMs = latency;

        if (!res.ok) {
          isSingleTickerNotFoundOnYahoo = res.status === 404;
          throw new Error(`فشل جلب الشموع التاريخية من Yahoo Finance (HTTP ${res.status})`);
        }

        const json: any = await parseSafeExternalJson(res, `Yahoo Finance (${yahooTicker})`);
        const chartErr = json?.chart?.error;
        if (chartErr) {
          isSingleTickerNotFoundOnYahoo = /Not Found/i.test(String(chartErr.code || chartErr.description || ''));
          throw new Error(chartErr.description || chartErr.code || 'Yahoo Finance returned chart error');
        }

        const result = json?.chart?.result?.[0];
        const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
        const quote = result?.indicators?.quote?.[0];

        if (!quote || timestamps.length === 0) {
          isSingleTickerNotFoundOnYahoo = true;
          throw new Error(`لا تتوفر شموع تاريخية حقيقية للرمز ${yahooTicker}`);
        }

        const byDate = new Map<string, Candle>();
        for (let i = 0; i < timestamps.length; i++) {
          const o = quote.open?.[i];
          const h = quote.high?.[i];
          const l = quote.low?.[i];
          const c = quote.close?.[i];
          const v = quote.volume?.[i];

          if (
            typeof c !== 'number' || !Number.isFinite(c) || c <= 0 ||
            typeof o !== 'number' || !Number.isFinite(o) || o <= 0
          ) {
            continue;
          }

          const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
          const open = Number(o.toFixed(3));
          const close = Number(c.toFixed(3));
          const high = Number((typeof h === 'number' && Number.isFinite(h) && h > 0 ? Math.max(h, open, close) : Math.max(open, close)).toFixed(3));
          const low = Number((typeof l === 'number' && Number.isFinite(l) && l > 0 ? Math.min(l, open, close) : Math.min(open, close)).toFixed(3));
          const volume = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;

          byDate.set(date, { date, open, high, low, close, volume });
        }

        const sorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
        const builtYahoo = tryBuildResult(sorted, `Yahoo Finance (${yahooTicker})`);
        if (builtYahoo) {
          yahooFeedStatus.online = true;
          yahooFeedStatus.successfulAttempts++;
          yahooFeedStatus.successRatePct = Math.round((yahooFeedStatus.successfulAttempts / yahooFeedStatus.totalAttempts) * 100);
          yahooFeedStatus.updatedSymbols.add(stock.ticker);
          yahooFeedStatus.lastSuccessAt = builtYahoo.fetchedAt;
          yahooFeedStatus.lastError = null;
          realCandleCache.set(cacheKey, { result: builtYahoo, fetchedAtMs: Date.now() });
          return builtYahoo;
        }

        isSingleTickerNotFoundOnYahoo = true;
        throw new Error(`عدد الشموع على Yahoo Finance لـ ${yahooTicker} أقل من 30 شمعة`);
      } catch (err: any) {
        yahooFailureReason = err?.message || `فشل جلب بيانات الشموع التاريخية لـ ${yahooTicker}`;
        yahooFeedStatus.tested = true;
        if (!isSingleTickerNotFoundOnYahoo) {
          yahooFeedStatus.online = false;
          yahooFeedStatus.lastError = yahooFailureReason;
        }
        yahooFeedStatus.successRatePct = Math.round(
          (yahooFeedStatus.successfulAttempts / Math.max(1, yahooFeedStatus.totalAttempts)) * 100
        );
      }

      // Automatic Fallback -> TradingView Chart Real OHLCV WebSocket
      const tvChart = await this.fetchTradingViewChartCandles(tvSymbol, timeframe);
      if (tvChart.candles.length >= 30) {
        const sortedTv = [...tvChart.candles].sort((a, b) => a.date.localeCompare(b.date));
        const builtTv = tryBuildResult(sortedTv, `TradingView Chart OHLCV (${tvSymbol})`);
        if (builtTv) {
          tvHistoryFallbackStatus.usedCount++;
          tvHistoryFallbackStatus.lastSuccessAt = builtTv.fetchedAt;
          tvHistoryFallbackStatus.lastLatencyMs = tvChart.latencyMs;
          tvHistoryFallbackStatus.updatedSymbols.add(stock.ticker);
          realCandleCache.set(cacheKey, { result: builtTv, fetchedAtMs: Date.now() });
          return builtTv;
        }
      }

      const combinedErr = `${yahooFailureReason}${tvChart.error ? ` | بديل TradingView OHLCV: ${tvChart.error}` : ''}`;
      return {
        candles: [],
        isRealData: false,
        lastCandleDate: null,
        firstCandleDate: null,
        isStale: true,
        staleDays: null,
        staleReasonAr: null,
        fetchedAt: new Date().toISOString(),
        error: combinedErr,
        sourceName: `Yahoo Finance (${yahooTicker}) / TradingView OHLCV (${tvSymbol})`
      };
    })().finally(() => {
      yahooInFlightMap.delete(cacheKey);
    });

    yahooInFlightMap.set(cacheKey, promise);
    return promise;
  }

  /**
   * Honest cross-source price comparison using ONLY actually queried/synced sources.
   */
  public static compareMultiSources(
    ticker: string,
    tvSnapshot?: TradingViewChartSnapshot | null,
    dailyCandlesRes?: HistoricalCandlesResult | null
  ): MultiSourceComparison {
    const stock = getEGXStock(ticker);
    const live = LiveMarketSyncService.getLiveState();

    if (!stock) {
      return {
        ticker,
        bestPrice: null,
        primarySource: 'غير متوفر',
        quotes: [],
        hasDiscrepancy: false,
        maxDiscrepancyPct: null,
        allSourcesFailed: true,
        notesAr: `السهم ${ticker} غير مسجل.`
      };
    }

    const tvPrice = tvSnapshot?.close ?? (stock.syncedFromLive ? stock.currentPrice : null);
    const tvTime = tvSnapshot?.fetchedAt ?? stock.lastSyncedAt ?? live.lastSyncedAt ?? null;
    const tvTimeDisplay = tvTime ? tvTime.replace('T', ' ').substring(0, 19) : null;
    const tvOnline = Boolean(tvSnapshot || (stock.syncedFromLive && live.tradingViewOnline));

    const yahooLastBar =
      dailyCandlesRes?.isRealData && dailyCandlesRes.candles.length > 0
        ? dailyCandlesRes.candles[dailyCandlesRes.candles.length - 1]
        : null;

    const quotes: SourcePriceQuote[] = [
      {
        sourceName: `TradingView EGX Scanner (EGX:${stock.tvTicker || stock.ticker})`,
        price: tvPrice,
        currency: stock.currency,
        timestamp: tvTimeDisplay,
        status:
          tvOnline && tvPrice !== null
            ? live.dataFreshnessStatus === 'STALE' || stock.isStaleQuote
              ? 'STALE'
              : 'LIVE'
            : 'FAILED',
        statusAr:
          tvOnline && tvPrice !== null
            ? live.dataFreshnessStatus === 'STALE' || stock.isStaleQuote
              ? `بيانات سابقة بتاريخ ${stock.priceDate || tvTimeDisplay}`
              : stock.quoteType === 'LIVE_INTRADAY'
              ? 'سعر لحظي مباشر من TradingView EGX'
              : `آخر إغلاق جلسة مكتملة (${stock.priceDate || tvTimeDisplay})`
            : `فشل المزامنة مع TradingView${live.lastSyncError ? `: ${live.lastSyncError}` : ''}`,
        latencyMs: live.tradingViewLatencyMs,
        error: tvOnline ? undefined : live.lastSyncError || 'لم تتم مزامنة السهم من TradingView'
      },
      {
        sourceName: dailyCandlesRes?.sourceName || `Yahoo Finance Historical (${stock.yahooTicker})`,
        price: yahooLastBar ? yahooLastBar.close : null,
        currency: stock.currency,
        timestamp: dailyCandlesRes?.lastCandleDate ?? null,
        status: yahooLastBar
          ? dailyCandlesRes?.isStale
            ? 'STALE'
            : 'LIVE'
          : dailyCandlesRes?.error
          ? 'FAILED'
          : 'UNFETCHED',
        statusAr: yahooLastBar
          ? dailyCandlesRes?.isStale
            ? `بيانات قديمة بتاريخ ${dailyCandlesRes.lastCandleDate} (متأخرة ${dailyCandlesRes.staleDays} جلسة)`
            : `أحدث إغلاق يومي من ${dailyCandlesRes?.sourceName || 'المصدر التاريخي'} بتاريخ ${dailyCandlesRes?.lastCandleDate}`
          : dailyCandlesRes?.error || 'لم يتم جلب الشموع التاريخية',
        latencyMs: yahooFeedStatus.lastLatencyMs,
        error: dailyCandlesRes?.error ?? undefined
      }
    ];

    const validPrices = quotes.filter((q) => q.price !== null && q.price > 0).map((q) => q.price as number);
    let maxDiscrepancyPct: number | null = null;
    let hasDiscrepancy = false;

    if (validPrices.length >= 2) {
      const minP = Math.min(...validPrices);
      const maxP = Math.max(...validPrices);
      maxDiscrepancyPct = Number((((maxP - minP) / minP) * 100).toFixed(2));
      hasDiscrepancy = maxDiscrepancyPct > 0.5;
    }

    const bestPrice = tvPrice ?? (yahooLastBar ? yahooLastBar.close : null);
    const allSourcesFailed = validPrices.length === 0;
    const unit = stock.currency === 'USD' ? 'دولار' : 'جنيه';
    const histLabel = dailyCandlesRes?.sourceName || 'المصدر التاريخي';

    let notesAr = '';
    if (allSourcesFailed) {
      notesAr = `تنبيه: فشلت جميع مصادر الأسعار في توفير سعر موثوق للسهم ${stock.ticker}.`;
    } else if (hasDiscrepancy && maxDiscrepancyPct !== null) {
      notesAr = `يوجد فارق سعري بنسبة ${maxDiscrepancyPct}% بين TradingView (${tvPrice} ${unit}) و${histLabel} (${yahooLastBar?.close} ${unit} بتاريخ ${dailyCandlesRes?.lastCandleDate}).`;
    } else {
      notesAr = `السعر المعتمد ${bestPrice} ${unit} ${stock.priceDate ? `(جلسة ${stock.priceDate})` : ''}${dailyCandlesRes?.staleReasonAr ? ` — ${dailyCandlesRes.staleReasonAr}` : ''}.`;
    }

    return {
      ticker: stock.ticker,
      bestPrice,
      primarySource: tvOnline
        ? 'TradingView EGX Scanner'
        : yahooLastBar
        ? `${histLabel} (${dailyCandlesRes?.lastCandleDate})`
        : 'لا يوجد مصدر نشط',
      quotes,
      hasDiscrepancy,
      maxDiscrepancyPct,
      allSourcesFailed,
      notesAr
    };
  }
}
