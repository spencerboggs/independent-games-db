export function reviewPage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review queue · Independent Game Database</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --panel-2: #1e222b; --border: #2a2f3a; --text: #e6e8ee; --muted: #9aa3b2;
    --accent: #7aa2ff; --ok: #4cc38a; --warn: #f5b454; --bad: #f06a6a; --radius: 10px;
    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f6f7f9; --panel: #fff; --panel-2: #f1f3f6; --border: #dde1e8; --text: #1b1f27; --muted: #5d6675; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 var(--font); background: var(--bg); color: var(--text); }
  header { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
  .bar { max-width: 1100px; margin: 0 auto; padding: 14px 20px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  h1 { font-size: 16px; margin: 0; font-weight: 650; }
  .count { color: var(--muted); }
  .spacer { flex: 1; }
  main { max-width: 1100px; margin: 0 auto; padding: 18px 20px 80px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; max-width: 1100px; margin: 0 auto; padding: 0 20px 12px; }
  .chip { border: 1px solid var(--border); background: var(--panel); color: var(--muted); padding: 4px 10px; border-radius: 999px; cursor: pointer; font-size: 12px; }
  .chip[aria-pressed="true"] { color: var(--text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--panel)); }
  input, select, textarea, button { font: inherit; color: inherit; }
  input, select, textarea { background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; }
  textarea { width: 100%; min-height: 90px; font-family: var(--mono); font-size: 12px; }
  button { border: 1px solid var(--border); background: var(--panel-2); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #0b1020; font-weight: 600; }
  button:disabled { opacity: .5; cursor: progress; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-bottom: 12px; }
  .card h2 { font-size: 15px; margin: 4px 0 4px; font-weight: 600; }
  .summary { color: var(--muted); margin: 0 0 8px; }
  .badge { display: inline-block; font-size: 11px; letter-spacing: .02em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: var(--panel-2); color: var(--muted); border: 1px solid var(--border); }
  .badge.new-company, .badge.new-game { color: var(--ok); }
  .badge.source-conflict, .badge.potential-duplicate { color: var(--warn); }
  .badge.technology-claim { color: var(--accent); }
  .badge.relationship-change, .badge.classification-change { color: var(--bad); }
  .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .links a { color: var(--accent); cursor: pointer; margin-right: 10px; font-size: 12px; text-decoration: none; }
  details { margin: 6px 0 10px; }
  summary { cursor: pointer; color: var(--muted); font-size: 12px; }
  pre { background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px; overflow: auto; font: 12px/1.45 var(--mono); max-height: 320px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .form { margin-top: 10px; padding: 12px; border: 1px dashed var(--border); border-radius: 8px; display: grid; gap: 8px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .row label { color: var(--muted); font-size: 12px; min-width: 90px; }
  .empty { text-align: center; color: var(--muted); padding: 60px 0; }
  #toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; box-shadow: 0 8px 30px rgba(0,0,0,.3); display: none; max-width: 90vw; }
  #drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 95vw); background: var(--panel); border-left: 1px solid var(--border); transform: translateX(100%); transition: transform .2s; z-index: 10; display: flex; flex-direction: column; }
  #drawer.open { transform: none; }
  #drawer header { position: static; display: flex; padding: 12px 16px; align-items: center; gap: 8px; }
  #drawer pre { margin: 0 16px 16px; flex: 1; max-height: none; }
</style>
</head>
<body>
<header>
  <div class="bar">
    <h1>Review queue</h1>
    <span class="count" id="count"></span>
    <span class="spacer"></span>
    <input id="search" type="search" placeholder="Filter by text or ID" aria-label="Filter">
    <button id="rebuild" title="Runs build:data and regenerates the report and review queue">Rebuild dataset</button>
  </div>
  <div class="chips" id="chips"></div>
</header>
<main id="list"></main>
<aside id="drawer" aria-hidden="true"><header><strong id="drawer-title"></strong><span class="spacer"></span><button id="drawer-close">Close</button></header><pre id="drawer-body"></pre></aside>
<div id="toast" role="status"></div>
<datalist id="company-ids"></datalist><datalist id="game-ids"></datalist><datalist id="tech-ids"></datalist>
<script>
const TOKEN = ${JSON.stringify(token)};
const CATEGORIES = ["new-company","new-game","potential-duplicate","relationship-change","technology-claim","classification-change","source-conflict"];
const CLASSIFICATIONS = ["independent","independent-large","independent-publisher","acquired-independent","subsidiary","AAA-adjacent","other","excluded"];
const SOURCE_TYPES = ["official","steam","igdb","wikidata","developer-interview","job-posting","technical-article","community","inferred","manual"];
const CONFIDENCE = ["verified","high","medium","low","inferred"];
const TECH_CATEGORIES = ["engine","middleware","language","tool","framework","service","other"];
let state = { candidates: [], decided: 0 };
let filter = new Set();
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v; else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
};
async function api(path, body) {
  const res = await fetch(path, { method: body ? "POST" : "GET", headers: { "X-Review-Token": TOKEN, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg, ms = 4000) { const t = $("#toast"); t.textContent = msg; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", ms); }
function select(name, options, value) { const s = el("select", { name }); for (const o of options) s.append(el("option", { value: o, ...(o === value ? { selected: "" } : {}) }, o)); return s; }
function field(label, input) { return el("div", { class: "row" }, el("label", {}, label), input); }
function sourceFields(defaults = {}) {
  return [field("Source type", select("sourceType", SOURCE_TYPES, defaults.type || "official")), field("Source URL", el("input", { name: "sourceUrl", type: "url", placeholder: "https://…", size: 50 }))];
}
function formFor(c, action) {
  const f = el("form", { class: "form" });
  const isTech = c.subject.type === "technology";
  const list = c.category === "source-conflict" ? "company-ids" : c.subject.type === "game" ? "game-ids" : c.subject.type === "technology" ? "tech-ids" : "company-ids";
  const suggestion = ((c.details.unmatched || []).find((u) => u.suggestions.length) || { suggestions: [{}] }).suggestions[0].id || "";
  if (action === "approve" && c.category === "new-company") f.append(field("Classification", select("category", CLASSIFICATIONS, "independent")));
  if (action === "approve" && c.category === "technology-claim" && isTech) f.append(field("Category", select("technologyCategory", TECH_CATEGORIES, c.details.role === "engines" ? "engine" : c.details.role === "languages" ? "language" : "tool")));
  if ((action === "approve" || action === "edit") && c.category === "technology-claim" && !isTech) { f.append(field("Confidence", select("confidence", CONFIDENCE, "high"))); f.append(...sourceFields()); }
  if (action === "merge") f.append(field("Merge into", el("input", { name: "target", list, required: "", placeholder: "canonical id", value: c.category === "potential-duplicate" ? c.subject.id : suggestion })));
  if (action === "edit" && c.category === "potential-duplicate") f.append(field("External IDs", el("textarea", { name: "externalIds" }, JSON.stringify({ wikidata: (c.details.candidates && c.details.candidates[0] && c.details.candidates[0].wikidata) || "" }, null, 2))));
  else if (action === "edit" && c.category === "classification-change") f.append(field("Classification", select("category", CLASSIFICATIONS, (c.details.classification || {}).category)));
  else if (action === "edit" && c.category !== "technology-claim") { f.append(field("Set (JSON)", el("textarea", { name: "set" }, c.category === "source-conflict" ? JSON.stringify({ [c.details.field || "field"]: [] }, null, 2) : "{\\n}"))); f.append(...sourceFields()); }
  f.append(field("Note", el("input", { name: "note", size: 60, placeholder: "optional" })));
  f.append(el("div", { class: "actions" }, el("button", { class: "primary", type: "submit" }, "Confirm " + action), el("button", { type: "button", onclick: () => f.remove() }, "Cancel")));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    const payload = {};
    try {
      for (const k of ["note", "target", "category", "technologyCategory", "confidence"]) if (data[k]) payload[k] = data[k];
      if (data.set) payload.set = JSON.parse(data.set);
      if (data.externalIds) payload.externalIds = JSON.parse(data.externalIds);
      if (data.sourceType && (data.sourceUrl || action !== "edit" || data.set)) payload.source = { type: data.sourceType, ...(data.sourceUrl ? { url: data.sourceUrl } : {}), retrievedAt: new Date().toISOString().slice(0, 10) };
    } catch (err) { return toast("Invalid JSON: " + err.message); }
    await decide(c, action, payload, f.querySelector("button.primary"));
  });
  return f;
}
async function decide(c, action, payload, button) {
  if (button) button.disabled = true;
  try {
    const r = await api("/api/decide", { candidate: c.id, action, payload });
    state.candidates = state.candidates.filter((x) => x.id !== c.id); state.decided++;
    toast(action + " recorded. Updated: " + r.changed.join(", ") + ". Rebuild to apply.");
    render();
  } catch (err) { toast("Error: " + err.message, 7000); if (button) button.disabled = false; }
}
async function openEntity(type, id) {
  $("#drawer-title").textContent = type + ": " + id; $("#drawer-body").textContent = "Loading…";
  $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false");
  try { $("#drawer-body").textContent = JSON.stringify(await api("/api/entity?type=" + type + "&id=" + encodeURIComponent(id)), null, 2); }
  catch (err) { $("#drawer-body").textContent = err.message; }
}
function card(c) {
  const actions = el("div", { class: "actions" });
  const node = el("article", { class: "card" },
    el("div", { class: "meta" }, el("span", { class: "badge " + c.category }, c.category.replace(/-/g, " ")), el("span", { class: "count" }, c.subject.type + ":" + c.subject.id)),
    el("h2", {}, c.title),
    c.summary && c.summary !== c.title ? el("p", { class: "summary" }, c.summary) : "",
    el("div", { class: "links" }, [c.subject, ...c.related].map((r) => el("a", { onclick: () => openEntity(r.type, r.id) }, "View " + r.type + " " + r.id))),
    el("details", {}, el("summary", {}, "Details"), el("pre", {}, JSON.stringify(c.details, null, 2))),
    actions);
  for (const a of c.actions) {
    const quick = a === "ignore" || (a === "approve" && (c.category === "new-game" || c.category === "relationship-change" || c.category === "classification-change"));
    actions.append(el("button", { class: a === "approve" ? "primary" : "", onclick: (e) => {
      if (quick) return decide(c, a, {}, e.target);
      node.querySelector("form")?.remove(); node.append(formFor(c, a));
    } }, a[0].toUpperCase() + a.slice(1)));
  }
  return node;
}
function render() {
  const q = $("#search").value.trim().toLowerCase();
  const visible = state.candidates.filter((c) => (!filter.size || filter.has(c.category)) && (!q || JSON.stringify(c).toLowerCase().includes(q)));
  $("#count").textContent = state.candidates.length + " open · " + state.decided + " decided";
  const chips = $("#chips"); chips.replaceChildren();
  for (const cat of CATEGORIES) {
    const n = state.candidates.filter((c) => c.category === cat).length;
    if (!n) continue;
    chips.append(el("button", { class: "chip", "aria-pressed": String(filter.has(cat)), onclick: () => { filter.has(cat) ? filter.delete(cat) : filter.add(cat); render(); } }, cat.replace(/-/g, " ") + " · " + n));
  }
  const list = $("#list"); list.replaceChildren();
  if (!visible.length) list.append(el("div", { class: "empty" }, state.candidates.length ? "No candidates match the filter." : "Nothing to review. Run npm run update or npm run report to refresh the queue."));
  for (const c of visible.slice(0, 200)) list.append(card(c));
  if (visible.length > 200) list.append(el("div", { class: "empty" }, (visible.length - 200) + " more; narrow the filter to see them."));
}
async function load() {
  state = await api("/api/state");
  const fill = (id, items, label) => { const d = $(id); d.replaceChildren(...items.map((x) => el("option", { value: x.id }, label(x)))); };
  fill("#company-ids", state.companies, (c) => c.name); fill("#game-ids", state.games, (g) => g.title); fill("#tech-ids", state.technologies, (t) => t.name);
  render();
}
$("#search").addEventListener("input", render);
$("#drawer-close").addEventListener("click", () => { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); });
$("#rebuild").addEventListener("click", async (e) => {
  e.target.disabled = true; toast("Rebuilding…", 60000);
  try { const r = await api("/api/rebuild", {}); toast("Rebuilt: " + r.written + " files changed, " + r.candidates + " open candidates."); await load(); }
  catch (err) { toast("Rebuild failed: " + err.message, 10000); }
  e.target.disabled = false;
});
load().catch((err) => toast("Failed to load: " + err.message, 10000));
</script>
</body>
</html>`;
}
