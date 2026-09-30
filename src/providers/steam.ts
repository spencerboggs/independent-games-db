/**
 * Steam provider.
 *
 * Endpoints used (all keyless):
 *  - Storefront app details: https://store.steampowered.com/api/appdetails?appids=<id>
 *    Not part of the documented Steamworks Web API. It powers the Steam store and is
 *    widely used, but Valve publishes no contract or rate limit for it. Requests are
 *    spaced 1.5s apart; failures degrade gracefully.
 *  - User reviews summary: IUserReviewsService/GetAppReviews
 *    https://partner.steamgames.com/doc/webapi/IUserReviewsService
 *    (replaces the deprecated store.steampowered.com/appreviews endpoint)
 *  - Current players: ISteamUserStats/GetNumberOfCurrentPlayers
 *    https://partner.steamgames.com/doc/webapi/ISteamUserStats
 *
 * Terms: https://steamcommunity.com/dev/apiterms (100,000 Web API calls/day; data is
 * provided "as is"; do not imply Valve endorsement). See DATA-SOURCES.md.
 */
import { parseStoreDate } from "../lib/dates.ts";
import { normalizeFeature, normalizeGenre } from "../lib/vocab.ts";
import type { MediaReference } from "../schema/common.ts";
import type { GameType, SteamStatistics } from "../schema/entities.ts";
import type { ExternalIdSet, Provider, ProviderContext, ProviderGameRecord } from "./types.ts";

export interface SteamAppDetails {
  type: string;
  name: string;
  steam_appid: number;
  short_description?: string;
  supported_languages?: string;
  header_image?: string;
  capsule_image?: string;
  background_raw?: string;
  website?: string | null;
  developers?: string[];
  publishers?: string[];
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  categories?: { id: number; description: string }[];
  genres?: { id: string; description: string }[];
  screenshots?: { id: number; path_full: string }[];
  release_date?: { coming_soon: boolean; date: string };
  dlc?: number[];
  fullgame?: { appid: string | number; name: string };
}

export interface SteamReviewSummary {
  review_score?: number;
  review_score_desc?: string;
  total_positive?: number;
  total_negative?: number;
  total_reviews?: number;
}

const TYPE_MAP: Record<string, GameType> = { game: "game", dlc: "dlc", demo: "demo" };
const EARLY_ACCESS_GENRE_ID = "70";

export function decodeHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSupportedLanguages(input: string | undefined): string[] {
  if (!input) return [];
  const beforeFootnote = input.split(/<br\s*\/?>/i)[0] ?? "";
  return [
    ...new Set(
      decodeHtml(beforeFootnote)
        .split(",")
        .map((l) => l.replace(/\*/g, "").trim())
        .filter(Boolean),
    ),
  ];
}

/** Steam CDN URLs carry cache-busting query strings that change constantly. */
export function stableMediaUrl(url: string): string {
  return url.split("?")[0]!;
}

export function reviewStatistics(
  summary: SteamReviewSummary | null,
  currentPlayers: number | null,
  retrievedAt: string,
): SteamStatistics | null {
  if (!summary || summary.total_reviews === undefined) return null;
  const total = summary.total_reviews;
  const positive = summary.total_positive ?? 0;
  const negative = summary.total_negative ?? 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : null);
  return {
    reviewCount: total,
    positiveCount: positive,
    negativeCount: negative,
    positivePercentage: pct(positive),
    negativePercentage: pct(negative),
    reviewScoreDescription: total > 0 ? (summary.review_score_desc ?? null) : null,
    currentPlayers,
    retrievedAt,
  };
}

