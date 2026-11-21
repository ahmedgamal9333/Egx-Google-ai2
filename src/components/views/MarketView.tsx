import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Landmark,
  DollarSign,
  Activity,
  LineChart,
  AlertTriangle,
  Clock,
  Info
} from 'lucide-react';
import { TradingViewWidget } from '../TradingViewWidget';

interface MarketViewProps {
  overview: any;
  lang?: 'ar' | 'en';
}

export const MarketView: React.FC<MarketViewProps> = ({ overview, lang = 'ar' }) => {
  const [marketSymbol, setMarketSymbol] = useState<
    'EGX:EGX30' | 'EGX:EGX70EWI' | 'EGX:EGX100EWI' | 'FX_IDC:USDEGP'
  >('EGX:EGX30');
  if (!overview || !overview.cbeData) return null;

  const renderIndexCard = (title: string, idx: any, subtitleFallback: string) => {
    const available = idx && typeof idx.value === 'number';
    const pct = typeof idx?.changePct === 'number' ? idx.changePct : null;
    const chg = typeof idx?.change === 'number' ? idx.change : null;
    const isUp = (pct ?? 0) >= 0;

    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-bold font-sans text-white text-base">{title}</span>
          {available && pct !== null ? (
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {isUp ? `+${pct}%` : `${pct}%`}
            </span>
          ) : (
            <span className="bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded font-bold font-sans">
              غير متاح
            </span>
          )}
        </div>

        <div className="text-3xl font-black text-white mb-1">
          {available ? idx.value.toLocaleString() : '—'}
        </div>

        {available && chg !== null ? (
          <div
            className={`text-xs font-semibold flex items-center gap-1 font-sans ${
              isUp ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {chg >= 0 ? `+${chg}` : chg} نقطة
          </div>
        ) : (
          <div className="text-xs text-rose-400 font-semibold flex items-center gap-1 font-sans">
            <AlertTriangle className="w-3.5 h-3.5" />
            {idx?.statusAr || subtitleFallback}
          </div>
        )}
      </div>
    );
  };

  const adv = overview.advancingStocks ?? 0;
  const dec = overview.decliningStocks ?? 0;
  const unc = overview.unchangedStocks ?? 0;
  const totalBreadth = adv + dec + unc;

  const dataStatus = overview.dataStatus;
  const indicesOnline = dataStatus?.indicesOnline ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                indicesOnline ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            ></span>
            <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">
              {lang === 'ar'
                ? 'البورصة المصرية - مؤشرات السوق والاقتصاد الكلي'
                : 'EGX & Macro Environment'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">
            {lang === 'ar'
              ? 'تحليل أداء السوق المصري والسياسة النقدية'
              : 'Egyptian Market Overview & CBE Macro'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            تاريخ الجلسة: {overview.lastMarketSessionDate || 'غير متاح'}
          </span>
          {dataStatus?.indicesSyncError && (
            <span className="bg-rose-950/60 border border-rose-500/40 px-3 py-1.5 rounded-xl text-rose-300 font-sans">
              تنبيه المؤشرات: {dataStatus.indicesSyncError}
            </span>
          )}
        </div>
      </div>

      {/* 3 Main EGX Indices Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono-numbers">
        {renderIndexCard('مؤشر EGX30', overview.egx30, 'تعطل مصدر المؤشرات الحية')}
        {renderIndexCard('مؤشر EGX70 EWI', overview.egx70, 'تعطل مصدر المؤشرات الحية')}
        {renderIndexCard('مؤشر EGX100 الأوسع نطاقاً', overview.egx100, 'تعطل مصدر المؤشرات الحية')}
      </div>

      {/* Live TradingView Market Index Chart */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              {lang === 'ar'
                ? 'الرسم البياني المباشر لمؤشرات السوق (TradingView)'
                : 'Live Market Index Chart (TradingView)'}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            {(
              [
                { sym: 'EGX:EGX30', label: 'EGX30' },
                { sym: 'EGX:EGX70EWI', label: 'EGX70' },
                { sym: 'EGX:EGX100EWI', label: 'EGX100' },
                { sym: 'FX_IDC:USDEGP', label: 'USD/EGP' }
              ] as const
            ).map((item) => (
              <button
                key={item.sym}
                type="button"
                onClick={() => setMarketSymbol(item.sym)}
                className={`px-3 py-1 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 ${
                  marketSymbol === item.sym
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <TradingViewWidget
          symbol={marketSymbol}
          interval="D"
          lang={lang}
          height={480}
          studies={['STD;EMA', 'STD;RSI']}
          allowSymbolChange={true}
          hideSideToolbar={false}
        />
      </div>

      {/* Central Bank of Egypt (CBE) Macroeconomic Dashboard */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">
              {lang === 'ar'
                ? 'المؤشرات الاقتصادية للبنك المركزي المصري (CBE Macro Dashboard)'
                : 'CBE Macroeconomic Dashboard'}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-lg font-bold">
              {lang === 'ar'
                ? `بيان مرجعي بتاريخ ${overview.cbeData.lastCbeMeetingDate}`
                : `Reference Snapshot: ${overview.cbeData.lastCbeMeetingDate}`}
            </span>
          </div>
        </div>

        {overview.cbeData.macroNoteAr && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{overview.cbeData.macroNoteAr}</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 font-mono-numbers text-xs">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1 font-sans">
              سعر الإقراض لليلة واحدة
            </span>
            <span className="text-xl font-black text-white">
              {overview.cbeData.overnightLendingRate}%
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1 font-sans">
              سعر الإيداع لليلة واحدة
            </span>
            <span className="text-xl font-black text-white">
              {overview.cbeData.overnightDepositRate}%
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1 font-sans">
              التضخم العام السنوي
            </span>
            <span className="text-xl font-black text-amber-400">
              {overview.cbeData.headlineInflationRate}%
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1 font-sans">
              التضخم الأساسي (Core)
            </span>
            <span className="text-xl font-black text-cyan-400">
              {overview.cbeData.coreInflationRate}%
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1 font-sans">
              سعر صرف USD/EGP
            </span>
            {typeof overview.cbeData.fxUsdEgpRate === 'number' ? (
              <>
                <span className="text-xl font-black text-emerald-400">
                  {overview.cbeData.fxUsdEgpRate} جم
                </span>
                <span className="block text-[10px] text-slate-500 mt-0.5 font-sans">
                  {overview.cbeData.fxStatus === 'LIVE' ? 'سعر حي' : overview.cbeData.fxStatus}
                </span>
              </>
            ) : (
              <span className="text-sm font-bold text-rose-400 font-sans">
                غير متاح (تعطل المصدر)
              </span>
            )}
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[11px] mb-1 font-sans">
              الاحتياطي النقدي الأجنبي
            </span>
            <span className="text-xl font-black text-white">
              ${overview.cbeData.foreignReservesBillionUsd}B
            </span>
          </div>
        </div>
      </div>

      {/* Market Breadth & Liquidity Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              {lang === 'ar'
                ? 'عمق واتساع تداولات السوق (Market Breadth)'
                : 'Market Breadth'}
            </h3>
          </div>

          {totalBreadth === 0 ? (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-amber-300">
              بيانات اتساع السوق غير متاحة حالياً — لم تصل تحديثات الأسهم من المزود الحي بعد.
            </div>
          ) : (
            <div className="space-y-3 font-mono-numbers">
              <div>
                <div className="flex justify-between text-xs mb-1 text-slate-300">
                  <span className="text-emerald-400 font-bold">{adv} سهم صاعد</span>
                  <span className="text-rose-400 font-bold">{dec} سهم هابط</span>
                </div>
                <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${(adv / totalBreadth) * 100}%` }}
                  ></div>
                  <div
                    className="bg-slate-700 h-full"
                    style={{ width: `${(unc / totalBreadth) * 100}%` }}
                  ></div>
                  <div
                    className="bg-rose-500 h-full"
                    style={{ width: `${(dec / totalBreadth) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2">
                <div className="bg-slate-950 p-2 rounded-lg border border-emerald-900/30">
                  <span className="text-slate-400 block text-[10px] font-sans">الأسهم الرابحة</span>
                  <strong className="text-emerald-400 text-sm">{adv}</strong>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px] font-sans">دون تغيير</span>
                  <strong className="text-slate-300 text-sm">{unc}</strong>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-rose-900/30">
                  <span className="text-slate-400 block text-[10px] font-sans">الأسهم الخاسرة</span>
                  <strong className="text-rose-400 text-sm">{dec}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              {lang === 'ar' ? 'إجمالي السيولة وأحجام التداول' : 'Market Liquidity'}
            </h3>
          </div>

          <div className="space-y-3 font-mono-numbers">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-xs font-sans">قيمة التداول الإجمالية:</span>
              <strong className="text-lg text-white font-black">
                {typeof overview.totalTurnoverEgp === 'number'
                  ? `${(overview.totalTurnoverEgp / 1000000000).toFixed(2)} مليار جنيه`
                  : 'غير متاح'}
              </strong>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-xs font-sans">إجمالي كمية الأسهم المتداولة:</span>
              <strong className="text-lg text-cyan-400 font-black">
                {typeof overview.totalVolume === 'number'
                  ? `${(overview.totalVolume / 1000000).toFixed(1)} مليون سهم`
                  : 'غير متاح'}
              </strong>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-xs font-sans">الأسهم التي وصلت بياناتها الحية:</span>
              <strong className="text-lg text-emerald-400 font-black">
                {typeof overview.syncedStocksCount === 'number'
                  ? `${overview.syncedStocksCount} / ${overview.totalListedStocksCount ?? 0} سهم`
                  : 'غير متاح'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Top Gainers / Top Losers / Top Liquidity */}
      {(overview.topGainers?.length > 0 || overview.topLosers?.length > 0 || overview.topLiquidity?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {[
            { title: lang === 'ar' ? 'الأكثر صعوداً في الجلسة' : 'Top Gainers', rows: overview.topGainers || [], accent: 'text-emerald-400' },
            { title: lang === 'ar' ? 'الأكثر هبوطاً في الجلسة' : 'Top Losers', rows: overview.topLosers || [], accent: 'text-rose-400' },
            { title: lang === 'ar' ? 'الأعلى سيولة تداول' : 'Top Liquidity', rows: overview.topLiquidity || [], accent: 'text-cyan-400' }
          ].map((panel) => (
            <div key={panel.title} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2.5">
              <h4 className={`font-bold ${panel.accent}`}>{panel.title}</h4>
              <div className="space-y-1.5 font-mono-numbers">
                {panel.rows.slice(0, 4).map((r: any) => (
                  <div key={r.ticker} className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="min-w-0 font-sans">
                      <span className="font-mono font-bold text-white">{r.ticker}</span>
                      <span className="text-[11px] text-slate-400 block truncate">{r.nameAr}</span>
                    </div>
                    <div className="text-left shrink-0">
                      <span className="font-bold text-white block">{r.currentPrice}</span>
                      <span className={`text-[11px] font-bold ${r.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.changePct >= 0 ? `+${r.changePct}%` : `${r.changePct}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
