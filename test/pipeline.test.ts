import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/cli/demo.ts";
import { exists, readJson, readText, writeText } from "../src/lib/io.ts";
import { MockProvider } from "../src/providers/mock.ts";
import type { Provider } from "../src/providers/types.ts";
import type { Company, Game, Manifest, Relationship, Technology } from "../src/schema/entities.ts";
import { openWorkspace } from "../src/pipeline/state.ts";
import { validate } from "../src/pipeline/validate.ts";
import { builtWorkspace, fixture, latest } from "./helpers.ts";

describe("end-to-end chain: seed -> discovery -> normalized -> relationship -> generated -> override -> final", async () => {
  const { ws, discovery, enrichment } = await builtWorkspace();
  const games = latest<Game[]>(ws, "full/games.json");
  const lanternfall = games.find((g) => g.id === "lanternfall")!;

  it("discovers games from seed companies", () => {
    expect(discovery.hints.some((h) => h.company === "hollow-lantern-studio" && h.ids.wikidata === "Q900101")).toBe(true);
    expect(enrichment.games.filter((r) => r.ids.steam === "990001").map((r) => r.provider).sort()).toEqual(["igdb", "steam", "wikidata"]);
  });

  it("merges provider records into one normalized game with a stable ID", () => {
    expect(games.filter((g) => g.title === "Lanternfall")).toHaveLength(1);
    expect(lanternfall.externalIds).toEqual({ wikidata: "Q900101", igdb: "lanternfall", steam: "990001" });
    expect(lanternfall.platforms).toEqual(["macos", "nintendo-switch", "windows"]);
    expect(lanternfall.genres).toContain("platformer");
    expect(lanternfall.genres).not.toContain("indie");
    expect(lanternfall.provenance?.title?.source).toBe("steam");
    expect(lanternfall.provenance?.developers?.alternatives?.map((a) => a.source)).toEqual(["wikidata", "igdb"]);
  });

  it("resolves company name variants to seeded companies", () => {
    const circuit = games.find((g) => g.id === "circuit-garden")!;
    expect(circuit.developers).toEqual(["pixelforge-collective"]);
    expect(lanternfall.developers).toEqual(["hollow-lantern-studio"]);
    expect(lanternfall.publishers).toEqual(["brightmoss-publishing"]);
  });

  it("creates relationships", () => {
    const rels = latest<Relationship[]>(ws, "relationships.json");
    const ids = rels.map((r) => r.id);
    expect(ids).toContain("hollow-lantern-studio:developer:lanternfall");
    expect(ids).toContain("brightmoss-publishing:publisher:lanternfall");
    expect(ids).toContain("lanternfall-embers:dlc-of:lanternfall");
    expect(ids).toContain("quietwave-games:subsidiary-of:brightmoss-publishing");
    expect(rels.find((r) => r.id === "lanternfall:uses-engine:unity")?.confidence).toBe("high");
  });

  it("keeps the generated layer free of manual data", () => {
    const generated = readJson<Game[]>(ws.paths.generated.games).find((g) => g.id === "lanternfall")!;
    expect(generated.descriptions.custom).toBeNull();
    expect(generated.technology.middleware).toEqual([]);
  });

  it("applies overrides on top of generated data", () => {
    expect(lanternfall.descriptions.custom).toMatch(/lamplighter/);
    expect(lanternfall.descriptions.source?.license).toBe("third-party");
    expect(lanternfall.tags).toEqual(expect.arrayContaining(["metroidvania", "hand-drawn"]));
    expect(lanternfall.technology.middleware).toEqual([
      expect.objectContaining({ id: "fmod", confidence: "verified", source: expect.objectContaining({ type: "developer-interview" }) }),
    ]);
    expect(lanternfall.provenance?.["descriptions.custom"]?.source).toBe("official");
  });

  it("computes statistics and review velocity", () => {
    expect(lanternfall.statistics.steam?.reviewCount).toBe(12840);
    expect(lanternfall.statistics.reviewVelocity?.method).toBe("lifetime-average");
    const company = latest<Company[]>(ws, "full/companies.json").find((c) => c.id === "hollow-lantern-studio")!;
    expect(company.statistics.totalSteamReviews).toBe(12840);
    const unity = latest<Technology[]>(ws, "technologies.json").find((t) => t.id === "unity")!;
    expect(unity.games).toEqual(["lanternfall"]);
  });

  it("keeps unseeded companies only as referenced, non-curated records", () => {
    const quietwave = latest<Company[]>(ws, "companies.json").find((c) => c.id === "quietwave-games")!;
    expect(quietwave.classification).toMatchObject({ include: false, category: "unclassified" });
    expect(quietwave.ownership.parentCompany).toBe("brightmoss-publishing");
    expect(latest<Company[]>(ws, "companies.json").some((c) => c.id === "hollow-lantern-studios")).toBe(false);
  });

  it("publishes every variant with a consistent manifest", () => {
    const manifest = latest<Manifest>(ws, "manifest.json");
    expect(manifest.counts).toMatchObject({ games: 3, companies: 4 });
    for (const entry of manifest.checksums) expect(exists(join(ws.paths.latest, entry.path))).toBe(true);
    for (const file of ["games.json", "compact/games.json", "full/games.json", "schema/games.schema.json", "entities/games/lanternfall.json", "by-company/hollow-lantern-studio.json", "by-engine/unity.json"]) {
      expect(exists(join(ws.paths.latest, file)), file).toBe(true);
    }
    expect(readText(join(ws.paths.latest, "compact/games.json"))).not.toContain("\n  ");
  });

  it("passes output validation", () => {
    const result = validate(ws, { checkOutput: true });
    expect(result.errors).toEqual([]);
  });
});

