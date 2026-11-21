import React, { useState, useEffect } from 'react';
import { Database, ShieldCheck, Activity, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

import { safeFetchJson } from '../../utils/apiClient';

interface SourcesViewProps {
  lang?: 'ar' | 'en';
  onMarketSynced?: () => void;
}

export const SourcesView: React.FC<SourcesViewProps> = ({ lang = 'ar', onMarketSynced }) => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchSources = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await safeFetchJson<any>('/api/sources/status', undefined, lang);
      setReport(d);
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || (lang === 'ar' ? 'تعذر فحص مصادر البيانات' : 'Failed to load data sources status'));
    } finally {
      setLoading(false);
    }
  };

  const handleLiveSync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const d = await safeFetchJson<any>('/api/market/sync', { method: 'POST' }, lang);
      if (d.sources) {
        setReport(d.sources);
      }
      if (d.syncResult && !d.syncResult.success) {
        setSyncNotice({
          ok: false,
          text: lang === 'ar'
            ? `فشلت المزامنة الحية: ${d.syncResult.error || 'تعذر الوصول لمزود الأسعار'}`
            : `Live sync failed: ${d.syncResult.error || 'Price provider unreachable'}`
        });
      } else {
        const count = d.syncResult?.syncedStocks ?? report?.syncedStocksCount ?? 0;
        const ms = d.syncResult?.latencyMs ?? '—';
        setSyncNotice({
          ok: true,
          text: lang === 'ar'
            ? `تمت مزامنة أسعار ${count} سهماً من TradingView ومؤشرات البورصة خلال ${ms} ms.`
            : `Synced latest prices for ${count} EGX stocks in ${ms} ms.`
        });
      }
      if (onMarketSynced) onMarketSynced();
    } catch (err: any) {
      console.error(err);
      setSyncNotice({
        ok: false,
        text: err?.message || (lang === 'ar' ? 'خطأ في الاتصال بالخادم' : 'Sync request failed')
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 text-sm">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ms-2"></div>
        {lang === 'ar' ? 'جاري فحص حالة مصادر البيانات ومطابقة الأسعار...' : 'Checking data providers...'}
      </div>
    );
  }

  if (loadError || !report) {
    return (
      <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-6 text-center space-y-3 max-w-xl mx-auto my-8">
        <AlertTriangle className="w-7 h-7 text-rose-400 mx-auto" />
        <div className="text-sm font-bold text-white">
          {lang === 'ar' ? 'تعذر تحميل حالة مصادر البيانات' : 'Failed to load Data Sources report'}
        </div>
        <p className="text-xs text-rose-200">{loadError}</p>
        <button
          type="button"
          onClick={fetchSources}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
        </button>
      </div>
    );
  }

  const badgeClassForStatus = (status: string) => {
    if (status === 'ONLINE') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    if (status === 'STANDBY') return 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
    if (status === 'REFERENCE') return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
    if (status === 'STALE') return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    return 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">
              {lang === 'ar' ? 'شفافية وجودة مصادر البيانات (Data Integrity & Quality)' : 'Data Sources & Integrity'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">
            {lang === 'ar' ? 'مراقبة موثوقية مزودي البيانات اللحظية ومطابقة الأسعار' : 'Data Providers Health & Conflict Resolution'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {lang === 'ar'
              ? `رصد مباشر لحالة TradingView EGX وYahoo Finance وGoogle News RSS ومرجع البنك المركزي لتغطية ${report.totalUniverseCount ?? 0} سهماً (تاريخ الجلسة: ${report.lastMarketSessionDate || 'غير محدد'}).`
              : `Live status of TradingView EGX, Yahoo Finance, Google News RSS, and CBE reference snapshot covering ${report.totalUniverseCount ?? 0} stocks.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLiveSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing
              ? (lang === 'ar' ? 'جاري مزامنة السوق...' : 'Syncing Live EGX...')
              : (lang === 'ar' ? 'مزامنة الأسعار الحية الآن' : 'Sync Live Prices Now')}
          </button>
          <button
            onClick={fetchSources}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-slate-700 hover:border-slate-600 text-white transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'فحص المزودين' : 'Check Status'}
          </button>
        </div>
      </div>

      {report.hasAnyFailure && (
        <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl px-4 py-3 text-xs text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            {lang === 'ar'
              ? `تنبيه: يوجد ${report.failedProvidersCount} مصدر غير متصل حالياً. تمنع المنصة إصدار أي تحليلات تعتمد على بيانات مفقودة.`
              : `Warning: ${report.failedProvidersCount} provider(s) offline.`}
          </span>
        </div>
      )}

      {syncNotice && (
        <div className={`rounded-xl px-4 py-3 text-xs flex items-center gap-2 border ${
          syncNotice.ok
            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
        }`}>
          {syncNotice.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{syncNotice.text}</span>
        </div>
      )}

      {/* System Health Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono-numbers">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
          <span className="text-xs text-slate-400 block font-sans mb-1">درجة جاهزية المصادر</span>
          <span className={`text-2xl font-black ${
            report.overallStatus === 'HEALTHY'
              ? 'text-emerald-400'
              : report.overallStatus === 'DEGRADED'
              ? 'text-amber-400'
              : 'text-rose-400'
          }`}>
            {report.overallHealthScore}%
          </span>
          <span className="text-[10px] text-slate-500 block font-sans">الحالة العامة: {report.overallStatus}</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
          <span className="text-xs text-slate-400 block font-sans mb-1">المزودون المتاحون</span>
          <span className="text-2xl font-black text-white">{report.connectedProvidersCount} / {report.totalProvidersCount}</span>
          <span className="text-[10px] text-slate-400 block font-sans">
            {report.failedProvidersCount > 0 ? `${report.failedProvidersCount} منقطع` : 'لا توجد أعطال مرصودة'}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
          <span className="text-xs text-slate-400 block font-sans mb-1">الأسهم المزامنة فعلياً</span>
          <span className="text-2xl font-black text-cyan-400">
            {report.syncedStocksCount} / {report.totalUniverseCount}
          </span>
          <span className="text-[10px] text-slate-500 block font-sans">
            متوسط الاستجابة: {report.averageLatencyMs !== null ? `${report.averageLatencyMs} ms` : 'غير متاح'}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
          <span className="text-xs text-slate-400 block font-sans mb-1">تعارضات سعرية &gt; 0.5%</span>
          <span className={`text-2xl font-black ${report.activeDiscrepancies > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {report.activeDiscrepancies}
          </span>
          <span className="text-[10px] text-slate-500 block font-sans">جلسة {report.lastMarketSessionDate || 'غير محددة'}</span>
        </div>
      </div>

      {/* Providers Status Cards */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          {lang === 'ar' ? 'سجل مزودي البيانات المربوطين بالمنصة:' : 'Connected Data Providers:'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {report.providers.map((p: any) => (
            <div key={p.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2 flex-wrap">
                    <span>{p.nameAr}</span>
                    {p.isOfficialSource && (
                      <span className="bg-indigo-500/10 text-indigo-300 text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/20">
                        مرجع رسمي مؤرخ
                      </span>
                    )}
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono block">{p.nameEn}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${badgeClassForStatus(p.status)}`}>
                  {p.status}
                </span>
              </div>

              <div className="text-xs text-slate-300">{p.statusAr}</div>

              {p.confidenceAr && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-cyan-300 font-semibold">{p.confidenceAr}</span>
                  {p.lastActualDataDate && (
                    <span className="text-slate-400 font-mono">تاريخ البيانات: {p.lastActualDataDate}</span>
                  )}
                </div>
              )}

              {p.lastError && (
                <div className="bg-rose-950/50 border border-rose-500/40 rounded-lg px-3 py-2 text-[11px] text-rose-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <span>{p.lastError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-numbers pt-2 border-t border-slate-800/60">
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">الأسهم المحدثة</span>
                  <span className="font-bold text-emerald-400">{p.updatedCount ?? 0} ({p.coveragePct ?? 0}%)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">نسبة النجاح</span>
                  <span className="font-bold text-white">{p.successRatePct !== null && p.successRatePct !== undefined ? `${p.successRatePct}%` : '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">زمن الاستجابة</span>
                  <span className="font-bold text-cyan-400">{p.latencyMs !== null ? `${p.latencyMs} ms` : 'غير متاح'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">آخر تحديث ناجح</span>
                  <span className="font-bold text-white text-[11px]">{p.lastSuccessfulUpdate || 'لم يتصل بعد'}</span>
                </div>
              </div>

              {p.termsNoteAr && (
                <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/40 leading-relaxed">
                  {p.termsNoteAr}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Discrepancy & Conflict Resolution Log */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          {lang === 'ar' ? 'سجل التحقق والمطابقة بين المزودين (TradingView مقابل Yahoo Finance):' : 'Cross-Provider Price Verification Log:'}
        </h3>

        {!report.recentDiscrepancyLogs || report.recentDiscrepancyLogs.length === 0 ? (
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>تظهر سجلات المطابقة الفعلية بين TradingView وYahoo Finance تلقائياً بمجرد فتح شارت أو تحليل أي سهم قيادي.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {report.recentDiscrepancyLogs.map((log: any, idx: number) => (
              <div key={idx} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-mono-numbers">
                  <span className="font-bold text-emerald-400 text-sm font-sans">
                    سهم {log.ticker} - {log.field}
                  </span>
                  <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono-numbers bg-slate-900/60 p-2 rounded">
                  <div><span className="text-slate-400 font-sans">{log.sourceA}:</span> <strong className="text-white">{log.valueA}</strong></div>
                  <div><span className="text-slate-400 font-sans">{log.sourceB}:</span> <strong className="text-white">{log.valueB}</strong></div>
                </div>
                <p className={`text-[11px] font-sans leading-relaxed ${log.diffPct > 0.5 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {log.resolutionAr}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
