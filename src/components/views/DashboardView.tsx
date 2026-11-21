import React from 'react';
import { EGXStockSummary, SmartAlert } from '../../types';
import {
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Award,
  Bell,
  BarChart2,
  AlertTriangle,
  Clock,
  Info
} from 'lucide-react';

interface DashboardViewProps {
  stocks: EGXStockSummary[];
  marketOverview: any;
  alerts: SmartAlert[];
  onSelectStock: (ticker: string) => void;
  lang?: 'ar' | 'en';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stocks,
  marketOverview,
  alerts,
  onSelectStock,
  lang = 'ar'
}) => {
  // Top buy opportunities with real computed scores (never fabricated)
  const topOpportunities = stocks
    .filter(
      s =>
        s.quickScore !== null &&
        (s.recommendationBadge === 'STRONG_BUY' || s.recommendationBadge === 'BUY')
    )
    .sort((a, b) => (b.quickScore ?? -1) - (a.quickScore ?? -1))
    .slice(0, 4);

  // High volume liquidity leaders (only real reported turnover)
  const breakoutCandidates = stocks
    .filter(s => typeof s.valueTraded === 'number' && s.valueTraded > 0)
    .sort((a, b) => b.valueTraded - a.valueTraded)
    .slice(0, 4);

  const dataStatus = marketOverview?.dataStatus;
  const tvOnline = dataStatus?.tradingViewOnline ?? false;
  const isStale = Boolean(dataStatus?.isStale);
  const sessionDate =
    marketOverview?.lastMarketSessionDate ||
    dataStatus?.referenceSnapshotDate ||
    'غير متاح';

  const turnoverVal =
    typeof marketOverview?.totalTurnoverEgp === 'number'
      ? `${(marketOverview.totalTurnoverEgp / 1000000000).toFixed(2)} مليار جم`
      : 'غير متاح';

  const syncedCount = marketOverview?.syncedStocksCount ?? 0;
  const hasBreadth =
    syncedCount > 0 &&
    typeof marketOverview?.advancingStocks === 'number' &&
    typeof marketOverview?.decliningStocks === 'number';

  return (
    <div className="space-y-6">
      {/* Welcome & Market Pulse Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 p-6 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={`px-2.5 py-1 rounded-full border text-xs font-bold flex items-center gap-1.5 ${
                  tvOnline
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                {tvOnline
                  ? lang === 'ar'
                    ? 'نبض البورصة المصرية اللحظي'
                    : 'Live EGX Market Pulse'
                  : lang === 'ar'
                  ? 'مصدر الأسعار غير متصل حالياً'
                  : 'Price Feed Offline'}
              </span>
              <span className="text-xs text-slate-300 font-mono bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-400" />
                {lang === 'ar' ? `تاريخ البيانات: ${sessionDate}` : `Date: ${sessionDate}`}
              </span>
              {isStale && (
                <span className="text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md font-bold">
                  {lang === 'ar' ? 'بيانات غير محدثة للجلسة الحالية' : 'Stale Session Data'}
                </span>
              )}
            </div>
            <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
              {lang === 'ar'
                ? 'منصة المحلل المالي الذكي (EGX AI Analyst)'
                : 'EGX AI Financial Decision Terminal'}
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl mt-1.5 leading-relaxed">
              {lang === 'ar'
                ? `تغطية تحليلية لـ ${stocks.length} سهماً مدرجاً في البورصة المصرية وفق قواعد حسابية صارمة: لا بيانات مختلقة، ولا توصيات بدون اكتمال البيانات السعرية والمالية.`
                : `Evidence-based swing trading analysis covering ${stocks.length} EGX equities with strict data-completeness gates.`}
            </p>
          </div>

          {/* Market Breadth & Turnover Quick Stats */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800 backdrop-blur-md">
            <div>
              <span className="text-[11px] text-slate-400 block">
                {lang === 'ar' ? 'إجمالي قيمة التداول' : 'Total Turnover'}
              </span>
              <span
                className={`text-lg font-black font-mono-numbers ${
                  typeof marketOverview?.totalTurnoverEgp === 'number'
                    ? 'text-white'
                    : 'text-amber-400 text-sm'
                }`}
              >
                {turnoverVal}
              </span>
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div>
              <span className="text-[11px] text-slate-400 block">
                {lang === 'ar' ? 'الأسهم الصاعدة / الهابطة' : 'Gainers / Losers'}
              </span>
              {hasBreadth ? (
                <div className="flex items-center gap-1.5 font-mono-numbers text-sm font-bold">
                  <span className="text-emerald-400">{marketOverview.advancingStocks} ↑</span>
                  <span className="text-slate-600">/</span>
                  <span className="text-rose-400">{marketOverview.decliningStocks} ↓</span>
                </div>
              ) : (
                <span className="text-xs font-bold text-amber-400">غير متاح</span>
              )}
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div>
              <span className="text-[11px] text-slate-400 block">
                {lang === 'ar' ? 'معامل اتساع السوق' : 'Market Breadth'}
              </span>
              <span className="text-sm font-bold text-cyan-400 font-mono-numbers">
                {typeof marketOverview?.marketBreadthRatio === 'number'
                  ? `${marketOverview.marketBreadthRatio}x صاعد`
                  : 'غير متاح'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 4 Swing Trading Opportunities */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">
              {lang === 'ar'
                ? 'أبرز فرص التداول المتأرجح المستوفية للبيانات'
                : 'Top Data-Verified Swing Opportunities'}
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            {lang === 'ar'
              ? 'مرتبة وفق المعادلة الحسابية المعلنة لكل سهم'
              : 'Sorted by verified quantitative score'}
          </span>
        </div>

        {topOpportunities.length === 0 ? (
          <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 text-center space-y-2">
            <AlertTriangle className="w-7 h-7 text-amber-400 mx-auto" />
            <h3 className="text-sm font-bold text-white">
              {lang === 'ar'
                ? 'لم تصدر فرص شراء حالياً'
                : 'No Qualified Buy Opportunities Issued'}
            </h3>
            <p className="text-xs text-slate-400 max-w-xl mx-auto leading-relaxed">
              {!tvOnline
                ? 'تعذر جلب الأسعار الحية من المزود، لذلك تم إيقاف إصدار أي توصيات شراء لحين استعادة البيانات الموثوقة.'
                : 'لا توجد أسهم حالياً تحقق شروط الشراء الحسابية (التقييم الفني + القيمة العادلة + جودة الأرباح) من واقع البيانات المزامنة.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {topOpportunities.map((stock) => {
              const unit = stock.currency === 'USD' ? '$' : 'جم';
              return (
                <div
                  key={stock.ticker}
                  onClick={() => onSelectStock(stock.ticker)}
                  className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-xl hover:shadow-emerald-950/20 group relative overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-black text-lg text-white group-hover:text-emerald-400 transition-colors">
                        {stock.ticker}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {stock.recommendationBadgeAr}
                      </span>
                    </div>

                    <div className="font-semibold text-xs text-slate-200 line-clamp-1 mb-0.5">
                      {stock.nameAr}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3">
                      <span>{stock.sectorAr}</span>
                      {stock.priceDate && (
                        <span
                          className={`font-mono text-[10px] ${
                            stock.isStaleQuote ? 'text-amber-400' : 'text-slate-500'
                          }`}
                        >
                          {stock.priceDate}
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between mb-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 font-mono-numbers">
                      <div>
                        <span className="text-[10px] text-slate-400 block">
                          {lang === 'ar' ? 'السعر' : 'Price'}
                        </span>
                        <span className="text-base font-bold text-white">
                          {stock.currentPrice} {unit}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">
                          {lang === 'ar' ? 'التغير' : 'Change'}
                        </span>
                        <span
                          className={`text-xs font-bold flex items-center gap-0.5 ${
                            stock.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {stock.changePct >= 0 ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {stock.changePct >= 0 ? `+${stock.changePct}%` : `${stock.changePct}%`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs border-t border-slate-800/80 pt-2.5">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{lang === 'ar' ? 'القيمة العادلة:' : 'Fair Value:'}</span>
                      <span className="text-emerald-400 font-bold font-mono-numbers">
                        {stock.fairValue !== null ? `${stock.fairValue} ${unit}` : 'غير متوفر'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{lang === 'ar' ? 'هامش الأمان:' : 'Margin of Safety:'}</span>
                      <span
                        className={`font-bold font-mono-numbers ${
                          (stock.fairValueUpsidePct ?? 0) >= 0 ? 'text-cyan-400' : 'text-rose-400'
                        }`}
                      >
                        {stock.fairValueUpsidePct !== null
                          ? `${stock.fairValueUpsidePct >= 0 ? '+' : ''}${stock.fairValueUpsidePct}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{lang === 'ar' ? 'التقييم الحسابي:' : 'Score:'}</span>
                      <span className="text-white font-mono-numbers font-bold">
                        {stock.quickScore !== null ? `${stock.quickScore}/100` : '—'}
                      </span>
                    </div>
                    {stock.mathReasonAr && (
                      <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/50 leading-relaxed line-clamp-2 flex items-start gap-1">
                        <Info className="w-3 h-3 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{stock.mathReasonAr}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid: High Volume Movers & Latest AI Smart Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* High Volume / Liquidity Leaders */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">
                {lang === 'ar'
                  ? 'أنشط الأسهم في قيم التداول الفعلية'
                  : 'Top Liquidity & Volume Leaders'}
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              {lang === 'ar' ? 'وفق سيولة الجلسة المزامنة' : 'Synced session liquidity'}
            </span>
          </div>

          {breakoutCandidates.length === 0 ? (
            <div className="py-10 text-center text-xs text-amber-300 bg-slate-950/60 rounded-xl border border-slate-800">
              لا تتوافر بيانات قيم تداول حية حالياً — يرجى مزامنة السوق للتحقق من السيولة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">{lang === 'ar' ? 'السهم' : 'Stock'}</th>
                    <th className="py-2.5 px-3">{lang === 'ar' ? 'القطاع' : 'Sector'}</th>
                    <th className="py-2.5 px-3">{lang === 'ar' ? 'السعر' : 'Price'}</th>
                    <th className="py-2.5 px-3">{lang === 'ar' ? 'التغير' : 'Change'}</th>
                    <th className="py-2.5 px-3">{lang === 'ar' ? 'قيمة التداول' : 'Turnover'}</th>
                    <th className="py-2.5 px-3">{lang === 'ar' ? 'التصنيف' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono-numbers">
                  {breakoutCandidates.map((s) => {
                    const unit = s.currency === 'USD' ? '$' : 'جم';
                    return (
                      <tr
                        key={s.ticker}
                        onClick={() => onSelectStock(s.ticker)}
                        className="hover:bg-slate-800/60 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white">{s.ticker}</span>
                            {s.priceDate && s.isStaleQuote && (
                              <span className="text-[9px] text-amber-400">({s.priceDate})</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-sans">{s.nameAr}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-300 font-sans">{s.sectorAr}</td>
                        <td className="py-3 px-3 font-bold text-white">
                          {s.currentPrice} {unit}
                        </td>
                        <td
                          className={`py-3 px-3 font-bold ${
                            s.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {s.changePct >= 0 ? `+${s.changePct}%` : `${s.changePct}%`}
                        </td>
                        <td className="py-3 px-3 text-cyan-300">
                          {(s.valueTraded / 1000000).toFixed(1)} مليون {unit}
                        </td>
                        <td className="py-3 px-3 font-sans">
                          <span
                            title={s.mathReasonAr || ''}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              s.recommendationBadge === 'INSUFFICIENT_DATA'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : s.recommendationBadge === 'REDUCE'
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                : 'bg-slate-800 text-emerald-400 border-slate-700'
                            }`}
                          >
                            {s.recommendationBadgeAr}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Real-Time Smart & Integrity Alerts */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  {lang === 'ar' ? 'التنبيهات وسلامة المصادر' : 'Verified Alerts'}
                </h3>
              </div>
              <span className="text-[11px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-bold">
                {alerts.length} تنبيه
              </span>
            </div>

            {alerts.length === 0 ? (
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 text-center">
                لا توجد تنبيهات نشطة حالياً بناءً على بيانات الجلسة المزامنة.
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    onClick={() => a.ticker !== 'SYSTEM' && onSelectStock(a.ticker)}
                    className={`bg-slate-950/70 p-3 rounded-xl border transition-all text-xs ${
                      a.ticker !== 'SYSTEM' ? 'cursor-pointer hover:border-slate-700' : ''
                    } ${
                      a.severity === 'DANGER'
                        ? 'border-rose-500/40'
                        : a.severity === 'WARNING'
                        ? 'border-amber-500/40'
                        : 'border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <span
                          className={`font-mono ${
                            a.severity === 'DANGER'
                              ? 'text-rose-400'
                              : a.severity === 'WARNING'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {a.ticker}
                        </span>
                        <span className="text-slate-400 text-[11px] font-normal">{a.typeAr}</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{a.timestamp}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed line-clamp-2">
                      {a.messageAr}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>{lang === 'ar' ? 'مبنية على بيانات مزامنة حقيقية' : 'Verified source signals'}</span>
            <span className={`font-bold ${tvOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
              {tvOnline ? (lang === 'ar' ? 'متصل' : 'Connected') : lang === 'ar' ? 'تنبيه مصدر' : 'Feed Alert'}
            </span>
          </div>
        </div>
      </div>

      {/* Pre-Breakout & Unusual Liquidity Radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" />
              {lang === 'ar' ? 'أسهم مرشحة للانطلاق أو قريبة من الاختراق' : 'Early Launch & Near Breakout'}
            </h3>
            <span className="text-[11px] text-slate-400">وفق تقييم 100 نقطة</span>
          </div>
          {(() => {
            const watchCandidates = stocks
              .filter(
                (s) =>
                  s.quickScore !== null &&
                  (s.screenerCategory === 'EARLY_LAUNCH_CANDIDATE' ||
                    s.screenerCategory === 'NEAR_BREAKOUT' ||
                    s.screenerCategory === 'CONFIRMED_BREAKOUT')
              )
              .sort((a, b) => (b.quickScore ?? 0) - (a.quickScore ?? 0))
              .slice(0, 4);
            if (watchCandidates.length === 0) {
              return (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400">
                  لا توجد أسهم مستوفية لشروط الانطلاق المبكر أو القرب من الاختراق حالياً.
                </div>
              );
            }
            return (
              <div className="space-y-2">
                {watchCandidates.map((c) => (
                  <div
                    key={c.ticker}
                    onClick={() => onSelectStock(c.ticker)}
                    className="bg-slate-950/70 hover:bg-slate-800/60 border border-slate-800 rounded-xl p-3 cursor-pointer flex items-center justify-between gap-2 text-xs transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{c.ticker}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                          {c.screenerCategoryAr}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 truncate block">{c.nameAr}</span>
                    </div>
                    <div className="text-left font-mono-numbers shrink-0">
                      <span className="font-bold text-white block">{c.quickScore}/100</span>
                      <span className={`text-[11px] ${c.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {c.changePct >= 0 ? `+${c.changePct}%` : `${c.changePct}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-cyan-400" />
              {lang === 'ar' ? 'الأسهم ذات السيولة غير الاعتيادية (RVOL ≥ 1.5x)' : 'Unusual Liquidity Spikes'}
            </h3>
            <span className="text-[11px] text-slate-400">مقارنة بمتوسط 10 أيام</span>
          </div>
          {(() => {
            const unusualRows = (marketOverview?.unusualVolumeStocks && marketOverview.unusualVolumeStocks.length > 0
              ? marketOverview.unusualVolumeStocks
              : stocks.filter((s) => (s.relativeVolume ?? 0) >= 1.5).sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0))
            ).slice(0, 4);

            if (unusualRows.length === 0) {
              return (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400">
                  لم تُرصد طفرات سيولة نسبية تتجاوز 1.5x حتى هذه اللحظة.
                </div>
              );
            }
            return (
              <div className="space-y-2">
                {unusualRows.map((u: any) => (
                  <div
                    key={u.ticker}
                    onClick={() => onSelectStock(u.ticker)}
                    className="bg-slate-950/70 hover:bg-slate-800/60 border border-slate-800 rounded-xl p-3 cursor-pointer flex items-center justify-between gap-2 text-xs transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{u.ticker}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono">
                          RVOL {u.relativeVolume}x
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 truncate block">{u.nameAr}</span>
                    </div>
                    <div className="text-left font-mono-numbers shrink-0">
                      <span className="font-bold text-white block">{u.currentPrice}</span>
                      <span className={`text-[11px] ${u.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {u.changePct >= 0 ? `+${u.changePct}%` : `${u.changePct}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
