import { EGX_STOCKS_UNIVERSE, getEGXStock } from '../data/egxStocks';
import { LiveMarketSyncService } from './liveMarketSyncService';
import { CBE_POLICY_REFERENCE_DATE } from './marketDataService';
import { classifySectorProfile } from './fundamentalAnalysisService';

export interface ValuationMethodItem {
  methodNameAr: string;
  methodNameEn: string;
  weightPct: number;
  calculatedValue: number;
  formulaAr: string;
  descriptionAr: string;
}

export interface FairValueResult {
  ticker: string;
  available: boolean;
  insufficientReasonAr?: string;
  valuationConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
  currentPrice: number;
  estimatedFairValue: number | null;
  conservativeValuation: number | null;
  optimisticValuation: number | null;
  upsideDownsidePct: number | null;
  marginOfSafetyPct: number | null;
  valuationStatus: 'UNDERVALUED' | 'FAIRLY_VALUED' | 'OVERVALUED' | 'UNAVAILABLE';
  valuationStatusAr: string;
  valuationDate: string;
  dataCompletenessPct: number;
  methods: ValuationMethodItem[];
  modelInputs: {
    eps: number | null;
    epsIsPublished: boolean;
    bookValuePerShare: number | null;
    bvpsIsPublished: boolean;
    roePct: number | null;
    sectorMedianPe: number | null;
    sectorMedianPb: number | null;
    sectorPeersCount: number;
    costOfEquityPct: number;
    cbeReferenceRatePct: number;
    cbeReferenceDate: string;
  };
  formulaExplanationAr: string;
  summaryAr: string;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
    : Number(sorted[mid].toFixed(2));
}

