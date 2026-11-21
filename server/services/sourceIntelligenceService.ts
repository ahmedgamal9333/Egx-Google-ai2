import { EGX_STOCKS_UNIVERSE, getEGXStock } from '../data/egxStocks';
import { LiveMarketSyncService } from './liveMarketSyncService';
import {
  CAPMAS_INFLATION_REFERENCE_DATE,
  CBE_POLICY_REFERENCE_DATE,
  MarketDataService
} from './marketDataService';
import { NewsDisclosureService } from './newsService';

export type SourceConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';

export interface DataSourceProvider {
  id: string;
  priorityOrder: number;
  nameAr: string;
  nameEn: string;
  category: 'PRICES' | 'HISTORICAL' | 'DISCLOSURES' | 'NEWS' | 'MACRO' | 'AI';
  status: 'ONLINE' | 'STALE' | 'OFFLINE' | 'STANDBY' | 'REFERENCE';
  statusAr: string;
  latencyMs: number | null;
  lastSuccessfulUpdate: string | null;
  lastActualDataDate: string | null;
  updatedCount: number;
  successRatePct: number | null;
  lastError: string | null;
  confidenceLevel: SourceConfidenceLevel;
  confidenceAr: string;
  updateFrequencyAr: string;
  termsNoteAr: string;
  coveragePct: number;
  isOfficialSource: boolean;
}

export interface SystemSourcesReport {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  overallHealthScore: number;
  connectedProvidersCount: number;
  failedProvidersCount: number;
  totalProvidersCount: number;
  activeDiscrepancies: number;
  averageLatencyMs: number | null;
  lastMarketSync: string | null;
  lastMarketSessionDate: string;
  actualLastSessionDate: string;
  syncedStocksCount: number;
  rejectedAnomaliesCount: number;
  totalUniverseCount: number;
  hasAnyFailure: boolean;
  providers: DataSourceProvider[];
  recentDiscrepancyLogs: {
    ticker: string;
    field: string;
    sourceA: string;
    valueA: string;
    sourceB: string;
    valueB: string;
    diffPct: number;
    resolutionAr: string;
    timestamp: string;
  }[];
}

function confidenceLabel(level: SourceConfidenceLevel): string {
  if (level === 'HIGH') return 'ثقة مرتفعة (مصدر حي/رسمي)';
  if (level === 'MEDIUM') return 'ثقة متوسطة (تغذية ثانوية/تأخير)';
  if (level === 'LOW') return 'ثقة محدودة (مرجعي مؤرخ/غير آلي)';
  return 'غير متاح حالياً';
}

