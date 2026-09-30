/**
 * Generated + Seeds + Overrides = Public dataset (in memory).
 *
 * Precedence, lowest to highest: provider data (data/generated) < seeds
 * (data/seeds) < overrides (data/overrides). Manual data always wins.
 */
import { join } from "node:path";
import type { z } from "zod";
import { stableStringify } from "../lib/hash.ts";
import { exists, formatZodError, readJson } from "../lib/io.ts";
import { normalizeCompanyName } from "../lib/names.ts";
import type { Source } from "../schema/common.ts";
import {
  Company,
  CompanyRole,
  Game,
  Person,
  Relationship,
  TECH_ROLE_TO_RELATIONSHIP,
  Technology,
  type CompanyStatistics,
  type DatasetStatistics,
  type GameTechnology,
  type RelationshipType,
  type TechnologyRole,
  type TechnologyStatistics,
} from "../schema/entities.ts";
import type { OverrideEntry, RelationshipOverride } from "../schema/files.ts";
import { applyOverrides } from "./overrides.ts";
import { OVERRIDE_CONFIDENCE } from "./priority.ts";
import { CATEGORY_ROLE } from "./resolvers.ts";
import { companyStatistics, datasetStatistics, technologyStatistics } from "./stats.ts";
import { loadGenerated, loadSources, type Workspace } from "./state.ts";

export interface Dataset {
  companies: Company[];
  games: Game[];
  people: Person[];
  technologies: Technology[];
  relationships: Relationship[];
  statistics: DatasetStatistics;
}

export class BuildError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Dataset build failed with ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
}

const EMPTY_COMPANY_STATS: CompanyStatistics = {
  gameCount: 0, developedCount: 0, publishedCount: 0, totalSteamReviews: 0, averagePositivePercentage: null,
  weightedPositivePercentage: null, mostReviewedGame: null, mostRecentRelease: null, firstRelease: null,
  technologyCount: 0, engineCount: 0, engines: [],
};
const EMPTY_TECH_STATS: TechnologyStatistics = {
  gameCount: 0, companyCount: 0, totalSteamReviews: 0, mostReviewedGames: [], mostPlayedGames: [], gamesByReleaseYear: {},
};

export function blankCompany(id: string, name: string): Company {
  return {
    id, name, aliases: [], roles: [], description: { source: null, custom: null }, website: null, socialLinks: {},
    location: { headquarters: null, country: null, countryName: null }, founded: null, foundedDate: null,
    ownership: { status: "unknown", parentCompany: null, parentCompanyName: null, notes: null },
    externalIds: {}, logo: null, classification: { include: true, category: "unclassified", notes: "" },
    games: { developed: [], published: [] }, statistics: EMPTY_COMPANY_STATS, sources: [], provenance: {}, lastUpdated: "",
  };
}

export function blankGame(id: string, title: string): Game {
  return {
    id, title, alternateTitles: [], type: "game", releaseDate: null, releaseDatePrecision: null, releaseStatus: "unknown",
    developers: [], publishers: [], descriptions: { source: null, custom: null }, genres: [], tags: [], features: [],
    platforms: [], supportedLanguages: [], externalIds: {}, links: {},
    media: { header: null, capsule: null, background: null, screenshots: [] },
    technology: { engines: [], middleware: [], languages: [], tools: [] }, franchise: null, series: null,
    relations: { parentGame: null, dlc: [], remasterOf: null, portOf: null },
    statistics: { steam: null, reviewVelocity: null }, sources: [], provenance: {}, lastUpdated: "",
  };
}

function blankTechnology(id: string, name: string): Technology {
  return {
    id, name, aliases: [], category: "other", subcategory: null, developer: null, website: null, license: "unknown",
    description: { source: null, custom: null }, externalIds: {}, games: [], statistics: EMPTY_TECH_STATS, sources: [],
    lastUpdated: "",
  };
}

function blankPerson(id: string, name: string): Person {
  return { id, name, aliases: [], roles: [], affiliations: [], credits: [], externalIds: {}, links: {}, sources: [], lastUpdated: "" };
}

const nameFrom = (entry: OverrideEntry, key: string) => String((entry.set?.[key] as string | undefined) ?? entry.id);
const sortIds = (ids: Iterable<string>) => [...new Set(ids)].sort();
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const ROLE_ORDER = CompanyRole.options;

interface PreviousEntity {
  hash: string;
  lastUpdated: string;
}

