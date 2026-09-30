/**
 * Wikidata provider.
 *
 * Docs:    https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service
 * Limits:  https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#Query_limits
 *          (60s of query time per minute per client, 5 parallel queries)
 * UA:      https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
 * License: Structured data is CC0 1.0 (https://www.wikidata.org/wiki/Wikidata:Licensing)
 *
 * No authentication. All requests are serialized and spaced by the HTTP client.
 */
import { normalizeGenre, normalizePlatform } from "../lib/vocab.ts";
import type { GameType } from "../schema/entities.ts";
import type { SeedCompany } from "../schema/files.ts";
import type {
  CompanyRef,
  ExternalIdSet,
  GameHint,
  Provider,
  ProviderCompanyRecord,
  ProviderContext,
  ProviderGameRecord,
  TechnologyRef,
} from "./types.ts";

const ENDPOINT = "https://query.wikidata.org/sparql";
const BATCH = 40;

/** P31 (instance of) values accepted as games, mapped to our game type. Order = precedence. */
export const GAME_INSTANCE_TYPES: [string, GameType][] = [
  ["Q1066707", "dlc"],
  ["Q209163", "expansion"],
  ["Q65963104", "remaster"],
  ["Q4393107", "remake"],
  ["Q16070115", "bundle"],
  ["Q7889", "game"],
  ["Q21125433", "game"],
];

const COMPANY_TYPES = ["Q210167", "Q1137109", "Q4830453", "Q783794", "Q6881511"];

const P = {
  instanceOf: "P31",
  developer: "P178",
  publisher: "P123",
  platform: "P400",
  genre: "P136",
  engine: "P408",
  programmedIn: "P277",
  series: "P179",
  franchise: "P8345",
  expansionOf: "P8646",
  steam: "P1733",
  igdbGame: "P5794",
  website: "P856",
  publicationDate: "P577",
  inception: "P571",
  dissolved: "P576",
  headquarters: "P159",
  country: "P17",
  parentOrg: "P749",
  ownedBy: "P127",
  twitter: "P2002",
  bluesky: "P12361",
  youtube: "P2397",
  mastodon: "P4033",
  igdbCompany: "P9650",
} as const;

interface Binding {
  [key: string]: { type: string; value: string; "xml:lang"?: string } | undefined;
}

