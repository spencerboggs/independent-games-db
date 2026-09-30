/**
 * IGDB provider (optional; requires Twitch application credentials).
 *
 * Docs:   https://api-docs.igdb.com/
 * Auth:   OAuth2 client credentials via https://id.twitch.tv/oauth2/token
 * Limits: 4 requests/second, max 8 open requests; max 500 results per query.
 * Terms:  Free for non-commercial use under the Twitch Developer Services Agreement;
 *         commercial use via partnership with user-facing attribution. Local storage
 *         of retrieved data is explicitly permitted by IGDB's FAQ. See DATA-SOURCES.md.
 *
 * Wikidata's IGDB properties (P5794 game, P9650 company) store IGDB *slugs*, so
 * this provider identifies games and companies by slug.
 */
import { unixToDate } from "../lib/dates.ts";
import { normalizeGenre, normalizePlatform } from "../lib/vocab.ts";
import type { GameType } from "../schema/entities.ts";
import type { SeedCompany } from "../schema/files.ts";
import type {
  CompanyRef,
  ExternalIdSet,
  GameHint,
  Provider,
  ProviderCompanyRecord,
  ProviderContext,
  ProviderGameRecord,
} from "./types.ts";

const API = "https://api.igdb.com/v4";
const STEAM_SOURCE = 1;

export interface IgdbGame {
  id: number;
  slug: string;
  name: string;
  url?: string;
  first_release_date?: number;
  alternative_names?: { name: string }[];
  game_type?: { type: string };
  involved_companies?: {
    company?: { name: string; slug: string };
    developer?: boolean;
    publisher?: boolean;
    porting?: boolean;
    supporting?: boolean;
  }[];
  game_engines?: { name: string; slug: string }[];
  platforms?: { name: string }[];
  genres?: { name: string }[];
  themes?: { name: string }[];
  franchise?: { name: string };
  franchises?: { name: string }[];
  collections?: { name: string }[];
  parent_game?: { slug: string };
  external_games?: { uid?: string; external_game_source?: number }[];
}

const GAME_FIELDS = [
  "name", "slug", "url", "first_release_date", "alternative_names.name", "game_type.type",
  "involved_companies.company.name", "involved_companies.company.slug", "involved_companies.developer",
  "involved_companies.publisher", "involved_companies.porting", "involved_companies.supporting",
  "game_engines.name", "game_engines.slug", "platforms.name", "genres.name", "themes.name",
  "franchise.name", "franchises.name", "collections.name", "parent_game.slug",
  "external_games.uid", "external_games.external_game_source",
].join(",");

const GAME_TYPES: Record<string, GameType> = {
  "main game": "game",
  "dlc addon": "dlc",
  "dlc": "dlc",
  expansion: "expansion",
  "standalone expansion": "expansion",
  remaster: "remaster",
  remake: "remake",
  port: "port",
  bundle: "bundle",
};

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function mapIgdbGame(game: IgdbGame, retrievedAt: string): ProviderGameRecord {
  const companies = (flag: "developer" | "publisher" | "porting" | "supporting"): CompanyRef[] =>
    (game.involved_companies ?? [])
      .filter((c) => c[flag] && c.company)
      .map((c) => ({ name: c.company!.name, ids: { igdb: c.company!.slug } }));
  const steam = game.external_games?.find((e) => e.external_game_source === STEAM_SOURCE && e.uid)?.uid;
  const url = game.url ?? `https://www.igdb.com/games/${game.slug}`;
  return {
    provider: "igdb",
    sourceType: "igdb",
    ids: { igdb: game.slug, ...(steam ? { steam } : {}) },
    url,
    retrievedAt,
    title: game.name,
    alternateTitles: (game.alternative_names ?? []).map((a) => a.name).sort(),
    type: GAME_TYPES[game.game_type?.type.toLowerCase() ?? ""] ?? "game",
    releaseDate: game.first_release_date ? unixToDate(game.first_release_date) : null,
    developers: companies("developer"),
    publishers: companies("publisher"),
    porting: companies("porting"),
    support: companies("supporting"),
    platforms: [...new Set((game.platforms ?? []).map((p) => normalizePlatform(p.name)))],
    genres: [...new Set((game.genres ?? []).map((g) => normalizeGenre(g.name)))],
    tags: [...new Set((game.themes ?? []).map((t) => normalizeGenre(t.name)))],
    technology: (game.game_engines ?? []).map((e) => ({ name: e.name, role: "engines", ids: { igdb: e.slug } })),
    franchise: game.franchise?.name ?? game.franchises?.[0]?.name ?? null,
    series: game.collections?.[0]?.name ?? null,
    parent: game.parent_game ? { igdb: game.parent_game.slug } : null,
    links: { igdb: url },
  };
}

export class IgdbProvider implements Provider {
  readonly id = "igdb" as const;
  private token: string | null = null;

  constructor(
    private readonly ctx: ProviderContext,
    private readonly credentials = {
      clientId: process.env.IGDB_CLIENT_ID ?? "",
      clientSecret: process.env.IGDB_CLIENT_SECRET ?? "",
    },
  ) {}

