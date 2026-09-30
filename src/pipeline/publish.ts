/**
 * Renders the public dataset (data/latest/) from an assembled Dataset.
 *
 * data/latest/ is the stable public interface. Everything is rendered in
 * memory first, then written; files that no longer belong are deleted, so the
 * directory always exactly equals the build output.
 */
import { relative, join, sep } from "node:path";
import { unlinkSync } from "node:fs";
import { z } from "zod";
import { repoUrls } from "../config.ts";
import { sha256 } from "../lib/hash.ts";
import { exists, listFiles, readJson, readText, toJson, writeText } from "../lib/io.ts";
import {
  CompactCompany,
  CompactGame,
  CompactPerson,
  CompactRelationship,
  CompactTechnology,
  Company,
  DatasetStatistics,
  Game,
  Manifest,
  Person,
  Relationship,
  Technology,
} from "../schema/entities.ts";
import { StatisticsHistory } from "../schema/files.ts";
import type { Dataset } from "./assemble.ts";
import { loadHistory, type Workspace } from "./state.ts";

export type FileMap = Map<string, string>;

const StandardGame = Game.omit({ provenance: true });
const StandardCompany = Company.omit({ provenance: true });

type StandardGameT = z.infer<typeof StandardGame>;
type StandardCompanyT = z.infer<typeof StandardCompany>;

export function toStandardGame(g: Game): StandardGameT {
  const { provenance: _p, ...rest } = g;
  return rest;
}

export function toStandardCompany(c: Company): StandardCompanyT {
  const { provenance: _p, ...rest } = c;
  return rest;
}

export function toCompactGame(g: Game): z.infer<typeof CompactGame> {
  return {
    id: g.id,
    title: g.title,
    type: g.type,
    releaseDate: g.releaseDate,
    developers: g.developers,
    publishers: g.publishers,
    platforms: g.platforms,
    genres: g.genres,
    engines: g.technology.engines.map((e) => e.id),
    steamAppId: g.externalIds.steam ?? null,
    reviewCount: g.statistics.steam?.reviewCount ?? null,
    positivePercentage: g.statistics.steam?.positivePercentage ?? null,
  };
}

export function toCompactCompany(c: Company): z.infer<typeof CompactCompany> {
  return {
    id: c.id,
    name: c.name,
    roles: c.roles,
    country: c.location.country,
    founded: c.founded,
    category: c.classification.category,
    include: c.classification.include,
    gameCount: c.statistics.gameCount,
  };
}

const toCompactTech = (t: Technology): z.infer<typeof CompactTechnology> => ({
  id: t.id,
  name: t.name,
  category: t.category,
  gameCount: t.games.length,
});

const toCompactPerson = (p: Person): z.infer<typeof CompactPerson> => ({
  id: p.id,
  name: p.name,
  companies: [...new Set(p.affiliations.map((a) => a.company))].sort(),
});

const toCompactRelationship = (r: Relationship): z.infer<typeof CompactRelationship> => ({
  from: r.from,
  type: r.type,
  to: r.to,
});

const SOURCE_INFO: Record<string, { name: string; url: string; license: string; usage: string }> = {
  wikidata: {
    name: "Wikidata",
    url: "https://www.wikidata.org/",
    license: "CC0-1.0",
    usage: "Game discovery, cross-service identifiers, company facts, ownership, engine and language claims.",
  },
  steam: {
    name: "Steam",
    url: "https://store.steampowered.com/",
    license: "Steam Web API Terms of Use (third-party; not relicensed)",
    usage: "Game metadata, store short descriptions (quoted, attributed), artwork URLs (reference only), review and player counts.",
  },
  igdb: {
    name: "IGDB",
    url: "https://www.igdb.com/",
    license: "Twitch Developer Services Agreement (third-party; attribution to IGDB.com)",
    usage: "Complementary game metadata, companies, engines, franchises.",
  },
  manual: {
    name: "Database curators",
    url: "https://github.com/spencerboggs/independent-games-db",
    license: "ODbL-1.0",
    usage: "Seeds, classifications, corrections, custom descriptions, verified technology claims.",
  },
};

function jsonSchema(schema: z.ZodType, title: string, id: string): string {
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  return toJson({ $id: id, title, ...generated });
}

