import { join } from "node:path";
import { exists, readJson, readText, writeJson, writeText, listFiles } from "../lib/io.ts";
import { log } from "../lib/log.ts";
import type { Manifest } from "../schema/entities.ts";
import type { Workspace } from "./state.ts";

/** Paths (relative to data/latest) copied into snapshots. Entity files are omitted. */
const SNAPSHOT_INCLUDE = (rel: string) =>
  !rel.startsWith("entities/") && !rel.startsWith("by-") && !rel.startsWith("full/");

export interface SnapshotEntry {
  label: string;
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: string;
  contentHash: string;
  counts: Manifest["counts"];
}

/**
 * Creates data/snapshots/<label>/ (default label: YYYY-MM). Snapshots are
 * immutable: an existing snapshot is never overwritten unless `force` is set.
 */
export function snapshot(ws: Workspace, opts: { label?: string; force?: boolean } = {}): string | null {
  const label = opts.label ?? ws.now.toISOString().slice(0, 7);
  const dir = join(ws.paths.snapshots, label);
  const manifestPath = join(ws.paths.latest, "manifest.json");
  if (!exists(manifestPath)) throw new Error("data/latest is empty; run `npm run build:data` first");
  if (exists(join(dir, "manifest.json")) && !opts.force) {
    log.info(`  snapshot ${label} already exists (immutable); skipping`);
    return null;
  }
  for (const file of listFiles(ws.paths.latest)) {
    const rel = file.slice(ws.paths.latest.length + 1).replace(/\\/g, "/");
    if (SNAPSHOT_INCLUDE(rel)) writeText(join(dir, rel), readText(file));
  }
  const manifest = readJson<Manifest>(manifestPath);
  const indexPath = join(ws.paths.snapshots, "index.json");
  const index = exists(indexPath) ? readJson<SnapshotEntry[]>(indexPath) : [];
  const entry: SnapshotEntry = {
    label,
    datasetVersion: manifest.datasetVersion,
    schemaVersion: manifest.schemaVersion,
    generatedAt: manifest.generatedAt,
    contentHash: manifest.contentHash,
    counts: manifest.counts,
  };
  writeJson(indexPath, [...index.filter((e) => e.label !== label), entry].sort((a, b) => (a.label < b.label ? -1 : 1)));
  log.info(`  snapshot written to data/snapshots/${label}`);
  return dir;
}
