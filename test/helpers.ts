import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemoWorkspace, DEMO_FIXTURE, DEMO_NOW, runPipeline } from "../src/cli/demo.ts";
import { readJson } from "../src/lib/io.ts";
import { MockProvider, type MockFixture } from "../src/providers/mock.ts";
import type { Workspace } from "../src/pipeline/state.ts";

export const fixture = (): MockFixture => readJson<MockFixture>(join(DEMO_FIXTURE, "provider.json"));

export function tempWorkspace(now = DEMO_NOW): Workspace {
  return createDemoWorkspace(mkdtempSync(join(tmpdir(), "igdb-test-")), now);
}

export async function builtWorkspace(data: MockFixture = fixture(), now = DEMO_NOW) {
  const ws = tempWorkspace(now);
  const result = await runPipeline(ws, new MockProvider(data));
  return { ws, ...result };
}

export const latest = <T>(ws: Workspace, file: string): T => readJson<T>(join(ws.paths.latest, file));
