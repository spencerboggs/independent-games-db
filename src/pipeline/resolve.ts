import { groupToIdSet, ID_PROVIDERS, IdClusters, idKeys } from "../lib/clusters.ts";
import { precisionOf, yearOf } from "../lib/dates.ts";
import { stableStringify } from "../lib/hash.ts";
import { allocateId, slugify } from "../lib/ids.ts";
import { log } from "../lib/log.ts";
import { normalizeTitle } from "../lib/names.ts";
import { uniqSorted } from "../lib/io.ts";
import { NON_GAMEPLAY_GENRES, normalizeFeature, normalizeGenre, normalizePlatform } from "../lib/vocab.ts";
import type { ExternalIds, FieldProvenance, Provenance, Source } from "../schema/common.ts";
import type { GameTechnology, TechnologyClaim } from "../schema/entities.ts";
import type {
  GeneratedCompany,
  GeneratedGame,
  GeneratedTechnology,
  ResolutionIssue,
} from "../schema/files.ts";
import type { CompanyRef, ProviderCompanyRecord, ProviderGameRecord } from "../providers/types.ts";
import type { EnrichmentOutput } from "./enrich.ts";
import type { DiscoveryOutput } from "./discover.ts";
import {
  COMPANY_FIELD_PRIORITY,
  GAME_FIELD_PRIORITY,
  rank,
  SOURCE_CONFIDENCE,
  TECHNOLOGY_CLAIM_CONFIDENCE,
} from "./priority.ts";
import { CATEGORY_ROLE, CompanyResolver, TechnologyResolver } from "./resolvers.ts";
import {
  loadGenerated,
  loadRegistry,
  loadSources,
  writeGenerated,
  writeRegistry,
  type GeneratedState,
  type Workspace,
} from "./state.ts";

type Provider = "steam" | "igdb" | "wikidata";

interface Picked<T> {
  value: T;
  record: { provider: string; sourceType: Source["type"]; url: string | null; retrievedAt: string };
  alternatives: { source: Source["type"]; value: unknown }[];
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0)
  );
}

function pick<R extends Picked<unknown>["record"], T>(
  records: R[],
  order: string[],
  get: (r: R) => T | null | undefined,
): Picked<T> | null {
  const sorted = [...records]
    .filter((r) => order.includes(r.provider))
    .sort((a, b) => rank(order, a.provider) - rank(order, b.provider));
  const withValues = sorted.map((r) => ({ r, v: get(r) })).filter((x) => !isEmpty(x.v));
  const first = withValues[0];
  if (!first) return null;
  const chosen = stableStringify(first.v);
  const alternatives = withValues
    .slice(1)
    .filter((x) => stableStringify(x.v) !== chosen)
    .map((x) => ({ source: x.r.sourceType, value: x.v }));
  return { value: first.v as T, record: first.r, alternatives };
}

function provenanceOf(p: Picked<unknown>): FieldProvenance {
  return {
    source: p.record.sourceType,
    confidence: SOURCE_CONFIDENCE[p.record.provider as Provider] ?? "medium",
    url: p.record.url,
    retrievedAt: p.record.retrievedAt,
    ...(p.alternatives.length ? { alternatives: p.alternatives } : {}),
  };
}

function sourceOf(r: Picked<unknown>["record"]): Source {
  return { type: r.sourceType, url: r.url, retrievedAt: r.retrievedAt };
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Map<string, Source>();
  for (const s of sources) seen.set(`${s.type}|${s.url ?? ""}`, s);
  return [...seen.values()].sort((a, b) => (`${a.type}${a.url}` < `${b.type}${b.url}` ? -1 : 1));
}

const sortStrings = (values: Iterable<string>) => [...new Set(values)].sort();

export interface ResolveResult extends GeneratedState {
  stats: { games: number; companies: number; newCompanies: number; newTechnologies: number; carried: number };
}