// Returns undefined for anything that is not an entity, including "unknown value" statements,
// which SPARQL returns as http://www.wikidata.org/.well-known/genid/... blank-node URIs.
const qid = (uri: string | undefined) => {
  const id = uri?.replace("http://www.wikidata.org/entity/", "");
  return id && /^Q\d+$/.test(id) ? id : undefined;
};
const prop = (uri: string | undefined) => uri?.replace("http://www.wikidata.org/prop/direct/", "");
const isQid = (value: string) => /^Q\d+$/.test(value);
const entityUrl = (id: string) => `https://www.wikidata.org/wiki/${id}`;
const values = (ids: string[]) => ids.filter(isQid).map((id) => `wd:${id}`).join(" ");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function precisionDate(value: string, precision: number): string | null {
  const m = value.match(/^\+?(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  if (precision >= 11) return `${m[1]}-${m[2]}-${m[3]}`;
  if (precision === 10) return `${m[1]}-${m[2]}`;
  if (precision === 9) return m[1]!;
  return null;
}

type PairMap = Map<string, Map<string, { value: string; label: string }[]>>;

export class WikidataProvider implements Provider {
  readonly id = "wikidata" as const;

  constructor(private readonly ctx: ProviderContext) {}

  available(): true | string {
    return this.ctx.config.providers.wikidata.enabled ? true : "disabled in dataset.config.json";
  }

  private async sparql(query: string): Promise<Binding[]> {
    const result = await this.ctx.http.json<{ results: { bindings: Binding[] } }>(ENDPOINT, {
      provider: "wikidata",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
      },
      body: new URLSearchParams({ query, format: "json" }).toString(),
      ttlHours: this.ctx.config.policies.cacheTtlHours.metadata,
      minIntervalMs: 1100,
    });
    return result?.results.bindings ?? [];
  }

  async discoverGames(companies: SeedCompany[]): Promise<GameHint[]> {
    const byQid = new Map<string, string>();
    for (const c of companies) if (c.externalIds.wikidata) byQid.set(c.externalIds.wikidata, c.id);
    const hints: GameHint[] = [];
    const types = GAME_INSTANCE_TYPES.map(([q]) => `wd:${q}`).join(" ");
    for (const batch of chunk([...byQid.keys()], 20)) {
      const rows = await this.sparql(`
        SELECT ?company ?game ?gameLabel ?role ?steam ?igdb WHERE {
          VALUES ?company { ${values(batch)} }
          { ?game wdt:${P.developer} ?company . BIND("developer" AS ?role) }
          UNION
          { ?game wdt:${P.publisher} ?company . BIND("publisher" AS ?role) }
          FILTER EXISTS { ?game wdt:${P.instanceOf} ?type . VALUES ?type { ${types} } }
          OPTIONAL { ?game wdt:${P.steam} ?steam }
          OPTIONAL { ?game wdt:${P.igdbGame} ?igdb }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
        }`);
      const seen = new Map<string, GameHint>();
      for (const row of rows) {
        const company = byQid.get(qid(row.company?.value) ?? "");
        const game = qid(row.game?.value);
        const role = row.role?.value as "developer" | "publisher";
        if (!company || !game) continue;
        const key = `${company}|${game}|${role}`;
        const existing = seen.get(key);
        const steam = row.steam?.value;
        const label = row.gameLabel?.value;
        if (existing) {
          if (steam && (!existing.ids.steam || Number(steam) < Number(existing.ids.steam))) existing.ids.steam = steam;
          continue;
        }
        const hint: GameHint = {
          provider: "wikidata",
          company,
          role,
          ids: { wikidata: game, ...(steam ? { steam } : {}), ...(row.igdb ? { igdb: row.igdb.value } : {}) },
          ...(label && !isQid(label) ? { title: label } : {}),
        };
        seen.set(key, hint);
        hints.push(hint);
      }
    }
    return hints;
  }

  async lookupCompanies(companies: SeedCompany[]): Promise<Map<string, ExternalIdSet[]>> {
    const found = new Map<string, ExternalIdSet[]>();
    for (const company of companies) {
      const names = [company.name, ...company.aliases];
      const rows = await this.sparql(`
        SELECT DISTINCT ?c WHERE {
          VALUES ?name { ${names.map((n) => `"${esc(n)}"@en`).join(" ")} }
          ?c rdfs:label|skos:altLabel ?name .
          { ?c wdt:${P.instanceOf} ?t . VALUES ?t { ${values(COMPANY_TYPES)} } }
          UNION { ?c wdt:P452 wd:Q941594 }
        } LIMIT 10`);
      found.set(
        company.id,
        rows.map((r) => ({ wikidata: qid(r.c?.value)! })).filter((r) => r.wikidata),
      );
    }
    return found;
  }

  private async resolveSteamIds(steamIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const batch of chunk(steamIds, 100)) {
      const rows = await this.sparql(`
        SELECT ?game ?steam WHERE {
          VALUES ?steam { ${batch.map((s) => `"${esc(s)}"`).join(" ")} }
          ?game wdt:${P.steam} ?steam .
        }`);
      for (const row of rows) {
        const game = qid(row.game?.value);
        if (game && row.steam) map.set(row.steam.value, game);
      }
    }
    return map;
  }

  private async labels(ids: string[]) {
    const out = new Map<string, { label: string | null; aliases: string[]; description: string | null }>();
    for (const batch of chunk(ids, BATCH)) {
      const rows = await this.sparql(`
        SELECT ?item ?label ?alt ?desc WHERE {
          VALUES ?item { ${values(batch)} }
          OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) IN ("en", "mul")) }
          OPTIONAL { ?item skos:altLabel ?alt FILTER(LANG(?alt) = "en") }
          OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
        }`);
      for (const row of rows) {
        const id = qid(row.item?.value)!;
        const entry = out.get(id) ?? { label: null, aliases: [], description: null };
        const label = row.label;
        if (label && (label["xml:lang"] === "en" || !entry.label)) entry.label = label.value;
        if (row.alt && !entry.aliases.includes(row.alt.value)) entry.aliases.push(row.alt.value);
        if (row.desc) entry.description = row.desc.value;
        out.set(id, entry);
      }
    }
    for (const entry of out.values()) entry.aliases.sort();
    return out;
  }

  private async pairs(ids: string[], props: string[]): Promise<PairMap> {
    const out: PairMap = new Map();
    for (const batch of chunk(ids, BATCH)) {
      const rows = await this.sparql(`
        SELECT ?item ?p ?value ?valueLabel WHERE {
          VALUES ?item { ${values(batch)} }
          VALUES ?p { ${props.map((p) => `wdt:${p}`).join(" ")} }
          ?item ?p ?value .
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
        }`);
      for (const row of rows) {
        const id = qid(row.item?.value)!;
        const p = prop(row.p?.value)!;
        const raw = row.value?.value ?? "";
        if (!raw || raw.includes("/.well-known/genid/")) continue;
        const value = row.value?.type === "uri" ? (qid(raw) ?? raw) : raw;
        const label = row.valueLabel?.value ?? value;
        const byProp = out.get(id) ?? new Map();
        const list = byProp.get(p) ?? [];
        if (!list.some((v: { value: string }) => v.value === value)) list.push({ value, label });
        byProp.set(p, list);
        out.set(id, byProp);
      }
    }
    for (const byProp of out.values()) {
      for (const list of byProp.values()) list.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    }
    return out;
  }

  private async dates(ids: string[], property: string): Promise<Map<string, string>> {
    const out = new Map<string, { date: string; sortKey: string }>();
    for (const batch of chunk(ids, BATCH)) {
      const rows = await this.sparql(`
        SELECT ?item ?time ?precision WHERE {
          VALUES ?item { ${values(batch)} }
          ?item p:${property} ?st .
          ?st psv:${property} [ wikibase:timeValue ?time ; wikibase:timePrecision ?precision ] .
          ?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
        }`);
      for (const row of rows) {
        const id = qid(row.item?.value)!;
        const date = precisionDate(row.time?.value ?? "", Number(row.precision?.value));
        if (!date) continue;
        const existing = out.get(id);
        if (!existing || row.time!.value < existing.sortKey) out.set(id, { date, sortKey: row.time!.value });
      }
    }
    return new Map([...out].map(([k, v]) => [k, v.date]));
  }

  async fetchGames(games: ExternalIdSet[]): Promise<ProviderGameRecord[]> {
    const needSteamLookup = games.filter((g) => !g.wikidata && g.steam).map((g) => g.steam!);
    const steamToQid = needSteamLookup.length ? await this.resolveSteamIds(needSteamLookup) : new Map();
    const qids = [
      ...new Set(games.map((g) => g.wikidata ?? (g.steam ? steamToQid.get(g.steam) : undefined)).filter(Boolean)),
    ] as string[];
    if (!qids.length) return [];

    const retrievedAt = this.ctx.now.toISOString().slice(0, 10);
    const [labels, pairs, dates] = await Promise.all([
      this.labels(qids),
      this.pairs(qids, [
        P.instanceOf, P.developer, P.publisher, P.platform, P.genre, P.engine, P.programmedIn,
        P.series, P.franchise, P.expansionOf, P.steam, P.igdbGame, P.website,
      ]),
      this.dates(qids, P.publicationDate),
    ]);

    const records: ProviderGameRecord[] = [];
    for (const id of qids) {
      const props = pairs.get(id) ?? new Map();
      const get = (p: string) => (props.get(p) ?? []) as { value: string; label: string }[];
      const instanceTypes = get(P.instanceOf).map((v) => v.value);
      const type = GAME_INSTANCE_TYPES.find(([q]) => instanceTypes.includes(q))?.[1];
      if (!type) continue;
      const label = labels.get(id);
      const companies = (p: string): CompanyRef[] =>
        get(p).map((v) => ({ name: isQid(v.label) ? v.value : v.label, ids: { wikidata: v.value } }));
      const technology: TechnologyRef[] = [
        ...get(P.engine).map((v) => ({ name: v.label, role: "engines" as const, ids: { wikidata: v.value } })),
        ...get(P.programmedIn).map((v) => ({ name: v.label, role: "languages" as const, ids: { wikidata: v.value } })),
      ].filter((t) => !isQid(t.name));
      const steamIds = get(P.steam).map((v) => v.value).sort((a, b) => Number(a) - Number(b));
      const igdb = get(P.igdbGame)[0]?.value;
      const date = dates.get(id) ?? null;
      const firstLabel = (p: string) => get(p).map((v) => v.label).find((l) => !isQid(l)) ?? null;

      records.push({
        provider: "wikidata",
        sourceType: "wikidata",
        ids: { wikidata: id, ...(steamIds[0] ? { steam: steamIds[0] } : {}), ...(igdb ? { igdb } : {}) },
        url: entityUrl(id),
        retrievedAt,
        ...(label?.label ? { title: label.label } : {}),
        alternateTitles: label?.aliases ?? [],
        type,
        releaseDate: date,
        releaseStatus: date && date <= retrievedAt.slice(0, date.length) ? "released" : "unknown",
        developers: companies(P.developer),
        publishers: companies(P.publisher),
        platforms: [...new Set(get(P.platform).filter((v) => !isQid(v.label)).map((v) => normalizePlatform(v.label)))],
        genres: [...new Set(get(P.genre).filter((v) => !isQid(v.label)).map((v) => normalizeGenre(v.label)))],
        technology,
        series: firstLabel(P.series),
        franchise: firstLabel(P.franchise),
        parent: get(P.expansionOf)[0] ? { wikidata: get(P.expansionOf)[0]!.value } : null,
        website: get(P.website)[0]?.value ?? null,
        links: { wikidata: entityUrl(id) },
      });
    }
    return records;
  }

  async fetchCompanies(companies: ExternalIdSet[]): Promise<ProviderCompanyRecord[]> {
    const qids = [...new Set(companies.map((c) => c.wikidata).filter(Boolean))] as string[];
    if (!qids.length) return [];
    const retrievedAt = this.ctx.now.toISOString().slice(0, 10);
    const [labels, pairs, inception] = await Promise.all([
      this.labels(qids),
      this.pairs(qids, [
        P.headquarters, P.country, P.parentOrg, P.ownedBy, P.website, P.twitter, P.bluesky,
        P.youtube, P.mastodon, P.igdbCompany, P.dissolved,
      ]),
      this.dates(qids, P.inception),
    ]);
    const countryIds = new Set<string>();
    for (const byProp of pairs.values()) for (const v of byProp.get(P.country) ?? []) if (isQid(v.value)) countryIds.add(v.value);
    const iso = await this.countryCodes([...countryIds]);

    const records: ProviderCompanyRecord[] = [];
    for (const id of qids) {
      const props = pairs.get(id) ?? new Map();
      const get = (p: string) => (props.get(p) ?? []) as { value: string; label: string }[];
      const label = labels.get(id);
      const country = get(P.country)[0];
      const parent = get(P.parentOrg)[0] ?? get(P.ownedBy).find((v) => v.value !== id);
      const social: Record<string, string> = {};
      const twitter = get(P.twitter)[0]?.value;
      if (twitter) social.x = `https://x.com/${twitter}`;
      const bluesky = get(P.bluesky)[0]?.value;
      if (bluesky) social.bluesky = `https://bsky.app/profile/${bluesky}`;
      const youtube = get(P.youtube)[0]?.value;
      if (youtube) social.youtube = `https://www.youtube.com/channel/${youtube}`;
      const mastodon = get(P.mastodon)[0]?.value.match(/^@?([^@]+)@(.+)$/);
      if (mastodon) social.mastodon = `https://${mastodon[2]}/@${mastodon[1]}`;
      const igdb = get(P.igdbCompany)[0]?.value;

      records.push({
        provider: "wikidata",
        sourceType: "wikidata",
        ids: { wikidata: id, ...(igdb ? { igdb } : {}) },
        url: entityUrl(id),
        retrievedAt,
        ...(label?.label ? { name: label.label } : {}),
        aliases: label?.aliases ?? [],
        description: label?.description
          ? { text: label.description, license: "cc0", source: { type: "wikidata", url: entityUrl(id), retrievedAt } }
          : null,
        website: get(P.website)[0]?.value ?? null,
        socialLinks: social,
        headquarters: get(P.headquarters).map((v) => v.label).find((l) => !isQid(l)) ?? null,
        country: country ? (iso.get(country.value) ?? null) : null,
        countryName: country && !isQid(country.label) ? country.label : null,
        foundedDate: inception.get(id) ?? null,
        dissolved: get(P.dissolved).length > 0,
        parent: parent && !isQid(parent.label) ? { name: parent.label, ids: { wikidata: parent.value } } : null,
      });
    }
    return records;
  }

  private async countryCodes(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!ids.length) return out;
    const rows = await this.sparql(`
      SELECT ?c ?iso WHERE { VALUES ?c { ${values(ids)} } ?c wdt:P297 ?iso . }`);
    for (const row of rows) {
      const id = qid(row.c?.value);
      if (id && row.iso) out.set(id, row.iso.value.toUpperCase());
    }
    return out;
  }
}
