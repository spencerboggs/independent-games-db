import { useEffect, useMemo, useState } from "react";

import { useAppData } from "../../lib/app-data";
import { sortBy } from "../../lib/collections";
import { formatInteger, labelize, platformLabel, releaseYear, statusLabel, typeLabel } from "../../lib/format";
import { normalizeText } from "../../lib/search";
import { useDocumentTitle } from "../../lib/router";
import type { Game } from "../../lib/types";
import { GameTable, type GameSortKey } from "../GameTable";
import { PageHead } from "../ui";

interface GamesView {
  query: string;
  platform: string;
  genre: string;
  technology: string;
  status: string;
  type: string;
  sort: GameSortKey;
  direction: "asc" | "desc";
}

const DEFAULTS: GamesView = {
  query: "",
  platform: "all",
  genre: "all",
  technology: "all",
  status: "all",
  type: "all",
  sort: "reviews",
  direction: "desc",
};

let savedView: GamesView = DEFAULTS;

const SORTS: { key: GameSortKey; label: string }[] = [
  { key: "reviews", label: "Review count" },
  { key: "rating", label: "Positive percentage" },
  { key: "released", label: "Release date" },
  { key: "players", label: "Current players" },
  { key: "title", label: "Title" },
  { key: "studio", label: "Studio" },
  { key: "publisher", label: "Publisher" },
  { key: "type", label: "Type" },
];

