import { join } from "node:path";
import { shortHash, stableStringify } from "../lib/hash.ts";
import { exists, readJson, writeJson, writeText } from "../lib/io.ts";
import { log } from "../lib/log.ts";
import type { Company, Game, Relationship } from "../schema/entities.ts";
import type { ResolutionIssue, ReviewCandidate } from "../schema/files.ts";
import { assemble, type Dataset } from "./assemble.ts";
import { loadGenerated, loadSources, type Workspace } from "./state.ts";

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ChangeReport {
  date: string;
  datasetVersion: string;
  counts: { games: number; companies: number; technologies: number; relationships: number };
  newGames: Game[];
  removedGames: { id: string; title: string }[];
  newCompanies: Company[];
  removedCompanies: { id: string; name: string }[];
  changedGames: { id: string; title: string; changes: FieldChange[] }[];
  changedCompanies: { id: string; name: string; changes: FieldChange[] }[];
  reviewCountChanges: { id: string; title: string; from: number; to: number }[];
  relationshipsAdded: Relationship[];
  relationshipsRemoved: Relationship[];
  issues: ResolutionIssue[];
  lowConfidence: { game: string; title: string; technology: string; confidence: string; source: string }[];
}

const readPrevious = <T>(ws: Workspace, file: string): T[] => {
  const path = join(ws.paths.latest, "full", file);
  return exists(path) ? readJson<T[]>(path) : [];
};

const eq = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

const GAME_FIELDS: [string, (g: Game) => unknown][] = [
  ["title", (g) => g.title],
  ["type", (g) => g.type],
  ["releaseDate", (g) => g.releaseDate],
  ["releaseStatus", (g) => g.releaseStatus],
  ["developers", (g) => g.developers],
  ["publishers", (g) => g.publishers],
  ["platforms", (g) => g.platforms],
  ["engines", (g) => g.technology.engines.map((e) => e.id)],
  ["middleware", (g) => g.technology.middleware.map((e) => e.id)],
  ["languages", (g) => g.technology.languages.map((e) => e.id)],
  ["tools", (g) => g.technology.tools.map((e) => e.id)],
];

const COMPANY_FIELDS: [string, (c: Company) => unknown][] = [
  ["name", (c) => c.name],
  ["classification", (c) => c.classification],
  ["roles", (c) => c.roles],
  ["parentCompany", (c) => c.ownership.parentCompanyName],
  ["ownership.status", (c) => c.ownership.status],
  ["country", (c) => c.location.country],
  ["founded", (c) => c.founded],
];

