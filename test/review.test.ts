import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/cli/demo.ts";
import { readJson, readText } from "../src/lib/io.ts";
import { MockProvider } from "../src/providers/mock.ts";
import type { Company, Game } from "../src/schema/entities.ts";
import type { ReviewCandidate } from "../src/schema/files.ts";
import { loadSources } from "../src/pipeline/state.ts";
import { applyDecision, DecisionError } from "../src/review/actions.ts";
import { startReviewServer } from "../src/review/server.ts";
import { builtWorkspace, fixture, latest } from "./helpers.ts";

const queue = (ws: { paths: { review: { candidates: string } } }) => readJson<ReviewCandidate[]>(ws.paths.review.candidates);

describe("review decisions write to source files and survive rebuilds", () => {
  it("approving a new company adds a seed and keeps file comments", async () => {
    const { ws } = await builtWorkspace();
    const candidate = queue(ws).find((c) => c.category === "new-company" && c.subject.id === "quietwave-games")!;
    expect(() => applyDecision(ws, candidate, "approve", {})).toThrow(DecisionError);
    applyDecision(ws, candidate, "approve", { category: "independent-publisher", note: "Boutique label" });

    const seeds = readText(ws.paths.seeds.companies);
    expect(seeds).toContain("# Fictional seed companies");
    expect(loadSources(ws.paths).seeds.companies.find((c) => c.id === "quietwave-games")).toMatchObject({
      name: "Quietwave Games",
      classification: { category: "independent-publisher", include: true },
      externalIds: { wikidata: "Q900004" },
    });
    expect(queue(ws).some((c) => c.id === candidate.id)).toBe(false);
    expect(loadSources(ws.paths).decisions).toEqual([expect.objectContaining({ candidate: candidate.id, action: "approve" })]);

    const { candidates } = await runPipeline(ws, new MockProvider(fixture()));
    expect(candidates.some((c) => c.category === "new-company")).toBe(false);
    expect(latest<Company[]>(ws, "companies.json").find((c) => c.id === "quietwave-games")?.classification.include).toBe(true);
  });

  it("merging a source conflict maps the provider name to the canonical company", async () => {
    const { ws } = await builtWorkspace();
    const candidate = queue(ws).find((c) => c.category === "source-conflict")!;
    expect(candidate.actions).toContain("merge");
    applyDecision(ws, candidate, "merge", {});
    const mappings = loadSources(ws.paths).mappings.companies;
    expect(mappings.names["The Hollow Lantern Studio"]).toBe("hollow-lantern-studio");
    expect(mappings.externalIds.igdb?.["hollow-lantern-studios"]).toBe("hollow-lantern-studio");

    const { candidates } = await runPipeline(ws, new MockProvider(fixture()));
    expect(candidates.some((c) => c.category === "source-conflict")).toBe(false);
  });

  it("rejecting a technology claim removes it from the published game", async () => {
    const { ws } = await builtWorkspace();
    const candidate = queue(ws).find((c) => c.category === "technology-claim" && c.related[0]?.id === "godot")!;
    applyDecision(ws, candidate, "reject", { note: "Not confirmed" });
    await runPipeline(ws, new MockProvider(fixture()));
    const circuit = latest<Game[]>(ws, "games.json").find((g) => g.id === "circuit-garden")!;
    expect(circuit.technology.engines.map((e) => e.id)).not.toContain("godot");
  });

  it("approving an unmatched technology adds it to the catalog", async () => {
    const { ws } = await builtWorkspace();
    const candidate = queue(ws).find((c) => c.subject.type === "technology" && c.subject.id === "gdscript")!;
    applyDecision(ws, candidate, "approve", { technologyCategory: "language" });
    expect(loadSources(ws.paths).seeds.technologies.find((t) => t.id === "gdscript")?.category).toBe("language");
    const { candidates } = await runPipeline(ws, new MockProvider(fixture()));
    expect(candidates.some((c) => c.subject.id === "gdscript" && c.subject.type === "technology")).toBe(false);
  });

  it("ignoring only records the decision", async () => {
    const { ws } = await builtWorkspace();
    const seedsBefore = readText(ws.paths.seeds.companies);
    const candidate = queue(ws)[0]!;
    const { changed } = applyDecision(ws, candidate, "ignore", {});
    expect(changed).toEqual([ws.paths.review.decisions]);
    expect(readText(ws.paths.seeds.companies)).toBe(seedsBefore);
    const { candidates } = await runPipeline(ws, new MockProvider(fixture()));
    expect(candidates.some((c) => c.id === candidate.id)).toBe(false);
  });
});

describe("review server", () => {
  it("serves the UI locally and rejects requests without the session token or with a foreign Host", async () => {
    const { ws } = await builtWorkspace();
    const port = 45000 + Math.floor(Math.random() * 1000);
    const server = await startReviewServer(ws, port);
    try {
      const page = await (await fetch(server.url)).text();
      const token = /const TOKEN = "([a-f0-9]+)"/.exec(page)?.[1];
      expect(token).toBeTruthy();

      expect((await fetch(`${server.url}api/state`)).status).toBe(403);
      const state = await fetch(`${server.url}api/state`, { headers: { "X-Review-Token": token! } });
      expect(state.status).toBe(200);
      expect(((await state.json()) as { candidates: unknown[] }).candidates.length).toBeGreaterThan(0);

      const { request } = await import("node:http");
      const status = await new Promise<number>((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port, path: "/api/state", headers: { Host: "evil.example.com", "X-Review-Token": token! } }, (res) => resolve(res.statusCode ?? 0));
        req.on("error", reject);
        req.end();
      });
      expect(status).toBe(403);

      const bad = await fetch(`${server.url}api/decide`, {
        method: "POST",
        headers: { "X-Review-Token": token!, "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: "nope", action: "ignore" }),
      });
      expect(bad.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