export function resolve(ws: Workspace, enrichment: EnrichmentOutput, discovery?: DiscoveryOutput): ResolveResult {
  const { paths, config } = ws;
  const sources = loadSources(paths);
  const previous = loadGenerated(paths);
  const registry = loadRegistry(paths);
  const issues: ResolutionIssue[] = [];
  const seedIds = new Set(sources.seeds.companies.map((s) => s.id));

  const companies = new CompanyResolver(sources.seeds.companies, previous.companies, sources.mappings.companies, registry);
  const technologies = new TechnologyResolver([...sources.seeds.technologies, ...previous.technologies], registry);
  const observedNames = new Map<string, Set<string>>();
  const resolveCompany = (ref: CompanyRef) => {
    const result = companies.resolve(ref);
    const names = observedNames.get(result.id) ?? new Set();
    names.add(ref.name);
    observedNames.set(result.id, names);
    return result.id;
  };

  // ---- Cluster provider game records by shared external IDs ---------------
  const clusters = new IdClusters();
  for (const record of enrichment.games) clusters.add(record.ids);
  const groups = clusters.groups();
  const groupOfKey = new Map<string, number>();
  groups.forEach((keys, i) => keys.forEach((k) => groupOfKey.set(k, i)));

  const gameMappings = sources.mappings.games.externalIds;
  const previousGames = new Map(previous.games.map((g) => [g.id, g]));
  const takenGameIds = new Set([...previousGames.keys(), ...Object.values(registry.games)]);
  const recordsById = new Map<string, ProviderGameRecord[]>();
  const keysById = new Map<string, Set<string>>();

  const recordsByGroup = new Map<number, ProviderGameRecord[]>();
  for (const record of enrichment.games) {
    const group = groupOfKey.get(idKeys(record.ids)[0]!)!;
    recordsByGroup.set(group, [...(recordsByGroup.get(group) ?? []), record]);
  }

  groups.forEach((keys, index) => {
    const records = recordsByGroup.get(index) ?? [];
    if (!records.length) return;
    const mapped = keys
      .map((k) => {
        const [p, ...rest] = k.split(":");
        return gameMappings[p!]?.[rest.join(":")];
      })
      .find(Boolean);
    const known = sortStrings(keys.map((k) => registry.games[k]).filter(Boolean) as string[]);
    let id = mapped;
    if (!id && known.length) {
      const steamKey = keys.find((k) => k.startsWith("steam:"));
      id = (steamKey && registry.games[steamKey]) || known[0]!;
      if (known.length > 1) {
        issues.push({
          kind: "potential-duplicate",
          entityType: "game",
          subject: id,
          related: known.filter((k) => k !== id),
          message: `Provider IDs now link previously separate games ${known.join(", ")}; merged into ${id}`,
          details: { keys },
        });
      }
    }
    if (!id) {
      const title = pick(records, GAME_FIELD_PRIORITY.title!, (r) => r.title)?.value ?? keys[0]!;
      const date = pick(records, GAME_FIELD_PRIORITY.releaseDate!, (r) => r.releaseDate)?.value ?? null;
      const year = yearOf(date);
      id = allocateId(year ? [title, `${title} ${year}`] : [title], takenGameIds);
    }
    takenGameIds.add(id);
    recordsById.set(id, [...(recordsById.get(id) ?? []), ...records]);
    const keySet = keysById.get(id) ?? new Set();
    keys.forEach((k) => keySet.add(k));
    keysById.set(id, keySet);
  });

  const idForKey = (ids: { steam?: string; wikidata?: string; igdb?: string } | null | undefined) => {
    if (!ids) return null;
    for (const key of idKeys(ids)) {
      for (const [id, keys] of keysById) if (keys.has(key)) return id;
    }
    return null;
  };

  // ---- Merge each cluster into one generated game --------------------------
  const failedProviders = new Set(enrichment.providers.filter((p) => p.status === "error").map((p) => p.id));
  const includeTypes = new Set(config.policies.includeGameTypes);
  const games = new Map<string, GeneratedGame>();
  let carried = 0;

  for (const [id, records] of [...recordsById].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const prior = previousGames.get(id);
    if (prior && prior.sources.some((s) => failedProviders.has(s.type) && !records.some((r) => r.provider === s.type))) {
      games.set(id, prior);
      carried++;
      continue;
    }
    const game = mergeGame(id, records);
    if (!includeTypes.has(game.type)) continue;
    if (!game.statistics.steam && prior?.statistics.steam && prior.externalIds.steam === game.externalIds.steam) {
      game.statistics = prior.statistics;
    }
    games.set(id, game);
  }

  for (const prior of previous.games) {
    if (!games.has(prior.id) && !recordsById.has(prior.id)) {
      games.set(prior.id, prior);
      carried++;
    }
  }

  function mergeGame(id: string, records: ProviderGameRecord[]): GeneratedGame {
    const provenance: Provenance = {};
    const field = <T>(name: string, get: (r: ProviderGameRecord) => T | null | undefined): T | null => {
      const picked = pick(records, GAME_FIELD_PRIORITY[name]!, get);
      if (!picked) return null;
      provenance[name] = provenanceOf(picked);
      return picked.value;
    };

    const titlePick = pick(records, GAME_FIELD_PRIORITY.title!, (r) => r.title);
    const title = titlePick?.value ?? id;
    if (titlePick) provenance.title = provenanceOf(titlePick);

    let releaseDate = field("releaseDate", (r) => r.releaseDate);
    if (releaseDate && precisionOf(releaseDate) !== "day") {
      const finer = records
        .map((r) => r.releaseDate)
        .filter((d): d is string => !!d && d.startsWith(releaseDate!) && d.length > releaseDate!.length)
        .sort((a, b) => b.length - a.length)[0];
      if (finer) releaseDate = finer;
    }
    const today = ws.now.toISOString().slice(0, 10);
    const releaseStatus =
      field("releaseStatus", (r) => (r.provider === "steam" ? r.releaseStatus : null)) ??
      (releaseDate ? (releaseDate <= today.slice(0, releaseDate.length) ? "released" : "upcoming") : "unknown");

    const companyField = (name: "developers" | "publishers") => {
      const picked = pick(records, GAME_FIELD_PRIORITY[name]!, (r) => r[name]);
      if (!picked) return [];
      provenance[name] = provenanceOf(picked);
      const chosen = sortStrings(picked.value.map(resolveCompany));
      for (const record of records) {
        if (record === picked.record || !record[name]?.length) continue;
        const others = record[name]!.map((ref) => ({ ref, id: companies.find(ref) }));
        for (const o of others) if (o.id && chosen.includes(o.id)) resolveCompany(o.ref);
        const otherIds = sortStrings(others.map((o) => o.id).filter(Boolean) as string[]);
        const unmatched = others
          .filter((o) => !o.id)
          .map((o) => ({ name: o.ref.name, ids: o.ref.ids, suggestions: companies.similar(o.ref.name).filter((s) => chosen.includes(s.id)) }));
        const overlap = otherIds.some((o) => chosen.includes(o));
        if (!overlap && (otherIds.length || unmatched.length)) {
          const hint = unmatched.flatMap((u) => u.suggestions.map((s) => `"${u.name}" may be ${s.id}`));
          issues.push({
            kind: "source-conflict",
            entityType: "game",
            subject: id,
            related: otherIds,
            field: name,
            message: `${picked.record.sourceType} and ${record.sourceType} disagree on ${name} for "${title}"${hint.length ? ` (${hint.join("; ")})` : ""}`,
            details: {
              chosen: { source: picked.record.sourceType, value: picked.value.map((r) => r.name), ids: chosen },
              other: { source: record.sourceType, value: record[name]!.map((r) => r.name) },
              unmatched,
            },
          });
        }
      }
      return chosen;
    };

    const technology: GameTechnology = { engines: [], middleware: [], languages: [], tools: [] };
    const claims = new Map<string, { claim: TechnologyClaim; role: keyof GameTechnology; providers: Set<string> }>();
    for (const record of [...records].sort((a, b) => rank(["wikidata", "igdb", "steam"], a.provider) - rank(["wikidata", "igdb", "steam"], b.provider))) {
      for (const ref of record.technology ?? []) {
        const { id: techId, created } = technologies.resolve(ref);
        const role = ref.role ?? CATEGORY_ROLE[technologies.categories.get(techId) ?? "other"];
        const existing = claims.get(`${role}|${techId}`);
        if (existing) {
          existing.providers.add(record.provider);
          continue;
        }
        claims.set(`${role}|${techId}`, {
          role,
          providers: new Set([record.provider]),
          claim: {
            id: techId,
            confidence: TECHNOLOGY_CLAIM_CONFIDENCE[record.provider as Provider] ?? "medium",
            source: sourceOf(record),
          },
        });
        if (created) {
          issues.push({
            kind: "unmatched-technology",
            entityType: "technology",
            subject: techId,
            related: [id],
            message: `${record.sourceType} reports technology "${ref.name}" which is not in data/seeds/technologies.yaml`,
            details: { name: ref.name, role, source: record.sourceType },
          });
        }
      }
    }
    for (const { claim, role, providers } of claims.values()) {
      if (providers.size > 1 && claim.confidence === "medium") claim.confidence = "high";
      technology[role].push(claim);
    }
    for (const role of Object.keys(technology) as (keyof GameTechnology)[]) {
      technology[role].sort((a, b) => (a.id < b.id ? -1 : 1));
    }

    const union = (get: (r: ProviderGameRecord) => string[] | undefined) =>
      sortStrings(records.flatMap((r) => get(r) ?? []));
    const links: Record<string, string> = {};
    for (const r of [...records].sort((a, b) => rank(["steam", "igdb", "wikidata"], a.provider) - rank(["steam", "igdb", "wikidata"], b.provider))) {
      for (const [k, v] of Object.entries(r.links ?? {})) links[k] ??= v;
    }
    const website = field("website", (r) => r.website);
    if (website) links.official = website;

    const externalIds: ExternalIds = {};
    const idSet = groupToIdSet([...(keysById.get(id) ?? [])]);
    const steamRecord = records.find((r) => r.provider === "steam");
    for (const p of ID_PROVIDERS) {
      const value = p === "steam" && steamRecord?.ids.steam ? steamRecord.ids.steam : idSet[p];
      if (value) externalIds[p] = value;
    }

    const media = field("media", (r) => r.media) ?? {};
    const description = field("description", (r) => r.description);
    const franchise = field("franchise", (r) => r.franchise);
    const series = field("series", (r) => r.series);
    const type = field("type", (r) => r.type) ?? "game";

    return {
      id,
      title,
      alternateTitles: sortStrings(
        [...records.flatMap((r) => r.alternateTitles ?? []), ...records.map((r) => r.title ?? "")].filter(
          (t) => t && t !== title,
        ),
      ),
      type,
      releaseDate,
      releaseDatePrecision: precisionOf(releaseDate),
      releaseStatus,
      developers: companyField("developers"),
      publishers: companyField("publishers"),
      descriptions: { source: description, custom: null },
      genres: uniqSorted(union((r) => r.genres).map(normalizeGenre)).filter((g) => !NON_GAMEPLAY_GENRES.has(g)),
      tags: uniqSorted(union((r) => r.tags).map(normalizeGenre)),
      features: uniqSorted((field("features", (r) => r.features) ?? []).map(normalizeFeature)),
      platforms: uniqSorted(union((r) => r.platforms).map(normalizePlatform)),
      supportedLanguages: field("supportedLanguages", (r) => r.supportedLanguages) ?? [],
      externalIds,
      links: Object.fromEntries(Object.entries(links).sort(([a], [b]) => (a < b ? -1 : 1))),
      media: {
        header: media.header ?? null,
        capsule: media.capsule ?? null,
        background: media.background ?? null,
        screenshots: media.screenshots ?? [],
      },
      technology,
      franchise: franchise ? { id: slugify(franchise), name: franchise } : null,
      series: series ? { id: slugify(series), name: series } : null,
      relations: {
        parentGame: idForKey(field("relations.parentGame", (r) => r.parent) ?? undefined),
        dlc: sortStrings(records.flatMap((r) => (r.dlc ?? []).map((d) => idForKey(d))).filter(Boolean) as string[]),
        remasterOf: null,
        portOf: null,
      },
      statistics: { steam: steamRecord?.steamStatistics ?? null, reviewVelocity: null },
      sources: dedupeSources(records.map(sourceOf)),
      provenance: Object.fromEntries(Object.entries(provenance).sort(([a], [b]) => (a < b ? -1 : 1))),
    };
  }

  for (const game of games.values()) {
    const parent = game.relations.parentGame;
    if (parent && games.has(parent)) {
      const p = games.get(parent)!;
      if (!p.relations.dlc.includes(game.id)) p.relations.dlc = sortStrings([...p.relations.dlc, game.id]);
    }
    game.relations.dlc = game.relations.dlc.filter((d) => games.has(d) && d !== game.id);
    if (game.relations.parentGame && !games.has(game.relations.parentGame)) game.relations.parentGame = null;
  }

  // ---- Duplicate game detection ------------------------------------------
  const distinctGames = new Set(sources.mappings.games.distinct.map(([a, b]) => [a, b].sort().join("|")));
  const byTitle = new Map<string, GeneratedGame[]>();
  for (const game of games.values()) {
    const key = normalizeTitle(game.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), game]);
  }
  for (const group of byTitle.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i]!, group[j]!];
        if (distinctGames.has([a.id, b.id].sort().join("|"))) continue;
        if (a.type !== b.type) continue;
        const shared = a.developers.some((d) => b.developers.includes(d));
        if (!shared) continue;
        issues.push({
          kind: "potential-duplicate",
          entityType: "game",
          subject: a.id,
          related: [b.id],
          message: `"${a.title}" (${a.id}) and "${b.title}" (${b.id}) share a title and developer`,
          details: { a: a.externalIds, b: b.externalIds },
        });
      }
    }
  }

  // ---- Companies -----------------------------------------------------------
  const referenced = new Set<string>();
  for (const game of games.values()) for (const c of [...game.developers, ...game.publishers]) referenced.add(c);
  const companyIds = sortStrings([...seedIds, ...referenced]);
  const previousCompanies = new Map(previous.companies.map((c) => [c.id, c]));
  const seedsById = new Map(sources.seeds.companies.map((s) => [s.id, s]));

  const companyRecords = enrichment.companies;
  const recordsForCompany = (id: string): ProviderCompanyRecord[] =>
    companyRecords.filter((r) => companies.find({ name: r.name ?? "", ids: r.ids }) === id);

  for (const record of companyRecords) {
    const id = companies.find({ name: record.name ?? "", ids: record.ids });
    if (id && companyIds.includes(id)) resolveCompany({ name: record.name ?? "", ids: record.ids });
  }

  const generatedCompanies: GeneratedCompany[] = [];
  for (const id of companyIds) {
    const records = recordsForCompany(id);
    const prior = previousCompanies.get(id);
    const seed = seedsById.get(id);
    if (!records.length && prior && !seed) {
      generatedCompanies.push(prior);
      continue;
    }
    const provenance: Provenance = {};
    const field = <T>(name: string, get: (r: ProviderCompanyRecord) => T | null | undefined): T | null => {
      const picked = pick(records, COMPANY_FIELD_PRIORITY[name]!, get);
      if (!picked) return null;
      provenance[name] = provenanceOf(picked);
      return picked.value;
    };
    const created = companies.created.get(id);
    const name = field("name", (r) => r.name) ?? seed?.name ?? prior?.name ?? created?.name ?? id;
    const parent = field("parent", (r) => r.parent);
    const foundedDate = field("foundedDate", (r) => r.foundedDate);
    const dissolved = records.some((r) => r.dissolved);
    const parentId = parent ? companies.find(parent) : null;
    const externalIds: ExternalIds = {};
    for (const r of records) for (const p of ID_PROVIDERS) if (r.ids[p] && !externalIds[p]) externalIds[p] = r.ids[p];
    for (const p of ID_PROVIDERS) {
      const v = created?.ids[p] ?? prior?.externalIds[p];
      if (v && !externalIds[p]) externalIds[p] = v;
    }
    const aliases = sortStrings(
      [...records.flatMap((r) => r.aliases ?? []), ...(observedNames.get(id) ?? []), ...records.map((r) => r.name ?? "")].filter(
        (a) => a && a !== name && a.length <= 120,
      ),
    );

    generatedCompanies.push({
      id,
      name,
      aliases,
      roles: [],
      description: { source: field("description", (r) => r.description), custom: null },
      website: field("website", (r) => r.website),
      socialLinks: Object.fromEntries(Object.entries(field("socialLinks", (r) => r.socialLinks) ?? {}).sort()),
      location: {
        headquarters: field("headquarters", (r) => r.headquarters),
        country: field("country", (r) => r.country),
        countryName: records.find((r) => r.countryName)?.countryName ?? null,
      },
      founded: foundedDate ? Number(foundedDate.slice(0, 4)) : null,
      foundedDate,
      ownership: {
        status: parent ? "subsidiary" : dissolved ? "defunct" : "unknown",
        parentCompany: parentId && parentId !== id ? parentId : null,
        parentCompanyName: parent?.name ?? null,
        notes: null,
      },
      externalIds,
      logo: null,
      classification: seed?.classification
        ? { include: seed.classification.include, category: seed.classification.category, notes: seed.classification.notes }
        : prior?.classification ?? { include: false, category: "unclassified", notes: "" },
      sources: dedupeSources(records.map(sourceOf)),
      provenance: Object.fromEntries(Object.entries(provenance).sort(([a], [b]) => (a < b ? -1 : 1))),
    });
  }

  // ---- Technologies --------------------------------------------------------
  const generatedTechnologies = new Map<string, GeneratedTechnology>(previous.technologies.map((t) => [t.id, t]));
  for (const [id, tech] of technologies.created) {
    if (generatedTechnologies.has(id)) continue;
    const externalIds: ExternalIds = {};
    for (const p of ID_PROVIDERS) if (tech.ids[p]) externalIds[p] = tech.ids[p];
    generatedTechnologies.set(id, {
      id,
      name: tech.name,
      aliases: [],
      category: tech.category,
      subcategory: null,
      developer: null,
      website: null,
      license: "unknown",
      description: { source: null, custom: null },
      externalIds,
      sources: [],
    });
  }

  // ---- Seed ID suggestions from discovery ---------------------------------
  for (const [companyId, suggestion] of Object.entries(discovery?.suggestedCompanyIds ?? {})) {
    issues.push({
      kind: "ambiguous-match",
      entityType: "company",
      subject: companyId,
      related: [],
      field: "externalIds",
      message:
        suggestion.candidates.length === 1
          ? `Seed has no ${suggestion.provider} ID; found exactly one candidate. Confirm by adding it to the seed.`
          : `Seed has no ${suggestion.provider} ID; found ${suggestion.candidates.length} candidates.`,
      details: { candidates: suggestion.candidates },
    });
  }

  // ---- Registry --------------------------------------------------------------
  for (const [id, keys] of keysById) for (const key of keys) registry.games[key] ??= id;

  const state: GeneratedState = {
    companies: generatedCompanies,
    games: [...games.values()],
    technologies: [...generatedTechnologies.values()],
    issues: [...issues, ...companies.issues],
  };
  writeGenerated(paths, state);
  writeRegistry(paths, registry);

  const stats = {
    games: state.games.length,
    companies: state.companies.length,
    newCompanies: companies.created.size,
    newTechnologies: technologies.created.size,
    carried,
  };
  log.info(
    `  resolved ${stats.games} games, ${stats.companies} companies (${stats.newCompanies} new), ${stats.newTechnologies} new technologies, ${carried} carried over`,
  );
  return { ...state, stats };
}
