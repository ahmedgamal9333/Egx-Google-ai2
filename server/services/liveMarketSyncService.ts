import { EGX_STOCKS_UNIVERSE, EGXStock, getEGXStock } from '../data/egxStocks';
import { parseSafeExternalJson } from '../utils/httpJson';

export type DataFreshnessStatus = 'LIVE' | 'STALE' | 'FAILED' | 'UNSYNCED';

export interface IndexQuote {
  value: number | null;
  change: number | null;
  changePct: number | null;
}

export interface LiveIndicesState {
  egx30: IndexQuote;
  egx70: IndexQuote;
  egx100: IndexQuote;
  fxUsdEgp: number | null;
  lastSyncedAt: string | null;
  indicesLastSyncedAt: string | null;
  tradingViewLatencyMs: number | null;
  tradingViewOnline: boolean;
  indicesOnline: boolean;
  hasAttemptedSync: boolean;
  syncedStocksCount: number;
  rejectedAnomaliesCount: number;
  lastSyncError: string | null;
  indicesSyncError: string | null;
  dataFreshnessStatus: DataFreshnessStatus;
  dataAgeMinutes: number | null;
  referenceSnapshotDate: string;
  lastSyncAttemptAt: string | null;
  totalAttempts: number;
  successfulAttempts: number;
  successRatePct: number;
  indicesAttempts: number;
  indicesSuccessfulAttempts: number;
  indicesSuccessRatePct: number;
  actualLastSessionDate: string;
  latestSourceTimestamp: string | null;
}

export const REFERENCE_SNAPSHOT_DATE = '2026-11-12';

/**
 * Official Egyptian public holidays & EGX exchange closures (YYYY-MM-DD, Cairo time).
 * Covers fixed national holidays + official lunar holidays for 2025-2027.
 */
export const EGYPT_PUBLIC_HOLIDAYS = new Set<string>([
  // 2025
  '2025-01-01', '2025-01-07', '2025-01-25', '2025-03-30', '2025-03-31', '2025-04-01',
  '2025-04-21', '2025-04-25', '2025-05-01', '2025-06-05', '2025-06-06', '2025-06-07',
  '2025-06-08', '2025-06-26', '2025-06-30', '2025-07-23', '2025-09-04', '2025-10-06',
  // 2026
  '2026-01-01', '2026-01-07', '2026-01-25', '2026-03-20', '2026-03-21', '2026-03-22',
  '2026-04-13', '2026-04-25', '2026-05-01', '2026-05-26', '2026-05-27', '2026-05-28',
  '2026-05-29', '2026-06-17', '2026-06-30', '2026-07-23', '2026-08-26', '2026-10-06',
  // 2027
  '2027-01-07', '2027-01-25', '2027-03-09', '2027-03-10', '2027-03-11', '2027-04-25',
  '2027-05-01', '2027-05-03', '2027-05-16', '2027-05-17', '2027-05-18', '2027-06-06',
  '2027-06-30', '2027-07-23', '2027-08-15', '2027-10-06'
]);

/**
 * Explicit ordered TradingView EGX Scanner column definitions.
 * Always access fields by column name via colIndexMap — never hardcode magic indices.
 */
export const TV_SCANNER_COLUMNS = [
  'name',                                    // description / short ticker column (do NOT treat as symbol ID)
  'close',
  'change',
  'change_abs',
  'open',
  'high',
  'low',
  'volume',
  'Value.Traded',
  'price_earnings_ttm',
  'price_book_fq',
  'dividends_yield_current',
  'dividend_payout_ratio_ttm',
  'RSI',
  'return_on_equity_fq',
  'return_on_assets_fq',
  'debt_to_equity_fq',
  'net_margin_fy',
  'operating_margin_ttm',
  'gross_margin_ttm',
  'total_revenue_ttm',
  'net_income_fq',
  'net_income_ttm',
  'total_debt',
  'total_assets',
  'free_cash_flow_fq',
  'cash_f_operating_activities_fq',
  'earnings_per_share_basic_ttm',
  'last_annual_eps',
  'book_value_per_share_fq',
  'current_ratio_fq',
  'quick_ratio',
  'market_cap_basic',
  'total_revenue_yoy_growth_ttm',
  'earnings_per_share_diluted_yoy_growth_ttm',
  'fiscal_period_end_fq',
  'earnings_release_date',
  'earnings_release_next_date',
  'EMA10',
  'EMA20',
  'EMA50',
  'EMA200',
  'SMA20',
  'SMA50',
  'BB.upper',
  'BB.lower',
  'ATR',
  'ADX',
  'ADX+DI',
  'ADX-DI',
  'Mom',
  'MACD.macd',
  'MACD.signal',
  'Recommend.All',
  'relative_volume_10d_calc',
  'average_volume_10d_calc',
  'average_volume_30d_calc',
  'High.1M',
  'Low.1M',
  'High.3M',
  'Low.3M',
  'price_52_week_high',
  'price_52_week_low',
  'time'
] as const;

