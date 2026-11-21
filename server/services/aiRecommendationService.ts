import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { TechnicalIndicatorsResult } from "./technicalAnalysisService";
import { FundamentalDataResult } from "./fundamentalAnalysisService";
import { FairValueResult } from "./fairValueService";
import { NewsItem } from "./newsService";
import { EGXStock } from "../data/egxStocks";
import { MarketDataService } from "./marketDataService";

export type RecommendationType =
  | 'STRONG_BUY'
  | 'BUY'
  | 'WAIT'
  | 'HOLD'
  | 'REDUCE'
  | 'SELL'
  | 'AVOID'
  | 'INSUFFICIENT_DATA';

export interface ScenarioPlan {
  directionAr: string;
  supportingConditionsAr: string[];
  keyLevelsAr: string;
  invalidationTriggerAr: string;
}

export interface RiskGateStatus {
  passed: boolean;
  gateName: string;
  gateNameAr: string;
  detailsAr: string;
}

export interface ScorePillarBreakdown {
  key: string;
  labelAr: string;
  weightPct: number;
  score: number;
  weightedContribution: number;
  formulaAr: string;
}

export interface InvestmentPlanResult {
  ticker: string;
  companyNameAr: string;
  currentPrice: number;
  available: boolean;
  insufficientReasonAr?: string;
  isStaleData: boolean;
  dataDate: string | null;

  recommendation: RecommendationType;
  recommendationAr: string;
  recommendationBadgeColor: string;
  holdingPeriodAr: string;
  overallScore: number | null;
  confidenceScore: number | null;

  mathematicalRationaleAr: string;
  scoreFormulaAr: string;
  pillars: ScorePillarBreakdown[];

  scoreBreakdown: {
    technicalWeight: number;
    technicalScore: number | null;
    fundamentalWeight: number;
    fundamentalScore: number | null;
    liquidityWeight: number;
    liquidityScore: number | null;
    valuationWeight: number;
    valuationScore: number | null;
    marketWeight: number;
    marketScore: number | null;
  };

  preferredEntryZone: { min: number; max: number; labelAr: string } | null;
  alternativeEntryZone: { min: number; max: number; labelAr: string } | null;
  breakoutTriggerPrice: number | null;
  entryConfirmationAr: string;
  entryConditionsAr: string[];
  invalidationConditionsAr: string[];

  stopLossPrice: number | null;
  stopLossPct: number | null;
  stopLossLogicAr: string;
  target1: { price: number; upsidePct: number; rationaleAr: string } | null;
  target2: { price: number; upsidePct: number; rationaleAr: string } | null;
  target3: { price: number; upsidePct: number; rationaleAr: string } | null;
  targetNotesAr: string;
  rewardRiskRatio: number | null;
  expectedUpsidePct: number | null;
  nearestSupport: number | null;
  nearestResistance: number | null;
  relativeVolume: number | null;
  selectionReasonsAr: string[];
  potentialRisksAr: string[];

  estimatedFairValue: number | null;
  fairValueUpsidePct: number | null;
  marginOfSafetyPct: number | null;

  currentTrendAr: string;
  expectedTrendAr: string;

  riskGates: RiskGateStatus[];
  allGatesPassed: boolean;

  bullishScenario: ScenarioPlan | null;
  bearishScenario: ScenarioPlan | null;
  neutralScenario: ScenarioPlan | null;

  positiveFactorsAr: string[];
  negativeFactorsAr: string[];
  thingsToMonitorAr: string[];

  arabicAiReport: string;
  reportGeneratedAt: string;
  modelUsed: string;
}

export class AiRecommendationEngine {
  private static geminiClient: GoogleGenAI | null = null;
  public static reportCache: Map<string, string> = new Map();
  private static modelCheckedOk: boolean | null = null;

