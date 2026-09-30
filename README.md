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

const curated = new Set(companies.filter((c) => c.classification.include).map((c) => c.id));
const byTeamCherry = games.filter((g) => g.developers.includes("team-cherry") || g.publishers.includes("team-cherry"));
```

```python
import requests

BASE = "https://raw.githubusercontent.com/spencerboggs/independent-games-db/main/data/latest/"
games = requests.get(BASE + "compact/games.json").json()
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
| `games.json` | Games |
| `companies.json` | Developers, publishers, and other companies |
| `developers.json` / `publishers.json` | Companies filtered by role |
| `technologies.json` / `engines.json` | Engines, middleware, languages, tools |
| `relationships.json` | Developer, publisher, engine, parent, and similar links |
| `statistics.json` | Rankings and the formulas behind them |
| `index.json` | id, type, and name for every entity |
| `schema/*.schema.json` | JSON Schema for each file |

| Variant | Path | Use it for |
| --- | --- | --- |
| Standard | `data/latest/*.json` | Most apps |
| Full | `data/latest/full/*.json` | Per-field sources and Steam review history |
| Compact | `data/latest/compact/*.json` | Lists and search |

Field list: [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md). Ranking formulas: [docs/STATISTICS.md](docs/STATISTICS.md).

## How records work

IDs are stable lowercase slugs (`hollow-knight`, `team-cherry`). They do not change when a title changes. `externalIds` holds `steam`, `wikidata`, and `igdb` when those exist.

A company is one record with `roles` such as `developer` and `publisher`. `classification.include` is true for the curated set. Other companies still appear when a curated game credits them, with `include: false` and category `unclassified`.

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

A game is included when at least one developer or publisher is in the curated set. Technology claims carry `confidence` and `source`. Statistics are Steam review counts, positive percentage, current players, and review velocity. There are no sales or revenue estimates.

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
