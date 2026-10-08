/**
 * Entity resolution: maps provider-reported names and IDs to canonical IDs.
 *
 * Order of evidence (strongest first):
 *   1. manual mappings (data/mappings/*.yaml)
 *   2. external IDs (seed hints, previously generated entities, the ID registry)
 *   3. exact / normalized names and aliases
 *   4. loose names (trailing words such as "games" or "studios")
 *   5. fuzzy similarity -> never merges; creates a new entity + review candidate
 *
 * A name match is refused when both sides carry *different* IDs for the same
 * provider (e.g. two unrelated companies both called "Evil Empire").
 */
import { allocateId } from "../lib/ids.ts";
import { similarity } from "../lib/fuzzy.ts";
import { coreCompanyName, looseCompanyName, normalizeCompanyName, normalizeTechnologyName } from "../lib/names.ts";
import type { ExternalIds } from "../schema/common.ts";
import type { IdRegistry, MappingsFile, ResolutionIssue, SeedCompany, SeedTechnology } from "../schema/files.ts";
import type { CompanyRef, ExternalIdSet, TechnologyRef } from "../providers/types.ts";
import { ID_PROVIDERS } from "../lib/clusters.ts";
import type { TechnologyCategory, TechnologyRole } from "../schema/entities.ts";

export type MatchMethod = "mapping" | "external-id" | "registry" | "name" | "normalized-name" | "new";

export interface Resolution {
  id: string;
  method: MatchMethod;
  created: boolean;
}

interface Entry {
  id: string;
  name: string;
  names: Set<string>;
  ids: ExternalIds;
  seeded: boolean;
}

export const FUZZY_FLAG_THRESHOLD = 0.93;

function idConflict(a: ExternalIds, b: ExternalIdSet): boolean {
  return ID_PROVIDERS.some((p) => a[p] && b[p] && a[p] !== b[p]);
}

export class CompanyResolver {
  private readonly entries = new Map<string, Entry>();
  private readonly byExternal = new Map<string, string>();
  private readonly byName = new Map<string, Set<string>>();
  private readonly byLoose = new Map<string, Set<string>>();
  private readonly byCompact = new Map<string, Set<string>>();
  readonly created = new Map<string, CompanyRef>();
  readonly issues: ResolutionIssue[] = [];
  private readonly flagged = new Set<string>();
  private readonly distinctPairs: Set<string>;

  constructor(
    seeds: SeedCompany[],
    previous: { id: string; name: string; aliases: string[]; externalIds: ExternalIds }[],
    private readonly mappings: MappingsFile,
    private readonly registry: IdRegistry,
  ) {
    this.distinctPairs = new Set(mappings.distinct.map(([a, b]) => [a, b].sort().join("|")));
    for (const seed of seeds) this.register(seed.id, seed.name, seed.aliases, seed.externalIds, true);
    for (const company of previous) {
      if (!this.entries.has(company.id)) this.register(company.id, company.name, company.aliases, company.externalIds, false);
    }
  }

  private register(id: string, name: string, aliases: string[], ids: ExternalIdSet, seeded: boolean): Entry {
    const entry: Entry = this.entries.get(id) ?? { id, name, names: new Set(), ids: {}, seeded };
    for (const n of [name, ...aliases]) {
      const key = normalizeCompanyName(n);
      if (!key) continue;
      entry.names.add(key);
      const set = this.byName.get(key) ?? new Set();
      set.add(id);
      this.byName.set(key, set);
      const loose = looseCompanyName(n);
      if (loose) {
        const looseSet = this.byLoose.get(loose) ?? new Set();
        looseSet.add(id);
        this.byLoose.set(loose, looseSet);
        const compact = loose.replace(/ /g, "");
        if (compact.length >= 5) {
          const compactSet = this.byCompact.get(compact) ?? new Set();
          compactSet.add(id);
          this.byCompact.set(compact, compactSet);
        }
      }
    }
    for (const p of ID_PROVIDERS) {
      const value = ids[p];
      if (value && !entry.ids[p]) entry.ids[p] = value;
      if (value && !this.byExternal.has(`${p}:${value}`)) this.byExternal.set(`${p}:${value}`, id);
    }
    this.entries.set(id, entry);
    return entry;
  }

