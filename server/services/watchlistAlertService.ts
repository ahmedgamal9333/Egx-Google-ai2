import { getEGXStock } from '../data/egxStocks';
import { LiveMarketSyncService } from './liveMarketSyncService';
import { MarketDataService } from './marketDataService';
import { NewsDisclosureService } from './newsService';

export interface SmartAlert {
  id: string;
  ticker: string;
  companyNameAr: string;
  type: 'SOURCE_ERROR' | 'STALE_DATA' | 'VOLUME_SPIKE' | 'RSI_EXTREME' | 'PRICE_MOVE';
  typeAr: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
  triggerPrice: number | null;
  messageAr: string;
  timestamp: string;
  isRead: boolean;
}

export class WatchlistAlertService {
  private static watchlist: string[] = ['COMI', 'TMGH', 'SWDY', 'MFPC', 'ETEL', 'FWRY', 'GBCO'];
  private static readIds = new Set<string>();

  public static getWatchlist(): string[] {
    return this.watchlist;
  }

  public static addToWatchlist(ticker: string) {
    const norm = ticker.toUpperCase().replace('.CA', '');
    if (!this.watchlist.includes(norm)) {
      this.watchlist.push(norm);
    }
  }

  public static removeFromWatchlist(ticker: string) {
    const norm = ticker.toUpperCase().replace('.CA', '');
    this.watchlist = this.watchlist.filter(t => t !== norm);
  }