export function renderDataset(ws: Workspace, dataset: Dataset): FileMap {
  const { config } = ws;
  const files: FileMap = new Map();
  const put = (path: string, value: unknown, pretty = true) => files.set(path, toJson(value, pretty));

  const standardGames = dataset.games.map(toStandardGame);
  const standardCompanies = dataset.companies.map(toStandardCompany);
  const engines = dataset.technologies.filter((t) => t.category === "engine");

  // Standard (data/latest/*.json)
  put("games.json", standardGames);
  put("companies.json", standardCompanies);
  put("developers.json", standardCompanies.filter((c) => c.roles.includes("developer")));
  put("publishers.json", standardCompanies.filter((c) => c.roles.includes("publisher")));
  put("people.json", dataset.people);
  put("technologies.json", dataset.technologies);
  put("engines.json", engines);
  put("relationships.json", dataset.relationships);
  put("statistics.json", dataset.statistics);
  put(
    "index.json",
    [
      ...dataset.games.map((g) => ({ id: g.id, type: "game", name: g.title })),
      ...dataset.companies.map((c) => ({ id: c.id, type: "company", name: c.name })),
      ...dataset.technologies.map((t) => ({ id: t.id, type: "technology", name: t.name })),
      ...dataset.people.map((p) => ({ id: p.id, type: "person", name: p.name })),
    ],
  );

  // Full (data/latest/full/*.json): standard + per-field provenance + review history
  const history = loadHistory(ws.paths);
  const steamIds = new Set(dataset.games.map((g) => g.externalIds.steam).filter(Boolean));
  put("full/games.json", dataset.games);
  put("full/companies.json", dataset.companies);
  put("full/people.json", dataset.people);
  put("full/technologies.json", dataset.technologies);
  put("full/relationships.json", dataset.relationships);
  put("full/statistics.json", dataset.statistics);
  put("full/statistics-history.json", {
    steamReviews: Object.fromEntries(Object.entries(history.steamReviews).filter(([id]) => steamIds.has(id))),
  });

  // Compact (data/latest/compact/*.json): minimal fields, minified
  put("compact/games.json", dataset.games.map(toCompactGame), false);
  put("compact/companies.json", dataset.companies.map(toCompactCompany), false);
  put("compact/people.json", dataset.people.map(toCompactPerson), false);
  put("compact/technologies.json", dataset.technologies.map(toCompactTech), false);
  put("compact/engines.json", engines.map(toCompactTech), false);
  put("compact/relationships.json", dataset.relationships.map(toCompactRelationship), false);

  // Per-entity files and focused subsets
  for (const g of standardGames) put(`entities/games/${g.id}.json`, g);
  for (const c of standardCompanies) put(`entities/companies/${c.id}.json`, c);
  for (const t of dataset.technologies) put(`entities/technologies/${t.id}.json`, t);
  for (const p of dataset.people) put(`entities/people/${p.id}.json`, p);
  const gamesById = new Map(dataset.games.map((g) => [g.id, g]));
  for (const c of dataset.companies) {
    put(`by-company/${c.id}.json`, {
      id: c.id,
      name: c.name,
      developed: c.games.developed.map((id) => toCompactGame(gamesById.get(id)!)),
      published: c.games.published.map((id) => toCompactGame(gamesById.get(id)!)),
    });
  }
  for (const t of engines) {
    put(`by-engine/${t.id}.json`, { id: t.id, name: t.name, games: t.games.map((id) => toCompactGame(gamesById.get(id)!)) });
  }

  // JSON Schemas
  const schemaBase = `${repoUrls(config).latest}schema/`;
  const schemas: Record<string, [z.ZodType, string]> = {
    "games.schema.json": [z.array(StandardGame), "Games (standard)"],
    "companies.schema.json": [z.array(StandardCompany), "Companies (standard)"],
    "people.schema.json": [z.array(Person), "People"],
    "technologies.schema.json": [z.array(Technology), "Technologies"],
    "relationships.schema.json": [z.array(Relationship), "Relationships"],
    "statistics.schema.json": [DatasetStatistics, "Dataset statistics"],
    "full-games.schema.json": [z.array(Game), "Games (full)"],
    "full-companies.schema.json": [z.array(Company), "Companies (full)"],
    "statistics-history.schema.json": [StatisticsHistory, "Steam review history"],
    "compact-games.schema.json": [z.array(CompactGame), "Games (compact)"],
    "compact-companies.schema.json": [z.array(CompactCompany), "Companies (compact)"],
    "compact-technologies.schema.json": [z.array(CompactTechnology), "Technologies (compact)"],
    "compact-people.schema.json": [z.array(CompactPerson), "People (compact)"],
    "compact-relationships.schema.json": [z.array(CompactRelationship), "Relationships (compact)"],
    "manifest.schema.json": [Manifest, "Manifest"],
  };
  for (const [file, [schema, title]] of Object.entries(schemas)) {
    files.set(`schema/${file}`, jsonSchema(schema, title, `${schemaBase}${file}`));
  }

  // Manifest
  const listed = [...files.keys()].filter((p) => !p.startsWith("entities/") && !p.startsWith("by-")).sort();
  const records = (content: string): number | null => {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed.length : null;
  };
  const checksums = listed.map((path) => {
    const content = files.get(path)!;
    return { path, bytes: Buffer.byteLength(content), sha256: sha256(content), records: records(content) };
  });
  const contentHash = sha256(
    [...files.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([path, content]) => `${path}:${sha256(content)}`)
      .join("\n") + `\n${config.datasetVersion}|${config.schemaVersion}`,
  );
  const previousPath = join(ws.paths.latest, "manifest.json");
  const previous = exists(previousPath) ? readJson<{ contentHash?: string; generatedAt?: string }>(previousPath) : null;
  const generatedAt =
    previous?.contentHash === contentHash && previous.generatedAt ? previous.generatedAt : ws.now.toISOString();

  const usedSources = new Set<string>(["manual"]);
  for (const e of [...dataset.games, ...dataset.companies]) for (const s of e.sources) usedSources.add(s.type);

  const manifest: Manifest = {
    name: config.name,
    description: config.description,
    datasetVersion: config.datasetVersion,
    schemaVersion: config.schemaVersion,
    generatedAt,
    contentHash,
    repository: `https://github.com/${config.repository}`,
    license: config.license,
    counts: {
      games: dataset.games.length,
      companies: dataset.companies.length,
      people: dataset.people.length,
      engines: engines.length,
      technologies: dataset.technologies.length,
      relationships: dataset.relationships.length,
    },
    files: {
      games: "games.json",
      companies: "companies.json",
      developers: "developers.json",
      publishers: "publishers.json",
      people: "people.json",
      engines: "engines.json",
      technologies: "technologies.json",
      relationships: "relationships.json",
      statistics: "statistics.json",
      index: "index.json",
    },
    variants: {
      standard: { games: "games.json", companies: "companies.json", people: "people.json", technologies: "technologies.json", relationships: "relationships.json", statistics: "statistics.json" },
      full: { games: "full/games.json", companies: "full/companies.json", people: "full/people.json", technologies: "full/technologies.json", relationships: "full/relationships.json", statistics: "full/statistics.json", statisticsHistory: "full/statistics-history.json" },
      compact: { games: "compact/games.json", companies: "compact/companies.json", people: "compact/people.json", technologies: "compact/technologies.json", engines: "compact/engines.json", relationships: "compact/relationships.json" },
    },
    entities: "entities/{games|companies|technologies|people}/{id}.json; by-company/{id}.json; by-engine/{id}.json",
    schemas: Object.fromEntries(Object.keys(schemas).map((f) => [f.replace(".schema.json", ""), `schema/${f}`])),
    checksums,
    sources: [...usedSources]
      .filter((s) => SOURCE_INFO[s])
      .sort()
      .map((id) => ({
        id,
        ...SOURCE_INFO[id]!,
        ...(id === "manual" ? { url: `https://github.com/${config.repository}` } : {}),
      })),
    urls: repoUrls(config),
  };
  Manifest.parse(manifest);
  files.set("manifest.json", toJson(manifest));
  return files;
}

/** Writes a FileMap into `dir`, deleting stale files. Returns changed paths. */
export function writeFileMap(dir: string, files: FileMap): { written: string[]; deleted: string[] } {
  const written: string[] = [];
  for (const [path, content] of files) if (writeText(join(dir, path), content)) written.push(path);
  const deleted: string[] = [];
  for (const file of listFiles(dir)) {
    const rel = relative(dir, file).split(sep).join("/");
    if (!files.has(rel)) {
      unlinkSync(file);
      deleted.push(rel);
    }
  }
  return { written, deleted };
}

/** Compares a FileMap with what is on disk. Returns paths that differ. */
export function diffFileMap(dir: string, files: FileMap): string[] {
  const differences: string[] = [];
  for (const [path, content] of files) {
    const full = join(dir, path);
    if (!exists(full) || readText(full) !== content) differences.push(path);
  }
  for (const file of listFiles(dir)) {
    const rel = relative(dir, file).split(sep).join("/");
    if (!files.has(rel)) differences.push(rel);
  }
  return differences.sort();
}