function techIds(game: Game): string[] {
  const slots = game.technology;
  return [
    ...(slots.engines ?? []),
    ...(slots.middleware ?? []),
    ...(slots.languages ?? []),
    ...(slots.tools ?? []),
    ...(slots.techniques ?? []),
  ].map((item) => item.id);
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function optionsFrom(counts: Map<string, number>, label: (value: string) => string) {
  return sortBy([...counts.entries()], ([, count]) => count, "desc").map(([value, count]) => ({
    value,
    label: `${label(value)} (${count})`,
  }));
}

export function GamesPage() {
  useDocumentTitle("Games · Independent Game DB");
  const data = useAppData();
  const [view, setView] = useState<GamesView>(savedView);

  useEffect(() => {
    savedView = view;
  }, [view]);

  const platformOptions = useMemo(
    () => optionsFrom(countValues(data.games.flatMap((game) => game.platforms)), platformLabel),
    [data.games],
  );
  const genreOptions = useMemo(
    () => optionsFrom(countValues(data.games.flatMap((game) => game.genres)), labelize),
    [data.games],
  );
  const technologyOptions = useMemo(() => {
    const counts = countValues(data.games.flatMap(techIds));
    return sortBy([...counts.entries()], ([, count]) => count, "desc")
      .map(([id, count]) => ({ value: id, label: `${data.index.technologies.get(id)?.name ?? id} (${count})` }))
      .filter((option) => data.index.technologies.has(option.value));
  }, [data.games, data.index.technologies]);

  const statuses = useMemo(() => [...new Set(data.games.map((game) => game.releaseStatus))].sort(), [data.games]);
  const types = useMemo(() => [...new Set(data.games.map((game) => game.type))].sort(), [data.games]);

  const games = useMemo(() => {
    const query = normalizeText(view.query);

    const filtered = data.games.filter((game) => {
      if (view.platform !== "all" && !game.platforms.includes(view.platform)) return false;
      if (view.genre !== "all" && !game.genres.includes(view.genre)) return false;
      if (view.status !== "all" && game.releaseStatus !== view.status) return false;
      if (view.type !== "all" && game.type !== view.type) return false;
      if (view.technology !== "all" && !techIds(game).includes(view.technology)) return false;

      if (!query) return true;

      const studioNames = [...game.developers, ...game.publishers]
        .map((id) => data.index.companies.get(id)?.name ?? "")
        .join(" ");
      const haystack = normalizeText(
        [game.title, ...(game.alternateTitles ?? []), studioNames, ...game.genres].join(" "),
      );

      return haystack.includes(query);
    });

    const value = (game: Game): string | number | null => {
      switch (view.sort) {
        case "title":
          return game.title;
        case "released":
          return game.releaseDate;
        case "reviews":
          return game.statistics?.steam?.reviewCount ?? null;
        case "rating":
          return game.statistics?.steam?.positivePercentage ?? null;
        case "players":
          return game.statistics?.steam?.currentPlayers ?? null;
        case "studio":
          return game.developers[0] ? (data.index.companies.get(game.developers[0])?.name ?? null) : null;
        case "publisher":
          return game.publishers[0] ? (data.index.companies.get(game.publishers[0])?.name ?? null) : null;
        case "type":
          return game.type;
        default:
          return game.title;
      }
    };

    return sortBy(filtered, value, view.direction);
  }, [data.games, data.index.companies, view]);

  const filtered = Object.entries(view).some(([key, value]) => value !== DEFAULTS[key as keyof GamesView]);
  const years = games.filter((game) => releaseYear(game.releaseDate)).length;

  function update<K extends keyof GamesView>(key: K, value: GamesView[K]) {
    setView((current) => ({ ...current, [key]: value }));
  }

  function toggleSort(key: GameSortKey) {
    setView((current) =>
      current.sort === key
        ? { ...current, direction: current.direction === "asc" ? "desc" : "asc" }
        : { ...current, sort: key, direction: key === "title" ? "asc" : "desc" },
    );
  }

  const selectClass =
    "w-full rounded border border-line bg-bg-elevated px-2.5 py-2 text-sm text-text focus:border-accent focus:outline-none";

  return (
    <div className="container-wide py-8 sm:py-10">
      <PageHead section="games" title="Games">
        Every title in the database, with its studios, release date, Steam reception, and the engines it was built
        with.
      </PageHead>

      <div className="mt-8 rounded border border-line bg-bg-elevated/50 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sm:col-span-2">
            <span className="mono mb-1 block text-[0.62rem] text-muted">Search</span>
            <input
              type="search"
              value={view.query}
              onChange={(event) => update("query", event.target.value)}
              placeholder="Title, studio, or genre"
              className="w-full rounded border border-line bg-bg-elevated px-3 py-2 text-sm text-text placeholder:text-muted/80 focus:border-accent focus:outline-none"
            />
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Platform</span>
            <select value={view.platform} onChange={(event) => update("platform", event.target.value)} className={selectClass}>
              <option value="all">All platforms</option>
              {platformOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Engine or tool</span>
            <select
              value={view.technology}
              onChange={(event) => update("technology", event.target.value)}
              className={selectClass}
            >
              <option value="all">All technologies</option>
              {technologyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Genre</span>
            <select value={view.genre} onChange={(event) => update("genre", event.target.value)} className={selectClass}>
              <option value="all">All genres</option>
              {genreOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Status</span>
            <select value={view.status} onChange={(event) => update("status", event.target.value)} className={selectClass}>
              <option value="all">Any status</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Type</span>
            <select value={view.type} onChange={(event) => update("type", event.target.value)} className={selectClass}>
              <option value="all">Any type</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Sort by</span>
            <select
              value={view.sort}
              onChange={(event) => update("sort", event.target.value as GameSortKey)}
              className={selectClass}
            >
              {SORTS.map((sort) => (
                <option key={sort.key} value={sort.key}>
                  {sort.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => update("direction", view.direction === "asc" ? "desc" : "asc")}
              className="w-full rounded border border-line px-3 py-2 mono text-[0.66rem] text-text transition hover:border-accent hover:text-accent"
            >
              {view.direction === "asc" ? "Ascending ↑" : "Descending ↓"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="m-0 text-sm text-muted">
            <span className="text-text">{formatInteger(games.length)}</span> games
            {years < games.length ? ` · ${formatInteger(years)} with a release year` : ""}
          </p>
          {filtered ? (
            <button
              type="button"
              onClick={() => setView(DEFAULTS)}
              className="mono text-[0.66rem] text-accent hover:text-text"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {games.length > 0 ? (
          <GameTable games={games} sort={{ key: view.sort, direction: view.direction }} onSort={toggleSort} />
        ) : (
          <div className="rounded border border-dashed border-line px-5 py-12 text-center">
            <p className="m-0 text-lg">No games match those filters.</p>
            <button
              type="button"
              onClick={() => setView(DEFAULTS)}
              className="mono mt-3 text-xs text-accent hover:text-text"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