export function diffDatasets(ws: Workspace, dataset: Dataset): ChangeReport {
  const prevGames = new Map(readPrevious<Game>(ws, "games.json").map((g) => [g.id, g]));
  const prevCompanies = new Map(readPrevious<Company>(ws, "companies.json").map((c) => [c.id, c]));
  const prevRels = new Map(readPrevious<Relationship>(ws, "relationships.json").map((r) => [r.id, r]));
  const nextGames = new Map(dataset.games.map((g) => [g.id, g]));
  const nextCompanies = new Map(dataset.companies.map((c) => [c.id, c]));
  const nextRels = new Map(dataset.relationships.map((r) => [r.id, r]));
  const generated = loadGenerated(ws.paths);

  const changedGames: ChangeReport["changedGames"] = [];
  const reviewCountChanges: ChangeReport["reviewCountChanges"] = [];
  const lowConfidence: ChangeReport["lowConfidence"] = [];
  for (const game of dataset.games) {
    const prev = prevGames.get(game.id);
    for (const [role, claims] of Object.entries(game.technology)) {
      for (const claim of claims) {
        const before = prev?.technology[role as keyof Game["technology"]].find((c) => c.id === claim.id);
        const isNew = !before || before.confidence !== claim.confidence;
        if (isNew && !["verified", "high"].includes(claim.confidence)) {
          lowConfidence.push({ game: game.id, title: game.title, technology: claim.id, confidence: claim.confidence, source: claim.source.type });
        }
      }
    }
    if (!prev) continue;
    const changes = GAME_FIELDS.filter(([, get]) => !eq(get(prev), get(game))).map(([field, get]) => ({
      field,
      from: get(prev),
      to: get(game),
    }));
    if (changes.length) changedGames.push({ id: game.id, title: game.title, changes });
    const from = prev.statistics.steam?.reviewCount;
    const to = game.statistics.steam?.reviewCount;
    if (from !== undefined && to !== undefined && from !== to) reviewCountChanges.push({ id: game.id, title: game.title, from, to });
  }

  const changedCompanies: ChangeReport["changedCompanies"] = [];
  for (const company of dataset.companies) {
    const prev = prevCompanies.get(company.id);
    if (!prev) continue;
    const changes = COMPANY_FIELDS.filter(([, get]) => !eq(get(prev), get(company))).map(([field, get]) => ({
      field,
      from: get(prev),
      to: get(company),
    }));
    if (changes.length) changedCompanies.push({ id: company.id, name: company.name, changes });
  }

  return {
    date: ws.now.toISOString().slice(0, 10),
    datasetVersion: ws.config.datasetVersion,
    counts: {
      games: dataset.games.length,
      companies: dataset.companies.length,
      technologies: dataset.technologies.length,
      relationships: dataset.relationships.length,
    },
    newGames: dataset.games.filter((g) => !prevGames.has(g.id)),
    removedGames: [...prevGames.values()].filter((g) => !nextGames.has(g.id)).map((g) => ({ id: g.id, title: g.title })),
    newCompanies: dataset.companies.filter((c) => !prevCompanies.has(c.id)),
    removedCompanies: [...prevCompanies.values()].filter((c) => !nextCompanies.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
    changedGames,
    changedCompanies,
    reviewCountChanges: reviewCountChanges.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)),
    relationshipsAdded: [...nextRels.values()].filter((r) => !prevRels.has(r.id)),
    relationshipsRemoved: [...prevRels.values()].filter((r) => !nextRels.has(r.id)),
    issues: generated.issues,
    lowConfidence,
  };
}

function candidate(
  c: Omit<ReviewCandidate, "id" | "related"> & { related?: ReviewCandidate["related"]; key?: unknown },
): ReviewCandidate {
  const { key, ...rest } = c;
  return {
    id: `${c.category}:${c.subject.id}:${shortHash(stableStringify(key ?? c.details))}`,
    related: [],
    ...rest,
  };
}

