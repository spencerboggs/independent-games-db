# Entity resolution

Providers describe the same game and company in different ways. Resolution decides which records refer to the same real-world entity. The guiding rule: **never merge on similarity alone. Ambiguous cases go to review.**

## Games

1. **Clustering by external ID.** Provider records that share any identifier (Wikidata QID, Steam app ID, IGDB slug) are the same game. Wikidata usually links all three, so this resolves most games.
2. **Manual mappings** (`data/mappings/games.yaml → externalIds`) force a provider ID onto a canonical game, e.g. to merge a Steam re-release into the original.
3. **Stable IDs.** The registry (`data/registry/ids.json`) maps every known external ID to the game ID first assigned to it. A game keeps its ID when its title changes. New IDs are slugified titles. On a clash, the release year is appended (`prey-2017`), then a number.
4. **Duplicate detection.** Different clusters with the same normalized title (ignoring case, punctuation, "the", ™) are flagged as `potential-duplicate` for review. Pairs confirmed as different go in `distinct`.

## Companies

Resolution order for a company reference reported by a provider:

| Step | Method | Notes |
| --- | --- | --- |
| 1 | Manual mapping by external ID | `data/mappings/companies.yaml → externalIds` |
| 2 | Manual mapping by name | `names` (exact, then normalized) |
| 3 | External ID | Seeds, then previously generated companies |
| 4 | Registry | Every ID and name seen before |
| 5 | Exact / normalized name | Legal suffixes are stripped ("Team Cherry Pty Ltd" = "Team Cherry"). **Refused when the external IDs conflict** |
| 6 | New company | A new ID is allocated |

When a new company is created, its name is compared with every known company: Jaro-Winkler and token similarity, plus "core name" equality with generic words like *studios*, *games* and *publishing* removed. Scores of 0.93 or higher are flagged as `potential-duplicate`. **They are not merged.** "Coffee Stain Studios" and "Coffee Stain Publishing" share a core name, so they are flagged, and `distinct` records that they are different companies.

When one name matches several companies (e.g. an alias shared by two seeds), a seeded company is preferred. The match is flagged `ambiguous-match` for review.

When two providers disagree on a game's developers or publishers, the priority provider wins and a `source-conflict` is recorded. If the other provider's name is close to one of the chosen companies ("Hollow Lantern Studios" vs "Hollow Lantern Studio"), the conflict carries a suggestion. Merging it in the review UI writes a name/ID mapping.

## Technologies

Matched against `data/seeds/technologies.yaml` by external ID, then by name or alias. Technology names use their own normalization, in which `#` and `+` are significant, so C, C# and C++ stay distinct. Unknown technologies are created with an `unmatched-technology` issue so they can be added to the catalog, merged as an alias, or rejected.

Claim confidence: a single structured source gives `medium`, and agreement between two providers gives `high`. Only an override with a source URL can make a claim `verified`.

## Review

All issues appear in `reports/latest.md` and in the review UI:

| Candidate | Actions → file written |
| --- | --- |
| new company | approve → seed (with classification) · reject → override `include: false` · merge → mapping · edit → override |
| new game | reject → override `exclude` · merge → game mapping · edit → override |
| potential duplicate | merge → mapping · reject → `distinct` · edit → seed external IDs |
| source conflict | merge → name/ID mapping · edit → override |
| technology claim | approve/edit → claim override · reject → claim `remove` |
| unmatched technology | approve → catalog entry · merge → alias · reject → claim `remove` |
| relationship change | reject → relationship override |
| classification change | edit → override |

Every decision is also logged in `data/review/decisions.yaml` so that candidate does not reappear.