export type TvScannerColumn = (typeof TV_SCANNER_COLUMNS)[number];

const TV_COL_INDEX = new Map<string, number>(
  TV_SCANNER_COLUMNS.map((col, idx) => [col, idx])
);

function getTvColValue(d: unknown[], col: TvScannerColumn): unknown {
  const idx = TV_COL_INDEX.get(col);
  if (idx === undefined || idx >= d.length) return undefined;
  return d[idx];
}

function finiteOrNull(v: unknown, decimals = 2): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Number(v.toFixed(decimals));
}

function unixToCairoDateStr(tsSec: unknown): string | null {
  if (typeof tsSec !== 'number' || !Number.isFinite(tsSec) || tsSec <= 946684800) return null;
  return getCairoDateParts(new Date(tsSec * 1000)).dateStr;
}

export function getCairoDateParts(dateInput: Date = new Date()): {
  dateStr: string;
  weekday: number; // 0=Sun..6=Sat
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  const parts = formatter.formatToParts(dateInput);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  const hourRaw = Number(map.hour ?? 0);
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    weekday: weekdayMap[map.weekday] ?? 0,
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number(map.minute ?? 0)
  };
}

export function isEgxTradingDay(dateStr: string): boolean {
  if (EGYPT_PUBLIC_HOLIDAYS.has(dateStr)) return false;
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getUTCDay();
  return day !== 5 && day !== 6;
}

/**
 * Extracts ticker exclusively from TradingView's qualified symbol `row.s` (e.g. "EGX:COMI"),
 * NEVER trusting column d[0] (`name`), and validates exchange prefix and listed universe membership.
 */
export function extractTickerFromTradingViewRow(row: { s?: unknown; d?: unknown }): {
  ticker: string | null;
  stock: EGXStock | null;
  rawSymbol: string | null;
  rejectionReason?: string;
} {
  if (!row || typeof row.s !== 'string' || !row.s.trim()) {
    return { ticker: null, stock: null, rawSymbol: null, rejectionReason: 'Missing row.s symbol identifier' };
  }
  const rawSymbol = row.s.trim().toUpperCase();
  if (rawSymbol.includes(':') && !rawSymbol.startsWith('EGX:')) {
    return { ticker: null, stock: null, rawSymbol, rejectionReason: `Non-EGX exchange symbol: ${rawSymbol}` };
  }
  const withoutPrefix = rawSymbol.replace(/^EGX:/, '');
  const cleanTicker = withoutPrefix.replace(/-EGP$/i, '');
  const matched = getEGXStock(cleanTicker) || getEGXStock(withoutPrefix);
  if (!matched) {
    return {
      ticker: cleanTicker,
      stock: null,
      rawSymbol,
      rejectionReason: `Ticker ${cleanTicker} not found in listed EGX universe`
    };
  }
  return { ticker: matched.ticker, stock: matched, rawSymbol };
}

export interface QuoteAnomalyValidation {
  valid: boolean;
  criticalErrors: string[];
  warnings: string[];
}

/**
 * Validates incoming price & volume fields against anomaly conditions:
 * - Negative / zero / non-finite prices
 * - High < Low or Close outside reasonable bounds
 * - Negative volume or turnover
 * - Extreme single-session percentage move (> 25%, exceeding standard EGX ±20% limit)
 * - Absurd RVOL spikes (> 150x)
 */
