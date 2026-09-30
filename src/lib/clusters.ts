import type { ExternalIdSet } from "../providers/types.ts";

export const ID_PROVIDERS = ["steam", "wikidata", "igdb"] as const;
export type IdProvider = (typeof ID_PROVIDERS)[number];

export function idKeys(ids: ExternalIdSet): string[] {
  return ID_PROVIDERS.filter((p) => ids[p]).map((p) => `${p}:${ids[p]}`);
}

/** Union-find over external-ID keys ("steam:367520", "wikidata:Q29300592", ...). */
export class IdClusters {
  private readonly parent = new Map<string, string>();

  private find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let node = key;
    while (node !== root) {
      const next = this.parent.get(node)!;
      this.parent.set(node, root);
      node = next;
    }
    return root;
  }

  add(ids: ExternalIdSet): void {
    const keys = idKeys(ids);
    for (const key of keys) if (!this.parent.has(key)) this.parent.set(key, key);
    for (let i = 1; i < keys.length; i++) this.union(keys[0]!, keys[i]!);
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }

  has(key: string): boolean {
    return this.parent.has(key);
  }

  rootOf(ids: ExternalIdSet): string | null {
    const key = idKeys(ids)[0];
    return key && this.parent.has(key) ? this.find(key) : null;
  }

  /** All clusters as sorted key lists, in deterministic order. */
  groups(): string[][] {
    const groups = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const list = groups.get(root) ?? [];
      list.push(key);
      groups.set(root, list);
    }
    return [...groups.values()].map((g) => g.sort()).sort((a, b) => (a[0]! < b[0]! ? -1 : 1));
  }
}

/** Collapses a key group into one ID set (lowest Steam app ID wins when several exist). */
export function groupToIdSet(keys: string[]): ExternalIdSet {
  const set: ExternalIdSet = {};
  for (const provider of ID_PROVIDERS) {
    const values = keys.filter((k) => k.startsWith(`${provider}:`)).map((k) => k.slice(provider.length + 1));
    if (!values.length) continue;
    values.sort((a, b) => (provider === "steam" ? Number(a) - Number(b) : a < b ? -1 : 1));
    set[provider] = values[0];
  }
  return set;
}
