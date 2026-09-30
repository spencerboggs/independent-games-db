import { stableStringify } from "../lib/hash.ts";
import type { Source } from "../schema/common.ts";
import type { OverrideEntry } from "../schema/files.ts";
import { OVERRIDE_CONFIDENCE } from "./priority.ts";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep merge: objects merge recursively, arrays and scalars replace. */
export function deepMerge<T>(target: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : structuredClone(value);
  }
  return out as T;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (isPlainObject(cur) ? cur[key] : undefined), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur = obj;
  for (const key of keys.slice(0, -1)) {
    if (!isPlainObject(cur[key])) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]!] = value;
}

const same = (a: unknown, b: unknown) =>
  stableStringify(a) === stableStringify(b) ||
  (typeof a === "string" && isPlainObject(b) && b.id === a) ||
  (typeof b === "string" && isPlainObject(a) && a.id === b);

/**
 * Applies one override entry. `set` keys may be dot paths
 * ("classification.category") or nested objects; both deep-merge.
 */
export function applyOverride<T extends object>(entity: T, entry: OverrideEntry): T {
  let result = structuredClone(entity) as Record<string, unknown>;
  for (const [key, value] of Object.entries(entry.set ?? {})) {
    if (key.includes(".")) setPath(result, key, structuredClone(value));
    else result = deepMerge(result, { [key]: value });
  }
  for (const [path, values] of Object.entries(entry.append ?? {})) {
    const current = (getPath(result, path) as unknown[] | undefined) ?? [];
    const next = [...current];
    for (const v of values) if (!next.some((c) => same(c, v))) next.push(structuredClone(v));
    setPath(result, path, next);
  }
  for (const [path, values] of Object.entries(entry.remove ?? {})) {
    const current = (getPath(result, path) as unknown[] | undefined) ?? [];
    setPath(result, path, current.filter((c) => !values.some((v) => same(c, v))));
  }
  if (entry.source && Array.isArray(result.sources)) {
    const sources = result.sources as Source[];
    if (!sources.some((s) => same(s, entry.source))) result.sources = [...sources, entry.source];
  }
  if (isPlainObject(result.provenance) || "provenance" in result) {
    const provenance = { ...((result.provenance as Record<string, unknown>) ?? {}) };
    const source = entry.source ?? { type: "manual" as const };
    const leafPaths = (value: unknown, prefix: string): string[] =>
      isPlainObject(value) && Object.keys(value).length
        ? Object.entries(value).flatMap(([k, v]) => leafPaths(v, `${prefix}.${k}`))
        : [prefix];
    const fields = [
      ...Object.entries(entry.set ?? {}).flatMap(([k, v]) => leafPaths(v, k)),
      ...Object.keys(entry.append ?? {}),
      ...Object.keys(entry.remove ?? {}),
    ];
    for (const field of fields) {
      provenance[field] = {
        source: source.type,
        confidence: OVERRIDE_CONFIDENCE[source.type] ?? "high",
        url: source.url ?? null,
        retrievedAt: source.retrievedAt ?? null,
      };
    }
    result.provenance = provenance;
  }
  return result as T;
}

export interface OverrideOutcome<T> {
  entities: Map<string, T>;
  excluded: Set<string>;
  created: Set<string>;
  problems: string[];
}

export function applyOverrides<T extends { id: string }>(
  kind: string,
  entities: Map<string, T>,
  entries: OverrideEntry[],
  blank: (id: string, entry: OverrideEntry) => T,
): OverrideOutcome<T> {
  const excluded = new Set<string>();
  const created = new Set<string>();
  const problems: string[] = [];
  for (const entry of entries) {
    if (entry.exclude) {
      excluded.add(entry.id);
      entities.delete(entry.id);
      continue;
    }
    let entity = entities.get(entry.id);
    if (!entity) {
      if (!entry.create) {
        problems.push(`${kind} override "${entry.id}" targets an unknown ${kind}; add \`create: true\` to add it manually`);
        continue;
      }
      entity = blank(entry.id, entry);
      created.add(entry.id);
    }
    entities.set(entry.id, applyOverride(entity, entry));
  }
  return { entities, excluded, created, problems };
}
