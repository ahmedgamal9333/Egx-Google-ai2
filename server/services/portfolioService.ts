import { getEGXStock } from '../data/egxStocks';
import { FundamentalAnalysisEngine } from './fundamentalAnalysisService';
import { FairValueValuationEngine } from './fairValueService';
import { LiveMarketSyncService } from './liveMarketSyncService';

export interface PortfolioHolding {
  id: string;
  ticker: string;
  sharesCount: number;
  avgBuyPrice: number;
  totalCost: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlPct: number | null;
  allocationPct: number;
  fairValue: number | null;
  fairValueUpsidePct: number | null;
  isLiveQuote: boolean;
  priceDate: string | null;
  aiAction: 'HOLD' | 'ADD' | 'REDUCE' | 'EXIT' | 'INSUFFICIENT_DATA';
  aiActionAr: string;
  aiActionReasonAr: string;
  aiActionFormulaAr: string;
}

export interface PortfolioSummary {
  totalCost: number;
  totalMarketValue: number;
  totalUnrealizedPl: number;
  totalUnrealizedPlPct: number;
  cashBalance: number;
  totalEquity: number;
  holdings: PortfolioHolding[];
  isSamplePortfolioNoteAr: string;
  priceSyncStatus: string;
  lastSyncedAt: string | null;
}

export class PortfolioService {
  private static userHoldings: { ticker: string; shares: number; buyPrice: number }[] = [];

  private static cashBalanceEgp = 0;

