import React, { useState } from 'react';
import { InvestmentPlanResult } from '../types';
import { ShieldCheck, Target, AlertTriangle, Calculator, CheckCircle2, XCircle, Sigma, Clock } from 'lucide-react';

interface TradingPlanCardProps {
  plan: InvestmentPlanResult;
  lang?: 'ar' | 'en';
}

export const TradingPlanCard: React.FC<TradingPlanCardProps> = ({ plan, lang = 'ar' }) => {
  const [totalCapital, setTotalCapital] = useState<number>(200000);
  const [riskPerTradePct, setRiskPerTradePct] = useState<number>(2);
  const [showCalculator, setShowCalculator] = useState<boolean>(false);

  if (!plan.available || plan.recommendation === 'INSUFFICIENT_DATA') {
    return (
      <div className="bg-slate-900/95 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-white">
                {plan.recommendationAr || (lang === 'ar' ? 'بيانات غير كافية — لا يصدر تحليل' : 'Insufficient Data — Analysis Refused')}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'ar'
                  ? 'التزاماً بقاعدة التحقق الصارم، يرفض النظام إصدار مستويات دخول أو أهداف سعرية دون توافر الشموع الحقيقية الكافية.'
                  : 'Refused to issue targets or recommendation without minimum verified historical candles.'}
              </p>
            </div>
          </div>
          {plan.dataDate && (
            <span className="text-[11px] font-mono text-amber-300 bg-amber-950/50 border border-amber-500/30 px-2.5 py-1 rounded-lg">
              {lang === 'ar' ? `أحدث تاريخ متاح: ${plan.dataDate}` : `Latest Date: ${plan.dataDate}`}
            </span>
          )}
        </div>

        <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4 text-xs text-rose-200 leading-relaxed">
          {plan.insufficientReasonAr || plan.mathematicalRationaleAr}
        </div>

        {plan.riskGates.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {plan.riskGates.map((gate, idx) => (
              <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-start gap-2">
                {gate.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold block text-slate-200 text-[11px]">{gate.gateNameAr}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{gate.detailsAr}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const stopLoss = plan.stopLossPrice ?? plan.currentPrice * 0.95;
  const maxRiskAmount = (totalCapital * riskPerTradePct) / 100;
  const riskPerShare = Math.max(0.01, plan.currentPrice - stopLoss);
  const recommendedShares = Math.floor(maxRiskAmount / riskPerShare);
  const totalPositionValue = recommendedShares * plan.currentPrice;
  const capitalAllocationPct = totalCapital > 0 ? Number(((totalPositionValue / totalCapital) * 100).toFixed(1)) : 0;

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md flex flex-col gap-5">
      {/* Header & Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              {lang === 'ar' ? 'خطة التداول المتأرجح (Swing Trading Plan)' : 'Swing Trading Plan'}
            </span>
            <span className="bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded-full font-medium">
              {plan.holdingPeriodAr}
            </span>
            {plan.dataDate && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 ${
                plan.isStaleData
                  ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-300'
              }`}>
                <Clock className="w-3 h-3" />
                {plan.dataDate}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-white mt-1.5 flex flex-wrap items-center gap-2">
            {plan.recommendationAr}
            {plan.overallScore !== null && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {lang === 'ar' ? `التقييم: ${plan.overallScore}/100` : `Score: ${plan.overallScore}`}
              </span>
            )}
            {plan.confidenceScore !== null && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                {lang === 'ar' ? `اكتمال البيانات: ${plan.confidenceScore}%` : `Coverage: ${plan.confidenceScore}%`}
              </span>
            )}
          </h2>
        </div>

        <button
          onClick={() => setShowCalculator(!showCalculator)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-all"
        >
          <Calculator className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'حاسبة حجم الصفقة والمخاطرة' : 'Position Size Calculator'}
        </button>
      </div>

      {/* Explicit Mathematical Rationale & Pillars Formula */}
      <div className="bg-slate-950/90 border border-emerald-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-2 text-xs">
          <Sigma className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-emerald-300">
              {lang === 'ar' ? 'السبب الحسابي للتوصية (Mathematical Rationale):' : 'Mathematical Rationale:'}
            </div>
            <p className="text-slate-200 leading-relaxed">{plan.mathematicalRationaleAr}</p>
          </div>
        </div>

        {plan.pillars && plan.pillars.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-800/80 text-xs">
            {plan.pillars.map((p) => (
              <div key={p.key} className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-200 truncate">{p.labelAr}</span>
                  <span className="font-mono text-cyan-400 shrink-0">{p.weightPct}%</span>
                </div>
                <div className="font-mono-numbers text-sm font-black text-white">
                  {p.score}/100 <span className="text-[11px] text-emerald-400 font-normal">({p.weightedContribution}+)</span>
                </div>
                <div className="text-[10px] text-slate-400 leading-snug">{p.formulaAr}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Position Sizing Drawer */}
      {showCalculator && (
        <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 flex flex-col gap-3 text-xs">
          <div className="flex items-center justify-between text-slate-300 font-bold">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Calculator className="w-4 h-4" />
              {lang === 'ar' ? 'حساب كمية الأسهم الموصى بشرائها وإدارة رأس المال' : 'Position Sizing Calculator'}
            </span>
            <span className="text-[11px] text-slate-400">
              {lang === 'ar' ? 'قاعدة عدم المخاطرة بأكثر من 2% في الصفقة الواحدة' : 'Max 2% Risk Rule'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">{lang === 'ar' ? 'إجمالي رأس مال المحفظة (جم):' : 'Total Portfolio (EGP)'}</label>
              <input
                type="number"
                value={totalCapital}
                onChange={(e) => setTotalCapital(Number(e.target.value) || 10000)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono-numbers outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">{lang === 'ar' ? 'أقصى نسبة مخاطرة مقبولة (%):' : 'Max Risk %'}</label>
              <input
                type="number"
                step="0.5"
                value={riskPerTradePct}
                onChange={(e) => setRiskPerTradePct(Number(e.target.value) || 1)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono-numbers outline-none focus:border-emerald-500"
              />
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">{lang === 'ar' ? 'الكمية المقترحة (عدد الأسهم):' : 'Recommended Shares:'}</span>
              <span className="text-base font-bold text-emerald-400 font-mono-numbers">{recommendedShares.toLocaleString()} سهم</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">{lang === 'ar' ? 'قيمة الصفقة ونسبتها من المحفظة:' : 'Allocation Value:'}</span>
              <span className="text-base font-bold text-cyan-400 font-mono-numbers">
                {totalPositionValue.toLocaleString()} جم ({capitalAllocationPct}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Core Trading Plan Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-950/70 border border-blue-900/40 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-blue-400 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                {lang === 'ar' ? 'نطاق الدخول المفضل' : 'Preferred Entry Zone'}
              </span>
              <span className="bg-blue-950 text-blue-300 px-2 py-0.5 rounded text-[10px]">
                {lang === 'ar' ? 'تجميع تكتيكي' : 'Optimal'}
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono-numbers mb-1">
              {plan.preferredEntryZone?.labelAr ?? '—'}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {plan.entryConfirmationAr ||
                (lang === 'ar'
                  ? 'مشتق من متوسط EMA20 وأقرب منطقة دعم فعلي على الشارت وATR(14).'
                  : 'Anchored to EMA20, nearest verified chart support, and ATR(14).')}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
            <span className="text-slate-500 block mb-0.5">{lang === 'ar' ? 'نطاق الدخول البديل:' : 'Alternative Entry:'}</span>
            <span className="font-semibold text-slate-200">{plan.alternativeEntryZone?.labelAr ?? '—'}</span>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-rose-900/40 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-rose-400 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                {lang === 'ar' ? 'وقف الخسارة الصارم (Stop Loss)' : 'Stop Loss'}
              </span>
              <span className="bg-rose-950 text-rose-300 px-2 py-0.5 rounded text-[10px] font-mono-numbers">
                {plan.stopLossPct ?? 0}%
              </span>
            </div>
            <div className="text-2xl font-black text-rose-400 font-mono-numbers mb-1">
              {plan.stopLossPrice ?? '—'}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {plan.stopLossLogicAr}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-rose-300/80 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{lang === 'ar' ? 'الالتزام الصارم بحماية رأس المال' : 'Strict capital preservation'}</span>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-emerald-900/40 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                {lang === 'ar' ? 'مستهدفات جني الأرباح (Targets)' : 'Profit Targets'}
              </span>
              <span className="bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold">
                {lang === 'ar' ? `عائد / مخاطرة: ${plan.rewardRiskRatio ?? '—'}:1` : `R:R ${plan.rewardRiskRatio ?? '—'}:1`}
              </span>
            </div>

            <div className="space-y-1.5 font-mono-numbers text-xs">
              {plan.target1 && (
                <div className="flex items-center justify-between bg-slate-900/60 p-1.5 rounded">
                  <span className="text-slate-400">{lang === 'ar' ? 'المستهدف الأول (T1):' : 'Target 1:'}</span>
                  <span className="font-bold text-white">
                    {plan.target1.price} <span className="text-emerald-400 text-[11px]">(+{plan.target1.upsidePct}%)</span>
                  </span>
                </div>
              )}
              {plan.target2 && (
                <div className="flex items-center justify-between bg-slate-900/60 p-1.5 rounded">
                  <span className="text-slate-400">{lang === 'ar' ? 'المستهدف الثاني (T2):' : 'Target 2:'}</span>
                  <span className="font-bold text-emerald-400">
                    {plan.target2.price} <span className="text-emerald-400 text-[11px]">(+{plan.target2.upsidePct}%)</span>
                  </span>
                </div>
              )}
              {plan.target3 && (
                <div className="flex items-center justify-between bg-slate-900/60 p-1.5 rounded">
                  <span className="text-slate-400">{lang === 'ar' ? 'المستهدف الثالث (T3):' : 'Target 3:'}</span>
                  <span className="font-bold text-cyan-400">
                    {plan.target3.price} <span className="text-cyan-400 text-[11px]">(+{plan.target3.upsidePct}%)</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 pt-2 text-[11px] text-slate-400 border-t border-slate-800/80">
            {plan.targetNotesAr || (lang === 'ar' ? 'مبنية على المقاومات الحقيقية وقمم TradingView وATR(14).' : 'Anchored to verified resistances & ATR(14).')}
          </div>
        </div>
      </div>

      {/* Mandatory Risk Gates Section */}
      <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800">
        <h4 className="text-xs font-bold text-slate-300 mb-2.5 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          {lang === 'ar' ? 'بوابات فحص المخاطر الإلزامية (Mandatory Risk Gates)' : 'Mandatory Risk Gates'}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {plan.riskGates.map((gate, idx) => (
            <div key={idx} className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 flex items-start gap-2">
              {gate.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-semibold block text-slate-200 text-[11px]">{gate.gateNameAr}</span>
                <span className="text-[10px] text-slate-400 leading-tight block mt-0.5">{gate.detailsAr}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
