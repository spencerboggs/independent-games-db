import { categoryLabel, releaseYear, roleLabel } from "./format";
import type { AppData } from "./types";

export interface SearchEntry {
  kind: "game" | "company" | "technology";
  id: string;
  label: string;
  meta: string;
  href: string;
  aliases: string[];
  weight: number;
}

export function buildSearchIndex(data: AppData): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const game of data.games) {
    const studio = game.developers[0] ? data.index.companies.get(game.developers[0])?.name : null;
    const year = releaseYear(game.releaseDate);
    entries.push({
      kind: "game",
      id: game.id,
      label: game.title,
      meta: [studio ?? "Studio unknown", year ? String(year) : null].filter(Boolean).join(" · "),
      href: `/games/${game.id}`,
      aliases: game.alternateTitles ?? [],
      weight: game.statistics?.steam?.reviewCount ?? 0,
    });
  }

  for (const company of data.companies) {
    const roles = company.roles.map(roleLabel).join(", ");
    const section = company.roles.includes("developer") ? "studios" : "publishers";
    entries.push({
      kind: "company",
      id: company.id,
      label: company.name,
      meta: [company.classification?.category ? categoryLabel(company.classification.category) : null, roles]
        .filter(Boolean)
        .join(" · "),
      href: `/${section}/${company.id}`,
      aliases: company.aliases ?? [],
      weight: company.statistics?.totalSteamReviews ?? 0,
    });
  }

  for (const technology of data.technologies) {
    entries.push({
      kind: "technology",
      id: technology.id,
      label: technology.name,
      meta: [categoryLabel(technology.category), `${technology.statistics?.gameCount ?? 0} games`].join(" · "),
      href: `/technologies/${technology.id}`,
      aliases: technology.aliases ?? [],
      weight: technology.statistics?.totalSteamReviews ?? 0,
    });
  }

  return entries;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function score(entry: SearchEntry, query: string): number {
  const label = normalizeText(entry.label);

  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (label.includes(` ${query}`)) return 60;
  if (label.includes(query)) return 40;

  for (const alias of entry.aliases) {
    const value = normalizeText(alias);
    if (value === query) return 70;
    if (value.startsWith(query)) return 50;
    if (value.includes(query)) return 25;
  }

  return 0;
}

export function searchEntries(entries: SearchEntry[], value: string, limit: number): SearchEntry[] {
  const query = normalizeText(value);
  if (query.length < 2) return [];

  const matches: { entry: SearchEntry; score: number }[] = [];

  for (const entry of entries) {
    const match = score(entry, query);
    if (match > 0) matches.push({ entry, score: match });
  }

  matches.sort((a, b) => b.score - a.score || b.entry.weight - a.entry.weight);
  return matches.slice(0, limit).map((match) => match.entry);
}