  knownIds(): Set<string> {
    return new Set([...this.entries.keys(), ...Object.values(this.registry.companies)]);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Looks up without creating. */
  find(ref: CompanyRef): string | null {
    return this.match(ref)?.id ?? null;
  }

  private match(ref: CompanyRef): Resolution | null {
    for (const p of ID_PROVIDERS) {
      const value = ref.ids[p];
      if (!value) continue;
      const mapped = this.mappings.externalIds[p]?.[value];
      if (mapped) return { id: mapped, method: "mapping", created: false };
    }
    const mappedName = this.mappings.names[ref.name] ?? this.lookupMappedName(ref.name);
    if (mappedName) return { id: mappedName, method: "mapping", created: false };

    for (const p of ID_PROVIDERS) {
      const value = ref.ids[p];
      if (!value) continue;
      const known = this.byExternal.get(`${p}:${value}`);
      if (known) return { id: known, method: "external-id", created: false };
      const registered = this.registry.companies[`${p}:${value}`];
      if (registered) return { id: registered, method: "registry", created: false };
    }

    const key = normalizeCompanyName(ref.name);
    const candidates = [...(this.byName.get(key) ?? [])]
      .map((id) => this.entries.get(id)!)
      .filter((entry) => !idConflict(entry.ids, ref.ids));
    if (candidates.length === 1) {
      const entry = candidates[0]!;
      const folded = this.canonicalLoose(ref);
      if (folded && folded !== entry.id) return { id: folded, method: "normalized-name", created: false };
      return { id: entry.id, method: entry.name === ref.name ? "name" : "normalized-name", created: false };
    }
    if (candidates.length > 1) {
      const seeded = candidates.filter((c) => c.seeded);
      const chosen = (seeded.length === 1 ? seeded[0] : candidates.sort((a, b) => (a.id < b.id ? -1 : 1))[0])!;
      this.flag("ambiguous-match", chosen.id, candidates.map((c) => c.id).filter((id) => id !== chosen.id), {
        message: `"${ref.name}" matches several companies; chose ${chosen.id}`,
        name: ref.name,
      });
      const folded = this.canonicalLoose(ref);
      return { id: folded ?? chosen.id, method: "normalized-name", created: false };
    }
    const looseHit = this.canonicalLoose(ref);
    if (looseHit) return { id: looseHit, method: "normalized-name", created: false };

    const registered = this.registry.companies[`name:${key}`];
    if (registered && !idConflict(this.entries.get(registered)?.ids ?? {}, ref.ids)) {
      return { id: registered, method: "registry", created: false };
    }
    return null;
  }

  /**
   * Folds trailing words such as "games" or "studios", and ignores spaces in short names
   * ("Team 17" and "Team17"). Several companies that differ only by those words collapse
   * to one: the seeded company, otherwise the short name, otherwise the one that already
   * has an external ID, otherwise the shortest name. Two seeded companies are left apart.
   * A shorter name is left unmatched when another company keeps a distinguishing word,
   * such as "publishing" in "Coffee Stain Publishing", and no company is exactly the short name.
   */
  private canonicalLoose(ref: CompanyRef): string | null {
    const loose = looseCompanyName(ref.name);
    if (!loose) return null;
    const ids = new Set(this.byLoose.get(loose) ?? []);
    const compact = loose.replace(/ /g, "");
    if (compact.length >= 5) for (const id of this.byCompact.get(compact) ?? []) ids.add(id);
    const group = [...ids].filter((id) => {
      const entry = this.entries.get(id);
      return !!entry && !idConflict(entry.ids, ref.ids);
    });
    const compatible = group.every((id) =>
      group.every((other) => {
        if (other === id) return true;
        const left = this.entries.get(id)!;
        const right = this.entries.get(other)!;
        return !this.distinctPairs.has([id, other].sort().join("|")) && !idConflict(left.ids, right.ids);
      }),
    );
    if (!group.length || !compatible) return null;
    const seeded = group.filter((id) => this.entries.get(id)!.seeded);
    if (seeded.length > 1) return null;
    const short = group.filter((id) => this.entries.get(id)!.names.has(loose));
    if (seeded.length === 1) {
      if (!short.length && this.looseIsSharedPrefix(loose, seeded[0]!)) return null;
      return seeded[0]!;
    }
    if (!short.length && this.looseIsSharedPrefix(loose, group[0]!)) return null;
    return this.pickStable(short.length ? short : group);
  }

  /** Seeded company, then the one with an external ID, then the shortest name, then the id. */
  private pickStable(ids: string[]): string {
    const seeded = ids.filter((id) => this.entries.get(id)!.seeded);
    const pool = seeded.length === 1 ? seeded : ids;
    const withIds = pool.filter((id) => ID_PROVIDERS.some((p) => this.entries.get(id)!.ids[p]));
    const ranked = (withIds.length === 1 ? withIds : pool).slice().sort((a, b) => {
      const byName = this.entries.get(a)!.name.length - this.entries.get(b)!.name.length;
      if (byName !== 0) return byName;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return ranked[0]!;
  }

  /** True when some other company starts with `loose` and then keeps a word we do not strip. */
  private looseIsSharedPrefix(loose: string, chosenId: string): boolean {
    const prefix = `${loose} `;
    for (const entry of this.entries.values()) {
      if (entry.id === chosenId) continue;
      for (const name of entry.names) {
        if (name.startsWith(prefix) && looseCompanyName(name) !== loose) return true;
      }
    }
    return false;
  }

  private lookupMappedName(name: string): string | undefined {
    const key = normalizeCompanyName(name);
    for (const [mappedName, id] of Object.entries(this.mappings.names)) {
      if (normalizeCompanyName(mappedName) === key) return id;
    }
    return undefined;
  }

  resolve(ref: CompanyRef): Resolution {
    const matched = this.match(ref);
    if (matched) {
      const entry = this.entries.get(matched.id);
      if (entry) this.register(entry.id, entry.name, [ref.name], ref.ids, entry.seeded);
      else this.register(matched.id, ref.name, [], ref.ids, false);
      this.remember(matched.id, ref);
      return matched;
    }

    const id = allocateId([ref.name], this.knownIds());
    this.register(id, ref.name, [], ref.ids, false);
    this.created.set(id, ref);
    this.remember(id, ref);
    this.flagSimilar(id, ref.name);
    return { id, method: "new", created: true };
  }

  private remember(id: string, ref: CompanyRef): void {
    const key = normalizeCompanyName(ref.name);
    if (key && !this.registry.companies[`name:${key}`]) this.registry.companies[`name:${key}`] = id;
    for (const p of ID_PROVIDERS) {
      const value = ref.ids[p];
      if (value && !this.registry.companies[`${p}:${value}`]) this.registry.companies[`${p}:${value}`] = id;
    }
  }

  /** Known companies whose names are close to `name`, best first. Never used to merge automatically. */
  similar(name: string, exclude?: string): { id: string; name: string; score: number }[] {
    const distinct = new Set(this.mappings.distinct.map(([a, b]) => [a, b].sort().join("|")));
    const key = normalizeCompanyName(name);
    const core = coreCompanyName(name);
    const out: { id: string; name: string; score: number }[] = [];
    for (const entry of this.entries.values()) {
      if (entry.id === exclude) continue;
      if (exclude && distinct.has([exclude, entry.id].sort().join("|"))) continue;
      let best = 0;
      for (const other of entry.names) {
        const score = core && core === coreCompanyName(other) ? 0.95 : similarity(key, other);
        best = Math.max(best, score);
      }
      if (best >= FUZZY_FLAG_THRESHOLD) out.push({ id: entry.id, name: entry.name, score: Math.round(best * 100) / 100 });
    }
    return out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  }

  private flagSimilar(id: string, name: string): void {
    for (const match of this.similar(name, id)) {
      this.flag("potential-duplicate", id, [match.id], {
        message: `New company "${name}" looks similar to existing "${match.name}" (${match.score.toFixed(2)})`,
        score: match.score,
      });
    }
  }

  private flag(kind: ResolutionIssue["kind"], subject: string, related: string[], details: Record<string, unknown>): void {
    const key = `${kind}|${subject}|${related.sort().join(",")}`;
    if (this.flagged.has(key)) return;
    this.flagged.add(key);
    const { message, ...rest } = details;
    this.issues.push({ kind, entityType: "company", subject, related, message: String(message), details: rest });
  }
}

const ROLE_CATEGORY: Record<TechnologyRole, TechnologyCategory> = {
  engines: "engine",
  middleware: "middleware",
  languages: "language",
  tools: "tool",
};

export const CATEGORY_ROLE: Record<TechnologyCategory, TechnologyRole> = {
  engine: "engines",
  middleware: "middleware",
  language: "languages",
  tool: "tools",
  framework: "middleware",
  service: "middleware",
  other: "tools",
};

export class TechnologyResolver {
  private readonly byExternal = new Map<string, string>();
  private readonly byName = new Map<string, string>();
  readonly categories = new Map<string, TechnologyCategory>();
  readonly created = new Map<string, { name: string; category: TechnologyCategory; ids: ExternalIdSet }>();

  constructor(
    catalog: (Pick<SeedTechnology, "id" | "name" | "aliases" | "category" | "externalIds">)[],
    private readonly registry: IdRegistry,
  ) {
    for (const tech of catalog) {
      this.categories.set(tech.id, tech.category);
      for (const n of [tech.name, ...tech.aliases]) this.byName.set(normalizeTechnologyName(n), tech.id);
      for (const p of ID_PROVIDERS) {
        const value = tech.externalIds[p];
        if (value) this.byExternal.set(`${p}:${value}`, tech.id);
      }
    }
  }

  resolve(ref: TechnologyRef): { id: string; created: boolean } {
    for (const p of ID_PROVIDERS) {
      const value = ref.ids[p];
      if (!value) continue;
      const id = this.byExternal.get(`${p}:${value}`) ?? this.registry.technologies[`${p}:${value}`];
      if (id) return { id, created: this.created.has(id) };
    }
    const key = normalizeTechnologyName(ref.name);
    const known = this.byName.get(key) ?? this.registry.technologies[`name:${key}`];
    if (known) return { id: known, created: this.created.has(known) };

    const id = allocateId([ref.name], new Set([...this.categories.keys(), ...Object.values(this.registry.technologies)]));
    const category = ROLE_CATEGORY[ref.role ?? "tools"];
    this.categories.set(id, category);
    this.byName.set(key, id);
    this.registry.technologies[`name:${key}`] = id;
    for (const p of ID_PROVIDERS) {
      const value = ref.ids[p];
      if (value) {
        this.byExternal.set(`${p}:${value}`, id);
        this.registry.technologies[`${p}:${value}`] = id;
      }
    }
    this.created.set(id, { name: ref.name, category, ids: ref.ids });
    return { id, created: true };
  }
}
