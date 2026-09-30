import { join } from "node:path";
import { sha256 } from "./hash.ts";
import { exists, readJson, writeJson } from "./io.ts";
import { log } from "./log.ts";

export interface HttpOptions {
  cacheDir: string;
  userAgent: string;
  /** Ignore cached responses (still writes the cache). */
  refresh?: boolean;
  /** Never touch the network; cache misses throw. */
  offline?: boolean;
}

export interface RequestOptions {
  provider: string;
  ttlHours: number;
  /** Minimum spacing between requests to the same host. */
  minIntervalMs: number;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /** Status codes that are returned (as null) instead of throwing. */
  allowStatus?: number[];
  /** Never read or write the on-disk cache (e.g. OAuth tokens). */
  noCache?: boolean;
}

interface CacheEntry {
  url: string;
  fetchedAt: string;
  status: number;
  body: unknown;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpClient {
  private readonly lastRequest = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();
  requests = 0;
  cacheHits = 0;

  constructor(private readonly options: HttpOptions) {}

  async json<T>(url: string, opts: RequestOptions): Promise<T | null> {
    const key = sha256(`${opts.method ?? "GET"} ${url}\n${opts.body ?? ""}`);
    const cacheFile = join(this.options.cacheDir, opts.provider, key.slice(0, 2), `${key}.json`);

    if (!opts.noCache && !this.options.refresh && exists(cacheFile)) {
      const entry = readJson<CacheEntry>(cacheFile);
      const ageHours = (Date.now() - Date.parse(entry.fetchedAt)) / 3_600_000;
      if (ageHours <= opts.ttlHours || this.options.offline) {
        this.cacheHits++;
        return entry.status >= 400 ? null : (entry.body as T);
      }
    }
    if (this.options.offline) throw new Error(`offline mode: no cached response for ${url}`);

    const host = new URL(url).host;
    const previous = this.queues.get(host) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.fetchWithRetry<T>(url, host, opts));
    this.queues.set(host, run);
    const { status, body } = await run;
    if (!opts.noCache) {
      writeJson(cacheFile, { url, fetchedAt: new Date().toISOString(), status, body } satisfies CacheEntry, false);
    }
    return status >= 400 ? null : body;
  }

  private async fetchWithRetry<T>(url: string, host: string, opts: RequestOptions): Promise<{ status: number; body: T }> {
    const maxAttempts = 5;
    for (let attempt = 1; ; attempt++) {
      const wait = (this.lastRequest.get(host) ?? 0) + opts.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequest.set(host, Date.now());
      this.requests++;

      let response: Response;
      try {
        response = await fetch(url, {
          method: opts.method ?? "GET",
          headers: { "User-Agent": this.options.userAgent, Accept: "application/json", ...opts.headers },
          body: opts.body,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        if (attempt >= maxAttempts) throw error;
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      if (response.ok) return { status: response.status, body: (await response.json()) as T };
      if (opts.allowStatus?.includes(response.status)) return { status: response.status, body: null as T };

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= maxAttempts) {
        throw new HttpError(response.status, url, await response.text().catch(() => ""));
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
      log.warn(`${response.status} from ${host}; retrying in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
  }
}
