import { describe, expect, it } from "vitest";
import { parseStoreDate, precisionOf } from "../src/lib/dates.ts";
import { similarity } from "../src/lib/fuzzy.ts";
import { allocateId, slugify } from "../src/lib/ids.ts";
import { writeText } from "../src/lib/io.ts";
import { coreCompanyName, normalizeCompanyName, normalizeTechnologyName, normalizeTitle } from "../src/lib/names.ts";
import { normalizeGenre, normalizePlatform } from "../src/lib/vocab.ts";
import { mapIgdbGame } from "../src/providers/igdb.ts";
import { decodeHtml, mapAppDetails, parseSupportedLanguages, reviewStatistics } from "../src/providers/steam.ts";
import { IdRegistry, MappingsFile, SeedCompany } from "../src/schema/files.ts";
import { applyOverride } from "../src/pipeline/overrides.ts";
import { CompanyResolver, TechnologyResolver } from "../src/pipeline/resolvers.ts";
import { computeVelocity, recordObservation, thinHistory } from "../src/pipeline/stats.ts";
import { validate } from "../src/pipeline/validate.ts";
import { builtWorkspace } from "./helpers.ts";

describe("names and IDs", () => {
  it("slugifies to stable kebab-case IDs", () => {
    expect(slugify("Hollow Knight: Silksong")).toBe("hollow-knight-silksong");
    expect(slugify("Ōkami HD")).toBe("okami-hd");
    expect(slugify("Baldur's Gate 3")).toBe("baldurs-gate-3");
    expect(allocateId(["Celeste"], new Set(["celeste"]))).not.toBe("celeste");
  });

  it("strips legal suffixes but keeps meaningful words", () => {
    expect(normalizeCompanyName("Team Cherry Pty Ltd")).toBe("team cherry");
    expect(normalizeCompanyName("Remedy Entertainment Oyj")).toBe("remedy entertainment");
    expect(normalizeCompanyName("Coffee Stain Studios AB")).not.toBe(normalizeCompanyName("Coffee Stain Publishing"));
    expect(coreCompanyName("Coffee Stain Studios")).toBe(coreCompanyName("Coffee Stain Publishing"));
  });

  it("keeps C, C# and C++ distinct", () => {
    const keys = ["C", "C#", "C++", "C Sharp"].map(normalizeTechnologyName);
    expect(new Set(keys.slice(0, 3)).size).toBe(3);
    expect(keys[1]).toBe(keys[3]);
  });

  it("normalizes titles for duplicate detection", () => {
    expect(normalizeTitle("The Binding of Isaac™")).toBe(normalizeTitle("Binding of Isaac"));
  });

  it("scores near-identical names highly and different names low", () => {
    expect(similarity("hollow lantern studio", "hollow lantern studios")).toBeGreaterThan(0.93);
    expect(similarity("supergiant", "team cherry")).toBeLessThan(0.7);
  });
});

describe("vocabularies and dates", () => {
  it("normalizes platforms and genres idempotently", () => {
    for (const raw of ["PC (Microsoft Windows)", "Microsoft Windows", "windows"]) expect(normalizePlatform(raw)).toBe("windows");
    expect(normalizePlatform("Xbox Series X|S")).toBe("xbox-series");
    for (const id of ["macos", "nintendo-switch", "playstation-5", "xbox-series"]) expect(normalizePlatform(id)).toBe(id);
    expect(normalizeGenre("Role-playing (RPG)")).toBe("rpg");
    expect(normalizeGenre(normalizeGenre("Platform game"))).toBe("platformer");
  });

  it("parses Steam store dates", () => {
    expect(parseStoreDate("Feb 24, 2017")).toEqual({ date: "2017-02-24", precision: "day" });
    expect(parseStoreDate("24 Feb, 2017")).toEqual({ date: "2017-02-24", precision: "day" });
    expect(parseStoreDate("February 2027")).toEqual({ date: "2027-02", precision: "month" });
    expect(parseStoreDate("Q3 2027")).toEqual({ date: "2027", precision: "year" });
    expect(parseStoreDate("Coming soon")).toBeNull();
    expect(precisionOf("2024-03")).toBe("month");
  });
});

