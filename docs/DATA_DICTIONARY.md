# Data dictionary

Machine-readable definitions are in `data/latest/schema/*.schema.json` (JSON Schema draft 2020-12). This document explains what the fields mean.

Conventions:

- **IDs** are lowercase kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), unique per entity type, and never change once published.
- **Dates** are ISO 8601 with variable precision: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. `releaseDatePrecision` says which.
- **Timestamps** (`lastUpdated`, `generatedAt`) are full ISO 8601 UTC. `retrievedAt` is a date.
- `null` means unknown. Empty arrays mean none known.
- Arrays of IDs and strings are sorted, so diffs stay small.

## Shared types

### Source

Where a fact came from.

| Field | Type | Notes |
| --- | --- | --- |
| `type` | enum | `official`, `steam`, `igdb`, `wikidata`, `developer-interview`, `job-posting`, `technical-article`, `community`, `inferred`, `manual` |
| `url` | URL? | Link to the evidence |
| `retrievedAt` | date? | When it was retrieved |
| `note` | string? | Free text |

### Confidence

`verified` > `high` > `medium` > `low` > `inferred`.

- `verified`: an official statement or credits, with a URL
- `high`: two independent providers agree, or a reliable manual source
- `medium`: a single structured source (Wikidata, IGDB)
- `low`: community sources
- `inferred`: deduced, not stated anywhere

### Description / SourcedText

```json
"descriptions": {
  "source": { "text": "…", "license": "third-party", "source": { "type": "steam", "url": "…" } },
  "custom": "Database-written text (part of the ODbL compilation) or null"
}
```

`license` is `database` (part of the ODbL compilation), `third-party` (rights stay with the source; quote with attribution) or `cc0`.

### MediaReference

`{ url, type, source, retrievedAt, rights, notes? }`. `type` is one of logo, header, capsule, background, screenshot, cover, artwork, icon. `rights: "reference-only"` means the image is not copied into this repository: link to it and do not rehost it without permission.

### ExternalIds

`{ wikidata?: "Q…", steam?: "<app id>", igdb?: "<slug>" }`. More providers may be added later.

### Provenance (full variant only)

`provenance["<field path>"] = { source, confidence, url, retrievedAt, alternatives? }`. `alternatives` lists values from other providers when they disagreed. Overrides record provenance per field path they change, e.g. `descriptions.custom`.

## Game (`games.json`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | ID | e.g. `hollow-knight` |
| `title` | string | Primary title (Steam, then IGDB, then Wikidata) |
| `alternateTitles` | string[] | Other titles seen across providers |
| `type` | enum | `game`, `dlc`, `expansion`, `remaster`, `remake`, `port`, `bundle`, `demo`, `other` |
| `releaseDate` | date? | Earliest known release |
| `releaseDatePrecision` | `day` / `month` / `year` / null | |
| `releaseStatus` | enum | `released`, `early-access`, `upcoming`, `cancelled`, `unknown` |
| `developers`, `publishers` | company ID[] | See `companies.json`. Porting and support studios are in `relationships.json` |
| `descriptions` | Description | See above |
| `genres` | string[] | Normalized gameplay genres (e.g. `platformer`, `rpg`, `metroidvania`). Business labels like "Indie" or "Early Access" are dropped |
| `tags` | string[] | Themes and curated tags |
| `features` | string[] | Store features, e.g. `single-player`, `online-co-op`, `steam-achievements` |
| `platforms` | string[] | Platform IDs: `windows`, `macos`, `linux`, `steam-deck`, `nintendo-switch`, `nintendo-switch-2`, `playstation-4`, `playstation-5`, `xbox-one`, `xbox-series`, `ios`, `android`, `web`… |
| `supportedLanguages` | string[] | As listed on Steam |
| `externalIds` | ExternalIds | |
| `links` | record | `official`, `steam`, `igdb`, `wikidata`, … |
| `media` | object | `header`, `capsule`, `background` (MediaReference or null), `screenshots` (MediaReference[]) |
| `technology` | object | `engines`, `middleware`, `languages`, `tools`: arrays of `{ id, confidence, source }`. IDs refer to `technologies.json` |
| `franchise`, `series` | `{ id, name }`? | |
| `relations` | object | `parentGame` (for DLC and expansions), `dlc[]`, `remasterOf`, `portOf` (game IDs) |
| `statistics` | object | `steam` (raw Steam numbers or null), `reviewVelocity` (see [STATISTICS.md](STATISTICS.md)) |
| `sources` | Source[] | Every source that contributed |
| `provenance` | Provenance | Full variant only |
| `lastUpdated` | timestamp | Last time this record's metadata changed. Statistics-only changes do not update it |

