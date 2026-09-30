import { groupToIdSet, IdClusters, idKeys } from "../lib/clusters.ts";
import { readJsonOr, writeJson } from "../lib/io.ts";
import { log } from "../lib/log.ts";
import type {
  ExternalIdSet,
  GameHint,
  Provider,
  ProviderCompanyRecord,
  ProviderGameRecord,
} from "../providers/types.ts";
import { providerStatus, type DiscoveryOutput, type ProviderStatus } from "./discover.ts";
import { loadSources, type Workspace } from "./state.ts";

export interface EnrichmentOutput {
  generatedAt: string;
  providers: ProviderStatus[];
  hints: GameHint[];
  games: ProviderGameRecord[];
  companies: ProviderCompanyRecord[];
}

const MAX_ROUNDS = 3;

/**
 * Fetches provider metadata for every discovered game. Providers run in
 * rounds: IDs learned from one provider (e.g. a Steam app ID from Wikidata)
 * are fed to the others until no new IDs appear.
 */
export async function enrich(ws: Workspace, providers: Provider[], discovery: DiscoveryOutput): Promise<EnrichmentOutput> {
  const sources = loadSources(ws.paths);
  const clusters = new IdClusters();
  for (const hint of discovery.hints) clusters.add(hint.ids);

  const active = providers.filter((p) => providerStatus(p).status === "ok");
  const statuses: ProviderStatus[] = providers.map(providerStatus);
  const fetched = new Map<string, Set<string>>();
  const games = new Map<string, ProviderGameRecord>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let added = 0;
    for (const provider of active) {
      if (!provider.fetchGames) continue;
      const done = fetched.get(provider.id) ?? new Set<string>();
      fetched.set(provider.id, done);
      const pending = clusters.groups().filter((keys) => keys.some((k) => !done.has(k)));
      if (!pending.length) continue;
      const sets = pending.map(groupToIdSet);
      try {
        const records = await provider.fetchGames(sets);
        for (const keys of pending) for (const k of keys) done.add(k);
        for (const record of records) {
          const key = `${record.provider}|${idKeys(record.ids).join(",")}`;
          if (!games.has(key)) added++;
          games.set(key, record);
          clusters.add(record.ids);
        }
        log.info(`  ${provider.id}: ${records.length} game records (round ${round + 1})`);
      } catch (error) {
        const status = statuses.find((s) => s.id === provider.id);
        if (status) Object.assign(status, { status: "error", detail: (error as Error).message });
        log.warn(`${provider.id} game enrichment failed: ${(error as Error).message}`);
      }
    }
    if (!added) break;
  }

  const companyIds = new Map<string, ExternalIdSet>();
  const addCompany = (ids: ExternalIdSet) => {
    const key = idKeys(ids).join(",");
    if (key) companyIds.set(key, ids);
  };
  for (const seed of sources.seeds.companies) addCompany(seed.externalIds);
  for (const record of games.values()) {
    for (const ref of [...(record.developers ?? []), ...(record.publishers ?? []), ...(record.porting ?? [])]) {
      addCompany(ref.ids);
    }
  }

  const companies: ProviderCompanyRecord[] = [];
  for (const provider of active) {
    if (!provider.fetchCompanies) continue;
    try {
      const records = await provider.fetchCompanies([...companyIds.values()]);
      companies.push(...records);
      log.info(`  ${provider.id}: ${records.length} company records`);
    } catch (error) {
      log.warn(`${provider.id} company enrichment failed: ${(error as Error).message}`);
    }
  }

  const output: EnrichmentOutput = {
    generatedAt: ws.now.toISOString(),
    providers: statuses,
    hints: discovery.hints,
    games: [...games.values()],
    companies,
  };
  writeJson(ws.paths.work.enriched, output);
  return output;
}

export function loadEnrichment(ws: Workspace): EnrichmentOutput {
  const output = readJsonOr<EnrichmentOutput | null>(ws.paths.work.enriched, null);
  if (!output) throw new Error("No enrichment output found. Run `npm run enrich` first.");
  return output;
}
