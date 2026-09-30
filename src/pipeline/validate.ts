import { normalizeCompanyName, normalizeTechnologyName } from "../lib/names.ts";
import { Company, Game, Person, Technology } from "../schema/entities.ts";
import type { OverrideEntry } from "../schema/files.ts";
import { assemble, BuildError, type Dataset } from "./assemble.ts";
import { diffFileMap, renderDataset } from "./publish.ts";
import { loadGenerated, loadSources, type Sources, type Workspace } from "./state.ts";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  dataset: Dataset | null;
}

const COMPUTED: Record<string, string[]> = {
  company: ["id", "games", "statistics", "lastUpdated", "provenance"],
  game: ["id", "lastUpdated", "provenance"],
  technology: ["id", "games", "statistics", "lastUpdated"],
  person: ["id", "lastUpdated"],
};

const EDITORIAL = new Set([
  "classification",
  "description.custom",
  "descriptions.custom",
  "aliases",
  "alternateTitles",
  "ownership.notes",
  "subcategory",
  "category",
]);

const SHAPES: Record<string, string[]> = {
  company: Object.keys(Company.shape),
  game: Object.keys(Game.shape),
  technology: Object.keys(Technology.shape),
  person: Object.keys(Person.shape),
};

function isEditorial(key: string, value: unknown): boolean {
  if (EDITORIAL.has(key) || EDITORIAL.has(key.split(".")[0]!)) return true;
  if ((key === "description" || key === "descriptions") && value && typeof value === "object") {
    return Object.keys(value).every((k) => k === "custom");
  }
  return false;
}

function checkOverrides(kind: string, file: string, entries: OverrideEntry[], errors: string[], warnings: string[]) {
  for (const entry of entries) {
    const where = `${file} [${entry.id}]`;
    if (entry.create && entry.exclude) errors.push(`${where}: cannot both create and exclude`);
    const fields = [
      ...Object.entries(entry.set ?? {}),
      ...Object.keys(entry.append ?? {}).map((k) => [k, []] as const),
      ...Object.keys(entry.remove ?? {}).map((k) => [k, []] as const),
    ];
    for (const [key, value] of fields) {
      const top = key.split(".")[0]!;
      if (!SHAPES[kind]!.includes(top)) errors.push(`${where}: unknown ${kind} field "${top}"`);
      else if (COMPUTED[kind]!.includes(top)) errors.push(`${where}: "${top}" is computed and cannot be overridden`);
      else if (!entry.source && !isEditorial(key, value)) {
        warnings.push(`${where}: "${key}" changes a factual field without a \`source\``);
      }
    }
  }
}

function checkSources(sources: Sources, generatedIds: { companies: Set<string>; games: Set<string> }, errors: string[], warnings: string[]) {
  const seedIds = new Map<string, number>();
  const names = new Map<string, string>();
  const external = new Map<string, string>();
  for (const seed of sources.seeds.companies) {
    seedIds.set(seed.id, (seedIds.get(seed.id) ?? 0) + 1);
    for (const n of [seed.name, ...seed.aliases]) {
      const key = normalizeCompanyName(n);
      const owner = names.get(key);
      if (owner && owner !== seed.id) errors.push(`data/seeds/companies.yaml: name/alias "${n}" is used by both ${owner} and ${seed.id}`);
      names.set(key, seed.id);
    }
    for (const [provider, value] of Object.entries(seed.externalIds)) {
      const key = `${provider}:${value}`;
      const owner = external.get(key);
      if (owner && owner !== seed.id) errors.push(`data/seeds/companies.yaml: ${key} is assigned to both ${owner} and ${seed.id}`);
      external.set(key, seed.id);
    }
    if (!seed.classification) warnings.push(`data/seeds/companies.yaml [${seed.id}]: no classification (defaults to unclassified)`);
  }
  for (const [id, count] of seedIds) if (count > 1) errors.push(`data/seeds/companies.yaml: duplicate id "${id}"`);

  const techIds = new Map<string, number>();
  const techNames = new Map<string, string>();
  for (const tech of sources.seeds.technologies) {
    techIds.set(tech.id, (techIds.get(tech.id) ?? 0) + 1);
    for (const n of [tech.name, ...tech.aliases]) {
      const key = normalizeTechnologyName(n);
      const owner = techNames.get(key);
      if (owner && owner !== tech.id) errors.push(`data/seeds/technologies.yaml: name/alias "${n}" is used by both ${owner} and ${tech.id}`);
      techNames.set(key, tech.id);
    }
  }
  for (const [id, count] of techIds) if (count > 1) errors.push(`data/seeds/technologies.yaml: duplicate id "${id}"`);

  checkOverrides("company", "data/overrides/companies.yaml", sources.overrides.companies, errors, warnings);
  checkOverrides("game", "data/overrides/games.yaml", sources.overrides.games, errors, warnings);
  checkOverrides("person", "data/overrides/people.yaml", sources.overrides.people, errors, warnings);
  checkOverrides("technology", "data/overrides/technology.yaml", sources.overrides.technology.technologies, errors, warnings);

  for (const claim of sources.overrides.technology.claims) {
    if (!claim.remove && !claim.source) {
      errors.push(`data/overrides/technology.yaml: claim ${claim.game} -> ${claim.technology} needs a \`source\` (unsourced technology claims are not accepted)`);
    }
    if (claim.confidence === "verified" && claim.source && !claim.source.url) {
      errors.push(`data/overrides/technology.yaml: verified claim ${claim.game} -> ${claim.technology} needs a source URL`);
    }
  }
  for (const rel of sources.overrides.relationships) {
    if (!rel.remove && !rel.source) warnings.push(`data/overrides/relationships.yaml: ${rel.from} ${rel.type} ${rel.to} has no \`source\``);
  }

  const knownCompanies = new Set([...seedIds.keys(), ...generatedIds.companies, ...sources.overrides.companies.filter((o) => o.create).map((o) => o.id)]);
  const knownGames = new Set([...generatedIds.games, ...sources.overrides.games.filter((o) => o.create).map((o) => o.id)]);
  const checkMapping = (file: string, known: Set<string>, mapping: Sources["mappings"]["companies"]) => {
    for (const [name, id] of Object.entries(mapping.names)) if (!known.has(id)) errors.push(`${file}: name "${name}" maps to unknown id "${id}"`);
    for (const [provider, ids] of Object.entries(mapping.externalIds)) {
      for (const [value, id] of Object.entries(ids)) if (!known.has(id)) errors.push(`${file}: ${provider}:${value} maps to unknown id "${id}"`);
    }
  };
  checkMapping("data/mappings/companies.yaml", knownCompanies, sources.mappings.companies);
  checkMapping("data/mappings/games.yaml", knownGames, sources.mappings.games);
}

