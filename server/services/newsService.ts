import { getEGXStock } from '../data/egxStocks';

export type NewsSourceType =
  | 'PRESS_ARTICLE'
  | 'EGX_OFFICIAL_DISCLOSURE'
  | 'FINANCIAL_RESULTS'
  | 'UNCONFIRMED'
  | 'RUMOR_OR_CIRCULATED';

export interface NewsItem {
  id: string;
  ticker: string;
  titleAr: string;
  titleEn: string;
  source: string;
  sourceUrl: string;
  originalSourceDomain: string | null;
  publishedAt: string;
  isConfirmed: boolean;
  newsType: NewsSourceType;
  newsTypeAr: string;
  sourceCredibilityAr: string;
  category: 'DISCLOSURE' | 'EARNINGS' | 'DIVIDEND' | 'ACQUISITION' | 'CONTRACT' | 'MACRO';
  categoryAr: string;
  impact: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'VERY_NEGATIVE';
  impactAr: string;
  impactHorizon: 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM';
  impactMechanismAr: string;
  classificationConfidencePct: number;
  summaryAr: string;
  significanceScore: number;
}

export interface UpcomingEvent {
  id: string;
  ticker: string;
  eventNameAr: string;
  eventDate: string;
  category: string;
  status: string;
  detailsAr: string;
}

export interface NewsFeedStatus {
  online: boolean;
  lastFetchedAt: string | null;
  latencyMs: number | null;
  lastError: string | null;
  cachedMarketCount: number;
}

const RSS_CACHE_TTL_MS = 10 * 60 * 1000;
const newsCache = new Map<string, { items: NewsItem[]; fetchedAtMs: number; fetchedAtIso: string }>();

const feedStatus: NewsFeedStatus = {
  online: false,
  lastFetchedAt: null,
  latencyMs: null,
  lastError: null,
  cachedMarketCount: 0
};

const OFFICIAL_EGX_DOMAINS = ['egx.com.eg', 'fra.gov.eg', 'mubasher.info'];
const CREDIBLE_FINANCIAL_PRESS_DOMAINS = [
  'almalnews.com',
  'alborsaanews.com',
  'amwalalghad.com',
  'mubasher.info',
  'economyplusme.com',
  'enterprise.press',
  'enterprisefinancial',
  'reuters.com',
  'bloomberg.com',
  'cnbcarabia.com',
  'alarabiya.net',
  'asharqbusiness.com',
  'youm7.com',
  'ahram.org.eg',
  'masrawy.com'
];

const NEWS_TYPE_LABELS: Record<NewsSourceType, string> = {
  PRESS_ARTICLE: 'خبر صحفي',
  EGX_OFFICIAL_DISCLOSURE: 'إفصاح رسمي من البورصة المصرية',
  FINANCIAL_RESULTS: 'إعلان نتائج مالية',
  UNCONFIRMED: 'خبر غير مؤكد',
  RUMOR_OR_CIRCULATED: 'شائعة أو خبر متداول'
};

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1]) : '';
}