  available(): true | string {
    const setting = this.ctx.config.providers.igdb.enabled;
    if (setting === false) return "disabled in dataset.config.json";
    if (!this.credentials.clientId || !this.credentials.clientSecret) {
      return "IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set";
    }
    return true;
  }

  private async accessToken(): Promise<string> {
    if (this.token) return this.token;
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      grant_type: "client_credentials",
    });
    const body = await this.ctx.http.json<{ access_token: string }>(`https://id.twitch.tv/oauth2/token?${params}`, {
      provider: "igdb",
      method: "POST",
      ttlHours: 0,
      minIntervalMs: 0,
      noCache: true,
    });
    if (!body?.access_token) throw new Error("IGDB authentication failed");
    this.token = body.access_token;
    return this.token;
  }

  private async query<T>(endpoint: string, body: string): Promise<T[]> {
    const token = await this.accessToken();
    const result = await this.ctx.http.json<T[]>(`${API}/${endpoint}`, {
      provider: "igdb",
      method: "POST",
      headers: {
        "Client-ID": this.credentials.clientId,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body,
      ttlHours: this.ctx.config.policies.cacheTtlHours.metadata,
      minIntervalMs: 300,
    });
    return result ?? [];
  }

  async discoverGames(companies: SeedCompany[]): Promise<GameHint[]> {
    const bySlug = new Map(companies.filter((c) => c.externalIds.igdb).map((c) => [c.externalIds.igdb!, c.id]));
    if (!bySlug.size) return [];
    const rows = await this.query<{
      slug: string;
      developed?: { slug: string; name: string }[];
      published?: { slug: string; name: string }[];
    }>(
      "companies",
      `fields slug,developed.slug,developed.name,published.slug,published.name; where slug = (${[...bySlug.keys()].map(quote).join(",")}); limit 500;`,
    );
    const hints: GameHint[] = [];
    for (const row of rows) {
      const company = bySlug.get(row.slug);
      if (!company) continue;
      for (const g of row.developed ?? []) {
        hints.push({ provider: "igdb", company, role: "developer", ids: { igdb: g.slug }, title: g.name });
      }
      for (const g of row.published ?? []) {
        hints.push({ provider: "igdb", company, role: "publisher", ids: { igdb: g.slug }, title: g.name });
      }
    }
    return hints;
  }

  async fetchGames(games: ExternalIdSet[]): Promise<ProviderGameRecord[]> {
    const slugs = new Set(games.map((g) => g.igdb).filter(Boolean) as string[]);
    const steamOnly = games.filter((g) => !g.igdb && g.steam).map((g) => g.steam!);
    for (let i = 0; i < steamOnly.length; i += 400) {
      const batch = steamOnly.slice(i, i + 400);
      const rows = await this.query<{ game?: { slug: string } }>(
        "external_games",
        `fields game.slug; where external_game_source = ${STEAM_SOURCE} & uid = (${batch.map(quote).join(",")}); limit 500;`,
      );
      for (const row of rows) if (row.game?.slug) slugs.add(row.game.slug);
    }
    const retrievedAt = this.ctx.now.toISOString().slice(0, 10);
    const records: ProviderGameRecord[] = [];
    const all = [...slugs].sort();
    for (let i = 0; i < all.length; i += 400) {
      const batch = all.slice(i, i + 400);
      const rows = await this.query<IgdbGame>(
        "games",
        `fields ${GAME_FIELDS}; where slug = (${batch.map(quote).join(",")}); limit 500;`,
      );
      for (const row of rows) records.push(mapIgdbGame(row, retrievedAt));
    }
    return records;
  }

  async fetchCompanies(companies: ExternalIdSet[]): Promise<ProviderCompanyRecord[]> {
    const slugs = [...new Set(companies.map((c) => c.igdb).filter(Boolean) as string[])].sort();
    const retrievedAt = this.ctx.now.toISOString().slice(0, 10);
    const records: ProviderCompanyRecord[] = [];
    for (let i = 0; i < slugs.length; i += 400) {
      const batch = slugs.slice(i, i + 400);
      const rows = await this.query<{
        slug: string;
        name: string;
        url?: string;
        start_date?: number;
        parent?: { name: string; slug: string };
        websites?: { url: string }[];
      }>(
        "companies",
        `fields slug,name,url,start_date,parent.name,parent.slug,websites.url; where slug = (${batch.map(quote).join(",")}); limit 500;`,
      );
      for (const row of rows) {
        const url = row.url ?? `https://www.igdb.com/companies/${row.slug}`;
        records.push({
          provider: "igdb",
          sourceType: "igdb",
          ids: { igdb: row.slug },
          url,
          retrievedAt,
          name: row.name,
          foundedDate: row.start_date ? unixToDate(row.start_date).slice(0, 4) : null,
          parent: row.parent ? { name: row.parent.name, ids: { igdb: row.parent.slug } } : null,
        });
      }
    }
    return records;
  }
}