describe("entity resolution", () => {
  const seeds = [
    SeedCompany.parse({ id: "landfall", name: "Landfall", aliases: ["Landfall Games"], externalIds: { wikidata: "Q27961665" } }),
    SeedCompany.parse({ id: "coffee-stain-studios", name: "Coffee Stain Studios", externalIds: { wikidata: "Q3178586" } }),
    SeedCompany.parse({ id: "coffee-stain-publishing", name: "Coffee Stain Publishing", externalIds: { wikidata: "Q116983863" } }),
  ];
  const resolver = (mappings = {}) => new CompanyResolver(seeds, [], MappingsFile.parse(mappings), IdRegistry.parse({}));

  it("matches by external ID before name", () => {
    expect(resolver().resolve({ name: "Something Else", ids: { wikidata: "Q27961665" } })).toMatchObject({ id: "landfall", method: "external-id" });
  });

  it("matches aliases and legal-suffix variants", () => {
    expect(resolver().resolve({ name: "Landfall Games AB", ids: {} })).toMatchObject({ id: "landfall", method: "normalized-name" });
  });

  it("refuses a name match when external IDs conflict", () => {
    const r = resolver().resolve({ name: "Landfall", ids: { wikidata: "Q999999" } });
    expect(r.created).toBe(true);
    expect(r.id).not.toBe("landfall");
  });

  it("never merges similar names automatically, but flags them", () => {
    const res = resolver();
    const r = res.resolve({ name: "Coffee Stain", ids: {} });
    expect(r.created).toBe(true);
    expect(res.issues.filter((i) => i.kind === "potential-duplicate").map((i) => i.related[0]).sort()).toEqual([
      "coffee-stain-publishing",
      "coffee-stain-studios",
    ]);
  });

  it("respects manual mappings and distinct pairs", () => {
    const res = resolver({ names: { "Coffee Stain": "coffee-stain-studios" } });
    expect(res.resolve({ name: "Coffee Stain", ids: {} })).toMatchObject({ id: "coffee-stain-studios", method: "mapping" });
  });

  it("resolves technologies by ID, then name/alias, and creates unknown ones", () => {
    const tech = new TechnologyResolver(
      [
        { id: "unreal-engine", name: "Unreal Engine", aliases: ["Unreal Engine 4"], category: "engine", externalIds: { wikidata: "Q608276" } },
        { id: "csharp", name: "C#", aliases: [], category: "language", externalIds: {} },
        { id: "c", name: "C", aliases: [], category: "language", externalIds: {} },
      ],
      IdRegistry.parse({}),
    );
    expect(tech.resolve({ name: "UE", role: "engines", ids: { wikidata: "Q608276" } }).id).toBe("unreal-engine");
    expect(tech.resolve({ name: "Unreal Engine 4", role: "engines", ids: { wikidata: "Q13156652" } }).id).toBe("unreal-engine");
    expect(tech.resolve({ name: "C#", role: "languages", ids: {} }).id).toBe("csharp");
    expect(tech.resolve({ name: "Brand New Engine", role: "engines", ids: {} })).toEqual({ id: "brand-new-engine", created: true });
  });
});

describe("providers", () => {
  it("maps Steam appdetails without inventing data", () => {
    const record = mapAppDetails(
      {
        type: "game",
        name: " Hollow Knight ",
        steam_appid: 367520,
        short_description: "Forge your own path in Hollow Knight! An epic action adventure &amp; more.",
        supported_languages: "English<strong>*</strong>, French, German<br><strong>*</strong>languages with full audio support",
        header_image: "https://shared.akamai.steamstatic.com/header.jpg?t=123",
        developers: ["Team Cherry"],
        publishers: ["Team Cherry"],
        platforms: { windows: true, mac: true, linux: true },
        genres: [{ id: "25", description: "Adventure" }, { id: "23", description: "Indie" }],
        categories: [{ id: 2, description: "Single-player" }],
        release_date: { coming_soon: false, date: "Feb 24, 2017" },
      },
      { retrievedAt: "2026-01-15", storeDescriptions: true, artwork: true, statistics: null },
    );
    expect(record).toMatchObject({
      ids: { steam: "367520" },
      title: "Hollow Knight",
      releaseDate: "2017-02-24",
      releaseStatus: "released",
      platforms: ["windows", "macos", "linux"],
      supportedLanguages: ["English", "French", "German"],
      description: { license: "third-party", text: "Forge your own path in Hollow Knight! An epic action adventure & more." },
    });
    expect(record.media?.header).toMatchObject({ url: "https://shared.akamai.steamstatic.com/header.jpg", rights: "reference-only" });
  });

  it("omits store text and artwork when policy disables them", () => {
    const record = mapAppDetails(
      { type: "game", name: "X", steam_appid: 1, short_description: "text", header_image: "https://x/y.jpg" },
      { retrievedAt: "2026-01-15", storeDescriptions: false, artwork: false, statistics: null },
    );
    expect(record.description).toBeNull();
    expect(record.media?.header).toBeNull();
  });

  it("computes review percentages from the review summary", () => {
    expect(reviewStatistics({ total_reviews: 200, total_positive: 150, total_negative: 50, review_score_desc: "Mostly Positive" }, 10, "2026-01-15")).toMatchObject({
      reviewCount: 200,
      positivePercentage: 75,
      negativePercentage: 25,
      currentPlayers: 10,
    });
    expect(reviewStatistics({ total_reviews: 0 }, null, "2026-01-15")?.positivePercentage).toBeNull();
    expect(decodeHtml("a<br/>b &quot;c&quot;")).toBe('a b "c"');
    expect(parseSupportedLanguages(undefined)).toEqual([]);
  });

  it("maps IGDB games including Steam cross-references", () => {
    const record = mapIgdbGame(
      {
        id: 1,
        slug: "celeste",
        name: "Celeste",
        first_release_date: 1516665600,
        game_type: { type: "Main Game" },
        involved_companies: [
          { company: { name: "Maddy Makes Games", slug: "maddy-makes-games" }, developer: true },
          { company: { name: "Sickhead Games", slug: "sickhead-games" }, porting: true },
        ],
        game_engines: [{ name: "XNA", slug: "xna" }],
        platforms: [{ name: "PC (Microsoft Windows)" }],
        external_games: [{ external_game_source: 1, uid: "504230" }],
      },
      "2026-01-15",
    );
    expect(record).toMatchObject({
      ids: { igdb: "celeste", steam: "504230" },
      type: "game",
      releaseDate: "2018-01-23",
      developers: [{ name: "Maddy Makes Games" }],
      porting: [{ name: "Sickhead Games" }],
      platforms: ["windows"],
      technology: [{ name: "XNA", role: "engines" }],
    });
  });
});

