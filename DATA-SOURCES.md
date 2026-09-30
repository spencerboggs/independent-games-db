# Data sources and rights

This file separates the database compilation from material this project only references or quotes. Read it before reusing the data.

> This is not legal advice. If your use case depends on it, check the providers' current terms yourself.

## What the repository licenses cover

| Material | License |
| --- | --- |
| Source code (`src/`, `test/`, workflows) | MIT: see [LICENSE-CODE](LICENSE-CODE) |
| Database compilation: structure and selection, IDs, classifications and notes, relationships assembled by this project, statistics we derive (velocity, rankings, aggregates), and text we write (`descriptions.custom`, `license: "database"`) | ODbL 1.0: see [LICENSE](LICENSE) |

## Third-party material (not relicensed)

| Material | Owner | How it appears | Your obligations |
| --- | --- | --- | --- |
| Store descriptions (`descriptions.source`, `license: "third-party"`) | Steam page authors (developers/publishers) | Short description only, quoted, with source URL | Treat as quotation; keep attribution; do not assume a license |
| Artwork (`media.*`, `logo`; `rights: "reference-only"`) | Rights holders | **URLs only.** No image is stored in this repository | Link, do not rehost without permission |
| Game titles, names, trademarks | Their owners | Factual references | Normal trademark rules apply |
| Steam review counts and player counts | Valve / Steam | Numbers retrieved via Steam endpoints | See Steam below |

## Providers

### Wikidata

- **Used for:** game discovery (developer P178, publisher P123), cross-service identifiers (Steam app ID P1733, IGDB IDs P5794/P9650), company facts (inception, headquarters, country, parent company, websites, social accounts), engine (P408) and programming language (P277) claims.
- **Access:** public SPARQL endpoint `https://query.wikidata.org/sparql`, with a descriptive User-Agent as required by the Wikimedia User-Agent policy. Queries are batched and spaced.
- **License:** structured data is **CC0 1.0**. No attribution is required, but we credit it anyway.
- Terms: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use · https://www.wikidata.org/wiki/Wikidata:Licensing

### Steam

- **Used for:** titles, release dates, platforms, genres and features, supported languages, the store short description, artwork URLs, review summaries and current player counts.
- **Access:**
  - Store details: `https://store.steampowered.com/api/appdetails` (public but undocumented; used conservatively with 1.5 s spacing and caching)
  - Reviews: `IUserReviewsService/GetAppReviews` (documented Steamworks Web API; replaces the deprecated `/appreviews`)
  - Players: `ISteamUserStats/GetNumberOfCurrentPlayers` (documented Steam Web API)
- **Terms:** Steam Web API Terms of Use (https://steamcommunity.com/dev/apiterms). This project is not affiliated with or endorsed by Valve. Steam data is provided "as is". Steam is a trademark of Valve Corporation.

### IGDB (optional)

- **Used for:** complementary game metadata, involved companies (developer, publisher, porting, support), engines, franchises and collections.
- **Access:** `https://api.igdb.com/v4` with Twitch client-credentials OAuth. At most 4 requests per second.
- **Terms:** Twitch Developer Services Agreement. The free API is for **non-commercial** use. Commercial use needs an IGDB partnership and attribution. IGDB permits caching and storing data. **Attribution: data provided by [IGDB.com](https://www.igdb.com).**
- IGDB is disabled unless credentials are configured (`.env`). If you redistribute a build that includes IGDB-sourced fields, you inherit these terms.

### Manual curation

Seeds, overrides and mappings, written by contributors. They are part of the database compilation under the ODbL. Each manual fact carries its own `source`, pointing to official websites, credits, interviews and similar. The ODbL does not grant rights to third-party content taken from those sources.

## Provenance in the data

- Every entity has `sources[]`.
- The **full** variant has `provenance[field] = { source, confidence, url, retrievedAt, alternatives }`, so you can drop fields from providers whose terms do not suit your use.
- `manifest.json → sources` lists every provider used in a build, with its license and usage.

## Takedown and corrections

If you are a rights holder and want something removed or corrected, open an issue (or contact the maintainers privately via the address in `dataset.config.json`). We will exclude it through an override so it stays out of future builds.
