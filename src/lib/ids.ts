import { ID_PATTERN } from "../schema/common.ts";

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * Allocates a new ID that does not collide with `taken`. Candidates are tried
 * in order; if all collide, a numeric suffix is appended to the first.
 */
export function allocateId(candidates: string[], taken: Set<string>): string {
  const cleaned = candidates.map(slugify).filter(Boolean);
  for (const candidate of cleaned) {
    if (!taken.has(candidate)) return candidate;
  }
  const base = cleaned[0] ?? "entity";
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
