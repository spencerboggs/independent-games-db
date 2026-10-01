# Independent Game Database

JSON dataset of independent and non-AAA games, the companies that make and publish them, and the engines and tools they use.

You can use it over HTTPS. Cloning is only needed if you want to change the data.

Repository: https://github.com/spencerboggs/independent-games-db

## Fetch the data

Current build:

```
https://raw.githubusercontent.com/spencerboggs/independent-games-db/main/data/latest/
```

After a version tag exists, replace `main` with that tag (for example `v0.1.0`) to stay on one release. `manifest.json` has the dataset version, schema version, record counts, file checksums, and sources.

```js
const BASE = "https://raw.githubusercontent.com/spencerboggs/independent-games-db/main/data/latest/";

const [games, companies] = await Promise.all([
  fetch(BASE + "games.json").then((r) => r.json()),
  fetch(BASE + "companies.json").then((r) => r.json()),
]);

const titles = games.map((g) => g.title);
const byTeamCherry = games.filter((g) => g.developers.includes("team-cherry") || g.publishers.includes("team-cherry"));
```

```python
import requests

BASE = "https://raw.githubusercontent.com/spencerboggs/independent-games-db/main/data/latest/"
games = requests.get(BASE + "compact/games.json").json()
titles = [g["title"] for g in games]
top = sorted(games, key=lambda g: g["reviewCount"] or 0, reverse=True)[:10]
```

```bash
curl -sL https://raw.githubusercontent.com/spencerboggs/independent-games-db/main/data/latest/manifest.json
```

One record at a time:

```
data/latest/entities/games/hollow-knight.json
data/latest/entities/companies/team-cherry.json
data/latest/by-company/team-cherry.json
data/latest/by-engine/godot.json
data/latest/index.json
```

## Files

All of these are under `data/latest/`.

| File | Contents |
| --- | --- |
| `manifest.json` | Versions, counts, checksums, sources |
| `games.json` | Games. The name of a game is `title` |
| `companies.json` | Developers, publishers, and other companies. The name of a company is `name` |
| `developers.json` / `publishers.json` | Companies filtered by role |
| `technologies.json` / `engines.json` | Engines, middleware, languages, tools |
| `relationships.json` | Developer, publisher, engine, parent, and similar links |
| `statistics.json` | Rankings and the formulas behind them |
| `index.json` | `id`, `type`, and `name` for every entity. Games use `name` in this file only |
| `schema/*.schema.json` | JSON Schema for each file |

| Variant | Path | Use it for |
| --- | --- | --- |
| Standard | `data/latest/*.json` | Most apps |
| Full | `data/latest/full/*.json` | Per-field sources and Steam review history |
| Compact | `data/latest/compact/*.json` | Lists and search |

## Fields

Every record has an `id`. That is the stable slug used to join files (`hollow-knight`, `team-cherry`, `unity`). It stays the same when a title changes. Join records with `id`.

Read the display string from the field in this table:

| Where | Field to read | Example |
| --- | --- | --- |
| A game in `games.json`, `compact/games.json`, `entities/games/*.json`, `by-company/*.json`, or `by-engine/*.json` | `title` | `"Hollow Knight"` |
| A company in `companies.json`, `developers.json`, `publishers.json`, or `compact/companies.json` | `name` | `"Team Cherry"` |
| An engine, language, or tool in `technologies.json` or `engines.json` | `name` | `"Unity"` |
| A row in `index.json` | `name` | This file is only `id`, `type`, and `name`, including for games |
| A row in `statistics.json` rankings | `title`, and `game` | `game` is the game `id`. `title` is the display name. `value` is the ranked number |

`developers` and `publishers` on a game are company ids. Look up `"team-cherry"` in `companies.json` and read `name`.

`null` means unknown. An empty array means none are known.

### Game fields

These are the fields on a standard game (`games.json` or `entities/games/<id>.json`):

