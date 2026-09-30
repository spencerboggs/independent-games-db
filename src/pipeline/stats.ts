/**
 * Statistics. Only raw, reliably obtainable numbers are stored; every derived
 * number here has its formula documented in docs/STATISTICS.md and in
 * statistics.json -> methodology.
 */
import type { DatasetConfig } from "../config.ts";
import { compareDates, daysSince, todayIso, yearOf } from "../lib/dates.ts";
import { log } from "../lib/log.ts";
import type {
  Company,
  CompanyStatistics,
  DatasetStatistics,
  Game,
  PublisherStatistics,
  ReviewVelocity,
  Technology,
  TechnologyStatistics,
} from "../schema/entities.ts";
import type { StatisticsHistory } from "../schema/files.ts";
import { loadGenerated, loadHistory, writeGenerated, writeHistory, type Workspace } from "./state.ts";

type HistoryPoint = [string, number, number];

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Keeps daily points for ~13 months, then one point per month. */
export function thinHistory(points: HistoryPoint[], today: string): HistoryPoint[] {
  const cutoff = dayNumber(today) - 400;
  const seenMonths = new Set<string>();
  return points.filter(([date]) => {
    if (dayNumber(date) >= cutoff) return true;
    const month = date.slice(0, 7);
    if (seenMonths.has(month)) return false;
    seenMonths.add(month);
    return true;
  });
}

export function recordObservation(history: StatisticsHistory, appId: string, date: string, total: number, positive: number): void {
  const points = (history.steamReviews[appId] ?? []) as HistoryPoint[];
  const last = points[points.length - 1];
  if (last && last[0] === date) points[points.length - 1] = [date, total, positive];
  else if (!last || last[0] < date) points.push([date, total, positive]);
  history.steamReviews[appId] = thinHistory(points, date);
}

export const MIN_HISTORY_SPAN_DAYS = 7;

export function computeVelocity(
  points: HistoryPoint[],
  releaseDate: string | null,
  reviewCount: number | null,
  now: Date,
  windowDays: number,
): ReviewVelocity | null {
  if (points.length >= 2) {
    const latest = points[points.length - 1]!;
    const windowStart = dayNumber(latest[0]) - windowDays;
    const base = [...points].reverse().find((p) => dayNumber(p[0]) <= windowStart) ?? points[0]!;
    const span = dayNumber(latest[0]) - dayNumber(base[0]);
    if (span >= MIN_HISTORY_SPAN_DAYS) {
      const delta = latest[1] - base[1];
      const perDay = Math.max(0, delta) / span;
      return {
        method: "history",
        reviewsPerDay: round(perDay),
        reviewsPerMonth: round(perDay * 30.44, 1),
        windowDays: Math.round(span),
        recentReviewGrowth: {
          reviews: delta,
          percent: base[1] > 0 ? round((delta / base[1]) * 100) : null,
          windowDays: Math.round(span),
        },
        observations: points.length,
      };
    }
  }
  if (reviewCount && releaseDate && releaseDate.length >= 7) {
    const days = Math.max(1, daysSince(releaseDate, now));
    const perDay = reviewCount / days;
    return {
      method: "lifetime-average",
      reviewsPerDay: round(perDay),
      reviewsPerMonth: round(perDay * 30.44, 1),
      windowDays: Math.round(days),
      recentReviewGrowth: null,
      observations: points.length,
    };
  }
  return null;
}

/** Stage: record today's review counts and compute per-game review velocity. */
export function updateStatistics(ws: Workspace): { observed: number } {
  const state = loadGenerated(ws.paths);
  const history = loadHistory(ws.paths);
  const today = todayIso(ws.now);
  let observed = 0;
  for (const game of state.games) {
    const steam = game.statistics.steam;
    const appId = game.externalIds.steam;
    if (steam && appId) {
      recordObservation(history, appId, steam.retrievedAt.slice(0, 10), steam.reviewCount, steam.positiveCount);
      observed++;
    }
    const points = (appId ? history.steamReviews[appId] ?? [] : []) as HistoryPoint[];
    game.statistics.reviewVelocity = computeVelocity(
      points,
      game.releaseDate,
      steam?.reviewCount ?? null,
      ws.now,
      ws.config.statistics.recentWindowDays,
    );
  }
  writeGenerated(ws.paths, state);
  writeHistory(ws.paths, history);
  log.info(`  recorded ${observed} review observations`);
  return { observed };
}

// ---------------------------------------------------------------------------
// Aggregates (computed at build time from the final, curated data)
// ---------------------------------------------------------------------------

