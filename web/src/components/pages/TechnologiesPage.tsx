import { useMemo, useState } from "react";

import { useAppData } from "../../lib/app-data";
import { groupBy, sortBy } from "../../lib/collections";
import { categoryLabel, formatInteger, labelize } from "../../lib/format";
import { normalizeText } from "../../lib/search";
import { useDocumentTitle } from "../../lib/router";
import type { Technology } from "../../lib/types";
import { Link, PageHead, SectionHead } from "../ui";

function gameCount(technology: Technology): number {
  return technology.statistics?.gameCount ?? technology.games?.length ?? 0;
}

export function TechnologiesPage() {
  useDocumentTitle("Technologies · Independent Game DB");

  const data = useAppData();
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const technology of data.technologies) {
      counts.set(technology.category, (counts.get(technology.category) ?? 0) + gameCount(technology));
    }
    return sortBy([...counts.entries()], ([, count]) => count, "desc");
  }, [data.technologies]);

  const filtered = useMemo(() => {
    const search = normalizeText(query);

    return data.technologies.filter((technology) => {
      if (category !== "all" && technology.category !== category) return false;
      if (!search) return true;
      const haystack = normalizeText([technology.name, ...(technology.aliases ?? [])].join(" "));
      return haystack.includes(search);
    });
  }, [category, data.technologies, query]);

  const grouped = useMemo(() => {
    const groups = groupBy(filtered, (technology) => technology.category);
    return sortBy([...groups.entries()], ([, items]) => items.reduce((total, item) => total + gameCount(item), 0), "desc");
  }, [filtered]);

  return (
    <div className="container-wide py-8 sm:py-10">
      <PageHead section="technologies" title="Technologies">
        Engines, frameworks, middleware, languages, and tools credited in the dataset. Each one links to the games
        that use it.
      </PageHead>

      <div className="mt-8 flex flex-col gap-4 rounded border border-line bg-bg-elevated/50 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`rounded border px-3 py-1.5 mono text-[0.64rem] transition ${
              category === "all"
                ? "border-accent bg-accent/10 text-accent"
                : "border-line text-muted hover:border-accent hover:text-accent"
            }`}
          >
            All ({data.technologies.length})
          </button>
          {categories.map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setCategory(name)}
              className={`rounded border px-3 py-1.5 mono text-[0.64rem] transition ${
                category === name
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {categoryLabel(name)} ({count})
            </button>
          ))}
        </div>

        <label className="max-w-md">
          <span className="mono mb-1 block text-[0.62rem] text-muted">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Engine, language, or tool"
            className="w-full rounded border border-line bg-bg-elevated px-3 py-2 text-sm text-text placeholder:text-muted/80 focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-3">
        <p className="m-0 text-sm text-muted">
          <span className="text-text">{formatInteger(filtered.length)}</span> technologies across {grouped.length}{" "}
          {grouped.length === 1 ? "category" : "categories"}
        </p>
      </div>

      <div className="mt-8 space-y-10">
        {grouped.map(([name, items]) => (
          <section key={name}>
            {category === "all" ? (
              <SectionHead
                title={categoryLabel(name)}
                action={
                  <span className="mono text-[0.64rem] text-muted">
                    {items.length} {items.length === 1 ? "entry" : "entries"}
                  </span>
                }
              />
            ) : null}
            <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${category === "all" ? "mt-5" : ""}`}>
              {sortBy(items, gameCount, "desc").map((technology) => {
                const topGames = sortBy(
                  (technology.games ?? [])
                    .map((id) => data.index.games.get(id))
                    .filter((game) => game !== undefined),
                  (game) => game.statistics?.steam?.reviewCount ?? null,
                  "desc",
                ).slice(0, 3);

                return (
                  <Link
                    key={technology.id}
                    to={`/technologies/${technology.id}`}
                    className="flex flex-col gap-2 rounded border border-line bg-bg-elevated/60 p-4 text-inherit no-underline transition hover:-translate-y-0.5 hover:border-accent-dim"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="m-0 text-lg">{technology.name}</h3>
                      <span className="mono shrink-0 text-[0.6rem] text-accent">{gameCount(technology)} games</span>
                    </div>
                    <p className="m-0 text-xs text-muted">
                      {[categoryLabel(technology.category), technology.subcategory ? labelize(technology.subcategory) : null, technology.license ? labelize(technology.license) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {topGames.length > 0 ? (
                      <p className="m-0 mt-auto truncate text-sm text-muted">
                        {topGames.map((game) => game.title).join(" · ")}
                      </p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 rounded border border-dashed border-line px-5 py-12 text-center">
          <p className="m-0 text-lg">No technologies match that search.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
            className="mono mt-3 text-xs text-accent hover:text-text"
          >
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
}