export function validateQuoteAnomaly(input: {
  close: unknown;
  changePct?: unknown;
  changeAbs?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  volume?: unknown;
  valueTraded?: unknown;
  rvol?: unknown;
}): QuoteAnomalyValidation {
  const criticalErrors: string[] = [];
  const warnings: string[] = [];

  if (typeof input.close !== 'number' || !Number.isFinite(input.close) || input.close <= 0) {
    criticalErrors.push('سعر الإغلاق غير صالح أو صفر/سالب');
    return { valid: false, criticalErrors, warnings };
  }

  const close = input.close;

  if (typeof input.open === 'number' && Number.isFinite(input.open) && input.open <= 0) {
    criticalErrors.push('سعر الافتتاح سالب أو صفر');
  }
  if (typeof input.high === 'number' && Number.isFinite(input.high) && input.high <= 0) {
    criticalErrors.push('أعلى سعر سالب أو صفر');
  }
  if (typeof input.low === 'number' && Number.isFinite(input.low) && input.low <= 0) {
    criticalErrors.push('أدنى سعر سالب أو صفر');
  }

  if (
    typeof input.high === 'number' &&
    typeof input.low === 'number' &&
    Number.isFinite(input.high) &&
    Number.isFinite(input.low) &&
    input.high < input.low
  ) {
    criticalErrors.push(`أعلى سعر (${input.high}) أقل من أدنى سعر (${input.low})`);
  }

  if (typeof input.volume === 'number' && Number.isFinite(input.volume) && input.volume < 0) {
    criticalErrors.push('حجم التداول سالب');
  }
  if (typeof input.valueTraded === 'number' && Number.isFinite(input.valueTraded) && input.valueTraded < 0) {
    criticalErrors.push('قيمة التداول سالبة');
  }

  let effectivePct: number | null =
    typeof input.changePct === 'number' && Number.isFinite(input.changePct) ? input.changePct : null;
  if (effectivePct === null && typeof input.changeAbs === 'number' && Number.isFinite(input.changeAbs)) {
    const prev = close - input.changeAbs;
    if (prev > 0) effectivePct = (input.changeAbs / prev) * 100;
  }

  if (effectivePct !== null && Math.abs(effectivePct) > 25) {
    criticalErrors.push(`تغير سعري شاذ يتجاوز الحدود المنطقية (${effectivePct.toFixed(1)}%)`);
  }

  if (typeof input.rvol === 'number' && Number.isFinite(input.rvol)) {
    if (input.rvol < 0) {
      warnings.push('قيمة الحجم النسبي RVOL سالبة (تم تجاهلها)');
    } else if (input.rvol > 150) {
      warnings.push(`طفرة حجم تداول غير اعتيادية (${input.rvol.toFixed(1)}x)`);
    }
  }

  return {
    valid: criticalErrors.length === 0,
    criticalErrors,
    warnings
  };
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
  timeoutMs = 7000
): Promise<Response> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) {
      const delayMs = 400 * Math.pow(3, attempt); // 400ms, 1200ms
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr || new Error('Network request failed after retries');
}

const LIVE_STATE: LiveIndicesState = {
  egx30: { value: null, change: null, changePct: null },
  egx70: { value: null, change: null, changePct: null },
  egx100: { value: null, change: null, changePct: null },
  fxUsdEgp: null,
  lastSyncedAt: null,
  indicesLastSyncedAt: null,
  tradingViewLatencyMs: null,
  tradingViewOnline: false,
  indicesOnline: false,
  hasAttemptedSync: false,
  syncedStocksCount: 0,
  rejectedAnomaliesCount: 0,
  lastSyncError: null,
  indicesSyncError: null,
  dataFreshnessStatus: 'UNSYNCED',
  dataAgeMinutes: null,
  referenceSnapshotDate: REFERENCE_SNAPSHOT_DATE,
  lastSyncAttemptAt: null,
  totalAttempts: 0,
  successfulAttempts: 0,
  successRatePct: 0,
  indicesAttempts: 0,
  indicesSuccessfulAttempts: 0,
  indicesSuccessRatePct: 0,
  actualLastSessionDate: REFERENCE_SNAPSHOT_DATE,
  latestSourceTimestamp: null
};

// Preserve initial static reference snapshot price & date cleanly on boot
for (const s of EGX_STOCKS_UNIVERSE) {
  if (s.referenceSnapshotPrice === undefined) {
    s.referenceSnapshotPrice = s.currentPrice;
    s.referenceSnapshotDate = REFERENCE_SNAPSHOT_DATE;
    s.quoteType = 'REFERENCE_SNAPSHOT';
  }
}

let syncVersion = 1;
let inFlightSyncPromise: Promise<{
  success: boolean;
  syncedStocks: number;
  latencyMs: number | null;
  timestamp: string | null;
  error?: string;
}> | null = null;