export class FairValueValuationEngine {
  /**
   * Computes intrinsic fair value using ONLY independently published EPS and BVPS.
   * Refuses circular derivation of EPS = Price / P/E or BVPS = Price / P/B.
   */
  public static calculate(
    ticker: string,
    currentPrice: number,
    peRatio: number | null,
    pbRatio: number | null,
    dividendYield: number | null,
    roe: number | null,
    publishedEps?: number | null,
    publishedBvps?: number | null
  ): FairValueResult {
    const norm = ticker.toUpperCase().replace('.CA', '');
    const stock = getEGXStock(norm);
    const valuationDate = stock?.priceDate || LiveMarketSyncService.getLatestEgxSessionDate();

    const eps =
      publishedEps !== undefined && publishedEps !== null && Number.isFinite(publishedEps)
        ? publishedEps
        : stock?.tvEps ?? stock?.tvLastAnnualEps ?? null;
    const bvps =
      publishedBvps !== undefined && publishedBvps !== null && Number.isFinite(publishedBvps)
        ? publishedBvps
        : stock?.tvBvps ?? stock?.tvBookValue ?? null;

    const epsIsPublished = eps !== null;
    const bvpsIsPublished = bvps !== null;

    const sectorProfile = stock ? classifySectorProfile(stock.sectorEn, stock.sectorAr).profile : 'INDUSTRIAL_CONSUMER_UTILITY';

    // CBE overnight lending rate 21% + 4% equity risk premium = 25% Cost of Equity (EGP)
    const cbeRate = 21.0;
    const costOfEquityPct = 25.0;

    const peerPes = stock
      ? EGX_STOCKS_UNIVERSE.filter(
          (s) =>
            s.sectorAr === stock.sectorAr &&
            s.ticker !== stock.ticker &&
            typeof s.tvPeRatio === 'number' &&
            s.tvPeRatio > 1 &&
            s.tvPeRatio < 50
        ).map((s) => s.tvPeRatio as number)
      : [];
    const peerPbs = stock
      ? EGX_STOCKS_UNIVERSE.filter(
          (s) =>
            s.sectorAr === stock.sectorAr &&
            s.ticker !== stock.ticker &&
            typeof s.tvPbRatio === 'number' &&
            s.tvPbRatio > 0.2 &&
            s.tvPbRatio < 15
        ).map((s) => s.tvPbRatio as number)
      : [];

    const sectorMedianPe = median(peerPes);
    const sectorMedianPb = median(peerPbs);

    const rawMethods: {
      methodNameAr: string;
      methodNameEn: string;
      baseWeight: number;
      calculatedValue: number;
      formulaAr: string;
      descriptionAr: string;
    }[] = [];

    // Method 1: Real Peer Sector Median P/E (using published EPS only)
    if (eps !== null && eps > 0 && sectorMedianPe !== null && peerPes.length >= 2) {
      const val = Number((eps * sectorMedianPe).toFixed(2));
      rawMethods.push({
        methodNameAr: 'تقييم مضاعف ربحية القطاع الفعلي (Peer Sector Median P/E)',
        methodNameEn: 'Peer Median P/E Valuation',
        baseWeight: sectorProfile === 'BANK_FINANCIAL' ? 30 : 40,
        calculatedValue: val,
        formulaAr: `EPS منشور (${eps.toFixed(2)}) × وسيط P/E لـ ${peerPes.length} شركات بالقطاع (${sectorMedianPe}x) = ${val}`,
        descriptionAr: `ضرب ربحية السهم المنشورة (${eps.toFixed(2)}) في الوسيط الحسابي لمضاعف ربحية شركات قطاع "${stock?.sectorAr}"`
      });
    }

    // Method 2: Justified P/B via Residual Income / Gordon Equity Model: P/B = (ROE - g) / (COE - g)
    if (bvps !== null && bvps > 0 && roe !== null && roe > 0) {
      const g = Math.min(14, Math.max(4, Number((roe * 0.35).toFixed(2))));
      const denom = Math.max(4, costOfEquityPct - g);
      const justifiedPb = Math.max(0.35, Math.min(6.0, (roe - g) / denom));
      if (roe > g) {
        const val = Number((bvps * justifiedPb).toFixed(2));
        rawMethods.push({
          methodNameAr: 'نموذج القيمة الدفترية المبررة حسابياً (Justified P/B - CFA)',
          methodNameEn: 'Justified P/B Model',
          baseWeight: sectorProfile === 'BANK_FINANCIAL' ? 40 : 35,
          calculatedValue: val,
          formulaAr: `BVPS منشور (${bvps.toFixed(2)}) × [(ROE ${roe}% - g ${g}%) ÷ (COE ${costOfEquityPct}% - g ${g}%)] = ${val}`,
          descriptionAr: 'تقييم القيمة الدفترية المنشورة للسهم المرجحة بالعائد الفعلي على حقوق الملكية وتكلفة رأس المال'
        });
      }
    }

    // Method 3: Bank/Real-Estate Peer Median P/B when BVPS is published & >= 2 peers
    if (bvps !== null && bvps > 0 && sectorMedianPb !== null && peerPbs.length >= 2 && sectorProfile !== 'INDUSTRIAL_CONSUMER_UTILITY') {
      const val = Number((bvps * sectorMedianPb).toFixed(2));
      rawMethods.push({
        methodNameAr: 'تقييم مضاعف القيمة الدفترية للقطاع (Peer Median P/B)',
        methodNameEn: 'Peer Median P/B Valuation',
        baseWeight: 20,
        calculatedValue: val,
        formulaAr: `BVPS منشور (${bvps.toFixed(2)}) × وسيط P/B للقطاع (${sectorMedianPb}x) = ${val}`,
        descriptionAr: 'مقارنة القيمة الدفترية المنشورة بمضاعف شركات القطاع نفسه (مهم خاصة للبنوك والعقارات)'
      });
    }

    // Method 4: Justified Trailing P/E (Gordon Growth Payout Formula)
    if (eps !== null && eps > 0 && roe !== null && roe > 0) {
      const impliedPayout =
        dividendYield && dividendYield > 0 && peRatio && peRatio > 0
          ? Math.max(0.15, Math.min(0.75, (dividendYield / 100) * peRatio))
          : 0.3;
      const retention = 1 - impliedPayout;
      const g = Math.min(16, Math.max(4, Number((retention * roe).toFixed(2))));
      const denom = Math.max(5, costOfEquityPct - g);
      const justifiedPe = Math.max(3.5, Math.min(18, (impliedPayout * (1 + g / 100)) / (denom / 100)));
      const val = Number((eps * justifiedPe).toFixed(2));
      rawMethods.push({
        methodNameAr: 'نموذج مضاعف الربحية المبرر بنمو جوردون (Justified P/E)',
        methodNameEn: 'Gordon Justified P/E Model',
        baseWeight: 25,
        calculatedValue: val,
        formulaAr: `EPS منشور (${eps.toFixed(2)}) × P/E مبرر (${justifiedPe.toFixed(2)}x عند g=${g}% وCOE=${costOfEquityPct}%) = ${val}`,
        descriptionAr: 'مضاعف ربحية نظري مشتق من ربحية السهم المنشورة والعائد على الملكية وسعر الفائدة المرجعي'
      });
    }

    if (rawMethods.length === 0 || currentPrice <= 0) {
      const missingReasons: string[] = [];
      if (eps === null || eps <= 0) missingReasons.push('ربحية السهم المنشورة EPS غير متوفرة أو سالبة');
      if (bvps === null || bvps <= 0) missingReasons.push('القيمة الدفترية المنشورة BVPS غير متوفرة');
      if (roe === null || roe <= 0) missingReasons.push('العائد على حقوق الملكية ROE غير متوفر');

      const insufficientReasonAr = `لا تتوفر بيانات قوائم مالية منشورة كافية لحساب القيمة العادلة بدون اشتقاق دائري من السعر (${missingReasons.join('، ')}).`;

      return {
        ticker: norm,
        available: false,
        insufficientReasonAr,
        valuationConfidence: 'UNAVAILABLE',
        currentPrice,
        estimatedFairValue: null,
        conservativeValuation: null,
        optimisticValuation: null,
        upsideDownsidePct: null,
        marginOfSafetyPct: null,
        valuationStatus: 'UNAVAILABLE',
        valuationStatusAr: 'غير متاح — نقص القوائم المالية المنشورة (بدون اشتقاق EPS من السعر)',
        valuationDate,
        dataCompletenessPct: 0,
        methods: [],
        modelInputs: {
          eps,
          epsIsPublished,
          bookValuePerShare: bvps,
          bvpsIsPublished,
          roePct: roe,
          sectorMedianPe,
          sectorMedianPb,
          sectorPeersCount: Math.max(peerPes.length, peerPbs.length),
          costOfEquityPct,
          cbeReferenceRatePct: cbeRate,
          cbeReferenceDate: CBE_POLICY_REFERENCE_DATE
        },
        formulaExplanationAr: insufficientReasonAr,
        summaryAr: insufficientReasonAr
      };
    }

    const totalBaseWeight = rawMethods.reduce((sum, m) => sum + m.baseWeight, 0);
    const methods: ValuationMethodItem[] = rawMethods.map((m, i) => {
      const normalizedWeight =
        i === rawMethods.length - 1
          ? 100 - rawMethods.slice(0, -1).reduce((s, x) => s + Math.round((x.baseWeight / totalBaseWeight) * 100), 0)
          : Math.round((m.baseWeight / totalBaseWeight) * 100);
      return {
        methodNameAr: m.methodNameAr,
        methodNameEn: m.methodNameEn,
        weightPct: normalizedWeight,
        calculatedValue: m.calculatedValue,
        formulaAr: m.formulaAr,
        descriptionAr: m.descriptionAr
      };
    });

    const baseFairValue = Number(
      methods.reduce((sum, m) => sum + (m.calculatedValue * m.weightPct) / 100, 0).toFixed(2)
    );
    const conservativeValuation = Number((baseFairValue * 0.85).toFixed(2));
    const optimisticValuation = Number((baseFairValue * 1.15).toFixed(2));
    const upsideDownsidePct = Number((((baseFairValue - currentPrice) / currentPrice) * 100).toFixed(1));
    const marginOfSafetyPct = upsideDownsidePct > 0 ? upsideDownsidePct : 0;

    let valuationStatus: FairValueResult['valuationStatus'] = 'FAIRLY_VALUED';
    let valuationStatusAr = 'السهم يتداول قرب قيمته العادلة المحسوبة';
    if (upsideDownsidePct >= 15) {
      valuationStatus = 'UNDERVALUED';
      valuationStatusAr = `يتداول بخصم عن القيمة العادلة المحسوبة (${upsideDownsidePct}%+)`;
    } else if (upsideDownsidePct <= -10) {
      valuationStatus = 'OVERVALUED';
      valuationStatusAr = `يتداول بعلاوة فوق القيمة العادلة المحسوبة (${Math.abs(upsideDownsidePct)}%-)`;
    }

    const valuationConfidence: FairValueResult['valuationConfidence'] =
      methods.length >= 3 && epsIsPublished && bvpsIsPublished ? 'HIGH' : methods.length >= 2 ? 'MEDIUM' : 'LOW';

    const formulaExplanationAr =
      methods.map((m) => `(${m.calculatedValue} × ${m.weightPct}% [${m.methodNameEn}])`).join(' + ') +
      ` = ${baseFairValue}`;

    return {
      ticker: norm,
      available: true,
      valuationConfidence,
      currentPrice,
      estimatedFairValue: baseFairValue,
      conservativeValuation,
      optimisticValuation,
      upsideDownsidePct,
      marginOfSafetyPct,
      valuationStatus,
      valuationStatusAr,
      valuationDate,
      dataCompletenessPct: Math.min(100, Math.round((methods.length / 3) * 100)),
      methods,
      modelInputs: {
        eps,
        epsIsPublished,
        bookValuePerShare: bvps,
        bvpsIsPublished,
        roePct: roe,
        sectorMedianPe,
        sectorMedianPb,
        sectorPeersCount: Math.max(peerPes.length, peerPbs.length),
        costOfEquityPct,
        cbeReferenceRatePct: cbeRate,
        cbeReferenceDate: CBE_POLICY_REFERENCE_DATE
      },
      formulaExplanationAr,
      summaryAr: `تُحسب القيمة العادلة عبر ${methods.length} نماذج تعتمد على أرباح ودفترية منشورة فقط (${formulaExplanationAr}) بقيمة ${baseFairValue} مقابل ${currentPrice} (${upsideDownsidePct > 0 ? '+' : ''}${upsideDownsidePct}%).`
    };
  }
}
