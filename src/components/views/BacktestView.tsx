import React, { useState, useEffect } from 'react';
import { TestTube2, Play, AlertTriangle, Clock, Info } from 'lucide-react';
import { EGXStockSummary } from '../../types';

import { safeFetchJson } from '../../utils/apiClient';

interface BacktestViewProps {
  stocks: EGXStockSummary[];
  lang?: 'ar' | 'en';
}

export const BacktestView: React.FC<BacktestViewProps> = ({ stocks, lang = 'ar' }) => {
  const [strategyId, setStrategyId] = useState('SWING_TREND_PULLBACK');
  const [ticker, setTicker] = useState('COMI');
  const [capital, setCapital] = useState(1000000);
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const selectedStock = stocks.find(s => s.ticker === ticker);
  const unit = selectedStock?.currency === 'USD' ? '$' : 'جم';

  const runBacktest = async () => {
    setRunning(true);
    setFetchError(null);
    try {
      const d = await safeFetchJson<any>(
        '/api/backtest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategyId, ticker, initialCapitalEgp: capital })
        },
        lang
      );
      setResult(d);
    } catch (err: any) {
      console.error(err);
      setFetchError(err?.message || (lang === 'ar' ? 'تعذر تشغيل الاختبار التاريخي' : 'Backtest request failed'));
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runBacktest();
  }, [strategyId, ticker]);

  const isOk = result && result.status === 'OK';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TestTube2 className="w-4 h-4 text-emerald-400" />
          <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">
            {lang === 'ar' ? 'محرك الاختبار التاريخي للاستراتيجيات (Strategy Backtester)' : 'Strategy Backtesting Engine'}
          </span>
        </div>
        <h1 className="text-2xl font-black text-white">
          {lang === 'ar' ? 'اختبار استراتيجيات التداول المتأرجح على الشموع التاريخية الحقيقية' : 'Historical Strategy Simulator'}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {lang === 'ar'
            ? 'محاكاة زمنية متسلسلة (Walk-Forward) على بيانات Yahoo Finance الفعلية بمراعاة عمولات التداول (0.3%) والانزلاق السعري (0.1%) دون أي تحيز مستقبلي.'
            : 'Walk-forward simulation on verified OHLCV bars with commission and slippage.'}
        </p>
      </div>

      {/* Control Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1.5 font-bold">
              {lang === 'ar' ? 'اختر الاستراتيجية:' : 'Select Strategy:'}
            </label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-emerald-500 font-semibold"
            >
              <option value="SWING_TREND_PULLBACK">التداول المتأرجح مع الاتجاه (EMA20/50 + RSI Pullback)</option>
              <option value="BREAKOUT_MOMENTUM">اختراق القمم وطفرة السيولة (Breakout Momentum)</option>
              <option value="VALUE_MOMENTUM">القيمة العادلة المزدوجة (Fair Value + Technical Reversal)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1.5 font-bold">
              {lang === 'ar' ? 'السهم محل الاختبار:' : 'Stock to Test:'}
            </label>
            <select
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-emerald-500 font-semibold"
            >
              {stocks.map(s => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker} - {s.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1.5 font-bold">
              {lang === 'ar' ? 'رأس المال المبدئي:' : 'Initial Capital:'}
            </label>
            <input
              type="number"
              min={10000}
              value={capital}
              onChange={(e) => setCapital(Math.max(10000, Number(e.target.value) || 100000))}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono-numbers outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
          <span className="text-xs text-slate-400 flex-1 min-w-[200px]">
            {result?.strategyDescriptionAr}
          </span>
          <button
            onClick={runBacktest}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'جاري الحساب...' : 'إعادة تشغيل الاختبار'}
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl px-4 py-3 text-xs text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Result Section */}
      {result && !isOk && (
        <div className="bg-rose-950/30 border border-rose-500/40 rounded-2xl p-6 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">
            {lang === 'ar' ? `بيانات غير كافية لاختبار سهم ${result.ticker}` : 'Insufficient Data for Backtest'}
          </h3>
          <p className="text-xs text-rose-200 max-w-xl mx-auto leading-relaxed">
            {result.errorAr || 'لا تتوافر 60 شمعة تاريخية فعلية على الأقل لتشغيل المحاكاة.'}
          </p>
        </div>
      )}

      {isOk && (
        <>
          {/* Source & Period Provenance */}
          <div className={`rounded-xl border px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 ${
            result.isStaleData
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              : 'bg-slate-900/80 border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                المصدر: <strong>{result.dataSourceAr}</strong> · عدد الجلسات المختبرة: <strong className="font-mono">{result.candlesUsedCount}</strong> ({result.periodTested})
              </span>
            </div>
            {result.lastCandleDate && (
              <span className="text-[11px] font-mono text-slate-400">
                أحدث شمعة: {result.lastCandleDate}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 font-mono-numbers">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">صافي العائد التراكمي</span>
              <span className={`text-2xl font-black ${(result.totalReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {typeof result.totalReturnPct === 'number'
                  ? `${result.totalReturnPct >= 0 ? '+' : ''}${result.totalReturnPct}%`
                  : '—'}
              </span>
              <span className="text-[10px] text-slate-400 block font-sans">
                {typeof result.alphaGeneratedPct === 'number' && typeof result.benchmarkStockBuyHoldPct === 'number'
                  ? `فارق مقابل الاحتفاظ بالسهم (${result.benchmarkStockBuyHoldPct}%): ${result.alphaGeneratedPct >= 0 ? '+' : ''}${result.alphaGeneratedPct}%`
                  : 'مقارنة الاحتفاظ غير متاحة'}
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">صافي الأرباح / الخسائر</span>
              <span className={`text-2xl font-black ${(result.totalNetProfitEgp ?? 0) >= 0 ? 'text-white' : 'text-rose-400'}`}>
                {typeof result.totalNetProfitEgp === 'number'
                  ? `${result.totalNetProfitEgp >= 0 ? '+' : ''}${result.totalNetProfitEgp.toLocaleString()} جم`
                  : '—'}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">
                الرصيد النهائي: {typeof result.finalEquityEgp === 'number' ? `${result.finalEquityEgp.toLocaleString()} جم` : '—'}
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">نسبة الصفقات الرابحة</span>
              <span className="text-2xl font-black text-emerald-400">
                {result.winRatePct !== null ? `${result.winRatePct}%` : '—'}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">
                {result.winningTradesCount} رابحة / {result.losingTradesCount} خاسرة
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">معامل الربح (Profit Factor)</span>
              <span className="text-2xl font-black text-cyan-400">
                {result.profitFactor !== null ? `${result.profitFactor}x` : '—'}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">
                Sharpe Ratio: {result.sharpeRatio !== null ? result.sharpeRatio : '—'}
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">أقصى تراجع (Max DD)</span>
              <span className="text-2xl font-black text-rose-400">
                {result.maxDrawdownPct !== null ? `-${result.maxDrawdownPct}%` : '0%'}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">محسوب عبر المنحنى التاريخي</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
              <span className="text-[11px] text-slate-400 block font-sans mb-1">إجمالي العمولات المدفوعة</span>
              <span className="text-xl font-black text-amber-400">
                {(result.commissionPaidTotalEgp ?? 0).toLocaleString()} جم
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">0.3% عمولة + 0.1% انزلاق</span>
            </div>
          </div>

          {/* Out-of-Sample / Walk-Forward / Regime Breakdown */}
          {(result.inSampleMetrics || result.outOfSampleMetrics || (result.regimePerformance && result.regimePerformance.length > 0)) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {(result.inSampleMetrics || result.outOfSampleMetrics) && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-white">اختبار خارج العينة والتقسيم الزمني (Walk-Forward)</h4>
                    {typeof result.sameBarConflictsCount === 'number' && (
                      <span className="text-[10px] text-amber-300 font-mono">
                        تعارضات نفس الشمعة: {result.sameBarConflictsCount}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 font-mono-numbers">
                    {result.inSampleMetrics && (
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-sans">{result.inSampleMetrics.periodLabel}</span>
                        <span className={`text-base font-bold ${result.inSampleMetrics.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {result.inSampleMetrics.totalReturnPct >= 0 ? '+' : ''}{result.inSampleMetrics.totalReturnPct}%
                        </span>
                        <span className="text-[10px] text-slate-500 block font-sans">
                          {result.inSampleMetrics.tradesCount} صفقة | فوز {result.inSampleMetrics.winRatePct ?? '—'}%
                        </span>
                      </div>
                    )}
                    {result.outOfSampleMetrics && (
                      <div className="bg-slate-950 p-3 rounded-xl border border-cyan-500/30">
                        <span className="text-[10px] text-cyan-300 block font-sans">{result.outOfSampleMetrics.periodLabel}</span>
                        <span className={`text-base font-bold ${result.outOfSampleMetrics.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {result.outOfSampleMetrics.totalReturnPct >= 0 ? '+' : ''}{result.outOfSampleMetrics.totalReturnPct}%
                        </span>
                        <span className="text-[10px] text-slate-500 block font-sans">
                          {result.outOfSampleMetrics.tradesCount} صفقة | فوز {result.outOfSampleMetrics.winRatePct ?? '—'}%
                        </span>
                      </div>
                    )}
                  </div>
                  {Array.isArray(result.walkForwardFolds) && result.walkForwardFolds.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 font-mono-numbers">
                      {result.walkForwardFolds.map((f: any, idx: number) => (
                        <div key={idx} className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80 text-[11px]">
                          <span className="text-slate-400 block text-[10px] font-sans">{f.periodLabel}</span>
                          <span className={f.totalReturnPct >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {f.totalReturnPct >= 0 ? '+' : ''}{f.totalReturnPct}%
                          </span>
                          <span className="text-slate-500 block text-[10px]">{f.tradesCount} صفقات</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {Array.isArray(result.regimePerformance) && result.regimePerformance.length > 0 && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <h4 className="font-bold text-white">الأداء حسب حالة السوق (Market Regime)</h4>
                  <div className="grid grid-cols-3 gap-2.5 font-mono-numbers">
                    {result.regimePerformance.map((r: any) => (
                      <div key={r.regime} className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[11px] text-slate-300 font-bold block font-sans">{r.regimeAr}</span>
                        <span className={`text-base font-black block mt-1 ${r.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {r.totalReturnPct >= 0 ? '+' : ''}{r.totalReturnPct}%
                        </span>
                        <span className="text-[10px] text-slate-500 block font-sans">
                          {r.tradesCount} صفقات | فوز {r.winRatePct ?? '—'}%
                        </span>
                      </div>
                    ))}
                  </div>
                  {result.disclaimerAr && (
                    <p className="text-[11px] text-slate-400 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                      {result.disclaimerAr}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trade Executions Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-3">
            <h3 className="text-base font-bold text-white">
              {lang === 'ar' ? `سجل العمليات المنفذة في الاختبار التاريخي (${result.totalTradesCount} صفقة):` : `Simulated Trade Log (${result.totalTradesCount}):`}
            </h3>

            {result.recentTrades.length === 0 ? (
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <Info className="w-5 h-5 text-amber-400" />
                <span>لم تتحقق شروط الدخول لهذه الاستراتيجية على سهم {result.ticker} خلال الفترة المختبرة ({result.periodTested}).</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right font-mono-numbers">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold font-sans">
                      <th className="py-2.5 px-3">{lang === 'ar' ? 'الصفقة' : 'ID'}</th>
                      <th className="py-2.5 px-3">{lang === 'ar' ? 'الدخول' : 'Entry'}</th>
                      <th className="py-2.5 px-3">{lang === 'ar' ? 'الخروج' : 'Exit'}</th>
                      <th className="py-2.5 px-3">{lang === 'ar' ? 'صافي %' : 'Net %'}</th>
                      <th className="py-2.5 px-3">{lang === 'ar' ? 'صافي الربح' : 'Net P&L'}</th>
                      <th className="py-2.5 px-3">{lang === 'ar' ? 'المدة' : 'Days'}</th>
                      <th className="py-2.5 px-3 font-sans">{lang === 'ar' ? 'سبب إشارة الدخول' : 'Entry Signal'}</th>
                      <th className="py-2.5 px-3 font-sans">{lang === 'ar' ? 'سبب الخروج' : 'Exit Trigger'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {result.recentTrades.map((t: any) => (
                      <tr key={t.tradeId} className="hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-bold text-white">{t.tradeId}</td>
                        <td className="py-3 px-3 text-slate-300">
                          <span className="font-bold text-white block">{t.entryPrice} {unit}</span>
                          <span className="text-[10px] text-slate-500">{t.entryDate}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          <span className="font-bold text-white block">{t.exitPrice} {unit}</span>
                          <span className="text-[10px] text-slate-500">{t.exitDate}</span>
                        </td>
                        <td className={`py-3 px-3 font-bold ${t.netReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.netReturnPct >= 0 ? `+${t.netReturnPct}%` : `${t.netReturnPct}%`}
                        </td>
                        <td className={`py-3 px-3 font-bold ${t.netProfitEgp >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.netProfitEgp >= 0 ? '+' : ''}{t.netProfitEgp.toLocaleString()} جم
                        </td>
                        <td className="py-3 px-3 text-slate-300">{t.holdingDays} يوم</td>
                        <td className="py-3 px-3 font-sans text-[11px] text-slate-300 max-w-[220px]">
                          {t.signalReasonAr}
                        </td>
                        <td className="py-3 px-3 font-sans">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            String(t.exitReason).includes('TARGET')
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : t.exitReason === 'END_OF_PERIOD' || t.exitReason === 'TIME_EXPIRY'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}>
                            {t.exitReasonAr}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