  public static getAlerts(): SmartAlert[] {
    const alerts: SmartAlert[] = [];
    const live = LiveMarketSyncService.getLiveState();
    const yahooStatus = MarketDataService.getYahooFeedHealth();
    const newsStatus = NewsDisclosureService.getFeedStatus();
    const nowDisplay = new Date().toISOString().replace('T', ' ').substring(0, 16);

    // 1. Real Source Failure Alerts (Highest priority)
    if (!live.tradingViewOnline) {
      alerts.push({
        id: 'sys-tv-offline',
        ticker: 'SYSTEM',
        companyNameAr: 'مصدر الأسعار الحي (TradingView EGX)',
        type: 'SOURCE_ERROR',
        typeAr: 'تعطل مزامنة مصدر الأسعار',
        severity: 'DANGER',
        triggerPrice: null,
        messageAr: `فشل الاتصال بمصدر الأسعار الحي (${live.lastSyncError || 'خطأ شبكة'}). الأسعار الظاهرة تعود للقطة مرجعية بتاريخ ${live.referenceSnapshotDate}.`,
        timestamp: live.lastSyncAttemptAt ? live.lastSyncAttemptAt.replace('T', ' ').substring(0, 16) : nowDisplay,
        isRead: this.readIds.has('sys-tv-offline')
      });
    }

    if (yahooStatus.lastError && !yahooStatus.online) {
      alerts.push({
        id: 'sys-yahoo-offline',
        ticker: 'SYSTEM',
        companyNameAr: 'مصدر الشموع التاريخية (Yahoo Finance)',
        type: 'SOURCE_ERROR',
        typeAr: 'تعطل جلب الشموع التاريخية',
        severity: 'WARNING',
        triggerPrice: null,
        messageAr: `تعذر جلب السلاسل التاريخية من Yahoo Finance (${yahooStatus.lastError}). يتم حجب التوصيات لأي سهم تفتقر شموعه الفعلية.`,
        timestamp: yahooStatus.lastSuccessAt ? yahooStatus.lastSuccessAt.replace('T', ' ').substring(0, 16) : nowDisplay,
        isRead: this.readIds.has('sys-yahoo-offline')
      });
    }

    if (newsStatus.lastError) {
      alerts.push({
        id: 'sys-news-offline',
        ticker: 'SYSTEM',
        companyNameAr: 'مصدر الأخبار الحية (Google News RSS)',
        type: 'SOURCE_ERROR',
        typeAr: 'تعطل تغذية الأخبار',
        severity: 'WARNING',
        triggerPrice: null,
        messageAr: `تعذر تحديث موجز الأخبار (${newsStatus.lastError}).`,
        timestamp: nowDisplay,
        isRead: this.readIds.has('sys-news-offline')
      });
    }

    // 2. Real Watchlist Stock Threshold & Staleness Alerts
    for (const ticker of this.watchlist) {
      const stock = getEGXStock(ticker);
      if (!stock) continue;

      const changePct = stock.prevClose > 0
        ? Number((((stock.currentPrice - stock.prevClose) / stock.prevClose) * 100).toFixed(2))
        : 0;

      if (stock.isLiveQuote && stock.isStaleQuote && stock.priceDate) {
        const id = `stale-${stock.ticker}-${stock.priceDate}`;
        alerts.push({
          id,
          ticker: stock.ticker,
          companyNameAr: stock.nameAr,
          type: 'STALE_DATA',
          typeAr: 'سعر جلسة سابقة (سهم غير متداول يومياً)',
          severity: 'WARNING',
          triggerPrice: stock.currentPrice,
          messageAr: `أحدث جلسة متاحة للسهم ${stock.ticker} من TradingView تعود لتاريخ ${stock.priceDate} بسعر ${stock.currentPrice} ${stock.currency}.`,
          timestamp: stock.priceDate,
          isRead: this.readIds.has(id)
        });
        continue;
      }

      if (!stock.isLiveQuote) continue;

      if (stock.tvRvol !== null && stock.tvRvol !== undefined && stock.tvRvol >= 1.5) {
        const id = `rvol-${stock.ticker}-${stock.priceDate || ''}`;
        alerts.push({
          id,
          ticker: stock.ticker,
          companyNameAr: stock.nameAr,
          type: 'VOLUME_SPIKE',
          typeAr: stock.tvRvol >= 1.8
            ? `طفرة سيولة حقيقية (${stock.tvRvol}x)`
            : `سيولة غير اعتيادية (${stock.tvRvol}x)`,
          severity: 'INFO',
          triggerPrice: stock.currentPrice,
          messageAr: `رصد حجم تداول نسبي ${stock.tvRvol}x مقارنة بمتوسط 10 أيام عند سعر ${stock.currentPrice} ${stock.currency} بتاريخ ${stock.priceDate}.`,
          timestamp: stock.priceDate || nowDisplay,
          isRead: this.readIds.has(id)
        });
      }

      if (stock.tvRsi !== null && stock.tvRsi !== undefined && (stock.tvRsi <= 32 || stock.tvRsi >= 72)) {
        const id = `rsi-${stock.ticker}-${stock.priceDate || ''}`;
        const overbought = stock.tvRsi >= 72;
        alerts.push({
          id,
          ticker: stock.ticker,
          companyNameAr: stock.nameAr,
          type: 'RSI_EXTREME',
          typeAr: overbought ? `تشبع شرائي RSI (${stock.tvRsi})` : `تشبع بيعي RSI (${stock.tvRsi})`,
          severity: overbought ? 'WARNING' : 'SUCCESS',
          triggerPrice: stock.currentPrice,
          messageAr: `مؤشر RSI(14) الفعلي على TradingView وصل إلى ${stock.tvRsi} عند سعر ${stock.currentPrice} ${stock.currency} (${stock.priceDate}).`,
          timestamp: stock.priceDate || nowDisplay,
          isRead: this.readIds.has(id)
        });
      } else if (Math.abs(changePct) >= 3.0) {
        const id = `move-${stock.ticker}-${stock.priceDate || ''}`;
        alerts.push({
          id,
          ticker: stock.ticker,
          companyNameAr: stock.nameAr,
          type: 'PRICE_MOVE',
          typeAr: changePct > 0 ? `صعود يومي +${changePct}%` : `هبوط يومي ${changePct}%`,
          severity: changePct > 0 ? 'SUCCESS' : 'WARNING',
          triggerPrice: stock.currentPrice,
          messageAr: `تحرك سعري يومي ${changePct > 0 ? '+' : ''}${changePct}% ليصل إلى ${stock.currentPrice} ${stock.currency} (${stock.priceDate}).`,
          timestamp: stock.priceDate || nowDisplay,
          isRead: this.readIds.has(id)
        });
      }
    }

    return alerts;
  }

  public static markAsRead(id: string) {
    this.readIds.add(id);
  }
}
