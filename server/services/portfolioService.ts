import { getEGXStock } from "../data/egxStocks";

export interface PortfolioHolding {
  id: string;
  ticker: string;
  sharesCount: number;
  avgBuyPrice: number;
  totalCost: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  allocationPct: number;
  fairValue: number;
  fairValueUpsidePct: number;
  aiAction: 'HOLD' | 'ADD' | 'REDUCE' | 'EXIT';
  aiActionAr: string;
  aiActionReasonAr: string;
}

export interface PortfolioSummary {
  totalCost: number;
  totalMarketValue: number;
  totalUnrealizedPl: number;
  totalUnrealizedPlPct: number;
  cashBalance: number;
  totalEquity: number;
  dividendsEarned: number;
  holdings: PortfolioHolding[];
}

export class PortfolioService {
  private static userHoldings: { ticker: string; shares: number; buyPrice: number }[] = [
    { ticker: "COMI", shares: 4500, buyPrice: 112.50 },
    { ticker: "TMGH", shares: 6000, buyPrice: 72.00 },
    { ticker: "SWDY", shares: 3500, buyPrice: 96.00 },
    { ticker: "MFPC", shares: 2500, buyPrice: 34.50 }
  ];

  public static getPortfolio(): PortfolioSummary {
    let totalCost = 0;
    let totalMarketValue = 0;

    const enrichedHoldings: PortfolioHolding[] = this.userHoldings.map((h, idx) => {
      const stock = getEGXStock(h.ticker);
      const currentPrice = stock ? stock.currentPrice : h.buyPrice * 1.1;
      const cost = h.shares * h.buyPrice;
      const val = h.shares * currentPrice;
      const pl = val - cost;
      const plPct = Number(((pl / cost) * 100).toFixed(2));
      const fairValue = Number((currentPrice * 1.22).toFixed(2));
      const fairValueUpsidePct = Number((((fairValue - currentPrice) / currentPrice) * 100).toFixed(1));

      totalCost += cost;
      totalMarketValue += val;

      let aiAction: 'HOLD' | 'ADD' | 'REDUCE' | 'EXIT' = 'HOLD';
      let aiActionAr = 'احتفاظ بالمركز (HOLD)';
      let aiActionReasonAr = 'السهم يتداول في مسار صاعد وهيكله المالي قوي مع وجود مسافة جيدة قبل الوصول للمستهدف النهائي.';

      if (plPct >= 20 && fairValueUpsidePct < 8) {
        aiAction = 'REDUCE';
        aiActionAr = 'تخفيف المركز وجني أرباح جزئية (REDUCE)';
        aiActionReasonAr = 'تحقيق أرباح رأسمالية تفوق 20% واقتراب السعر من قمم المقاومة يبرر جني 30-50% من الأرباح.';
      } else if (plPct < -8) {
        aiAction = 'EXIT';
        aiActionAr = 'وقف خسارة وتخارج (EXIT)';
        aiActionReasonAr = 'تراجع السعر دون مستويات الدعم يقتضي تفعيل حماية رأس المال وتفادي تعميق الخسائر.';
      } else if (fairValueUpsidePct > 20 && plPct > 0) {
        aiAction = 'ADD';
        aiActionAr = 'تعزيز المركز عند التصحيح (ADD)';
        aiActionReasonAr = 'هامش أمان واسع يفوق 20% مع تدفق سيولة استثمارية تؤكد الجدارة الاستثمارية.';
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
        allocationPct: 0, // calculated below
        fairValue,
        fairValueUpsidePct,
        aiAction,
        aiActionAr,
        aiActionReasonAr
      };
    });

    // Calculate allocations
    enrichedHoldings.forEach(h => {
      h.allocationPct = totalMarketValue > 0 ? Number(((h.currentValue / totalMarketValue) * 100).toFixed(1)) : 0;
    });

    const totalPl = totalMarketValue - totalCost;
    const totalPlPct = totalCost > 0 ? Number(((totalPl / totalCost) * 100).toFixed(2)) : 0;

    return {
      totalCost,
      totalMarketValue,
      totalUnrealizedPl: totalPl,
      totalUnrealizedPlPct: totalPlPct,
      cashBalance: 245000,
      totalEquity: totalMarketValue + 245000,
      dividendsEarned: 48600,
      holdings: enrichedHoldings
    };
  }

  public static addHolding(ticker: string, shares: number, buyPrice: number) {
    const norm = ticker.toUpperCase().replace(".CA", "");
    const existing = this.userHoldings.find(h => h.ticker === norm);
    if (existing) {
      const totalShares = existing.shares + shares;
      const totalCost = (existing.shares * existing.buyPrice) + (shares * buyPrice);
      existing.shares = totalShares;
      existing.buyPrice = Number((totalCost / totalShares).toFixed(2));
    } else {
      this.userHoldings.push({ ticker: norm, shares, buyPrice });
    }
  }

  public static removeHolding(ticker: string) {
    const norm = ticker.toUpperCase().replace(".CA", "");
    this.userHoldings = this.userHoldings.filter(h => h.ticker !== norm);
  }
}
