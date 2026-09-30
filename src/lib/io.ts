import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import type { z } from "zod";

export class SourceFileError extends Error {
  constructor(
    public readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
  }
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function exists(path: string): boolean {
  return existsSync(path);
}

export function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

export function toJson(value: unknown, pretty = true): string {
  return (pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)) + "\n";
}

/** Writes only when content differs, so repeated runs leave files untouched. */
export function writeText(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
  return true;
}

export function writeJson(path: string, value: unknown, pretty = true): boolean {
  return writeText(path, toJson(value, pretty));
}

export function readJson<T = unknown>(path: string): T {
  try {
    return JSON.parse(readText(path)) as T;
  } catch (error) {
    throw new SourceFileError(path, `invalid JSON: ${(error as Error).message}`);
  }
}

export function readJsonOr<T>(path: string, fallback: T): T {
  return existsSync(path) ? readJson<T>(path) : fallback;
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("\n");
}

export function parseWith<S extends z.ZodType>(schema: S, value: unknown, file: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new SourceFileError(file, `schema validation failed:\n${formatZodError(result.error)}`);
  return result.data;
}

/** Reads a YAML source file. Missing or empty files parse as `{}`. */
export function readYaml<S extends z.ZodType>(path: string, schema: S): z.output<S> {
  if (!existsSync(path)) return parseWith(schema, {}, path);
  let raw: unknown;
  try {
    raw = YAML.parse(readText(path)) ?? {};
  } catch (error) {
    throw new SourceFileError(path, `invalid YAML: ${(error as Error).message}`);
  }
  return parseWith(schema, raw, path);
}

export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function uniq<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

export function uniqSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}