export class SourceIntelligenceService {
  public static getReport(): SystemSourcesReport {
    const live = LiveMarketSyncService.getLiveState();
    const yahoo = MarketDataService.getYahooFeedHealth();
    const cbeMacro = MarketDataService.getCbeMacroFeedHealth();
    const official = MarketDataService.getOfficialProbeStatus();
    const news = NewsDisclosureService.getFeedStatus();
    const sessionDate = LiveMarketSyncService.getLatestEgxSessionDate();

    const fmtTime = (iso: string | null) => (iso ? iso.replace('T', ' ').substring(0, 16) : null);

    const tvCoverage =
      live.syncedStocksCount > 0
        ? Math.min(100, Math.round((live.syncedStocksCount / EGX_STOCKS_UNIVERSE.length) * 100))
        : 0;

    const tvConf: SourceConfidenceLevel = !live.hasAttemptedSync
      ? 'MEDIUM'
      : !live.tradingViewOnline
      ? 'UNAVAILABLE'
      : live.dataFreshnessStatus === 'STALE'
      ? 'MEDIUM'
      : 'HIGH';

    const histOnline = yahoo.online || yahoo.tvFallbackSymbolsCount > 0;
    const histUpdatedCount = yahoo.updatedStocksCount + yahoo.tvFallbackSymbolsCount;
    const yahooConf: SourceConfidenceLevel = !yahoo.tested && yahoo.tvFallbackSymbolsCount === 0
      ? 'MEDIUM'
      : histOnline
      ? 'HIGH'
      : 'UNAVAILABLE';

    const newsConf: SourceConfidenceLevel =
      !news.lastFetchedAt && !news.lastError ? 'MEDIUM' : news.online ? 'MEDIUM' : 'UNAVAILABLE';

    const cbeConf: SourceConfidenceLevel = cbeMacro.liveSynced ? 'HIGH' : 'LOW';
    const capmasConf: SourceConfidenceLevel = cbeMacro.liveSynced ? 'MEDIUM' : 'LOW';

    const providers: DataSourceProvider[] = [
      {
        id: 'src-tradingview-stocks',
        priorityOrder: 1,
        nameAr: '1. تريدينج فيو — ماسح أسهم البورصة المصرية (TradingView EGX)',
        nameEn: 'TradingView EGX Equity Scanner',
        category: 'PRICES',
        status: !live.hasAttemptedSync
          ? 'STANDBY'
          : !live.tradingViewOnline
          ? 'OFFLINE'
          : live.dataFreshnessStatus === 'STALE'
          ? 'STALE'
          : 'ONLINE',
        statusAr: !live.hasAttemptedSync
          ? 'في انتظار إتمام أول مزامنة'
          : !live.tradingViewOnline
          ? `فشل الاتصال (${live.lastSyncError || 'انقطاع مصدر الأسعار'})`
          : live.dataFreshnessStatus === 'STALE'
          ? `بيانات سابقة (${live.dataAgeMinutes} دقيقة) — جلسة ${live.actualLastSessionDate}`
          : `متصل ومزامن (${live.syncedStocksCount} سهم، جلسة ${live.actualLastSessionDate})`,
        latencyMs: live.tradingViewLatencyMs,
        lastSuccessfulUpdate: fmtTime(live.lastSyncedAt),
        lastActualDataDate: live.actualLastSessionDate || sessionDate,
        updatedCount: live.syncedStocksCount,
        successRatePct: live.totalAttempts > 0 ? live.successRatePct : null,
        lastError: live.lastSyncError,
        confidenceLevel: tvConf,
        confidenceAr: confidenceLabel(tvConf),
        updateFrequencyAr: 'مزامنة حية كل 5 دقائق وعند الطلب',
        termsNoteAr: 'نقطة نهاية غير رسمية للعرض والتحليل البحثي؛ لا تضمن اتفاقية SLA تجارية أو بثاً فوريّاً بديلاً عن EGX المرخص.',
        coveragePct: tvCoverage,
        isOfficialSource: false
      },
      {
        id: 'src-tradingview-indices',
        priorityOrder: 2,
        nameAr: '2. مؤشرات البورصة المصرية وسعر الصرف (EGX30 / EGX70 / USD-EGP)',
        nameEn: 'TradingView EGX Indices & FX Feed (+ Open ExchangeRate Fallback)',
        category: 'PRICES',
        status: !live.hasAttemptedSync ? 'STANDBY' : live.indicesOnline ? 'ONLINE' : 'OFFLINE',
        statusAr: !live.hasAttemptedSync
          ? 'في انتظار المزامنة'
          : live.indicesOnline
          ? 'متصل (EGX30 / EGX70 / EGX100 / USD-EGP)'
          : `فشل جلب المؤشرات (${live.indicesSyncError || 'غير متاح'})`,
        latencyMs: live.tradingViewLatencyMs,
        lastSuccessfulUpdate: fmtTime(live.indicesLastSyncedAt),
        lastActualDataDate: live.actualLastSessionDate || sessionDate,
        updatedCount: live.indicesOnline ? 4 : 0,
        successRatePct: live.indicesAttempts > 0 ? live.indicesSuccessRatePct : null,
        lastError: live.indicesSyncError,
        confidenceLevel: !live.hasAttemptedSync ? 'MEDIUM' : live.indicesOnline ? 'HIGH' : 'UNAVAILABLE',
        confidenceAr: confidenceLabel(!live.hasAttemptedSync ? 'MEDIUM' : live.indicesOnline ? 'HIGH' : 'UNAVAILABLE'),
        updateFrequencyAr: 'مزامنة حية كل 5 دقائق مع احتياطي Open ExchangeRate',
        termsNoteAr: 'بيانات مؤشرات مرصودة من TradingView Global Scanner مع واجهة open.er-api.com الاحتياطية لسعر الصرف.',
        coveragePct: live.indicesOnline ? 100 : 0,
        isOfficialSource: false
      },
      {
        id: 'src-yahoo',
        priorityOrder: 3,
        nameAr: '3. الشموع التاريخية اليومية (Yahoo Finance + بديل TradingView OHLCV)',
        nameEn: 'Yahoo Finance (.CA) + TradingView WebSocket OHLCV Fallback',
        category: 'HISTORICAL',
        status: !yahoo.tested && yahoo.tvFallbackSymbolsCount === 0 ? 'STANDBY' : histOnline ? 'ONLINE' : 'OFFLINE',
        statusAr: !yahoo.tested && yahoo.tvFallbackSymbolsCount === 0
          ? 'جاهز — يُختبر عند فتح سهم أو تشغيل اختبار تاريخي'
          : histOnline
          ? `متصل — Yahoo (${yahoo.updatedStocksCount} سهم)${yahoo.tvFallbackSymbolsCount > 0 ? ` + TradingView OHLCV للأسهم غير المدرجة بياهو (${yahoo.tvFallbackSymbolsCount} سهم)` : ''}`
          : `فشل الاتصال (${yahoo.lastError || 'خطأ جلب الشموع'})`,
        latencyMs: yahoo.lastLatencyMs ?? yahoo.tvFallbackLastLatencyMs,
        lastSuccessfulUpdate: fmtTime(yahoo.lastSuccessAt),
        lastActualDataDate: live.actualLastSessionDate || sessionDate,
        updatedCount: histUpdatedCount,
        successRatePct: yahoo.totalAttempts > 0 ? Math.max(yahoo.successRatePct, yahoo.tvFallbackSymbolsCount > 0 ? 100 : 0) : null,
        lastError: histOnline ? null : yahoo.lastError,
        confidenceLevel: yahooConf,
        confidenceAr: confidenceLabel(yahooConf),
        updateFrequencyAr: 'عند الطلب مع حفظ مؤقت 15 دقيقة وتبديل تلقائي لـ TradingView عند 404',
        termsNoteAr: 'يجلب الشموع من Yahoo Finance (.CA) وعند غياب السهم مثل AMII يبدل تلقائياً لشموع TradingView الحقيقية المعدلة للتجزئة.',
        coveragePct: histOnline ? 100 : 0,
        isOfficialSource: false
      },
      {
        id: 'src-egx-official',
        priorityOrder: 4,
        nameAr: '4. البورصة المصرية EGX — الإفصاحات والبيانات الرسمية',
        nameEn: 'Egyptian Exchange (EGX) Official Disclosures',
        category: 'DISCLOSURES',
        status: official.egx.reachable ? 'ONLINE' : 'OFFLINE',
        statusAr: official.egx.reachable
          ? 'متصل'
          : `غير متاح آلياً (${official.egx.error || 'يتطلب مزود بيانات رسمي مرخص أو بوابة EGX'})`,
        latencyMs: official.egx.latencyMs,
        lastSuccessfulUpdate: null,
        lastActualDataDate: null,
        updatedCount: 0,
        successRatePct: 0,
        lastError: official.egx.error,
        confidenceLevel: 'UNAVAILABLE',
        confidenceAr: confidenceLabel('UNAVAILABLE'),
        updateFrequencyAr: 'يتطلب ترخيص مزود بيانات رسمي (EGX Information Dissemination)',
        termsNoteAr: 'موقع egx.com.eg محمي بتحدي JavaScript المضاد للبوتات ولا يوفر API مجاني؛ لذلك تتطلب الإفصاحات الرسمية ترخيصاً تجارياً.',
        coveragePct: 0,
        isOfficialSource: true
      },
      {
        id: 'src-cbe-ref',
        priorityOrder: 5,
        nameAr: '5. البنك المركزي المصري CBE — الفائدة والاحتياطي والتضخم الأساسي',
        nameEn: 'Central Bank of Egypt (CBE Official Portal)',
        category: 'MACRO',
        status: cbeMacro.liveSynced ? 'ONLINE' : 'REFERENCE',
        statusAr: cbeMacro.liveSynced
          ? `متصل رسمياً — إيداع ${cbeMacro.overnightDepositRate}% / إقراض ${cbeMacro.overnightLendingRate}% / احتياطي $${cbeMacro.foreignReservesBillionUsd}B`
          : `مرجعي مؤرخ بتاريخ ${CBE_POLICY_REFERENCE_DATE} (${official.cbe.error || 'تعذر السحب المباشر'})`,
        latencyMs: cbeMacro.latencyMs ?? official.cbe.latencyMs,
        lastSuccessfulUpdate: cbeMacro.liveSynced ? fmtTime(cbeMacro.lastFetchedAt) : CBE_POLICY_REFERENCE_DATE,
        lastActualDataDate: cbeMacro.policyDateLabel,
        updatedCount: 5,
        successRatePct: cbeMacro.liveSynced ? 100 : 0,
        lastError: cbeMacro.liveSynced ? null : official.cbe.error,
        confidenceLevel: cbeConf,
        confidenceAr: confidenceLabel(cbeConf),
        updateFrequencyAr: 'مزامنة تلقائية كل 6 ساعات من بوابة البنك المركزي الرسمية',
        termsNoteAr: 'تُقرأ الأرقام الرسمية المنشورة على cbe.org.eg مباشرة مع الاحتفاظ بآخر بيان مؤرخ كاحتياطي عند أي انقطاع.',
        coveragePct: 100,
        isOfficialSource: true
      },
      {
        id: 'src-capmas-ref',
        priorityOrder: 6,
        nameAr: '6. الجهاز المركزي للتعبئة العامة والإحصاء CAPMAS — التضخم العام',
        nameEn: 'CAPMAS Official Headline Inflation (via CBE Official Release)',
        category: 'MACRO',
        status: cbeMacro.liveSynced ? 'ONLINE' : 'REFERENCE',
        statusAr: cbeMacro.liveSynced
          ? `متصل عبر النشرة الرسمية للبنك المركزي — التضخم العام ${cbeMacro.headlineInflationRate}%`
          : `مرجعي مؤرخ بتاريخ ${CAPMAS_INFLATION_REFERENCE_DATE} (${official.capmas.error || 'HTML Shell'})`,
        latencyMs: cbeMacro.liveSynced ? cbeMacro.latencyMs : official.capmas.latencyMs,
        lastSuccessfulUpdate: cbeMacro.liveSynced ? fmtTime(cbeMacro.lastFetchedAt) : CAPMAS_INFLATION_REFERENCE_DATE,
        lastActualDataDate: cbeMacro.capmasDateLabel,
        updatedCount: 2,
        successRatePct: cbeMacro.liveSynced ? 100 : 0,
        lastError: cbeMacro.liveSynced ? null : official.capmas.error,
        confidenceLevel: capmasConf,
        confidenceAr: confidenceLabel(capmasConf),
        updateFrequencyAr: 'محدث عبر النشرة الشهرية الرسمية على موقع البنك المركزي',
        termsNoteAr: 'موقع CAPMAS لا يوفر JSON API مباشراً، لكن الرقم الرسمي الشهري للتضخم العام (Headline CPI) يُجلب آلياً من صفحة البنك المركزي المصري.',
        coveragePct: 100,
        isOfficialSource: true
      },
      {
        id: 'src-google-news',
        priorityOrder: 7,
        nameAr: '7. أخبار السوق المصري (Google News RSS + جريدة البورصة RSS)',
        nameEn: 'Google News Arabic RSS + Al Borsa Direct RSS',
        category: 'NEWS',
        status: !news.lastFetchedAt && !news.lastError ? 'STANDBY' : news.online ? 'ONLINE' : 'OFFLINE',
        statusAr: !news.lastFetchedAt && !news.lastError
          ? 'جاهز — يُستدعى عند فتح الأخبار أو تحليل سهم'
          : news.online
          ? `متصل — أخبار صحفية من جوجل وجريدة البورصة (${news.cachedMarketCount} خبر)`
          : `فشل الاتصال (${news.lastError || 'خطأ شبكة'})`,
        latencyMs: news.latencyMs,
        lastSuccessfulUpdate: fmtTime(news.lastFetchedAt),
        lastActualDataDate: fmtTime(news.lastFetchedAt)?.substring(0, 10) || null,
        updatedCount: news.cachedMarketCount,
        successRatePct: news.lastFetchedAt ? 100 : news.lastError ? 0 : null,
        lastError: news.lastError,
        confidenceLevel: newsConf,
        confidenceAr: confidenceLabel(newsConf),
        updateFrequencyAr: 'عند الطلب مع حفظ مؤقت 10 دقائق',
        termsNoteAr: 'تغذية مزدوجة من Google News RSS وخلاصة alborsaanews.com المباشرة؛ تُوسم الأخبار كصحفية غير مؤكدة رسمياً ما لم تُنسب لإفصاح EGX.',
        coveragePct: news.online ? 100 : 0,
        isOfficialSource: false
      },
      {
        id: 'src-gemini-ai',
        priorityOrder: 8,
        nameAr: '8. محرك التفسير التحليلي (Gemini AI Interpreter)',
        nameEn: 'Google Gemini Analytical Interpreter',
        category: 'AI',
        status: process.env.GEMINI_API_KEY ? 'ONLINE' : 'OFFLINE',
        statusAr: process.env.GEMINI_API_KEY
          ? 'مُهيأ — يفسر النتائج الحسابية فقط ويرفض اختراع الأسعار أو التوصيات'
          : 'مفتاح GEMINI_API_KEY غير مضبوط',
        latencyMs: null,
        lastSuccessfulUpdate: null,
        lastActualDataDate: null,
        updatedCount: 0,
        successRatePct: null,
        lastError: process.env.GEMINI_API_KEY ? null : 'GEMINI_API_KEY غير موجود',
        confidenceLevel: process.env.GEMINI_API_KEY ? 'HIGH' : 'UNAVAILABLE',
        confidenceAr: confidenceLabel(process.env.GEMINI_API_KEY ? 'HIGH' : 'UNAVAILABLE'),
        updateFrequencyAr: 'عند الطلب في التقارير والدردشة',
        termsNoteAr: 'يعتمد على مفاتيح خادم آمنة ويتوقف عن التفسير إذا لم تكتمل البيانات الأساسية.',
        coveragePct: process.env.GEMINI_API_KEY ? 100 : 0,
        isOfficialSource: false
      }
    ];

    const discrepancyLogs: SystemSourcesReport['recentDiscrepancyLogs'] = [];
    for (const candidateTicker of ['COMI', 'TMGH', 'SWDY', 'ETEL', 'MFPC', 'FWRY']) {
      const stk = getEGXStock(candidateTicker);
      const yahooCached = MarketDataService.getCachedRealCandles(candidateTicker, '1D');
      if (!stk?.isLiveQuote || !yahooCached?.isRealData || yahooCached.candles.length === 0) continue;

      const lastY = yahooCached.candles[yahooCached.candles.length - 1];
      const diffPct =
        lastY.close > 0
          ? Number((Math.abs((stk.currentPrice - lastY.close) / lastY.close) * 100).toFixed(2))
          : 0;
      const isDiff = diffPct > 0.5 || yahooCached.isStale;

      discrepancyLogs.push({
        ticker: candidateTicker,
        field: yahooCached.isStale ? 'تباين حداثة الجلسة والسعر' : 'مقارنة السعر بين TradingView وYahoo التاريخي',
        sourceA: 'TradingView EGX',
        valueA: `${stk.currentPrice} (${stk.priceDate || sessionDate})`,
        sourceB: 'Yahoo Finance (.CA)',
        valueB: `${lastY.close} (${yahooCached.lastCandleDate})`,
        diffPct,
        resolutionAr: isDiff
          ? `فارق ${diffPct}%${yahooCached.staleReasonAr ? ` — ${yahooCached.staleReasonAr}` : ''}`
          : 'تطابق فعلي بين TradingView وYahoo Finance.',
        timestamp: fmtTime(stk.lastSyncedAt || null) || sessionDate
      });
    }

    const connectedCount = providers.filter(
      (p) => p.status === 'ONLINE' || p.status === 'STANDBY' || p.status === 'REFERENCE'
    ).length;
    const failedCount = providers.filter((p) => p.status === 'OFFLINE').length;
    const latencies = providers.map((p) => p.latencyMs).filter((l): l is number => typeof l === 'number');
    const averageLatencyMs =
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

    // Only count primary price/historical/news outages toward critical health alerts (since EGX WAF block is expected behavior when no licensed feed exists)
    const criticalOffline = providers.filter(
      (p) => p.status === 'OFFLINE' && p.id !== 'src-egx-official'
    ).length;
    const hasAnyFailure = criticalOffline > 0;
    const healthScore = Math.round(((providers.length - failedCount) / providers.length) * 100);

    let overallStatus: SystemSourcesReport['overallStatus'] = 'HEALTHY';
    if (live.hasAttemptedSync && !live.tradingViewOnline) {
      overallStatus = 'FAILED';
    } else if (hasAnyFailure || live.dataFreshnessStatus === 'STALE') {
      overallStatus = 'DEGRADED';
    }

    return {
      overallStatus,
      overallHealthScore: healthScore,
      connectedProvidersCount: connectedCount,
      failedProvidersCount: failedCount,
      totalProvidersCount: providers.length,
      activeDiscrepancies: discrepancyLogs.filter((d) => d.diffPct > 0.5).length,
      averageLatencyMs,
      lastMarketSync: live.lastSyncedAt,
      lastMarketSessionDate: sessionDate,
      actualLastSessionDate: live.actualLastSessionDate || sessionDate,
      syncedStocksCount: live.syncedStocksCount,
      rejectedAnomaliesCount: live.rejectedAnomaliesCount,
      totalUniverseCount: EGX_STOCKS_UNIVERSE.length,
      hasAnyFailure,
      providers,
      recentDiscrepancyLogs: discrepancyLogs
    };
  }
}