const reviews = (g: Game) => g.statistics.steam?.reviewCount ?? 0;
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const RANKED_TYPES = new Set(["game", "remaster", "remake", "port", "expansion"]);
const released = (g: Game) => g.releaseStatus === "released" || g.releaseStatus === "early-access";

function topBy(games: Game[], value: (g: Game) => number | null, limit: number) {
  return games
    .map((g) => ({ g, v: value(g) }))
    .filter((x): x is { g: Game; v: number } => x.v !== null && x.v > 0)
    .sort((a, b) => b.v - a.v || byId(a.g, b.g))
    .slice(0, limit)
    .map(({ g, v }) => ({ id: g.id, title: g.title, value: v }));
}

export function companyStatistics(
  developed: Game[],
  published: Game[],
  technologies: Map<string, Technology>,
  config: DatasetConfig,
): CompanyStatistics {
  const all = [...new Map([...developed, ...published].map((g) => [g.id, g])).values()].sort(byId);
  const rated = all.filter((g) => reviews(g) >= config.statistics.averagePositiveMinReviews && g.statistics.steam?.positivePercentage != null);
  const totalReviews = all.reduce((sum, g) => sum + reviews(g), 0);
  const totalPositive = all.reduce((sum, g) => sum + (g.statistics.steam?.positiveCount ?? 0), 0);
  const techIds = new Set<string>();
  const engineIds = new Set<string>();
  for (const g of all) {
    for (const claims of Object.values(g.technology)) for (const c of claims) techIds.add(c.id);
    for (const c of g.technology.engines) engineIds.add(c.id);
  }
  const releasedGames = all.filter((g) => released(g) && g.releaseDate);
  const byDate = [...releasedGames].sort((a, b) => compareDates(a.releaseDate, b.releaseDate) || byId(a, b));
  return {
    gameCount: all.length,
    developedCount: developed.length,
    publishedCount: published.length,
    totalSteamReviews: totalReviews,
    averagePositivePercentage: rated.length
      ? round(rated.reduce((s, g) => s + g.statistics.steam!.positivePercentage!, 0) / rated.length, 1)
      : null,
    weightedPositivePercentage: totalReviews > 0 ? round((totalPositive / totalReviews) * 100, 1) : null,
    mostReviewedGame: topBy(all, (g) => reviews(g), 1)[0]?.id ?? null,
    mostRecentRelease: byDate[byDate.length - 1]?.id ?? null,
    firstRelease: byDate[0]?.id ?? null,
    technologyCount: [...techIds].filter((t) => technologies.has(t)).length,
    engineCount: engineIds.size,
    engines: [...engineIds].sort(),
  };
}

export function technologyStatistics(games: Game[]): TechnologyStatistics {
  const companies = new Set(games.flatMap((g) => g.developers));
  const byYear: Record<string, number> = {};
  for (const g of games) {
    const year = yearOf(g.releaseDate);
    if (year) byYear[year] = (byYear[year] ?? 0) + 1;
  }
  return {
    gameCount: games.length,
    companyCount: companies.size,
    totalSteamReviews: games.reduce((s, g) => s + reviews(g), 0),
    mostReviewedGames: topBy(games, reviews, 10),
    mostPlayedGames: topBy(games, (g) => g.statistics.steam?.currentPlayers ?? null, 10),
    gamesByReleaseYear: Object.fromEntries(Object.entries(byYear).sort()),
  };
}

export function publisherStatistics(publisherId: string, published: Game[]): PublisherStatistics {
  const timeline: Record<string, string[]> = {};
  for (const g of published) {
    const year = yearOf(g.releaseDate) ?? "unknown";
    (timeline[year] ??= []).push(g.id);
  }
  for (const list of Object.values(timeline)) list.sort();
  return {
    gamesPublished: published.length,
    totalReviews: published.reduce((s, g) => s + reviews(g), 0),
    mostReviewedGames: topBy(published, reviews, 10),
    developersWorkedWith: [...new Set(published.flatMap((g) => g.developers))].filter((d) => d !== publisherId).sort(),
    releaseTimeline: Object.fromEntries(Object.entries(timeline).sort()),
  };
}

