import React, { useState, useMemo, useEffect } from 'react';
import { EGXStockSummary } from '../../types';
import { Filter, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSearchRelevanceScore } from '../../utils/searchUtils';

interface ScreenerViewProps {
  stocks: EGXStockSummary[];
  onSelectStock: (ticker: string) => void;
  lang?: 'ar' | 'en';
}

const PAGE_SIZE = 50;

function compareNullableNumbers(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: 'asc' | 'desc'
): number {
  const aValid = typeof a === 'number' && Number.isFinite(a);
  const bValid = typeof b === 'number' && Number.isFinite(b);
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1; // Always push missing values to the bottom
  if (!bValid) return -1;
  return direction === 'desc' ? (b as number) - (a as number) : (a as number) - (b as number);
}

export const ScreenerView: React.FC<ScreenerViewProps> = ({
  stocks,
  onSelectStock,
  lang = 'ar'
}) => {
  const [search, setSearch] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [selectedRec, setSelectedRec] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedIndex, setSelectedIndex] = useState('ALL');
  const [sortBy, setSortBy] = useState<'SCORE' | 'UPSIDE' | 'PRICE' | 'PE' | 'RSI'>('SCORE');
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const sectors = useMemo(() => {
    return Array.from(new Set(stocks.map(s => s.sectorAr))).sort();
  }, [stocks]);

  const filtered = useMemo(() => {
    const trimmed = search.trim();
    const list = stocks
      .map(s => ({
        stock: s,
        rel: trimmed ? getSearchRelevanceScore(s, trimmed) : 0
      }))
      .filter(({ stock: s, rel }) => {
        const matchesSearch = !trimmed || rel > 0;
        const matchesSector = selectedSector === 'ALL' || s.sectorAr === selectedSector;
        const matchesRec = selectedRec === 'ALL' || s.recommendationBadge === selectedRec;
        const matchesCategory = selectedCategory === 'ALL' || s.screenerCategory === selectedCategory;
        const matchesIndex = selectedIndex === 'ALL' || s.index === selectedIndex;
        return matchesSearch && matchesSector && matchesRec && matchesCategory && matchesIndex;
      })
      .sort((a, b) => {
        if (trimmed && b.rel !== a.rel) return b.rel - a.rel;
        if (sortBy === 'SCORE') return compareNullableNumbers(a.stock.quickScore, b.stock.quickScore, 'desc');
        if (sortBy === 'UPSIDE') return compareNullableNumbers(a.stock.fairValueUpsidePct, b.stock.fairValueUpsidePct, 'desc');
        if (sortBy === 'PRICE') return compareNullableNumbers(a.stock.currentPrice, b.stock.currentPrice, 'desc');
        if (sortBy === 'PE') return compareNullableNumbers(a.stock.peRatio, b.stock.peRatio, 'asc');
        if (sortBy === 'RSI') return compareNullableNumbers(a.stock.rsi14, b.stock.rsi14, 'desc');
        return 0;
      });
    return list.map(i => i.stock);
  }, [stocks, search, selectedSector, selectedRec, selectedCategory, selectedIndex, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedSector, selectedRec, selectedCategory, selectedIndex, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const displayed = showAll ? filtered : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-emerald-400" />
          <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">
            {lang === 'ar'
              ? `الماسح الفني والمالي الشامل (${stocks.length} سهم مصري)`
              : `EGX AI Stock Screener (${stocks.length} Stocks)`}
          </span>
        </div>
        <h1 className="text-2xl font-black text-white">
          {lang === 'ar'
            ? 'مسح وتصفية أسهم البورصة المصرية وفق الأرقام الحسابية الحقيقية'
            : 'Scan & Screen All EGX Equities'}
        </h1>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={lang === 'ar' ? 'ابحث باسم السهم أو الكود أو ISIN...' : 'Search by name, ticker, or ISIN...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl ps-9 pe-8 py-2 text-white placeholder-slate-500 outline-none focus:border-emerald-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sector filter */}
          <div>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 cursor-pointer transition-colors"
            >
              <option value="ALL">{lang === 'ar' ? 'كافة القطاعات' : 'All Sectors'}</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* 7-Class Screener Category filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 cursor-pointer transition-colors"
            >
              <option value="ALL">{lang === 'ar' ? 'كافة التصنيفات الفنية' : 'All Screener Categories'}</option>
              <option value="EARLY_LAUNCH_CANDIDATE">مرشح لانطلاقة مبكرة</option>
              <option value="NEAR_BREAKOUT">قريب من الاختراق</option>
              <option value="CONFIRMED_BREAKOUT">اختراق مؤكد</option>
              <option value="CONTINUING_UPTREND">اتجاه صاعد مستمر</option>
              <option value="WATCHLIST">سهم يحتاج مراقبة</option>
              <option value="WEAK_OR_HIGH_RISK">سهم ضعيف أو عالي المخاطر</option>
              <option value="INSUFFICIENT_DATA">بيانات غير كافية</option>
            </select>
          </div>

          {/* Recommendation filter */}
          <div>
            <select
              value={selectedRec}
              onChange={(e) => setSelectedRec(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 cursor-pointer transition-colors"
            >
              <option value="ALL">{lang === 'ar' ? 'كافة الحالات' : 'All Recommendations'}</option>
              <option value="STRONG_BUY">شراء قوي (STRONG BUY)</option>
              <option value="BUY">شراء (BUY)</option>
              <option value="HOLD">احتفاظ (HOLD)</option>
              <option value="WAIT">ترقب (WAIT)</option>
              <option value="REDUCE">تخفيف (REDUCE)</option>
              <option value="INSUFFICIENT_DATA">بيانات غير كافية</option>
            </select>
          </div>

          {/* Index filter */}
          <div>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 cursor-pointer transition-colors"
            >
              <option value="ALL">{lang === 'ar' ? 'كافة المؤشرات' : 'All Indices'}</option>
              <option value="EGX30">EGX30</option>
              <option value="EGX70">EGX70</option>
              <option value="EGX100">EGX100</option>
            </select>
          </div>
        </div>

        {/* Quick Sorting Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-xs">
          <span className="text-slate-400">
            {lang === 'ar'
              ? `نتائج الفحص: ${filtered.length} سهم من إجمالي ${stocks.length}`
              : `Results: ${filtered.length} of ${stocks.length} stocks`}
          </span>

          <div className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="text-slate-500 me-1">{lang === 'ar' ? 'ترتيب حسب:' : 'Sort by:'}</span>
            <button
              onClick={() => setSortBy('SCORE')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                sortBy === 'SCORE' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'التقييم الكلي' : 'Overall Score'}
            </button>
            <button
              onClick={() => setSortBy('UPSIDE')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                sortBy === 'UPSIDE' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'هامش الأمان للقيمة العادلة' : 'Fair Value Margin'}
            </button>
            <button
              onClick={() => setSortBy('PE')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                sortBy === 'PE' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'مكرر الربحية (P/E الأقل)' : 'Lowest P/E'}
            </button>
            <button
              onClick={() => setSortBy('RSI')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                sortBy === 'RSI' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'مؤشر العزم RSI' : 'RSI'}
            </button>
          </div>
        </div>
      </div>

      {/* Screener Results Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold">
                <th className="py-3 px-4">{lang === 'ar' ? 'رمز السهم والاسم' : 'Ticker / Company'}</th>
                <th className="py-3 px-3">{lang === 'ar' ? 'القطاع والمؤشر' : 'Sector / Index'}</th>
                <th className="py-3 px-3 font-mono-numbers">{lang === 'ar' ? 'السعر الحالي' : 'Price'}</th>
                <th className="py-3 px-3 font-mono-numbers">{lang === 'ar' ? 'التغير' : 'Change'}</th>
                <th className="py-3 px-3 font-mono-numbers">{lang === 'ar' ? 'القيمة العادلة' : 'Fair Value'}</th>
                <th className="py-3 px-3 font-mono-numbers">{lang === 'ar' ? 'هامش الأمان' : 'Margin %'}</th>
                <th className="py-3 px-3 font-mono-numbers">{lang === 'ar' ? 'مكرر P/E' : 'P/E'}</th>
                <th className="py-3 px-3 font-mono-numbers">{lang === 'ar' ? 'RSI (14)' : 'RSI'}</th>
                <th className="py-3 px-3 font-mono-numbers">{lang === 'ar' ? 'التقييم' : 'Score'}</th>
                <th className="py-3 px-4">{lang === 'ar' ? 'القرار والسبب الحسابي' : 'Decision & Formula'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono-numbers">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400 font-sans">
                    {lang === 'ar' ? 'لا توجد أسهم مطابقة لمعايير البحث والتصفية الحالية' : 'No stocks match the selected criteria'}
                  </td>
                </tr>
              ) : (
                displayed.map((stock) => {
                  const unit = stock.currency === 'USD' ? '$' : 'جم';
                  const hasUpside = stock.fairValueUpsidePct !== null;
                  return (
                    <tr
                      key={stock.ticker}
                      onClick={() => onSelectStock(stock.ticker)}
                      className="hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">
                            {stock.ticker}
                          </span>
                          {stock.priceDate && (stock.isStaleQuote || !stock.isLiveQuote) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              {stock.priceDate}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-sans block">{stock.nameAr}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="text-slate-300 font-sans block">{stock.sectorAr}</span>
                        <span className="text-[10px] text-slate-500 font-bold">{stock.index}</span>
                      </td>

                      <td className="py-3 px-3 font-bold text-white text-sm">
                        {stock.currentPrice > 0 ? `${stock.currentPrice} ${unit}` : 'غير متاح'}
                      </td>

                      <td className={`py-3 px-3 font-bold ${stock.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stock.changePct >= 0 ? `+${stock.changePct}%` : `${stock.changePct}%`}
                      </td>

                      <td className="py-3 px-3 font-bold text-slate-200">
                        {stock.fairValue !== null ? `${stock.fairValue} ${unit}` : '—'}
                      </td>

                      <td
                        className={`py-3 px-3 font-bold ${
                          !hasUpside
                            ? 'text-slate-500'
                            : (stock.fairValueUpsidePct ?? 0) >= 0
                            ? 'text-cyan-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {hasUpside
                          ? (stock.fairValueUpsidePct as number) >= 0
                            ? `+${stock.fairValueUpsidePct}%`
                            : `${stock.fairValueUpsidePct}%`
                          : '—'}
                      </td>

                      <td className="py-3 px-3 text-slate-300">
                        {stock.peRatio !== null ? `${stock.peRatio}x` : '—'}
                      </td>

                      <td className="py-3 px-3 text-purple-300">
                        {stock.rsi14 !== null ? stock.rsi14 : '—'}
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-bold text-white px-2 py-0.5 rounded bg-slate-800 block w-fit">
                          {stock.quickScore !== null ? `${stock.quickScore}/100` : '—'}
                        </span>
                        {typeof stock.confidencePct === 'number' && stock.confidencePct > 0 && (
                          <span className="text-[10px] text-cyan-400 block mt-0.5">
                            ثقة {stock.confidencePct}%
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-sans">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-block ${
                              stock.recommendationBadge === 'STRONG_BUY'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : stock.recommendationBadge === 'BUY'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : stock.recommendationBadge === 'REDUCE'
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                : stock.recommendationBadge === 'INSUFFICIENT_DATA'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {stock.screenerCategoryAr || stock.recommendationBadgeAr}
                          </span>
                          {stock.falseBreakoutWarning && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              اختراق كاذب محتمل
                            </span>
                          )}
                        </div>
                        {stock.mathReasonAr && (
                          <span
                            title={stock.mathReasonAr}
                            className="block text-[10px] text-slate-400 mt-1 line-clamp-1 max-w-[230px]"
                          >
                            {stock.mathReasonAr}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950/70 border-t border-slate-800 text-xs">
            <div className="text-slate-400">
              {showAll
                ? (lang === 'ar' ? `عرض كافة الأسهم (${filtered.length})` : `Showing all ${filtered.length} stocks`)
                : (lang === 'ar'
                    ? `عرض ${(page - 1) * PAGE_SIZE + 1} إلى ${Math.min(page * PAGE_SIZE, filtered.length)} من ${filtered.length} سهم`
                    : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`)}
            </div>

            <div className="flex items-center gap-2">
              {!showAll && (
                <>
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="font-mono-numbers text-slate-300 px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => setShowAll(s => !s)}
                className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 hover:bg-slate-800 font-semibold"
              >
                {showAll
                  ? (lang === 'ar' ? 'عرض صفحات (50/صفحة)' : 'Paginate (50/page)')
                  : (lang === 'ar' ? `عرض الكل (${filtered.length})` : `Show All (${filtered.length})`)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
