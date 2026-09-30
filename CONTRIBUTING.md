# Contributing

Thanks for helping. This dataset is generated automatically but curated by people, and good contributions are small, sourced edits to the files humans own.

## The golden rule

**Never edit generated files.** `data/generated/`, `data/latest/`, `data/snapshots/`, `data/registry/` and `data/history/` are rewritten by the pipeline, so hand edits are lost and CI rejects them. Every change goes into one of these files:

| I want to… | Edit |
| --- | --- |
| Add a studio or publisher (and discover its games) | `data/seeds/companies.yaml` |
| Change how a company is classified | `data/seeds/companies.yaml` → `classification` |
| Correct a game's data, add a custom description, exclude a game | `data/overrides/games.yaml` |
| Correct a company's data | `data/overrides/companies.yaml` |
| Add, confirm or reject an engine, middleware or language claim | `data/overrides/technology.yaml` → `claims` |
| Add a technology to the catalog | `data/seeds/technologies.yaml` |
| Add or remove a relationship (porting studio, wrong publisher…) | `data/overrides/relationships.yaml` |
| Say two records are the same company or game | `data/mappings/companies.yaml` or `games.yaml` |
| Say two similar records are **different** | `distinct` in the mappings file |
| Add a person | `data/overrides/people.yaml` (with `create: true`) |

Each file begins with commented examples.

## Sources are required

- Every factual change needs a `source` with a `type` and, whenever possible, a `url`.
- `confidence: verified` requires a URL to an official statement, credits, or a first-party interview or talk.
- Good sources: official websites and press kits, in-game credits, developer blogs and interviews, conference talks, official store pages.
- Not acceptable on their own: fan wikis, forum posts, "I think it uses Unity" (use `confidence: low` with `type: community` if it is worth recording at all).
- **Do not paste third-party text** (store descriptions, press copy) into `descriptions.custom`. Custom descriptions must be your own words, because they are part of the database under the ODbL.
- Artwork is referenced by URL only. Never commit image files.

## Classification guidelines

Classification is editorial. Pick the closest category and explain edge cases in `notes`:

- **independent**: self-owned, no controlling parent company
- **independent-large**: independent, but large (hundreds of staff) or publicly listed
- **independent-publisher**: a publisher primarily of independent games
- **acquired-independent**: started independent and is now owned by a larger group
- **subsidiary**: founded or run as part of a larger company
- **AAA-adjacent**: borderline; included for context
- **other** / **excluded**

Classification changes should cite ownership information (a press release, annual report or Wikidata item).

## People

Only include people with public, professional credits, and only professional information: name, role, company, credited games. No personal details. Every affiliation and credit needs a source.

## Issues

If you do not want to run the pipeline, open an issue instead of a pull request:

- New studio or publisher: the "Suggest a company" template. Include a Wikidata QID when one exists, and a source for the classification.
- Wrong or missing game data: the "Data correction" template. Name the entity ID and a source URL.
- Engine, middleware, language, or tool: the "Technology claim" template.

A maintainer adds accepted companies to `data/seeds/companies.yaml`. The next update discovers their games.

## Workflow

```bash
npm install
# edit seeds / overrides / mappings
npm run validate       # checks your YAML against the schema and the rules above
npm run build:data     # regenerates data/latest from your changes
npm test
```

Commit both your source edits **and** the rebuilt `data/latest` in the same pull request. CI rebuilds from scratch and fails if `data/latest` does not match.

If you added a seed company, `npm run update` discovers its games. You can run it locally (it needs network access and takes a while), or let a maintainer's scheduled update pick it up.

### Reviewing automated updates (maintainers)

1. The scheduled workflow opens an "Automated data update" PR with `reports/latest.md`.
2. Check out the branch and run `npm run review`, then open http://127.0.0.1:4477.
3. Approve, reject, edit, merge or ignore candidates. Each decision writes to seeds, overrides or mappings.
4. Click **Rebuild dataset**, check `git diff`, commit and push to the PR branch.
5. Merge once CI is green.

The review UI binds to 127.0.0.1 and requires a per-session token. Never expose it publicly.

## Code changes

- TypeScript, ESM, Node 22+. Run `npm run check` (typecheck and tests) before pushing.
- New providers must use documented, permitted APIs only. Link the docs and terms in the file header and in DATA-SOURCES.md. **Never invent endpoints.**
- Keep the pipeline deterministic: sorted arrays, no timestamps finer than a day in generated data, no randomness.
- Schema changes need a `schemaVersion` bump and an entry in `CHANGELOG.md` (see docs/VERSIONING.md).

## Pull request checklist

- [ ] Only source files (seeds, overrides, mappings) were edited by hand
- [ ] Every factual change has a source
- [ ] `npm run validate` passes
- [ ] `data/latest` was rebuilt and committed