export function datasetStatistics(
  games: Game[],
  companies: Company[],
  technologies: Technology[],
  peopleCount: number,
  config: DatasetConfig,
  now: Date,
): DatasetStatistics {
  const s = config.statistics;
  const n = s.rankingSize;
  const ranked = games.filter((g) => RANKED_TYPES.has(g.type));
  const rank = (items: { id: string; title: string; value: number | string }[]) =>
    items.map((x, i) => ({ rank: i + 1, game: x.id, title: x.title, value: x.value }));

  const historyVelocity = ranked.filter((g) => g.statistics.reviewVelocity?.method === "history");
  const recentBasis = historyVelocity.length ? "history" : "lifetime-average";
  const recentPool = historyVelocity.length
    ? historyVelocity
    : ranked.filter((g) => g.releaseDate && daysSince(g.releaseDate, now) <= 365 && released(g));

  const releasedRanked = ranked.filter((g) => released(g) && g.releaseDate);
  const releasesByYear: Record<string, number> = {};
  for (const g of games) {
    const y = yearOf(g.releaseDate);
    if (y && released(g)) releasesByYear[y] = (releasesByYear[y] ?? 0) + 1;
  }

  const gamesById = new Map(games.map((g) => [g.id, g]));
  const techById = new Map(technologies.map((t) => [t.id, t]));
  const companyStats: Record<string, CompanyStatistics> = {};
  const publisherStats: Record<string, PublisherStatistics> = {};
  for (const c of [...companies].sort(byId)) {
    companyStats[c.id] = c.statistics;
    const published = c.games.published.map((id) => gamesById.get(id)!).filter(Boolean);
    if (published.length) publisherStats[c.id] = publisherStatistics(c.id, published);
  }
  const engineStats: Record<string, TechnologyStatistics> = {};
  for (const t of [...technologies].sort(byId)) if (t.category === "engine") engineStats[t.id] = t.statistics;

  return {
    totals: {
      games: games.length,
      companies: companies.length,
      includedCompanies: companies.filter((c) => c.classification.include).length,
      technologies: technologies.length,
      people: peopleCount,
      gamesWithSteamStatistics: games.filter((g) => g.statistics.steam).length,
      totalSteamReviews: games.reduce((sum, g) => sum + reviews(g), 0),
    },
    rankings: {
      mostReviewed: rank(topBy(ranked, reviews, n)),
      highestRated: rank(
        ranked
          .filter((g) => reviews(g) >= s.highestRatedMinReviews && g.statistics.steam?.positivePercentage != null)
          .sort(
            (a, b) =>
              b.statistics.steam!.positivePercentage! - a.statistics.steam!.positivePercentage! ||
              reviews(b) - reviews(a) ||
              byId(a, b),
          )
          .slice(0, n)
          .map((g) => ({ id: g.id, title: g.title, value: g.statistics.steam!.positivePercentage! })),
      ),
      mostPlayed: rank(topBy(ranked, (g) => g.statistics.steam?.currentPlayers ?? null, n)),
      recentlyPopular: rank(topBy(recentPool, (g) => g.statistics.reviewVelocity?.reviewsPerDay ?? null, n)),
      mostRecent: rank(
        [...releasedRanked]
          .sort((a, b) => compareDates(b.releaseDate, a.releaseDate) || byId(a, b))
          .slice(0, n)
          .map((g) => ({ id: g.id, title: g.title, value: g.releaseDate! })),
      ),
      mostEstablished: rank(
        releasedRanked
          .filter((g) => reviews(g) >= s.mostEstablishedMinReviews)
          .sort((a, b) => compareDates(a.releaseDate, b.releaseDate) || byId(a, b))
          .slice(0, n)
          .map((g) => ({ id: g.id, title: g.title, value: g.releaseDate! })),
      ),
    },
    companies: companyStats,
    publishers: publisherStats,
    engines: engineStats,
    releasesByYear: Object.fromEntries(Object.entries(releasesByYear).sort()),
    methodology: {
      scope: "Rankings include games, expansions, remasters, remakes, and ports; DLC, demos, and bundles are excluded.",
      mostReviewed: "Total Steam user reviews (all languages, all purchase types, off-topic review bombs filtered by Steam).",
      highestRated: `Steam positive review percentage; only games with at least ${s.highestRatedMinReviews} reviews. Ties broken by review count.`,
      mostPlayed: "Concurrent players reported by Steam at retrieval time (a single snapshot, not a peak).",
      recentlyPopular:
        recentBasis === "history"
          ? `New Steam reviews per day over the last ~${s.recentWindowDays} days, measured from stored review-count history.`
          : "Not enough review history yet; using lifetime reviews per day for games released in the last 365 days.",
      recentlyPopularBasis: recentBasis,
      mostRecent: "Most recent release date among released games.",
      mostEstablished: `Earliest release date among games with at least ${s.mostEstablishedMinReviews} Steam reviews.`,
      averagePositivePercentage: `Unweighted mean of per-game positive percentages, games with at least ${s.averagePositiveMinReviews} reviews.`,
      weightedPositivePercentage: "Sum of positive reviews / sum of all reviews across the company's games.",
      reviewVelocity: "Review growth is not sales. See docs/STATISTICS.md.",
    },
  };
}
