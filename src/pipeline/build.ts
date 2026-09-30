import { log } from "../lib/log.ts";
import { assemble, type Dataset } from "./assemble.ts";
import { renderDataset, writeFileMap, type FileMap } from "./publish.ts";
import type { Workspace } from "./state.ts";

export interface BuildResult {
  dataset: Dataset;
  files: FileMap;
  written: string[];
  deleted: string[];
}

export function buildDataset(ws: Workspace): { dataset: Dataset; files: FileMap } {
  const dataset = assemble(ws);
  return { dataset, files: renderDataset(ws, dataset) };
}

export function build(ws: Workspace): BuildResult {
  const { dataset, files } = buildDataset(ws);
  const { written, deleted } = writeFileMap(ws.paths.latest, files);
  log.info(
    `  ${dataset.games.length} games, ${dataset.companies.length} companies, ${dataset.technologies.length} technologies, ` +
      `${dataset.relationships.length} relationships -> data/latest (${written.length} files written, ${deleted.length} removed)`,
  );
  return { dataset, files, written, deleted };
}
