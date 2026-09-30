import { z } from "zod";
import type { DatasetConfig, Paths } from "../config.ts";
import { loadConfig } from "../config.ts";
import { exists, parseWith, readJson, readYaml, sortKeys, writeJson } from "../lib/io.ts";
import {
  CompanyOverridesFile,
  CompanySeedsFile,
  DecisionsFile,
  GameOverridesFile,
  GeneratedCompany,
  GeneratedGame,
  GeneratedTechnology,
  IdRegistry,
  MappingsFile,
  PeopleOverridesFile,
  RelationshipOverridesFile,
  ResolutionIssue,
  StatisticsHistory,
  TechnologyOverridesFile,
  TechnologySeedsFile,
} from "../schema/files.ts";

export function loadSources(paths: Paths) {
  return {
    seeds: {
      companies: readYaml(paths.seeds.companies, CompanySeedsFile).companies,
      technologies: readYaml(paths.seeds.technologies, TechnologySeedsFile).technologies,
    },
    overrides: {
      companies: readYaml(paths.overrides.companies, CompanyOverridesFile).companies,
      games: readYaml(paths.overrides.games, GameOverridesFile).games,
      people: readYaml(paths.overrides.people, PeopleOverridesFile).people,
      technology: readYaml(paths.overrides.technology, TechnologyOverridesFile),
      relationships: readYaml(paths.overrides.relationships, RelationshipOverridesFile).relationships,
    },
    mappings: {
      companies: readYaml(paths.mappings.companies, MappingsFile),
      games: readYaml(paths.mappings.games, MappingsFile),
    },
    decisions: readYaml(paths.review.decisions, DecisionsFile).decisions,
  };
}
export type Sources = ReturnType<typeof loadSources>;

export interface GeneratedState {
  companies: GeneratedCompany[];
  games: GeneratedGame[];
  technologies: GeneratedTechnology[];
  issues: ResolutionIssue[];
}

const readArray = <S extends z.ZodType>(path: string, schema: S): z.output<S>[] =>
  exists(path) ? parseWith(z.array(schema), readJson(path), path) : [];

export function loadGenerated(paths: Paths): GeneratedState {
  return {
    companies: readArray(paths.generated.companies, GeneratedCompany),
    games: readArray(paths.generated.games, GeneratedGame),
    technologies: readArray(paths.generated.technologies, GeneratedTechnology),
    issues: readArray(paths.generated.issues, ResolutionIssue),
  };
}

const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => (a.id < b.id ? -1 : 1));

export function writeGenerated(paths: Paths, state: GeneratedState): void {
  parseWith(z.array(GeneratedCompany), state.companies, paths.generated.companies);
  parseWith(z.array(GeneratedGame), state.games, paths.generated.games);
  parseWith(z.array(GeneratedTechnology), state.technologies, paths.generated.technologies);
  writeJson(paths.generated.companies, byId(state.companies));
  writeJson(paths.generated.games, byId(state.games));
  writeJson(paths.generated.technologies, byId(state.technologies));
  writeJson(
    paths.generated.issues,
    [...state.issues].sort((a, b) =>
      `${a.kind}|${a.subject}|${a.field ?? ""}` < `${b.kind}|${b.subject}|${b.field ?? ""}` ? -1 : 1,
    ),
  );
}

export function loadRegistry(paths: Paths): IdRegistry {
  return exists(paths.registry) ? parseWith(IdRegistry, readJson(paths.registry), paths.registry) : IdRegistry.parse({});
}

export function writeRegistry(paths: Paths, registry: IdRegistry): void {
  writeJson(paths.registry, {
    companies: sortKeys(registry.companies),
    games: sortKeys(registry.games),
    technologies: sortKeys(registry.technologies),
  });
}

export function loadHistory(paths: Paths): StatisticsHistory {
  return exists(paths.history)
    ? parseWith(StatisticsHistory, readJson(paths.history), paths.history)
    : StatisticsHistory.parse({});
}

export function writeHistory(paths: Paths, history: StatisticsHistory): void {
  writeJson(paths.history, { steamReviews: sortKeys(history.steamReviews) });
}

export interface Workspace {
  paths: Paths;
  config: DatasetConfig;
  now: Date;
}

export function openWorkspace(paths: Paths, now = new Date()): Workspace {
  return { paths, config: loadConfig(paths), now };
}