export function checkIntegrity(dataset: Dataset): string[] {
  const problems: string[] = [];
  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${kind} id "${id}"`);
      seen.add(id);
    }
    return seen;
  };
  const games = unique("game", dataset.games.map((g) => g.id));
  const companies = unique("company", dataset.companies.map((c) => c.id));
  const tech = unique("technology", dataset.technologies.map((t) => t.id));
  const people = unique("person", dataset.people.map((p) => p.id));
  unique("relationship", dataset.relationships.map((r) => r.id));
  const all: Record<string, Set<string>> = { game: games, company: companies, technology: tech, person: people };

  for (const g of dataset.games) {
    for (const c of [...g.developers, ...g.publishers]) if (!companies.has(c)) problems.push(`game ${g.id} references unknown company ${c}`);
    for (const claims of Object.values(g.technology)) for (const c of claims) if (!tech.has(c.id)) problems.push(`game ${g.id} references unknown technology ${c.id}`);
    for (const ref of [g.relations.parentGame, g.relations.remasterOf, g.relations.portOf, ...g.relations.dlc]) {
      if (ref && !games.has(ref)) problems.push(`game ${g.id} references unknown game ${ref}`);
    }
  }
  for (const c of dataset.companies) {
    if (c.ownership.parentCompany && !companies.has(c.ownership.parentCompany)) problems.push(`company ${c.id} has unknown parent ${c.ownership.parentCompany}`);
    for (const g of [...c.games.developed, ...c.games.published]) if (!games.has(g)) problems.push(`company ${c.id} lists unknown game ${g}`);
  }
  for (const r of dataset.relationships) {
    if (!all[r.fromType]?.has(r.from)) problems.push(`relationship ${r.id}: unknown ${r.fromType} ${r.from}`);
    if (!all[r.toType]?.has(r.to)) problems.push(`relationship ${r.id}: unknown ${r.toType} ${r.to}`);
  }
  return problems;
}

export function validate(ws: Workspace, opts: { checkOutput?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sources: Sources;
  let generatedIds = { companies: new Set<string>(), games: new Set<string>() };
  try {
    sources = loadSources(ws.paths);
  } catch (error) {
    return { errors: [(error as Error).message], warnings, dataset: null };
  }
  try {
    const generated = loadGenerated(ws.paths);
    generatedIds = { companies: new Set(generated.companies.map((c) => c.id)), games: new Set(generated.games.map((g) => g.id)) };
  } catch (error) {
    errors.push((error as Error).message);
  }
  checkSources(sources, generatedIds, errors, warnings);

  let dataset: Dataset | null = null;
  try {
    dataset = assemble(ws);
    errors.push(...checkIntegrity(dataset));
  } catch (error) {
    if (error instanceof BuildError) errors.push(...error.problems);
    else errors.push((error as Error).message);
  }

  if (dataset && opts.checkOutput) {
    const differences = diffFileMap(ws.paths.latest, renderDataset(ws, dataset));
    if (differences.length) {
      errors.push(
        `data/latest does not match a fresh build (${differences.length} file(s): ${differences.slice(0, 10).join(", ")}` +
          `${differences.length > 10 ? ", …" : ""}). Generated output must not be edited by hand; run \`npm run build:data\`.`,
      );
    }
  }
  return { errors, warnings, dataset };
}
