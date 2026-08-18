export type SourceHttpErrorCode =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'RATE_LIMITED'
  | 'INVALID_JSON'
  | 'NETWORK_ERROR';

export class SourceHttpError extends Error {
  constructor(
    message: string,
    public readonly code: SourceHttpErrorCode,
    public readonly status: number | null,
    public readonly retryable: boolean,
    public readonly attempts: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'SourceHttpError';
  }
}

export interface ResilientHttpClientOptions {
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  maxRetryDelayMs?: number;
  minRequestIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
  nowImpl?: () => number;
}

export class ResilientHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (milliseconds: number) => Promise<void>;
  private readonly nowImpl: () => number;
  private lastRequestAt = 0;

  constructor(private readonly options: ResilientHttpClientOptions) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.sleepImpl =
      options.sleepImpl ||
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.nowImpl = options.nowImpl || Date.now;
  }

  public async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    let lastError: SourceHttpError | null = null;
    const totalAttempts = this.options.maxRetries + 1;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      await this.respectMinimumInterval();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('request-timeout'), this.options.timeoutMs);
      const onExternalAbort = () => controller.abort('external-abort');
      init.signal?.addEventListener('abort', onExternalAbort, { once: true });

      try {
        this.lastRequestAt = this.nowImpl();
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        const bodyText = await response.text();

        if (!response.ok) {
          const retryable =
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          const code: SourceHttpErrorCode =
            response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
          const error = new SourceHttpError(
            `Source request failed with HTTP ${response.status} ${response.statusText}`,
            code,
            response.status,
            retryable,
            attempt,
            bodyText.slice(0, 2000)
          );
          if (retryable && attempt < totalAttempts) {
            await this.sleepImpl(this.retryDelay(attempt, response.headers.get('retry-after')));
            lastError = error;
            continue;
          }
          throw error;
        }

        try {
          return JSON.parse(bodyText) as T;
        } catch {
          throw new SourceHttpError(
            'Source returned invalid JSON',
            'INVALID_JSON',
            response.status,
            false,
            attempt,
            bodyText.slice(0, 2000)
          );
        }
      } catch (error: unknown) {
        if (error instanceof SourceHttpError) throw error;
        const timedOut = controller.signal.aborted && controller.signal.reason === 'request-timeout';
        const sourceError = new SourceHttpError(
          timedOut
            ? `Source request timed out after ${this.options.timeoutMs}ms`
            : `Source network request failed: ${error instanceof Error ? error.message : String(error)}`,
          timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
          null,
          true,
          attempt
        );
        if (attempt < totalAttempts) {
          await this.sleepImpl(this.retryDelay(attempt));
          lastError = sourceError;
          continue;
        }
        throw sourceError;
      } finally {
        clearTimeout(timeout);
        init.signal?.removeEventListener('abort', onExternalAbort);
      }
    }

    throw (
      lastError ||
      new SourceHttpError('Source request failed', 'NETWORK_ERROR', null, false, totalAttempts)
    );
  }

  private async respectMinimumInterval(): Promise<void> {
    const minimum = this.options.minRequestIntervalMs || 0;
    if (minimum <= 0 || this.lastRequestAt === 0) return;
    const elapsed = this.nowImpl() - this.lastRequestAt;
    if (elapsed < minimum) await this.sleepImpl(minimum - elapsed);
  }

  private retryDelay(attempt: number, retryAfter: string | null = null): number {
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) return Math.max(0, date - this.nowImpl());
    }
    const exponential = this.options.retryBaseMs * 2 ** (attempt - 1);
    return Math.min(exponential, this.options.maxRetryDelayMs || 30_000);
  }
}
