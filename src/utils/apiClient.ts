export class ApiClientError extends Error {
  public readonly status?: number;
  public readonly isHtmlResponse: boolean;
  public readonly isEmptyBody: boolean;
  public readonly contentType: string;

  constructor(
    message: string,
    opts?: {
      status?: number;
      isHtmlResponse?: boolean;
      isEmptyBody?: boolean;
      contentType?: string;
    }
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = opts?.status;
    this.isHtmlResponse = Boolean(opts?.isHtmlResponse);
    this.isEmptyBody = Boolean(opts?.isEmptyBody);
    this.contentType = opts?.contentType || '';
  }
}

function isLikelyHtml(text: string, contentType: string): boolean {
  if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
    return true;
  }
  const trimmed = text.trimStart();
  return /^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed) || trimmed.startsWith('<');
}

/**
 * Safely fetches an API endpoint and parses JSON ONLY after verifying HTTP status,
 * Content-Type, non-empty payload, and guarding against HTML fallback pages.
 */
export async function safeFetchJson<T = any>(
  url: string,
  init?: RequestInit,
  lang: 'ar' | 'en' = 'ar'
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers
    });
  } catch (networkErr: any) {
    const msg =
      lang === 'ar'
        ? `تعذر الاتصال بالخادم (${networkErr?.message || 'انقطاع الشبكة'})`
        : `Network connection failed (${networkErr?.message || 'Unable to reach server'})`;
    throw new ApiClientError(msg);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    const msg =
      lang === 'ar'
        ? `أرجع الخادم استجابة فارغة من المسار ${url} (HTTP ${res.status})`
        : `Server returned an empty response from ${url} (HTTP ${res.status})`;
    throw new ApiClientError(msg, { status: res.status, isEmptyBody: true, contentType });
  }

  if (isLikelyHtml(trimmed, contentType)) {
    const msg =
      lang === 'ar'
        ? `أرجع المسار ${url} صفحة HTML بدلاً من بيانات JSON (HTTP ${res.status}) — قد يكون الخادم قيد إعادة التشغيل أو المسار غير موجّه للواجهة البرمجية.`
        : `Endpoint ${url} returned HTML instead of JSON (HTTP ${res.status}). The server may be restarting or misrouted.`;
    throw new ApiClientError(msg, { status: res.status, isHtmlResponse: true, contentType });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const msg =
      lang === 'ar'
        ? `استجابة غير صالحة بصيغة JSON من ${url} (HTTP ${res.status})`
        : `Invalid JSON payload received from ${url} (HTTP ${res.status})`;
    throw new ApiClientError(msg, { status: res.status, contentType });
  }

  if (!res.ok) {
    const serverMsg =
      (parsed && typeof parsed === 'object' && (parsed.error || parsed.message)) ||
      `HTTP ${res.status}`;
    throw new ApiClientError(String(serverMsg), { status: res.status, contentType });
  }

  return parsed as T;
}
