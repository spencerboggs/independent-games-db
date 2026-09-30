/**
 * Local-only review interface. Binds to 127.0.0.1, checks the Host header
 * (DNS-rebinding protection), and requires a per-session token on every API
 * call (cross-site request protection). Never deploy this publicly.
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { exists, readJson, readJsonOr } from "../lib/io.ts";
import { log } from "../lib/log.ts";
import type { ReviewCandidate } from "../schema/files.ts";
import { build } from "../pipeline/build.ts";
import { report } from "../pipeline/report.ts";
import { loadSources, openWorkspace, type Workspace } from "../pipeline/state.ts";
import { applyDecision, DecisionError } from "./actions.ts";
import { reviewPage } from "./ui.ts";

const MAX_BODY = 1_000_000;

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("request body too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:",
  });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

export function startReviewServer(root: Workspace, port = 4477): Promise<{ close(): void; url: string }> {
  const token = randomBytes(24).toString("hex");
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const fresh = () => openWorkspace(root.paths);

  const server = createServer(async (req, res) => {
    try {
      if (!allowedHosts.has(req.headers.host ?? "")) return send(res, 403, { error: "forbidden host" });
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (req.method === "GET" && url.pathname === "/") return send(res, 200, reviewPage(token), "text/html");
      if (!url.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
      if (req.headers["x-review-token"] !== token) return send(res, 403, { error: "missing or invalid review token" });

      const ws = fresh();
      if (req.method === "GET" && url.pathname === "/api/state") {
        const candidates = readJsonOr<ReviewCandidate[]>(ws.paths.review.candidates, []);
        const sources = loadSources(ws.paths);
        const companiesPath = join(ws.paths.latest, "compact", "companies.json");
        const gamesPath = join(ws.paths.latest, "compact", "games.json");
        return send(res, 200, {
          candidates,
          decided: sources.decisions.length,
          companies: exists(companiesPath) ? readJson(companiesPath) : [],
          games: exists(gamesPath) ? readJson(gamesPath) : [],
          technologies: sources.seeds.technologies.map((t) => ({ id: t.id, name: t.name, category: t.category })),
        });
      }
      if (req.method === "GET" && url.pathname === "/api/entity") {
        const type = url.searchParams.get("type") ?? "";
        const id = url.searchParams.get("id") ?? "";
        const folder = { game: "games", company: "companies", technology: "technologies", person: "people" }[type];
        if (!folder || !/^[a-z0-9-]+$/.test(id)) return send(res, 400, { error: "bad entity reference" });
        const path = join(ws.paths.latest, "entities", folder, `${id}.json`);
        return exists(path) ? send(res, 200, readJson(path)) : send(res, 404, { error: "entity not in the current build" });
      }
      if (req.method === "POST" && url.pathname === "/api/decide") {
        const body = (await readBody(req)) as { candidate?: string; action?: string; payload?: unknown };
        const candidates = readJsonOr<ReviewCandidate[]>(ws.paths.review.candidates, []);
        const candidate = candidates.find((c) => c.id === body.candidate);
        if (!candidate) return send(res, 404, { error: "unknown candidate" });
        const result = applyDecision(ws, candidate, body.action as ReviewCandidate["actions"][number], body.payload);
        log.info(`  ${body.action} ${candidate.id}`);
        return send(res, 200, { ok: true, changed: result.changed.map((p) => p.slice(ws.paths.root.length + 1)) });
      }
      if (req.method === "POST" && url.pathname === "/api/rebuild") {
        const built = build(ws);
        const { candidates } = report(ws, built.dataset);
        return send(res, 200, { ok: true, candidates: candidates.length, written: built.written.length });
      }
      return send(res, 404, { error: "not found" });
    } catch (error) {
      const status = error instanceof DecisionError || (error as Error).name === "ZodError" ? 400 : 500;
      return send(res, status, { error: (error as Error).message });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}/`;
      resolve({ url, close: () => server.close() });
    });
  });
}
