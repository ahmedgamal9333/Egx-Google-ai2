import { getEGXStock } from '../data/egxStocks';

export type MetricProvenance = 'PUBLISHED_STATEMENT' | 'COMPUTED_FROM_MULTIPLE' | 'UNAVAILABLE';
export type SectorProfile = 'BANK_FINANCIAL' | 'REAL_ESTATE' | 'INDUSTRIAL_CONSUMER_UTILITY';

export interface FinancialYearData {
  year: number;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  totalAssets: number;
  totalEquity: number;
  totalDebt: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  dividendPerShare: number;
}

export interface FinancialRatios {
  grossProfitMargin: number | null;
  operatingMargin: number | null;
  netProfitMargin: number | null;
  roe: number | null;
  roa: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
  dividendPayoutRatio: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  freeCashFlow: number | null;
  operatingCashFlow: number | null;
  totalRevenue: number | null;
  netIncomeTtm: number | null;
  revenueGrowthPct: number | null;
  epsGrowthPct: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  marketCapEgp: number | null;
  high52W: number | null;
  low52W: number | null;
  fundamentalQualityScore: number | null;
  earningsQualityStatusAr: string;
  financialRiskStatusAr: string;
  dividendSustainabilityAr: string;
}

export interface FundamentalDataResult {
  ticker: string;
  available: boolean;
  insufficientReasonAr?: string;
  sectorProfile: SectorProfile;
  sectorProfileAr: string;
  fundamentalConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
  availableMetricsCount: number;
  dataCompletenessPct: number;
  reportingPeriod: string;
  fiscalPeriodEndDate: string | null;
  earningsReleaseDate: string | null;
  nextEarningsDate: string | null;
  dataSourceLabel: string;
  publicationDate: string | null;
  publishedMetrics: Record<string, number | string | null>;
  derivedMetrics: {
    impliedEpsFromPe: number | null;
    impliedBvpsFromPb: number | null;
    marketCapFromListedShares: number | null;
    fcfToNetIncomeRatio: number | null;
    noteAr: string;
  };
  unavailableMetrics: string[];
  metricProvenance: Record<string, MetricProvenance>;
  historicalYears: FinancialYearData[];
  historicalStatementsNoteAr: string;
  qualityScoreFormulaAr: string;
  qualityScoreComponents: { labelAr: string; points: number; detailAr: string }[];
  ratios: FinancialRatios;
}

export function classifySectorProfile(sectorEn: string, sectorAr: string): {
  profile: SectorProfile;
  labelAr: string;
} {
  const combined = `${sectorEn} ${sectorAr}`.toLowerCase();
  if (/bank|financial|بنوك|خدمات مالية|تمويل/.test(combined)) {
    return {
      profile: 'BANK_FINANCIAL',
      labelAr: 'قطاع البنوك والخدمات المالية (يُستبعد الدَّين للودائع والنسبة الجارية التقليدية)'
    };
  }
  if (/real estate|عقار|مقاولات/.test(combined)) {
    return {
      profile: 'REAL_ESTATE',
      labelAr: 'قطاع العقارات والتطوير (رافعة تمويل مشاريع طبيعية)'
    };
  }
  return {
    profile: 'INDUSTRIAL_CONSUMER_UTILITY',
    labelAr: 'قطاع تشغيلي / صناعي / استهلاكي / اتصالات'
  };
}

