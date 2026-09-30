import type { DatasetConfig } from "../config.ts";
import type { HttpClient } from "../lib/http.ts";
import type { MediaReference, SourcedText, SourceType } from "../schema/common.ts";
import type { GameType, SteamStatistics, TechnologyRole } from "../schema/entities.ts";
import type { SeedCompany } from "../schema/files.ts";

export type ProviderId = "wikidata" | "steam" | "igdb" | "mock";

/** Cross-provider identifiers for one real-world game or company. */
export interface ExternalIdSet {
  wikidata?: string;
  steam?: string;
  igdb?: string;
}

export interface CompanyRef {
  name: string;
  ids: ExternalIdSet;
}

export interface TechnologyRef {
  name: string;
  role: TechnologyRole | null;
  ids: ExternalIdSet;
}

/** A game as reported by a single provider, before resolution. */
export interface ProviderGameRecord {
  provider: ProviderId;
  sourceType: SourceType;
  ids: ExternalIdSet;
  url: string | null;
  retrievedAt: string;
  title?: string;
  alternateTitles?: string[];
  type?: GameType;
  releaseDate?: string | null;
  releaseStatus?: "released" | "early-access" | "upcoming" | "cancelled" | "unknown";
  developers?: CompanyRef[];
  publishers?: CompanyRef[];
  porting?: CompanyRef[];
  support?: CompanyRef[];
  description?: SourcedText | null;
  genres?: string[];
  tags?: string[];
  features?: string[];
  platforms?: string[];
  supportedLanguages?: string[];
  website?: string | null;
  links?: Record<string, string>;
  media?: {
    header?: MediaReference | null;
    capsule?: MediaReference | null;
    background?: MediaReference | null;
    screenshots?: MediaReference[];
  };
  technology?: TechnologyRef[];
  franchise?: string | null;
  series?: string | null;
  parent?: ExternalIdSet | null;
  dlc?: ExternalIdSet[];
  steamStatistics?: SteamStatistics | null;
}

/** A company as reported by a single provider, before resolution. */
export interface ProviderCompanyRecord {
  provider: ProviderId;
  sourceType: SourceType;
  ids: ExternalIdSet;
  url: string | null;
  retrievedAt: string;
  name?: string;
  aliases?: string[];
  description?: SourcedText | null;
  website?: string | null;
  socialLinks?: Record<string, string>;
  headquarters?: string | null;
  country?: string | null;
  countryName?: string | null;
  foundedDate?: string | null;
  dissolved?: boolean;
  parent?: CompanyRef | null;
  logo?: MediaReference | null;
}

/** A game discovered through a seed company. */
export interface GameHint {
  /** "seed" = explicit hint in companies.yaml; "previous" = already in the generated layer. */
  provider: ProviderId | "seed" | "previous";
  ids: ExternalIdSet;
  title?: string;
  company: string;
  role: "developer" | "publisher";
}

export interface ProviderContext {
  http: HttpClient;
  config: DatasetConfig;
  now: Date;
}

export interface Provider {
  readonly id: ProviderId;
  /** Returns true, or a reason the provider cannot run (e.g. missing credentials). */
  available(): true | string;
  /** Finds games made or published by seed companies. */
  discoverGames?(companies: SeedCompany[]): Promise<GameHint[]>;
  /** Suggests external IDs for seed companies that have none. */
  lookupCompanies?(companies: SeedCompany[]): Promise<Map<string, ExternalIdSet[]>>;
  /** Fetches metadata for games identified by any of the given IDs. */
  fetchGames?(games: ExternalIdSet[]): Promise<ProviderGameRecord[]>;
  /** Fetches metadata for companies identified by any of the given IDs. */
  fetchCompanies?(companies: ExternalIdSet[]): Promise<ProviderCompanyRecord[]>;
}
