# Statistics

The database stores only numbers that can be obtained reliably and repeatably. It does **not** store or estimate sales, revenue or owner counts.

## Raw statistics (per game)

`game.statistics.steam`, taken from Steam at `retrievedAt`:

| Field | Source |
| --- | --- |
| `reviewCount`, `positiveCount`, `negativeCount` | `IUserReviewsService/GetAppReviews` → `query_summary` (`total_reviews`, `total_positive`, `total_negative`) |
| `positivePercentage`, `negativePercentage` | `positive / total × 100` and `negative / total × 100`, one decimal place; `null` when there are no reviews |
| `reviewScoreDescription` | Steam's label (e.g. "Very Positive") |
| `currentPlayers` | `ISteamUserStats/GetNumberOfCurrentPlayers`: concurrent players at retrieval time |

Review queries use `languages: ["all"]`, `review_type: All` and `purchase_type: All`. Steam's default off-topic ("review bomb") filtering is left on. The Steam store page shows Steam purchases only by default, so its counts can be slightly lower than ours.

## Review history

Every `npm run stats` (part of `npm run update`) appends one observation per game per day to `data/history/statistics.json`:

```json
{ "steamReviews": { "367520": [["2026-09-01", 412000, 398000], ["2026-09-02", 412150, 398140]] } }
```

History is thinned automatically: daily points are kept for about 13 months, then one point per month. Consumers get it in `data/latest/full/statistics-history.json`.

## Review velocity

`game.statistics.reviewVelocity` measures how fast a game gains reviews. **Review growth is not sales.** Review rates vary by genre, price, audience and region, and they change after sales and updates.

| `method` | Used when | Formula |
| --- | --- | --- |
| `history` | Stored observations span at least 7 days | `(latest.total − base.total) / days(base, latest)`, where `base` is the newest observation at least `recentWindowDays` (30) days before the latest one, or the oldest if history is shorter |
| `lifetime-average` | Not enough history yet | `reviewCount / days since release` (release date must have at least month precision) |

- `reviewsPerMonth = reviewsPerDay × 30.44`
- `recentReviewGrowth` (history method only): `reviews = latest.total − base.total`, `percent = reviews / base.total × 100`
- `observations`: number of stored history points

Right after the database is first set up, every game uses `lifetime-average`. After a week of daily updates, games switch to `history`.

## Company, publisher and engine statistics

Computed at build time from the curated data, so overrides are reflected.

**Company** (`company.statistics`):

- `gameCount`, `developedCount`, `publishedCount`
- `totalSteamReviews`: sum over the company's games
- `averagePositivePercentage`: unweighted mean of per-game positive percentages, over games with at least `averagePositiveMinReviews` (50) reviews
- `weightedPositivePercentage`: `Σ positive / Σ reviews × 100`
- `mostReviewedGame`, `firstRelease`, `mostRecentRelease` (released games only)
- `engines`, `engineCount`, `technologyCount`

**Publisher** (`statistics.json → publishers`): `gamesPublished`, `totalReviews`, `mostReviewedGames` (top 10), `developersWorkedWith`, `releaseTimeline` (year → game IDs).

**Technology / engine** (`technology.statistics`): `gameCount`, `companyCount` (distinct developers), `totalSteamReviews`, `mostReviewedGames`, `mostPlayedGames` (top 10), `gamesByReleaseYear`.

## Rankings (`statistics.json → rankings`)

Rankings include types `game`, `expansion`, `remaster`, `remake` and `port`. DLC, demos and bundles are excluded. Each list has `rankingSize` (25) entries, and ties are broken by ID.

| Ranking | Value | Rule |
| --- | --- | --- |
| `mostReviewed` | review count | Highest `reviewCount` |
| `highestRated` | positive % | Highest `positivePercentage` among games with at least `highestRatedMinReviews` (500) reviews; ties broken by review count |
| `mostPlayed` | current players | Highest `currentPlayers` in a single snapshot, not a peak |
| `recentlyPopular` | reviews/day | Highest `reviewVelocity.reviewsPerDay`. Uses `history` velocity once any exists; until then, lifetime average for games released within 365 days. `methodology.recentlyPopularBasis` says which |
| `mostRecent` | release date | Latest release among released and early-access games |
| `mostEstablished` | release date | Earliest release among games with at least `mostEstablishedMinReviews` (1000) reviews |

All thresholds live in `dataset.config.json → statistics`. The formulas actually used for a given build are in `statistics.json → methodology`.
