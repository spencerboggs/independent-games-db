#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { createPaths, REPO_ROOT } from "../config.ts";
import { HttpClient } from "../lib/http.ts";
import { log } from "../lib/log.ts";
import { createProviders } from "../providers/index.ts";
import { MockProvider } from "../providers/mock.ts";
import type { Provider } from "../providers/types.ts";
import { BuildError } from "../pipeline/assemble.ts";
import { build } from "../pipeline/build.ts";
import { discover, loadDiscovery } from "../pipeline/discover.ts";
import { enrich, loadEnrichment } from "../pipeline/enrich.ts";
import { release, type Bump } from "../pipeline/release.ts";
import { report } from "../pipeline/report.ts";
import { resolve } from "../pipeline/resolve.ts";
import { snapshot } from "../pipeline/snapshot.ts";
import { openWorkspace, type Workspace } from "../pipeline/state.ts";
import { updateStatistics } from "../pipeline/stats.ts";
import { validate } from "../pipeline/validate.ts";
import { startReviewServer } from "../review/server.ts";
import { runDemo } from "./demo.ts";

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const [command = "help", ...rest] = argv;
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=", 2) as [string, string | undefined];
    if (value !== undefined) flags[key] = value;
    else if (rest[i + 1] && !rest[i + 1]!.startsWith("--")) flags[key] = rest[++i]!;
    else flags[key] = true;
  }
  return { command, flags };
}

function workspace(flags: Flags): Workspace {
  const root = typeof flags.root === "string" ? resolvePath(flags.root) : REPO_ROOT;
  const envFile = join(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return openWorkspace(createPaths(root));
}

function providers(ws: Workspace, flags: Flags): Provider[] {
  if (typeof flags.mock === "string") return [new MockProvider(resolvePath(flags.mock))];
  const http = new HttpClient({
    cacheDir: ws.paths.raw,
    userAgent: `independent-game-database/${ws.config.datasetVersion} (+https://github.com/${ws.config.repository}; ${ws.config.contact})`,
    refresh: flags.refresh === true,
    offline: flags.offline === true,
  });
  const all = createProviders({ http, config: ws.config, now: ws.now });
  if (typeof flags.providers === "string") {
    const wanted = new Set(flags.providers.split(","));
    return all.filter((p) => wanted.has(p.id));
  }
  return all;
}

function printValidation(result: ReturnType<typeof validate>): boolean {
  for (const w of result.warnings) log.warn(w);
  for (const e of result.errors) log.error(e);
  if (!result.errors.length) log.info(`  valid (${result.warnings.length} warning(s))`);
  return result.errors.length === 0;
}

const HELP = `Independent Game Database

Usage: npm run <command> [-- --flags]

Pipeline
  discover        Seed companies -> games (Wikidata, IGDB)
  enrich          Fetch metadata for discovered games (Wikidata, IGDB, Steam)
  resolve         Entity resolution -> data/generated
  stats           Record review history, compute review velocity
  report          Change report (reports/) + review queue (data/review/candidates.json)
  review          Local review UI at http://127.0.0.1:4477
  validate        Validate sources, generated data and the assembled dataset
                  --check-output  also verify data/latest matches a fresh build
  build:data      Generated + seeds + overrides -> data/latest
  snapshot        Immutable copy of data/latest in data/snapshots/YYYY-MM
  release         Bump version, build, snapshot, changelog, package dist/release
                  --bump major|minor|patch (default minor) | --version X.Y.Z | --package-only
  update          discover -> enrich -> resolve -> stats -> validate -> report -> build
  demo            Run the whole pipeline offline against fictional mock data

Flags
  --offline             Use only cached provider responses
  --refresh             Ignore the provider cache
  --providers=a,b       Limit providers (wikidata, igdb, steam)
  --mock=<file>         Use a mock provider fixture instead of real providers
  --root=<dir>          Operate on another workspace directory
`;

async function main(): Promise<number> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "help" || flags.help) {
    console.log(HELP);
    return 0;
  }
  if (command === "demo") return runDemo();

  const ws = workspace(flags);
  switch (command) {
    case "discover":
      log.step("Discover");
      await discover(ws, providers(ws, flags));
      return 0;
    case "enrich":
      log.step("Enrich");
      await enrich(ws, providers(ws, flags), loadDiscovery(ws));
      return 0;
    case "resolve":
      log.step("Resolve");
      resolve(ws, loadEnrichment(ws), loadDiscovery(ws));
      return 0;
    case "stats":
      log.step("Statistics");
      updateStatistics(ws);
      return 0;
    case "report":
      log.step("Report");
      report(ws);
      return 0;
    case "validate":
      log.step("Validate");
      return printValidation(validate(ws, { checkOutput: flags["check-output"] === true })) ? 0 : 1;
    case "build":
      log.step("Build");
      build(ws);
      return 0;
    case "snapshot":
      log.step("Snapshot");
      snapshot(ws, { force: flags.force === true, ...(typeof flags.label === "string" ? { label: flags.label } : {}) });
      return 0;
    case "release": {
      log.step("Release");
      const result = await release(ws, {
        ...(typeof flags.bump === "string" ? { bump: flags.bump as Bump } : {}),
        ...(typeof flags.version === "string" ? { version: flags.version } : {}),
        packageOnly: flags["package-only"] === true,
      });
      if (!flags["package-only"]) {
        log.info(`\nNext steps:\n  git add -A && git commit -m "Release dataset v${result.version}"\n  git tag v${result.version} && git push && git push --tags\nThe release workflow publishes dist/release/ as a GitHub release.`);
      }
      return 0;
    }
    case "review": {
      const port = typeof flags.port === "string" ? Number(flags.port) : 4477;
      const server = await startReviewServer(ws, port);
      log.info(`Review UI running at ${server.url} (local only). Press Ctrl+C to stop.`);
      await new Promise(() => undefined);
      return 0;
    }
    case "update": {
      const list = providers(ws, flags);
      log.step("1/7 Discover");
      const discovery = await discover(ws, list);
      log.step("2/7 Enrich");
      const enrichment = await enrich(ws, list, discovery);
      log.step("3/7 Resolve");
      resolve(ws, enrichment, discovery);
      log.step("4/7 Statistics");
      updateStatistics(ws);
      log.step("5/7 Validate");
      const result = validate(ws);
      if (!printValidation(result)) return 1;
      log.step("6/7 Report");
      report(ws, result.dataset!);
      log.step("7/7 Build");
      build(ws);
      log.info("\nDone. Review reports/latest.md, then run `npm run review` to curate candidates.");
      return 0;
    }
    default:
      console.error(`Unknown command "${command}".\n`);
      console.log(HELP);
      return 1;
  }
}

main()
  .then((code) => {
    if (code !== 0) process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof BuildError) log.error(error.message);
    else log.error((error as Error).stack ?? String(error));
    process.exitCode = 1;
  });