| Field | Meaning |
| --- | --- |
| `id` | Slug, such as `hollow-knight` |
| `title` | The game's name |
| `alternateTitles` | Other titles seen from different sources |
| `type` | `game`, `dlc`, `expansion`, `remaster`, `remake`, `port`, `bundle`, `demo`, or `other` |
| `releaseDate` | `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, or `null` |
| `releaseStatus` | `released`, `early-access`, `upcoming`, `cancelled`, or `unknown` |
| `developers`, `publishers` | Company ids |
| `genres` | Genre ids, such as `metroidvania` or `rpg` |
| `platforms` | Platform ids, such as `windows`, `macos`, `linux`, or `nintendo-switch` |
| `externalIds.steam` | Steam app id, when one is known |
| `externalIds.wikidata` | Wikidata id, such as `Q29300592` |
| `externalIds.igdb` | IGDB slug |
| `links.steam` | Store page URL |
| `technology.engines` | List of `{ id, confidence, source }`. `id` matches a row in `technologies.json` |
| `statistics.steam` | Steam numbers, or `null` when Steam has no count for this game |
| `statistics.steam.reviewCount` | Number of Steam reviews |
| `statistics.steam.positivePercentage` | Share of those reviews that are positive |
| `descriptions.source.text` | Short description copied from the store. `descriptions.source.license` is `third-party` |
| `descriptions.custom` | Text written for this database, or `null` |

`compact/games.json` is a shorter game object: `id`, `title`, `type`, `releaseDate`, `developers`, `publishers`, `platforms`, `genres`, `engines` (engine ids only), `steamAppId`, `reviewCount`, `positivePercentage`.

### Company fields

| Field | Meaning |
| --- | --- |
| `id` | Slug, such as `team-cherry` |
| `name` | The company's name |
| `aliases` | Other names |
| `roles` | Includes `developer` and `publisher` when the company does that work |
| `classification.include` | `true` when the company is in the curated set |
| `classification.category` | One of the categories in the table below |
| `classification.notes` | Short editorial note, or an empty string |
| `games.developed`, `games.published` | Game ids |
| `location.country` | Two-letter country code, or `null` |
| `website` | Company site, or `null` |

`developers.json` and `publishers.json` are the same company records, kept only when `roles` includes that role.

`compact/companies.json` uses `id`, `name`, `roles`, `country`, `founded`, `category`, `include`, and `gameCount`.

A game is included when at least one developer or publisher has `classification.include` set to `true`. Other companies still appear when a curated game credits them. Those have `include` set to `false` and `category` set to `unclassified`.

There are no sales or revenue numbers. Rankings use Steam review counts, the positive percentage, current players, and how fast the review count is changing. The formulas are in [docs/STATISTICS.md](docs/STATISTICS.md). The full field list is in [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md).

### Classification

`classification.category` is one of:

| Category | Meaning |
| --- | --- |
| `independent` | Self-owned studio |
| `independent-large` | Independent, but large or publicly listed |
| `independent-publisher` | Publisher focused on independent games |
| `acquired-independent` | Started independent, now owned by a larger group |
| `subsidiary` | Part of a larger company |
| `AAA-adjacent` | Included for context |
| `other` / `excluded` | Other, or left out on purpose |
| `unclassified` | Found automatically, not reviewed yet |

## Licenses

- Database compilation: Open Database License 1.0 ([LICENSE](LICENSE))
- Source code: MIT ([LICENSE-CODE](LICENSE-CODE))

## Data Sources

This dataset contains information collected from publicly accessible Steam data sources. Steam, Valve, and their respective trademarks and intellectual property remain the property of their respective owners.

The ODbL applies to the database compilation to the extent permitted by applicable law. It does not grant rights to third-party content or other rights that are not held by the Licensor.

Wikidata facts used here are CC0. IGDB is optional and stays under its own terms. Each record lists its sources. Details: [DATA-SOURCES.md](DATA-SOURCES.md).

## Add or correct data

Anyone can open an issue or a pull request.

- Suggest a studio: [add a company](https://github.com/spencerboggs/independent-games-db/issues/new?template=add-company.yml)
- Fix a record: [data correction](https://github.com/spencerboggs/independent-games-db/issues/new?template=data-correction.yml)
- Report an engine or tool: [technology claim](https://github.com/spencerboggs/independent-games-db/issues/new?template=technology-claim.yml)

To change the data yourself, edit `data/seeds/`, `data/overrides/`, or `data/mappings/`. Do not hand-edit `data/generated/`, `data/latest/`, or `data/snapshots/`. Rebuild and commit the generated files with the source edit. CI checks that `data/latest` matches a fresh build.

```bash
npm install
npm run validate
npm run build:data
npm test
```

Adding a studio means a new entry in `data/seeds/companies.yaml`. `npm run update` then finds its games from Wikidata and Steam. That needs network access. Requirements and the local review UI are in [CONTRIBUTING.md](CONTRIBUTING.md). Node.js 22 or newer.
