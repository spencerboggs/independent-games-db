/**
 * Legal-entity suffixes that never distinguish two companies from each other.
 * `normalizeCompanyName` keeps words like "games" and "studios".
 * `looseCompanyName` strips those trailing words, but keeps "publishing",
 * so "Coffee Stain Studios" and "Coffee Stain Publishing" stay different.
 */
const LEGAL_SUFFIXES = [
  "incorporated",
  "inc",
  "llc",
  "l l c",
  "ltd",
  "limited",
  "pty",
  "pty ltd",
  "plc",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "ug",
  "ag",
  "ab",
  "publ",
  "oy",
  "oyj",
  "as",
  "a s",
  "aps",
  "bv",
  "b v",
  "nv",
  "sa",
  "s a",
  "sas",
  "sarl",
  "srl",
  "spa",
  "kk",
  "k k",
  "co ltd",
  "sp z o o",
  "s r o",
  "sro",
];

const GENERIC_WORDS = new Set([
  "the",
  "games",
  "game",
  "studio",
  "studios",
  "entertainment",
  "interactive",
  "digital",
  "software",
  "productions",
  "production",
  "media",
  "labs",
  "team",
  "publishing",
  "works",
]);

function basicNormalize(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalized form used for exact-equivalence matching. */
export function normalizeCompanyName(name: string): string {
  let value = basicNormalize(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (value.endsWith(` ${suffix}`)) {
        value = value.slice(0, -suffix.length - 1).trim();
        changed = true;
      }
    }
  }
  return value;
}

/** Trailing words that do not make a second company. "publishing" is not in this list. */
const TRAILING_WORDS = [
  "games",
  "game",
  "studios",
  "studio",
  "entertainment",
  "interactive",
  "software",
  "productions",
  "production",
  "media",
  "labs",
  "works",
  "digital",
  "vr",
];

/**
 * Name used to fold "PlaySide" into "PlaySide Studios", or "Bossa Games" into "Bossa Studios".
 * Parenthetical asides are dropped first. Returns "" when nothing remains.
 */
export function looseCompanyName(name: string): string {
  let value = normalizeCompanyName(name.replace(/\s*\([^)]*\)/g, " "));
  let changed = true;
  while (changed && value) {
    changed = false;
    for (const word of TRAILING_WORDS) {
      if (value === word) return "";
      if (value.endsWith(` ${word}`)) {
        value = value.slice(0, -word.length - 1).trim();
        changed = true;
      }
    }
  }
  return value;
}

/** Aggressive form used only to *flag* possible duplicates, never to merge. */
export function coreCompanyName(name: string): string {
  const words = normalizeCompanyName(name)
    .split(" ")
    .filter((w) => w && !GENERIC_WORDS.has(w));
  return words.join(" ");
}

/** Technology names: no suffix stripping, and "#"/"+" are significant (C, C#, C++). */
export function normalizeTechnologyName(name: string): string {
  return basicNormalize(name.replace(/#/g, " sharp ").replace(/\+/g, " plus "));
}

export function normalizeTitle(title: string): string {
  return basicNormalize(title.replace(/[™®©]/g, ""))
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