describe("idempotency and stability", () => {
  it("produces byte-identical output when nothing changed", async () => {
    const { ws } = await builtWorkspace();
    const generated = readText(ws.paths.generated.games);
    const again = await runPipeline(openWorkspace(ws.paths, ws.now), new MockProvider(fixture()));
    expect(again.built.written).toEqual([]);
    expect(readText(ws.paths.generated.games)).toBe(generated);
  });

  it("does not bump lastUpdated when only statistics move", async () => {
    const { ws } = await builtWorkspace();
    const before = latest<Game[]>(ws, "full/games.json").find((g) => g.id === "lanternfall")!;
    await runPipeline(openWorkspace(ws.paths, new Date("2026-01-20T12:00:00Z")), new MockProvider(fixture()));
    const after = latest<Game[]>(ws, "full/games.json").find((g) => g.id === "lanternfall")!;
    expect(after.statistics.reviewVelocity).not.toEqual(before.statistics.reviewVelocity);
    expect(after.lastUpdated).toBe(before.lastUpdated);
  });

  it("keeps game IDs stable when a title changes upstream", async () => {
    const data = fixture();
    const { ws } = await builtWorkspace(data);
    for (const record of data.games) if (record.ids.steam === "990001") record.title = "Lanternfall: Definitive Edition";
    await runPipeline(ws, new MockProvider(data));
    const games = latest<Game[]>(ws, "games.json");
    expect(games.find((g) => g.externalIds.steam === "990001")?.id).toBe("lanternfall");
  });

  it("carries games over when a provider fails instead of dropping them", async () => {
    const { ws } = await builtWorkspace();
    const broken: Provider = {
      id: "mock",
      available: () => true,
      discoverGames: async () => {
        throw new Error("provider down");
      },
      fetchGames: async () => {
        throw new Error("provider down");
      },
    };
    await runPipeline(ws, broken as MockProvider);
    expect(latest<Game[]>(ws, "games.json").map((g) => g.id).sort()).toEqual(["circuit-garden", "lanternfall", "lanternfall-embers"]);
  });

  it("passes the output check when rebuilt on a later day (CI)", async () => {
    const { ws } = await builtWorkspace();
    const later = openWorkspace(ws.paths, new Date("2026-02-20T12:00:00Z"));
    expect(validate(later, { checkOutput: true }).errors).toEqual([]);
  });

  it("detects hand edits to published files", async () => {
    const { ws } = await builtWorkspace();
    const path = join(ws.paths.latest, "games.json");
    writeText(path, readText(path).replace("Lanternfall", "Lanternfall (edited)"));
    const result = validate(ws, { checkOutput: true });
    expect(result.errors.join("\n")).toMatch(/games\.json/);
  });
});