  public static getPortfolio(): PortfolioSummary {
    const live = LiveMarketSyncService.getLiveState();
    let totalCost = 0;
    let totalMarketValue = 0;

    const enrichedHoldings: PortfolioHolding[] = this.userHoldings.map((h, idx) => {
      const stock = getEGXStock(h.ticker);
      const cost = Math.round(h.shares * h.buyPrice);
      totalCost += cost;

      if (!stock || stock.currentPrice <= 0) {
        return {
          id: `hld-${idx + 1}`,
          ticker: h.ticker,
          sharesCount: h.shares,
          avgBuyPrice: h.buyPrice,
          totalCost: cost,
          currentPrice: null,
          currentValue: null,
          unrealizedPl: null,
          unrealizedPlPct: null,
          allocationPct: 0,
          fairValue: null,
          fairValueUpsidePct: null,
          isLiveQuote: false,
          priceDate: null,
          aiAction: 'INSUFFICIENT_DATA',
          aiActionAr: 'بيانات غير كافية — السعر غير متاح',
          aiActionReasonAr: `تعذر إيجاد السعر الحالي للسهم ${h.ticker}.`,
          aiActionFormulaAr: 'توقف التقييم لعدم توافر السعر.'
        };
      }

      const currentPrice = stock.currentPrice;
      const val = Math.round(h.shares * currentPrice);
      const pl = val - cost;
      const plPct = cost > 0 ? Number(((pl / cost) * 100).toFixed(2)) : 0;
      totalMarketValue += val;

      const fund = FundamentalAnalysisEngine.getFinancials(stock.ticker, currentPrice);
      const fair = FairValueValuationEngine.calculate(
        stock.ticker,
        currentPrice,
        fund.ratios.peRatio,
        fund.ratios.pbRatio,
        fund.ratios.dividendYield,
        fund.ratios.roe,
        fund.ratios.eps,
        fund.ratios.bookValuePerShare
      );

      let aiAction: PortfolioHolding['aiAction'] = 'INSUFFICIENT_DATA';
      let aiActionAr = 'بيانات غير كافية — لم يصدر قرار';
      let aiActionReasonAr = '';
      let aiActionFormulaAr = '';

      if (!live.tradingViewOnline || !stock.isLiveQuote) {
        aiActionReasonAr = `السعر من مرجع تاريخي (${stock.priceDate || 'غير محدد'}) دون مزامنة حية؛ لا تصدر توصية إدارة مركز.`;
        aiActionFormulaAr = 'التوصية موقوفة لانقطاع أو عدم مزامنة مصدر الأسعار المباشر.';
      } else if (!fair.available || fair.upsideDownsidePct === null) {
        aiActionReasonAr = fair.insufficientReasonAr || 'نقص البيانات المالية المطلوبة لحساب القيمة العادلة.';
        aiActionFormulaAr = 'التوصية موقوفة لعدم توافر القيمة العادلة الحسابية.';
      } else {
        const upside = fair.upsideDownsidePct;
        aiActionFormulaAr = `عائد المركز = ${plPct}% | هامش أمان القيمة العادلة = ${upside}% (القيمة العادلة ${fair.estimatedFairValue} عبر ${fair.methods.length} نماذج)`;

        if (plPct <= -10) {
          aiAction = 'EXIT';
          aiActionAr = 'مراجعة وقف الخسارة (EXIT)';
          aiActionReasonAr = `تراجع المركز بنسبة ${plPct}% دون متوسط التكلفة (${h.buyPrice}) يتجاوز حد الانضباط (-10%).`;
        } else if (plPct >= 20 && upside < 8) {
          aiAction = 'REDUCE';
          aiActionAr = 'جني أرباح جزئي (REDUCE)';
          aiActionReasonAr = `تحقق ربح ${plPct}% (>=20%) بينما تقلص هامش الأمان مقابل القيمة العادلة (${fair.estimatedFairValue}) إلى ${upside}% (<8%).`;
        } else if (upside >= 18 && plPct > -5) {
          aiAction = 'ADD';
          aiActionAr = 'تعزيز تدريجي (ADD)';
          aiActionReasonAr = `السهم يتداول دون قيمته العادلة المحسوبة (${fair.estimatedFairValue}) بهامش أمان ${upside}% (>=18%).`;
        } else {
          aiAction = 'HOLD';
          aiActionAr = 'احتفاظ بالمركز (HOLD)';
          aiActionReasonAr = `الربح غير المحقق (${plPct}%) وهامش الأمان (${upside}%) ضمن النطاق المتوازن دون إشارة تخارج.`;
        }
      }

      return {
        id: `hld-${idx + 1}`,
        ticker: h.ticker,
        sharesCount: h.shares,
        avgBuyPrice: h.buyPrice,
        totalCost: cost,
        currentPrice,
        currentValue: val,
        unrealizedPl: pl,
        unrealizedPlPct: plPct,
        allocationPct: 0,
        fairValue: fair.estimatedFairValue,
        fairValueUpsidePct: fair.upsideDownsidePct,
        isLiveQuote: !!stock.isLiveQuote,
        priceDate: stock.priceDate || null,
        aiAction,
        aiActionAr,
        aiActionReasonAr,
        aiActionFormulaAr
      };
    });

    enrichedHoldings.forEach((h) => {
      h.allocationPct =
        totalMarketValue > 0 && h.currentValue !== null
          ? Number(((h.currentValue / totalMarketValue) * 100).toFixed(1))
          : 0;
    });

    const totalPl = totalMarketValue - totalCost;
    const totalPlPct = totalCost > 0 ? Number(((totalPl / totalCost) * 100).toFixed(2)) : 0;

    return {
      totalCost,
      totalMarketValue,
      totalUnrealizedPl: totalPl,
      totalUnrealizedPlPct: totalPlPct,
      cashBalance: this.cashBalanceEgp,
      totalEquity: totalMarketValue + this.cashBalanceEgp,
      holdings: enrichedHoldings,
      isSamplePortfolioNoteAr:
        this.userHoldings.length === 0
          ? 'المحفظة فارغة حالياً — أضف صفقاتك الفعلية ليتم تقييمها بالأسعار الحية وحساب القيمة العادلة.'
          : 'تُقيّم جميع المراكز بالأسعار الحية الفعلية ومعادلات القيمة العادلة دون أي أرقام افتراضية.',
      priceSyncStatus: live.dataFreshnessStatus,
      lastSyncedAt: live.lastSyncedAt
    };
  }

  public static addHolding(ticker: string, shares: number, buyPrice: number) {
    const norm = ticker.toUpperCase().replace('.CA', '');
    const existing = this.userHoldings.find((h) => h.ticker === norm);
    if (existing) {
      const totalShares = existing.shares + shares;
      const totalCost = existing.shares * existing.buyPrice + shares * buyPrice;
      existing.shares = totalShares;
      existing.buyPrice = Number((totalCost / totalShares).toFixed(2));
    } else {
      this.userHoldings.push({ ticker: norm, shares, buyPrice });
    }
  }

  public static removeHolding(ticker: string) {
    const norm = ticker.toUpperCase().replace('.CA', '');
    this.userHoldings = this.userHoldings.filter((h) => h.ticker !== norm);
  }
}