export class FundamentalAnalysisEngine {
  public static getFinancials(ticker: string, currentPrice: number): FundamentalDataResult {
    const norm = ticker.toUpperCase().replace('.CA', '');
    const stock = getEGXStock(norm);
    const priceDate = stock?.priceDate || null;

    if (!stock) {
      return {
        ticker: norm,
        available: false,
        insufficientReasonAr: `لم يتم العثور على بيانات السهم ${norm} في قاعدة البورصة المصرية.`,
        sectorProfile: 'INDUSTRIAL_CONSUMER_UTILITY',
        sectorProfileAr: 'غير محدد',
        fundamentalConfidence: 'UNAVAILABLE',
        availableMetricsCount: 0,
        dataCompletenessPct: 0,
        reportingPeriod: 'غير متوفر',
        fiscalPeriodEndDate: null,
        earningsReleaseDate: null,
        nextEarningsDate: null,
        dataSourceLabel: 'غير متوفر',
        publicationDate: null,
        publishedMetrics: {},
        derivedMetrics: {
          impliedEpsFromPe: null,
          impliedBvpsFromPb: null,
          marketCapFromListedShares: null,
          fcfToNetIncomeRatio: null,
          noteAr: 'السهم غير موجود.'
        },
        unavailableMetrics: ['جميع المؤشرات المالية غير متوفرة'],
        metricProvenance: {},
        historicalYears: [],
        historicalStatementsNoteAr: 'القوائم المالية غير متوفرة.',
        qualityScoreFormulaAr: 'لا يتوفر تقييم مالي لعدم وجود السهم.',
        qualityScoreComponents: [],
        ratios: {
          grossProfitMargin: null,
          operatingMargin: null,
          netProfitMargin: null,
          roe: null,
          roa: null,
          peRatio: null,
          pbRatio: null,
          dividendYield: null,
          dividendPayoutRatio: null,
          debtToEquity: null,
          currentRatio: null,
          freeCashFlow: null,
          operatingCashFlow: null,
          totalRevenue: null,
          netIncomeTtm: null,
          revenueGrowthPct: null,
          epsGrowthPct: null,
          eps: null,
          bookValuePerShare: null,
          marketCapEgp: null,
          high52W: null,
          low52W: null,
          fundamentalQualityScore: null,
          earningsQualityStatusAr: 'لا تتوفر بيانات مالية معتمدة',
          financialRiskStatusAr: 'لا تتوفر بيانات ملاءة مالية',
          dividendSustainabilityAr: 'غير متاح'
        }
      };
    }

    const { profile: sectorProfile, labelAr: sectorProfileAr } = classifySectorProfile(
      stock.sectorEn,
      stock.sectorAr
    );

    // 1. PUBLISHED STATEMENT / VERIFIED TRADINGVIEW TTM-FQ FIGURES (Never circularly derived from Price / P/E)
    const peRatio = stock.tvPeRatio ?? null;
    const pbRatio = stock.tvPbRatio ?? null;
    const dividendYield = stock.tvDividendYield ?? null;
    const dividendPayoutRatio = stock.tvDividendPayoutRatio ?? null;
    const roe = stock.tvRoe ?? null;
    const roa = stock.tvRoa ?? null;
    const debtToEquity = stock.tvDebtToEquity ?? null;
    const currentRatio = stock.tvCurrentRatio ?? null;
    const netProfitMargin = stock.tvNetMargin ?? null;
    const operatingMargin = stock.tvOperatingMargin ?? null;
    const grossProfitMargin = stock.tvGrossMargin ?? null;
    const freeCashFlow = stock.tvFreeCashFlow ?? null;
    const operatingCashFlow = stock.tvOperatingCashFlow ?? null;
    const totalRevenue = stock.tvTotalRevenue ?? null;
    const netIncomeTtm = stock.tvNetIncomeTtm ?? stock.tvNetIncome ?? null;
    const revenueGrowthPct = stock.tvRevenueGrowthYoy ?? null;
    const epsGrowthPct = stock.tvEpsGrowthYoy ?? null;

    const publishedEps =
      stock.tvEps !== null && stock.tvEps !== undefined
        ? stock.tvEps
        : stock.tvLastAnnualEps !== null && stock.tvLastAnnualEps !== undefined
        ? stock.tvLastAnnualEps
        : null;

    const publishedBvps =
      stock.tvBvps !== null && stock.tvBvps !== undefined
        ? stock.tvBvps
        : stock.tvBookValue !== null && stock.tvBookValue !== undefined
        ? stock.tvBookValue
        : null;

    // 2. MATHEMATICALLY DERIVED FIGURES (Strictly separated and labeled; NEVER disguised as published)
    const impliedEpsFromPe =
      publishedEps === null && peRatio && peRatio > 0 && currentPrice > 0
        ? Number((currentPrice / peRatio).toFixed(3))
        : null;
    const impliedBvpsFromPb =
      publishedBvps === null && pbRatio && pbRatio > 0 && currentPrice > 0
        ? Number((currentPrice / pbRatio).toFixed(3))
        : null;
    const marketCapFromListedShares =
      stock.listedShares > 0 && currentPrice > 0
        ? Math.round(stock.listedShares * currentPrice * 1_000_000)
        : null;
    const marketCapEgp = stock.tvMarketCap ?? marketCapFromListedShares;

    const fcfToNetIncomeRatio =
      freeCashFlow !== null && netIncomeTtm !== null && netIncomeTtm > 0
        ? Number((freeCashFlow / netIncomeTtm).toFixed(2))
        : null;

    const metricProvenance: Record<string, MetricProvenance> = {
      peRatio: peRatio !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      pbRatio: pbRatio !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      eps: publishedEps !== null ? 'PUBLISHED_STATEMENT' : impliedEpsFromPe !== null ? 'COMPUTED_FROM_MULTIPLE' : 'UNAVAILABLE',
      bookValuePerShare:
        publishedBvps !== null ? 'PUBLISHED_STATEMENT' : impliedBvpsFromPb !== null ? 'COMPUTED_FROM_MULTIPLE' : 'UNAVAILABLE',
      roe: roe !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      roa: roa !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      netProfitMargin: netProfitMargin !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      operatingMargin: operatingMargin !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      debtToEquity: debtToEquity !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      currentRatio: currentRatio !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      freeCashFlow: freeCashFlow !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      dividendYield: dividendYield !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      revenueGrowthPct: revenueGrowthPct !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      epsGrowthPct: epsGrowthPct !== null ? 'PUBLISHED_STATEMENT' : 'UNAVAILABLE',
      marketCapEgp:
        stock.tvMarketCap !== null && stock.tvMarketCap !== undefined
          ? 'PUBLISHED_STATEMENT'
          : marketCapFromListedShares !== null
          ? 'COMPUTED_FROM_MULTIPLE'
          : 'UNAVAILABLE'
    };

    const publishedMetrics: Record<string, number | string | null> = {
      peRatio,
      pbRatio,
      publishedEps,
      publishedBvps,
      roe,
      roa,
      netProfitMargin,
      operatingMargin,
      grossProfitMargin,
      debtToEquity,
      currentRatio,
      freeCashFlow,
      operatingCashFlow,
      dividendYield,
      dividendPayoutRatio,
      totalRevenue,
      netIncomeTtm,
      revenueGrowthPct,
      epsGrowthPct,
      fiscalPeriodEndDate: stock.tvFiscalPeriodEndDate ?? null,
      earningsReleaseDate: stock.tvEarningsReleaseDate ?? null
    };

    const fieldLabelMap: [string, unknown][] = [
      ['P/E مكرر الربحية', peRatio],
      ['P/B مضاعف القيمة الدفترية', pbRatio],
      ['ربحية السهم المنشورة (EPS)', publishedEps],
      ['القيمة الدفترية المنشورة (BVPS)', publishedBvps],
      ['العائد على الملكية (ROE)', roe],
      ['العائد على الأصول (ROA)', roa],
      ['هامش صافي الربح', netProfitMargin],
      ['هامش الربح التشغيلي', operatingMargin],
      ['التدفقات النقدية الحرة (FCF)', freeCashFlow],
      ['نمو الإيرادات السنوي', revenueGrowthPct],
      ['نمو ربحية السهم السنوي', epsGrowthPct],
      ['عائد التوزيعات النقدي', dividendYield]
    ];
    if (sectorProfile !== 'BANK_FINANCIAL') {
      fieldLabelMap.push(['نسبة الدين للملكية (D/E)', debtToEquity], ['النسبة الجارية (Current Ratio)', currentRatio]);
    }

    const unavailableMetrics = fieldLabelMap.filter(([, val]) => val === null || val === undefined).map(([lbl]) => lbl);

    const coreRelevant =
      sectorProfile === 'BANK_FINANCIAL'
        ? [peRatio, pbRatio, publishedEps, publishedBvps, roe, roa, netProfitMargin, dividendYield]
        : [peRatio, pbRatio, publishedEps, publishedBvps, roe, debtToEquity, currentRatio, netProfitMargin, freeCashFlow, revenueGrowthPct];

    const availableMetricsCount = coreRelevant.filter((v) => v !== null && v !== undefined).length;
    const dataCompletenessPct = Math.round((availableMetricsCount / coreRelevant.length) * 100);
    const available = availableMetricsCount >= 3;

    let fundamentalConfidence: FundamentalDataResult['fundamentalConfidence'] = 'UNAVAILABLE';
    if (!available) {
      fundamentalConfidence = 'UNAVAILABLE';
    } else if (dataCompletenessPct >= 75 && publishedEps !== null && publishedBvps !== null) {
      fundamentalConfidence = 'HIGH';
    } else if (dataCompletenessPct >= 50) {
      fundamentalConfidence = 'MEDIUM';
    } else {
      fundamentalConfidence = 'LOW';
    }

    // 3. SECTOR-AWARE FUNDAMENTAL QUALITY SCORING
    const qualityScoreComponents: { labelAr: string; points: number; detailAr: string }[] = [];
    let fundamentalQualityScore: number | null = null;
    let qualityScoreFormulaAr = '';

    if (available) {
      let totalPoints = 45;
      qualityScoreComponents.push({
        labelAr: 'أساس التقييم المالي القطاعي',
        points: 45,
        detailAr: sectorProfileAr
      });

      if (peRatio !== null) {
        const pts = peRatio > 0 && peRatio <= 8 ? 14 : peRatio > 0 && peRatio <= 14 ? 9 : peRatio > 0 && peRatio <= 22 ? 2 : -12;
        totalPoints += pts;
        qualityScoreComponents.push({
          labelAr: 'مكرر الربحية P/E',
          points: pts,
          detailAr: `P/E منشور = ${peRatio}x`
        });
      }

      if (roe !== null) {
        const pts = roe >= 22 ? 15 : roe >= 14 ? 10 : roe >= 5 ? 3 : -10;
        totalPoints += pts;
        qualityScoreComponents.push({
          labelAr: 'العائد على حقوق الملكية ROE',
          points: pts,
          detailAr: `ROE منشور = ${roe}%`
        });
      }

      if (sectorProfile === 'BANK_FINANCIAL' && roa !== null) {
        const pts = roa >= 2.0 ? 10 : roa >= 1.2 ? 6 : roa > 0 ? 2 : -8;
        totalPoints += pts;
        qualityScoreComponents.push({
          labelAr: 'العائد على الأصول المصرفية ROA',
          points: pts,
          detailAr: `ROA مصرفي = ${roa}%`
        });
      }

      if (netProfitMargin !== null) {
        const pts = netProfitMargin >= 20 ? 10 : netProfitMargin >= 10 ? 5 : netProfitMargin > 0 ? 1 : -12;
        totalPoints += pts;
        qualityScoreComponents.push({
          labelAr: 'هامش صافي الربح',
          points: pts,
          detailAr: `Net Margin = ${netProfitMargin}%`
        });
      }

      if (sectorProfile !== 'BANK_FINANCIAL' && debtToEquity !== null) {
        const maxSafeDe = sectorProfile === 'REAL_ESTATE' ? 1.8 : 1.1;
        const lowDe = sectorProfile === 'REAL_ESTATE' ? 0.9 : 0.5;
        const pts = debtToEquity <= lowDe ? 8 : debtToEquity <= maxSafeDe ? 3 : -9;
        totalPoints += pts;
        qualityScoreComponents.push({
          labelAr: 'نسبة الدين إلى الملكية (معيار قطاعي)',
          points: pts,
          detailAr: `D/E = ${debtToEquity} (حد القطاع ${maxSafeDe})`
        });
      }

      if (sectorProfile !== 'BANK_FINANCIAL' && currentRatio !== null) {
        const pts = currentRatio >= 1.5 ? 6 : currentRatio >= 1.0 ? 2 : -7;
        totalPoints += pts;
        qualityScoreComponents.push({
          labelAr: 'السيولة قصيرة الأجل (Current Ratio)',
          points: pts,
          detailAr: `Current Ratio = ${currentRatio}x`
        });
      }

      if (sectorProfile !== 'BANK_FINANCIAL' && freeCashFlow !== null) {
        const pts = freeCashFlow > 0 ? 6 : -6;
        totalPoints += pts;
        qualityScoreComponents.push({
          labelAr: 'التدفق النقدي الحر (FCF)',
          points: pts,
          detailAr: freeCashFlow > 0 ? 'تدفق نقدي حر موجب داعم لجودة الأرباح' : 'تدفق نقدي حر سالب يتطلب مراقبة'
        });
      }

      if (revenueGrowthPct !== null) {
        const pts = revenueGrowthPct >= 20 ? 7 : revenueGrowthPct >= 5 ? 3 : revenueGrowthPct < -5 ? -6 : 0;
        if (pts !== 0) {
          totalPoints += pts;
          qualityScoreComponents.push({
            labelAr: 'نمو الإيرادات السنوي',
            points: pts,
            detailAr: `نمو الإيرادات = ${revenueGrowthPct}%`
          });
        }
      }

      if (dividendYield !== null && dividendYield > 0) {
        const pts = dividendYield >= 4 ? 5 : 2;
        totalPoints += pts;
        qualityScoreComponents.push({
          labelAr: 'عائد التوزيعات النقدية',
          points: pts,
          detailAr: `توزيع ${dividendYield}%`
        });
      }

      fundamentalQualityScore = Math.max(5, Math.min(98, totalPoints));
      qualityScoreFormulaAr = `45 + (${qualityScoreComponents
        .slice(1)
        .map((c) => `${c.points >= 0 ? `+${c.points}` : c.points} [${c.labelAr}]`)
        .join(' ')}) = ${fundamentalQualityScore}/100`;
    } else {
      qualityScoreFormulaAr = `نقص البيانات المالية المنشورة (${availableMetricsCount} من ${coreRelevant.length} مؤشرات فقط) — ثقة غير كافية لإصدار تقييم مالي.`;
    }

    // Earnings Quality narrative (combining margins + FCF vs Net Income)
    let earningsQualityStatusAr = 'لا تتوفر بيانات ربحية منشورة كافية لتقييم جودة الأرباح.';
    if (roe !== null && netProfitMargin !== null) {
      const fcfClause =
        fcfToNetIncomeRatio !== null
          ? fcfToNetIncomeRatio >= 0.7
            ? ` مدعومة بتدفق نقدي حر قوي (${fcfToNetIncomeRatio}x صافي الربح).`
            : fcfToNetIncomeRatio < 0
            ? ' مع تدفق نقدي حر سالب يستدعي الحذر.'
            : ` مع تحول نقدي حر (${fcfToNetIncomeRatio}x صافي الربح).`
          : '';
      if (roe >= 18 && netProfitMargin >= 12) {
        earningsQualityStatusAr = `جودة أرباح مرتفعة موثقة: عائد ملكية ${roe}% وهامش صافي ${netProfitMargin}%${fcfClause}`;
      } else if (netProfitMargin > 0) {
        earningsQualityStatusAr = `ربحية إيجابية: هامش صافي ${netProfitMargin}% وعائد ملكية ${roe}%${fcfClause}`;
      } else {
        earningsQualityStatusAr = `خسائر أو تراجع في أحدث فترة منشورة (هامش صافي ${netProfitMargin}%).`;
      }
    } else if (peRatio !== null) {
      earningsQualityStatusAr = `مكرر الربحية المنشور ${peRatio}x (باقي بنود قائمة الدخل والتدفقات غير منشورة عبر التغذية الآلية).`;
    }

    // Financial Risk narrative (Sector-Aware)
    let financialRiskStatusAr = 'بيانات الرافعة المالية غير متاحة لهذا السهم حالياً.';
    if (sectorProfile === 'BANK_FINANCIAL') {
      financialRiskStatusAr =
        roa !== null
          ? `مصرف / مؤسسة مالية: لا يُقاس بالـ Current Ratio أو D/E الصناعي؛ العائد على الأصول ROA = ${roa}%${pbRatio !== null ? ` ومضاعف الدفترية P/B = ${pbRatio}x` : ''}.`
          : 'مصرف / مؤسسة مالية: يتطلب تقييم كفاية رأس المال والـ ROA من القوائم الدورية.';
    } else if (debtToEquity !== null) {
      const crNote = currentRatio !== null ? ` | النسبة الجارية = ${currentRatio}x` : '';
      if (debtToEquity <= 0.6) {
        financialRiskStatusAr = `ملاءة مالية متينة ورافعة منخفضة (D/E = ${debtToEquity}${crNote}).`;
      } else if (debtToEquity <= (sectorProfile === 'REAL_ESTATE' ? 1.8 : 1.3)) {
        financialRiskStatusAr = `مديونية مقبولة ضمن معيار القطاع (D/E = ${debtToEquity}${crNote}).`;
      } else {
        financialRiskStatusAr = `مديونية مرتفعة تتطلب حذراً مع تكلفة التمويل (D/E = ${debtToEquity}${crNote}).`;
      }
    }

    // Dividend Sustainability narrative
    let dividendSustainabilityAr = 'لا توجد توزيعات نقدية مسجلة أو البيانات غير متاحة.';
    if (dividendYield !== null && dividendYield > 0) {
      if (dividendPayoutRatio !== null) {
        dividendSustainabilityAr =
          dividendPayoutRatio <= 75
            ? `توزيعات نقدية مستدامة نسبياً (${dividendYield}% بنسبة توزيع ${dividendPayoutRatio}% من الأرباح).`
            : `عائد توزيعات ${dividendYield}% مع نسبة توزيع مرتفعة (${dividendPayoutRatio}% من الأرباح) تتطلب متابعة التدفقات النقدية.`;
      } else {
        dividendSustainabilityAr = `عائد توزيعات حالي ${dividendYield}% (نسبة التوزيع إلى الأرباح غير منشورة للتحقق من الاستدامة).`;
      }
    }

    return {
      ticker: norm,
      available,
      insufficientReasonAr: available
        ? undefined
        : `نقص البيانات المالية المنشورة (${availableMetricsCount} من أصل ${coreRelevant.length} مؤشرات فقط).`,
      sectorProfile,
      sectorProfileAr,
      fundamentalConfidence,
      availableMetricsCount,
      dataCompletenessPct,
      reportingPeriod: stock.tvFiscalPeriodEndDate
        ? `نسب قوائم منشورة حتى نهاية الفترة ${stock.tvFiscalPeriodEndDate} (TTM / FQ)`
        : stock.isLiveQuote
        ? `نسب مالية TTM / FQ مزامنة بتاريخ ${priceDate || 'غير محدد'}`
        : `بيانات مرجعية قديمة (${priceDate || 'غير محدد'})`,
      fiscalPeriodEndDate: stock.tvFiscalPeriodEndDate ?? null,
      earningsReleaseDate: stock.tvEarningsReleaseDate ?? null,
      nextEarningsDate: stock.tvNextEarningsDate ?? null,
      dataSourceLabel: 'TradingView EGX Published Fundamentals (TTM / FQ)',
      publicationDate: stock.tvEarningsReleaseDate ?? stock.tvFiscalPeriodEndDate ?? priceDate,
      publishedMetrics,
      derivedMetrics: {
        impliedEpsFromPe,
        impliedBvpsFromPb,
        marketCapFromListedShares,
        fcfToNetIncomeRatio,
        noteAr:
          'يتم فصل القيم المشتقة حسابياً (مثل ربحية ضمنية من السعر ÷ P/E أو القيمة السوقية من عدد الأسهم) عن القيم المنشورة مستقلاً في القوائم المالية.'
      },
      unavailableMetrics,
      metricProvenance,
      historicalYears: [],
      historicalStatementsNoteAr:
        'لا تصنع المنصة أرقام إيرادات أو قوائم لسنوات ماضية؛ ما لم تنشره الشركة أو تغذية TradingView TTM/FQ يظهر صراحةً في خانة "بيانات غير متوفرة".',
      qualityScoreFormulaAr,
      qualityScoreComponents,
      ratios: {
        grossProfitMargin,
        operatingMargin,
        netProfitMargin,
        roe,
        roa,
        peRatio,
        pbRatio,
        dividendYield,
        dividendPayoutRatio,
        debtToEquity,
        currentRatio,
        freeCashFlow,
        operatingCashFlow,
        totalRevenue,
        netIncomeTtm,
        revenueGrowthPct,
        epsGrowthPct,
        eps: publishedEps, // NEVER silently replaced with Price / P/E
        bookValuePerShare: publishedBvps, // NEVER silently replaced with Price / P/B
        marketCapEgp,
        high52W: stock.tvHigh52W ?? null,
        low52W: stock.tvLow52W ?? null,
        fundamentalQualityScore,
        earningsQualityStatusAr,
        financialRiskStatusAr,
        dividendSustainabilityAr
      }
    };
  }
}
