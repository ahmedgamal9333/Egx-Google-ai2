import React, { useState, useEffect } from 'react';
import { History, AlertTriangle, Clock } from 'lucide-react';

import { safeFetchJson } from '../../utils/apiClient';

interface HistoryViewProps {
  onSelectStock: (ticker: string) => void;
  lang?: 'ar' | 'en';
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onSelectStock, lang = 'ar' }) => {
  const [data, setData] = useState<{
    available?: boolean;
    insufficientReasonAr?: string;
    auditMethodAr?: string;
    lastVerifiedAt?: string;
    history: any[];
    metrics: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    safeFetchJson<any>('/api/recommendations/history', undefined, lang)
      .then(d => {
        if (!active) return;
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        console.error(err);
        setErrorMsg(err?.message || (lang === 'ar' ? 'تعذر تحميل سجل التدقيق' : 'Failed to load audit log'));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 text-sm">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ms-2"></div>
        {lang === 'ar'
          ? 'جاري تدقيق الإشارات التاريخية آلياً على الشموع الحقيقية...'
          : 'Running walk-forward audit on real candles...'}
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-6 text-center space-y-2">
        <AlertTriangle className="w-7 h-7 text-rose-400 mx-auto" />
        <div className="text-sm font-bold text-white">
          {lang === 'ar' ? 'تعذر تشغيل تدقيق التوصيات التاريخي' : 'Failed to load recommendation audit'}
        </div>
        <p className="text-xs text-rose-200">{errorMsg}</p>
      </div>
    );
  }

  const { history = [], metrics } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History className="w-4 h-4 text-emerald-400" />
            <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">
              {lang === 'ar' ? 'سجل التدقيق التاريخي القابل للتحقق (Walk-Forward Audit)' : 'Verifiable Walk-Forward Audit'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">
            {lang === 'ar' ? 'تدقيق الأداء التاريخي للإشارات على الشموع الفعلية' : 'Historical Signal Performance Audit'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {data.auditMethodAr ||
              (lang === 'ar'
                ? 'تدقيق آلي يختبر إشارات المنصة على الشموع التاريخية الحقيقية من Yahoo Finance دون تعديل أو بيانات مختلقة.'
                : 'Automated walk-forward signal audit on verified Yahoo Finance OHLCV candles.')}
          </p>
        </div>

        {data.lastVerifiedAt && (
          <span className="text-[11px] font-mono text-slate-300 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            {lang === 'ar'
              ? `تاريخ التدقيق: ${data.lastVerifiedAt.replace('T', ' ').substring(0, 16)}`
              : `Audited: ${data.lastVerifiedAt.replace('T', ' ').substring(0, 16)}`}
          </span>
        )}
      </div>

      {/* Refusal State when historical candles unavailable or no signals triggered */}
      {!data.available || !metrics ? (
        <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-6 text-center space-y-2">
          <AlertTriangle className="w-7 h-7 text-amber-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">
            {lang === 'ar' ? 'بيانات غير كافية لإصدار إحصائيات تدقيق تاريخي' : 'Insufficient Data for Audit Metrics'}
          </h3>
          <p className="text-xs text-amber-200 max-w-xl mx-auto leading-relaxed">
            {data.insufficientReasonAr ||
              'تعذر جلب عدد كافٍ من الشموع التاريخية الحقيقية؛ تم الامتناع عن عرض نسب نجاح تقديرية.'}
          </p>
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 font-mono-numbers">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">{lang === 'ar' ? 'نسبة النجاح (Win Rate)' : 'Win Rate'}</span>
              <span className="text-2xl font-black text-emerald-400">{metrics.winRatePct}%</span>
              <span className="text-[10px] text-slate-500 block font-sans">{metrics.winningTrades} من أصل {metrics.totalRecommendations} إشارة</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">{lang === 'ar' ? 'معامل الربحية (Profit Factor)' : 'Profit Factor'}</span>
              <span className="text-2xl font-black text-cyan-400">{metrics.profitFactor}x</span>
              <span className="text-[10px] text-slate-500 block font-sans">إجمالي الأرباح / الخسائر</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">{lang === 'ar' ? 'متوسط العائد للإشارة' : 'Avg Return'}</span>
              <span className={`text-2xl font-black ${metrics.averageReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics.averageReturnPct >= 0 ? `+${metrics.averageReturnPct}%` : `${metrics.averageReturnPct}%`}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">متوسط احتفاظ {metrics.avgHoldingDays} يوم</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">{lang === 'ar' ? 'تحقيق المستهدف 1' : 'Target 1 Hit'}</span>
              <span className="text-2xl font-black text-emerald-400">{metrics.target1HitRatePct}%</span>
              <span className="text-[10px] text-slate-500 block font-sans">بلوغ T1 أو T2</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">{lang === 'ar' ? 'تحقيق المستهدف 2' : 'Target 2 Hit'}</span>
              <span className="text-2xl font-black text-emerald-400">{metrics.target2HitRatePct}%</span>
              <span className="text-[10px] text-slate-500 block font-sans">المستهدف الممتد</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">{lang === 'ar' ? 'أقصى خسارة مسجلة' : 'Max Loss'}</span>
              <span className="text-2xl font-black text-rose-400">-{metrics.maxDrawdownPct}%</span>
              <span className="text-[10px] text-slate-500 block font-sans">تفعيل وقف الخسارة: {metrics.stopLossRatePct}%</span>
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold font-mono-numbers">
                    <th className="py-3 px-4 font-sans text-right">{lang === 'ar' ? 'السهم والشركة' : 'Stock'}</th>
                    <th className="py-3 px-3">{lang === 'ar' ? 'تاريخ الإشارة' : 'Date'}</th>
                    <th className="py-3 px-3">{lang === 'ar' ? 'سعر الإشارة' : 'Entry Price'}</th>
                    <th className="py-3 px-3">{lang === 'ar' ? 'وقف الخسارة' : 'Stop Loss'}</th>
                    <th className="py-3 px-3">{lang === 'ar' ? 'المستهدف 1 & 2' : 'Targets'}</th>
                    <th className="py-3 px-3 font-sans">{lang === 'ar' ? 'السبب الحسابي' : 'Signal Logic'}</th>
                    <th className="py-3 px-3">{lang === 'ar' ? 'العائد الفعلي' : 'Actual Return'}</th>
                    <th className="py-3 px-3">{lang === 'ar' ? 'المدة' : 'Holding'}</th>
                    <th className="py-3 px-4 font-sans">{lang === 'ar' ? 'النتيجة الفعلية' : 'Outcome'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono-numbers">
                  {history.map((rec: any) => (
                    <tr
                      key={rec.id}
                      onClick={() => onSelectStock(rec.ticker)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <span className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors block">
                          {rec.ticker}
                        </span>
                        <span className="text-[11px] text-slate-400 font-sans">{rec.companyNameAr}</span>
                      </td>

                      <td className="py-3 px-3 text-slate-400">{rec.recommendationDate}</td>

                      <td className="py-3 px-3 font-bold text-white">{rec.priceAtRecommendation} جم</td>

                      <td className="py-3 px-3 text-rose-400">{rec.stopLoss} جم</td>

                      <td className="py-3 px-3 text-slate-300">
                        <span>{rec.target1} / {rec.target2} جم</span>
                      </td>

                      <td className="py-3 px-3 font-sans max-w-[230px]">
                        <span className="px-2 py-0.5 rounded font-bold bg-slate-800 text-emerald-400 border border-slate-700 inline-block mb-1">
                          {rec.recommendationTypeAr}
                        </span>
                        <span className="block text-[10px] text-slate-400 leading-snug">{rec.rationaleAr}</span>
                      </td>

                      <td className={`py-3 px-3 font-bold text-sm ${rec.actualReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {rec.actualReturnPct >= 0 ? `+${rec.actualReturnPct}%` : `${rec.actualReturnPct}%`}
                      </td>

                      <td className="py-3 px-3 text-slate-400">{rec.holdingDays} يوم</td>

                      <td className="py-3 px-4 font-sans">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-block ${
                          String(rec.status).includes('TARGET')
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : rec.status === 'ACTIVE'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}>
                          {rec.statusAr}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
