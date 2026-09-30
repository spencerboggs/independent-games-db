import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { zipSync } from "fflate";
import * as tar from "tar";
import { loadConfig } from "../config.ts";
import { sha256 } from "../lib/hash.ts";
import { ensureDir, exists, listFiles, readJson, readText, removeDir, toJson, writeText } from "../lib/io.ts";
import { log } from "../lib/log.ts";
import type { Manifest } from "../schema/entities.ts";
import { build } from "./build.ts";
import { snapshot } from "./snapshot.ts";
import type { Workspace } from "./state.ts";
import { validate } from "./validate.ts";

export type Bump = "major" | "minor" | "patch";

export function bumpVersion(version: string, bump: Bump): string {
  const [major, minor, patch] = version.split(".").map(Number) as [number, number, number];
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const DOCS = ["README.md", "LICENSE", "LICENSE-CODE", "LICENSE-DATA.md", "DATA-SOURCES.md", "CHANGELOG.md", "docs/DATA_DICTIONARY.md"];
const ASSETS: [string, string][] = [
  ["manifest.json", "manifest.json"],
  ["games.json", "games.json"],
  ["companies.json", "companies.json"],
  ["engines.json", "engines.json"],
  ["technologies.json", "technologies.json"],
  ["relationships.json", "relationships.json"],
  ["statistics.json", "statistics.json"],
  ["compact/games.json", "compact-games.json"],
  ["compact/companies.json", "compact-companies.json"],
];

function updateChangelog(ws: Workspace, manifest: Manifest): void {
  const path = ws.paths.changelog;
  const current = exists(path) ? readText(path) : "# Changelog\n";
  const heading = `## [${manifest.datasetVersion}]`;
  if (current.includes(heading)) return;
  const reportPath = join(ws.paths.reports, "latest.md");
  const reportSummary = exists(reportPath)
    ? readText(reportPath)
        .split("\n")
        .filter((l) => l.startsWith("## ") && !l.includes("Review queue"))
        .map((l) => `- ${l.slice(3)}`)
        .join("\n")
    : "";
  const c = manifest.counts;
  const entry = [
    `${heading} - ${ws.now.toISOString().slice(0, 10)}`,
    "",
    `- Schema version ${manifest.schemaVersion}`,
    `- ${c.games} games, ${c.companies} companies, ${c.technologies} technologies (${c.engines} engines), ${c.people} people, ${c.relationships} relationships`,
    ...(reportSummary ? ["- Changes since the previous build (see reports/):", reportSummary.replace(/^- /gm, "  - ")] : []),
    "",
  ].join("\n");
  const [head, ...rest] = current.split(/\n(?=## \[)/);
  writeText(path, [head!.trimEnd() + "\n", entry, ...rest].join("\n"));
}

/** Packages data/latest into dist/release/ (zip, tar.gz, individual assets, checksums). */
export async function packageRelease(ws: Workspace): Promise<string[]> {
  const manifest = readJson<Manifest>(join(ws.paths.latest, "manifest.json"));
  const version = manifest.datasetVersion;
  const out = join(ws.paths.dist, "release");
  removeDir(out);
  ensureDir(out);
  const prefix = `database-v${version}`;
  const root = ws.paths.root;
  const entries = [
    ...listFiles(ws.paths.latest).map((f) => relative(root, f).split(sep).join("/")),
    ...DOCS.filter((d) => exists(join(root, d))),
  ].sort();

  const zipInput: Record<string, Uint8Array> = {};
  for (const entry of entries) zipInput[`${prefix}/${entry}`] = readFileSync(join(root, entry));
  const zipPath = join(out, `${prefix}.zip`);
  writeBinary(zipPath, zipSync(zipInput, { level: 9, mtime: new Date(manifest.generatedAt) }));

  const tarPath = join(out, `${prefix}.tar.gz`);
  await tar.create({ gzip: true, file: tarPath, cwd: root, prefix, portable: true, mtime: new Date(manifest.generatedAt) }, entries);

  const produced = [zipPath, tarPath];
  for (const [src, name] of ASSETS) {
    const from = join(ws.paths.latest, src);
    if (!exists(from)) continue;
    const to = join(out, name);
    writeText(to, readText(from));
    produced.push(to);
  }
  const sums = produced.map((p) => `${sha256(readFileSync(p))}  ${relative(out, p)}`).join("\n") + "\n";
  writeText(join(out, "SHA256SUMS.txt"), sums);

  const notes = [
    `# ${manifest.name} v${version}`,
    "",
    `Schema ${manifest.schemaVersion}. Generated ${manifest.generatedAt}.`,
    "",
    `| | count |`,
    `| --- | ---: |`,
    ...Object.entries(manifest.counts).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "Pinned raw URL for this release:",
    "",
    "```",
    manifest.urls.pinned.replace(/v\d+\.\d+\.\d+/, `v${version}`) + "games.json",
    "```",
    "",
    "Third-party material keeps its own terms. See DATA-SOURCES.md before redistributing.",
    "",
  ].join("\n");
  writeText(join(out, "RELEASE_NOTES.md"), notes);
  log.info(`  packaged ${produced.length} assets in dist/release/`);
  return produced;
}

function writeBinary(path: string, data: Uint8Array): void {
  ensureDir(dirname(path));
  writeFileSync(path, data);
}

export async function release(
  ws: Workspace,
  opts: { bump?: Bump; version?: string; packageOnly?: boolean } = {},
): Promise<{ version: string; assets: string[] }> {
  if (!opts.packageOnly) {
    const raw = readJson<Record<string, unknown>>(ws.paths.config);
    const current = String(raw.datasetVersion);
    const next = opts.version ?? bumpVersion(current, opts.bump ?? "minor");
    if (!/^\d+\.\d+\.\d+$/.test(next)) throw new Error(`invalid version "${next}"`);
    raw.datasetVersion = next;
    writeText(ws.paths.config, toJson(raw));
    ws.config = loadConfig(ws.paths);
    log.info(`  dataset version ${current} -> ${next}`);

    const result = validate(ws);
    if (result.errors.length) throw new Error(`validation failed:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
    build(ws);
    snapshot(ws);
    updateChangelog(ws, readJson<Manifest>(join(ws.paths.latest, "manifest.json")));
  }
  const assets = await packageRelease(ws);
  return { version: ws.config.datasetVersion, assets };
}
