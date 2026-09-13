import { JsonClient, JsonOptions, ProviderError } from './contracts';
import { rateLimitEvidence, retryDeadline } from './rate-limit';

interface Entry { expires: number; value: unknown; bytes: number }
export interface HttpClientOptions {
  allowedOrigins: string[];
  fetcher?: typeof fetch;
  now?: () => number;
  maxEntries?: number;
  maxCacheBytes?: number;
  concurrency?: number;
}
/** Per-process bounded cache and request coalescing. Rejections are never cached as successful data. */
export function createHttpClient(config: HttpClientOptions): JsonClient {
  // Resolve the runtime fetch inside the request and retain its global receiver.
  const fetcher = config.fetcher ?? ((input, init) => globalThis.fetch(input, init)), now = config.now ?? Date.now;
  const origins = new Set(config.allowedOrigins.map(value => {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('Invalid configured provider origin');
    return u.origin;
  }));
  const maxEntries = Math.max(1, config.maxEntries ?? 256), maxCacheBytes = Math.max(1, config.maxCacheBytes ?? 24 * 1024 * 1024);
  const concurrency = Math.max(1, Math.min(16, config.concurrency ?? 6));
  const cache = new Map<string, Entry>(), pending = new Map<string, Promise<unknown>>(), cooldown = new Map<string, number>();
  const strikes = new Map<string, number>();
  const queue: (() => void)[] = [];
  let bytes = 0, active = 0;
  function remove(key: string) { const entry = cache.get(key); if (entry) { bytes -= entry.bytes; cache.delete(key); } }
  async function acquire() {
    if (active < concurrency) { active++; return; }
    if (queue.length >= 48) throw new ProviderError('rate-limited', 'Provider request capacity reached. Please try again shortly.');
    await new Promise<void>(resolve => queue.push(resolve));
  }
  function release() { const next = queue.shift(); if (next) next(); else active--; }
  async function read(url: URL, options: JsonOptions, key: string): Promise<unknown> {
    await acquire();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(100, Math.min(25000, options.timeoutMs ?? 12000)));
    try {
      if ((cooldown.get(url.origin) ?? 0) > now()) throw new ProviderError('rate-limited', 'The data provider is temporarily rate limiting requests.', cooldown.get(url.origin));
      const response = await fetcher(url, {
        method: options.method ?? 'GET', body: options.body, signal: controller.signal,
        // Some edge runtimes support only follow/manual. Never follow a redirect.
        redirect: 'manual', headers: { Accept: 'application/json, application/geo+json', 'User-Agent': 'StormRoute/0.1 (weather-aware route research MVP)', ...options.headers },
      });
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const evidence = await rateLimitEvidence(response);
        const failures = Math.min(7, (strikes.get(url.origin) ?? 0) + 1); strikes.set(url.origin, failures);
        const retryAt = Math.max(cooldown.get(url.origin) ?? 0, retryDeadline(retry, evidence.reason, now(), failures));
        cooldown.set(url.origin, retryAt);
        console.warn('Provider rate-limit response', {origin:url.origin,status:429,reason:evidence.reason,format:evidence.format,
          retryAfter:retry && /^(?:\d+|[\w, :+-]+)$/.test(retry) ? retry.slice(0,80) : null,retryAt:new Date(retryAt).toISOString()});
        throw new ProviderError('rate-limited', 'The data provider is temporarily rate limiting requests.', retryAt);
      }
      if (!response.ok) { await response.body?.cancel(); throw new ProviderError('unavailable', `The data provider returned HTTP ${response.status}.`); }
      if ((cooldown.get(url.origin) ?? 0) <= now()) { strikes.delete(url.origin); cooldown.delete(url.origin); }
      const maxBytes = Math.max(1, Math.min(12 * 1024 * 1024, options.maxBytes ?? 4 * 1024 * 1024));
      const advertised = Number(response.headers.get('content-length'));
      if (Number.isFinite(advertised) && advertised > maxBytes) { await response.body?.cancel(); throw new ProviderError('invalid-response', 'The provider response exceeded the size limit.'); }
      if (!response.body) throw new ProviderError('invalid-response', 'The provider returned no data.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let body = '', size = 0;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new ProviderError('invalid-response', 'The provider response exceeded the size limit.'); }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      let value: unknown;
      try { value = JSON.parse(body); } catch { throw new ProviderError('invalid-response', 'The data provider returned invalid JSON.'); }
      if (options.ttlMs > 0 && size <= maxCacheBytes) {
        for (const [oldKey, entry] of cache) if (entry.expires <= now()) remove(oldKey);
        remove(key);
        while (cache.size >= maxEntries || bytes + size > maxCacheBytes) remove(cache.keys().next().value!);
        cache.set(key, { expires: now() + Math.min(options.ttlMs, 7 * 86400000), value, bytes: size }); bytes += size;
      }
      return value;
    } catch (error) {
      if (error instanceof ProviderError) {
        console.warn('Provider request failed', {origin:url.origin, code:error.code, detail:error.message});
        throw error;
      }
      // Infrastructure diagnostics omit request paths, coordinates and response data.
      console.error('Provider transport failure', {origin:url.origin, error:error instanceof Error ? error.name : 'UnknownError',
        detail:error instanceof Error ? error.message.replace(/https?:\/\/[^\s]+/gi,'[provider-url]').slice(0,240) : 'Unknown transport error'});
      throw new ProviderError('unavailable', controller.signal.aborted ? 'The data provider timed out.' : 'The data provider could not be reached.');
    } finally { clearTimeout(timeout); release(); }
  }
  return { async json(address, options) {
    let url: URL;
    try { url = new URL(address); } catch { throw new ProviderError('invalid-response', 'Invalid provider address.'); }
    // Includes port and protocol; redirects cannot escape this list. No user-supplied proxy endpoints.
    if (!origins.has(url.origin) || url.username || url.password || url.hash) throw new ProviderError('invalid-response', 'Provider address is not allowed.');
    if (address.length > 24000 || (options.body?.length ?? 0) > 64000) throw new ProviderError('invalid-response', 'Provider request is too large.');
    const key = JSON.stringify([options.method ?? 'GET', url.href, options.body ?? '', options.headers ?? {}]);
    const entry = cache.get(key);
    if (entry && entry.expires > now()) { cache.delete(key); cache.set(key, entry); return structuredClone(entry.value); }
    if (entry) remove(key);
    let request = pending.get(key);
    if (!request) {
      request = read(url, options, key); pending.set(key, request);
      // Both branches clean up; avoid a rejected, unobserved finally() promise.
      request.then(() => pending.delete(key), () => pending.delete(key));
    }
    return structuredClone(await request);
  } };
}