export function getLatestEgxSessionDate(nowInput: Date = new Date()): string {
  const parts = getCairoDateParts(nowInput);
  const cursor = new Date(`${parts.dateStr}T12:00:00Z`);

  // If before 10:00 AM Cairo on a trading day, the active/completed session is the prior trading day
  const minutes = parts.hour * 60 + parts.minute;
  if (isEgxTradingDay(parts.dateStr) && minutes < 600) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  for (let guard = 0; guard < 14; guard++) {
    const candidate = cursor.toISOString().split('T')[0];
    if (isEgxTradingDay(candidate)) {
      return candidate;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return parts.dateStr;
}

export class LiveMarketSyncService {
  public static getSyncVersion(): number {
    return syncVersion;
  }

  /**
   * Computes most recent EGX trading date (Sunday-Thursday excluding Egyptian holidays).
   */
  public static getLatestEgxSessionDate(nowInput: Date = new Date()): string {
    return getLatestEgxSessionDate(nowInput);
  }

  public static isEgxMarketOpenNow(nowInput: Date = new Date()): boolean {
    const parts = getCairoDateParts(nowInput);
    if (!isEgxTradingDay(parts.dateStr)) return false;
    const minutes = parts.hour * 60 + parts.minute;
    return minutes >= 600 && minutes <= 870; // 10:00 AM - 2:30 PM Cairo
  }

  public static getLiveState(): LiveIndicesState {
    let dataAgeMinutes: number | null = null;
    if (LIVE_STATE.lastSyncedAt) {
      const diffMs = Date.now() - new Date(LIVE_STATE.lastSyncedAt).getTime();
      dataAgeMinutes = Math.max(0, Math.round(diffMs / 60000));
    }

    const latestSession = this.getLatestEgxSessionDate();
    let status: DataFreshnessStatus = 'UNSYNCED';
    if (!LIVE_STATE.hasAttemptedSync) {
      status = 'UNSYNCED';
    } else if (!LIVE_STATE.tradingViewOnline || LIVE_STATE.lastSyncError) {
      status = 'FAILED';
    } else if (
      LIVE_STATE.actualLastSessionDate < latestSession ||
      (dataAgeMinutes !== null &&
        ((this.isEgxMarketOpenNow() && dataAgeMinutes > 15) || dataAgeMinutes > 180))
    ) {
      status = 'STALE';
    } else {
      status = 'LIVE';
    }

    return {
      ...LIVE_STATE,
      egx30: { ...LIVE_STATE.egx30 },
      egx70: { ...LIVE_STATE.egx70 },
      egx100: { ...LIVE_STATE.egx100 },
      dataFreshnessStatus: status,
      dataAgeMinutes
    };
  }

  /**
   * Deduplicated live sync against TradingView EGX Scanner API & Global Indices API.
   * Concurrent callers share the same in-flight promise.
   */
  public static async syncFromProviders(): Promise<{
    success: boolean;
    syncedStocks: number;
    latencyMs: number | null;
    timestamp: string | null;
    error?: string;
  }> {
    if (inFlightSyncPromise) {
      return inFlightSyncPromise;
    }

    inFlightSyncPromise = this.executeSync();
    try {
      return await inFlightSyncPromise;
    } finally {
      inFlightSyncPromise = null;
    }
  }

  private static async executeSync(): Promise<{
    success: boolean;
    syncedStocks: number;
    latencyMs: number | null;
    timestamp: string | null;
    error?: string;
  }> {
    LIVE_STATE.hasAttemptedSync = true;
    LIVE_STATE.totalAttempts++;
    LIVE_STATE.indicesAttempts++;
    const nowIso = new Date().toISOString();
    LIVE_STATE.lastSyncAttemptAt = nowIso;
    const start = Date.now();

    let stocksError: string | null = null;
    let indicesError: string | null = null;
    let updatedCount = 0;
    let rejectedCount = 0;
    let updatedIndices = 0;
    let maxSourceTimestampSec = 0;
    let latestQuoteDateSeen: string | null = null;

    const latestSession = this.getLatestEgxSessionDate();
    const marketOpenNow = this.isEgxMarketOpenNow();

    try {
      const [stocksRes, indicesRes] = await Promise.allSettled([
        fetchWithRetry(
          'https://scanner.tradingview.com/egypt/scan',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filter: [{ left: 'type', operation: 'in_range', right: ['stock', 'dr'] }],
              options: { lang: 'ar' },
              markets: ['egypt'],
              symbols: { query: { types: [] }, tickers: [] },
              columns: [...TV_SCANNER_COLUMNS],
              sort: { sortBy: 'Value.Traded', sortOrder: 'desc' },
              range: [0, 350]
            })
          },
          2,
          7500
        ),
        fetchWithRetry(
          'https://scanner.tradingview.com/global/scan',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbols: {
                tickers: ['EGX:EGX30', 'EGX:EGX70EWI', 'EGX:EGX100EWI', 'FX_IDC:USDEGP']
              },
              columns: ['name', 'close', 'change', 'change_abs', 'time']
            })
          },
          2,
          7000
        )
      ]);

      const latencyMs = Math.max(20, Date.now() - start);
      LIVE_STATE.tradingViewLatencyMs = latencyMs;

      // Process Stocks Scanner
      if (stocksRes.status === 'fulfilled') {
        if (stocksRes.value.ok) {
          let stocksJson: any = null;
          try {
            stocksJson = await parseSafeExternalJson(stocksRes.value, 'TradingView EGX Scanner');
          } catch (parseErr: any) {
            stocksError = parseErr?.message || 'استجابة غير صالحة من TradingView EGX';
          }
          const rows = Array.isArray(stocksJson?.data) ? stocksJson.data : [];
          if (!stocksError && rows.length === 0) {
            stocksError = 'أرجع مزود TradingView EGX قائمة فارغة (0 أسهم)';
          } else if (!stocksError) {
            for (const row of rows) {
              const d = row?.d;
              if (!Array.isArray(d)) continue;

              // Extract symbol strictly from `row.s` (never d[0]) & verify listed universe match
              const { stock } = extractTickerFromTradingViewRow(row);
              if (!stock) continue;

              // Verify column count safety
              if (d.length < 10) continue;

              const rawClose = getTvColValue(d, 'close');
              const rawChangePct = getTvColValue(d, 'change');
              const rawChangeAbs = getTvColValue(d, 'change_abs');
              const rawOpen = getTvColValue(d, 'open');
              const rawHigh = getTvColValue(d, 'high');
              const rawLow = getTvColValue(d, 'low');
              const rawVolume = getTvColValue(d, 'volume');
              const rawTurnover = getTvColValue(d, 'Value.Traded');
              const rawRvol = getTvColValue(d, 'relative_volume_10d_calc');

              const anomalyCheck = validateQuoteAnomaly({
                close: rawClose,
                changePct: rawChangePct,
                changeAbs: rawChangeAbs,
                open: rawOpen,
                high: rawHigh,
                low: rawLow,
                volume: rawVolume,
                valueTraded: rawTurnover,
                rvol: rawRvol
              });

              if (!anomalyCheck.valid) {
                rejectedCount++;
                stock.anomalyFlags = anomalyCheck.criticalErrors;
                continue;
              }

              const close = Number((rawClose as number).toFixed(3));
              const changeAbs =
                typeof rawChangeAbs === 'number' && Number.isFinite(rawChangeAbs) ? rawChangeAbs : null;
              const prevCloseCandidate =
                changeAbs !== null && close - changeAbs > 0
                  ? Number((close - changeAbs).toFixed(3))
                  : null;

              stock.currentPrice = close;
              if (prevCloseCandidate !== null) {
                stock.prevClose = prevCloseCandidate;
                stock.basePrice = prevCloseCandidate;
              }
              if (typeof rawOpen === 'number' && Number.isFinite(rawOpen) && rawOpen > 0) {
                stock.openPrice = Number(rawOpen.toFixed(3));
              }
              if (typeof rawHigh === 'number' && Number.isFinite(rawHigh) && rawHigh > 0) {
                stock.highPrice = Number(rawHigh.toFixed(3));
              }
              if (typeof rawLow === 'number' && Number.isFinite(rawLow) && rawLow > 0) {
                stock.lowPrice = Number(rawLow.toFixed(3));
              }
              if (typeof rawVolume === 'number' && Number.isFinite(rawVolume) && rawVolume >= 0) {
                stock.volume = Math.round(rawVolume);
              }
              if (typeof rawTurnover === 'number' && Number.isFinite(rawTurnover) && rawTurnover >= 0) {
                stock.valueTraded = Math.round(rawTurnover);
              }

              // Update fundamentals/technicals ONLY when incoming values are non-null (preserve valid values otherwise)
              const setIfPresent = <K extends keyof EGXStock>(key: K, val: number | null) => {
                if (val !== null) (stock as any)[key] = val;
              };

              setIfPresent('tvPeRatio', finiteOrNull(getTvColValue(d, 'price_earnings_ttm'), 2));
              setIfPresent('tvPbRatio', finiteOrNull(getTvColValue(d, 'price_book_fq'), 2));
              setIfPresent('tvDividendYield', finiteOrNull(getTvColValue(d, 'dividends_yield_current'), 2));
              setIfPresent('tvDividendPayoutRatio', finiteOrNull(getTvColValue(d, 'dividend_payout_ratio_ttm'), 2));
              setIfPresent('tvRsi', finiteOrNull(getTvColValue(d, 'RSI'), 2));
              setIfPresent('tvRoe', finiteOrNull(getTvColValue(d, 'return_on_equity_fq'), 2));
              setIfPresent('tvRoa', finiteOrNull(getTvColValue(d, 'return_on_assets_fq'), 2));
              setIfPresent('tvDebtToEquity', finiteOrNull(getTvColValue(d, 'debt_to_equity_fq'), 2));
              setIfPresent('tvNetMargin', finiteOrNull(getTvColValue(d, 'net_margin_fy'), 2));
              setIfPresent('tvOperatingMargin', finiteOrNull(getTvColValue(d, 'operating_margin_ttm'), 2));
              setIfPresent('tvGrossMargin', finiteOrNull(getTvColValue(d, 'gross_margin_ttm'), 2));
              setIfPresent('tvTotalRevenue', finiteOrNull(getTvColValue(d, 'total_revenue_ttm'), 0));
              setIfPresent('tvNetIncome', finiteOrNull(getTvColValue(d, 'net_income_fq'), 0));
              setIfPresent('tvNetIncomeTtm', finiteOrNull(getTvColValue(d, 'net_income_ttm'), 0));
              setIfPresent('tvTotalDebt', finiteOrNull(getTvColValue(d, 'total_debt'), 0));
              setIfPresent('tvTotalAssets', finiteOrNull(getTvColValue(d, 'total_assets'), 0));
              setIfPresent('tvFreeCashFlow', finiteOrNull(getTvColValue(d, 'free_cash_flow_fq'), 0));
              setIfPresent('tvOperatingCashFlow', finiteOrNull(getTvColValue(d, 'cash_f_operating_activities_fq'), 0));
              setIfPresent('tvEps', finiteOrNull(getTvColValue(d, 'earnings_per_share_basic_ttm'), 3));
              setIfPresent('tvLastAnnualEps', finiteOrNull(getTvColValue(d, 'last_annual_eps'), 3));

              const bvps = finiteOrNull(getTvColValue(d, 'book_value_per_share_fq'), 2);
              if (bvps !== null) {
                stock.tvBvps = bvps;
                stock.tvBookValue = bvps;
              }
              setIfPresent('tvCurrentRatio', finiteOrNull(getTvColValue(d, 'current_ratio_fq'), 2));
              setIfPresent('tvQuickRatio', finiteOrNull(getTvColValue(d, 'quick_ratio'), 2));
              setIfPresent('tvMarketCap', finiteOrNull(getTvColValue(d, 'market_cap_basic'), 0));
              setIfPresent('tvRevenueGrowthYoy', finiteOrNull(getTvColValue(d, 'total_revenue_yoy_growth_ttm'), 2));
              setIfPresent('tvEpsGrowthYoy', finiteOrNull(getTvColValue(d, 'earnings_per_share_diluted_yoy_growth_ttm'), 2));

              const fpDate = unixToCairoDateStr(getTvColValue(d, 'fiscal_period_end_fq'));
              if (fpDate) stock.tvFiscalPeriodEndDate = fpDate;
              const erDate = unixToCairoDateStr(getTvColValue(d, 'earnings_release_date'));
              if (erDate) stock.tvEarningsReleaseDate = erDate;
              const nrDate = unixToCairoDateStr(getTvColValue(d, 'earnings_release_next_date'));
              if (nrDate) stock.tvNextEarningsDate = nrDate;

              setIfPresent('tvEma10', finiteOrNull(getTvColValue(d, 'EMA10'), 2));
              setIfPresent('tvEma20', finiteOrNull(getTvColValue(d, 'EMA20'), 2));
              setIfPresent('tvEma50', finiteOrNull(getTvColValue(d, 'EMA50'), 2));
              setIfPresent('tvEma200', finiteOrNull(getTvColValue(d, 'EMA200'), 2));
              setIfPresent('tvSma20', finiteOrNull(getTvColValue(d, 'SMA20'), 2));
              setIfPresent('tvSma50', finiteOrNull(getTvColValue(d, 'SMA50'), 2));
              setIfPresent('tvBbUpper', finiteOrNull(getTvColValue(d, 'BB.upper'), 2));
              setIfPresent('tvBbLower', finiteOrNull(getTvColValue(d, 'BB.lower'), 2));
              const atr = finiteOrNull(getTvColValue(d, 'ATR'), 2);
              if (atr !== null) {
                stock.tvAtr14 = atr;
                stock.tvAtr = atr;
              }
              setIfPresent('tvAdx', finiteOrNull(getTvColValue(d, 'ADX'), 2));
              setIfPresent('tvAdxPlusDI', finiteOrNull(getTvColValue(d, 'ADX+DI'), 2));
              setIfPresent('tvAdxMinusDI', finiteOrNull(getTvColValue(d, 'ADX-DI'), 2));
              setIfPresent('tvMom', finiteOrNull(getTvColValue(d, 'Mom'), 2));
              setIfPresent('tvMacd', finiteOrNull(getTvColValue(d, 'MACD.macd'), 2));
              setIfPresent('tvMacdSignal', finiteOrNull(getTvColValue(d, 'MACD.signal'), 2));
              setIfPresent('tvRecommendAll', finiteOrNull(getTvColValue(d, 'Recommend.All'), 3));
              const rvol = finiteOrNull(rawRvol, 2);
              if (rvol !== null && rvol >= 0 && rvol <= 150) {
                stock.tvRelVol = rvol;
                stock.tvRvol = rvol;
              }
              setIfPresent('tvAvgVol10d', finiteOrNull(getTvColValue(d, 'average_volume_10d_calc'), 0));
              setIfPresent('tvAvgVol30d', finiteOrNull(getTvColValue(d, 'average_volume_30d_calc'), 0));
              setIfPresent('tvHigh1M', finiteOrNull(getTvColValue(d, 'High.1M'), 2));
              setIfPresent('tvLow1M', finiteOrNull(getTvColValue(d, 'Low.1M'), 2));
              setIfPresent('tvHigh3M', finiteOrNull(getTvColValue(d, 'High.3M'), 2));
              setIfPresent('tvLow3M', finiteOrNull(getTvColValue(d, 'Low.3M'), 2));
              setIfPresent('tvHigh52W', finiteOrNull(getTvColValue(d, 'price_52_week_high'), 2));
              setIfPresent('tvLow52W', finiteOrNull(getTvColValue(d, 'price_52_week_low'), 2));

              // Extract genuine source timestamp (TradingView `time` unix timestamp)
              const rawTime = getTvColValue(d, 'time');
              let quoteDate = latestSession;
              let sourceTsIso: string | null = null;
              if (typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime > 1_000_000_000) {
                if (rawTime > maxSourceTimestampSec) maxSourceTimestampSec = rawTime;
                sourceTsIso = new Date(rawTime * 1000).toISOString();
                quoteDate = getCairoDateParts(new Date(rawTime * 1000)).dateStr;
              }
              if (!latestQuoteDateSeen || quoteDate > latestQuoteDateSeen) {
                latestQuoteDateSeen = quoteDate;
              }

              const isSameDaySession = quoteDate >= latestSession;
              if (marketOpenNow && isSameDaySession) {
                stock.quoteType = 'LIVE_INTRADAY';
                stock.livePrice = close;
              } else {
                stock.quoteType = 'LAST_COMPLETED_SESSION';
                stock.livePrice = null;
                stock.lastCompletedSessionClose = close;
                stock.lastCompletedSessionDate = quoteDate;
              }

              stock.syncedFromLive = true;
              stock.isLiveQuote = true;
              stock.isStaleQuote = quoteDate < latestSession;
              stock.dataSource = 'TRADINGVIEW_LIVE';
              stock.priceDate = quoteDate;
              stock.sourceTimestamp = sourceTsIso;
              stock.receivedAt = nowIso;
              stock.lastSyncedAt = nowIso;
              stock.anomalyFlags = anomalyCheck.warnings.length > 0 ? anomalyCheck.warnings : undefined;
              updatedCount++;
            }

            if (updatedCount === 0) {
              stocksError = 'استجابة TradingView لم تطابق أي سهم صالح من البورصة المصرية';
            }
          }
        } else {
          stocksError = `فشل مزود الأسعار TradingView Scanner (HTTP ${stocksRes.value.status})`;
        }
      } else {
        stocksError = `تعذر الاتصال بمزود الأسعار TradingView (${stocksRes.reason?.message || 'Network timeout'})`;
      }

      // If stocks feed failed on this attempt, preserve previous synced data cleanly and mark stale
      if (stocksError) {
        for (const stock of EGX_STOCKS_UNIVERSE) {
          if (stock.syncedFromLive) {
            stock.isStaleQuote = true;
            if (stock.quoteType === 'LIVE_INTRADAY') {
              stock.quoteType = 'LAST_COMPLETED_SESSION';
            }
          }
        }
      }

      // Process Global Indices & FX
      if (indicesRes.status === 'fulfilled') {
        if (indicesRes.value.ok) {
          let idxJson: any = null;
          try {
            idxJson = await parseSafeExternalJson(indicesRes.value, 'TradingView Indices');
          } catch (parseErr: any) {
            indicesError = parseErr?.message || 'استجابة غير صالحة من TradingView Indices';
          }
          const rows = Array.isArray(idxJson?.data) ? idxJson.data : [];
          for (const row of rows) {
            const sym = row?.s;
            const d = row?.d;
            if (!Array.isArray(d) || typeof d[1] !== 'number' || !Number.isFinite(d[1]) || d[1] <= 0) continue;
            const val = Number(d[1].toFixed(2));
            const chgPct = typeof d[2] === 'number' && Number.isFinite(d[2]) ? Number(d[2].toFixed(2)) : null;
            const chgAbs = typeof d[3] === 'number' && Number.isFinite(d[3]) ? Number(d[3].toFixed(2)) : null;
            if (chgPct !== null && Math.abs(chgPct) > 25) continue; // index sanity guard
            if (sym === 'EGX:EGX30') {
              LIVE_STATE.egx30 = { value: val, change: chgAbs, changePct: chgPct };
              updatedIndices++;
            } else if (sym === 'EGX:EGX70EWI') {
              LIVE_STATE.egx70 = { value: val, change: chgAbs, changePct: chgPct };
              updatedIndices++;
            } else if (sym === 'EGX:EGX100EWI') {
              LIVE_STATE.egx100 = { value: val, change: chgAbs, changePct: chgPct };
              updatedIndices++;
            } else if (sym === 'FX_IDC:USDEGP') {
              LIVE_STATE.fxUsdEgp = val;
              updatedIndices++;
            }
          }
          if (!indicesError && updatedIndices === 0) {
            indicesError = 'فشل جلب قيم مؤشرات EGX وسعر الصرف من TradingView';
          }
        } else {
          indicesError = `فشل جلب مؤشرات السوق وسعر الصرف (HTTP ${indicesRes.value.status})`;
        }
      } else {
        indicesError = `تعذر الاتصال بمزود المؤشرات (${indicesRes.reason?.message || 'Network timeout'})`;
      }

      // Free open FX fallback (open.er-api.com) if TradingView FX_IDC:USDEGP was missing
      if (LIVE_STATE.fxUsdEgp === null) {
        try {
          const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(4500)
          });
          if (fxRes.ok) {
            const fxJson: any = await parseSafeExternalJson(fxRes, 'Open ExchangeRate API');
            const egp = fxJson?.rates?.EGP;
            if (typeof egp === 'number' && Number.isFinite(egp) && egp > 10 && egp < 200) {
              LIVE_STATE.fxUsdEgp = Number(egp.toFixed(2));
            }
          }
        } catch {
          // Non-fatal FX fallback failure
        }
      }

      LIVE_STATE.tradingViewOnline = updatedCount > 0 && !stocksError;
      LIVE_STATE.indicesOnline = updatedIndices > 0 && !indicesError;
      LIVE_STATE.rejectedAnomaliesCount = rejectedCount;

      if (LIVE_STATE.tradingViewOnline) {
        LIVE_STATE.successfulAttempts++;
        LIVE_STATE.lastSyncedAt = nowIso;
        LIVE_STATE.syncedStocksCount = updatedCount;
        LIVE_STATE.actualLastSessionDate = latestQuoteDateSeen || latestSession;
        if (maxSourceTimestampSec > 0) {
          LIVE_STATE.latestSourceTimestamp = new Date(maxSourceTimestampSec * 1000).toISOString();
        }
      }
      if (LIVE_STATE.indicesOnline) {
        LIVE_STATE.indicesSuccessfulAttempts++;
        LIVE_STATE.indicesLastSyncedAt = nowIso;
      }

      LIVE_STATE.successRatePct = Math.round(
        (LIVE_STATE.successfulAttempts / Math.max(1, LIVE_STATE.totalAttempts)) * 100
      );
      LIVE_STATE.indicesSuccessRatePct = Math.round(
        (LIVE_STATE.indicesSuccessfulAttempts / Math.max(1, LIVE_STATE.indicesAttempts)) * 100
      );

      LIVE_STATE.lastSyncError = stocksError;
      LIVE_STATE.indicesSyncError = indicesError;
      syncVersion++;

      return {
        success: LIVE_STATE.tradingViewOnline,
        syncedStocks: updatedCount,
        latencyMs: LIVE_STATE.tradingViewLatencyMs,
        timestamp: LIVE_STATE.lastSyncedAt,
        error: stocksError || indicesError || undefined
      };
    } catch (err: any) {
      const msg = err?.message || 'فشل غير متوقع أثناء مزامنة الأسعار';
      LIVE_STATE.tradingViewOnline = false;
      LIVE_STATE.indicesOnline = false;
      LIVE_STATE.lastSyncError = msg;
      LIVE_STATE.indicesSyncError = msg;
      LIVE_STATE.successRatePct = Math.round(
        (LIVE_STATE.successfulAttempts / Math.max(1, LIVE_STATE.totalAttempts)) * 100
      );
      LIVE_STATE.indicesSuccessRatePct = Math.round(
        (LIVE_STATE.indicesSuccessfulAttempts / Math.max(1, LIVE_STATE.indicesAttempts)) * 100
      );
      for (const stock of EGX_STOCKS_UNIVERSE) {
        if (stock.syncedFromLive) stock.isStaleQuote = true;
      }
      syncVersion++;
      return {
        success: false,
        syncedStocks: 0,
        latencyMs: LIVE_STATE.tradingViewLatencyMs,
        timestamp: LIVE_STATE.lastSyncedAt,
        error: msg
      };
    }
  }
}