function loadPrevious(ws: Workspace): Map<string, PreviousEntity> {
  const out = new Map<string, PreviousEntity>();
  for (const [type, file] of [
    ["game", "games.json"],
    ["company", "companies.json"],
    ["technology", "technologies.json"],
    ["person", "people.json"],
  ] as const) {
    const path = join(ws.paths.latest, "full", file);
    if (!exists(path)) continue;
    for (const entity of readJson<{ id: string; lastUpdated: string }[]>(path)) {
      out.set(`${type}:${entity.id}`, { hash: metadataHash(entity), lastUpdated: entity.lastUpdated });
    }
  }
  return out;
}

/** `lastUpdated` tracks metadata changes only; statistics move daily and are dated separately. */
function metadataHash(entity: { lastUpdated: string }): string {
  const { lastUpdated: _lastUpdated, statistics: _statistics, ...rest } = entity as Record<string, unknown>;
  return stableStringify(rest);
}

export function assemble(ws: Workspace): Dataset {
  const { paths, config, now } = ws;
  const sources = loadSources(paths);
  const generated = loadGenerated(paths);
  const problems: string[] = [];

  // ---- Technologies ------------------------------------------------------
  const technologies = new Map<string, Technology>();
  for (const t of generated.technologies) {
    technologies.set(t.id, { ...t, games: [], statistics: EMPTY_TECH_STATS, lastUpdated: "" });
  }
  for (const seed of sources.seeds.technologies) {
    const base = technologies.get(seed.id) ?? blankTechnology(seed.id, seed.name);
    technologies.set(seed.id, {
      ...base,
      name: seed.name,
      aliases: sortIds([...base.aliases, ...seed.aliases].filter((a) => a !== seed.name)),
      category: seed.category,
      subcategory: seed.subcategory,
      developer: seed.developer,
      website: seed.website,
      license: seed.license,
      externalIds: { ...base.externalIds, ...seed.externalIds },
      description: { source: base.description.source, custom: seed.description ?? base.description.custom },
      sources: base.sources.length ? base.sources : [{ type: "manual" }],
    });
  }
  const techOutcome = applyOverrides("technology", technologies, sources.overrides.technology.technologies, (id, e) =>
    blankTechnology(id, nameFrom(e, "name")),
  );
  problems.push(...techOutcome.problems);

  // ---- Companies ---------------------------------------------------------
  const companies = new Map<string, Company>();
  for (const c of generated.companies) {
    companies.set(c.id, { ...c, games: { developed: [], published: [] }, statistics: EMPTY_COMPANY_STATS, lastUpdated: "" });
  }
  for (const seed of sources.seeds.companies) {
    const base = companies.get(seed.id) ?? blankCompany(seed.id, seed.name);
    companies.set(seed.id, {
      ...base,
      name: seed.name,
      aliases: sortIds([...base.aliases, ...seed.aliases].filter((a) => a !== seed.name)),
      roles: [...new Set([...base.roles, ...seed.roles])],
      website: seed.website ?? base.website,
      externalIds: { ...base.externalIds, ...seed.externalIds },
      classification: seed.classification
        ? { include: seed.classification.include, category: seed.classification.category, notes: seed.classification.notes }
        : { include: true, category: base.classification.category, notes: base.classification.notes },
      sources: base.sources.some((s) => s.type === "manual") ? base.sources : [...base.sources, { type: "manual" }],
    });
  }
  const companyOutcome = applyOverrides("company", companies, sources.overrides.companies, (id, e) =>
    blankCompany(id, nameFrom(e, "name")),
  );
  problems.push(...companyOutcome.problems);

  // ---- Games -------------------------------------------------------------
  const games = new Map<string, Game>();
  for (const g of generated.games) games.set(g.id, { ...g, provenance: g.provenance ?? {}, lastUpdated: "" });
  const gameOutcome = applyOverrides("game", games, sources.overrides.games, (id, e) => blankGame(id, nameFrom(e, "title")));
  problems.push(...gameOutcome.problems);

  // ---- Technology claim overrides -----------------------------------------
  for (const claim of sources.overrides.technology.claims) {
    const game = games.get(claim.game);
    const tech = technologies.get(claim.technology);
    if (!game) {
      if (!gameOutcome.excluded.has(claim.game)) problems.push(`technology claim targets unknown game "${claim.game}"`);
      continue;
    }
    if (!tech) {
      problems.push(`technology claim on "${claim.game}" references unknown technology "${claim.technology}"`);
      continue;
    }
    const role: TechnologyRole = claim.role ?? CATEGORY_ROLE[tech.category];
    if (claim.remove) {
      const roles = claim.role ? [claim.role] : (Object.keys(game.technology) as TechnologyRole[]);
      for (const r of roles) game.technology[r] = game.technology[r].filter((c) => c.id !== claim.technology);
      continue;
    }
    const source: Source = claim.source ?? { type: "manual" };
    const entry = {
      id: claim.technology,
      confidence: claim.confidence ?? OVERRIDE_CONFIDENCE[source.type] ?? "high",
      source,
    };
    game.technology[role] = [...game.technology[role].filter((c) => c.id !== claim.technology), entry].sort(byId);
    if (!game.sources.some((s) => stableStringify(s) === stableStringify(source))) game.sources.push(source);
  }

  // ---- Relationship overrides ---------------------------------------------
  const manualRelationships: RelationshipOverride[] = [];
  for (const rel of sources.overrides.relationships) {
    const game = games.get(rel.to);
    const company = companies.get(rel.from);
    switch (rel.type) {
      case "developer":
      case "publisher": {
        if (!game || !company) {
          problems.push(`relationship ${rel.from} -${rel.type}-> ${rel.to}: unknown company or game`);
          break;
        }
        const field = rel.type === "developer" ? "developers" : "publishers";
        game[field] = rel.remove ? game[field].filter((id) => id !== rel.from) : sortIds([...game[field], rel.from]);
        game.provenance = { ...game.provenance, [field]: { source: rel.source?.type ?? "manual", confidence: rel.confidence ?? "high", url: rel.source?.url ?? null, retrievedAt: rel.source?.retrievedAt ?? null } };
        if (rel.source) game.sources.push(rel.source);
        break;
      }
      case "subsidiary-of": {
        const parent = companies.get(rel.to);
        if (!company || !parent) {
          problems.push(`relationship ${rel.from} -subsidiary-of-> ${rel.to}: unknown company`);
          break;
        }
        company.ownership = rel.remove
          ? { ...company.ownership, parentCompany: null, parentCompanyName: null }
          : { ...company.ownership, status: company.ownership.status === "acquired" ? "acquired" : "subsidiary", parentCompany: parent.id, parentCompanyName: parent.name };
        break;
      }
      case "dlc-of":
      case "remaster-of":
      case "port-of": {
        const child = games.get(rel.from);
        const target = games.get(rel.to);
        if (!child || !target) {
          problems.push(`relationship ${rel.from} -${rel.type}-> ${rel.to}: unknown game`);
          break;
        }
        const key = rel.type === "dlc-of" ? "parentGame" : rel.type === "remaster-of" ? "remasterOf" : "portOf";
        child.relations[key] = rel.remove ? null : target.id;
        break;
      }
      case "uses-engine":
      case "uses-middleware":
      case "uses-language":
      case "uses-tool": {
        const g = games.get(rel.from);
        if (!g || !technologies.has(rel.to)) {
          problems.push(`relationship ${rel.from} -${rel.type}-> ${rel.to}: unknown game or technology`);
          break;
        }
        const role = (Object.entries(TECH_ROLE_TO_RELATIONSHIP).find(([, t]) => t === rel.type)![0]) as TechnologyRole;
        g.technology[role] = g.technology[role].filter((c) => c.id !== rel.to);
        if (!rel.remove) {
          const source = rel.source ?? { type: "manual" as const };
          g.technology[role].push({ id: rel.to, confidence: rel.confidence ?? OVERRIDE_CONFIDENCE[source.type] ?? "high", source });
          g.technology[role].sort(byId);
        }
        break;
      }
      default:
        manualRelationships.push(rel);
    }
  }

  // ---- People --------------------------------------------------------------
  const people = new Map<string, Person>();
  const peopleOutcome = applyOverrides("person", people, sources.overrides.people, (id, e) => blankPerson(id, nameFrom(e, "name")));
  problems.push(...peopleOutcome.problems);

  // ---- Inclusion -----------------------------------------------------------
  for (const id of companyOutcome.excluded) companies.delete(id);
  const included = (id: string) => companies.get(id)?.classification.include === true;
  for (const game of games.values()) {
    game.developers = game.developers.filter((id) => companies.has(id));
    game.publishers = game.publishers.filter((id) => companies.has(id));
  }
  for (const [id, game] of games) {
    const manual = gameOutcome.created.has(id);
    if (!manual && ![...game.developers, ...game.publishers].some(included)) games.delete(id);
  }
  const referenced = new Set<string>();
  for (const g of games.values()) for (const c of [...g.developers, ...g.publishers]) referenced.add(c);
  for (const [id, company] of companies) {
    if (!company.classification.include && !referenced.has(id) && !companyOutcome.created.has(id)) companies.delete(id);
  }
  const usedTech = new Set<string>();
  for (const g of games.values()) {
    for (const role of Object.keys(g.technology) as TechnologyRole[]) {
      g.technology[role] = g.technology[role].filter((c) => technologies.has(c.id));
      for (const c of g.technology[role]) usedTech.add(c.id);
    }
  }
  const catalog = new Set([
    ...sources.seeds.technologies.map((t) => t.id),
    ...techOutcome.created,
  ]);
  for (const id of [...technologies.keys()]) if (!catalog.has(id) && !usedTech.has(id)) technologies.delete(id);

  // ---- Referential cleanup & computed fields -------------------------------
  const companyByName = new Map<string, string>();
  for (const c of companies.values()) {
    for (const n of [c.name, ...c.aliases]) companyByName.set(normalizeCompanyName(n), c.id);
  }
  for (const game of games.values()) {
    const r = game.relations;
    r.parentGame = r.parentGame && games.has(r.parentGame) ? r.parentGame : null;
    r.remasterOf = r.remasterOf && games.has(r.remasterOf) ? r.remasterOf : null;
    r.portOf = r.portOf && games.has(r.portOf) ? r.portOf : null;
    r.dlc = sortIds(r.dlc.filter((d) => games.has(d)));
  }
  for (const game of games.values()) {
    const parent = game.relations.parentGame ? games.get(game.relations.parentGame) : null;
    if (parent && !parent.relations.dlc.includes(game.id)) parent.relations.dlc = sortIds([...parent.relations.dlc, game.id]);
  }

  const developed = new Map<string, Game[]>();
  const published = new Map<string, Game[]>();
  for (const g of [...games.values()].sort(byId)) {
    for (const c of g.developers) developed.set(c, [...(developed.get(c) ?? []), g]);
    for (const c of g.publishers) published.set(c, [...(published.get(c) ?? []), g]);
  }

  for (const company of companies.values()) {
    const dev = developed.get(company.id) ?? [];
    const pub = published.get(company.id) ?? [];
    company.games = { developed: dev.map((g) => g.id), published: pub.map((g) => g.id) };
    const roles = new Set(company.roles);
    if (dev.length) roles.add("developer");
    if (pub.length) roles.add("publisher");
    company.roles = ROLE_ORDER.filter((r) => roles.has(r));
    const o = company.ownership;
    if (o.parentCompany && !companies.has(o.parentCompany)) o.parentCompany = null;
    if (!o.parentCompany && o.parentCompanyName) {
      const match = companyByName.get(normalizeCompanyName(o.parentCompanyName));
      if (match && match !== company.id) o.parentCompany = match;
    }
    if (o.parentCompany && o.status === "unknown") o.status = "subsidiary";
    company.statistics = companyStatistics(dev, pub, technologies, config);
  }

  const gamesByTech = new Map<string, Game[]>();
  for (const g of [...games.values()].sort(byId)) {
    const ids = new Set(Object.values(g.technology).flatMap((claims) => claims.map((c) => c.id)));
    for (const id of ids) gamesByTech.set(id, [...(gamesByTech.get(id) ?? []), g]);
  }
  for (const tech of technologies.values()) {
    const list = gamesByTech.get(tech.id) ?? [];
    tech.games = list.map((g) => g.id);
    tech.statistics = technologyStatistics(list);
  }

  for (const person of people.values()) {
    person.affiliations = person.affiliations.filter((a) => {
      if (companies.has(a.company)) return true;
      problems.push(`person "${person.id}" is affiliated with unknown company "${a.company}"`);
      return false;
    });
    person.credits = person.credits.filter((c) => {
      if (games.has(c.game)) return true;
      problems.push(`person "${person.id}" is credited on unknown game "${c.game}"`);
      return false;
    });
  }

  // ---- Relationships -------------------------------------------------------
  const relationships = new Map<string, Relationship>();
  const addRel = (
    from: string, fromType: Relationship["fromType"], type: RelationshipType, to: string,
    toType: Relationship["toType"], confidence: Relationship["confidence"], srcs: Source[],
  ) => {
    const id = `${from}:${type}:${to}`;
    relationships.set(id, { id, from, fromType, type, to, toType, confidence, sources: srcs });
  };
  for (const g of games.values()) {
    for (const field of ["developers", "publishers"] as const) {
      const p = g.provenance?.[field];
      const src: Source[] = p ? [{ type: p.source, url: p.url ?? null, retrievedAt: p.retrievedAt ?? null }] : [];
      for (const c of g[field]) {
        addRel(c, "company", field === "developers" ? "developer" : "publisher", g.id, "game", p?.confidence ?? null, src);
      }
    }
    for (const role of Object.keys(g.technology) as (keyof GameTechnology)[]) {
      for (const claim of g.technology[role]) {
        addRel(g.id, "game", TECH_ROLE_TO_RELATIONSHIP[role], claim.id, "technology", claim.confidence, [claim.source]);
      }
    }
    for (const [key, type] of [["parentGame", "dlc-of"], ["remasterOf", "remaster-of"], ["portOf", "port-of"]] as const) {
      const target = g.relations[key];
      if (!target) continue;
      const p = g.provenance?.[`relations.${key}`];
      addRel(g.id, "game", type, target, "game", p?.confidence ?? null, p ? [{ type: p.source, url: p.url ?? null, retrievedAt: p.retrievedAt ?? null }] : []);
    }
  }
  for (const c of companies.values()) {
    if (!c.ownership.parentCompany) continue;
    const p = c.provenance?.parent ?? c.provenance?.ownership;
    addRel(c.id, "company", "subsidiary-of", c.ownership.parentCompany, "company", p?.confidence ?? null, p ? [{ type: p.source, url: p.url ?? null, retrievedAt: p.retrievedAt ?? null }] : []);
  }
  for (const p of people.values()) {
    for (const a of p.affiliations) addRel(p.id, "person", "affiliated-with", a.company, "company", null, [a.source]);
    for (const c of p.credits) addRel(p.id, "person", "credited-on", c.game, "game", null, [c.source]);
  }
  const entityType = (id: string): Relationship["fromType"] | null =>
    games.has(id) ? "game" : companies.has(id) ? "company" : technologies.has(id) ? "technology" : people.has(id) ? "person" : null;
  for (const rel of manualRelationships) {
    const fromType = entityType(rel.from);
    const toType = entityType(rel.to);
    if (!fromType || !toType) {
      problems.push(`relationship ${rel.from} -${rel.type}-> ${rel.to}: unknown endpoint`);
      continue;
    }
    const id = `${rel.from}:${rel.type}:${rel.to}`;
    if (rel.remove) relationships.delete(id);
    else addRel(rel.from, fromType, rel.type, rel.to, toType, rel.confidence ?? null, rel.source ? [rel.source] : []);
  }

  // ---- lastUpdated (stable when content is unchanged) ------------------------
  const previous = loadPrevious(ws);
  const stamp = <T extends { id: string; lastUpdated: string }>(type: string, entity: T): T => {
    const hash = metadataHash(entity);
    const prior = previous.get(`${type}:${entity.id}`);
    return { ...entity, lastUpdated: prior && prior.hash === hash ? prior.lastUpdated : now.toISOString() };
  };

  // ---- Validate --------------------------------------------------------------
  const validated = <S extends z.ZodType>(schema: S, kind: string, items: { id: string }[]): z.output<S>[] => {
    const out: z.output<S>[] = [];
    for (const item of items) {
      const result = schema.safeParse(item);
      if (result.success) out.push(result.data);
      else problems.push(`${kind} "${item.id}" is invalid:\n${formatZodError(result.error)}`);
    }
    return out;
  };

  const finalGames = validated(Game, "game", [...games.values()].sort(byId).map((g) => stamp("game", g)));
  const finalCompanies = validated(Company, "company", [...companies.values()].sort(byId).map((c) => stamp("company", c)));
  const finalTech = validated(Technology, "technology", [...technologies.values()].sort(byId).map((t) => stamp("technology", t)));
  const finalPeople = validated(Person, "person", [...people.values()].sort(byId).map((p) => stamp("person", p)));
  const finalRelationships = validated(Relationship, "relationship", [...relationships.values()].sort(byId));

  if (problems.length) throw new BuildError(problems);

  // Rankings are anchored to when the statistics were observed, not to the wall clock,
  // so rebuilding the same data on a later day (e.g. in CI) gives identical output.
  const observedAt = finalGames.map((g) => g.statistics.steam?.retrievedAt.slice(0, 10) ?? "").sort().at(-1);
  const statisticsAsOf = observedAt ? new Date(`${observedAt}T00:00:00Z`) : now;

  return {
    companies: finalCompanies,
    games: finalGames,
    people: finalPeople,
    technologies: finalTech,
    relationships: finalRelationships,
    statistics: datasetStatistics(finalGames, finalCompanies, finalTech, finalPeople.length, config, statisticsAsOf),
  };
}