import React, { useState } from 'react';
import { Briefcase, Plus, Trash2, ShieldCheck, AlertTriangle, Clock, Sigma } from 'lucide-react';
import { EGXStockSummary } from '../../types';

interface PortfolioViewProps {
  portfolio: any;
  stocks: EGXStockSummary[];
  onAddTransaction: (ticker: string, shares: number, buyPrice: number) => void;
  onRemoveTransaction: (ticker: string) => void;
  onSelectStock: (ticker: string) => void;
  lang?: 'ar' | 'en';
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  portfolio,
  stocks,
  onAddTransaction,
  onRemoveTransaction,
  onSelectStock,
  lang = 'ar'
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [ticker, setTicker] = useState('COMI');
  const [shares, setShares] = useState(1000);
  const [buyPrice, setBuyPrice] = useState(85.0);

  if (!portfolio) return null;

  const holdings = Array.isArray(portfolio.holdings) ? portfolio.holdings : [];
  const totalCost = typeof portfolio.totalCost === 'number' ? portfolio.totalCost : 0;
  const totalMarketValue = typeof portfolio.totalMarketValue === 'number' ? portfolio.totalMarketValue : 0;
  const totalUnrealizedPl = typeof portfolio.totalUnrealizedPl === 'number' ? portfolio.totalUnrealizedPl : 0;
  const totalUnrealizedPlPct = typeof portfolio.totalUnrealizedPlPct === 'number' ? portfolio.totalUnrealizedPlPct : 0;
  const cashBalance = typeof portfolio.cashBalance === 'number' ? portfolio.cashBalance : 0;
  const totalEquity = typeof portfolio.totalEquity === 'number' ? portfolio.totalEquity : totalMarketValue + cashBalance;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-emerald-400" />
            <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">
              {lang === 'ar' ? 'المحفظة الاستثمارية والمحلل الذكي للمراكز' : 'Portfolio Management'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">
            {lang === 'ar' ? 'إدارة مراكز المحفظة والتوصيات الحسابية لكل سهم' : 'Holdings & AI Action Advisor'}
          </h1>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'إضافة صفقة / شراء سهم' : 'Add Position'}
        </button>
      </div>

