import { writeJson, readJsonOr } from "../lib/io.ts";
import { log } from "../lib/log.ts";
import type { SeedCompany } from "../schema/files.ts";
import type { ExternalIdSet, GameHint, Provider } from "../providers/types.ts";
import { loadGenerated, loadSources, type Workspace } from "./state.ts";

export interface ProviderStatus {
  id: string;
  status: "ok" | "skipped" | "error";
  detail?: string;
}

export interface DiscoveryOutput {
  generatedAt: string;
  providers: ProviderStatus[];
  hints: GameHint[];
  /** External IDs suggested for seeds that had none. Used when unambiguous. */
  suggestedCompanyIds: Record<string, { provider: string; candidates: ExternalIdSet[] }>;
}

export function providerStatus(provider: Provider): ProviderStatus {
  const available = provider.available();
  return available === true ? { id: provider.id, status: "ok" } : { id: provider.id, status: "skipped", detail: available };
}

/**
 * Seed companies -> games. Also re-queues every previously generated game so
 * that a provider hiccup or a Wikidata edit can never silently drop a game.
 */
export async function discover(ws: Workspace, providers: Provider[]): Promise<DiscoveryOutput> {
  const sources = loadSources(ws.paths);
  const previous = loadGenerated(ws.paths);
  const seeds = sources.seeds.companies.filter((c) => c.discover && c.classification?.include !== false);
  const statuses: ProviderStatus[] = [];
  const hints: GameHint[] = [];
  const suggestedCompanyIds: DiscoveryOutput["suggestedCompanyIds"] = {};

  for (const seed of sources.seeds.companies) {
    const g = seed.games ?? {};
    const add = (ids: ExternalIdSet) => hints.push({ provider: "seed", company: seed.id, role: "developer", ids });
    for (const steam of g.steam ?? []) add({ steam });
    for (const wikidata of g.wikidata ?? []) add({ wikidata });
    for (const igdb of g.igdb ?? []) add({ igdb });
  }

  const enrichedSeeds: SeedCompany[] = seeds.map((s) => ({ ...s, externalIds: { ...s.externalIds } }));
  for (const provider of providers) {
    const status = providerStatus(provider);
    statuses.push(status);
    if (status.status !== "ok") {
      log.info(`  ${provider.id}: skipped (${status.detail})`);
      continue;
    }
    try {
      if (provider.lookupCompanies && provider.id === "wikidata") {
        const missing = enrichedSeeds.filter((s) => !s.externalIds.wikidata);
        if (missing.length) {
          const found = await provider.lookupCompanies(missing);
          for (const [companyId, candidates] of found) {
            suggestedCompanyIds[companyId] = { provider: provider.id, candidates };
            const seed = enrichedSeeds.find((s) => s.id === companyId);
            if (seed && candidates.length === 1 && candidates[0]!.wikidata) {
              seed.externalIds.wikidata = candidates[0]!.wikidata;
            }
          }
        }
      }
      if (provider.discoverGames) {
        const found = await provider.discoverGames(enrichedSeeds);
        log.info(`  ${provider.id}: ${found.length} game links`);
        hints.push(...found);
      }
    } catch (error) {
      statuses[statuses.length - 1] = { id: provider.id, status: "error", detail: (error as Error).message };
      log.warn(`${provider.id} discovery failed: ${(error as Error).message}`);
    }
  }

  for (const game of previous.games) {
    const ids: ExternalIdSet = {};
    if (game.externalIds.steam) ids.steam = game.externalIds.steam;
    if (game.externalIds.wikidata) ids.wikidata = game.externalIds.wikidata;
    if (game.externalIds.igdb) ids.igdb = game.externalIds.igdb;
    if (Object.keys(ids).length) {
      hints.push({
        provider: "previous",
        company: game.developers[0] ?? game.publishers[0] ?? "",
        role: "developer",
        ids,
        title: game.title,
      });
    }
  }

  const output: DiscoveryOutput = { generatedAt: ws.now.toISOString(), providers: statuses, hints, suggestedCompanyIds };
  writeJson(ws.paths.work.discovered, output);
  return output;
}

export function loadDiscovery(ws: Workspace): DiscoveryOutput {
  const output = readJsonOr<DiscoveryOutput | null>(ws.paths.work.discovered, null);
  if (!output) throw new Error("No discovery output found. Run `npm run discover` first.");
  return output;
}
