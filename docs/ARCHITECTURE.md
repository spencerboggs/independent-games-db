# Architecture

The repository is a dataset first. Code exists only to generate, curate and validate it. There is no website or API here: consumers read the JSON files directly.

## Layers

```
 data/seeds/*.yaml ─┐                     (manual: what to include)
                    ▼
            ┌──────────────┐   data/raw/        (gitignored HTTP cache)
 RAW        │  discover    │──────────────────► data/work/discovered.json
            │  enrich      │──────────────────► data/work/enriched.json
            └──────┬───────┘
                   ▼
 NORMALIZED ┌──────────────┐   data/mappings/*.yaml (manual resolution decisions)
            │  resolve     │◄──────────────────
            │  stats       │──────────────────► data/generated/*.json  (committed, machine-written)
            └──────┬───────┘                    data/registry/ids.json (stable IDs)
                   ▼                            data/history/statistics.json
 CURATED    ┌──────────────┐   data/overrides/*.yaml (manual corrections, always win)
            │  assemble    │◄──────────────────  data/seeds/*.yaml (classification)
            └──────┬───────┘
                   ▼
 PUBLIC     ┌──────────────┐
            │  publish     │──────────────────► data/latest/  (standard, full, compact, entities, schemas, manifest)
            │  snapshot    │──────────────────► data/snapshots/YYYY-MM/
            │  release     │──────────────────► dist/release/ (zip, tar.gz, checksums) → GitHub release
            └──────────────┘
```

| Directory | Written by | Hand-edit? | Committed? |
| --- | --- | --- | --- |
| `data/seeds/` | Humans, review UI | Yes | Yes |
| `data/overrides/` | Humans, review UI | Yes | Yes |
| `data/mappings/` | Humans, review UI | Yes | Yes |
| `data/review/decisions.yaml` | Review UI | Rarely | Yes |
| `data/review/candidates.json` | `report` | No | Yes |
| `data/generated/` | `resolve`, `stats` | **No** | Yes |
| `data/registry/`, `data/history/` | `resolve`, `stats` | **No** | Yes |
| `data/latest/`, `data/snapshots/` | `build:data`, `snapshot` | **No** | Yes |
| `data/raw/`, `data/work/` | `discover`, `enrich` | No | No (cache) |
| `reports/` | `report` | No | Yes |

Committing the generated layer means an update PR shows exactly what the providers changed, separately from what humans changed.

## Pipeline stages

1. **discover**: for each seed company (`discover: true`, `include != false`), ask providers for games it developed or published. Wikidata uses developer (P178) and publisher (P123) statements; IGDB uses `involved_companies`. Seeds without a Wikidata ID get a lookup, used only when there is exactly one match. Every previously generated game is re-queued, so a provider hiccup can never silently drop a game.
2. **enrich**: fetch game metadata in rounds. IDs learned from one provider (e.g. a Steam app ID from Wikidata) are fed to the others until no new IDs appear. Then fetch company metadata for seeds and for every company referenced by a game.
3. **resolve**: cluster provider records that share any external ID into one game. Assign stable IDs (see [ENTITY_RESOLUTION.md](ENTITY_RESOLUTION.md)), merge fields using per-field source priority, resolve companies and technologies, and record provenance, conflicts and suspected duplicates as issues. If a provider failed, the game's previous generated record is carried over.
4. **stats**: record today's Steam review counts in the history and compute review velocity.
5. **validate**: schemas for every source file, integrity checks, and contribution rules. It fails on any error.
6. **report**: diff the assembled dataset against `data/latest`, write `reports/<date>.md`, and produce review candidates.
7. **build:data** (assemble + publish): apply seeds and overrides, decide inclusion, compute statistics, relationships and rankings, validate every entity, and write every published file. Files are written only when their content changed, and stale files are deleted.

## Source priority

Defined in `src/pipeline/priority.ts`. The first provider with a non-empty value wins, and the others are kept as `alternatives` in provenance.

| Field | Priority |
| --- | --- |
| title, type, release date, release status | Steam → IGDB → Wikidata |
| developers, publishers | Steam → Wikidata → IGDB |
| store description, features, languages, media | Steam only |
| website | Steam → Wikidata → IGDB |
| franchise, series | IGDB → Wikidata |
| platforms, genres, tags, alternate titles, technology | Union of all providers |
| company facts (location, founding, ownership, social links) | Wikidata → IGDB |

Manual data (seeds, overrides) is applied after merging and **always** wins.

## Inclusion rules

- A company is in the curated set if its seed classification has `include: true` (the default for seeds).
- A game is published if at least one developer or publisher is in the curated set, or it was created or explicitly kept by an override. Its type must be in `policies.includeGameTypes`.
- Other companies are published only when an included game references them. They are marked `classification: { include: false, category: "unclassified" }` until reviewed.
- `exclude: true` in an override always removes an entity.

## Determinism and idempotency

- Running the pipeline twice with the same inputs produces byte-identical files.
- `retrievedAt` is a date, not a time. `lastUpdated` changes only when an entity's metadata changes. `manifest.generatedAt` changes only when `contentHash` changes.
- Arrays are sorted and JSON keys have a fixed order.
- Provider responses are cached in `data/raw/` (7 days for metadata, 20 hours for statistics). `--offline` replays the cache.

## Providers

| Provider | Access | Used for | Limits we apply |
| --- | --- | --- | --- |
| Wikidata | SPARQL endpoint, no key | Discovery, cross-IDs, company facts, engines, languages | Batched queries, 1.1 s spacing, descriptive User-Agent |
| Steam | Public store and Web API endpoints, no key | Metadata, store descriptions, artwork URLs, reviews, players | 1.5 s spacing (store), 1 s (Web API) |
| IGDB | Twitch OAuth client credentials (optional) | Complementary metadata, companies, engines | ≤ 4 requests/s, batched (500) |

See [DATA-SOURCES.md](../DATA-SOURCES.md) for terms of use. The mock provider (`src/providers/mock.ts`) replays fictional fixtures for tests and `npm run demo`.

## Code map

```
src/
  cli/          index.ts (commands), demo.ts
  config.ts     dataset.config.json schema + all paths
  schema/       zod schemas: common, entities (published), files (seeds, overrides, generated…)
  lib/          ids, names, fuzzy, dates, vocab, http (cache + rate limit), io, hash, clusters
  providers/    wikidata, steam, igdb, mock
  pipeline/     discover, enrich, resolve (+ resolvers, priority), stats, overrides,
                assemble, publish, build, report, validate, snapshot, release, state
  review/       server.ts (local HTTP), ui.ts (page), actions.ts (decision -> YAML edits)
test/           unit, pipeline (end-to-end on fixtures), review
```