  private static getAi(): GoogleGenAI | null {
    if (!this.geminiClient && process.env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return this.geminiClient;
  }

  public static async verifyModelSupport(): Promise<boolean> {
    if (this.modelCheckedOk !== null) return this.modelCheckedOk;
    const ai = this.getAi();
    if (!ai) return false;
    try {
      await ai.models.get({ model: 'gemini-4-hydrogen' });
      this.modelCheckedOk = true;
    } catch {
      this.modelCheckedOk = true; // Allow call path to attempt with explicit 404/503 error capture
    }
    return this.modelCheckedOk;
  }

  public static async generateGeminiReport(
    stock: EGXStock,
    currentPrice: number,
    recommendationAr: string,
    overallScore: number,
    confidenceScore: number,
    mathematicalRationaleAr: string,
    fairValue: FairValueResult,
    preferredEntryZone: { min: number; max: number; labelAr: string },
    stopLossPrice: number,
    stopLossLogicAr: string,
    target1: { price: number; upsidePct: number },
    target2: { price: number; upsidePct: number } | null,
    target3: { price: number; upsidePct: number } | null,
    rewardRiskRatio: number,
    tech: TechnicalIndicatorsResult,
    fund: FundamentalDataResult,
    news: NewsItem[],
    discrepancyNoticeAr?: string
  ): Promise<string> {
    const ai = this.getAi();
    if (!ai) return "";

    await this.verifyModelSupport();

    const lastCandlesText = tech.lastCandlesAnalysis
      ? tech.lastCandlesAnalysis.recentBars
          .map(b => `  * ${b.date}: فتح ${b.open} | أعلى ${b.high} | أدنى ${b.low} | إغلاق ${b.close} (${b.changePct >= 0 ? `+${b.changePct}%` : `${b.changePct}%`}) | حجم ${(b.volume / 1000).toFixed(0)}ألف (${b.volumeRatio}x) -> ${b.candleTypeAr}`)
          .join('\n')
      : 'غير متوفر';

    const targetsLine = [
      `T1=${target1.price} (+${target1.upsidePct}%)`,
      target2 ? `T2=${target2.price} (+${target2.upsidePct}%)` : null,
      target3 ? `T3=${target3.price} (+${target3.upsidePct}%)` : null
    ].filter(Boolean).join(' | ');

    const prompt = `
أنت محلل مالي وفني يفسر النتائج الحسابية المحسوبة بالفعل لسهم "${stock.nameAr}" (رمز: ${stock.ticker}).
قواعد صارمة غير قابلة للتجاوز:
1. يُحظر عليك اختلاق أو تعديل أي سعر أو مؤشر أو هدف أو خبر غير موجود نصاً في المدخلات أدناه.
2. فرّق بوضوح بين الاحتمال (محتمل/مشروط) والتأكيد (مؤكد بإغلاق وحجم تداول)، واذكر أي تعارض أو تأخير بين المصادر إن وُجد.
3. إذا كانت القيمة العادلة أو أي نسبة مالية "غير متوفر" لا تستنتج بديلاً لها.

النتائج الحسابية الموثقة:
- تاريخ أحدث بيانات متاحة: ${tech.lastCandleDate || stock.priceDate || 'غير محدد'}
- ملاحظة حداثة / تعارض المصادر: ${discrepancyNoticeAr || 'لا توجد تعارضات جوهرية مسجلة'}
- سعر الإغلاق الحالي: ${currentPrice} ${stock.currency}
- القرار الحسابي الصادر: ${recommendationAr}
- التقييم الكلي: ${overallScore}/100 | ثقة اكتمال البيانات: ${confidenceScore}%
- السبب الحسابي للقرار: ${mathematicalRationaleAr}
- القيمة العادلة الحسابية: ${fairValue.available ? `${fairValue.estimatedFairValue} (${fairValue.upsideDownsidePct}%) عبر ${fairValue.formulaExplanationAr}` : `غير متاحة (${fairValue.insufficientReasonAr})`}
- نطاق الدخول: ${preferredEntryZone.labelAr}
- وقف الخسارة: ${stopLossPrice} (${stopLossLogicAr})
- المستهدفات المبررة فنياً: ${targetsLine}
- العائد للمخاطرة: 1:${rewardRiskRatio}
- المتوسطات: EMA20=${tech.ema20} | EMA50=${tech.ema50} | EMA200=${tech.ema200}
- الزخم: RSI(14)=${tech.rsi14} | MACD=${tech.macd.macdLine} (Signal=${tech.macd.signalLine}) | ATR(14)=${tech.atr14}
- التذبذب والاختراق الكاذب: ${tech.volatilityContraction?.noteAr || '—'}${tech.falseBreakoutNoteAr ? ` | تحذير: ${tech.falseBreakoutNoteAr}` : ''}
- الدعوم الحقيقية: ${tech.supportZones.length > 0 ? tech.supportZones.map(z => `${z.priceLevel} (${z.description})`).join(' | ') : 'لا توجد مستويات كافية'}
- المقاومات الحقيقية: ${tech.resistanceZones.length > 0 ? tech.resistanceZones.map(z => `${z.priceLevel} (${z.description})`).join(' | ') : 'لا توجد مستويات كافية'}
- آخر الشموع الفعلية:
${lastCandlesText}
- النسب المالية المنشورة (TTM/FQ): P/E=${fund.ratios.peRatio ?? 'غير متوفر'} | P/B=${fund.ratios.pbRatio ?? 'غير متوفر'} | ROE=${fund.ratios.roe ?? 'غير متوفر'}% | هامش الصافي=${fund.ratios.netProfitMargin ?? 'غير متوفر'}%
- أحدث خبر مرصود: ${news[0] ? `${news[0].titleAr} [${news[0].isConfirmed ? 'مؤكد رسمياً' : 'خبر صحفي غير مؤكد رسمياً'}]` : 'لا توجد أخبار منشورة حديثة'}

اكتب تفسيراً استثمارياً عربياً رصيناً من 5 نقاط موجزة تشرح دلالة هذه الأرقام والسبب الحسابي للقرار، وأي تعارض محتمل ومناطق المخاطرة وشروط الإلغاء، مع الالتزام الحرفي بالأرقام المذكورة فقط.
`;

    let activeModel = "gemini-4-hydrogen";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const timeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini API call timed out after 18000ms")), 18000)
        );

        const callPromise = (async () => {
          const response = await ai.models.generateContent({
            model: activeModel,
            contents: prompt,
            config: {
              systemInstruction: "أنت محلل مالي للبورصة المصرية. مهمتك تفسير النتائج الحسابية المعطاة فقط دون اختلاق أي أسعار أو مؤشرات أو نسب غير موجودة في المعطيات، ومع ذكر التحذيرات وشروط الإبطال بوضوح.",
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
            }
          });
          return response.text || "";
        })();

        return await Promise.race([callPromise, timeoutPromise]);
      } catch (err: any) {
        const status = err?.status || err?.code;
        const msg = String(err?.message || '');
        if (attempt === 0 && (status === 429 || msg.includes('RESOURCE_EXHAUSTED'))) {
          activeModel = "gemini-3.1-flash-lite";
          continue;
        }
        if (attempt === 0 && (status === 503 || msg.includes('503'))) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        throw err;
      }
    }
    return "";
  }

  public static async analyze(
    stock: EGXStock,
    tech: TechnicalIndicatorsResult | null,
    fund: FundamentalDataResult,
    fairValue: FairValueResult,
    news: NewsItem[],
    options?: { generateFreshAi?: boolean; techErrorAr?: string; recordHistory?: boolean; discrepancyNoticeAr?: string }
  ): Promise<InvestmentPlanResult> {
    const currentPrice = stock.currentPrice;
    const isStaleData = !stock.isLiveQuote || !!stock.isStaleQuote || (tech?.isStale ?? true);
    const dataDate = tech?.lastCandleDate || stock.priceDate || null;

    // STRICT INSUFFICIENT-DATA GUARD
    if (!tech || !tech.isRealData || tech.candlesCount < 30 || tech.atr14 === null) {
      const reason =
        options?.techErrorAr ||
        'لا تتوافر شموع تاريخية فعلية كافية (30 جلسة على الأقل من Yahoo Finance) لإصدار تحليل فني أو توصية استثمارية موثقة.';

      const gateFailure: RiskGateStatus[] = [
        {
          passed: false,
          gateName: "Minimum Historical Data Gate",
          gateNameAr: "بوابة توافر البيانات التاريخية الفعلية (30 جلسة على الأقل)",
          detailsAr: reason
        },
        {
          passed: !!stock.isLiveQuote && !stock.isStaleQuote,
          gateName: "Live Price Feed Gate",
          gateNameAr: "بوابة المزامنة الحية لمصدر الأسعار",
          detailsAr: stock.isLiveQuote && !stock.isStaleQuote
            ? `السعر مزامن من TradingView بتاريخ ${stock.priceDate}`
            : `تعذرت المزامنة الحية أو البيانات قديمة — آخر سعر بتاريخ ${stock.priceDate || 'غير محدد'}`
        }
      ];

      return {
        ticker: stock.ticker,
        companyNameAr: stock.nameAr,
        currentPrice,
        available: false,
        insufficientReasonAr: reason,
        isStaleData: true,
        dataDate,
        recommendation: 'INSUFFICIENT_DATA',
        recommendationAr: 'بيانات غير كافية — لا يصدر تحليل',
        recommendationBadgeColor: 'slate',
        holdingPeriodAr: 'غير متاح لعدم كفاية البيانات',
        overallScore: null,
        confidenceScore: null,
        mathematicalRationaleAr: reason,
        scoreFormulaAr: 'توقف الحساب لغياب الحد الأدنى من الشموع التاريخية الفعلية.',
        pillars: [],
        scoreBreakdown: {
          technicalWeight: 0,
          technicalScore: null,
          fundamentalWeight: 0,
          fundamentalScore: fund.ratios.fundamentalQualityScore,
          liquidityWeight: 0,
          liquidityScore: null,
          valuationWeight: 0,
          valuationScore: null,
          marketWeight: 0,
          marketScore: null
        },
        preferredEntryZone: null,
        alternativeEntryZone: null,
        breakoutTriggerPrice: null,
        entryConfirmationAr: 'غير متاح لعدم توافر بيانات كافية',
        entryConditionsAr: [],
        invalidationConditionsAr: [],
        stopLossPrice: null,
        stopLossPct: null,
        stopLossLogicAr: reason,
        target1: null,
        target2: null,
        target3: null,
        targetNotesAr: reason,
        rewardRiskRatio: null,
        expectedUpsidePct: null,
        nearestSupport: null,
        nearestResistance: null,
        relativeVolume: null,
        selectionReasonsAr: [],
        potentialRisksAr: [reason],
        estimatedFairValue: fairValue.estimatedFairValue,
        fairValueUpsidePct: fairValue.upsideDownsidePct,
        marginOfSafetyPct: fairValue.marginOfSafetyPct,
        currentTrendAr: 'غير متاح لعدم كفاية الشموع التاريخية',
        expectedTrendAr: 'لم تصدر توصية أو مستهدف سعري التزاماً بقاعدة التحقق من البيانات.',
        riskGates: gateFailure,
        allGatesPassed: false,
        bullishScenario: null,
        bearishScenario: null,
        neutralScenario: null,
        positiveFactorsAr: [],
        negativeFactorsAr: [reason],
        thingsToMonitorAr: ['مراجعة توافر الشموع التاريخية على Yahoo Finance وإعادة المزامنة'],
        arabicAiReport: `# تعذر إصدار تحليل لسهم ${stock.nameAr} (${stock.ticker})\n\n**السبب:** ${reason}`,
        reportGeneratedAt: new Date().toISOString(),
        modelUsed: 'Data Integrity Gate'
      };
    }

    const overview = MarketDataService.getMarketOverview();

    // Build pillars strictly from REAL available components
    const rawPillars: {
      key: string;
      labelAr: string;
      baseWeight: number;
      score: number;
      formulaAr: string;
    }[] = [
      {
        key: 'technical',
        labelAr: 'التحليل الفني (الشموع الفعلية)',
        baseWeight: 40,
        score: tech.technicalScore,
        formulaAr: tech.technicalScoreFormulaAr
      }
    ];

    let fundamentalScore: number | null = null;
    if (fund.available && fund.ratios.fundamentalQualityScore !== null) {
      fundamentalScore = fund.ratios.fundamentalQualityScore;
      rawPillars.push({
        key: 'fundamental',
        labelAr: 'الجودة المالية (البيانات المنشورة)',
        baseWeight: 25,
        score: fundamentalScore,
        formulaAr: fund.qualityScoreFormulaAr
      });
    }

    let valuationScore: number | null = null;
    if (fairValue.available && fairValue.upsideDownsidePct !== null) {
      valuationScore = Math.max(10, Math.min(95, Math.round(50 + fairValue.upsideDownsidePct * 1.2)));
      rawPillars.push({
        key: 'valuation',
        labelAr: 'جاذبية التقييم (القيمة العادلة)',
        baseWeight: 15,
        score: valuationScore,
        formulaAr: `50 + (${fairValue.upsideDownsidePct}% × 1.2) = ${valuationScore}/100`
      });
    }

    let liquidityScore = 35;
    const valM = stock.valueTraded / 1_000_000;
    if (valM >= 100) liquidityScore = 92;
    else if (valM >= 40) liquidityScore = 82;
    else if (valM >= 15) liquidityScore = 70;
    else if (valM >= 5) liquidityScore = 55;
    if (tech.relativeVolume >= 1.4) {
      liquidityScore = Math.min(98, liquidityScore + 8);
    }
    rawPillars.push({
      key: 'liquidity',
      labelAr: 'السيولة اليومية الفعلية',
      baseWeight: 10,
      score: liquidityScore,
      formulaAr: `قيمة تداول ${valM.toFixed(1)} مليون جم + RVOL ${tech.relativeVolume}x = ${liquidityScore}/100`
    });

    let marketScore: number | null = null;
    if (
      overview.dataStatus.tradingViewOnline &&
      overview.marketBreadthRatio !== null &&
      overview.egx30 &&
      overview.egx30.changePct !== null
    ) {
      const breadthPts = Math.max(20, Math.min(90, Math.round(overview.marketBreadthRatio * 35 + (overview.egx30.changePct * 5))));
      marketScore = breadthPts;
      rawPillars.push({
        key: 'market',
        labelAr: 'اتجاه السوق العام (EGX30 والاتساع)',
        baseWeight: 10,
        score: marketScore,
        formulaAr: `نسبة الصاعد/الهابط ${overview.marketBreadthRatio} + تغير EGX30 (${overview.egx30.changePct}%) = ${marketScore}/100`
      });
    }

    const totalBaseWeight = rawPillars.reduce((s, p) => s + p.baseWeight, 0);
    const pillars: ScorePillarBreakdown[] = rawPillars.map((p, idx) => {
      const weightPct =
        idx === rawPillars.length - 1
          ? 100 - rawPillars.slice(0, -1).reduce((s, x) => s + Math.round((x.baseWeight / totalBaseWeight) * 100), 0)
          : Math.round((p.baseWeight / totalBaseWeight) * 100);
      const weightedContribution = Number(((p.score * weightPct) / 100).toFixed(2));
      return {
        key: p.key,
        labelAr: p.labelAr,
        weightPct,
        score: p.score,
        weightedContribution,
        formulaAr: p.formulaAr
      };
    });

    const overallScore = Number(
      pillars.reduce((s, p) => s + p.weightedContribution, 0).toFixed(1)
    );

    let confidenceScore = Math.round(
      (tech.candlesCount >= 120 ? 45 : 30) +
      (fund.dataCompletenessPct * 0.35) +
      (stock.isLiveQuote && !isStaleData ? 20 : 0)
    );
    confidenceScore = Math.max(20, Math.min(98, confidenceScore));

    // Mandatory Real Risk Gates (Sector-aware debt gate + Stale quote gate!)
    const hasSevereNegativeNews = news.some(n => n.impact === 'VERY_NEGATIVE');
    const debtLimit = fund.sectorProfile === 'BANK_FINANCIAL' ? Infinity : fund.sectorProfile === 'REAL_ESTATE' ? 2.8 : 2.5;
    const debtOk = fund.ratios.debtToEquity === null || fund.ratios.debtToEquity < debtLimit;

    const riskGates: RiskGateStatus[] = [
      {
        passed: !isStaleData,
        gateName: "Data Freshness Gate",
        gateNameAr: "بوابة حداثة الأسعار والشموع (ممنوع الشراء على بيانات قديمة)",
        detailsAr: !isStaleData
          ? `البيانات حديثة ومزامنة لجلسة ${dataDate}`
          : `البيانات قديمة أو تعذر التحديث الحي (${dataDate || 'غير محدد'}) — يُمنع إصدار توصية شراء`
      },
      {
        passed: tech.candlesCount >= 30,
        gateName: "Historical Candles Gate",
        gateNameAr: "بوابة الشموع التاريخية الفعلية",
        detailsAr: `متوفر ${tech.candlesCount} شمعة فعلية من Yahoo Finance حتى ${tech.lastCandleDate}`
      },
      {
        passed: stock.valueTraded >= 3_000_000,
        gateName: "Minimum Liquidity Gate",
        gateNameAr: "بوابة السيولة اليومية وسهولة التخارج",
        detailsAr: stock.valueTraded >= 3_000_000
          ? `قيمة التداول (${valM.toFixed(1)} مليون جم) تتجاوز الحد الأدنى (3 مليون جم)`
          : `تنبيه سيولة منخفضة: قيمة التداول (${valM.toFixed(2)} مليون جم) دون الحد الأدنى للسيولة التداولية`
      },
      {
        passed: debtOk,
        gateName: "Financial Solvency Gate",
        gateNameAr: "بوابة الملاءة المالية القطاعية",
        detailsAr: fund.sectorProfile === 'BANK_FINANCIAL'
          ? 'قطاع بنكي/مالي — يتم التقييم وفق العائد على الأصول (ROA) وكفاية حقوق الملكية.'
          : fund.ratios.debtToEquity !== null
          ? `نسبة الدين إلى حقوق الملكية (${fund.ratios.debtToEquity}) ضمن الحد القطاعي (< ${debtLimit})`
          : 'نسبة المديونية غير منشورة حالياً (مستبعدة من الوزن).'
      },
      {
        passed: !hasSevereNegativeNews,
        gateName: "Disclosures & RSS Headline Gate",
        gateNameAr: "بوابة الأخبار السلبية الحادة",
        detailsAr: hasSevereNegativeNews
          ? 'تم رصد خبر ذي صيغة سلبية حادة في التغذية الإخبارية'
          : `لا توجد إشارات إخبارية حادة السلبية (${news.length} أخبار مرصودة)`
      }
    ];

    const nonFreshPassed = riskGates.filter(g => g.gateName !== 'Data Freshness Gate').every(g => g.passed);
    const allGatesPassed = riskGates.every(g => g.passed);
    const upsideVal = fairValue.available ? fairValue.upsideDownsidePct : null;

    let recommendation: RecommendationType = 'WAIT';
    let recommendationAr = 'ترقب وانتظار (WAIT)';
    let recommendationBadgeColor = 'amber';
    let decisionRuleAr = '';

    if (isStaleData) {
      recommendation = 'WAIT';
      recommendationAr = 'موقوف عن الشراء — بيانات قديمة (WAIT)';
      recommendationBadgeColor = 'amber';
      decisionRuleAr = `تم حجب توصية الشراء تلقائياً لأن أحدث بيانات متوفرة تعود لتاريخ ${dataDate || 'غير محدد'} أو تعطل البث الحي.`;
    } else if (!nonFreshPassed) {
      recommendation = 'AVOID';
      recommendationAr = 'تجنب الدخول لعدم اجتياز بوابات المخاطر (AVOID)';
      recommendationBadgeColor = 'red';
      decisionRuleAr = 'فشل إحدى بوابات المخاطر الإلزامية (السيولة أو المديونية أو الأخبار السلبية الحادة)';
    } else if (tech.falseBreakoutDetected) {
      recommendation = 'WAIT';
      recommendationAr = 'ترقب — رصد رفض بيعي / اختراق كاذب (WAIT)';
      recommendationBadgeColor = 'amber';
      decisionRuleAr = `${tech.falseBreakoutNoteAr || 'رفض سعري علوي'} رغم التقييم (${overallScore}/100)؛ يلزم تأكيد إغلاق قوي قبل الدخول.`;
    } else if (overallScore >= 80 && tech.dailyTrend === 'BULLISH' && (upsideVal === null || upsideVal >= 10)) {
      recommendation = 'STRONG_BUY';
      recommendationAr = 'شراء قوي (STRONG BUY)';
      recommendationBadgeColor = 'emerald';
      decisionRuleAr = `التقييم المرجح ${overallScore} >= 80 + الاتجاه اليومي صاعد${upsideVal !== null ? ` + هامش أمان ${upsideVal}% >= 10%` : ''}`;
    } else if (overallScore >= 68 && tech.dailyTrend !== 'BEARISH' && (upsideVal === null || upsideVal >= 3)) {
      recommendation = 'BUY';
      recommendationAr = 'شراء للدخول المتأرجح (BUY)';
      recommendationBadgeColor = 'emerald';
      decisionRuleAr = `التقييم المرجح ${overallScore} >= 68 + عدم هبوط الاتجاه اليومي${upsideVal !== null ? ` + هامش أمان ${upsideVal}% >= 3%` : ''}`;
    } else if (overallScore >= 58) {
      recommendation = 'WAIT';
      recommendationAr = 'ترقب نقطة دخول أفضل (WAIT)';
      recommendationBadgeColor = 'amber';
      decisionRuleAr = `التقييم المرجح ${overallScore} في نطاق الترقب (58 - 67.9) بانتظار تأكيد الزخم والسيولة`;
    } else if (overallScore >= 46) {
      recommendation = 'HOLD';
      recommendationAr = 'احتفاظ للمراكز القائمة (HOLD)';
      recommendationBadgeColor = 'blue';
      decisionRuleAr = `التقييم المرجح ${overallScore} في نطاق الاحتفاظ المتعادل (46 - 57.9)`;
    } else {
      recommendation = 'REDUCE';
      recommendationAr = 'تخفيف المراكز (REDUCE)';
      recommendationBadgeColor = 'orange';
      decisionRuleAr = `التقييم المرجح ${overallScore} < 46 يعكس ضعف الزخم أو سلبية المؤشرات`;
    }

    const scoreFormulaAr =
      pillars.map(p => `(${p.score} × ${p.weightPct}% [${p.labelAr}])`).join(' + ') +
      ` = ${overallScore}/100`;
    const mathematicalRationaleAr = `النتيجة الكلية (${overallScore}/100) ناتجة عن المعادلة: ${scoreFormulaAr}. قاعدة القرار: ${decisionRuleAr}.`;

    const unitLabel = stock.currency === 'USD' ? 'دولار' : 'جنيه';
    const atr = tech.atr14 > 0 ? tech.atr14 : Number((currentPrice * 0.025).toFixed(2));
    const supZone1 = tech.supportZones[0];
    const supZone2 = tech.supportZones[1];
    const resZone1 = tech.resistanceZones[0];

    const sup1 = supZone1?.priceLevel ?? Number((currentPrice - atr * 1.5).toFixed(2));
    const sup2 = supZone2?.priceLevel ?? Number((currentPrice - atr * 3.0).toFixed(2));
    const res1 = resZone1?.priceLevel ?? Number((currentPrice + atr * 1.5).toFixed(2));

    const anchorSupport = tech.ema20 && tech.ema20 > sup1 && tech.ema20 < currentPrice ? tech.ema20 : sup1;
    const rawEntryMin = Math.max(sup1, currentPrice - atr * 0.9);
    const preferredMin = Number(Math.min(rawEntryMin, anchorSupport).toFixed(2));
    const preferredMax = Number(Math.min(res1 * 0.992, Math.max(preferredMin + atr * 0.35, currentPrice + atr * 0.15)).toFixed(2));

    const preferredEntryZone = {
      min: preferredMin,
      max: preferredMax,
      labelAr: `${preferredMin} - ${preferredMax} ${unitLabel}`
    };

    const altMin = Number(Math.min(sup2, sup1 - atr * 0.8).toFixed(2));
    const altMax = Number(Math.max(altMin + 0.05, sup1 * 0.995).toFixed(2));
    const alternativeEntryZone = {
      min: altMin,
      max: altMax,
      labelAr: `${altMin} - ${altMax} ${unitLabel} (${supZone2?.description || 'نطاق دعم محسوب بـ ATR'})`
    };

    const breakoutTriggerPrice = Number((res1 * 1.004).toFixed(2));
    const entryConfirmationAr = `تأكيد إغلاق يومي داخل/أعلى ${preferredEntryZone.labelAr} أو اختراق المقاومة ${breakoutTriggerPrice} ${unitLabel} بحجم تداول RVOL >= 1.5x ودون ذيل علوي بيعي.`;

    const rawStop = sup1 - atr * 0.5;
    const minStopAllowed = currentPrice * 0.89;
    const maxStopAllowed = Math.min(preferredMin - 0.05, currentPrice * 0.975);
    const stopLossPrice = Number(Math.max(minStopAllowed, Math.min(maxStopAllowed, rawStop)).toFixed(2));
    const stopLossPct = Number((((stopLossPrice - currentPrice) / currentPrice) * 100).toFixed(1));
    const stopLossLogicAr = `أسفل مستوى الدعم (${sup1} ${unitLabel} - ${supZone1?.description || 'دعم 1.5×ATR'}) بمقدار 0.5×ATR (${(atr * 0.5).toFixed(2)} ${unitLabel}).`;

    // Build ONLY technically anchored targets from genuine resistance zones / 3M / 52W / Fibs — DO NOT fabricate a 3rd target!
    const candidateTargets: { price: number; rationaleAr: string }[] = [];
    for (const rz of tech.resistanceZones) {
      if (rz.priceLevel >= currentPrice * 1.01) {
        candidateTargets.push({ price: rz.priceLevel, rationaleAr: rz.description });
      }
    }
    if (tech.pivotPoints?.high3M && tech.pivotPoints.high3M > currentPrice * 1.02) {
      const h3m = Number(tech.pivotPoints.high3M.toFixed(2));
      if (!candidateTargets.some((t) => Math.abs(t.price - h3m) < atr * 0.6)) {
        candidateTargets.push({ price: h3m, rationaleAr: 'قمة 3 أشهر فعلية على TradingView' });
      }
    }
    if (tech.pivotPoints?.high52W && tech.pivotPoints.high52W > currentPrice * 1.03) {
      const h52 = Number(tech.pivotPoints.high52W.toFixed(2));
      if (!candidateTargets.some((t) => Math.abs(t.price - h52) < atr * 0.6)) {
        candidateTargets.push({ price: h52, rationaleAr: 'أعلى قمة سنوية فعلية (52W High)' });
      }
    }
    candidateTargets.sort((a, b) => a.price - b.price);

    const spacedTargets: { price: number; rationaleAr: string }[] = [];
    for (const ct of candidateTargets) {
      if (spacedTargets.length === 0 || ct.price - spacedTargets[spacedTargets.length - 1].price >= Math.max(atr * 0.65, currentPrice * 0.015)) {
        spacedTargets.push(ct);
      }
      if (spacedTargets.length === 3) break;
    }

    // Ensure at least Target 1 & Target 2 exist via ATR anchor when resistance is sparse, NEVER force Target 3 without real structural justification
    if (spacedTargets.length === 0) {
      const p1 = Number((currentPrice + Math.max(atr * 1.5, currentPrice * 0.035)).toFixed(2));
      spacedTargets.push({ price: p1, rationaleAr: 'مستهدف أول محسوب بـ 1.5×ATR(14) فوق السعر الحالي' });
    }
    if (spacedTargets.length === 1) {
      const p2 = Number((spacedTargets[0].price + Math.max(atr * 1.5, currentPrice * 0.035)).toFixed(2));
      spacedTargets.push({ price: p2, rationaleAr: 'مستهدف ثانٍ محسوب بامتداد 1.5×ATR(14) بعد المقاومة الأولى' });
    }

    const target1 = {
      price: spacedTargets[0].price,
      upsidePct: Number((((spacedTargets[0].price - currentPrice) / currentPrice) * 100).toFixed(1)),
      rationaleAr: spacedTargets[0].rationaleAr
    };
    const target2 = spacedTargets[1]
      ? {
          price: spacedTargets[1].price,
          upsidePct: Number((((spacedTargets[1].price - currentPrice) / currentPrice) * 100).toFixed(1)),
          rationaleAr: spacedTargets[1].rationaleAr
        }
      : null;
    const target3 = spacedTargets[2]
      ? {
          price: spacedTargets[2].price,
          upsidePct: Number((((spacedTargets[2].price - currentPrice) / currentPrice) * 100).toFixed(1)),
          rationaleAr: spacedTargets[2].rationaleAr
        }
      : null;

    const targetNotesAr = target3
      ? 'جميع الأهداف الثلاثة مستندة إلى مقاومات فعلية أو قمم 3 أشهر / 52 أسبوع.'
      : 'تم الاكتفاء بهدفين فقط لعدم توافر مقاومة هيكلية ثالثة موثقة فوق المستهدف الثاني (منعاً لاختلاق أهداف غير مبررة).';

    const entryRef = (preferredMin + preferredMax) / 2;
    const refTarget = target2 ?? target1;
    const potentialGain = Math.max(0.01, refTarget.price - entryRef);
    const potentialLoss = Math.max(0.01, entryRef - stopLossPrice);
    const rewardRiskRatio = Number((potentialGain / potentialLoss).toFixed(2));
    const expectedUpsidePct = target1.upsidePct;

    const lastBar = tech.lastCandlesAnalysis?.recentBars?.[tech.lastCandlesAnalysis.recentBars.length - 1];
    const candlesExcerptAr = tech.lastCandlesAnalysis
      ? tech.lastCandlesAnalysis.candlestickSummaryAr
      : `تداول السهم عند ${currentPrice} ${unitLabel}.`;

    const positiveFactorsAr: string[] = [
      `السبب الحسابي للقرار: ${mathematicalRationaleAr}`,
      `المسار الفعلي على الشموع: ${tech.lastCandlesAnalysis?.dominantPriceActionAr || tech.trendAlignmentStatusAr}`,
      `مؤشرات العزم الفعلية: RSI(14)=${tech.rsi14}، MACD=${tech.macd.macdLine} (${tech.macd.signal})`
    ];
    if (tech.volatilityContraction?.detected) {
      positiveFactorsAr.push(tech.volatilityContraction.noteAr);
    }
    if (fairValue.available && fairValue.estimatedFairValue !== null) {
      positiveFactorsAr.push(
        `القيمة العادلة الحسابية (${fairValue.estimatedFairValue} ${unitLabel}) تُظهر فارقاً تقييمياً بنسبة ${fairValue.upsideDownsidePct}%`
      );
    }

    const negativeFactorsAr: string[] = [
      `اختبار مقاومة ${target1.price} ${unitLabel} (${target1.rationaleAr}) يتطلب تأكيد سيولة`,
      `كسر الدعم ${sup1} ${unitLabel} يفعّل وقف الخسارة عند ${stopLossPrice} ${unitLabel}`
    ];
    if (tech.falseBreakoutNoteAr) {
      negativeFactorsAr.unshift(tech.falseBreakoutNoteAr);
    }
    if (isStaleData) {
      negativeFactorsAr.unshift(`تنبيه حداثة البيانات: أحدث تاريخ مسجل هو ${dataDate || 'غير محدد'} — موقوف عن الشراء.`);
    }
    if (!fund.available) {
      negativeFactorsAr.push(`نقص البيانات المالية المنشورة: ${fund.insufficientReasonAr}`);
    }

    const thingsToMonitorAr: string[] = [
      `ثبات الإغلاق أعلى ${preferredMin} ${unitLabel} والحفاظ على وقف الخسارة ${stopLossPrice} ${unitLabel}`,
      `مراقبة حجم التداول النسبي (RVOL حالياً ${tech.relativeVolume}x)`,
      `متابعة نمط آخر شمعة (${lastBar ? `${lastBar.candleTypeAr} بتاريخ ${lastBar.date}` : tech.patternsDetected[0] || '—'})`
    ];

    const bullishScenario: ScenarioPlan = {
      directionAr: "السيناريو الصاعد وتجاوز المقاومة",
      supportingConditionsAr: [
        `ثبات الإغلاق اليومي أعلى ${sup1} ${unitLabel} ومتوسط EMA20 (${tech.ema20})`,
        `اختراق ${target1.price} ${unitLabel} بسيولة تفوق متوسط 20 جلسة (RVOL >= 1.5x)`,
        `بقاء RSI (${tech.rsi14}) في المنطقة الإيجابية فوق 50`
      ],
      keyLevelsAr: `تأكيد الإغلاق أعلى ${breakoutTriggerPrice} ${unitLabel} يفتح المسار إلى ${target2 ? target2.price : target1.price}${target3 ? ` ثم ${target3.price}` : ''} ${unitLabel}.`,
      invalidationTriggerAr: `إغلاق جلسة يومية كاملة أسفل ${stopLossPrice} ${unitLabel} يلغي هذا السيناريو.`
    };

    const bearishScenario: ScenarioPlan = {
      directionAr: "السيناريو الهابط وكسر الدعم",
      supportingConditionsAr: [
        `رفض سعري عند ${target1.price} ${unitLabel} مع تراجع RSI أسفل 45`,
        `تقاطع سلبي لمؤشر MACD أسفل خط الإشارة`,
        `زيادة أحجام التداول في الجلسات الهابطة`
      ],
      keyLevelsAr: `كسر ${sup1} ${unitLabel} يفعّل التراجع نحو ${sup2} ${unitLabel}.`,
      invalidationTriggerAr: `استعادة التداول أعلى ${currentPrice} ${unitLabel} بسيولة مرتفعة ينفي السلبية.`
    };

    const neutralScenario: ScenarioPlan = {
      directionAr: "السيناريو العرضي المحصور",
      supportingConditionsAr: [
        `حركة السعر داخل نطاق ${sup1} - ${target1.price} ${unitLabel}`,
        `توازن أحجام الشراء والبيع حول المتوسط المتحرك EMA20`
      ],
      keyLevelsAr: `تذبذب محصور بين ${sup1} و${target1.price} ${unitLabel}.`,
      invalidationTriggerAr: `اختراق ${target1.price} صعوداً أو كسر ${sup1} هبوطاً بإغلاق مؤكد.`
    };

    const cacheKey = `${stock.ticker}:${currentPrice}:${tech.lastCandleDate || ''}:${overallScore}`;
    let arabicAiReport = this.reportCache.get(cacheKey) || "";
    const ai = this.getAi();

    if (!arabicAiReport && options?.generateFreshAi && ai) {
      try {
        arabicAiReport = await this.generateGeminiReport(
          stock,
          currentPrice,
          recommendationAr,
          overallScore,
          confidenceScore,
          mathematicalRationaleAr,
          fairValue,
          preferredEntryZone,
          stopLossPrice,
          stopLossLogicAr,
          target1,
          target2,
          target3,
          rewardRiskRatio,
          tech,
          fund,
          news,
          options?.discrepancyNoticeAr
        );
        if (arabicAiReport) {
          this.reportCache.set(cacheKey, arabicAiReport);
        }
      } catch (err) {
        console.warn("Gemini report generation error:", err);
      }
    }

    if (!arabicAiReport) {
      const barsTableText = (tech.lastCandlesAnalysis?.recentBars || [])
        .map(b => `- **${b.date}**: فتح \`${b.open}\` | أعلى \`${b.high}\` | أدنى \`${b.low}\` | إغلاق \`${b.close}\` (${b.changePct >= 0 ? `+${b.changePct}%` : `${b.changePct}%`}) — **${b.candleTypeAr}**`)
        .join('\n');

      const targetsMd = [
        `T1 عند **${target1.price}** (+${target1.upsidePct}%)`,
        target2 ? `T2 عند **${target2.price}** (+${target2.upsidePct}%)` : null,
        target3 ? `T3 عند **${target3.price}** (+${target3.upsidePct}%)` : null
      ].filter(Boolean).join(' | ');

      arabicAiReport = `
# التفسير الحسابي والفني الموثق لسهم ${stock.nameAr} (${stock.ticker})

### 1. قرار المحرك الرياضي والسبب الحسابي
- **التصنيف النهائي:** **[ ${recommendationAr} ]**
- **المعادلة المرجحة (${overallScore}/100):** ${scoreFormulaAr}
- **شرط التصنيف:** ${decisionRuleAr}
- **مصدر وحداثة البيانات:** ${tech.candlesCount} شمعة يومية فعلية حتى تاريخ **${tech.lastCandleDate}** (${isStaleData ? 'تنبيه: بيانات غير محدّثة لحظياً' : 'متزامن مع أحدث جلسة'}).

### 2. قراءة آخر الشموع الفعلية
${candlesExcerptAr}

${barsTableText ? `**تفاصيل آخر ${tech.lastCandlesAnalysis?.candlesCount} شموع:**\n${barsTableText}` : ''}

### 3. خطة التداول المبنية على ATR(${tech.atr14}) والدعوم الفعلية
- **نطاق الدخول:** **${preferredEntryZone.labelAr}** (${entryConfirmationAr})
- **وقف الخسارة:** **${stopLossPrice} ${unitLabel}** (${stopLossPct}%) — ${stopLossLogicAr}
- **المستهدفات:** ${targetsMd}
- **العائد للمخاطرة:** **1 : ${rewardRiskRatio}** (${targetNotesAr})

### 4. القيمة العادلة والنسب المنشورة (TTM / FQ)
- **القيمة العادلة:** ${fairValue.available ? `**${fairValue.estimatedFairValue} ${unitLabel}** (${fairValue.upsideDownsidePct}%) — ${fairValue.formulaExplanationAr}` : `غير متاحة حسابياً (${fairValue.insufficientReasonAr})`}
- **النسب المنشورة:** P/E: **${fund.ratios.peRatio ?? 'غير متوفر'}** | P/B: **${fund.ratios.pbRatio ?? 'غير متوفر'}** | ROE: **${fund.ratios.roe !== null ? `${fund.ratios.roe}%` : 'غير متوفر'}**
      `.trim();
    }

    return {
      ticker: stock.ticker,
      companyNameAr: stock.nameAr,
      currentPrice,
      available: true,
      isStaleData,
      dataDate,
      recommendation,
      recommendationAr,
      recommendationBadgeColor,
      holdingPeriodAr: "1 أسبوع إلى 1 شهر (تداول متأرجح Swing Trading)",
      overallScore,
      confidenceScore,
      mathematicalRationaleAr,
      scoreFormulaAr,
      pillars,
      scoreBreakdown: {
        technicalWeight: pillars.find(p => p.key === 'technical')?.weightPct ?? 0,
        technicalScore: tech.technicalScore,
        fundamentalWeight: pillars.find(p => p.key === 'fundamental')?.weightPct ?? 0,
        fundamentalScore,
        liquidityWeight: pillars.find(p => p.key === 'liquidity')?.weightPct ?? 0,
        liquidityScore,
        valuationWeight: pillars.find(p => p.key === 'valuation')?.weightPct ?? 0,
        valuationScore,
        marketWeight: pillars.find(p => p.key === 'market')?.weightPct ?? 0,
        marketScore
      },
      preferredEntryZone,
      alternativeEntryZone,
      breakoutTriggerPrice,
      entryConfirmationAr,
      entryConditionsAr: [
        entryConfirmationAr,
        `ثبات الإغلاق أعلى ${sup1} ${unitLabel} ومتوسط EMA20 (${tech.ema20})`,
        `دعم الاختراق فوق ${breakoutTriggerPrice} ${unitLabel} بأحجام تداول مرتفعة`
      ],
      invalidationConditionsAr: [
        `كسر مستوى وقف الخسارة ${stopLossPrice} ${unitLabel} بإغلاق جلسة كاملة`,
        `تراجع مؤشر RSI أسفل 40 مع تقاطع MACD سلبي`
      ],
      stopLossPrice,
      stopLossPct,
      stopLossLogicAr,
      target1,
      target2,
      target3,
      targetNotesAr,
      rewardRiskRatio,
      expectedUpsidePct,
      nearestSupport: sup1,
      nearestResistance: res1,
      relativeVolume: tech.relativeVolume,
      selectionReasonsAr: positiveFactorsAr,
      potentialRisksAr: negativeFactorsAr,
      estimatedFairValue: fairValue.estimatedFairValue,
      fairValueUpsidePct: fairValue.upsideDownsidePct,
      marginOfSafetyPct: fairValue.marginOfSafetyPct,
      currentTrendAr: tech.trendAlignmentStatusAr,
      expectedTrendAr: `استهداف ${target1.price}${target2 ? ` ثم ${target2.price}` : ''} ${unitLabel} بشرط الحفاظ على وقف الخسارة ${stopLossPrice}`,
      riskGates,
      allGatesPassed,
      bullishScenario,
      bearishScenario,
      neutralScenario,
      positiveFactorsAr,
      negativeFactorsAr,
      thingsToMonitorAr,
      arabicAiReport,
      reportGeneratedAt: new Date().toISOString(),
      modelUsed: arabicAiReport && options?.generateFreshAi && ai ? "gemini-4-hydrogen (مفسر للنتائج الحسابية)" : "EGX Deterministic Quantitative Engine"
    };
  }
}
