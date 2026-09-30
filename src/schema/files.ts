import { z } from "zod";
import { Confidence, EntityId, EntityType, ExternalIds, Source, Url } from "./common.ts";
import {
  ClassificationCategory,
  Company,
  CompanyRole,
  Game,
  RelationshipType,
  Technology,
  TechnologyCategory,
  TechnologyRole,
} from "./entities.ts";

// ---------------------------------------------------------------------------
// Seeds (manually maintained discovery lists)
// ---------------------------------------------------------------------------

export const SeedCompany = z
  .object({
    id: EntityId,
    name: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    roles: z.array(CompanyRole).default([]),
    website: Url.nullable().optional(),
    classification: z
      .object({
        include: z.boolean().default(true),
        category: ClassificationCategory,
        notes: z.string().default(""),
      })
      .optional(),
    externalIds: ExternalIds.default({}),
    discover: z.boolean().default(true).describe("Set false to keep the company without running discovery for it."),
    games: z
      .object({
        steam: z.array(z.union([z.string(), z.number()]).transform(String)).default([]),
        wikidata: z.array(z.string().regex(/^Q\d+$/)).default([]),
        igdb: z.array(z.union([z.string(), z.number()]).transform(String)).default([]),
      })
      .partial()
      .optional()
      .describe("Explicit game hints used in addition to automatic discovery."),
    notes: z.string().optional(),
  })
  .strict();
export type SeedCompany = z.infer<typeof SeedCompany>;

export const CompanySeedsFile = z.object({ companies: z.array(SeedCompany).default([]) }).strict();
export type CompanySeedsFile = z.infer<typeof CompanySeedsFile>;

export const SeedTechnology = z
  .object({
    id: EntityId,
    name: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    category: TechnologyCategory,
    subcategory: z.string().nullable().default(null),
    developer: z.string().nullable().default(null),
    website: Url.nullable().default(null),
    license: z.enum(["proprietary", "open-source", "source-available", "unknown"]).default("unknown"),
    externalIds: ExternalIds.default({}),
    description: z.string().nullable().default(null),
  })
  .strict();
export type SeedTechnology = z.infer<typeof SeedTechnology>;

export const TechnologySeedsFile = z.object({ technologies: z.array(SeedTechnology).default([]) }).strict();

// ---------------------------------------------------------------------------
// Overrides (manual data always wins)
// ---------------------------------------------------------------------------

const FieldPatch = z.record(z.string(), z.unknown());
const ArrayPatch = z.record(z.string(), z.array(z.unknown()));

export const OverrideEntry = z
  .object({
    id: EntityId,
    create: z.boolean().optional().describe("Create the entity manually if no provider produced it."),
    exclude: z.boolean().optional().describe("Remove the entity from the public dataset."),
    set: FieldPatch.optional().describe("Deep-merged into the entity. Arrays are replaced."),
    append: ArrayPatch.optional().describe("Values appended (deduplicated) to array fields."),
    remove: ArrayPatch.optional().describe("Values removed from array fields."),
    source: Source.optional(),
    note: z.string().optional(),
  })
  .strict();
export type OverrideEntry = z.infer<typeof OverrideEntry>;

export const CompanyOverridesFile = z.object({ companies: z.array(OverrideEntry).default([]) }).strict();
export const GameOverridesFile = z.object({ games: z.array(OverrideEntry).default([]) }).strict();
export const PeopleOverridesFile = z.object({ people: z.array(OverrideEntry).default([]) }).strict();

export const TechnologyClaimOverride = z
  .object({
    game: EntityId,
    technology: EntityId,
    role: TechnologyRole.optional().describe("Defaults from the technology's category."),
    confidence: Confidence.optional(),
    source: Source.optional(),
    remove: z.boolean().optional().describe("Reject a generated claim."),
    note: z.string().optional(),
  })
  .strict();
export type TechnologyClaimOverride = z.infer<typeof TechnologyClaimOverride>;

export const TechnologyOverridesFile = z
  .object({
    claims: z.array(TechnologyClaimOverride).default([]),
    technologies: z.array(OverrideEntry).default([]),
  })
  .strict();

