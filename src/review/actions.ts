/**
 * Review decisions are applied to human-edited source files only (seeds,
 * overrides, mappings, decisions). Generated output is never touched; run
 * `npm run build:data` afterwards to see the effect.
 */
import YAML from "yaml";
import { z } from "zod";
import { exists, readJsonOr, readText, writeText } from "../lib/io.ts";
import { Confidence, Source } from "../schema/common.ts";
import { ClassificationCategory, TechnologyCategory } from "../schema/entities.ts";
import type { ReviewAction, ReviewCandidate } from "../schema/files.ts";
import { loadGenerated, loadSources, type Workspace } from "../pipeline/state.ts";

export const DecisionPayload = z
  .object({
    note: z.string().optional(),
    target: z.string().optional(),
    category: ClassificationCategory.optional(),
    technologyCategory: TechnologyCategory.optional(),
    confidence: Confidence.optional(),
    source: Source.optional(),
    set: z.record(z.string(), z.unknown()).optional(),
    externalIds: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type DecisionPayload = z.infer<typeof DecisionPayload>;

export class DecisionError extends Error {}

function editYaml(path: string, header: string, mutate: (doc: YAML.Document) => void): void {
  const doc = exists(path) ? YAML.parseDocument(readText(path)) : new YAML.Document({});
  if (!exists(path)) doc.commentBefore = header;
  if (doc.contents === null) doc.contents = doc.createNode({}) as never;
  mutate(doc);
  writeText(path, doc.toString({ lineWidth: 0 }));
}

function appendItem(doc: YAML.Document, key: string, item: unknown): void {
  const seq = doc.get(key);
  if (!YAML.isSeq(seq)) doc.set(key, doc.createNode([item]));
  else seq.add(doc.createNode(item));
}

function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")) as T;
}

export function applyDecision(
  ws: Workspace,
  candidate: ReviewCandidate,
  action: ReviewAction,
  rawPayload: unknown = {},
): { changed: string[] } {
  if (!candidate.actions.includes(action)) throw new DecisionError(`"${action}" is not available for this candidate`);
  const payload = DecisionPayload.parse(rawPayload ?? {});
  const { paths } = ws;
  const changed = new Set<string>();
  const sources = loadSources(paths);
  const generated = loadGenerated(paths);
  const details = candidate.details as Record<string, unknown>;
  const subject = candidate.subject.id;
  const related = candidate.related[0]?.id;
  const need = <T>(value: T | undefined, what: string): T => {
    if (value === undefined || value === null || value === "") throw new DecisionError(`${what} is required for ${action}`);
    return value;
  };

  const companyOverride = (entry: Record<string, unknown>) => {
    editYaml(paths.overrides.companies, " Manual company corrections. See CONTRIBUTING.md.", (doc) => appendItem(doc, "companies", clean(entry)));
    changed.add(paths.overrides.companies);
  };
  const gameOverride = (entry: Record<string, unknown>) => {
    editYaml(paths.overrides.games, " Manual game corrections. See CONTRIBUTING.md.", (doc) => appendItem(doc, "games", clean(entry)));
    changed.add(paths.overrides.games);
  };
  const technologyOverride = (key: "claims" | "technologies", entry: Record<string, unknown>) => {
    editYaml(paths.overrides.technology, " Technology claims and technology corrections.", (doc) => appendItem(doc, key, clean(entry)));
    changed.add(paths.overrides.technology);
  };
  const relationshipOverride = (entry: Record<string, unknown>) => {
    editYaml(paths.overrides.relationships, " Manual relationship corrections.", (doc) => appendItem(doc, "relationships", clean(entry)));
    changed.add(paths.overrides.relationships);
  };
  const mapCompany = (fromId: string, target: string) => {
    const company = generated.companies.find((c) => c.id === fromId);
    const names = company ? [company.name, ...company.aliases] : [String(details.name ?? fromId)];
    editYaml(paths.mappings.companies, " Manually approved company mappings.", (doc) => {
      for (const name of names) doc.setIn(["names", name], target);
      for (const [provider, value] of Object.entries(company?.externalIds ?? {})) doc.setIn(["externalIds", provider, value], target);
    });
    changed.add(paths.mappings.companies);
  };
  const mapGame = (fromId: string, target: string) => {
    const game = generated.games.find((g) => g.id === fromId);
    if (!game) throw new DecisionError(`game "${fromId}" not found in generated data`);
    editYaml(paths.mappings.games, " Manually approved game mappings.", (doc) => {
      for (const [provider, value] of Object.entries(game.externalIds)) doc.setIn(["externalIds", provider, value], target);
    });
    changed.add(paths.mappings.games);
  };
  const distinct = (a: string, b: string, file: string) => {
    editYaml(file, " Manually approved mappings.", (doc) => appendItem(doc, "distinct", [a, b].sort()));
    changed.add(file);
  };
  const isTechCandidate = candidate.subject.type === "technology";
  const entityType = candidate.subject.type;

  if (action !== "ignore") {
    switch (candidate.category) {
      case "new-company": {
        if (action === "approve") {
          const company = generated.companies.find((c) => c.id === subject);
          editYaml(paths.seeds.companies, " Seed companies.", (doc) =>
            appendItem(
              doc,
              "companies",
              clean({
                id: subject,
                name: company?.name ?? String(details.name ?? subject),
                classification: { category: need(payload.category, "category"), notes: payload.note ?? "" },
                externalIds: company && Object.keys(company.externalIds).length ? company.externalIds : undefined,
              }),
            ),
          );
          changed.add(paths.seeds.companies);
        } else if (action === "reject") {
          companyOverride({ id: subject, set: { classification: { include: false, category: "excluded", notes: payload.note ?? "Rejected in review" } }, note: payload.note });
        } else if (action === "merge") {
          mapCompany(subject, need(payload.target, "target"));
        } else if (action === "edit") {
          companyOverride({ id: subject, set: need(payload.set, "set"), source: payload.source, note: payload.note });
        }
        break;
      }
      case "new-game": {
        if (action === "reject") gameOverride({ id: subject, exclude: true, note: payload.note ?? "Rejected in review" });
        else if (action === "merge") mapGame(subject, need(payload.target, "target"));
        else if (action === "edit") gameOverride({ id: subject, set: need(payload.set, "set"), source: payload.source, note: payload.note });
        break;
      }
      case "potential-duplicate": {
        if (action === "merge") {
          const target = payload.target ?? subject;
          const other = target === subject ? need(related, "related entity") : subject;
          if (entityType === "game") mapGame(other, target);
          else mapCompany(other, target);
        } else if (action === "reject") {
          const file = entityType === "game" ? paths.mappings.games : paths.mappings.companies;
          distinct(subject, need(related, "related entity"), file);
        } else if (action === "edit") {
          const ids = need(payload.externalIds, "externalIds");
          editYaml(paths.seeds.companies, " Seed companies.", (doc) => {
            const seq = doc.get("companies");
            if (!YAML.isSeq(seq)) throw new DecisionError("seed file has no companies list");
            const item = seq.items.find((i) => YAML.isMap(i) && i.get("id") === subject);
            if (!YAML.isMap(item)) throw new DecisionError(`seed "${subject}" not found`);
            for (const [k, v] of Object.entries(ids)) item.setIn(["externalIds", k], v);
          });
          changed.add(paths.seeds.companies);
        }
        break;
      }
      case "relationship-change": {
        if (action === "reject") {
          const rel = details.relationship as { from: string; type: string; to: string };
          relationshipOverride(
            details.change === "added"
              ? { from: rel.from, type: rel.type, to: rel.to, remove: true, note: payload.note }
              : { from: rel.from, type: rel.type, to: rel.to, source: payload.source ?? { type: "manual" }, note: payload.note },
          );
        }
        break;
      }
      case "technology-claim": {
        if (isTechCandidate) {
          const name = String(details.name ?? subject);
          if (action === "approve") {
            const tech = generated.technologies.find((t) => t.id === subject);
            editYaml(paths.seeds.technologies, " Technology catalog.", (doc) =>
              appendItem(doc, "technologies", clean({
                id: subject,
                name: tech?.name ?? name,
                category: payload.technologyCategory ?? tech?.category ?? "other",
                externalIds: tech && Object.keys(tech.externalIds).length ? tech.externalIds : undefined,
              })),
            );
            changed.add(paths.seeds.technologies);
          } else if (action === "merge") {
            const target = need(payload.target, "target");
            if (!sources.seeds.technologies.some((t) => t.id === target)) throw new DecisionError(`technology "${target}" is not in the catalog`);
            editYaml(paths.seeds.technologies, " Technology catalog.", (doc) => {
              const seq = doc.get("technologies");
              const item = YAML.isSeq(seq) ? seq.items.find((i) => YAML.isMap(i) && i.get("id") === target) : null;
              if (!YAML.isMap(item)) throw new DecisionError(`technology "${target}" not found`);
              const aliases = item.get("aliases");
              if (YAML.isSeq(aliases)) aliases.add(name);
              else item.set("aliases", doc.createNode([name]));
            });
            changed.add(paths.seeds.technologies);
          } else if (action === "reject") {
            for (const r of candidate.related) technologyOverride("claims", { game: r.id, technology: subject, remove: true, note: payload.note });
          }
        } else {
          const tech = need(related, "technology");
          const claim = details as { source?: string; confidence?: string };
          if (action === "approve" || action === "edit") {
            const source = payload.source ?? { type: claim.source ?? "manual" };
            technologyOverride("claims", {
              game: subject,
              technology: tech,
              confidence: payload.confidence ?? (payload.source?.url ? "high" : claim.confidence),
              source,
              note: payload.note,
            });
          } else if (action === "reject") {
            technologyOverride("claims", { game: subject, technology: tech, remove: true, note: payload.note });
          }
        }
        break;
      }
      case "classification-change": {
        if (action === "edit") companyOverride({ id: subject, set: payload.set ?? { classification: { category: need(payload.category, "category"), notes: payload.note ?? "" } }, note: payload.note });
        break;
      }
      case "source-conflict": {
        if (action === "edit") gameOverride({ id: subject, set: need(payload.set, "set"), source: payload.source, note: payload.note });
        else if (action === "merge") {
          const unmatched = (details.unmatched ?? []) as { name: string; ids: Record<string, string>; suggestions: { id: string }[] }[];
          const target = payload.target ?? unmatched.find((u) => u.suggestions[0])?.suggestions[0]?.id;
          const refs = unmatched.filter((u) => !payload.target || u.suggestions.some((s) => s.id === payload.target) || unmatched.length === 1);
          if (!refs.length) throw new DecisionError("nothing to merge");
          editYaml(paths.mappings.companies, " Manually approved company mappings.", (doc) => {
            for (const ref of refs) {
              doc.setIn(["names", ref.name], need(target, "target"));
              for (const [provider, value] of Object.entries(ref.ids)) doc.setIn(["externalIds", provider, value], target);
            }
          });
          changed.add(paths.mappings.companies);
        }
        break;
      }
    }
  }

  editYaml(paths.review.decisions, " Review decisions. Decided candidates are hidden from the review queue.", (doc) =>
    appendItem(doc, "decisions", clean({
      candidate: candidate.id,
      action,
      category: candidate.category,
      subject: `${candidate.subject.type}:${subject}`,
      decidedAt: ws.now.toISOString(),
      note: payload.note,
    })),
  );
  changed.add(paths.review.decisions);

  const remaining = readJsonOr<ReviewCandidate[]>(paths.review.candidates, []).filter((c) => c.id !== candidate.id);
  writeText(paths.review.candidates, JSON.stringify(remaining, null, 2) + "\n");
  return { changed: [...changed] };
}