      {/* Transparency & Freshness Banner */}
      <div className={`rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2 ${
        portfolio.priceSyncStatus === 'FAILED'
          ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          : portfolio.priceSyncStatus === 'STALE'
          ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
          : 'bg-slate-900/80 border-slate-800 text-slate-300'
      }`}>
        <div className="flex items-center gap-2">
          {portfolio.priceSyncStatus === 'FAILED' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{portfolio.isSamplePortfolioNoteAr}</span>
        </div>
        {portfolio.lastSyncedAt && (
          <span className="text-[11px] font-mono text-slate-400">
            {lang === 'ar'
              ? `آخر مزامنة أسعار: ${String(portfolio.lastSyncedAt).replace('T', ' ').substring(0, 16)}`
              : `Synced: ${String(portfolio.lastSyncedAt).replace('T', ' ').substring(0, 16)}`}
          </span>
        )}
      </div>

      {/* Portfolio Financial Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 font-mono-numbers">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <span className="text-xs text-slate-400 block mb-1 font-sans">
            {lang === 'ar' ? 'القيمة السوقية للأسهم' : 'Current Market Value'}
          </span>
          <span className="text-2xl font-black text-white">{totalMarketValue.toLocaleString()} جم</span>
          <span className="text-[10px] text-slate-500 block mt-1 font-sans">
            {lang === 'ar' ? `التكلفة: ${totalCost.toLocaleString()} جم` : `Cost: ${totalCost.toLocaleString()}`}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <span className="text-xs text-slate-400 block mb-1 font-sans">
            {lang === 'ar' ? 'الأرباح / الخسائر غير المحققة' : 'Unrealized P&L'}
          </span>
          <div className={`text-2xl font-black flex items-center gap-1 ${totalUnrealizedPl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalUnrealizedPl >= 0 ? '+' : ''}{totalUnrealizedPl.toLocaleString()} جم
          </div>
          <span className={`text-xs font-bold ${totalUnrealizedPlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ({totalUnrealizedPlPct >= 0 ? '+' : ''}{totalUnrealizedPlPct}%)
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <span className="text-xs text-slate-400 block mb-1 font-sans">
            {lang === 'ar' ? 'إجمالي صافي المحفظة' : 'Total Portfolio Equity'}
          </span>
          <span className="text-2xl font-black text-emerald-400">{totalEquity.toLocaleString()} جم</span>
          <span className="text-[10px] text-slate-500 block mt-1 font-sans">
            {lang === 'ar' ? `${holdings.length} مراكز مسجلة` : `${holdings.length} positions`}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <span className="text-xs text-slate-400 block mb-1 font-sans">
            {lang === 'ar' ? 'السيولة النقدية المسجلة (Cash)' : 'Available Cash'}
          </span>
          <span className="text-2xl font-black text-cyan-400">{cashBalance.toLocaleString()} جم</span>
          <span className="text-[10px] text-slate-500 block mt-1 font-sans">
            {lang === 'ar' ? 'لا تُحتسب أرصدة افتراضية' : 'No fabricated cash'}
          </span>
        </div>
      </div>

      {/* Holdings Table with Algorithmic Portfolio Advisor */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              {lang === 'ar' ? 'مراكز الأسهم والقرارات الحسابية (Portfolio Advisor)' : 'Holdings & Algorithmic Actions'}
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            {lang === 'ar' ? 'مبنية على تكلفة الشراء الفعلية ومعادلات القيمة العادلة' : 'Anchored to actual cost basis & fair value'}
          </span>
        </div>

        {holdings.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <Briefcase className="w-8 h-8 text-slate-500 mx-auto" />
            <div className="text-sm font-bold text-white">
              {lang === 'ar' ? 'محفظتك فارغة حالياً' : 'Your portfolio is empty'}
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {lang === 'ar'
                ? 'تم إلغاء المحفظة الوهمية الافتراضية. أضف صفقاتك الفعلية ليتم تقييمها بالأسعار الحية وحساب هامش الأمان لكل مركز.'
                : 'Sample holdings removed. Add your real positions to evaluate them against live prices and computed fair value.'}
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Plus className="w-4 h-4" />
              {lang === 'ar' ? 'إضافة أول مركز استثماري' : 'Add First Position'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold font-mono-numbers">
                  <th className="py-2.5 px-3 text-right font-sans">{lang === 'ar' ? 'السهم' : 'Stock'}</th>
                  <th className="py-2.5 px-3">{lang === 'ar' ? 'الكمية' : 'Shares'}</th>
                  <th className="py-2.5 px-3">{lang === 'ar' ? 'متوسط الشراء' : 'Avg Cost'}</th>
                  <th className="py-2.5 px-3">{lang === 'ar' ? 'السعر السوقي' : 'Market Price'}</th>
                  <th className="py-2.5 px-3">{lang === 'ar' ? 'القيمة الحالية' : 'Position Value'}</th>
                  <th className="py-2.5 px-3">{lang === 'ar' ? 'الربح / الخسارة' : 'P&L'}</th>
                  <th className="py-2.5 px-3">{lang === 'ar' ? 'الوزن' : 'Weight %'}</th>
                  <th className="py-2.5 px-3 font-sans">{lang === 'ar' ? 'التوصية والسبب الحسابي' : 'Action & Formula'}</th>
                  <th className="py-2.5 px-3 font-sans">{lang === 'ar' ? 'حذف' : 'Manage'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono-numbers">
                {holdings.map((h: any) => {
                  const st = stocks.find(s => s.ticker === h.ticker);
                  const unit = st?.currency === 'USD' ? '$' : 'جم';
                  const hasPrice = typeof h.currentPrice === 'number';
                  const hasVal = typeof h.currentValue === 'number';
                  const hasPl = typeof h.unrealizedPl === 'number' && typeof h.unrealizedPlPct === 'number';

                  return (
                    <tr key={h.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3 cursor-pointer" onClick={() => onSelectStock(h.ticker)}>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm">{h.ticker}</span>
                          {h.priceDate && !h.isLiveQuote && (
                            <span className="text-[10px] text-amber-400">({h.priceDate})</span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-sans block">
                          {st?.nameAr || h.ticker}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-bold text-white">
                        {Number(h.sharesCount || 0).toLocaleString()}
                      </td>

                      <td className="py-3 px-3 text-slate-300">
                        {h.avgBuyPrice} {unit}
                      </td>

                      <td className="py-3 px-3 font-bold text-white">
                        {hasPrice ? `${h.currentPrice} ${unit}` : 'غير متاح'}
                      </td>

                      <td className="py-3 px-3 text-slate-200">
                        {hasVal ? `${h.currentValue.toLocaleString()} ${unit}` : '—'}
                      </td>

                      <td className={`py-3 px-3 font-bold ${!hasPl ? 'text-slate-400' : h.unrealizedPl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {hasPl
                          ? `${h.unrealizedPl >= 0 ? '+' : ''}${h.unrealizedPl.toLocaleString()} ${unit} (${h.unrealizedPlPct >= 0 ? '+' : ''}${h.unrealizedPlPct}%)`
                          : 'غير متاح'}
                      </td>

                      <td className="py-3 px-3 text-cyan-400 font-bold">
                        {h.allocationPct ?? 0}%
                      </td>

                      <td className="py-3 px-3 font-sans max-w-xs">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-block ${
                          h.aiAction === 'HOLD'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : h.aiAction === 'ADD'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : h.aiAction === 'REDUCE'
                            ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                            : h.aiAction === 'INSUFFICIENT_DATA'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}>
                          {h.aiActionAr}
                        </span>
                        <span className="text-[11px] text-slate-300 block mt-1 leading-snug">
                          {h.aiActionReasonAr}
                        </span>
                        {h.aiActionFormulaAr && (
                          <span className="text-[10px] text-slate-400 flex items-start gap-1 mt-0.5 leading-snug">
                            <Sigma className="w-3 h-3 text-cyan-400 shrink-0 mt-0.5" />
                            <span>{h.aiActionFormulaAr}</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-sans">
                        <button
                          onClick={() => onRemoveTransaction(h.ticker)}
                          className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors"
                          title={lang === 'ar' ? 'حذف المركز' : 'Remove position'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Position Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              {lang === 'ar' ? 'إضافة مركز استثماري جديد' : 'Add Stock Position'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">{lang === 'ar' ? 'اختر السهم من البورصة المصرية:' : 'Stock Ticker:'}</label>
                <select
                  value={ticker}
                  onChange={(e) => {
                    setTicker(e.target.value);
                    const st = stocks.find(s => s.ticker === e.target.value);
                    if (st && st.currentPrice > 0) setBuyPrice(st.currentPrice);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-emerald-500"
                >
                  {stocks.map(s => (
                    <option key={s.ticker} value={s.ticker}>
                      {s.ticker} - {s.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">{lang === 'ar' ? 'عدد الأسهم (الكمية):' : 'Number of Shares:'}</label>
                <input
                  type="number"
                  min={1}
                  value={shares}
                  onChange={(e) => setShares(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono-numbers outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">{lang === 'ar' ? 'سعر الشراء الفعلي:' : 'Buy Price:'}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(Math.max(0.01, Number(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono-numbers outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  onAddTransaction(ticker, shares, buyPrice);
                  setShowAddModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {lang === 'ar' ? 'حفظ وتحديث المحفظة' : 'Save Position'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