function extractSourceUrlFromItem(block: string): { publisherUrl: string | null; publisherDomain: string | null } {
  const attrMatch = block.match(/<source[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (attrMatch && attrMatch[1]) {
    try {
      const u = new URL(attrMatch[1]);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return { publisherUrl: u.toString(), publisherDomain: u.hostname.replace(/^www\./, '').toLowerCase() };
      }
    } catch {
      // ignore invalid URL
    }
  }
  return { publisherUrl: null, publisherDomain: null };
}

function formatPubDate(pubDateStr: string): string {
  if (!pubDateStr) return '';
  const d = new Date(pubDateStr);
  if (Number.isNaN(d.getTime())) return pubDateStr;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return fmt.format(d).replace(', ', ' ');
}

/**
 * Multi-factor context-aware news classifier (never blindly marks press as confirmed or uses naive 1-word regex).
 */
export function classifyNewsHeadline(
  title: string,
  sourceName: string,
  publisherDomain: string | null
): {
  newsType: NewsSourceType;
  newsTypeAr: string;
  isConfirmed: boolean;
  sourceCredibilityAr: string;
  category: NewsItem['category'];
  categoryAr: string;
  impact: NewsItem['impact'];
  impactAr: string;
  impactHorizon: NewsItem['impactHorizon'];
  impactMechanismAr: string;
  classificationConfidencePct: number;
  significanceScore: number;
} {
  const lower = title.toLowerCase();
  const cleanDomain = (publisherDomain || '').toLowerCase();

  // 1. Source Verification & News Type Determination
  const isOfficialEgxDomain = OFFICIAL_EGX_DOMAINS.some((d) => d === 'egx.com.eg' || d === 'fra.gov.eg' ? cleanDomain.endsWith(d) : false);
  const isCredibleFinancialPress = CREDIBLE_FINANCIAL_PRESS_DOMAINS.some((d) => cleanDomain.endsWith(d));

  const hasRumorCues = /شائعة|شائعات|توقعات|أنباء عن|مصادر مطلعة|قيل إن|يتردد|مقترح|تدرس|تعتزم|قد تتجه|rumor|reportedly/i.test(lower);
  const hasDenialCues = /نفي|تنفي|غير صحيح|لا صحة|توضح حقيقة/.test(title);
  const hasFinancialResults = /نتائج أعمال|نتائج مالية|القوائم المالية|صافي ربح|نمو أرباح|نمو الأرباح|ارتفاع أرباح|ارتفاع الأرباح|أرباح الربع|أرباح التسعة|أرباح العام|تراجع أرباح|قفزة أرباح|تحول للربحية|تحول للخسائر|إيرادات الشركة/.test(title);

  let newsType: NewsSourceType = 'PRESS_ARTICLE';
  let isConfirmed = false;
  let sourceCredibilityAr = `نطاق ناشر (${cleanDomain || sourceName}) غير مصنف كمصدر إفصاح رسمي`;

  if (isOfficialEgxDomain) {
    newsType = 'EGX_OFFICIAL_DISCLOSURE';
    isConfirmed = true;
    sourceCredibilityAr = `إفصاح رسمي مباشر من ${cleanDomain}`;
  } else if (hasRumorCues && !hasDenialCues) {
    newsType = 'RUMOR_OR_CIRCULATED';
    isConfirmed = false;
    sourceCredibilityAr = 'صياغة احتمالية/متداولة عبر الصحافة غير مؤكدة بإفصاح رسمي من البورصة';
  } else if (hasFinancialResults && isCredibleFinancialPress) {
    newsType = 'FINANCIAL_RESULTS';
    isConfirmed = false; // Press report of financial results until verified on EGX feed
    sourceCredibilityAr = `تغطية نتائج مالية عبر صحيفة متخصصة (${cleanDomain || sourceName}) — تتطلب مطابقة إفصاح EGX الرسمي`;
  } else if (isCredibleFinancialPress) {
    newsType = 'PRESS_ARTICLE';
    isConfirmed = false;
    sourceCredibilityAr = `خبر صحفي منشور (${cleanDomain || sourceName}) — غير مؤكد كإفصاح رسمي للبورصة`;
  } else {
    newsType = 'UNCONFIRMED';
    isConfirmed = false;
  }

  // 2. Corporate Event Category
  let category: NewsItem['category'] = 'DISCLOSURE';
  let categoryAr = 'أخبار وإفصاحات السوق';

  if (hasFinancialResults || /أرباح|خسائر|مبيعات/.test(title)) {
    category = 'EARNINGS';
    categoryAr = 'نتائج أعمال وأرباح';
  } else if (/توزيع|كوبون|أرباح نقدية|أسهم مجانية/.test(title)) {
    category = 'DIVIDEND';
    categoryAr = 'توزيعات نقدية ومجانية';
  } else if (/استحواذ|شراء حصة|اندماج|عرض شراء|تخارج/.test(title)) {
    category = 'ACQUISITION';
    categoryAr = 'استحواذات وهيكلة';
  } else if (/عقد|اتفاقية|توقيع|توريد|مشروع|مناقصة/.test(title)) {
    category = 'CONTRACT';
    categoryAr = 'عقود وتوسعات';
  } else if (/المركزي|الفائدة|التضخم|الدولار|صندوق النقد|EGX30|البورصة المصرية/.test(title)) {
    category = 'MACRO';
    categoryAr = 'اقتصاد كلي وسوق';
  }

  // 3. Context-aware & Negation-guarded Impact Evaluation
  const hasNegationOrDeclineContext =
    /تراجع|انخفاض|خسارة|هبوط|عجز|ضغوط|أزمة|إيقاف|شطب|غرامة|تحقيق|نفي|تأجيل|إلغاء/.test(title);
  const hasSevereNegative = /شطب|إيقاف التداول|خسائر حادة|غرامة|تحقيق|عجز حاد|إفلاس/.test(title);
  const hasNegative = /تراجع|انخفاض|خسارة|هبوط|انكماش|تأجيل/.test(title);
  const hasPositiveFinancial =
    (/نمو|ارتفاع|قفزة|صعود|ربح قياسي|توقيع عقد|موافقة على توزيع|كوبون نقدي|عرض شراء إجباري/.test(title)) &&
    !hasDenialCues &&
    !/رغم ارتفاع|بعد ارتفاع|مقابل تراجع/.test(title);

  let impact: NewsItem['impact'] = 'NEUTRAL';
  let impactAr = 'محايد / معلوماتي';
  let impactHorizon: NewsItem['impactHorizon'] = 'SHORT_TERM';
  let impactMechanismAr = 'خبر إخباري عام بدون أثر جوهري مباشر مؤكد على التدفقات النقدية.';
  let significanceScore = 5.5;
  let classificationConfidencePct = isCredibleFinancialPress ? 68 : 45;

  if (newsType === 'RUMOR_OR_CIRCULATED') {
    impact = 'NEUTRAL';
    impactAr = 'متداول غير مؤكد (مراقبة فقط)';
    impactHorizon = 'IMMEDIATE';
    impactMechanismAr = 'خبر متداول أو احتمالي بصياغة غير ملزمة ولا يُعتد به في توصيات الشراء قبل الإفصاح الرسمي.';
    significanceScore = 4.0;
    classificationConfidencePct = 35;
  } else if (hasSevereNegative) {
    impact = 'VERY_NEGATIVE';
    impactAr = 'سلبي حاد (تحذير مخاطر)';
    impactHorizon = 'IMMEDIATE';
    impactMechanismAr = 'يمس استمرارية التداول أو الملاءة أو الامتثال التنظيمي على المدى الفوري.';
    significanceScore = 8.8;
    classificationConfidencePct = 82;
  } else if (hasNegative && !hasPositiveFinancial) {
    impact = 'NEGATIVE';
    impactAr = 'يميل للسلبية';
    impactHorizon = category === 'EARNINGS' ? 'MEDIUM_TERM' : 'SHORT_TERM';
    impactMechanismAr = 'ضغط على هوامش الربحية أو تأجيل تدفقات متوقعة وفق نص الخبر.';
    significanceScore = 7.0;
    classificationConfidencePct = 70;
  } else if (hasPositiveFinancial && !hasNegationOrDeclineContext) {
    impact = 'POSITIVE';
    impactAr = isConfirmed ? 'إيجابي مؤكد' : 'يميل للإيجابية (صحفي)';
    impactHorizon = category === 'EARNINGS' || category === 'CONTRACT' ? 'MEDIUM_TERM' : 'SHORT_TERM';
    impactMechanismAr =
      category === 'EARNINGS'
        ? 'نمو أرباح/إيرادات معلن يدعم مضاعفات الربحية والقيمة العادلة.'
        : category === 'DIVIDEND'
        ? 'توزيع نقدي يعزز العائد الجاري لحملة السهم.'
        : 'توسع تعاقدي أو استثماري قد ينعكس على الإيرادات المستقبلية حال التنفيذ.';
    significanceScore = isConfirmed ? 8.5 : 7.2;
    classificationConfidencePct = isConfirmed ? 88 : 65;
  }

  return {
    newsType,
    newsTypeAr: NEWS_TYPE_LABELS[newsType],
    isConfirmed,
    sourceCredibilityAr,
    category,
    categoryAr,
    impact,
    impactAr,
    impactHorizon,
    impactMechanismAr,
    classificationConfidencePct,
    significanceScore
  };
}

async function fetchGoogleNewsRss(query: string, defaultTicker: string, limit = 15): Promise<{
  items: NewsItem[];
  online: boolean;
  fetchedAt: string | null;
  error: string | null;
}> {
  const cacheKey = `${defaultTicker}:${query}`;
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAtMs < RSS_CACHE_TTL_MS) {
    return {
      items: cached.items,
      online: true,
      fetchedAt: cached.fetchedAtIso,
      error: null
    };
  }

  const start = Date.now();
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ar&gl=EG&ceid=EG:ar`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6500)
    });

    const latencyMs = Math.max(20, Date.now() - start);
    if (!res.ok) {
      throw new Error(`Google News RSS HTTP ${res.status}`);
    }

    const xml = await res.text();
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const items: NewsItem[] = [];

    for (let i = 0; i < Math.min(limit, itemMatches.length); i++) {
      const block = itemMatches[i];
      const rawTitle = extractTag(block, 'title');
      const link = extractTag(block, 'link');
      const pubDate = extractTag(block, 'pubDate');
      const sourceName = extractTag(block, 'source') || 'Google News Egypt';
      const { publisherUrl, publisherDomain } = extractSourceUrlFromItem(block);

      if (!rawTitle || !link) continue;

      let safeLink = '';
      try {
        const parsed = new URL(link);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          safeLink = parsed.toString();
        }
      } catch {
        continue;
      }
      if (!safeLink) continue;

      const cleanTitle = sourceName && rawTitle.endsWith(` - ${sourceName}`)
        ? rawTitle.slice(0, -(` - ${sourceName}`).length).trim()
        : rawTitle;

      const classified = classifyNewsHeadline(cleanTitle, sourceName, publisherDomain);
      const publishedAt = formatPubDate(pubDate);

      items.push({
        id: `rss-${defaultTicker}-${i + 1}`,
        ticker: defaultTicker,
        titleAr: cleanTitle,
        titleEn: cleanTitle,
        source: publisherDomain ? `${sourceName} (${publisherDomain})` : sourceName,
        sourceUrl: safeLink,
        originalSourceDomain: publisherDomain || (publisherUrl ? publisherUrl : null),
        publishedAt,
        isConfirmed: classified.isConfirmed,
        newsType: classified.newsType,
        newsTypeAr: classified.newsTypeAr,
        sourceCredibilityAr: classified.sourceCredibilityAr,
        category: classified.category,
        categoryAr: classified.categoryAr,
        impact: classified.impact,
        impactAr: classified.impactAr,
        impactHorizon: classified.impactHorizon,
        impactMechanismAr: classified.impactMechanismAr,
        classificationConfidencePct: classified.classificationConfidencePct,
        summaryAr: `${classified.newsTypeAr} عبر "${sourceName}" بتاريخ ${publishedAt || 'غير محدد'} — ${classified.impactMechanismAr}`,
        significanceScore: classified.significanceScore
      });
    }

    const nowIso = new Date().toISOString();
    feedStatus.online = true;
    feedStatus.lastFetchedAt = nowIso;
    feedStatus.latencyMs = latencyMs;
    feedStatus.lastError = null;
    if (defaultTicker === 'EGX') {
      feedStatus.cachedMarketCount = items.length;
    }

    newsCache.set(cacheKey, { items, fetchedAtMs: Date.now(), fetchedAtIso: nowIso });
    return {
      items,
      online: true,
      fetchedAt: nowIso,
      error: null
    };
  } catch (err: any) {
    const errMsg = err?.message || 'تعذر الاتصال بمصدر الأخبار الحية (Google News RSS)';
    feedStatus.online = false;
    feedStatus.lastError = errMsg;
    return {
      items: [],
      online: false,
      fetchedAt: null,
      error: errMsg
    };
  }
}

async function fetchAlBorsaRss(): Promise<{
  items: NewsItem[];
  online: boolean;
  fetchedAt: string | null;
}> {
  const cacheKey = '__ALBORSA_DIRECT_FEED__';
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAtMs < RSS_CACHE_TTL_MS) {
    return { items: cached.items, online: true, fetchedAt: cached.fetchedAtIso };
  }

  try {
    const res = await fetch('https://alborsaanews.com/feed/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return { items: [], online: false, fetchedAt: null };

    const xml = await res.text();
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const items: NewsItem[] = [];

    for (let i = 0; i < Math.min(20, itemMatches.length); i++) {
      const block = itemMatches[i];
      const rawTitle = extractTag(block, 'title');
      const link = extractTag(block, 'link');
      const pubDate = extractTag(block, 'pubDate');
      if (!rawTitle || !link) continue;

      let safeLink = '';
      try {
        const parsed = new URL(link);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          safeLink = parsed.toString();
        }
      } catch {
        continue;
      }
      if (!safeLink) continue;

      const cleanTitle = rawTitle.trim();
      const classified = classifyNewsHeadline(cleanTitle, 'جريدة البورصة', 'alborsaanews.com');
      const publishedAt = formatPubDate(pubDate);

      items.push({
        id: `alborsa-${i + 1}`,
        ticker: 'EGX',
        titleAr: cleanTitle,
        titleEn: cleanTitle,
        source: 'جريدة البورصة (alborsaanews.com)',
        sourceUrl: safeLink,
        originalSourceDomain: 'alborsaanews.com',
        publishedAt,
        isConfirmed: classified.isConfirmed,
        newsType: classified.newsType,
        newsTypeAr: classified.newsTypeAr,
        sourceCredibilityAr: classified.sourceCredibilityAr,
        category: classified.category,
        categoryAr: classified.categoryAr,
        impact: classified.impact,
        impactAr: classified.impactAr,
        impactHorizon: classified.impactHorizon,
        impactMechanismAr: classified.impactMechanismAr,
        classificationConfidencePct: classified.classificationConfidencePct,
        summaryAr: `${classified.newsTypeAr} عبر "جريدة البورصة" بتاريخ ${publishedAt || 'غير محدد'} — ${classified.impactMechanismAr}`,
        significanceScore: classified.significanceScore
      });
    }

    const nowIso = new Date().toISOString();
    newsCache.set(cacheKey, { items, fetchedAtMs: Date.now(), fetchedAtIso: nowIso });
    return { items, online: items.length > 0, fetchedAt: nowIso };
  } catch {
    return { items: [], online: false, fetchedAt: null };
  }
}

function mergeAndDeduplicateNews(primary: NewsItem[], secondary: NewsItem[], limit = 25): NewsItem[] {
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of [...primary, ...secondary]) {
    const normKey = item.titleAr.replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, '').slice(0, 48).toLowerCase();
    if (!normKey || seen.has(normKey)) continue;
    seen.add(normKey);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

export class NewsDisclosureService {
  public static getFeedStatus(): NewsFeedStatus {
    return { ...feedStatus };
  }

  public static getCachedTickerNewsHints(ticker: string): {
    hasConfirmedPositive: boolean;
    hasSevereNegative: boolean;
  } {
    const norm = ticker.toUpperCase().replace('.CA', '');
    for (const [key, entry] of newsCache.entries()) {
      if (key.startsWith(`${norm}:`)) {
        return {
          hasConfirmedPositive: entry.items.some((n) => n.isConfirmed && n.impact === 'POSITIVE'),
          hasSevereNegative: entry.items.some((n) => n.impact === 'VERY_NEGATIVE')
        };
      }
    }
    return { hasConfirmedPositive: false, hasSevereNegative: false };
  }

  public static async fetchNewsForTicker(ticker: string): Promise<{
    news: NewsItem[];
    sourceOnline: boolean;
    lastFetchedAt: string | null;
    error: string | null;
  }> {
    const norm = ticker.toUpperCase().replace('.CA', '');
    const stock = getEGXStock(norm);
    const shortName = stock?.nameAr?.split('-')?.[0]?.trim() || norm;
    const query = `"${shortName}" OR "${norm}" البورصة المصرية`;
    const [googleRes, alBorsaRes] = await Promise.all([
      fetchGoogleNewsRss(query, norm, 8),
      fetchAlBorsaRss()
    ]);

    const matchingAlBorsa = alBorsaRes.items
      .filter((item) => item.titleAr.includes(shortName) || item.titleAr.toUpperCase().includes(norm))
      .map((item) => ({ ...item, ticker: norm }));
    const combined = mergeAndDeduplicateNews(googleRes.items, matchingAlBorsa, 10);

    return {
      news: combined,
      sourceOnline: googleRes.online || alBorsaRes.online,
      lastFetchedAt: googleRes.fetchedAt || alBorsaRes.fetchedAt,
      error: googleRes.online || alBorsaRes.online ? null : googleRes.error
    };
  }

  public static async fetchAllNews(): Promise<{
    news: NewsItem[];
    sourceOnline: boolean;
    lastFetchedAt: string | null;
    error: string | null;
  }> {
    const query = `"البورصة المصرية" OR EGX30 OR "البنك المركزي المصري"`;
    const [googleRes, alBorsaRes] = await Promise.all([
      fetchGoogleNewsRss(query, 'EGX', 18),
      fetchAlBorsaRss()
    ]);

    const combined = mergeAndDeduplicateNews(googleRes.items, alBorsaRes.items, 25);
    if (combined.length > 0) {
      feedStatus.online = true;
      feedStatus.cachedMarketCount = combined.length;
      if (!feedStatus.lastFetchedAt) {
        feedStatus.lastFetchedAt = alBorsaRes.fetchedAt;
      }
    }

    return {
      news: combined,
      sourceOnline: googleRes.online || alBorsaRes.online,
      lastFetchedAt: googleRes.fetchedAt || alBorsaRes.fetchedAt,
      error: googleRes.online || alBorsaRes.online ? null : googleRes.error
    };
  }

  public static getUpcomingEvents(): UpcomingEvent[] {
    return [];
  }
}
