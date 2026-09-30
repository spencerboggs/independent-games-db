import { z } from "zod";
import {
  Confidence,
  Description,
  EntityId,
  EntityType,
  ExternalIds,
  Links,
  MediaReference,
  PartialDate,
  Provenance,
  Source,
  Timestamp,
  Url,
} from "./common.ts";

// ---------------------------------------------------------------------------
// Technology claims (game -> technology)
// ---------------------------------------------------------------------------

export const TechnologyRole = z.enum(["engines", "middleware", "languages", "tools"]);
export type TechnologyRole = z.infer<typeof TechnologyRole>;

export const TechnologyClaim = z.object({
  id: EntityId.describe("Technology ID (see technologies.json)."),
  confidence: Confidence,
  source: Source,
});
export type TechnologyClaim = z.infer<typeof TechnologyClaim>;

export const GameTechnology = z.object({
  engines: z.array(TechnologyClaim),
  middleware: z.array(TechnologyClaim),
  languages: z.array(TechnologyClaim),
  tools: z.array(TechnologyClaim),
});
export type GameTechnology = z.infer<typeof GameTechnology>;

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export const SteamStatistics = z.object({
  reviewCount: z.number().int().nonnegative(),
  positiveCount: z.number().int().nonnegative(),
  negativeCount: z.number().int().nonnegative(),
  positivePercentage: z.number().min(0).max(100).nullable(),
  negativePercentage: z.number().min(0).max(100).nullable(),
  reviewScoreDescription: z.string().nullable(),
  currentPlayers: z.number().int().nonnegative().nullable(),
  retrievedAt: Timestamp,
});
export type SteamStatistics = z.infer<typeof SteamStatistics>;

export const ReviewVelocity = z.object({
  method: z
    .enum(["history", "lifetime-average"])
    .describe("history = measured between stored observations; lifetime-average = total reviews / days since release."),
  reviewsPerDay: z.number().nonnegative(),
  reviewsPerMonth: z.number().nonnegative(),
  windowDays: z.number().nonnegative(),
  recentReviewGrowth: z
    .object({
      reviews: z.number().int(),
      percent: z.number().nullable(),
      windowDays: z.number().nonnegative(),
    })
    .nullable(),
  observations: z.number().int().nonnegative(),
});
export type ReviewVelocity = z.infer<typeof ReviewVelocity>;

export const GameStatistics = z.object({
  steam: SteamStatistics.nullable(),
  reviewVelocity: ReviewVelocity.nullable(),
});
export type GameStatistics = z.infer<typeof GameStatistics>;

export const GameRef = z.object({ id: EntityId, title: z.string(), value: z.number() });

export const CompanyStatistics = z.object({
  gameCount: z.number().int().nonnegative(),
  developedCount: z.number().int().nonnegative(),
  publishedCount: z.number().int().nonnegative(),
  totalSteamReviews: z.number().int().nonnegative(),
  averagePositivePercentage: z.number().nullable(),
  weightedPositivePercentage: z.number().nullable(),
  mostReviewedGame: EntityId.nullable(),
  mostRecentRelease: EntityId.nullable(),
  firstRelease: EntityId.nullable(),
  technologyCount: z.number().int().nonnegative(),
  engineCount: z.number().int().nonnegative(),
  engines: z.array(EntityId),
});
export type CompanyStatistics = z.infer<typeof CompanyStatistics>;

export const TechnologyStatistics = z.object({
  gameCount: z.number().int().nonnegative(),
  companyCount: z.number().int().nonnegative(),
  totalSteamReviews: z.number().int().nonnegative(),
  mostReviewedGames: z.array(GameRef),
  mostPlayedGames: z.array(GameRef),
  gamesByReleaseYear: z.record(z.string(), z.number().int()),
});
export type TechnologyStatistics = z.infer<typeof TechnologyStatistics>;

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export const CompanyRole = z.enum([
  "developer",
  "publisher",
  "studio",
  "porting",
  "support",
  "holding",
  "investor",
]);
export type CompanyRole = z.infer<typeof CompanyRole>;

export const ClassificationCategory = z.enum([
  "independent",
  "independent-large",
  "independent-publisher",
  "acquired-independent",
  "subsidiary",
  "AAA-adjacent",
  "other",
  "excluded",
  "unclassified",
]);
export type ClassificationCategory = z.infer<typeof ClassificationCategory>;

export const Classification = z
  .object({
    include: z
      .boolean()
      .describe("true = part of the curated set. false = present only because an included game references it."),
    category: ClassificationCategory,
    notes: z.string(),
  })
  .describe("Editorial classification. Always manually controlled.");
export type Classification = z.infer<typeof Classification>;

export const Ownership = z.object({
  status: z.enum(["independent", "subsidiary", "acquired", "public", "defunct", "unknown"]),
  parentCompany: EntityId.nullable().describe("Parent company ID when the parent exists in this database."),
  parentCompanyName: z.string().nullable().describe("Parent company name (always set when a parent is known)."),
  notes: z.string().nullable(),
});
export type Ownership = z.infer<typeof Ownership>;

