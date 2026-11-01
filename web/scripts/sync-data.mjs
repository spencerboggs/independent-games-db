import { cp, mkdir, readFile, rm } from "node:fs/promises";

const source = new URL("../../data/latest/", import.meta.url);
const target = new URL("../public/data/", import.meta.url);
const files = ["manifest.json", "games.json", "companies.json", "technologies.json"];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const file of files) {
  await cp(new URL(file, source), new URL(file, target));
}

const manifest = JSON.parse(await readFile(new URL("manifest.json", target), "utf8"));
const { games, companies, technologies } = manifest.counts;
console.log(
  `Copied dataset ${manifest.datasetVersion} (${manifest.generatedAt}): ${games} games, ${companies} companies, ${technologies} technologies.`,
);
