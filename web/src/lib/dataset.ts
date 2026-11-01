import { readDatasetCache, writeDatasetCache } from "./cache";
import type { Company, Dataset, Game, Manifest, Technology } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");
const DATA_BASE = `${BASE}/data/`;

const RUN_HOUR_UTC = 9;
const RUN_SETTLE_MINUTES = 30;
const PENDING_RETRY_MINUTES = 20;

export type LoadStage = "manifest" | "download";
export type LoadSource = "cache" | "network" | "stale";

export interface LoadResult {
  dataset: Dataset;
  source: LoadSource;
  updated: boolean;
}

function utcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function runStartForDay(now: number): number {
  return utcDay(now) + RUN_HOUR_UTC * 60 * 60 * 1000;
}

function nextRunStart(timestamp: number): number {
  const next = runStartForDay(timestamp);
  return next > timestamp ? next : next + 24 * 60 * 60 * 1000;
}

function latestRunStart(now: number): number {
  const run = runStartForDay(now);
  return run <= now ? run : run - 24 * 60 * 60 * 1000;
}

function cacheExpiresAt(dataset: Dataset, now: number): number {
  const nextCheck = nextRunStart(dataset.checkedAt) + RUN_SETTLE_MINUTES * 60 * 1000;
  const runStarted = latestRunStart(now);
  const generatedAt = Date.parse(dataset.manifest.generatedAt);

  // The scheduled run has started but has not published yet, so look again
  // shortly instead of waiting a full day.
  if (Number.isNaN(generatedAt) || generatedAt < runStarted) {
    return Math.min(nextCheck, dataset.checkedAt + PENDING_RETRY_MINUTES * 60 * 1000);
  }

  return nextCheck;
}

export function nextScheduledRefresh(now = Date.now()): Date {
  return new Date(nextRunStart(now) + RUN_SETTLE_MINUTES * 60 * 1000);
}

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(`${DATA_BASE}${file}`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${file} (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function loadDataset(
  options: { force?: boolean; onStage?: (stage: LoadStage) => void } = {},
): Promise<LoadResult> {
  const now = Date.now();
  const cached = await readDatasetCache();

  if (!options.force && cached && now < cacheExpiresAt(cached, now)) {
    return { dataset: cached, source: "cache", updated: false };
  }

  try {
    options.onStage?.("manifest");
    const manifest = await fetchJson<Manifest>("manifest.json");

    if (cached && cached.manifest.contentHash === manifest.contentHash) {
      const refreshed: Dataset = { ...cached, manifest, checkedAt: Date.now() };
      await writeDatasetCache(refreshed);
      return { dataset: refreshed, source: "cache", updated: false };
    }

    options.onStage?.("download");
    const [games, companies, technologies] = await Promise.all([
      fetchJson<Game[]>("games.json"),
      fetchJson<Company[]>("companies.json"),
      fetchJson<Technology[]>("technologies.json"),
    ]);

    if (!Array.isArray(games) || !Array.isArray(companies) || !Array.isArray(technologies)) {
      throw new Error("The dataset files are not in the expected format.");
    }

    const dataset: Dataset = { manifest, games, companies, technologies, checkedAt: Date.now() };
    await writeDatasetCache(dataset);

    return { dataset, source: "network", updated: true };
  } catch (error) {
    if (cached) {
      return { dataset: cached, source: "stale", updated: false };
    }
    throw error;
  }
}
