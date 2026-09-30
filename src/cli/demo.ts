/**
 * `npm run demo`: runs the full pipeline offline against fictional fixture
 * data in ./.demo and traces one game through every stage:
 * seed -> discovered -> provider records -> generated -> overrides -> published.
 */
import { cpSync } from "node:fs";
import { join } from "node:path";
import { createPaths, REPO_ROOT } from "../config.ts";
import { readJson, readText, removeDir, toJson, writeText } from "../lib/io.ts";
import { MockProvider } from "../providers/mock.ts";
import type { Game, Relationship } from "../schema/entities.ts";
import type { ReviewCandidate } from "../schema/files.ts";
import { build } from "../pipeline/build.ts";
import { discover } from "../pipeline/discover.ts";
import { enrich } from "../pipeline/enrich.ts";
import { report } from "../pipeline/report.ts";
import { resolve } from "../pipeline/resolve.ts";
import { loadGenerated, loadSources, openWorkspace, type Workspace } from "../pipeline/state.ts";
import { updateStatistics } from "../pipeline/stats.ts";
import { validate } from "../pipeline/validate.ts";

export const DEMO_FIXTURE = join(REPO_ROOT, "test", "fixtures", "demo");
export const DEMO_NOW = new Date("2026-01-16T12:00:00Z");

/** Creates a fresh, self-contained workspace populated with the fictional fixture sources. */
export function createDemoWorkspace(dir: string, now = DEMO_NOW): Workspace {
  removeDir(dir);
  cpSync(join(DEMO_FIXTURE, "workspace"), dir, { recursive: true });
  const config = readJson<Record<string, unknown>>(join(REPO_ROOT, "dataset.config.json"));
  config.name = "Independent Game Database (demo)";
  config.repository = "example/independent-game-database";
  config.contact = "https://github.com/example/independent-game-database/issues";
  config.datasetVersion = "0.1.0";
  writeText(join(dir, "dataset.config.json"), toJson(config));
  writeText(join(dir, "CHANGELOG.md"), "# Changelog\n");
  return openWorkspace(createPaths(dir), now);
}

export async function runPipeline(ws: Workspace, provider = new MockProvider(join(DEMO_FIXTURE, "provider.json"))) {
  const discovery = await discover(ws, [provider]);
  const enrichment = await enrich(ws, [provider], discovery);
  resolve(ws, enrichment, discovery);
  updateStatistics(ws);
  const validation = validate(ws);
  if (validation.errors.length) throw new Error(`demo validation failed:\n${validation.errors.join("\n")}`);
  const { candidates } = report(ws, validation.dataset!);
  const built = build(ws);
  return { discovery, enrichment, validation, candidates, built };
}

const section = (title: string) => console.log(`\n\x1b[1m${title}\x1b[0m`);
const show = (value: unknown) => console.log(toJson(value).trimEnd().split("\n").map((l) => `  ${l}`).join("\n"));

export async function runDemo(): Promise<number> {
  const dir = join(REPO_ROOT, ".demo");
  process.env.DB_QUIET = "1";
  const ws = createDemoWorkspace(dir);
  const { discovery, enrichment, validation, candidates } = await runPipeline(ws);
  const sources = loadSources(ws.paths);
  const generated = loadGenerated(ws.paths).games.find((g) => g.id === "lanternfall")!;
  const published = readJson<Game[]>(join(ws.paths.latest, "full", "games.json")).find((g) => g.id === "lanternfall")!;
  const relationships = readJson<Relationship[]>(join(ws.paths.latest, "relationships.json"));

  console.log("Independent Game Database demo (fictional data, no network access)");
  console.log(`Workspace: ${dir}`);

  section("1. Seed company (data/seeds/companies.yaml)");
  show(sources.seeds.companies.find((c) => c.id === "hollow-lantern-studio"));

  section("2. Discovery: seed -> game hints");
  show(discovery.hints.filter((h) => h.ids.wikidata === "Q900101"));

  section("3. Provider records for the same game, before resolution");
  for (const r of enrichment.games.filter((r) => r.ids.steam === "990001" || r.ids.wikidata === "Q900101")) {
    console.log(`  ${r.provider.padEnd(9)} title="${r.title}" developers=${JSON.stringify(r.developers?.map((d) => d.name))} platforms=${JSON.stringify(r.platforms)}`);
  }

  section("4. Normalized + resolved (data/generated/games.json)");
  show({
    id: generated.id,
    title: generated.title,
    developers: generated.developers,
    publishers: generated.publishers,
    platforms: generated.platforms,
    genres: generated.genres,
    engines: generated.technology.engines,
    provenance: { title: generated.provenance?.title, developers: generated.provenance?.developers },
  });

  section("5. Relationships (data/latest/relationships.json)");
  for (const r of relationships.filter((r) => r.from === "lanternfall" || r.to === "lanternfall")) {
    console.log(`  ${r.from} --${r.type}--> ${r.to}  [${r.confidence}]`);
  }

  section("6. Manual overrides (data/overrides/games.yaml, technology.yaml)");
  console.log(readText(ws.paths.overrides.games).split(/\r?\n/).map((l) => `  ${l}`).join("\n"));

  section("7. Final published record (data/latest/full/games.json)");
  show({
    id: published.id,
    descriptions: published.descriptions,
    tags: published.tags,
    middleware: published.technology.middleware,
    statistics: published.statistics,
    lastUpdated: published.lastUpdated,
  });

  section("Review queue");
  const byCategory = new Map<string, ReviewCandidate[]>();
  for (const c of candidates) byCategory.set(c.category, [...(byCategory.get(c.category) ?? []), c]);
  for (const [category, list] of byCategory) {
    console.log(`  ${category}: ${list.length}`);
    for (const c of list) console.log(`    - ${c.title}`);
  }
  console.log(`\n  ${validation.warnings.length} validation warning(s). Report: ${join(dir, "reports", "latest.md")}`);
  console.log(`  Browse the output in ${ws.paths.latest}`);
  console.log(`  Try the review UI on it: npm run review -- --root .demo`);
  return 0;
}
