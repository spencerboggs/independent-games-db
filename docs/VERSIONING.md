# Versioning and releases

Two independent version numbers appear in `manifest.json`:

| Version | Where | Bumped when |
| --- | --- | --- |
| `schemaVersion` | `dataset.config.json` | File formats change. **Major**: a field is removed or renamed, or a type or meaning changes. **Minor**: a field or file is added. **Patch**: documentation or validation only |
| `datasetVersion` | `dataset.config.json` | A release is cut. **Major**: a schema major version, or a large curation policy change. **Minor**: a regular data release. **Patch**: corrections only |

While `datasetVersion` is `0.x`, minor releases may still contain breaking schema changes. They are always listed in `CHANGELOG.md`.

## Ways to consume

| Channel | Stability |
| --- | --- |
| `main/data/latest/` | Changes whenever an update PR is merged |
| `v<version>/data/latest/` (git tag) | Frozen forever |
| `data/snapshots/YYYY-MM/` | Frozen once written. One per month, taken at release time |
| GitHub release assets | Frozen. Archives plus individual files and `SHA256SUMS.txt` |

IDs are stable across all versions. A removed entity's ID is never reused for a different entity.

## Cutting a release

```bash
npm run release -- --bump minor     # or --bump patch / --version 1.0.0
git add -A && git commit -m "Release dataset vX.Y.Z"
git tag vX.Y.Z && git push && git push --tags
```

`npm run release` updates `datasetVersion`, validates, rebuilds `data/latest`, writes the monthly snapshot (it never overwrites an existing month), prepends a `CHANGELOG.md` entry with counts, and packages `dist/release/`. Pushing the tag triggers `.github/workflows/release.yml`. That workflow checks that the tag matches `datasetVersion` and that `data/latest` is current, repackages, and publishes the GitHub release.
