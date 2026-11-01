import { useAppData } from "../lib/app-data";
import { formatInteger, formatPercent, formatDate, typeLabel } from "../lib/format";
import type { Game } from "../lib/types";
import { Link } from "./ui";

export type GameSortKey =
  | "title"
  | "released"
  | "reviews"
  | "rating"
  | "players"
  | "studio"
  | "publisher"
  | "type";

const HEADER_KEYS: GameSortKey[] = ["title", "released", "reviews", "rating"];

function SortMark({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  return (
    <span aria-hidden="true" className={`ml-1 text-[0.7em] ${active ? "text-accent" : "text-muted/60"}`}>
      {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );
}

export function GameTable({
  games,
  sort,
  onSort,
  showStudio = true,
  showEngines = true,
}: {
  games: Game[];
  sort?: { key: GameSortKey; direction: "asc" | "desc" };
  onSort?: (key: GameSortKey) => void;
  showStudio?: boolean;
  showEngines?: boolean;
}) {
  const data = useAppData();

  const studioNames = (game: Game) =>
    game.developers
      .map((id) => data.index.companies.get(id)?.name)
      .filter((name): name is string => Boolean(name))
      .join(", ");

  const header = (key: GameSortKey, label: string, align = "left") => {
    const sortable = Boolean(onSort) && HEADER_KEYS.includes(key);
    return (
      <th scope="col" className={`px-3 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
        {sortable ? (
          <button
            type="button"
            onClick={() => onSort?.(key)}
            className={`mono text-[0.66rem] ${
              sort?.key === key ? "text-text" : "text-muted hover:text-accent"
            }`}
          >
            {label}
            <SortMark active={sort?.key === key} direction={sort?.direction ?? "desc"} />
          </button>
        ) : (
          <span className="mono text-[0.66rem] text-muted">{label}</span>
        )}
      </th>
    );
  };

  return (
    <div>
      <div className="hidden overflow-x-auto rounded border border-line md:block">
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
          <thead className="bg-bg-elevated">
            <tr className="border-b border-line">
              {header("title", "Title")}
              {showStudio ? header("studio", "Studio") : null}
              {header("released", "Released", "right")}
              {header("reviews", "Reviews", "right")}
              {header("rating", "Positive", "right")}
              {showEngines ? (
                <th scope="col" className="px-3 py-2.5">
                  <span className="mono text-[0.66rem] text-muted">Built with</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {games.map((game) => {
              const steam = game.statistics?.steam;
              const engines = (game.technology.engines ?? [])
                .map((engine) => data.index.technologies.get(engine.id))
                .filter((engine) => engine !== undefined);
              const studios = studioNames(game);

              return (
                <tr key={game.id} className="border-b border-line/70 transition last:border-0 hover:bg-bg-elevated/70">
                  <td className="px-3 py-2.5">
                    <Link to={`/games/${game.id}`} className="text-text no-underline hover:text-accent">
                      {game.title}
                    </Link>
                    <span className="ml-2 mono text-[0.6rem] text-muted">{typeLabel(game.type)}</span>
                  </td>
                  {showStudio ? (
                    <td className="max-w-[16rem] truncate px-3 py-2.5 text-muted">{studios || "—"}</td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted">
                    {formatDate(game.releaseDate, game.releaseDatePrecision) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted">
                    {steam?.reviewCount ? formatInteger(steam.reviewCount) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted">
                    {steam?.positivePercentage !== null && steam?.positivePercentage !== undefined ? (
                      <span title={steam.reviewScoreDescription ?? undefined}>
                        {formatPercent(steam.positivePercentage)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {showEngines ? (
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {engines.slice(0, 2).map((engine) => (
                          <Link
                            key={engine.id}
                            to={`/technologies/${engine.id}`}
                            className="rounded border border-line px-1.5 py-0.5 text-[0.72rem] text-muted no-underline hover:border-accent hover:text-accent"
                          >
                            {engine.name}
                          </Link>
                        ))}
                        {engines.length > 2 ? <span className="text-xs text-muted">+{engines.length - 2}</span> : null}
                        {engines.length === 0 ? <span className="text-muted">—</span> : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {games.map((game) => {
          const steam = game.statistics?.steam;
          return (
            <Link
              key={game.id}
              to={`/games/${game.id}`}
              className="block rounded border border-line bg-bg-elevated/60 p-4 text-text no-underline transition hover:border-accent-dim"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-lg leading-tight">{game.title}</span>
                <span className="mono shrink-0 text-[0.62rem] text-muted">
                  {formatDate(game.releaseDate, game.releaseDatePrecision) ?? "—"}
                </span>
              </div>
              <p className="m-0 mt-1 text-sm text-muted">{studioNames(game) || typeLabel(game.type)}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {steam?.reviewCount ? <span>{formatInteger(steam.reviewCount)} reviews</span> : null}
                {steam?.positivePercentage !== null && steam?.positivePercentage !== undefined ? (
                  <span>{formatPercent(steam.positivePercentage)} positive</span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
