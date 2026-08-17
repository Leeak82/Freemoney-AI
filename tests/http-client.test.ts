import { describe, expect, it, vi } from 'vitest';
import {
  ResilientHttpClient,
  SourceHttpError,
} from '../src/sources/http-client.js';

describe('Resilient source HTTP client', () => {
  it('honors rate-limit retry-after and succeeds on retry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '1' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
    const sleepImpl = vi.fn(async () => undefined);
    const client = new ResilientHttpClient({
      timeoutMs: 1000,
      maxRetries: 2,
      retryBaseMs: 10,
      fetchImpl: fetchImpl as typeof fetch,
      sleepImpl,
    });

    await expect(client.requestJson('https://example.gov/data')).resolves.toEqual({
      ok: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(1000);
  });

  it('retries timeouts and returns a classified terminal error', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    const client = new ResilientHttpClient({
      timeoutMs: 5,
      maxRetries: 1,
      retryBaseMs: 1,
      fetchImpl: fetchImpl as typeof fetch,
      sleepImpl: async () => undefined,
    });

    try {
      await client.requestJson('https://example.gov/slow');
      throw new Error('Expected timeout');
    } catch (error) {
      expect(error).toBeInstanceOf(SourceHttpError);
      expect((error as SourceHttpError).code).toBe('TIMEOUT');
      expect((error as SourceHttpError).attempts).toBe(2);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not silently accept invalid JSON', async () => {
    const client = new ResilientHttpClient({
      timeoutMs: 1000,
      maxRetries: 3,
      retryBaseMs: 1,
      fetchImpl: vi.fn(async () => new Response('<html>not json</html>')) as typeof fetch,
    });

    await expect(client.requestJson('https://example.gov/schema')).rejects.toMatchObject({
      code: 'INVALID_JSON',
      retryable: false,
    });
  });
});