export function mapAppDetails(
  app: SteamAppDetails,
  opts: {
    retrievedAt: string;
    storeDescriptions: boolean;
    artwork: boolean;
    statistics: SteamStatistics | null;
  },
): ProviderGameRecord {
  const id = String(app.steam_appid);
  const storeUrl = `https://store.steampowered.com/app/${id}/`;
  const media = (url: string | undefined, type: MediaReference["type"]): MediaReference | null =>
    opts.artwork && url
      ? { url: stableMediaUrl(url), type, source: "steam", retrievedAt: opts.retrievedAt, rights: "reference-only" }
      : null;
  const release = app.release_date;
  const parsed = release?.coming_soon ? null : parseStoreDate(release?.date);
  const upcomingDate = release?.coming_soon ? parseStoreDate(release.date) : null;
  const earlyAccess = app.genres?.some((g) => String(g.id) === EARLY_ACCESS_GENRE_ID) ?? false;
  const platforms = [
    ...(app.platforms?.windows ? ["windows"] : []),
    ...(app.platforms?.mac ? ["macos"] : []),
    ...(app.platforms?.linux ? ["linux"] : []),
  ];
  const short = app.short_description ? decodeHtml(app.short_description) : "";

  return {
    provider: "steam",
    sourceType: "steam",
    ids: { steam: id },
    url: storeUrl,
    retrievedAt: opts.retrievedAt,
    title: app.name.trim(),
    type: TYPE_MAP[app.type] ?? "other",
    releaseDate: parsed?.date ?? upcomingDate?.date ?? null,
    releaseStatus: release?.coming_soon ? "upcoming" : earlyAccess ? "early-access" : parsed ? "released" : "unknown",
    developers: (app.developers ?? []).map((name) => ({ name: name.trim(), ids: {} })).filter((c) => c.name),
    publishers: (app.publishers ?? []).map((name) => ({ name: name.trim(), ids: {} })).filter((c) => c.name),
    description:
      opts.storeDescriptions && short
        ? {
            text: short,
            license: "third-party",
            source: { type: "steam", url: storeUrl, retrievedAt: opts.retrievedAt },
          }
        : null,
    genres: [...new Set((app.genres ?? []).map((g) => normalizeGenre(g.description)))],
    features: [...new Set((app.categories ?? []).map((c) => normalizeFeature(c.description)))],
    platforms,
    supportedLanguages: parseSupportedLanguages(app.supported_languages),
    website: app.website?.trim() || null,
    links: { steam: storeUrl },
    media: {
      header: media(app.header_image, "header"),
      capsule: media(app.capsule_image, "capsule"),
      background: media(app.background_raw, "background"),
      screenshots: opts.artwork
        ? (app.screenshots ?? []).map((s) => media(s.path_full, "screenshot")!).filter(Boolean)
        : [],
    },
    parent: app.fullgame ? { steam: String(app.fullgame.appid) } : null,
    dlc: (app.dlc ?? []).map((d) => ({ steam: String(d) })),
    steamStatistics: opts.statistics,
  };
}

export class SteamProvider implements Provider {
  readonly id = "steam" as const;

  constructor(private readonly ctx: ProviderContext) {}

  available(): true | string {
    return this.ctx.config.providers.steam.enabled ? true : "disabled in dataset.config.json";
  }

  private async appDetails(appId: string): Promise<SteamAppDetails | null> {
    const { countryCode, language } = this.ctx.config.providers.steam;
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${countryCode}&l=${language}`;
    const body = await this.ctx.http.json<Record<string, { success: boolean; data?: SteamAppDetails }>>(url, {
      provider: "steam",
      ttlHours: this.ctx.config.policies.cacheTtlHours.metadata,
      minIntervalMs: 1500,
      allowStatus: [403, 404],
    });
    const entry = body?.[appId];
    return entry?.success && entry.data ? entry.data : null;
  }

  private async reviews(appId: string): Promise<SteamReviewSummary | null> {
    const input = JSON.stringify({
      appid: Number(appId),
      num_per_page: 1,
      languages: ["all"],
      review_type: 0,
      purchase_type: 1,
      filter: 1,
    });
    const url = `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=${encodeURIComponent(input)}`;
    const body = await this.ctx.http.json<{ response?: { query_summary?: SteamReviewSummary } }>(url, {
      provider: "steam",
      ttlHours: this.ctx.config.policies.cacheTtlHours.statistics,
      minIntervalMs: 1000,
      allowStatus: [400, 403, 404],
    });
    return body?.response?.query_summary ?? null;
  }

  private async currentPlayers(appId: string): Promise<number | null> {
    const url = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`;
    const body = await this.ctx.http.json<{ response?: { player_count?: number; result?: number } }>(url, {
      provider: "steam",
      ttlHours: this.ctx.config.policies.cacheTtlHours.statistics,
      minIntervalMs: 1000,
      allowStatus: [400, 404],
    });
    return body?.response?.result === 1 ? (body.response.player_count ?? null) : null;
  }

  async fetchGames(games: ExternalIdSet[]): Promise<ProviderGameRecord[]> {
    const appIds = [...new Set(games.map((g) => g.steam).filter(Boolean))] as string[];
    const records: ProviderGameRecord[] = [];
    const { policies } = this.ctx.config;
    for (const appId of appIds.sort((a, b) => Number(a) - Number(b))) {
      const app = await this.appDetails(appId);
      if (!app) continue;
      const retrievedAt = this.ctx.now.toISOString().slice(0, 10);
      const released = !app.release_date?.coming_soon;
      const summary = released ? await this.reviews(appId) : null;
      const players = released ? await this.currentPlayers(appId) : null;
      records.push(
        mapAppDetails(app, {
          retrievedAt,
          storeDescriptions: policies.thirdPartyDescriptions === "store-short",
          artwork: policies.artwork === "reference-only",
          statistics: reviewStatistics(summary, players, retrievedAt),
        }),
      );
    }
    return records;
  }
}
