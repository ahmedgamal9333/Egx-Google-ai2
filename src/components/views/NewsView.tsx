import React, { useState, useEffect } from 'react';
import { Newspaper, Calendar, ExternalLink, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { NewsItem, UpcomingEvent } from '../../types';

import { safeFetchJson } from '../../utils/apiClient';

interface NewsViewProps {
  onSelectStock: (ticker: string) => void;
  lang?: 'ar' | 'en';
}

export const NewsView: React.FC<NewsViewProps> = ({ onSelectStock, lang = 'ar' }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [eventsNoteAr, setEventsNoteAr] = useState<string>('');
  const [sourceOnline, setSourceOnline] = useState<boolean>(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('ALL');

  const fetchNews = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const d = await safeFetchJson<any>('/api/news', undefined, lang);
      setNews(Array.isArray(d.news) ? d.news : []);
      setEvents(Array.isArray(d.events) ? d.events : []);
      setEventsNoteAr(d.eventsNoteAr || '');
      setSourceOnline(Boolean(d.sourceOnline));
      setLastFetchedAt(d.lastFetchedAt || null);
      setErrorMsg(d.error || null);
    } catch (err: any) {
      console.error(err);
      setSourceOnline(false);
      setErrorMsg(err?.message || (lang === 'ar' ? 'تعذر الاتصال بخدمة الأخبار' : 'Failed to load news feed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const filteredNews = filterCategory === 'ALL'
    ? news
    : news.filter(n => n.category === filterCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Newspaper className="w-4 h-4 text-emerald-400" />
            <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">
              {lang === 'ar' ? 'الأخبار الحية للبورصة المصرية (Google News RSS)' : 'Live EGX News Feed'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">
            {lang === 'ar' ? 'متابعة الأخبار المنشورة ونتائج الأعمال بالروابط الأصلية' : 'Live Financial News & Disclosures'}
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {lastFetchedAt && (
            <span className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-300 font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              {String(lastFetchedAt).replace('T', ' ').substring(0, 16)}
            </span>
          )}
          <button
            type="button"
            onClick={fetchNews}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {lang === 'ar' ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Feed Error Banner */}
      {(!sourceOnline || errorMsg) && (
        <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg || 'تعذر الاتصال بتغذية أخبار Google News RSS.'}</span>
          </div>
          <button
            type="button"
            onClick={fetchNews}
            className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white font-bold shrink-0"
          >
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

      {/* Categories Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 text-xs">
        {[
          { id: 'ALL', label: lang === 'ar' ? 'كافة الأخبار' : 'All News' },
          { id: 'EARNINGS', label: 'نتائج الأعمال والأرباح' },
          { id: 'DISCLOSURE', label: 'إفصاحات جوهرية' },
          { id: 'CONTRACT', label: 'عقود واستثمارات' },
          { id: 'DIVIDEND', label: 'توزيعات نقدية' }
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(cat.id)}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              filterCategory === cat.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Disclosures Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>{lang === 'ar' ? 'جاري جلب أحدث الأخبار المنشورة من المصدر الحي...' : 'Fetching live news...'}</span>
            </div>
          ) : filteredNews.length === 0 ? (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center text-xs text-slate-400">
              {lang === 'ar' ? 'لا توجد أخبار منشورة مطابقة لهذا التصنيف حالياً.' : 'No live articles match this category.'}
            </div>
          ) : (
            filteredNews.map((n) => {
              const hasStock = Boolean(n.ticker && n.ticker !== 'EGX');
              return (
                <div
                  key={n.id}
                  onClick={() => hasStock && onSelectStock(n.ticker)}
                  className={`bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl transition-all space-y-3 ${
                    hasStock ? 'cursor-pointer' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                        {n.ticker}
                      </span>
                      <span className="font-bold text-emerald-400">{n.newsTypeAr || n.categoryAr}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          n.isConfirmed
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                            : n.newsType === 'RUMOR_OR_CIRCULATED'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {n.isConfirmed ? 'مؤكد رسمياً' : 'غير مؤكد رسمياً'}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 font-mono">{n.publishedAt || 'غير مؤرخ'}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400">{n.source}</span>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      n.impact === 'VERY_POSITIVE' || n.impact === 'POSITIVE'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : n.impact === 'NEGATIVE' || n.impact === 'VERY_NEGATIVE'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {n.impactAr}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold text-white hover:text-emerald-400 transition-colors">
                      {n.titleAr}
                    </h3>
                    {n.sourceUrl && (
                      <a
                        href={n.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/40 text-[11px] font-semibold text-cyan-400"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{lang === 'ar' ? 'المصدر' : 'Source'}</span>
                      </a>
                    )}
                  </div>

                  {(n.summaryAr || n.impactMechanismAr) && (
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
                      {n.impactMechanismAr || n.summaryAr}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Upcoming Corporate Calendar Sidebar */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 h-fit">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Calendar className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">
              {lang === 'ar' ? 'أجندة الجمعيات والاستحقاقات' : 'Upcoming Events Calendar'}
            </h3>
          </div>

          {events.length === 0 ? (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 leading-relaxed">
              {eventsNoteAr || 'لا يتوافر حالياً مصدر آلي رسمي لأجندة الجمعيات العمومية القادمة؛ تلتزم المنصة بعدم إضافة مواعيد تقديرية أو افتراضية.'}
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => ev.ticker !== 'EGX' && onSelectStock(ev.ticker)}
                  className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between font-mono-numbers">
                    <span className="font-bold text-white font-mono">{ev.ticker}</span>
                    <span className="text-emerald-400 font-bold">{ev.eventDate}</span>
                  </div>
                  <div className="font-bold text-slate-200 text-xs">{ev.eventNameAr}</div>
                  <p className="text-[11px] text-slate-400 leading-tight">{ev.detailsAr}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
