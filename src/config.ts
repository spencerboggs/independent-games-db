import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseWith, readJson } from "./lib/io.ts";

export const DatasetConfig = z.object({
  name: z.string(),
  description: z.string(),
  datasetVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  repository: z.string(),
  defaultBranch: z.string().default("main"),
  contact: z.string(),
  license: z.object({ code: z.string(), data: z.string(), notes: z.string() }),
  providers: z.object({
    wikidata: z.object({ enabled: z.boolean() }).default({ enabled: true }),
    steam: z
      .object({ enabled: z.boolean(), countryCode: z.string().default("us"), language: z.string().default("english") })
      .default({ enabled: true, countryCode: "us", language: "english" }),
    igdb: z.object({ enabled: z.union([z.boolean(), z.literal("auto")]) }).default({ enabled: "auto" }),
  }),
  policies: z.object({
    thirdPartyDescriptions: z.enum(["store-short", "link-only"]),
    artwork: z.enum(["reference-only", "none"]),
    includeGameTypes: z.array(z.string()),
    cacheTtlHours: z.object({ metadata: z.number(), statistics: z.number() }),
  }),
  statistics: z.object({
    highestRatedMinReviews: z.number().int(),
    rankingSize: z.number().int(),
    recentWindowDays: z.number().int(),
    recentlyPopularMinReleaseAgeDays: z.number().int(),
    mostEstablishedMinReviews: z.number().int(),
    averagePositiveMinReviews: z.number().int(),
  }),
});
export type DatasetConfig = z.infer<typeof DatasetConfig>;

export const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function createPaths(root: string = REPO_ROOT) {
  const data = join(root, "data");
  return {
    root,
    config: join(root, "dataset.config.json"),
    changelog: join(root, "CHANGELOG.md"),
    seeds: {
      companies: join(data, "seeds", "companies.yaml"),
      technologies: join(data, "seeds", "technologies.yaml"),
    },
    overrides: {
      companies: join(data, "overrides", "companies.yaml"),
      games: join(data, "overrides", "games.yaml"),
      people: join(data, "overrides", "people.yaml"),
      relationships: join(data, "overrides", "relationships.yaml"),
      technology: join(data, "overrides", "technology.yaml"),
    },
    mappings: {
      companies: join(data, "mappings", "companies.yaml"),
      games: join(data, "mappings", "games.yaml"),
    },
    review: {
      decisions: join(data, "review", "decisions.yaml"),
      candidates: join(data, "review", "candidates.json"),
    },
    registry: join(data, "registry", "ids.json"),
    history: join(data, "history", "statistics.json"),
    generated: {
      dir: join(data, "generated"),
      companies: join(data, "generated", "companies.json"),
      games: join(data, "generated", "games.json"),
      technologies: join(data, "generated", "technologies.json"),
      issues: join(data, "generated", "issues.json"),
    },
    work: {
      dir: join(data, "work"),
      discovered: join(data, "work", "discovered.json"),
      enriched: join(data, "work", "enriched.json"),
    },
    raw: join(data, "raw"),
    latest: join(data, "latest"),
    snapshots: join(data, "snapshots"),
    reports: join(root, "reports"),
    dist: join(root, "dist"),
  };
}
export type Paths = ReturnType<typeof createPaths>;

export function loadConfig(paths: Paths): DatasetConfig {
  return parseWith(DatasetConfig, readJson(paths.config), paths.config);
}

export function repoUrls(config: DatasetConfig) {
  const base = `https://raw.githubusercontent.com/${config.repository}`;
  return {
    latest: `${base}/${config.defaultBranch}/data/latest/`,
    pinned: `${base}/v${config.datasetVersion}/data/latest/`,
    releases: `https://github.com/${config.repository}/releases`,
  };
}
