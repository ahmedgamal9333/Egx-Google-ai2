import React, { useState } from 'react';
import { DetailedStockPayload } from '../../types';
import { InteractiveChart } from '../InteractiveChart';
import { TradingPlanCard } from '../TradingPlanCard';
import {
  Sparkles,
  TrendingUp,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  FileText,
  Sliders,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  CandlestickChart,
  Clock,
  Sigma
} from 'lucide-react';

import { safeFetchJson } from '../../utils/apiClient';

interface StockAnalysisViewProps {
  data: DetailedStockPayload;
  onRefreshData?: () => void;
  lang?: 'ar' | 'en';
}

export const StockAnalysisView: React.FC<StockAnalysisViewProps> = ({
  data,
  lang = 'ar'
}) => {
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M'>('1D');
  const [activeTab, setActiveTab] = useState<'PLAN' | 'TECH' | 'FUND' | 'VALUATION' | 'NEWS' | 'AI_REPORT'>('AI_REPORT');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReportError, setAiReportError] = useState<string | null>(null);
  const [currentAiReport, setCurrentAiReport] = useState<string>(data.aiDecision.arabicAiReport);

  React.useEffect(() => {
    setCurrentAiReport(data.aiDecision.arabicAiReport);
    setAiReportError(null);
  }, [data.stock.ticker, data.aiDecision.arabicAiReport]);

  const handleGenerateAiReport = async () => {
    setIsGeneratingReport(true);
    setAiReportError(null);
    try {
      const decision = await safeFetchJson<any>(
        `/api/stocks/${encodeURIComponent(data.stock.ticker)}/ai-report`,
        { method: 'POST' },
        lang
      );
      if (decision?.arabicAiReport) {
        setCurrentAiReport(decision.arabicAiReport);
      }
    } catch (err: any) {
      console.error('Failed to generate fresh AI report:', err);
      setAiReportError(err?.message || (lang === 'ar' ? 'تعذر توليد تقرير الذكاء الاصطناعي حالياً' : 'Failed to generate AI report'));
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const candles = timeframe === '1D' ? data.candlesDaily : timeframe === '1W' ? data.candlesWeekly : data.candlesMonthly;
  const tech = data.technicalAnalysis;
  const fund = data.fundamentalAnalysis;
  const fv = data.fairValueValuation;
  const unit = data.stock.currency === 'USD' ? '$' : 'جم';

  const changePct =
    tech?.changePct ??
    (data.stock.prevClose > 0
      ? Number((((data.stock.currentPrice - data.stock.prevClose) / data.stock.prevClose) * 100).toFixed(2))
      : 0);

  const isStaleQuote = !!data.stock.isStaleQuote || !data.stock.isLiveQuote;
  const isStaleCandles = !!data.candleStatus?.dailyIsStale;

  return (
    <div className="space-y-6">
      {/* Stock Top Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-mono font-black text-2xl text-white tracking-wide">
                {data.stock.ticker}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {data.stock.yahooTicker}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                {data.stock.isin}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                {data.stock.index}
              </span>
            </div>

            <h1 className="text-xl lg:text-2xl font-black text-white">
              {data.stock.nameAr}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
              <span>{data.stock.nameEn}</span>
              <span>•</span>
              <span className="text-cyan-400 font-semibold">{data.stock.sectorAr}</span>
              <span>•</span>
              <span>{data.stock.industryAr}</span>
            </div>
          </div>

          <div className="flex items-center gap-5 bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 font-mono-numbers">
            <div>
              <span className="text-[11px] text-slate-400 block font-sans">
                {data.stock.isLiveQuote
                  ? (lang === 'ar' ? 'السعر السوقي المزامن' : 'Synced Market Price')
                  : (lang === 'ar' ? 'سعر مرجعي قديم' : 'Reference Price')}
              </span>
              <span className="text-2xl lg:text-3xl font-black text-white">
                {data.stock.currentPrice} <span className="text-sm font-normal text-slate-400">{unit}</span>
              </span>
              {data.stock.priceDate && (
                <span className="text-[10px] text-slate-400 block">
                  {lang === 'ar' ? `التاريخ: ${data.stock.priceDate}` : `Date: ${data.stock.priceDate}`}
                </span>
              )}
            </div>
            <div className="w-px h-10 bg-slate-800"></div>
            <div>
              <span className="text-[11px] text-slate-400 block font-sans">{lang === 'ar' ? 'التغير اليومي' : 'Daily Change'}</span>
              <div className={`text-base font-bold flex items-center gap-1 ${changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                <TrendingUp className="w-4 h-4" />
                {changePct >= 0 ? `+${changePct}%` : `${changePct}%`}
              </div>
              <span className="text-[10px] text-slate-500 block">
                {lang === 'ar' ? `إغلاق سابق: ${data.stock.prevClose} ${unit}` : `Prev: ${data.stock.prevClose}`}
              </span>
            </div>
          </div>
        </div>

        {/* Data Provenance & Freshness Notice */}
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 ${
            data.technicalStatus && !data.technicalStatus.available
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : isStaleQuote || isStaleCandles
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              : 'bg-slate-950/80 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {data.technicalStatus && !data.technicalStatus.available ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{data.multiSourceComparison?.notesAr}</span>
          </div>
          {data.candleStatus?.dailyLastDate && (
            <span className="text-[11px] font-mono text-slate-400">
              {lang === 'ar'
                ? `الشموع: ${data.candleStatus.dailyCount} جلسة (حتى ${data.candleStatus.dailyLastDate})`
                : `Candles: ${data.candleStatus.dailyCount} (to ${data.candleStatus.dailyLastDate})`}
            </span>
          )}
        </div>
      </div>

      {/* Main Interactive Chart */}
      <InteractiveChart
        ticker={data.stock.tvTicker || data.stock.ticker}
        stockNameAr={data.stock.nameAr}
        currency={data.stock.currency}
        candles={candles}
        technicals={tech}
        tradingPlan={data.aiDecision}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        lang={lang}
        technicalErrorAr={data.technicalStatus?.reasonAr}
      />

      {/* Last Candles Reading (only when real technicals are available) */}
      {tech && tech.lastCandlesAnalysis && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <CandlestickChart className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-base font-bold text-white">
                  {lang === 'ar'
                    ? `قراءة آخر ${tech.lastCandlesAnalysis.candlesCount} شموع حقيقية (${data.stock.ticker})`
                    : `Last ${tech.lastCandlesAnalysis.candlesCount} Real Candles (${data.stock.ticker})`}
                </h3>
                <p className="text-xs text-slate-400">
                  {tech.lastCandlesAnalysis.dataSourceLabel} · {tech.lastCandlesAnalysis.tradingViewRatingAr}
                </p>
              </div>
            </div>

            <div className="text-xs font-semibold">
              <span
                className={
                  tech.lastCandlesAnalysis.shortTermBias === 'BULLISH'
                    ? 'text-emerald-400'
                    : tech.lastCandlesAnalysis.shortTermBias === 'BEARISH'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }
              >
                {tech.lastCandlesAnalysis.dominantPriceActionAr}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/70 p-4 rounded-xl border border-slate-800/80">
            {tech.lastCandlesAnalysis.candlestickSummaryAr}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono-numbers">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 px-3 text-right font-sans">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="py-2 px-2 text-left">{lang === 'ar' ? 'افتتاح' : 'Open'}</th>
                  <th className="py-2 px-2 text-left">{lang === 'ar' ? 'أعلى' : 'High'}</th>
                  <th className="py-2 px-2 text-left">{lang === 'ar' ? 'أدنى' : 'Low'}</th>
                  <th className="py-2 px-2 text-left">{lang === 'ar' ? 'إغلاق' : 'Close'}</th>
                  <th className="py-2 px-2 text-left">{lang === 'ar' ? 'التغير' : 'Chg%'}</th>
                  <th className="py-2 px-2 text-left">{lang === 'ar' ? 'السيولة' : 'RVOL'}</th>
                  <th className="py-2 px-3 text-right font-sans">{lang === 'ar' ? 'نمط وقراءة الشمعة' : 'Candlestick Reading'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {[...tech.lastCandlesAnalysis.recentBars].reverse().map((bar) => (
                  <tr key={bar.date} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-300 font-semibold whitespace-nowrap">{bar.date}</td>
                    <td className="py-2.5 px-2 text-slate-300">{bar.open}</td>
                    <td className="py-2.5 px-2 text-emerald-400">{bar.high}</td>
                    <td className="py-2.5 px-2 text-rose-400">{bar.low}</td>
                    <td className={`py-2.5 px-2 font-bold ${bar.close >= bar.open ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {bar.close}
                    </td>
                    <td className={`py-2.5 px-2 font-bold ${bar.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {bar.changePct >= 0 ? `+${bar.changePct}%` : `${bar.changePct}%`}
                    </td>
                    <td className="py-2.5 px-2 text-cyan-400">{bar.volumeRatio}x</td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <span
                        className={`font-bold block ${
                          bar.candleSignal === 'BULLISH'
                            ? 'text-emerald-400'
                            : bar.candleSignal === 'BEARISH'
                            ? 'text-rose-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {bar.candleTypeAr}
                      </span>
                      <span className="text-[11px] text-slate-400">{bar.noteAr}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-emerald-900/40 space-y-2">
              <h4 className="text-xs font-bold text-emerald-400">
                {lang === 'ar' ? 'الدعوم الفعلية المستخرجة من الشارت:' : 'Chart-Verified Support Levels:'}
              </h4>
              <div className="space-y-1.5 text-xs">
                {tech.supportZones.length === 0 ? (
                  <span className="text-slate-500">{lang === 'ar' ? 'لا توجد دعوم واضحة دون السعر الحالي' : 'No clear support zones'}</span>
                ) : (
                  tech.supportZones.map((z, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2">
                      <span className="text-slate-300">{z.description}</span>
                      <strong className="font-mono-numbers text-emerald-400 shrink-0">{z.priceLevel}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-rose-900/40 space-y-2">
              <h4 className="text-xs font-bold text-rose-400">
                {lang === 'ar' ? 'المقاومات والأهداف الفعلية المستخرجة من الشارت:' : 'Chart-Verified Resistance Levels:'}
              </h4>
              <div className="space-y-1.5 text-xs">
                {tech.resistanceZones.length === 0 ? (
                  <span className="text-slate-500">{lang === 'ar' ? 'لا توجد مقاومات مسجلة أعلى السعر' : 'No resistance zones'}</span>
                ) : (
                  tech.resistanceZones.map((z, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2">
                      <span className="text-slate-300">{z.description}</span>
                      <strong className="font-mono-numbers text-rose-400 shrink-0">{z.priceLevel}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Operational Swing Trading Plan Card */}
      <TradingPlanCard plan={data.aiDecision} lang={lang} />

      {/* Deep-Dive Analysis Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('AI_REPORT')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'AI_REPORT'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'تقرير التفسير والتحليل الذكي' : 'AI Interpretation Report'}
        </button>

        <button
          onClick={() => setActiveTab('TECH')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'TECH'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'المؤشرات الفنية ومعادلة التقييم' : 'Technical Indicators'}
        </button>

        <button
          onClick={() => setActiveTab('FUND')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'FUND'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'النسب المالية الأساسية (TTM)' : 'Fundamentals & Ratios'}
        </button>

        <button
          onClick={() => setActiveTab('VALUATION')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'VALUATION'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'القيمة العادلة الحسابية' : 'Fair Value Engine'}
        </button>

        <button
          onClick={() => setActiveTab('NEWS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'NEWS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'الأخبار الحية (Google News RSS)' : 'Live News Feed'}
        </button>
      </div>

      {/* Tab Content 1: AI Interpretation Report */}
      {activeTab === 'AI_REPORT' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  {lang === 'ar' ? 'تفسير الذكاء الاصطناعي للنتائج الحسابية' : 'AI Quantitative Interpretation'}
                </h3>
                <span className="text-[11px] text-slate-400">
                  {data.aiDecision.modelUsed}
                </span>
              </div>
              {data.aiDecision.available && (
                <button
                  onClick={handleGenerateAiReport}
                  disabled={isGeneratingReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingReport ? 'animate-spin' : ''}`} />
                  <span>{isGeneratingReport ? (lang === 'ar' ? 'جاري التفسير...' : 'Generating...') : (lang === 'ar' ? 'توليد تفسير Gemini الآن' : 'Generate Gemini Interpretation')}</span>
                </button>
              )}
            </div>

            {aiReportError && (
              <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-3 text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{aiReportError}</span>
              </div>
            )}

            <div className="prose prose-invert max-w-none text-slate-200 text-sm leading-relaxed space-y-3 font-sans whitespace-pre-line bg-slate-950/60 p-5 rounded-xl border border-slate-800/80">
              {currentAiReport}
            </div>

            {(data.aiDecision.positiveFactorsAr.length > 0 || data.aiDecision.negativeFactorsAr.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    {lang === 'ar' ? 'العوامل الإيجابية المرصودة:' : 'Supporting Factors:'}
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {data.aiDecision.positiveFactorsAr.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 shrink-0 font-bold">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-rose-950/30 border border-rose-900/40 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-rose-400 mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {lang === 'ar' ? 'المخاطر والتنبيهات:' : 'Risks & Warnings:'}
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {data.aiDecision.negativeFactorsAr.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-400 shrink-0 font-bold">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {data.aiDecision.bullishScenario && data.aiDecision.bearishScenario && data.aiDecision.neutralScenario && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                  {lang === 'ar' ? 'السيناريوهات السعرية المرتبطة بمستويات الشارت:' : 'Chart-Anchored Scenarios:'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-emerald-900/40 text-xs">
                    <span className="font-bold text-emerald-400 block mb-1">{data.aiDecision.bullishScenario.directionAr}</span>
                    <p className="text-slate-300 text-[11px] mb-2">{data.aiDecision.bullishScenario.keyLevelsAr}</p>
                    <span className="text-[10px] text-slate-500 block">{data.aiDecision.bullishScenario.invalidationTriggerAr}</span>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-rose-900/40 text-xs">
                    <span className="font-bold text-rose-400 block mb-1">{data.aiDecision.bearishScenario.directionAr}</span>
                    <p className="text-slate-300 text-[11px] mb-2">{data.aiDecision.bearishScenario.keyLevelsAr}</p>
                    <span className="text-[10px] text-slate-500 block">{data.aiDecision.bearishScenario.invalidationTriggerAr}</span>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs">
                    <span className="font-bold text-amber-400 block mb-1">{data.aiDecision.neutralScenario.directionAr}</span>
                    <p className="text-slate-300 text-[11px] mb-2">{data.aiDecision.neutralScenario.keyLevelsAr}</p>
                    <span className="text-[10px] text-slate-500 block">{data.aiDecision.neutralScenario.invalidationTriggerAr}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content 2: Technical Indicators Matrix */}
      {activeTab === 'TECH' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          {!tech ? (
            <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-6 text-center space-y-2">
              <AlertTriangle className="w-7 h-7 text-rose-400 mx-auto" />
              <div className="text-sm font-bold text-white">
                {lang === 'ar' ? 'تعذر إصدار المؤشرات الفنية الرقمية' : 'Technical Indicators Unavailable'}
              </div>
              <p className="text-xs text-rose-200 max-w-lg mx-auto">
                {data.technicalStatus?.reasonAr ||
                  (lang === 'ar'
                    ? 'لم يتوافر الحد الأدنى الإلزامي (30 شمعة تاريخية حقيقية) لحساب المؤشرات الفنية.'
                    : 'Fewer than 30 verified real historical candles available.')}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-cyan-400" />
                    {lang === 'ar' ? 'مصفوفة المؤشرات الفنية المتقدمة وتوافق الفترات الزمنية' : 'Technical Indicators Matrix'}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {tech.candlesCount} candles ({tech.firstCandleDate} → {tech.lastCandleDate})
                  </span>
                </div>
                <span className="text-xs bg-slate-800 text-cyan-400 font-bold px-3 py-1 rounded-full">
                  {lang === 'ar' ? `الدرجة الفنية: ${tech.technicalScore}/100` : `Tech Score: ${tech.technicalScore}`}
                </span>
              </div>

              {tech.technicalScoreFormulaAr && (
                <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                    <Sigma className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'تفصيل حساب الدرجة الفنية:' : 'Technical Score Formula:'}</span>
                  </div>
                  <p className="text-slate-300 font-mono-numbers">{tech.technicalScoreFormulaAr}</p>
                  {tech.technicalScoreBreakdown && tech.technicalScoreBreakdown.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                      {tech.technicalScoreBreakdown.map((item, idx) => (
                        <div key={idx} className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-200 truncate">{item.labelAr}</div>
                            <div className="text-[10px] text-slate-400 truncate">{item.conditionAr}</div>
                          </div>
                          <span className={`font-mono-numbers font-bold shrink-0 ${item.points >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.points >= 0 ? `+${item.points}` : item.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-400 block mb-1">
                    {lang === 'ar' ? 'حالة توافق الاتجاه عبر الفترات الزمنية:' : 'Trend Alignment Status:'}
                  </span>
                  <span className="font-bold text-emerald-400 text-sm">
                    {tech.trendAlignmentStatusAr}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">{lang === 'ar' ? 'يومي (1D)' : 'Daily'}</span>
                    <strong className={tech.dailyTrend === 'BULLISH' ? 'text-emerald-400' : tech.dailyTrend === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'}>
                      {tech.dailyTrend}
                    </strong>
                  </div>
                  <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">{lang === 'ar' ? 'أسبوعي (1W)' : 'Weekly'}</span>
                    <strong className={tech.weeklyTrend === 'BULLISH' ? 'text-emerald-400' : tech.weeklyTrend === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'}>
                      {tech.weeklyTrend}
                    </strong>
                  </div>
                  <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">{lang === 'ar' ? 'شهري (1M)' : 'Monthly'}</span>
                    <strong className={tech.monthlyTrend === 'BULLISH' ? 'text-emerald-400' : tech.monthlyTrend === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'}>
                      {tech.monthlyTrend}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300">{lang === 'ar' ? 'المتوسطات المتحركة الأسية (EMA):' : 'Moving Averages:'}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 font-mono-numbers text-xs">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">EMA 9</span>
                    <span className="font-bold text-white">{tech.ema9} {unit}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">EMA 20</span>
                    <span className="font-bold text-cyan-400">{tech.ema20} {unit}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">EMA 50</span>
                    <span className="font-bold text-amber-400">{tech.ema50} {unit}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">EMA 100</span>
                    <span className="font-bold text-purple-400">{tech.ema100} {unit}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">EMA 200</span>
                    <span className="font-bold text-emerald-400">{tech.ema200} {unit}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300">{lang === 'ar' ? 'مؤشرات العزم والسيولة والتذبذب:' : 'Momentum & Volatility:'}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-numbers text-xs">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">RSI (14)</span>
                    <span className="font-bold text-base text-purple-400">{tech.rsi14}</span>
                    <span className="text-[10px] text-slate-500 block">{tech.rsiStatus}</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">MACD (12,26,9)</span>
                    <span className="font-bold text-base text-cyan-400">{tech.macd.histogram}</span>
                    <span className="text-[10px] text-emerald-400 block">{tech.macd.signal}</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">ADX (14) قوة الاتجاه</span>
                    <span className="font-bold text-base text-amber-400">{tech.adx14.adx}</span>
                    <span className="text-[10px] text-slate-400 block">{tech.adx14.trendStrength}</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">ATR (14) المدى السعري</span>
                    <span className="font-bold text-base text-emerald-400">{tech.atr14} {unit}</span>
                    <span className="text-[10px] text-slate-500 block">تذبذب: {tech.historicalVolatilityPct}%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300">{lang === 'ar' ? 'مستويات فيبوناتشي التصحيحية (Fibonacci Retracement):' : 'Fibonacci Levels:'}</h4>
                <div className="flex flex-wrap gap-2 text-xs font-mono-numbers">
                  {tech.fibonacciLevels.map((fib, idx) => (
                    <div key={idx} className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">{fib.label}</span>
                      <span className="font-bold text-white">{fib.level} {unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {(tech.volatilityContraction || tech.falseBreakoutDetected) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {tech.volatilityContraction && (
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-cyan-400 font-bold block mb-1">
                        {lang === 'ar' ? 'فحص انضغاط التذبذب (Squeeze):' : 'Volatility Contraction:'}
                      </span>
                      <p className="text-slate-300 leading-relaxed">{tech.volatilityContraction.noteAr}</p>
                    </div>
                  )}
                  {tech.falseBreakoutDetected && tech.falseBreakoutNoteAr && (
                    <div className="bg-rose-950/30 p-3.5 rounded-xl border border-rose-500/40">
                      <span className="text-rose-400 font-bold block mb-1">
                        {lang === 'ar' ? 'تحذير اختراق كاذب محتمل:' : 'Potential False Breakout:'}
                      </span>
                      <p className="text-rose-200 leading-relaxed">{tech.falseBreakoutNoteAr}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab Content 3: Fundamental Analysis (Real TTM Ratios Only) */}
      {activeTab === 'FUND' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                {lang === 'ar' ? 'النسب والمؤشرات المالية المعتمدة (TradingView TTM / FQ)' : 'Verified Financial Ratios'}
              </h3>
              <span className="text-xs text-slate-400">
                {fund.reportingPeriod} · {lang === 'ar' ? `اكتمال المؤشرات: ${fund.dataCompletenessPct}%` : `Completeness: ${fund.dataCompletenessPct}%`}
              </span>
            </div>
            {fund.ratios.fundamentalQualityScore !== null ? (
              <span className="text-xs bg-emerald-500/10 text-emerald-400 font-bold px-3 py-1 rounded-full border border-emerald-500/30">
                {lang === 'ar' ? `الجودة المالية: ${fund.ratios.fundamentalQualityScore}/100` : `Quality: ${fund.ratios.fundamentalQualityScore}`}
              </span>
            ) : (
              <span className="text-xs bg-rose-500/10 text-rose-400 font-bold px-3 py-1 rounded-full border border-rose-500/30">
                {lang === 'ar' ? 'بيانات غير كافية' : 'Insufficient Data'}
              </span>
            )}
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-slate-200">{fund.qualityScoreFormulaAr}</div>
              {fund.sectorProfileAr && (
                <span className="text-[11px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-2.5 py-0.5 rounded-full">
                  {fund.sectorProfileAr}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">{fund.historicalStatementsNoteAr}</p>
            {(fund.fiscalPeriodEndDate || fund.earningsReleaseDate) && (
              <div className="flex flex-wrap gap-3 text-[11px] text-amber-300 pt-1 font-mono">
                {fund.fiscalPeriodEndDate && <span>نهاية الفترة المالية: {fund.fiscalPeriodEndDate}</span>}
                {fund.earningsReleaseDate && <span>تاريخ إعلان النتائج: {fund.earningsReleaseDate}</span>}
              </div>
            )}
          </div>

          {fund.qualityScoreComponents.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              {fund.qualityScoreComponents.map((c, idx) => (
                <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-white">{c.labelAr}</div>
                    <div className="text-[11px] text-slate-400">{c.detailAr}</div>
                  </div>
                  <span className={`font-mono-numbers font-bold ${c.points >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {c.points >= 0 ? `+${c.points}` : c.points}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-300">{lang === 'ar' ? '1) البيانات المالية المنشورة فعلياً:' : 'Published Financial Metrics:'}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 font-mono-numbers text-xs">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">P/E مكرر الربحية</span>
                <span className="font-bold text-white text-sm">{fund.ratios.peRatio !== null ? `${fund.ratios.peRatio}x` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">P/B مضاعف القيمة الدفترية</span>
                <span className="font-bold text-white text-sm">{fund.ratios.pbRatio !== null ? `${fund.ratios.pbRatio}x` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">ROE العائد على الملكية</span>
                <span className="font-bold text-emerald-400 text-sm">{fund.ratios.roe !== null ? `${fund.ratios.roe}%` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">عائد التوزيعات النقدي</span>
                <span className="font-bold text-amber-400 text-sm">{fund.ratios.dividendYield !== null ? `${fund.ratios.dividendYield}%` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">الدين إلى حقوق الملكية</span>
                <span className="font-bold text-slate-300 text-sm">{fund.ratios.debtToEquity !== null ? `${fund.ratios.debtToEquity}x` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">ربحية السهم المنشورة EPS</span>
                <span className="font-bold text-white text-sm">{fund.ratios.eps !== null ? `${fund.ratios.eps} ${unit}` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">القيمة الدفترية المنشورة BVPS</span>
                <span className="font-bold text-white text-sm">{fund.ratios.bookValuePerShare !== null ? `${fund.ratios.bookValuePerShare} ${unit}` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">هامش صافي الربح</span>
                <span className="font-bold text-cyan-400 text-sm">{fund.ratios.netProfitMargin !== null ? `${fund.ratios.netProfitMargin}%` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">نمو الإيرادات السنوي</span>
                <span className="font-bold text-emerald-300 text-sm">{fund.ratios.revenueGrowthPct !== null && fund.ratios.revenueGrowthPct !== undefined ? `${fund.ratios.revenueGrowthPct}%` : 'غير متوفر'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans">نمو ربحية السهم</span>
                <span className="font-bold text-emerald-300 text-sm">{fund.ratios.epsGrowthPct !== null && fund.ratios.epsGrowthPct !== undefined ? `${fund.ratios.epsGrowthPct}%` : 'غير متوفر'}</span>
              </div>
            </div>
          </div>

          {fund.derivedMetrics && (
            <div className="bg-slate-950/60 border border-amber-500/20 rounded-xl p-4 text-xs space-y-2">
              <div className="font-bold text-amber-300">
                {lang === 'ar' ? '2) مؤشرات مشتقة حسابياً (مفصولة عن القوائم المنشورة ولا تُستخدم في التقييم العادل):' : 'Derived Reference Metrics:'}
              </div>
              <p className="text-[11px] text-slate-400">{fund.derivedMetrics.noteAr}</p>
              <div className="flex flex-wrap gap-3 font-mono-numbers text-[11px] text-slate-300">
                {fund.derivedMetrics.impliedEpsFromPe !== null && <span>EPS ضمني من P/E: {fund.derivedMetrics.impliedEpsFromPe} {unit}</span>}
                {fund.derivedMetrics.impliedBvpsFromPb !== null && <span>BVPS ضمني من P/B: {fund.derivedMetrics.impliedBvpsFromPb} {unit}</span>}
                {fund.derivedMetrics.fcfToNetIncomeRatio !== null && <span>نسبة FCF / صافي الربح: {fund.derivedMetrics.fcfToNetIncomeRatio}x</span>}
              </div>
              {fund.unavailableMetrics && fund.unavailableMetrics.length > 0 && (
                <div className="text-[11px] text-slate-500 pt-1">
                  <strong className="text-slate-400">بيانات غير متوفرة حالياً:</strong> {fund.unavailableMetrics.join(' • ')}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[11px] mb-1">قراءة جودة الأرباح والتوزيعات:</span>
              <span className="text-slate-200 font-semibold block">{fund.ratios.earningsQualityStatusAr}</span>
              {fund.ratios.dividendSustainabilityAr && (
                <span className="text-slate-400 text-[11px] block mt-1">{fund.ratios.dividendSustainabilityAr}</span>
              )}
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[11px] mb-1">قراءة الملاءة والمخاطر:</span>
              <span className="text-slate-200 font-semibold">{fund.ratios.financialRiskStatusAr}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 4: Fair Value Valuation Engine (Formula-Driven, No Fake Sliders) */}
      {activeTab === 'VALUATION' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          {!fv.available ? (
            <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-6 text-center space-y-2">
              <AlertTriangle className="w-7 h-7 text-rose-400 mx-auto" />
              <div className="text-sm font-bold text-white">
                {lang === 'ar' ? 'تعذر احتساب القيمة العادلة' : 'Fair Value Unavailable'}
              </div>
              <p className="text-xs text-rose-200 max-w-lg mx-auto">
                {fv.insufficientReasonAr || fv.summaryAr}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-amber-400" />
                    {lang === 'ar' ? 'محرك القيمة العادلة المرجحة حسابياً' : 'Formulaic Fair Value Engine'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{fv.summaryAr}</p>
                </div>
                <div className="text-end font-mono-numbers">
                  <span className="text-2xl font-black text-emerald-400 block">
                    {fv.estimatedFairValue} {unit}
                  </span>
                  <span className={`text-xs font-bold block ${(fv.upsideDownsidePct ?? 0) >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                    {fv.valuationStatusAr}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {lang === 'ar' ? `بتاريخ: ${fv.valuationDate}` : `Date: ${fv.valuationDate}`}
                  </span>
                </div>
              </div>

              {/* Model Inputs Summary */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-300 flex items-center justify-between flex-wrap gap-2">
                  <span>{lang === 'ar' ? 'المدخلات الحسابية الفعلية المستخدمة في النماذج:' : 'Verified Model Inputs:'}</span>
                  <span className="text-[11px] text-amber-300 font-normal">
                    {lang === 'ar'
                      ? `فائدة المركزي المرجعية: ${fv.modelInputs.cbeReferenceRatePct}% (بتاريخ ${fv.modelInputs.cbeReferenceDate}) | تكلفة حقوق الملكية COE: ${fv.modelInputs.costOfEquityPct}%`
                      : `CBE Rate: ${fv.modelInputs.cbeReferenceRatePct}% (${fv.modelInputs.cbeReferenceDate}) | COE: ${fv.modelInputs.costOfEquityPct}%`}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-numbers">
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px] font-sans">ربحية السهم EPS</span>
                    <strong className="text-white">{fv.modelInputs.eps ?? 'غير متوفر'}</strong>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px] font-sans">القيمة الدفترية BVPS</span>
                    <strong className="text-white">{fv.modelInputs.bookValuePerShare ?? 'غير متوفر'}</strong>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px] font-sans">العائد على الملكية ROE</span>
                    <strong className="text-emerald-400">{fv.modelInputs.roePct !== null ? `${fv.modelInputs.roePct}%` : 'غير متوفر'}</strong>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px] font-sans">وسيط P/E للقطاع ({fv.modelInputs.sectorPeersCount} شركة)</span>
                    <strong className="text-cyan-400">{fv.modelInputs.sectorMedianPe !== null ? `${fv.modelInputs.sectorMedianPe}x` : 'غير متاح'}</strong>
                  </div>
                </div>
              </div>

              {/* Valuation Methods Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300">{lang === 'ar' ? 'تفصيل معادلات التقييم والأوزان:' : 'Valuation Models & Formulas:'}</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {fv.methods.map((m, idx) => (
                    <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs flex flex-col justify-between gap-2">
                      <div>
                        <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                          <span className="font-bold text-slate-200">{m.methodNameAr}</span>
                          <span className="font-bold text-cyan-400 shrink-0">{m.weightPct}%</span>
                        </div>
                        <span className="text-xl font-black text-white font-mono-numbers block mb-1.5">
                          {m.calculatedValue} {unit}
                        </span>
                        <div className="text-[11px] font-mono-numbers text-emerald-300 bg-slate-900/90 p-2 rounded border border-slate-800 mb-1.5">
                          {m.formulaAr}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">{m.descriptionAr}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content 5: Live Google News RSS */}
      {activeTab === 'NEWS' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-cyan-400" />
              {lang === 'ar' ? 'الأخبار المنشورة الحية عبر Google News RSS' : 'Live News Feed (Google News RSS)'}
            </h3>
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">
              {data.newsDisclosures.length} {lang === 'ar' ? 'خبر منشور' : 'articles'}
            </span>
          </div>

          {data.newsStatus?.error && (
            <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-4 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{lang === 'ar' ? `تعذر جلب الأخبار الحية: ${data.newsStatus.error}` : data.newsStatus.error}</span>
            </div>
          )}

          {data.newsDisclosures.length === 0 ? (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400">
              {lang === 'ar'
                ? 'لا توجد أخبار منشورة مطابقة لهذا السهم حالياً في التغذية الإخبارية المباشرة.'
                : 'No recent live news items found for this ticker.'}
            </div>
          ) : (
            <div className="space-y-3">
              {data.newsDisclosures.map((n) => (
                <a
                  key={n.id}
                  href={n.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-slate-950 p-4 rounded-xl border border-slate-800/80 hover:border-emerald-500/40 transition-colors space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400">{n.categoryAr}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 font-mono">{n.publishedAt || '—'}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-xs bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-800">
                        {n.source}
                      </span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-900 text-slate-300 border border-slate-700">
                      {n.impactAr}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{n.titleAr}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-3 rounded-lg border border-slate-800/60">
                    {n.summaryAr}
                  </p>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