export const Location = z.object({
  headquarters: z.string().nullable(),
  country: z.string().regex(/^[A-Z]{2}$/).nullable().describe("ISO 3166-1 alpha-2 country code."),
  countryName: z.string().nullable(),
});
export type Location = z.infer<typeof Location>;

export const Company = z.object({
  id: EntityId,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  roles: z.array(CompanyRole),
  description: Description,
  website: Url.nullable(),
  socialLinks: Links,
  location: Location,
  founded: z.number().int().min(1800).max(2100).nullable().describe("Founding year."),
  foundedDate: PartialDate.nullable(),
  ownership: Ownership,
  externalIds: ExternalIds,
  logo: MediaReference.nullable(),
  classification: Classification,
  games: z.object({ developed: z.array(EntityId), published: z.array(EntityId) }),
  statistics: CompanyStatistics,
  sources: z.array(Source),
  provenance: Provenance.optional(),
  lastUpdated: Timestamp,
});
export type Company = z.infer<typeof Company>;

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export const GameType = z.enum([
  "game",
  "dlc",
  "expansion",
  "remaster",
  "remake",
  "port",
  "bundle",
  "demo",
  "other",
]);
export type GameType = z.infer<typeof GameType>;

export const ReleaseStatus = z.enum(["released", "early-access", "upcoming", "cancelled", "unknown"]);

export const NamedRef = z.object({ id: EntityId, name: z.string() });

export const Game = z.object({
  id: EntityId,
  title: z.string().min(1),
  alternateTitles: z.array(z.string()),
  type: GameType,
  releaseDate: PartialDate.nullable(),
  releaseDatePrecision: z.enum(["day", "month", "year"]).nullable(),
  releaseStatus: ReleaseStatus,
  developers: z.array(EntityId).describe("Company IDs."),
  publishers: z.array(EntityId).describe("Company IDs."),
  descriptions: Description,
  genres: z.array(z.string()),
  tags: z.array(z.string()),
  features: z.array(z.string()).describe("Store feature categories, e.g. single-player, co-op."),
  platforms: z.array(z.string()).describe("Platform IDs from the controlled vocabulary."),
  supportedLanguages: z.array(z.string()),
  externalIds: ExternalIds,
  links: Links,
  media: z.object({
    header: MediaReference.nullable(),
    capsule: MediaReference.nullable(),
    background: MediaReference.nullable(),
    screenshots: z.array(MediaReference),
  }),
  technology: GameTechnology,
  franchise: NamedRef.nullable(),
  series: NamedRef.nullable(),
  relations: z.object({
    parentGame: EntityId.nullable().describe("For DLC/expansions: the base game."),
    dlc: z.array(EntityId),
    remasterOf: EntityId.nullable(),
    portOf: EntityId.nullable(),
  }),
  statistics: GameStatistics,
  sources: z.array(Source),
  provenance: Provenance.optional(),
  lastUpdated: Timestamp,
});
export type Game = z.infer<typeof Game>;

// ---------------------------------------------------------------------------
// Person
// ---------------------------------------------------------------------------

export const Affiliation = z.object({
  company: EntityId,
  role: z.string(),
  startYear: z.number().int().nullable(),
  endYear: z.number().int().nullable(),
  source: Source,
});

export const Person = z.object({
  id: EntityId,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  roles: z.array(z.string()),
  affiliations: z.array(Affiliation),
  credits: z.array(z.object({ game: EntityId, role: z.string(), source: Source })),
  externalIds: ExternalIds,
  links: Links,
  sources: z.array(Source),
  lastUpdated: Timestamp,
});
export type Person = z.infer<typeof Person>;

// ---------------------------------------------------------------------------
// Technology (engines, middleware, languages, tools)
// ---------------------------------------------------------------------------

export const TechnologyCategory = z.enum(["engine", "middleware", "language", "tool", "framework", "service", "other"]);
export type TechnologyCategory = z.infer<typeof TechnologyCategory>;

export const Technology = z.object({
  id: EntityId,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  category: TechnologyCategory,
  subcategory: z.string().nullable().describe("e.g. audio, physics, 3d-modeling, networking."),
  developer: z.string().nullable(),
  website: Url.nullable(),
  license: z.enum(["proprietary", "open-source", "source-available", "unknown"]),
  description: Description,
  externalIds: ExternalIds,
  games: z.array(EntityId),
  statistics: TechnologyStatistics,
  sources: z.array(Source),
  lastUpdated: Timestamp,
});
export type Technology = z.infer<typeof Technology>;

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export const RelationshipType = z.enum([
  "developer",
  "publisher",
  "porting",
  "support",
  "uses-engine",
  "uses-middleware",
  "uses-language",
  "uses-tool",
  "subsidiary-of",
  "dlc-of",
  "remaster-of",
  "port-of",
  "affiliated-with",
  "credited-on",
]);
export type RelationshipType = z.infer<typeof RelationshipType>;

