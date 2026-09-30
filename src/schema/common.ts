import { z } from "zod";

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const EntityId = z
  .string()
  .regex(ID_PATTERN, "IDs must be lowercase kebab-case (a-z, 0-9, single hyphens)")
  .max(96)
  .describe("Stable internal database identifier. Never derived at read time; never reused.");

export const EntityType = z.enum(["company", "game", "person", "technology"]);
export type EntityType = z.infer<typeof EntityType>;

/** ISO 8601 date with optional precision: YYYY, YYYY-MM, or YYYY-MM-DD. */
export const PartialDate = z
  .string()
  .regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/, "Expected YYYY, YYYY-MM, or YYYY-MM-DD");

export const Timestamp = z.string().describe("ISO 8601 timestamp (UTC)");

export const Url = z.string().regex(/^https?:\/\/\S+$/, "Expected an http(s) URL");

export const SourceType = z.enum([
  "official",
  "steam",
  "igdb",
  "wikidata",
  "developer-interview",
  "job-posting",
  "technical-article",
  "community",
  "inferred",
  "manual",
]);
export type SourceType = z.infer<typeof SourceType>;

export const Confidence = z.enum(["verified", "high", "medium", "low", "inferred"]);
export type Confidence = z.infer<typeof Confidence>;

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  verified: 5,
  high: 4,
  medium: 3,
  low: 2,
  inferred: 1,
};

export const Source = z
  .object({
    type: SourceType,
    url: Url.nullable().optional(),
    retrievedAt: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .describe("Where a fact came from.");
export type Source = z.infer<typeof Source>;

export const FieldProvenance = z.object({
  source: SourceType,
  confidence: Confidence,
  url: Url.nullable().optional(),
  retrievedAt: z.string().nullable().optional(),
  alternatives: z
    .array(z.object({ source: SourceType, value: z.unknown() }))
    .optional()
    .describe("Values other sources reported for this field, when they disagreed."),
});
export type FieldProvenance = z.infer<typeof FieldProvenance>;

export const Provenance = z
  .record(z.string(), FieldProvenance)
  .describe("Per-field provenance, keyed by field path. Full variant only.");
export type Provenance = z.infer<typeof Provenance>;

export const TextLicense = z.enum(["database", "third-party", "cc0"]);

export const SourcedText = z
  .object({
    text: z.string(),
    license: TextLicense.describe(
      "database = written for this database (repository data license); third-party = quoted from the source, rights stay with the source; cc0 = public domain dedication (e.g. Wikidata).",
    ),
    source: Source,
  })
  .describe("Third-party text is never relicensed. Check `license` before reusing.");
export type SourcedText = z.infer<typeof SourcedText>;

export const Description = z.object({
  source: SourcedText.nullable().describe("Text quoted from an external source, with attribution."),
  custom: z.string().nullable().describe("Database-authored text, covered by the repository data license."),
});
export type Description = z.infer<typeof Description>;

export const MediaType = z.enum([
  "logo",
  "header",
  "capsule",
  "background",
  "screenshot",
  "cover",
  "artwork",
  "icon",
]);

export const MediaReference = z
  .object({
    url: Url,
    type: MediaType,
    source: SourceType,
    retrievedAt: z.string().nullable(),
    rights: z
      .enum(["reference-only", "redistributable", "unknown"])
      .describe("reference-only: the file is not copied into this repository; link to it, do not rehost without permission."),
    notes: z.string().nullable().optional(),
  })
  .describe("A pointer to third-party artwork. Assets are never copied into the repository.");
export type MediaReference = z.infer<typeof MediaReference>;

export const ExternalIds = z
  .object({
    wikidata: z.string().regex(/^Q\d+$/).optional(),
    igdb: z.string().optional(),
    steam: z.string().optional(),
  })
  .catchall(z.string())
  .describe("Identifiers of this entity in external databases, keyed by provider.");
export type ExternalIds = z.infer<typeof ExternalIds>;

export const Links = z.record(z.string(), Url).describe("Named URLs, e.g. official, steam, wikidata, igdb.");
