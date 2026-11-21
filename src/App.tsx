import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { DashboardView } from './components/views/DashboardView';
import { MarketView } from './components/views/MarketView';
import { ScreenerView } from './components/views/ScreenerView';
import { StockAnalysisView } from './components/views/StockAnalysisView';
import { PortfolioView } from './components/views/PortfolioView';
import { HistoryView } from './components/views/HistoryView';
import { BacktestView } from './components/views/BacktestView';
import { SourcesView } from './components/views/SourcesView';
import { SectorView } from './components/views/SectorView';
import { NewsView } from './components/views/NewsView';
import { SettingsView } from './components/views/SettingsView';
import { AiChatView } from './components/views/AiChatView';

import { EGXStockSummary, DetailedStockPayload, SmartAlert, ChatMessage } from './types';
import { Bell, X, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { safeFetchJson } from './utils/apiClient';

class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; lang: 'ar' | 'en'; resetKey: string },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; lang: 'ar' | 'en'; resetKey: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 text-center space-y-3 my-6 max-w-xl mx-auto">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <h3 className="text-base font-bold text-white">
            {this.props.lang === 'ar' ? 'حدث خطأ أثناء عرض هذه الصفحة' : 'Unable to render this section'}
          </h3>
          <p className="text-xs text-slate-400">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {this.props.lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD');
  const [selectedTicker, setSelectedTicker] = useState<string>('COMI');
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Data states
  const [stocks, setStocks] = useState<EGXStockSummary[]>([]);
  const [marketOverview, setMarketOverview] = useState<any>(null);
  const [detailedStock, setDetailedStock] = useState<DetailedStockPayload | null>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [retryingSync, setRetryingSync] = useState(false);

  // Sync dir attribute with language
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const fetchMarketBundle = async () => {
    setBundleError(null);
    try {
      const [stocksData, marketData, portData, alertsData] = await Promise.all([
        safeFetchJson<EGXStockSummary[]>('/api/stocks', undefined, lang),
        safeFetchJson<any>('/api/market/overview', undefined, lang),
        safeFetchJson<any>('/api/portfolio', undefined, lang),
        safeFetchJson<SmartAlert[]>('/api/alerts', undefined, lang)
      ]);
      setStocks(Array.isArray(stocksData) ? stocksData : []);
      setMarketOverview(marketData);
      setPortfolio(portData);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setInitialLoading(false);
    } catch (err: any) {
      console.error('Failed to fetch initial data:', err);
      setBundleError(
        err?.message ||
          (lang === 'ar' ? 'تعذر تحميل بيانات السوق من الخادم' : 'Failed to load market data from server')
      );
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketBundle();
  }, []);

  const handleRetryGlobalSync = async () => {
    setRetryingSync(true);
    setActionError(null);
    try {
      await safeFetchJson('/api/market/sync', { method: 'POST' }, lang);
      await fetchMarketBundle();
      if (selectedTicker) {
        loadStockDetails(selectedTicker);
      }
    } catch (err: any) {
      console.error('Retry sync failed:', err);
      setActionError(err?.message || (lang === 'ar' ? 'تعذر إعادة مزامنة المصادر' : 'Failed to retry sync'));
    } finally {
      setRetryingSync(false);
    }
  };

  const loadStockDetails = async (ticker: string) => {
    setLoadingStock(true);
    setStockError(null);
    try {
      const data = await safeFetchJson<DetailedStockPayload>(`/api/stocks/${encodeURIComponent(ticker)}`, undefined, lang);
      setDetailedStock(data);
    } catch (err: any) {
      console.error('Failed to load stock details:', err);
      setStockError(err?.message || (lang === 'ar' ? 'تعذر تحميل بيانات السهم' : 'Failed to load stock details'));
    } finally {
      setLoadingStock(false);
    }
  };

  useEffect(() => {
    if (!selectedTicker) return;
    loadStockDetails(selectedTicker);
  }, [selectedTicker]);

  const handleSelectStock = (ticker: string) => {
    if (!ticker || ticker === 'EGX') return;
    setSelectedTicker(ticker);
    setActiveTab('ANALYSIS');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddTransaction = async (t: string, shares: number, buyPrice: number) => {
    setActionError(null);
    try {
      const d = await safeFetchJson(
        '/api/portfolio/add',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: t, shares, buyPrice })
        },
        lang
      );
      setPortfolio(d);
    } catch (err: any) {
      console.error('Add transaction failed:', err);
      setActionError(err?.message || (lang === 'ar' ? 'تعذر إضافة العملية للمحفظة' : 'Failed to add portfolio transaction'));
    }
  };

  const handleRemoveTransaction = async (t: string) => {
    setActionError(null);
    try {
      const d = await safeFetchJson(
        '/api/portfolio/remove',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: t })
        },
        lang
      );
      setPortfolio(d);
    } catch (err: any) {
      console.error('Remove transaction failed:', err);
      setActionError(err?.message || (lang === 'ar' ? 'تعذر حذف السهم من المحفظة' : 'Failed to remove position'));
    }
  };

  const unreadAlertsCount = alerts.filter(a => !a.isRead).length;

  const handleSendChatMessage = async (text: string, focusTicker?: string) => {
    const timeStr = new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: timeStr
    };

    const historyPayload = chatMessages
      .filter(m => !m.isError)
      .slice(-10)
      .map(m => ({ role: m.role, text: m.text }));

    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const data = await safeFetchJson<any>(
        '/api/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: historyPayload,
            activeTicker: focusTicker || selectedTicker,
            activeTab,
            lang
          })
        },
        lang
      );

      const modelMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: data.reply || '',
        timestamp: new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        usedTools: data.usedTools,
        webSources: data.webSources,
        mentionedTickers: data.mentionedTickers
      };

      setChatMessages(prev => [...prev, modelMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        text: err?.message || (lang === 'ar' ? 'تعذر الاتصال بالمحلل الذكي حالياً.' : 'Failed to reach AI Analyst.'),
        timestamp: new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        isError: true
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const dataStatus = marketOverview?.dataStatus;
  const priceFeedFailed = dataStatus && dataStatus.hasAttemptedSync && dataStatus.freshnessStatus === 'FAILED';
  const indicesFailed = dataStatus && dataStatus.hasAttemptedSync && !dataStatus.indicesOnline;
  const dataIsStale = dataStatus && dataStatus.isStale && dataStatus.freshnessStatus !== 'FAILED';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        stocks={stocks}
        marketOverview={marketOverview}
        selectedTicker={selectedTicker}
        onSelectStock={handleSelectStock}
        lang={lang}
        onToggleLang={() => setLang(l => (l === 'ar' ? 'en' : 'ar'))}
        unreadAlertsCount={unreadAlertsCount}
        onOpenAlerts={() => setIsAlertsOpen(true)}
        onOpenAiChat={() => setIsAiChatOpen(true)}
        isDark={true}
        onToggleTheme={() => {}}
        onToggleMobileMenu={() => setIsMobileSidebarOpen(open => !open)}
        isMobileMenuOpen={isMobileSidebarOpen}
      />

      {/* Main Terminal Body */}
      <div className="flex-1 flex w-full">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          marketOverview={marketOverview}
          lang={lang}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Content Area */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl mx-auto w-full min-w-0">
          {/* Global Data Integrity Alert Banner */}
          {!initialLoading && (priceFeedFailed || indicesFailed || dataIsStale) && (
            <div
              className={`mb-5 rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs ${
                priceFeedFailed || indicesFailed
                  ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                  : 'bg-amber-950/50 border-amber-500/40 text-amber-200'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                {priceFeedFailed || indicesFailed ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-bold">
                    {priceFeedFailed
                      ? (lang === 'ar' ? 'تنبيه مصدر الأسعار: تعذر جلب الأسعار المباشرة من TradingView EGX' : 'Price Feed Alert: TradingView EGX Sync Failed')
                      : indicesFailed
                      ? (lang === 'ar' ? 'تنبيه المؤشرات: تعذر تحديث مؤشرات السوق أو سعر الصرف' : 'Indices Feed Alert: EGX Indices/FX Sync Failed')
                      : (lang === 'ar' ? 'تنبيه حداثة البيانات: الأسعار المعروضة ليست محدثة لحظياً' : 'Stale Data Notice')}
                  </div>
                  <div className="text-[11px] opacity-90">
                    {dataStatus?.staleNoticeAr || dataStatus?.lastSyncError || dataStatus?.indicesSyncError || ''}
                    {dataStatus?.lastSyncedAt && (
                      <span className="ms-2 font-mono-numbers">
                        ({lang === 'ar' ? 'تاريخ أحدث بيانات:' : 'Latest timestamp:'} {dataStatus.lastSyncedAt.replace('T', ' ').substring(0, 16)})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRetryGlobalSync}
                disabled={retryingSync}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white font-bold transition-colors shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retryingSync ? 'animate-spin' : ''}`} />
                <span>{retryingSync ? (lang === 'ar' ? 'جاري التحديث...' : 'Syncing...') : (lang === 'ar' ? 'إعادة مزامنة المصادر' : 'Retry Sync')}</span>
              </button>
            </div>
          )}

          {/* API Connection / Action Error Banner */}
          {!initialLoading && (bundleError || actionError) && (
            <div className="mb-5 rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-100">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold">
                    {lang === 'ar' ? 'خطأ في الاتصال بالواجهة البرمجية (API)' : 'API Communication Error'}
                  </div>
                  <div className="text-[11px] opacity-90">{bundleError || actionError}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {bundleError && (
                  <button
                    type="button"
                    onClick={fetchMarketBundle}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                  </button>
                )}
                {actionError && (
                  <button
                    type="button"
                    onClick={() => setActionError(null)}
                    className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {initialLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-slate-400">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-semibold">
                {lang === 'ar' ? 'جاري الاتصال بمحرك البورصة المصرية وجلب البيانات...' : 'Connecting to EGX Market Engine...'}
              </span>
            </div>
          ) : (
            <ViewErrorBoundary lang={lang} resetKey={`${activeTab}-${selectedTicker}`}>
              {activeTab === 'DASHBOARD' && (
                <DashboardView
                  stocks={stocks}
                  marketOverview={marketOverview}
                  alerts={alerts}
                  onSelectStock={handleSelectStock}
                  lang={lang}
                />
              )}

              {activeTab === 'AI_CHAT' && (
                <AiChatView
                  messages={chatMessages}
                  isLoading={chatLoading}
                  onSendMessage={handleSendChatMessage}
                  onClearChat={() => setChatMessages([])}
                  stocks={stocks}
                  marketOverview={marketOverview}
                  selectedTicker={selectedTicker}
                  onSelectStock={handleSelectStock}
                  lang={lang}
                  variant="page"
                />
              )}

              {activeTab === 'MARKET' && (
                <MarketView
                  overview={marketOverview}
                  lang={lang}
                />
              )}

              {activeTab === 'SCREENER' && (
                <ScreenerView
                  stocks={stocks}
                  onSelectStock={handleSelectStock}
                  lang={lang}
                />
              )}

              {activeTab === 'ANALYSIS' && (
                <>
                  {loadingStock ? (
                    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-slate-400">
                      <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs font-semibold">
                        {lang === 'ar' ? `جاري تشغيل محرك التحليل والذكاء الاصطناعي لسهم ${selectedTicker}...` : `Analyzing ${selectedTicker}...`}
                      </span>
                    </div>
                  ) : stockError || !detailedStock ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4 max-w-lg mx-auto my-12">
                      <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20 text-xl font-bold">
                        !
                      </div>
                      <h3 className="text-base font-bold text-white">
                        {lang === 'ar' ? `تعذر تحميل بيانات سهم ${selectedTicker}` : `Failed to load ${selectedTicker}`}
                      </h3>
                      <p className="text-xs text-rose-200 leading-relaxed">
                        {stockError || (lang === 'ar' ? 'حدث تأخير في الاستجابة أو انقطاع اتصال مؤقت. يرجى إعادة المحاولة.' : 'Temporary response delay. Please retry.')}
                      </p>
                      <button
                        onClick={() => loadStockDetails(selectedTicker)}
                        className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all"
                      >
                        {lang === 'ar' ? 'إعادة المحاولة الآن' : 'Retry Now'}
                      </button>
                    </div>
                  ) : (
                    <StockAnalysisView
                      data={detailedStock}
                      onRefreshData={() => loadStockDetails(selectedTicker)}
                      lang={lang}
                    />
                  )}
                </>
              )}

              {activeTab === 'PORTFOLIO' && (
                <PortfolioView
                  portfolio={portfolio}
                  stocks={stocks}
                  onAddTransaction={handleAddTransaction}
                  onRemoveTransaction={handleRemoveTransaction}
                  onSelectStock={handleSelectStock}
                  lang={lang}
                />
              )}

              {activeTab === 'HISTORY' && (
                <HistoryView
                  onSelectStock={handleSelectStock}
                  lang={lang}
                />
              )}

              {activeTab === 'BACKTEST' && (
                <BacktestView
                  stocks={stocks}
                  lang={lang}
                />
              )}

              {activeTab === 'SOURCES' && (
                <SourcesView
                  lang={lang}
                  onMarketSynced={() => {
                    fetchMarketBundle();
                    if (selectedTicker) loadStockDetails(selectedTicker);
                  }}
                />
              )}

              {activeTab === 'SECTORS' && (
                <SectorView
                  stocks={stocks}
                  onSelectStock={handleSelectStock}
                  lang={lang}
                />
              )}

              {activeTab === 'NEWS' && (
                <NewsView
                  onSelectStock={handleSelectStock}
                  lang={lang}
                />
              )}

              {activeTab === 'WATCHLIST' && (
                <ScreenerView
                  stocks={stocks.filter(s => ['COMI', 'TMGH', 'SWDY', 'MFPC', 'ETEL', 'FWRY', 'GBCO'].includes(s.ticker))}
                  onSelectStock={handleSelectStock}
                  lang={lang}
                />
              )}

              {activeTab === 'SETTINGS' && (
                <SettingsView
                  lang={lang}
                  onToggleLang={() => setLang(l => (l === 'ar' ? 'en' : 'ar'))}
                />
              )}
            </ViewErrorBoundary>
          )}
        </main>
      </div>

      {/* Smart Alerts Slide-Over Drawer */}
      {isAlertsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-5 flex flex-col justify-between shadow-2xl animate-slide-left">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">
                    {lang === 'ar' ? 'مركز التنبيهات الذكية اللحظية' : 'Smart Alerts Center'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsAlertsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[75vh] pr-1">
                {alerts.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-8">
                    {lang === 'ar' ? 'لا توجد تنبيهات نشطة حالياً.' : 'No active alerts.'}
                  </div>
                ) : (
                  alerts.map((a) => {
                    const isStockTicker = a.ticker !== 'EGX' && a.ticker !== 'SYSTEM';
                    return (
                    <div
                      key={a.id}
                      onClick={() => {
                        if (isStockTicker) {
                          handleSelectStock(a.ticker);
                          setIsAlertsOpen(false);
                        }
                      }}
                      className={`bg-slate-950 p-4 rounded-xl border transition-all space-y-1.5 ${
                        a.severity === 'DANGER'
                          ? 'border-rose-500/40'
                          : a.severity === 'WARNING'
                          ? 'border-amber-500/40'
                          : 'border-slate-800 hover:border-slate-700'
                      } ${isStockTicker ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono-numbers">
                        <span className={`font-bold ${a.severity === 'DANGER' ? 'text-rose-400' : a.severity === 'WARNING' ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {a.ticker} - {a.typeAr}
                        </span>
                        <span className="text-[10px] text-slate-500">{a.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {a.messageAr}
                      </p>
                    </div>
                    );
                  })
                )}
              </div>
            </div>

            <button
              onClick={() => setIsAlertsOpen(false)}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:text-white"
            >
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* AI Analyst Chat Quick Slide-Over Drawer */}
      {isAiChatOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-xl bg-slate-950 border-s border-slate-800 h-full shadow-2xl flex flex-col">
            <AiChatView
              messages={chatMessages}
              isLoading={chatLoading}
              onSendMessage={handleSendChatMessage}
              onClearChat={() => setChatMessages([])}
              stocks={stocks}
              marketOverview={marketOverview}
              selectedTicker={selectedTicker}
              onSelectStock={handleSelectStock}
              lang={lang}
              variant="drawer"
              onCloseDrawer={() => setIsAiChatOpen(false)}
              onExpandToFull={() => {
                setIsAiChatOpen(false);
                setActiveTab('AI_CHAT');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
