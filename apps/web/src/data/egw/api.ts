/**
 * EGW API client — thin fetch wrappers over the REST endpoints.
 *
 * The server (packages/web/server) serves EGW data from egw-paragraphs.db.
 * Vite dev proxy forwards /api → localhost:3001.
 */

import type {
  EGWBookInfo,
  EGWPageResponse,
  EGWChapter,
  EGWSearchResult,
  EGWBookDump,
} from '@bible/api';

export type { EGWBookInfo, EGWPageResponse, EGWChapter, EGWSearchResult, EGWBookDump };
export type { EGWParagraph } from '@bible/api';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`EGW API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function fetchEgwBooks(): Promise<readonly EGWBookInfo[]> {
  return fetchJson('/api/egw/books');
}

export function fetchEgwPage(bookCode: string, page: number): Promise<EGWPageResponse> {
  return fetchJson(`/api/egw/${encodeURIComponent(bookCode)}/${page}`);
}

export function fetchEgwChapters(bookCode: string): Promise<readonly EGWChapter[]> {
  return fetchJson(`/api/egw/${encodeURIComponent(bookCode)}/chapters`);
}

export function searchEgw(
  query: string,
  opts?: { bookCode?: string; limit?: number },
): Promise<readonly EGWSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (opts?.bookCode) params.set('bookCode', opts.bookCode);
  if (opts?.limit) params.set('limit', String(opts.limit));
  return fetchJson(`/api/egw/search?${params}`);
}

export function fetchEgwBookDump(bookCode: string): Promise<EGWBookDump> {
  return fetchJson(`/api/egw/${encodeURIComponent(bookCode)}/dump`);
}
