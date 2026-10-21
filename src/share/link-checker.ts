/** Cached liveness checks for program links. Dead = 404/410 or host unreachable. */
export type LinkState = 'OK' | 'DEAD' | 'UNVERIFIED';
export interface LinkResult { state: LinkState; status: number | null; checkedAt: string }

type Fetcher = (url: string, init: RequestInit) => Promise<{ status: number }>;

export class LinkChecker {
  private cache = new Map<string, { result: LinkResult; expires: number }>();
  private inflight = new Map<string, Promise<LinkResult>>();
  constructor(
    private readonly fetcher: Fetcher = (url, init) => fetch(url, init),
    private readonly ttlMs = 12 * 60 * 60 * 1000,
    private readonly timeoutMs = 8000,
    private readonly concurrency = 8,
  ) {}

  private async request(url: string, method: 'HEAD' | 'GET'): Promise<number> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetcher(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FreeMoney-AI link check)' },
      });
      return res.status;
    } finally {
      clearTimeout(timer);
    }
  }

  public async check(url: string): Promise<LinkResult> {
    const hit = this.cache.get(url);
    if (hit && hit.expires > Date.now()) return hit.result;
    const pending = this.inflight.get(url);
    if (pending) return pending;
    const p = this.doCheck(url).finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }

  private async doCheck(url: string): Promise<LinkResult> {
    let result: LinkResult;
    try {
      let status = await this.request(url, 'HEAD');
      if (status === 405 || status === 403 || status === 404 || status >= 500) {
        status = await this.request(url, 'GET');
      }
      let state: LinkState = status === 404 || status === 410 ? 'DEAD'
        : status >= 200 && status < 400 ? 'OK' : 'UNVERIFIED';
      if (state === 'DEAD') {
        // Some government firewalls answer every request from cloud servers with 404, even the
        // home page. Only call a page dead when the rest of the site responds normally.
        try {
          const root = new URL('/', url).toString();
          const rootStatus = root === url ? status : await this.request(root, 'GET');
          if (!(rootStatus >= 200 && rootStatus < 400)) state = 'UNVERIFIED';
        } catch {
          state = 'UNVERIFIED';
        }
      }
      result = { state, status, checkedAt: new Date().toISOString() };
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      // DNS failure means the site is gone; timeouts/resets are treated as unverified.
      const state: LinkState = /ENOTFOUND|EAI_AGAIN_PERMANENT/.test(code) ? 'DEAD' : 'UNVERIFIED';
      result = { state, status: null, checkedAt: new Date().toISOString() };
    }
    this.cache.set(url, { result, expires: Date.now() + (result.state === 'UNVERIFIED' ? this.ttlMs / 6 : this.ttlMs) });
    return result;
  }

  public async checkAll(urls: string[]): Promise<Map<string, LinkResult>> {
    const unique = [...new Set(urls.filter(Boolean))];
    const out = new Map<string, LinkResult>();
    // Small worker pool: hundreds of parallel requests make a small server time out and
    // wrongly mark healthy links as unverified.
    let next = 0;
    const worker = async () => {
      while (next < unique.length) {
        const u = unique[next++];
        out.set(u, await this.check(u));
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, unique.length) }, worker));
    return out;
  }
}

export const linkChecker = new LinkChecker();
