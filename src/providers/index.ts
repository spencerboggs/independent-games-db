import { IgdbProvider } from "./igdb.ts";
import { SteamProvider } from "./steam.ts";
import type { Provider, ProviderContext } from "./types.ts";
import { WikidataProvider } from "./wikidata.ts";

/**
 * Providers run in this order during enrichment. Wikidata first because it
 * links IDs across services (Steam app IDs, IGDB slugs), then IGDB, then Steam.
 */
export function createProviders(ctx: ProviderContext): Provider[] {
  return [new WikidataProvider(ctx), new IgdbProvider(ctx), new SteamProvider(ctx)];
}

export type { Provider, ProviderContext } from "./types.ts";