export const RelationshipOverride = z
  .object({
    from: EntityId,
    type: RelationshipType,
    to: EntityId,
    remove: z.boolean().optional(),
    confidence: Confidence.optional(),
    source: Source.optional(),
    note: z.string().optional(),
  })
  .strict();
export type RelationshipOverride = z.infer<typeof RelationshipOverride>;

export const RelationshipOverridesFile = z
  .object({ relationships: z.array(RelationshipOverride).default([]) })
  .strict();

// ---------------------------------------------------------------------------
// Manual entity-resolution mappings
// ---------------------------------------------------------------------------

export const MappingsFile = z
  .object({
    names: z.record(z.string(), EntityId).default({}).describe("Provider-reported name -> canonical ID."),
    externalIds: z
      .record(z.string(), z.record(z.string(), EntityId))
      .default({})
      .describe("provider -> external ID -> canonical ID."),
    distinct: z
      .array(z.tuple([EntityId, EntityId]))
      .default([])
      .describe("Pairs confirmed to be different entities (suppresses duplicate warnings)."),
  })
  .strict();
export type MappingsFile = z.infer<typeof MappingsFile>;

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export const ReviewCategory = z.enum([
  "new-company",
  "new-game",
  "potential-duplicate",
  "relationship-change",
  "technology-claim",
  "classification-change",
  "source-conflict",
]);
export type ReviewCategory = z.infer<typeof ReviewCategory>;

export const ReviewAction = z.enum(["approve", "reject", "edit", "merge", "ignore"]);
export type ReviewAction = z.infer<typeof ReviewAction>;

export const ReviewCandidate = z.object({
  id: z.string(),
  category: ReviewCategory,
  subject: z.object({ type: EntityType, id: EntityId }),
  related: z.array(z.object({ type: EntityType, id: EntityId })).default([]),
  title: z.string(),
  summary: z.string(),
  details: z.record(z.string(), z.unknown()),
  actions: z.array(ReviewAction),
});
export type ReviewCandidate = z.infer<typeof ReviewCandidate>;

export const ReviewDecision = z
  .object({
    candidate: z.string(),
    action: ReviewAction,
    category: ReviewCategory.optional(),
    subject: z.string().optional(),
    decidedAt: z.string(),
    note: z.string().optional(),
  })
  .strict();
export type ReviewDecision = z.infer<typeof ReviewDecision>;

export const DecisionsFile = z.object({ decisions: z.array(ReviewDecision).default([]) }).strict();

// ---------------------------------------------------------------------------
// Generated layer (machine-written, committed, never hand-edited)
// ---------------------------------------------------------------------------

export const GeneratedCompany = Company.omit({ games: true, statistics: true, lastUpdated: true });
export type GeneratedCompany = z.infer<typeof GeneratedCompany>;

export const GeneratedGame = Game.omit({ lastUpdated: true });
export type GeneratedGame = z.infer<typeof GeneratedGame>;

export const GeneratedTechnology = Technology.omit({ games: true, statistics: true, lastUpdated: true });
export type GeneratedTechnology = z.infer<typeof GeneratedTechnology>;

export const ResolutionIssue = z.object({
  kind: z.enum(["potential-duplicate", "source-conflict", "unmatched-technology", "ambiguous-match"]),
  entityType: EntityType,
  subject: EntityId,
  related: z.array(EntityId).default([]),
  field: z.string().optional(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
});
export type ResolutionIssue = z.infer<typeof ResolutionIssue>;

export const IdRegistry = z.object({
  companies: z.record(z.string(), EntityId).default({}),
  games: z.record(z.string(), EntityId).default({}),
  technologies: z.record(z.string(), EntityId).default({}),
});
export type IdRegistry = z.infer<typeof IdRegistry>;

export const ReviewHistoryPoint = z.tuple([
  z.string().describe("ISO date"),
  z.number().int().describe("total reviews"),
  z.number().int().describe("positive reviews"),
]);

export const StatisticsHistory = z.object({
  steamReviews: z
    .record(z.string(), z.array(ReviewHistoryPoint))
    .default({})
    .describe("Steam app ID -> [date, total, positive] observations, oldest first."),
});
export type StatisticsHistory = z.infer<typeof StatisticsHistory>;
