/**
 * Safely parses JSON from external upstream HTTP responses while guarding against
 * HTML error/WAF pages (<!doctype html...), empty responses, and malformed payloads.
 */
export async function parseSafeExternalJson<T = any>(res: Response, sourceLabel: string): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error(`استجابة فارغة من ${sourceLabel} (HTTP ${res.status})`);
  }

  if (
    contentType.includes('text/html') ||
    /^<!doctype\s+html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    trimmed.startsWith('<')
  ) {
    throw new Error(`أرجع ${sourceLabel} صفحة HTML/حماية بدلاً من JSON (HTTP ${res.status})`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`تنسيق JSON غير صالح من ${sourceLabel} (HTTP ${res.status})`);
  }
}