## Company (`companies.json`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | ID | e.g. `team-cherry` |
| `name` | string | |
| `aliases` | string[] | Other names seen across providers and seeds |
| `roles` | enum[] | `developer`, `publisher`, `studio`, `porting`, `support`, `holding`, `investor`. Derived from games, plus roles declared in the seed |
| `description` | Description | |
| `website` | URL? | |
| `socialLinks` | record | `x`, `bluesky`, `mastodon`, `youtube`, … |
| `location` | object | `headquarters` (city), `country` (ISO 3166-1 alpha-2), `countryName` |
| `founded` | year? | |
| `foundedDate` | date? | |
| `ownership` | object | `status` (`independent`, `subsidiary`, `acquired`, `public`, `defunct`, `unknown`), `parentCompany` (ID if the parent is in the database), `parentCompanyName`, `notes` |
| `externalIds` | ExternalIds | |
| `logo` | MediaReference? | |
| `classification` | object | `include` (in the curated set?), `category`, `notes`. See the README |
| `games` | object | `developed[]`, `published[]` (game IDs) |
| `statistics` | object | See [STATISTICS.md](STATISTICS.md) |
| `sources`, `provenance`, `lastUpdated` | | As for games |

`developers.json` and `publishers.json` contain the same records, filtered by role.

## Technology (`technologies.json`, `engines.json`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | ID | e.g. `unity`, `godot`, `fmod`, `csharp` |
| `name`, `aliases` | | |
| `category` | enum | `engine`, `middleware`, `language`, `tool`, `framework`, `service`, `other` |
| `subcategory` | string? | e.g. `audio`, `physics`, `3d-modeling`, `graphics-api` |
| `developer` | string? | |
| `website` | URL? | |
| `license` | enum | `proprietary`, `open-source`, `source-available`, `unknown` |
| `description` | Description | |
| `externalIds` | ExternalIds | |
| `games` | game ID[] | Games in the dataset that use it (any role) |
| `statistics` | object | `gameCount`, `companyCount`, `totalSteamReviews`, `mostReviewedGames`, `mostPlayedGames`, `gamesByReleaseYear` |
| `sources`, `lastUpdated` | | |

## Person (`people.json`)

Manually curated only. Only public, professional information with a source.

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `name`, `aliases` | | |
| `roles` | string[] | e.g. `composer`, `designer` |
| `affiliations` | object[] | `{ company, role, startYear, endYear, source }` |
| `credits` | object[] | `{ game, role, source }` |
| `externalIds`, `links`, `sources`, `lastUpdated` | | |

## Relationship (`relationships.json`)

A graph of every connection in the dataset.

| Field | Notes |
| --- | --- |
| `id` | `<from>:<type>:<to>` |
| `from`, `fromType`, `to`, `toType` | Entity IDs and types (`game`, `company`, `technology`, `person`) |
| `type` | `developer`, `publisher`, `porting`, `support` (company → game); `uses-engine`, `uses-middleware`, `uses-language`, `uses-tool` (game → technology); `dlc-of`, `remaster-of`, `port-of` (game → game); `subsidiary-of` (company → company); `affiliated-with` (person → company); `credited-on` (person → game) |
| `confidence` | Confidence or null |
| `sources` | Source[] |

## Statistics (`statistics.json`)

`totals`, `rankings` (six ranked lists of `{ rank, game, title, value }`), `companies`, `publishers` and `engines` (per-entity statistics keyed by ID), `releasesByYear`, and `methodology` (a plain-text formula for every number). See [STATISTICS.md](STATISTICS.md).

## Manifest (`manifest.json`)

| Field | Notes |
| --- | --- |
| `datasetVersion` | Semantic version of the data (see [VERSIONING.md](VERSIONING.md)) |
| `schemaVersion` | Semantic version of the file formats |
| `generatedAt` | Changes only when content changes (`contentHash`) |
| `contentHash` | sha256 over all published files |
| `counts` | Record counts |
| `files`, `variants`, `schemas`, `entities` | Where things are |
| `checksums` | `{ path, bytes, sha256, records }` for every listed file |
| `sources` | Providers used, with license and usage |
| `urls` | `latest`, `pinned` and `releases` base URLs |

## Compact variant (`compact/*.json`)

Minified. Only the fields most apps need:

- **games**: `id`, `title`, `type`, `releaseDate`, `developers`, `publishers`, `platforms`, `genres`, `engines`, `steamAppId`, `reviewCount`, `positivePercentage`
- **companies**: `id`, `name`, `roles`, `country`, `founded`, `category`, `include`, `gameCount`
- **technologies** / **engines**: `id`, `name`, `category`, `gameCount`
- **people**: `id`, `name`, `companies`
- **relationships**: `from`, `type`, `to`
