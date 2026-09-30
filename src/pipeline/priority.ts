/**
 * Source-priority rules, per field. The first provider in a list that has a
 * non-empty value wins; values from the others are kept as provenance
 * "alternatives". Manual data (seeds/overrides) is applied later and always
 * wins over every provider.
 */
import type { Confidence, SourceType } from "../schema/common.ts";

type P = "steam" | "igdb" | "wikidata";

export const GAME_FIELD_PRIORITY: Record<string, P[]> = {
  title: ["steam", "igdb", "wikidata"],
  type: ["steam", "igdb", "wikidata"],
  releaseDate: ["steam", "igdb", "wikidata"],
  releaseStatus: ["steam", "igdb", "wikidata"],
  developers: ["steam", "wikidata", "igdb"],
  publishers: ["steam", "wikidata", "igdb"],
  description: ["steam"],
  website: ["steam", "wikidata", "igdb"],
  franchise: ["igdb", "wikidata"],
  series: ["igdb", "wikidata"],
  features: ["steam"],
  supportedLanguages: ["steam"],
  media: ["steam"],
  "relations.parentGame": ["steam", "wikidata", "igdb"],
};

/** Fields whose values are unioned across all providers instead of picked. */
export const GAME_UNION_FIELDS = ["platforms", "genres", "tags", "alternateTitles", "technology", "links"] as const;

export const COMPANY_FIELD_PRIORITY: Record<string, P[]> = {
  name: ["wikidata", "igdb"],
  description: ["wikidata"],
  website: ["wikidata", "igdb"],
  socialLinks: ["wikidata"],
  headquarters: ["wikidata"],
  country: ["wikidata"],
  foundedDate: ["wikidata", "igdb"],
  parent: ["wikidata", "igdb"],
};

/** Default confidence for a plain metadata fact reported by a provider. */
export const SOURCE_CONFIDENCE: Record<P, Confidence> = {
  steam: "high",
  wikidata: "medium",
  igdb: "medium",
};

/**
 * Technology claims from structured databases are never treated as verified.
 * Two independent providers agreeing raises a claim from medium to high.
 */
export const TECHNOLOGY_CLAIM_CONFIDENCE: Record<P, Confidence> = {
  steam: "medium",
  wikidata: "medium",
  igdb: "medium",
};

export const OVERRIDE_CONFIDENCE: Partial<Record<SourceType, Confidence>> = {
  official: "verified",
  manual: "high",
  "developer-interview": "high",
  "technical-article": "high",
  "job-posting": "medium",
  community: "low",
  inferred: "inferred",
};

export function rank(order: string[], provider: string): number {
  const i = order.indexOf(provider);
  return i === -1 ? order.length : i;
}