export function buildCandidates(ws: Workspace, report: ChangeReport, dataset: Dataset): ReviewCandidate[] {
  const sources = loadSources(ws.paths);
  const seeded = new Set(sources.seeds.companies.map((s) => s.id));
  const hadPrevious = exists(join(ws.paths.latest, "full", "games.json"));
  const companyName = new Map(dataset.companies.map((c) => [c.id, c.name]));
  const gameTitle = new Map(dataset.games.map((g) => [g.id, g.title]));
  const out: ReviewCandidate[] = [];

  for (const c of report.newCompanies.filter((c) => !seeded.has(c.id))) {
    out.push(
      candidate({
        category: "new-company",
        subject: { type: "company", id: c.id },
        title: `New company: ${c.name}`,
        summary: `Discovered as ${c.roles.join("/") || "a related company"} of ${[...c.games.developed, ...c.games.published].map((g) => gameTitle.get(g) ?? g).join(", ")}. Not yet in the curated set.`,
        details: { name: c.name, aliases: c.aliases, externalIds: c.externalIds, country: c.location.country, parent: c.ownership.parentCompanyName, games: c.games },
        key: { id: c.id },
        actions: ["approve", "reject", "merge", "edit", "ignore"],
      }),
    );
  }

  if (hadPrevious) {
    for (const g of report.newGames) {
      out.push(
        candidate({
          category: "new-game",
          subject: { type: "game", id: g.id },
          title: `New game: ${g.title}`,
          summary: `${g.type}, ${g.releaseDate ?? "no release date"}; developers: ${g.developers.map((d) => companyName.get(d) ?? d).join(", ") || "none"}; publishers: ${g.publishers.map((d) => companyName.get(d) ?? d).join(", ") || "none"}.`,
          details: { title: g.title, type: g.type, releaseDate: g.releaseDate, developers: g.developers, publishers: g.publishers, externalIds: g.externalIds, sources: g.sources },
          key: { id: g.id },
          actions: ["approve", "reject", "merge", "edit", "ignore"],
        }),
      );
    }
    const newGameIds = new Set(report.newGames.map((g) => g.id));
    for (const [change, rels] of [["added", report.relationshipsAdded], ["removed", report.relationshipsRemoved]] as const) {
      for (const r of rels) {
        if (!["developer", "publisher", "subsidiary-of"].includes(r.type)) continue;
        if (newGameIds.has(r.to)) continue;
        out.push(
          candidate({
            category: "relationship-change",
            subject: { type: r.fromType, id: r.from },
            related: [{ type: r.toType, id: r.to }],
            title: `Relationship ${change}: ${r.from} ${r.type} ${r.to}`,
            summary: `The ${r.type} relationship between ${r.from} and ${r.to} was ${change} by the latest provider data.`,
            details: { change, relationship: r },
            actions: ["approve", "reject", "ignore"],
          }),
        );
      }
    }
  }

  for (const c of report.changedCompanies) {
    const parent = c.changes.find((ch) => ch.field === "parentCompany");
    if (!parent) continue;
    const company = dataset.companies.find((x) => x.id === c.id)!;
    out.push(
      candidate({
        category: "classification-change",
        subject: { type: "company", id: c.id },
        title: `Ownership changed: ${c.name}`,
        summary: `Parent company changed from ${JSON.stringify(parent.from)} to ${JSON.stringify(parent.to)}. Current classification: ${company.classification.category}.`,
        details: { from: parent.from, to: parent.to, classification: company.classification },
        actions: ["approve", "edit", "ignore"],
      }),
    );
  }

  for (const claim of report.lowConfidence) {
    out.push(
      candidate({
        category: "technology-claim",
        subject: { type: "game", id: claim.game },
        related: [{ type: "technology", id: claim.technology }],
        title: `Technology claim: ${claim.technology} for ${claim.title}`,
        summary: `${claim.source} reports ${claim.technology} (${claim.confidence} confidence). Approve with a source to raise confidence, or reject.`,
        details: claim,
        actions: ["approve", "reject", "edit", "ignore"],
      }),
    );
  }

  for (const issue of report.issues) {
    const category =
      issue.kind === "source-conflict"
        ? "source-conflict"
        : issue.kind === "unmatched-technology"
          ? "technology-claim"
          : "potential-duplicate";
    const suggested = ((issue.details.unmatched ?? []) as { suggestions: unknown[] }[]).some((u) => u.suggestions.length);
    const actions: ReviewCandidate["actions"] =
      issue.kind === "source-conflict"
        ? suggested ? ["merge", "edit", "ignore"] : ["edit", "ignore"]
        : issue.kind === "unmatched-technology"
          ? ["approve", "merge", "reject", "ignore"]
          : issue.kind === "ambiguous-match" && issue.field === "externalIds"
            ? ["edit", "ignore"]
            : ["merge", "reject", "ignore"];
    out.push(
      candidate({
        category,
        subject: { type: issue.entityType, id: issue.subject },
        related: issue.related.map((id) => ({ type: issue.entityType === "technology" ? "game" : issue.entityType, id })),
        title: issue.message,
        summary: issue.kind === "unmatched-technology" ? "Add it to the technology catalog, merge it into an existing entry, or reject the claim." : issue.message,
        details: { kind: issue.kind, field: issue.field ?? null, ...issue.details },
        key: { kind: issue.kind, field: issue.field ?? null, related: issue.related, details: issue.details },
        actions,
      }),
    );
  }

  const decided = new Set(sources.decisions.map((d) => d.candidate));
  const unique = new Map(out.map((c) => [c.id, c]));
  return [...unique.values()].filter((c) => !decided.has(c.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
}

const fmt = (n: number) => n.toLocaleString("en-US");
const show = (v: unknown) => (Array.isArray(v) ? `[${v.join(", ")}]` : v === null || v === undefined ? "none" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function renderReport(report: ChangeReport, candidates: ReviewCandidate[], decidedCount: number): string {
  const lines: string[] = [];
  const section = (title: string, items: string[], limit = Infinity) => {
    if (!items.length) return;
    lines.push(`## ${title} (${items.length})`, "");
    lines.push(...items.slice(0, limit));
    if (items.length > limit) lines.push(`… and ${items.length - limit} more`);
    lines.push("");
  };
  lines.push(`# Database update: ${report.date}`, "");
  lines.push(
    `Dataset ${report.datasetVersion}: ${fmt(report.counts.games)} games, ${fmt(report.counts.companies)} companies, ` +
      `${fmt(report.counts.technologies)} technologies, ${fmt(report.counts.relationships)} relationships.`,
    "",
  );
  section("New games", report.newGames.map((g) => `+ ${g.title} (\`${g.id}\`), ${g.releaseDate ?? "no date"}, by ${g.developers.join(", ") || "unknown"}`));
  section("Removed games", report.removedGames.map((g) => `- ${g.title} (\`${g.id}\`)`));
  section("New companies", report.newCompanies.map((c) => `+ ${c.name} (\`${c.id}\`), ${c.classification.category}${c.classification.include ? "" : ", not in curated set"}`));
  section("Removed companies", report.removedCompanies.map((c) => `- ${c.name} (\`${c.id}\`)`));
  section(
    "Changed",
    [
      ...report.changedGames.map((g) => `~ ${g.title} (\`${g.id}\`)\n${g.changes.map((c) => `  - ${c.field}: ${show(c.from)} → ${show(c.to)}`).join("\n")}`),
      ...report.changedCompanies.map((c) => `~ ${c.name} (\`${c.id}\`)\n${c.changes.map((ch) => `  - ${ch.field}: ${show(ch.from)} → ${show(ch.to)}`).join("\n")}`),
    ],
  );
  section("Review counts", report.reviewCountChanges.map((r) => `~ ${r.title}: ${fmt(r.from)} → ${fmt(r.to)} (${r.to - r.from >= 0 ? "+" : ""}${fmt(r.to - r.from)})`), 15);
  const manual = report.issues.filter((i) => i.kind === "source-conflict");
  if (manual.length) {
    lines.push(`## Manual review (${manual.length})`, "");
    lines.push("These listings use different company names. Pick the right company in `npm run review`, or leave them for later.", "");
    lines.push(
      ...manual.map((i) => {
        const d = i.details as { chosen?: { source: string; value: string[] }; other?: { source: string; value: string[] } };
        return `! ${i.subject} ${i.field}: ${d.chosen?.source} says ${show(d.chosen?.value)}; ${d.other?.source} says ${show(d.other?.value)}`;
      }),
    );
    lines.push("");
  }
  section("Low confidence", report.lowConfidence.map((l) => `? ${l.technology} for ${l.title} (${l.confidence}, via ${l.source})`), 30);
  section(
    "Potential duplicates and ambiguous matches",
    report.issues.filter((i) => i.kind === "potential-duplicate" || i.kind === "ambiguous-match").map((i) => `? ${i.message}`),
  );
  section("Unknown technologies", report.issues.filter((i) => i.kind === "unmatched-technology").map((i) => `? ${i.message}`));
  lines.push(`## Review queue`, "", `${candidates.length} open candidate(s), ${decidedCount} previously decided. Run \`npm run review\` to review locally.`, "");
  return lines.join("\n");
}

export function report(ws: Workspace, dataset: Dataset = assemble(ws)) {
  const changes = diffDatasets(ws, dataset);
  const candidates = buildCandidates(ws, changes, dataset);
  const decided = loadSources(ws.paths).decisions.length;
  const markdown = renderReport(changes, candidates, decided);
  writeJson(ws.paths.review.candidates, candidates);
  writeText(join(ws.paths.reports, `${changes.date}.md`), markdown);
  writeText(join(ws.paths.reports, "latest.md"), markdown);
  log.info(
    `  report: ${changes.newGames.length} new games, ${changes.newCompanies.length} new companies, ` +
      `${changes.changedGames.length + changes.changedCompanies.length} changed, ${candidates.length} review candidates -> reports/latest.md`,
  );
  return { changes, candidates, markdown };
}