describe("overrides", () => {
  const base = { id: "g", title: "G", tags: ["a", "b"], descriptions: { source: null, custom: null }, sources: [], provenance: {} };

  it("deep-merges set, appends and removes array values, and records provenance", () => {
    const result = applyOverride(base, {
      id: "g",
      set: { descriptions: { custom: "Hello" } },
      append: { tags: ["c", "a"] },
      remove: { tags: ["b"] },
      source: { type: "official", url: "https://example.com" },
    });
    expect(result.descriptions).toEqual({ source: null, custom: "Hello" });
    expect(result.tags).toEqual(["a", "c"]);
    expect(result.sources).toEqual([{ type: "official", url: "https://example.com" }]);
    expect((result.provenance as Record<string, { source: string; confidence: string }>)["descriptions.custom"]).toMatchObject({ source: "official", confidence: "verified" });
    expect(base.tags).toEqual(["a", "b"]);
  });
});

describe("statistics", () => {
  it("uses measured history once it spans at least a week", () => {
    const points: [string, number, number][] = [
      ["2026-01-01", 1000, 900],
      ["2026-01-31", 1300, 1170],
    ];
    expect(computeVelocity(points, "2020-01-01", 1300, new Date("2026-01-31"), 30)).toMatchObject({
      method: "history",
      reviewsPerDay: 10,
      recentReviewGrowth: { reviews: 300, percent: 30 },
    });
  });

  it("falls back to a lifetime average and needs a release date", () => {
    expect(computeVelocity([], "2025-01-01", 365, new Date("2026-01-01"), 30)).toMatchObject({ method: "lifetime-average", reviewsPerDay: 1 });
    expect(computeVelocity([], null, 365, new Date("2026-01-01"), 30)).toBeNull();
  });

  it("records one observation per day and thins old history", () => {
    const history = { steamReviews: {} as Record<string, [string, number, number][]> };
    recordObservation(history, "1", "2026-01-01", 10, 9);
    recordObservation(history, "1", "2026-01-01", 12, 11);
    expect(history.steamReviews["1"]).toEqual([["2026-01-01", 12, 11]]);
    const daily = Array.from({ length: 60 }, (_, i) => [new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10), i, i] as [string, number, number]);
    expect(thinHistory(daily, "2026-01-01").map(([d]) => d)).toEqual(["2023-01-01", "2023-02-01", "2023-03-01"]);
  });
});

describe("validation", () => {
  it("rejects overrides of unknown or computed fields and unsourced verified claims", async () => {
    const { ws } = await builtWorkspace();
    writeText(ws.paths.overrides.games, "games:\n  - id: lanternfall\n    set:\n      titel: Typo\n      lastUpdated: '2020-01-01'\n");
    writeText(ws.paths.overrides.technology, "claims:\n  - game: lanternfall\n    technology: fmod\n    confidence: verified\n    source: { type: official }\n");
    const { errors } = validate(ws);
    expect(errors.join("\n")).toMatch(/titel/);
    expect(errors.join("\n")).toMatch(/lastUpdated/);
    expect(errors.join("\n")).toMatch(/verified/);
  });

  it("rejects duplicate seed names and external IDs", async () => {
    const { ws } = await builtWorkspace();
    writeText(
      ws.paths.seeds.companies,
      "companies:\n  - { id: a-studio, name: A Studio, externalIds: { wikidata: Q1 } }\n  - { id: b-studio, name: B Studio, aliases: [A Studio Ltd], externalIds: { wikidata: Q1 } }\n",
    );
    const { errors } = validate(ws);
    expect(errors.some((e) => e.includes("A Studio Ltd"))).toBe(true);
    expect(errors.some((e) => e.includes("wikidata:Q1"))).toBe(true);
  });
});
