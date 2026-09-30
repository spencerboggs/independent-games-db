/**
 * Offline provider backed by a fixture file. Used by tests and `npm run demo`
 * to exercise the full pipeline without network access. Fixture entities are
 * fictional so they can never be mistaken for real data.
 */
import { readJson } from "../lib/io.ts";
import type { SeedCompany } from "../schema/files.ts";
import type {
  ExternalIdSet,
  GameHint,
  Provider,
  ProviderCompanyRecord,
  ProviderGameRecord,
  ProviderId,
} from "./types.ts";

export interface MockFixture {
  discovery: { company: string; role: "developer" | "publisher"; ids: ExternalIdSet; title?: string }[];
  games: ProviderGameRecord[];
  companies: ProviderCompanyRecord[];
}

const overlaps = (a: ExternalIdSet, b: ExternalIdSet) =>
  (a.wikidata && a.wikidata === b.wikidata) || (a.steam && a.steam === b.steam) || (a.igdb && a.igdb === b.igdb);

export class MockProvider implements Provider {
  readonly id: ProviderId = "mock";
  private readonly fixture: MockFixture;

  constructor(fixture: MockFixture | string) {
    this.fixture = typeof fixture === "string" ? readJson<MockFixture>(fixture) : fixture;
  }

  available(): true {
    return true;
  }

  async discoverGames(companies: SeedCompany[]): Promise<GameHint[]> {
    const ids = new Set(companies.map((c) => c.id));
    return this.fixture.discovery
      .filter((d) => ids.has(d.company))
      .map((d) => ({ provider: "mock", ...d }));
  }

  async fetchGames(games: ExternalIdSet[]): Promise<ProviderGameRecord[]> {
    return this.fixture.games.filter((record) => games.some((g) => overlaps(g, record.ids)));
  }

  async fetchCompanies(companies: ExternalIdSet[]): Promise<ProviderCompanyRecord[]> {
    return this.fixture.companies.filter((record) => companies.some((c) => overlaps(c, record.ids)));
  }
}