export const Relationship = z.object({
  id: z.string().describe("Deterministic: `${from}:${type}:${to}`."),
  from: EntityId,
  fromType: EntityType,
  type: RelationshipType,
  to: EntityId,
  toType: EntityType,
  confidence: Confidence.nullable(),
  sources: z.array(Source),
});
export type Relationship = z.infer<typeof Relationship>;

export const TECH_ROLE_TO_RELATIONSHIP: Record<TechnologyRole, RelationshipType> = {
  engines: "uses-engine",
  middleware: "uses-middleware",
  languages: "uses-language",
  tools: "uses-tool",
};

// ---------------------------------------------------------------------------
// Dataset-level statistics (statistics.json)
// ---------------------------------------------------------------------------

export const RankingEntry = z.object({
  rank: z.number().int().positive(),
  game: EntityId,
  title: z.string(),
  value: z.union([z.number(), z.string()]),
});

export const PublisherStatistics = z.object({
  gamesPublished: z.number().int().nonnegative(),
  totalReviews: z.number().int().nonnegative(),
  mostReviewedGames: z.array(GameRef),
  developersWorkedWith: z.array(EntityId),
  releaseTimeline: z.record(z.string(), z.array(EntityId)),
});
export type PublisherStatistics = z.infer<typeof PublisherStatistics>;

export const DatasetStatistics = z.object({
  totals: z.object({
    games: z.number().int(),
    companies: z.number().int(),
    includedCompanies: z.number().int(),
    technologies: z.number().int(),
    people: z.number().int(),
    gamesWithSteamStatistics: z.number().int(),
    totalSteamReviews: z.number().int(),
  }),
  rankings: z.object({
    mostReviewed: z.array(RankingEntry),
    highestRated: z.array(RankingEntry),
    mostPlayed: z.array(RankingEntry),
    recentlyPopular: z.array(RankingEntry),
    mostRecent: z.array(RankingEntry),
    mostEstablished: z.array(RankingEntry),
  }),
  companies: z.record(EntityId, CompanyStatistics),
  publishers: z.record(EntityId, PublisherStatistics),
  engines: z.record(EntityId, TechnologyStatistics),
  releasesByYear: z.record(z.string(), z.number().int()),
  methodology: z.record(z.string(), z.string()),
});
export type DatasetStatistics = z.infer<typeof DatasetStatistics>;

// ---------------------------------------------------------------------------
// Compact variants
// ---------------------------------------------------------------------------

export const CompactGame = z.object({
  id: EntityId,
  title: z.string(),
  type: GameType,
  releaseDate: PartialDate.nullable(),
  developers: z.array(EntityId),
  publishers: z.array(EntityId),
  platforms: z.array(z.string()),
  genres: z.array(z.string()),
  engines: z.array(EntityId),
  steamAppId: z.string().nullable(),
  reviewCount: z.number().int().nullable(),
  positivePercentage: z.number().nullable(),
});

export const CompactCompany = z.object({
  id: EntityId,
  name: z.string(),
  roles: z.array(CompanyRole),
  country: z.string().nullable(),
  founded: z.number().int().nullable(),
  category: ClassificationCategory,
  include: z.boolean(),
  gameCount: z.number().int(),
});

export const CompactTechnology = z.object({
  id: EntityId,
  name: z.string(),
  category: TechnologyCategory,
  gameCount: z.number().int(),
});

export const CompactPerson = z.object({
  id: EntityId,
  name: z.string(),
  companies: z.array(EntityId),
});

export const CompactRelationship = z.object({ from: EntityId, type: RelationshipType, to: EntityId });

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const FileEntry = z.object({
  path: z.string(),
  bytes: z.number().int(),
  sha256: z.string(),
  records: z.number().int().nullable(),
});

export const Manifest = z.object({
  name: z.string(),
  description: z.string(),
  datasetVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  generatedAt: Timestamp,
  contentHash: z.string().describe("sha256 over all data files; generatedAt only changes when this changes."),
  repository: z.string(),
  license: z.object({ code: z.string(), data: z.string(), notes: z.string() }),
  counts: z.object({
    games: z.number().int(),
    companies: z.number().int(),
    people: z.number().int(),
    engines: z.number().int(),
    technologies: z.number().int(),
    relationships: z.number().int(),
  }),
  files: z.record(z.string(), z.string()).describe("Standard variant files, relative to data/latest/."),
  variants: z.object({
    standard: z.record(z.string(), z.string()),
    full: z.record(z.string(), z.string()),
    compact: z.record(z.string(), z.string()),
  }),
  entities: z.string().describe("Path template for per-entity files."),
  schemas: z.record(z.string(), z.string()),
  checksums: z.array(FileEntry),
  sources: z.array(
    z.object({ id: z.string(), name: z.string(), url: Url, license: z.string(), usage: z.string() }),
  ),
  urls: z.object({ latest: z.string(), pinned: z.string(), releases: z.string() }),
});
export type Manifest = z.infer<typeof Manifest>;
